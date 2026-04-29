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
  // Sheet tabs (created automatically on first submission)
  SHEETS: {
    quote:        'Quote Requests',
    'sample-kit': 'Sample Kit Requests'
  },
  // Header row per form type — order matters; this is the column layout
  HEADERS: {
    quote: ['Submitted', 'Name', 'Email', 'Mobile', 'Suburb', 'Postcode',
            'Project Type', 'Approx Length', 'Message', 'Page', 'IP'],
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
    row = [submitted, p.name || '', p.email || '', p.phone || '',
           p.suburb || '', p.postcode || '', p.project || '',
           p.length || '', p.message || '', p.page || '', '—'];
  } else {
    row = [submitted, p.name || '', p.email || '', p.business || '',
           p.abn || '', p.phone || '', p.address || '', p.postcode || '',
           p.page || '', '—'];
  }
  sheet.appendRow(row);
}

/* ============================================================
   COMPANY NOTIFICATION EMAIL
   ============================================================ */

function sendCompanyEmail(formType, p) {
  const subject = formType === 'quote'
    ? `New Quote Request: ${p.name || 'Anonymous'} (${p.postcode || '—'})`
    : `New Sample Set Request: ${p.name || 'Anonymous'} (${p.postcode || '—'})`;

  const rows = formType === 'quote' ? [
    ['Name',        p.name],
    ['Email',       p.email],
    ['Mobile',      p.phone],
    ['Suburb',      p.suburb],
    ['Postcode',    p.postcode],
    ['Project',     p.project],
    ['Approx length', p.length],
    ['Message',     p.message]
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
    .map(([k, v]) => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #eee;font-weight:600;color:#2C1810;width:140px;vertical-align:top">${escapeHtml(k)}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #eee;color:#3a3a3a;white-space:pre-wrap">${escapeHtml(v)}</td>
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
    ['Approx length', p.length]
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

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
