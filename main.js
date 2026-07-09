// ============================================================
//  Kode Jarwo — shared chrome + behavior (single source)
//  Header / footer / background are injected here, so each app
//  only needs empty <header></header> / <footer></footer> mounts
//  and a bit of config on <body>:
//    <body data-app="App Title">        -> title (falls back to document.title)
//    <body ... data-home>               -> landing variant (brand, no back button)
//    <body ... data-login>              -> show Google login/logout controls
//    <body ... data-lang>               -> show EN/ID language selector
// ============================================================

// ------ icons (Material Symbols Rounded, loaded via main.css) ------
const IC = {
  back: '<span class="material-symbols-rounded">arrow_back</span>',
  logout: '<span class="material-symbols-rounded">logout</span>',
  close: '<span class="material-symbols-rounded">close</span>',
  // Google "G" stays a colored brand SVG for sign-in recognition
  google: '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="none"><path fill="#4285F4" d="M14.9 8.161c0-.476-.039-.954-.121-1.422h-6.64v2.695h3.802a3.24 3.24 0 01-1.407 2.127v1.75h2.269c1.332-1.22 2.097-3.02 2.097-5.15z"/><path fill="#34A853" d="M8.14 15c1.898 0 3.499-.62 4.665-1.69l-2.268-1.749c-.631.427-1.446.669-2.395.669-1.836 0-3.393-1.232-3.952-2.888H1.85v1.803A7.044 7.044 0 008.14 15z"/><path fill="#FBBC04" d="M4.187 9.342a4.17 4.17 0 010-2.68V4.859H1.849a6.97 6.97 0 000 6.286l2.338-1.803z"/><path fill="#EA4335" d="M8.14 3.77a3.837 3.837 0 012.7 1.05l2.01-1.999a6.786 6.786 0 00-4.71-1.82 7.042 7.042 0 00-6.29 3.858L4.186 6.66c.556-1.658 2.116-2.89 3.952-2.89z"/></svg>'
};

const BLANK_PIC = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

const FOOTER_HTML = 'Created with <span>&#10084;</span> by <a href="https://kodejarwo.com" target="_blank" rel="noopener">Ozik Jarwo</a>';

function readChromeConfig() {
  const body = document.body;
  return {
    title: body.dataset.app || document.title || '',
    home: body.hasAttribute('data-home'),
    // Where the header back arrow goes. Defaults to the portfolio root;
    // apps with their own sub-pages (e.g. topik/test/, topik/learn/) can
    // set data-back="../" to return to the app's own landing page instead.
    back: body.dataset.back || '/',
    login: body.hasAttribute('data-login'),
    cloud: body.hasAttribute('data-cloud'),
    lang: body.hasAttribute('data-lang')
  };
}

// An app with its own internal hash-routing (e.g. topik/test/#/exam/t1,
// topik/learn/#/lesson/xxx) can define window.siteBackUp(): a function
// that moves exactly one level up its own hierarchy and returns true, or
// returns false when already at the app's root. The back arrow calls it
// first; only when it's absent or returns false does the arrow fall back
// to its static href (data-back, or the portfolio root). This is a
// deterministic "go up one directory" step, not a browser-history replay
// — replaying real history was tried and proved unpredictable, since it
// unwinds whatever the user actually clicked (exam -> result -> review
// -> ...) rather than a clean parent/child structure.
function wireSiteBack() {
  const back = document.querySelector('.site-back');
  if (!back || back.dataset.wired) return;
  back.dataset.wired = '1';
  back.addEventListener('click', (e) => {
    if (typeof window.siteBackUp === 'function' && window.siteBackUp()) {
      e.preventDefault();
    }
  });
}

// Header/background/toast are injected SYNCHRONOUSLY (main.js sits at the end
// of <body>, so the <header></header> mount is already parsed) — this lets each
// app's own script query injected controls (e.g. .cloud-success) right after.
function renderHeader() {
  const body = document.body;
  if (!body) return;
  const cfg = readChromeConfig();

  // ambient background
  if (!document.querySelector('.bg')) {
    const bg = document.createElement('div');
    bg.className = 'bg';
    body.insertBefore(bg, body.firstChild);
  }

  // header (fill the mount, or create one if missing)
  let header = document.querySelector('header');
  if (!header) {
    header = document.createElement('header');
    const bgEl = body.querySelector('.bg');
    body.insertBefore(header, bgEl ? bgEl.nextSibling : body.firstChild);
  }

  // Only fill an empty header mount. Apps that need custom in-header controls
  // (e.g. topik's exam timer/submit) provide their own markup using the shared
  // .header.wrap / .site-back / .site-title classes and are left untouched.
  if (header.innerHTML.trim() === '') {
    const back = cfg.home ? '' : `<a class="site-back" href="${cfg.back}" aria-label="Home">${IC.back}</a>`;

    const lang = cfg.lang
      ? `<div class="site-lang"><select id="site-lang"><option value="en">EN</option><option value="id">ID</option></select></div>`
      : '';

    const cloud = cfg.cloud ? `
        <div class="site-cloud" title="Cloud sync status">
          <span class="cloud-success material-symbols-rounded none" title="Synced">cloud_done</span>
          <span class="cloud-sync material-symbols-rounded" title="Syncing">cloud_sync</span>
          <span class="cloud-failed material-symbols-rounded none" title="Sync failed">cloud_off</span>
        </div>` : '';

    const login = cfg.login ? `
        <div class="site-user" id="user-info">
          <img id="user-pic" alt="Profile" src="${BLANK_PIC}">
          <span id="user-name"></span>
        </div>
        <button type="button" class="site-login" id="login-btn">${IC.google}<span>Login</span></button>
        <button type="button" class="site-logout" id="logout-btn" aria-label="Logout">${IC.logout}</button>` : '';

    header.innerHTML = `
      <div class="header wrap">
        ${back}
        <div class="site-title">${cfg.title}</div>
        <div class="site-actions">${lang}${cloud}${login}</div>
      </div>`;
  }

  wireSiteBack();

  // toast host
  if (!document.getElementById('notification')) {
    const n = document.createElement('div');
    n.id = 'notification';
    body.appendChild(n);
  }
}

// Footer mount is parsed after main.js, so fill it once the DOM is ready.
function renderFooter() {
  let footer = document.querySelector('footer');
  if (!footer) {
    footer = document.createElement('footer');
    document.body.appendChild(footer);
  }
  footer.innerHTML = FOOTER_HTML;
}

if (document.body) {
  renderHeader();
} else {
  document.addEventListener('DOMContentLoaded', renderHeader);
}

// ============================================================
//  Google auth (Drive) — only active on apps flagged data-login
// ============================================================

const CLIENT_ID = '520286422685-nn0k38emnng9iuu61a2bkudgn2a8ajdd.apps.googleusercontent.com';
const API_KEY = 'AIzaSyD_LtwkqAb7sGyBiwa0UAqLnaNydGfd7Xo';
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile';

let tokenClient;

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
  const header = document.querySelector('header');
  if (header) header.classList.add('logged-in');
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  if (loginBtn) loginBtn.style.display = 'none';
  if (logoutBtn) logoutBtn.style.display = '';
  getUserInfo();
}

function authOnLogout() {
  const header = document.querySelector('header');
  if (header) header.classList.remove('logged-in');
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const userInfo = document.getElementById('user-info');
  if (loginBtn) loginBtn.style.display = '';
  if (logoutBtn) logoutBtn.style.display = 'none';
  if (userInfo) userInfo.style.display = 'none';
}

async function getUserInfo() {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { 'Authorization': 'Bearer ' + gapi.client.getToken().access_token }
  });
  const userInfo = await response.json();
  if (userInfo.name === undefined && userInfo.picture === undefined) {
    handleSignoutClick();
    return;
  }
  const pic = document.getElementById('user-pic');
  const name = document.getElementById('user-name');
  const info = document.getElementById('user-info');
  if (pic) pic.src = userInfo.picture;
  if (name) name.innerText = userInfo.name;
  if (info) info.style.display = 'flex';
}

function wireAuthButtons() {
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  if (loginBtn) loginBtn.onclick = handleAuthClick;
  if (logoutBtn) logoutBtn.onclick = handleSignoutClick;
}

window.gapiLoaded = gapiLoaded;
window.gisLoaded = gisLoaded;

// ------ toast ------
function showNotification(msg, type) {
  const n = document.getElementById('notification');
  if (!n) return;
  n.innerText = msg;
  n.classList.add('show');
  n.setAttribute('type', type === 'error' ? 'error' : type === 'success' ? 'success' : 'info');
  clearTimeout(n._timer);
  n._timer = setTimeout(() => { n.classList.remove('show'); }, 3000);
}

// ------ login hooks (apps register post-login work here) ------
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

// ============================================================
//  Popup engine (single shared #popup design)
// ============================================================
function initPopup() {
  const popupElement = document.querySelector('#popup');
  if (!popupElement) return;

  if (!popupElement.classList.contains('no-click-close')) {
    popupElement.setAttribute('onclick', 'popupClose(this)');
    const popupInner = popupElement.querySelector('.popup');
    if (popupInner) {
      popupInner.addEventListener('click', (e) => e.stopPropagation());
    }
  }

  const inner = popupElement.querySelector('.popup');
  if (inner && !inner.querySelector('.popup-close')) {
    const close = document.createElement('div');
    close.className = 'popup-close';
    close.setAttribute('onclick', 'popupClose(this)');
    close.setAttribute('aria-label', 'Close');
    close.innerHTML = IC.close;
    inner.appendChild(close);
  }
}

function popupShow(e) {
  const p = document.querySelector(e);
  if (!p) return;
  if (p.style.opacity !== "1") {
    p.classList.add('show');
    p.style.display = "grid";
    p.style.opacity = "0";
    setTimeout(() => { p.style.opacity = "1"; }, 20);
  }
}

function popupClose(e) {
  const p = e.closest('#popup');
  if (!p) return;
  p.classList.remove('show');
  p.style.opacity = "0";
  setTimeout(() => { p.style.display = "none"; }, 200);
}

// ============================================================
//  Language selector (EN / ID) — active when #site-lang exists
// ============================================================
function initLanguage() {
  const siteLangSelect = document.getElementById('site-lang');
  if (!siteLangSelect) return;

  const updateLanguage = lang => {
    localStorage.setItem('site-lang', lang);
    document.querySelectorAll('[data-id]').forEach(el => {
      if (!el.dataset.en) el.dataset.en = el.innerHTML;
      el.innerHTML = lang === 'id' ? el.dataset.id : el.dataset.en;
    });
  };
  siteLangSelect.addEventListener('change', () => updateLanguage(siteLangSelect.value));
  const savedLang = localStorage.getItem('site-lang') || 'en';
  siteLangSelect.value = savedLang;
  updateLanguage(savedLang);
  siteLangSelect.addEventListener('mousedown', e => {
    e.preventDefault();
    let nextIndex = siteLangSelect.selectedIndex + 1;
    if (nextIndex >= siteLangSelect.options.length) nextIndex = 0;
    siteLangSelect.selectedIndex = nextIndex;
    siteLangSelect.dispatchEvent(new Event('change'));
  });
}

// ------ boot the DOM-dependent bits after chrome exists ------
function initChromeBehavior() {
  renderFooter();
  wireAuthButtons();
  initPopup();
  initLanguage();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initChromeBehavior);
} else {
  initChromeBehavior();
}
