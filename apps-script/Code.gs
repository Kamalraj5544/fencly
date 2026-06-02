/**
 * FENCLY — Form handler (Google Apps Script Web App)
 *
 * Receives JSON form submissions from the Fencly website and:
 *   1. Appends a row to a Google Sheet (one tab per form type)
 *   2. Emails the company a notification with all fields
 *   3. Emails the requester a branded thank-you
 *
 * Deploy:
 *   1. Open the target Google Sheet → Extensions → Apps Script
 *   2. Paste this file as `Code.gs`
 *   3. Update the CONFIG constants below
 *   4. Deploy → New deployment → Type: Web app
 *      - Execute as: Me
 *      - Who has access: Anyone
 *   5. Copy the Web App URL into FENCLY_FORM_ENDPOINT in js/main.js
 *
 * Re-deploy as a NEW version every time you change this file.
 */

const CONFIG = {
  COMPANY_EMAIL: 'hello@fencly.com.au',
  COMPANY_NAME:  'Fencly',
  REPLY_HOURS:   '4 business hours',
  TIMEZONE:      'Australia/Sydney',
  // Drive folder where uploaded photos are stored. Leave blank to auto-create
  // a folder named below at the Drive root on first run.
  ATTACHMENTS_FOLDER_ID: '',
  ATTACHMENTS_FOLDER_NAME: 'Fencly Quote Attachments',
  // Sheet tabs (created automatically on first submission)
  SHEETS: {
    quote:        'Quote Requests',
    'sample-kit': 'Sample Kit Requests',
    booking:      'Bookings'
  },
  // Header row per form type — order matters; this is the column layout
  HEADERS: {
    quote: ['Submitted', 'Name', 'Email', 'Mobile', 'Suburb', 'Postcode',
            'Project Type', 'Approx Length (m)', 'Remove Existing', 'Service',
            'Colour', 'Message', 'Photos', 'Page', 'IP'],
    'sample-kit': ['Submitted', 'Name', 'Email', 'Business', 'ABN', 'Mobile',
                   'Address', 'Postcode', 'Page', 'IP'],
    booking: ['Submitted', 'Slot Date', 'Slot Time', 'Name', 'Email', 'Mobile',
              'Suburb', 'Postcode', 'Project Notes', 'Calendar Event ID', 'Page']
  },
  // Site-visit booking
  AVAILABLE_SLOTS_SHEET: 'Available Slots',
  AVAILABLE_SLOTS_HEADERS: ['Date', 'Time', 'Status', 'Notes'],
  BOOKING_CALENDAR_ID: 'primary',   // or a specific calendar id
  BOOKING_DURATION_MIN: 60
};

/* ============================================================
   ENTRY POINT
   ============================================================ */

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ ok: false, error: 'empty-body' });
    }
    const payload = JSON.parse(e.postData.contents);
    const formType = payload.form;

    if (!CONFIG.SHEETS[formType]) {
      return jsonResponse({ ok: false, error: 'unknown-form-type' });
    }

    // Bookings have their own claim-the-slot flow.
    if (formType === 'booking') {
      return handleBooking(payload);
    }

    // 0. Save any photo attachments to Drive and replace the data URLs
    //    with shareable links before we touch the sheet or send mail.
    if (formType === 'quote' && Array.isArray(payload.photos) && payload.photos.length) {
      payload.photoLinks = saveAttachments(payload);
    } else {
      payload.photoLinks = [];
    }
    delete payload.photos; // never store the raw base64 in sheets/emails

    // 1. Sheet
    appendRow(formType, payload);

    // 2. Email company
    sendCompanyEmail(formType, payload);

    // 3. Email requester (only if we have an email address)
    if (payload.email) {
      sendThankYouEmail(formType, payload);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error(err);
    return jsonResponse({ ok: false, error: String(err) });
  }
}

// Doubles as health-check and as the slot-list endpoint for the booking UI.
//   GET ?action=slots  →  { ok:true, slots:[{date,time,notes}, ...] }
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  if (action === 'slots') {
    try {
      return jsonResponse({ ok: true, slots: listAvailableSlots() });
    } catch (err) {
      console.error(err);
      return jsonResponse({ ok: false, error: String(err) });
    }
  }
  return jsonResponse({ ok: true, service: 'fencly-form-handler' });
}

/* ============================================================
   SHEETS
   ============================================================ */

function appendRow(formType, p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tabName = CONFIG.SHEETS[formType];
  let sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
    sheet.appendRow(CONFIG.HEADERS[formType]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, CONFIG.HEADERS[formType].length)
         .setFontWeight('bold')
         .setBackground('#2C1810')
         .setFontColor('#F5F0E8');
  }

  const submitted = new Date();
  let row;
  if (formType === 'quote') {
    const photosCell = (p.photoLinks || []).map(l => l.url).join('\n');
    row = [submitted, p.name || '', p.email || '', p.phone || '',
           p.suburb || '', p.postcode || '', p.project || '',
           p.length || '', formatYesNo(p.removeExisting),
           formatService(p.service), p.colour || '', p.message || '',
           photosCell, p.page || '', '—'];
  } else if (formType === 'booking') {
    row = [submitted, p.slotDate || '', p.slotTime || '', p.name || '',
           p.email || '', p.phone || '', p.suburb || '', p.postcode || '',
           p.message || '', p.calendarEventId || '', p.page || ''];
  } else {
    row = [submitted, p.name || '', p.email || '', p.business || '',
           p.abn || '', p.phone || '', p.address || '', p.postcode || '',
           p.page || '', '—'];
  }
  sheet.appendRow(row);
}

/* ============================================================
   BOOKINGS — slot listing + claim-and-confirm
   ============================================================ */

// Slot statuses
const SLOT_OPEN    = 'open';
const SLOT_BOOKED  = 'booked';
const SLOT_BLOCKED = 'blocked';

// Read the "Available Slots" tab and return every open, future slot.
// Times are returned as 'HH:mm' strings in CONFIG.TIMEZONE.
function listAvailableSlots() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.AVAILABLE_SLOTS_SHEET);
  if (!sheet) return [];
  const last = sheet.getLastRow();
  if (last < 2) return [];

  const values = sheet.getRange(2, 1, last - 1, 4).getValues();
  const now = new Date();
  const out = [];
  values.forEach(([date, time, status, notes]) => {
    const dateStr = normalizeDate(date);
    const timeStr = normalizeTime(time);
    if (!dateStr || !timeStr) return;
    if (String(status || '').toLowerCase() !== SLOT_OPEN) return;
    if (slotDateTime(dateStr, timeStr) <= now) return;
    out.push({ date: dateStr, time: timeStr, notes: String(notes || '') });
  });
  // Sort chronologically
  out.sort((a, b) => slotDateTime(a.date, a.time) - slotDateTime(b.date, b.time));
  return out;
}

// Find the row index (1-based, including header) of a slot matching date+time.
// Returns -1 if no match.
function findSlotRow(sheet, dateStr, timeStr) {
  const last = sheet.getLastRow();
  if (last < 2) return -1;
  const values = sheet.getRange(2, 1, last - 1, 4).getValues();
  for (let i = 0; i < values.length; i++) {
    if (normalizeDate(values[i][0]) === dateStr && normalizeTime(values[i][1]) === timeStr) {
      return i + 2;
    }
  }
  return -1;
}

function handleBooking(payload) {
  const required = ['slotDate', 'slotTime', 'name', 'email', 'phone'];
  for (const k of required) {
    if (!payload[k] || !String(payload[k]).trim()) {
      return jsonResponse({ ok: false, error: 'missing-' + k });
    }
  }

  const slotDate = String(payload.slotDate).trim();
  const slotTime = String(payload.slotTime).trim();

  // Reject obviously past slots up front (cheap check; the lock-guarded
  // status check below is the real source of truth).
  if (slotDateTime(slotDate, slotTime) <= new Date()) {
    return jsonResponse({ ok: false, error: 'slot-in-past' });
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
  } catch (err) {
    return jsonResponse({ ok: false, error: 'busy-try-again' });
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const slotsSheet = ss.getSheetByName(CONFIG.AVAILABLE_SLOTS_SHEET);
    if (!slotsSheet) return jsonResponse({ ok: false, error: 'slots-not-configured' });

    const rowIdx = findSlotRow(slotsSheet, slotDate, slotTime);
    if (rowIdx === -1) return jsonResponse({ ok: false, error: 'slot-unavailable' });
    const currentStatus = String(slotsSheet.getRange(rowIdx, 3).getValue() || '').toLowerCase();
    if (currentStatus !== SLOT_OPEN) {
      return jsonResponse({ ok: false, error: 'slot-unavailable' });
    }

    // Claim the slot first — fail-closed: if the calendar/email step
    // throws below, the slot stays marked booked rather than risk a
    // double-book. The owner can manually re-open it from the Sheet.
    slotsSheet.getRange(rowIdx, 3).setValue(SLOT_BOOKED);
    SpreadsheetApp.flush();

    // Create the calendar event with both guests invited.
    let eventId = '';
    try {
      const start = slotDateTime(slotDate, slotTime);
      const end = new Date(start.getTime() + CONFIG.BOOKING_DURATION_MIN * 60 * 1000);
      const cal = CalendarApp.getCalendarById(CONFIG.BOOKING_CALENDAR_ID)
               || CalendarApp.getDefaultCalendar();
      const event = cal.createEvent(
        `Fencly site visit — ${payload.name}`,
        start,
        end,
        {
          description: bookingEventDescription(payload),
          guests: [CONFIG.COMPANY_EMAIL, payload.email].filter(Boolean).join(','),
          sendInvites: true,
          location: [payload.suburb, payload.postcode].filter(Boolean).join(' ')
        }
      );
      eventId = event.getId();
    } catch (err) {
      console.error('calendar-failed', err);
      // Non-fatal: slot is booked, emails will still go out.
    }

    payload.calendarEventId = eventId;
    appendRow('booking', payload);
    sendCompanyEmail('booking', payload);
    if (payload.email) sendThankYouEmail('booking', payload);

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error(err);
    return jsonResponse({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function bookingEventDescription(p) {
  return [
    `Name: ${p.name || ''}`,
    `Email: ${p.email || ''}`,
    `Mobile: ${p.phone || ''}`,
    `Suburb: ${p.suburb || ''}`,
    `Postcode: ${p.postcode || ''}`,
    p.message ? `Notes: ${p.message}` : ''
  ].filter(Boolean).join('\n');
}

// "2026-06-03" + "09:00" → Date in CONFIG.TIMEZONE
function slotDateTime(dateStr, timeStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const [hh, mm] = String(timeStr).split(':').map(Number);
  // Use the script's timezone (set via CONFIG.TIMEZONE on the project)
  // by constructing in UTC then offsetting — but Apps Script's project
  // timezone already governs `new Date(y,m,d,hh,mm)`, so trust that.
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
}

function normalizeDate(v) {
  if (!v) return '';
  if (v instanceof Date) {
    return Utilities.formatDate(v, CONFIG.TIMEZONE, 'yyyy-MM-dd');
  }
  const s = String(v).trim();
  // Accept already-formatted YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Try to parse anything else into a Date
  const d = new Date(s);
  if (!isNaN(d)) return Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy-MM-dd');
  return '';
}

function normalizeTime(v) {
  if (!v) return '';
  if (v instanceof Date) {
    return Utilities.formatDate(v, CONFIG.TIMEZONE, 'HH:mm');
  }
  const s = String(v).trim();
  // 09:00 / 9:00 / 09:00:00
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) {
    const hh = String(Math.min(23, parseInt(m[1], 10))).padStart(2, '0');
    return `${hh}:${m[2]}`;
  }
  return '';
}

/* ============================================================
   ATTACHMENTS (Drive)
   ============================================================ */

function getAttachmentsFolder() {
  if (CONFIG.ATTACHMENTS_FOLDER_ID) {
    return DriveApp.getFolderById(CONFIG.ATTACHMENTS_FOLDER_ID);
  }
  const it = DriveApp.getFoldersByName(CONFIG.ATTACHMENTS_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(CONFIG.ATTACHMENTS_FOLDER_NAME);
}

function saveAttachments(p) {
  const links = [];
  const folder = getAttachmentsFolder();
  const stamp = Utilities.formatDate(new Date(), 'Australia/Sydney', 'yyyyMMdd-HHmmss');
  const safeName = String(p.name || 'lead').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  p.photos.forEach((photo, i) => {
    try {
      const m = String(photo.dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
      if (!m) return;
      const contentType = m[1];
      const bytes = Utilities.base64Decode(m[2]);
      const ext = (contentType.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      const filename = `${stamp}-${safeName}-${i + 1}.${ext}`;
      const blob = Utilities.newBlob(bytes, contentType, filename);
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      links.push({ name: photo.name || filename, url: file.getUrl() });
    } catch (err) {
      console.error('attachment-failed', err);
    }
  });
  return links;
}

/* ============================================================
   COMPANY NOTIFICATION EMAIL
   ============================================================ */

function sendCompanyEmail(formType, p) {
  let subject;
  if (formType === 'quote') {
    subject = `New Quote Request: ${p.name || 'Anonymous'} (${p.postcode || '—'})`;
  } else if (formType === 'booking') {
    subject = `New Site Visit Booking: ${p.name || 'Anonymous'} — ${p.slotDate} ${p.slotTime}`;
  } else {
    subject = `New Sample Set Request: ${p.name || 'Anonymous'} (${p.postcode || '—'})`;
  }

  const photoLinksHtml = (p.photoLinks || [])
    .map(l => `<a href="${escapeHtml(l.url)}" style="color:#2C1810">${escapeHtml(l.name)}</a>`)
    .join('<br>');

  let rows;
  if (formType === 'quote') {
    rows = [
      ['Name',        p.name],
      ['Email',       p.email],
      ['Mobile',      p.phone],
      ['Suburb',      p.suburb],
      ['Postcode',    p.postcode],
      ['Project',     p.project],
      ['Approx length (m)', p.length],
      ['Remove existing fence', formatYesNo(p.removeExisting)],
      ['Service',     formatService(p.service)],
      ['Colour',      p.colour],
      ['Message',     p.message],
      ['Photos',      photoLinksHtml, true]
    ];
  } else if (formType === 'booking') {
    rows = [
      ['Slot',     `${p.slotDate} at ${p.slotTime}`],
      ['Name',     p.name],
      ['Email',    p.email],
      ['Mobile',   p.phone],
      ['Suburb',   p.suburb],
      ['Postcode', p.postcode],
      ['Notes',    p.message],
      ['Calendar event', p.calendarEventId ? 'created' : 'not created (check logs)']
    ];
  } else {
    rows = [
      ['Name',     p.name],
      ['Email',    p.email],
      ['Business', p.business],
      ['ABN',      p.abn],
      ['Mobile',   p.phone],
      ['Address',  p.address],
      ['Postcode', p.postcode]
    ];
  }

  const tableRows = rows
    .filter(([, v]) => v && String(v).trim())
    .map(([k, v, raw]) => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #eee;font-weight:600;color:#2C1810;width:140px;vertical-align:top">${escapeHtml(k)}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #eee;color:#3a3a3a;white-space:pre-wrap">${raw ? v : escapeHtml(v)}</td>
      </tr>`)
    .join('');

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#2C1810">
    <div style="background:#2C1810;color:#F5F0E8;padding:18px 24px;border-radius:8px 8px 0 0">
      <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.7">${escapeHtml(CONFIG.COMPANY_NAME)} · New Lead</div>
      <div style="font-size:18px;margin-top:4px;font-weight:600">${escapeHtml(subject)}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px">
      ${tableRows}
    </table>
    <div style="font-size:12px;color:#888;margin-top:12px">Submitted ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })} (Sydney) · Page: ${escapeHtml(p.page || '—')}</div>
  </div>`;

  MailApp.sendEmail({
    to: CONFIG.COMPANY_EMAIL,
    replyTo: p.email || CONFIG.COMPANY_EMAIL,
    subject: subject,
    htmlBody: html,
    name: CONFIG.COMPANY_NAME + ' Website'
  });
}

/* ============================================================
   REQUESTER THANK-YOU EMAIL
   ============================================================ */

function sendThankYouEmail(formType, p) {
  let subject, intro, summary;
  if (formType === 'quote') {
    subject = `Thanks ${firstName(p.name)}, your Fencly quote is in the queue`;
    intro = `Thanks for getting in touch. Your free measure and quote request is in front of our Sydney team. We usually reply within ${CONFIG.REPLY_HOURS}.`;
    summary = [
      ['Postcode', p.postcode],
      ['Project',  p.project],
      ['Approx length (m)', p.length],
      ['Remove existing', formatYesNo(p.removeExisting)],
      ['Service',  formatService(p.service)],
      ['Colour',   p.colour],
      ['Photos',   (p.photoLinks || []).length ? `${p.photoLinks.length} attached` : '']
    ];
  } else if (formType === 'booking') {
    subject = `Your Fencly site visit is booked — ${p.slotDate} at ${p.slotTime}`;
    intro = `Your site visit is locked in. We've sent a calendar invite to ${p.email} so you can add it to your diary. If anything changes, just reply to this email.`;
    summary = [
      ['Date',     p.slotDate],
      ['Time',     p.slotTime],
      ['Suburb',   p.suburb],
      ['Postcode', p.postcode],
      ['Notes',    p.message]
    ];
  } else {
    subject = `Thanks ${firstName(p.name)}, your Fencly sample set is on the way`;
    intro = `Thanks for requesting a sample set. We're packing real co-extruded WPC boards and posting them to you within 2–4 business days.`;
    summary = [
      ['Business', p.business],
      ['ABN',      p.abn],
      ['Address',  p.address],
      ['Postcode', p.postcode]
    ];
  }

  const summaryHtml = summary
    .filter(([, v]) => v && String(v).trim())
    .map(([k, v]) => `<tr><td style="padding:6px 0;color:#7a6f64;width:120px">${escapeHtml(k)}</td><td style="padding:6px 0;color:#2C1810;font-weight:500">${escapeHtml(v)}</td></tr>`)
    .join('');

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;background:#F5F0E8;padding:32px 24px;color:#2C1810">
    <div style="text-align:center;margin-bottom:24px">
      <div style="font-family:Georgia,serif;font-style:italic;font-size:32px;color:#2C1810">${escapeHtml(CONFIG.COMPANY_NAME)}</div>
      <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#7a6f64;margin-top:2px">WPC Composite Fencing · Sydney</div>
    </div>

    <div style="background:#fff;border-radius:12px;padding:28px 24px;border:1px solid #e8dfd1">
      <p style="margin:0 0 14px;font-size:18px;font-weight:600">Hi ${escapeHtml(firstName(p.name))},</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#3a3a3a">${escapeHtml(intro)}</p>

      ${summaryHtml ? `
      <div style="background:#F5F0E8;border-radius:8px;padding:14px 16px;margin:18px 0">
        <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#7a6f64;margin-bottom:6px">Your details</div>
        <table style="width:100%;border-collapse:collapse;font-size:14px">${summaryHtml}</table>
      </div>` : ''}

      <p style="margin:18px 0 0;font-size:14px;line-height:1.6;color:#3a3a3a">
        Need anything in the meantime? Just reply to this email and you'll reach our team directly.
      </p>

      <div style="margin-top:22px;padding-top:18px;border-top:1px solid #eee;font-size:13px;color:#7a6f64">
        Warm regards,<br>
        <strong style="color:#2C1810">The ${escapeHtml(CONFIG.COMPANY_NAME)} Team</strong><br>
        Sydney, Australia
      </div>
    </div>

    <div style="text-align:center;margin-top:18px;font-size:11px;color:#9a8e7f">
      You're receiving this because you submitted a request on fencly.com.au.
    </div>
  </div>`;

  MailApp.sendEmail({
    to: p.email,
    replyTo: CONFIG.COMPANY_EMAIL,
    subject: subject,
    htmlBody: html,
    name: CONFIG.COMPANY_NAME
  });
}

/* ============================================================
   ONE-TIME MIGRATIONS
   ============================================================ */

/**
 * Adds the "Colour" column to an existing "Quote Requests" sheet,
 * inserted between "Approx Length" and "Message". Safe to run twice —
 * does nothing if the column is already present.
 *
 * Run once from the Apps Script editor: select `migrateAddColourColumn`
 * from the function dropdown, then click Run.
 */
function migrateAddColourColumn() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.quote);
  if (!sheet) {
    console.log('No "' + CONFIG.SHEETS.quote + '" sheet found — nothing to migrate.');
    return;
  }

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  if (headers.indexOf('Colour') !== -1) {
    console.log('"Colour" column already exists — no migration needed.');
    return;
  }

  const messageIdx = headers.indexOf('Message'); // 0-based
  if (messageIdx === -1) {
    throw new Error('Could not find "Message" column to anchor the insert.');
  }

  const insertAt = messageIdx + 1; // 1-based column to insert BEFORE
  sheet.insertColumnBefore(insertAt);
  const headerCell = sheet.getRange(1, insertAt);
  headerCell.setValue('Colour')
            .setFontWeight('bold')
            .setBackground('#2C1810')
            .setFontColor('#F5F0E8');

  console.log('Inserted "Colour" column at position ' + insertAt + '.');
}

/**
 * Adds the new quote-form columns introduced with the June 2026 pre-order
 * form: "Remove Existing", "Service" and "Photos". Also renames
 * "Approx Length" → "Approx Length (m)" since the field is now numeric.
 *
 * Safe to run multiple times — each step is a no-op if already applied.
 * Run from the Apps Script editor: select `migrateAddPreorderColumns`
 * from the function dropdown, then click Run.
 */
function migrateAddPreorderColumns() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.quote);
  if (!sheet) {
    console.log('No "' + CONFIG.SHEETS.quote + '" sheet found — nothing to migrate.');
    return;
  }

  const headerStyle = (range) => range
    .setFontWeight('bold')
    .setBackground('#2C1810')
    .setFontColor('#F5F0E8');

  const readHeaders = () => sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  // 1. Rename "Approx Length" → "Approx Length (m)"
  let headers = readHeaders();
  const lenIdx = headers.indexOf('Approx Length');
  if (lenIdx !== -1) {
    sheet.getRange(1, lenIdx + 1).setValue('Approx Length (m)');
    console.log('Renamed "Approx Length" → "Approx Length (m)".');
  }

  // 2. Insert "Remove Existing" + "Service" before "Colour"
  headers = readHeaders();
  const colourIdx = headers.indexOf('Colour');
  if (colourIdx === -1) {
    throw new Error('Could not find "Colour" column to anchor the insert.');
  }
  if (headers.indexOf('Remove Existing') === -1) {
    const at = colourIdx + 1; // 1-based, insert BEFORE Colour
    sheet.insertColumnBefore(at);
    headerStyle(sheet.getRange(1, at).setValue('Remove Existing'));
    console.log('Inserted "Remove Existing" at column ' + at + '.');
  }
  headers = readHeaders();
  const colourIdx2 = headers.indexOf('Colour');
  if (headers.indexOf('Service') === -1) {
    const at = colourIdx2 + 1;
    sheet.insertColumnBefore(at);
    headerStyle(sheet.getRange(1, at).setValue('Service'));
    console.log('Inserted "Service" at column ' + at + '.');
  }

  // 3. Insert "Photos" before "Page"
  headers = readHeaders();
  if (headers.indexOf('Photos') === -1) {
    const pageIdx = headers.indexOf('Page');
    if (pageIdx === -1) {
      // Append at the end if "Page" is missing for any reason
      const at = sheet.getLastColumn() + 1;
      headerStyle(sheet.getRange(1, at).setValue('Photos'));
      console.log('Appended "Photos" at column ' + at + '.');
    } else {
      const at = pageIdx + 1;
      sheet.insertColumnBefore(at);
      headerStyle(sheet.getRange(1, at).setValue('Photos'));
      console.log('Inserted "Photos" at column ' + at + '.');
    }
  }
}

/**
 * Creates the "Available Slots" and "Bookings" tabs used by the site-visit
 * booking module. Safe to run multiple times — each step is a no-op if the
 * tab/headers already exist.
 *
 * Run once from the Apps Script editor: select `migrateAddBookingSheets`
 * from the function dropdown, then click Run.
 */
function migrateAddBookingSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const headerStyle = (range) => range
    .setFontWeight('bold')
    .setBackground('#2C1810')
    .setFontColor('#F5F0E8');

  // 1. Available Slots (owner-managed)
  let slots = ss.getSheetByName(CONFIG.AVAILABLE_SLOTS_SHEET);
  if (!slots) {
    slots = ss.insertSheet(CONFIG.AVAILABLE_SLOTS_SHEET);
    slots.appendRow(CONFIG.AVAILABLE_SLOTS_HEADERS);
    slots.setFrozenRows(1);
    headerStyle(slots.getRange(1, 1, 1, CONFIG.AVAILABLE_SLOTS_HEADERS.length));
    slots.setColumnWidth(1, 110);
    slots.setColumnWidth(2, 90);
    slots.setColumnWidth(3, 110);
    slots.setColumnWidth(4, 280);

    // Status dropdown on column C (rows 2..1000)
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList([SLOT_OPEN, SLOT_BOOKED, SLOT_BLOCKED], true)
      .setAllowInvalid(false)
      .build();
    slots.getRange(2, 3, 999, 1).setDataValidation(rule);

    // Seed one example row, two weeks out, so the format is obvious.
    const example = new Date();
    example.setDate(example.getDate() + 14);
    const exampleDate = Utilities.formatDate(example, CONFIG.TIMEZONE, 'yyyy-MM-dd');
    slots.appendRow([exampleDate, '09:00', SLOT_OPEN, 'Example — edit or delete']);

    console.log('Created "' + CONFIG.AVAILABLE_SLOTS_SHEET + '" tab.');
  } else {
    console.log('"' + CONFIG.AVAILABLE_SLOTS_SHEET + '" already exists — skipped.');
  }

  // 2. Bookings (system-written)
  let bookings = ss.getSheetByName(CONFIG.SHEETS.booking);
  if (!bookings) {
    bookings = ss.insertSheet(CONFIG.SHEETS.booking);
    bookings.appendRow(CONFIG.HEADERS.booking);
    bookings.setFrozenRows(1);
    headerStyle(bookings.getRange(1, 1, 1, CONFIG.HEADERS.booking.length));
    console.log('Created "' + CONFIG.SHEETS.booking + '" tab.');
  } else {
    console.log('"' + CONFIG.SHEETS.booking + '" already exists — skipped.');
  }
}

/* ============================================================
   HELPERS
   ============================================================ */

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function firstName(full) {
  if (!full) return 'there';
  return String(full).trim().split(/\s+/)[0];
}

function formatYesNo(v) {
  const s = String(v || '').toLowerCase();
  if (s === 'yes' || s === 'true' || s === '1') return 'Yes';
  if (s === 'no'  || s === 'false' || s === '0' || s === '') return 'No';
  return String(v);
}

function formatService(v) {
  const s = String(v || '').toLowerCase();
  if (s === 'supply-install' || s === 'supply_and_install') return 'Supply and install';
  if (s === 'supply-only' || s === '') return 'Supply only';
  return String(v);
}

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
