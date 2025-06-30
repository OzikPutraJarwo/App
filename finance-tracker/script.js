// ------ GLOBAL ------

let fileId = null;
let data = {};
let tags = {};
let filter = { date: '', tag: '' };

// ------ UTILITIES ------

function formatNumber(num) {
  return Number(num).toLocaleString();
}

function getTagColor(tag) {
  return tags[tag] ? tags[tag].color : '#000';
}

// ------ GOOGLE API ------

function appOnLogin() {
  ['add-item-btn', 'save-data-btn', 'tag-editor-btn'].forEach(id => document.getElementById(id).style.display = '');
  loadDataFromDrive();
}

function appOnLogout() {
  ['add-item-btn', 'save-data-btn', 'tag-editor-btn'].forEach(id => document.getElementById(id).style.display = 'none');
  document.getElementById('data-container').innerHTML = '';
  data = {};
  tags = {};
  fileId = null;
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
      monthDiv.innerHTML = `<div class="title">${month}</div>`;
      let monthIncome = 0, monthExpense = 0;

      for (const day in data[year][month]) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'day';
        dayDiv.innerHTML = `<div class="title">${day}</div>`;
        let dayIncome = 0, dayExpense = 0;
        const ul = document.createElement('ul');

        data[year][month][day].forEach((item, idx) => {
          if ((filter.date && item.date !== filter.date) || (filter.tag && item.tag !== filter.tag)) return;

          const li = document.createElement('li');
          li.innerHTML = `
            <span class="tag-label" style="background:${getTagColor(item.tag)}">${item.tag}</span> 
            <strong>${item.title}</strong> - ${item.type} - ${formatNumber(item.amount)}
            <span class="actions">
              <button onclick="editItem('${year}/${month}/${day}', ${idx})">Edit</button>
              <button onclick="deleteItemConfirm('${year}/${month}/${day}', ${idx})">Delete</button>
            </span>
          `;
          ul.appendChild(li);

          if (item.type === 'income') dayIncome += Number(item.amount);
          else dayExpense += Number(item.amount);

          tagTotals[item.tag] = (tagTotals[item.tag] || 0) + Number(item.amount);
        });

        if (ul.children.length > 0) {
          dayDiv.appendChild(ul);
          const dayBalance = dayIncome - dayExpense;
          dayDiv.innerHTML += `<strong>Day Total - Income: ${formatNumber(dayIncome)}, Expense: ${formatNumber(dayExpense)}, Balance: ${formatNumber(dayBalance)}</strong>`;
          monthIncome += dayIncome;
          monthExpense += dayExpense;
          monthDiv.appendChild(dayDiv);
        }
      }

      const monthBalance = monthIncome - monthExpense;
      if (monthIncome > 0 || monthExpense > 0) {
        monthDiv.innerHTML += `<strong>Month Total - Income: ${formatNumber(monthIncome)}, Expense: ${formatNumber(monthExpense)}, Balance: ${formatNumber(monthBalance)}</strong>`;
        yearIncome += monthIncome;
        yearExpense += monthExpense;
        yearDiv.appendChild(monthDiv);
      }
    }

    const yearBalance = yearIncome - yearExpense;
    if (yearIncome > 0 || yearExpense > 0) {
      yearDiv.innerHTML += `<strong>Year Total - Income: ${formatNumber(yearIncome)}, Expense: ${formatNumber(yearExpense)}, Balance: ${formatNumber(yearBalance)}</strong>`;
      totalIncome += yearIncome;
      totalExpense += yearExpense;
      container.appendChild(yearDiv);
    }
  }

  const totalBalance = totalIncome - totalExpense;
  container.innerHTML += `<h2>Overall Total - Income: ${formatNumber(totalIncome)}, Expense: ${formatNumber(totalExpense)}, Balance: ${formatNumber(totalBalance)}</h2>`;

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
  showNotification('Item saved', 'success');
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
  updateFilterTagDropdown();
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
  } catch (e) {
    console.log(e);
    showNotification('Failed to load', 'error');
  }
}

// ------ SAVE AUTOMATIC WITH STATUS ------

async function saveDataToDrive() {
  showNotification('Saving...');
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
    showNotification('Saved', 'success');
  } catch (e) {
    console.error(e);
    showNotification('Save failed', 'error');
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

