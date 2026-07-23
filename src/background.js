// Service worker: adds a right-click "Check print quality" item on images.

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'xpt-check-image',
    title: 'Check print quality',
    contexts: ['image']
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'xpt-check-image' && info.srcUrl) {
    chrome.tabs.create({
      url: chrome.runtime.getURL('checker.html') + '?img=' + encodeURIComponent(info.srcUrl)
    });
  }
});
