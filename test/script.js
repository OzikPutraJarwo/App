Date.prototype.formatDate = function () {
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return this.toLocaleDateString('en-US', options);
};
function formatNumber(number) {
  return "₩ " + number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

let data = JSON.parse(localStorage.getItem('financeData')) || [];
let modalCallback = null;

function saveData() {
  localStorage.setItem('financeData', JSON.stringify(data));
  render();

  const isSignedIn = gapi.auth2 && gapi.auth2.getAuthInstance().isSignedIn.get();
  if (isSignedIn) {
      saveDataToDrive();
  }
}

function showModal(title, contentHTML, callback) {
  document.getElementById('modal-title').innerText = title;
  document.getElementById('modal-body').innerHTML = contentHTML;
  document.getElementById('modal').classList.remove('hide');
  modalCallback = callback;

  const okBtn = document.getElementById('modal-ok');
  const cancelBtn = document.getElementById('modal-cancel');

  function handleKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); okBtn.click(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelBtn.click(); }
  }

  document.addEventListener('keydown', handleKey);

  okBtn.onclick = () => { if (modalCallback) modalCallback(); closeModal(); };
  cancelBtn.onclick = () => closeModal();

  function closeModal() {
    document.getElementById('modal').classList.add('hide');
    modalCallback = null;
    document.removeEventListener('keydown', handleKey);
  }
}

function showSectionModal(isEdit = false, index = null) {
  const currentName = isEdit ? data[index].name : '';
  showModal(isEdit ? 'Edit Section' : 'Add New Section',
    `<label>Name: <input type="text" id="sectionName" value="${currentName}"></label>`,
    () => {
      const name = document.getElementById('sectionName').value;
      if (name.trim()) {
        if (isEdit) { data[index].name = name; }
        else { data.push({ name, items: [] }); }
        saveData();
      }
    }
  );
}

function deleteSection(index) {
  showModal('Confirmation', 'Delete this section?', () => {
    data.splice(index, 1);
    saveData();
  });
}

function showItemModal(sectionIndex, isEdit = false, itemIndex = null) {
  const item = isEdit ? data[sectionIndex].items[itemIndex] : { tanggal: '', nama: '', deskripsi: '', tipe: 'income', amount: 0 };

  showModal(isEdit ? 'Edit Item' : 'Add New Item', `
                <label>Name: <input type="text" id="nama" value="${item.nama}"></label>
                <label>Description: <input type="text" id="deskripsi" value="${item.deskripsi}"></label>
                <label>Date: <input type="date" id="tanggal" value="${item.tanggal}"></label>
                <label>Type: 
                    <select id="tipe">
                        <option value="income" ${item.tipe === 'income' ? 'selected' : ''}>Income</option>
                        <option value="outcome" ${item.tipe === 'outcome' ? 'selected' : ''}>Outcome</option>
                    </select>
                </label>
                <label>Amount: <input type="number" id="amount" value="${item.amount}"></label>
            `, () => {
    const newItem = {
      tanggal: document.getElementById('tanggal').value,
      nama: document.getElementById('nama').value,
      deskripsi: document.getElementById('deskripsi').value,
      tipe: document.getElementById('tipe').value,
      amount: parseFloat(document.getElementById('amount').value) || 0
    };
    if (isEdit) { data[sectionIndex].items[itemIndex] = newItem; }
    else { data[sectionIndex].items.push(newItem); }
    saveData();
  });
}

function deleteItem(sectionIndex, itemIndex) {
  showModal('Confirmation', 'Delete this item?', () => {
    data[sectionIndex].items.splice(itemIndex, 1);
    saveData();
  });
}

function downloadData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'finance-data.kjf';
  a.click();
  URL.revokeObjectURL(url);
}

function handleUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.name.endsWith('.kjf')) {
    showModal('Error', 'Only .kjf files are allowed', () => { });
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const newData = JSON.parse(e.target.result);
      showModal('Confirmation', 'Importing data will erase all existing data. Continue?', () => {
        data = newData;
        saveData();
      });
    } catch (error) {
      showModal('Error', 'Invalid file', () => { });
    }
  };
  reader.readAsText(file);
}

function render() {
  const container = document.getElementById('sections');
  const downloadBtn = document.getElementById('downloadBtn');
  container.innerHTML = '';

  if (data.length === 0) {
    downloadBtn.classList.add('hide');
  } else {
    downloadBtn.classList.remove('hide');
  }

  data.forEach((section, sectionIndex) => {
    const sectionDiv = document.createElement('div');
    sectionDiv.className = 'section item';

    const totalPemasukan = section.items.filter(i => i.tipe === 'income').reduce((sum, item) => sum + item.amount, 0);
    const totalPengeluaran = section.items.filter(i => i.tipe === 'outcome').reduce((sum, item) => sum + item.amount, 0);
    const selisih = totalPemasukan - totalPengeluaran;

    sectionDiv.innerHTML = `
        <div class="section-header">
            <div class="section-title">${section.name}</div>
            <div class="section-actions">
                <button onclick="showSectionModal(true, ${sectionIndex})"><svg style="padding:3px" xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 1025 1023"><path fill="var(--blue)" d="M896.428 1023h-768q-53 0-90.5-37.5T.428 895V127q0-53 37.5-90t90.5-37h576l-128 127h-384q-27 0-45.5 19t-18.5 45v640q0 27 19 45.5t45 18.5h640q27 0 45.5-18.5t18.5-45.5V447l128-128v576q0 53-37.5 90.5t-90.5 37.5zm-576-464l144 144l-208 64zm208 96l-160-159l479-480q17-16 40.5-16t40.5 16l79 80q16 16 16.5 39.5t-16.5 40.5z"/></svg></button>
                <button onclick="showItemModal(${sectionIndex})"><svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 24 24"><path fill="var(--green)" d="M17 13h-4v4h-2v-4H7v-2h4V7h2v4h4m2-8H5c-1.11 0-2 .89-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Z"/></svg></button>
                <button onclick="deleteSection(${sectionIndex})"><svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 16 16"><path fill="var(--red)" fill-rule="evenodd" d="M4 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H4Zm1.75 5.25a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5Z" clip-rule="evenodd"/></svg></button>
            </div>
        </div>
        <div class="section-stats money-container">
            <div class="money-wrap income">
                <div class="section-stat-title">Income</div>
                <div class="section-stat-value">${formatNumber(totalPemasukan)}</div>
            </div>
            <div class="money-wrap outcome">
                <div class="section-stat-title">Outcome</div>
                <div class="section-stat-value">${formatNumber(totalPengeluaran)}</div>
            </div>
            <div class="money-wrap balance">
                <div class="section-stat-title">Balance</div>
                <div class="section-stat-value">${formatNumber(selisih)}</div>
            </div>
        </div>
        <div class="section-items" id="items-${sectionIndex}"></div>
        `;

    const itemsDiv = sectionDiv.querySelector(`#items-${sectionIndex}`);

    section.items.forEach((item, itemIndex) => {
      const formattedDate = new Date(item.tanggal).formatDate();
      const itemDiv = document.createElement('div');
      itemDiv.className = `items ${item.tipe}`;
      itemDiv.innerHTML = `
                <div class="items-info">
                    <span class="title">${item.nama}</span>
                    <span class="date">${formattedDate}</span>
                    <span class="desc">${item.deskripsi}</span>
                </div>
                <div class="items-${item.tipe}">
                    <span class="value">${formatNumber(item.amount)}</span>
                </div>
                <div class="items-actions">
                    <button onclick="showItemModal(${sectionIndex}, true, ${itemIndex})"><svg style="padding:3px" xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 1025 1023"><path fill="var(--blue)" d="M896.428 1023h-768q-53 0-90.5-37.5T.428 895V127q0-53 37.5-90t90.5-37h576l-128 127h-384q-27 0-45.5 19t-18.5 45v640q0 27 19 45.5t45 18.5h640q27 0 45.5-18.5t18.5-45.5V447l128-128v576q0 53-37.5 90.5t-90.5 37.5zm-576-464l144 144l-208 64zm208 96l-160-159l479-480q17-16 40.5-16t40.5 16l79 80q16 16 16.5 39.5t-16.5 40.5z"/></svg></button>
                    <button onclick="deleteItem(${sectionIndex}, ${itemIndex})"><svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 16 16"><path fill="var(--red)" fill-rule="evenodd" d="M4 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H4Zm1.75 5.25a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5Z" clip-rule="evenodd"/></svg></button>
                </div>
            `;
      itemsDiv.appendChild(itemDiv);
    });

    container.appendChild(sectionDiv);
  });

  updateOverallStats();
}

function updateOverallStats() {
  let totalIncome = 0;
  let totalOutcome = 0;

  data.forEach(section => {
    section.items.forEach(item => {
      if (item.tipe === 'income') {
        totalIncome += item.amount;
      } else if (item.tipe === 'outcome') {
        totalOutcome += item.amount;
      }
    });
  });

  const balance = totalIncome - totalOutcome;

  document.getElementById('wrap-income').innerText = formatNumber(totalIncome);
  document.getElementById('wrap-outcome').innerText = formatNumber(totalOutcome);
  document.getElementById('wrap-balance').innerText = formatNumber(balance);
}


render();

const CLIENT_ID = '520286422685-k0imo1pp8vu8r6hj4trc4vt0d0k0ks63.apps.googleusercontent.com';
const API_KEY = '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';

const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

function handleClientLoad() {
    gapi.load('client:auth2', initClient);
}

function initClient() {
    gapi.client.init({
        apiKey: API_KEY,
        clientId: CLIENT_ID,
        discoveryDocs: DISCOVERY_DOCS,
        scope: SCOPES
    }).then(() => {
        const authInstance = gapi.auth2.getAuthInstance();
        authInstance.isSignedIn.listen(updateSigninStatus);
        updateSigninStatus(authInstance.isSignedIn.get());
    });
}

function updateSigninStatus(isSignedIn) {
    if (isSignedIn) {
        console.log('Signed in');
        showUserInfo();
        loadDataFromDrive();
    } else {
        console.log('Signed out');
        document.getElementById('user-info').innerText = 'Not logged in';
    }
}


function handleSignInClick() {
    gapi.auth2.getAuthInstance().signIn();
}

function handleSignOutClick() {
    gapi.auth2.getAuthInstance().signOut();
}

handleClientLoad();

function saveDataToDrive() {
    const fileContent = JSON.stringify(data, null, 2);
    const file = new Blob([fileContent], { type: 'application/json' });
    const metadata = {
        'name': 'finance-data.kjf',
        'mimeType': 'application/json'
    };

    const accessToken = gapi.auth.getToken().access_token;
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
        method: 'POST',
        headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
        body: form,
    }).then((res) => res.json())
    .then(function(val) {
        console.log("File saved with ID:", val.id);
        alert('Data saved to Google Drive');
    });
}

function loadDataFromDrive() {
    gapi.client.drive.files.list({
        'q': "name='finance-data.kjf' and mimeType='application/json'",
        'fields': "files(id, name)"
    }).then(function(response) {
        const files = response.result.files;
        if (files && files.length > 0) {
            const fileId = files[0].id;
            gapi.client.drive.files.get({
                fileId: fileId,
                alt: 'media'
            }).then(function(response) {
                try {
                    const loadedData = JSON.parse(response.body);
                    data = loadedData;
                    saveData(); // Simpan juga ke localStorage sebagai backup offline
                    alert('Data loaded from Google Drive');
                } catch (e) {
                    alert('Error loading data');
                }
            });
        } else {
            console.log('No file found on Drive.');
        }
    });
}

function showUserInfo() {
    const user = gapi.auth2.getAuthInstance().currentUser.get();
    const profile = user.getBasicProfile();

    if (profile) {
        const name = profile.getName();
        const email = profile.getEmail();
        document.getElementById('user-info').innerText = `Logged in as ${name} (${email})`;
    } else {
        document.getElementById('user-info').innerText = '';
    }
}
