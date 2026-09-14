const path = require('path');
const express = require('express');
const { buildInvoice } = require('./invoice-pdf');

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function safeFilename(s) {
  return String(s || 'invoice').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'invoice';
}

app.post('/api/invoice', (req, res) => {
  const b = req.body || {};

  const items = (Array.isArray(b.items) ? b.items : [])
    .map((i) => ({ description: String(i.description || '').trim(), amount: Number(i.amount) || 0 }))
    .filter((i) => i.description || i.amount);

  if (!items.length) {
    return res.status(400).json({ error: 'Add at least one service with a description or cost.' });
  }

  const data = {
    number: String(b.number || '').trim(),
    date: String(b.date || '').trim(),
    dueDate: String(b.dueDate || '').trim(),
    from: { address: String(b.fromAddress || '') },
    to: { name: String(b.toName || '').trim(), address: String(b.toAddress || '') },
    items,
    discount: Number(b.discount) || 0,
    paid: Number(b.paid) || 0,
    payment: String(b.payment || ''),
    notes: String(b.notes || ''),
  };

  const filename = `${safeFilename(data.number ? 'invoice-' + data.number : 'invoice')}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  try {
    buildInvoice(data, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: 'Could not generate the PDF.' });
    else res.end();
  }
});

module.exports = app;
