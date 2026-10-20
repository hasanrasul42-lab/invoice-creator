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

// ------------------------------------------------------------- save location
// Chrome/Edge can write straight into a folder you pick, so invoices land in
// e.g. Documents\invoices\Sent instead of Downloads. The folder handle is kept
// in IndexedDB (it is an object, so localStorage cannot hold it). Other
// browsers fall back to a normal download.
const CAN_PICK_FOLDER = typeof window.showDirectoryPicker === 'function';
let saveDir = null;

function handleStore(mode, run) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('invoice-creator', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('handles');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const req = run(open.result.transaction('handles', mode).objectStore('handles'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    };
  });
}

const rememberDir = (h) => handleStore('readwrite', (s) => s.put(h, 'saveDir'));
const recallDir = () => handleStore('readonly', (s) => s.get('saveDir'));
const forgetDir = () => handleStore('readwrite', (s) => s.delete('saveDir'));

// Must be called while the user's click is still "fresh", or Chrome refuses.
async function allowedToWrite(dir) {
  const opts = { mode: 'readwrite' };
  if ((await dir.queryPermission(opts)) === 'granted') return true;
  return (await dir.requestPermission(opts)) === 'granted';
}

async function nameIsFree(dir, name) {
  try {
    await dir.getFileHandle(name);
    return false;
  } catch (_) {
    return true;
  }
}

// Never overwrite an invoice already in the folder - add " (2)", " (3)"...
async function freeName(dir, base) {
  let name = `${base}.pdf`;
  for (let n = 2; !(await nameIsFree(dir, name)); n++) name = `${base} (${n}).pdf`;
  return name;
}

async function writeToFolder(dir, base, blob) {
  const name = await freeName(dir, base);
  const file = await dir.getFileHandle(name, { create: true });
  const stream = await file.createWritable();
  await stream.write(blob);
  await stream.close();
  return name;
}

function renderSavebar() {
  const bar = $('savebar');
  const label = $('save-folder');
  const clear = $('clear-folder');

  if (!CAN_PICK_FOLDER) {
    bar.hidden = false;
    $('pick-folder').hidden = true;
    label.textContent = 'Downloads';
    label.insertAdjacentHTML(
      'afterend',
      '<span class="note">This browser cannot save to a chosen folder. Chrome or Edge can.</span>'
    );
    return;
  }

  bar.hidden = false;
  label.textContent = saveDir ? saveDir.name : 'Downloads';
  clear.hidden = !saveDir;
  $('pick-folder').textContent = saveDir ? 'Change folder' : 'Choose folder';
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

if (CAN_PICK_FOLDER) {
  recallDir().then((dir) => { saveDir = dir || null; renderSavebar(); }).catch(() => renderSavebar());

  $('pick-folder').addEventListener('click', async () => {
    try {
      const dir = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });
      saveDir = dir;
      await rememberDir(dir);
      renderSavebar();
      showOk('Invoices will be saved into "' + dir.name + '".');
    } catch (_) { /* picker dismissed */ }
  });

  $('clear-folder').addEventListener('click', async () => {
    saveDir = null;
    await forgetDir().catch(() => {});
    renderSavebar();
  });
} else {
  renderSavebar();
}
$('discount').addEventListener('input', renderTotals);
$('paid').addEventListener('input', renderTotals);

// ----------------------------------------------------------------- messages
function showOk(text) {
  $('ok').textContent = text;
  $('ok').hidden = false;
  $('error').hidden = true;
}

function showError(text) {
  $('error').textContent = text;
  $('error').hidden = false;
  $('ok').hidden = true;
}

// ------------------------------------------------------------------- submit
$('invoice-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.hidden = true;
  $('ok').hidden = true;

  const items = readItems();
  if (!items.length) {
    showError('Add at least one service before creating the invoice.');
    return;
  }

  // Ask while the click is still fresh - Chrome rejects the prompt later on.
  let writeTo = null;
  if (saveDir) {
    try {
      writeTo = (await allowedToWrite(saveDir)) ? saveDir : null;
    } catch (_) {
      writeTo = null;
    }
    if (!writeTo) {
      showError('No permission to write to "' + saveDir.name + '" - downloading instead.');
    }
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
    const base = payload.number ? 'invoice-' + payload.number : 'invoice';

    if (writeTo) {
      const name = await writeToFolder(writeTo, base, blob);
      showOk('Saved ' + name + ' to "' + writeTo.name + '".');
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = base + '.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    saveProfile();
    $('number').value = nextNumber($('number').value);
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Invoice';
  }
});
