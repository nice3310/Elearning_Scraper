document.getElementById('start-button').addEventListener('click', () => {
  logMessage("Start button clicked");
  startCrawling();
  setScrapingState(true);
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
  console.log("Sent log message:", message);
}

const displayedMessages = new Set();

function displayLogMessage(message) {
  let logArea = document.getElementById('log-area');
  let logEntry = document.createElement('div');
  

  let cleanedMessage = cleanLogMessage(message);
  console.log("Cleaned log message:", cleanedMessage);
  

  if (!displayedMessages.has(cleanedMessage)) {
      logEntry.textContent = cleanedMessage;
      logArea.appendChild(logEntry);
      scrollToBottom(logArea);
      displayedMessages.add(cleanedMessage);
  }
  
  if (cleanedMessage.includes("Scraping completed successfully")) {
      console.log("Scraping completed detected.");
      stopCrawling();
      setScrapingState(false);
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
  console.log("Crawler animation started.");
}

function stopCrawling() {
  let crawler = document.getElementById('crawler');
  crawler.style.animationPlayState = 'paused';
  console.log("Crawler animation stopped.");
}

function setScrapingState(isScraping) {
  let button = document.getElementById('start-button');
  if (isScraping) {
    button.textContent = "Scraping";
    button.classList.add('scraping');
    button.disabled = true;
    console.log("Button set to Scraping and disabled.");
  } else {
    button.textContent = "Start Scraping";
    button.classList.remove('scraping');
    button.disabled = false;
    console.log("Button set to Start Scraping and enabled.");
  }
}
