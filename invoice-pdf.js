const PDFDocument = require('pdfkit');

const INK = '#111827';       // near-black for headings
const BODY = '#374151';      // body text
const MUTED = '#6B7280';     // labels, secondary text
const RULE = '#E5E7EB';      // hairlines
const BAND = '#F3F4F6';      // table header fill

const PAGE_MARGIN = 50;
const BOTTOM_LIMIT = 760;    // y after which we break to a new page

function money(n) {
  const v = Number(n) || 0;
  return '£' + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * A total that has an unpriced (TBC) item in it reads as "£X + TBC" - or just
 * "TBC" when nothing in it is priced yet.
 */
function withTbc(n, hasTbc) {
  if (!hasTbc) return money(n);
  return Math.abs(n) < 0.005 ? 'TBC' : money(n) + ' + TBC';
}

function lines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Streams a professional-looking A4 invoice PDF into `stream`.
 */
function buildInvoice(data, stream) {
  const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, bufferPages: true });
  doc.pipe(stream);

  const left = PAGE_MARGIN;
  const right = doc.page.width - PAGE_MARGIN;
  const width = right - left;

  // ---------------------------------------------------------------- header
  const headerTop = 55;

  let y = headerTop + 6;
  doc.font('Helvetica').fontSize(9.5).fillColor(MUTED);
  for (const line of lines(data.from.address)) {
    doc.text(line, left, y, { width: width * 0.55 });
    y = doc.y + 1;
  }
  const fromBottom = y;

  doc.font('Helvetica-Bold').fontSize(30).fillColor(INK)
    .text('INVOICE', left, headerTop - 4, { width, align: 'right' });

  let metaY = doc.y + 10;
  const metaRows = [
    ['Invoice No.', data.number],
    ['Date', data.date],
    ['Due', data.dueDate],
  ].filter(([, v]) => v);

  for (const [label, value] of metaRows) {
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
      .text(label, right - 220, metaY, { width: 110, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(BODY)
      .text(String(value), right - 105, metaY, { width: 105, align: 'right' });
    metaY += 15;
  }

  // ------------------------------------------------------------------ rule
  y = Math.max(fromBottom, metaY) + 18;
  doc.moveTo(left, y).lineTo(right, y).lineWidth(1).strokeColor(RULE).stroke();

  // --------------------------------------------------------------- bill to
  y += 22;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED)
    .text('BILL TO', left, y, { characterSpacing: 1 });

  y = doc.y + 5;
  doc.font('Helvetica-Bold').fontSize(11.5).fillColor(INK)
    .text(data.to.name || '—', left, y, { width: width * 0.55 });

  y = doc.y + 2;
  doc.font('Helvetica').fontSize(9.5).fillColor(BODY);
  for (const line of lines(data.to.address)) {
    doc.text(line, left, y, { width: width * 0.55 });
    y = doc.y + 1;
  }

  // ----------------------------------------------------------------- table
  y += 26;
  const amountW = 110;
  const descW = width - amountW - 16;

  const tableHeader = (yy) => {
    doc.rect(left, yy, width, 24).fill(BAND);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MUTED)
      .text('DESCRIPTION', left + 12, yy + 8, { width: descW, characterSpacing: 0.8 })
      .text('AMOUNT', left + 12 + descW, yy + 8, { width: amountW - 12, align: 'right', characterSpacing: 0.8 });
    return yy + 24;
  };

  y = tableHeader(y);

  for (const item of data.items) {
    doc.font('Helvetica').fontSize(10).fillColor(BODY);
    const h = Math.max(doc.heightOfString(item.description, { width: descW }), 12) + 18;

    if (y + h > BOTTOM_LIMIT) {
      doc.addPage();
      y = tableHeader(PAGE_MARGIN);
      doc.font('Helvetica').fontSize(10).fillColor(BODY);
    }

    doc.text(item.description, left + 12, y + 9, { width: descW });
    doc.font('Helvetica').fontSize(10).fillColor(INK)
      .text(item.tbc ? 'TBC' : money(item.amount), left + 12 + descW, y + 9, { width: amountW - 12, align: 'right' });

    y += h;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor(RULE).stroke();
  }

  // ---------------------------------------------------------------- totals
  const subtotal = data.items.reduce((sum, i) => sum + (i.tbc ? 0 : Number(i.amount) || 0), 0);
  const hasTbc = data.items.some((i) => i.tbc);
  const discount = Number(data.discount) || 0;
  const total = Math.max(subtotal - discount, 0);
  const paid = Number(data.paid) || 0;
  const balance = total - paid;

  const totalRows = [['Subtotal', withTbc(subtotal, hasTbc)]];
  if (discount) totalRows.push(['Discount', '-' + money(discount)]);
  if (paid) {
    totalRows.push(['Total', withTbc(total, hasTbc)]);
    totalRows.push(['Paid', '-' + money(paid)]);
  }

  const boxW = 250;
  const boxX = right - boxW;

  if (y + totalRows.length * 18 + 60 > BOTTOM_LIMIT) {
    doc.addPage();
    y = PAGE_MARGIN;
  }

  y += 14;
  for (const [label, value] of totalRows) {
    doc.font('Helvetica').fontSize(9.5).fillColor(MUTED)
      .text(label, boxX + 14, y + 4, { width: 110 });
    doc.font('Helvetica').fontSize(9.5).fillColor(BODY)
      .text(value, boxX + 110, y + 4, { width: boxW - 124, align: 'right' });
    y += 18;
  }

  y += 4;
  doc.rect(boxX, y, boxW, 38).fill(BAND);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(BODY)
    .text(paid ? 'BALANCE DUE' : 'TOTAL DUE', boxX + 14, y + 14, { width: 110, characterSpacing: 0.6 });
  const balanceLabel = withTbc(balance, hasTbc);
  const balanceW = boxW - 124;
  let balanceSize = 15;
  doc.font('Helvetica-Bold');
  while (balanceSize > 9 && doc.fontSize(balanceSize).widthOfString(balanceLabel) > balanceW) {
    balanceSize -= 0.5;
  }
  doc.fontSize(balanceSize).fillColor(INK)
    .text(balanceLabel, boxX + 110, y + 10 + (15 - balanceSize) / 2, { width: balanceW, align: 'right' });

  y += 38 + 40;

  // ------------------------------------------------- payment details / notes
  const blocks = [];
  if (lines(data.payment).length) blocks.push(['PAYMENT DETAILS', lines(data.payment)]);
  if (lines(data.notes).length) blocks.push(['NOTES', lines(data.notes)]);

  if (blocks.length) {
    const needed = 30 + Math.max(...blocks.map(([, b]) => b.length)) * 13;
    if (y + needed > BOTTOM_LIMIT) {
      doc.addPage();
      y = PAGE_MARGIN;
    }

    doc.moveTo(left, y - 16).lineTo(right, y - 16).lineWidth(1).strokeColor(RULE).stroke();

    const colW = blocks.length > 1 ? (width - 30) / 2 : width;
    blocks.forEach(([title, body], i) => {
      const x = left + i * (colW + 30);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED)
        .text(title, x, y, { width: colW, characterSpacing: 1 });
      let by = doc.y + 5;
      doc.font('Helvetica').fontSize(9.5).fillColor(BODY);
      for (const line of body) {
        doc.text(line, x, by, { width: colW });
        by = doc.y + 1;
      }
    });
  }

  // ---------------------------------------------------------------- footer
  // Dropping the bottom margin stops PDFKit from treating footer text as
  // overflow and spawning an extra blank page.
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text(
        data.number || '',
        left,
        doc.page.height - 45,
        { width: width, align: 'center', lineBreak: false }
      );
    doc.page.margins.bottom = savedBottom;
  }

  doc.end();
}

module.exports = { buildInvoice, money };
