// Library Management
let libraryState = {
  items: [],
  trialPhotos: [],
  agronomyPhotos: [],
  folderId: null,
  selectedId: null,
  previewUrl: null,
  searchQuery: "",
  activeFilter: "all",
  sortBy: "modifiedTime",
  sortDir: "desc",
  section: "files", // "files" | "observation-photos" | "agronomy-photos"
  uploading: {}, // Track upload progress by file name: { filename: { progress: 0-100 } }
  _filePreviewCache: {}, // fileId -> objectUrl for image thumbnails
  _filePreviewPromises: {}, // fileId -> Promise while thumbnail is loading
  _driveLoaded: false, // Whether items have been loaded from Drive this session
  _trialPhotosLoaded: false,
  _agronomyPhotosLoaded: false,
  // Background scanning/conversion tracking
  _scanningInline: false,
  _scanProgress: null,
  _convertingInline: false,
  _convertProgress: null,
  _operationAbort: null,
  _openTrialPhotoFolderId: null, // Currently open trial folder for photo views
  _openLibraryFolderId: null, // Currently open folder for uploaded files view
  _openLibraryFolderName: null, // Name of the currently open folder
  _libraryFolders: [], // Subfolders within Library drive folder
};

async function initializeLibrary(options = {}) {
  const onProgress = options.onProgress;

  try {
    // Load from local cache only (no Drive fetch at startup)
    let cached = null;
    if (typeof loadLocalCache === "function") {
      cached = await loadLocalCache("library");
    }

    if (cached?.items) {
      libraryState.items = cached.items;
      renderLibraryList();
      if (onProgress) {
        onProgress(0.5, "Loaded library from device");
      }
    }

    libraryState.folderId = await getOrCreateFolder(
      "Library",
      driveState.advantaFolderId,
    );
    setupLibraryEvents();

    // Do NOT load from Drive here — will be lazy-loaded on first Library page visit
    if (onProgress) {
      onProgress(1, "Library initialized");
    }
  } catch (error) {
    console.error("Error initializing library:", error);
  }
}

let _libraryEventsSetUp = false;
function setupLibraryEvents() {
  if (_libraryEventsSetUp) return;
  _libraryEventsSetUp = true;
  const uploadBtn = document.getElementById("uploadLibraryBtn");
  const uploadInput = document.getElementById("libraryUploadInput");
  const renameBtn = document.getElementById("libraryRenameBtn");
  const deleteBtn = document.getElementById("libraryDeleteBtn");
  const downloadBtn = document.getElementById("libraryDownloadBtn");
  const closeBtn = document.getElementById("libraryCloseBtn");
  const searchInput = document.getElementById("librarySearchInput");
  const filterTrigger = document.getElementById("libraryFilterTrigger");
  const filterDropdown = document.getElementById("libraryFilterDropdown");
  const filterItems = document.querySelectorAll(".library-filter-item");
  const sortBySelect = document.getElementById("librarySortBy");
  const sortDirSelect = document.getElementById("librarySortDir");
  if (uploadBtn && uploadInput) {
    uploadBtn.addEventListener("click", () => uploadInput.click());
    uploadInput.addEventListener("change", async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;
      await uploadLibraryFiles(files);
      uploadInput.value = "";
    });
  }

  // Refresh button (incremental — only fetches new files)
  const refreshBtn = document.getElementById("refreshLibraryBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      refreshBtn.disabled = true;
      refreshBtn.querySelector("span:last-child").textContent = "Refreshing...";
      try {
        if (libraryState.section === "observation-photos") {
          await loadTrialPhotoItems({ force: true });
        } else if (libraryState.section === "agronomy-photos") {
          await loadAgronomyPhotoItems({ force: true });
        } else {
          await incrementalRefreshLibrary();
        }
      } finally {
        refreshBtn.disabled = false;
        refreshBtn.querySelector("span:last-child").textContent = "Refresh";
      }
    });
  }

  if (renameBtn) {
    renameBtn.addEventListener("click", () => renameLibraryItem());
  }

  if (deleteBtn) {
    deleteBtn.addEventListener("click", () => deleteLibraryItem());
  }

  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => downloadLibraryItem());
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => closeLibraryDetail());
  }

  // Search functionality
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      libraryState.searchQuery = e.target.value.toLowerCase();
      renderLibraryList();
    });
  }

  // Filter dropdown functionality
  if (filterTrigger && filterDropdown) {
    filterTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      filterDropdown.classList.toggle("active");
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (
        !filterDropdown.contains(e.target) &&
        !filterTrigger.contains(e.target)
      ) {
        filterDropdown.classList.remove("active");
      }
    });
  }

  // Filter item selection
  filterItems.forEach((item) => {
    item.addEventListener("click", () => {
      filterItems.forEach((i) => i.classList.remove("active"));
      item.classList.add("active");
      libraryState.activeFilter = item.dataset.filter;
      renderLibraryList();
      // Keep dropdown open for better UX
      // filterDropdown.classList.remove("active");
    });
  });

  // Sort/View dropdown trigger
  const sortBtn = document.getElementById("librarySortBtn");
  if (sortBtn) {
    sortBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleToolbarDropdown("librarySortBtn", "librarySortDropdown");
    });
  }

  if (sortBySelect) {
    sortBySelect.value = libraryState.sortBy;
    sortBySelect.addEventListener("change", (e) => {
      libraryState.sortBy = e.target.value;
      renderLibraryList();
    });
  }

  if (sortDirSelect) {
    sortDirSelect.value = libraryState.sortDir;
    sortDirSelect.addEventListener("change", (e) => {
      libraryState.sortDir = e.target.value;
      renderLibraryList();
    });
  }
}

function setLibraryStatus(message, type = "info") {
  const banner = document.getElementById("libraryStatusBanner");
  if (!banner) return;

  if (!message) {
    banner.textContent = "";
    banner.classList.add("hidden");
    banner.classList.remove("info", "success", "warning", "error", "loading");
    return;
  }

  banner.classList.remove("hidden", "info", "success", "warning", "error", "loading");
  banner.classList.add(type);
  banner.textContent = message;
}

function clearLibraryStatus(delayMs = 0) {
  if (delayMs > 0) {
    setTimeout(() => setLibraryStatus(""), delayMs);
    return;
  }
  setLibraryStatus("");
}

async function switchLibrarySection(section = "files") {
  const validSections = ["files", "observation-photos", "agronomy-photos"];
  const nextSection = validSections.includes(section) ? section : "files";
  libraryState.section = nextSection;
  libraryState.selectedId = null;
  libraryState._openTrialPhotoFolderId = null;
  libraryState._openLibraryFolderId = null;
  libraryState._openLibraryFolderName = null;

  const uploadBtn = document.getElementById("uploadLibraryBtn");
  const uploadInput = document.getElementById("libraryUploadInput");
  const createFolderBtn = document.getElementById("createLibraryFolderBtn");
  const filterContainer = document.querySelector(".library-filter-container");
  const searchInput = document.getElementById("librarySearchInput");
  const actionBarContainer = document.getElementById("trialPhotoActionsContainer");

  if (nextSection === "observation-photos" || nextSection === "agronomy-photos") {
    if (uploadBtn) uploadBtn.classList.add("hidden");
    if (uploadInput) uploadInput.classList.add("hidden");
    if (createFolderBtn) createFolderBtn.classList.add("hidden");
    if (filterContainer) filterContainer.classList.add("hidden");
    if (actionBarContainer) actionBarContainer.classList.toggle("hidden", nextSection !== "observation-photos");
    libraryState.activeFilter = "all";

    if (nextSection === "observation-photos") {
      if (searchInput) searchInput.placeholder = "Search observation photos...";
      if (libraryState._scanningInline) {
        setLibraryStatus("Scanning inline photos in background...", "loading");
      } else if (libraryState._convertingInline) {
        setLibraryStatus("Converting inline photos in background...", "loading");
      } else {
        setLibraryStatus("Loading observation photos in background...", "loading");
      }
      loadTrialPhotoItems().catch(() => {});
    } else {
      if (searchInput) searchInput.placeholder = "Search agronomy photos...";
      if (actionBarContainer) actionBarContainer.classList.add("hidden");
      setLibraryStatus("Loading agronomy photos in background...", "loading");
      loadAgronomyPhotoItems().catch(() => {});
    }
  } else {
    if (uploadBtn) uploadBtn.classList.remove("hidden");
    if (uploadInput) uploadInput.classList.remove("hidden");
    if (createFolderBtn) createFolderBtn.classList.remove("hidden");
    if (filterContainer) filterContainer.classList.remove("hidden");
    if (actionBarContainer) actionBarContainer.classList.add("hidden");
    if (searchInput) searchInput.placeholder = "Search files...";
    renderLibraryList();
    setLibraryStatus("Loading uploaded files in background...", "loading");
    lazyLoadLibraryFromDrive().catch(() => {});
  }

  updateLibraryHeaderTitle();
  closeLibraryDetail();
}

function ensureLibrarySectionLoaded() {
  if (libraryState.section === "observation-photos") {
    setLibraryStatus("Loading observation photos in background...", "loading");
    loadTrialPhotoItems().catch(() => {});
    return;
  }
  if (libraryState.section === "agronomy-photos") {
    setLibraryStatus("Loading agronomy photos in background...", "loading");
    loadAgronomyPhotoItems().catch(() => {});
    return;
  }
  setLibraryStatus("Loading uploaded files in background...", "loading");
  lazyLoadLibraryFromDrive().catch(() => {});
}

async function loadLibraryItems() {
  if (!libraryState.folderId) return;
  const targetFolderId = libraryState._openLibraryFolderId || libraryState.folderId;

  const response = await gapi.client.drive.files.list({
    q: `'${targetFolderId}' in parents and trashed=false`,
    fields: "files(id, name, mimeType, modifiedTime, size)",
    orderBy: "modifiedTime desc",
    pageSize: 1000,
  });

  libraryState.items = response.result.files || [];
  renderLibraryList();

  if (typeof saveLocalCache === "function") {
    saveLocalCache("library", { items: libraryState.items });
  }
}

/**
 * Lazy-load library items from Drive on first visit to the Library page.
 * Runs in background and updates inline status. Skips if already loaded this session.
 */
async function lazyLoadLibraryFromDrive() {
  if (libraryState._driveLoaded && !libraryState._openLibraryFolderId) return;
  if (!libraryState.folderId) return;
  const targetFolderId = libraryState._openLibraryFolderId || libraryState.folderId;

  setLibraryStatus("Loading uploaded files from Drive...", "loading");

  try {
    const response = await gapi.client.drive.files.list({
      q: `'${targetFolderId}' in parents and trashed=false`,
      fields: "files(id, name, mimeType, modifiedTime, size)",
      orderBy: "modifiedTime desc",
      pageSize: 1000,
    });

    const files = response.result.files || [];
    libraryState.items = files;
    if (!libraryState._openLibraryFolderId) libraryState._driveLoaded = true;
    renderLibraryList();

    if (!libraryState._openLibraryFolderId && typeof saveLocalCache === "function") {
      saveLocalCache("library", { items: libraryState.items });
    }

    setLibraryStatus(`Uploaded files loaded (${files.length}).`, "success");
    clearLibraryStatus(3000);
  } catch (error) {
    console.error("Error lazy-loading library:", error);
    setLibraryStatus("Error loading uploaded files from Drive.", "error");
  }
}

/**
 * Incremental refresh: only fetches new files from Drive that aren't already in the local list.
 * Existing files are kept as-is for fast refresh.
 */
async function incrementalRefreshLibrary() {
  if (!libraryState.folderId) return;
  const targetFolderId = libraryState._openLibraryFolderId || libraryState.folderId;

  try {
    const response = await gapi.client.drive.files.list({
      q: `'${targetFolderId}' in parents and trashed=false`,
      fields: "files(id, name, mimeType, modifiedTime, size)",
      orderBy: "modifiedTime desc",
      pageSize: 1000,
    });

    const driveFiles = response.result.files || [];
    const existingIds = new Set(libraryState.items.map(f => f.id));
    const driveIds = new Set(driveFiles.map(f => f.id));

    // Find new files (in Drive but not in local)
    const newFiles = driveFiles.filter(f => !existingIds.has(f.id));
    // Find removed files (in local but no longer in Drive)
    const remainingItems = libraryState.items.filter(f => driveIds.has(f.id));

    // Merge: keep existing + add new
    libraryState.items = [...newFiles, ...remainingItems];
    // Re-sort by modifiedTime desc (default)
    libraryState.items.sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime));

    renderLibraryList();

    if (typeof saveLocalCache === "function") {
      saveLocalCache("library", { items: libraryState.items });
    }

    if (newFiles.length > 0) {
      showToast(`${newFiles.length} new file(s) added to library.`, "success");
    } else {
      showToast("Library is up to date.", "info");
    }
  } catch (error) {
    console.error("Error refreshing library:", error);
    showToast("Error refreshing library.", "error");
  }
}

/**
 * Parse observation photo filename into structured parts.
 * Format: ParamName_RepX_PlotName_SampleY_uuid.webp
 */
function _parseObservationPhotoFileName(fileName) {
  const base = fileName.replace(/\.[^.]+$/, "");
  const parts = base.split("_");
  const result = { paramName: null, repLabel: null, entryName: null, sampleNum: null };
  if (parts.length >= 5) {
    const repIdx = parts.findIndex((p) => /^Rep\d+$/i.test(p));
    const sampleIdx = parts.findIndex((p) => /^Sample\d+$/i.test(p));
    if (repIdx > 0 && sampleIdx > repIdx) {
      result.paramName = parts.slice(0, repIdx).join(" ");
      result.repLabel = parts[repIdx];
      result.entryName = parts.slice(repIdx + 1, sampleIdx).join(" ");
      result.sampleNum = parts[sampleIdx].replace(/^Sample/i, "");
    }
  }
  return result;
}

/**
 * Derive a human-readable display name from a photo filename.
 * New format: ParamName_RepX_PlotName_SampleY_uuid.webp
 * Old format: uuid.webp (fallback)
 * Display: TrialName_ParamName_RepX_PlotName_SampleY
 */
function _derivePhotoDisplayName(fileName, trialName) {
  const base = fileName.replace(/\.[^.]+$/, ""); // strip extension
  const parts = base.split("_");
  // New format has at least 5 parts: param, RepX, plot, SampleY, uuid
  if (parts.length >= 5) {
    const repPart = parts.find((p) => /^Rep\d+$/i.test(p));
    const samplePart = parts.find((p) => /^Sample\d+$/i.test(p));
    if (repPart && samplePart) {
      const repIdx = parts.indexOf(repPart);
      const sampleIdx = parts.indexOf(samplePart);
      const paramName = parts.slice(0, repIdx).join(" ");
      const plotName = parts.slice(repIdx + 1, sampleIdx).join(" ");
      const prefix = trialName ? `${trialName}_` : "";
      return `${prefix}${paramName}_${repPart}_${plotName}_${samplePart}`;
    }
  }
  // Fallback: return filename without extension
  return trialName ? `${trialName}_${base}` : base;
}

async function loadTrialPhotoItems(options = {}) {
  const { force = false } = options;
  if (libraryState._trialPhotosLoaded && !force) {
    renderLibraryList();
    return;
  }

  setTrialPhotoProgress(0, "Fetching trial folders...");

  try {
    const rootFolderId = await getTrialsFolderId();
    const trialFoldersResp = await gapi.client.drive.files.list({
      q: `'${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id,name)",
      pageSize: 1000,
    });
    const trialFolders = trialFoldersResp.result.files || [];
    const allPhotos = [];
    const total = trialFolders.length;
    const BATCH = 5;
    let done = 0;

    // Scan trial folders in parallel batches
    for (let i = 0; i < total; i += BATCH) {
      const batch = trialFolders.slice(i, i + BATCH);
      const batchResults = await Promise.all(batch.map(async (trialFolder) => {
        const trialId = trialFolder.name;
        const trialName = trialState?.trials?.find((t) => t.id === trialId)?.name || trialId;
        const photos = [];

        const photosFolder = await findFolder("photos", trialFolder.id);
        if (photosFolder) {
          const photoFilesResp = await gapi.client.drive.files.list({
            q: `'${photosFolder.id}' in parents and trashed=false`,
            fields: "files(id,name,mimeType,modifiedTime,size)",
            pageSize: 1000,
          });
          (photoFilesResp.result.files || []).forEach((file) => {
            if (!String(file.mimeType || "").startsWith("image/")) return;
            const parsed = _parseObservationPhotoFileName(file.name);
            photos.push({
              id: `binary:${file.id}`,
              section: "observation-photos",
              storageType: "binary",
              trialId,
              trialName,
              trialFolderId: trialFolder.id,
              name: _derivePhotoDisplayName(file.name, trialName),
              rawFileName: file.name,
              paramName: parsed.paramName,
              repLabel: parsed.repLabel,
              entryName: parsed.entryName,
              sampleNum: parsed.sampleNum,
              mimeType: file.mimeType,
              modifiedTime: file.modifiedTime,
              size: file.size,
              driveFileId: file.id,
            });
          });
        }
        return photos;
      }));

      batchResults.forEach((photos) => allPhotos.push(...photos));
      done += batch.length;
      const pct = Math.round((done / total) * 100);
      const lastName = trialState?.trials?.find((t) => t.id === batch[batch.length - 1].name)?.name || batch[batch.length - 1].name;
      setTrialPhotoProgress(pct, `Scanning photos: ${lastName} (${done}/${total})`);
    }

    libraryState.trialPhotos = allPhotos;
    libraryState._trialPhotosLoaded = true;
    renderLibraryList();
    clearTrialPhotoProgress();
    setLibraryStatus(`Observation photos loaded (${allPhotos.length} binary files).`, "success");
    clearLibraryStatus(3000);
  } catch (error) {
    console.error("Error loading observation photos:", error);
    clearTrialPhotoProgress();
    setLibraryStatus("Failed to load observation photos.", "error");
  }
}

async function loadAgronomyPhotoItems(options = {}) {
  const { force = false } = options;
  if (libraryState._agronomyPhotosLoaded && !force) {
    renderLibraryList();
    return;
  }

  setLibraryStatus("Loading agronomy photos...", "loading");

  try {
    const rootFolderId = await getTrialsFolderId();
    const trialFoldersResp = await gapi.client.drive.files.list({
      q: `'${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id,name)",
      pageSize: 1000,
    });
    const trialFolders = trialFoldersResp.result.files || [];
    const allPhotos = [];
    const BATCH = 5;
    let done = 0;
    const total = trialFolders.length;

    for (let i = 0; i < total; i += BATCH) {
      const batch = trialFolders.slice(i, i + BATCH);
      const batchResults = await Promise.all(batch.map(async (trialFolder) => {
        const trialId = trialFolder.name;
        const trial = trialState?.trials?.find((t) => t.id === trialId);
        const trialName = trial?.name || trialId;
        const photos = [];

        const agronomyPhotosFolder = await findFolder("agronomy-photos", trialFolder.id);
        if (agronomyPhotosFolder) {
          const photoFilesResp = await gapi.client.drive.files.list({
            q: `'${agronomyPhotosFolder.id}' in parents and trashed=false`,
            fields: "files(id,name,mimeType,modifiedTime,size)",
            pageSize: 1000,
          });
          (photoFilesResp.result.files || []).forEach((file) => {
            if (!String(file.mimeType || "").startsWith("image/")) return;
            photos.push({
              id: `binary:${file.id}`,
              section: "agronomy-photos",
              storageType: "binary",
              trialId,
              trialName,
              trialFolderId: trialFolder.id,
              name: _deriveAgronomyPhotoDisplayName(file.name, trialName),
              rawFileName: file.name,
              mimeType: file.mimeType,
              modifiedTime: file.modifiedTime,
              size: file.size,
              driveFileId: file.id,
            });
          });
        }
        return photos;
      }));

      batchResults.forEach((photos) => allPhotos.push(...photos));
      done += batch.length;
    }

    libraryState.agronomyPhotos = allPhotos;
    libraryState._agronomyPhotosLoaded = true;
    renderLibraryList();
    setLibraryStatus(`Agronomy photos loaded (${allPhotos.length} files).`, "success");
    clearLibraryStatus(3000);
  } catch (error) {
    console.error("Error loading agronomy photos:", error);
    setLibraryStatus("Failed to load agronomy photos.", "error");
  }
}

/**
 * Derive a human-readable display name from an agronomy photo filename.
 * Format: ItemActivity_AreaName_uuid.webp
 * Display: TrialName_ItemActivity_AreaName
 */
function _deriveAgronomyPhotoDisplayName(fileName, trialName) {
  const base = fileName.replace(/\.[^.]+$/, "");
  const parts = base.split("_");
  // Format: ItemActivity_AreaName_uuid — at least 3 parts
  if (parts.length >= 3) {
    // Last part is uuid, skip it
    const meaningful = parts.slice(0, -1).join("_");
    return trialName ? `${trialName}_${meaningful}` : meaningful;
  }
  return trialName ? `${trialName}_${base}` : base;
}

function renderAgronomyPhotoList(container) {
  const allItems = libraryState.agronomyPhotos || [];

  if (!libraryState._openTrialPhotoFolderId) {
    // Show folder view grouped by trial
    renderAgronomyPhotoFolders(container, allItems);
    return;
  }

  // Show photos inside the selected trial folder
  const query = (libraryState.searchQuery || "").toLowerCase();
  const folderId = libraryState._openTrialPhotoFolderId;

  let filtered = allItems.filter((item) => {
    if (item.trialId !== folderId) return false;
    if (!query) return true;
    return [item.name, item.trialName, item.rawFileName].filter(Boolean).join(" ").toLowerCase().includes(query);
  });

  const sortDir = libraryState.sortDir === "asc" ? 1 : -1;
  filtered = filtered.sort((a, b) => {
    switch (libraryState.sortBy) {
      case "name": return (a.name || "").localeCompare(b.name || "") * sortDir;
      case "size": return (Number(a.size || 0) - Number(b.size || 0)) * sortDir;
      case "modifiedTime":
      default: return (new Date(a.modifiedTime || 0).getTime() - new Date(b.modifiedTime || 0).getTime()) * sortDir;
    }
  });

  if (filtered.length === 0) {
    container.classList.add("library-grid-empty");
    container.innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-rounded">agriculture</span>
        <p>No agronomy photos found in this trial.</p>
      </div>
    `;
    return;
  }

  container.classList.remove("library-grid-empty");
  container.innerHTML = filtered.map((item) => {
    const dateLabel = item.modifiedTime ? new Date(item.modifiedTime).toLocaleDateString() : "-";
    const metaRight = `${formatFileSize(Number(item.size || 0))} · ${dateLabel}`;
    return `
      <div class="library-item" data-trial-photo-id="${item.id}">
        <div class="library-item-icon">
          ${renderTrialPhotoPreview(item)}
        </div>
        <div class="library-item-info">
          <div class="library-item-name">${escapeHtml(item.name || "Photo")}</div>
          <div class="library-item-meta">${escapeHtml(metaRight)}</div>
        </div>
        <div class="library-item-storage">${getTrialPhotoStorageBadge(item.storageType)}</div>
      </div>
    `;
  }).join("");

  loadExternalPhotos(container);

  container.querySelectorAll(".library-item[data-trial-photo-id]").forEach((row) => {
    row.addEventListener("click", () => {
      openTrialPhotoDetail(row.dataset.trialPhotoId);
    });
  });
}

function renderAgronomyPhotoFolders(container, allItems) {
  const query = (libraryState.searchQuery || "").toLowerCase();
  const trialMap = new Map();
  for (const item of allItems) {
    const tid = item.trialId || "unknown";
    if (!trialMap.has(tid)) trialMap.set(tid, { trialId: tid, trialName: item.trialName || tid, photos: [] });
    trialMap.get(tid).photos.push(item);
  }
  let folders = Array.from(trialMap.values());
  if (query) folders = folders.filter(f => f.trialName.toLowerCase().includes(query));
  folders.sort((a, b) => a.trialName.localeCompare(b.trialName));

  if (folders.length === 0) {
    container.classList.add("library-grid-empty");
    container.innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-rounded">agriculture</span>
        <p>${allItems.length === 0 ? "No agronomy photos found." : "No trials match your search."}</p>
      </div>
    `;
    return;
  }

  container.classList.remove("library-grid-empty");
  container.innerHTML = folders.map(f => {
    const photoCount = f.photos.length;
    const latestDate = f.photos.reduce((max, p) => {
      const d = new Date(p.modifiedTime || 0).getTime();
      return d > max ? d : max;
    }, 0);
    const dateLabel = latestDate ? new Date(latestDate).toLocaleDateString() : "";
    return `
      <div class="library-folder-card" data-trial-folder-id="${escapeHtml(f.trialId)}">
        <div class="folder-card-icon">
          <span class="material-symbols-rounded" style="font-size:36px;color:var(--primary)">agriculture</span>
        </div>
        <div class="folder-card-meta">
          <div class="folder-card-name">${escapeHtml(f.trialName)}</div>
          <div class="folder-card-count">${photoCount} photo${photoCount !== 1 ? "s" : ""}${dateLabel ? " · " + dateLabel : ""}</div>
        </div>
        <div class="folder-card-actions">
          <span class="material-symbols-rounded" style="color:var(--text-tertiary);font-size:20px;">chevron_right</span>
        </div>
      </div>
    `;
  }).join("");

  loadExternalPhotos(container);

  container.querySelectorAll(".library-folder-card").forEach(card => {
    card.addEventListener("click", () => {
      openTrialPhotoFolder(card.dataset.trialFolderId);
    });
  });
}

function setTrialPhotoProgress(pct, message) {
  const banner = document.getElementById("libraryStatusBanner");
  if (!banner) return;
  banner.classList.remove("hidden", "info", "success", "warning", "error", "loading");
  banner.classList.add("loading");
  banner.innerHTML = `
    <div class="trial-photo-progress-text">${escapeHtml(message || "")}</div>
    <div class="trial-photo-progress-bar">
      <div class="trial-photo-progress-fill" style="width: ${Math.min(100, Math.max(0, pct))}%"></div>
    </div>
  `;
}

function clearTrialPhotoProgress() {
  const banner = document.getElementById("libraryStatusBanner");
  if (!banner) return;
  banner.classList.add("hidden");
  banner.classList.remove("loading");
  banner.innerHTML = "";
}

async function scanInlineTrialPhotos() {
  // If already scanning, don't start another
  if (libraryState._scanningInline) {
    showToast("Scan already in progress...", "info");
    return;
  }

  // Create abort controller for this operation
  libraryState._operationAbort = new AbortController();
  libraryState._scanningInline = true;

  try {
    const rootFolderId = await getTrialsFolderId();
    const trialFoldersResp = await gapi.client.drive.files.list({
      q: `'${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id,name)",
      pageSize: 1000,
    });
    const trialFolders = trialFoldersResp.result.files || [];
    
    // Resume from saved progress if available
    let inlinePhotos = libraryState._scanProgress?.discoveredPhotos || [];
    let startIndex = libraryState._scanProgress?.lastIndex || 0;
    
    const total = trialFolders.length;
    setTrialPhotoProgress(Math.round((startIndex / total) * 100), `Scanning inline: resuming from trial ${startIndex + 1}/${total}`);

    for (let i = startIndex; i < total; i++) {
      // Check if operation was cancelled
      if (libraryState._operationAbort?.signal.aborted) {
        console.log("Scan cancelled by user");
        break;
      }

      const trialFolder = trialFolders[i];
      const trialId = trialFolder.name;
      const trialName = trialState?.trials?.find((t) => t.id === trialId)?.name || trialId;
      const pct = Math.round(((i + 1) / total) * 100);
      setTrialPhotoProgress(pct, `Scanning inline: ${trialName} (${i + 1}/${total})`);

      const [responsesFolder, agronomyFolder] = await Promise.all([
        findFolder("responses", trialFolder.id),
        findFolder("agronomy", trialFolder.id),
      ]);

      const jsonFiles = [];
      if (responsesFolder) {
        const respList = await gapi.client.drive.files.list({
          q: `'${responsesFolder.id}' in parents and mimeType='application/json' and trashed=false`,
          fields: "files(id,name,modifiedTime)",
          pageSize: 1000,
        });
        (respList.result.files || []).forEach((f) => jsonFiles.push({ ...f, scope: "responses" }));
      }
      if (agronomyFolder) {
        const agroList = await gapi.client.drive.files.list({
          q: `'${agronomyFolder.id}' in parents and mimeType='application/json' and trashed=false`,
          fields: "files(id,name,modifiedTime)",
          pageSize: 1000,
        });
        (agroList.result.files || []).forEach((f) => jsonFiles.push({ ...f, scope: "agronomy" }));
      }

      for (const file of jsonFiles) {
        let data;
        try {
          data = await getFileContent(file.id);
        } catch (_) {
          continue;
        }
        if (!data || typeof data !== "object") continue;

        const areaMatch = String(file.name || "").match(/^(\d+)[~_]/);
        const areaIndex = areaMatch ? areaMatch[1] : null;
        collectInlinePhotosFromJson(data, {
          trialId,
          trialName,
          trialFolderId: trialFolder.id,
          sourceFileId: file.id,
          sourceFileName: file.name,
          sourceScope: file.scope,
          areaIndex,
          modifiedTime: file.modifiedTime,
        }, inlinePhotos);
      }

      // Save progress in case user navigates away
      libraryState._scanProgress = {
        lastIndex: i + 1,
        total: total,
        discoveredPhotos: inlinePhotos,
      };
    }

    // Merge with existing binary photos (avoid duplicates)
    const existingIds = new Set((libraryState.trialPhotos || []).map((p) => p.id));
    const newInline = inlinePhotos.filter((p) => !existingIds.has(p.id));
    libraryState.trialPhotos = [...(libraryState.trialPhotos || []), ...newInline];

    clearTrialPhotoProgress();
    libraryState._scanningInline = false;
    libraryState._scanProgress = null;
    libraryState._operationAbort = null;
    
    renderLibraryList();

    if (newInline.length > 0) {
      setLibraryStatus(`Found ${newInline.length} inline photo(s) not yet stored as binary.`, "warning");
    } else {
      setLibraryStatus("All photos are already stored as binary files.", "success");
      clearLibraryStatus(3000);
    }
  } catch (error) {
    console.error("Error scanning inline photos:", error);
    clearTrialPhotoProgress();
    libraryState._scanningInline = false;
    libraryState._scanProgress = null;
    libraryState._operationAbort = null;
    setLibraryStatus("Failed to scan inline photos.", "error");
  }
}

async function convertAllInlinePhotosToBinary() {
  // If already converting, don't start another
  if (libraryState._convertingInline) {
    showToast("Conversion already in progress...", "info");
    return;
  }

  const inlineItems = (libraryState.trialPhotos || []).filter((p) => p.storageType === "inline-json");
  if (inlineItems.length === 0) {
    showToast("No inline photos to convert.", "info");
    return;
  }

  // Create abort controller for this operation
  libraryState._operationAbort = new AbortController();
  libraryState._convertingInline = true;

  const total = inlineItems.length;
  let converted = libraryState._convertProgress?.converted || 0;
  let failed = libraryState._convertProgress?.failed || 0;
  let sourceIndex = libraryState._convertProgress?.sourceIndex || 0;
  let itemIndex = libraryState._convertProgress?.itemIndex || 0;
  
  setTrialPhotoProgress(Math.round(((converted + failed) / total) * 100), `Converting ${converted + failed}/${total}...`);

  // Group inline photos by sourceFileId to batch updates
  const bySource = new Map();
  for (const item of inlineItems) {
    if (!bySource.has(item.sourceFileId)) bySource.set(item.sourceFileId, []);
    bySource.get(item.sourceFileId).push(item);
  }

  const sourceEntries = Array.from(bySource.entries());

  for (let si = sourceIndex; si < sourceEntries.length; si++) {
    const [sourceFileId, items] = sourceEntries[si];
    let sourceData;
    try {
      sourceData = await getFileContent(sourceFileId);
    } catch (_) {
      failed += items.length;
      continue;
    }
    if (!sourceData || typeof sourceData !== "object") {
      failed += items.length;
      continue;
    }

    let sourceModified = false;
    const firstItem = items[0];

    for (let ii = (si === sourceIndex ? itemIndex : 0); ii < items.length; ii++) {
      // Check if operation was cancelled
      if (libraryState._operationAbort?.signal.aborted) {
        console.log("Conversion cancelled by user");
        libraryState._convertingInline = false;
        libraryState._convertProgress = null;
        libraryState._operationAbort = null;
        clearTrialPhotoProgress();
        showToast("Conversion paused. Will resume when you return.", "info");
        return;
      }

      const item = items[ii];
      const pct = Math.round(((converted + failed) / total) * 100);
      setTrialPhotoProgress(pct, `Converting ${converted + failed}/${total}...`);

      try {
        let node = sourceData;
        for (const key of (item.pointerPath || [])) {
          node = node?.[key];
          if (!node) break;
        }
        if (!node || !Array.isArray(node.photos)) { failed++; continue; }

        const rawPhoto = node.photos[item.photoIndex];
        if (typeof rawPhoto !== "string" || !rawPhoto.startsWith("data:")) { converted++; continue; }

        const { blob, width, height } = await compressPhotoToWebP(rawPhoto, 1000, 0.7);
        const photosFolderId = await getOrCreateFolder("photos", item.trialFolderId);
        const photoIdValue = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `photo_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const fileName = `${photoIdValue}.webp`;
        const newFileId = await uploadBinaryFileToDrive(fileName, photosFolderId, blob, "image/webp");

        node.photos[item.photoIndex] = {
          photoId: photoIdValue,
          fileId: newFileId,
          width,
          height,
          timestamp: node.timestamp || new Date().toISOString(),
        };
        sourceModified = true;
        converted++;
      } catch (err) {
        console.warn("Convert failed for", item.id, err);
        failed++;
      }

      // Save progress in case user navigates away
      libraryState._convertProgress = {
        sourceIndex: si,
        itemIndex: ii + 1,
        converted: converted,
        failed: failed,
        total: total,
      };
    }

    if (sourceModified) {
      try {
        await updateJsonFileById(sourceFileId, firstItem.sourceFileName || "responses.json", sourceData);
      } catch (err) {
        console.warn("Failed to update source JSON:", err);
      }
    }
  }

  clearTrialPhotoProgress();
  libraryState._convertingInline = false;
  libraryState._convertProgress = null;
  libraryState._operationAbort = null;
  
  showToast(`Conversion complete: ${converted} converted, ${failed} failed.`, converted > 0 ? "success" : "warning");
  await loadTrialPhotoItems({ force: true });
}

function collectInlinePhotosFromJson(node, baseMeta, output, path = []) {
  if (!node || typeof node !== "object") return;

  if (Array.isArray(node.photos)) {
    node.photos.forEach((photo, idx) => {
      if (typeof photo === "string" && photo.startsWith("data:")) {
        output.push({
          id: `inline:${baseMeta.sourceFileId}:${path.join("|")}:${idx}`,
          section: "observation-photos",
          storageType: "inline-json",
          trialId: baseMeta.trialId,
          trialName: baseMeta.trialName,
          trialFolderId: baseMeta.trialFolderId,
          sourceFileId: baseMeta.sourceFileId,
          sourceFileName: baseMeta.sourceFileName,
          sourceScope: baseMeta.sourceScope,
          areaIndex: baseMeta.areaIndex,
          pointerPath: path,
          photoIndex: idx,
          modifiedTime: baseMeta.modifiedTime || null,
          mimeType: "image/*",
          name: `${baseMeta.trialName} · ${baseMeta.sourceFileName} · #${idx + 1}`,
        });
      }
    });
  }

  Object.entries(node).forEach(([k, v]) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return;
    collectInlinePhotosFromJson(v, baseMeta, output, [...path, k]);
  });
}

// ---- Background library status is rendered in #libraryStatusBanner ----

function getFileCategory(mimeType) {
  if (!mimeType) return "other";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "other";
}

function getFileIcon(mimeType) {
  const category = getFileCategory(mimeType);
  switch (category) {
    case "pdf":
      return "picture_as_pdf";
    case "image":
      return "image";
    case "video":
      return "movie";
    default:
      return "insert_drive_file";
  }
}

function getFileIconColor(mimeType) {
  const category = getFileCategory(mimeType);
  switch (category) {
    case "pdf":
      return "var(--danger)";
    case "image":
      return "var(--success)";
    case "video":
      return "var(--warning)";
    default:
      return "var(--text-secondary)";
  }
}

function getTrialPhotoStorageBadge(storageType) {
  if (storageType === "binary") {
    return ''; // No badge for binary photos
  }
  return '<span class="library-photo-badge inline"><span class="material-symbols-rounded">warning</span> Inline JSON</span>';
}

async function getInlinePhotoDataUrl(item) {
  try {
    const sourceData = await getFileContent(item.sourceFileId);
    if (!sourceData || typeof sourceData !== "object") return null;
    
    let node = sourceData;
    for (const key of (item.pointerPath || [])) {
      node = node?.[key];
      if (!node) return null;
    }
    
    if (!node || !Array.isArray(node.photos)) return null;
    const photo = node.photos[item.photoIndex];
    if (typeof photo === "string" && photo.startsWith("data:")) {
      return photo;
    }
    return null;
  } catch (err) {
    console.warn("Error fetching inline photo:", err);
    return null;
  }
}

function renderTrialPhotoPreview(item) {
  const previewId = `trial-photo-preview-${item.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  
  if (item.storageType === "binary") {
    const imgHtml = `<img 
      id="${previewId}"
      class="library-item-preview"
      data-photo-fileid="${item.driveFileId}"
      data-loading="true"
      alt="${escapeHtml(item.name)}"
      onerror="this.dataset.loading='false'; this.alt='Failed to load'; this.classList.add('error')"
      onload="this.dataset.loading='false'"
    />`;
    return imgHtml;
  } else {
    // Inline photo - load async and update once available
    const imgHtml = `<img 
      id="${previewId}"
      class="library-item-preview"
      data-loading="true"
      alt="${escapeHtml(item.name)}"
      onerror="this.dataset.loading='false'; this.alt='Failed to load'; this.classList.add('error')"
      onload="this.dataset.loading='false'"
    />`;
    
    // Schedule async load
    setTimeout(() => {
      getInlinePhotoDataUrl(item).then(dataUrl => {
        const img = document.getElementById(previewId);
        if (!img) return;
        if (dataUrl) {
          img.src = dataUrl;
        } else {
          img.dataset.loading = "false";
          img.classList.add("error");
        }
      });
    }, 0);
    
    return imgHtml;
  }
}

function renderTrialPhotoFolderIconGrid(photos, trialId) {
  const latest = [...(photos || [])]
    .sort((a, b) => new Date(b.modifiedTime || 0).getTime() - new Date(a.modifiedTime || 0).getTime())
    .slice(0, 4);

  const cells = [];
  for (let i = 0; i < 4; i++) {
    const photo = latest[i];
    if (!photo) {
      cells.push('<div class="library-folder-thumb-cell placeholder"></div>');
      continue;
    }

    if (photo.storageType === "binary" && photo.driveFileId) {
      cells.push(`
        <div class="library-folder-thumb-cell">
          <img
            class="library-folder-thumb-img"
            data-photo-fileid="${photo.driveFileId}"
            alt="${escapeHtml(photo.name || "Photo")}" />
        </div>
      `);
      continue;
    }

    const safeTrial = String(trialId || "trial").replace(/[^a-zA-Z0-9_-]/g, "_");
    const safePhoto = String(photo.id || i).replace(/[^a-zA-Z0-9_-]/g, "_");
    const imgId = `trial-folder-thumb-${safeTrial}-${safePhoto}`;
    cells.push(`
      <div class="library-folder-thumb-cell">
        <img
          id="${imgId}"
          class="library-folder-thumb-img"
          data-loading="true"
          alt="${escapeHtml(photo.name || "Photo")}" />
      </div>
    `);

    setTimeout(() => {
      getInlinePhotoDataUrl(photo).then((dataUrl) => {
        const img = document.getElementById(imgId);
        if (!img) return;
        if (dataUrl) {
          img.src = dataUrl;
        }
        img.dataset.loading = "false";
      }).catch(() => {
        const img = document.getElementById(imgId);
        if (img) img.dataset.loading = "false";
      });
    }, 0);
  }

  return `<div class="library-folder-thumb-grid">${cells.join("")}</div>`;
}

function renderTrialPhotoActionBar() {
  const container = document.getElementById("trialPhotoActionsContainer");
  if (!container) return;

  const allItems = libraryState.trialPhotos || [];
  const inlineCount = allItems.filter((p) => p.storageType === "inline-json").length;
  const binaryCount = allItems.filter((p) => p.storageType === "binary").length;

  let actionBarHtml = `<div class="trial-photo-action-bar">`;
  actionBarHtml += `<button class="btn btn-secondary btn-sm" onclick="scanInlineTrialPhotos()"><span class="material-symbols-rounded">search</span> Scan Inline Photos</button>`;
  if (inlineCount > 0) {
    actionBarHtml += `<button class="btn btn-primary btn-sm" onclick="convertAllInlinePhotosToBinary()"><span class="material-symbols-rounded">conversion_path</span> Convert All to Binary (${inlineCount})</button>`;
  }
  actionBarHtml += `<span class="trial-photo-summary">${binaryCount} binary${inlineCount > 0 ? ` · ${inlineCount} inline` : ""}</span>`;
  actionBarHtml += `</div>`;

  container.innerHTML = actionBarHtml;
}

function renderTrialPhotoList(container) {
  const allItems = libraryState.trialPhotos || [];

  // Level 0: No trial selected — show trial folders
  if (!libraryState._openTrialPhotoFolderId) {
    renderTrialPhotoFolders(container, allItems);
    return;
  }

  // Level 1: Trial selected — show all photos flat
  const trialId = libraryState._openTrialPhotoFolderId;
  const query = (libraryState.searchQuery || "").toLowerCase();

  let filtered = allItems.filter((item) => {
    if (item.trialId !== trialId) return false;
    if (!query) return true;
    return [item.entryName, item.name, item.rawFileName, item.paramName, item.repLabel]
      .filter(Boolean).join(" ").toLowerCase().includes(query);
  });

  const sortDir = libraryState.sortDir === "asc" ? 1 : -1;
  filtered = filtered.sort((a, b) => {
    switch (libraryState.sortBy) {
      case "name":
        return ((a.entryName || a.name || "").localeCompare(b.entryName || b.name || "")) * sortDir;
      case "size":
        return (Number(a.size || 0) - Number(b.size || 0)) * sortDir;
      case "modifiedTime":
      default:
        return (new Date(a.modifiedTime || 0).getTime() - new Date(b.modifiedTime || 0).getTime()) * sortDir;
    }
  });

  if (filtered.length === 0) {
    container.classList.add("library-grid-empty");
    container.innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-rounded">photo_library</span>
        <p>No observation photos found in this trial.</p>
      </div>
    `;
    return;
  }

  container.classList.remove("library-grid-empty");
  container.innerHTML = filtered.map((item) => {
    const displayName = item.entryName && item.sampleNum
      ? `${item.entryName}_${item.sampleNum}`
      : (item.name || "Photo");
    const dateLabel = item.modifiedTime ? new Date(item.modifiedTime).toLocaleDateString() : "-";
    const metaRight = `${formatFileSize(Number(item.size || 0))} · ${dateLabel}`;

    return `
      <div class="library-item" data-trial-photo-id="${item.id}">
        <div class="library-item-icon">
          ${renderTrialPhotoPreview(item)}
        </div>
        <div class="library-item-info">
          <div class="library-item-name">${escapeHtml(displayName)}</div>
          <div class="library-item-meta">${escapeHtml(metaRight)}</div>
        </div>
        <div class="library-item-storage">${getTrialPhotoStorageBadge(item.storageType)}</div>
      </div>
    `;
  }).join("");

  loadExternalPhotos(container);

  container.querySelectorAll(".library-item[data-trial-photo-id]").forEach((row) => {
    row.addEventListener("click", () => {
      openTrialPhotoDetail(row.dataset.trialPhotoId);
    });
  });
}

function renderTrialPhotoFolders(container, allItems) {
  const query = (libraryState.searchQuery || "").toLowerCase();

  // Group photos by trialId
  const trialMap = new Map();
  for (const item of allItems) {
    const tid = item.trialId || "unknown";
    if (!trialMap.has(tid)) {
      trialMap.set(tid, { trialId: tid, trialName: item.trialName || tid, photos: [] });
    }
    trialMap.get(tid).photos.push(item);
  }

  let folders = Array.from(trialMap.values());

  // Filter folders by search query
  if (query) {
    folders = folders.filter(f => f.trialName.toLowerCase().includes(query));
  }

  // Sort folders by trial name
  folders.sort((a, b) => a.trialName.localeCompare(b.trialName));

  if (folders.length === 0) {
    container.classList.add("library-grid-empty");
    container.innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-rounded">photo_library</span>
        <p>${allItems.length === 0 ? "No observation photos found. Scan your trials to load photos." : "No trials match your search."}</p>
      </div>
    `;
    return;
  }

  container.classList.remove("library-grid-empty");
  container.innerHTML = folders.map(f => {
    const photoCount = f.photos.length;
    const latestDate = f.photos.reduce((max, p) => {
      const d = new Date(p.modifiedTime || 0).getTime();
      return d > max ? d : max;
    }, 0);
    const dateLabel = latestDate ? new Date(latestDate).toLocaleDateString() : "";

    return `
      <div class="library-folder-card" data-trial-folder-id="${escapeHtml(f.trialId)}">
        <div class="folder-card-icon">
          ${renderTrialPhotoFolderIconGrid(f.photos, f.trialId)}
        </div>
        <div class="folder-card-meta">
          <div class="folder-card-name">${escapeHtml(f.trialName)}</div>
          <div class="folder-card-count">${photoCount} photo${photoCount !== 1 ? "s" : ""}${dateLabel ? " · " + dateLabel : ""}</div>
        </div>
        <div class="folder-card-actions">
          <span class="material-symbols-rounded" style="color:var(--text-tertiary);font-size:20px;">chevron_right</span>
        </div>
      </div>
    `;
  }).join("");

  // Load binary photo thumbs for folder icons
  loadExternalPhotos(container);

  container.querySelectorAll(".library-folder-card").forEach(card => {
    card.addEventListener("click", () => {
      openTrialPhotoFolder(card.dataset.trialFolderId);
    });
  });
}

function openTrialPhotoFolder(trialId) {
  libraryState._openTrialPhotoFolderId = trialId;
  renderLibraryList();
}

function closeTrialPhotoFolder() {
  libraryState._openTrialPhotoFolderId = null;
  renderLibraryList();
}

// ─── Library folder navigation helpers ───
function updateLibraryHeaderTitle() {
  const titleEl = document.getElementById("libraryHeaderTitle");
  if (!titleEl) return;

  let pathHtml = "";
  let baseTitleHtml = `<span class="library-header-main">Library</span>`;

  if (libraryState.section === "files" && libraryState._openLibraryFolderId) {
    const folderName = escapeHtml(libraryState._openLibraryFolderName || "Folder");
    baseTitleHtml = "";
    pathHtml = `
      <button class="library-header-back" onclick="closeLibraryFolder()" title="Back">
        <span class="material-symbols-rounded">arrow_back</span>
      </button>
      <span class="library-header-path">
        <span class="library-header-root">Uploaded Files</span>
        <span class="material-symbols-rounded library-header-sep">chevron_right</span>
        <span class="library-header-current">${folderName}</span>
      </span>
    `;
  } else if (libraryState.section === "observation-photos" && libraryState._openTrialPhotoFolderId) {
    const trialName = escapeHtml(
      libraryState.trialPhotos.find((item) => item.trialId === libraryState._openTrialPhotoFolderId)?.trialName ||
      libraryState._openTrialPhotoFolderId
    );
    baseTitleHtml = "";
    pathHtml = `
      <button class="library-header-back" onclick="closeTrialPhotoFolder()" title="Back">
        <span class="material-symbols-rounded">arrow_back</span>
      </button>
      <span class="library-header-path">
        <span class="library-header-root" onclick="closeTrialPhotoFolder()" style="cursor:pointer">Observation Photos</span>
        <span class="material-symbols-rounded library-header-sep">chevron_right</span>
        <span class="library-header-current">${trialName}</span>
      </span>
    `;
  } else if (libraryState.section === "agronomy-photos" && libraryState._openTrialPhotoFolderId) {
    const trialName = escapeHtml(
      libraryState.agronomyPhotos.find((item) => item.trialId === libraryState._openTrialPhotoFolderId)?.trialName ||
      libraryState._openTrialPhotoFolderId
    );
    baseTitleHtml = "";
    pathHtml = `
      <button class="library-header-back" onclick="closeTrialPhotoFolder()" title="Back">
        <span class="material-symbols-rounded">arrow_back</span>
      </button>
      <span class="library-header-path">
        <span class="library-header-root">Agronomy Photos</span>
        <span class="material-symbols-rounded library-header-sep">chevron_right</span>
        <span class="library-header-current">${trialName}</span>
      </span>
    `;
  }

  titleEl.innerHTML = `${baseTitleHtml}${pathHtml}`;
}

function openLibraryFolder(folderId, folderName) {
  libraryState._openLibraryFolderId = folderId;
  libraryState._openLibraryFolderName = folderName;
  libraryState.selectedId = null;
  setLibraryDetailVisible(false);
  updateLibraryHeaderTitle();
  setLibraryStatus("Loading folder contents...", "loading");
  loadLibraryItems().then(() => {
    clearLibraryStatus(1500);
  }).catch(() => {});
}

function closeLibraryFolder() {
  libraryState._openLibraryFolderId = null;
  libraryState._openLibraryFolderName = null;
  libraryState.selectedId = null;
  setLibraryDetailVisible(false);
  updateLibraryHeaderTitle();
  setLibraryStatus("Loading uploaded files...", "loading");
  loadLibraryItems().then(() => {
    clearLibraryStatus(1500);
  }).catch(() => {});
}

async function createLibraryFolder() {
  if (!libraryState.folderId) return;
  const parentId = libraryState._openLibraryFolderId || libraryState.folderId;

  const name = prompt("Enter folder name:");
  if (!name || !name.trim()) return;

  try {
    await gapi.client.drive.files.create({
      resource: {
        name: name.trim(),
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      },
      fields: "id",
    });
    showToast(`Folder "${name.trim()}" created.`, "success");
    await loadLibraryItems();
  } catch (err) {
    console.error("Error creating folder:", err);
    showToast("Failed to create folder.", "error");
  }
}

// ─── Library list mode helpers ───
function getLibraryListColumns() {
  return [
    { key: "name", label: "Name", min: 120, flex: true },
    { key: "type", label: "Type", min: 70, width: 90 },
    { key: "size", label: "Size", min: 70, width: 90 },
    { key: "date", label: "Date", min: 90, width: 110 },
    { key: "actions", label: "Actions", auto: true, fixed: true },
  ];
}

function getLibraryListTemplate(columns) {
  return columns.map((col) => {
    if (col.flex) return `minmax(${col.min || 80}px, 1fr)`;
    if (col.auto) return "auto";
    return `${col.width || 100}px`;
  }).join(" ");
}

function renderLibraryListMode(container, displayItems) {
  const columns = getLibraryListColumns();
  const template = getLibraryListTemplate(columns);

  const headerHtml = `
    <div class="inventory-list-header">
      ${columns.map((col) => `
        <div class="inventory-list-head-cell"><span>${escapeHtml(col.label)}</span></div>
      `).join("")}
    </div>
  `;

  const rowsHtml = displayItems.map((file) => {
    if (file.isUploading) {
      const progress = Math.round(file.progress || 0);
      return `
        <div class="inventory-list-row">
          <div class="inventory-list-cell">${escapeHtml(file.name)}</div>
          <div class="inventory-list-cell">—</div>
          <div class="inventory-list-cell">Uploading…</div>
          <div class="inventory-list-cell">${progress}%</div>
          <div class="inventory-list-cell inventory-list-cell-actions"></div>
        </div>`;
    }

    const sizeLabel = file.size ? formatFileSize(Number(file.size)) : "-";
    const dateLabel = file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : "-";
    const category = typeof getFileCategory === "function" ? getFileCategory(file.mimeType) : "-";

    return `
      <div class="inventory-list-row" data-id="${file.id}" style="cursor:pointer">
        <div class="inventory-list-cell" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
        <div class="inventory-list-cell">${escapeHtml(category)}</div>
        <div class="inventory-list-cell">${sizeLabel}</div>
        <div class="inventory-list-cell">${dateLabel}</div>
        <div class="inventory-list-cell inventory-list-cell-actions">
          <div class="library-item-actions" style="opacity:1">
            <button class="icon-btn delete-btn" data-id="${file.id}" title="Delete"><span class="material-symbols-rounded">delete</span></button>
          </div>
        </div>
      </div>`;
  }).join("");

  container.innerHTML = `<div class="inventory-list-table" style="grid-template-columns:${template}">${headerHtml}${rowsHtml}</div>`;

  container.querySelectorAll(".inventory-list-row[data-id]").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (!e.target.closest(".library-item-actions")) {
        openLibraryDetail(row.dataset.id);
      }
    });
  });
  container.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); deleteLibraryItem(btn.dataset.id); });
  });
}

function renderLibraryList() {
  const container = document.getElementById("libraryList");
  if (!container) return;
  updateLibraryHeaderTitle();

  if (libraryState.section === "observation-photos") {
    container.classList.remove("library-grid-empty", "grid-small", "grid-medium", "grid-large");
    container.classList.add("library-files-grid", "grid-medium");
    renderTrialPhotoList(container);
    renderTrialPhotoActionBar();
    return;
  }

  if (libraryState.section === "agronomy-photos") {
    container.classList.remove("library-grid-empty", "grid-small", "grid-medium", "grid-large");
    container.classList.add("library-files-grid", "grid-medium");
    renderAgronomyPhotoList(container);
    return;
  }

  // Separate folders from files
  const FOLDER_MIME = "application/vnd.google-apps.folder";
  const folders = libraryState.items.filter(f => f.mimeType === FOLDER_MIME);
  const files = libraryState.items.filter(f => f.mimeType !== FOLDER_MIME);

  // Combine files with uploading items
  const uploadingItems = Object.entries(libraryState.uploading).map(
    ([fileName, data]) => ({
      name: fileName,
      isUploading: true,
      progress: data.progress,
    })
  );

  // Filter files based on search and filter
  let filteredFiles = files.filter((file) => {
    if (libraryState.searchQuery) {
      if (!file.name.toLowerCase().includes(libraryState.searchQuery)) {
        return false;
      }
    }
    if (libraryState.activeFilter !== "all") {
      const category = getFileCategory(file.mimeType);
      if (category !== libraryState.activeFilter) {
        return false;
      }
    }
    return true;
  });

  // Filter folders by search
  let filteredFolders = folders;
  if (libraryState.searchQuery) {
    filteredFolders = folders.filter(f => f.name.toLowerCase().includes(libraryState.searchQuery));
  }

  const sortDir = libraryState.sortDir === "asc" ? 1 : -1;
  filteredFiles = filteredFiles.sort((a, b) => {
    let aVal;
    let bVal;

    switch (libraryState.sortBy) {
      case "name":
        aVal = (a.name || "").toLowerCase();
        bVal = (b.name || "").toLowerCase();
        return aVal.localeCompare(bVal) * sortDir;
      case "size":
        aVal = Number(a.size || 0);
        bVal = Number(b.size || 0);
        return (aVal - bVal) * sortDir;
      case "type":
        aVal = getFileCategory(a.mimeType || "");
        bVal = getFileCategory(b.mimeType || "");
        return aVal.localeCompare(bVal) * sortDir;
      case "modifiedTime":
      default:
        aVal = new Date(a.modifiedTime || 0).getTime();
        bVal = new Date(b.modifiedTime || 0).getTime();
        return (aVal - bVal) * sortDir;
    }
  });

  // Sort folders by name
  filteredFolders.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  const displayItems = [...uploadingItems, ...filteredFiles];
  const totalItems = displayItems.length + filteredFolders.length;

  if (totalItems === 0) {
    const emptyMessage =
      libraryState.items.length === 0
        ? (libraryState._openLibraryFolderId ? "This folder is empty." : "No files yet. Upload your first document to the library.")
        : "No files match your search or filter.";

    const gridSize = libraryState._openLibraryFolderId ? "small" : "large";
    container.classList.add("library-grid-empty", "library-files-grid", `grid-${gridSize}`);
    let html = `
            <div class="empty-state">
                <span class="material-symbols-rounded">folder_open</span>
                <p>${emptyMessage}</p>
            </div>
        `;
    container.innerHTML = html;
    setLibraryDetailVisible(false);
    return;
  }

  // Reset grid to normal when showing items
  const gridSize = libraryState._openLibraryFolderId ? "small" : "large";
  container.classList.remove("library-grid-empty", "grid-small", "grid-medium", "grid-large");
  container.classList.add("library-files-grid", `grid-${gridSize}`);

  let html = "";

  // Render folder cards (outside the grid)
  if (filteredFolders.length > 0) {
    html += `<div class="library-folder-list">`;
    html += filteredFolders.map(folder => {
      const dateLabel = folder.modifiedTime ? new Date(folder.modifiedTime).toLocaleDateString() : "";
      return `
        <div class="library-folder-card" data-folder-id="${folder.id}">
          <div class="folder-card-icon">
            <span class="material-symbols-rounded">folder</span>
          </div>
          <div class="folder-card-meta">
            <div class="folder-card-name">${escapeHtml(folder.name)}</div>
            <div class="folder-card-count">${dateLabel}</div>
          </div>
          <div class="folder-card-actions">
            <span class="material-symbols-rounded" style="color:var(--text-tertiary);font-size:20px;">chevron_right</span>
          </div>
        </div>
      `;
    }).join("");
    html += `</div>`;
  }

  // Render file items
  html += displayItems
    .map((file) => {
      if (file.isUploading) {
        const progress = Math.round(file.progress || 0);
        const circumference = 2 * Math.PI * 18;
        const strokeDashoffset = circumference - (progress / 100) * circumference;

        return `
          <div class="library-item" data-uploading="${file.name}">
              <div class="library-item-icon uploading">
                  <div class="upload-progress-circle">
                      <svg width="40" height="40" viewBox="0 0 40 40">
                          <circle class="progress-ring" cx="20" cy="20" r="18" 
                                  style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${strokeDashoffset}"></circle>
                      </svg>
                      <div class="upload-progress-text">${progress}%</div>
                  </div>
              </div>
              <div class="library-item-info">
                  <div class="library-item-name">${escapeHtml(file.name)}</div>
                  <div class="library-item-meta">Uploading...</div>
              </div>
          </div>
        `;
      }

      const sizeLabel = file.size ? formatFileSize(Number(file.size)) : "-";
      const dateLabel = file.modifiedTime
        ? new Date(file.modifiedTime).toLocaleDateString()
        : "-";
      const icon = getFileIcon(file.mimeType);
      const iconColor = getFileIconColor(file.mimeType);
        const isImage = getFileCategory(file.mimeType) === "image";

      return `
            <div class="library-item ${libraryState.selectedId === file.id ? "selected" : ""}" data-id="${file.id}">
            <div class="library-item-icon ${isImage ? "library-uploaded-image-icon" : ""}" style="color: ${iconColor}">
              ${isImage
                ? `<img class="library-item-preview library-uploaded-preview" data-loading="true" data-library-fileid="${file.id}" alt="${escapeHtml(file.name)}" onerror="this.dataset.loading='false'; this.classList.add('error')" onload="this.dataset.loading='false'" />`
                : `<span class="material-symbols-rounded">${icon}</span>`}
                </div>
                <div class="library-item-info">
                    <div class="library-item-name">${escapeHtml(file.name)}</div>
                    <div class="library-item-meta">${sizeLabel} · ${dateLabel}</div>
                </div>
                <div class="library-item-actions">
                    <button class="icon-btn delete-btn" data-id="${file.id}" title="Delete">
                        <span class="material-symbols-rounded">delete</span>
                    </button>
                </div>
            </div>
        `;
    })
    .join("");

  container.innerHTML = html;

  // Folder click handlers
  container.querySelectorAll(".library-folder-card[data-folder-id]").forEach(card => {
    card.addEventListener("click", () => {
      openLibraryFolder(card.dataset.folderId, card.querySelector(".folder-card-name")?.textContent || "Folder");
    });
  });

  // Click on item to view
  container.querySelectorAll(".library-item[data-id]").forEach((item) => {
    item.addEventListener("click", (e) => {
      if (!e.target.closest(".library-item-actions")) {
        openLibraryDetail(item.dataset.id);
      }
    });
  });

  container.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteLibraryItem(btn.dataset.id);
    });
  });

  loadUploadedImagePreviews(container);
}

async function loadUploadedImagePreviews(container) {
  if (!container) return;

  const imgs = Array.from(container.querySelectorAll("img[data-library-fileid]"));
  for (const img of imgs) {
    const fileId = String(img.dataset.libraryFileid || "");
    if (!fileId) continue;

    if (libraryState._filePreviewCache[fileId]) {
      img.src = libraryState._filePreviewCache[fileId];
      continue;
    }

    if (!libraryState._filePreviewPromises[fileId]) {
      libraryState._filePreviewPromises[fileId] = fetchLibraryFileBlob(fileId)
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          libraryState._filePreviewCache[fileId] = url;
          return url;
        })
        .catch((err) => {
          console.warn("Failed to load uploaded file preview:", err);
          return null;
        })
        .finally(() => {
          delete libraryState._filePreviewPromises[fileId];
        });
    }

    const url = await libraryState._filePreviewPromises[fileId];
    if (!url) {
      img.dataset.loading = "false";
      img.classList.add("error");
      continue;
    }
    // Guard: image might have been re-rendered.
    if (document.body.contains(img)) {
      img.src = url;
    }
  }
}

async function uploadLibraryFiles(files) {
  if (!libraryState.folderId) return;

  for (const file of files) {
    await uploadLibraryFile(file);
  }

  await loadLibraryItems();
  showSuccessMessage("Files uploaded.");
}

async function uploadLibraryFile(file) {
  const boundary = "-------advanta-library-boundary";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = {
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    parents: [libraryState._openLibraryFolderId || libraryState.folderId],
  };

  const body = new Blob([
    delimiter,
    "Content-Type: application/json; charset=UTF-8\r\n\r\n",
    JSON.stringify(metadata),
    delimiter,
    `Content-Type: ${metadata.mimeType}\r\n\r\n`,
    file,
    closeDelimiter,
  ]);

  // Track upload progress
  libraryState.uploading[file.name] = { progress: 0 };
  renderLibraryList();

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // Track upload progress
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const percentComplete = Math.round((e.loaded / e.total) * 100);
        libraryState.uploading[file.name].progress = percentComplete;
        renderLibraryList();
      }
    });

    xhr.addEventListener("load", async () => {
      if (xhr.status === 200) {
        delete libraryState.uploading[file.name];
        try {
          const result = JSON.parse(xhr.responseText);
          resolve(result);
        } catch (e) {
          reject(new Error("Failed to parse response"));
        }
      } else {
        delete libraryState.uploading[file.name];
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener("error", () => {
      delete libraryState.uploading[file.name];
      reject(new Error("Upload error"));
    });

    xhr.addEventListener("abort", () => {
      delete libraryState.uploading[file.name];
      reject(new Error("Upload aborted"));
    });

    xhr.open(
      "POST",
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart"
    );
    xhr.setRequestHeader(
      "Authorization",
      `Bearer ${getAccessToken()}`
    );
    xhr.setRequestHeader(
      "Content-Type",
      `multipart/related; boundary=${boundary}`
    );
    xhr.send(body);
  });
}

async function openLibraryDetail(fileId) {
  if (libraryState.section === "observation-photos" || libraryState.section === "agronomy-photos") {
    return openTrialPhotoDetail(fileId);
  }

  const file = libraryState.items.find((item) => item.id === fileId);
  if (!file) return;

  const renameBtn = document.getElementById("libraryRenameBtn");
  const deleteBtn = document.getElementById("libraryDeleteBtn");
  const downloadBtn = document.getElementById("libraryDownloadBtn");
  const infoBtn = document.getElementById("libraryInfoBtn");
  if (renameBtn) renameBtn.classList.remove("hidden");
  if (deleteBtn) deleteBtn.classList.remove("hidden");
  if (infoBtn) infoBtn.classList.add("hidden");
  if (downloadBtn) {
    downloadBtn.classList.remove("hidden");
    downloadBtn.onclick = () => downloadLibraryItem();
  }

  libraryState.selectedId = fileId;
  setLibraryDetailVisible(true);
  updateLibraryDetailMeta(file);
  updateLibraryPreviewNavButtons();

  const preview = document.getElementById("libraryPreview");
  if (!preview) return;

  preview.innerHTML = "<p>Loading preview...</p>";

  try {
    const blob = await fetchLibraryFileBlob(fileId);
    if (libraryState.previewUrl) {
      URL.revokeObjectURL(libraryState.previewUrl);
    }
    libraryState.previewUrl = URL.createObjectURL(blob);
    renderLibraryPreview(file, libraryState.previewUrl);
  } catch (error) {
    console.error("Error loading preview:", error);
    preview.innerHTML = "<p>Unable to load preview.</p>";
  }
}

async function openTrialPhotoDetail(photoId) {
  const item = (libraryState.trialPhotos || []).find((p) => p.id === photoId)
    || (libraryState.agronomyPhotos || []).find((p) => p.id === photoId);
  if (!item) return;

  libraryState.selectedId = photoId;
  libraryState._currentPhotoItem = item;
  setLibraryDetailVisible(true);
  updateLibraryPreviewNavButtons();

  const title = document.getElementById("libraryDetailTitle");
  const meta = document.getElementById("libraryDetailMeta");
  const preview = document.getElementById("libraryPreview");
  const renameBtn = document.getElementById("libraryRenameBtn");
  const deleteBtn = document.getElementById("libraryDeleteBtn");
  const downloadBtn = document.getElementById("libraryDownloadBtn");
  const infoBtn = document.getElementById("libraryInfoBtn");

  if (title) title.textContent = `${item.trialName || item.trialId} · Photo`;
  if (meta) meta.textContent = item.rawFileName || item.name || "";

  if (deleteBtn) deleteBtn.classList.add("hidden");

  // Show rename button for binary photos
  if (renameBtn) {
    renameBtn.classList.toggle("hidden", item.storageType !== "binary");
    renameBtn.onclick = () => renameTrialPhotoItem(item.id);
  }

  // Show info button
  if (infoBtn) {
    infoBtn.classList.remove("hidden");
    infoBtn.onclick = () => showPhotoDetailInfo(item);
  }

  if (downloadBtn) {
    downloadBtn.classList.toggle("hidden", item.storageType !== "binary");
    downloadBtn.onclick = () => downloadTrialPhotoItem(item.id);
  }

  if (!preview) return;
  preview.innerHTML = "<p>Loading photo detail...</p>";

  try {
    let photoUrl = "";
    if (item.storageType === "binary") {
      const blob = await fetchLibraryFileBlob(item.driveFileId);
      if (libraryState.previewUrl) URL.revokeObjectURL(libraryState.previewUrl);
      libraryState.previewUrl = URL.createObjectURL(blob);
      photoUrl = libraryState.previewUrl;
    } else {
      photoUrl = await resolveInlinePhotoDataUrl(item);
    }

    const actionHtml = item.storageType === "inline-json"
      ? `<button class="btn btn-primary" onclick="convertInlineTrialPhotoToBinary('${item.id}')"><span class="material-symbols-rounded">conversion_path</span> Convert to Binary</button>`
      : "";

    preview.innerHTML = `
      <div class="trial-photo-detail-wrap">
        <div class="trial-photo-preview-panel">
          <img src="${photoUrl}" alt="Trial Photo" id="_trialPhotoImg">
        </div>
        ${actionHtml ? `<div class="trial-photo-info-actions">${actionHtml}</div>` : ""}
      </div>
    `;
  } catch (error) {
    console.error("Failed to open trial photo detail:", error);
    preview.innerHTML = "<p>Unable to load trial photo detail.</p>";
  }
}

async function renameTrialPhotoItem(photoId) {
  const item = (libraryState.trialPhotos || []).find((p) => p.id === photoId)
    || (libraryState.agronomyPhotos || []).find((p) => p.id === photoId);
  if (!item || item.storageType !== "binary" || !item.driveFileId) return;

  const currentName = item.rawFileName || item.name || "";
  const ext = currentName.includes(".") ? currentName.substring(currentName.lastIndexOf(".")) : "";
  const baseName = currentName.includes(".") ? currentName.substring(0, currentName.lastIndexOf(".")) : currentName;

  const newBase = prompt("Rename photo file:", baseName);
  if (!newBase || newBase.trim() === baseName) return;

  const newName = newBase.trim() + ext;

  try {
    await gapi.client.drive.files.update({
      fileId: item.driveFileId,
      resource: { name: newName },
    });

    item.rawFileName = newName;
    item.name = item.section === "agronomy-photos"
      ? _deriveAgronomyPhotoDisplayName(newName, item.trialName)
      : _derivePhotoDisplayName(newName, item.trialName);

    renderLibraryList();
    openTrialPhotoDetail(photoId);
    showToast("Photo renamed", "success");
  } catch (err) {
    console.error("Failed to rename photo:", err);
    showToast("Failed to rename photo", "error");
  }
}

function showPhotoDetailInfo(item) {
  if (!item) return;

  const ext = (item.rawFileName || "").includes(".")
    ? (item.rawFileName || "").substring((item.rawFileName || "").lastIndexOf(".") + 1).toUpperCase()
    : "-";
  const sizeLabel = item.size ? formatFileSize(Number(item.size)) : "-";
  const dateLabel = item.modifiedTime ? new Date(item.modifiedTime).toLocaleString() : "-";
  const storageLabel = item.storageType === "binary" ? "Binary (Drive)" : "Inline JSON";

  // Try to get dimensions from the loaded image
  let dimLabel = "-";
  const img = document.getElementById("_trialPhotoImg");
  if (img && img.naturalWidth && img.naturalHeight) {
    dimLabel = `${img.naturalWidth} × ${img.naturalHeight} px`;
  }

  const modal = document.createElement("div");
  modal.className = "confirm-modal active";
  modal.innerHTML = `
    <div class="confirm-modal-content" style="max-width:400px;">
      <div class="confirm-modal-header" style="background:var(--primary-soft);">
        <span class="material-symbols-rounded" style="color:var(--primary);">info</span>
        <h3>Photo Detail</h3>
      </div>
      <div class="confirm-modal-body" style="padding:1rem 1.5rem;">
        <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
          <tr><td style="padding:0.4rem 0;color:var(--text-tertiary);width:100px;">Filename</td><td style="padding:0.4rem 0;word-break:break-all;">${escapeHtml(item.rawFileName || item.name || "-")}</td></tr>
          <tr><td style="padding:0.4rem 0;color:var(--text-tertiary);">Trial</td><td style="padding:0.4rem 0;">${escapeHtml(item.trialName || item.trialId || "-")}</td></tr>
          <tr><td style="padding:0.4rem 0;color:var(--text-tertiary);">Storage</td><td style="padding:0.4rem 0;">${storageLabel}</td></tr>
          <tr><td style="padding:0.4rem 0;color:var(--text-tertiary);">Type</td><td style="padding:0.4rem 0;">${escapeHtml(item.mimeType || "-")}</td></tr>
          <tr><td style="padding:0.4rem 0;color:var(--text-tertiary);">Extension</td><td style="padding:0.4rem 0;">${ext}</td></tr>
          <tr><td style="padding:0.4rem 0;color:var(--text-tertiary);">Size</td><td style="padding:0.4rem 0;">${sizeLabel}</td></tr>
          <tr><td style="padding:0.4rem 0;color:var(--text-tertiary);">Dimensions</td><td style="padding:0.4rem 0;">${dimLabel}</td></tr>
          <tr><td style="padding:0.4rem 0;color:var(--text-tertiary);">Modified</td><td style="padding:0.4rem 0;">${dateLabel}</td></tr>
        </table>
      </div>
      <div class="confirm-modal-footer">
        <button class="btn btn-secondary _photoInfoClose">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector("._photoInfoClose").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
}

async function resolveInlinePhotoDataUrl(item) {
  const sourceData = await getFileContent(item.sourceFileId);
  if (!sourceData || typeof sourceData !== "object") throw new Error("Invalid source JSON");

  let node = sourceData;
  for (const key of (item.pointerPath || [])) {
    node = node?.[key];
    if (!node) break;
  }
  if (!node || !Array.isArray(node.photos)) {
    throw new Error("Photo pointer not found");
  }
  const photo = node.photos[item.photoIndex];
  if (typeof photo !== "string" || !photo.startsWith("data:")) {
    throw new Error("Photo already converted or missing");
  }
  return photo;
}

async function updateJsonFileById(fileId, fileName, data) {
  const boundary = "-------advanta-update-json-boundary";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;
  const metadata = {
    name: fileName,
    mimeType: "application/json",
  };

  const body =
    delimiter +
    "Content-Type: application/json\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    "Content-Type: application/json\r\n\r\n" +
    JSON.stringify(data, null, 2) +
    closeDelimiter;

  await gapi.client.request({
    path: `/upload/drive/v3/files/${fileId}`,
    method: "PATCH",
    params: { uploadType: "multipart" },
    headers: {
      "Content-Type": `multipart/related; boundary=\"${boundary}\"`,
    },
    body,
  });
}

async function convertInlineTrialPhotoToBinary(photoId) {
  const item = (libraryState.trialPhotos || []).find((p) => p.id === photoId);
  if (!item || item.storageType !== "inline-json") return;

  const preview = document.getElementById("libraryPreview");
  if (preview) {
    preview.insertAdjacentHTML("beforeend", `<p id="trialPhotoConvertMsg"><span class="spinner-sm"></span> Converting photo...</p>`);
  }

  try {
    const sourceData = await getFileContent(item.sourceFileId);
    if (!sourceData || typeof sourceData !== "object") throw new Error("Source JSON missing");

    let node = sourceData;
    for (const key of (item.pointerPath || [])) {
      node = node?.[key];
      if (!node) break;
    }
    if (!node || !Array.isArray(node.photos)) throw new Error("Photo pointer not found");

    const rawPhoto = node.photos[item.photoIndex];
    if (typeof rawPhoto !== "string" || !rawPhoto.startsWith("data:")) {
      showToast("Photo already converted or invalid.", "info");
      await loadTrialPhotoItems({ force: true });
      return;
    }

    const { blob, width, height } = await compressPhotoToWebP(rawPhoto, 1000, 0.7);
    const photosFolderId = await getOrCreateFolder("photos", item.trialFolderId);
    const photoIdValue = (crypto && crypto.randomUUID) ? crypto.randomUUID() : `photo_${Date.now()}`;
    const fileName = `${photoIdValue}.webp`;
    const newFileId = await uploadBinaryFileToDrive(fileName, photosFolderId, blob, "image/webp");

    node.photos[item.photoIndex] = {
      photoId: photoIdValue,
      fileId: newFileId,
      width,
      height,
      timestamp: node.timestamp || new Date().toISOString(),
    };

    await updateJsonFileById(item.sourceFileId, item.sourceFileName || "responses.json", sourceData);
    showToast("Photo converted to binary successfully.", "success");

    await loadTrialPhotoItems({ force: true });
    openTrialPhotoDetail(`binary:${newFileId}`);
  } catch (error) {
    console.error("Inline to binary conversion failed:", error);
    showToast("Failed to convert inline photo.", "error");
  } finally {
    const msg = document.getElementById("trialPhotoConvertMsg");
    if (msg) msg.remove();
  }
}

async function downloadTrialPhotoItem(photoId) {
  const item = (libraryState.trialPhotos || []).find((p) => p.id === photoId)
    || (libraryState.agronomyPhotos || []).find((p) => p.id === photoId);
  if (!item || item.storageType !== "binary") return;

  try {
    const blob = await fetchLibraryFileBlob(item.driveFileId);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = item.name || `${item.trialId || "trial-photo"}.webp`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Error downloading trial photo:", error);
    showToast("Failed to download trial photo.", "error");
  }
}

function renderLibraryPreview(file, url) {
  const preview = document.getElementById("libraryPreview");
  if (!preview) return;

  if (file.mimeType === "application/pdf") {
    preview.innerHTML = `<iframe src="${url}" class="library-preview-iframe"></iframe>`;
    return;
  }

  if (file.mimeType && file.mimeType.startsWith("image/")) {
    preview.innerHTML = `<img src="${url}" alt="${escapeHtml(file.name)}">`;
    return;
  }

  if (file.mimeType && file.mimeType.startsWith("video/")) {
    preview.innerHTML = `<video src="${url}" controls></video>`;
    return;
  }

  preview.innerHTML = `
        <div class="library-preview-fallback">
            <p>Preview not available for this file type.</p>
            <!--<a href="${url}" download="${escapeHtml(file.name)}" class="btn btn-primary library-download-btn">Download</a>-->
        </div>
    `;
}

async function fetchLibraryFileBlob(fileId) {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    },
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Download failed");
  }

  return response.blob();
}

function formatMimeLabel(mimeType) {
  if (!mimeType) return "Unknown";
  const map = {
    "application/pdf": "PDF",
    "application/zip": "ZIP Archive",
    "application/x-zip-compressed": "ZIP Archive",
    "application/json": "JSON",
    "application/xml": "XML",
    "text/plain": "Text",
    "text/csv": "CSV",
    "text/html": "HTML",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel (XLSX)",
    "application/vnd.ms-excel": "Excel (XLS)",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word (DOCX)",
    "application/msword": "Word (DOC)",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint (PPTX)",
    "application/vnd.ms-powerpoint": "PowerPoint (PPT)",
    "application/vnd.google-apps.spreadsheet": "Google Sheets",
    "application/vnd.google-apps.document": "Google Docs",
    "application/vnd.google-apps.presentation": "Google Slides",
    "application/vnd.google-apps.folder": "Folder",
  };
  if (map[mimeType]) return map[mimeType];
  if (mimeType.startsWith("image/")) return "Image (" + mimeType.split("/")[1].toUpperCase() + ")";
  if (mimeType.startsWith("video/")) return "Video (" + mimeType.split("/")[1].toUpperCase() + ")";
  if (mimeType.startsWith("audio/")) return "Audio (" + mimeType.split("/")[1].toUpperCase() + ")";
  // Fallback: take last segment after last dot or slash
  const parts = mimeType.split(/[/.]+/);
  const last = parts[parts.length - 1];
  return last.length <= 12 ? last.toUpperCase() : mimeType;
}

function updateLibraryDetailMeta(file) {
  const title = document.getElementById("libraryDetailTitle");
  const meta = document.getElementById("libraryDetailMeta");

  if (title) {
    title.textContent = file.name;
  }

  if (meta) {
    const sizeLabel = file.size ? formatFileSize(Number(file.size)) : "-";
    const dateLabel = file.modifiedTime
      ? new Date(file.modifiedTime).toLocaleString()
      : "-";
    meta.textContent = `${formatMimeLabel(file.mimeType)} · ${sizeLabel} · ${dateLabel}`;
  }
}

function setLibraryDetailVisible(show) {
  const modal = document.getElementById("libraryPreviewModal");
  if (!modal) return;
  modal.classList.toggle("active", show);
  if (show) lockBodyScroll(); else unlockBodyScroll();
}

async function renameLibraryItem(fileId = null) {
  const targetId = fileId || libraryState.selectedId;
  if (!targetId) return;

  const item = libraryState.items.find((file) => file.id === targetId);
  if (!item) return;

  const newName = prompt("Rename file:", item.name);
  if (!newName || newName.trim() === item.name) return;

  await gapi.client.drive.files.update({
    fileId: targetId,
    resource: { name: newName.trim() },
  });

  await loadLibraryItems();
  openLibraryDetail(targetId);
}

async function deleteLibraryItem(fileId = null) {
  const targetId = fileId || libraryState.selectedId;
  if (!targetId) return;

  const item = libraryState.items.find((file) => file.id === targetId);
  if (!item) return;

  showConfirmModal(
    "Delete File",
    `Delete ${item.name}? This cannot be undone.`,
    async () => {
      await gapi.client.drive.files.delete({ fileId: targetId });
      if (libraryState.selectedId === targetId) {
        libraryState.selectedId = null;
        if (libraryState.previewUrl) {
          URL.revokeObjectURL(libraryState.previewUrl);
          libraryState.previewUrl = null;
        }
        setLibraryDetailVisible(false);
      }

      await loadLibraryItems();
      showToast("File deleted", "success");
    }
  );
}

async function downloadLibraryItem() {
  if (!libraryState.selectedId) return;

  const file = libraryState.items.find(
    (item) => item.id === libraryState.selectedId,
  );
  if (!file) return;

  try {
    const blob = await fetchLibraryFileBlob(libraryState.selectedId);
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Error downloading file:", error);
    showToast("Failed to download file.", "error");
  }
}

function closeLibraryDetail() {
  libraryState.selectedId = null;
  if (libraryState.previewUrl) {
    URL.revokeObjectURL(libraryState.previewUrl);
    libraryState.previewUrl = null;
  }
  setLibraryDetailVisible(false);
  renderLibraryList(); // Refresh to remove selected state
}

/**
 * Returns the ordered list of item IDs that can be navigated in the current
 * library view context (uploaded files, observation photos, agronomy photos).
 */
function getLibraryPreviewNeighborList() {
  const section = libraryState.section;
  const query = (libraryState.searchQuery || "").toLowerCase();
  const sortDir = libraryState.sortDir === "asc" ? 1 : -1;

  if (section === "observation-photos") {
    const trialId = libraryState._openTrialPhotoFolderId;
    if (!trialId) return [];
    let photos = (libraryState.trialPhotos || []).filter(p => p.trialId === trialId);

    if (query) {
      photos = photos.filter(p =>
        [p.entryName, p.name, p.rawFileName, p.paramName, p.repLabel].filter(Boolean).join(" ").toLowerCase().includes(query)
      );
    }

    photos.sort((a, b) => {
      switch (libraryState.sortBy) {
        case "name": return ((a.entryName || a.name || "").localeCompare(b.entryName || b.name || "")) * sortDir;
        case "size": return (Number(a.size || 0) - Number(b.size || 0)) * sortDir;
        case "modifiedTime":
        default: return (new Date(a.modifiedTime || 0).getTime() - new Date(b.modifiedTime || 0).getTime()) * sortDir;
      }
    });
    return photos.map(p => p.id);
  }

  if (section === "agronomy-photos") {
    const trialId = libraryState._openTrialPhotoFolderId;
    if (!trialId) return [];
    let photos = (libraryState.agronomyPhotos || []).filter(p => p.trialId === trialId);

    if (query) {
      photos = photos.filter(p =>
        [p.name, p.trialName, p.rawFileName].filter(Boolean).join(" ").toLowerCase().includes(query)
      );
    }

    photos.sort((a, b) => {
      switch (libraryState.sortBy) {
        case "name": return (a.name || "").localeCompare(b.name || "") * sortDir;
        case "size": return (Number(a.size || 0) - Number(b.size || 0)) * sortDir;
        case "modifiedTime":
        default: return (new Date(a.modifiedTime || 0).getTime() - new Date(b.modifiedTime || 0).getTime()) * sortDir;
      }
    });
    return photos.map(p => p.id);
  }

  // "files" section — non-folder files only
  const FOLDER_MIME = "application/vnd.google-apps.folder";
  let files = libraryState.items.filter(f => f.mimeType !== FOLDER_MIME);

  if (query) {
    files = files.filter(f => f.name.toLowerCase().includes(query));
  }
  if (libraryState.activeFilter !== "all") {
    files = files.filter(f => getFileCategory(f.mimeType) === libraryState.activeFilter);
  }

  files.sort((a, b) => {
    switch (libraryState.sortBy) {
      case "name": return (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase()) * sortDir;
      case "size": return (Number(a.size || 0) - Number(b.size || 0)) * sortDir;
      case "type": return getFileCategory(a.mimeType || "").localeCompare(getFileCategory(b.mimeType || "")) * sortDir;
      case "modifiedTime":
      default: return (new Date(a.modifiedTime || 0).getTime() - new Date(b.modifiedTime || 0).getTime()) * sortDir;
    }
  });
  return files.map(f => f.id);
}

function navigateLibraryPreview(direction) {
  const ids = getLibraryPreviewNeighborList();
  const curIdx = ids.indexOf(libraryState.selectedId);
  if (curIdx < 0) return;
  const nextIdx = curIdx + direction;
  if (nextIdx < 0 || nextIdx >= ids.length) return;

  const nextId = ids[nextIdx];
  if (libraryState.section === "observation-photos" || libraryState.section === "agronomy-photos") {
    openTrialPhotoDetail(nextId);
  } else {
    openLibraryDetail(nextId);
  }
}

function updateLibraryPreviewNavButtons() {
  const prevBtn = document.getElementById("libraryPreviewPrev");
  const nextBtn = document.getElementById("libraryPreviewNext");
  if (!prevBtn || !nextBtn) return;

  const ids = getLibraryPreviewNeighborList();
  const curIdx = ids.indexOf(libraryState.selectedId);

  prevBtn.disabled = curIdx <= 0;
  nextBtn.disabled = curIdx < 0 || curIdx >= ids.length - 1;
}

document.addEventListener("keydown", (e) => {
  const modal = document.getElementById("libraryPreviewModal");
  if (!modal || !modal.classList.contains("active")) return;
  if (e.key === "ArrowLeft") { e.preventDefault(); navigateLibraryPreview(-1); }
  else if (e.key === "ArrowRight") { e.preventDefault(); navigateLibraryPreview(1); }
  else if (e.key === "Escape") { e.preventDefault(); closeLibraryDetail(); }
});

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
