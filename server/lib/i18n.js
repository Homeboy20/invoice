// PDF label subset — mirrors the labels object src/invoice.js builds client-side,
// kept in sync manually since the two runtimes don't share a module loader.

const LABELS = {
  en: {
    invoice: 'Invoice', description: 'Description', quantity: 'Quantity',
    unitPrice: 'Unit price', amount: 'Amount', subtotal: 'Subtotal',
    discountLbl: 'Discount', vatLbl: 'VAT', grandTotal: 'GRAND TOTAL',
    customerName: 'Customer name', dateLbl: 'Date', servedBy: 'Served by', invoiceNo: 'Invoice No.'
  },
  sw: {
    invoice: 'Ankara', description: 'Maelezo', quantity: 'Idadi',
    unitPrice: 'Bei ya kipande', amount: 'Kiasi', subtotal: 'Jumla ndogo',
    discountLbl: 'Punguzo', vatLbl: 'VAT', grandTotal: 'JUMLA KUU',
    customerName: 'Jina la mteja', dateLbl: 'Tarehe', servedBy: 'Amehudumiwa na', invoiceNo: 'Namba ya Ankara'
  }
};

function labelsFor(lang) {
  return LABELS[lang] || LABELS.en;
}

module.exports = { labelsFor };
