logMessage("Content script loaded");

let mimeDb = null;
let mimeDbPromise = loadMimeDb();

function loadMimeDb() {
    return fetch(chrome.runtime.getURL('mime-db.json'))
        .then(response => response.json())
        .then(data => {
            mimeDb = data;
            logMessage("Successfully loaded mime-db.json");
        })
        .catch(error => logMessage('Error loading mime-db.json:', error));
}

function getFileExtensionFromContentType(contentType) {
    if (mimeDb && mimeDb[contentType] && mimeDb[contentType].extensions && mimeDb[contentType].extensions.length > 0) {
        return `.${mimeDb[contentType].extensions[0]}`;
    }
    return '';
}

mimeDbPromise.then(() => {
    chrome.runtime.sendMessage({ action: 'getCookies' }, (response) => {
        logMessage("Response from background script:", response);
        if (response && response.cookies) {
            let cookies = response.cookies;
            if (cookies) {
                logMessage("Cookies received:", cookies);
                fetchCourseList(cookies);
            } else {
                logMessage("No cookies received");
            }
        } else {
            logMessage("No response received");
        }
    });
});

function fetchCourseList(cookies) {
    const indexLink = 'https://lms3.ntpu.edu.tw';
    logMessage("Fetching course list from:", indexLink);
    fetch(indexLink, {
        method: 'GET',
        headers: {
            'Cookie': cookies
        }
    })
    .then(response => {
        logMessage("Course list response status:", response.status);
        return response.text();
    })
    .then(data => {
        logMessage("Course list data fetched");
        let parser = new DOMParser();
        let doc = parser.parseFromString(data, 'text/html');
        let courseList = doc.querySelector('#dropdownmain-navigation0');
        let courses = [];
        if (courseList) {
            courseList.querySelectorAll('li a').forEach((link) => {
                courses.push({
                    name: link.title,
                    url: link.href
                });
            });
            logMessage('Courses:', courses);
            let zip = new JSZip();
            let coursePromises = courses.map(course => fetchCourseContent(course.url, cookies, course.name, zip));
            Promise.all(coursePromises).then(() => {
                zip.generateAsync({ type: 'blob' }).then(content => {
                    saveAs(content, 'courses.zip');
                });
                logMessage("Finish :D ");
            });
        } else {
            logMessage('Failed to fetch course list');
        }
    })
    .catch(error => logMessage('Error fetching course list:', error));
}

function fetchCourseContent(url, cookies, courseName, zip) {
    logMessage("Fetching course content from:", url);
    return fetch(url, {
        method: 'GET',
        headers: {
            'Cookie': cookies
        }
    })
    .then(response => {
        logMessage("Course content response status:", response.status);
        return response.text();
    })
    .then(data => {
        logMessage("Course content data fetched");
        let parser = new DOMParser();
        let doc = parser.parseFromString(data, 'text/html');
        let contentDivs = doc.querySelectorAll('div.content');
        let sectionNames = findSectionsName(contentDivs);
        logMessage("Section names found:", sectionNames);
        let sectionPromises = [];
        contentDivs.forEach((contentDiv, index) => {
            let sectionName = sectionNames[index] || `Section_${index + 1}`;
            logMessage(`Handling resources for section: ${sectionName}`);
            sectionPromises.push(handleResources(contentDiv, cookies, `${cleanFolderName(courseName)}/${cleanFolderName(sectionName)}`, zip));
        });
        return Promise.all(sectionPromises);
    })
    .catch(error => logMessage('Error fetching course content:', error));
}

function findSectionsName(contentDivs) {
    let sectionNames = [];
    contentDivs.forEach(contentDiv => {
        let sectionElement = contentDiv.querySelector('.sectionname a');
        if (sectionElement) {
            sectionNames.push(sectionElement.innerText.trim());
        }
    });
    return sectionNames;
}

function handleResources(contentDiv, cookies, sectionName, zip) {
    logMessage(`Handling resources in section: ${sectionName}`);
    return Promise.all([
        handleActivityResource(contentDiv, cookies, sectionName, zip),
        handleActivityAssign(contentDiv, cookies, sectionName, zip),
        handleActivityUrl(contentDiv, cookies, sectionName, zip),
        handleActivityFolder(contentDiv, cookies, sectionName, zip)
    ]);
}

function handleActivityResource(contentDiv, cookies, sectionName, zip) {
    logMessage(`Handling resource activities in section: ${sectionName}`);
    let resources = contentDiv.querySelectorAll('li.activity.resource.modtype_resource');
    let resourcePromises = [];
    resources.forEach(resource => {
        let aTag = resource.querySelector('a');
        if (aTag) {
            let link = aTag.href;
            let name = aTag.querySelector('span.instancename').innerText.trim();
            logMessage(`Downloading file: ${name} from ${link}`);
            resourcePromises.push(downloadFile(link, cookies, sectionName, name, zip));
        }
    });
    return Promise.all(resourcePromises);
}

function handleActivityAssign(contentDiv, cookies, sectionName, zip) {
    logMessage(`Handling assignment activities in section: ${sectionName}`);
    let assigns = contentDiv.querySelectorAll('li.activity.assign.modtype_assign');
    let assignPromises = [];
    assigns.forEach(assign => {
        let aTag = assign.querySelector('a');
        if (aTag) {
            let link = aTag.href;
            let name = aTag.querySelector('span.instancename').innerText.trim();
            let assignFolderName = `${sectionName}/${cleanFolderName(name)}`;
            logMessage(`Fetching assignment: ${name} from ${link}`);
            assignPromises.push(fetch(link, {
                method: 'GET',
                headers: {
                    'Cookie': cookies
                }
            })
            .then(response => {
                logMessage("Assignment response status:", response.status);
                return response.text();
            })
            .then(data => {
                logMessage("Assignment data fetched");
                let parser = new DOMParser();
                let doc = parser.parseFromString(data, 'text/html');
                let noOverflowDivs = doc.querySelectorAll('.no-overflow');
                noOverflowDivs.forEach(div => {
                    let text = decodeHtmlToText(div.innerHTML);
                    logMessage(`Saving assignment text to file: ${name}.txt`);
                    zip.file(`${assignFolderName}/${name}.txt`, text);
                });

                let filesDivs = doc.querySelectorAll('.fileuploadsubmission a[href*="forcedownload=1"]');
                let filePromises = [];
                filesDivs.forEach(fileLink => {
                    let fileUrl = fileLink.href;
                    let fileName = fileLink.innerText.trim();
                    logMessage(`Downloading assignment file: ${fileName} from ${fileUrl}`);
                    filePromises.push(downloadFileForce(fileUrl, cookies, assignFolderName, fileName, zip));
                });
                return Promise.all(filePromises);
            })
            .catch(error => logMessage('Error fetching assignment:', error)));
        }
    });
    return Promise.all(assignPromises);
}

function handleActivityUrl(contentDiv, cookies, sectionName, zip) {
    logMessage(`Handling URL activities in section: ${sectionName}`);
    let urls = contentDiv.querySelectorAll('li.activity.url.modtype_url');
    let urlPromises = [];
    urls.forEach(url => {
        let aTag = url.querySelector('a');
        if (aTag) {
            let link = aTag.href;
            logMessage(`Fetching URL: ${link}`);
            urlPromises.push(fetch(link, {
                method: 'GET',
                headers: {
                    'Cookie': cookies
                }
            })
            .then(response => {
                logMessage("URL response status:", response.status);
                return response.text();
            })
            .then(data => {
                logMessage("URL data fetched");
                let parser = new DOMParser();
                let doc = parser.parseFromString(data, 'text/html');
                let realLink = doc.querySelector('a[onclick][href]').href;
                let name = aTag.querySelector('span.instancename').innerText.trim();
                logMessage(`Saving URL to file: ${name}.txt`);
                zip.file(`${sectionName}/${name}.txt`, realLink);
            })
            .catch(error => logMessage('Error fetching URL:', error)));
        }
    });
    return Promise.all(urlPromises);
}

function handleActivityFolder(contentDiv, cookies, sectionName, zip) {
    logMessage(`Handling folder activities in section: ${sectionName}`);
    let folders = contentDiv.querySelectorAll('li.activity.folder.modtype_folder');
    let folderPromises = [];
    folders.forEach(folder => {
        let aTag = folder.querySelector('a');
        if (aTag) {
            let link = aTag.href;
            let folderName = `${sectionName}/${cleanFolderName(aTag.querySelector('span.instancename').innerText.trim())}`;
            logMessage(`Fetching folder: ${link}`);
            folderPromises.push(fetch(link, {
                method: 'GET',
                headers: {
                    'Cookie': cookies
                }
            })
            .then(response => {
                logMessage("Folder response status:", response.status);
                return response.text();
            })
            .then(data => {
                logMessage("Folder data fetched");
                let parser = new DOMParser();
                let doc = parser.parseFromString(data, 'text/html');
                let form = doc.querySelector('form[action*="download_folder.php"]');
                if (form) {
                    let formData = new FormData();
                    form.querySelectorAll('input[type="hidden"]').forEach(input => {
                        formData.append(input.name, input.value);
                    });
                    logMessage(`Submitting folder download form: ${form.action}`);
                    return fetch(form.action, {
                        method: 'POST',
                        body: formData,
                        headers: {
                            'Cookie': cookies
                        }
                    })
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`Error downloading folder: ${response.statusText}`);
                        }
                        return response.blob().then(blob => {
                            return extractFilesFromZip(blob, folderName, zip);
                        });
                    })
                    .catch(error => logMessage('Error downloading folder content:', error));
                }
            })
            .catch(error => logMessage('Error fetching folder:', error)));
        }
    });
    return Promise.all(folderPromises);
}

function extractFilesFromZip(blob, folderName, zip) {
    return JSZip.loadAsync(blob).then(zipContent => {
        let filePromises = [];
        zipContent.forEach((relativePath, file) => {
            filePromises.push(file.async("blob").then(content => {
                zip.file(`${folderName}/${relativePath}`, content);
            }));
        });
        return Promise.all(filePromises);
    });
}

function downloadFile(url, cookies, folderName, fileName, zip) {
    logMessage(`Downloading file from: ${url}`);
    return fetch(url, {
        method: 'GET',
        headers: {
            'Cookie': cookies
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Error fetching file: ${response.statusText}`);
        }
        const contentType = response.headers.get('Content-Type');
        const fileExtension = getFileExtensionFromContentType(contentType);
        return response.blob().then(blob => ({ blob, fileExtension }));
    })
    .then(({ blob, fileExtension }) => {
        const filePath = `${folderName}/${cleanFolderName(fileName)}${fileExtension}`;
        logMessage(`Saving file to: ${filePath}`);
        zip.file(filePath, blob);
    })
    .catch(error => logMessage('Error downloading file:', error));
}

function downloadFileForce(url, cookies, folderName, fileName, zip) {
    logMessage(`Force downloading file from: ${url}`);
    return fetch(url, {
        method: 'GET',
        headers: {
            'Cookie': cookies
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Error fetching file: ${response.statusText}`);
        }
        const contentType = response.headers.get('Content-Type');
        const fileExtension = getFileExtensionFromContentType(contentType);
        return response.blob().then(blob => ({ blob, fileExtension }));
    })
    .then(({ blob, fileExtension }) => {
        const filePath = `${folderName}/${cleanFolderName(fileName)}${fileExtension}`;
        logMessage(`Saving file to: ${filePath}`);
        zip.file(filePath, blob);
    })
    .catch(error => logMessage('Error force downloading file:', error));
}

function cleanFolderName(folderName) {
    return folderName.replace(/[\\/*?:"<>|]/g, '_');
}

function decodeHtmlToText(html) {
    let doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.textContent || '';
}

function logMessage(...args) {
    let message = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : arg)).join(' ');
    chrome.runtime.sendMessage({ action: 'logMessage', message: message });
}
