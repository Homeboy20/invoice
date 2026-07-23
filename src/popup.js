// Popup logic: quote calculator, image checker, WhatsApp/copy actions.

let S; // settings
const quoteLines = [];

const SERVICES = [
  { id: 'banner',      i18n: 'svc_banner',      perSqm: 'bannerPerSqm' },
  { id: 'largeformat', i18n: 'svc_largeformat', perSqm: 'largeFormatPerSqm' },
  { id: 'sticker',     i18n: 'svc_sticker',     perSqm: 'stickerPerSqm' },
  { id: 'teardrop',    i18n: 'svc_teardrop',    unit: 'teardropBanner' },
  { id: 'tshirt',      i18n: 'svc_tshirt',      unit: 'tshirt', bulk: true },
  { id: 'cards',       i18n: 'svc_cards',       unit: 'businessCards100' },
  { id: 'mug',         i18n: 'svc_mug',         unit: 'mugPrint' },
  { id: 'logo',        i18n: 'svc_logo',        unit: 'logoDesign' }
];

const $ = (id) => document.getElementById(id);

function currentService() {
  return SERVICES.find((s) => s.id === $('svc').value) || SERVICES[0];
}

function computeLine() {
  const svc = currentService();
  const qty = Math.max(1, parseInt($('qty').value, 10) || 1);
  let unitPrice, note = '';
  if (svc.perSqm) {
    const w = Math.max(0, parseFloat($('w').value) || 0);
    const h = Math.max(0, parseFloat($('h').value) || 0);
    unitPrice = w * h * S.prices[svc.perSqm];
    note = w + 'm × ' + h + 'm';
  } else {
    unitPrice = S.prices[svc.unit];
    if (svc.bulk && qty >= S.prices.tshirtBulkQty) {
      unitPrice = S.prices.tshirtBulk;
      note = xptT(S.language, 'bulkNote');
    }
  }
  return {
    label: xptT(S.language, svc.i18n),
    note, qty,
    total: unitPrice * qty
  };
}

function refreshPreview() {
  const line = computeLine();
  const detail = [line.note, line.qty > 1 ? '×' + line.qty : ''].filter(Boolean).join(', ');
  $('linePreview').textContent =
    line.label + (detail ? ' (' + detail + ')' : '') + ' = ' + xptMoney(line.total, S.currency);
  $('dimRow').style.display = currentService().perSqm ? 'flex' : 'none';
}

function renderQuote() {
  const ul = $('quoteLines');
  ul.textContent = '';
  if (!quoteLines.length) {
    const li = document.createElement('li');
    li.textContent = xptT(S.language, 'emptyQuote');
    ul.appendChild(li);
  }
  quoteLines.forEach((line, i) => {
    const li = document.createElement('li');
    const desc = document.createElement('span');
    const detail = [line.note, line.qty > 1 ? '×' + line.qty : ''].filter(Boolean).join(', ');
    desc.textContent = line.label + (detail ? ' (' + detail + ')' : '');
    const amt = document.createElement('span');
    amt.className = 'amt';
    amt.textContent = xptMoney(line.total, S.currency);
    const del = document.createElement('button');
    del.textContent = '✕';
    del.addEventListener('click', () => { quoteLines.splice(i, 1); renderQuote(); });
    li.append(desc, amt, del);
    ul.appendChild(li);
  });
  const grand = quoteLines.reduce((sum, l) => sum + l.total, 0);
  $('grandTotal').textContent = xptMoney(grand, S.currency);
}

function quoteText() {
  const lang = S.language;
  const lines = [
    xptT(lang, 'greeting') + ' ' + S.businessName + ':',
    ''
  ];
  quoteLines.forEach((l, i) => {
    const detail = [l.note, l.qty > 1 ? '×' + l.qty : ''].filter(Boolean).join(', ');
    lines.push((i + 1) + '. ' + l.label + (detail ? ' (' + detail + ')' : '') +
      ' — ' + xptMoney(l.total, S.currency));
  });
  const grand = quoteLines.reduce((sum, l) => sum + l.total, 0);
  lines.push('', xptT(lang, 'grandTotal') + ': ' + xptMoney(grand, S.currency));
  lines.push(xptT(lang, 'validity'));
  return lines.join('\n');
}

async function copyQuote(msgKey) {
  try { await navigator.clipboard.writeText(quoteText()); } catch (e) { /* clipboard denied */ }
  $('quoteNote').textContent = xptT(S.language, msgKey);
  setTimeout(() => { $('quoteNote').textContent = ''; }, 4000);
}

function sendWhatsApp() {
  if (!quoteLines.length) return;
  const num = (S.whatsappNumber || '').replace(/[^\d]/g, '');
  if (!num) { copyQuote('noWhatsApp'); return; }
  const url = 'https://wa.me/' + num + '?text=' + encodeURIComponent(quoteText());
  if (XPT_HAS_CHROME && chrome.tabs) chrome.tabs.create({ url });
  else window.open(url, '_blank');
}

function populateServices() {
  const sel = $('svc');
  sel.textContent = '';
  SERVICES.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = xptT(S.language, s.i18n);
    sel.appendChild(opt);
  });
}

function applyLanguage() {
  xptApplyI18n(S.language);
  const selected = $('svc').value;
  populateServices();
  if (selected) $('svc').value = selected;
  refreshPreview();
  renderQuote();
}

function initTabs() {
  const map = { tabQuote: 'paneQuote', tabChecker: 'paneChecker' };
  Object.entries(map).forEach(([btnId, paneId]) => {
    $(btnId).addEventListener('click', () => {
      document.querySelectorAll('nav.tabs button').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.pane').forEach((p) => p.classList.remove('active'));
      $(btnId).classList.add('active');
      $(paneId).classList.add('active');
    });
  });
  $('tabSettings').addEventListener('click', () => {
    if (XPT_HAS_CHROME && chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open('options.html', '_blank');
    }
  });
}

function initChecker() {
  const drop = $('drop');
  const file = $('file');
  const handleFile = (f) => {
    if (!f || !f.type.startsWith('image/')) return;
    xptCheckImageUrl(URL.createObjectURL(f), $('checkResult'), S.language);
  };
  drop.addEventListener('click', () => file.click());
  file.addEventListener('change', () => handleFile(file.files[0]));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('hover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('hover'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('hover');
    handleFile(e.dataTransfer.files[0]);
  });
}

(async function init() {
  S = await xptLoadSettings();
  $('bizName').textContent = S.businessName;
  $('langSel').value = S.language;
  $('langSel').addEventListener('change', async () => {
    S.language = $('langSel').value;
    await xptSaveSettings({ language: S.language });
    applyLanguage();
  });
  populateServices();
  initTabs();
  initChecker();
  ['svc', 'w', 'h', 'qty'].forEach((id) => {
    $(id).addEventListener('input', refreshPreview);
    $(id).addEventListener('change', refreshPreview);
  });
  $('addLine').addEventListener('click', () => { quoteLines.push(computeLine()); renderQuote(); });
  $('clearQuote').addEventListener('click', () => { quoteLines.length = 0; renderQuote(); });
  $('sendWa').addEventListener('click', sendWhatsApp);
  $('copyQuote').addEventListener('click', () => { if (quoteLines.length) copyQuote('copied'); });
  applyLanguage();
})();
