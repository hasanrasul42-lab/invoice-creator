# Invoice Creator

Type in your services and their costs, hit **Create Invoice**, and a clean A4 PDF
downloads. No VAT, GBP.

Live: **https://invoice-creator-pi-pied.vercel.app**

## Run it locally

```
npm install
npm start
```

Then open http://localhost:3000

## What it does

- Your details, payment details and notes are remembered in the browser
  (tick "Remember these") so you only type them once.
- Invoice number auto-increments from the last one you used (INV-001 -> INV-002).
- Date defaults to today, due date to 14 days out.
- Add as many services as you like; each is a description + a cost.
- A cost can be the word `TBC` instead of a number. That line prints as "TBC" and
  adds nothing to the sum; any total containing one reads "£X + TBC", or just
  "TBC" when nothing is priced yet.
- Optional discount and "already paid / deposit" amounts, which produce a balance due.
- Long invoices flow onto extra pages with the table header repeated.

## Where the PDFs go

By default an invoice downloads like any other file. Click **Choose folder** at
the bottom of the form and pick e.g. `DocumentsinvoicesSent`, and invoices
are written straight into that folder instead - no download, no save dialog.

The folder is remembered between visits (the handle lives in IndexedDB). Chrome
asks once per session to confirm write access; other browsers fall back to a
download. Nothing is ever overwritten: a second `invoice-INV-001` is filed as
`invoice-INV-001 (2).pdf`.

This runs in the browser, not on the server - a hosted site cannot reach your
disk on its own, so the folder has to be granted by you through the picker.

## Deploying

The Vercel project is linked to this repo, so pushing to `main` deploys.

## Files

- `app.js` - the express app: serves the form and the `/api/invoice` PDF endpoint
- `server.js` - local entry point (`npm start`)
- `api/index.js` - Vercel serverless entry point, same app
- `invoice-pdf.js` - the PDF layout (PDFKit)
- `public/` - the form (index.html, styles.css, app.js)
- `vercel.json` - routes `/api/*` to the function, and force-includes PDFKit's
  font metrics files (it loads them via a constructed path that bundlers miss)
