// ------ CONFIG ------

const CLIENT_ID = '520286422685-nn0k38emnng9iuu61a2bkudgn2a8ajdd.apps.googleusercontent.com';
const API_KEY = 'AIzaSyD_LtwkqAb7sGyBiwa0UAqLnaNydGfd7Xo';
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile';

function gapiLoaded() { gapi.load('client', initializeGapiClient); }

async function initializeGapiClient() {
  await gapi.client.init({ apiKey: API_KEY, discoveryDocs: DISCOVERY_DOCS });
  const storedToken = localStorage.getItem('token');
  if (storedToken) {
    gapi.client.setToken({ access_token: storedToken });
    onLogin();
  }
}

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: (resp) => {
      if (resp.error !== undefined) throw (resp);
      localStorage.setItem('token', resp.access_token);
      gapi.client.setToken({ access_token: resp.access_token });
      onLogin();
    },
  });
}

function handleAuthClick() { tokenClient.requestAccessToken({ prompt: '' }); }

function handleSignoutClick() {
  const token = gapi.client.getToken();
  if (token) {
    google.accounts.oauth2.revoke(token.access_token);
    gapi.client.setToken('');
    localStorage.removeItem('token');
    onLogout();
  }
}

function authOnLogin() {
  showNotification('Logged in', 'success');
  document.querySelector('header').classList.add('logged-in');
  ['login-btn'].forEach(id => document.getElementById(id).style.display = 'none');
  ['logout-btn'].forEach(id => document.getElementById(id).style.display = '');
  getUserInfo();
}

function authOnLogout() {
  showNotification('Logged out', 'info');
  document.querySelector('header').classList.remove('logged-in');
  ['login-btn'].forEach(id => document.getElementById(id).style.display = '');
  ['logout-btn'].forEach(id => document.getElementById(id).style.display = 'none');
  document.getElementById('user-info').style.display = 'none';
}

async function getUserInfo() {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      'Authorization': 'Bearer ' + gapi.client.getToken().access_token
    }
  });
  const userInfo = await response.json();
  document.getElementById('user-pic').src = userInfo.picture;
  document.getElementById('user-name').innerText = userInfo.name;
  document.getElementById('user-info').style.display = 'block';
}

document.getElementById('login-btn').onclick = handleAuthClick;
document.getElementById('logout-btn').onclick = handleSignoutClick;

window.gapiLoaded = gapiLoaded;
window.gisLoaded = gisLoaded;

function showNotification(msg, type) {
  const n = document.getElementById('notification');
  n.innerText = msg;
  n.classList.add('show');
  if (type === 'error') {
    n.setAttribute('type', 'error');
  } else if (type === 'success') {
    n.setAttribute('type', 'success');
  } else {
    n.setAttribute('type', 'info');
  }
  setTimeout(() => { n.classList.remove('show'); }, 3000);
}

// ------ APP ------

const loginCallbacks = [];
const logoutCallbacks = [];

function onLogin() {
  authOnLogin();
  loginCallbacks.forEach(fn => fn());
}

function onLogout() {
  authOnLogout();
  logoutCallbacks.forEach(fn => fn());
}
