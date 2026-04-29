# Fencly Form Handler — Setup Guide

This Google Apps Script catches every form submission from fencly.com.au and:

1. **Appends a row** to a Google Sheet (one tab per form type)
2. **Emails the company** (`hello@fencly.com.au`) with a formatted notification
3. **Emails the requester** a branded thank-you (only when an email address is provided)

No backend, no servers, no monthly fees. Apps Script runs free under a Google account.

---

## One-time setup (≈5 minutes)

### 1. Create the Sheet

1. Go to [sheets.new](https://sheets.new) — a fresh blank sheet opens.
2. Rename it to `Fencly Leads` (or anything you like).
3. Leave it open.

### 2. Paste the script

1. From the sheet menu: **Extensions → Apps Script**
2. Delete the boilerplate `function myFunction() { ... }`
3. Open [`Code.gs`](Code.gs) from this repo, copy the whole file, paste into the Apps Script editor.
4. Click the **save** icon (💾) and rename the project to `Fencly Forms`.

### 3. Configure constants

At the top of the script, edit:

```js
const CONFIG = {
  COMPANY_EMAIL: 'hello@fencly.com.au',   // ← where company notifications go
  COMPANY_NAME:  'Fencly',
  REPLY_HOURS:   '4 business hours',
  ...
};
```

### 4. Authorise the script

1. In the Apps Script editor, select the `doGet` function from the dropdown next to the ▶ Run button.
2. Click ▶ Run.
3. A consent dialog appears — click **Review permissions** → choose your Google account → **Advanced** → **Go to Fencly Forms (unsafe)** → **Allow**.

This grants the script permission to read/write your Sheet and send emails on your behalf. You only do this once.

### 5. Deploy as a Web App

1. Click **Deploy → New deployment**.
2. Click the gear ⚙ icon → select **Web app**.
3. Configure:
   - **Description**: `Fencly form handler v1`
   - **Execute as**: `Me`
   - **Who has access**: `Anyone`  ← important; this allows the website to POST without auth
4. Click **Deploy**.
5. Copy the **Web app URL** — it looks like:
   ```
   https://script.google.com/macros/s/AKfycbx.../exec
   ```

### 6. Wire up the website

Open [`/js/main.js`](../js/main.js), find the constant near the top, paste the URL:

```js
const FENCLY_FORM_ENDPOINT = 'https://script.google.com/macros/s/AKfycbx.../exec';
```

Save, deploy the static site as usual. Done.

---

## Verify it works

1. Open the live site, fill in the **Sample Kit** form, submit.
2. Within 5 seconds:
   - The button should show ✓ Sent
   - A new row appears in the `Sample Kit Requests` tab of the Sheet
   - Your inbox at `hello@fencly.com.au` receives a notification
   - The address you typed receives a Fencly-branded thank-you
3. Repeat with the **Quote** form.

If something fails, check **Apps Script editor → Executions** (left sidebar) for errors.

---

## When you change the script

Apps Script Web App URLs are pinned to a deployment version. If you edit `Code.gs` after the first deployment, the changes won't take effect until you re-deploy:

1. **Deploy → Manage deployments**
2. Click the pencil ✏ on the active deployment
3. Set **Version** to `New version`, click **Deploy**
4. The URL stays the same — no need to update the website.

---

## Limits to be aware of

| Resource | Daily quota (free Google account) |
|---|---|
| Emails sent (`MailApp`) | 100/day |
| URL fetches | 20,000/day |
| Script runtime per execution | 6 minutes |

100 emails/day = 50 form submissions/day (each fires 2 emails). If Fencly grows beyond that, switch to a Google Workspace account (1,500 emails/day) — same script, no code changes.

---

## Sheet structure

The script creates these tabs automatically on first use. **Don't rename them** — the script looks them up by name.

### `Quote Requests`
| Submitted | Name | Email | Mobile | Suburb | Postcode | Project Type | Approx Length | Message | Page | IP |

### `Sample Kit Requests`
| Submitted | Name | Email | Mobile | Address | Postcode | Page | IP |

The `IP` column is reserved (Apps Script can't reliably read the requester IP) — leave it as-is or repurpose it.

---

## Troubleshooting

**"Authorisation required" error in browser console**
The deployment is set to "Only myself" or "Only Google Workspace". Re-deploy with **Who has access: Anyone**.

**No row appears in the Sheet, no errors in console**
Open the Sheet that's bound to the Apps Script (Extensions → Apps Script opens the bound script). If you have multiple sheets, the script writes to the one it's bound to.

**Thank-you email not arriving**
- Check the spam folder.
- The submitter's email field must validate (`type="email"` required by the form).
- Check Apps Script **Executions** for errors — most often `Service invoked too many times` (daily quota).

**CORS error in browser console**
The site sends `Content-Type: text/plain` specifically to avoid a CORS preflight. If you see CORS errors anyway, the deployment was set to "Only myself". Re-deploy as **Anyone**.
