pdRequireAuth();

const PRICE_KEYS = [
  'bannerPerSqm', 'largeFormatPerSqm', 'stickerPerSqm', 'teardropBanner',
  'tshirt', 'tshirtBulk', 'tshirtBulkQty', 'businessCards100', 'mugPrint', 'logoDesign'
];
const $ = (id) => document.getElementById(id);

let staff = [];
let logo = null; // {dataUrl,w,h} | null — null means "no change"; explicit removal sends null on save

function renderStaff() {
  const ul = $('staffList');
  ul.textContent = '';
  staff.forEach((u) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = u.name;
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕';
    del.addEventListener('click', async () => {
      try {
        await pdApi('/staff/' + u.id, { method: 'DELETE' });
        staff = staff.filter((s) => s.id !== u.id);
        renderStaff();
      } catch (e) {
        alert(e.message);
      }
    });
    li.append(name, del);
    ul.appendChild(li);
  });
}

function handleLogoFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const maxH = 300;
    const scale = Math.min(1, maxH / img.naturalHeight);
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    logo = { dataUrl: canvas.toDataURL('image/jpeg', 0.9), w, h };
    $('logoPreview').src = logo.dataUrl;
    $('logoPreviewWrap').style.display = 'block';
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

(async function init() {
  const { business, staff: staffList } = await pdApi('/me');
  pdRenderHeader(business);

  $('businessName').value = business.name;
  $('businessAddress').value = business.address;
  $('businessPhone').value = business.phone;
  $('businessEmail').value = business.bizEmail;
  $('tin').value = business.tin;
  $('vrn').value = business.vrn;
  $('whatsappNumber').value = business.whatsappNumber;
  $('currency').value = business.currency;
  $('invoicePrefix').value = business.invoicePrefix;
  $('language').value = business.language;
  $('vatEnabled').checked = business.vatEnabled;
  $('vatRate').value = business.vatRate;
  $('accentColor').value = /^#[0-9a-f]{6}$/i.test(business.accentColor) ? business.accentColor : '#d92027';
  $('invoiceTerms').value = business.invoiceTerms;
  PRICE_KEYS.forEach((k) => { $('p_' + k).value = business.prices[k]; });

  if (business.logo) {
    $('logoPreview').src = business.logo.dataUrl;
    $('logoPreviewWrap').style.display = 'block';
  }

  staff = staffList;
  renderStaff();

  $('addStaff').addEventListener('click', async () => {
    const name = $('newStaffName').value.trim();
    if (!name) return;
    $('staffErr').textContent = '';
    try {
      const res = await pdApi('/staff', { method: 'POST', body: { name } });
      staff.push(res.staff);
      $('newStaffName').value = '';
      renderStaff();
    } catch (e) {
      pdShowError($('staffErr'), e);
    }
  });

  $('logoFile').addEventListener('change', () => handleLogoFile($('logoFile').files[0]));
  $('removeLogo').addEventListener('click', async () => {
    await pdApi('/business/logo', { method: 'PUT', body: { dataUrl: null } });
    logo = null;
    $('logoPreviewWrap').style.display = 'none';
    $('logoFile').value = '';
  });

  $('save').addEventListener('click', async () => {
    const prices = {};
    PRICE_KEYS.forEach((k) => { prices[k] = parseFloat($('p_' + k).value) || 0; });
    try {
      await pdApi('/business', {
        method: 'PUT',
        body: {
          businessName: $('businessName').value,
          businessAddress: $('businessAddress').value,
          businessPhone: $('businessPhone').value,
          businessEmail: $('businessEmail').value,
          tin: $('tin').value,
          vrn: $('vrn').value,
          whatsappNumber: $('whatsappNumber').value,
          currency: $('currency').value,
          invoicePrefix: $('invoicePrefix').value,
          language: $('language').value,
          vatEnabled: $('vatEnabled').checked,
          vatRate: parseFloat($('vatRate').value) || 0,
          accentColor: $('accentColor').value,
          invoiceTerms: $('invoiceTerms').value,
          prices
        }
      });
      if (logo) await pdApi('/business/logo', { method: 'PUT', body: logo });
      const msg = $('savedMsg');
      msg.classList.add('show');
      setTimeout(() => msg.classList.remove('show'), 2000);
    } catch (e) {
      alert(e.message);
    }
  });
})();
