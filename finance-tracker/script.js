// Formatting utilities
Date.prototype.formatDate = function() {
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return this.toLocaleDateString('en-US', options);
};

function formatNumber(number) {
  return "₩ " + number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Global variables
let data = [];
let modalCallback = null;
let userProfile = null;

// Google API configuration
const CLIENT_ID = '520286422685-nn0k38emnng9iuu61a2bkudgn2a8ajdd.apps.googleusercontent.com';
const API_KEY = 'AIzaSyD_LtwkqAb7sGyBiwa0UAqLnaNydGfd7Xo';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.profile';

let tokenClient;
let gapiInited = false;
let gisInited = false;

// Modal functions
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
  cancelBtn.onclick = closeModal;

  function closeModal() {
    document.getElementById('modal').classList.add('hide');
    modalCallback = null;
    document.removeEventListener('keydown', handleKey);
  }
}

// Section management
function showSectionModal(isEdit = false, index = null) {
  const currentName = isEdit ? data[index].name : '';
  showModal(
    isEdit ? 'Edit Section' : 'Add New Section',
    `<label>Name: <input type="text" id="sectionName" value="${currentName}"></label>`,
    () => {
      const name = document.getElementById('sectionName').value;
      if (name.trim()) {
        if (isEdit) {
          data[index].name = name;
        } else {
          data.push({ name, items: [] });
        }
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

// Item management
function showItemModal(sectionIndex, isEdit = false, itemIndex = null) {
  const item = isEdit ? data[sectionIndex].items[itemIndex] : { 
    tanggal: '', 
    nama: '', 
    deskripsi: '', 
    tipe: 'income', 
    amount: 0 
  };

  showModal(
    isEdit ? 'Edit Item' : 'Add New Item', 
    `
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
    `, 
    () => {
      const newItem = {
        tanggal: document.getElementById('tanggal').value,
        nama: document.getElementById('nama').value,
        deskripsi: document.getElementById('deskripsi').value,
        tipe: document.getElementById('tipe').value,
        amount: parseFloat(document.getElementById('amount').value) || 0
      };
      
      if (isEdit) {
        data[sectionIndex].items[itemIndex] = newItem;
      } else {
        data[sectionIndex].items.push(newItem);
      }
      saveData();
    }
  );
}

function deleteItem(sectionIndex, itemIndex) {
  showModal('Confirmation', 'Delete this item?', () => {
    data[sectionIndex].items.splice(itemIndex, 1);
    saveData();
  });
}

// Rendering functions
function render() {
  const container = document.getElementById('sections');
  container.innerHTML = '';

  data.forEach((section, sectionIndex) => {
    const sectionDiv = document.createElement('div');
    sectionDiv.className = 'section item';

    const totalPemasukan = section.items
      .filter(i => i.tipe === 'income')
      .reduce((sum, item) => sum + item.amount, 0);
      
    const totalPengeluaran = section.items
      .filter(i => i.tipe === 'outcome')
      .reduce((sum, item) => sum + item.amount, 0);
      
    const selisih = totalPemasukan - totalPengeluaran;

    sectionDiv.innerHTML = `
      <div class="section-header">
        <div class="section-title">${section.name}</div>
        <div class="section-actions">
          <button onclick="showSectionModal(true, ${sectionIndex})">
            <svg style="padding:3px" xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 1025 1023">
              <path fill="var(--blue)" d="M896.428 1023h-768q-53 0-90.5-37.5T.428 895V127q0-53 37.5-90t90.5-37h576l-128 127h-384q-27 0-45.5 19t-18.5 45v640q0 27 19 45.5t45 18.5h640q27 0 45.5-18.5t18.5-45.5V447l128-128v576q0 53-37.5 90.5t-90.5 37.5zm-576-464l144 144l-208 64zm208 96l-160-159l479-480q17-16 40.5-16t40.5 16l79 80q16 16 16.5 39.5t-16.5 40.5z"/>
            </svg>
          </button>
          <button onclick="showItemModal(${sectionIndex})">
            <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 24 24">
              <path fill="var(--green)" d="M17 13h-4v4h-2v-4H7v-2h4V7h2v4h4m2-8H5c-1.11 0-2 .89-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Z"/>
            </svg>
          </button>
          <button onclick="deleteSection(${sectionIndex})">
            <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 16 16">
              <path fill="var(--red)" fill-rule="evenodd" d="M4 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H4Zm1.75 5.25a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5Z" clip-rule="evenodd"/>
            </svg>
          </button>
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
          <button onclick="showItemModal(${sectionIndex}, true, ${itemIndex})">
            <svg style="padding:3px" xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 1025 1023">
              <path fill="var(--blue)" d="M896.428 1023h-768q-53 0-90.5-37.5T.428 895V127q0-53 37.5-90t90.5-37h576l-128 127h-384q-27 0-45.5 19t-18.5 45v640q0 27 19 45.5t45 18.5h640q27 0 45.5-18.5t18.5-45.5V447l128-128v576q0 53-37.5 90.5t-90.5 37.5zm-576-464l144 144l-208 64zm208 96l-160-159l479-480q17-16 40.5-16t40.5 16l79 80q16 16 16.5 39.5t-16.5 40.5z"/>
            </svg>
          </button>
          <button onclick="deleteItem(${sectionIndex}, ${itemIndex})">
            <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 16 16">
              <path fill="var(--red)" fill-rule="evenodd" d="M4 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H4Zm1.75 5.25a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5Z" clip-rule="evenodd"/>
            </svg>
          </button>
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

// Google Drive integration
async function uploadDataToDrive() {
  try {
    const token = gapi.client.getToken();
    if (!token) {
      updateLog('Please login first.');
      return;
    }

    updateLog('Loading data...');

    const response = await gapi.client.drive.files.list({
      spaces: 'appDataFolder',
      fields: 'files(id, name)',
      q: "name='finance-data.kjf'",
    });

    const existingFile = response.result.files[0];
    const fileContent = JSON.stringify(data);
    const file = new Blob([fileContent], { type: 'application/json' });

    const metadata = {
      name: 'finance-data.kjf',
      mimeType: 'application/json',
    };

    if (existingFile) {
      updateLog('Updating file...');

      const boundary = '-------314159265358979323846';
      const delimiter = "\r\n--" + boundary + "\r\n";
      const close_delim = "\r\n--" + boundary + "--";
      
      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        fileContent +
        close_delim;

      const request = gapi.client.request({
        path: '/upload/drive/v3/files/' + existingFile.id,
        method: 'PATCH',
        params: {
          uploadType: 'multipart',
          fields: 'id',
        },
        headers: {
          'Content-Type': 'multipart/related; boundary="' + boundary + '"'
        },
        body: multipartRequestBody
      });

      await request;
      updateLog('File updated successfully!', true); // Status sukses
      return;
    }

    updateLog('Creating new file...');

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    const uploadResponse = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      {
        method: 'POST',
        headers: new Headers({
          'Authorization': 'Bearer ' + token.access_token
        }),
        body: form,
      }
    );

    if (!uploadResponse.ok) {
      throw new Error('Upload failed: ' + uploadResponse.statusText);
    }

    const result = await uploadResponse.json();
    updateLog('File uploaded successfully!', true); // Status sukses
  } catch (error) {
    console.error('Upload error:', error);
    updateLog('Failed to upload data to Google Drive: ' + error.message);
  }
}

async function downloadDataFromDrive() {
  const token = gapi.client.getToken();
  if (!token) {
    updateLog('Please login first.');
    return;
  }

  updateLog('Loading from Drive...');

  const response = await gapi.client.drive.files.list({
    spaces: 'appDataFolder',
    fields: 'files(id, name)',
    q: "name='finance-data.kjf'",
  });

  if (response.result.files.length > 0) {
    const file = response.result.files[0];
    const fileId = file.id;

    updateLog('Downloading file...');

    const download = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: new Headers({ 'Authorization': 'Bearer ' + token.access_token }),
    });

    if (!download.ok) {
      throw new Error('Failed to download file');
    }

    const result = await download.json();
    data = result;
    saveData();
    updateLog('Load from Drive successful!', true); // Status sukses
  } else {
    data = [];
    await uploadDataToDrive();
    updateLog('No file found. Created a new file.', true); // Status sukses
  }
}

// User profile functions
async function getUserProfile() {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
      headers: {
        'Authorization': `Bearer ${gapi.client.getToken().access_token}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch user profile');
    }
    
    userProfile = await response.json();
    updateUserProfileUI();
  } catch (error) {
    console.error('Error fetching user profile:', error);
  }
}

function updateUserProfileUI() {
  const loginInfo = document.getElementById('login-info');
  const usernameElement = document.getElementById('username');
  if (userProfile) {
    usernameElement.innerText = `, ${userProfile.name || ''}`;
    document.getElementById('account').classList.add('hide');
    loginInfo.innerHTML = `
      <div class="user-profile">
        <img src="${userProfile.picture || ''}" alt="Profile" width="30" height="30">
        <div>
          <div class="user-name">${userProfile.name || 'User'}</div>
          <div class="user-email">${userProfile.email || ''}</div>
        </div>
      </div>
    `;
  } else {
    loginInfo.innerHTML = 'Not logged in. Login to save your data.';
  }
}

// Google API initialization
function gapiLoaded() {
  gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
  await gapi.client.init({
    apiKey: API_KEY,
    discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"],
  });
  gapiInited = true;
  
  // Coba auto-login dari localStorage
  const savedToken = localStorage.getItem('googleAuthToken');
  if (savedToken) {
    try {
      const token = JSON.parse(savedToken);
      
      // Cek expiry token
      if (token.expiry > Date.now()) {
        gapi.client.setToken(token);
        await getUserProfile();
        await downloadDataFromDrive();
        render();
        return;
      }
    } catch (e) {
      console.log('Invalid saved token', e);
      localStorage.removeItem('googleAuthToken');
    }
  }
}

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: async (resp) => {
      if (resp.error !== undefined) {
        throw (resp);
      }
      
      // Simpan token ke localStorage
      const tokenData = {
        ...resp,
        expiry: Date.now() + (resp.expires_in * 1000) // Hitung waktu expiry
      };
      localStorage.setItem('googleAuthToken', JSON.stringify(tokenData));
      
      gapi.client.setToken(resp);
      await getUserProfile();
      await downloadDataFromDrive();
      render();
    },
    prompt: '' // Tidak tampilkan prompt jika token masih valid
  });
  gisInited = true;
  maybeEnableButtons();
}

function maybeEnableButtons() {
  if (gapiInited && gisInited) {
    document.getElementById('authorize_button').style.display = 'block';
    document.getElementById('signout_button').style.display = 'none';
  }
}

function handleAuthClick() {
  tokenClient.callback = async (resp) => {
    if (resp.error !== undefined) {
      throw (resp);
    }
    
    gapi.client.setToken(resp);
    await getUserProfile();
    await downloadDataFromDrive();
    updateLog('Login successful!', true);
    document.querySelector(".auth-buttons").classList.add('hide');
  };

  // If we don't have a token or it's expired, prompt for consent
  if (!gapi.client.getToken()) {
    tokenClient.requestAccessToken({ prompt: 'consent' });
  } else {
    // If we have a valid token, just use it
    tokenClient.requestAccessToken({ prompt: '' });
  }
}

function handleSignoutClick() {
  const token = gapi.client.getToken();
  if (token) {
    google.accounts.oauth2.revoke(token.access_token);
    gapi.client.setToken('');
    localStorage.removeItem('googleAuthToken');
    userProfile = null;
    updateUserProfileUI();
    data = [];
    render();
  }
}

function isLoggedIn() {
  return !!gapi.client.getToken();
}

// Data management
function saveData() {
  if (isLoggedIn()) {
    uploadDataToDrive();
  }
  render();
}

// Initialize the app
function initializeApp() {
  // Create UI buttons for Drive operations
  // const btnContainer = document.createElement('div');
  // btnContainer.className = 'drive-buttons';
  
  // const uploadDriveBtn = document.createElement('button');
  // uploadDriveBtn.innerText = 'Save to Drive';
  // uploadDriveBtn.onclick = uploadDataToDrive;

  // const downloadDriveBtn = document.createElement('button');
  // downloadDriveBtn.innerText = 'Load from Drive';
  // downloadDriveBtn.onclick = downloadDataFromDrive;

  // btnContainer.appendChild(uploadDriveBtn);
  // btnContainer.appendChild(downloadDriveBtn);
  // document.body.appendChild(btnContainer);

  // Try to auto-login when the app loads
  if (google.accounts.oauth2.hasGrantedAllScopes(
    gapi.client.getToken(), 
    'https://www.googleapis.com/auth/drive.appdata',
    'https://www.googleapis.com/auth/userinfo.profile'
  )) {
    handleAuthClick();
  }
}

// Start the app
window.addEventListener('DOMContentLoaded', initializeApp);

// Logs
function updateLog(message, isSuccess = false) {
  const logsElement = document.getElementById('logs');
  logsElement.innerHTML = message;
  logsElement.classList.add('show');

  if (isSuccess) {
    setTimeout(() => {
      logsElement.innerHTML = '';
      logsElement.classList.remove('show');
    }, 2000);
  }
}