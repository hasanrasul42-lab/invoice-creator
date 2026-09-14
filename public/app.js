const STORE_KEY = 'invoice-creator:profile';
const SAVED_FIELDS = ['fromAddress', 'payment', 'notes'];

const $ = (id) => document.getElementById(id);
const itemsEl = $('items');
const totalsEl = $('totals');
const errorEl = $('error');

const gbp = (n) =>
  '£' + (Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// A cost is either a number or the literal "TBC" (to be confirmed).
function parseAmount(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (/^tbc$/i.test(s)) return { amount: 0, tbc: true };
  return { amount: Number(s.replace(/[£,\s]/g, '')) || 0, tbc: false };
}

// "<amount> + TBC" once anything on the invoice is still to be confirmed.
function withTbc(n, hasTbc) {
  if (!hasTbc) return gbp(n);
  return Math.abs(n) < 0.005 ? 'TBC' : gbp(n) + ' + TBC';
}

// ---------------------------------------------------------------- line items
function addItem(description = '', amount = '') {
  const row = document.createElement('div');
  row.className = 'item-row';
  row.innerHTML = `
    <input class="desc" placeholder="e.g. Website design">
    <input class="amount" type="text" inputmode="decimal" placeholder="0.00 or TBC">
    <button type="button" class="remove" title="Remove">&times;</button>`;
  row.querySelector('.desc').value = description;
  row.querySelector('.amount').value = amount;
  row.querySelector('.remove').addEventListener('click', () => {
    row.remove();
    if (!itemsEl.children.length) addItem();
    renderTotals();
  });
  row.querySelector('.amount').addEventListener('input', renderTotals);
  itemsEl.appendChild(row);
  return row;
}

function readItems() {
  return [...itemsEl.querySelectorAll('.item-row')]
    .map((row) => ({
      description: row.querySelector('.desc').value.trim(),
      ...parseAmount(row.querySelector('.amount').value),
    }))
    .filter((i) => i.description || i.amount || i.tbc);
}

// ------------------------------------------------------------------- totals
function renderTotals() {
  const items = readItems();
  const subtotal = items.reduce((s, i) => s + i.amount, 0);
  const hasTbc = items.some((i) => i.tbc);
  const discount = Number($('discount').value) || 0;
  const total = Math.max(subtotal - discount, 0);
  const paid = Number($('paid').value) || 0;
  const balance = total - paid;

  const rows = [['Subtotal', withTbc(subtotal, hasTbc)]];
  if (discount) rows.push(['Discount', '-' + gbp(discount)]);
  if (paid) {
    rows.push(['Total', withTbc(total, hasTbc)]);
    rows.push(['Paid', '-' + gbp(paid)]);
  }

  totalsEl.innerHTML =
    rows.map(([l, v]) => `<div class="row"><span>${l}</span><span>${v}</span></div>`).join('') +
    `<div class="row grand"><span>${paid ? 'Balance due' : 'Total due'}</span><span>${withTbc(balance, hasTbc)}</span></div>`;
}

// ------------------------------------------------------------------ profile
function saveProfile() {
  if (!$('remember').checked) return;
  const data = {};
  for (const f of SAVED_FIELDS) data[f] = $(f).value;
  data.lastNumber = $('number').value;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch (_) { /* private mode - not important */ }
}

function loadProfile() {
  let data;
  try {
    data = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
  } catch (_) {
    data = {};
  }
  for (const f of SAVED_FIELDS) if (data[f]) $(f).value = data[f];
  return data;
}

function nextNumber(last) {
  if (!last) return 'INV-001';
  const m = String(last).match(/^(.*?)(\d+)(\D*)$/);
  if (!m) return last;
  const [, prefix, digits, suffix] = m;
  return prefix + String(Number(digits) + 1).padStart(digits.length, '0') + suffix;
}

// -------------------------------------------------------------------- dates
function iso(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function prettyDate(value) {
  if (!value) return '';
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// --------------------------------------------------------------------- init
const profile = loadProfile();
$('number').value = nextNumber(profile.lastNumber);
const today = new Date();
$('date').value = iso(today);
$('dueDate').value = iso(new Date(today.getTime() + 14 * 86400000));

addItem();
renderTotals();

$('add-item').addEventListener('click', () => addItem());
$('discount').addEventListener('input', renderTotals);
$('paid').addEventListener('input', renderTotals);

// ------------------------------------------------------------------- submit
$('invoice-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.hidden = true;

  const items = readItems();
  if (!items.length) {
    errorEl.textContent = 'Add at least one service before creating the invoice.';
    errorEl.hidden = false;
    return;
  }

  const payload = {
    number: $('number').value.trim(),
    date: prettyDate($('date').value),
    dueDate: prettyDate($('dueDate').value),
    fromAddress: $('fromAddress').value,
    toName: $('toName').value.trim(),
    toAddress: $('toAddress').value,
    items: items.map((i) => ({ description: i.description, amount: i.tbc ? 'TBC' : i.amount })),
    discount: Number($('discount').value) || 0,
    paid: Number($('paid').value) || 0,
    payment: $('payment').value,
    notes: $('notes').value,
  };

  const btn = $('submit');
  btn.disabled = true;
  btn.textContent = 'Creating…';

  try {
    let res;
    try {
      res = await fetch('/api/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (_) {
      // fetch only throws like this when the server isn't reachable
      throw new Error('Could not reach the server. Check your connection and try again.');
    }

    if (!res.ok) {
      const msg = await res.json().catch(() => ({}));
      throw new Error(msg.error || 'Something went wrong generating the PDF.');
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (payload.number ? 'invoice-' + payload.number : 'invoice') + '.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    saveProfile();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Invoice';
  }
});
