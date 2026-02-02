// Google API Configuration (from localStorage)
let CLIENT_ID = localStorage.getItem('vault_client_id') || '';
let API_KEY = localStorage.getItem('vault_api_key') || '';
const DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'];
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

// Global State
const state = {
  masterPassword: null,
  encryptionKey: null,
  vault: {
    collections: []
  },
  currentView: 'dashboard',
  currentCollection: null,
  driveFileId: null
};

let tokenClient;

// Initialize
async function init() {
  try {
    // Check if API config exists
    if (!CLIENT_ID || !API_KEY) {
      hideLoading();
      showApiConfigSection();
      initializeEventListeners();
      return;
    }
    
    // Show loading while checking saved token
    showLoading();
    
    await loadGoogleAPI();
    initializeEventListeners();
  } catch (error) {
    console.error('Initialization error:', error);
    hideLoading();
    showToast('Failed to initialize app', 'danger');
  }
}

// Loading state management
function showLoading() {
  document.getElementById('loadingSection').classList.remove('hidden');
  document.getElementById('apiConfigSection').classList.add('hidden');
  document.getElementById('googleAuthSection').classList.add('hidden');
  document.getElementById('passwordSection').classList.add('hidden');
}

function hideLoading() {
  document.getElementById('loadingSection').classList.add('hidden');
}

// Load Google API
function loadGoogleAPI() {
  return new Promise((resolve, reject) => {
    CLIENT_ID = localStorage.getItem('vault_client_id') || '';
    API_KEY = localStorage.getItem('vault_api_key') || '';
    
    if (!CLIENT_ID || !API_KEY) {
      reject(new Error('API configuration missing'));
      return;
    }
    
    gapi.load('client', async () => {
      try {
        await gapi.client.init({
          apiKey: API_KEY,
          discoveryDocs: DISCOVERY_DOCS
        });
        
        const savedToken = localStorage.getItem('vault_access_token');
        const savedPassword = sessionStorage.getItem('vault_master_key');
        
        if (savedToken) {
          gapi.client.setToken({ access_token: savedToken });
          try {
            await gapi.client.drive.about.get({ fields: 'user' });
            
            if (savedPassword) {
              try {
                state.masterPassword = savedPassword;
                state.encryptionKey = await deriveKey(savedPassword);
                await loadVaultData();
                
                hideLoading();
                document.getElementById('authScreen').classList.add('hidden');
                document.getElementById('mainApp').classList.remove('hidden');
                renderVault();
                showToast('Welcome back!', 'success');
              } catch (err) {
                sessionStorage.removeItem('vault_master_key');
                hideLoading();
                document.getElementById('passwordSection').classList.remove('hidden');
              }
            } else {
              hideLoading();
              document.getElementById('passwordSection').classList.remove('hidden');
            }
          } catch (err) {
            localStorage.removeItem('vault_access_token');
            hideLoading();
            initTokenClient();
            document.getElementById('googleAuthSection').classList.remove('hidden');
          }
        } else {
          hideLoading();
          initTokenClient();
          document.getElementById('googleAuthSection').classList.remove('hidden');
        }
        
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

// Initialize Google Identity Services Token Client
function initTokenClient() {
  CLIENT_ID = localStorage.getItem('vault_client_id') || '';
  
  if (!CLIENT_ID) {
    showToast('Please configure API settings first', 'warning');
    return;
  }
  
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: (response) => {
      if (response.access_token) {
        localStorage.setItem('vault_access_token', response.access_token);
        handleAuthSuccess();
      }
    }
  });
}

// API Configuration Management
function showApiConfigSection() {
  document.getElementById('apiConfigSection').classList.remove('hidden');
  document.getElementById('googleAuthSection').classList.add('hidden');
}

function hideApiConfigSection() {
  document.getElementById('apiConfigSection').classList.add('hidden');
  document.getElementById('googleAuthSection').classList.remove('hidden');
}

function toggleApiConfig() {
  const isHidden = document.getElementById('apiConfigSection').classList.contains('hidden');
  if (isHidden) {
    showApiConfigSection();
  } else {
    hideApiConfigSection();
  }
}

function saveApiConfig() {
  const clientId = document.getElementById('clientIdInput').value.trim();
  const apiKey = document.getElementById('apiKeyInput').value.trim();
  
  if (!clientId || !apiKey) {
    showToast('Please enter both Client ID and API Key', 'warning');
    return;
  }
  
  localStorage.setItem('vault_client_id', clientId);
  localStorage.setItem('vault_api_key', apiKey);
  
  showToast('Configuration saved. Reloading...', 'success');
  
  setTimeout(() => {
    location.reload();
  }, 1000);
}

// Event Listeners
function initializeEventListeners() {
  // API Config
  const saveConfigBtn = document.getElementById('saveConfigBtn');
  if (saveConfigBtn) saveConfigBtn.addEventListener('click', saveApiConfig);
  
  const configToggleBtn = document.getElementById('configToggleBtn');
  if (configToggleBtn) configToggleBtn.addEventListener('click', toggleApiConfig);
  
  const backFromConfigBtn = document.getElementById('backFromConfigBtn');
  if (backFromConfigBtn) backFromConfigBtn.addEventListener('click', toggleApiConfig);
  
  // Auth
  const googleSignInBtn = document.getElementById('googleSignIn');
  if (googleSignInBtn) googleSignInBtn.addEventListener('click', handleGoogleSignIn);
  
  const unlockBtn = document.getElementById('unlockBtn');
  if (unlockBtn) unlockBtn.addEventListener('click', handleUnlock);
  
  // Navigation
  const dashboardNav = document.getElementById('dashboardNav');
  if (dashboardNav) dashboardNav.addEventListener('click', () => showView('dashboard'));
  
  const newCollectionBtn = document.getElementById('newCollectionBtn');
  if (newCollectionBtn) newCollectionBtn.addEventListener('click', () => openModal('collectionModal'));
  
  const newItemBtn = document.getElementById('newItemBtn');
  if (newItemBtn) newItemBtn.addEventListener('click', () => openItemModal());
  
  const editCollectionBtn = document.getElementById('editCollectionBtn');
  if (editCollectionBtn) editCollectionBtn.addEventListener('click', editCurrentCollection);
  
  // Mobile menu
  const menuToggle = document.getElementById('menuToggle');
  if (menuToggle) menuToggle.addEventListener('click', toggleSidebar);
  
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);
  
  // Modals
  const collectionModal = document.getElementById('collectionModal');
  if (collectionModal) {
    const backdrop = collectionModal.querySelector('.modal-backdrop');
    if (backdrop) backdrop.addEventListener('click', () => closeModal('collectionModal'));
  }
  
  const itemModal = document.getElementById('itemModal');
  if (itemModal) {
    const backdrop = itemModal.querySelector('.modal-backdrop');
    if (backdrop) backdrop.addEventListener('click', () => closeModal('itemModal'));
  }
  
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal');
      if (modal) closeModal(modal.id);
    });
  });
  
  // Collection Form
  const saveCollectionBtn = document.getElementById('saveCollectionBtn');
  if (saveCollectionBtn) saveCollectionBtn.addEventListener('click', saveCollection);
  
  const cancelCollectionBtn = document.getElementById('cancelCollectionBtn');
  if (cancelCollectionBtn) cancelCollectionBtn.addEventListener('click', () => closeModal('collectionModal'));
  
  const collectionIconInput = document.getElementById('collectionIconInput');
  if (collectionIconInput) collectionIconInput.addEventListener('change', handleCollectionIconUpload);
  
  // Delete Collection
  const deleteCollectionBtn = document.getElementById('deleteCollectionBtn');
  if (deleteCollectionBtn) deleteCollectionBtn.addEventListener('click', deleteCurrentCollection);
  
  // Item Form
  const saveItemBtn = document.getElementById('saveItemBtn');
  if (saveItemBtn) saveItemBtn.addEventListener('click', saveItem);
  
  const cancelItemBtn = document.getElementById('cancelItemBtn');
  if (cancelItemBtn) cancelItemBtn.addEventListener('click', () => closeModal('itemModal'));
  
  const addFieldBtn = document.getElementById('addFieldBtn');
  if (addFieldBtn) addFieldBtn.addEventListener('click', addField);
  
  // Logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllModals();
      closeSidebar();
    }
  });
}

// Mobile Sidebar
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  
  sidebar.classList.toggle('open');
  overlay.classList.toggle('active');
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  
  sidebar.classList.remove('open');
  overlay.classList.remove('active');
}

// Authentication
async function handleGoogleSignIn() {
  try {
    if (!tokenClient) initTokenClient();
    tokenClient.requestAccessToken({ prompt: '' });
  } catch (error) {
    console.error('Sign-in error:', error);
    showToast('Failed to sign in', 'danger');
  }
}

function handleAuthSuccess() {
  const savedMasterKey = sessionStorage.getItem('vault_master_key');
  
  if (savedMasterKey) {
    document.getElementById('masterPassword').value = savedMasterKey;
    handleUnlock();
  } else {
    hideLoading();
    document.getElementById('googleAuthSection').classList.add('hidden');
    document.getElementById('passwordSection').classList.remove('hidden');
    document.getElementById('masterPassword').focus();
  }
}

async function handleUnlock() {
  const password = document.getElementById('masterPassword').value;
  
  if (!password) {
    showToast('Please enter master password', 'warning');
    return;
  }
  
  showLoading();
  
  try {
    state.masterPassword = password;
    state.encryptionKey = await deriveKey(password);
    
    await loadVaultData();
    
    sessionStorage.setItem('vault_master_key', password);
    
    hideLoading();
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    
    renderVault();
    showToast('Vault unlocked successfully', 'success');
  } catch (error) {
    console.error('Unlock error:', error);
    sessionStorage.removeItem('vault_master_key');
    hideLoading();
    document.getElementById('passwordSection').classList.remove('hidden');
    
    if (error.message === 'Invalid master password') {
      showToast('Wrong password or corrupted vault data', 'danger');
    } else {
      showToast('Failed to unlock vault', 'danger');
    }
  }
}

function handleLogout() {
  if (confirm('Are you sure you want to logout?')) {
    localStorage.removeItem('vault_access_token');
    sessionStorage.removeItem('vault_master_key');
    location.reload();
  }
}

// Encryption
async function deriveKey(password) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode('vault-salt-2024'),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encrypt(text) {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    state.encryptionKey,
    enc.encode(text)
  );
  
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  // Convert Uint8Array to base64 without stack overflow
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < combined.length; i += chunkSize) {
    const chunk = combined.subarray(i, Math.min(i + chunkSize, combined.length));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

async function decrypt(encryptedText) {
  try {
    const binary = atob(encryptedText);
    const combined = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      combined[i] = binary.charCodeAt(i);
    }
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      state.encryptionKey,
      data
    );
    
    const dec = new TextDecoder();
    return dec.decode(decrypted);
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Invalid master password');
  }
}

// Google Drive Operations
async function loadVaultData() {
  try {
    const response = await gapi.client.drive.files.list({
      q: "name='vault-data.enc' and trashed=false",
      fields: 'files(id, name, modifiedTime)'
    });
    
    const files = response.result.files;
    
    if (files && files.length > 0) {
      state.driveFileId = files[0].id;
      
      const fileResponse = await gapi.client.drive.files.get({
        fileId: state.driveFileId,
        alt: 'media'
      });
      
      const decryptedData = await decrypt(fileResponse.body);
      state.vault = JSON.parse(decryptedData);
      
      // Migrate old data without category
      state.vault.collections.forEach(c => {
        if (!c.category) c.category = 'Uncategorized';
      });
    } else {
      state.vault = { collections: [], lastModified: Date.now() };
    }
  } catch (error) {
    console.error('Load vault error:', error);
    throw error;
  }
}

async function saveVaultData() {
  try {
    setSyncStatus('syncing');
    
    state.vault.lastModified = Date.now();
    const encryptedData = await encrypt(JSON.stringify(state.vault));
    
    const metadata = {
      name: 'vault-data.enc',
      mimeType: 'application/octet-stream'
    };
    
    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const closeDelimiter = "\r\n--" + boundary + "--";
    
    const multipartBody =
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/octet-stream\r\n\r\n' +
      encryptedData +
      closeDelimiter;
    
    if (state.driveFileId) {
      await gapi.client.request({
        path: `/upload/drive/v3/files/${state.driveFileId}`,
        method: 'PATCH',
        params: { uploadType: 'multipart' },
        headers: { 'Content-Type': `multipart/related; boundary="${boundary}"` },
        body: multipartBody
      });
    } else {
      const response = await gapi.client.request({
        path: '/upload/drive/v3/files',
        method: 'POST',
        params: { uploadType: 'multipart' },
        headers: { 'Content-Type': `multipart/related; boundary="${boundary}"` },
        body: multipartBody
      });
      state.driveFileId = response.result.id;
    }
    
    setSyncStatus('synced');
  } catch (error) {
    console.error('Save vault error:', error);
    setSyncStatus('error');
    showToast('Failed to save vault', 'danger');
  }
}

function setSyncStatus(status) {
  const indicator = document.getElementById('syncStatus');
  const mobileIndicator = document.getElementById('syncStatusMobile');
  
  [indicator, mobileIndicator].forEach(el => {
    if (!el) return;
    el.className = 'sync-indicator';
    
    const dot = el.querySelector('.sync-dot');
    const text = el.querySelector('span');
    
    if (status === 'syncing') {
      el.classList.add('syncing');
      if (text) text.textContent = 'Syncing...';
    } else if (status === 'synced') {
      if (text) text.textContent = 'Synced';
    } else {
      if (text) text.textContent = 'Error';
    }
  });
}

// Rendering
function renderVault() {
  renderCollectionsList();
  renderDashboard();
  updateCategoryDatalist();
  
  if (state.currentCollection) {
    const collection = state.vault.collections.find(c => c.id === state.currentCollection.id);
    if (collection) {
      state.currentCollection = collection;
      renderItems();
    }
  }
}

function renderIcon(icon) {
  if (!icon) return '📁';
  
  if (icon.startsWith('data:') || icon.startsWith('http://') || icon.startsWith('https://')) {
    return `<img src="${icon}" alt="icon">`;
  }
  
  return icon;
}

// Get unique categories
function getCategories() {
  const categories = new Set();
  state.vault.collections.forEach(c => {
    categories.add(c.category || 'Uncategorized');
  });
  return Array.from(categories).sort();
}

// Update category datalist
function updateCategoryDatalist() {
  const datalist = document.getElementById('categoryList');
  if (!datalist) return;
  
  const categories = getCategories();
  datalist.innerHTML = categories.map(cat => `<option value="${cat}">`).join('');
}

// Render collections in sidebar grouped by category
function renderCollectionsList() {
  const container = document.getElementById('collectionsList');
  
  if (state.vault.collections.length === 0) {
    container.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.875rem;">No collections yet</div>';
    return;
  }
  
  // Group by category
  const grouped = {};
  state.vault.collections.forEach((collection, index) => {
    const cat = collection.category || 'Uncategorized';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({ ...collection, originalIndex: index });
  });
  
  const categories = Object.keys(grouped).sort();
  
  container.innerHTML = categories.map(category => `
    <div class="sidebar-category-group">
      <div class="sidebar-category-title">${escapeHtml(category)}</div>
      ${grouped[category].map(collection => `
        <button class="collection-item ${state.currentCollection?.id === collection.id ? 'active' : ''}"
                onclick="showCollection('${collection.id}')"
                draggable="true"
                data-collection-id="${collection.id}"
                ondragstart="handleCollectionDragStart(event, '${collection.id}')"
                ondragover="handleCollectionDragOver(event)"
                ondragenter="handleCollectionDragEnter(event, '${collection.id}')"
                ondragleave="handleCollectionDragLeave(event)"
                ondrop="handleCollectionDrop(event, '${collection.id}')"
                ondragend="handleCollectionDragEnd(event)">
          <div class="collection-icon" style="${collection.color === 'transparent' ? '' : 'background-color: ' + collection.color}">
            ${renderIcon(collection.icon)}
          </div>
          <div class="collection-info">
            <div class="collection-name">${escapeHtml(collection.name)}</div>
            <div class="collection-count">${collection.items.length} items</div>
          </div>
        </button>
      `).join('')}
    </div>
  `).join('');
}

// Drag & Drop for Collections
let draggedCollectionId = null;

function handleCollectionDragStart(e, collectionId) {
  draggedCollectionId = collectionId;
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleCollectionDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function handleCollectionDragEnter(e, targetId) {
  e.preventDefault();
  if (!draggedCollectionId || draggedCollectionId === targetId) return;
  
  // Remove drag-over from all items
  document.querySelectorAll('.collection-item.drag-over').forEach(el => {
    el.classList.remove('drag-over');
  });
  
  // Add drag-over to current target
  e.currentTarget.classList.add('drag-over');
}

function handleCollectionDragLeave(e) {
  // Only remove if we're leaving the element entirely (not entering a child)
  const relatedTarget = e.relatedTarget;
  if (!e.currentTarget.contains(relatedTarget)) {
    e.currentTarget.classList.remove('drag-over');
  }
}

function handleCollectionDrop(e, targetId) {
  e.preventDefault();
  
  // Remove all drag-over classes
  document.querySelectorAll('.collection-item.drag-over').forEach(el => {
    el.classList.remove('drag-over');
  });
  
  if (!draggedCollectionId || draggedCollectionId === targetId) return;
  
  const draggedIndex = state.vault.collections.findIndex(c => c.id === draggedCollectionId);
  const targetIndex = state.vault.collections.findIndex(c => c.id === targetId);
  
  if (draggedIndex === -1 || targetIndex === -1) return;
  
  const [movedCollection] = state.vault.collections.splice(draggedIndex, 1);
  state.vault.collections.splice(targetIndex, 0, movedCollection);
  
  renderCollectionsList();
  renderDashboard();
  saveVaultData();
}

function handleCollectionDragEnd(e) {
  e.target.classList.remove('dragging');
  
  // Clean up all drag-over classes
  document.querySelectorAll('.collection-item.drag-over').forEach(el => {
    el.classList.remove('drag-over');
  });
  
  draggedCollectionId = null;
}

// Delete current collection
function deleteCurrentCollection() {
  if (!state.currentCollection) return;
  deleteCollection(state.currentCollection.id);
}

// Render dashboard grouped by category
function renderDashboard() {
  const container = document.getElementById('dashboardGrid');
  
  if (state.vault.collections.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="12" y1="8" x2="12" y2="16"></line>
          <line x1="8" y1="12" x2="16" y2="12"></line>
        </svg>
        <h2>No Collections Yet</h2>
        <p>Create your first collection to start organizing your vault</p>
        <button class="btn btn-primary" onclick="openModal('collectionModal')">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Create Collection
        </button>
      </div>
    `;
    return;
  }
  
  // Group by category
  const grouped = {};
  state.vault.collections.forEach(collection => {
    const cat = collection.category || 'Uncategorized';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(collection);
  });
  
  const categories = Object.keys(grouped).sort();
  
  container.innerHTML = categories.map(category => `
    <div class="category-section" style="grid-column: 1 / -1;">
      <div class="category-header">
        <div class="category-title">${escapeHtml(category)}</div>
        <div class="category-count">${grouped[category].length} collections</div>
      </div>
      <div class="category-grid">
        ${grouped[category].map(collection => `
          <div class="dashboard-card" onclick="showCollection('${collection.id}')">
            <div class="dashboard-card-header">
              <div class="dashboard-card-icon" style="${collection.color === 'transparent' ? '' : 'background-color: ' + collection.color}">
                ${renderIcon(collection.icon)}
              </div>
              <div>
                <div class="dashboard-card-title">${escapeHtml(collection.name)}</div>
                <div class="dashboard-card-count">${collection.items.length} items</div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function showCollection(collectionId) {
  const collection = state.vault.collections.find(c => c.id === collectionId);
  if (!collection) return;
  
  state.currentCollection = collection;
  state.currentView = 'collection';
  
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.collection-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.collectionId === collectionId);
  });
  
  document.getElementById('collectionTitle').textContent = collection.name;
  document.getElementById('collectionDescription').textContent = `${collection.items.length} items in this collection`;
  
  document.getElementById('dashboardView').classList.add('hidden');
  document.getElementById('collectionView').classList.remove('hidden');
  
  renderItems();
  closeSidebar();
}

function showView(view) {
  state.currentView = view;
  state.currentCollection = null;
  
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.id === 'dashboardNav');
  });
  document.querySelectorAll('.collection-item').forEach(btn => btn.classList.remove('active'));
  
  document.getElementById('dashboardView').classList.remove('hidden');
  document.getElementById('collectionView').classList.add('hidden');
  
  closeSidebar();
}

function renderItems() {
  if (!state.currentCollection) return;
  
  const container = document.getElementById('itemsGrid');
  
  if (state.currentCollection.items.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <h2>No Items Yet</h2>
        <p>Add your first item to this collection</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = state.currentCollection.items.map(item => `
    <div class="item-card">
      <div class="item-card-header">
        <div class="item-card-title">${escapeHtml(item.name)}</div>
        <div class="item-card-actions">
          <button class="icon-btn" onclick="event.stopPropagation(); openItemModal('${item.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="icon-btn" onclick="event.stopPropagation(); deleteItem('${item.id}')" style="color: var(--danger);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="item-card-fields">
        ${item.fields.slice(0, 3).map(field => `
          <div class="item-field">
            ${field.label ? `<span class="item-field-label">${escapeHtml(field.label)}</span>` : ''}
            <span class="item-field-value">
              ${field.type === 'image' ? '<img src="' + field.value + '" style="max-width: 100px; max-height: 50px; border-radius: 4px;">' :
                field.type === 'video' ? '🎬 Video' :
                escapeHtml(field.value.substring(0, 50)) + (field.value.length > 50 ? '...' : '')}
            </span>
            ${field.type === 'text' ? `
              <button class="copy-btn" onclick="event.stopPropagation(); copyToClipboard('${escapeHtml(field.value)}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </button>
            ` : ''}
          </div>
        `).join('')}
        ${item.fields.length > 3 ? `<div class="item-field" style="color: var(--text-muted); font-size: 0.8rem;">+${item.fields.length - 3} more fields</div>` : ''}
      </div>
    </div>
  `).join('');
}

// Update item count in UI - called after any item change
function updateItemCount() {
  if (!state.currentCollection) return;
  
  // Update collection description
  document.getElementById('collectionDescription').textContent = 
    `${state.currentCollection.items.length} items in this collection`;
  
  // Update sidebar collection count
  renderCollectionsList();
  
  // Update dashboard counts
  renderDashboard();
}

// Modals
function openModal(modalId, data = null) {
  const modal = document.getElementById(modalId);
  modal.classList.remove('hidden');
  
  if (modalId === 'collectionModal') {
    const transparentRadio = document.querySelector('input[name="collectionColorRadio"]');
    const colorInput = document.getElementById('collectionColor');
    
    if (data) {
      document.getElementById('collectionModalTitle').textContent = 'Edit Collection';
      document.getElementById('collectionId').value = data.id;
      document.getElementById('collectionCategory').value = data.category || 'Uncategorized';
      document.getElementById('collectionName').value = data.name;
      document.getElementById('collectionIcon').value = data.icon;
      
      if (data.color === 'transparent') {
        if (transparentRadio) transparentRadio.checked = true;
        colorInput.value = '#3b82f6';
      } else {
        if (transparentRadio) transparentRadio.checked = false;
        colorInput.value = data.color || '#3b82f6';
      }
    } else {
      document.getElementById('collectionModalTitle').textContent = 'New Collection';
      document.getElementById('collectionId').value = '';
      document.getElementById('collectionCategory').value = '';
      document.getElementById('collectionName').value = '';
      document.getElementById('collectionIcon').value = '📁';
      colorInput.value = '#3b82f6';
      if (transparentRadio) transparentRadio.checked = false;
    }
  }
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.add('hidden');
}

function closeAllModals() {
  document.querySelectorAll('.modal').forEach(modal => modal.classList.add('hidden'));
}

// Collection Operations
async function saveCollection() {
  const id = document.getElementById('collectionId').value;
  const category = document.getElementById('collectionCategory').value.trim() || 'Uncategorized';
  const name = document.getElementById('collectionName').value.trim();
  const icon = document.getElementById('collectionIcon').value;
  
  const transparentRadio = document.querySelector('input[name="collectionColorRadio"]:checked');
  const color = transparentRadio && transparentRadio.value === 'transparent' 
    ? 'transparent' 
    : document.getElementById('collectionColor').value;
  
  if (!name) {
    showToast('Please enter collection name', 'warning');
    return;
  }
  
  if (id) {
    const collection = state.vault.collections.find(c => c.id === id);
    if (collection) {
      collection.category = category;
      collection.name = name;
      collection.icon = icon;
      collection.color = color;
    }
  } else {
    state.vault.collections.push({
      id: generateId(),
      category,
      name,
      icon,
      color,
      items: []
    });
  }
  
  await saveVaultData();
  renderVault();
  closeModal('collectionModal');
  showToast(id ? 'Collection updated' : 'Collection created', 'success');
}

function editCurrentCollection() {
  if (!state.currentCollection) return;
  openModal('collectionModal', state.currentCollection);
}

async function deleteCollection(collectionId) {
  const collection = state.vault.collections.find(c => c.id === collectionId);
  if (!collection) return;
  
  if (confirm(`Delete collection "${collection.name}" and all its items?`)) {
    state.vault.collections = state.vault.collections.filter(c => c.id !== collectionId);
    await saveVaultData();
    
    if (state.currentCollection?.id === collectionId) {
      showView('dashboard');
    }
    
    renderVault();
    showToast('Collection deleted', 'success');
  }
}

function handleCollectionIconUpload(e) {
  const file = e.target?.files?.[0];
  if (!file) return;
  
  if (!file.type.startsWith('image/')) {
    showToast('Please select an image file', 'warning');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = (event) => {
    document.getElementById('collectionIcon').value = event.target.result;
  };
  reader.readAsDataURL(file);
}

// Item Operations
function openItemModal(itemId = null) {
  if (!state.currentCollection) return;
  
  const modal = document.getElementById('itemModal');
  modal.classList.remove('hidden');
  
  if (itemId) {
    const item = state.currentCollection.items.find(i => i.id === itemId);
    if (!item) return;
    
    document.getElementById('itemModalTitle').textContent = 'Edit Item';
    document.getElementById('itemId').value = item.id;
    document.getElementById('itemName').value = item.name;
    
    const container = document.getElementById('fieldsContainer');
    container.innerHTML = item.fields.map((field, index) => createFieldHTML(field, index)).join('');
  } else {
    document.getElementById('itemModalTitle').textContent = 'New Item';
    document.getElementById('itemId').value = '';
    document.getElementById('itemName').value = '';
    
    const container = document.getElementById('fieldsContainer');
    container.innerHTML = createFieldHTML({ label: '', value: '', type: 'text' }, 0);
  }
}

function createFieldHTML(field, index) {
  const types = ['text', 'image', 'video'];
  
  return `
    <div class="field-row" data-field-index="${index}">
      <input type="text" placeholder="Label" value="${escapeHtml(field.label)}" class="field-label">
      <select class="field-type" onchange="handleFieldTypeChange(this, ${index})">
        ${types.map(t => `<option value="${t}" ${field.type === t ? 'selected' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('')}
      </select>
      <button class="icon-btn field-remove" onclick="removeField(${index})">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      ${field.type === 'image' || field.type === 'video' ? `
        <div style="grid-column: 1 / 3;">
          <input type="file" accept="${field.type === 'image' ? 'image/*' : 'video/*'}" 
                 onchange="handleFileUpload(this, ${index})" style="width: 100%;">
          ${field.value ? `
            <div class="field-preview">
              ${field.type === 'image' ? 
                `<img src="${field.value}" alt="preview">` : 
                `<video src="${field.value}" controls></video>`}
            </div>
          ` : ''}
          <input type="hidden" class="field-value" value="${escapeHtml(field.value)}">
        </div>
      ` : `
        <input type="${field.type === 'password' ? 'password' : 'text'}" 
               placeholder="Value" value="${escapeHtml(field.value)}" 
               class="field-value" style="grid-column: 1 / 3;">
      `}
    </div>
  `;
}

function handleFieldTypeChange(select, index) {
  const container = document.getElementById('fieldsContainer');
  const fieldRow = container.querySelector(`[data-field-index="${index}"]`);
  
  const label = fieldRow.querySelector('.field-label').value;
  const newField = { label, value: '', type: select.value };
  
  fieldRow.outerHTML = createFieldHTML(newField, index);
}

function handleFileUpload(input, index) {
  const file = input.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    const container = document.getElementById('fieldsContainer');
    const fieldRow = container.querySelector(`[data-field-index="${index}"]`);
    const hiddenInput = fieldRow.querySelector('.field-value');
    hiddenInput.value = e.target.result;
    
    const preview = fieldRow.querySelector('.field-preview');
    if (preview) {
      const type = fieldRow.querySelector('.field-type').value;
      preview.innerHTML = type === 'image' ? 
        `<img src="${e.target.result}" alt="preview">` : 
        `<video src="${e.target.result}" controls></video>`;
    }
  };
  reader.readAsDataURL(file);
}

function addField() {
  const container = document.getElementById('fieldsContainer');
  const index = container.children.length;
  container.insertAdjacentHTML('beforeend', createFieldHTML({ label: '', value: '', type: 'text' }, index));
}

function removeField(index) {
  const container = document.getElementById('fieldsContainer');
  const fieldRow = container.querySelector(`[data-field-index="${index}"]`);
  if (fieldRow && container.children.length > 1) {
    fieldRow.remove();
    // Re-index remaining fields
    Array.from(container.children).forEach((row, i) => {
      row.dataset.fieldIndex = i;
    });
  }
}

async function saveItem() {
  const id = document.getElementById('itemId').value;
  const name = document.getElementById('itemName').value.trim();
  
  if (!name) {
    showToast('Please enter item name', 'warning');
    return;
  }
  
  const container = document.getElementById('fieldsContainer');
  const fields = Array.from(container.children).map(row => ({
    label: row.querySelector('.field-label').value.trim(),
    type: row.querySelector('.field-type').value,
    value: row.querySelector('.field-value').value
  })).filter(f => f.value); // Only require value, label is optional
  
  if (id) {
    const item = state.currentCollection.items.find(i => i.id === id);
    if (item) {
      item.name = name;
      item.fields = fields;
    }
  } else {
    state.currentCollection.items.push({
      id: generateId(),
      name,
      fields
    });
  }
  
  await saveVaultData();
  renderItems();
  updateItemCount();
  closeModal('itemModal');
  showToast(id ? 'Item updated' : 'Item created', 'success');
}

async function deleteItem(itemId) {
  if (!state.currentCollection) return;
  
  const item = state.currentCollection.items.find(i => i.id === itemId);
  if (!item) return;
  
  if (confirm(`Delete item "${item.name}"?`)) {
    state.currentCollection.items = state.currentCollection.items.filter(i => i.id !== itemId);
    await saveVaultData();
    renderItems();
    updateItemCount();
    showToast('Item deleted', 'success');
  }
}

// Utilities
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied to clipboard', 'success');
  }).catch(() => {
    showToast('Failed to copy', 'danger');
  });
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast glass show';
  
  if (type === 'danger') {
    toast.style.borderColor = 'var(--danger)';
  } else if (type === 'success') {
    toast.style.borderColor = 'var(--success)';
  } else if (type === 'warning') {
    toast.style.borderColor = 'var(--warning)';
  } else {
    toast.style.borderColor = 'var(--primary)';
  }
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
