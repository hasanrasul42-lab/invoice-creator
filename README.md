# Invoice Creator

A small local web app: type in your services and their costs, hit **Create Invoice**,
and a clean A4 PDF downloads. No VAT, GBP.

## Run it

```
npm install
npm start
```

Then open http://localhost:3000

## What it does

- Your business details, payment details and notes are remembered in the browser
  (tick "Remember these") so you only type them once.
- Invoice number auto-increments from the last one you used (INV-001 -> INV-002).
- Date defaults to today, due date to 14 days out.
- Add as many services as you like; each is a description + a cost.
- Optional discount and "already paid / deposit" amounts, which produce a balance due.
- Long invoices flow onto extra pages with the table header repeated.

## Files

- `server.js` - express server, serves the form and the `/api/invoice` PDF endpoint
- `invoice-pdf.js` - the PDF layout (PDFKit)
- `public/` - the form (index.html, styles.css, app.js)
