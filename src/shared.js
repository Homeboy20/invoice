// Shared defaults, storage helpers, i18n and formatting for Xpress Printing Toolkit.
// Loaded by popup.js, checker.js and options.js via <script src="shared.js">.

const XPT_DEFAULTS = {
  businessName: 'XPRESS PRINTING TANZANIA',
  whatsappNumber: '', // international format without +, e.g. 2557XXXXXXXX
  language: 'en',
  currency: 'TZS',
  prices: {
    bannerPerSqm: 25000,          // flex banner, per square metre
    teardropBanner: 180000,       // per unit incl. hardware
    largeFormatPerSqm: 35000,     // vinyl / high-res large format, per square metre
    tshirt: 15000,                // single t-shirt incl. print
    tshirtBulkQty: 12,            // qty at which bulk price applies
    tshirtBulk: 12000,            // per shirt at/above bulk qty
    businessCards100: 30000,      // per 100 cards, double-sided
    stickerPerSqm: 40000,         // cut vinyl stickers, per square metre
    logoDesign: 100000,           // flat fee
    mugPrint: 12000               // per customized mug
  }
};

const XPT_I18N = {
  en: {
    quote: 'Quote', checker: 'Checker', settings: 'Settings',
    service: 'Service', width: 'Width (m)', height: 'Height (m)',
    quantity: 'Quantity', total: 'Total', addLine: 'Add to quote',
    quoteLines: 'Quote lines', clearQuote: 'Clear', sendWhatsApp: 'Send via WhatsApp',
    copyQuote: 'Copy quote', copied: 'Copied!',
    noWhatsApp: 'No WhatsApp number set — quote copied to clipboard instead. Set your number in Settings.',
    dropImage: 'Drop an image here or click to choose',
    orRightClick: 'Tip: right-click any image on the web and choose "Check print quality".',
    pixels: 'Pixels', megapixels: 'Megapixels', maxAt: 'Max print size',
    dpi300: '300 DPI — cards & flyers', dpi150: '150 DPI — posters', dpi75: '75 DPI — banners',
    verdictGreat: 'Excellent — sharp even for close-up print work.',
    verdictGood: 'Good for posters and banners; too small for high-detail flyers at large sizes.',
    verdictBanner: 'Usable for banners viewed from a distance only.',
    verdictPoor: 'Too small for quality printing — ask the client for a larger original.',
    emptyQuote: 'No lines yet — add services above.',
    svc_banner: 'Banner (per m²)', svc_teardrop: 'Teardrop banner (unit)',
    svc_largeformat: 'Large format (per m²)', svc_tshirt: 'T-shirt printing',
    svc_cards: 'Business cards (per 100)', svc_sticker: 'Stickers (per m²)',
    svc_logo: 'Logo design', svc_mug: 'Mug printing',
    bulkNote: 'bulk price applied',
    greeting: 'Hello! Here is your quotation from',
    lineTotal: 'Line total', grandTotal: 'GRAND TOTAL', validity: 'Quote valid for 7 days.'
  },
  sw: {
    quote: 'Bei', checker: 'Kagua Picha', settings: 'Mipangilio',
    service: 'Huduma', width: 'Upana (m)', height: 'Urefu (m)',
    quantity: 'Idadi', total: 'Jumla', addLine: 'Ongeza kwenye bei',
    quoteLines: 'Orodha ya bei', clearQuote: 'Futa', sendWhatsApp: 'Tuma kwa WhatsApp',
    copyQuote: 'Nakili bei', copied: 'Imenakiliwa!',
    noWhatsApp: 'Namba ya WhatsApp haijawekwa — bei imenakiliwa. Weka namba kwenye Mipangilio.',
    dropImage: 'Dondosha picha hapa au bofya kuchagua',
    orRightClick: 'Dokezo: bofya-kulia picha yoyote mtandaoni chagua "Check print quality".',
    pixels: 'Pikseli', megapixels: 'Megapikseli', maxAt: 'Ukubwa wa juu wa kuchapa',
    dpi300: '300 DPI — kadi na vipeperushi', dpi150: '150 DPI — mabango madogo', dpi75: '75 DPI — mabanda makubwa',
    verdictGreat: 'Bora kabisa — kali hata kwa kazi za karibu.',
    verdictGood: 'Nzuri kwa mabango; ndogo kwa vipeperushi vikubwa vya ubora wa juu.',
    verdictBanner: 'Inafaa kwa mabanda yanayotazamwa kwa mbali tu.',
    verdictPoor: 'Ndogo mno kwa uchapishaji bora — omba picha kubwa zaidi kwa mteja.',
    emptyQuote: 'Hakuna huduma bado — ongeza hapo juu.',
    svc_banner: 'Bango (kwa m²)', svc_teardrop: 'Bango la teardrop (moja)',
    svc_largeformat: 'Chapa kubwa (kwa m²)', svc_tshirt: 'Chapa ya fulana',
    svc_cards: 'Kadi za biashara (kwa 100)', svc_sticker: 'Stika (kwa m²)',
    svc_logo: 'Usanifu wa nembo', svc_mug: 'Chapa ya kikombe',
    bulkNote: 'bei ya jumla imetumika',
    greeting: 'Habari! Hii ni bei yako kutoka',
    lineTotal: 'Jumla ya mstari', grandTotal: 'JUMLA KUU', validity: 'Bei hii ni halali kwa siku 7.'
  }
};

// chrome.storage may be absent when a page is opened directly in a browser for testing.
const XPT_HAS_CHROME = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync;

function xptLoadSettings() {
  return new Promise((resolve) => {
    if (!XPT_HAS_CHROME) { resolve(structuredClone(XPT_DEFAULTS)); return; }
    chrome.storage.sync.get(XPT_DEFAULTS, (stored) => {
      const merged = structuredClone(XPT_DEFAULTS);
      Object.assign(merged, stored);
      merged.prices = Object.assign({}, XPT_DEFAULTS.prices, stored.prices || {});
      resolve(merged);
    });
  });
}

function xptSaveSettings(settings) {
  return new Promise((resolve) => {
    if (!XPT_HAS_CHROME) { resolve(); return; }
    chrome.storage.sync.set(settings, resolve);
  });
}

function xptT(lang, key) {
  return (XPT_I18N[lang] && XPT_I18N[lang][key]) || XPT_I18N.en[key] || key;
}

function xptMoney(amount, currency) {
  return Math.round(amount).toLocaleString('en-US') + ' ' + (currency || 'TZS');
}

// Apply translations to all elements carrying data-i18n="key".
function xptApplyI18n(lang) {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = xptT(lang, el.getAttribute('data-i18n'));
  });
}
