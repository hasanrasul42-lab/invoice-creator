const STORE_KEY = 'invoice-creator:profile';
const SAVED_FIELDS = ['fromAddress', 'payment', 'notes'];

const $ = (id) => document.getElementById(id);
const itemsEl = $('items');
const totalsEl = $('totals');
const errorEl = $('error');

const gbp = (n) =>
  '£' + (Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// ---------------------------------------------------------------- line items
function addItem(description = '', amount = '') {
  const row = document.createElement('div');
  row.className = 'item-row';
  row.innerHTML = `
    <input class="desc" placeholder="e.g. Website design">
    <input class="amount" type="number" step="0.01" min="0" placeholder="0.00">
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
      amount: Number(row.querySelector('.amount').value) || 0,
    }))
    .filter((i) => i.description || i.amount);
}

// ------------------------------------------------------------------- totals
function renderTotals() {
  const subtotal = readItems().reduce((s, i) => s + i.amount, 0);
  const discount = Number($('discount').value) || 0;
  const total = Math.max(subtotal - discount, 0);
  const paid = Number($('paid').value) || 0;
  const balance = total - paid;

  const rows = [['Subtotal', gbp(subtotal)]];
  if (discount) rows.push(['Discount', '-' + gbp(discount)]);
  if (paid) {
    rows.push(['Total', gbp(total)]);
    rows.push(['Paid', '-' + gbp(paid)]);
  }

  totalsEl.innerHTML =
    rows.map(([l, v]) => `<div class="row"><span>${l}</span><span>${v}</span></div>`).join('') +
    `<div class="row grand"><span>${paid ? 'Balance due' : 'Total due'}</span><span>${gbp(balance)}</span></div>`;
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
    items,
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
      throw new Error("Can't reach the server - is it still running? Start it with: npm start");
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
