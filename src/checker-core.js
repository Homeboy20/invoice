// Print-quality analysis shared by popup.js and checker.js.

const XPT_DPI_TIERS = [
  { dpi: 300, key: 'dpi300' },
  { dpi: 150, key: 'dpi150' },
  { dpi: 75,  key: 'dpi75'  }
];

function xptAnalyzeImage(width, height) {
  const mp = (width * height) / 1e6;
  const CM_PER_INCH = 2.54;
  const sizes = XPT_DPI_TIERS.map((t) => ({
    key: t.key,
    dpi: t.dpi,
    wCm: (width / t.dpi) * CM_PER_INCH,
    hCm: (height / t.dpi) * CM_PER_INCH
  }));
  // Verdict based on the longest side printable at each tier.
  const longPx = Math.max(width, height);
  let verdict;
  if (longPx >= 4800) verdict = 'great';        // >= ~40 cm at 300dpi
  else if (longPx >= 2400) verdict = 'good';    // >= ~40 cm at 150dpi
  else if (longPx >= 1000) verdict = 'banner';  // >= ~34 cm at 75dpi
  else verdict = 'poor';
  return { width, height, mp, sizes, verdict };
}

function xptFmtCm(v) {
  return (v >= 100 ? (v / 100).toFixed(2) + ' m' : v.toFixed(1) + ' cm');
}

// Render analysis into a container element. imgSrc optional (thumbnail).
function xptRenderAnalysis(container, analysis, imgSrc, lang) {
  container.textContent = '';
  if (imgSrc) {
    const img = document.createElement('img');
    img.className = 'thumb';
    img.src = imgSrc;
    img.alt = '';
    container.appendChild(img);
  }
  const table = document.createElement('table');
  table.className = 'dims';
  const addRow = (label, value) => {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td');
    const td2 = document.createElement('td');
    td1.textContent = label;
    td2.textContent = value;
    tr.append(td1, td2);
    table.appendChild(tr);
  };
  addRow(xptT(lang, 'pixels'), analysis.width + ' × ' + analysis.height + ' px');
  addRow(xptT(lang, 'megapixels'), analysis.mp.toFixed(1) + ' MP');
  analysis.sizes.forEach((s) => {
    addRow(xptT(lang, s.key), xptFmtCm(s.wCm) + ' × ' + xptFmtCm(s.hCm));
  });
  container.appendChild(table);

  const verdictKey = {
    great: 'verdictGreat', good: 'verdictGood',
    banner: 'verdictBanner', poor: 'verdictPoor'
  }[analysis.verdict];
  const v = document.createElement('div');
  v.className = 'verdict ' + analysis.verdict;
  v.textContent = xptT(lang, verdictKey);
  container.appendChild(v);
}

// Load an image from a URL or object URL and analyze it.
function xptCheckImageUrl(url, container, lang, onDone) {
  const probe = new Image();
  probe.onload = () => {
    const analysis = xptAnalyzeImage(probe.naturalWidth, probe.naturalHeight);
    xptRenderAnalysis(container, analysis, url, lang);
    if (onDone) onDone(analysis);
  };
  probe.onerror = () => {
    container.textContent = 'Could not load image.';
  };
  probe.src = url;
}
