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
  // Drive folder where uploaded photos are stored. Leave blank to auto-create
  // a folder named below at the Drive root on first run.
  ATTACHMENTS_FOLDER_ID: '',
  ATTACHMENTS_FOLDER_NAME: 'Fencly Quote Attachments',
  // Sheet tabs (created automatically on first submission)
  SHEETS: {
    quote:        'Quote Requests',
    'sample-kit': 'Sample Kit Requests'
  },
  // Header row per form type — order matters; this is the column layout
  HEADERS: {
    quote: ['Submitted', 'Name', 'Email', 'Mobile', 'Suburb', 'Postcode',
            'Project Type', 'Approx Length (m)', 'Remove Existing', 'Service',
            'Colour', 'Message', 'Photos', 'Page', 'IP'],
    'sample-kit': ['Submitted', 'Name', 'Email', 'Business', 'ABN', 'Mobile',
                   'Address', 'Postcode', 'Page', 'IP']
  }
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

// Useful for sanity-checking the deployment in a browser
function doGet() {
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
  } else {
    row = [submitted, p.name || '', p.email || '', p.business || '',
           p.abn || '', p.phone || '', p.address || '', p.postcode || '',
           p.page || '', '—'];
  }
  sheet.appendRow(row);
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
  const subject = formType === 'quote'
    ? `New Quote Request: ${p.name || 'Anonymous'} (${p.postcode || '—'})`
    : `New Sample Set Request: ${p.name || 'Anonymous'} (${p.postcode || '—'})`;

  const photoLinksHtml = (p.photoLinks || [])
    .map(l => `<a href="${escapeHtml(l.url)}" style="color:#2C1810">${escapeHtml(l.name)}</a>`)
    .join('<br>');

  const rows = formType === 'quote' ? [
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
  ] : [
    ['Name',     p.name],
    ['Email',    p.email],
    ['Business', p.business],
    ['ABN',      p.abn],
    ['Mobile',   p.phone],
    ['Address',  p.address],
    ['Postcode', p.postcode]
  ];

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
  const subject = formType === 'quote'
    ? `Thanks ${firstName(p.name)}, your Fencly quote is in the queue`
    : `Thanks ${firstName(p.name)}, your Fencly sample set is on the way`;

  const intro = formType === 'quote'
    ? `Thanks for getting in touch. Your free measure and quote request is in front of our Sydney team. We usually reply within ${CONFIG.REPLY_HOURS}.`
    : `Thanks for requesting a sample set. We're packing real co-extruded WPC boards and posting them to you within 2–4 business days.`;

  const summary = formType === 'quote' ? [
    ['Postcode', p.postcode],
    ['Project',  p.project],
    ['Approx length (m)', p.length],
    ['Remove existing', formatYesNo(p.removeExisting)],
    ['Service',  formatService(p.service)],
    ['Colour',   p.colour],
    ['Photos',   (p.photoLinks || []).length ? `${p.photoLinks.length} attached` : '']
  ] : [
    ['Business', p.business],
    ['ABN',      p.abn],
    ['Address',  p.address],
    ['Postcode', p.postcode]
  ];

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
