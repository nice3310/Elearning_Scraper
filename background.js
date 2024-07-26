chrome.runtime.onInstalled.addListener(() => {
  sendLogMessage("Extension Installed");
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  sendLogMessage("Received message:", request);
  if (request.action === 'getCookies') {
      chrome.cookies.getAll({ domain: 'lms3.ntpu.edu.tw' }, (cookies) => {
          sendLogMessage("Cookies fetched:", cookies);
          if (cookies.length > 0) {
              let cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
              sendLogMessage("Cookie string:", cookieString);
              sendResponse({ cookies: cookieString });
          } else {
              sendLogMessage("No cookies found");
              sendResponse({ cookies: '' });
          }
      });
      return true; // Will respond asynchronously.
  }
});

function sendLogMessage(...args) {
  let message = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : arg)).join(' ');
  chrome.runtime.sendMessage({ action: 'logMessage', message: message });
}
