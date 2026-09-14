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
