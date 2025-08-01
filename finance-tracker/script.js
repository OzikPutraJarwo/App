// ------ GLOBAL ------

let fileId = null;
let data = {};
let tags = {};
let filter = { date: '', tag: '' };

let cloudSuccess = document.querySelector('.cloud-success');
let cloudSync = document.querySelector('.cloud-sync');
let cloudFailed = document.querySelector('.cloud-failed');

let announcement = document.querySelector('.announcement');

// ------ UTILITIES ------

function formatNumber(num) {
  return Number(num).toLocaleString();
}

function formatMonth(month) {
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  if (month < 1 || month > 12) {
    return "Invalid month";
  }
  return monthNames[month - 1];
}

function getTagColor(tag) {
  return tags[tag] ? tags[tag].color : '#000';
}

function smoothToggleNext(trigger) {
  const el = trigger.nextElementSibling;
  if (!el) return;
  const isCollapsed = el.getAttribute('data-collapsed') === 'true';
  if (isCollapsed) {
    el.style.height = el.scrollHeight + 'px';
    el.setAttribute('data-collapsed', 'false');
    const removeHeight = () => {
      el.style.height = '';
      el.removeEventListener('transitionend', removeHeight);
    };
    el.addEventListener('transitionend', removeHeight);
  } else {
    el.style.height = el.scrollHeight + 'px';
    requestAnimationFrame(() => {
      el.style.height = '0';
    });
    el.setAttribute('data-collapsed', 'true');
  }
}

// ------ GOOGLE API ------

function appOnLogin() {
  ['add-item-btn', 'save-data-btn', 'tag-editor-btn'].forEach(id => document.getElementById(id).style.display = '');
  announcement.classList.add('none');
  loadDataFromDrive();
}

function appOnLogout() {
  ['add-item-btn', 'save-data-btn', 'tag-editor-btn'].forEach(id => document.getElementById(id).style.display = 'none');
  document.getElementById('data-container').innerHTML = '';
  data = {};
  tags = {};
  fileId = null;
  announcement.classList.remove('none');
}

loginCallbacks.push(appOnLogin);
logoutCallbacks.push(appOnLogout);

// ------ DATA --------

function addItem(item) {
  const date = new Date(item.date);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  if (!data[year]) data[year] = {};
  if (!data[year][month]) data[year][month] = {};
  if (!data[year][month][day]) data[year][month][day] = [];
  data[year][month][day].push(item);
}

function deleteItem(path, index) {
  const [year, month, day] = path.split('/');
  data[year][month][day].splice(index, 1);
  if (data[year][month][day].length === 0) delete data[year][month][day];
  if (Object.keys(data[year][month]).length === 0) delete data[year][month];
  if (Object.keys(data[year]).length === 0) delete data[year];
}

// ------ RENDER --------

function renderData() {
  const container = document.getElementById('data-container');
  container.innerHTML = '';
  let totalIncome = 0;
  let totalExpense = 0;
  const tagTotals = {};

  for (const year in data) {
    const yearDiv = document.createElement('div');
    yearDiv.className = 'year';
    yearDiv.innerHTML = `<div class="title">${year}</div>`;
    let yearIncome = 0, yearExpense = 0;

    for (const month in data[year]) {
      const monthDiv = document.createElement('div');
      monthDiv.className = 'month';
      monthDiv.innerHTML = `<div class="title" onclick="smoothToggleNext(this)">${formatMonth(month)}</div>`;
      let monthIncome = 0, monthExpense = 0;
      const monthContainer = document.createElement('div');
      monthContainer.className = 'month-container';
      monthDiv.appendChild(monthContainer);

      for (const day in data[year][month]) {
        const dayDiv = document.createElement('table');
        dayDiv.className = 'day';
        // dayDiv.innerHTML = `<div class="title">${day}</div>`;
        let dayIncome = 0, dayExpense = 0;
        dayDiv.innerHTML += `
          <thead>
            <tr>
              <th>Date</th>
              <th>Name</th>
              <th>Category</th>
              <th>Type</th>
              <th>Amount</th>
            </tr>
          </thead>`;
        const ul = document.createElement('tbody');

        data[year][month][day].forEach((item, idx) => {
          if ((filter.date && item.date !== filter.date) || (filter.tag && item.tag !== filter.tag)) return;

          const li = document.createElement('tr');
          li.setAttribute('onclick', `editItem('${year}/${month}/${day}', ${idx})`);
          li.innerHTML = `
            <td class="date">${item.date.split('-')[2]}</td>
            <td class="name">${item.title}</td>
            <td class="category"><span style="background:${getTagColor(item.tag)}">${item.tag}</span></td>
            <td class="type">${item.type}</td>
            <td class="amount">${formatNumber(item.amount)}</td>
            <td class="actions" onclick="event.stopPropagation();">
              <div onclick="deleteItemConfirm('${year}/${month}/${day}', ${idx})"><img src="../icon/trash.png"></div>
            </td>
          `;
          ul.appendChild(li);

          if (item.type === 'income') dayIncome += Number(item.amount);
          else dayExpense += Number(item.amount);

          tagTotals[item.tag] = (tagTotals[item.tag] || 0) + Number(item.amount);
        });

        if (ul.children.length > 0) {
          dayDiv.appendChild(ul);
          const dayBalance = dayIncome - dayExpense;
          // dayDiv.innerHTML += `<strong>Day Total - Income: ${formatNumber(dayIncome)}, Expense: ${formatNumber(dayExpense)}, Balance: ${formatNumber(dayBalance)}</strong>`;
          monthIncome += dayIncome;
          monthExpense += dayExpense;
          monthContainer.appendChild(dayDiv);
        }
      }

      const monthBalance = monthIncome - monthExpense;
      if (monthIncome > 0 || monthExpense > 0) {
        monthDiv.innerHTML += `
          <div class="total">
            <span class="date">Total in ${formatMonth(month)}</span>
            <span class="income"><span class='title'>Income</span><span class='amount'>${formatNumber(monthIncome)}</span></span>
            <span class="expense"><span class='title'>Expense</span><span class='amount'>${formatNumber(monthExpense)}</span></span>
            <span class="balance"><span class='title'>Balance</span><span class='amount'>${formatNumber(monthBalance)}</span></span>
          </div>
        `;
        yearIncome += monthIncome;
        yearExpense += monthExpense;
        yearDiv.appendChild(monthDiv);
      }
    }

    const yearBalance = yearIncome - yearExpense;
    if (yearIncome > 0 || yearExpense > 0) {
      yearDiv.innerHTML += `
          <div class="total">
            <span class="date">Total in ${year}</span>
            <span class="income"><span class='title'>Income</span><span class='amount'>${formatNumber(yearIncome)}</span></span>
            <span class="expense"><span class='title'>Expense</span><span class='amount'>${formatNumber(yearExpense)}</span></span>
            <span class="balance"><span class='title'>Balance</span><span class='amount'>${formatNumber(yearBalance)}</span></span>
          </div>
        `;
      totalIncome += yearIncome;
      totalExpense += yearExpense;
      container.appendChild(yearDiv);
    }
  }

  const totalBalance = totalIncome - totalExpense;
  container.innerHTML += `
          <div class="total">
            <span class="date">Overall Total</span>
            <span class="income"><span class='title'>Income</span><span class='amount'>${formatNumber(totalIncome)}</span></span>
            <span class="expense"><span class='title'>Expense</span><span class='amount'>${formatNumber(totalExpense)}</span></span>
            <span class="balance"><span class='title'>Balance</span><span class='amount'>${formatNumber(totalBalance)}</span></span>
          </div>
        `;

}

// ------ MODAL --------

function openItemModal(edit = false) {
  if (!edit) {
    ['item-date', 'item-type', 'item-title', 'item-amount'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('edit-item-index').value = '';
    document.getElementById('edit-item-path').value = '';
  }
  updateTagDropdown();
  document.getElementById('item-modal').style.display = 'block';
}

function closeItemModal() { document.getElementById('item-modal').style.display = 'none'; }

function editItem(path, index) {
  const [year, month, day] = path.split('/');
  const item = data[year][month][day][index];
  document.getElementById('item-date').value = item.date;
  document.getElementById('item-type').value = item.type;
  document.getElementById('item-title').value = item.title;
  document.getElementById('item-amount').value = item.amount;
  document.getElementById('edit-item-path').value = path;
  document.getElementById('edit-item-index').value = index;
  updateTagDropdown();
  document.getElementById('item-tag').value = item.tag;
  openItemModal(true);
}

function saveItem() {
  const item = {
    date: document.getElementById('item-date').value,
    type: document.getElementById('item-type').value,
    title: document.getElementById('item-title').value,
    amount: document.getElementById('item-amount').value,
    tag: document.getElementById('item-tag').value
  };
  if (!item.date || !item.amount || !item.title || !item.tag) {
    showNotification('Please fill all fields', 'error');
    return;
  }

  const editIndex = document.getElementById('edit-item-index').value;
  const editPath = document.getElementById('edit-item-path').value;

  if (editIndex && editPath) {
    deleteItem(editPath, editIndex);
  }
  addItem(item);
  renderData();
  closeItemModal();
  saveDataToDrive(); // <<< AUTO SAVE
}

function deleteItemConfirm(path, index) {
  if (confirm('Are you sure to delete this item?')) {
    deleteItem(path, index);
    renderData();
    showNotification('Item deleted', 'success');
    saveDataToDrive(); // <<< AUTO SAVE
  }
}


// ------ TAG --------

function openTagModal() { document.getElementById('tag-modal').style.display = 'block'; }
function closeTagModal() { document.getElementById('tag-modal').style.display = 'none'; }

function saveTag() {
  const name = document.getElementById('tag-name').value;
  const color = document.getElementById('tag-color').value;
  if (!name) {
    showNotification('Tag name required!', 'error');
    return;
  }
  tags[name] = { color };
  updateTagDropdown();
  closeTagModal();
  showNotification('Tag added', 'success');
  saveDataToDrive(); // <<< AUTO SAVE
}

function updateTagDropdown() {
  const tagSelect = document.getElementById('item-tag');
  tagSelect.innerHTML = '';
  for (const name in tags) {
    const option = document.createElement('option');
    option.value = name;
    option.text = name;
    option.setAttribute('style', `background-color: ${tags[name].color}`);
    tagSelect.appendChild(option);
  }
}

// ------ DRIVE ------

async function loadDataFromDrive() {
  showNotification('Loading...');
  cloudSync.classList.remove('none');
  cloudSuccess.classList.add('none');
  cloudFailed.classList.add('none');
  try {
    const res = await gapi.client.drive.files.list({
      q: "name='fintrack-kodejarwo' and trashed=false",
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    if (res.result.files && res.result.files.length > 0) {
      fileId = res.result.files[0].id;
      const file = await gapi.client.drive.files.get({
        fileId: fileId,
        alt: 'media'
      });
      const json = file.result;
      data = json.data || {};
      tags = json.tags || {};
      updateTagDropdown();
      renderData();
    } else {
      fileId = null;
    }
    showNotification('Data loaded', 'success');
    cloudSync.classList.add('none');
    cloudSuccess.classList.remove('none');
    cloudFailed.classList.add('none');
  } catch (e) {
    console.log(e);
    showNotification('Failed to load', 'error');
    cloudSync.classList.add('none');
    cloudSuccess.classList.add('none');
    cloudFailed.classList.remove('none');
  }
}

// ------ SAVE AUTOMATIC WITH STATUS ------

async function saveDataToDrive() {
  cloudSync.classList.remove('none');
  cloudSuccess.classList.add('none');
  cloudFailed.classList.add('none');
  try {
    const fileContent = JSON.stringify({ data, tags });
    const file = new Blob([fileContent], { type: 'application/json' });
    const metadata = {
      name: 'fintrack-kodejarwo',
      mimeType: 'application/json'
    };

    const accessToken = gapi.auth.getToken().access_token;
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    const res = await fetch(fileId ?
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id` :
      `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id`, {
      method: fileId ? 'PATCH' : 'POST',
      headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
      body: form
    });

    if (!res.ok) throw new Error('Save failed');

    const result = await res.json();
    fileId = result.id;
    cloudSync.classList.add('none');
    cloudSuccess.classList.remove('none');
    cloudFailed.classList.add('none');
  } catch (e) {
    console.error(e);
    cloudSync.classList.add('none');
    cloudSuccess.classList.add('none');
    cloudFailed.classList.remove('none');
  }
}

// ------ TAG EDITOR ------

function openTagEditor() {
  const container = document.getElementById('tag-list');
  container.innerHTML = '';
  for (const tag in tags) {
    const div = document.createElement('div');
    div.innerHTML = `
      <input type="text" value="${tag}" id="edit-tag-${tag}">
      <input type="color" value="${tags[tag].color}" id="edit-color-${tag}">
      <div class="modal-actions">
        <button onclick="renameTag('${tag}')" class="ok">Update</button>
        <button onclick="deleteTag('${tag}')" class="cancel">Delete</button>
      </div>
    `;
    container.appendChild(div);
  }
  document.getElementById('tag-editor-modal').style.display = 'block';
}

function closeTagEditor() {
  document.getElementById('tag-editor-modal').style.display = 'none';
}

function renameTag(oldName) {
  const newName = document.getElementById(`edit-tag-${oldName}`).value.trim();
  const newColor = document.getElementById(`edit-color-${oldName}`).value;
  if (!newName) {
    showNotification('Tag name cannot be empty!', 'error');
    return;
  }
  if (newName !== oldName) {
    if (tags[newName]) {
      showNotification('Tag name already exists!', 'error');
      return;
    }
    tags[newName] = { color: newColor };
    delete tags[oldName];

    // Update all items using the old tag
    for (const year in data) {
      for (const month in data[year]) {
        for (const day in data[year][month]) {
          data[year][month][day].forEach(item => {
            if (item.tag === oldName) item.tag = newName;
          });
        }
      }
    }
  } else {
    tags[newName].color = newColor;
  }
  updateTagDropdown();
  renderData();
  saveDataToDrive();
  openTagEditor();
  showNotification('Tag updated', 'success');
}

function deleteTag(name) {
  if (!confirm(`Delete tag "${name}"? Items with this tag will NOT be deleted but their tag will be blank.`)) return;
  delete tags[name];

  // Remove tag from items
  for (const year in data) {
    for (const month in data[year]) {
      for (const day in data[year][month]) {
        data[year][month][day].forEach(item => {
          if (item.tag === name) item.tag = '';
        });
      }
    }
  }
  updateTagDropdown();
  renderData();
  saveDataToDrive();
  openTagEditor();
  showNotification('Tag deleted', 'success');
}

// ------ EVENTS ------


document.getElementById('add-item-btn').onclick = () => openItemModal();
document.getElementById('save-data-btn').onclick = saveDataToDrive;
document.getElementById('save-item-btn').onclick = saveItem;
document.getElementById('tag-editor-btn').onclick = openTagEditor;

// ------ INIT ------

