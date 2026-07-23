// Full-page checker: opened by the context menu with ?img=<url>, also accepts drag-drop.

(async function init() {
  const S = await xptLoadSettings();
  document.getElementById('bizName').textContent = S.businessName;
  xptApplyI18n(S.language);

  const result = document.getElementById('checkResult');
  const drop = document.getElementById('drop');
  const file = document.getElementById('file');

  const handleFile = (f) => {
    if (!f || !f.type.startsWith('image/')) return;
    xptCheckImageUrl(URL.createObjectURL(f), result, S.language);
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

  const imgUrl = new URLSearchParams(location.search).get('img');
  if (imgUrl && /^https?:/i.test(imgUrl)) {
    xptCheckImageUrl(imgUrl, result, S.language);
  }
})();
