// ==UserScript==
// @name         BDC Appointment Helper for GHL
// @namespace    https://github.com/joseponce8/BDC-appt-helper-for-GHL/releases
// @version      0.1
// @description  Extract contact information from HighLevel with daily CSV files and directory persistence
// @author       Jose Ponce
// @match        https://app.gohighlevel.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=gohighlevel.com
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_download
// @grant        GM_addStyle
// @grant        GM_addValueChangeListener
// @run-at       context-menu
// ==/UserScript==

(function() {
    'use strict';

    const storageKey = 'contactHistory';
    const directoryStorageKey = 'selectedDirectory';
    const directoryNameKey = 'directoryName';
    let directoryHandle = null;

    GM_addStyle(`
        #hl-extractor-container {
            position: fixed;
            top: 100px;
            left: 900px;
            width: 600px;
            min-height: 600px;
            background: white;
            border: 1px solid #ccc;
            box-shadow: 0 0 10px rgba(0,0,0,0.2);
            z-index: 9999;
            font-family: Arial, sans-serif;
            resize: both;
            overflow: auto;
        }
        #hl-extractor-header {
            background: #2c3e50;
            color: white;
            padding: 8px;
            cursor: move;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        #hl-extractor-title {
            font-weight: bold;
        }
        #hl-extractor-controls button {
            background: none;
            border: none;
            color: white;
            cursor: pointer;
            margin-left: 5px;
        }
        #hl-extractor-content {
            padding: 15px;
        }
        .hl-section {
            margin-bottom: 15px;
        }
        .hl-section-title {
            font-weight: bold;
            margin-bottom: 5px;
        }
        .hl-radio-group, .hl-checkbox-group {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-bottom: 10px;
        }
        .hl-input-row {
            display: flex;
            gap: 15px;
            margin-bottom: 10px;
            align-items: flex-end;
        }
        .hl-input-group {
            flex: 1;
            min-width: 120px;
        }
        .hl-input-group label {
            display: block;
            margin-bottom: 3px;
            font-size: 0.9em;
        }
        .hl-input-group input[type="text"],
        .hl-input-group select,
        .hl-input-group textarea {
            width: 100%;
            padding: 5px;
            box-sizing: border-box;
        }
        #hl-preview {
            border: 1px solid #ddd;
            padding: 10px;
            margin-top: 15px;
            white-space: pre-wrap;
            background: #f9f9f9;
            min-height: 100px;
            max-height: 300px;
            overflow-y: auto;
        }
        #hl-action-buttons {
            display: flex;
            justify-content: space-between;
            margin-top: 15px;
        }
        #hl-action-buttons button {
            padding: 8px 15px;
            cursor: pointer;
        }
        #hl-save-btn {
            background: #27ae60;
            color: white;
            border: none;
        }
        #hl-close-btn {
            background: #e74c3c;
            color: white;
            border: none;
        }
        #hl-directory-status {
            margin: 10px 0;
            padding: 5px;
            background: #f0f0f0;
            border-radius: 3px;
            font-size: 0.9em;
        }
        #hl-choose-directory {
            background: #9b59b6;
            color: white;
            margin-left: 10px;
        }
    `);

    function extractContactInfo() {
        let contact = {};
        const nameElement1 = document.querySelector('h2.clamp-text.conversation-header-text');
        const emailElement1 = document.querySelector('span.truncate-text > span.truncate-text');
        const phoneElement1 = document.querySelectorAll('span.truncate-text > span.truncate-text')[1];

        if (nameElement1 || emailElement1 || phoneElement1) {
            contact.name = nameElement1?.textContent.trim() || '';
            contact.email = emailElement1?.textContent.trim() || '';
            contact.phone = phoneElement1?.textContent.trim() || '';
        } else {
            const firstName = document.querySelector('input[name="contact.first_name"]')?.value.trim() || '';
            const lastName = document.querySelector('input[name="contact.last_name"]')?.value.trim() || '';
            contact.name = [firstName, lastName].filter(Boolean).join(' ');
            contact.email = document.querySelector('input[name="contact.email"]')?.value.trim() || '';
            contact.phone = document.querySelector('input[name="contact.phone"]')?.value.trim() || '';
        }
        return contact;
    }

    function extractSource() {
        return document.querySelector('input[name="contact.source"]')?.value.trim() || '';
    }

    function extractVehicleInfo() {
        const year = document.querySelector('input[name="contact.year"]')?.value.trim() || '';
        const make = document.querySelector('input[name="contact.make"]')?.value.trim() || '';
        const model = document.querySelector('input[name="contact.model"]')?.value.trim() || '';
        const stock = document.querySelector('input[name="contact.stock"]')?.value.trim() || '';
        return [year, make, model, stock].filter(Boolean).join(' ') || 'Open to inventory';
    }

    function extractLocationInfo() {
        const city = document.querySelector('input[name="contact.city"]')?.value.trim() || '';
        const state = document.querySelector('input[name="contact.state"]')?.value.trim() || '';
        return [city, state].filter(Boolean).join(', ');
    }

    function createUI() {
        const container = document.createElement('div');
        container.id = 'hl-extractor-container';

        const header = document.createElement('div');
        header.id = 'hl-extractor-header';

        const title = document.createElement('div');
        title.id = 'hl-extractor-title';
        title.textContent = 'GoHighLevel APPT Helper';

        const controls = document.createElement('div');
        controls.id = 'hl-extractor-controls';

        const minimizeBtn = document.createElement('button');
        minimizeBtn.textContent = '_';
        minimizeBtn.title = 'Minimize';
        minimizeBtn.onclick = () => container.style.height = '40px';

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.title = 'Close';
        closeBtn.onclick = () => document.body.removeChild(container);

        const directoryStatus = document.createElement('div');
        directoryStatus.id = 'hl-directory-status';
        directoryStatus.textContent = 'No directory selected';

        controls.appendChild(minimizeBtn);
        controls.appendChild(closeBtn);
        header.appendChild(title);
        header.appendChild(controls);
        container.appendChild(header);
        container.appendChild(directoryStatus);

        const content = document.createElement('div');
        content.id = 'hl-extractor-content';

        const contact = extractContactInfo();
        const source = extractSource();
        const vehicle = extractVehicleInfo();
        const location = extractLocationInfo();

        const now = new Date();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const hours = now.getHours() % 12 || 12;
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const ampm = now.getHours() >= 12 ? 'PM' : 'AM';

        const typeSection = document.createElement('div');
        typeSection.className = 'hl-section';

        const typeTitle = document.createElement('div');
        typeTitle.className = 'hl-section-title';
        typeTitle.textContent = 'Update Type';

        const typeGroup = document.createElement('div');
        typeGroup.className = 'hl-radio-group';

        const types = ['NEW APPOINTMENT', 'RESCHEDULED', 'CREDIT APPLICATION', 'LEAD REQUEST'];
        types.forEach(type => {
            const label = document.createElement('label');
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'appointment-type';
            radio.value = type;
            if (type === 'NEW APPOINTMENT') radio.checked = true;
            label.appendChild(radio);
            label.appendChild(document.createTextNode(type));
            typeGroup.appendChild(label);
        });

        typeSection.appendChild(typeTitle);
        typeSection.appendChild(typeGroup);
        content.appendChild(typeSection);

        const contactRow = document.createElement('div');
        contactRow.className = 'hl-input-row';

        const nameGroup = document.createElement('div');
        nameGroup.className = 'hl-input-group';
        nameGroup.innerHTML = `<label>Name</label><input type="text" id="hl-name" value="${contact.name || ''}">`;

        const phoneGroup = document.createElement('div');
        phoneGroup.className = 'hl-input-group';
        phoneGroup.innerHTML = `<label>Phone Number</label><input type="text" id="hl-phone" value="${contact.phone || ''}">`;

        const emailGroup = document.createElement('div');
        emailGroup.className = 'hl-input-group';
        emailGroup.innerHTML = `<label>Email</label><input type="text" id="hl-email" value="${contact.email || ''}">`;

        contactRow.appendChild(nameGroup);
        contactRow.appendChild(phoneGroup);
        contactRow.appendChild(emailGroup);
        content.appendChild(contactRow);

        const infoRow1 = document.createElement('div');
        infoRow1.className = 'hl-input-row';

        const sourceGroup = document.createElement('div');
        sourceGroup.className = 'hl-input-group';
        sourceGroup.innerHTML = `<label>Source</label><input type="text" id="hl-source" value="${source || ''}">`;

        const locationGroup = document.createElement('div');
        locationGroup.className = 'hl-input-group';
        locationGroup.innerHTML = `<label>Lives in</label><input type="text" id="hl-location" value="${location || ''}">`;

        const vehicleGroup = document.createElement('div');
        vehicleGroup.className = 'hl-input-group';
        vehicleGroup.innerHTML = `<label>Looking for</label><textarea id="hl-vehicle" rows="1">${vehicle || 'Open to inventory'}</textarea>`;

        infoRow1.appendChild(sourceGroup);
        infoRow1.appendChild(locationGroup);
        infoRow1.appendChild(vehicleGroup);
        content.appendChild(infoRow1);

        const hasSection = document.createElement('div');
        hasSection.className = 'hl-section';

        const hasTitle = document.createElement('div');
        hasTitle.className = 'hl-section-title';
        hasTitle.textContent = 'Has:';

        const hasCheckboxGroup = document.createElement('div');
        hasCheckboxGroup.className = 'hl-checkbox-group';

        const hasOptions = ['Passport', 'License', 'SSN', 'ITIN/Tax ID', 'Bank Account', 'Paystubs'];
        hasOptions.forEach(option => {
            const label = document.createElement('label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = option;
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(option));
            hasCheckboxGroup.appendChild(label);
        });

        hasSection.appendChild(hasTitle);
        hasSection.appendChild(hasCheckboxGroup);
        content.appendChild(hasSection);

        const scheduleRow = document.createElement('div');
        scheduleRow.className = 'hl-input-row';

        const weekdayGroup = document.createElement('div');
        weekdayGroup.className = 'hl-input-group';
        weekdayGroup.innerHTML = `
            <label>Weekday</label>
            <select id="hl-weekday">
                <option value="today">today</option>
                <option value="Monday">Monday</option>
                <option value="Tuesday">Tuesday</option>
                <option value="Wednesday">Wednesday</option>
                <option value="Thursday">Thursday</option>
                <option value="Friday">Friday</option>
                <option value="Saturday">Saturday</option>
                <option value="Sunday">Sunday</option>
            </select>
        `;

        const dateGroup = document.createElement('div');
        dateGroup.className = 'hl-input-group';
        dateGroup.innerHTML = `<label>Date (MM/DD)</label><input type="text" id="hl-date" value="${month}/${day}">`;

        const timeGroup = document.createElement('div');
        timeGroup.className = 'hl-input-group';
        timeGroup.innerHTML = `<label>Time</label><input type="text" id="hl-time" value="${hours}:${minutes} ${ampm}">`;

        scheduleRow.appendChild(weekdayGroup);
        scheduleRow.appendChild(dateGroup);
        scheduleRow.appendChild(timeGroup);
        content.appendChild(scheduleRow);

        const previewSection = document.createElement('div');
        previewSection.className = 'hl-section';

        const previewTitle = document.createElement('div');
        previewTitle.className = 'hl-section-title';
        previewTitle.textContent = 'Preview';

        const previewBox = document.createElement('div');
        previewBox.id = 'hl-preview';

        previewSection.appendChild(previewTitle);
        previewSection.appendChild(previewBox);
        content.appendChild(previewSection);

        const actionButtons = document.createElement('div');
        actionButtons.id = 'hl-action-buttons';

        const saveBtn = document.createElement('button');
        saveBtn.id = 'hl-save-btn';
        saveBtn.textContent = 'Save & Copy';

        const chooseDirBtn = document.createElement('button');
        chooseDirBtn.id = 'hl-choose-directory';
        chooseDirBtn.textContent = 'Choose Directory';
        chooseDirBtn.onclick = async () => {
            try {
                directoryHandle = await window.showDirectoryPicker();
                GM_setValue(directoryStorageKey, true);
                const dirName = directoryHandle.name;
                GM_setValue(directoryNameKey, dirName);
                directoryStatus.textContent = `Saving to: ${dirName}`;
            } catch (error) {
                console.error('Directory selection error:', error);
            }
        };

        const closeBtn2 = document.createElement('button');
        closeBtn2.id = 'hl-close-btn';
        closeBtn2.textContent = 'Close';

        actionButtons.appendChild(saveBtn);
        actionButtons.appendChild(chooseDirBtn);
        actionButtons.appendChild(closeBtn2);
        content.appendChild(actionButtons);

        container.appendChild(content);
        document.body.appendChild(container);

        makeDraggable(container, header);

        const inputs = container.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
            input.addEventListener('input', updatePreview);
            input.addEventListener('change', updatePreview);
        });

        saveBtn.addEventListener('click', async () => {
            await saveAndCopy();
        });
        closeBtn2.addEventListener('click', () => document.body.removeChild(container));

        updatePreview();
        initDirectoryStatus(directoryStatus);

        // Prompt for directory selection on startup if none exists
        setTimeout(() => {
            if (!GM_getValue(directoryStorageKey, false)) {
                const confirmDir = confirm('Would you like to select a directory to save contact files?');
                if (confirmDir) {
                    chooseDirBtn.click();
                }
            }
        }, 500);
    }

    function initDirectoryStatus(element) {
        const hasDirectory = GM_getValue(directoryStorageKey, false);
        const dirName = GM_getValue(directoryNameKey, '');

        if (hasDirectory && dirName) {
            element.textContent = `Saving to: ${dirName}`;
        } else {
            element.textContent = 'No directory selected';
        }
    }

    function updatePreview() {
        const container = document.getElementById('hl-extractor-container');
        if (!container) return;

        const type = container.querySelector('input[name="appointment-type"]:checked')?.value || 'NEW APPOINTMENT';
        const name = container.querySelector('#hl-name').value.trim();
        const phone = container.querySelector('#hl-phone').value.trim();
        const email = container.querySelector('#hl-email').value.trim();
        const source = container.querySelector('#hl-source').value.trim();
        const hasCheckboxes = container.querySelectorAll('#hl-extractor-container input[type="checkbox"]:checked');
        const has = Array.from(hasCheckboxes).map(cb => cb.value).join(', ');
        const location = container.querySelector('#hl-location').value.trim();
        const vehicle = container.querySelector('#hl-vehicle').value.trim();
        const weekday = container.querySelector('#hl-weekday').value;
        const date = container.querySelector('#hl-date').value.trim();
        const time = container.querySelector('#hl-time').value.trim();

        let previewText = `*${type}*\n\n`;
        if (name) previewText += `${name}\n`;
        if (phone) previewText += `${phone}\n`;
        if (email) previewText += `${email}\n`;
        if (source) previewText += `Source: ${source}\n`;
        if (has) previewText += `Has: ${has}\n`;
        if (location) previewText += `Lives in: ${location}📍\n`;
        if (vehicle) previewText += `Looking for: ${vehicle}\n\n`;
        previewText += `*Booked for ${weekday} ${date} at ${time}*📌`;

        document.getElementById('hl-preview').textContent = previewText;
    }

    async function saveAndCopy() {
        const formData = collectFormData();

        //if (!validateForm(formData)) {
            //alert('Please complete required fields: Name, Phone, and Appointment Type');
            //return;
        //}

        const history = GM_getValue(storageKey, []);
        history.push({
            timestamp: new Date().toISOString(),
            ...formData
        });
        GM_setValue(storageKey, history);

        const today = new Date().toISOString().slice(0, 10);
        const fileName = `HighLevel_Contacts_${today}.csv`;
        const csvContent = generateCSV();

        try {
            await navigator.clipboard.writeText(document.getElementById('hl-preview').textContent);

            if (directoryHandle) {
                await saveToDirectory(fileName, csvContent);
            } else if (GM_getValue(directoryStorageKey, false)) {
                GM_download({
                    filename: fileName,
                    data: csvContent,
                    mimetype: 'text/csv'
                });
            } else {
                const chooseDir = confirm('No save directory selected. Would you like to choose one now?');
                if (chooseDir) {
                    document.getElementById('hl-choose-directory').click();
                    return;
                }
                GM_download({
                    filename: fileName,
                    data: csvContent,
                    mimetype: 'text/csv'
                });
            }

            alert('Data copied to clipboard and saved successfully!');
        } catch (error) {
            console.error('Error:', error);
            alert(`Operation failed: ${error.message}`);
        }
    }

    function collectFormData() {
        const container = document.getElementById('hl-extractor-container');
        return {
            type: container.querySelector('input[name="appointment-type"]:checked')?.value,
            name: container.querySelector('#hl-name').value.trim(),
            phone: container.querySelector('#hl-phone').value.trim(),
            date: container.querySelector('#hl-date').value.trim(),
            weekday: container.querySelector('#hl-weekday').value,
            time: container.querySelector('#hl-time').value.trim(),
            lookingFor: container.querySelector('#hl-vehicle').value.trim(),
            email: container.querySelector('#hl-email').value.trim(),
            source: container.querySelector('#hl-source').value.trim(),
            location: container.querySelector('#hl-location').value.trim()
        };
    }

    function generateCSV() {
        const history = GM_getValue(storageKey, []);
        const headers = ['Timestamp', 'Type', 'Name', 'Phone', 'Date', 'Weekday', 'Time',
                       'Looking For', 'Email', 'Source', 'Location'];

        const escapeCSV = str => `"${String(str).replace(/"/g, '""')}"`;

        const rows = history.map(entry => [
            escapeCSV(entry.timestamp || new Date().toISOString()),
            escapeCSV(entry.type),
            escapeCSV(entry.name),
            escapeCSV(entry.phone),
            escapeCSV(entry.date),
            escapeCSV(entry.weekday),
            escapeCSV(entry.time),
            escapeCSV(entry.lookingFor),
            escapeCSV(entry.email),
            escapeCSV(entry.source),
            escapeCSV(entry.location)
        ].join(','));

        return [headers.join(','), ...rows].join('\n');
    }

    function validateForm(data) {
        //return data.name && data.phone && data.type;
    }

    async function saveToDirectory(fileName, content) {
        try {
            const newFileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
            const writable = await newFileHandle.createWritable();
            await writable.write(content);
            await writable.close();
            return true;
        } catch (error) {
            console.error('Error saving to directory:', error);
            throw error;
        }
    }

    function makeDraggable(element, handle) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        handle.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e = e || window.event;
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }

    createUI();
})();
