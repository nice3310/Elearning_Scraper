document.getElementById('start-button').addEventListener('click', () => {
  logMessage("Start button clicked");
  startCrawling();
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      logMessage("Executing content script on tab:", tabs[0]);
      chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          files: ['content/content_script.js']
      }, () => {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'startScraping' });
      });
  });
});

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'logMessage') {
      displayLogMessage(request.message);
  }
});

function logMessage(message) {
  chrome.runtime.sendMessage({ action: 'logMessage', message: message });
}

const displayedMessages = new Set();

function displayLogMessage(message) {
  let logArea = document.getElementById('log-area');
  let logEntry = document.createElement('div');
  
  // 清除冗長訊息，僅顯示主要內容
  let cleanedMessage = cleanLogMessage(message);
  
  // 避免重複顯示訊息
  if (!displayedMessages.has(cleanedMessage)) {
      logEntry.textContent = cleanedMessage;
      logArea.appendChild(logEntry);
      scrollToBottom(logArea);
      displayedMessages.add(cleanedMessage);
  }
  
  if (cleanedMessage.includes("Scraping completed successfully")) {
      stopCrawling();
  }
}

function cleanLogMessage(message) {

  if (message.startsWith('Received message: ')) {
    let parsedMessage = JSON.parse(message.replace('Received message: ', ''));
    return parsedMessage.message;
  }
  return message;
}

function scrollToBottom(element) {
  element.scrollTop = element.scrollHeight;
}

function startCrawling() {
  let crawler = document.getElementById('crawler');
  crawler.style.animationPlayState = 'running';
}

function stopCrawling() {
  let crawler = document.getElementById('crawler');
  crawler.style.animationPlayState = 'paused';
}
