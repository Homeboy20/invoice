// Options page: edit business info and price list.

const PRICE_KEYS = [
  'bannerPerSqm', 'largeFormatPerSqm', 'stickerPerSqm', 'teardropBanner',
  'tshirt', 'tshirtBulk', 'tshirtBulkQty', 'businessCards100', 'mugPrint', 'logoDesign'
];

(async function init() {
  const S = await xptLoadSettings();
  document.getElementById('businessName').value = S.businessName;
  document.getElementById('whatsappNumber').value = S.whatsappNumber;
  document.getElementById('language').value = S.language;
  document.getElementById('currency').value = S.currency;
  PRICE_KEYS.forEach((k) => {
    document.getElementById('p_' + k).value = S.prices[k];
  });

  document.getElementById('save').addEventListener('click', async () => {
    const prices = {};
    PRICE_KEYS.forEach((k) => {
      const v = parseFloat(document.getElementById('p_' + k).value);
      prices[k] = isNaN(v) || v < 0 ? XPT_DEFAULTS.prices[k] : v;
    });
    await xptSaveSettings({
      businessName: document.getElementById('businessName').value.trim() || XPT_DEFAULTS.businessName,
      whatsappNumber: document.getElementById('whatsappNumber').value.replace(/[^\d]/g, ''),
      language: document.getElementById('language').value,
      currency: document.getElementById('currency').value.trim() || 'TZS',
      prices
    });
    const msg = document.getElementById('savedMsg');
    msg.classList.add('show');
    setTimeout(() => msg.classList.remove('show'), 2000);
  });
})();
