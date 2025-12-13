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
  // showNotification('Logged in', 'success');
  document.querySelector('header').classList.add('logged-in');
  ['login-btn'].forEach(id => document.getElementById(id).style.display = 'none');
  ['logout-btn'].forEach(id => document.getElementById(id).style.display = '');
  getUserInfo();
}

function authOnLogout() {
  // showNotification('Logged out', 'info');
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
  if (userInfo.name === undefined && userInfo.picture === undefined) {
    handleSignoutClick();
    return;
  }
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

// ----- Popup -----

const popupElement = document.querySelector('#popup');

if (popupElement.classList.contains('no-click-close') === false) {
  popupElement.setAttribute("onclick", "popupClose(this)");
  document.querySelector('.popup').addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

function popupShow(e) {
  const p = document.querySelector(e);
  if (p.style.opacity !== "1") {
    p.classList.add('show');
    p.style.display = "grid";
    p.style.opacity = "0";
    setTimeout(function(){p.style.opacity = "1";}, 200);
  }
}

function popupClose(e) {
  const p = e.closest('#popup');
  p.classList.remove('show');
  p.style.opacity = "0";
  setTimeout(function(){p.style.display = "none"}, 200);
}

if (popupElement) {
  popupElement.querySelector('.popup').innerHTML += `
    <div class='popup-close'>
      <img src="../icon/close.png" onclick="popupClose(this)" alt="Close Popup"/>
    </div>
  `;
};

// ----- Language Selector -----

const siteLangSelect = document.getElementById('site-lang');

if (siteLangSelect) {
  const updateLanguage = lang => {
    localStorage.setItem('site-lang', lang);
    document.querySelectorAll('[data-id]').forEach(el => {
      if (!el.dataset.en) el.dataset.en = el.innerHTML;
      el.innerHTML = lang === 'id' ? el.dataset.id : el.dataset.en;
    });
  };
  siteLangSelect.addEventListener('change', () => updateLanguage(siteLangSelect.value));
  // Save to localStorage
  const savedLang = localStorage.getItem('site-lang') || 'en';
  siteLangSelect.value = savedLang;
  updateLanguage(savedLang);
  // Click to change
  siteLangSelect.addEventListener('mousedown', e => {
    e.preventDefault();
    const options = [...siteLangSelect.options];
    let nextIndex = siteLangSelect.selectedIndex + 1;
    if (nextIndex >= options.length) nextIndex = 0;
    siteLangSelect.selectedIndex = nextIndex;
    siteLangSelect.dispatchEvent(new Event('change'));
  });
}
