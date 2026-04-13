// Trial Management
let trialState = {
  trials: [],
  editingTrialId: null,
  currentAreas: [],
  dummyLayoutArea: null,
  isDrawing: false,
  currentPolygon: null,
  currentSection: "basic", // Track current section
};

let trialMapInstance = null;
let trialDrawnLayers = [];
let trialCurrentDrawing = null;

// Initialize trial module
async function initializeTrials(options = {}) {
  const onProgress = options.onProgress;
  let hasCache = false;

  try {
    let cached = null;
    if (typeof loadLocalCache === "function") {
      cached = await loadLocalCache("trials");
    }

    if (cached?.trials) {
      trialState.trials = cached.trials;
      // Restore loading state from cache
      trialState.trials.forEach(t => {
        // Restore _loadedAreas array from cache
        if (!Array.isArray(t._loadedAreas)) t._loadedAreas = [];

        // Determine if fully loaded: must have _loadedAreas AND actual response data
        const hasResponseData = t._loadedAreas.length > 0 &&
          (t.responses && Object.keys(t.responses).some(k => Object.keys(t.responses[k] || {}).length > 0));
        const totalAreas = (t.areas || []).length;
        const allAreasLoaded = totalAreas > 0 ? t._loadedAreas.length >= totalAreas : t._loadedAreas.length > 0;

        if (hasResponseData && allAreasLoaded) {
          t._responsesLoaded = true;
        } else if (t._loadedAreas.length > 0 && hasResponseData) {
          // Partially loaded — keep the loaded areas, don't mark as fully loaded
          t._responsesLoaded = false;
        } else {
          // No data loaded
          t._responsesLoaded = false;
          t._loadedAreas = [];
        }
      });
      hasCache = true;

      renderTrials();

      if (onProgress) {
        onProgress(0.2, "Loaded trials from device");
      }
    }

    // Load trials from Google Drive (in background via sync queue) — skip for guest
    const isGuest = typeof getCurrentUser === 'function' && getCurrentUser()?.isGuest;
    if (!isGuest) {
      if (typeof enqueueSync === 'function') {
        enqueueSync({
          label: 'Load Trials',
          run: async () => {
            const freshTrials = await loadTrialsFromGoogleDrive();

            // Merge: keep locally loaded responses for trials that already have them
            for (const freshTrial of freshTrials) {
              const cached = trialState.trials.find(t => t.id === freshTrial.id);
              if (cached && (cached._responsesLoaded || (Array.isArray(cached._loadedAreas) && cached._loadedAreas.length > 0))) {
                freshTrial.responses = cached.responses;
                freshTrial.agronomyResponses = cached.agronomyResponses;
                freshTrial._responsesLoaded = cached._responsesLoaded;
                freshTrial._loadedAreas = cached._loadedAreas;
                freshTrial._loadedAreaTypes = cached._loadedAreaTypes || {};
                freshTrial._loadSyncMarker = cached._loadSyncMarker || {};
              }
            }

            trialState.trials = freshTrials;
            renderTrials();

            if (typeof saveLocalCache === "function") {
              saveLocalCache("trials", { trials: trialState.trials });
            }

            if (onProgress) {
              onProgress(1, "Trials synced");
            }

            // Run orphan cleanup in background (non-blocking)
            cleanupOrphanTrialFolders().catch(e =>
              console.error("[Cleanup] Background orphan cleanup failed:", e)
            );
          }
        });
      } else {
        const freshTrials = await loadTrialsFromGoogleDrive();

        for (const freshTrial of freshTrials) {
          const cached = trialState.trials.find(t => t.id === freshTrial.id);
          if (cached && (cached._responsesLoaded || (Array.isArray(cached._loadedAreas) && cached._loadedAreas.length > 0))) {
            freshTrial.responses = cached.responses;
            freshTrial.agronomyResponses = cached.agronomyResponses;
            freshTrial._responsesLoaded = cached._responsesLoaded;
            freshTrial._loadedAreas = cached._loadedAreas;
            freshTrial._loadedAreaTypes = cached._loadedAreaTypes || {};
            freshTrial._loadSyncMarker = cached._loadSyncMarker || {};
          }
        }

        trialState.trials = freshTrials;
        renderTrials();

        if (typeof saveLocalCache === "function") {
          saveLocalCache("trials", { trials: trialState.trials });
        }

        if (onProgress) {
          onProgress(1, "Trials synced");
        }

        // Run orphan cleanup in background
        cleanupOrphanTrialFolders().catch(e =>
          console.error("[Cleanup] Background orphan cleanup failed:", e)
        );
      }
    }
  } catch (error) {
    console.error("Error initializing trials:", error);
    if (!hasCache) {
      showToast("Error loading trials data. Please refresh the page.", "error");
    }
  }
}

// ─── Trial list mode helpers ───
function getTrialListColumns() {
  return [
    { key: "name", label: "Name", min: 120, flex: true },
    { key: "crop", label: "Crop", min: 80, width: 120 },
    { key: "type", label: "Type", min: 70, width: 100 },
    { key: "progress", label: "Progress", min: 80, width: 90 },
    { key: "status", label: "Status", min: 80, width: 110 },
  ];
}

function getTrialListTemplate(columns) {
  return columns.map((col) => {
    if (col.flex) return `minmax(${col.min || 80}px, 1fr)`;
    if (col.auto) return "auto";
    return `${col.width || 100}px`;
  }).join(" ");
}

function renderTrialListCell(trial, col) {
  const progress = getTrialProgress(trial);
  const isLoaded = !!trial._responsesLoaded;
  const hasProgressSummary = !!trial.progressSummary;
  const showProgress = isLoaded || hasProgressSummary;
  const progressPercent = showProgress ? progress.percentage : 0;
  const canRun = canRunTrialActivities(trial);

  const values = {
    name: escapeHtml(trial.name),
    crop: escapeHtml(trial.cropName || "-"),
    type: escapeHtml(trial.trialType || "-"),
    progress: showProgress ? `${progressPercent}%` : "—",
    status: isLoaded
      ? '<span class="trial-card-load-badge loaded"><span class="material-symbols-rounded" style="font-size:14px">check_circle</span> Loaded</span>'
      : (!canRun
        ? '<span style="color:var(--text-tertiary);font-size:0.75rem">Incomplete</span>'
        : '<span class="trial-card-load-badge not-loaded"><span class="material-symbols-rounded" style="font-size:14px">cloud_off</span> Not loaded</span>'),
  };
  return `<div class="inventory-list-cell" title="${col.key === 'status' ? '' : (values[col.key] || '-')}">${values[col.key] || "-"}</div>`;
}

function renderTrialListMode(container, trials, isArchived) {
  const columns = getTrialListColumns();
  const template = getTrialListTemplate(columns);

  const headerHtml = `
    <div class="inventory-list-header">
      ${columns.map((col) => `
        <div class="inventory-list-head-cell"><span>${escapeHtml(col.label)}</span></div>
      `).join("")}
    </div>
  `;

  const rowsHtml = trials.map((trial) => `
    <div class="inventory-list-row${isArchived ? ' trial-card-archived' : ''}" data-trial-id="${trial.id}" style="cursor:pointer" onclick="showTrialActionPopup(event, '${trial.id}')">
      ${columns.map((col) => renderTrialListCell(trial, col)).join("")}
    </div>
  `).join("");

  container.innerHTML = `<div class="inventory-list-table" style="grid-template-columns:${template}">${headerHtml}${rowsHtml}</div>`;
}

// Render trials list
function renderTrials() {
  const activeContainer = document.getElementById("trialList");
  const archivedContainer = document.getElementById("archivedTrialList");
  const archivedPanel = document.getElementById("archivedTrialManagementPanel");
  
  // Separate active and archived trials
  const activeTrials = trialState.trials.filter(t => !t.archived);
  const archivedTrials = trialState.trials.filter(t => t.archived);

  const renderTrialCard = (trial) => {
    const progress = getTrialProgress(trial);
    const isLoaded = !!trial._responsesLoaded;
    const hasProgressSummary = !!trial.progressSummary;
    const showProgress = isLoaded || hasProgressSummary;
    const progressPercent = showProgress ? progress.percentage : 0;
    const canRun = canRunTrialActivities(trial);

    const loadBadge = isLoaded
      ? '<span class="trial-card-load-badge loaded"><span class="material-symbols-rounded">check_circle</span></span>'
      : '<span class="trial-card-load-badge not-loaded"><span class="material-symbols-rounded">cloud_off</span> Not loaded</span>';

    return `
      <div class="run-trial-card" data-trial-id="${trial.id}" onclick="showTrialActionPopup(event, '${trial.id}')">
        <div class="run-trial-card-header">
          <div class="run-trial-card-icon">
            <svg class="progress-circle" width="64" height="64" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="28" class="progress-circle-bg"></circle>
              <circle cx="32" cy="32" r="28" class="progress-circle-fill"
                      style="stroke-dasharray: ${progressPercent * 1.75} 175; stroke: ${showProgress ? getProgressGradientColor(progressPercent) : 'var(--border)'}"></circle>
              <text x="32" y="37" class="progress-circle-text" text-anchor="middle">${showProgress ? progressPercent + '%' : '—'}</text>
            </svg>
          </div>
          <div class="run-trial-card-body">
            <div class="run-trial-card-title">${escapeHtml(trial.name)}</div>
            <div class="run-trial-card-meta">${escapeHtml(trial.cropName || "")}${trial.trialType ? " · " + escapeHtml(trial.trialType) : ""}${!canRun ? ' · <span style="color:var(--text-tertiary);font-size:0.75rem;">Incomplete setup</span>' : ""} · ${loadBadge}</div>
          </div>
        </div>
      </div>
    `;
  };

  const renderArchivedTrialCard = (trial) => {
    const progress = getTrialProgress(trial);
    const isLoaded = !!trial._responsesLoaded;
    const hasProgressSummary = !!trial.progressSummary;
    const showProgress = isLoaded || hasProgressSummary;
    const progressPercent = showProgress ? progress.percentage : 0;

    return `
      <div class="run-trial-card trial-card-archived" data-trial-id="${trial.id}" onclick="showTrialActionPopup(event, '${trial.id}')">
        <div class="run-trial-card-header">
          <div class="run-trial-card-icon">
            <svg class="progress-circle" width="64" height="64" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="28" class="progress-circle-bg"></circle>
              <circle cx="32" cy="32" r="28" class="progress-circle-fill"
                      style="stroke-dasharray: ${progressPercent * 1.75} 175; stroke: ${showProgress ? getProgressGradientColor(progressPercent) : 'var(--border)'}"></circle>
              <text x="32" y="37" class="progress-circle-text" text-anchor="middle">${showProgress ? progressPercent + '%' : '—'}</text>
            </svg>
          </div>
          <div class="run-trial-card-body">
            <div class="run-trial-card-title">${escapeHtml(trial.name)}</div>
            <div class="run-trial-card-meta">${escapeHtml(trial.cropName || "")}${trial.trialType ? " · " + escapeHtml(trial.trialType) : ""} · <span style="color:var(--text-tertiary);font-size:0.75rem;">Archived</span></div>
          </div>
        </div>
      </div>
    `;
  };

  if (activeTrials.length === 0 && archivedTrials.length === 0) {
    activeContainer.innerHTML = `
      <div class="empty-state run-empty-grid" style="grid-column: 1/-1;">
        <span class="material-symbols-rounded">science</span>
        <p>No trials yet. Create your first trial to get started.</p>
      </div>
    `;
    if (archivedPanel) archivedPanel.style.display = "none";
    return;
  }

  // Render active trials
  if (activeTrials.length > 0) {
    activeContainer.innerHTML = activeTrials.map(renderTrialCard).join("");
  } else {
    activeContainer.innerHTML = `
      <div class="empty-state run-empty-grid" style="grid-column: 1/-1;">
        <span class="material-symbols-rounded">science</span>
        <p>No active trials. Create your first trial to get started.</p>
      </div>
    `;
  }

  // Render archived trials
  if (archivedTrials.length > 0) {
    if (archivedPanel) archivedPanel.style.display = "block";
    archivedContainer.innerHTML = archivedTrials.map(renderArchivedTrialCard).join("");
  } else {
    if (archivedPanel) archivedPanel.style.display = "none";
  }

  // Keep dashboard in sync
  renderDashboardTrialProgress();
  if (typeof refreshReminderViewsRealtime === "function") {
    refreshReminderViewsRealtime();
  }
}

// Format month-year for display
function formatMonthYear(dateString) {
  if (!dateString) return "-";
  const [year, month] = dateString.split("-");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[parseInt(month) - 1]} ${year}`;
}

function getAreaPlantingDate(trial, areaIndex) {
  const area = trial?.areas?.[areaIndex];
  return (
    area?.plantingDate ||
    area?.layout?.plantingDate ||
    trial?.plantingDate ||
    ""
  );
}

function getTrialPlantingDates(trial) {
  const areas = trial?.areas || [];
  const dates = areas
    .map((_, areaIndex) => getAreaPlantingDate(trial, areaIndex))
    .filter(Boolean);
  if (dates.length > 0) {
    return Array.from(new Set(dates)).sort();
  }
  return trial?.plantingDate ? [trial.plantingDate] : [];
}

function getTrialPrimaryPlantingDate(trial) {
  const dates = getTrialPlantingDates(trial);
  return dates.length > 0 ? dates[0] : "";
}

function getTrialPlantingDateSummary(trial) {
  const dates = getTrialPlantingDates(trial);
  if (dates.length === 0) return "–";
  if (dates.length === 1) {
    return new Date(`${dates[0]}T00:00:00`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  const first = new Date(`${dates[0]}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const last = new Date(`${dates[dates.length - 1]}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return `${first} – ${last}`;
}

function hasTrialFieldSetup(trial) {
  return Array.isArray(trial?.areas) && trial.areas.length > 0;
}

function hasTrialLayoutSetup(trial) {
  return hasTrialFieldSetup(trial) && trial.areas.some((area) => {
    const layout = area?.layout;
    if (!layout) return false;

    const hasResult = Array.isArray(layout.result)
      ? layout.result.length > 0
      : Boolean(layout.result);
    if (hasResult) return true;

    return layout.layoutType === "custom" && Array.isArray(layout.lines) && layout.lines.length > 0;
  });
}

function hasTrialPlantingDateForRun(trial) {
  if (!hasTrialLayoutSetup(trial)) return false;

  const areas = Array.isArray(trial?.areas) ? trial.areas : [];
  const layoutAreaIndices = areas
    .map((area, areaIndex) => (area?.layout?.result ? areaIndex : -1))
    .filter((areaIndex) => areaIndex >= 0);

  if (layoutAreaIndices.length === 0) return false;
  return layoutAreaIndices.every((areaIndex) => Boolean(getAreaPlantingDate(trial, areaIndex)));
}

function canRunTrialActivities(trial) {
  return hasTrialFieldSetup(trial) && hasTrialLayoutSetup(trial) && hasTrialPlantingDateForRun(trial);
}

function getDummyLayoutArea() {
  const existing = trialState.dummyLayoutArea || {};
  return {
    name: existing.name || "Dummy Area",
    areaSize: existing.areaSize || null,
    plantingDate: existing.plantingDate || "",
    layout: existing.layout || null,
  };
}

function applyDummyLayoutToFirstArea() {
  const dummyLayout = trialState.dummyLayoutArea?.layout;
  if (!dummyLayout || !Array.isArray(trialState.currentAreas) || trialState.currentAreas.length === 0) {
    return;
  }

  const firstArea = trialState.currentAreas[0];
  if (!firstArea) return;

  const firstAreaHasLayout = Boolean(firstArea?.layout?.result && firstArea.layout.result.length > 0);
  if (firstAreaHasLayout) {
    showToast("Dummy layout tersedia, tetapi Area 1 sudah memiliki layout sendiri.", "info");
    return;
  }

  const copiedResult = Array.isArray(dummyLayout.result)
    ? dummyLayout.result.map((grid) =>
        Array.isArray(grid)
          ? grid.map((row) => (Array.isArray(row) ? [...row] : row))
          : grid,
      )
    : [];

  firstArea.layout = {
    lines: Array.isArray(dummyLayout.lines) ? [...dummyLayout.lines] : [],
    numRanges: dummyLayout.numRanges || 1,
    numReps: dummyLayout.numReps || 1,
    direction: dummyLayout.direction || "serpentine",
    randomization: dummyLayout.randomization || "normal",
    plantingDate: trialState.dummyLayoutArea?.plantingDate || "",
    result: copiedResult,
  };

  if (!firstArea.plantingDate && trialState.dummyLayoutArea?.plantingDate) {
    firstArea.plantingDate = trialState.dummyLayoutArea.plantingDate;
  }

  trialState.dummyLayoutArea = null;
  showToast("The dummy layout is automatically applied to the first area.", "success");
}

// Toggle archived trials visibility
function toggleArchivedTrials() {
  const archivedPanel = document.getElementById("archivedTrialManagementPanel");
  const archivedList = document.getElementById("archivedTrialList");
  const toggleHead = document.querySelector(".inventory-header.archived-header");
  const toggle = document.querySelector(".archived-header-toggle");
  
  if (!archivedPanel) return;
  
  archivedList.classList.toggle("collapsed");
  toggleHead.classList.toggle("collapsed");
  toggle.classList.toggle("collapsed");
}

// Open add trial modal
function openAddTrialModal() {
  trialState.editingTrialId = null;
  trialState.currentAreas = [];
  trialState.dummyLayoutArea = null;
  trialState.currentSection = "basic";
  document.getElementById("trialForm").reset();

  // Show first section
  showTrialSection("basic");

  // Populate crops from inventory
  populateTrialCrops();

  // Populate locations
  populateTrialLocations();

  // Populate parameters
  populateTrialParameters();

  // Reset agronomy monitoring
  const agronomyCheckbox = document.getElementById('trialAgronomyMonitoring');
  if (agronomyCheckbox) agronomyCheckbox.checked = false;
  const agronomyContainer = document.getElementById('agronomyPickerContainer');
  if (agronomyContainer) agronomyContainer.classList.add('hidden');
  trialState.selectedAgronomyOrder = [];

  // Reset split-plot state
  trialState._splitPlotCodes = {};
  trialState._splitPlotLocationAsFactor = false;
  const arrangementSelect = document.getElementById("trialFactorArrangement");
  if (arrangementSelect) arrangementSelect.value = "factorial";
  const arrangementGroup = document.getElementById("trialFactorArrangementGroup");
  if (arrangementGroup) arrangementGroup.style.display = "none";
  const splitPlotNav = document.getElementById("splitPlotNavItem");
  if (splitPlotNav) splitPlotNav.style.display = "none";

  // Setup pollination → trial type cascade
  setupPollinationTrialTypeCascade();
  updateTrialTypeOptions();
  updatePlotSpecVisibility();

  // Setup calculation listeners and reset calculated fields
  setupTrialGeneralCalculations();

  // Setup factors/treatments fields
  setupTrialFactorsAndTreatments();
  renderTrialTreatmentsInputs(1, []);

  // Setup agronomy monitoring listeners
  setupAgronomyMonitoringListeners();

  // Reset areas list
  document.getElementById("areasList").classList.add("hidden");
  document.getElementById("areasEmptyState").classList.remove("hidden");
  document.getElementById("areasListContainer").innerHTML = "";

  // Setup section nav click handlers
  setupSectionNavHandlers();

  toggleTrialEditor(true);
  document.getElementById("trialName").focus();
}

// Setup section navigation click handlers
function setupSectionNavHandlers() {
  document.querySelectorAll(".section-nav-item").forEach((item) => {
    item.onclick = () => {
      const targetSection = item.dataset.section;
      if (targetSection === "plotspec" && !canAccessPlotSpecSection()) {
        showToast("Please select type of pollination and trial type first", "error");
        return;
      }
      // Only allow navigation to completed or current section
      // For now, allow free navigation during development
      showTrialSection(targetSection);
    };
  });
}

// Open edit trial modal
function openEditTrialModal(trialId) {
  trialState.editingTrialId = trialId;
  trialState.dummyLayoutArea = null;
  trialState.currentSection = "basic";
  const trial = trialState.trials.find((t) => t.id === trialId);

  if (!trial) return;
  document.getElementById("trialName").value = trial.name;
  document.getElementById("trialDescription").value = trial.description || "";
  document.getElementById("trialPlantingStart").value =
    trial.plantingStart || "";
  document.getElementById("trialPlantingEnd").value = trial.plantingEnd || "";
  document.getElementById("trialPlantingSeason").value = trial.plantingSeason || "";

  // Set pollination first so trial type options get populated
  document.getElementById("trialPollination").value = trial.pollination || "";
  updateTrialTypeOptions();
  document.getElementById("trialType").value = trial.trialType || "";
  updatePlotSpecVisibility();

  document.getElementById("trialExpDesign").value = trial.expDesign || "";
  const factorCount = normalizeTrialFactorsCount(trial.trialFactors);
  document.getElementById("trialFactors").value = String(factorCount);
  renderTrialTreatmentsInputs(factorCount, normalizeTrialFactorDefinitions(trial));

  // Restore factor arrangement / split-plot state
  const arrangementSelect = document.getElementById("trialFactorArrangement");
  if (arrangementSelect) {
    arrangementSelect.value = trial.factorArrangement || "factorial";
  }
  trialState._splitPlotCodes = trial.splitPlotCodes || {};
  trialState._splitPlotLocationAsFactor = !!trial.splitPlotLocationAsFactor;

  // Restore Parent Test / Process Research fields
  document.getElementById("trialRowsPerPlot").value = trial.rowsPerPlot ?? "";
  document.getElementById("trialPlotLength").value = trial.plotLength ?? "";
  document.getElementById("trialPlantSpacingWidth").value = trial.plantSpacingWidth ?? "";
  document.getElementById("trialPlantSpacingHeight").value = trial.plantSpacingHeight ?? "";

  // Restore Micropilot fields
  document.getElementById("trialMpPanel").value = trial.mpPanel ?? "";
  document.getElementById("trialRatioFemale").value = trial.ratioFemale ?? "";
  document.getElementById("trialRatioMale").value = trial.ratioMale ?? "";

  document.getElementById("trialMpPlotLength").value = trial.mpPlotLength ?? "";
  document.getElementById("trialMpSpacingWidth").value = trial.mpSpacingWidth ?? "";
  document.getElementById("trialMpSpacingHeight").value = trial.mpSpacingHeight ?? "";

  // Populate dropdowns
  populateTrialCrops();
  document.getElementById("trialCrops").value = trial.cropId || "";

  populateTrialLocations();
  const trialLocationSelect = document.getElementById("trialLocation");
  if (trialLocationSelect) trialLocationSelect.value = trial.locationId || "";

  populateTrialParameters(trial.parameters);

  // Restore agronomy monitoring
  const agronomyCheckbox = document.getElementById('trialAgronomyMonitoring');
  const agronomyContainer = document.getElementById('agronomyPickerContainer');
  if (trial.agronomyMonitoring && agronomyCheckbox) {
    agronomyCheckbox.checked = true;
    if (agronomyContainer) agronomyContainer.classList.remove('hidden');
    trialState.selectedAgronomyOrder = Array.isArray(trial.agronomyItems) ? [...trial.agronomyItems] : [];
    populateTrialAgronomy(trialState.selectedAgronomyOrder);
  } else {
    if (agronomyCheckbox) agronomyCheckbox.checked = false;
    if (agronomyContainer) agronomyContainer.classList.add('hidden');
    trialState.selectedAgronomyOrder = [];
  }

  // Setup pollination → trial type cascade
  setupPollinationTrialTypeCascade();

  // Setup calculation listeners and refresh calculated fields
  setupTrialGeneralCalculations();

  // Setup factors/treatments listeners
  setupTrialFactorsAndTreatments();

  // Setup agronomy monitoring listeners
  setupAgronomyMonitoringListeners();

  // Load areas
  trialState.currentAreas = trial.areas || [];
  if (trial.plantingDate && trialState.currentAreas.length > 0) {
    trialState.currentAreas = trialState.currentAreas.map((area) => ({
      ...area,
      plantingDate: area?.plantingDate || area?.layout?.plantingDate || trial.plantingDate,
    }));
  }

  // Show first section
  showTrialSection("basic");

  // Setup section nav click handlers
  setupSectionNavHandlers();

  toggleTrialEditor(true);
  document.getElementById("trialName").focus();
}

// Close trial modal
function closeTrialModal() {
  // Close field map popup if open
  const fieldPopup = document.getElementById("fieldMapPopup");
  if (fieldPopup && !fieldPopup.classList.contains("hidden")) {
    fieldPopup.classList.add("hidden");
  }
  toggleTrialEditor(false);
  trialState.editingTrialId = null;
  trialState.currentAreas = [];
  trialState.dummyLayoutArea = null;
  trialState.isDrawing = false;
  trialState.currentPolygon = null;
  trialState.currentSection = "basic";
  destroyTrialMap();
}

function isTrialEditorActive() {
  const editor = document.getElementById("trialEditor");
  return Boolean(editor && editor.classList.contains("active"));
}

function requestCloseTrialEditor(onClosed) {
  if (!isTrialEditorActive()) {
    if (typeof onClosed === "function") onClosed();
    return;
  }

  const proceed = () => {
    closeTrialModal();
    if (typeof onClosed === "function") onClosed();
  };

  if (document.getElementById("genericConfirmModal")) return;

  if (typeof showConfirmModal === "function") {
    showConfirmModal(
      "Discard changes?",
      "You have unsaved changes in this trial form. Exit and discard them?",
      proceed,
      "Discard",
      "btn-danger"
    );
  } else if (window.confirm("You have unsaved changes in this trial form. Exit and discard them?")) {
    proceed();
  }
}

function toggleTrialEditor(show) {
  const editor = document.getElementById("trialEditor");
  const panel = document.getElementById("trialManagementPanel");
  const archive = document.getElementById("archivedTrialManagementPanel");
  if (!editor || !panel) return;

  if (show) {
    editor.classList.add("active");
    panel.classList.add("hidden");
    if (archive) archive.classList.add("hidden");
    enterTrialFullscreenMode({
      title: trialState.editingTrialId ? "Edit Trial" : "Create Trial",
      onClose: () => requestCloseTrialEditor(),
    });
  } else {
    editor.classList.remove("active");
    panel.classList.remove("hidden");
    if (archive) archive.classList.remove("hidden");
    exitTrialFullscreenMode();
  }
}

let trialFullscreenState = {
  active: false,
  previousPageTitle: "Trial",
  previousMenuHtml: '<span class="material-symbols-rounded">menu</span>',
  previousMenuOnclick: null,
  previousDisplays: {},
};

function enterTrialFullscreenMode({ title, onClose }) {
  const topbar = document.querySelector(".topbar");
  const pageTitle = document.getElementById("pageTitle");
  const menuToggle = document.querySelector(".menu-toggle");

  const managedIds = [
    "loadDataBtn",
    "syncStatusBtn",
    "runTrialNavBtn",
    "runTrialSaveBtn",
    "trialReportSheetSelect",
    "trialReportTopbarDownloadBtn",
    "userMenu",
  ];

  trialFullscreenState.previousDisplays = {};
  managedIds.forEach((id) => {
    const element = document.getElementById(id);
    if (!element) return;
    trialFullscreenState.previousDisplays[id] = element.style.display;
    element.style.display = "none";
  });

  trialFullscreenState.previousPageTitle = pageTitle?.textContent || "Trial";
  if (menuToggle) {
    trialFullscreenState.previousMenuHtml = menuToggle.innerHTML;
    trialFullscreenState.previousMenuOnclick = menuToggle.onclick;
  }

  if (topbar) topbar.classList.add("run-trial-mode");
  if (pageTitle) pageTitle.textContent = title || "Trial";
  if (menuToggle) {
    menuToggle.innerHTML = '<span class="material-symbols-rounded">close</span>';
    menuToggle.onclick = onClose;
  }

  document.body.classList.add("trial-fullscreen-active", "sidebar-collapsed");

  // Move section nav to topbar-right
  const sectionNav = document.querySelector(".trial-section-nav");
  const topbarRight = document.querySelector(".topbar-right");
  if (sectionNav && topbarRight) {
    topbarRight.appendChild(sectionNav);
  }

  trialFullscreenState.active = true;
}

function exitTrialFullscreenMode() {
  if (!trialFullscreenState.active) return;

  const topbar = document.querySelector(".topbar");
  const pageTitle = document.getElementById("pageTitle");
  const menuToggle = document.querySelector(".menu-toggle");

  if (topbar) topbar.classList.remove("run-trial-mode");
  if (pageTitle) pageTitle.textContent = trialFullscreenState.previousPageTitle || "Trial";
  if (menuToggle) {
    menuToggle.innerHTML = trialFullscreenState.previousMenuHtml || '<span class="material-symbols-rounded">menu</span>';
    menuToggle.onclick = trialFullscreenState.previousMenuOnclick || null;
  }

  Object.entries(trialFullscreenState.previousDisplays || {}).forEach(([id, display]) => {
    const element = document.getElementById(id);
    if (!element) return;
    element.style.display = display || "";
  });

  document.body.classList.remove("trial-fullscreen-active", "sidebar-collapsed");

  // Move section nav back to trial editor
  const sectionNav = document.querySelector(".trial-section-nav");
  const editorContent = document.querySelector(".trial-editor-content");
  const modalBody = editorContent?.querySelector(".modal-body-scrollable");
  if (sectionNav && editorContent && modalBody) {
    editorContent.insertBefore(sectionNav, modalBody);
  }

  trialFullscreenState.active = false;
}

function switchTrialTab(tabName) {
  // In the unified view, 'run' simply means initialize run trial (which will be triggered from modal)
  if (tabName === "run") {
    initializeRunTrial();
  }
}

function getTrialEditorSections() {
  const base = ["basic", "experiment"];
  if (isMultiFactorMode()) {
    base.push("splitplot");
  }
  base.push("plotspec", "observation", "field", "layouting");
  return base;
}

/**
 * Returns true when the current trial form has more than 1 factor
 * AND factor arrangement is "splitplot".
 */
function isSplitPlotMode() {
  const factorCount = normalizeTrialFactorsCount(document.getElementById("trialFactors")?.value);
  const arrangement = document.getElementById("trialFactorArrangement")?.value || "factorial";
  return factorCount > 1 && arrangement === "splitplot";
}

/**
 * Returns true when the current trial form has more than 1 factor
 * AND factor arrangement is "factorial".
 */
function isFactorialMode() {
  const factorCount = normalizeTrialFactorsCount(document.getElementById("trialFactors")?.value);
  const arrangement = document.getElementById("trialFactorArrangement")?.value || "factorial";
  return factorCount > 1 && arrangement === "factorial";
}

/**
 * Returns true when multi-factor mode is active (either factorial or splitplot).
 */
function isMultiFactorMode() {
  return isFactorialMode() || isSplitPlotMode();
}

function canAccessPlotSpecSection() {
  const pollination = document.getElementById("trialPollination")?.value || "";
  const trialType = document.getElementById("trialType")?.value || "";
  return Boolean(pollination && trialType);
}

function updatePlotSpecSectionAccessState() {
  const navItem = document.querySelector('.section-nav-item[data-section="plotspec"]');
  if (!navItem) return;
  navItem.classList.toggle("disabled", !canAccessPlotSpecSection());
}

// Show trial section
function showTrialSection(sectionName) {
  trialState.currentSection = sectionName;

  // Hide all sections
  document.querySelectorAll(".trial-section").forEach((sec) => {
    sec.classList.remove("active");
  });

  // Show selected section
  const sectionMap = {
    basic: "trialSectionBasic",
    experiment: "trialSectionExperiment",
    splitplot: "trialSectionSplitPlot",
    plotspec: "trialSectionPlotSpec",
    observation: "trialSectionObservation",
    field: "trialSectionField",
    layouting: "trialSectionLayouting",
  };

  const sectionId = sectionMap[sectionName];
  if (sectionId) {
    document.getElementById(sectionId).classList.add("active");
  }

  const scrollContainer = document.querySelector(
    "#trialEditor .modal-body-scrollable",
  );
  if (scrollContainer) {
    scrollContainer.scrollTop = 0;
  }

  // Update navigation
  document.querySelectorAll(".section-nav-item").forEach((item) => {
    item.classList.remove("active");
    if (item.dataset.section === sectionName) {
      item.classList.add("active");
    }
  });

  // Update buttons
  const prevBtn = document.getElementById("trialPrevBtn");
  const nextBtn = document.getElementById("trialNextBtn");
  const saveBtn = document.getElementById("trialModalSaveBtn");
  const sections = getTrialEditorSections();
  const isFirstSection = sectionName === sections[0];
  const isLastSection = sectionName === sections[sections.length - 1];

  if (isFirstSection) {
    prevBtn.classList.add("hidden");
    nextBtn.classList.remove("hidden");
    saveBtn.classList.add("hidden");
  } else if (isLastSection) {
    prevBtn.classList.remove("hidden");
    nextBtn.classList.add("hidden");
    saveBtn.classList.remove("hidden");
  } else {
    prevBtn.classList.remove("hidden");
    nextBtn.classList.remove("hidden");
    saveBtn.classList.add("hidden");
  }

  if (sectionName === "field") {
    // Render areas list (no inline map anymore — map is in the popup)
    renderAreasList();
  } else if (sectionName === "layouting") {
    initializeLayoutingSection();
  } else if (sectionName === "splitplot") {
    renderSplitPlotCodesSection();
  } else if (sectionName === "plotspec") {
    if (!canAccessPlotSpecSection()) {
      showToast("Please select type of pollination and trial type first", "error");
      showTrialSection("experiment");
      return;
    }
    updatePlotSpecVisibility();
  }
}

// Navigate to next section
function nextTrialSection() {
  const sections = getTrialEditorSections();
  const currentIndex = sections.indexOf(trialState.currentSection);

  // Validate current section
  if (trialState.currentSection === "basic" && !validateBasicSection()) return;
  if (trialState.currentSection === "experiment" && !validateExperimentSection()) return;
  if (trialState.currentSection === "observation" && !validateObservationSection()) return;
  if (trialState.currentSection === "field" && !validateLocationSection()) return;

  if (currentIndex < sections.length - 1) {
    showTrialSection(sections[currentIndex + 1]);
  }
}

// Navigate to previous section
function prevTrialSection() {
  const sections = getTrialEditorSections();
  const currentIndex = sections.indexOf(trialState.currentSection);

  if (currentIndex > 0) {
    showTrialSection(sections[currentIndex - 1]);
  }
}

function validateBasicSection() {
  const name = document.getElementById("trialName").value.trim();
  const plantingStart = document.getElementById("trialPlantingStart").value;
  const plantingEnd = document.getElementById("trialPlantingEnd").value;
  const cropId = document.getElementById("trialCrops").value;
  const plantingSeason = document.getElementById("trialPlantingSeason").value;

  if (!name) {
    showToast("Please enter trial name", "error");
    return false;
  }
  if (!plantingStart || !plantingEnd) {
    showToast("Please enter planting window dates", "error");
    return false;
  }
  if (!cropId) {
    showToast("Please select crop", "error");
    return false;
  }
  if (!plantingSeason) {
    showToast("Please select planting season", "error");
    return false;
  }

  return true;
}

function validateExperimentSection() {
  const pollination = document.getElementById("trialPollination").value;
  const trialType = document.getElementById("trialType").value;
  const factorCount = normalizeTrialFactorsCount(document.getElementById("trialFactors").value);
  const factorDefinitions = getTrialTreatmentsFromForm();

  if (!pollination) {
    showToast("Please select type of pollination", "error");
    return false;
  }
  if (!trialType) {
    showToast("Please select trial type", "error");
    return false;
  }
  if (!Number.isFinite(factorCount) || factorCount < 1) {
    showToast("No. of Factors must be at least 1", "error");
    return false;
  }
  if (factorDefinitions.length !== factorCount) {
    showToast(`Please fill ${factorCount} factor(s)`, "error");
    return false;
  }

  const invalidIndex = factorDefinitions.findIndex((factor) => {
    return !factor.name || !Array.isArray(factor.treatments) || factor.treatments.length === 0;
  });
  if (invalidIndex >= 0) {
    showToast(`Please complete Factor ${invalidIndex + 1} name and treatments`, "error");
    return false;
  }
  return true;
}

function validateObservationSection() {
  const selectedParams = getSelectedParameterIds().length;
  if (selectedParams === 0) {
    showToast("Please select at least one observation parameter", "error");
    return false;
  }

  return true;
}

function normalizeTrialFactorsCount(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.floor(value));
  }

  const parsed = parseInt(String(value || "").trim(), 10);
  if (Number.isFinite(parsed) && parsed >= 1) {
    return parsed;
  }

  const legacy = String(value || "").trim().toLowerCase();
  if (legacy === "single") return 1;
  if (legacy === "factorial") return 2;
  return 1;
}

function setupTrialFactorsAndTreatments() {
  const factorsInput = document.getElementById("trialFactors");
  if (!factorsInput) return;

  factorsInput.removeEventListener("input", factorsInput._treatmentSyncHandler);
  factorsInput._treatmentSyncHandler = () => {
    const count = normalizeTrialFactorsCount(factorsInput.value);
    if (String(count) !== String(factorsInput.value || "")) {
      factorsInput.value = String(count);
    }
    const current = getTrialTreatmentsFromForm();
    renderTrialTreatmentsInputs(count, current);
    syncFactorArrangementVisibility();
  };
  factorsInput.addEventListener("input", factorsInput._treatmentSyncHandler);

  // Re-render entries picker when crop changes (entries are filtered by crop)
  const cropSelect = document.getElementById("trialCrops");
  if (cropSelect) {
    cropSelect.removeEventListener("change", cropSelect._factorEntriesRefresh);
    cropSelect._factorEntriesRefresh = () => {
      const current = getTrialTreatmentsFromForm();
      const count = normalizeTrialFactorsCount(factorsInput.value);
      renderTrialTreatmentsInputs(count, current);
    };
    cropSelect.addEventListener("change", cropSelect._factorEntriesRefresh);
  }

  // Listen for trial type changes to show/hide factor arrangement
  const trialTypeSelect = document.getElementById("trialType");
  if (trialTypeSelect) {
    trialTypeSelect.removeEventListener("change", trialTypeSelect._arrangementSync);
    trialTypeSelect._arrangementSync = () => syncFactorArrangementVisibility();
    trialTypeSelect.addEventListener("change", trialTypeSelect._arrangementSync);
  }

  // Listen for factor arrangement changes to update nav
  const arrangementSelect = document.getElementById("trialFactorArrangement");
  if (arrangementSelect) {
    arrangementSelect.removeEventListener("change", arrangementSelect._navSync);
    arrangementSelect._navSync = () => syncSplitPlotNavVisibility();
    arrangementSelect.addEventListener("change", arrangementSelect._navSync);
  }

  syncFactorArrangementVisibility();
}

/**
 * Show/hide the Factor Arrangement dropdown based on factor count > 1.
 * Applies to all trial types.
 */
function syncFactorArrangementVisibility() {
  const group = document.getElementById("trialFactorArrangementGroup");
  if (!group) return;
  const factorCount = normalizeTrialFactorsCount(document.getElementById("trialFactors")?.value);
  const show = factorCount > 1;
  group.style.display = show ? "" : "none";
  if (!show) {
    // Reset to factorial if hidden
    const sel = document.getElementById("trialFactorArrangement");
    if (sel) sel.value = "factorial";
  }
  syncSplitPlotNavVisibility();
}

/**
 * Show/hide the factor codes nav item and renumber all nav items.
 * Updates label to "Factorial" or "Split Plot" based on arrangement.
 */
function syncSplitPlotNavVisibility() {
  const navItem = document.getElementById("splitPlotNavItem");
  if (!navItem) return;
  const show = isMultiFactorMode();
  navItem.style.display = show ? "" : "none";

  // Update nav label based on arrangement
  const navText = navItem.querySelector(".section-nav-text");
  if (navText) {
    const arrangement = document.getElementById("trialFactorArrangement")?.value || "factorial";
    navText.textContent = arrangement === "splitplot" ? "Split Plot" : "Factorial";
  }

  // Renumber visible nav items
  const allNavItems = document.querySelectorAll(".trial-section-nav .section-nav-item");
  let num = 1;
  allNavItems.forEach((item) => {
    if (item.style.display === "none") return;
    const numEl = item.querySelector(".section-nav-number");
    if (numEl) numEl.textContent = String(num);
    num++;
  });
}

function normalizeTrialFactorDefinitions(trial) {
  const count = normalizeTrialFactorsCount(trial?.trialFactors);
  const normalized = [];

  if (Array.isArray(trial?.factorDefinitions) && trial.factorDefinitions.length > 0) {
    for (let index = 0; index < count; index += 1) {
      const item = trial.factorDefinitions[index] || {};
      const name = String(item.name || "").trim();
      const treatments = Array.isArray(item.treatments)
        ? item.treatments.map((value) => String(value || "").trim()).filter(Boolean)
        : [];
      const isEntries = !!item.isEntries;
      const entriesLineIds = Array.isArray(item.entriesLineIds) ? item.entriesLineIds : [];
      normalized.push({ name, treatments, isEntries, entriesLineIds });
    }
    return normalized;
  }

  const legacy = Array.isArray(trial?.treatments) ? trial.treatments : [];
  for (let index = 0; index < count; index += 1) {
    normalized.push({
      name: String(legacy[index] || "").trim(),
      treatments: [],
      isEntries: false,
      entriesLineIds: [],
    });
  }
  return normalized;
}

function parseFactorTreatmentsText(value) {
  return String(value || "")
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function renderTrialTreatmentsInputs(factorCount, factorDefinitions = []) {
  const container = document.getElementById("trialTreatmentsContainer");
  if (!container) return;

  const count = normalizeTrialFactorsCount(factorCount);
  const values = Array.from({ length: count }, (_, index) => {
    const source = factorDefinitions[index] || {};
    const factorName = typeof source === "string"
      ? String(source || "").trim()
      : String(source.name || "").trim();
    const treatments = Array.isArray(source.treatments)
      ? source.treatments.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const isEntries = !!source.isEntries;
    const entriesLineIds = Array.isArray(source.entriesLineIds) ? source.entriesLineIds : [];
    return { name: factorName, treatments, isEntries, entriesLineIds };
  });

  // Get crop-matching entries from inventory
  const cropSelect = document.getElementById("trialCrops");
  const selectedCropId = cropSelect?.value || "";
  const selectedCropName = cropSelect?.options?.[cropSelect.selectedIndex]?.dataset?.name || "";
  const matchingLines = (inventoryState?.items?.entries || []).filter((line) => {
    return line.cropId === selectedCropId || line.cropType === selectedCropName;
  });

  container.innerHTML = values
    .map(
      (value, index) => {
        // Build available & selected sets
        const selectedIds = new Set(value.entriesLineIds);
        const availableLines = matchingLines.filter((line) => !selectedIds.has(line.id));
        const selectedLines = value.entriesLineIds
          .map((id) => matchingLines.find((l) => l.id === id))
          .filter(Boolean);

        const availableHTML = availableLines.length
          ? availableLines.map((line) => `
              <div class="picklist-item" data-id="${line.id}" data-name="${escapeHtml(line.name)}">
                <input type="checkbox" class="picklist-item-checkbox" data-id="${line.id}">
                <div class="picklist-item-content"><span class="picklist-item-title">${escapeHtml(line.name)}</span></div>
              </div>
            `).join("")
          : '<p class="layouting-empty">No entries available. Select a crop first.</p>';

        const selectedHTML = selectedLines.map((line) => `
          <div class="picklist-item" data-id="${line.id}" data-name="${escapeHtml(line.name)}">
            <input type="checkbox" class="picklist-item-checkbox" data-id="${line.id}">
            <div class="picklist-item-content"><span class="picklist-item-title">${escapeHtml(line.name)}</span></div>
          </div>
        `).join("");

        return `
        <div class="form-group factor-card" style="margin:0 0 1rem 0; padding:0.75rem; border:1px solid var(--border); border-radius:10px;">
          <label for="trialFactorName_${index + 1}">Factor ${index + 1} Name</label>
          <input
            type="text"
            id="trialFactorName_${index + 1}"
            class="trial-factor-name-input"
            data-index="${index}"
            placeholder="e.g., Parental / Hybrid / Planting Space"
            value="${escapeHtml(value.name)}"
          >
          <label class="factor-entries-toggle">
            <input type="checkbox" class="trial-factor-isEntries-input" data-index="${index}" ${value.isEntries ? "checked" : ""}>
            <span>Use as Entries</span>
          </label>
          <div class="factor-treatments-section" ${value.isEntries ? 'style="display:none;"' : ""}>
            <label for="trialFactorTreatments_${index + 1}" style="margin-top:0.5rem;">Treatments for Factor ${index + 1}</label>
            <textarea
              id="trialFactorTreatments_${index + 1}"
              class="trial-factor-treatments-input"
              data-index="${index}"
              rows="3"
              placeholder="One per line or separated by comma"
            >${escapeHtml(value.treatments.join("\n"))}</textarea>
          </div>
          <div class="factor-entries-section" ${value.isEntries ? "" : 'style="display:none;"'}>
            <label style="margin-top:0.5rem;">Select Entries for Factor ${index + 1}</label>
            <div class="factor-entries-dual-picklist dual-picklist" data-index="${index}" data-saved-ids="${value.entriesLineIds.map(id => encodeURIComponent(id)).join(',')}">
              <div class="picklist-column">
                <div class="picklist-header form-hint">Available Entries</div>
                <div class="picklist-search">
                  <span class="material-symbols-rounded">search</span>
                  <input type="text" class="factor-entries-search" data-index="${index}" placeholder="Search entries...">
                </div>
                <div class="factor-entries-available picklist-list" data-index="${index}" data-list="available">
                  ${availableHTML}
                </div>
              </div>
              <div class="picklist-controls">
                <button type="button" class="picklist-control-btn factor-picklist-btn" data-action="select-all" data-index="${index}" title="Select all">
                  <span class="material-symbols-rounded">select_all</span>
                </button>
                <button type="button" class="picklist-control-btn factor-picklist-btn" data-action="deselect-all" data-index="${index}" title="Deselect all">
                  <span class="material-symbols-rounded">check_box_outline_blank</span>
                </button>
                <button type="button" class="picklist-control-btn factor-picklist-btn" data-action="add" data-index="${index}" title="Add to selected">
                  <span class="material-symbols-rounded">arrow_forward</span>
                </button>
                <button type="button" class="picklist-control-btn factor-picklist-btn danger" data-action="remove" data-index="${index}" title="Remove from selected">
                  <span class="material-symbols-rounded">delete</span>
                </button>
              </div>
              <div class="picklist-column">
                <div class="picklist-header form-hint">Selected Entries</div>
                <div class="factor-entries-selected picklist-list" data-index="${index}" data-list="selected">
                  ${selectedHTML}
                </div>
              </div>
            </div>
            <small class="form-hint factor-entries-count" data-index="${index}">
              ${value.entriesLineIds.length} entries selected
            </small>
          </div>
        </div>
      `;
      },
    )
    .join("");

  // Event listeners for isEntries toggle
  container.querySelectorAll(".trial-factor-isEntries-input").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const factorCard = e.target.closest(".factor-card");
      const treatmentsSection = factorCard.querySelector(".factor-treatments-section");
      const entriesSection = factorCard.querySelector(".factor-entries-section");
      if (e.target.checked) {
        treatmentsSection.style.display = "none";
        entriesSection.style.display = "";
      } else {
        treatmentsSection.style.display = "";
        entriesSection.style.display = "none";
      }
    });
  });

  // --- Dual picklist interaction for each factor ---
  const updateFactorEntriesCount = (idx) => {
    const selectedList = container.querySelector(`.factor-entries-selected[data-index="${idx}"]`);
    const countEl = container.querySelector(`.factor-entries-count[data-index="${idx}"]`);
    if (countEl && selectedList) {
      countEl.textContent = `${selectedList.querySelectorAll(".picklist-item").length} entries selected`;
    }
  };

  container.querySelectorAll(".factor-entries-dual-picklist").forEach((picklist) => {
    const idx = picklist.dataset.index;
    const availableList = picklist.querySelector(`.factor-entries-available[data-index="${idx}"]`);
    const selectedList = picklist.querySelector(`.factor-entries-selected[data-index="${idx}"]`);
    if (!availableList || !selectedList) return;

    // Clicking a picklist item toggles its checkbox
    const attachItemClickHandlers = (listEl) => {
      listEl.querySelectorAll(".picklist-item").forEach((item) => {
        item.addEventListener("click", (e) => {
          if (e.target.tagName === "INPUT") return; // let checkboxes handle themselves
          const cb = item.querySelector(".picklist-item-checkbox");
          if (cb) cb.checked = !cb.checked;
        });
      });
    };
    attachItemClickHandlers(availableList);
    attachItemClickHandlers(selectedList);

    // Control buttons
    picklist.querySelectorAll(".factor-picklist-btn").forEach((btn) => {
      const action = btn.dataset.action;

      btn.addEventListener("click", () => {
        if (action === "select-all") {
          // Select all checkboxes in the available list
          availableList.querySelectorAll(".picklist-item-checkbox").forEach((cb) => { cb.checked = true; });
        }

        if (action === "deselect-all") {
          availableList.querySelectorAll(".picklist-item-checkbox").forEach((cb) => { cb.checked = false; });
          selectedList.querySelectorAll(".picklist-item-checkbox").forEach((cb) => { cb.checked = false; });
        }

        if (action === "add") {
          const checked = availableList.querySelectorAll(".picklist-item-checkbox:checked");
          checked.forEach((cb) => {
            const item = cb.closest(".picklist-item");
            if (item) {
              cb.checked = false;
              selectedList.appendChild(item);
            }
          });
          // Re-attach click handlers on moved items
          attachItemClickHandlers(selectedList);
          updateFactorEntriesCount(idx);
        }

        if (action === "remove") {
          const checked = selectedList.querySelectorAll(".picklist-item-checkbox:checked");
          checked.forEach((cb) => {
            const item = cb.closest(".picklist-item");
            if (item) {
              cb.checked = false;
              availableList.appendChild(item);
            }
          });
          attachItemClickHandlers(availableList);
          updateFactorEntriesCount(idx);
        }
      });
    });
  });

  // Event listeners for entries search (filters available list)
  container.querySelectorAll(".factor-entries-search").forEach((searchInput) => {
    searchInput.addEventListener("input", (e) => {
      const idx = e.target.dataset.index;
      const list = container.querySelector(`.factor-entries-available[data-index="${idx}"]`);
      if (!list) return;
      const term = e.target.value.toLowerCase();
      list.querySelectorAll(".picklist-item").forEach((item) => {
        const name = (item.dataset.name || item.textContent || "").toLowerCase();
        item.style.display = name.includes(term) ? "" : "none";
      });
    });
  });
}

/**
 * Refresh entries lists inside the trial editor when inventory data becomes
 * available (solves the "empty entries on first page load" issue).
 * Works with the dual-picklist layout.
 */
function refreshFactorEntriesLists() {
  if (!isTrialEditorActive()) return;
  const container = document.getElementById("trialTreatmentsContainer");
  if (!container) return;

  const cropSelect = document.getElementById("trialCrops");
  const selectedCropId = cropSelect?.value || "";
  const selectedCropName = cropSelect?.options?.[cropSelect.selectedIndex]?.dataset?.name || "";
  const allEntries = (inventoryState?.items?.entries || []).filter((line) => {
    return line.cropId === selectedCropId || line.cropType === selectedCropName;
  });
  if (!allEntries.length) return;

  container.querySelectorAll(".factor-entries-dual-picklist").forEach((picklist) => {
    const idx = picklist.dataset.index;
    const availableList = picklist.querySelector(`.factor-entries-available[data-index="${idx}"]`);
    const selectedList = picklist.querySelector(`.factor-entries-selected[data-index="${idx}"]`);
    if (!availableList || !selectedList) return;

    // Only refresh if both lists are empty (data wasn't available at render time)
    if (availableList.querySelectorAll(".picklist-item").length > 0 || selectedList.querySelectorAll(".picklist-item").length > 0) return;

    // Restore saved IDs for the selected list
    const savedIds = new Set((picklist.dataset.savedIds || "").split(",").filter(Boolean).map(decodeURIComponent));

    const availableLines = allEntries.filter((l) => !savedIds.has(l.id));
    const selectedLines = allEntries.filter((l) => savedIds.has(l.id));

    const buildItemHTML = (line) => `
      <div class="picklist-item" data-id="${line.id}" data-name="${escapeHtml(line.name)}">
        <input type="checkbox" class="picklist-item-checkbox" data-id="${line.id}">
        <div class="picklist-item-content"><span class="picklist-item-title">${escapeHtml(line.name)}</span></div>
      </div>
    `;

    availableList.innerHTML = availableLines.map(buildItemHTML).join("") || '<p class="layouting-empty">No entries available.</p>';
    selectedList.innerHTML = selectedLines.map(buildItemHTML).join("");

    // Re-attach item click handlers
    const attachItemClickHandlers = (listEl) => {
      listEl.querySelectorAll(".picklist-item").forEach((item) => {
        item.addEventListener("click", (e) => {
          if (e.target.tagName === "INPUT") return;
          const cb = item.querySelector(".picklist-item-checkbox");
          if (cb) cb.checked = !cb.checked;
        });
      });
    };
    attachItemClickHandlers(availableList);
    attachItemClickHandlers(selectedList);

    // Update count
    const countEl = container.querySelector(`.factor-entries-count[data-index="${idx}"]`);
    if (countEl) {
      countEl.textContent = `${selectedLines.length} entries selected`;
    }
  });
}

function getTrialTreatmentsFromForm() {
  const container = document.getElementById("trialTreatmentsContainer");
  if (!container) return [];
  const factorCards = Array.from(container.querySelectorAll(".factor-card"));

  return factorCards.map((card) => {
    const nameInput = card.querySelector(".trial-factor-name-input");
    const isEntriesCheckbox = card.querySelector(".trial-factor-isEntries-input");
    const treatmentsInput = card.querySelector(".trial-factor-treatments-input");
    const isEntries = isEntriesCheckbox?.checked || false;

    if (isEntries) {
      // Read from dual picklist selected list
      const selectedList = card.querySelector('.factor-entries-selected');
      const selectedItems = selectedList ? Array.from(selectedList.querySelectorAll('.picklist-item')) : [];
      const entriesLineIds = selectedItems.map((item) => item.dataset.id).filter(Boolean);
      const treatments = selectedItems.map((item) => (item.dataset.name || item.textContent || "").trim()).filter(Boolean);

      return {
        name: String(nameInput?.value || "").trim(),
        treatments,
        isEntries: true,
        entriesLineIds,
      };
    }

    return {
      name: String(nameInput?.value || "").trim(),
      treatments: parseFactorTreatmentsText(treatmentsInput?.value || ""),
      isEntries: false,
      entriesLineIds: [],
    };
  });
}

/**
 * Check if any factor in the Experiment section is marked as "Entries".
 * Returns the array of line IDs from the first matching factor, or null.
 */
function getEntriesFactorLineIds() {
  const factorDefs = getTrialTreatmentsFromForm();
  for (const factor of factorDefs) {
    if (factor.isEntries && Array.isArray(factor.entriesLineIds) && factor.entriesLineIds.length > 0) {
      return factor.entriesLineIds;
    }
  }
  return null;
}

// ===========================
// FACTOR CODES — Treatment Codes Section (Factorial / Split Plot)
// ===========================

/**
 * Render the factor codes section (used for both Factorial and Split Plot).
 * Each factor gets a list of its treatments with an input field for a short code.
 */
function renderSplitPlotCodesSection() {
  const container = document.getElementById("splitPlotCodesContainer");
  if (!container) return;

  // Update section title dynamically
  const titleEl = document.getElementById("factorCodesSectionTitle");
  if (titleEl) {
    const arrangement = document.getElementById("trialFactorArrangement")?.value || "factorial";
    titleEl.textContent = arrangement === "splitplot"
      ? "Split Plot \u2014 Treatment Codes"
      : "Factorial \u2014 Treatment Codes";
  }

  const factorDefs = getTrialTreatmentsFromForm();
  const savedCodes = trialState._splitPlotCodes || {};

  let html = "";
  factorDefs.forEach((factor, factorIndex) => {
    const factorKey = `factor_${factorIndex}`;
    const savedFactorCodes = savedCodes[factorKey] || {};

    html += `
      <div class="splitplot-factor-group" data-factor-index="${factorIndex}">
        <div class="splitplot-factor-title">
          <span class="splitplot-factor-badge">${factorIndex === 0 ? "1st" : factorIndex === 1 ? "2nd" : `${factorIndex + 1}th`} Factor</span>
          <strong>${escapeHtml(factor.name || `Factor ${factorIndex + 1}`)}</strong>
        </div>
        <div class="splitplot-treatments-list">
          ${factor.treatments.map((treatment, tIdx) => {
            const existingCode = savedFactorCodes[treatment] || "";
            return `
              <div class="splitplot-treatment-row">
                <span class="splitplot-treatment-name">${escapeHtml(treatment)}</span>
                <input
                  type="text"
                  class="splitplot-code-input"
                  data-factor-index="${factorIndex}"
                  data-treatment="${escapeHtml(treatment)}"
                  value="${escapeHtml(existingCode)}"
                  placeholder="Code"
                  maxlength="5"
                >
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Restore "Use Location as Factor" checkbox
  const locationCheckbox = document.getElementById("splitPlotLocationAsFactor");
  if (locationCheckbox) {
    locationCheckbox.checked = !!trialState._splitPlotLocationAsFactor;
    locationCheckbox.onchange = () => {
      trialState._splitPlotLocationAsFactor = locationCheckbox.checked;
    };
  }

  // Auto-save code inputs to trialState
  container.querySelectorAll(".splitplot-code-input").forEach((input) => {
    input.addEventListener("input", () => saveSplitPlotCodesToState());
  });
}

/**
 * Read split plot codes from the form into trialState._splitPlotCodes.
 * Structure: { factor_0: { "TreatmentName": "A", ... }, factor_1: { ... } }
 */
function saveSplitPlotCodesToState() {
  const container = document.getElementById("splitPlotCodesContainer");
  if (!container) return;

  const codes = {};
  container.querySelectorAll(".splitplot-code-input").forEach((input) => {
    const fi = input.dataset.factorIndex;
    const treatment = input.dataset.treatment;
    const key = `factor_${fi}`;
    if (!codes[key]) codes[key] = {};
    codes[key][treatment] = input.value.trim();
  });
  trialState._splitPlotCodes = codes;
}

/**
 * Get the split-plot codes from form or trialState.
 * Returns { factor_0: { treatmentName: code }, factor_1: { ... } }
 */
function getSplitPlotCodes() {
  // Try reading from DOM first (if section is rendered)
  const container = document.getElementById("splitPlotCodesContainer");
  if (container && container.querySelectorAll(".splitplot-code-input").length > 0) {
    saveSplitPlotCodesToState();
  }
  return trialState._splitPlotCodes || {};
}

/**
 * Build the treatment combinations for split-plot layout.
 * Returns array of { id, name, codes: [code1, code2, ...], factorValues: [t1, t2, ...] }
 */
function buildSplitPlotCombinations() {
  const factorDefs = getTrialTreatmentsFromForm();
  const codes = getSplitPlotCodes();

  if (factorDefs.length < 2) return [];

  // Build code maps per factor
  const factorCodeMaps = factorDefs.map((factor, fi) => {
    const map = {};
    const savedCodes = codes[`factor_${fi}`] || {};
    factor.treatments.forEach((t, ti) => {
      map[t] = savedCodes[t] || String(ti + 1);
    });
    return { factor, codeMap: map };
  });

  // Generate all combinations (cartesian product)
  const combinations = [];
  const generateCombos = (factorIdx, currentTreatments, currentCodes) => {
    if (factorIdx >= factorCodeMaps.length) {
      const comboName = currentCodes.join("");
      const comboId = `splitplot_${currentCodes.join("_")}`;
      combinations.push({
        id: comboId,
        name: comboName,
        codes: [...currentCodes],
        factorValues: [...currentTreatments],
      });
      return;
    }
    const { factor, codeMap } = factorCodeMaps[factorIdx];
    for (const treatment of factor.treatments) {
      generateCombos(
        factorIdx + 1,
        [...currentTreatments, treatment],
        [...currentCodes, codeMap[treatment]],
      );
    }
  };
  generateCombos(0, [], []);
  return combinations;
}

/**
 * Generate factorial layout for given combinations and parameters.
 *
 * Factorial design:
 * - All treatment combinations are generated as entries
 * - Each cell shows the combined code (e.g., "A1", "B3")
 * - Standard layout grid with randomization
 *
 * @param {number} numReps - Number of replications
 * @param {string} direction - "serpentine" or "straight"
 * @param {string} randomization - "normal" or "random"
 * @returns {Array} Array of reps, each rep is array of rows, each row is array of cells.
 */
function generateFactorialLayout(numReps, direction, randomization) {
  const factorDefs = getTrialTreatmentsFromForm();
  const codes = getSplitPlotCodes();

  if (factorDefs.length < 2) return [];

  const factor1 = factorDefs[0]; // Main plot
  const factor2 = factorDefs[1]; // Sub-plot
  const codes1 = codes["factor_0"] || {};
  const codes2 = codes["factor_1"] || {};

  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const replicationLayouts = [];

  for (let rep = 0; rep < numReps; rep++) {
    // Main plot order: columns = 1st factor treatments
    let mainPlotOrder = factor1.treatments.map((t) => ({
      treatment: t,
      code: codes1[t] || t,
    }));

    // Randomize main plots
    if (randomization === "random" || (randomization === "normal" && rep > 0)) {
      mainPlotOrder = shuffle(mainPlotOrder);
    }

    // For each main plot (column), randomize sub-plot (2nd factor) treatments
    const numRows = factor2.treatments.length;
    const numCols = mainPlotOrder.length;

    const grid = Array.from({ length: numRows }, () =>
      Array.from({ length: numCols }, () => null),
    );

    mainPlotOrder.forEach((mainPlot, colIdx) => {
      let subPlotOrder = factor2.treatments.map((t) => ({
        treatment: t,
        code: codes2[t] || t,
      }));

      // Randomize sub-plots within each main plot
      if (randomization === "random" || (randomization === "normal" && rep > 0)) {
        subPlotOrder = shuffle(subPlotOrder);
      }

      subPlotOrder.forEach((subPlot, rowIdx) => {
        const comboName = mainPlot.code + subPlot.code;
        const comboId = `splitplot_${mainPlot.code}_${subPlot.code}`;
        grid[rowIdx][colIdx] = { id: comboId, name: comboName };
      });
    });

    // Apply direction (serpentine)
    if (direction === "serpentine") {
      for (let rowIdx = 0; rowIdx < grid.length; rowIdx++) {
        if (rowIdx % 2 === 1) {
          grid[rowIdx].reverse();
        }
      }
    }

    replicationLayouts.push(grid);
  }

  return replicationLayouts;
}

/**
 * Generate split-plot layout with column headers.
 *
 * Split-plot design:
 * - 1st factor = main plot (columns with headers)
 * - 2nd factor = sub-plot (rows within each main plot, values shown in cells)
 * - Column headers show 1st factor codes; cells show 2nd factor codes only
 *
 * Returns { layouts, headers } where:
 * - layouts[i] = grid for rep i (array of rows, each row = array of cells { id, name })
 *   (name = combined code for internal tracking, e.g., "A1")
 * - headers[i] = array of 1st factor codes for each column in rep i
 *
 * @param {number} numReps
 * @param {string} direction
 * @param {string} randomization
 * @returns {{ layouts: Array, headers: Array<string[]> }}
 */
function generateSplitPlotLayout(numReps, direction, randomization) {
  const factorDefs = getTrialTreatmentsFromForm();
  const codes = getSplitPlotCodes();

  if (factorDefs.length < 2) return { layouts: [], headers: [] };

  const factor1 = factorDefs[0]; // Main plot
  const factor2 = factorDefs[1]; // Sub-plot
  const codes1 = codes["factor_0"] || {};
  const codes2 = codes["factor_1"] || {};

  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const replicationLayouts = [];
  const replicationHeaders = [];

  for (let rep = 0; rep < numReps; rep++) {
    // Main plot order: columns = 1st factor treatments
    let mainPlotOrder = factor1.treatments.map((t) => ({
      treatment: t,
      code: codes1[t] || t,
    }));

    // Randomize main plots
    if (randomization === "random" || (randomization === "normal" && rep > 0)) {
      mainPlotOrder = shuffle(mainPlotOrder);
    }

    // Store column headers for this rep
    replicationHeaders.push(mainPlotOrder.map((mp) => mp.code));

    const numRows = factor2.treatments.length;
    const numCols = mainPlotOrder.length;

    const grid = Array.from({ length: numRows }, () =>
      Array.from({ length: numCols }, () => null),
    );

    mainPlotOrder.forEach((mainPlot, colIdx) => {
      let subPlotOrder = factor2.treatments.map((t) => ({
        treatment: t,
        code: codes2[t] || t,
      }));

      // Randomize sub-plots within each main plot
      if (randomization === "random" || (randomization === "normal" && rep > 0)) {
        subPlotOrder = shuffle(subPlotOrder);
      }

      subPlotOrder.forEach((subPlot, rowIdx) => {
        const comboName = mainPlot.code + subPlot.code;
        const comboId = `splitplot_${mainPlot.code}_${subPlot.code}`;
        // name = combined code for tracking; displayName = sub-plot code for display
        grid[rowIdx][colIdx] = { id: comboId, name: comboName, displayName: subPlot.code };
      });
    });

    // Apply direction (serpentine)
    if (direction === "serpentine") {
      for (let rowIdx = 0; rowIdx < grid.length; rowIdx++) {
        if (rowIdx % 2 === 1) {
          grid[rowIdx].reverse();
        }
      }
      // Also reverse headers for serpentine consistency tracking
      // (No — headers stay in original order; serpentine only affects row direction)
    }

    replicationLayouts.push(grid);
  }

  return { layouts: replicationLayouts, headers: replicationHeaders };
}

// Validate location section
function validateLocationSection() {
  // Field section is optional.
  return true;
}

// Populate crop types dropdown
function populateTrialCrops() {
  const select = document.getElementById("trialCrops");
  const crops = inventoryState.items.crops || [];

  select.innerHTML =
    '<option value="">Select crop</option>' +
    crops
      .map(
        (crop) =>
          `<option value="${crop.id}" data-name="${escapeHtml(crop.name)}">${escapeHtml(crop.name)}</option>`,
      )
      .join("");
}

// Populate locations dropdown
function populateTrialLocations() {
  const select = document.getElementById("trialLocation");
  if (!select) return; // Skip if element doesn't exist (removed from HTML)
  
  const locations = inventoryState.items.locations || [];

  select.innerHTML =
    '<option value="">Select location for drawing area</option>' +
    locations
      .map(
        (loc) =>
          `<option value="${loc.id}" data-coords="${escapeHtml(loc.coordinates)}">${escapeHtml(loc.name)}</option>`,
      )
      .join("");

  // Add change listener to navigate map to location
  select.removeEventListener("change", handleLocationChange);
  select.addEventListener("change", handleLocationChange);
}

// Handle location change
function handleLocationChange(e) {
  const select = e.target;
  const selectedOption = select.options[select.selectedIndex];
  const coords = selectedOption.dataset.coords;

  if (coords && trialMapInstance) {
    const parsed = parseCoordinates(coords);
    if (parsed) {
      trialMapInstance.setView([parsed.lat, parsed.lng], 13);
    }
  }
}

// Populate parameters with search
function populateTrialParameters(selectedIds = []) {
  const availableList = document.getElementById("parameterAvailableList");
  const selectedList = document.getElementById("parameterSelectedList");
  const searchInput = document.getElementById("parameterSearch");
  const selectAllBtn = document.getElementById("parameterSelectAll");
  const deselectAllBtn = document.getElementById("parameterDeselectAll");
  const moveRightBtn = document.getElementById("parameterMoveRight");
  const moveUpBtn = document.getElementById("parameterMoveUp");
  const moveDownBtn = document.getElementById("parameterMoveDown");
  const removeBtn = document.getElementById("parameterRemove");
  const availableCheckedCountEl = document.getElementById("parameterAvailableCheckedCount");
  const selectedCheckedCountEl = document.getElementById("parameterSelectedCheckedCount");
  const allParameters = inventoryState.items.parameters || [];
  if (!availableList || !selectedList || !searchInput) return;

  // Filter parameters by selected crop's DoO
  const cropId = document.getElementById("trialCrops")?.value || "";
  const parameters = cropId
    ? allParameters.filter(p => {
        if ((p.type || "").toLowerCase() === "formula") return true;
        if (!p.daysOfObservation) return false;
        const val = p.daysOfObservation[cropId];
        if (val == null) return false;
        return typeof val === 'object' ? (val.min != null || val.max != null) : true;
      })
    : allParameters;

  trialState.selectedParametersOrder = Array.isArray(selectedIds)
    ? [...selectedIds]
    : [];

  const checkedState = {
    available: new Set(),
    selected: new Set(),
  };
  let activeListType = "";

  const updateActiveListUI = () => {
    availableList.classList.toggle("picklist-list-active", activeListType === "available");
    selectedList.classList.toggle("picklist-list-active", activeListType === "selected");
  };

  const setActiveListType = (type) => {
    activeListType = type;
    updateActiveListUI();
  };

  const setSelection = (listEl, id) => {
    listEl.querySelectorAll(".picklist-item").forEach((item) => {
      item.classList.toggle("selected", item.dataset.id === id);
    });
    listEl.dataset.selectedId = id || "";
  };

  const getActionIds = (checkedSet, fallbackId) => {
    const checkedIds = Array.from(checkedSet).filter(Boolean);
    if (checkedIds.length > 0) return checkedIds;
    return fallbackId ? [fallbackId] : [];
  };

  const clearCheckedState = () => {
    checkedState.available.clear();
    checkedState.selected.clear();
  };

  const getListByType = (type) =>
    type === "available" ? availableList : type === "selected" ? selectedList : null;

  const withActiveListType = (handler) => {
    if (!activeListType) {
      showToast("Please choose a list side first: Available or Selected", "warning");
      return;
    }
    handler(activeListType);
  };

  const updateCheckedIndicators = () => {
    if (availableCheckedCountEl) {
      availableCheckedCountEl.textContent = String(checkedState.available.size);
    }
    if (selectedCheckedCountEl) {
      selectedCheckedCountEl.textContent = String(checkedState.selected.size);
    }
  };

  const renderAvailable = (searchTerm = "") => {
    const filtered = parameters.filter((param) => {
      const match =
        param.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (param.initial || "").toLowerCase().includes(searchTerm.toLowerCase());
      return match && !trialState.selectedParametersOrder.includes(param.id);
    });

    const filteredIds = new Set(filtered.map((param) => param.id));
    checkedState.available.forEach((id) => {
      if (!filteredIds.has(id)) checkedState.available.delete(id);
    });

    if (filtered.length === 0) {
      availableList.innerHTML =
        '<p class="param-no-results">No parameters found</p>';
      updateCheckedIndicators();
      return;
    }

    availableList.innerHTML = filtered
      .map(
        (param) => `
          <div class="picklist-item" draggable="true" data-id="${param.id}">
            <input type="checkbox" class="picklist-item-checkbox" data-id="${param.id}" ${checkedState.available.has(param.id) ? "checked" : ""}>
            <div class="picklist-item-content">
              <div class="picklist-item-title">${escapeHtml(param.name)}</div>
              <div class="picklist-item-meta">
                ${escapeHtml(param.initial || "")} · ${escapeHtml(param.type || "")} · ${escapeHtml(param.unit || "")}
              </div>
            </div>
          </div>
        `,
      )
      .join("");

    availableList.querySelectorAll(".picklist-item").forEach((item) => {
      const itemId = item.dataset.id;
      const checkbox = item.querySelector(".picklist-item-checkbox");

      checkbox?.addEventListener("click", (e) => e.stopPropagation());
      checkbox?.addEventListener("change", (e) => {
        setActiveListType("available");
        if (e.target.checked) {
          checkedState.available.add(itemId);
        } else {
          checkedState.available.delete(itemId);
        }
        updateCheckedIndicators();
      });

      item.addEventListener("click", () => {
        setActiveListType("available");
        if (checkbox) {
          checkbox.checked = !checkbox.checked;
          if (checkbox.checked) {
            checkedState.available.add(itemId);
          } else {
            checkedState.available.delete(itemId);
          }
          updateCheckedIndicators();
        }
        setSelection(availableList, itemId);
        setSelection(selectedList, "");
      });

      item.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", itemId);
        e.dataTransfer.setData("source", "available");
        item.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });

      item.addEventListener("dragend", (e) => {
        item.classList.remove("dragging");
        document.querySelectorAll(".picklist-item.drag-over").forEach(el => el.classList.remove("drag-over"));
      });
    });

    updateCheckedIndicators();
  };

  const renderSelected = () => {
    const selectedIds = new Set(trialState.selectedParametersOrder);
    checkedState.selected.forEach((id) => {
      if (!selectedIds.has(id)) checkedState.selected.delete(id);
    });

    if (trialState.selectedParametersOrder.length === 0) {
      selectedList.innerHTML =
        '<p class="param-no-results">No parameters selected</p>';
      updateCheckedIndicators();
      return;
    }

    selectedList.innerHTML = trialState.selectedParametersOrder
      .map((id) => {
        const param = allParameters.find((p) => p.id === id);
        if (!param) return "";
        return `
          <div class="picklist-item" draggable="true" data-id="${param.id}">
            <input type="checkbox" class="picklist-item-checkbox" data-id="${param.id}" ${checkedState.selected.has(param.id) ? "checked" : ""}>
            <div class="picklist-item-content">
              <div class="picklist-item-title">${escapeHtml(param.name)}</div>
              <div class="picklist-item-meta">
                ${escapeHtml(param.initial || "")} · ${escapeHtml(param.type || "")} · ${escapeHtml(param.unit || "")}
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    selectedList.querySelectorAll(".picklist-item").forEach((item) => {
      const itemId = item.dataset.id;
      const checkbox = item.querySelector(".picklist-item-checkbox");

      checkbox?.addEventListener("click", (e) => e.stopPropagation());
      checkbox?.addEventListener("change", (e) => {
        setActiveListType("selected");
        if (e.target.checked) {
          checkedState.selected.add(itemId);
        } else {
          checkedState.selected.delete(itemId);
        }
        updateCheckedIndicators();
      });

      item.addEventListener("click", () => {
        setActiveListType("selected");
        if (checkbox) {
          checkbox.checked = !checkbox.checked;
          if (checkbox.checked) {
            checkedState.selected.add(itemId);
          } else {
            checkedState.selected.delete(itemId);
          }
          updateCheckedIndicators();
        }
        setSelection(selectedList, itemId);
        setSelection(availableList, "");
      });

      item.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", itemId);
        e.dataTransfer.setData("source", "selected");
        item.classList.add("dragging");
      });

      item.addEventListener("dragend", (e) => {
        item.classList.remove("dragging");
        document.querySelectorAll(".picklist-item.drag-over").forEach(el => el.classList.remove("drag-over"));
      });

      item.addEventListener("dragover", (e) => {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData("text/plain");
        const source = e.dataTransfer.getData("source");
        if (source === "selected" && draggedId !== itemId) {
          item.classList.add("drag-over");
          e.dataTransfer.dropEffect = "move";
        }
      });

      item.addEventListener("dragleave", (e) => {
        if (e.target === item) {
          item.classList.remove("drag-over");
        }
      });

      item.addEventListener("drop", (e) => {
        e.preventDefault();
        item.classList.remove("drag-over");
        const draggedId = e.dataTransfer.getData("text/plain");
        const source = e.dataTransfer.getData("source");
        if (!draggedId) return;

        if (source === "selected") {
          const fromIndex = trialState.selectedParametersOrder.indexOf(draggedId);
          const toIndex = trialState.selectedParametersOrder.indexOf(itemId);
          if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
            const [moved] = trialState.selectedParametersOrder.splice(fromIndex, 1);
            trialState.selectedParametersOrder.splice(toIndex, 0, moved);
            renderSelected();
          }
        } else if (source === "available") {
          if (!trialState.selectedParametersOrder.includes(draggedId)) {
            const toIndex = trialState.selectedParametersOrder.indexOf(itemId);
            trialState.selectedParametersOrder.splice(toIndex, 0, draggedId);
            checkedState.available.delete(draggedId);
            renderSelected();
            renderAvailable(searchInput.value);
            updateSelectedParamCount();
          }
        }
      });
    });

    updateCheckedIndicators();
  };

  const addSelectedFromAvailable = () => {
    const actionIds = getActionIds(
      checkedState.available,
      availableList.dataset.selectedId,
    );
    if (actionIds.length === 0) return;

    let hasChanges = false;
    actionIds.forEach((id) => {
      if (!trialState.selectedParametersOrder.includes(id)) {
        trialState.selectedParametersOrder.push(id);
        hasChanges = true;
      }
    });

    if (hasChanges) {
      clearCheckedState();
      setSelection(availableList, "");
      renderSelected();
      renderAvailable(searchInput.value);
      updateSelectedParamCount();
      updateCheckedIndicators();
    }
  };

  const removeSelectedFromSelected = () => {
    const actionIds = new Set(
      getActionIds(checkedState.selected, selectedList.dataset.selectedId),
    );
    if (actionIds.size === 0) return;

    trialState.selectedParametersOrder = trialState.selectedParametersOrder.filter(
      (id) => !actionIds.has(id),
    );

    clearCheckedState();
    setSelection(selectedList, "");
    renderSelected();
    renderAvailable(searchInput.value);
    updateSelectedParamCount();
    updateCheckedIndicators();
  };

  const moveSelected = (direction) => {
    const hadCheckedSelection = checkedState.selected.size > 0;
    const actionIds = getActionIds(checkedState.selected, selectedList.dataset.selectedId);
    if (actionIds.length === 0) return;

    const moveSet = new Set(
      actionIds.filter((id) => trialState.selectedParametersOrder.includes(id)),
    );
    if (moveSet.size === 0) return;

    if (direction === "up") {
      for (let i = 1; i < trialState.selectedParametersOrder.length; i += 1) {
        const currentId = trialState.selectedParametersOrder[i];
        const prevId = trialState.selectedParametersOrder[i - 1];
        if (moveSet.has(currentId) && !moveSet.has(prevId)) {
          trialState.selectedParametersOrder[i] = prevId;
          trialState.selectedParametersOrder[i - 1] = currentId;
        }
      }
    } else {
      for (let i = trialState.selectedParametersOrder.length - 2; i >= 0; i -= 1) {
        const currentId = trialState.selectedParametersOrder[i];
        const nextId = trialState.selectedParametersOrder[i + 1];
        if (moveSet.has(currentId) && !moveSet.has(nextId)) {
          trialState.selectedParametersOrder[i] = nextId;
          trialState.selectedParametersOrder[i + 1] = currentId;
        }
      }
    }

    if (hadCheckedSelection) {
      checkedState.selected = moveSet;
    } else {
      checkedState.selected.clear();
    }
    renderSelected();
    if (!hadCheckedSelection && actionIds.length === 1) {
      setSelection(selectedList, actionIds[0]);
    }
  };

  const handleListDrop = (targetList) => (e) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("text/plain");
    const source = e.dataTransfer.getData("source");
    if (!draggedId) return;

    if (targetList === "selected") {
      if (!trialState.selectedParametersOrder.includes(draggedId)) {
        trialState.selectedParametersOrder.push(draggedId);
        renderSelected();
        renderAvailable(searchInput.value);
        updateSelectedParamCount();
        updateCheckedIndicators();
      }
    }

    if (targetList === "available" && source === "selected") {
      trialState.selectedParametersOrder = trialState.selectedParametersOrder.filter(
        (id) => id !== draggedId,
      );
      renderSelected();
      renderAvailable(searchInput.value);
      updateSelectedParamCount();
      updateCheckedIndicators();
    }
  };

  availableList.ondragover = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    availableList.classList.add("drag-over-list");
  };
  availableList.ondragleave = (e) => {
    if (e.target === availableList) {
      availableList.classList.remove("drag-over-list");
    }
  };
  availableList.ondrop = handleListDrop("available");
  
  selectedList.ondragover = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    selectedList.classList.add("drag-over-list");
  };
  selectedList.ondragleave = (e) => {
    if (e.target === selectedList) {
      selectedList.classList.remove("drag-over-list");
    }
  };
  selectedList.ondrop = handleListDrop("selected");

  if (selectAllBtn) {
    selectAllBtn.onclick = () => {
      withActiveListType((targetType) => {
        const targetList = getListByType(targetType);
        if (!targetList) return;

        if (targetType === "available") {
          checkedState.available.clear();
          targetList
            .querySelectorAll(".picklist-item-checkbox")
            .forEach((checkbox) => {
              checkbox.checked = true;
              if (checkbox.dataset.id) checkedState.available.add(checkbox.dataset.id);
            });
        } else {
          checkedState.selected.clear();
          targetList
            .querySelectorAll(".picklist-item-checkbox")
            .forEach((checkbox) => {
              checkbox.checked = true;
              if (checkbox.dataset.id) checkedState.selected.add(checkbox.dataset.id);
            });
        }

        updateCheckedIndicators();
      });
    };
  }

  if (deselectAllBtn) {
    deselectAllBtn.onclick = () => {
      withActiveListType((targetType) => {
        const targetList = getListByType(targetType);
        if (!targetList) return;

        targetList.querySelectorAll(".picklist-item-checkbox").forEach((checkbox) => {
          checkbox.checked = false;
        });

        if (targetType === "available") {
          checkedState.available.clear();
        } else {
          checkedState.selected.clear();
        }

        updateCheckedIndicators();
      });
    };
  }

  if (moveRightBtn) moveRightBtn.onclick = addSelectedFromAvailable;
  if (moveUpBtn) moveUpBtn.onclick = () => moveSelected("up");
  if (moveDownBtn) moveDownBtn.onclick = () => moveSelected("down");
  if (removeBtn) removeBtn.onclick = removeSelectedFromSelected;

  // Initial render
  renderAvailable();
  renderSelected();
  updateSelectedParamCount();
  updateCheckedIndicators();
  updateActiveListUI();

  // Search listener
  searchInput.removeEventListener("input", searchInput._searchHandler);
  searchInput._searchHandler = (e) => renderAvailable(e.target.value);
  searchInput.addEventListener("input", searchInput._searchHandler);
}

// Update selected parameter count
function updateSelectedParamCount() {
  const count = getSelectedParameterIds().length;
  const countEl = document.getElementById("selectedParamCount");
  if (countEl) countEl.textContent = count;
}

function getSelectedParameterIds() {
  return Array.isArray(trialState.selectedParametersOrder)
    ? trialState.selectedParametersOrder
    : [];
}

function getRunnableTrialParameters(trial) {
  if (!trial) return [];
  return (trial.parameters || [])
    .map((paramId) => inventoryState.items.parameters.find((p) => p.id === paramId))
    .filter((param) => param && (param.type || "").toLowerCase() !== "formula");
}

// ═══════════════════════════════════════════════
// Agronomy Monitoring Picker (same pattern as parameters)
// ═══════════════════════════════════════════════

function populateTrialAgronomy(selectedIds = []) {
  const availableList = document.getElementById("agronomyAvailableList");
  const selectedList = document.getElementById("agronomySelectedList");
  const searchInput = document.getElementById("agronomySearch");
  const selectAllBtn = document.getElementById("agronomySelectAll");
  const deselectAllBtn = document.getElementById("agronomyDeselectAll");
  const moveRightBtn = document.getElementById("agronomyMoveRight");
  const moveUpBtn = document.getElementById("agronomyMoveUp");
  const moveDownBtn = document.getElementById("agronomyMoveDown");
  const removeBtn = document.getElementById("agronomyRemove");
  const availableCheckedCountEl = document.getElementById("agronomyAvailableCheckedCount");
  const selectedCheckedCountEl = document.getElementById("agronomySelectedCheckedCount");
  if (!availableList || !selectedList || !searchInput) return;

  trialState.selectedAgronomyOrder = Array.isArray(selectedIds) ? [...selectedIds] : [];

  // Get current trial crop
  const cropId = document.getElementById("trialCrops")?.value;

  // Filter agronomy items by crop
  const allAgronomy = inventoryState.items.agronomy || [];
  const filteredAgronomy = cropId
    ? allAgronomy.filter(a => a.cropIds && a.cropIds.includes(cropId))
    : allAgronomy;

  const checkedState = {
    available: new Set(),
    selected: new Set(),
  };
  let activeListType = "";

  const updateActiveListUI = () => {
    availableList.classList.toggle("picklist-list-active", activeListType === "available");
    selectedList.classList.toggle("picklist-list-active", activeListType === "selected");
  };

  const setActiveListType = (type) => {
    activeListType = type;
    updateActiveListUI();
  };

  const setSelection = (listEl, id) => {
    listEl.querySelectorAll(".picklist-item").forEach((item) => {
      item.classList.toggle("selected", item.dataset.id === id);
    });
    listEl.dataset.selectedId = id || "";
  };

  const getActionIds = (checkedSet, fallbackId) => {
    const checkedIds = Array.from(checkedSet).filter(Boolean);
    if (checkedIds.length > 0) return checkedIds;
    return fallbackId ? [fallbackId] : [];
  };

  const clearCheckedState = () => {
    checkedState.available.clear();
    checkedState.selected.clear();
  };

  const getListByType = (type) =>
    type === "available" ? availableList : type === "selected" ? selectedList : null;

  const withActiveListType = (handler) => {
    if (!activeListType) {
      showToast("Please choose a list side first: Available or Selected", "warning");
      return;
    }
    handler(activeListType);
  };

  const updateCheckedIndicators = () => {
    if (availableCheckedCountEl) {
      availableCheckedCountEl.textContent = String(checkedState.available.size);
    }
    if (selectedCheckedCountEl) {
      selectedCheckedCountEl.textContent = String(checkedState.selected.size);
    }
  };

  const renderAvailable = (searchTerm = "") => {
    const filtered = filteredAgronomy.filter((item) => {
      const activity = item.activity || item.name || "";
      const match = activity.toLowerCase().includes(searchTerm.toLowerCase());
      return match && !trialState.selectedAgronomyOrder.includes(item.id);
    });

    const filteredIds = new Set(filtered.map((item) => item.id));
    checkedState.available.forEach((id) => {
      if (!filteredIds.has(id)) checkedState.available.delete(id);
    });

    if (filtered.length === 0) {
      availableList.innerHTML = '<p class="param-no-results">No agronomy items found</p>';
      updateCheckedIndicators();
      return;
    }

    availableList.innerHTML = filtered.map((item) => {
      const dapText = item.dapMin != null
        ? (item.dapMax != null && item.dapMax !== "" && item.dapMax !== item.dapMin
          ? `DAP ${item.dapMin}-${item.dapMax}`
          : `DAP ${item.dapMin}`)
        : "";
      return `
        <div class="picklist-item" draggable="true" data-id="${item.id}">
          <input type="checkbox" class="picklist-item-checkbox" data-id="${item.id}" ${checkedState.available.has(item.id) ? "checked" : ""}>
          <div class="picklist-item-content">
            <div class="picklist-item-title">${escapeHtml(item.activity || item.name || "")}</div>
          </div>
        </div>
      `;
    }).join("");

    availableList.querySelectorAll(".picklist-item").forEach((el) => {
      const itemId = el.dataset.id;
      const checkbox = el.querySelector(".picklist-item-checkbox");

      checkbox?.addEventListener("click", (e) => e.stopPropagation());
      checkbox?.addEventListener("change", (e) => {
        setActiveListType("available");
        if (e.target.checked) {
          checkedState.available.add(itemId);
        } else {
          checkedState.available.delete(itemId);
        }
        updateCheckedIndicators();
      });

      el.addEventListener("click", () => {
        setActiveListType("available");
        if (checkbox) {
          checkbox.checked = !checkbox.checked;
          if (checkbox.checked) {
            checkedState.available.add(itemId);
          } else {
            checkedState.available.delete(itemId);
          }
          updateCheckedIndicators();
        }
        setSelection(availableList, itemId);
        setSelection(selectedList, "");
      });
      el.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", itemId);
        e.dataTransfer.setData("source", "available");
        el.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      el.addEventListener("dragend", () => {
        el.classList.remove("dragging");
        document.querySelectorAll(".picklist-item.drag-over").forEach(x => x.classList.remove("drag-over"));
      });
    });

    updateCheckedIndicators();
  };

  const renderSelected = () => {
    const selectedIds = new Set(trialState.selectedAgronomyOrder);
    checkedState.selected.forEach((id) => {
      if (!selectedIds.has(id)) checkedState.selected.delete(id);
    });

    if (trialState.selectedAgronomyOrder.length === 0) {
      selectedList.innerHTML = '<p class="param-no-results">No agronomy selected</p>';
      updateCheckedIndicators();
      return;
    }

    selectedList.innerHTML = trialState.selectedAgronomyOrder.map((id) => {
      const item = allAgronomy.find((a) => a.id === id);
      if (!item) return "";
      const dapText = item.dapMin != null
        ? (item.dapMax != null && item.dapMax !== "" && item.dapMax !== item.dapMin
          ? `DAP ${item.dapMin}-${item.dapMax}`
          : `DAP ${item.dapMin}`)
        : "";
      return `
        <div class="picklist-item" draggable="true" data-id="${item.id}">
          <input type="checkbox" class="picklist-item-checkbox" data-id="${item.id}" ${checkedState.selected.has(item.id) ? "checked" : ""}>
          <div class="picklist-item-content">
            <div class="picklist-item-title">${escapeHtml(item.activity || item.name || "")}</div>
          </div>
        </div>
      `;
    }).join("");

    selectedList.querySelectorAll(".picklist-item").forEach((el) => {
      const itemId = el.dataset.id;
      const checkbox = el.querySelector(".picklist-item-checkbox");

      checkbox?.addEventListener("click", (e) => e.stopPropagation());
      checkbox?.addEventListener("change", (e) => {
        setActiveListType("selected");
        if (e.target.checked) {
          checkedState.selected.add(itemId);
        } else {
          checkedState.selected.delete(itemId);
        }
        updateCheckedIndicators();
      });

      el.addEventListener("click", () => {
        setActiveListType("selected");
        if (checkbox) {
          checkbox.checked = !checkbox.checked;
          if (checkbox.checked) {
            checkedState.selected.add(itemId);
          } else {
            checkedState.selected.delete(itemId);
          }
          updateCheckedIndicators();
        }
        setSelection(selectedList, itemId);
        setSelection(availableList, "");
      });
      el.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", itemId);
        e.dataTransfer.setData("source", "selected");
        el.classList.add("dragging");
      });
      el.addEventListener("dragend", () => {
        el.classList.remove("dragging");
        document.querySelectorAll(".picklist-item.drag-over").forEach(x => x.classList.remove("drag-over"));
      });
      el.addEventListener("dragover", (e) => {
        e.preventDefault();
        el.classList.add("drag-over");
        e.dataTransfer.dropEffect = "move";
      });
      el.addEventListener("dragleave", (e) => {
        if (e.target === el) el.classList.remove("drag-over");
      });
      el.addEventListener("drop", (e) => {
        e.preventDefault();
        el.classList.remove("drag-over");
        const draggedId = e.dataTransfer.getData("text/plain");
        const source = e.dataTransfer.getData("source");
        const targetId = itemId;
        if (draggedId === targetId) return;

        if (source === "available") {
          const targetIdx = trialState.selectedAgronomyOrder.indexOf(targetId);
          trialState.selectedAgronomyOrder.splice(targetIdx, 0, draggedId);
        } else if (source === "selected") {
          const fromIdx = trialState.selectedAgronomyOrder.indexOf(draggedId);
          if (fromIdx >= 0) trialState.selectedAgronomyOrder.splice(fromIdx, 1);
          const targetIdx = trialState.selectedAgronomyOrder.indexOf(targetId);
          trialState.selectedAgronomyOrder.splice(targetIdx, 0, draggedId);
        }
        renderAvailable(searchInput.value);
        renderSelected();
        updateSelectedAgronomyCount();
        updateCheckedIndicators();
      });
    });

    updateCheckedIndicators();
  };

  const updateSelectedAgronomyCount = () => {
    const countEl = document.getElementById("selectedAgronomyCount");
    if (countEl) countEl.textContent = trialState.selectedAgronomyOrder.length;
  };

  // Drop on available list (remove from selected)
  availableList.ondragover = (e) => { e.preventDefault(); availableList.classList.add("picklist-list-drag-over"); };
  availableList.ondragleave = () => { availableList.classList.remove("picklist-list-drag-over"); };
  availableList.ondrop = (e) => {
    e.preventDefault();
    availableList.classList.remove("picklist-list-drag-over");
    const draggedId = e.dataTransfer.getData("text/plain");
    const source = e.dataTransfer.getData("source");
    if (source === "selected") {
      const idx = trialState.selectedAgronomyOrder.indexOf(draggedId);
      if (idx >= 0) trialState.selectedAgronomyOrder.splice(idx, 1);
      renderAvailable(searchInput.value);
      renderSelected();
      updateSelectedAgronomyCount();
      updateCheckedIndicators();
    }
  };

  // Drop on selected list (add from available)
  selectedList.ondragover = (e) => { e.preventDefault(); selectedList.classList.add("picklist-list-drag-over"); };
  selectedList.ondragleave = () => { selectedList.classList.remove("picklist-list-drag-over"); };
  selectedList.ondrop = (e) => {
    e.preventDefault();
    selectedList.classList.remove("picklist-list-drag-over");
    const draggedId = e.dataTransfer.getData("text/plain");
    const source = e.dataTransfer.getData("source");
    if (source === "available" && !trialState.selectedAgronomyOrder.includes(draggedId)) {
      trialState.selectedAgronomyOrder.push(draggedId);
      renderAvailable(searchInput.value);
      renderSelected();
      updateSelectedAgronomyCount();
    }
  };

  // Button controls
  if (moveRightBtn) {
    moveRightBtn.onclick = () => {
      const actionIds = getActionIds(
        checkedState.available,
        availableList.dataset.selectedId,
      );
      if (actionIds.length === 0) return;

      let hasChanges = false;
      actionIds.forEach((id) => {
        if (!trialState.selectedAgronomyOrder.includes(id)) {
          trialState.selectedAgronomyOrder.push(id);
          hasChanges = true;
        }
      });

      if (hasChanges) {
        clearCheckedState();
        setSelection(availableList, "");
        renderAvailable(searchInput.value);
        renderSelected();
        updateSelectedAgronomyCount();
        updateCheckedIndicators();
      }
    };
  }
  if (moveUpBtn) {
    moveUpBtn.onclick = () => {
      const hadCheckedSelection = checkedState.selected.size > 0;
      const actionIds = getActionIds(
        checkedState.selected,
        selectedList.dataset.selectedId,
      );
      if (actionIds.length === 0) return;

      const moveSet = new Set(
        actionIds.filter((id) => trialState.selectedAgronomyOrder.includes(id)),
      );
      if (moveSet.size === 0) return;

      for (let i = 1; i < trialState.selectedAgronomyOrder.length; i += 1) {
        const currentId = trialState.selectedAgronomyOrder[i];
        const prevId = trialState.selectedAgronomyOrder[i - 1];
        if (moveSet.has(currentId) && !moveSet.has(prevId)) {
          trialState.selectedAgronomyOrder[i] = prevId;
          trialState.selectedAgronomyOrder[i - 1] = currentId;
        }
      }

      if (hadCheckedSelection) {
        checkedState.selected = moveSet;
      } else {
        checkedState.selected.clear();
      }
      renderSelected();
      if (!hadCheckedSelection && actionIds.length === 1) {
        setSelection(selectedList, actionIds[0]);
      }
    };
  }
  if (moveDownBtn) {
    moveDownBtn.onclick = () => {
      const hadCheckedSelection = checkedState.selected.size > 0;
      const actionIds = getActionIds(
        checkedState.selected,
        selectedList.dataset.selectedId,
      );
      if (actionIds.length === 0) return;

      const moveSet = new Set(
        actionIds.filter((id) => trialState.selectedAgronomyOrder.includes(id)),
      );
      if (moveSet.size === 0) return;

      for (let i = trialState.selectedAgronomyOrder.length - 2; i >= 0; i -= 1) {
        const currentId = trialState.selectedAgronomyOrder[i];
        const nextId = trialState.selectedAgronomyOrder[i + 1];
        if (moveSet.has(currentId) && !moveSet.has(nextId)) {
          trialState.selectedAgronomyOrder[i] = nextId;
          trialState.selectedAgronomyOrder[i + 1] = currentId;
        }
      }

      if (hadCheckedSelection) {
        checkedState.selected = moveSet;
      } else {
        checkedState.selected.clear();
      }
      renderSelected();
      if (!hadCheckedSelection && actionIds.length === 1) {
        setSelection(selectedList, actionIds[0]);
      }
    };
  }
  if (removeBtn) {
    removeBtn.onclick = () => {
      const actionIds = new Set(
        getActionIds(checkedState.selected, selectedList.dataset.selectedId),
      );
      if (actionIds.size === 0) return;

      const beforeLength = trialState.selectedAgronomyOrder.length;
      trialState.selectedAgronomyOrder = trialState.selectedAgronomyOrder.filter(
        (id) => !actionIds.has(id),
      );

      if (trialState.selectedAgronomyOrder.length !== beforeLength) {
        clearCheckedState();
        setSelection(selectedList, "");
        renderAvailable(searchInput.value);
        renderSelected();
        updateSelectedAgronomyCount();
        updateCheckedIndicators();
      }
    };
  }

  if (selectAllBtn) {
    selectAllBtn.onclick = () => {
      withActiveListType((targetType) => {
        const targetList = getListByType(targetType);
        if (!targetList) return;

        if (targetType === "available") {
          checkedState.available.clear();
          targetList
            .querySelectorAll(".picklist-item-checkbox")
            .forEach((checkbox) => {
              checkbox.checked = true;
              if (checkbox.dataset.id) checkedState.available.add(checkbox.dataset.id);
            });
        } else {
          checkedState.selected.clear();
          targetList
            .querySelectorAll(".picklist-item-checkbox")
            .forEach((checkbox) => {
              checkbox.checked = true;
              if (checkbox.dataset.id) checkedState.selected.add(checkbox.dataset.id);
            });
        }

        updateCheckedIndicators();
      });
    };
  }

  if (deselectAllBtn) {
    deselectAllBtn.onclick = () => {
      withActiveListType((targetType) => {
        const targetList = getListByType(targetType);
        if (!targetList) return;

        targetList.querySelectorAll(".picklist-item-checkbox").forEach((checkbox) => {
          checkbox.checked = false;
        });

        if (targetType === "available") {
          checkedState.available.clear();
        } else {
          checkedState.selected.clear();
        }

        updateCheckedIndicators();
      });
    };
  }

  renderAvailable();
  renderSelected();
  updateSelectedAgronomyCount();
  updateCheckedIndicators();
  updateActiveListUI();

  // Search listener
  searchInput.removeEventListener("input", searchInput._agronomySearchHandler);
  searchInput._agronomySearchHandler = (e) => renderAvailable(e.target.value);
  searchInput.addEventListener("input", searchInput._agronomySearchHandler);
}

// Setup agronomy monitoring toggle and crop change listener
function setupAgronomyMonitoringListeners() {
  const checkbox = document.getElementById('trialAgronomyMonitoring');
  const container = document.getElementById('agronomyPickerContainer');
  const cropSelect = document.getElementById('trialCrops');

  if (checkbox) {
    checkbox.removeEventListener('change', checkbox._agronomyToggle);
    checkbox._agronomyToggle = () => {
      if (checkbox.checked) {
        container?.classList.remove('hidden');
        populateTrialAgronomy(trialState.selectedAgronomyOrder || []);
      } else {
        container?.classList.add('hidden');
      }
    };
    checkbox.addEventListener('change', checkbox._agronomyToggle);
  }

  // When crop changes, refresh agronomy available list and parameters list
  if (cropSelect) {
    cropSelect.removeEventListener('change', cropSelect._agronomyCropChange);
    cropSelect._agronomyCropChange = () => {
      // Refresh parameters list (filter by crop DoO)
      populateTrialParameters(trialState.selectedParametersOrder || []);
      // Refresh agronomy list
      if (checkbox?.checked) {
        populateTrialAgronomy(trialState.selectedAgronomyOrder || []);
      }
    };
    cropSelect.addEventListener('change', cropSelect._agronomyCropChange);
  }
}

// ═════════════════════════════════════════════
// Pollination → Trial Type cascade & plot spec
// ═════════════════════════════════════════════

function setupPollinationTrialTypeCascade() {
  const pollinationSelect = document.getElementById("trialPollination");
  const trialTypeSelect = document.getElementById("trialType");
  if (!pollinationSelect || !trialTypeSelect) return;

  pollinationSelect.removeEventListener("change", pollinationSelect._cascadeHandler);
  pollinationSelect._cascadeHandler = () => {
    updateTrialTypeOptions();
    updatePlotSpecVisibility();
  };
  pollinationSelect.addEventListener("change", pollinationSelect._cascadeHandler);

  trialTypeSelect.removeEventListener("change", trialTypeSelect._plotSpecHandler);
  trialTypeSelect._plotSpecHandler = () => {
    updatePlotSpecVisibility();
  };
  trialTypeSelect.addEventListener("change", trialTypeSelect._plotSpecHandler);
}

function updateTrialTypeOptions() {
  const pollination = document.getElementById("trialPollination")?.value || "";
  const trialTypeSelect = document.getElementById("trialType");
  if (!trialTypeSelect) return;

  const oldValue = trialTypeSelect.value;
  let options = [];

  if (pollination === "Selfing") {
    options = [
      { value: "Parent Test", label: "Parent Test" },
      { value: "Process Research", label: "Process Research" },
    ];
  } else if (pollination === "Crossing") {
    options = [
      { value: "Micropilot", label: "Micropilot" },
      { value: "Process Research", label: "Process Research" },
    ];
  }

  trialTypeSelect.innerHTML = '<option value="">Select trial type</option>' +
    options.map(o => `<option value="${o.value}">${o.label}</option>`).join("");

  // Restore old value if it's still among the new options
  if (options.some(o => o.value === oldValue)) {
    trialTypeSelect.value = oldValue;
  } else {
    trialTypeSelect.value = "";
  }

  updatePlotSpecSectionAccessState();
}

function updatePlotSpecVisibility() {
  const pollination = document.getElementById("trialPollination")?.value || "";
  const trialType = document.getElementById("trialType")?.value || "";
  const parentTestBlock = document.getElementById("plotSpecParentTest");
  const micropilotBlock = document.getElementById("plotSpecMicropilot");
  const lockNotice = document.getElementById("plotSpecLockNotice");
  const plotSpecContent = document.getElementById("plotSpecContent");
  if (!parentTestBlock || !micropilotBlock) return;

  const isReady = Boolean(pollination && trialType);
  if (lockNotice) lockNotice.classList.toggle("hidden", isReady);
  if (plotSpecContent) plotSpecContent.classList.toggle("hidden", !isReady);
  updatePlotSpecSectionAccessState();

  if (!isReady) {
    parentTestBlock.classList.remove("hidden");
    micropilotBlock.classList.add("hidden");
    return;
  }

  if (trialType === "Micropilot") {
    parentTestBlock.classList.add("hidden");
    micropilotBlock.classList.remove("hidden");
    setupMicropilotCalculations();
  } else {
    parentTestBlock.classList.remove("hidden");
    micropilotBlock.classList.add("hidden");
  }
}

// ═══════════════════════════════════════
// Micropilot-specific calculations
// ═══════════════════════════════════════

function setupMicropilotCalculations() {
  const ids = ["trialMpPanel", "trialRatioFemale", "trialRatioMale", "trialMpPlotLength", "trialMpSpacingWidth", "trialMpSpacingHeight"];
  const inputs = ids.map(id => document.getElementById(id)).filter(Boolean);

  inputs.forEach(input => {
    input.removeEventListener("input", updateMicropilotCalculations);
    input.addEventListener("input", updateMicropilotCalculations);
  });

  updateMicropilotCalculations();
}

function updateMicropilotCalculations() {
  const panel = parseFloat(document.getElementById("trialMpPanel")?.value || "");
  const ratioFemale = parseFloat(document.getElementById("trialRatioFemale")?.value || "");
  const ratioMale = parseFloat(document.getElementById("trialRatioMale")?.value || "");
  const plotLength = parseFloat(document.getElementById("trialMpPlotLength")?.value || "");
  const spacingWCm = parseFloat(document.getElementById("trialMpSpacingWidth")?.value || "");
  const spacingHCm = parseFloat(document.getElementById("trialMpSpacingHeight")?.value || "");

  const totalFemaleRowsEl = document.getElementById("trialMpTotalFemaleRows");
  const totalMaleRowsEl = document.getElementById("trialMpTotalMaleRows");
  const plotAreaEl = document.getElementById("trialMpPlotArea");
  const expFemaleEl = document.getElementById("trialMpExpectedFemale");
  const expMaleEl = document.getElementById("trialMpExpectedMale");
  const popFemaleEl = document.getElementById("trialMpPopFemale");
  const popMaleEl = document.getElementById("trialMpPopMale");

  const widthM = Number.isFinite(spacingWCm) ? spacingWCm / 100 : NaN;
  const heightM = Number.isFinite(spacingHCm) ? spacingHCm / 100 : NaN;

  const totalRatio = (Number.isFinite(ratioFemale) ? ratioFemale : 0) + (Number.isFinite(ratioMale) ? ratioMale : 0);

  // Micropilot pattern:
  // Female rows = ratioFemale * panel
  // Male rows   = (ratioMale * panel) + ratioMale
  const femaleRows = Number.isFinite(ratioFemale) && Number.isFinite(panel) && ratioFemale >= 0 && panel >= 0
    ? ratioFemale * panel
    : NaN;
  const maleRows = Number.isFinite(ratioMale) && Number.isFinite(panel) && ratioMale >= 0 && panel >= 0
    ? (ratioMale * panel) + ratioMale
    : NaN;
  const totalRows = Number.isFinite(femaleRows) && Number.isFinite(maleRows)
    ? femaleRows + maleRows
    : NaN;

  if (totalFemaleRowsEl) totalFemaleRowsEl.value = Number.isFinite(femaleRows) ? String(femaleRows) : "";
  if (totalMaleRowsEl) totalMaleRowsEl.value = Number.isFinite(maleRows) ? String(maleRows) : "";

  // Population/plot by row count and plant spacing height
  const canCalcPopPlot = Number.isFinite(plotLength) && Number.isFinite(heightM) && plotLength > 0 && heightM > 0;
  const femalePopPlot = canCalcPopPlot && Number.isFinite(femaleRows) ? (plotLength / heightM) * femaleRows : NaN;
  const malePopPlot = canCalcPopPlot && Number.isFinite(maleRows) ? (plotLength / heightM) * maleRows : NaN;
  if (expFemaleEl) expFemaleEl.value = Number.isFinite(femalePopPlot) ? Math.round(femalePopPlot).toLocaleString() : "";
  if (expMaleEl) expMaleEl.value = Number.isFinite(malePopPlot) ? Math.round(malePopPlot).toLocaleString() : "";

  // Plot area in m²: totalRows * spacingWidth(m) * plotLength(m)
  const plotAreaM2 = Number.isFinite(totalRows) && Number.isFinite(widthM) && Number.isFinite(plotLength)
    && totalRows > 0 && widthM > 0 && plotLength > 0
      ? totalRows * widthM * plotLength
      : NaN;
  if (plotAreaEl) plotAreaEl.value = Number.isFinite(plotAreaM2) ? plotAreaM2.toFixed(2) : "";

  // Population/ha = ratio part * (10000 / (spacingW(m) * spacingH(m)))
  const totalPopHa = Number.isFinite(widthM) && Number.isFinite(heightM) && widthM > 0 && heightM > 0
    ? 10000 / (widthM * heightM)
    : NaN;
  const femalePopHa = Number.isFinite(totalPopHa) && totalRatio > 0 && Number.isFinite(ratioFemale)
    ? totalPopHa * (ratioFemale / totalRatio)
    : NaN;
  const malePopHa = Number.isFinite(totalPopHa) && totalRatio > 0 && Number.isFinite(ratioMale)
    ? totalPopHa * (ratioMale / totalRatio)
    : NaN;
  if (popFemaleEl) popFemaleEl.value = Number.isFinite(femalePopHa) ? Math.round(femalePopHa).toLocaleString() : "";
  if (popMaleEl) popMaleEl.value = Number.isFinite(malePopHa) ? Math.round(malePopHa).toLocaleString() : "";
}

function setupTrialGeneralCalculations() {
  const inputs = [
    document.getElementById("trialRowsPerPlot"),
    document.getElementById("trialPlotLength"),
    document.getElementById("trialPlantSpacingWidth"),
    document.getElementById("trialPlantSpacingHeight"),
  ].filter(Boolean);

  inputs.forEach((input) => {
    input.removeEventListener("input", updateTrialGeneralCalculations);
    input.addEventListener("input", updateTrialGeneralCalculations);
  });

  updateTrialGeneralCalculations();
}

function updateTrialGeneralCalculations() {
  const rowsPerPlot = parseFloat(
    document.getElementById("trialRowsPerPlot")?.value || "",
  );
  const plotLength = parseFloat(
    document.getElementById("trialPlotLength")?.value || "",
  );
  const spacingWidthCm = parseFloat(
    document.getElementById("trialPlantSpacingWidth")?.value || "",
  );
  const spacingHeightCm = parseFloat(
    document.getElementById("trialPlantSpacingHeight")?.value || "",
  );

  const plotAreaEl = document.getElementById("trialPlotArea");
  const expectedPlantsEl = document.getElementById("trialExpectedPlants");
  const populationEl = document.getElementById("trialPopulationHa");

  if (!plotAreaEl || !expectedPlantsEl || !populationEl) return;

  const widthM = Number.isFinite(spacingWidthCm) ? spacingWidthCm / 100 : NaN;
  const heightM = Number.isFinite(spacingHeightCm) ? spacingHeightCm / 100 : NaN;

  const canCalcArea =
    Number.isFinite(rowsPerPlot) &&
    Number.isFinite(plotLength) &&
    Number.isFinite(widthM) &&
    rowsPerPlot > 0 &&
    plotLength > 0 &&
    widthM > 0;

  const canCalcExpected =
    Number.isFinite(rowsPerPlot) &&
    Number.isFinite(plotLength) &&
    Number.isFinite(heightM) &&
    rowsPerPlot > 0 &&
    plotLength > 0 &&
    heightM > 0;

  const canCalcPopulation =
    Number.isFinite(widthM) &&
    Number.isFinite(heightM) &&
    widthM > 0 &&
    heightM > 0;

  plotAreaEl.value = canCalcArea
    ? (rowsPerPlot * plotLength * widthM).toFixed(2)
    : "";

  expectedPlantsEl.value = canCalcExpected
    ? Math.round((plotLength / heightM) * rowsPerPlot).toString()
    : "";

  populationEl.value = canCalcPopulation
    ? (10000 / (widthM * heightM)).toFixed(2)
    : "";
}

// ---- Field Map Popup ----

function openFieldMapPopup() {
  const popup = document.getElementById("fieldMapPopup");
  if (!popup) return;
  popup.classList.remove("hidden");
  lockBodyScroll();

  // Populate location select
  populateTrialLocations();

  const trial = trialState.editingTrialId
    ? trialState.trials.find((t) => t.id === trialState.editingTrialId)
    : null;

  initializeTrialMap(trial?.locationCoordinates);

  // Re-draw existing areas on the map
  if (trialMapInstance && trialState.currentAreas.length > 0) {
    trialDrawnLayers = [];
    trialState.currentAreas.forEach((area, index) => {
      drawSavedArea(area, index);
    });
  }

  // Bind close button
  const closeBtn = document.getElementById("closeFieldMapPopupBtn");
  if (closeBtn) {
    closeBtn.onclick = () => closeFieldMapPopup();
  }

  setTimeout(() => {
    if (trialMapInstance) trialMapInstance.invalidateSize();
  }, 150);
}

function closeFieldMapPopup() {
  // Stop any active drawing
  if (trialState.isDrawing) {
    stopDrawing();
  }

  // Clear current polygon if not saved
  if (trialState.currentPolygon && trialMapInstance) {
    trialMapInstance.removeLayer(trialState.currentPolygon.polygon);
    trialState.currentPolygon = null;
  }

  destroyTrialMap();

  const popup = document.getElementById("fieldMapPopup");
  if (popup) popup.classList.add("hidden");
  unlockBodyScroll();

  // Refresh areas list in the field section
  renderAreasList();
}

// Initialize trial map
function initializeTrialMap(centerCoords = null) {
  // Destroy existing map
  if (trialMapInstance) {
    trialMapInstance.remove();
    trialMapInstance = null;
  }

  trialDrawnLayers = [];
  trialCurrentDrawing = null;

  const mapContainer = document.getElementById("trialMap");
  if (!mapContainer) return;

  // Default center (Indonesia)
  let center = [-2.5, 118.0];
  let zoom = 4;

  if (centerCoords) {
    const parsed = parseCoordinates(centerCoords);
    if (parsed) {
      center = [parsed.lat, parsed.lng];
      zoom = 13;
    }
  }

  // Create map
  trialMapInstance = L.map(mapContainer).setView(center, zoom);

  // Add satellite tile layer
  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      attribution: "",
      maxNativeZoom: 17,
      maxZoom: 25,
    },
  ).addTo(trialMapInstance);

  // Add labels layer on top of satellite
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png",
    {
      attribution: "&copy; OpenStreetMap contributors, &copy; CartoDB",
      maxNativeZoom: 17,
      maxZoom: 25,
    },
  ).addTo(trialMapInstance);

  // Fit Indonesia bounds when no specific location is provided
  if (!centerCoords) {
    const indonesiaBounds = L.latLngBounds([
      [-11.0, 95.0],
      [6.5, 141.0],
    ]);
    trialMapInstance.fitBounds(indonesiaBounds, { padding: [20, 20] });
  }

  // Setup drawing controls
  setupTrialMapDrawing();

  // Invalidate size after render
  setTimeout(() => {
    if (trialMapInstance) {
      trialMapInstance.invalidateSize();
    }
  }, 100);
}

// Setup trial map drawing with controls overlay
function setupTrialMapDrawing() {
  const startBtn = document.getElementById("startDrawingBtn");
  const saveBtn = document.getElementById("saveAreaBtn");
  const clearBtn = document.getElementById("clearDrawingBtn");

  // Use buttons from HTML
  if (startBtn && trialMapInstance) {
    startBtn.onclick = () => {
      if (trialState.isDrawing) {
        stopDrawing();
      } else {
        startDrawing();
      }
    };

    saveBtn.onclick = () => {
      saveCurrentArea();
    };

    clearBtn.onclick = () => {
      clearCurrentDrawingPoints();
    };

    // Setup undo button from zone info panel
    const undoBtn = document.getElementById("undoPointBtn");
    if (undoBtn) {
      undoBtn.onclick = () => {
        undoLastPoint();
      };
    }
  }
}

// Start drawing polygon
function startDrawing() {
  if (!trialMapInstance) return;

  trialState.isDrawing = true;
  trialCurrentDrawing = {
    points: [],
    markers: [],
    polyline: null,
    polygonPreview: null,
  };

  // Update button
  const startBtn = document.getElementById("startDrawingBtn");
  startBtn.innerHTML =
    '<span class="material-symbols-rounded">stop</span>';
  startBtn.classList.add("btn-drawing");
  startBtn.title = "Stop Drawing";

  // Show zone info panel
  const zonePanel = document.getElementById("zoneInfoPanel");
  if (zonePanel) {
    zonePanel.classList.remove("hidden");
  }

  // Add click listener to map
  trialMapInstance.on("click", handleMapClickForDrawing);

  // Change cursor
  trialMapInstance.getContainer().classList.add("cursor-crosshair");

  // Add keyboard shortcuts
  document.addEventListener("keydown", handleDrawingKeyboard);
}

// Stop drawing
function stopDrawing() {
  if (!trialMapInstance) return;

  trialState.isDrawing = false;

  // Update button
  const startBtn = document.getElementById("startDrawingBtn");
  startBtn.innerHTML =
    '<span class="material-symbols-rounded">draw</span>';
  startBtn.title = "Start Drawing Area";
  startBtn.classList.remove("btn-drawing");

  // Remove click listener
  trialMapInstance.off("click", handleMapClickForDrawing);

  // Remove keyboard listener
  document.removeEventListener("keydown", handleDrawingKeyboard);

  // Restore cursor
  trialMapInstance.getContainer().classList.remove("cursor-crosshair");

  // Hide zone info panel
  const zonePanel = document.getElementById("zoneInfoPanel");
  if (zonePanel) {
    zonePanel.classList.add("hidden");
  }

  // Clear current drawing if not complete
  if (trialCurrentDrawing) {
    trialCurrentDrawing.markers.forEach((m) => trialMapInstance.removeLayer(m));
    if (trialCurrentDrawing.polyline) {
      trialMapInstance.removeLayer(trialCurrentDrawing.polyline);
    }
    if (trialCurrentDrawing.polygonPreview) {
      trialMapInstance.removeLayer(trialCurrentDrawing.polygonPreview);
    }
    trialCurrentDrawing = null;
  }

  document.getElementById("saveAreaBtn").disabled = true;
}

// Handle map click for drawing with real-time area calculation
function handleMapClickForDrawing(e) {
  if (!trialState.isDrawing || !trialCurrentDrawing) return;

  const latlng = e.latlng;

  // Add point
  trialCurrentDrawing.points.push(latlng);

  // Add marker
  const marker = L.circleMarker(latlng, {
    radius: 6,
    fillColor: "#2563eb",
    color: "#fff",
    weight: 2,
    fillOpacity: 0.8,
  }).addTo(trialMapInstance);

  trialCurrentDrawing.markers.push(marker);

  // Remove old polyline
  if (trialCurrentDrawing.polyline) {
    trialMapInstance.removeLayer(trialCurrentDrawing.polyline);
  }

  // Show polygon preview if we have 3+ points
  if (trialCurrentDrawing.points.length >= 3) {
    // Remove old polygon preview
    if (trialCurrentDrawing.polygonPreview) {
      trialMapInstance.removeLayer(trialCurrentDrawing.polygonPreview);
    }

    // Create filled polygon preview
    trialCurrentDrawing.polygonPreview = L.polygon(trialCurrentDrawing.points, {
      color: "#2563eb",
      fillColor: "#3b82f6",
      fillOpacity: 0.3,
      weight: 2,
    }).addTo(trialMapInstance);
  } else {
    // Show dashed polyline for 1-2 points
    trialCurrentDrawing.polyline = L.polyline(trialCurrentDrawing.points, {
      color: "#2563eb",
      weight: 2,
      dashArray: "5, 5",
    }).addTo(trialMapInstance);
  }

  // Update zone info panel
  updateZoneInfoPanel();

  // Enable save button if we have 3+ points
  if (trialCurrentDrawing.points.length >= 3) {
    document.getElementById("saveAreaBtn").disabled = false;
  }
}

// Update zone information panel with current drawing data
function updateZoneInfoPanel() {
  if (!trialCurrentDrawing) return;

  const pointCount = trialCurrentDrawing.points.length;
  const pointCountEl = document.getElementById("pointCount");
  const zoneAreaEl = document.getElementById("zoneArea");
  const zonePanel = document.getElementById("zoneInfoPanel");

  if (pointCountEl) {
    pointCountEl.textContent = pointCount;
  }

  // Show panel once we have points
  if (pointCount > 0 && zonePanel) {
    zonePanel.classList.remove("hidden");
  }

  // Calculate and display area if we have 3+ points
  if (pointCount >= 3 && zoneAreaEl) {
    const coords = trialCurrentDrawing.points.map((p) => [p.lat, p.lng]);
    const hectares = calculatePolygonArea(coords);
    zoneAreaEl.textContent = hectares.toFixed(2);
  } else if (zoneAreaEl) {
    zoneAreaEl.textContent = "0";
  }
}

// Complete polygon
function completePolygon() {
  if (!trialCurrentDrawing || trialCurrentDrawing.points.length < 3) return;

  // Remove temp markers and polyline
  trialCurrentDrawing.markers.forEach((m) => trialMapInstance.removeLayer(m));
  if (trialCurrentDrawing.polyline) {
    trialMapInstance.removeLayer(trialCurrentDrawing.polyline);
  }

  // Create polygon
  const polygon = L.polygon(trialCurrentDrawing.points, {
    color: "#2563eb",
    fillColor: "#3b82f6",
    fillOpacity: 0.3,
    weight: 2,
  }).addTo(trialMapInstance);

  // Store for temporary display
  trialState.currentPolygon = {
    polygon: polygon,
    points: trialCurrentDrawing.points.map((p) => [p.lat, p.lng]),
  };

  // Stop drawing
  stopDrawing();
}

// Save current area
function saveCurrentArea() {
  if (!trialState.currentPolygon) {
    if (trialCurrentDrawing && trialCurrentDrawing.points.length >= 3) {
      completePolygon();
    } else {
      return;
    }
  }

  // Show area name dialog
  const dialog = document.getElementById("areaNameDialog");
  const input = document.getElementById("areaNameInput");
  const confirmBtn = document.getElementById("confirmAreaNameBtn");
  const cancelBtn = document.getElementById("cancelAreaNameBtn");

  input.value = `Area ${trialState.currentAreas.length + 1}`;
  dialog.classList.remove("hidden");
  input.focus();
  input.select();

  // Remove old listeners
  const newConfirmBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
  const newCancelBtn = cancelBtn.cloneNode(true);
  cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

  // Confirm handler
  newConfirmBtn.addEventListener("click", () => {
    const areaName = input.value.trim();
    if (!areaName) {
      showToast("Please enter area name", "error");
      return;
    }

    // Calculate area size in hectares
    const hectares = calculatePolygonArea(trialState.currentPolygon.points);
    const squareMeters = hectares * 10000;
    const centroid = getPolygonCentroid(trialState.currentPolygon.points);

    // Add to areas list
    trialState.currentAreas.push({
      name: areaName,
      coordinates: trialState.currentPolygon.points,
      areaSize: {
        hectares: hectares,
        squareMeters: squareMeters,
      },
      centroid: centroid,
      address: "Fetching address...",
    });

    // Clear current polygon
    trialState.currentPolygon = null;

    // Disable save button
    document.getElementById("saveAreaBtn").disabled = true;

    // Hide dialog
    dialog.classList.add("hidden");
    input.value = "";

    // Close the map popup and refresh areas list
    closeFieldMapPopup();

    // Resolve address in background
    const areaIndex = trialState.currentAreas.length - 1;
    resolveAreaAddress(areaIndex);
  });

  // Cancel handler
  newCancelBtn.addEventListener("click", () => {
    dialog.classList.add("hidden");
    input.value = "";
  });

  // Enter key handler
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      newConfirmBtn.click();
    }
  });
}

// Clear only the current drawing points (not saved areas)
function clearCurrentDrawingPoints() {
  if (!trialMapInstance) return;

  if (trialCurrentDrawing) {
    trialCurrentDrawing.markers.forEach((m) => trialMapInstance.removeLayer(m));
    if (trialCurrentDrawing.polyline) {
      trialMapInstance.removeLayer(trialCurrentDrawing.polyline);
    }
    if (trialCurrentDrawing.polygonPreview) {
      trialMapInstance.removeLayer(trialCurrentDrawing.polygonPreview);
    }
    trialCurrentDrawing.points = [];
    trialCurrentDrawing.markers = [];
    trialCurrentDrawing.polyline = null;
    trialCurrentDrawing.polygonPreview = null;
  }

  if (trialState.currentPolygon) {
    trialMapInstance.removeLayer(trialState.currentPolygon.polygon);
    trialState.currentPolygon = null;
  }

  document.getElementById("saveAreaBtn").disabled = true;
  updateZoneInfoPanel();
}

// Undo the last point in drawing
function undoLastPoint() {
  if (!trialCurrentDrawing || trialCurrentDrawing.points.length === 0) return;

  // Remove the last point
  trialCurrentDrawing.points.pop();

  // Remove the last marker
  if (trialCurrentDrawing.markers.length > 0) {
    const lastMarker = trialCurrentDrawing.markers.pop();
    if (lastMarker) {
      trialMapInstance.removeLayer(lastMarker);
    }
  }

  // Remove old polyline/polygon preview
  if (trialCurrentDrawing.polyline) {
    trialMapInstance.removeLayer(trialCurrentDrawing.polyline);
    trialCurrentDrawing.polyline = null;
  }
  if (trialCurrentDrawing.polygonPreview) {
    trialMapInstance.removeLayer(trialCurrentDrawing.polygonPreview);
    trialCurrentDrawing.polygonPreview = null;
  }

  // Redraw polyline/polygon with remaining points
  if (trialCurrentDrawing.points.length >= 3) {
    trialCurrentDrawing.polygonPreview = L.polygon(trialCurrentDrawing.points, {
      color: "#2563eb",
      fillColor: "#3b82f6",
      fillOpacity: 0.3,
      weight: 2,
    }).addTo(trialMapInstance);
  } else if (trialCurrentDrawing.points.length >= 1) {
    trialCurrentDrawing.polyline = L.polyline(trialCurrentDrawing.points, {
      color: "#2563eb",
      weight: 2,
      dashArray: "5, 5",
    }).addTo(trialMapInstance);
  }

  // Update UI
  if (trialCurrentDrawing.points.length < 3) {
    document.getElementById("saveAreaBtn").disabled = true;
  }

  updateZoneInfoPanel();
}

// Handle keyboard shortcuts during drawing
function handleDrawingKeyboard(e) {
  if (!trialState.isDrawing) return;

  // Ctrl+Z or Cmd+Z for undo
  if ((e.ctrlKey || e.metaKey) && e.key === "z") {
    e.preventDefault();
    undoLastPoint();
  }

  // Enter to complete drawing
  if (e.key === "Enter" && trialCurrentDrawing && trialCurrentDrawing.points.length >= 3) {
    e.preventDefault();
    saveCurrentArea();
  }

  // Escape to cancel drawing
  if (e.key === "Escape") {
    e.preventDefault();
    stopDrawing();
  }
}

// Calculate polygon area in hectares using Shoelace formula
function calculatePolygonArea(coordinates) {
  if (coordinates.length < 3) return 0;

  // Convert to meters using approximate conversion
  // 1 degree latitude ≈ 111,000 meters
  // 1 degree longitude ≈ 111,000 * cos(latitude) meters

  const avgLat =
    coordinates.reduce((sum, coord) => sum + coord[0], 0) / coordinates.length;
  const latToMeters = 111000;
  const lngToMeters = 111000 * Math.cos((avgLat * Math.PI) / 180);

  // Convert coordinates to meters
  const coordsInMeters = coordinates.map((coord) => [
    coord[0] * latToMeters,
    coord[1] * lngToMeters,
  ]);

  // Shoelace formula
  let area = 0;
  for (let i = 0; i < coordsInMeters.length; i++) {
    const j = (i + 1) % coordsInMeters.length;
    area += coordsInMeters[i][0] * coordsInMeters[j][1];
    area -= coordsInMeters[j][0] * coordsInMeters[i][1];
  }
  area = Math.abs(area) / 2;

  // Convert to hectares (1 hectare = 10,000 m²)
  return area / 10000;
}

// Calculate polygon centroid
function getPolygonCentroid(coordinates) {
  if (coordinates.length < 3) return null;

  let x = 0;
  let y = 0;
  let z = 0;

  coordinates.forEach((coord) => {
    const lat = (coord[0] * Math.PI) / 180;
    const lng = (coord[1] * Math.PI) / 180;
    x += Math.cos(lat) * Math.cos(lng);
    y += Math.cos(lat) * Math.sin(lng);
    z += Math.sin(lat);
  });

  const total = coordinates.length;
  x /= total;
  y /= total;
  z /= total;

  const lng = Math.atan2(y, x);
  const hyp = Math.sqrt(x * x + y * y);
  const lat = Math.atan2(z, hyp);

  return {
    lat: (lat * 180) / Math.PI,
    lng: (lng * 180) / Math.PI,
  };
}

// Reverse geocode centroid to address
async function resolveAreaAddress(areaIndex) {
  const area = trialState.currentAreas[areaIndex];
  if (!area || !area.centroid) return;

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${area.centroid.lat}&lon=${area.centroid.lng}`;
    const response = await fetch(url, {
      headers: { "Accept-Language": "en" },
    });

    if (!response.ok) {
      throw new Error("Failed to resolve address");
    }

    const data = await response.json();
    area.address = data.display_name || "Unknown address";
  } catch (error) {
    area.address = "Unknown address";
  }

  renderAreasList();
  updateAreaPopup(areaIndex);
}

function buildAreaPopupContent(area) {
  const areaSize = area.areaSize ? area.areaSize.hectares.toFixed(2) : "0.00";
  const coordsList = area.coordinates
    .map(
      (coord, i) =>
        `<div class="area-popup-coord-item">Point ${i + 1}: ${coord[0].toFixed(6)}, ${coord[1].toFixed(6)}</div>`,
    )
    .join("");

  const address = area.address || "Unknown address";

  return `
        <div class="area-popup">
            <strong class="area-popup-title">${escapeHtml(area.name)}</strong>
            <div class="area-popup-info">
                <strong>Area:</strong> ${areaSize} hectares
            </div>
            <div class="area-popup-info">
                <strong>Address:</strong> ${escapeHtml(address)}
            </div>
            <div class="area-popup-coords">
                <strong class="area-popup-coords-title">Coordinates:</strong>
                ${coordsList}
            </div>
        </div>
    `;
}

function updateAreaPopup(index) {
  const layerEntry = trialDrawnLayers.find((l) => l.index === index);
  const area = trialState.currentAreas[index];
  if (!layerEntry || !area) return;

  layerEntry.layer.bindPopup(buildAreaPopupContent(area));
}

// Draw saved area
function drawSavedArea(area, index) {
  if (!trialMapInstance) return;

  const polygon = L.polygon(area.coordinates, {
    color: "#10b981",
    fillColor: "#10b981",
    fillOpacity: 0.2,
    weight: 2,
  }).addTo(trialMapInstance);

  polygon.bindPopup(buildAreaPopupContent(area));

  trialDrawnLayers.push({
    layer: polygon,
    index: index,
  });

  if (!area.address || area.address === "Fetching address...") {
    resolveAreaAddress(index);
  }
}

// Render areas list
function renderAreasList() {
  const container = document.getElementById("areasListContainer");
  const listDiv = document.getElementById("areasList");
  const emptyState = document.getElementById("areasEmptyState");

  if (trialState.currentAreas.length === 0) {
    if (listDiv) listDiv.classList.add("hidden");
    if (emptyState) emptyState.classList.remove("hidden");
    return;
  }

  if (listDiv) listDiv.classList.remove("hidden");
  if (emptyState) emptyState.classList.add("hidden");

  container.innerHTML = trialState.currentAreas
    .map((area, index) => {
      const areaSize = area.areaSize
        ? area.areaSize.hectares.toFixed(2)
        : "0.00";
      const address = area.address || "Unknown address";
      const coordsList = area.coordinates
        .map(
          (coord, i) =>
            `<div class="area-coord-item">  • Point ${i + 1}: ${coord[0].toFixed(6)}, ${coord[1].toFixed(6)}</div>`,
        )
        .join("");

      return `
            <div class="area-list-card">
                <div id="areaPreviewMap${index}" class="area-preview-map"></div>
                <div class="area-list-body">
                    <div class="area-list-header">
                        <strong class="area-list-title">${escapeHtml(area.name)}</strong>
                        <button type="button" onclick="removeArea(${index})" class="btn btn-sm area-remove-btn">
                            <span class="material-symbols-rounded">delete</span>
                            <span>Remove</span>
                        </button>
                    </div>
                    <div class="area-list-info">
                        <strong>Area:</strong> ${areaSize} hectares (${(areaSize * 10000).toFixed(0)} m²)
                    </div>
                    <div class="area-list-info">
                        <strong>Address:</strong> ${escapeHtml(address)}
                    </div>
                    <!--
                    <div class="area-list-info">
                        <strong>Points:</strong> ${area.coordinates.length}
                    </div>
                    -->
                    <details class="area-list-details">
                        <summary>View Coordinates</summary>
                        <div class="area-list-coords">
                            ${coordsList}
                        </div>
                    </details>
                </div>
            </div>
        `;
    })
    .join("");

  // Initialize preview maps for each area
  trialState.currentAreas.forEach((area, index) => {
    renderAreaPreviewMap(area, index);
  });
}

// Render preview map for area
function renderAreaPreviewMap(area, index) {
  const mapContainer = document.getElementById(`areaPreviewMap${index}`);
  if (!mapContainer) return;

  // Remove old map if exists
  // if (window[`areaPreviewMap${index}`]) {
  //   window[`areaPreviewMap${index}`].remove();
  // }

  // Create map instance (with no zoom control)
  const map = L.map(mapContainer, {
    zoomControl: false,
    attributionControl: false
  }).setView([-6.2, 106.8], 12);
  
  // Add satellite layer
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: '',
    maxNativeZoom: 17,
    maxZoom: 25
  }).addTo(map);

  // Add labels layer
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png', {
    attribution: '',
    maxNativeZoom: 17,
    maxZoom: 25,
    pane: 'shadowPane'
  }).addTo(map);

  // Disable all interactions
  map.dragging.disable();
  map.touchZoom.disable();
  map.doubleClickZoom.disable();
  map.scrollWheelZoom.disable();
  map.boxZoom.disable();
  map.keyboard.disable();
  if (map.tap) map.tap.disable();

  // Draw polygon
  if (area.coordinates && area.coordinates.length > 0) {
    const latlngs = area.coordinates.map(coord => [coord[0], coord[1]]);
    L.polygon(latlngs, {
      color: '#2563eb',
      fillColor: '#3b82f6',
      fillOpacity: 0.3,
      weight: 2
    }).addTo(map);

    // Fit bounds to polygon
    map.fitBounds(latlngs, { padding: [10, 10] });
  }

  // Store map instance
  window[`areaPreviewMap${index}`] = map;
  
  // Fix map size — multiple attempts to handle layout timing
  const fixSize = () => {
    map.invalidateSize();
    if (area.coordinates && area.coordinates.length > 0) {
      const latlngs = area.coordinates.map(coord => [coord[0], coord[1]]);
      map.fitBounds(latlngs, { padding: [10, 10] });
    }
  };
  setTimeout(fixSize, 50);
  setTimeout(fixSize, 200);
  setTimeout(fixSize, 500);
}

// Re-invalidate all existing preview maps (e.g. when returning to location section)
function invalidateAllPreviewMaps() {
  trialState.currentAreas.forEach((area, index) => {
    const map = window[`areaPreviewMap${index}`];
    if (map) {
      setTimeout(() => {
        map.invalidateSize();
        if (area.coordinates && area.coordinates.length > 0) {
          const latlngs = area.coordinates.map(coord => [coord[0], coord[1]]);
          map.fitBounds(latlngs, { padding: [10, 10] });
        }
      }, 100);
    }
  });
}

// Remove area
function removeArea(index) {
  // Remove from array
  trialState.currentAreas.splice(index, 1);

  // Remove from map (if map popup is open)
  if (trialMapInstance) {
    const layerToRemove = trialDrawnLayers.find((l) => l.index === index);
    if (layerToRemove) {
      trialMapInstance.removeLayer(layerToRemove.layer);
    }

    // Redraw all areas with updated indices
    trialDrawnLayers = [];
    trialState.currentAreas.forEach((area, idx) => {
      drawSavedArea(area, idx);
    });
  } else {
    trialDrawnLayers = [];
  }

  // Update list
  renderAreasList();
}

// Clear all areas
function clearAllAreas() {
  trialState.currentAreas = [];

  // Remove all layers from map (if map is open)
  if (trialMapInstance) {
    trialDrawnLayers.forEach((l) => trialMapInstance.removeLayer(l.layer));
  }
  trialDrawnLayers = [];

  // Clear current polygon if exists
  if (trialState.currentPolygon && trialMapInstance) {
    trialMapInstance.removeLayer(trialState.currentPolygon.polygon);
    trialState.currentPolygon = null;
  }

  // Update list
  renderAreasList();
}

// Destroy trial map
function destroyTrialMap() {
  // Clean up preview map instances
  for (let i = 0; i < 20; i++) {
    if (window[`areaPreviewMap${i}`]) {
      window[`areaPreviewMap${i}`].remove();
      delete window[`areaPreviewMap${i}`];
    }
  }
  if (trialMapInstance) {
    trialMapInstance.remove();
    trialMapInstance = null;
  }
  trialDrawnLayers = [];
  trialCurrentDrawing = null;
}

// Save trial
async function saveTrial() {
  const name = document.getElementById("trialName").value.trim();
  const description = document.getElementById("trialDescription").value.trim();
  const plantingStart = document.getElementById("trialPlantingStart").value;
  const plantingEnd = document.getElementById("trialPlantingEnd").value;
  const plantingSeason = document.getElementById("trialPlantingSeason").value;
  const cropSelect = document.getElementById("trialCrops");
  const cropId = cropSelect.value;
  const cropName =
    cropSelect.options[cropSelect.selectedIndex].dataset.name || "";
  const pollination = document.getElementById("trialPollination").value;
  const trialType = document.getElementById("trialType").value;
  const expDesign = document.getElementById("trialExpDesign").value;
  const trialFactors = normalizeTrialFactorsCount(
    document.getElementById("trialFactors").value,
  );
  const factorDefinitions = getTrialTreatmentsFromForm();

  // Split-plot fields
  const factorArrangement = document.getElementById("trialFactorArrangement")?.value || "factorial";
  const splitPlotCodes = getSplitPlotCodes();
  const splitPlotLocationAsFactor = document.getElementById("splitPlotLocationAsFactor")?.checked || false;

  // Parent Test / Process Research fields
  const rowsPerPlot = parseFloat(
    document.getElementById("trialRowsPerPlot").value || "",
  );
  const plotLength = parseFloat(
    document.getElementById("trialPlotLength").value || "",
  );
  const plantSpacingWidth = parseFloat(
    document.getElementById("trialPlantSpacingWidth").value || "",
  );
  const plantSpacingHeight = parseFloat(
    document.getElementById("trialPlantSpacingHeight").value || "",
  );
  const widthM = Number.isFinite(plantSpacingWidth)
    ? plantSpacingWidth / 100
    : NaN;
  const heightM = Number.isFinite(plantSpacingHeight)
    ? plantSpacingHeight / 100
    : NaN;
  const plotArea =
    Number.isFinite(rowsPerPlot) &&
    Number.isFinite(plotLength) &&
    Number.isFinite(widthM) &&
    rowsPerPlot > 0 &&
    plotLength > 0 &&
    widthM > 0
      ? rowsPerPlot * plotLength * widthM
      : null;
  const expectedPlantsPerPlot =
    Number.isFinite(rowsPerPlot) &&
    Number.isFinite(plotLength) &&
    Number.isFinite(heightM) &&
    rowsPerPlot > 0 &&
    plotLength > 0 &&
    heightM > 0
      ? (plotLength / heightM) * rowsPerPlot
      : null;
  const populationPerHa =
    Number.isFinite(widthM) &&
    Number.isFinite(heightM) &&
    widthM > 0 &&
    heightM > 0
      ? 10000 / (widthM * heightM)
      : null;

  // Micropilot fields
  const mpPanel = parseFloat(document.getElementById("trialMpPanel")?.value || "");
  const ratioFemale = parseFloat(document.getElementById("trialRatioFemale")?.value || "");
  const ratioMale = parseFloat(document.getElementById("trialRatioMale")?.value || "");

  const mpPlotLength = parseFloat(document.getElementById("trialMpPlotLength")?.value || "");
  const mpSpacingWidth = parseFloat(document.getElementById("trialMpSpacingWidth")?.value || "");
  const mpSpacingHeight = parseFloat(document.getElementById("trialMpSpacingHeight")?.value || "");
  const mpWidthM = Number.isFinite(mpSpacingWidth) ? mpSpacingWidth / 100 : NaN;
  const mpHeightM = Number.isFinite(mpSpacingHeight) ? mpSpacingHeight / 100 : NaN;
  const mpTotalFemaleRows = Number.isFinite(ratioFemale) && Number.isFinite(mpPanel) ? ratioFemale * mpPanel : null;
  const mpTotalMaleRows = Number.isFinite(ratioMale) && Number.isFinite(mpPanel) ? (ratioMale * mpPanel) + ratioMale : null;
  const mpTotalRows = Number.isFinite(mpTotalFemaleRows) && Number.isFinite(mpTotalMaleRows)
    ? mpTotalFemaleRows + mpTotalMaleRows
    : null;
  const mpPlotArea = Number.isFinite(mpTotalRows) && Number.isFinite(mpWidthM) && Number.isFinite(mpPlotLength) && mpTotalRows > 0 && mpWidthM > 0 && mpPlotLength > 0
    ? mpTotalRows * mpWidthM * mpPlotLength
    : null;
  const mpExpectedFemale = Number.isFinite(mpPlotLength) && mpPlotLength > 0 && Number.isFinite(mpHeightM) && mpHeightM > 0 && Number.isFinite(mpTotalFemaleRows) && mpTotalFemaleRows > 0
    ? (mpPlotLength / mpHeightM) * mpTotalFemaleRows : null;
  const mpExpectedMale = Number.isFinite(mpPlotLength) && mpPlotLength > 0 && Number.isFinite(mpHeightM) && mpHeightM > 0 && Number.isFinite(mpTotalMaleRows) && mpTotalMaleRows > 0
    ? (mpPlotLength / mpHeightM) * mpTotalMaleRows : null;
  const mpTotalRatio = (Number.isFinite(ratioFemale) ? ratioFemale : 0) + (Number.isFinite(ratioMale) ? ratioMale : 0);
  const mpTotalPop = Number.isFinite(mpWidthM) && Number.isFinite(mpHeightM) && mpWidthM > 0 && mpHeightM > 0
    ? 10000 / (mpWidthM * mpHeightM)
    : null;
  const mpPopFemale = mpTotalPop && mpTotalRatio > 0 && Number.isFinite(ratioFemale) ? mpTotalPop * (ratioFemale / mpTotalRatio) : null;
  const mpPopMale = mpTotalPop && mpTotalRatio > 0 && Number.isFinite(ratioMale) ? mpTotalPop * (ratioMale / mpTotalRatio) : null;

  const locationEl = document.getElementById("trialLocation");
  const locationId = locationEl ? locationEl.value : (trialState.editingTrialId ? trialState.trials.find(t => t.id === trialState.editingTrialId)?.locationId : "");

  // Get selected parameters
  const selectedParams = getSelectedParameterIds();

  // Get agronomy monitoring
  const agronomyMonitoring = document.getElementById('trialAgronomyMonitoring')?.checked || false;
  const selectedAgronomy = agronomyMonitoring ? (trialState.selectedAgronomyOrder || []) : [];

  // Validation
  if (!name) {
    showToast("Please enter trial name", "error");
    return;
  }
  if (!plantingStart || !plantingEnd) {
    showToast("Please enter planting window dates", "error");
    return;
  }
  if (!cropId) {
    showToast("Please select crop", "error");
    return;
  }
  if (!pollination) {
    showToast("Please select type of pollination", "error");
    return;
  }
  if (!trialType) {
    showToast("Please select trial type", "error");
    return;
  }
  if (trialType === "Micropilot") {
    if (!Number.isFinite(mpPanel) || mpPanel <= 0) {
      showToast("Panel must be greater than 0", "error");
      return;
    }
    if (!Number.isFinite(ratioFemale) || ratioFemale <= 0 || !Number.isFinite(ratioMale) || ratioMale <= 0) {
      showToast("Female and Male ratio must be greater than 0", "error");
      return;
    }
    if (!Number.isFinite(mpPlotLength) || mpPlotLength <= 0) {
      showToast("Plot Length must be greater than 0", "error");
      return;
    }
    if (!Number.isFinite(mpSpacingWidth) || mpSpacingWidth <= 0 || !Number.isFinite(mpSpacingHeight) || mpSpacingHeight <= 0) {
      showToast("Plant Spacing Width and Height must be greater than 0", "error");
      return;
    }
  }
  if (!plantingSeason) {
    showToast("Please select planting season", "error");
    return;
  }
  if (!Number.isFinite(trialFactors) || trialFactors < 1) {
    showToast("No. of Factors must be at least 1", "error");
    return;
  }
  if (factorDefinitions.length !== trialFactors) {
    showToast(`Please fill ${trialFactors} factor(s)`, "error");
    return;
  }
  const invalidFactorIndex = factorDefinitions.findIndex((factor) => !factor.name || factor.treatments.length === 0);
  if (invalidFactorIndex >= 0) {
    showToast(`Please complete Factor ${invalidFactorIndex + 1} name and treatments`, "error");
    return;
  }
  if (selectedParams.length === 0) {
    showToast("Please select at least one observation parameter", "error");
    return;
  }

  if (trialState.currentAreas.length > 0 && trialState.dummyLayoutArea?.layout?.result) {
    applyDummyLayoutToFirstArea();
  }

  try {
    // Calculate line usage across all areas based on actual layout cells
    const lineUsage = {}; // {lineId: count}
    trialState.currentAreas.forEach((area) => {
      const layouts = Array.isArray(area?.layout?.result) ? area.layout.result : [];
      layouts.forEach((rep) => {
        (rep || []).forEach((row) => {
          (row || []).forEach((cell) => {
            if (!cell?.id) return;
            lineUsage[cell.id] = (lineUsage[cell.id] || 0) + 1;
          });
        });
      });
    });

    // Validate line availability (only for new trials, not edits)
    if (!trialState.editingTrialId) {
      const insufficientLines = [];
      for (const [lineId, neededQty] of Object.entries(lineUsage)) {
        const lineItem = inventoryState.items.entries.find(l => l.id === lineId);
        if (lineItem) {
          const availableQty = lineItem.quantity || 0;
          if (availableQty < neededQty) {
            insufficientLines.push({
              name: lineItem.name,
              available: availableQty,
              needed: neededQty
            });
          }
        }
      }

      if (insufficientLines.length > 0) {
        const errorMsg = insufficientLines.map(l => 
          `• ${l.name}: Available ${l.available}, Needed ${l.needed}`
        ).join('\n');
        
        showAlert(
          `Insufficient entry quantity:\n\n${errorMsg}\n\nPlease adjust entry quantities or remove entries from trial layout.`,
          "error",
          "Insufficient Entries"
        );
        return;
      }
    }

    // Get location coordinates
    let locationCoords = "";
    if (locationEl) {
      const selectedOption = locationEl.options[locationEl.selectedIndex];
      locationCoords = selectedOption?.dataset?.coords || "";
    } else if (trialState.editingTrialId) {
      const existing = trialState.trials.find(t => t.id === trialState.editingTrialId);
      locationCoords = existing?.locationCoordinates || "";
    }

    let trial;
    let oldLineUsage = {}; // Track old usage for edits

    if (trialState.editingTrialId) {
      // Update existing trial
      trial = trialState.trials.find((t) => t.id === trialState.editingTrialId);
      if (trial) {
        // Store old line usage to restore quantities
        oldLineUsage = trial.consumedLines || {};
        
        trial.name = name;
        trial.description = description;
        trial.plantingStart = plantingStart;
        trial.plantingEnd = plantingEnd;
        trial.plantingSeason = plantingSeason;
        trial.cropId = cropId;
        trial.cropName = cropName;
        trial.pollination = pollination;
        trial.trialType = trialType;
        trial.expDesign = expDesign;
        trial.trialFactors = trialFactors;
        trial.factorDefinitions = factorDefinitions;
        trial.treatments = factorDefinitions.map((factor) => factor.name);
        trial.factorArrangement = factorArrangement;
        trial.splitPlotCodes = splitPlotCodes;
        trial.splitPlotLocationAsFactor = splitPlotLocationAsFactor;
        trial.rowsPerPlot = Number.isFinite(rowsPerPlot) ? rowsPerPlot : null;
        trial.plotLength = Number.isFinite(plotLength) ? plotLength : null;
        trial.plantSpacingWidth = Number.isFinite(plantSpacingWidth)
          ? plantSpacingWidth
          : null;
        trial.plantSpacingHeight = Number.isFinite(plantSpacingHeight)
          ? plantSpacingHeight
          : null;
        trial.plotArea = plotArea;
        trial.expectedPlantsPerPlot = expectedPlantsPerPlot;
        trial.populationPerHa = populationPerHa;
        trial.mpPanel = Number.isFinite(mpPanel) ? mpPanel : null;
        trial.ratioFemale = Number.isFinite(ratioFemale) ? ratioFemale : null;
        trial.ratioMale = Number.isFinite(ratioMale) ? ratioMale : null;

        trial.mpTotalFemaleRows = Number.isFinite(mpTotalFemaleRows) ? mpTotalFemaleRows : null;
        trial.mpTotalMaleRows = Number.isFinite(mpTotalMaleRows) ? mpTotalMaleRows : null;
        trial.mpPlotLength = Number.isFinite(mpPlotLength) ? mpPlotLength : null;
        trial.mpSpacingWidth = Number.isFinite(mpSpacingWidth) ? mpSpacingWidth : null;
        trial.mpSpacingHeight = Number.isFinite(mpSpacingHeight) ? mpSpacingHeight : null;
        trial.mpPlotArea = mpPlotArea;
        trial.mpExpectedFemale = mpExpectedFemale;
        trial.mpExpectedMale = mpExpectedMale;
        trial.mpPopFemale = mpPopFemale;
        trial.mpPopMale = mpPopMale;
        trial.locationId = locationId;
        trial.locationCoordinates = locationCoords;
        trial.parameters = selectedParams;
        trial.agronomyMonitoring = agronomyMonitoring;
        trial.agronomyItems = selectedAgronomy;
        trial.areas = trialState.currentAreas;
        delete trial.plantingDate;
        trial.consumedLines = lineUsage;
        trial.updatedAt = new Date().toISOString();
        
        // Restore old quantities then consume new
        restoreLineQuantities(oldLineUsage);
        consumeLineQuantities(lineUsage);
      }
    } else {
      // Create new trial
      trial = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: name,
        description: description,
        plantingStart: plantingStart,
        plantingEnd: plantingEnd,
        plantingSeason: plantingSeason,
        cropId: cropId,
        cropName: cropName,
        pollination: pollination,
        trialType: trialType,
        expDesign: expDesign,
        trialFactors: trialFactors,
        factorDefinitions: factorDefinitions,
        treatments: factorDefinitions.map((factor) => factor.name),
        factorArrangement: factorArrangement,
        splitPlotCodes: splitPlotCodes,
        splitPlotLocationAsFactor: splitPlotLocationAsFactor,
        rowsPerPlot: Number.isFinite(rowsPerPlot) ? rowsPerPlot : null,
        plotLength: Number.isFinite(plotLength) ? plotLength : null,
        plantSpacingWidth: Number.isFinite(plantSpacingWidth)
          ? plantSpacingWidth
          : null,
        plantSpacingHeight: Number.isFinite(plantSpacingHeight)
          ? plantSpacingHeight
          : null,
        plotArea: plotArea,
        expectedPlantsPerPlot: expectedPlantsPerPlot,
        populationPerHa: populationPerHa,
        mpPanel: Number.isFinite(mpPanel) ? mpPanel : null,
        ratioFemale: Number.isFinite(ratioFemale) ? ratioFemale : null,
        ratioMale: Number.isFinite(ratioMale) ? ratioMale : null,

        mpTotalFemaleRows: Number.isFinite(mpTotalFemaleRows) ? mpTotalFemaleRows : null,
        mpTotalMaleRows: Number.isFinite(mpTotalMaleRows) ? mpTotalMaleRows : null,
        mpPlotLength: Number.isFinite(mpPlotLength) ? mpPlotLength : null,
        mpSpacingWidth: Number.isFinite(mpSpacingWidth) ? mpSpacingWidth : null,
        mpSpacingHeight: Number.isFinite(mpSpacingHeight) ? mpSpacingHeight : null,
        mpPlotArea: mpPlotArea,
        mpExpectedFemale: mpExpectedFemale,
        mpExpectedMale: mpExpectedMale,
        mpPopFemale: mpPopFemale,
        mpPopMale: mpPopMale,
        locationId: locationId,
        locationCoordinates: locationCoords,
        parameters: selectedParams,
        agronomyMonitoring: agronomyMonitoring,
        agronomyItems: selectedAgronomy,
        areas: trialState.currentAreas,
        consumedLines: lineUsage,
        archived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      // Newly created trial has no responses yet — mark as loaded
      trial._responsesLoaded = true;
      trial.responses = {};
      trial.agronomyResponses = {};

      trialState.trials.push(trial);
      
      // Consume line quantities
      consumeLineQuantities(lineUsage);
    }

    // Save inventory state (lines quantities changed)
    if (typeof saveLocalCache === "function") {
      saveLocalCache("inventory", { items: inventoryState.items });
    }
    
    // Sync inventory to Drive
    enqueueSync({
      label: "Save Entries",
      run: () => saveItemsToGoogleDrive("Entries", inventoryState.items.entries)
    });

    // Save to Google Drive
    enqueueSync({
      label: `Save Trial: ${trial.name}`,
      run: () => saveTrialToGoogleDrive(trial),
    });

    // Render trials
    renderTrials();

    if (typeof saveLocalCache === "function") {
      saveLocalCache("trials", { trials: trialState.trials });
    }

    // Close modal
    closeTrialModal();

    showSuccessMessage("Trial saved locally. Syncing in background.");
  } catch (error) {
    console.error("Error saving trial:", error);
    showErrorMessage(`Error saving trial: ${error.message}`);
  }
}

// Consume line quantities
function consumeLineQuantities(lineUsage) {
  for (const [lineId, qty] of Object.entries(lineUsage)) {
    const lineItem = inventoryState.items.entries.find(l => l.id === lineId);
    if (lineItem) {
      lineItem.quantity = Math.max(0, (lineItem.quantity || 0) - qty);
    }
  }
}

// Restore line quantities
function restoreLineQuantities(lineUsage) {
  for (const [lineId, qty] of Object.entries(lineUsage)) {
    const lineItem = inventoryState.items.entries.find(l => l.id === lineId);
    if (lineItem) {
      lineItem.quantity = (lineItem.quantity || 0) + qty;
    }
  }
}

// Show delete trial modal with restore option
function showDeleteTrialModal(trial, linesList, callback) {
  const modal = document.createElement('div');
  modal.className = 'confirm-modal active';
  modal.id = 'deleteTrialModal';
  
  modal.innerHTML = `
    <div class="confirm-modal-content">
      <div class="confirm-modal-header">
        <span class="material-symbols-rounded">delete</span>
        <h3>Delete Trial</h3>
      </div>
      <div class="confirm-modal-body">
        <p>Are you sure you want to delete trial "<strong>${escapeHtml(trial.name)}</strong>"?</p>
        <p>This action cannot be undone.</p>
        ${linesList !== 'No entries to restore' ? `
          <div class="delete-trial-restore-section">
            <label class="delete-trial-restore-label">
              <input type="checkbox" id="deleteTrialRestoreCheckbox" checked>
              <span>Restore entry quantities</span>
            </label>
            <div class="delete-trial-lines-list">
              ${linesList}
            </div>
            <small class="form-hint">If unchecked, entry quantities will remain consumed.</small>
          </div>
        ` : ''}
      </div>
      <div class="confirm-modal-footer">
        <button class="btn btn-secondary" id="deleteTrialCancelBtn">Cancel</button>
        <button class="btn btn-danger" id="deleteTrialConfirmBtn">Delete Trial</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  lockBodyScroll();
  
  const cancelBtn = modal.querySelector('#deleteTrialCancelBtn');
  const confirmBtn = modal.querySelector('#deleteTrialConfirmBtn');
  const restoreCheckbox = modal.querySelector('#deleteTrialRestoreCheckbox');
  
  const cleanup = () => {
    modal.remove();
    unlockBodyScroll();
  };
  
  cancelBtn.addEventListener('click', cleanup);
  
  confirmBtn.addEventListener('click', () => {
    const shouldRestore = restoreCheckbox ? restoreCheckbox.checked : false;
    cleanup();
    callback(shouldRestore);
  });
  
  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) cleanup();
  });
}

// Generic confirm modal
function showConfirmModal(title, message, onConfirm, confirmButtonText = "Confirm", confirmButtonClass = "btn-primary") {
  const modal = document.createElement('div');
  modal.className = 'confirm-modal active';
  modal.id = 'genericConfirmModal';
  
  modal.innerHTML = `
    <div class="confirm-modal-content">
      <div class="confirm-modal-header">
        <h3>${escapeHtml(title)}</h3>
      </div>
      <div class="confirm-modal-body">
        <p>${escapeHtml(message)}</p>
      </div>
      <div class="confirm-modal-footer">
        <button class="btn btn-secondary" id="confirmModalCancelBtn">Cancel</button>
        <button class="btn ${confirmButtonClass}" id="confirmModalConfirmBtn">${escapeHtml(confirmButtonText)}</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  lockBodyScroll();
  
  const cancelBtn = modal.querySelector('#confirmModalCancelBtn');
  const confirmBtn = modal.querySelector('#confirmModalConfirmBtn');
  
  const cleanup = () => {
    modal.remove();
    unlockBodyScroll();
  };
  
  cancelBtn.addEventListener('click', cleanup);
  
  confirmBtn.addEventListener('click', () => {
    cleanup();
    onConfirm();
  });
  
  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) cleanup();
  });
}

// Delete trial
function deleteTrial(trialId) {
  const trial = trialState.trials.find(t => t.id === trialId);
  if (!trial) return;
  
  const consumedLines = trial.consumedLines || {};
  const linesList = Object.keys(consumedLines).length > 0 
    ? Object.entries(consumedLines).map(([lineId, qty]) => {
        const lineItem = inventoryState.items.entries.find(l => l.id === lineId);
        return lineItem ? `• ${lineItem.name}: ${qty} units` : null;
      }).filter(Boolean).join('\n')
    : 'No entries to restore';
  
  // Show custom modal with restore option
  showDeleteTrialModal(trial, linesList, (restoreLines) => {
    try {
      const trialIndex = trialState.trials.findIndex((t) => t.id === trialId);
      const removedTrial = trialState.trials[trialIndex];

      if (trialIndex >= 0) {
        trialState.trials.splice(trialIndex, 1);
      }
      
      // Restore line quantities if user chose to
      if (restoreLines && removedTrial.consumedLines) {
        restoreLineQuantities(removedTrial.consumedLines);
        
        // Save inventory state
        if (typeof saveLocalCache === "function") {
          saveLocalCache("inventory", { items: inventoryState.items });
        }
        
        // Sync inventory to Drive
        enqueueSync({
          label: "Save Entries",
          run: () => saveItemsToGoogleDrive("Entries", inventoryState.items.entries)
        });
      }

      // Delete from Google Drive
      enqueueSync({
        label: `Delete Trial: ${removedTrial?.name || trialId}`,
        run: () => deleteTrialFromGoogleDrive(trialId),
      });

      // Render trials
      renderTrials();

      if (typeof saveLocalCache === "function") {
        saveLocalCache("trials", { trials: trialState.trials });
      }
      
      showAlert(restoreLines ? "Trial deleted and entry quantities restored" : "Trial deleted", "success");
    } catch (error) {
      console.error("Error deleting trial:", error);
      showAlert("Error deleting trial. Please try again.", "error");
    }
  });
}

// Archive trial
function archiveTrial(trialId) {
  showConfirmModal(
    "Archive Trial",
    "Are you sure you want to archive this trial? You can unarchive it later.",
    () => {
      try {
        const trial = trialState.trials.find(t => t.id === trialId);
        if (trial) {
          trial.archived = true;
          trial.archivedAt = new Date().toISOString();
          
          // Save to Google Drive
          enqueueSync({
            label: `Archive Trial: ${trial.name}`,
            run: () => saveTrialToGoogleDrive(trial),
          });

          // Render trials
          renderTrials();

          if (typeof saveLocalCache === "function") {
            saveLocalCache("trials", { trials: trialState.trials });
          }
          
          showAlert("Trial archived", "success");
        }
      } catch (error) {
        console.error("Error archiving trial:", error);
        showAlert("Error archiving trial. Please try again.", "error");
      }
    }
  );
}

// Unarchive trial
function unarchiveTrial(trialId) {
  try {
    const trial = trialState.trials.find(t => t.id === trialId);
    if (trial) {
      trial.archived = false;
      trial.archivedAt = undefined;
      
      // Save to Google Drive
      enqueueSync({
        label: `Unarchive Trial: ${trial.name}`,
        run: () => saveTrialToGoogleDrive(trial),
      });

      // Render trials
      renderTrials();

      if (typeof saveLocalCache === "function") {
        saveLocalCache("trials", { trials: trialState.trials });
      }
      
      showAlert("Trial unarchived", "success");
    }
  } catch (error) {
    console.error("Error unarchiving trial:", error);
    showAlert("Error unarchiving trial. Please try again.", "error");
  }
}

// Load trials from Google Drive
// ===========================
// GRANULAR DRIVE STORAGE FOR TRIALS
// Structure: Advanta/Trials/{trialId}/meta.json
//            Advanta/Trials/{trialId}/responses/{areaIndex}~{paramId}~{repIndex}~{lineId}.json
// Each area+param+rep+line = separate file → maximum conflict prevention across devices
// Legacy format: {areaIndex}_{paramId}.json (still supported on load)
// ===========================

let trialsFolderId = null;

async function getTrialsFolderId() {
  if (!trialsFolderId) {
    trialsFolderId = await getOrCreateFolder("Trials", driveState.advantaFolderId);
  }
  return trialsFolderId;
}

// ===========================
// PROGRESS SUMMARY (denormalized in meta.json)
// ===========================

/**
 * Build a denormalized progress summary from full trial data.
 * Stored in meta.json so progress can be displayed without loading responses.
 */
function buildProgressSummary(trial) {
  const obs = calculateTrialProgress(trial);
  const hasAgronomy = trial.agronomyMonitoring && trial.agronomyItems && trial.agronomyItems.length > 0;
  const agro = hasAgronomy ? calculateAgronomyProgress(trial) : { completed: 0, total: 0, percentage: 0 };
  const total = obs.total + agro.total;
  const completed = obs.completed + agro.completed;
  return {
    obs: { completed: obs.completed, total: obs.total, percentage: obs.percentage },
    agro: { completed: agro.completed, total: agro.total, percentage: agro.percentage },
    combined: { completed, total, percentage: total > 0 ? Math.round((completed / total) * 100) : 0 },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Get progress for a trial — uses denormalized summary if responses haven't been loaded,
 * otherwise computes live from responses.
 */
function getTrialProgress(trial) {
  // If responses have been loaded in memory, compute live
  if (trial._responsesLoaded) {
    return calculateCombinedTrialProgress(trial);
  }
  // Use denormalized summary from meta
  if (trial.progressSummary) {
    const s = trial.progressSummary;
    return {
      completed: s.combined.completed,
      total: s.combined.total,
      percentage: s.combined.percentage,
      obs: s.obs,
      agro: s.agro,
    };
  }
  // Fallback: no data yet
  return { completed: 0, total: 0, percentage: 0, obs: { completed: 0, total: 0, percentage: 0 }, agro: { completed: 0, total: 0, percentage: 0 } };
}

// ===========================
// LAZY-LOAD RESPONSES FROM DRIVE
// ===========================

/**
 * Load observation responses for a single trial from Drive.
 * Sets trial._responsesLoaded = true when all areas are loaded.
 * @param {string} trialId
 * @param {number|string} areaIndex - specific area to load
 * @param {function} [onProgress] - progress callback
 */
async function loadTrialAreaFromDrive(trialId, areaIndex, onProgress, options = {}) {
  const trial = trialState.trials.find(t => t.id === trialId);
  if (!trial) return;

  const areaIdx = String(areaIndex);
  const loadType = options.type || "all"; // "all" | "observation" | "agronomy"

  // Initialize tracking
  if (!Array.isArray(trial._loadedAreas)) trial._loadedAreas = [];
  if (!trial.responses) trial.responses = {};
  if (!trial.agronomyResponses) trial.agronomyResponses = {};

  // Track per-type loading
  if (!trial._loadedAreaTypes) trial._loadedAreaTypes = {};
  if (!trial._loadedAreaTypes[areaIdx]) trial._loadedAreaTypes[areaIdx] = {};
  if (!trial._loadSyncMarker) trial._loadSyncMarker = {};
  if (!trial._loadSyncMarker[areaIdx]) trial._loadSyncMarker[areaIdx] = {};

  // Already loaded this area+type (skip unless force-refreshing)
  if (!options.force) {
    if (loadType === "all" && trial._loadedAreas.includes(areaIdx)) return;
    if (loadType === "observation" && trial._loadedAreaTypes[areaIdx].observation) return;
    if (loadType === "agronomy" && trial._loadedAreaTypes[areaIdx].agronomy) return;
  }

  const totalAreas = (trial.areas || []).length;
  const areaNum = Number(areaIdx);
  const areaName = trial.areas?.[areaNum]?.name || `Area ${areaNum + 1}`;

  const report = (info) => {
    if (typeof onProgress === "function") onProgress(info);
  };

  report({ areaName, percentage: 0, step: "Connecting..." });

  try {
    const rootFolderId = await getTrialsFolderId();
    const trialFolder = await findFolder(trialId, rootFolderId);
    if (!trialFolder) {
      // No trial folder on Drive — mark area as loaded (empty)
      trial._loadedAreas.push(areaIdx);
      _checkAllAreasLoaded(trial);
      report({ areaName, percentage: 100, step: "Done" });
      return;
    }

    // --- LOAD RESPONSES ---
    const loadObs = loadType === "all" || loadType === "observation";
    const loadAgro = loadType === "all" || loadType === "agronomy";

    if (loadObs) {
    const responsesFolderObj = await findFolder("responses", trialFolder.id);
    if (!trial.responses[areaIdx]) trial.responses[areaIdx] = {};

    if (responsesFolderObj) {
      report({ areaName, percentage: 10, step: "Loading parameters..." });

      // Try consolidated file first: {areaIdx}~responses.json
      const consolidatedResp = await findFile(`${areaIdx}~responses.json`, responsesFolderObj.id);
      if (consolidatedResp) {
        const data = await getFileContent(consolidatedResp.id);
        trial.responses[areaIdx] = data || {};
        report({ areaName, percentage: 50, step: "Parameters loaded" });
      } else {
        // Fallback: load individual files for this area
        const respFiles = await gapi.client.drive.files.list({
          q: `'${responsesFolderObj.id}' in parents and mimeType='application/json' and name contains '${areaIdx}~' and trashed=false`,
          fields: "files(id, name)",
          pageSize: 1000,
        });
        const areaRespFiles = (respFiles.result.files || []).filter(f => {
          const base = f.name.replace(".json", "");
          const parts = base.split("~");
          return parts[0] === areaIdx && parts[1] !== "responses";
        });

        // Also check legacy format: {areaIdx}_{paramId}.json
        const legacyFiles = await gapi.client.drive.files.list({
          q: `'${responsesFolderObj.id}' in parents and mimeType='application/json' and name contains '${areaIdx}_' and trashed=false`,
          fields: "files(id, name)",
          pageSize: 1000,
        });
        const legacyRespFiles = (legacyFiles.result.files || []).filter(f => {
          const base = f.name.replace(".json", "");
          const sepIdx = base.indexOf("_");
          return sepIdx !== -1 && base.substring(0, sepIdx) === areaIdx;
        });

        const allRespFiles = [...areaRespFiles, ...legacyRespFiles];
        const total = allRespFiles.length;

        for (let i = 0; i < allRespFiles.length; i++) {
          const respFile = allRespFiles[i];
          try {
            const respData = await getFileContent(respFile.id);
            const fileName = respFile.name.replace(".json", "");

            if (fileName.includes("~")) {
              const parts = fileName.split("~");
              if (parts.length >= 4) {
                const paramId = parts[1];
                if (!trial.responses[areaIdx][paramId]) trial.responses[areaIdx][paramId] = {};
                Object.assign(trial.responses[areaIdx][paramId], respData);
              }
            } else {
              const sepIdx = fileName.indexOf("_");
              if (sepIdx !== -1) {
                const paramId = fileName.substring(sepIdx + 1);
                trial.responses[areaIdx][paramId] = respData;
              }
            }
          } catch (e) {
            console.error(`Error loading response ${respFile.name}:`, e);
          }
          const pct = 10 + Math.round(((i + 1) / Math.max(total, 1)) * 40);
          report({ areaName, percentage: pct, step: `Parameters ${i + 1}/${total}` });
        }

        // Migrate: save consolidated file for future fast loads
        if (Object.keys(trial.responses[areaIdx]).length > 0) {
          try {
            await saveAreaResponsesToDrive(trial, areaIdx);
          } catch (e) {
            console.warn("Migration save failed (responses):", e);
          }
        }
      }
    }
    trial._loadedAreaTypes[areaIdx].observation = true;
    trial._loadSyncMarker[areaIdx].observation = new Date().toISOString();
    } // end loadObs

    // --- LOAD AGRONOMY ---
    if (loadAgro) {
    const agronomyFolderObj = await findFolder("agronomy", trialFolder.id);
    if (!trial.agronomyResponses[areaIdx]) trial.agronomyResponses[areaIdx] = {};

    if (agronomyFolderObj) {
      report({ areaName, percentage: 55, step: "Loading locations..." });

      // Try consolidated file first: {areaIdx}~agronomy.json
      const consolidatedAgro = await findFile(`${areaIdx}~agronomy.json`, agronomyFolderObj.id);
      if (consolidatedAgro) {
        const data = await getFileContent(consolidatedAgro.id);
        trial.agronomyResponses[areaIdx] = data || {};
        report({ areaName, percentage: 90, step: "Locations loaded" });
      } else {
        // Fallback: load individual agronomy files
        const agroFiles = await gapi.client.drive.files.list({
          q: `'${agronomyFolderObj.id}' in parents and mimeType='application/json' and name contains '${areaIdx}~' and trashed=false`,
          fields: "files(id, name)",
          pageSize: 1000,
        });
        const areaAgroFiles = (agroFiles.result.files || []).filter(f => {
          const base = f.name.replace(".json", "");
          const parts = base.split("~");
          return parts[0] === areaIdx && parts[1] !== "agronomy";
        });

        const total = areaAgroFiles.length;
        for (let i = 0; i < areaAgroFiles.length; i++) {
          const agroFile = areaAgroFiles[i];
          try {
            const agroData = await getFileContent(agroFile.id);
            const fileName = agroFile.name.replace(".json", "");
            const parts = fileName.split("~");
            if (parts.length >= 2) {
              const itemId = parts[1];
              trial.agronomyResponses[areaIdx][itemId] = agroData;
            }
          } catch (e) {
            console.error(`Error loading agronomy ${agroFile.name}:`, e);
          }
          const pct = 55 + Math.round(((i + 1) / Math.max(total, 1)) * 35);
          report({ areaName, percentage: pct, step: `Locations ${i + 1}/${total}` });
        }

        // Migrate: save consolidated file
        if (Object.keys(trial.agronomyResponses[areaIdx]).length > 0) {
          try {
            await saveAreaAgronomyToDrive(trial, areaIdx);
          } catch (e) {
            console.warn("Migration save failed (agronomy):", e);
          }
        }
      }
    }
    trial._loadedAreaTypes[areaIdx].agronomy = true;
    trial._loadSyncMarker[areaIdx].agronomy = new Date().toISOString();
    } // end loadAgro

    // Mark area as loaded if both types done
    const types = trial._loadedAreaTypes[areaIdx] || {};
    if (types.observation && types.agronomy && !trial._loadedAreas.includes(areaIdx)) {
      trial._loadedAreas.push(areaIdx);
      _checkAllAreasLoaded(trial);
    }

    // Save cache
    if (typeof saveLocalCache === "function") {
      saveLocalCache("trials", { trials: trialState.trials });
    }

    report({ areaName, percentage: 100, step: "Done" });
  } catch (error) {
    console.error(`Error loading area ${areaIdx} for trial ${trialId}:`, error);
    // Save whatever partial data we got
    if (typeof saveLocalCache === "function") {
      saveLocalCache("trials", { trials: trialState.trials });
    }
    throw error;
  }
}

/** Check if all areas are loaded and set _responsesLoaded flag */
function _checkAllAreasLoaded(trial) {
  const totalAreas = (trial.areas || []).length;
  if (totalAreas > 0 && trial._loadedAreas.length >= totalAreas) {
    trial._responsesLoaded = true;
  }
}

/**
 * Load ALL areas for a trial (convenience wrapper).
 * @param {string} trialId
 * @param {function} [onProgress] - progress callback
 */
async function loadTrialResponsesFromDrive(trialId, onProgress) {
  const trial = trialState.trials.find(t => t.id === trialId);
  if (!trial) return;
  if (trial._responsesLoaded) return;

  if (!Array.isArray(trial._loadedAreas)) trial._loadedAreas = [];

  const totalAreas = (trial.areas || []).length;
  const areasToLoad = [];
  for (let i = 0; i < totalAreas; i++) {
    if (!trial._loadedAreas.includes(String(i))) areasToLoad.push(i);
  }

  for (let i = 0; i < areasToLoad.length; i++) {
    const areaIdx = areasToLoad[i];
    const areaName = trial.areas?.[areaIdx]?.name || `Area ${areaIdx + 1}`;
    if (typeof onProgress === "function") {
      onProgress({
        areasLoaded: trial._loadedAreas.length,
        areasTotal: totalAreas,
        percentage: Math.round((trial._loadedAreas.length / totalAreas) * 100),
        areaName,
        filesLoaded: 0,
        filesTotal: 0,
      });
    }
    await loadTrialAreaFromDrive(trialId, areaIdx, (info) => {
      if (typeof onProgress === "function") {
        onProgress({
          areasLoaded: trial._loadedAreas.length,
          areasTotal: totalAreas,
          percentage: Math.round(((trial._loadedAreas.length + info.percentage / 100) / totalAreas) * 100),
          areaName: info.areaName,
          filesLoaded: 0,
          filesTotal: 0,
          step: info.step,
        });
      }
    });
  }
}

/**
 * Prompt user to update data before running observation/agronomy.
 * Returns true if user chooses to continue without updating, false to abort.
 */
function _promptTrialUpdateBeforeRun(trialId, mode) {
  const trial = trialState.trials.find(t => t.id === trialId);
  const trialName = trial ? escapeHtml(trial.name) : trialId;
  const modeLabel = mode === "agronomy" ? "Agronomy Monitoring" : "Observation";

  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "confirm-modal active";
    modal.innerHTML = `
      <div class="confirm-modal-content">
        <div class="confirm-modal-header">
          <h3>Update Available</h3>
        </div>
        <div class="confirm-modal-body">
          <p>Newer data is available on Drive for <b>${trialName}</b>. Please update your data first before running ${modeLabel} to ensure you're working with the latest responses.</p>
        </div>
        <div class="confirm-modal-footer">
          <button class="btn btn-secondary" id="_promptUpdateCancelBtn">Cancel</button>
          <button class="btn btn-primary" id="_promptUpdateNowBtn"><span class="material-symbols-rounded" style="font-size:16px">system_update_alt</span> Open Load Data</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const cleanup = () => modal.remove();

    modal.querySelector("#_promptUpdateCancelBtn").addEventListener("click", () => {
      cleanup();
      resolve(false);
    });

    modal.querySelector("#_promptUpdateNowBtn").addEventListener("click", async () => {
      cleanup();
      if (typeof openLoadDataPanel === "function") openLoadDataPanel("trial");
      await new Promise(r => setTimeout(r, 100));
      const group = document.querySelector(`.load-data-trial-group[data-trial-id="${trialId}"]`);
      if (group && !group.classList.contains("expanded")) {
        group.classList.add("expanded");
      }
      resolve(false);
    });

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        cleanup();
        resolve(false);
      }
    });
  });
}

/**
 * Ensure trial responses are loaded before running observation/agronomy/report.
 * If not loaded, shows a confirmation popup. User can:
 *   - "Load Now": loads data inline and resolves true
 *   - "Open Load Panel": opens the Load Data panel and resolves false (caller should abort)
 *   - "Cancel": resolves false
 * Returns true if responses are loaded/ready, false if user declined.
 */
async function ensureTrialResponsesLoaded(trialId) {
  const trial = trialState.trials.find(t => t.id === trialId);
  if (!trial) return false;
  if (trial._responsesLoaded) return true;

  const loadedCount = Array.isArray(trial._loadedAreas) ? trial._loadedAreas.length : 0;
  const totalAreas = (trial.areas || []).length;

  // Allow partial-load workflows: if at least one area is loaded, trial can still run
  // but navigation will be limited to loaded areas only.
  if (loadedCount > 0) {
    return true;
  }

  const partialMsg = loadedCount > 0
    ? `<p style="margin-top:0.5rem;font-size:0.85rem;color:var(--text-secondary)">${loadedCount} of ${totalAreas} areas already loaded.</p>`
    : "";

  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "confirm-modal active";
    modal.id = "loadDataConfirmModal";

    modal.innerHTML = `
      <div class="confirm-modal-content">
        <div class="confirm-modal-header">
          <h3>Trial Data Not Loaded</h3>
        </div>
        <div class="confirm-modal-body">
          <p>Response data for <b>${escapeHtml(trial.name)}</b> belum dimuat. Muat minimal satu area dulu untuk mulai menjalankan trial.</p>
          ${partialMsg}
        </div>
        <div class="confirm-modal-footer">
          <button class="btn btn-secondary" id="loadConfirmCancelBtn">Cancel</button>
          <button class="btn btn-primary" id="loadConfirmNowBtn"><span class="material-symbols-rounded" style="font-size:16px">cloud_download</span> Open Load Panel</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const cleanup = () => modal.remove();

    modal.querySelector("#loadConfirmCancelBtn").addEventListener("click", () => {
      cleanup();
      resolve(false);
    });

    modal.querySelector("#loadConfirmNowBtn").addEventListener("click", async () => {
      cleanup();
      // Open load panel so user can select which areas to load
      if (typeof openLoadDataPanel === "function") openLoadDataPanel("trial");
      // Auto-expand the trial in the list
      await new Promise(r => setTimeout(r, 100));
      const group = document.querySelector(`.load-data-trial-group[data-trial-id="${trialId}"]`);
      if (group && !group.classList.contains("expanded")) {
        group.classList.add("expanded");
      }
      resolve(false);
    });

    // Close on backdrop click
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        cleanup();
        resolve(false);
      }
    });
  });
}

// ===========================
// ORPHAN CLEANUP
// ===========================

/**
 * Remove orphan trial folders on Drive — folders whose trialId
 * no longer matches any trial in trialState.trials.
 * Also cleans up orphan response files within valid trial folders.
 */
async function cleanupOrphanTrialFolders() {
  try {
    const rootFolderId = await getTrialsFolderId();
    const foldersResp = await gapi.client.drive.files.list({
      q: `'${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id, name)",
      pageSize: 1000,
    });

    const driveTrialFolders = foldersResp.result.files || [];
    const knownTrialIds = new Set(trialState.trials.map(t => t.id));
    let orphanCount = 0;

    for (const folder of driveTrialFolders) {
      if (!knownTrialIds.has(folder.name)) {
        // This folder belongs to a deleted trial — remove it
        try {
          await gapi.client.drive.files.delete({ fileId: folder.id });
          orphanCount++;
          console.log(`[Cleanup] Deleted orphan trial folder: ${folder.name}`);
        } catch (e) {
          console.error(`[Cleanup] Failed to delete orphan folder ${folder.name}:`, e);
        }
      }
    }

    if (orphanCount > 0) {
      console.log(`[Cleanup] Removed ${orphanCount} orphan trial folder(s) from Drive.`);
    }

    // Now clean up orphan response files within valid trials
    for (const trial of trialState.trials) {
      await cleanupOrphanResponseFiles(trial);
    }
  } catch (error) {
    console.error("[Cleanup] Error during orphan cleanup:", error);
  }
}

/**
 * For a given trial, remove response files on Drive that reference
 * parameters or lines no longer in the trial.
 */
async function cleanupOrphanResponseFiles(trial) {
  try {
    const rootFolderId = await getTrialsFolderId();
    const trialFolder = await findFolder(trial.id, rootFolderId);
    if (!trialFolder) return;

    // Build set of valid parameter IDs
    const validParamIds = new Set(trial.parameters || []);

    // Build set of valid line IDs from layout
    const validLineIds = new Set();
    (trial.areas || []).forEach(area => {
      const layouts = Array.isArray(area?.layout?.result) ? area.layout.result : [];
      layouts.forEach(rep => {
        (rep || []).forEach(row => {
          (row || []).forEach(cell => {
            if (cell?.id) validLineIds.add(String(cell.id));
          });
        });
      });
    });

    // Check responses/ subfolder
    const responsesFolderObj = await findFolder("responses", trialFolder.id);
    if (responsesFolderObj) {
      const respFiles = await gapi.client.drive.files.list({
        q: `'${responsesFolderObj.id}' in parents and mimeType='application/json' and trashed=false`,
        fields: "files(id, name)",
        pageSize: 1000,
      });

      for (const respFile of (respFiles.result.files || [])) {
        const fileName = respFile.name.replace(".json", "");
        let shouldDelete = false;

        if (fileName.includes("~")) {
          // Format: {areaIndex}~{paramId}~{repIndex}~{lineId}
          const parts = fileName.split("~");
          if (parts.length >= 4) {
            const paramId = parts[1];
            const lineId = parts[3];
            if (!validParamIds.has(paramId) || !validLineIds.has(String(lineId))) {
              shouldDelete = true;
            }
          }
        } else {
          // Legacy: {areaIndex}_{paramId}
          const sepIdx = fileName.indexOf("_");
          if (sepIdx > -1) {
            const paramId = fileName.substring(sepIdx + 1);
            if (!validParamIds.has(paramId)) {
              shouldDelete = true;
            }
          }
        }

        if (shouldDelete) {
          try {
            await gapi.client.drive.files.delete({ fileId: respFile.id });
            console.log(`[Cleanup] Deleted orphan response file: ${respFile.name} in trial ${trial.id}`);
          } catch (e) {
            console.error(`[Cleanup] Failed to delete orphan response ${respFile.name}:`, e);
          }
        }
      }
    }

    // Check agronomy/ subfolder
    const validAgroIds = new Set((trial.agronomyItems || []).map(id => String(id)));
    const agronomyFolderObj = await findFolder("agronomy", trialFolder.id);
    if (agronomyFolderObj && validAgroIds.size > 0) {
      const agroFiles = await gapi.client.drive.files.list({
        q: `'${agronomyFolderObj.id}' in parents and mimeType='application/json' and trashed=false`,
        fields: "files(id, name)",
        pageSize: 1000,
      });

      for (const agroFile of (agroFiles.result.files || [])) {
        const fileName = agroFile.name.replace(".json", "");
        const parts = fileName.split("~");
        if (parts.length >= 2) {
          const itemId = parts[1];
          if (!validAgroIds.has(String(itemId))) {
            try {
              await gapi.client.drive.files.delete({ fileId: agroFile.id });
              console.log(`[Cleanup] Deleted orphan agronomy file: ${agroFile.name} in trial ${trial.id}`);
            } catch (e) {
              console.error(`[Cleanup] Failed to delete orphan agronomy ${agroFile.name}:`, e);
            }
          }
        }
      }
    } else if (agronomyFolderObj && validAgroIds.size === 0 && !trial.agronomyMonitoring) {
      // Trial has no agronomy monitoring but agronomy folder exists — clean entire folder
      try {
        await gapi.client.drive.files.delete({ fileId: agronomyFolderObj.id });
        console.log(`[Cleanup] Deleted entire orphan agronomy folder for trial ${trial.id}`);
      } catch (e) {
        console.error(`[Cleanup] Failed to delete agronomy folder for ${trial.id}:`, e);
      }
    }
  } catch (error) {
    console.error(`[Cleanup] Error cleaning response files for trial ${trial.id}:`, error);
  }
}

// ===========================
// LOAD TRIALS (META-ONLY — LAZY)
// ===========================

async function loadTrialsFromGoogleDrive() {
  try {
    const rootFolderId = await getTrialsFolderId();

    // List all trial folders
    const foldersResp = await gapi.client.drive.files.list({
      q: `'${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id, name)",
      pageSize: 1000,
    });

    const trialFolders = foldersResp.result.files || [];
    const trials = [];

    for (const folder of trialFolders) {
      try {
        // Load meta.json ONLY (responses loaded lazily when needed)
        const metaFile = await findFile("meta.json", folder.id);
        if (!metaFile) continue;

        const trial = await getFileContent(metaFile.id);
        trial.id = trial.id || folder.name;

        // Responses NOT loaded here — will be loaded on demand
        // Mark as not-yet-loaded
        trial._responsesLoaded = false;

        trials.push(trial);
      } catch (e) {
        console.error(`Error loading trial folder ${folder.name}:`, e);
      }
    }

    return trials;
  } catch (error) {
    console.error("Error loading trials:", error);
    return [];
  }
}

// Save trial metadata to Google Drive (without responses)
async function saveTrialToGoogleDrive(trial) {
  const rootFolderId = await getTrialsFolderId();
  const trialFolderId = await getOrCreateFolder(trial.id, rootFolderId);

  // Save meta.json (trial definition WITHOUT responses to keep it small)
  const meta = { ...trial };
  delete meta.responses; // Responses saved separately
  delete meta.agronomyResponses; // Agronomy responses saved separately
  delete meta._responsesLoaded; // Internal tracking flag — don't persist

  // Embed denormalized progress summary so the dashboard can show
  // progress without loading all response files
  if (trial._responsesLoaded || trial.responses || trial.agronomyResponses) {
    meta.progressSummary = buildProgressSummary(trial);
  }

  await uploadJsonFile("meta.json", trialFolderId, meta);
}

// Save a single line's responses to Drive (targeted — per area+param+rep+line file)
// LEGACY: kept for backward compatibility but auto-save now uses consolidated format
async function saveTrialLineToDrive(trial, areaIndex, paramId, repIndex, lineId) {
  // Redirect to consolidated area save
  return saveAreaResponsesToDrive(trial, areaIndex);
}

// Save ALL responses for a single area as one consolidated file: {areaIndex}~responses.json
async function saveAreaResponsesToDrive(trial, areaIndex) {
  const areaResponses = trial.responses?.[areaIndex];
  if (!areaResponses || Object.keys(areaResponses).length === 0) return;

  const rootFolderId = await getTrialsFolderId();
  const trialFolderId = await getOrCreateFolder(trial.id, rootFolderId);
  const responsesFolderId = await getOrCreateFolder("responses", trialFolderId);

  const fileName = `${areaIndex}~responses.json`;
  await uploadJsonFile(fileName, responsesFolderId, areaResponses);
}

// Save all responses for a trial to Drive (full backup — one consolidated file per area)
async function saveTrialResponsesToDrive(trial) {
  const responses = trial.responses || {};
  for (const areaIndex of Object.keys(responses)) {
    await saveAreaResponsesToDrive(trial, areaIndex);
  }
}

// Helper: upload/update a JSON file in a specific folder
async function uploadJsonFile(fileName, parentFolderId, data) {
  const content = JSON.stringify(data, null, 2);
  const existingFile = await findFile(fileName, parentFolderId);

  const metadata = {
    name: fileName,
    mimeType: "application/json",
  };
  if (!existingFile) {
    metadata.parents = [parentFolderId];
  }

  const boundary = "-------314159265358979323846";
  const delimiter = "\r\n--" + boundary + "\r\n";
  const closeDelimiter = "\r\n--" + boundary + "--";

  const body =
    delimiter +
    "Content-Type: application/json\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    "Content-Type: application/json\r\n\r\n" +
    content +
    closeDelimiter;

  const request = gapi.client.request({
    path: existingFile
      ? `/upload/drive/v3/files/${existingFile.id}`
      : "/upload/drive/v3/files",
    method: existingFile ? "PATCH" : "POST",
    params: { uploadType: "multipart" },
    headers: {
      "Content-Type": 'multipart/related; boundary="' + boundary + '"',
    },
    body: body,
  });

  await request;
}

// Upload a binary blob (e.g. WebP photo) to Drive, returns file id
async function uploadBinaryFileToDrive(fileName, parentFolderId, blob, mimeType) {
  const existingFile = await findFile(fileName, parentFolderId);
  const token = getAccessToken();
  if (!token) throw new Error("No access token");

  const metadata = { name: fileName, mimeType };
  if (!existingFile) metadata.parents = [parentFolderId];

  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", blob);

  const url = existingFile
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";

  const resp = await fetch(url, {
    method: existingFile ? "PATCH" : "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!resp.ok) throw new Error(`Upload failed: ${resp.status}`);
  const result = await resp.json();
  return result.id;
}

// Delete a file from Drive by file ID
async function deleteDriveFileById(fileId) {
  const token = getAccessToken();
  if (!token) throw new Error("No access token");
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok && resp.status !== 204) throw new Error(`Delete failed: ${resp.status}`);
}

// Convert a base64 data URL to a compressed WebP blob (max 1000x1000, quality 0.7)
function compressPhotoToWebP(dataUrl, maxSize = 1000, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > maxSize || h > maxSize) {
        const scale = maxSize / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => blob ? resolve({ blob, width: w, height: h }) : reject(new Error("Canvas toBlob failed")),
        "image/webp",
        quality,
      );
    };
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = dataUrl;
  });
}

// Photo display helpers: handle both base64 strings and external references
const _photoBlobCache = {};

function getPhotoSrc(photo) {
  if (typeof photo === "string") return photo;
  if (photo && photo.fileId) return _photoBlobCache[photo.fileId] || "";
  return "";
}

async function loadExternalPhotos(containerSelector) {
  const container = typeof containerSelector === "string"
    ? document.querySelector(containerSelector)
    : containerSelector;
  if (!container) return;

  const imgs = container.querySelectorAll("img[data-photo-fileid]");
  const token = getAccessToken();
  if (!token || imgs.length === 0) return;

  for (const img of imgs) {
    const fileId = img.dataset.photoFileid;
    if (!fileId) continue;
    if (_photoBlobCache[fileId]) {
      img.src = _photoBlobCache[fileId];
      continue;
    }
    try {
      const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) continue;
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      _photoBlobCache[fileId] = url;
      img.src = url;
    } catch (e) {
      console.warn("Failed to load external photo:", e);
    }
  }
}

function renderPhotoThumb(photo, idx, removeFunc, previewFunc) {
  const isRef = typeof photo === "object" && photo && photo.fileId;
  const src = isRef ? (_photoBlobCache[photo.fileId] || "") : photo;
  const fileIdAttr = isRef ? `data-photo-fileid="${photo.fileId}"` : "";
  const placeholderClass = isRef && !src ? "photo-loading" : "";
  return `
    <div class="run-photo-preview ${placeholderClass}" data-index="${idx}" onclick="${previewFunc}(${idx})">
      <img src="${src || ''}" alt="Photo ${idx + 1}" ${fileIdAttr}>
      ${isRef && !src ? '<span class="material-symbols-rounded photo-placeholder-icon spin-slow">progress_activity</span>' : ''}
      <button class="run-photo-remove" onclick="${removeFunc}(${idx}); event.stopPropagation();">
        <span class="material-symbols-rounded">close</span>
      </button>
    </div>
  `;
}

// Delete trial folder and all contents from Google Drive
async function deleteTrialFromGoogleDrive(trialId) {
  const rootFolderId = await getTrialsFolderId();
  const trialFolder = await findFolder(trialId, rootFolderId);

  if (trialFolder) {
    // Deleting the folder deletes all contents (meta.json, responses/, etc.)
    await gapi.client.drive.files.delete({ fileId: trialFolder.id });
  }
}

// LAYOUTING SECTION FUNCTIONS

// Initialize and render layouting section
function initializeLayoutingSection() {
  const container = document.getElementById("layoutingAreasContainer");
  if (!container) return;

  container.innerHTML = "";

  // Check if we have areas from location section
  if (!trialState.currentAreas || trialState.currentAreas.length === 0) {
    const warningDiv = document.createElement("div");
    warningDiv.className = "td-no-items";
    warningDiv.innerHTML = `
            <p>The Field section is not filled yet. Layouting can still be done using the dummy map.</p>
            <p style="font-size:0.8rem;color:var(--text-tertiary);margin-top:6px;">The dummy layout will be automatically applied to Area 1 after you add an area in the Field.</p>
        `;
    container.appendChild(warningDiv);

    const dummyAreaDiv = createAreaLayoutingForm(getDummyLayoutArea(), 0, {
      isDummy: true,
    });
    container.appendChild(dummyAreaDiv);

    if (trialState.dummyLayoutArea?.layout?.result && trialState.dummyLayoutArea?.layout?.layoutType !== "custom") {
      renderLayoutResult(0, trialState.dummyLayoutArea.layout.result, {
        isDummy: true,
        splitPlotHeaders: trialState.dummyLayoutArea?.layout?.splitPlotHeaders || null,
      });
    }
    return;
  }

  applyDummyLayoutToFirstArea();

  // Create layouting form for each area
  trialState.currentAreas.forEach((area, areaIndex) => {
    const areaDiv = createAreaLayoutingForm(area, areaIndex, {
      isDummy: false,
    });
    container.appendChild(areaDiv);
    if (area.layout && area.layout.result && area.layout.layoutType !== "custom") {
      renderLayoutResult(areaIndex, area.layout.result, {
        isDummy: false,
        splitPlotHeaders: area.layout?.splitPlotHeaders || null,
      });
    }
  });
}

// Create layouting form for a single area
function createAreaLayoutingForm(area, areaIndex, options = {}) {
  const isDummy = options.isDummy === true;
  const cropSelect = document.getElementById("trialCrops");
  const selectedCropId = cropSelect.value;
  const selectedCropName =
    cropSelect.options[cropSelect.selectedIndex].dataset.name || "";

  // Check if multi-factor mode is active (factorial or split plot)
  const multiFactorActive = isMultiFactorMode();
  const splitPlotActive = isSplitPlotMode();
  const factorialActive = isFactorialMode();
  const multiFactorCombinations = multiFactorActive ? buildSplitPlotCombinations() : [];

  // Check if any factor is marked as "Entries" — if so, entries come from the factor
  const entriesFactorLineIds = getEntriesFactorLineIds();
  const hasEntriesFactor = !multiFactorActive && entriesFactorLineIds !== null;

  // In multi-factor mode, "matchingLines" are the combinations (as virtual entries)
  // When entries factor is active, filter to only entries selected in the factor
  const matchingLines = multiFactorActive
    ? multiFactorCombinations.map((combo) => ({ id: combo.id, name: combo.name, quantity: undefined }))
    : hasEntriesFactor
      ? inventoryState.items.entries.filter((line) => entriesFactorLineIds.includes(line.id))
      : inventoryState.items.entries.filter((line) => {
          return line.cropId === selectedCropId || line.cropType === selectedCropName;
        });

  const areaDiv = document.createElement("div");
  areaDiv.className = "layouting-area-card";
  areaDiv.dataset.areaIndex = areaIndex;
  areaDiv.dataset.isDummy = isDummy ? "true" : "false";

  const initialLayoutType = area?.layout?.layoutType === "custom" ? "custom" : "template";

  let linesHTML = matchingLines
    .map((line) => {
      const qty = line.quantity !== undefined ? line.quantity : "∞";
      const qtyClass =
        line.quantity !== undefined && line.quantity <= 0
          ? "line-qty-empty"
          : "";
      return `
        <div class="picklist-item ${qtyClass}" data-id="${line.id}" data-name="${escapeHtml(line.name)}" data-disabled="${line.quantity !== undefined && line.quantity <= 0}">
          <span>${escapeHtml(line.name)}</span>
          <span class="line-quantity-badge ${qtyClass}">${qty}</span>
        </div>
      `;
    })
    .join("");

  if (matchingLines.length === 0) {
    linesHTML = '<p class="layouting-empty">No entries available for this crop.</p>';
  }

  // Build the entries-from-factor notice + "copy from" dropdown
  const otherAreas = hasEntriesFactor && !isDummy && areaIndex > 0
    ? trialState.currentAreas
        .map((a, i) => i !== areaIndex ? `<option value="${i}">${escapeHtml(a.name || "Area " + (i + 1))}</option>` : "")
        .filter(Boolean)
        .join("")
    : "";

  const copyEntriesHTML = otherAreas ? `
    <div class="layouting-copy-entries" style="display:flex;align-items:center;gap:8px;margin-bottom:0.5rem;">
      <label style="white-space:nowrap;font-size:0.85rem;color:var(--text-secondary);">Entries same as</label>
      <select class="copy-entries-from-select" data-area-index="${areaIndex}" style="flex:1;padding:6px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-primary);font-size:0.85rem;">
        <option value="">— Select area —</option>
        ${otherAreas}
      </select>
      <button type="button" class="btn btn-sm copy-entries-btn" data-area-index="${areaIndex}" style="white-space:nowrap;">
        <span class="material-symbols-rounded" style="font-size:16px;">content_copy</span>
        <span>Copy</span>
      </button>
    </div>
  ` : "";

  const entriesFactorNoticeHTML = hasEntriesFactor ? `
    <div class="layouting-entries-from-factor">
      <div class="form-hint-block" style="display:flex;align-items:center;gap:6px;padding:0.75rem;background:var(--bg-secondary);border-radius:8px;margin-bottom:0.5rem;">
        <span class="material-symbols-rounded" style="font-size:18px;color:var(--primary);">info</span>
        <span>Entries are filtered from factor selection (<b>${entriesFactorLineIds.length}</b> available). Select entries for this area below.</span>
      </div>
      ${copyEntriesHTML}
    </div>
  ` : "";

  // Build the multi-factor notice
  const arrangementLabel = splitPlotActive ? "Split Plot" : "Factorial";
  const multiFactorNoticeHTML = multiFactorActive ? `
    <div class="layouting-entries-from-factor">
      <div class="form-hint-block" style="display:flex;align-items:center;gap:6px;padding:0.75rem;background:var(--bg-secondary);border-radius:8px;margin-bottom:0.5rem;">
        <span class="material-symbols-rounded" style="font-size:18px;color:var(--primary);">science</span>
        <span>${arrangementLabel} mode — <b>${multiFactorCombinations.length}</b> treatment combinations generated from factor codes.</span>
      </div>
    </div>
  ` : "";
  
  const hideEntries = multiFactorActive;

  areaDiv.innerHTML = `
        <div class="layouting-area-header">
            <div>
            <h5 class="layouting-area-title">${escapeHtml(area.name || "Area " + (areaIndex + 1))}${isDummy ? " (Dummy Map)" : ""}</h5>
                <div class="layouting-area-meta">
              ${isDummy
                ? "Dummy map mode — this layout result is only a simulation until the Field section is filled."
                : `Size: ${area.areaSize ? area.areaSize.hectares + " ha, " + area.areaSize.squareMeters.toLocaleString() + " m²" : "N/A"}`}
                </div>
            </div>
        </div>
        
        <div class="layouting-grid">
          ${entriesFactorNoticeHTML}
          ${multiFactorNoticeHTML}
          <div class="layouting-lines" ${hideEntries ? 'style="display:none;"' : ""}>
            <label class="layouting-label">
              Select Entries
              <span class="layouting-hint"> (matching ${escapeHtml(selectedCropName)})</span>
            </label>
            <div class="dual-picklist">
              <div class="picklist-column">
                <div class="picklist-header form-hint">Available Entries</div>
                <div class="picklist-search">
                  <span class="material-symbols-rounded">search</span>
                  <input 
                    type="text" 
                    class="area-line-search" 
                    placeholder="Search entries..." 
                    data-area-index="${areaIndex}"
                  >
                </div>
                <div class="area-lines-list layouting-lines-list picklist-list" data-area-index="${areaIndex}" data-list="available">
                  ${linesHTML}
                </div>
                <small class="form-hint-block picklist-checked-indicator">
                  <span class="layouting-available-checked-count" data-area-index="${areaIndex}">0</span> checked
                </small>
              </div>
              <div class="picklist-controls">
                <button type="button" class="picklist-control-btn" data-action="select-all" data-area-index="${areaIndex}" title="Select all">
                  <span class="material-symbols-rounded">select_all</span>
                </button>
                <button type="button" class="picklist-control-btn" data-action="deselect-all" data-area-index="${areaIndex}" title="Deselect all">
                  <span class="material-symbols-rounded">check_box_outline_blank</span>
                </button>
                <button type="button" class="picklist-control-btn" data-action="add" data-area-index="${areaIndex}" title="Add">
                  <span class="material-symbols-rounded">arrow_forward</span>
                </button>
                <button type="button" class="picklist-control-btn" data-action="up" data-area-index="${areaIndex}" title="Move up">
                  <span class="material-symbols-rounded">arrow_upward</span>
                </button>
                <button type="button" class="picklist-control-btn" data-action="down" data-area-index="${areaIndex}" title="Move down">
                  <span class="material-symbols-rounded">arrow_downward</span>
                </button>
                <button type="button" class="picklist-control-btn danger" data-action="remove" data-area-index="${areaIndex}" title="Remove">
                  <span class="material-symbols-rounded">delete</span>
                </button>
              </div>
              <div class="picklist-column">
                <div class="picklist-header form-hint">Selected Entries</div>
                <div class="area-selected-lines picklist-list" data-area-index="${areaIndex}" data-list="selected">
                  <!-- Selected lines populated here -->
                </div>
                <small class="form-hint-block picklist-checked-indicator">
                  <span class="layouting-selected-checked-count" data-area-index="${areaIndex}">0</span> checked
                </small>
              </div>
            </div>
          </div>

            <div class="layouting-controls">
                <div class="layouting-field">
                  <label>Planting Date (Area)</label>
                  <input 
                    type="date" 
                    class="area-planting-date" 
                    value="${escapeHtml(area?.plantingDate || area?.layout?.plantingDate || "")}" 
                    data-area-index="${areaIndex}"
                  >
                </div>
                <div class="layouting-field">
                    <label>Type</label>
                    <select class="area-layout-type" data-area-index="${areaIndex}">
                      <option value="template" ${initialLayoutType === "template" ? "selected" : ""}>Template</option>
                      <option value="custom" ${initialLayoutType === "custom" ? "selected" : ""}>Custom</option>
                    </select>
                </div>
                <div class="layouting-template-controls ${initialLayoutType === "custom" ? "hidden" : ""}">
                <div class="layouting-field">
                    <label>Number of Ranges</label>
                    <input 
                        type="number" 
                        class="area-num-ranges" 
                        min="1" 
                        value="1" 
                        data-area-index="${areaIndex}"
                    >
                </div>
                <div class="layouting-field">
                    <label>Number of Replications</label>
                    <input 
                        type="number" 
                        class="area-num-reps" 
                        min="1" 
                        value="1" 
                        data-area-index="${areaIndex}"
                    >
                </div>
                <div class="layouting-field">
                    <label>Direction</label>
                    <select 
                        class="area-direction" 
                        data-area-index="${areaIndex}"
                    >
                        <option value="serpentine">Serpentine (Snake pattern)</option>
                        <option value="straight">Straight (Top to bottom)</option>
                    </select>
                </div>
                <div class="layouting-field">
                    <label>Randomization</label>
                    <select 
                        class="area-randomization" 
                        data-area-index="${areaIndex}"
                    >
                        <option value="normal">Normal (first rep ordered, rest randomized)</option>
                        <option value="random">Random (all randomized)</option>
                    </select>
                </div>
                </div>
                <div class="layouting-custom-controls ${initialLayoutType === "template" ? "hidden" : ""}">
                  <div class="layouting-custom-header">
                    <span>Custom Layout Builder</span>
                    <small>Builder controls are shown in the layout result section below.</small>
                  </div>
                </div>
            </div>
        </div>
        
        <div class="area-layout-result layouting-result" data-area-index="${areaIndex}">
            <!-- Layout tables will be rendered here -->
        </div>
    `;

  const searchInput = areaDiv.querySelector(".area-line-search");
  const availableList = areaDiv.querySelector(".area-lines-list");
  const selectedList = areaDiv.querySelector(".area-selected-lines");
  const availableCheckedCountEl = areaDiv.querySelector(
    ".layouting-available-checked-count",
  );
  const selectedCheckedCountEl = areaDiv.querySelector(
    ".layouting-selected-checked-count",
  );
  const controlButtons = areaDiv.querySelectorAll(
    `.picklist-control-btn[data-area-index="${areaIndex}"]`,
  );

  let selectedLineIds = (() => {
    // If multi-factor mode, use combination ids
    if (multiFactorActive) return multiFactorCombinations.map((c) => c.id);

    // If entries come from a factor, load from saved layout (per-area selection)
    if (hasEntriesFactor) {
      const ids = Array.isArray(area.layout?.lines)
        ? area.layout.lines.map((line) => line.id).filter(id => entriesFactorLineIds.includes(id))
        : [];
      return ids;
    }

    const ids = Array.isArray(area.layout?.lines)
      ? area.layout.lines.map((line) => line.id).filter(Boolean)
      : [];

    if (area?.layout?.layoutType === "custom" && Array.isArray(area?.layout?.result)) {
      area.layout.result.forEach((rep) => {
        (rep || []).forEach((row) => {
          (row || []).forEach((cell) => {
            if (cell?.id && !ids.includes(cell.id)) {
              ids.push(cell.id);
            }
          });
        });
      });
    }

    return ids;
  })();

  const cloneGrid = (grid) =>
    (Array.isArray(grid) ? grid : []).map((row) =>
      (Array.isArray(row) ? row : []).map((cell) =>
        cell ? { id: cell.id, name: cell.name } : null,
      ),
    );

  const sanitizeCustomReplications = (replications) => {
    if (!Array.isArray(replications) || replications.length === 0) {
      return [[[null]]];
    }

    return replications.map((rep) => {
      const grid = cloneGrid(rep);
      const rows = Math.max(1, grid.length || 1);
      const cols = Math.max(
        1,
        grid.reduce((acc, row) => Math.max(acc, (row || []).length), 0) || 1,
      );

      const normalized = Array.from({ length: rows }, (_, rowIndex) => {
        const sourceRow = grid[rowIndex] || [];
        return Array.from({ length: cols }, (_, colIndex) => sourceRow[colIndex] || null);
      });

      return normalized;
    });
  };

  const makeEmptyGrid = (rows = 1, cols = 1) =>
    Array.from({ length: Math.max(1, rows) }, () =>
      Array.from({ length: Math.max(1, cols) }, () => null),
    );

  let customReplications = (() => {
    const existing = area?.layout?.layoutType === "custom" && Array.isArray(area?.layout?.result)
      ? area.layout.result
      : null;
    return sanitizeCustomReplications(existing || [makeEmptyGrid(1, 1)]);
  })();
  const checkedState = {
    available: new Set(),
    selected: new Set(),
  };
  let activeListType = "";

  const updateActiveListUI = () => {
    availableList.classList.toggle("picklist-list-active", activeListType === "available");
    selectedList.classList.toggle("picklist-list-active", activeListType === "selected");
  };

  const setActiveListType = (type) => {
    activeListType = type;
    updateActiveListUI();
  };

  const setSelection = (listEl, id) => {
    listEl.querySelectorAll(".picklist-item").forEach((item) => {
      item.classList.toggle("selected", item.dataset.id === id);
    });
    listEl.dataset.selectedId = id || "";
  };

  const getActionIds = (checkedSet, fallbackId) => {
    const checkedIds = Array.from(checkedSet).filter(Boolean);
    if (checkedIds.length > 0) return checkedIds;
    return fallbackId ? [fallbackId] : [];
  };

  const clearCheckedState = () => {
    checkedState.available.clear();
    checkedState.selected.clear();
  };

  const getLineById = (lineId) => matchingLines.find((line) => line.id === lineId);

  const getPersistedLineById = (lineId) => {
    const sourceArea = isDummy
      ? trialState.dummyLayoutArea
      : trialState.currentAreas?.[areaIndex];
    const persistedLines = Array.isArray(sourceArea?.layout?.lines)
      ? sourceArea.layout.lines
      : [];
    return persistedLines.find((line) => line?.id === lineId) || null;
  };

  const getLineFromCustomGridById = (lineId) => {
    for (const rep of customReplications || []) {
      for (const row of rep || []) {
        for (const cell of row || []) {
          if (cell?.id === lineId) return cell;
        }
      }
    }
    return null;
  };

  const syncSelectedLinesFromCustomGrid = () => {
    if (!Array.isArray(customReplications)) {
      selectedLineIds = [];
      return;
    }

    const usedIds = [];
    customReplications.forEach((rep) => {
      (rep || []).forEach((row) => {
        (row || []).forEach((cell) => {
          if (cell?.id) usedIds.push(cell.id);
        });
      });
    });

    const orderedUnique = [];
    usedIds.forEach((id) => {
      if (!orderedUnique.includes(id)) orderedUnique.push(id);
    });

    selectedLineIds.forEach((id) => {
      if (!orderedUnique.includes(id)) orderedUnique.push(id);
    });

    selectedLineIds = orderedUnique;
  };

  const updateCheckedIndicators = () => {
    if (availableCheckedCountEl) {
      availableCheckedCountEl.textContent = String(checkedState.available.size);
    }
    if (selectedCheckedCountEl) {
      selectedCheckedCountEl.textContent = String(checkedState.selected.size);
    }
  };

  const getCurrentLayoutType = () => {
    const select = areaDiv.querySelector(".area-layout-type");
    return select?.value === "custom" ? "custom" : "template";
  };

  const toggleLayoutModeFields = () => {
    const type = getCurrentLayoutType();
    const templateControls = areaDiv.querySelector(".layouting-template-controls");
    const customControls = areaDiv.querySelector(".layouting-custom-controls");
    if (templateControls) templateControls.classList.toggle("hidden", type !== "template");
    if (customControls) customControls.classList.toggle("hidden", type !== "custom");
  };

  const persistCustomLayoutToState = () => {
    const plantingDateValue = areaDiv.querySelector(".area-planting-date")?.value || "";
    const normalizedReplications = sanitizeCustomReplications(customReplications);
    customReplications = normalizedReplications;
    syncSelectedLinesFromCustomGrid();

    const selectedLines = selectedLineIds
      .map((id) => {
        const line = getLineById(id) || getPersistedLineById(id) || getLineFromCustomGridById(id);
        return line ? { id: line.id, name: line.name } : null;
      })
      .filter(Boolean);

    const payload = {
      layoutType: "custom",
      lines: selectedLines,
      numRanges: Math.max(...normalizedReplications.map((rep) => rep.length || 1)),
      numReps: normalizedReplications.length,
      direction: "custom",
      randomization: "custom",
      plantingDate: plantingDateValue,
      result: normalizedReplications,
    };

    if (isDummy) {
      trialState.dummyLayoutArea = {
        ...getDummyLayoutArea(),
        plantingDate: plantingDateValue,
        layout: payload,
      };
    } else {
      if (!trialState.currentAreas[areaIndex]) return;
      trialState.currentAreas[areaIndex].layout = payload;
      trialState.currentAreas[areaIndex].plantingDate = plantingDateValue;
    }
  };

  const renderCustomReplications = () => {
    const resultContainer = areaDiv.querySelector(`.area-layout-result[data-area-index="${areaIndex}"]`);
    if (!resultContainer) return;

    const repHtml = customReplications
      .map((grid, repIndex) => {
        const rows = Math.max(1, grid.length);
        const cols = Math.max(1, grid[0]?.length || 1);

        const usedIdsInReplication = new Set();
        (grid || []).forEach((row) => {
          (row || []).forEach((cell) => {
            if (cell?.id) usedIdsInReplication.add(cell.id);
          });
        });

        const selectedEntriesHtml = selectedLineIds
          .filter((lineId) => !usedIdsInReplication.has(lineId))
          .map((lineId) => {
            const line = getLineById(lineId) || getPersistedLineById(lineId) || getLineFromCustomGridById(lineId);
            if (!line) return "";
            return `
              <div class="layouting-custom-entry-chip" draggable="true" data-line-id="${line.id}" data-rep-index="${repIndex}">
                <span>${escapeHtml(line.name)}</span>
              </div>
            `;
          })
          .join("");

        const rowsHtml = grid
          .map((row, rowIndex) => {
            const cellsHtml = row
              .map((cell, colIndex) => {
                const name = cell?.name ? escapeHtml(cell.name) : "-";
                return `
                  <td class="layouting-td layouting-custom-cell ${cell ? "filled" : ""}" data-rep-index="${repIndex}" data-row-index="${rowIndex}" data-col-index="${colIndex}">
                    <div class="layouting-custom-cell-content">
                      <span>${name}</span>
                      ${cell ? '<button type="button" class="layouting-custom-clear" title="Clear cell"><span class="material-symbols-rounded">close</span></button>' : ""}
                    </div>
                  </td>
                `;
              })
              .join("");

            return `
              <tr>
                <td class="layouting-row-header">Range ${rowIndex + 1}</td>
                ${cellsHtml}
              </tr>
            `;
          })
          .join("");

        return `
          <div class="layouting-custom-result-block" data-rep-index="${repIndex}">
            <div class="layouting-custom-rep-head">
              <div>
                <strong>Replication ${repIndex + 1}</strong>
                <small>${rows} range(s) × ${cols} column(s)</small>
              </div>
              <div class="layouting-custom-toolbar" data-rep-index="${repIndex}">
                <button type="button" class="btn btn-secondary btn-sm layouting-icon-btn" data-action="insert-col" data-rep-index="${repIndex}" title="Insert Column">
                  <span class="material-symbols-rounded">view_column</span>
                </button>
                <button type="button" class="btn btn-danger btn-sm layouting-icon-btn" data-action="remove-col" data-rep-index="${repIndex}" title="Remove Column">
                  <span class="material-symbols-rounded">view_column</span>
                </button>
                <button type="button" class="btn btn-secondary btn-sm layouting-icon-btn" data-action="insert-range" data-rep-index="${repIndex}" title="Insert Range">
                  <span class="material-symbols-rounded">table_rows_narrow</span>
                </button>
                <button type="button" class="btn btn-danger btn-sm layouting-icon-btn" data-action="remove-range" data-rep-index="${repIndex}" title="Remove Range">
                  <span class="material-symbols-rounded">table_rows_narrow</span>
                </button>
                <button type="button" class="btn btn-secondary btn-sm layouting-icon-btn" data-action="add-rep-empty" data-rep-index="${repIndex}" title="Add Empty Replication">
                  <span class="material-symbols-rounded">add</span>
                </button>
                <button type="button" class="btn btn-secondary btn-sm layouting-icon-btn" data-action="add-rep-duplicate" data-rep-index="${repIndex}" title="Duplicate Replication">
                  <span class="material-symbols-rounded">content_copy</span>
                </button>
                <button type="button" class="btn btn-danger btn-sm layouting-icon-btn" data-action="delete-rep" data-rep-index="${repIndex}" title="Delete Replication">
                  <span class="material-symbols-rounded">delete</span>
                </button>
              </div>
            </div>
            <div class="layouting-custom-entry-list" data-rep-index="${repIndex}">
              ${selectedEntriesHtml || '<span class="layouting-empty">No selected entries to drag</span>'}
            </div>
            <div class="layouting-table-wrap">
              <table class="layouting-table">
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            </div>
          </div>
        `;
      })
      .join("");

    resultContainer.innerHTML = repHtml;

    resultContainer.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        const repIndex = parseInt(btn.dataset.repIndex, 10);
        const grid = customReplications[repIndex];
        if (!grid) return;

        if (action === "insert-col") {
          grid.forEach((row) => row.push(null));
        }

        if (action === "remove-col") {
          if ((grid[0]?.length || 1) <= 1) return;
          grid.forEach((row) => row.pop());
        }

        if (action === "insert-range") {
          const cols = Math.max(1, grid[0]?.length || 1);
          grid.push(Array.from({ length: cols }, () => null));
        }

        if (action === "remove-range") {
          if (grid.length <= 1) return;
          grid.pop();
        }

        if (action === "add-rep-empty") {
          const rows = Math.max(1, grid.length);
          const cols = Math.max(1, grid[0]?.length || 1);
          customReplications.push(makeEmptyGrid(rows, cols));
        }

        if (action === "add-rep-duplicate") {
          customReplications.push(cloneGrid(grid));
        }

        if (action === "delete-rep") {
          if (customReplications.length <= 1) return; // keep at least one
          customReplications.splice(repIndex, 1);
        }

        persistCustomLayoutToState();
        renderCustomReplications();
      });
    });

    resultContainer.querySelectorAll(".layouting-custom-entry-chip").forEach((entryEl) => {
      entryEl.addEventListener("dragstart", (event) => {
        const lineId = entryEl.dataset.lineId;
        if (!lineId) return;
        event.dataTransfer.setData("text/plain", lineId);
        event.dataTransfer.setData("source", "custom-selected");
      });
    });

    resultContainer.querySelectorAll(".layouting-custom-cell").forEach((cellEl) => {
      const repIndex = parseInt(cellEl.dataset.repIndex, 10);
      const rowIndex = parseInt(cellEl.dataset.rowIndex, 10);
      const colIndex = parseInt(cellEl.dataset.colIndex, 10);

      cellEl.addEventListener("dragover", (event) => {
        event.preventDefault();
        cellEl.classList.add("drag-over");
      });

      cellEl.addEventListener("dragleave", () => {
        cellEl.classList.remove("drag-over");
      });

      cellEl.addEventListener("drop", (event) => {
        event.preventDefault();
        cellEl.classList.remove("drag-over");
        const draggedId = event.dataTransfer.getData("text/plain");
        if (!draggedId || !selectedLineIds.includes(draggedId)) return;

        const line = getLineById(draggedId) || getPersistedLineById(draggedId) || getLineFromCustomGridById(draggedId);
        if (!line) return;

        const targetGrid = customReplications[repIndex];
        if (!targetGrid || !targetGrid[rowIndex]) return;

        for (let r = 0; r < targetGrid.length; r += 1) {
          for (let c = 0; c < targetGrid[r].length; c += 1) {
            if (targetGrid[r][c]?.id === draggedId) {
              targetGrid[r][c] = null;
            }
          }
        }

        targetGrid[rowIndex][colIndex] = { id: line.id, name: line.name };
        persistCustomLayoutToState();
        renderCustomReplications();
      });
    });

    resultContainer.querySelectorAll(".layouting-custom-clear").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        const parentCell = btn.closest(".layouting-custom-cell");
        if (!parentCell) return;

        const repIndex = parseInt(parentCell.dataset.repIndex, 10);
        const rowIndex = parseInt(parentCell.dataset.rowIndex, 10);
        const colIndex = parseInt(parentCell.dataset.colIndex, 10);

        if (!customReplications[repIndex]?.[rowIndex]) return;
        customReplications[repIndex][rowIndex][colIndex] = null;
        persistCustomLayoutToState();
        renderCustomReplications();
      });
    });
  };

  const getListByType = (type) =>
    type === "available" ? availableList : type === "selected" ? selectedList : null;

  const withActiveListType = (handler) => {
    if (!activeListType) {
      showToast("Please choose a list side first: Available or Selected", "warning");
      return;
    }
    handler(activeListType);
  };

  const renderAvailable = (searchTerm = "") => {
    if (!availableList) return;
    const filtered = matchingLines.filter((line) => {
      const match = line.name
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      return match && !selectedLineIds.includes(line.id);
    });

    const filteredIds = new Set(filtered.map((line) => line.id));
    checkedState.available.forEach((id) => {
      if (!filteredIds.has(id)) checkedState.available.delete(id);
    });

    if (filtered.length === 0) {
      availableList.innerHTML =
        '<p class="layouting-empty">No entries available for this crop.</p>';
      updateCheckedIndicators();
      return;
    }

    availableList.innerHTML = filtered
      .map((line) => {
        const qty = line.quantity !== undefined ? line.quantity : "∞";
        const qtyClass =
          line.quantity !== undefined && line.quantity <= 0
            ? "line-qty-empty"
            : "";
        const disabled = line.quantity !== undefined && line.quantity <= 0;
        return `
          <div class="picklist-item ${qtyClass} ${disabled ? "disabled" : ""}" draggable="${!disabled}" data-id="${line.id}" data-name="${escapeHtml(line.name)}" data-disabled="${disabled}">
            <input type="checkbox" class="picklist-item-checkbox" data-id="${line.id}" ${checkedState.available.has(line.id) ? "checked" : ""} ${disabled ? "disabled" : ""}>
            <div class="picklist-item-content picklist-item-content-inline">
              <span>${escapeHtml(line.name)}</span>
              <span class="line-quantity-badge ${qtyClass}">${qty}</span>
            </div>
          </div>
        `;
      })
      .join("");

    availableList.querySelectorAll(".picklist-item").forEach((item) => {
      if (item.dataset.disabled === "true") return;
      const itemId = item.dataset.id;
      const checkbox = item.querySelector(".picklist-item-checkbox");

      checkbox?.addEventListener("click", (e) => e.stopPropagation());
      checkbox?.addEventListener("change", (e) => {
        setActiveListType("available");
        if (e.target.checked) {
          checkedState.available.add(itemId);
        } else {
          checkedState.available.delete(itemId);
        }
        updateCheckedIndicators();
      });

      item.addEventListener("click", () => {
        setActiveListType("available");
        if (checkbox) {
          checkbox.checked = !checkbox.checked;
          if (checkbox.checked) {
            checkedState.available.add(itemId);
          } else {
            checkedState.available.delete(itemId);
          }
        }
        updateCheckedIndicators();
        setSelection(availableList, itemId);
        setSelection(selectedList, "");
      });
      item.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", itemId);
        e.dataTransfer.setData("source", "available");
      });
    });

    updateCheckedIndicators();
  };

  const renderSelected = () => {
    if (!selectedList) return;
    const selectedIds = new Set(selectedLineIds);
    checkedState.selected.forEach((id) => {
      if (!selectedIds.has(id)) checkedState.selected.delete(id);
    });

    if (selectedLineIds.length === 0) {
      selectedList.innerHTML =
        '<p class="layouting-empty">No entries selected</p>';
      updateCheckedIndicators();
      return;
    }

    selectedList.innerHTML = selectedLineIds
      .map((id) => {
        const line = matchingLines.find((l) => l.id === id);
        if (!line) return "";
        const qty = line.quantity !== undefined ? line.quantity : "∞";
        const qtyClass =
          line.quantity !== undefined && line.quantity <= 0
            ? "line-qty-empty"
            : "";
        return `
          <div class="picklist-item" draggable="true" data-id="${line.id}" data-name="${escapeHtml(line.name)}">
            <input type="checkbox" class="picklist-item-checkbox" data-id="${line.id}" ${checkedState.selected.has(line.id) ? "checked" : ""}>
            <div class="picklist-item-content picklist-item-content-inline">
              <span>${escapeHtml(line.name)}</span>
              <span class="line-quantity-badge ${qtyClass}">${qty}</span>
            </div>
          </div>
        `;
      })
      .join("");

    selectedList.querySelectorAll(".picklist-item").forEach((item) => {
      const itemId = item.dataset.id;
      const checkbox = item.querySelector(".picklist-item-checkbox");

      checkbox?.addEventListener("click", (e) => e.stopPropagation());
      checkbox?.addEventListener("change", (e) => {
        setActiveListType("selected");
        if (e.target.checked) {
          checkedState.selected.add(itemId);
        } else {
          checkedState.selected.delete(itemId);
        }
        updateCheckedIndicators();
      });

      item.addEventListener("click", () => {
        setActiveListType("selected");
        if (checkbox) {
          checkbox.checked = !checkbox.checked;
          if (checkbox.checked) {
            checkedState.selected.add(itemId);
          } else {
            checkedState.selected.delete(itemId);
          }
        }
        updateCheckedIndicators();
        setSelection(selectedList, itemId);
        setSelection(availableList, "");
      });
      item.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", itemId);
        e.dataTransfer.setData("source", "selected");
      });
      item.addEventListener("dragover", (e) => e.preventDefault());
      item.addEventListener("drop", (e) => {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData("text/plain");
        const source = e.dataTransfer.getData("source");
        if (!draggedId) return;
        if (source === "selected") {
          const fromIndex = selectedLineIds.indexOf(draggedId);
          const toIndex = selectedLineIds.indexOf(itemId);
          if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
            const [moved] = selectedLineIds.splice(fromIndex, 1);
            selectedLineIds.splice(toIndex, 0, moved);
            renderSelected();
            autoGenerateLayout();
          }
        } else if (source === "available") {
          if (!selectedLineIds.includes(draggedId)) {
            const toIndex = selectedLineIds.indexOf(itemId);
            selectedLineIds.splice(toIndex, 0, draggedId);
            checkedState.available.delete(draggedId);
            renderSelected();
            renderAvailable(searchInput.value);
            autoGenerateLayout();
            updateCheckedIndicators();
          }
        }
      });
    });

    updateCheckedIndicators();
  };

  const addSelectedFromAvailable = () => {
    const actionIds = getActionIds(
      checkedState.available,
      availableList?.dataset.selectedId,
    );
    if (actionIds.length === 0) return;

    let hasChanges = false;
    actionIds.forEach((id) => {
      if (!selectedLineIds.includes(id)) {
        selectedLineIds.push(id);
        hasChanges = true;
      }
    });

    if (hasChanges) {
      clearCheckedState();
      setSelection(availableList, "");
      renderSelected();
      renderAvailable(searchInput.value);
      if (getCurrentLayoutType() === "template") {
        autoGenerateLayout();
      } else {
        persistCustomLayoutToState();
        renderCustomReplications();
      }
      updateCheckedIndicators();
    }
  };

  const removeSelectedFromSelected = () => {
    const actionIds = new Set(
      getActionIds(checkedState.selected, selectedList?.dataset.selectedId),
    );
    if (actionIds.size === 0) return;

    selectedLineIds = selectedLineIds.filter((id) => !actionIds.has(id));
    clearCheckedState();
    setSelection(selectedList, "");
    renderSelected();
    renderAvailable(searchInput.value);
    if (getCurrentLayoutType() === "template") {
      autoGenerateLayout();
    } else {
      persistCustomLayoutToState();
      renderCustomReplications();
    }
    updateCheckedIndicators();
  };

  const moveSelected = (direction) => {
    const hadCheckedSelection = checkedState.selected.size > 0;
    const actionIds = getActionIds(checkedState.selected, selectedList?.dataset.selectedId);
    if (actionIds.length === 0) return;

    const moveSet = new Set(actionIds.filter((id) => selectedLineIds.includes(id)));
    if (moveSet.size === 0) return;

    if (direction === "up") {
      for (let i = 1; i < selectedLineIds.length; i += 1) {
        const currentId = selectedLineIds[i];
        const prevId = selectedLineIds[i - 1];
        if (moveSet.has(currentId) && !moveSet.has(prevId)) {
          selectedLineIds[i] = prevId;
          selectedLineIds[i - 1] = currentId;
        }
      }
    } else {
      for (let i = selectedLineIds.length - 2; i >= 0; i -= 1) {
        const currentId = selectedLineIds[i];
        const nextId = selectedLineIds[i + 1];
        if (moveSet.has(currentId) && !moveSet.has(nextId)) {
          selectedLineIds[i] = nextId;
          selectedLineIds[i + 1] = currentId;
        }
      }
    }

    if (hadCheckedSelection) {
      checkedState.selected = moveSet;
    } else {
      checkedState.selected.clear();
    }

    renderSelected();
    if (!hadCheckedSelection && actionIds.length === 1) {
      setSelection(selectedList, actionIds[0]);
    }
    if (getCurrentLayoutType() === "template") {
      autoGenerateLayout();
    } else {
      persistCustomLayoutToState();
      renderCustomReplications();
    }
    updateCheckedIndicators();
  };

  const handleListDrop = (targetList) => (e) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("text/plain");
    const source = e.dataTransfer.getData("source");
    if (!draggedId) return;

    if (targetList === "selected") {
      if (!selectedLineIds.includes(draggedId)) {
        selectedLineIds.push(draggedId);
        checkedState.available.delete(draggedId);
        renderSelected();
        renderAvailable(searchInput.value);
        if (getCurrentLayoutType() === "template") {
          autoGenerateLayout();
        } else {
          persistCustomLayoutToState();
          renderCustomReplications();
        }
        updateCheckedIndicators();
      }
    }

    if (targetList === "available" && source === "selected") {
      selectedLineIds = selectedLineIds.filter((id) => id !== draggedId);
      checkedState.selected.delete(draggedId);
      renderSelected();
      renderAvailable(searchInput.value);
      if (getCurrentLayoutType() === "template") {
        autoGenerateLayout();
      } else {
        persistCustomLayoutToState();
        renderCustomReplications();
      }
      updateCheckedIndicators();
    }
  };

  if (availableList) {
    availableList.addEventListener("dragover", (e) => e.preventDefault());
    availableList.addEventListener("drop", handleListDrop("available"));
  }
  if (selectedList) {
    selectedList.addEventListener("dragover", (e) => e.preventDefault());
    selectedList.addEventListener("drop", handleListDrop("selected"));
  }

  controlButtons.forEach((btn) => {
    const action = btn.dataset.action;
    if (action === "select-all") {
      btn.addEventListener("click", () => {
        withActiveListType((targetType) => {
          const targetList = getListByType(targetType);
          if (!targetList) return;

          if (targetType === "available") {
            checkedState.available.clear();
            targetList
              .querySelectorAll(".picklist-item-checkbox:not(:disabled)")
              .forEach((checkbox) => {
                checkbox.checked = true;
                if (checkbox.dataset.id) checkedState.available.add(checkbox.dataset.id);
              });
          } else {
            checkedState.selected.clear();
            targetList
              .querySelectorAll(".picklist-item-checkbox")
              .forEach((checkbox) => {
                checkbox.checked = true;
                if (checkbox.dataset.id) checkedState.selected.add(checkbox.dataset.id);
              });
          }

          updateCheckedIndicators();
        });
      });
    }

    if (action === "deselect-all") {
      btn.addEventListener("click", () => {
        withActiveListType((targetType) => {
          const targetList = getListByType(targetType);
          if (!targetList) return;

          targetList
            .querySelectorAll(".picklist-item-checkbox")
            .forEach((checkbox) => {
              checkbox.checked = false;
            });

          if (targetType === "available") {
            checkedState.available.clear();
          } else {
            checkedState.selected.clear();
          }

          updateCheckedIndicators();
        });
      });
    }

    if (action === "add") btn.addEventListener("click", addSelectedFromAvailable);
    if (action === "remove") btn.addEventListener("click", removeSelectedFromSelected);
    if (action === "up") btn.addEventListener("click", () => moveSelected("up"));
    if (action === "down") btn.addEventListener("click", () => moveSelected("down"));
  });

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      renderAvailable(e.target.value);
    });
  }

  updateCheckedIndicators();
  updateActiveListUI();

  // "Copy entries from" button handler
  const copyBtn = areaDiv.querySelector(".copy-entries-btn");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const selectEl = areaDiv.querySelector(".copy-entries-from-select");
      const sourceIdx = parseInt(selectEl?.value);
      if (isNaN(sourceIdx)) {
        showToast("Please select an area to copy from", "error");
        return;
      }
      // Read selected lines from the source area's picklist DOM
      const sourceCard = document.querySelector(
        `.layouting-area-card[data-area-index="${sourceIdx}"][data-is-dummy="false"]`
      );
      if (!sourceCard) {
        showToast("Source area not found", "error");
        return;
      }
      const sourceItems = sourceCard.querySelectorAll(".area-selected-lines .picklist-item");
      const sourceIds = Array.from(sourceItems).map((el) => el.dataset.id).filter(Boolean);
      if (sourceIds.length === 0) {
        showToast("Source area has no entries selected", "error");
        return;
      }
      // Apply to current area
      selectedLineIds = [...sourceIds];
      clearCheckedState();
      renderSelected();
      renderAvailable(searchInput?.value || "");
      autoGenerateLayout();
      showToast(`Copied ${sourceIds.length} entries from ${trialState.currentAreas[sourceIdx]?.name || "Area " + (sourceIdx + 1)}`, "success");
    });
  }

  // Auto-generate layout on input change with debounce
  let layoutDebounceTimer;
  const autoGenerateLayout = () => {
    clearTimeout(layoutDebounceTimer);
    layoutDebounceTimer = setTimeout(() => {
      if (getCurrentLayoutType() === "template") {
        generateLayoutForArea(areaIndex, { isDummy });
      }
    }, 500);
  };

  // Add event listeners for auto-generate
  areaDiv
    .querySelector(".area-num-ranges")
    .addEventListener("change", autoGenerateLayout);
  areaDiv
    .querySelector(".area-num-reps")
    .addEventListener("change", autoGenerateLayout);
  areaDiv
    .querySelector(".area-direction")
    .addEventListener("change", autoGenerateLayout);
  areaDiv
    .querySelector(".area-randomization")
    .addEventListener("change", autoGenerateLayout);

  const layoutTypeSelect = areaDiv.querySelector(".area-layout-type");
  if (layoutTypeSelect) {
    layoutTypeSelect.addEventListener("change", () => {
      toggleLayoutModeFields();
      if (getCurrentLayoutType() === "template") {
        generateLayoutForArea(areaIndex, { isDummy });
      } else {
        persistCustomLayoutToState();
        renderCustomReplications();
      }
    });
  }

  const areaPlantingDateInput = areaDiv.querySelector(".area-planting-date");
  if (areaPlantingDateInput) {
    areaPlantingDateInput.addEventListener("change", (event) => {
      if (isDummy) {
        trialState.dummyLayoutArea = {
          ...getDummyLayoutArea(),
          plantingDate: event.target.value || "",
        };
        return;
      }
      if (!trialState.currentAreas[areaIndex]) return;
      trialState.currentAreas[areaIndex].plantingDate = event.target.value || "";
    });
  }

  renderAvailable();
  renderSelected();
  toggleLayoutModeFields();
  renderCustomReplications();

  // If editing and layout exists, pre-populate form
  if (area.layout && area.layout.lines) {
    const numRangesInput = areaDiv.querySelector(".area-num-ranges");
    const numRepsInput = areaDiv.querySelector(".area-num-reps");
    const directionSelect = areaDiv.querySelector(".area-direction");
    const randomizationSelect = areaDiv.querySelector(".area-randomization");
    const plantingDateInput = areaDiv.querySelector(".area-planting-date");

    if (numRangesInput) numRangesInput.value = area.layout.numRanges || 1;
    if (numRepsInput) numRepsInput.value = area.layout.numReps || 1;
    if (directionSelect)
      directionSelect.value = area.layout.direction || "serpentine";
    if (randomizationSelect)
      randomizationSelect.value = area.layout.randomization || "normal";
    if (plantingDateInput) {
      plantingDateInput.value = area?.plantingDate || area?.layout?.plantingDate || "";
    }

    if (layoutTypeSelect) {
      layoutTypeSelect.value = area.layout.layoutType === "custom" ? "custom" : "template";
      toggleLayoutModeFields();
    }

    if (area.layout.layoutType === "custom" && Array.isArray(area.layout.result)) {
      customReplications = sanitizeCustomReplications(area.layout.result);
      persistCustomLayoutToState();
      renderCustomReplications();
    }

    // Render existing layout result
    if (area.layout.result && area.layout.layoutType !== "custom") {
      renderLayoutResult(areaIndex, area.layout.result, {
        isDummy,
        splitPlotHeaders: area.layout.splitPlotHeaders || null,
      });
    }
  }

  // Only auto-generate / persist if there is no pre-existing saved layout.
  // In edit mode the layout was already rendered above; re-triggering would
  // overwrite the saved state with whatever the DOM happens to contain at
  // that moment (potentially empty if matchingLines has no match), which is
  // the root cause of the "selected entries disappear on edit" bug.
  // Exception: when entries come from a factor, always re-generate because
  // the factor entries may have changed since the layout was last saved.
  const alreadyHasLayout =
    !!(area.layout && Array.isArray(area.layout.result) && area.layout.result.length > 0);

  if (getCurrentLayoutType() === "template") {
    if (hasEntriesFactor || multiFactorActive || !alreadyHasLayout) {
      autoGenerateLayout();
    }
  } else {
    // Custom mode: only call if not already handled inside the edit block above
    if (area.layout?.layoutType !== "custom") {
      persistCustomLayoutToState();
      renderCustomReplications();
    }
  }

  return areaDiv;
}

// Generate layout for a specific area
function generateLayoutForArea(areaIndex, options = {}) {
  const isDummy = options.isDummy === true;
  const areaDiv = document.querySelector(
    `.layouting-area-card[data-area-index="${areaIndex}"][data-is-dummy="${isDummy ? "true" : "false"}"]`,
  );
  if (!areaDiv) return;

  // Get selected lines from picklist (ordered)
  // In multi-factor mode, entries come from combinations, not the picklist
  const multiFactorActive = isMultiFactorMode();
  const splitPlotActive = isSplitPlotMode();
  const factorialActive = isFactorialMode();
  let selectedLines;
  if (multiFactorActive) {
    const combos = buildSplitPlotCombinations();
    selectedLines = combos.map((c) => ({ id: c.id, name: c.name }));
  } else {
    const selectedItems = areaDiv.querySelectorAll(
      ".area-selected-lines .picklist-item",
    );
    selectedLines = Array.from(selectedItems).map((item) => ({
      id: item.dataset.id,
      name: item.dataset.name || item.textContent.trim(),
    }));
  }

  const layoutTypeSelect = areaDiv.querySelector(".area-layout-type");
  const layoutType = layoutTypeSelect?.value === "custom" ? "custom" : "template";

  const resultContainer = areaDiv.querySelector(
    `.area-layout-result[data-area-index="${areaIndex}"]`,
  );

  // If no lines selected, show empty message
  if (selectedLines.length === 0) {
    if (resultContainer) {
      resultContainer.innerHTML =
        '<div class="td-no-items">Select entries to generate layout</div>';
    }

    const plantingDateValue = areaDiv.querySelector(".area-planting-date")?.value || "";
    const emptyLayout = {
      layoutType,
      lines: [],
      numRanges: 1,
      numReps: 1,
      direction: layoutType === "template" ? "serpentine" : "custom",
      randomization: layoutType === "template" ? "normal" : "custom",
      plantingDate: plantingDateValue,
      result: [],
    };

    if (isDummy) {
      trialState.dummyLayoutArea = {
        ...getDummyLayoutArea(),
        plantingDate: plantingDateValue,
        layout: emptyLayout,
      };
    } else if (trialState.currentAreas[areaIndex]) {
      trialState.currentAreas[areaIndex].layout = emptyLayout;
      trialState.currentAreas[areaIndex].plantingDate = plantingDateValue;
    }

    return;
  }

  if (layoutType === "custom") {
    if (Array.isArray(options.customLayouts) && options.customLayouts.length > 0) {
      const plantingDateValue = areaDiv.querySelector(".area-planting-date")?.value || "";
      const customLayouts = options.customLayouts;
      const maxRanges = Math.max(...customLayouts.map((rep) => (Array.isArray(rep) ? rep.length : 1)), 1);

      const customLayout = {
        layoutType: "custom",
        lines: selectedLines,
        numRanges: maxRanges,
        numReps: customLayouts.length,
        direction: "custom",
        randomization: "custom",
        plantingDate: plantingDateValue,
        result: customLayouts,
      };

      if (isDummy) {
        trialState.dummyLayoutArea = {
          ...getDummyLayoutArea(),
          plantingDate: plantingDateValue,
          layout: customLayout,
        };
      } else {
        if (!trialState.currentAreas[areaIndex]) return;
        trialState.currentAreas[areaIndex].layout = customLayout;
        trialState.currentAreas[areaIndex].plantingDate = plantingDateValue;
      }

      renderLayoutResult(areaIndex, customLayouts, { isDummy });
    }
    return;
  }

  const numRanges =
    parseInt(areaDiv.querySelector(".area-num-ranges").value) || 1;
  const numReps = parseInt(areaDiv.querySelector(".area-num-reps").value) || 1;
  const direction = areaDiv.querySelector(".area-direction").value;
  const randomization = areaDiv.querySelector(".area-randomization").value;

  // Validate
  if (numRanges < 1 || numReps < 1) {
    return;
  }

  // Calculate layout
  let layouts;
  let splitPlotHeaders = null;

  if (splitPlotActive) {
    // Split-plot: column-header layout (1st factor as headers, 2nd factor as cells)
    const result = generateSplitPlotLayout(numReps, direction, randomization);
    layouts = result.layouts;
    splitPlotHeaders = result.headers;
  } else if (factorialActive) {
    // Factorial: combined codes layout (ignores numRanges, defined by factor levels)
    layouts = generateFactorialLayout(numReps, direction, randomization);
  } else {
    layouts = calculateLayout(
      selectedLines,
      numRanges,
      numReps,
      direction,
      randomization,
    );
  }

  const plantingDateValue = areaDiv.querySelector(".area-planting-date")?.value || "";

  // Store layout in trial state
  const layoutData = {
    layoutType: "template",
    lines: selectedLines,
    numRanges: numRanges,
    numReps: numReps,
    direction: direction,
    randomization: randomization,
    plantingDate: plantingDateValue,
    result: layouts,
  };
  if (splitPlotHeaders) {
    layoutData.splitPlotHeaders = splitPlotHeaders;
  }

  if (isDummy) {
    trialState.dummyLayoutArea = {
      ...getDummyLayoutArea(),
      plantingDate: plantingDateValue,
      layout: layoutData,
    };
  } else {
    if (!trialState.currentAreas[areaIndex]) return;
    trialState.currentAreas[areaIndex].layout = layoutData;
    trialState.currentAreas[areaIndex].plantingDate = plantingDateValue;
  }

  // Render layout
  renderLayoutResult(areaIndex, layouts, { isDummy, splitPlotHeaders });
}

// Calculate layout based on parameters
function calculateLayout(
  selectedLines,
  numRanges,
  numReps,
  direction,
  randomization,
) {
  const replicationLayouts = [];

  for (let rep = 0; rep < numReps; rep++) {
    let repLines = [...selectedLines];

    // Apply randomization
    if (randomization === "random" || (randomization === "normal" && rep > 0)) {
      // Fisher-Yates shuffle
      for (let i = repLines.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [repLines[i], repLines[j]] = [repLines[j], repLines[i]];
      }
    }

    // Create grid
    const numColumns = Math.ceil(repLines.length / numRanges);
    const grid = [];

    // Distribute lines across grid
    let lineIndex = 0;

    if (direction === "serpentine") {
      // Serpentine: fill row by row, alternating left-to-right and right-to-left
      for (let row = 0; row < numRanges; row++) {
        if (!grid[row]) grid[row] = [];
        const isReverseRow = row % 2 === 1;

        if (isReverseRow) {
          // Right to left
          for (let col = numColumns - 1; col >= 0; col--) {
            if (lineIndex < repLines.length) {
              grid[row][col] = repLines[lineIndex];
              lineIndex++;
            } else {
              grid[row][col] = null;
            }
          }
        } else {
          // Left to right
          for (let col = 0; col < numColumns; col++) {
            if (lineIndex < repLines.length) {
              grid[row][col] = repLines[lineIndex];
              lineIndex++;
            } else {
              grid[row][col] = null;
            }
          }
        }
      }
    } else {
      // Straight: top to bottom in all columns
      for (let col = 0; col < numColumns; col++) {
        for (let row = 0; row < numRanges; row++) {
          if (!grid[row]) grid[row] = [];
          if (lineIndex < repLines.length) {
            grid[row][col] = repLines[lineIndex];
            lineIndex++;
          } else {
            grid[row][col] = null;
          }
        }
      }
    }

    replicationLayouts.push(grid);
  }

  return replicationLayouts;
}

// Render layout result as tables
function renderLayoutResult(areaIndex, layouts, options = {}) {
  const isDummy = options.isDummy === true;
  const splitPlotHeaders = options.splitPlotHeaders || null;
  const areaDiv = document.querySelector(
    `.layouting-area-card[data-area-index="${areaIndex}"][data-is-dummy="${isDummy ? "true" : "false"}"]`,
  );
  if (!areaDiv) return;

  const resultContainer = areaDiv.querySelector(
    `.area-layout-result[data-area-index="${areaIndex}"]`,
  );
  if (!resultContainer) return;

  let html = "";

  layouts.forEach((grid, repIndex) => {
    const hasSplitHeaders = splitPlotHeaders && splitPlotHeaders[repIndex];

    // Build header row for split-plot (1st factor codes as column headers)
    const headerRowHtml = hasSplitHeaders ? `
      <tr>
        <td class="layouting-row-header"></td>
        ${splitPlotHeaders[repIndex].map((code) => `
          <td class="layouting-col-header">${escapeHtml(code)}</td>
        `).join("")}
      </tr>
    ` : "";

    html += `
            <div class="layouting-table-wrap">
                <div class="layouting-table-title">Replication ${repIndex + 1}</div>
                <table class="layouting-table">
                    <tbody>
                        ${headerRowHtml}
                        ${grid
                          .map(
                            (row, rowIdx) => `
                            <tr>
                                <td class="layouting-row-header">Range ${rowIdx + 1}</td>
                                ${row
                                  .map(
                                    (cell) => `
                                    <td class="layouting-td">
                                        ${cell ? escapeHtml(cell.displayName || cell.name) : "-"}
                                    </td>
                                `,
                                  )
                                  .join("")}
                            </tr>
                        `,
                          )
                          .join("")}
                    </tbody>
                </table>
            </div>
        `;
  });

  resultContainer.innerHTML = html;
}

// Validate layouting section
function validateLayoutingSection() {
  // Layouting is optional.
  return true;
}

// ===========================
// RUN TRIAL FUNCTIONALITY
// ===========================

let runTrialState = {
  currentTrialId: null,
  currentTrial: null,
  currentAreaIndex: null,
  currentParamId: null,
  currentLineId: null,
  currentRepIndex: null,
  responses: {}, // { areaIndex: { paramId: { lineId_repIndex: { value, photos } } } }
  photoFiles: [], // Temporary photo storage
};

// ===========================
// AGRONOMY MONITORING
// ===========================

let agronomyMonitoringState = {
  currentTrialId: null,
  currentTrial: null,
  currentAreaIndex: null,
  currentItemId: null,
  responses: {}, // { areaIndex: { agronomyItemId: { applicationDate, photos, timestamp } } }
};

let agronomyAutoSaveInProgress = false;

function getTrialAvailableAreaIndexes(trial) {
  const totalAreas = Array.isArray(trial?.areas) ? trial.areas.length : 0;
  const allIndexes = Array.from({ length: totalAreas }, (_, idx) => idx);
  if (!trial || totalAreas === 0) return [];

  if (trial._responsesLoaded) {
    return allIndexes;
  }

  const loadedAreas = Array.isArray(trial._loadedAreas) ? trial._loadedAreas : [];
  const normalized = [...new Set(
    loadedAreas
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n >= 0 && n < totalAreas),
  )].sort((a, b) => a - b);

  // If no partial-load marker exists, keep default behavior (all areas available).
  return normalized.length > 0 ? normalized : allIndexes;
}

function isTrialAreaAvailableForRun(trial, areaIndex) {
  return getTrialAvailableAreaIndexes(trial).includes(Number(areaIndex));
}

function getAreaUnavailableMessage(trial, areaIndex) {
  const areaName = trial?.areas?.[areaIndex]?.name || `Area ${Number(areaIndex) + 1}`;
  return `${areaName} belum dimuat. Silakan load area ini dulu di Load Data.`;
}

function getNextAvailableAreaIndex(trial, currentAreaIndex) {
  const available = getTrialAvailableAreaIndexes(trial);
  return available.find((idx) => idx > currentAreaIndex) ?? null;
}

function getPrevAvailableAreaIndex(trial, currentAreaIndex) {
  const available = getTrialAvailableAreaIndexes(trial);
  const reversed = [...available].reverse();
  return reversed.find((idx) => idx < currentAreaIndex) ?? null;
}

// Get agronomy items for a trial, sorted by dapMin
function getTrialAgronomyItems(trial) {
  if (!trial || !trial.agronomyItems || !trial.agronomyItems.length) return [];
  return trial.agronomyItems
    .map(id => inventoryState.items.agronomy?.find(a => a.id === id))
    .filter(Boolean)
    .sort((a, b) => (a.dapMin ?? 9999) - (b.dapMin ?? 9999));
}

// Build flat navigation list: [{areaIndex, itemId, areaName, itemName}]
function getAllAgronomyNavPositions() {
  const trial = agronomyMonitoringState.currentTrial;
  if (!trial) return [];
  const items = getTrialAgronomyItems(trial);
  const availableAreas = new Set(getTrialAvailableAreaIndexes(trial));
  const positions = [];
  (trial.areas || []).forEach((area, areaIndex) => {
    if (!availableAreas.has(areaIndex)) return;
    items.forEach(item => {
      positions.push({
        areaIndex,
        itemId: item.id,
        areaName: area.name || `Area ${areaIndex + 1}`,
        itemActivity: item.activity || item.name || "-",
      });
    });
  });
  return positions;
}

// Calculate agronomy monitoring progress
function calculateAgronomyProgress(trial, availableAreaIndexes = null) {
  const items = getTrialAgronomyItems(trial);
  const areas = trial.areas || [];
  const responses = trial.agronomyResponses || {};
  const allowed = Array.isArray(availableAreaIndexes)
    ? new Set(availableAreaIndexes)
    : null;
  let total = 0, completed = 0;
  areas.forEach((_, areaIndex) => {
    if (allowed && !allowed.has(areaIndex)) return;
    items.forEach(item => {
      total++;
      const resp = responses[areaIndex]?.[item.id];
      if (resp && resp.applicationDate && resp.photos && resp.photos.length > 0) completed++;
    });
  });
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, percentage };
}

// Combined Observation + Agronomy progress
function calculateCombinedTrialProgress(trial) {
  const obs = calculateTrialProgress(trial);
  const hasAgronomy = trial.agronomyMonitoring && trial.agronomyItems && trial.agronomyItems.length > 0;
  const agro = hasAgronomy ? calculateAgronomyProgress(trial) : { completed: 0, total: 0, percentage: 0 };
  const total = obs.total + agro.total;
  const completed = obs.completed + agro.completed;
  return {
    completed, total,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    obs, agro,
  };
}

// Check if an agronomy item is complete
function isAgronomyItemComplete(areaIndex, itemId) {
  const resp = agronomyMonitoringState.responses[areaIndex]?.[itemId];
  return !!(resp && resp.applicationDate && resp.photos && resp.photos.length > 0);
}

// Calculate expected date for a DAP value
function getDapExpectedDate(trial, areaIndex, dapMin) {
  const plantingDate = getAreaPlantingDate(trial, areaIndex);
  if (!plantingDate || dapMin == null) return null;
  const planting = new Date(plantingDate + "T00:00:00");
  if (isNaN(planting.getTime())) return null;
  planting.setDate(planting.getDate() + Number(dapMin));
  return planting;
}

// Start Agronomy Monitoring
async function startAgronomyMonitoring(trialId) {
  const trial = trialState.trials.find(t => t.id === trialId);
  if (!trial) return;

  if (!canRunTrialActivities(trial)) {
    showToast("Trial setup is incomplete (Field + Layouting + Planting Date). Agronomy cannot be started.", "warning");
    return;
  }

  // Lazy-load responses from Drive if not yet loaded
  const loaded = await ensureTrialResponsesLoaded(trialId);
  if (!loaded) return;

  // Check for remote updates before running
  if (typeof checkSingleTrialUpdates === "function") {
    try {
      showToast("Checking for updates...", "info", 2000);
      const hasUpdates = await checkSingleTrialUpdates(trialId);
      if (hasUpdates) {
        const proceed = await _promptTrialUpdateBeforeRun(trialId, "agronomy");
        if (!proceed) return;
      }
    } catch (e) {
      console.warn("Update check failed, continuing:", e);
    }
  }

  agronomyMonitoringState.currentTrialId = trialId;
  agronomyMonitoringState.currentTrial = trial;
  agronomyMonitoringState.responses = trial.agronomyResponses || {};
  agronomyMonitoringState.currentAreaIndex = null;
  agronomyMonitoringState.currentItemId = null;

  // Hide trial list, show agronomy interface
  const mgmtPanel = document.getElementById("trialManagementPanel");
  const archivePanel = document.getElementById("archivedTrialManagementPanel");
  if (mgmtPanel) mgmtPanel.classList.add("hidden");
  if (archivePanel) archivePanel.classList.add("hidden");
  document.getElementById("agronomyMonitoringInterface").classList.remove("hidden");

  // Modify topbar
  const topbar = document.querySelector(".topbar");
  const pageTitle = document.getElementById("pageTitle");
  const menuToggle = document.querySelector(".menu-toggle");
  const syncButtons = document.querySelectorAll("#loadDataBtn, #runTrialNavBtn, #userMenu");

  if (topbar) topbar.classList.add("run-trial-mode");
  if (pageTitle) pageTitle.textContent = `${trial.name}`;
  if (menuToggle) {
    menuToggle.onclick = confirmExitAgronomyMonitoring;
    menuToggle.innerHTML = '<span class="material-symbols-rounded">arrow_back</span>';
  }

  const runTrialNavBtn = document.getElementById("runTrialNavBtn");
  const runTrialSaveBtn = document.getElementById("runTrialSaveBtn");
  if (runTrialNavBtn) {
    runTrialNavBtn.style.display = "flex";
    runTrialNavBtn.classList.remove("hidden");
    runTrialNavBtn.onclick = openAgronomyMobileNav;
  }
  if (runTrialSaveBtn) {
    runTrialSaveBtn.style.display = "flex";
    runTrialSaveBtn.classList.remove("hidden");
    runTrialSaveBtn.onclick = manualSaveAgronomyProgress;
  }
  syncButtons.forEach(btn => {
    if (btn.id !== "runTrialNavBtn") btn.style.display = "none";
  });

  document.body.classList.add("run-trial-active", "sidebar-collapsed");

  renderAgronomyNavTree();
  renderAgronomyEmptyState();
}

// Exit Agronomy Monitoring
function exitAgronomyMonitoring() {
  agronomyMonitoringState.currentTrialId = null;
  agronomyMonitoringState.currentTrial = null;
  agronomyMonitoringState.responses = {};
  agronomyMonitoringState.currentAreaIndex = null;
  agronomyMonitoringState.currentItemId = null;

  const mgmtPanel = document.getElementById("trialManagementPanel");
  if (mgmtPanel) mgmtPanel.classList.remove("hidden");
  document.getElementById("agronomyMonitoringInterface").classList.add("hidden");
  renderTrials();

  // Restore topbar
  const topbar = document.querySelector(".topbar");
  const pageTitle = document.getElementById("pageTitle");
  const menuToggle = document.querySelector(".menu-toggle");
  const syncButtons = document.querySelectorAll("#loadDataBtn, #runTrialNavBtn, #userMenu");

  if (topbar) topbar.classList.remove("run-trial-mode");
  if (pageTitle) pageTitle.textContent = "Trial";
  if (menuToggle) {
    menuToggle.onclick = null;
    menuToggle.innerHTML = '<span class="material-symbols-rounded">menu</span>';
  }
  const runTrialNavBtn = document.getElementById("runTrialNavBtn");
  const runTrialSaveBtn = document.getElementById("runTrialSaveBtn");
  if (runTrialNavBtn) { runTrialNavBtn.style.display = "none"; runTrialNavBtn.classList.add("hidden"); runTrialNavBtn.onclick = openMobileNav; }
  if (runTrialSaveBtn) { runTrialSaveBtn.style.display = "none"; runTrialSaveBtn.classList.add("hidden"); runTrialSaveBtn.onclick = () => manualSaveProgress(); }
  syncButtons.forEach(btn => {
    btn.style.display = "";
  });

  document.body.classList.remove("run-trial-active", "sidebar-collapsed");
}

function confirmExitAgronomyMonitoring() {
  const doExit = () => {
    saveAgronomyResponseSilent();
    autoSaveAgronomyProgress();
    exitAgronomyMonitoring();
  };
  if (typeof showConfirmModal === "function") {
    showConfirmModal(
      "Exit Agronomy Monitoring",
      "Are you sure you want to exit? Current progress will be saved automatically.",
      doExit,
      "Exit",
      "btn-primary",
    );
  } else if (window.confirm("Exit Agronomy Monitoring? Progress will be saved.")) {
    doExit();
  }
}

// Render empty state
function renderAgronomyEmptyState() {
  const container = document.getElementById("agronomyQuestionCard");
  if (!container) return;
  container.innerHTML = `
    <div class="run-empty-state">
      <span class="material-symbols-rounded">local_florist</span>
      <p>Select an agronomy item from the navigation to start monitoring</p>
    </div>
  `;
}

// Render navigation tree
function renderAgronomyNavTree() {
  const container = document.getElementById("agronomyNavTree");
  const trial = agronomyMonitoringState.currentTrial;
  if (!container || !trial) return;

  const items = getTrialAgronomyItems(trial);
  const areas = trial.areas || [];
  const availableAreaIndexes = getTrialAvailableAreaIndexes(trial);
  const progress = calculateAgronomyProgress(trial, availableAreaIndexes);
  const availableAreas = new Set(availableAreaIndexes);

  let html = `
    <div class="run-nav-progress">
      <div class="run-nav-progress-bar">
        <div class="run-nav-progress-fill" style="width:${progress.percentage}%"></div>
      </div>
      <span class="run-nav-progress-text">${progress.completed}/${progress.total} (${progress.percentage}%)</span>
    </div>
  `;

  areas.forEach((area, areaIndex) => {
    const isAreaAvailable = availableAreas.has(areaIndex);
    const areaCompleted = items.filter(item => isAgronomyItemComplete(areaIndex, item.id)).length;
    const areaTotal = items.length;
    const isAreaActive = agronomyMonitoringState.currentAreaIndex === areaIndex;
    const areaClass = `${isAreaActive ? 'active' : ''} ${isAreaAvailable ? '' : 'disabled'}`.trim();

    html += `
      <div class="run-nav-area ${areaClass}">
        <div class="run-nav-area-header" onclick="toggleAgronomyNavArea(${areaIndex})">
          <span class="material-symbols-rounded run-nav-area-icon">location_on</span>
          <span class="run-nav-area-name">${escapeHtml(area.name || `Area ${areaIndex + 1}`)}</span>
          <span class="run-nav-area-count">${isAreaAvailable ? `${areaCompleted}/${areaTotal}` : 'Not Loaded'}</span>
          <span class="material-symbols-rounded run-nav-toggle-icon">expand_more</span>
        </div>
        <div class="run-nav-area-children ${isAreaActive ? '' : 'collapsed'}">
    `;

    if (!isAreaAvailable) {
      html += `
        <div class="run-nav-line disabled" onclick="selectAgronomyItem(${areaIndex}, '')">
          <span class="material-symbols-rounded run-nav-line-icon">lock</span>
          <div class="run-nav-line-text">
            <span class="run-nav-line-name">Area belum dimuat</span>
            <span class="run-nav-line-meta">Load area ini untuk menjalankan agronomy</span>
          </div>
        </div>
      `;
      html += `</div></div>`;
      return;
    }

    items.forEach(item => {
      const isActive = agronomyMonitoringState.currentAreaIndex === areaIndex &&
                        agronomyMonitoringState.currentItemId === item.id;
      const isComplete = isAgronomyItemComplete(areaIndex, item.id);
      const dapLabel = item.dapMin != null ? `DAP ${item.dapMin}${item.dapMax != null && item.dapMax !== item.dapMin ? '-' + item.dapMax : ''}` : '';

      // Check if it's too early for this item
      const expectedDate = getDapExpectedDate(trial, areaIndex, item.dapMin);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isTooEarly = expectedDate && today < expectedDate && !isComplete;

      html += `
        <div class="run-nav-line ${isActive ? 'active' : ''} ${isComplete ? 'complete' : ''} ${isTooEarly ? 'agronomy-nav-early' : ''}"
             onclick="selectAgronomyItem(${areaIndex}, '${item.id}')">
          <span class="material-symbols-rounded run-nav-line-icon">
            ${isComplete ? 'check_circle' : isTooEarly ? 'schedule' : 'radio_button_unchecked'}
          </span>
          <div class="run-nav-line-text">
            <span class="run-nav-line-name">${escapeHtml(item.activity || item.name || '-')}</span>
            ${dapLabel ? `<span class="run-nav-line-meta">${dapLabel}</span>` : ''}
          </div>
        </div>
      `;
    });

    html += `</div></div>`;
  });

  container.innerHTML = html;

  // Update mobile header progress
  const headerProgress = document.querySelector('#agronomyMonitoringInterface .nav-header-progress');
  if (headerProgress) {
    headerProgress.innerHTML = `
      <div class="run-nav-progress-bar">
        <div class="run-nav-progress-fill" style="width:${progress.percentage}%"></div>
      </div>
      <span class="run-nav-progress-text">${progress.completed}/${progress.total} (${progress.percentage}%)</span>
    `;
  }
}

function toggleAgronomyNavArea(areaIndex) {
  const trial = agronomyMonitoringState.currentTrial;
  if (trial && !isTrialAreaAvailableForRun(trial, areaIndex)) {
    showToast(getAreaUnavailableMessage(trial, areaIndex), "warning");
    return;
  }
  const container = document.getElementById("agronomyNavTree");
  const areas = container?.querySelectorAll(".run-nav-area");
  if (!areas || !areas[areaIndex]) return;
  const children = areas[areaIndex].querySelector(".run-nav-area-children");
  if (children) children.classList.toggle("collapsed");
}

// Select agronomy item
function selectAgronomyItem(areaIndex, itemId) {
  const trial = agronomyMonitoringState.currentTrial;
  if (trial && !isTrialAreaAvailableForRun(trial, areaIndex)) {
    showToast(getAreaUnavailableMessage(trial, areaIndex), "warning");
    return;
  }
  if (!itemId) return;

  // Auto-save previous response
  saveAgronomyResponseSilent();

  agronomyMonitoringState.currentAreaIndex = areaIndex;
  agronomyMonitoringState.currentItemId = itemId;

  renderAgronomyNavTree();
  renderAgronomyQuestionCard();
  closeAgronomyMobileNav();
}

// Render the question card
function renderAgronomyQuestionCard() {
  const container = document.getElementById("agronomyQuestionCard");
  const trial = agronomyMonitoringState.currentTrial;
  const areaIndex = agronomyMonitoringState.currentAreaIndex;
  const itemId = agronomyMonitoringState.currentItemId;

  if (!container || !trial || areaIndex === null || !itemId) {
    renderAgronomyEmptyState();
    return;
  }

  const area = trial.areas[areaIndex];
  const item = inventoryState.items.agronomy?.find(a => a.id === itemId);
  if (!area || !item) { renderAgronomyEmptyState(); return; }

  // Get existing response
  const resp = agronomyMonitoringState.responses[areaIndex]?.[itemId] || {};
  const existingDate = resp.applicationDate || new Date().toISOString().split("T")[0];
  const existingPhotos = resp.photos || [];

  // DAP info & warning
  const expectedDate = getDapExpectedDate(trial, areaIndex, item.dapMin);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isTooEarly = expectedDate && today < expectedDate;
  const expectedDateStr = expectedDate ? expectedDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;

  // DAP label
  const dapLabel = item.dapMin != null
    ? (item.dapMax != null && item.dapMax !== "" && item.dapMax !== item.dapMin
        ? `DAP ${item.dapMin}–${item.dapMax}`
        : `DAP ${item.dapMin}`)
    : null;

  // Build details chips
  const detailChips = [dapLabel, item.chemical, item.dose].filter(Boolean);

  // Navigation info
  const positions = getAllAgronomyNavPositions();
  const currentIdx = positions.findIndex(p => p.areaIndex === areaIndex && p.itemId === itemId);
  const isFirst = currentIdx <= 0;
  const isLast = currentIdx >= positions.length - 1;

  // Check if area boundary
  const prevPos = currentIdx > 0 ? positions[currentIdx - 1] : null;
  const nextPos = currentIdx < positions.length - 1 ? positions[currentIdx + 1] : null;
  const isPrevDifferentArea = prevPos && prevPos.areaIndex !== areaIndex;
  const isNextDifferentArea = nextPos && nextPos.areaIndex !== areaIndex;

  // Photo section
  const photoHTML = `
    <div class="run-photo-section">
      <div class="run-photo-label">
        <span class="material-symbols-rounded">photo_camera</span>
        Photo Documentation
      </div>
      <div class="run-photo-upload" id="agronomyPhotoContainer">
        ${existingPhotos.map((photo, idx) => renderPhotoThumb(photo, idx, "removeAgronomyPhoto", "openAgronomyPhotoPreview")).join("")}
        <label class="run-photo-add" onclick="showAgronomyPhotoUploadChoice(event)">
          <span class="material-symbols-rounded">add_a_photo</span>
          <span>Add</span>
        </label>
      </div>
    </div>
  `;

  container.innerHTML = `
    <div class="run-question-header">
      <div class="run-question-breadcrumb">
        ${escapeHtml(area.name || `Area ${areaIndex + 1}`)} › Agronomy Monitoring
      </div>
      <div class="run-question-title">${escapeHtml(item.activity || item.name || "-")}</div>
      ${detailChips.length > 0 ? `
        <div class="agronomy-detail-chips">
          ${detailChips.map(chip => `<span class="agronomy-chip">${escapeHtml(chip)}</span>`).join("")}
        </div>
      ` : ''}
    </div>

    ${isTooEarly ? `
      <div class="agronomy-dap-warning">
        <span class="material-symbols-rounded">warning</span>
        <p><strong>Not yet due</strong> — scheduled for <strong>${expectedDateStr}</strong> (${dapLabel}), it may be too early to apply.</p>
      </div>
    ` : ''}

    ${item.remark ? `
      <div class="agronomy-remark-box">
        <span class="material-symbols-rounded">info</span>
        <p>${escapeHtml(item.remark)}</p>
      </div>
    ` : ''}

    <div class="run-question-body">
      <div class="run-input-group">
        <label class="run-input-label">
          Actual Application Date
        </label>
        <input type="date" class="run-input-field" id="agronomyDateInput" value="${existingDate}">
      </div>
      ${photoHTML}
    </div>

    <div class="run-question-footer">
      <div class="run-nav-buttons">
        <div class="run-line-nav">
          ${isPrevDifferentArea && !isFirst ? `
            <button class="btn btn-secondary" onclick="navigateAgronomyPrev()">
              <span class="material-symbols-rounded">arrow_back</span>
              Prev Area
            </button>
          ` : `
            <button class="btn btn-secondary" onclick="navigateAgronomyPrev()" ${isFirst ? 'disabled' : ''}>
              <span class="material-symbols-rounded">arrow_back</span>
              Previous
            </button>
          `}
          ${isLast ? `
            <button class="btn btn-primary" onclick="finishAgronomyMonitoring()">
              Finish
              <span class="material-symbols-rounded">check_circle</span>
            </button>
          ` : isNextDifferentArea ? `
            <button class="btn btn-primary" onclick="navigateAgronomyNext()">
              Next Area
              <span class="material-symbols-rounded">arrow_forward</span>
            </button>
          ` : `
            <button class="btn btn-primary" onclick="navigateAgronomyNext()">
              Next
              <span class="material-symbols-rounded">arrow_forward</span>
            </button>
          `}
        </div>
      </div>
    </div>
  `;

  // Load external photo references
  loadExternalPhotos("#agronomyPhotoContainer");
}

// Navigation
function navigateAgronomyPrev() {
  saveAgronomyResponseSilent();
  autoSaveAgronomyProgress();

  const positions = getAllAgronomyNavPositions();
  const currentIdx = positions.findIndex(p =>
    p.areaIndex === agronomyMonitoringState.currentAreaIndex &&
    p.itemId === agronomyMonitoringState.currentItemId
  );
  if (currentIdx > 0) {
    const prev = positions[currentIdx - 1];
    agronomyMonitoringState.currentAreaIndex = prev.areaIndex;
    agronomyMonitoringState.currentItemId = prev.itemId;
    renderAgronomyNavTree();
    renderAgronomyQuestionCard();
  }
}

function navigateAgronomyNext() {
  saveAgronomyResponseSilent();
  autoSaveAgronomyProgress();

  const positions = getAllAgronomyNavPositions();
  const currentIdx = positions.findIndex(p =>
    p.areaIndex === agronomyMonitoringState.currentAreaIndex &&
    p.itemId === agronomyMonitoringState.currentItemId
  );
  if (currentIdx < positions.length - 1) {
    const next = positions[currentIdx + 1];
    agronomyMonitoringState.currentAreaIndex = next.areaIndex;
    agronomyMonitoringState.currentItemId = next.itemId;
    renderAgronomyNavTree();
    renderAgronomyQuestionCard();
  }
}

// Save current response silently
function saveAgronomyResponseSilent() {
  const areaIndex = agronomyMonitoringState.currentAreaIndex;
  const itemId = agronomyMonitoringState.currentItemId;
  if (areaIndex === null || !itemId) return;

  const dateInput = document.getElementById("agronomyDateInput");
  const applicationDate = dateInput ? dateInput.value : "";

  if (!agronomyMonitoringState.responses[areaIndex]) {
    agronomyMonitoringState.responses[areaIndex] = {};
  }
  if (!agronomyMonitoringState.responses[areaIndex][itemId]) {
    agronomyMonitoringState.responses[areaIndex][itemId] = { applicationDate: "", photos: [], timestamp: "" };
  }

  agronomyMonitoringState.responses[areaIndex][itemId].applicationDate = applicationDate;
  agronomyMonitoringState.responses[areaIndex][itemId].timestamp = new Date().toISOString();
}

// Auto-save to storage and Drive
async function autoSaveAgronomyProgress() {
  if (agronomyAutoSaveInProgress) return;
  const trial = agronomyMonitoringState.currentTrial;
  if (!trial) return;

  agronomyAutoSaveInProgress = true;

  const saveIcon = document.querySelector('.run-save-icon');
  const saveIconSymbol = saveIcon?.querySelector('.material-symbols-rounded');
  if (saveIcon) { saveIcon.classList.add('saving'); saveIcon.disabled = true; }
  if (saveIconSymbol) { saveIconSymbol.textContent = 'cached'; }

  try {
    trial.agronomyResponses = agronomyMonitoringState.responses;
    trial.updatedAt = new Date().toISOString();

    const idx = trialState.trials.findIndex(t => t.id === trial.id);
    if (idx !== -1) trialState.trials[idx] = trial;

    if (typeof saveLocalCache === "function") {
      saveLocalCache("trials", { trials: trialState.trials });
    }

    // Save to Drive (full agronomy responses file)
    const areaIndex = agronomyMonitoringState.currentAreaIndex;
    const itemId = agronomyMonitoringState.currentItemId;

    if (areaIndex !== null && itemId) {
      const item = inventoryState.items.agronomy?.find(a => a.id === itemId);
      const area = trial.areas?.[areaIndex];
      const trialName = trial.name || "Trial";
      const areaName = area?.name || `Area ${areaIndex + 1}`;
      const itemName = item?.activity || "Item";

      enqueueSync({
        label: `Saving ${trialName} · ${areaName} · ${itemName}`,
        fileKey: `${trial.id}~agronomy~${areaIndex}`,
        run: () => saveAreaAgronomyToDrive(trial, areaIndex),
      });
    } else {
      enqueueSync({
        label: `Saving ${trial.name} agronomy`,
        run: () => saveAllAgronomyResponsesToDrive(trial),
      });
    }

    renderAgronomyNavTree();

    // Update denormalized progress summary in meta.json (debounced)
    enqueueSync({
      label: `Updating progress summary: ${trial.name}`,
      fileKey: `${trial.id}~meta-progress`,
      run: () => saveTrialToGoogleDrive(trial),
    });

    // Keep dashboard in sync even during agronomy monitoring
    renderDashboardTrialProgress();
    if (typeof refreshReminderViewsRealtime === "function") {
      refreshReminderViewsRealtime();
    }
  } finally {
    setTimeout(() => {
      agronomyAutoSaveInProgress = false;
      if (saveIcon) { saveIcon.classList.remove('saving'); saveIcon.disabled = false; }
      if (saveIconSymbol) { saveIconSymbol.textContent = 'save'; }
    }, 500);
  }
}

// Save single agronomy response to Drive — redirects to consolidated area save
async function saveAgronomyResponseToDrive(trial, areaIndex, itemId) {
  return saveAreaAgronomyToDrive(trial, areaIndex);
}

// Save ALL agronomy responses for a single area as one consolidated file: {areaIndex}~agronomy.json
async function saveAreaAgronomyToDrive(trial, areaIndex) {
  const areaAgronomy = trial.agronomyResponses?.[areaIndex];
  if (!areaAgronomy || Object.keys(areaAgronomy).length === 0) return;

  const rootFolderId = await getTrialsFolderId();
  const trialFolderId = await getOrCreateFolder(trial.id, rootFolderId);
  const agronomyFolderId = await getOrCreateFolder("agronomy", trialFolderId);

  const fileName = `${areaIndex}~agronomy.json`;
  await uploadJsonFile(fileName, agronomyFolderId, areaAgronomy);
}

// Save all agronomy responses to Drive (one consolidated file per area)
async function saveAllAgronomyResponsesToDrive(trial) {
  const responses = trial.agronomyResponses || {};
  for (const areaIndex of Object.keys(responses)) {
    await saveAreaAgronomyToDrive(trial, areaIndex);
  }
}

// Manual save
function manualSaveAgronomyProgress() {
  saveAgronomyResponseSilent();
  autoSaveAgronomyProgress();
  showToast("Agronomy progress saved", "success");
}

// Photo upload
function showAgronomyPhotoUploadChoice(event) {
  event.preventDefault();
  event.stopPropagation();

  const existing = document.querySelector('.photo-upload-choice-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'photo-upload-choice-overlay';
  overlay.innerHTML = `
    <div class="photo-upload-choice">
      <div class="photo-upload-choice-header"><p>Add Photo</p></div>
      <div class="photo-upload-choice-options">
        <button class="photo-upload-choice-btn" id="agrPhotoCamera">
          <span class="material-symbols-rounded">photo_camera</span>
          Take Photo
        </button>
        <button class="photo-upload-choice-btn" id="agrPhotoFile">
          <span class="material-symbols-rounded">photo_library</span>
          Choose from Gallery
        </button>
      </div>
      <button class="photo-upload-choice-cancel" onclick="closePhotoUploadChoice()">Cancel</button>
    </div>
  `;

  overlay.addEventListener('click', e => { if (e.target === overlay) closePhotoUploadChoice(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('active'));

  overlay.querySelector('#agrPhotoCamera').addEventListener('click', () => {
    closePhotoUploadChoice();
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment';
    input.onchange = handleAgronomyPhotoUpload;
    input.click();
  });
  overlay.querySelector('#agrPhotoFile').addEventListener('click', () => {
    closePhotoUploadChoice();
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = handleAgronomyPhotoUpload;
    input.click();
  });
}

function handleAgronomyPhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const photoData = e.target.result;
    const areaIndex = agronomyMonitoringState.currentAreaIndex;
    const itemId = agronomyMonitoringState.currentItemId;
    if (areaIndex === null || !itemId) return;

    if (!agronomyMonitoringState.responses[areaIndex]) {
      agronomyMonitoringState.responses[areaIndex] = {};
    }
    if (!agronomyMonitoringState.responses[areaIndex][itemId]) {
      agronomyMonitoringState.responses[areaIndex][itemId] = { applicationDate: "", photos: [], timestamp: "" };
    }

    agronomyMonitoringState.responses[areaIndex][itemId].photos.push(photoData);
    agronomyMonitoringState.responses[areaIndex][itemId].timestamp = new Date().toISOString();

    saveAgronomyResponseSilent();
    autoSaveAgronomyProgress();
    renderAgronomyQuestionCard();
  };
  reader.readAsDataURL(file);
  setTimeout(() => { event.target.value = ""; }, 100);
}

function removeAgronomyPhoto(idx) {
  const areaIndex = agronomyMonitoringState.currentAreaIndex;
  const itemId = agronomyMonitoringState.currentItemId;
  if (areaIndex === null || !itemId) return;

  const resp = agronomyMonitoringState.responses[areaIndex]?.[itemId];
  if (!resp || !resp.photos) return;
  const removed = resp.photos.splice(idx, 1)[0];

  // If the removed photo was an external reference, delete from Drive
  if (removed && typeof removed === "object" && removed.fileId) {
    deleteDriveFileById(removed.fileId).catch(e => console.warn("Failed to delete agronomy photo file:", e));
  }

  resp.timestamp = new Date().toISOString();

  autoSaveAgronomyProgress();
  renderAgronomyQuestionCard();
}

function openAgronomyPhotoPreview(idx) {
  const areaIndex = agronomyMonitoringState.currentAreaIndex;
  const itemId = agronomyMonitoringState.currentItemId;
  const resp = agronomyMonitoringState.responses[areaIndex]?.[itemId];
  if (!resp || !resp.photos || !resp.photos[idx]) return;

  const photo = resp.photos[idx];
  const modal = document.getElementById("photoPreviewModal");
  const img = modal?.querySelector("img");
  if (modal && img) {
    const src = getPhotoSrc(photo);
    if (src) {
      img.src = src;
    } else if (typeof photo === "object" && photo.fileId) {
      img.src = "";
      img.dataset.photoFileid = photo.fileId;
      loadExternalPhotos(modal);
    }
    modal.classList.remove("hidden");
    modal.classList.add("active");
    lockBodyScroll();
  }
}

// Finish agronomy monitoring
function finishAgronomyMonitoring() {
  saveAgronomyResponseSilent();
  autoSaveAgronomyProgress();

  const trial = agronomyMonitoringState.currentTrial;
  const progress = calculateAgronomyProgress(trial, getTrialAvailableAreaIndexes(trial));

  const existing = document.querySelector('.finish-trial-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'finish-trial-overlay';
  overlay.innerHTML = `
    <div class="finish-trial-popup">
      <div class="finish-trial-icon">
        <span class="material-symbols-rounded">check_circle</span>
      </div>
      <h3>Agronomy Monitoring Complete!</h3>
      <p>You have completed <strong>${progress.completed}/${progress.total}</strong> items (${progress.percentage}%). What would you like to do?</p>
      <div class="finish-trial-actions">
        <button class="btn btn-primary" onclick="closeFinishTrialPopup(); exitAgronomyMonitoring();">
          <span class="material-symbols-rounded">done_all</span>
          Finish & Back to Trials
        </button>
        <button class="btn btn-secondary" onclick="closeFinishTrialPopup(); navigateAgronomyFirst();">
          <span class="material-symbols-rounded">replay</span>
          Review from First Item
        </button>
        <button class="btn btn-secondary" onclick="closeFinishTrialPopup();">
          <span class="material-symbols-rounded">arrow_back</span>
          Continue Editing
        </button>
      </div>
    </div>
  `;

  overlay.addEventListener('click', e => { if (e.target === overlay) closeFinishTrialPopup(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('active'));
}

function navigateAgronomyFirst() {
  const positions = getAllAgronomyNavPositions();
  if (positions.length > 0) {
    agronomyMonitoringState.currentAreaIndex = positions[0].areaIndex;
    agronomyMonitoringState.currentItemId = positions[0].itemId;
    renderAgronomyNavTree();
    renderAgronomyQuestionCard();
  }
}

// Mobile nav helpers
function openAgronomyMobileNav() {
  const container = document.querySelector('#agronomyMonitoringInterface .run-trial-container');
  const nav = document.querySelector('#agronomyMonitoringInterface .run-trial-nav');
  const scrim = document.getElementById('agronomyMobileNavScrim');
  const navBtn = document.getElementById('runTrialNavBtn');
  if (nav && nav.classList.contains('open')) { closeAgronomyMobileNav(); return; }
  if (nav) nav.classList.add('open');
  if (container) container.classList.add('mobile-nav-open');
  if (scrim) scrim.classList.add('open');
  document.body.classList.add('no-scroll', 'mobile-nav-active');
  if (navBtn) navBtn.querySelector('.material-symbols-rounded').textContent = 'close';
}

function closeAgronomyMobileNav() {
  const container = document.querySelector('#agronomyMonitoringInterface .run-trial-container');
  const nav = document.querySelector('#agronomyMonitoringInterface .run-trial-nav');
  const scrim = document.getElementById('agronomyMobileNavScrim');
  const navBtn = document.getElementById('runTrialNavBtn');
  if (nav) nav.classList.remove('open');
  if (container) container.classList.remove('mobile-nav-open');
  if (scrim) scrim.classList.remove('open');
  document.body.classList.remove('no-scroll', 'mobile-nav-active');
  if (navBtn) navBtn.querySelector('.material-symbols-rounded').textContent = 'menu';
}

// ===========================
// END AGRONOMY MONITORING
// ===========================

// Initialize Run Trial tab
function initializeRunTrial() {
  setupRunTrialEventListeners();
}

// Render list of trials that can be run
function renderRunTrialList() {
  const container = document.getElementById("runTrialList");
  const header = document.querySelector("#runTrialSelection .run-trial-header");
  if (!container) return;

  // Filter out archived trials from the run trial list
  const runnableTrials = trialState.trials.filter(
    (t) => !t.archived && canRunTrialActivities(t)
  );

  if (runnableTrials.length === 0) {
    if (header) header.classList.remove("hidden");
    container.innerHTML = `
      <div class="empty-state run-empty-grid">
        <span class="material-symbols-rounded">science</span>
        <p>No trials available to run. Complete Field, Layouting, and Planting Date first.</p>
      </div>
    `;
    return;
  }

  if (header) header.classList.add("hidden");

  container.innerHTML = runnableTrials
    .map((trial) => {
      const areaCount = trial.areas?.length || 0;
      const paramCount = getRunnableTrialParameters(trial).length;
      const totalLines = trial.areas?.reduce((sum, area) => {
        return sum + (area.layout?.lines?.length || 0);
      }, 0) || 0;

      // Calculate progress using the correct response format
      const progress = getTrialProgress(trial);
      const progressPercent = progress.percentage;
      const statusText = progressPercent === 0 ? 'Not Started' : progressPercent === 100 ? 'Completed' : 'In Progress';
      const statusColor = progressPercent === 0 ? 'var(--text-secondary)' : progressPercent === 100 ? 'var(--success)' : 'var(--warning)';

      return `
        <div class="run-trial-card" data-trial-id="${trial.id}">
          <div class="run-trial-card-header">
            <div class="run-trial-card-icon">
              <svg class="progress-circle" width="64" height="64" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="28" class="progress-circle-bg"></circle>
                <circle cx="32" cy="32" r="28" class="progress-circle-fill" 
                        style="stroke-dasharray: ${progressPercent * 1.75} 175; stroke: ${getProgressGradientColor(progressPercent)}"></circle>
                <text x="32" y="37" class="progress-circle-text" text-anchor="middle">${progressPercent}%</text>
              </svg>
            </div>
            <div class="run-trial-card-body">
              <div class="run-trial-card-title">${escapeHtml(trial.name)}</div>
              <div class="run-trial-card-meta">${escapeHtml(trial.cropName || "")} · ${escapeHtml(trial.trialType || "")}</div>
            </div>
            <!--
            <div class="run-trial-card-right">
              <div class="run-trial-status-label" style="color: ${statusColor}">${statusText}</div>
              <div class="run-trial-status-percent">${progressPercent}%</div>
            </div>
            -->
          </div>
          <!--
          <div class="run-trial-card-stats">
            <div class="run-trial-stat">
              <span class="material-symbols-rounded">location_on</span>
              ${areaCount} area(s)
            </div>
            <div class="run-trial-stat">
              <span class="material-symbols-rounded">assignment</span>
              ${paramCount} param(s)
            </div>
            <div class="run-trial-stat">
              <span class="material-symbols-rounded">grass</span>
              ${totalLines} line(s)
            </div>
            <div class="run-trial-stat">
              <span class="material-symbols-rounded">check_circle</span>
              ${progress.completed}/${progress.total}
            </div>
          </div>
          -->
        </div>
      `;
    })
    .join("");

  // Add click listeners
  container.querySelectorAll(".run-trial-card").forEach((card) => {
    card.addEventListener("click", () => {
      const trialId = card.dataset.trialId;
      startRunTrial(trialId);
    });
  });
}

// Setup event listeners for Run Trial
function setupRunTrialEventListeners() {
  if (setupRunTrialEventListeners.initialized) return;
  setupRunTrialEventListeners.initialized = true;
  const backBtn = document.getElementById("runTrialBackBtn");

  if (backBtn) {
    backBtn.addEventListener("click", confirmExitRunTrial);
  }
  
  // Add keyboard navigation for run trial (arrow keys)
  document.addEventListener("keydown", handleRunTrialKeyboard);
}

// Handle keyboard navigation during run trial
function handleRunTrialKeyboard(e) {
  // Only handle if in run trial mode and not in an input field
  const isInRunTrialMode = document.body.classList.contains("run-trial-active");
  const isInInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT';
  
  if (!isInRunTrialMode || isInInput) return;
  
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    navigateNextLine();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    navigatePrevLine();
  }
}

// Start running a trial
async function startRunTrial(trialId) {
  const trial = trialState.trials.find((t) => t.id === trialId);
  if (!trial) return;

  if (!canRunTrialActivities(trial)) {
    showToast("Trial setup is incomplete (Field + Layouting + Planting Date). Observation cannot be started.", "warning");
    return;
  }

  if (getRunnableTrialParameters(trial).length === 0) {
    showToast("This trial has no runnable observation parameters (formula parameters are excluded)", "warning");
    return;
  }

  // Lazy-load responses from Drive if not yet loaded
  const loaded = await ensureTrialResponsesLoaded(trialId);
  if (!loaded) return;

  // Check for remote updates before running
  if (typeof checkSingleTrialUpdates === "function") {
    try {
      showToast("Checking for updates...", "info", 2000);
      const hasUpdates = await checkSingleTrialUpdates(trialId);
      if (hasUpdates) {
        const proceed = await _promptTrialUpdateBeforeRun(trialId, "observation");
        if (!proceed) return;
      }
    } catch (e) {
      console.warn("Update check failed, continuing:", e);
    }
  }

  runTrialState.currentTrialId = trialId;
  runTrialState.currentTrial = trial;
  runTrialState.responses = trial.responses || {};
  runTrialState.currentAreaIndex = null;
  runTrialState.currentParamId = null;
  runTrialState.currentLineId = null;
  runTrialState.currentRepIndex = null;

  // Hide trial list panels, show run interface
  const mgmtPanel = document.getElementById("trialManagementPanel");
  const archivePanel = document.getElementById("archivedTrialManagementPanel");
  if (mgmtPanel) mgmtPanel.classList.add("hidden");
  if (archivePanel) archivePanel.classList.add("hidden");
  document.getElementById("runTrialInterface").classList.remove("hidden");
  
  // Modify topbar for run trial mode
  const topbar = document.querySelector(".topbar");
  const pageTitle = document.getElementById("pageTitle");
  const menuToggle = document.querySelector(".menu-toggle");
  const syncButtons = document.querySelectorAll("#loadDataBtn, #runTrialNavBtn, #userMenu");
  
  if (topbar) topbar.classList.add("run-trial-mode");
  if (pageTitle) pageTitle.textContent = trial.name;
  if (menuToggle) {
    menuToggle.onclick = confirmExitRunTrial;
    menuToggle.innerHTML = '<span class="material-symbols-rounded">arrow_back</span>';
  }
  const runTrialNavBtn = document.getElementById("runTrialNavBtn");
  const runTrialSaveBtn = document.getElementById("runTrialSaveBtn");
  if (runTrialNavBtn) { runTrialNavBtn.style.display = "flex"; runTrialNavBtn.classList.remove("hidden"); }
  if (runTrialSaveBtn) { runTrialSaveBtn.style.display = "flex"; runTrialSaveBtn.classList.remove("hidden"); }
  // Hide sync buttons in run trial mode
  syncButtons.forEach(btn => {
    if (btn.id !== "runTrialNavBtn") btn.style.display = "none";
  });

  document.body.classList.add("run-trial-active", "sidebar-collapsed");

  // Render navigation tree
  renderRunTrialNavTree();
  updateRunTrialProgress();

  // Show empty state initially
  renderEmptyQuestionState();
}

// Exit run trial mode
function exitRunTrial() {
  runTrialState.currentTrialId = null;
  runTrialState.currentTrial = null;
  runTrialState.responses = {};
  runTrialState.currentAreaIndex = null;
  runTrialState.currentParamId = null;
  runTrialState.currentLineId = null;
  runTrialState.currentRepIndex = null;

  // Show trial list panels, hide run interface
  const mgmtPanel = document.getElementById("trialManagementPanel");
  if (mgmtPanel) mgmtPanel.classList.remove("hidden");
  document.getElementById("runTrialInterface").classList.add("hidden");
  // Re-render to show updated progress
  renderTrials();

  // Restore topbar to normal state
  const topbar = document.querySelector(".topbar");
  const pageTitle = document.getElementById("pageTitle");
  const menuToggle = document.querySelector(".menu-toggle");
  const syncButtons = document.querySelectorAll("#loadDataBtn, #runTrialNavBtn, #userMenu");
  
  if (topbar) topbar.classList.remove("run-trial-mode");
  if (pageTitle) pageTitle.textContent = "Trial";
  if (menuToggle) {
    menuToggle.onclick = null;
    menuToggle.innerHTML = '<span class="material-symbols-rounded">menu</span>';
  }
  const runTrialNavBtn = document.getElementById("runTrialNavBtn");
  const runTrialSaveBtn = document.getElementById("runTrialSaveBtn");
  if (runTrialNavBtn) { runTrialNavBtn.style.display = "none"; runTrialNavBtn.classList.add("hidden"); }
  if (runTrialSaveBtn) { runTrialSaveBtn.style.display = "none"; runTrialSaveBtn.classList.add("hidden"); }
  // Show sync buttons again
  syncButtons.forEach(btn => {
    btn.style.display = "";
  });

  document.body.classList.remove("run-trial-active", "sidebar-collapsed");
}

function confirmExitRunTrial() {
  const doExit = () => {
    if (hasResponseChanges()) {
      saveCurrentResponseSilent();
      autoSaveProgress();
    }
    exitRunTrial();
  };

  if (typeof showConfirmModal === "function") {
    showConfirmModal(
      "Exit Run Trial",
      "Are you sure you want to exit? Current progress will be saved automatically.",
      doExit,
      "Exit",
      "btn-primary",
    );
  } else if (window.confirm("Are you sure you want to exit? Current progress will be saved automatically.")) {
    doExit();
  }
}

// Render navigation tree
function renderRunTrialNavTree() {
  const container = document.getElementById("runTrialNavTree");
  const trial = runTrialState.currentTrial;
  if (!container || !trial) return;

  // Get runnable parameters (exclude formula type)
  const parameters = getRunnableTrialParameters(trial);
  const availableAreas = new Set(getTrialAvailableAreaIndexes(trial));

  // Calculate overall progress
  let overallTotal = 0;
  let overallCompleted = 0;
  trial.areas.forEach((area, areaIndex) => {
    if (!availableAreas.has(areaIndex)) return;
    if (!area.layout?.result) return;
    parameters.forEach(param => {
      const numSamples = param.numberOfSamples || 1;
      area.layout.result.forEach((rep, repIndex) => {
        rep.forEach(row => {
          row.forEach(cell => {
            if (cell) {
              overallTotal += numSamples;
              for (let si = 0; si < numSamples; si++) {
                const lineKey = `${cell.id}_${repIndex}_${si}`;
                if (hasResponse(areaIndex, param.id, lineKey)) overallCompleted++;
              }
            }
          });
        });
      });
    });
  });
  const overallPercentage = overallTotal > 0 ? Math.round((overallCompleted / overallTotal) * 100) : 0;

  let html = `
    <div class="run-nav-progress">
      <div class="run-nav-progress-bar">
        <div class="run-nav-progress-fill" style="width:${overallPercentage}%"></div>
      </div>
      <span class="run-nav-progress-text">${overallCompleted}/${overallTotal} (${overallPercentage}%)</span>
    </div>
  `;

  trial.areas.forEach((area, areaIndex) => {
    if (!area.layout?.result) return;
    const isAreaAvailable = availableAreas.has(areaIndex);

    const isAreaOpen = areaIndex === runTrialState.currentAreaIndex;
    const areaClass = `${isAreaOpen ? "" : "collapsed"} ${isAreaAvailable ? "" : "disabled"}`.trim();

    html += `
      <div class="run-nav-area ${areaClass}" data-area-index="${areaIndex}">
        <div class="run-nav-area-header" onclick="toggleNavArea(${areaIndex})">
          <span class="material-symbols-rounded expand-icon">expand_more</span>
          <span class="material-symbols-rounded">location_on</span>
          <span>${escapeHtml(area.name || `Area ${areaIndex + 1}`)}</span>
        </div>
        <div class="run-nav-area-content">
    `;

    if (!isAreaAvailable) {
      html += `
        <div class="run-nav-line disabled" onclick="selectLine(${areaIndex}, '', '', 0, 0)">
          <div class="run-nav-line-header">
            <span class="material-symbols-rounded">lock</span>
            <span>Area belum dimuat. Load area ini dulu.</span>
          </div>
        </div>
      `;
      html += `
        </div>
      </div>
      `;
      return;
    }

    parameters.forEach((param) => {
      const isParamOpen =
        isAreaOpen && runTrialState.currentParamId === param.id;
      const paramClass = isParamOpen ? "" : "collapsed";
      
      const numberOfSamples = param.numberOfSamples || 1;
      
      // Count completed samples in this param for this area
      let paramCompleted = 0;
      let paramTotal = 0;
      area.layout.result.forEach((rep, repIndex) => {
        rep.forEach((row) => {
          row.forEach((cell) => {
            if (cell) {
              paramTotal += numberOfSamples;
              for (let sampleIndex = 0; sampleIndex < numberOfSamples; sampleIndex++) {
                const lineKey = `${cell.id}_${repIndex}_${sampleIndex}`;
                if (hasResponse(areaIndex, param.id, lineKey)) {
                  paramCompleted += 1;
                }
              }
            }
          });
        });
      });

      html += `
        <div class="run-nav-param ${paramClass}" data-area-index="${areaIndex}" data-param-id="${param.id}">
          <div class="run-nav-param-header" onclick="toggleNavParam(${areaIndex}, '${param.id}')">
            <span class="material-symbols-rounded expand-icon">expand_more</span>
            <span>${escapeHtml(param.name)}</span>
            <span class="nav-param-initial">(${param.initial || ""})</span>
            <span class="nav-param-count">${paramCompleted}/${paramTotal}</span>
          </div>
          <div class="run-nav-reps">
      `;

      // Render replications from layout
      const layout = area.layout;
      layout.result.forEach((rep, repIndex) => {
        const isRepOpen =
          isParamOpen && runTrialState.currentRepIndex === repIndex;
        const repClass = isRepOpen ? "" : "collapsed";
        // Count lines in this replication
        let linesInRep = [];
        rep.forEach((row) => {
          row.forEach((cell) => {
            if (cell) linesInRep.push(cell);
          });
        });

        // Check if all lines in rep are completed (all samples)
        const allCompleted = linesInRep.every((cell) => {
          for (let sampleIndex = 0; sampleIndex < numberOfSamples; sampleIndex++) {
            const lineKey = `${cell.id}_${repIndex}_${sampleIndex}`;
            if (!hasResponse(areaIndex, param.id, lineKey)) {
              return false;
            }
          }
          return true;
        });
        const someCompleted = linesInRep.some((cell) => {
          for (let sampleIndex = 0; sampleIndex < numberOfSamples; sampleIndex++) {
            const lineKey = `${cell.id}_${repIndex}_${sampleIndex}`;
            if (hasResponse(areaIndex, param.id, lineKey)) {
              return true;
            }
          }
          return false;
        });

        html += `
          <div class="run-nav-rep ${repClass} ${allCompleted ? 'completed' : someCompleted ? 'partial' : ''}" data-area-index="${areaIndex}" data-param-id="${param.id}" data-rep-index="${repIndex}">
            <div class="run-nav-rep-header" onclick="toggleNavRep(${areaIndex}, '${param.id}', ${repIndex})">
              <span class="material-symbols-rounded expand-icon">expand_more</span>
              <span>Replication ${repIndex + 1}</span>
              ${allCompleted ? '<span class="material-symbols-rounded rep-status rep-status-icon rep-status-success">check_circle</span>' : someCompleted ? '<span class="material-symbols-rounded rep-status rep-status-icon rep-status-warning">radio_button_partial</span>' : ''}
            </div>
            <div class="run-nav-lines">
        `;

        rep.forEach((row) => {
          row.forEach((cell) => {
            if (!cell) return;
            const uniqueKey = `${areaIndex}_${param.id}_${cell.id}_${repIndex}`;
            
            // Check if all samples are completed
            let allSamplesCompleted = true;
            let someSamplesCompleted = false;
            for (let sampleIndex = 0; sampleIndex < numberOfSamples; sampleIndex++) {
              const lineKey = `${cell.id}_${repIndex}_${sampleIndex}`;
              if (hasResponse(areaIndex, param.id, lineKey)) {
                someSamplesCompleted = true;
              } else {
                allSamplesCompleted = false;
              }
            }
            
            const isLineOpen =
              isRepOpen &&
              runTrialState.currentLineId === cell.id;
            const lineClass = isLineOpen ? "" : "collapsed";

            html += `
              <div class="run-nav-line ${lineClass} ${allSamplesCompleted ? "completed" : ""}" data-area-index="${areaIndex}" data-param-id="${param.id}" data-line-id="${cell.id}" data-rep-index="${repIndex}">
                <div class="run-nav-line-header" onclick="toggleNavLine(${areaIndex}, '${param.id}', '${cell.id}', ${repIndex})">
                  <span class="material-symbols-rounded expand-icon">expand_more</span>
                  <span>${escapeHtml(cell.name)}</span>
                  ${allSamplesCompleted ? '<span class="material-symbols-rounded line-status line-status-icon">check_circle</span>' : someSamplesCompleted ? '<span class="material-symbols-rounded line-status line-status-icon line-status-partial">radio_button_partial</span>' : ""}
                </div>
            `;

            // Always render samples (whether 1 or more)
            html += '<div class="run-nav-samples">';
            for (let sampleIndex = 0; sampleIndex < numberOfSamples; sampleIndex++) {
              const lineKey = `${cell.id}_${repIndex}_${sampleIndex}`;
              const isSampleCompleted = hasResponse(areaIndex, param.id, lineKey);
              const isSampleActive =
                runTrialState.currentAreaIndex === areaIndex &&
                runTrialState.currentParamId === param.id &&
                runTrialState.currentLineId === cell.id &&
                runTrialState.currentRepIndex === repIndex &&
                runTrialState.currentSampleIndex === sampleIndex;

              html += `
                <div class="run-nav-sample ${isSampleCompleted ? "completed" : ""} ${isSampleActive ? "active" : ""}"
                     onclick="selectLine(${areaIndex}, '${param.id}', '${cell.id}', ${repIndex}, ${sampleIndex})">
                  <span>${sampleIndex + 1}</span>
                </div>
              `;
            }
            html += '</div>';

            html += '</div>';
          });
        });

        html += `
            </div>
          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Update mobile header progress
  const headerProgress = document.querySelector('#runTrialInterface .nav-header-progress');
  if (headerProgress) {
    headerProgress.innerHTML = `
      <div class="run-nav-progress-bar">
        <div class="run-nav-progress-fill" style="width:${overallPercentage}%"></div>
      </div>
      <span class="run-nav-progress-text">${overallCompleted}/${overallTotal} (${overallPercentage}%)</span>
    `;
  }
}

// Toggle area collapse
function toggleNavArea(areaIndex) {
  const trial = runTrialState.currentTrial;
  if (trial && !isTrialAreaAvailableForRun(trial, areaIndex)) {
    showToast(getAreaUnavailableMessage(trial, areaIndex), "warning");
    return;
  }
  const area = document.querySelector(`.run-nav-area[data-area-index="${areaIndex}"]`);
  if (area) area.classList.toggle("collapsed");
}

// Toggle param collapse
function toggleNavParam(areaIndex, paramId) {
  const param = document.querySelector(
    `.run-nav-param[data-area-index="${areaIndex}"][data-param-id="${paramId}"]`
  );
  if (param) param.classList.toggle("collapsed");
}

// Toggle replication collapse
function toggleNavRep(areaIndex, paramId, repIndex) {
  const rep = document.querySelector(
    `.run-nav-rep[data-area-index="${areaIndex}"][data-param-id="${paramId}"][data-rep-index="${repIndex}"]`
  );
  if (rep) rep.classList.toggle("collapsed");
}

// Toggle line collapse
function toggleNavLine(areaIndex, paramId, lineId, repIndex) {
  const line = document.querySelector(
    `.run-nav-line[data-area-index="${areaIndex}"][data-param-id="${paramId}"][data-line-id="${lineId}"][data-rep-index="${repIndex}"]`
  );
  if (line) line.classList.toggle("collapsed");
}

// Check if response exists
function hasResponse(areaIndex, paramId, lineKey) {
  const response = runTrialState.responses[areaIndex]?.[paramId]?.[lineKey];
  
  const param = inventoryState.items.parameters.find((p) => p.id === paramId);
  const hasValue = response?.value !== undefined && response?.value !== "";
  
  // Check photos from photoKey (not lineKey)
  let hasPhotos = false;
  if (param?.requirePhoto) {
    const photoMode = param.photoMode || "per-sample";
    // Extract repIndex and sampleIndex from lineKey
    // lineKey format: lineId_repIndex_sampleIndex
    // Split from the end to handle lineId with underscores
    const parts = lineKey.split("_");
    const sampleIndex = parts[parts.length - 1];
    const repIndex = parts[parts.length - 2];
    const lineId = parts.slice(0, parts.length - 2).join("_");
    
    let photoKey;
    if (photoMode === "per-line") {
      // Per-line: photoKey = lineId_repIndex
      photoKey = `${lineId}_${repIndex}`;
    } else {
      // Per-sample: photoKey = lineId_repIndex_sampleIndex (same as lineKey)
      photoKey = lineKey;
    }
    
    const photoResponse = runTrialState.responses[areaIndex]?.[paramId]?.[photoKey];
    hasPhotos = photoResponse?.photos?.length > 0;
  }

  // If photo is required, both value and photo must exist
  if (param?.requirePhoto) {
    return hasValue && hasPhotos;
  }

  return hasValue || hasPhotos;
}

// Select a line to answer
function selectLine(areaIndex, paramId, lineId, repIndex, sampleIndex = 0) {
  const trial = runTrialState.currentTrial;
  if (trial && !isTrialAreaAvailableForRun(trial, areaIndex)) {
    showToast(getAreaUnavailableMessage(trial, areaIndex), "warning");
    return;
  }
  if (!paramId || !lineId) {
    if (trial) showToast(getAreaUnavailableMessage(trial, areaIndex), "warning");
    return;
  }

  const isLineChange =
    runTrialState.currentAreaIndex !== null &&
    (runTrialState.currentAreaIndex !== areaIndex ||
      runTrialState.currentParamId !== paramId ||
      runTrialState.currentLineId !== lineId ||
      runTrialState.currentRepIndex !== repIndex);

  const proceed = () => {
    if (
      runTrialState.currentAreaIndex !== null &&
      runTrialState.currentParamId &&
      runTrialState.currentLineId
    ) {
      if (hasResponseChanges()) {
        saveCurrentResponseSilent();
        autoSaveProgress();
      }
    }

    runTrialState.currentAreaIndex = areaIndex;
    runTrialState.currentParamId = paramId;
    runTrialState.currentLineId = lineId;
    runTrialState.currentRepIndex = repIndex;
    runTrialState.currentSampleIndex = sampleIndex;

    // Re-render nav tree using current selection so the correct area/param/rep is expanded
    renderRunTrialNavTree();
    updateRunTrialProgress();
    
    // Update dashboard progress in real-time
    if (typeof renderDashboardTrialProgress === 'function') {
      renderDashboardTrialProgress();
    }

    // Close mobile nav if open
    closeMobileNav();

    renderQuestionCard();
  };

  if (isLineChange && runTrialState.currentLineId) {
    if (typeof showConfirmModal === "function") {
      showConfirmModal(
        "Change Entry",
        "Are you sure you want to move to another entry? Current progress will be saved automatically.",
        proceed,
        "Proceed",
        "btn-primary",
      );
    } else if (window.confirm("Are you sure you want to move to another entry? Current progress will be saved automatically.")) {
      proceed();
    }
    return;
  }

  proceed();

}

// Render empty question state
function renderEmptyQuestionState() {
  const container = document.getElementById("runTrialQuestion");
  container.innerHTML = `
    <div class="run-empty-state">
      <span class="material-symbols-rounded">touch_app</span>
      <p>Select an entry from the navigation to start recording data</p>
    </div>
  `;
}

// Render question card for current selection
function renderQuestionCard() {
  const container = document.getElementById("runTrialQuestion");
  const trial = runTrialState.currentTrial;
  const areaIndex = runTrialState.currentAreaIndex;
  const paramId = runTrialState.currentParamId;
  const lineId = runTrialState.currentLineId;
  const repIndex = runTrialState.currentRepIndex;
  const sampleIndex = runTrialState.currentSampleIndex || 0;

  if (areaIndex === null || !paramId || !lineId) {
    renderEmptyQuestionState();
    return;
  }

  const area = trial.areas[areaIndex];
  const param = inventoryState.items.parameters.find((p) => p.id === paramId);
  const line = area.layout.lines.find((l) => l.id === lineId);
  
  // Get parameter numberOfSamples to display sample indicator
  const numberOfSamples = param.numberOfSamples || 1;
  
  // Response key now includes sampleIndex
  const lineKey = `${lineId}_${repIndex}_${sampleIndex}`;

  if (!param || !line) {
    renderEmptyQuestionState();
    return;
  }

  const lines = getAllLinesList();
  const currentIdx = lines.findIndex(
    (l) =>
      l.areaIndex === areaIndex &&
      l.paramId === paramId &&
      l.lineId === lineId &&
      l.repIndex === repIndex &&
      l.sampleIndex === sampleIndex
  );

  const isFirstInArea = currentIdx >= 0 && (currentIdx === 0 || lines[currentIdx - 1].areaIndex !== areaIndex);
  const isLastInArea = currentIdx >= 0 && (currentIdx === lines.length - 1 || lines[currentIdx + 1].areaIndex !== areaIndex);
  const isLastOverall = currentIdx >= 0 && currentIdx === lines.length - 1;
  const nextLineButtonClass = isLastOverall ? "btn btn-primary" : "btn btn-secondary";
  const nextLineButtonLabel = isLastOverall ? "Finish" : "Next Entry";
  const nextLineButtonIcon = isLastOverall ? "check" : "arrow_forward";
  const nextLineButtonHandler = isLastOverall ? "finishRunTrialLastQuestion()" : "navigateNextLine()";

  // Get existing response for this sample
  const existingResponse = runTrialState.responses[areaIndex]?.[paramId]?.[lineKey] || {};
  const existingValue = existingResponse.value ?? "";
  const existingRemark = existingResponse.remark ?? "";
  
  // Get photos from photoKey (not lineKey)
  const photoMode = param.photoMode || "per-sample";
  const photoKey = photoMode === "per-line" 
    ? `${lineId}_${repIndex}` 
    : `${lineId}_${repIndex}_${sampleIndex}`;
  const existingPhotos = runTrialState.responses[areaIndex]?.[paramId]?.[photoKey]?.photos || [];
  
  // Store current state for change detection
  runTrialState.lastSavedValue = existingValue;
  runTrialState.lastSavedPhotosCount = existingPhotos.length;
  runTrialState.lastSavedRemark = existingRemark;

  let inputHTML = "";

  // Render input based on parameter type
  switch (param.type) {
    case "text":
      inputHTML = `
        <div class="run-input-group">
          <label class="run-input-label">Enter value</label>
          <div class="run-input-with-unit">
            <input type="text" class="run-input-text" id="runInputValue" value="${escapeHtml(existingValue)}" placeholder="Enter your answer...">
            ${param.unit ? `<span class="run-input-unit">${escapeHtml(param.unit)}</span>` : ""}
          </div>
        </div>
      `;
      break;

    case "number":
      inputHTML = `
        <div class="run-input-group">
          <label class="run-input-label">Enter number</label>
          <div class="run-input-with-unit">
            <input type="number" class="run-input-number" id="runInputValue" value="${existingValue}" placeholder="0">
            ${param.unit ? `<span class="run-input-unit">${escapeHtml(param.unit)}</span>` : ""}
          </div>
        </div>
      `;
      break;

    case "range":
      const rangeDef = param.rangeDefinition || "1-10";
      const [minVal, maxVal] = rangeDef.split("-").map(Number);
      const currentVal = existingValue || minVal;
      inputHTML = `
        <div class="run-input-group">
          <label class="run-input-label">
            Select value ${param.unit ? `<span class="run-input-hint">(${param.unit})</span>` : ""}
          </label>
          <div class="run-range-container">
            <div class="run-range-dual">
              <input type="range" class="run-range-input" id="runInputRange" 
                     min="${minVal}" max="${maxVal}" value="${currentVal}"
                     oninput="syncRangeInputs(this.value, 'range')">
              <input type="number" class="run-range-number" id="runInputValue" 
                     min="${minVal}" max="${maxVal}" value="${currentVal}"
                     oninput="syncRangeInputs(this.value, 'number')">
            </div>
            <div class="run-range-labels">
              <span>${minVal}</span>
              <span>${maxVal}</span>
            </div>
          </div>
        </div>
      `;
      break;

    case "radio":
      const radioOptions = (param.radioOptions || "").split(",").map((o) => o.trim()).filter(Boolean);
      inputHTML = `
        <div class="run-input-group">
          <label class="run-input-label">Select one option</label>
          <div class="run-options-list">
            ${radioOptions
              .map(
                (opt, idx) => `
              <label class="run-option-item ${existingValue === opt ? "selected" : ""}" onclick="selectRadioOption(this, '${escapeHtml(opt)}')">
                <input type="radio" name="runRadio" value="${escapeHtml(opt)}" ${existingValue === opt ? "checked" : ""}>
                <span>${escapeHtml(opt)}</span>
              </label>
            `
              )
              .join("")}
          </div>
        </div>
      `;
      break;

    case "checkbox":
      const checkOptions = (param.checkboxOptions || "").split(",").map((o) => o.trim()).filter(Boolean);
      const selectedChecks = existingValue ? existingValue.split(",") : [];
      inputHTML = `
        <div class="run-input-group">
          <label class="run-input-label">Select all that apply</label>
          <div class="run-options-list">
            ${checkOptions
              .map(
                (opt) => `
              <label class="run-option-item ${selectedChecks.includes(opt) ? "selected" : ""}" onclick="toggleCheckboxOption(this)">
                <input type="checkbox" name="runCheckbox" value="${escapeHtml(opt)}" ${selectedChecks.includes(opt) ? "checked" : ""}>
                <span>${escapeHtml(opt)}</span>
              </label>
            `
              )
              .join("")}
          </div>
        </div>
      `;
      break;

    default:
      inputHTML = `
        <div class="run-input-group">
          <label class="run-input-label">
            Enter value ${param.unit ? `<span class="run-input-hint">(${param.unit})</span>` : ""}
          </label>
          <textarea class="run-input-textarea" id="runInputValue" placeholder="Enter your observation...">${escapeHtml(existingValue)}</textarea>
        </div>
      `;
  }

  // Remark section (per sample)
  const remarkHTML = `
    <div class="run-remark-group">
      <label class="run-remark-label">
        <span class="material-symbols-rounded">note</span> Remark
      </label>
      <textarea class="run-remark-textarea" id="runRemarkValue" placeholder="Add a note for this sample (optional)...">${escapeHtml(existingRemark)}</textarea>
    </div>
  `;

  // Photo upload section
  let photoHTML = "";
  if (param.requirePhoto) {
    // Determine photo key based on photoMode
    const photoMode = param.photoMode || "per-sample";
    const photoKey = photoMode === "per-line" 
      ? `${lineId}_${repIndex}` // Per-line: same for all samples
      : `${lineId}_${repIndex}_${sampleIndex}`; // Per-sample: unique per sample
    
    // Get photos from appropriate key
    const photoResponse = runTrialState.responses[areaIndex]?.[paramId]?.[photoKey] || {};
    const photoList = photoResponse.photos || [];
    
    const modeLabel = photoMode === "per-line" ? "(1 photo for all samples)" : "(per sample)";
    
    photoHTML = `
      <div class="run-photo-section">
        <div class="run-photo-label">
          <span class="material-symbols-rounded">photo_camera</span>
          Photo Upload ${numberOfSamples > 1 ? `<span class="run-photo-mode-hint">${modeLabel}</span>` : ''}
          <span class="run-photo-required">* Required</span>
        </div>
        <div class="run-photo-upload" id="runPhotoContainer">
          ${photoList
            .map(
              (photo, idx) => renderPhotoThumb(photo, idx, "removePhoto", "openPhotoPreview")
            )
            .join("")}
          <label class="run-photo-add" onclick="showPhotoUploadChoice(event)">
            <span class="material-symbols-rounded">add_a_photo</span>
            <span>Add</span>
          </label>
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="run-question-header">
      <div class="run-question-breadcrumb">
        ${escapeHtml(area.name || `Area ${areaIndex + 1}`)} › ${escapeHtml(param.name)} › Rep ${repIndex + 1}
      </div>
      <div class="run-question-title">${escapeHtml(line.name)}</div>
      <div class="run-question-subtitle">${escapeHtml(param.name)} (${escapeHtml(param.initial || "")})</div>
      ${numberOfSamples > 1 ? `
        <div class="run-sample-indicator">
          Sample ${sampleIndex + 1} of ${numberOfSamples}
        </div>
      ` : ''}
    </div>
    <div class="run-question-body">
      ${inputHTML}
      ${photoHTML}
      ${remarkHTML}
    </div>
    <div class="run-question-footer">
      <div class="run-nav-buttons">
        ${numberOfSamples > 1 ? `
          <div class="run-sample-nav">
            <button class="btn btn-secondary" onclick="navigatePrevSample()" ${sampleIndex === 0 ? 'disabled' : ''}>
              <span class="material-symbols-rounded">arrow_back</span>
              Prev Sample
            </button>
            <button class="btn btn-secondary" onclick="navigateNextSample()" ${sampleIndex === numberOfSamples - 1 ? 'disabled' : ''}>
              Next Sample
              <span class="material-symbols-rounded">arrow_forward</span>
            </button>
          </div>
          <hr class="run-nav-divider">
        ` : ''}
        <div class="run-line-nav">
          <button class="btn btn-secondary" id="runPrevAreaBtn" onclick="navigatePrevArea()" style="display: none;">
            <span class="material-symbols-rounded">arrow_back</span>
            Previous Area
          </button>
          <button class="btn btn-secondary" id="runPrevLineBtn" onclick="navigatePrevLine()">
            <span class="material-symbols-rounded">arrow_back</span>
            Previous Entry
          </button>
          <button class="${nextLineButtonClass}" id="runNextLineBtn" onclick="${nextLineButtonHandler}">
            ${nextLineButtonLabel}
            <span class="material-symbols-rounded">${nextLineButtonIcon}</span>
          </button>
          <button class="btn btn-secondary" id="runNextAreaBtn" onclick="navigateNextArea()" style="display: none;">
            Next Area
            <span class="material-symbols-rounded">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  `;
  
  const prevLineBtn = document.getElementById("runPrevLineBtn");
  const nextLineBtn = document.getElementById("runNextLineBtn");
  const prevAreaBtn = document.getElementById("runPrevAreaBtn");
  const nextAreaBtn = document.getElementById("runNextAreaBtn");
  const prevAvailableArea = getPrevAvailableAreaIndex(trial, areaIndex);
  const nextAvailableArea = getNextAvailableAreaIndex(trial, areaIndex);
  
  if (isFirstInArea) {
    if (prevLineBtn) prevLineBtn.disabled = true;
    if (prevAreaBtn && prevAvailableArea !== null) prevAreaBtn.style.display = "flex";
  }
  
  if (isLastInArea) {
    if (nextLineBtn && !isLastOverall) nextLineBtn.disabled = true;
    if (nextAreaBtn && nextAvailableArea !== null) nextAreaBtn.style.display = "flex";
  }

  // Load external photo references
  loadExternalPhotos("#runPhotoContainer");
}

function finishRunTrialLastQuestion() {
  // Save current answer first
  if (hasResponseChanges()) {
    saveCurrentResponseSilent();
  }
  autoSaveProgress();
  
  // Calculate progress
  const lines = getAllLinesList();
  const completed = lines.filter((l) => {
    const lineKey = `${l.lineId}_${l.repIndex}_${l.sampleIndex}`;
    return hasResponse(l.areaIndex, l.paramId, lineKey);
  }).length;
  const total = lines.length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  
  // Show finish overlay
  const existing = document.querySelector('.finish-trial-overlay');
  if (existing) existing.remove();
  
  const overlay = document.createElement('div');
  overlay.className = 'finish-trial-overlay';
  overlay.innerHTML = `
    <div class="finish-trial-popup">
      <div class="finish-trial-icon">
        <span class="material-symbols-rounded">check_circle</span>
      </div>
      <h3>Observation Complete!</h3>
      <p>You have completed <strong>${completed}/${total}</strong> observations (${percentage}%). What would you like to do?</p>
      <div class="finish-trial-actions">
        <button class="btn btn-primary" onclick="confirmFinishRunTrial()">
          <span class="material-symbols-rounded">done_all</span>
          Finish & Back to Trials
        </button>
        <button class="btn btn-secondary" onclick="reviewFromFirstQuestion()">
          <span class="material-symbols-rounded">replay</span>
          Review from First Question
        </button>
        <button class="btn btn-secondary" onclick="closeFinishTrialPopup()">
          <span class="material-symbols-rounded">arrow_back</span>
          Continue Editing
        </button>
      </div>
    </div>
  `;
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeFinishTrialPopup();
  });
  
  document.body.appendChild(overlay);
  lockBodyScroll();
  requestAnimationFrame(() => overlay.classList.add('active'));
}

function closeFinishTrialPopup() {
  const overlay = document.querySelector('.finish-trial-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    unlockBodyScroll();
    setTimeout(() => overlay.remove(), 200);
  }
}

function confirmFinishRunTrial() {
  closeFinishTrialPopup();
  saveRunTrialProgress();
  exitRunTrial();
}

function reviewFromFirstQuestion() {
  closeFinishTrialPopup();
  const lines = getAllLinesList();
  if (lines.length > 0) {
    const first = lines[0];
    selectLine(first.areaIndex, first.paramId, first.lineId, first.repIndex, first.sampleIndex);
  }
}

// Radio option selection
function selectRadioOption(el, value) {
  document.querySelectorAll(".run-option-item").forEach((item) => item.classList.remove("selected"));
  el.classList.add("selected");
  el.querySelector("input").checked = true;
}

// Checkbox toggle
function toggleCheckboxOption(el) {
  el.classList.toggle("selected");
  el.querySelector("input").checked = el.classList.contains("selected");
}

// Sync range slider and number input
function syncRangeInputs(value, source) {
  const rangeInput = document.getElementById("runInputRange");
  const numberInput = document.getElementById("runInputValue");
  
  if (source === 'range' && numberInput) {
    numberInput.value = value;
  } else if (source === 'number' && rangeInput) {
    rangeInput.value = value;
  }
}

// Mobile nav toggle functions
function openMobileNav() {
  const container = document.querySelector('#runTrialInterface .run-trial-container');
  const nav = document.querySelector('#runTrialInterface .run-trial-nav');
  const scrim = document.getElementById('mobileNavScrim');
  const navBtn = document.getElementById('runTrialNavBtn');
  if (nav && nav.classList.contains('open')) { closeMobileNav(); return; }
  if (nav) nav.classList.add('open');
  if (container) container.classList.add('mobile-nav-open');
  if (scrim) scrim.classList.add('open');
  document.body.classList.add('no-scroll', 'mobile-nav-active');
  if (navBtn) navBtn.querySelector('.material-symbols-rounded').textContent = 'close';
}

function closeMobileNav() {
  const container = document.querySelector('#runTrialInterface .run-trial-container');
  const nav = document.querySelector('#runTrialInterface .run-trial-nav');
  const scrim = document.getElementById('mobileNavScrim');
  const navBtn = document.getElementById('runTrialNavBtn');
  if (nav) nav.classList.remove('open');
  if (container) container.classList.remove('mobile-nav-open');
  if (scrim) scrim.classList.remove('open');
  document.body.classList.remove('no-scroll', 'mobile-nav-active');
  if (navBtn) navBtn.querySelector('.material-symbols-rounded').textContent = 'menu';
}

// Show photo upload choice popup (camera vs file)
function showPhotoUploadChoice(event) {
  event.preventDefault();
  event.stopPropagation();
  
  // Remove any existing overlay
  const existing = document.querySelector('.photo-upload-choice-overlay');
  if (existing) existing.remove();
  
  const overlay = document.createElement('div');
  overlay.className = 'photo-upload-choice-overlay';
  overlay.innerHTML = `
    <div class="photo-upload-choice">
      <div class="photo-upload-choice-header">
        <p>Add Photo</p>
      </div>
      <div class="photo-upload-choice-options">
        <button class="photo-upload-choice-btn" id="photoChoiceCamera">
          <span class="material-symbols-rounded">photo_camera</span>
          Take Photo
        </button>
        <button class="photo-upload-choice-btn" id="photoChoiceFile">
          <span class="material-symbols-rounded">photo_library</span>
          Choose from Gallery
        </button>
      </div>
      <button class="photo-upload-choice-cancel" onclick="closePhotoUploadChoice()">Cancel</button>
    </div>
  `;
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePhotoUploadChoice();
  });
  
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('active'));
  
  // Camera option
  overlay.querySelector('#photoChoiceCamera').addEventListener('click', () => {
    closePhotoUploadChoice();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = handlePhotoUpload;
    input.click();
  });
  
  // File/gallery option
  overlay.querySelector('#photoChoiceFile').addEventListener('click', () => {
    closePhotoUploadChoice();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = handlePhotoUpload;
    input.click();
  });
}

function closePhotoUploadChoice() {
  const overlay = document.querySelector('.photo-upload-choice-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 200);
  }
}

// Handle photo upload
function handlePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const photoData = e.target.result;
    
    // Get current context
    const areaIndex = runTrialState.currentAreaIndex;
    const paramId = runTrialState.currentParamId;
    const lineId = runTrialState.currentLineId;
    const repIndex = runTrialState.currentRepIndex;
    const sampleIndex = runTrialState.currentSampleIndex || 0;
    
    if (areaIndex === null || !paramId || !lineId || repIndex === null) return;
    
    const param = inventoryState.items.parameters.find((p) => p.id === paramId);
    if (!param) return;
    
    // Determine photo key based on photoMode
    const photoMode = param.photoMode || "per-sample";
    const photoKey = photoMode === "per-line" 
      ? `${lineId}_${repIndex}` 
      : `${lineId}_${repIndex}_${sampleIndex}`;
    
    // Initialize response structure
    if (!runTrialState.responses[areaIndex]) {
      runTrialState.responses[areaIndex] = {};
    }
    if (!runTrialState.responses[areaIndex][paramId]) {
      runTrialState.responses[areaIndex][paramId] = {};
    }
    if (!runTrialState.responses[areaIndex][paramId][photoKey]) {
      runTrialState.responses[areaIndex][paramId][photoKey] = {
        value: "",
        photos: [],
        timestamp: new Date().toISOString(),
      };
    }

    // Compress to WebP and upload as binary file to Drive
    const trial = runTrialState.currentTrial;
    const photoId = (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID()
      : `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fileName = `${photoId}.webp`;

    // Insert a temporary placeholder so the UI shows a spinner immediately
    const placeholderIdx = runTrialState.responses[areaIndex][paramId][photoKey].photos.length;
    runTrialState.responses[areaIndex][paramId][photoKey].photos.push(photoData);
    runTrialState.responses[areaIndex][paramId][photoKey].timestamp = new Date().toISOString();

    // Save current input value to lineKey to prevent data loss
    saveCurrentResponseSilent();
    renderQuestionCard();

    // Upload binary in background, then replace inline with reference
    try {
      const { blob, width, height } = await compressPhotoToWebP(photoData, 1000, 0.7);
      const rootFolderId = await getTrialsFolderId();
      const trialFolderId = await getOrCreateFolder(trial.id, rootFolderId);
      const photosFolderId = await getOrCreateFolder("photos", trialFolderId);
      const newFileId = await uploadBinaryFileToDrive(fileName, photosFolderId, blob, "image/webp");

      // Replace inline base64 with reference object
      const photoRef = {
        photoId,
        fileId: newFileId,
        width,
        height,
        timestamp: new Date().toISOString(),
      };

      const photos = runTrialState.responses[areaIndex]?.[paramId]?.[photoKey]?.photos;
      if (photos && placeholderIdx < photos.length) {
        photos[placeholderIdx] = photoRef;
      }

      // Cache blob URL for immediate display
      const blobUrl = URL.createObjectURL(blob);
      _photoBlobCache[newFileId] = blobUrl;

      autoSaveProgress();
      renderQuestionCard();
    } catch (err) {
      console.warn("Binary photo upload failed, keeping inline:", err);
      // Photo stays as inline base64 — will auto-save with JSON
      autoSaveProgress();
    }
  };
  
  reader.readAsDataURL(file);
  
  // Clear input value after reading starts
  setTimeout(() => {
    event.target.value = "";
  }, 100);
}

// Remove photo
function removePhoto(idx) {
  const areaIndex = runTrialState.currentAreaIndex;
  const paramId = runTrialState.currentParamId;
  const lineId = runTrialState.currentLineId;
  const repIndex = runTrialState.currentRepIndex;
  const sampleIndex = runTrialState.currentSampleIndex || 0;
  
  if (areaIndex === null || !paramId || !lineId) return;
  
  const param = inventoryState.items.parameters.find((p) => p.id === paramId);
  if (!param) return;
  
  // Determine photo key based on photoMode
  const photoMode = param.photoMode || "per-sample";
  const photoKey = photoMode === "per-line" 
    ? `${lineId}_${repIndex}` 
    : `${lineId}_${repIndex}_${sampleIndex}`;
  
  // Get current photos from response
  const response = runTrialState.responses[areaIndex]?.[paramId]?.[photoKey];
  if (response && response.photos) {
    const removed = response.photos.splice(idx, 1)[0];
    
    // If the removed photo was an external reference, delete from Drive
    if (removed && typeof removed === "object" && removed.fileId) {
      deleteDriveFileById(removed.fileId).catch(e => console.warn("Failed to delete photo file:", e));
    }
    
    // Update timestamp
    response.timestamp = new Date().toISOString();
  }
  
  autoSaveProgress();
  renderQuestionCard();
}

// Photo preview state
let photoPreviewState = {
  photos: [],
  currentIndex: 0,
};

// Open photo preview modal
function openPhotoPreview(photoIndex = 0) {
  const areaIndex = runTrialState.currentAreaIndex;
  const paramId = runTrialState.currentParamId;
  const lineId = runTrialState.currentLineId;
  const repIndex = runTrialState.currentRepIndex;
  const sampleIndex = runTrialState.currentSampleIndex || 0;
  
  if (areaIndex === null || !paramId || !lineId) return;
  
  const param = inventoryState.items.parameters.find((p) => p.id === paramId);
  if (!param) return;
  
  // Determine photo key based on photoMode
  const photoMode = param.photoMode || "per-sample";
  const photoKey = photoMode === "per-line" 
    ? `${lineId}_${repIndex}` 
    : `${lineId}_${repIndex}_${sampleIndex}`;
  
  const photos = runTrialState.responses[areaIndex]?.[paramId]?.[photoKey]?.photos || [];
  if (photos.length === 0) return;
  
  photoPreviewState.photos = photos;
  photoPreviewState.currentIndex = Math.min(photoIndex, photos.length - 1);
  
  // Update modal
  const modal = document.getElementById("photoPreviewModal");
  const image = document.getElementById("photoPreviewImage");
  const counter = document.getElementById("photoCounter");
  const prevBtn = document.getElementById("prevPhotoBtn");
  const nextBtn = document.getElementById("nextPhotoBtn");
  
  if (modal && image && counter) {
    const currentPhoto = photos[photoPreviewState.currentIndex];
    const src = getPhotoSrc(currentPhoto);
    if (src) {
      image.src = src;
    } else if (typeof currentPhoto === "object" && currentPhoto.fileId) {
      image.src = "";
      image.dataset.photoFileid = currentPhoto.fileId;
      loadExternalPhotos(modal);
    }
    counter.textContent = `${photoPreviewState.currentIndex + 1} / ${photos.length}`;
    prevBtn.disabled = photoPreviewState.currentIndex === 0;
    nextBtn.disabled = photoPreviewState.currentIndex === photos.length - 1;
    modal.classList.remove("hidden");
    lockBodyScroll();
  }
}

// Close photo preview modal
function closePhotoPreview() {
  const modal = document.getElementById("photoPreviewModal");
  if (modal) {
    modal.classList.add("hidden");
    unlockBodyScroll();
  }
  photoPreviewState.photos = [];
  photoPreviewState.currentIndex = 0;
}

// Navigate photos in preview
function navigatePhotos(direction) {
  const photos = photoPreviewState.photos;
  if (photos.length === 0) return;
  
  if (direction === "prev" && photoPreviewState.currentIndex > 0) {
    photoPreviewState.currentIndex--;
  } else if (direction === "next" && photoPreviewState.currentIndex < photos.length - 1) {
    photoPreviewState.currentIndex++;
  }
  
  const image = document.getElementById("photoPreviewImage");
  const counter = document.getElementById("photoCounter");
  const prevBtn = document.getElementById("prevPhotoBtn");
  const nextBtn = document.getElementById("nextPhotoBtn");
  
  if (image && counter) {
    const currentPhoto = photos[photoPreviewState.currentIndex];
    const src = getPhotoSrc(currentPhoto);
    if (src) {
      image.src = src;
      delete image.dataset.photoFileid;
    } else if (typeof currentPhoto === "object" && currentPhoto.fileId) {
      image.src = "";
      image.dataset.photoFileid = currentPhoto.fileId;
      const modal = document.getElementById("photoPreviewModal");
      if (modal) loadExternalPhotos(modal);
    }
    counter.textContent = `${photoPreviewState.currentIndex + 1} / ${photos.length}`;
    prevBtn.disabled = photoPreviewState.currentIndex === 0;
    nextBtn.disabled = photoPreviewState.currentIndex === photos.length - 1;
  }
}

// Check if current response has changes from last saved state
function hasResponseChanges() {
  const areaIndex = runTrialState.currentAreaIndex;
  const paramId = runTrialState.currentParamId;
  const lineId = runTrialState.currentLineId;
  const repIndex = runTrialState.currentRepIndex;
  const sampleIndex = runTrialState.currentSampleIndex || 0;
  
  if (areaIndex === null || !paramId || !lineId) return false;
  
  const param = inventoryState.items.parameters.find((p) => p.id === paramId);
  if (!param) return false;

  // Get current value
  let currentValue = "";
  if (param.type === "radio") {
    const checked = document.querySelector('input[name="runRadio"]:checked');
    currentValue = checked ? checked.value : "";
  } else if (param.type === "checkbox") {
    const checked = document.querySelectorAll('input[name="runCheckbox"]:checked');
    currentValue = Array.from(checked).map((c) => c.value).join(",");
  } else {
    const input = document.getElementById("runInputValue");
    currentValue = input ? input.value : "";
  }
  
  // Get current photos count
  const photoMode = param.photoMode || "per-sample";
  const photoKey = photoMode === "per-line" 
    ? `${lineId}_${repIndex}` 
    : `${lineId}_${repIndex}_${sampleIndex}`;
  const currentPhotosCount = runTrialState.responses[areaIndex]?.[paramId]?.[photoKey]?.photos?.length || 0;
  
  // Get current remark
  const remarkInput = document.getElementById("runRemarkValue");
  const currentRemark = remarkInput ? remarkInput.value : "";
  
  // Compare with last saved state
  const valueChanged = currentValue !== (runTrialState.lastSavedValue || "");
  const photosChanged = currentPhotosCount !== (runTrialState.lastSavedPhotosCount || 0);
  const remarkChanged = currentRemark !== (runTrialState.lastSavedRemark || "");
  
  return valueChanged || photosChanged || remarkChanged;
}

// Save current response silently (for auto-save)
function saveCurrentResponseSilent() {
  const areaIndex = runTrialState.currentAreaIndex;
  const paramId = runTrialState.currentParamId;
  const lineId = runTrialState.currentLineId;
  const repIndex = runTrialState.currentRepIndex;
  const sampleIndex = runTrialState.currentSampleIndex || 0;
  
  if (areaIndex === null || !paramId || !lineId) return true;
  
  const param = inventoryState.items.parameters.find((p) => p.id === paramId);
  if (!param) return true;

  // Response key includes sampleIndex
  const lineKey = `${lineId}_${repIndex}_${sampleIndex}`;

  // Get value based on input type
  let value = "";
  if (param.type === "radio") {
    const checked = document.querySelector('input[name="runRadio"]:checked');
    value = checked ? checked.value : "";
  } else if (param.type === "checkbox") {
    const checked = document.querySelectorAll('input[name="runCheckbox"]:checked');
    value = Array.from(checked).map((c) => c.value).join(",");
  } else {
    const input = document.getElementById("runInputValue");
    value = input ? input.value : "";
  }

  // Handle photos based on photoMode (photos are already saved in handlePhotoUpload)
  let photos = [];
  if (param.requirePhoto) {
    const photoMode = param.photoMode || "per-sample";
    const photoKey = photoMode === "per-line" 
      ? `${lineId}_${repIndex}` // Per-line: same key for all samples
      : `${lineId}_${repIndex}_${sampleIndex}`; // Per-sample: unique key
    
    // Just get existing photos, don't append photoFiles (already saved)
    photos = runTrialState.responses[areaIndex]?.[paramId]?.[photoKey]?.photos || [];
    
    // Ensure photo key exists in response structure
    if (!runTrialState.responses[areaIndex]) {
      runTrialState.responses[areaIndex] = {};
    }
    if (!runTrialState.responses[areaIndex][paramId]) {
      runTrialState.responses[areaIndex][paramId] = {};
    }
    
    // Update photo key timestamp if it exists
    if (runTrialState.responses[areaIndex][paramId][photoKey]) {
      runTrialState.responses[areaIndex][paramId][photoKey].timestamp = new Date().toISOString();
    }
  }

  // Always save lineKey response with value (photos stored separately in photoKey)
  if (!runTrialState.responses[areaIndex]) {
    runTrialState.responses[areaIndex] = {};
  }
  if (!runTrialState.responses[areaIndex][paramId]) {
    runTrialState.responses[areaIndex][paramId] = {};
  }
  
  // Get remark value
  const remarkInput = document.getElementById("runRemarkValue");
  const remark = remarkInput ? remarkInput.value : "";

  // Preserve existing lineKey response or create new one
  const existingLineResponse = runTrialState.responses[areaIndex][paramId][lineKey] || {};
  
  // IMPORTANT: When photoKey === lineKey (per-sample mode), preserve existing photos
  const existingPhotos = existingLineResponse.photos || [];
  const responseObj = {
    value,
    photos: existingPhotos, // Preserve photos that may have been saved by handlePhotoUpload
    timestamp: new Date().toISOString(),
  };
  if (remark) responseObj.remark = remark;
  runTrialState.responses[areaIndex][paramId][lineKey] = responseObj;

  return true;
}

// Navigate to previous line (skip all samples, go directly to previous line)
function navigatePrevLine() {
  // Auto-save current response only if there are changes
  if (hasResponseChanges()) {
    saveCurrentResponseSilent();
    autoSaveProgress();
  }
  
  const lines = getAllLinesList();
  const currentLineId = runTrialState.currentLineId;
  const currentRepIndex = runTrialState.currentRepIndex;
  
  // Find first sample of current line
  const currentLineFirstSampleIdx = lines.findIndex(
    (l) =>
      l.areaIndex === runTrialState.currentAreaIndex &&
      l.paramId === runTrialState.currentParamId &&
      l.lineId === currentLineId &&
      l.repIndex === currentRepIndex &&
      l.sampleIndex === 0
  );
  
  if (currentLineFirstSampleIdx > 0) {
    // Go to previous entry (which is the last sample of previous line)
    const prev = lines[currentLineFirstSampleIdx - 1];
    // But we want first sample of that previous line, so find it
    const prevLineFirstSampleIdx = lines.findIndex(
      (l) =>
        l.areaIndex === prev.areaIndex &&
        l.paramId === prev.paramId &&
        l.lineId === prev.lineId &&
        l.repIndex === prev.repIndex &&
        l.sampleIndex === 0
    );
    
    if (prevLineFirstSampleIdx >= 0) {
      const target = lines[prevLineFirstSampleIdx];
      selectLine(target.areaIndex, target.paramId, target.lineId, target.repIndex, 0);
    }
  }
}

// Navigate to previous sample of the same line
function navigatePrevSample() {
  // Auto-save current response only if there are changes
  if (hasResponseChanges()) {
    saveCurrentResponseSilent();
    autoSaveProgress();
  }
  
  const sampleIndex = runTrialState.currentSampleIndex || 0;
  if (sampleIndex > 0) {
    selectLine(
      runTrialState.currentAreaIndex,
      runTrialState.currentParamId,
      runTrialState.currentLineId,
      runTrialState.currentRepIndex,
      sampleIndex - 1
    );
  }
}

// Navigate to next sample of the same line
function navigateNextSample() {
  // Auto-save current response only if there are changes
  if (hasResponseChanges()) {
    saveCurrentResponseSilent();
    autoSaveProgress();
  }
  
  const param = inventoryState.items.parameters.find((p) => p.id === runTrialState.currentParamId);
  const numberOfSamples = param?.numberOfSamples || 1;
  const sampleIndex = runTrialState.currentSampleIndex || 0;
  
  if (sampleIndex < numberOfSamples - 1) {
    selectLine(
      runTrialState.currentAreaIndex,
      runTrialState.currentParamId,
      runTrialState.currentLineId,
      runTrialState.currentRepIndex,
      sampleIndex + 1
    );
  }
}

// Navigate to previous area (go to last line of previous area)
function navigatePrevArea() {
  // Auto-save current response only if there are changes
  if (hasResponseChanges()) {
    saveCurrentResponseSilent();
    autoSaveProgress();
  }
  
  const currentAreaIndex = runTrialState.currentAreaIndex;
  if (currentAreaIndex <= 0) return;
  const prevAreaIndex = getPrevAvailableAreaIndex(runTrialState.currentTrial, currentAreaIndex);
  if (prevAreaIndex === null) return;
  
  const lines = getAllLinesList();
  const prevAreaLines = lines.filter(l => l.areaIndex === prevAreaIndex);
  
  if (prevAreaLines.length > 0) {
    const lastLine = prevAreaLines[prevAreaLines.length - 1];
    selectLine(lastLine.areaIndex, lastLine.paramId, lastLine.lineId, lastLine.repIndex, lastLine.sampleIndex);
  }
}

// Navigate to next area (go to first line of next area)
function navigateNextArea() {
  // Auto-save current response only if there are changes
  if (hasResponseChanges()) {
    saveCurrentResponseSilent();
    autoSaveProgress();
  }
  
  const trial = runTrialState.currentTrial;
  const currentAreaIndex = runTrialState.currentAreaIndex;
  if (currentAreaIndex >= trial.areas.length - 1) return;
  const nextAreaIndex = getNextAvailableAreaIndex(trial, currentAreaIndex);
  if (nextAreaIndex === null) return;
  
  const lines = getAllLinesList();
  const nextAreaLines = lines.filter(l => l.areaIndex === nextAreaIndex);
  
  if (nextAreaLines.length > 0) {
    const firstLine = nextAreaLines[0];
    selectLine(firstLine.areaIndex, firstLine.paramId, firstLine.lineId, firstLine.repIndex, firstLine.sampleIndex);
  }
}

// Navigate to next line (skip all samples, go directly to next line)
function navigateNextLine() {
  // Auto-save current response only if there are changes
  if (hasResponseChanges()) {
    saveCurrentResponseSilent();
    autoSaveProgress();
  }
  
  const lines = getAllLinesList();
  const currentLineId = runTrialState.currentLineId;
  const currentRepIndex = runTrialState.currentRepIndex;
  const currentParamId = runTrialState.currentParamId;
  const currentAreaIndex = runTrialState.currentAreaIndex;
  
  // Find last sample of current line
  const param = inventoryState.items.parameters.find((p) => p.id === currentParamId);
  const numberOfSamples = param?.numberOfSamples || 1;
  
  const currentLineLastSampleIdx = lines.findIndex(
    (l) =>
      l.areaIndex === currentAreaIndex &&
      l.paramId === currentParamId &&
      l.lineId === currentLineId &&
      l.repIndex === currentRepIndex &&
      l.sampleIndex === numberOfSamples - 1
  );
  
  if (currentLineLastSampleIdx >= 0 && currentLineLastSampleIdx < lines.length - 1) {
    // Next entry after last sample of current line is first sample of next line
    const next = lines[currentLineLastSampleIdx + 1];
    selectLine(next.areaIndex, next.paramId, next.lineId, next.repIndex, 0);
  } else {
    // At last question - check if 100% complete
    const completed = lines.filter((l) => {
      const lineKey = `${l.lineId}_${l.repIndex}_${l.sampleIndex}`;
      return hasResponse(l.areaIndex, l.paramId, lineKey);
    }).length;
    
    const isComplete = completed === lines.length && lines.length > 0;
    
    if (isComplete) {
      // Auto-save and exit to run trial selection
      saveRunTrialProgress();
      setTimeout(() => {
        exitRunTrial();
      }, 500);
    } else {
      // Show completion state with option to loop back to first
      renderCompletionState(isComplete, lines);
    }
  }
}

// Render completion state when at end of questions
function renderCompletionState(isComplete, lines) {
  const container = document.getElementById("runTrialQuestion");
  
  if (isComplete) {
    container.innerHTML = `
      <div class="run-empty-state">
        <span class="material-symbols-rounded completion-icon-success">check_circle</span>
        <h3>Trial Complete!</h3>
        <p>All questions have been answered. Saving progress...</p>
      </div>
    `;
  } else {
    const completed = lines.filter((l) => {
      const lineKey = `${l.lineId}_${l.repIndex}`;
      return hasResponse(l.areaIndex, l.paramId, lineKey);
    }).length;
    const percentage = Math.round((completed / lines.length) * 100);
    
    container.innerHTML = `
      <div class="run-empty-state">
        <span class="material-symbols-rounded completion-icon-default">assignment</span>
        <h3>End of Questions</h3>
        <button class="btn btn-primary completion-restart-btn" onclick="navigateToFirstLine()">
          <span class="material-symbols-rounded">restart_alt</span>
          <span>Start from Beginning</span>
        </button>
      </div>
    `;
  }
}

// Navigate to first line
function navigateToFirstLine() {
  const lines = getAllLinesList();
  if (lines.length > 0) {
    const first = lines[0];
    selectLine(first.areaIndex, first.paramId, first.lineId, first.repIndex, first.sampleIndex);
  }
}

// Get all lines as flat list (including samples for each line)
function getAllLinesList() {
  const trial = runTrialState.currentTrial;
  const lines = [];
  const availableAreas = new Set(getTrialAvailableAreaIndexes(trial));

  const parameters = getRunnableTrialParameters(trial);

  trial.areas.forEach((area, areaIndex) => {
    if (!availableAreas.has(areaIndex)) return;
    if (!area.layout?.result) return;

    parameters.forEach((param) => {
      const numberOfSamples = param.numberOfSamples || 1;
      
      area.layout.result.forEach((rep, repIndex) => {
        rep.forEach((row) => {
          row.forEach((cell) => {
            if (!cell) return;
            
            // Add entry for each sample
            for (let sampleIndex = 0; sampleIndex < numberOfSamples; sampleIndex++) {
              lines.push({
                areaIndex,
                paramId: param.id,
                lineId: cell.id,
                lineName: cell.name,
                repIndex,
                sampleIndex,
                numberOfSamples,
              });
            }
          });
        });
      });
    });
  });

  return lines;
}

// Update progress display
function updateRunTrialProgress() {
  const lines = getAllLinesList();
  const completed = lines.filter((l) => {
    const lineKey = `${l.lineId}_${l.repIndex}`;
    return hasResponse(l.areaIndex, l.paramId, lineKey);
  }).length;

  // const percentage = lines.length > 0 ? Math.round((completed / lines.length) * 100) : 0;
  // document.getElementById("runTrialProgress").textContent = `${completed} / ${lines.length} · ${percentage}%`;
}

// Save run trial progress
async function saveRunTrialProgress() {
  // Save current answer first
  saveCurrentResponseSilent();
  
  const trial = runTrialState.currentTrial;
  if (!trial) return;

  // Update trial with responses (no validation - allow saving anytime)
  trial.responses = runTrialState.responses;
  trial.updatedAt = new Date().toISOString();

  // Update in state
  const idx = trialState.trials.findIndex((t) => t.id === trial.id);
  if (idx !== -1) {
    trialState.trials[idx] = trial;
  }

  if (typeof saveLocalCache === "function") {
    saveLocalCache("trials", { trials: trialState.trials });
  }

  // Save responses to Google Drive (targeted — per line file, deduplicated by fileKey)
  const saveAreaIndex = runTrialState.currentAreaIndex;
  const saveParamId = runTrialState.currentParamId;
  const saveLineId = runTrialState.currentLineId;
  const saveRepIndex = runTrialState.currentRepIndex;

  if (saveAreaIndex !== null && saveParamId && saveLineId !== null && saveRepIndex !== null) {
    enqueueSync({
      label: `Save Responses: ${trial.name}`,
      fileKey: `${trial.id}~${saveAreaIndex}~${saveParamId}~${saveRepIndex}~${saveLineId}`,
      run: () => saveTrialLineToDrive(trial, saveAreaIndex, saveParamId, saveRepIndex, saveLineId),
    });
  } else {
    // Fallback: full backup if current line context is unknown
    enqueueSync({
      label: `Save Responses: ${trial.name}`,
      run: () => saveTrialResponsesToDrive(trial),
    });
  }

  // Update nav and progress display
  renderRunTrialNavTree();
  updateRunTrialProgress();

  // Update denormalized progress summary in meta.json
  enqueueSync({
    label: `Updating progress summary: ${trial.name}`,
    fileKey: `${trial.id}~meta-progress`,
    run: () => saveTrialToGoogleDrive(trial),
  });
  
  // Show success feedback
  if (typeof showSuccessMessage === "function") {
    showSuccessMessage("Progress saved");
  }
}

// Auto save in background (without feedback message)
let autoSaveInProgress = false;

async function autoSaveProgress() {
  if (autoSaveInProgress) return; // Prevent multiple simultaneous saves
  
  const trial = runTrialState.currentTrial;
  if (!trial) return;
  
  autoSaveInProgress = true;
  
  // Update icon to saving state
  const saveIcon = document.querySelector('.run-save-icon');
  const saveIconSymbol = saveIcon?.querySelector('.material-symbols-rounded');
  if (saveIcon) {
    saveIcon.classList.add('saving');
    saveIcon.disabled = true;
  }
  if (saveIconSymbol) {
    saveIconSymbol.textContent = 'cached';
  }
  
  try {
    // Update trial with responses
    trial.responses = runTrialState.responses;
    trial.updatedAt = new Date().toISOString();

    // Update in state
    const idx = trialState.trials.findIndex((t) => t.id === trial.id);
    if (idx !== -1) {
      trialState.trials[idx] = trial;
    }

    if (typeof saveLocalCache === "function") {
      saveLocalCache("trials", { trials: trialState.trials });
    }

    // Save to Drive in background (targeted: only current line, deduplicated by fileKey)
    const saveAreaIndex = runTrialState.currentAreaIndex;
    const saveParamId = runTrialState.currentParamId;
    const saveLineId = runTrialState.currentLineId;
    const saveRepIndex = runTrialState.currentRepIndex;
    const saveSampleIndex = runTrialState.currentSampleIndex || 0;

    if (saveAreaIndex !== null && saveParamId && saveLineId !== null && saveRepIndex !== null) {
      // Build detailed label: trial > area > param > rep > line > sample
      const area = trial.areas[saveAreaIndex];
      const param = inventoryState.items.parameters.find((p) => p.id === saveParamId);
      const line = area?.layout?.lines?.find((l) => l.id === saveLineId);
      const numberOfSamples = param?.numberOfSamples || 1;
      
      const trialName = trial.name || "Trial";
      const areaName = area?.name || `Area ${saveAreaIndex + 1}`;
      const paramName = param?.name || "Param";
      const repLabel = `Rep ${saveRepIndex + 1}`;
      const lineName = line?.name || `Entry ${saveLineId}`;
      const sampleLabel = numberOfSamples > 1 ? ` · S${saveSampleIndex + 1}` : "";
      
      enqueueSync({
        label: `Saving ${trialName} · ${areaName} · ${paramName} · ${repLabel} · ${lineName}${sampleLabel}`,
        fileKey: `${trial.id}~${saveAreaIndex}~responses`,
        run: () => saveAreaResponsesToDrive(trial, saveAreaIndex),
      });
    } else {
      // Fallback: full backup if current line context is unknown
      enqueueSync({
        label: `Saving ${trial.name}`,
        run: () => saveTrialResponsesToDrive(trial),
      });
    }

    // Update nav and progress display
    renderRunTrialNavTree();
    updateRunTrialProgress();

    // Update denormalized progress summary in meta.json (debounced)
    enqueueSync({
      label: `Updating progress summary: ${trial.name}`,
      fileKey: `${trial.id}~meta-progress`,
      run: () => saveTrialToGoogleDrive(trial),
    });

    // Keep dashboard in sync even during run trial
    renderDashboardTrialProgress();
    if (typeof refreshReminderViewsRealtime === "function") {
      refreshReminderViewsRealtime();
    }
  } finally {
    // Remove saving state after short delay
    setTimeout(() => {
      autoSaveInProgress = false;
      if (saveIcon) {
        saveIcon.classList.remove('saving');
        saveIcon.disabled = false;
      }
      if (saveIconSymbol) {
        saveIconSymbol.textContent = 'save';
      }
    }, 500);
  }
}

// Manual save with feedback
async function manualSaveProgress() {
  if (autoSaveInProgress) return;
  
  await autoSaveProgress();
  
  // Show success feedback for manual saves
  if (typeof showSuccessMessage === "function") {
    showSuccessMessage("Progress saved");
  }
}

// ===========================
// DASHBOARD TRIAL PROGRESS
// ===========================

function calculateTrialProgress(trial) {
  if (!trial.areas || !trial.parameters) return { completed: 0, total: 0, percentage: 0 };
  
  const parameters = getRunnableTrialParameters(trial).map((param) => param.id);
  const responses = trial.responses || {};
  let total = 0;
  let completed = 0;

  trial.areas.forEach((area, areaIndex) => {
    if (!area.layout?.result) return;
    
    area.layout.result.forEach((rep, repIndex) => {
      rep.forEach((row) => {
        row.forEach((cell) => {
          if (!cell) return;
          parameters.forEach((paramId) => {
            const param = inventoryState.items.parameters.find((p) => p.id === paramId);
            const numberOfSamples = param?.numberOfSamples || 1;
            const photoMode = param?.photoMode || "per-sample";

            // For each sample in this line
            for (let sampleIndex = 0; sampleIndex < numberOfSamples; sampleIndex++) {
              total++;
              
              // Response key for this specific sample
              const lineKey = `${cell.id}_${repIndex}_${sampleIndex}`;
              const response = responses[areaIndex]?.[paramId]?.[lineKey];
              const hasValue = response?.value !== undefined && response?.value !== "";

              // Check photos
              let hasPhotos = false;
              if (param?.requirePhoto) {
                const photoKey = photoMode === "per-line" 
                  ? `${cell.id}_${repIndex}` 
                  : `${cell.id}_${repIndex}_${sampleIndex}`;
                const photoResponse = responses[areaIndex]?.[paramId]?.[photoKey];
                hasPhotos = photoResponse?.photos?.length > 0;
              }

              if (param?.requirePhoto) {
                if (hasValue && hasPhotos) completed++;
              } else if (hasValue || hasPhotos) {
                completed++;
              }
            }
          });
        });
      });
    });
  });

  return {
    completed,
    total,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0
  };
}

// Helper: Get progress color based on percentage (red to green gradient)
function getProgressGradientColor(percentage) {
  if (percentage === 0) return '#999999'; // Gray for not started
  if (percentage === 100) return '#22c55e'; // Green for completed
  
  // Red to Green gradient: #ef4444 (0%) -> #fbbf24 (50%) -> #22c55e (100%)
  if (percentage <= 50) {
    // Red to Yellow: 0% to 50%
    const ratio = percentage / 50;
    const r = Math.round(239 - (239 - 251) * ratio);
    const g = Math.round(68 + (191 - 68) * ratio);
    const b = Math.round(68 - 68 * ratio);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // Yellow to Green: 50% to 100%
    const ratio = (percentage - 50) / 50;
    const r = Math.round(251 - (251 - 34) * ratio);
    const g = Math.round(191 + (197 - 191) * ratio);
    const b = Math.round(36 + (94 - 36) * ratio);
    return `rgb(${r}, ${g}, ${b})`;
  }
}

function renderDashboardTrialProgress() {
  // Kept for backwards compat – now delegates to the new summary renderer
  renderDashboardTrialSummary();
}

function renderDashboardTrialSummary() {
  const container = document.getElementById('dashboardTrialSummary');
  if (!container) return;

  const activeTrials = trialState.trials.filter(
    (t) => !t.archived && canRunTrialActivities(t)
  );

  if (activeTrials.length === 0) {
    container.classList.add("empty-grid");
    container.innerHTML = `
      <div class="empty-state-small">
        <span class="material-symbols-rounded">science</span>
        <p>No active trials</p>
      </div>
    `;
    return;
  } else {
    container.classList.remove("empty-grid");
  }

  // Group by trialType
  const groups = {};
  activeTrials.forEach((trial) => {
    const type = trial.trialType || "Other";
    if (!groups[type]) groups[type] = [];
    groups[type].push(trial);
  });

  function buildTrialCard(trial) {
    const progress = getTrialProgress(trial);
    const isLoaded = !!trial._responsesLoaded;
    const hasProgressSummary = !!trial.progressSummary;
    const showProgress = isLoaded || hasProgressSummary;
    const obs = progress.obs;
    const obsColor = obs.percentage === 100 ? 'var(--success)'
      : obs.percentage > 50 ? 'var(--primary)'
      : obs.percentage > 0 ? 'var(--warning)'
      : 'var(--text-tertiary)';

    const hasAgronomy = trial.agronomyMonitoring && trial.agronomyItems && trial.agronomyItems.length > 0;
    const agro = hasAgronomy ? progress.agro : null;
    const agroColor = agro
      ? (agro.percentage === 100 ? 'var(--success)'
        : agro.percentage > 50 ? 'var(--primary)'
        : agro.percentage > 0 ? 'var(--warning)'
        : 'var(--text-tertiary)')
      : 'var(--text-tertiary)';

    const overallPct = showProgress ? progress.percentage : 0;
    const badgeClass = !showProgress ? 'not-started' : overallPct === 100 ? 'complete' : overallPct > 0 ? 'in-progress' : 'not-started';
    const badgeText = !showProgress ? 'Not loaded' : overallPct === 100 ? 'Complete' : overallPct > 0 ? 'In Progress' : 'Not Started';

    const cropName = trial.cropName || 'Unknown Crop';
    const plantDate = getTrialPlantingDateSummary(trial);

    const notLoadedNote = !showProgress
      ? '<div style="font-size:0.72rem;color:var(--text-tertiary);margin-top:0.25rem;">Data not loaded — open <b>Load Latest Data</b> to fetch from Drive.</div>'
      : '';

    return `
      <div class="dash-trial-card" data-trial-id="${trial.id}">
        <div class="dash-trial-top">
          <div class="dash-trial-info">
            <span class="dash-trial-name">${escapeHtml(trial.name)}</span>
            <span class="dash-trial-meta">${escapeHtml(cropName)} · ${trial.areas.length} area(s) · Planted ${plantDate}</span>
          </div>
          <span class="dash-trial-status-badge ${badgeClass}">${badgeText}</span>
        </div>
        <div class="dash-trial-progress-rows">
          <div class="dash-progress-row">
            <span class="dash-progress-label">
              <span class="material-symbols-rounded">visibility</span> Observation
            </span>
            <div class="dash-progress-bar">
              <div class="dash-progress-bar-fill" style="width:${showProgress ? obs.percentage : 0}%; background:${obsColor}"></div>
            </div>
            <span class="dash-progress-text">${showProgress ? `${obs.completed}/${obs.total} (${obs.percentage}%)` : '—'}</span>
          </div>
          ${hasAgronomy ? `
          <div class="dash-progress-row">
            <span class="dash-progress-label">
              <span class="material-symbols-rounded">local_florist</span> Agronomy
            </span>
            <div class="dash-progress-bar">
              <div class="dash-progress-bar-fill" style="width:${showProgress && agro ? agro.percentage : 0}%; background:${agroColor}"></div>
            </div>
            <span class="dash-progress-text">${showProgress && agro ? `${agro.completed}/${agro.total} (${agro.percentage}%)` : '—'}</span>
          </div>` : ''}
        </div>
        ${notLoadedNote}
      </div>
    `;
  }

  const typeIcons = {
    "Parent Test": "genetics",
    "Process Research": "biotech",
    "Micropilot": "experiment",
  };

  container.innerHTML = Object.keys(groups).map((type) => {
    const trials = groups[type];
    const icon = typeIcons[type] || "science";
    return `
      <div class="dash-trial-type-group">
        <div class="dash-trial-type-header">
          <span class="material-symbols-rounded">${icon}</span>
          <span>${escapeHtml(type)}</span>
          <span class="dash-trial-type-count">${trials.length}</span>
        </div>
        <div class="dash-trial-type-cards">
          ${trials.map(buildTrialCard).join('')}
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.dash-trial-card[data-trial-id]').forEach(card => {
    card.addEventListener('click', () => {
      const trialId = card.dataset.trialId;
      if (typeof switchPage === 'function') switchPage('trial');
      setTimeout(() => {
        if (typeof showTrialActionPopup === 'function') {
          showTrialActionPopup(new Event('click'), trialId);
        }
      }, 100);
    });
  });
}

// Show trial action popup when clicking a trial card
function showTrialActionPopup(event, trialId) {
  event.stopPropagation();
  
  // Remove any existing popup
  const existingPopup = document.querySelector('.trial-action-popup-overlay');
  if (existingPopup) existingPopup.remove();
  
  const trial = trialState.trials.find(t => t.id === trialId);
  if (!trial) return;
  
  const canRun = canRunTrialActivities(trial);
  
  const hasAgronomy = trial.agronomyMonitoring && trial.agronomyItems && trial.agronomyItems.length > 0 && !trial.archived && canRun;
  
  const overlay = document.createElement('div');
  overlay.className = 'trial-action-popup-overlay';
  overlay.innerHTML = `
    <div class="trial-action-popup">
      <div class="trial-action-popup-header">
        <h4>${escapeHtml(trial.name)}</h4>
        <button class="btn-icon-close" onclick="closeTrialActionPopup()">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <div class="trial-action-popup-options">
        <button class="trial-action-option" onclick="closeTrialActionPopup(); showTrialDetail('${trialId}');">
          <span class="material-symbols-rounded">info</span>
          <div class="trial-action-option-text">
            <span class="trial-action-option-title">Detail</span>
            <span class="trial-action-option-desc">View trial information and settings</span>
          </div>
        </button>
        <button class="trial-action-option ${!canRun || trial.archived ? 'disabled' : ''}" 
          onclick="${canRun && !trial.archived ? `closeTrialActionPopup(); startRunTrial('${trialId}');` : ''}" 
          ${!canRun || trial.archived ? 'disabled' : ''}>
          <span class="material-symbols-rounded">visibility</span>
          <div class="trial-action-option-text">
            <span class="trial-action-option-title">Run Observation</span>
            <span class="trial-action-option-desc">${!canRun ? 'Field/Layouting/Planting Date is incomplete' : trial.archived ? 'Trial is archived' : 'Start or continue observations'}</span>
          </div>
        </button>
        <button class="trial-action-option ${!hasAgronomy ? 'disabled' : ''}" 
                onclick="${hasAgronomy ? `closeTrialActionPopup(); startAgronomyMonitoring('${trialId}');` : ''}"
                ${!hasAgronomy ? 'disabled' : ''}>
          <span class="material-symbols-rounded">local_florist</span>
          <div class="trial-action-option-text">
            <span class="trial-action-option-title">Agronomy Monitoring</span>
            <span class="trial-action-option-desc">${!hasAgronomy ? (trial.archived ? 'Trial is archived' : !canRun ? 'Field/Layouting/Planting Date is incomplete' : 'No agronomy items assigned') : 'Start or continue agronomy monitoring'}</span>
          </div>
        </button>
        <button class="trial-action-option" onclick="closeTrialActionPopup(); showTrialReport('${trialId}');">
          <span class="material-symbols-rounded">description</span>
          <div class="trial-action-option-text">
            <span class="trial-action-option-title">Report</span>
            <span class="trial-action-option-desc">Preview and download trial report (Excel)</span>
          </div>
        </button>
      </div>
    </div>
  `;
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeTrialActionPopup();
  });
  
  document.body.appendChild(overlay);
  lockBodyScroll();
  requestAnimationFrame(() => overlay.classList.add('active'));
}

function closeTrialActionPopup() {
  const overlay = document.querySelector('.trial-action-popup-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    unlockBodyScroll();
    setTimeout(() => overlay.remove(), 200);
  }
}

let trialReportState = {
  currentTrialId: null,
  trialName: "",
  sheets: [],
  activeSheetName: "",
  filters: {},
  sort: {},
  freeze: {},
  columnMenusBound: false,
};

async function showTrialReport(trialId) {
  const trial = trialState.trials.find((t) => t.id === trialId);
  if (!trial) return;

  const reportInterface = document.getElementById("trialReportInterface");
  if (!reportInterface) return;

  // Lazy-load responses from Drive if not yet loaded
  const loaded = await ensureTrialResponsesLoaded(trialId);
  if (!loaded) return;

  const reportData = buildTrialReportWorkbookData(trial);
  trialReportState.currentTrialId = trial.id;
  trialReportState.trialName = trial.name || "Trial";
  trialReportState.sheets = reportData.sheets;
  trialReportState.activeSheetName = reportData.sheets[0]?.name || "";
  trialReportState.filters = {};
  trialReportState.sort = {};
  trialReportState.freeze = {};

  renderTrialReportSheetSelect();
  renderTrialReportPreview();

  toggleTrialReportInterface(true, trialReportState.trialName);
}

function closeTrialReportModal() {
  toggleTrialReportInterface(false);
}

function toggleTrialReportInterface(show, title) {
  const reportInterface = document.getElementById("trialReportInterface");
  const panel = document.getElementById("trialManagementPanel");
  const archive = document.getElementById("archivedTrialManagementPanel");
  const sectionNav = document.querySelector(".trial-section-nav");

  if (!reportInterface || !panel) return;

  if (show) {
    reportInterface.classList.add("active");
    panel.classList.add("hidden");
    if (archive) archive.classList.add("hidden");
    enterTrialFullscreenMode({
      title: title || trialReportState.trialName || "Trial",
      onClose: closeTrialReportModal,
    });
    // Report mode should not show trial editor section navigation.
    if (sectionNav) sectionNav.style.display = "none";
    setTrialReportTopbarControls(true);
  } else {
    reportInterface.classList.remove("active");
    panel.classList.remove("hidden");
    if (archive) archive.classList.remove("hidden");
    setTrialReportTopbarControls(false);
    if (sectionNav) sectionNav.style.display = "";
    exitTrialFullscreenMode();
  }
}

function setTrialReportTopbarControls(show) {
  const sheetSelect = document.getElementById("trialReportSheetSelect");
  const downloadBtn = document.getElementById("trialReportTopbarDownloadBtn");
  const importBtn = document.getElementById("trialReportTopbarImportBtn");

  if (show) {
    renderTrialReportSheetSelect();
    if (sheetSelect) {
      sheetSelect.classList.remove("hidden");
      sheetSelect.style.display = "";
    }
    if (downloadBtn) {
      downloadBtn.classList.remove("hidden");
      downloadBtn.style.display = "flex";
    }
    if (importBtn) {
      importBtn.classList.remove("hidden");
      importBtn.style.display = "flex";
    }
  } else {
    if (sheetSelect) {
      sheetSelect.classList.add("hidden");
      sheetSelect.style.display = "none";
    }
    if (downloadBtn) {
      downloadBtn.classList.add("hidden");
      downloadBtn.style.display = "none";
    }
    if (importBtn) {
      importBtn.classList.add("hidden");
      importBtn.style.display = "none";
    }
  }
}

function renderTrialReportSheetSelect() {
  const selectEl = document.getElementById("trialReportSheetSelect");
  if (!selectEl) return;

  const sheets = trialReportState.sheets || [];
  if (sheets.length === 0) {
    selectEl.innerHTML = "";
    return;
  }

  selectEl.innerHTML = sheets
    .map((sheet) => {
      const selected = sheet.name === trialReportState.activeSheetName ? "selected" : "";
      return `<option value="${escapeHtml(sheet.name)}" ${selected}>${escapeHtml(sheet.name)}</option>`;
    })
    .join("");
}

function handleTrialReportSheetSelect(sheetName) {
  selectTrialReportSheet(sheetName);
}

function selectTrialReportSheet(sheetName) {
  trialReportState.activeSheetName = sheetName;
  closeTrialReportColumnMenus();
  renderTrialReportSheetSelect();
  renderTrialReportPreview();
}

function bindTrialReportMenuGlobalClose() {
  if (trialReportState.columnMenusBound) return;
  document.addEventListener("click", (event) => {
    const insideMenu = event.target.closest(".trial-report-column-menu-container");
    const insideHeaderButton = event.target.closest(".trial-report-th-btn");
    if (!insideMenu && !insideHeaderButton) {
      closeTrialReportColumnMenus();
    }
  });
  trialReportState.columnMenusBound = true;
}

function getTrialReportSheetData() {
  const sheet = (trialReportState.sheets || []).find((s) => s.name === trialReportState.activeSheetName);
  if (!sheet || !Array.isArray(sheet.rows) || sheet.rows.length === 0) {
    return { sheet: null, header: [], bodyRows: [] };
  }
  return {
    sheet,
    header: sheet.rows[0] || [],
    bodyRows: sheet.rows.slice(1),
  };
}

function normalizeTrialReportFilterValue(value) {
  const text = String(value ?? "").trim();
  if (!text) return "__BLANK__";
  return text;
}

function getTrialReportFilterLabel(filterValue) {
  return filterValue === "__BLANK__" ? "(blank)" : filterValue;
}

function getTrialReportColumnFilterSetting(sheetName, colIndex) {
  if (!trialReportState.filters[sheetName]) trialReportState.filters[sheetName] = {};
  if (!trialReportState.filters[sheetName][colIndex]) trialReportState.filters[sheetName][colIndex] = { excluded: [] };
  return trialReportState.filters[sheetName][colIndex];
}

function getTrialReportUniqueColumnValues(rows, colIndex) {
  const unique = new Set();
  rows.forEach((row) => {
    unique.add(normalizeTrialReportFilterValue(row?.[colIndex]));
  });
  return Array.from(unique).sort((a, b) =>
    getTrialReportFilterLabel(a).localeCompare(getTrialReportFilterLabel(b), undefined, { numeric: true, sensitivity: "base" }),
  );
}

function applyTrialReportFilters(rows, sheetName) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const sheetFilters = trialReportState.filters?.[sheetName] || {};
  if (!sheetFilters || Object.keys(sheetFilters).length === 0) return rows;

  return rows.filter((row) =>
    Object.entries(sheetFilters).every(([colIdxText, setting]) => {
      if (!setting || !Array.isArray(setting.excluded) || setting.excluded.length === 0) return true;
      const colIdx = Number(colIdxText);
      const value = normalizeTrialReportFilterValue(row?.[colIdx]);
      return !setting.excluded.includes(value);
    }),
  );
}

function applyTrialReportSort(rows, sheetName) {
  const sortSetting = trialReportState.sort?.[sheetName];
  if (!sortSetting || !sortSetting.mode || sortSetting.mode === "default") return rows;

  const colIndex = Number(sortSetting.colIndex);
  const direction = sortSetting.mode === "desc" ? -1 : 1;
  const sorted = [...rows];

  sorted.sort((left, right) => {
    const a = String(left?.[colIndex] ?? "");
    const b = String(right?.[colIndex] ?? "");
    const cmp = a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
    return cmp * direction;
  });

  return sorted;
}

function setTrialReportColumnSort(colIndex, mode) {
  const sheetName = trialReportState.activeSheetName;
  if (!sheetName) return;
  if (mode === "default") {
    delete trialReportState.sort[sheetName];
  } else {
    trialReportState.sort[sheetName] = {
      colIndex,
      mode,
    };
  }
  closeTrialReportColumnMenus();
  renderTrialReportPreview();
}

function clearTrialReportColumnSort(colIndex) {
  const sheetName = trialReportState.activeSheetName;
  if (!sheetName) return;

  const sortSetting = trialReportState.sort?.[sheetName];
  if (sortSetting && Number(sortSetting.colIndex) === Number(colIndex)) {
    delete trialReportState.sort[sheetName];
  }

  closeTrialReportColumnMenus();
  renderTrialReportPreview();
}

function toggleTrialReportFreeze(colIndex) {
  const { sheet, bodyRows } = getTrialReportSheetData();
  if (!sheet) return;

  const current = Number(trialReportState.freeze?.[sheet.name]);
  if (!Number.isNaN(current) && current === Number(colIndex)) {
    delete trialReportState.freeze[sheet.name];
  } else {
    trialReportState.freeze[sheet.name] = Number(colIndex);
  }

  closeTrialReportColumnMenus();
  renderTrialReportPreview();
}

function setTrialReportFilterAll(colIndex) {
  const sheetName = trialReportState.activeSheetName;
  if (!sheetName) return;
  const setting = getTrialReportColumnFilterSetting(sheetName, colIndex);
  setting.excluded = [];

  closeTrialReportColumnMenus();
  renderTrialReportPreview();
  openTrialReportColumnMenuByIndex(colIndex, true);
}

function setTrialReportFilterNone(colIndex) {
  const { sheet, bodyRows } = getTrialReportSheetData();
  if (!sheet) return;
  const setting = getTrialReportColumnFilterSetting(sheet.name, colIndex);
  setting.excluded = getTrialReportUniqueColumnValues(bodyRows, colIndex);

  closeTrialReportColumnMenus();
  renderTrialReportPreview();
  openTrialReportColumnMenuByIndex(colIndex, true);
}

function toggleTrialReportFilterValue(colIndex, value, checked) {
  const sheetName = trialReportState.activeSheetName;
  if (!sheetName) return;

  const setting = getTrialReportColumnFilterSetting(sheetName, colIndex);
  const excluded = new Set(Array.isArray(setting.excluded) ? setting.excluded : []);
  if (checked) excluded.delete(value);
  else excluded.add(value);
  setting.excluded = Array.from(excluded);

  renderTrialReportPreview();
  openTrialReportColumnMenuByIndex(colIndex, true);
}

function toggleTrialReportFilterValueEncoded(colIndex, encodedValue, checked) {
  const decoded = decodeURIComponent(String(encodedValue || ""));
  toggleTrialReportFilterValue(colIndex, decoded, checked);
}

function closeTrialReportColumnMenus() {
  document.querySelectorAll(".trial-report-column-menu-container").forEach((el) => el.remove());
  trialReportState._openColumnIndex = null;
}

function openTrialReportColumnMenuByIndex(colIndex, keepOpen = false) {
  const headerButton = document.querySelector(`.trial-report-th-btn[data-col-index="${colIndex}"]`);
  if (!headerButton) return;
  const fakeEvent = { currentTarget: headerButton, stopPropagation: () => {} };
  openTrialReportColumnMenu(fakeEvent, colIndex, !!keepOpen);
}

function openTrialReportColumnMenu(event, colIndex, keepOpen = false) {
  event.stopPropagation();
  bindTrialReportMenuGlobalClose();

  const { sheet, bodyRows } = getTrialReportSheetData();
  if (!sheet) return;

  const target = event.currentTarget;
  if (!target) return;

  const wasOpen = trialReportState._openColumnIndex === Number(colIndex);
  closeTrialReportColumnMenus();
  if (wasOpen && !keepOpen) {
    trialReportState._openColumnIndex = null;
    return;
  }
  trialReportState._openColumnIndex = Number(colIndex);

  const setting = getTrialReportColumnFilterSetting(sheet.name, colIndex);
  const sortSetting = trialReportState.sort?.[sheet.name];
  const currentSort = sortSetting && Number(sortSetting.colIndex) === Number(colIndex) ? sortSetting.mode : "default";
  const isFrozen = Number(trialReportState.freeze?.[sheet.name]) === Number(colIndex);
  const excluded = Array.isArray(setting.excluded) ? setting.excluded : [];
  const sortedValues = getTrialReportUniqueColumnValues(bodyRows, colIndex);

  const menu = document.createElement("div");
  menu.className = "trial-report-column-menu-container";
  menu.innerHTML = `
    <div class="analysis-col-menu trial-report-column-menu" onclick="event.stopPropagation()">
      <div class="trial-report-column-menu-section">
        <button class="trial-report-column-menu-btn ${currentSort === "asc" ? "active" : ""}" onclick="setTrialReportColumnSort(${colIndex}, 'asc')">
          <span class="material-symbols-rounded">arrow_upward</span>
          <span>Sort A-Z</span>
        </button>
        <button class="trial-report-column-menu-btn ${currentSort === "desc" ? "active" : ""}" onclick="setTrialReportColumnSort(${colIndex}, 'desc')">
          <span class="material-symbols-rounded">arrow_downward</span>
          <span>Sort Z-A</span>
        </button>
        ${currentSort !== "default" ? `<button class="trial-report-column-menu-btn" onclick="clearTrialReportColumnSort(${colIndex})">
          <span class="material-symbols-rounded">close</span>
          <span>Clear Sort</span>
        </button>` : ""}
        <button class="trial-report-column-menu-btn ${isFrozen ? "active" : ""}" onclick="toggleTrialReportFreeze(${colIndex})">
          <span class="material-symbols-rounded">${isFrozen ? "lock_open" : "push_pin"}</span>
          <span>${isFrozen ? "Unfreeze" : "Freeze Here"}</span>
        </button>
      </div>
      ${colIndex > 0 ? `<div class="trial-report-column-menu-section trial-report-column-menu-filter">
        <div class="trial-report-column-menu-filter-header">
          <strong>Filter</strong>
          <div>
            <button class="trial-report-column-menu-link" onclick="setTrialReportFilterAll(${colIndex})">All</button>
            <button class="trial-report-column-menu-link" onclick="setTrialReportFilterNone(${colIndex})">None</button>
          </div>
        </div>
        <div class="trial-report-column-menu-filter-list">
          ${sortedValues
            .map((value) => {
              const selected = !excluded.includes(value);
              const encodedValue = encodeURIComponent(value);
              return `
                <label class="trial-report-column-menu-filter-item">
                  <input type="checkbox" ${selected ? "checked" : ""} onchange="toggleTrialReportFilterValueEncoded(${colIndex}, '${encodedValue}', this.checked)">
                  <span>${escapeHtml(getTrialReportFilterLabel(value))}</span>
                </label>
              `;
            })
            .join("")}
        </div>
      </div>` : ""}
    </div>
  `;

  document.body.appendChild(menu);

  const rect = target.getBoundingClientRect();
  const top = rect.bottom + 4;
  const left = rect.left;
  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
}

function getTrialReportColumnMode(sheetName, colIndex) {
  const filterSetting = trialReportState.filters?.[sheetName]?.[colIndex];
  const sortSetting = trialReportState.sort?.[sheetName];
  const freezeSetting = Number(trialReportState.freeze?.[sheetName]);

  if (sortSetting && Number(sortSetting.colIndex) === Number(colIndex)) {
    return "sort";
  }
  if (!Number.isNaN(freezeSetting) && freezeSetting === Number(colIndex)) {
    return "freeze";
  }
  if (colIndex > 0 && filterSetting && Array.isArray(filterSetting.excluded) && filterSetting.excluded.length > 0) {
    return "filter";
  }
  return "default";
}

function renderTrialReportPreview() {
  const tableEl = document.getElementById("trialReportPreviewTable");
  if (!tableEl) return;

  closeTrialReportColumnMenus();

  const { sheet, header, bodyRows } = getTrialReportSheetData();
  if (!sheet || header.length === 0) {
    tableEl.innerHTML = "";
    return;
  }

  const filteredRows = applyTrialReportFilters(bodyRows, sheet.name);
  const finalRows = applyTrialReportSort(filteredRows, sheet.name);

  const headHtml = `
    <thead>
      <tr>
        ${header
          .map((cell, colIdx) => {
            const mode = getTrialReportColumnMode(sheet.name, colIdx);
            return `
              <th>
                <button type="button" class="trial-report-th-btn analysis-th-btn" data-col-index="${colIdx}" onclick="openTrialReportColumnMenu(event, ${colIdx})">
                  <span class="trial-report-th-text">${escapeHtml(String(cell ?? ""))}</span>
                  <span class="material-symbols-rounded trial-report-th-marker ${mode !== "default" ? "active" : ""}">filter_alt</span>
                </button>
              </th>
            `;
          })
          .join("")}
      </tr>
    </thead>
  `;
  const bodyHtml = finalRows.length > 0
    ? `<tbody>${finalRows
      .map((row) => `<tr>${header.map((_, idx) => `<td>${escapeHtml(String(row[idx] ?? ""))}</td>`).join("")}</tr>`)
      .join("")}</tbody>`
    : `<tbody><tr><td colspan="${Math.max(header.length, 1)}" class="trial-report-empty">No rows</td></tr></tbody>`;

  tableEl.innerHTML = `${headHtml}${bodyHtml}`;

  const freezeIdx = Number(trialReportState.freeze?.[sheet.name]);
  if (!Number.isNaN(freezeIdx) && freezeIdx >= 0) {
    let left = 0;
    const tableHeaders = tableEl.querySelectorAll("thead th");
    const tableRows = tableEl.querySelectorAll("tbody tr");

    for (let index = 0; index <= freezeIdx; index += 1) {
      const headerCell = tableHeaders[index];
      if (!headerCell) continue;

      const width = headerCell.offsetWidth;
      headerCell.style.position = "sticky";
      headerCell.style.top = "-1px";
      headerCell.style.left = `${left}px`;
      headerCell.style.zIndex = "6";
      headerCell.style.background = "#f3f3f3";

      tableRows.forEach((row) => {
        const bodyCell = row.children[index];
        if (!bodyCell) return;
        bodyCell.style.position = "sticky";
        bodyCell.style.left = `${left}px`;
        bodyCell.style.zIndex = "1";
        bodyCell.style.background = "#fff";
      });

      left += width;
    }
  }
}

function downloadTrialReportExcel() {
  if (typeof XLSX === "undefined") {
    showToast("Excel library not loaded. Please try again.", "error");
    return;
  }

  const sheets = trialReportState.sheets || [];
  if (sheets.length === 0) {
    showToast("No report data available", "error");
    return;
  }

  const workbook = XLSX.utils.book_new();

  sheets.forEach((sheet) => {
    const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
    const ws = XLSX.utils.aoa_to_sheet(rows);

    if (rows.length > 0) {
      const maxScanRows = Math.min(rows.length, 300);
      const maxCols = rows.reduce((acc, row) => Math.max(acc, row.length || 0), 0);
      const widths = [];
      for (let col = 0; col < maxCols; col++) {
        let maxLen = 8;
        for (let r = 0; r < maxScanRows; r++) {
          const value = String(rows[r]?.[col] ?? "");
          if (value.length > maxLen) maxLen = value.length;
        }
        widths.push({ wch: Math.min(maxLen + 2, 45) });
      }
      ws["!cols"] = widths;
    }

    XLSX.utils.book_append_sheet(workbook, ws, sheet.name);
  });

  const safeName = (trialReportState.trialName || "Trial")
    .replace(/[^a-zA-Z0-9_\- ]/g, "")
    .trim()
    .replace(/\s+/g, "_") || "Trial";

  XLSX.writeFile(workbook, `${safeName}_Report.xlsx`);
  showToast("Report exported successfully", "success");
}

// ═══════════════════════════════════════════════
// Trial Report IMPORT
// ═══════════════════════════════════════════════

function openTrialReportImport() {
  const fileInput = document.getElementById("trialReportImportFileInput");
  if (!fileInput) return;

  // Reset so same file can be re-selected
  fileInput.value = "";

  // Remove previous listener by cloning
  const newInput = fileInput.cloneNode(true);
  fileInput.parentNode.replaceChild(newInput, fileInput);

  newInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) handleTrialReportImportFile(file);
  });

  newInput.click();
}

function handleTrialReportImportFile(file) {
  if (typeof XLSX === "undefined") {
    showToast("Excel library not loaded. Please try again.", "error");
    return;
  }

  const trialId = trialReportState.currentTrialId;
  const trial = trialState.trials.find((t) => t.id === trialId);
  if (!trial) {
    showToast("No active trial for import", "error");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array" });

      let obsUpdated = 0;
      let agroUpdated = 0;

      const trialParameters = (trial.parameters || [])
        .map((paramId) => inventoryState.items.parameters.find((p) => p.id === paramId))
        .filter(Boolean);
      const nonFormulaParams = trialParameters.filter((p) => (p.type || "").toLowerCase() !== "formula");
      const agronomyItems = getTrialAgronomyItems(trial);

      // Initialize responses if empty
      if (!trial.responses) trial.responses = {};
      if (!trial.agronomyResponses) trial.agronomyResponses = {};

      workbook.SheetNames.forEach((sheetName) => {
        const ws = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        if (rows.length < 2) return;

        const header = rows[0].map((h) => String(h ?? "").trim());
        const bodyRows = rows.slice(1);

        const isObsSheet = _isObservationSheetHeader(header);
        const isAgroSheet = _isAgronomySheetHeader(header);

        if (isObsSheet) {
          obsUpdated += _importObservationSheet(trial, header, bodyRows, nonFormulaParams);
        } else if (isAgroSheet) {
          agroUpdated += _importAgronomySheet(trial, header, bodyRows, agronomyItems);
        }
      });

      if (obsUpdated === 0 && agroUpdated === 0) {
        showToast("No matching data found in imported file. Make sure columns match the report format.", "warning");
        return;
      }

      // Mark responses as loaded
      trial._responsesLoaded = true;
      trial.updatedAt = new Date().toISOString();

      // Update in state
      const idx = trialState.trials.findIndex((t) => t.id === trial.id);
      if (idx !== -1) trialState.trials[idx] = trial;

      // Save to local cache
      if (typeof saveLocalCache === "function") {
        saveLocalCache("trials", { trials: trialState.trials });
      }

      // Save to Google Drive
      const isGuest = typeof getCurrentUser === "function" && getCurrentUser()?.isGuest;
      if (!isGuest && typeof enqueueSync === "function") {
        enqueueSync({
          label: `Import responses: ${trial.name}`,
          fileKey: `${trial.id}~import-responses`,
          run: () => saveTrialResponsesToDrive(trial),
        });
        enqueueSync({
          label: `Update trial meta: ${trial.name}`,
          fileKey: `${trial.id}~meta-progress`,
          run: () => saveTrialToGoogleDrive(trial),
        });
        if (agroUpdated > 0 && typeof saveAllAgronomyResponsesToDrive === "function") {
          enqueueSync({
            label: `Import agronomy: ${trial.name}`,
            fileKey: `${trial.id}~import-agronomy`,
            run: () => saveAllAgronomyResponsesToDrive(trial),
          });
        }
      }

      // Rebuild the report view with updated data
      const reportData = buildTrialReportWorkbookData(trial);
      trialReportState.sheets = reportData.sheets;
      if (!reportData.sheets.find((s) => s.name === trialReportState.activeSheetName)) {
        trialReportState.activeSheetName = reportData.sheets[0]?.name || "";
      }
      renderTrialReportSheetSelect();
      renderTrialReportPreview();

      // Refresh dashboard and reminders
      if (typeof renderDashboardTrialProgress === "function") renderDashboardTrialProgress();
      if (typeof refreshReminderViewsRealtime === "function") refreshReminderViewsRealtime();

      const parts = [];
      if (obsUpdated > 0) parts.push(`${obsUpdated} observation(s)`);
      if (agroUpdated > 0) parts.push(`${agroUpdated} agronomy record(s)`);
      showToast(`Imported ${parts.join(" and ")} successfully`, "success");
    } catch (error) {
      console.error("Trial report import error:", error);
      showToast("Failed to import file: " + (error.message || "Unknown error"), "error");
    }
  };

  reader.readAsArrayBuffer(file);
}

function _isObservationSheetHeader(header) {
  // Supports both legacy vertical and new horizontal observation report formats.
  const lower = header.map((h) => h.toLowerCase());
  const legacy = lower.includes("entry") && lower.includes("parameter") && lower.includes("value") && lower.includes("sample");
  const horizontal = lower.includes("entry") && lower.includes("replication") && lower.includes("sample");
  return legacy || horizontal;
}

function _isAgronomySheetHeader(header) {
  // Supports both legacy vertical and new horizontal agronomy report formats.
  const lower = header.map((h) => h.toLowerCase());
  const legacy = lower.includes("activity") && lower.includes("application date") && lower.includes("area");
  const horizontal = lower.includes("area") && lower.includes("no") && !lower.includes("activity");
  return legacy || horizontal;
}

function _importObservationSheet(trial, header, bodyRows, nonFormulaParams) {
  const colIdx = {};
  header.forEach((h, i) => {
    const key = h.toLowerCase();
    if (key === "area") colIdx.area = i;
    else if (key === "replication") colIdx.rep = i;
    else if (key === "entry") colIdx.entry = i;
    else if (key === "sample") colIdx.sample = i;
    else if (key === "parameter") colIdx.param = i;
    else if (key === "value") colIdx.value = i;
  });

  const isLegacy = colIdx.entry !== undefined && colIdx.param !== undefined && colIdx.value !== undefined;
  if (!isLegacy) {
    return _importObservationSheetHorizontal(trial, header, bodyRows, nonFormulaParams);
  }

  // Build lookup maps
  const paramByName = new Map();
  nonFormulaParams.forEach((p) => {
    paramByName.set((p.name || "").toLowerCase().trim(), p);
  });

  const areaIndexByName = new Map();
  (trial.areas || []).forEach((area, idx) => {
    const name = (area.name || `Area ${idx + 1}`).toLowerCase().trim();
    areaIndexByName.set(name, idx);
  });

  // Build line lookup: lineId by name, per area+rep
  const lineLookup = _buildLineLookup(trial);

  let updated = 0;

  bodyRows.forEach((row) => {
    const areaName = String(row[colIdx.area] ?? "").trim();
    const repStr = String(row[colIdx.rep] ?? "").trim();
    const entryName = String(row[colIdx.entry] ?? "").trim();
    const sampleStr = String(row[colIdx.sample] ?? "").trim();
    const paramName = String(row[colIdx.param] ?? "").trim();
    const value = row[colIdx.value];

    if (!entryName || !paramName) return;

    const param = paramByName.get(paramName.toLowerCase());
    if (!param) return;

    const areaIndex = areaIndexByName.get(areaName.toLowerCase()) ?? 0;
    const repIndex = Math.max(0, parseInt(repStr, 10) - 1) || 0;
    const sampleIndex = Math.max(0, parseInt(sampleStr, 10) - 1) || 0;

    // Find line ID
    const lineId = lineLookup.get(_lineKey(areaIndex, repIndex, entryName.toLowerCase()));
    if (!lineId) return;

    // Write into trial.responses
    if (!trial.responses[areaIndex]) trial.responses[areaIndex] = {};
    if (!trial.responses[areaIndex][param.id]) trial.responses[areaIndex][param.id] = {};

    const sampleKey = `${lineId}_${repIndex}_${sampleIndex}`;
    const existing = trial.responses[areaIndex][param.id][sampleKey] || {};

    trial.responses[areaIndex][param.id][sampleKey] = {
      ...existing,
      value: value !== "" && value !== null && value !== undefined ? value : existing.value ?? "",
      timestamp: new Date().toISOString(),
    };

    updated++;
  });

  return updated;
}

function _importObservationSheetHorizontal(trial, header, bodyRows, nonFormulaParams) {
  const fixedCols = {};
  header.forEach((h, i) => {
    const key = String(h || "").toLowerCase().trim();
    if (key === "area") fixedCols.area = i;
    else if (key === "replication") fixedCols.rep = i;
    else if (key === "entry") fixedCols.entry = i;
    else if (key === "sample") fixedCols.sample = i;
  });

  if (fixedCols.entry === undefined) return 0;

  const paramByHeaderIndex = new Map();
  const paramByName = new Map();
  nonFormulaParams.forEach((p) => {
    paramByName.set((p.name || "").toLowerCase().trim(), p);
  });

  header.forEach((h, i) => {
    if ([fixedCols.area, fixedCols.rep, fixedCols.entry, fixedCols.sample].includes(i)) return;
    const param = paramByName.get(String(h || "").toLowerCase().trim());
    if (param) paramByHeaderIndex.set(i, param);
  });

  const areaIndexByName = new Map();
  (trial.areas || []).forEach((area, idx) => {
    const name = (area.name || `Area ${idx + 1}`).toLowerCase().trim();
    areaIndexByName.set(name, idx);
  });

  const lineLookup = _buildLineLookup(trial);
  let updated = 0;

  bodyRows.forEach((row) => {
    const areaName = String(row[fixedCols.area] ?? "").trim();
    const repStr = String(row[fixedCols.rep] ?? "").trim();
    const entryName = String(row[fixedCols.entry] ?? "").trim();
    const sampleStr = String(row[fixedCols.sample] ?? "").trim();
    if (!entryName) return;

    const areaIndex = areaIndexByName.get(areaName.toLowerCase()) ?? 0;
    const repIndex = Math.max(0, parseInt(repStr, 10) - 1) || 0;
    const sampleIndex = Math.max(0, parseInt(sampleStr, 10) - 1) || 0;
    const lineId = lineLookup.get(_lineKey(areaIndex, repIndex, entryName.toLowerCase()));
    if (!lineId) return;

    paramByHeaderIndex.forEach((param, colIndex) => {
      const value = row[colIndex];
      if (value === "" || value === null || value === undefined) return;

      if (!trial.responses[areaIndex]) trial.responses[areaIndex] = {};
      if (!trial.responses[areaIndex][param.id]) trial.responses[areaIndex][param.id] = {};

      const sampleKey = `${lineId}_${repIndex}_${sampleIndex}`;
      const existing = trial.responses[areaIndex][param.id][sampleKey] || {};
      trial.responses[areaIndex][param.id][sampleKey] = {
        ...existing,
        value,
        timestamp: new Date().toISOString(),
      };
      updated++;
    });
  });

  return updated;
}

function _importAgronomySheet(trial, header, bodyRows, agronomyItems) {
  const colIdx = {};
  header.forEach((h, i) => {
    const key = h.toLowerCase();
    if (key === "area") colIdx.area = i;
    else if (key === "activity") colIdx.activity = i;
    else if (key === "application date") colIdx.appDate = i;
  });

  if (colIdx.activity === undefined) {
    return _importAgronomySheetHorizontal(trial, header, bodyRows, agronomyItems);
  }

  const areaIndexByName = new Map();
  (trial.areas || []).forEach((area, idx) => {
    const name = (area.name || `Area ${idx + 1}`).toLowerCase().trim();
    areaIndexByName.set(name, idx);
  });

  const itemByActivity = new Map();
  agronomyItems.forEach((item) => {
    const act = (item.activity || item.name || "").toLowerCase().trim();
    itemByActivity.set(act, item);
  });

  let updated = 0;

  bodyRows.forEach((row) => {
    const areaName = String(row[colIdx.area] ?? "").trim();
    const activity = String(row[colIdx.activity] ?? "").trim();
    const appDateRaw = colIdx.appDate !== undefined ? row[colIdx.appDate] : "";

    if (!activity) return;

    const item = itemByActivity.get(activity.toLowerCase());
    if (!item) return;

    const areaIndex = areaIndexByName.get(areaName.toLowerCase()) ?? 0;

    if (!trial.agronomyResponses[areaIndex]) trial.agronomyResponses[areaIndex] = {};

    const existing = trial.agronomyResponses[areaIndex][item.id] || {};

    const parsedDate = _parseImportDate(appDateRaw);

    trial.agronomyResponses[areaIndex][item.id] = {
      ...existing,
      applicationDate: parsedDate || existing.applicationDate || "",
      timestamp: new Date().toISOString(),
    };

    updated++;
  });

  return updated;
}

function _importAgronomySheetHorizontal(trial, header, bodyRows, agronomyItems) {
  const fixedCols = {};
  header.forEach((h, i) => {
    const key = String(h || "").toLowerCase().trim();
    if (key === "area") fixedCols.area = i;
    else if (key === "no") fixedCols.no = i;
  });

  if (fixedCols.area === undefined) return 0;

  const areaIndexByName = new Map();
  (trial.areas || []).forEach((area, idx) => {
    const name = (area.name || `Area ${idx + 1}`).toLowerCase().trim();
    areaIndexByName.set(name, idx);
  });

  const itemByName = new Map();
  agronomyItems.forEach((item) => {
    itemByName.set((item.activity || item.name || "").toLowerCase().trim(), item);
  });

  const activityColumns = [];
  header.forEach((h, i) => {
    if ([fixedCols.area, fixedCols.no].includes(i)) return;
    const item = itemByName.get(String(h || "").toLowerCase().trim());
    if (item) activityColumns.push({ colIndex: i, item });
  });

  let updated = 0;
  bodyRows.forEach((row) => {
    const areaName = String(row[fixedCols.area] ?? "").trim();
    const areaIndex = areaIndexByName.get(areaName.toLowerCase()) ?? 0;
    if (!trial.agronomyResponses[areaIndex]) trial.agronomyResponses[areaIndex] = {};

    activityColumns.forEach(({ colIndex, item }) => {
      const rawDate = row[colIndex];
      if (rawDate === "" || rawDate === null || rawDate === undefined) return;
      const parsedDate = _parseImportDate(rawDate);
      const existing = trial.agronomyResponses[areaIndex][item.id] || {};
      trial.agronomyResponses[areaIndex][item.id] = {
        ...existing,
        applicationDate: parsedDate || existing.applicationDate || "",
        timestamp: new Date().toISOString(),
      };
      updated++;
    });
  });

  return updated;
}

function _buildLineLookup(trial) {
  const lookup = new Map();
  (trial.areas || []).forEach((area, areaIndex) => {
    const result = area?.layout?.result;
    if (!result) return;
    result.forEach((rep, repIndex) => {
      rep.forEach((row) => {
        row.forEach((cell) => {
          if (!cell) return;
          const name = (cell.name || "").toLowerCase().trim();
          lookup.set(_lineKey(areaIndex, repIndex, name), cell.id);
        });
      });
    });
  });
  return lookup;
}

function _lineKey(areaIndex, repIndex, entryNameLower) {
  return `${areaIndex}|${repIndex}|${entryNameLower}`;
}

function _parseImportDate(value) {
  if (!value) return "";
  // Handle Excel serial dates
  if (typeof value === "number") {
    const date = new Date((value - 25569) * 86400 * 1000);
    if (!isNaN(date.getTime())) return date.toISOString();
  }
  const str = String(value).trim();
  if (!str) return "";
  const date = new Date(str);
  if (!isNaN(date.getTime())) return date.toISOString();
  return str;
}

function buildTrialReportWorkbookData(trial) {
  const usedNames = new Set();
  const sheets = [];

  const addSheet = (baseName, rows) => {
    const name = makeUniqueReportSheetName(baseName, usedNames);
    sheets.push({ name, rows: Array.isArray(rows) ? rows : [] });
  };

  addSheet("General", buildTrialGeneralSheetRows(trial));

  const trialParameters = (trial.parameters || [])
    .map((paramId) => inventoryState.items.parameters.find((p) => p.id === paramId))
    .filter(Boolean);

  (trial.areas || []).forEach((area, areaIndex) => {
    const areaLabel = (area?.name || `Area ${areaIndex + 1}`).trim() || `Area ${areaIndex + 1}`;
    addSheet(`${areaLabel}_Observation`, buildTrialObservationSheetRows(trial, area, areaIndex, trialParameters));
    addSheet(`${areaLabel}_Agronomy`, buildTrialAgronomySheetRows(trial, area, areaIndex));
  });

  return { sheets };
}

function makeUniqueReportSheetName(baseName, usedNames) {
  const fallback = "Sheet";
  let cleaned = String(baseName || fallback)
    .replace(/[\\/?*\[\]:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) cleaned = fallback;
  cleaned = cleaned.slice(0, 31);

  let name = cleaned;
  let counter = 2;
  while (usedNames.has(name)) {
    const suffix = `_${counter}`;
    const stem = cleaned.slice(0, Math.max(31 - suffix.length, 1));
    name = `${stem}${suffix}`;
    counter += 1;
  }

  usedNames.add(name);
  return name;
}

function buildTrialGeneralSheetRows(trial) {
  const rows = [["Field", "Value"]];

  const location = inventoryState.items.locations?.find((l) => l.id === trial.locationId);
  const progress = calculateCombinedTrialProgress(trial);
  const trialParameters = (trial.parameters || [])
    .map((paramId) => inventoryState.items.parameters.find((p) => p.id === paramId))
    .filter(Boolean);
  const formulaParams = trialParameters.filter((p) => (p.type || "").toLowerCase() === "formula");
  const nonFormulaParams = trialParameters.filter((p) => (p.type || "").toLowerCase() !== "formula");
  const agronomyItems = getTrialAgronomyItems(trial);

  rows.push(["Trial Name", trial.name || ""]);
  rows.push(["Description", trial.description || ""]);
  rows.push(["Crop", trial.cropName || ""]);
  rows.push(["Type of Pollination", trial.pollination || ""]);
  rows.push(["Trial Type", trial.trialType || ""]);
  rows.push(["Planting Season", trial.plantingSeason || ""]);
  rows.push(["Experimental Design", trial.expDesign || ""]);
  const factorDefinitions = normalizeTrialFactorDefinitions(trial);
  rows.push(["No. of Factors", String(normalizeTrialFactorsCount(trial.trialFactors))]);
  rows.push([
    "Factor Names",
    factorDefinitions.map((factor) => factor.name).filter(Boolean).join("; "),
  ]);
  factorDefinitions.forEach((factor, index) => {
    rows.push([`Factor ${index + 1} Name`, factor.name || ""]);
    rows.push([`Factor ${index + 1} Treatments`, (factor.treatments || []).join("; ")]);
  });
  rows.push(["Planting Window", `${trial.plantingStart || ""} - ${trial.plantingEnd || ""}`.trim()]);
  rows.push(["Planting Dates (Per Area)", getTrialPlantingDates(trial).join("; ")]);
  rows.push(["Location", location?.name || ""]);
  rows.push(["Areas", String((trial.areas || []).length)]);
  rows.push(["Observation Progress", `${progress.obs.completed}/${progress.obs.total} (${progress.obs.percentage}%)`]);
  rows.push(["Agronomy Progress", `${progress.agro.completed}/${progress.agro.total} (${progress.agro.percentage}%)`]);
  rows.push(["Overall Progress", `${progress.completed}/${progress.total} (${progress.percentage}%)`]);
  rows.push(["Observation Parameters", String(nonFormulaParams.length)]);
  rows.push([
    "Observation Parameter List",
    nonFormulaParams.map((p) => `${p.name || ""}${p.initial ? ` (${p.initial})` : ""}`).join("; "),
  ]);
  rows.push(["Formula Parameters", String(formulaParams.length)]);
  rows.push([
    "Formula Parameter List",
    formulaParams.map((p) => `${p.name || ""}${p.formula ? ` = ${p.formula}` : ""}`).join("; "),
  ]);
  rows.push(["Agronomy Items", String(agronomyItems.length)]);
  rows.push([
    "Agronomy Item List",
    agronomyItems.map((item) => item.activity || item.name || "").join("; "),
  ]);
  // Plot specification rows
  if (trial.trialType === 'Micropilot') {
    rows.push(["Panel", trial.mpPanel != null ? String(trial.mpPanel) : ""]);
    rows.push(["Ratio Female", trial.ratioFemale != null ? String(trial.ratioFemale) : ""]);
    rows.push(["Ratio Male", trial.ratioMale != null ? String(trial.ratioMale) : ""]);
    rows.push(["Total Female Rows", trial.mpTotalFemaleRows != null ? String(trial.mpTotalFemaleRows) : ""]);
    rows.push(["Total Male Rows", trial.mpTotalMaleRows != null ? String(trial.mpTotalMaleRows) : ""]);
    rows.push(["Plot Length (m)", trial.mpPlotLength != null ? String(trial.mpPlotLength) : ""]);
    rows.push(["Plant Spacing Width (cm)", trial.mpSpacingWidth != null ? String(trial.mpSpacingWidth) : ""]);
    rows.push(["Plant Spacing Height (cm)", trial.mpSpacingHeight != null ? String(trial.mpSpacingHeight) : ""]);
    rows.push(["Plot Area (m²)", trial.mpPlotArea != null ? trial.mpPlotArea.toFixed(2) : ""]);
    rows.push(["Female Population/plot", trial.mpExpectedFemale != null ? String(Math.round(trial.mpExpectedFemale)) : ""]);
    rows.push(["Male Population/plot", trial.mpExpectedMale != null ? String(Math.round(trial.mpExpectedMale)) : ""]);
    rows.push(["Female Population/ha", trial.mpPopFemale != null ? String(Math.round(trial.mpPopFemale)) : ""]);
    rows.push(["Male Population/ha", trial.mpPopMale != null ? String(Math.round(trial.mpPopMale)) : ""]);
  } else {
    rows.push(["Rows per Plot", trial.rowsPerPlot != null ? String(trial.rowsPerPlot) : ""]);
    rows.push(["Plot Length (m)", trial.plotLength != null ? String(trial.plotLength) : ""]);
    rows.push(["Plant Spacing Width (cm)", trial.plantSpacingWidth != null ? String(trial.plantSpacingWidth) : ""]);
    rows.push(["Plant Spacing Height (cm)", trial.plantSpacingHeight != null ? String(trial.plantSpacingHeight) : ""]);
    rows.push(["Plot Area (m²)", trial.plotArea != null ? trial.plotArea.toFixed(2) : ""]);
    rows.push(["Exp. Plants per Plot", trial.expectedPlantsPerPlot != null ? String(Math.round(trial.expectedPlantsPerPlot)) : ""]);
    rows.push(["Population per Hectare", trial.populationPerHa != null ? String(Math.round(trial.populationPerHa)) : ""]);
  }

  rows.push(["Created At", formatReportTimestamp(trial.createdAt)]);
  rows.push(["Updated At", formatReportTimestamp(trial.updatedAt)]);

  (trial.areas || []).forEach((area, areaIndex) => {
    const areaName = area?.name || `Area ${areaIndex + 1}`;
    let lineCount = 0;
    if (area?.layout?.result) {
      area.layout.result.forEach((rep) => {
        rep.forEach((row) => {
          row.forEach((cell) => {
            if (cell) lineCount += 1;
          });
        });
      });
    }
    rows.push([`Area ${areaIndex + 1} Name`, areaName]);
    rows.push([`Area ${areaIndex + 1} Address`, area?.address || ""]);
    rows.push([`Area ${areaIndex + 1} Size (ha)`, area?.areaSize?.hectares ?? ""]);
    rows.push([`Area ${areaIndex + 1} Plot Count`, String(lineCount)]);
  });

  return rows;
}

function buildDatabaseDataset() {
  const trials =
    typeof trialState !== "undefined" && Array.isArray(trialState.trials)
      ? trialState.trials.filter((t) => !t.archived)
      : [];

  const allParameters =
    typeof inventoryState !== "undefined" && Array.isArray(inventoryState.items?.parameters)
      ? inventoryState.items.parameters
      : [];

  // Collect all unique parameter IDs across all non-archived trials
  const allParamIds = [];
  const seenParamIds = new Set();
  trials.forEach((trial) => {
    (trial.parameters || []).forEach((paramId) => {
      if (!seenParamIds.has(paramId)) {
        seenParamIds.add(paramId);
        allParamIds.push(paramId);
      }
    });
  });

  // Resolve parameter objects; separate formula vs non-formula, formulas go last
  const resolvedParams = allParamIds
    .map((id) => allParameters.find((p) => p.id === id))
    .filter(Boolean);
  const nonFormulaParams = resolvedParams.filter((p) => (p.type || "").toLowerCase() !== "formula");
  const formulaParams = resolvedParams.filter((p) => (p.type || "").toLowerCase() === "formula");
  const orderedParams = [...nonFormulaParams, ...formulaParams];

  const fixedColumns = [
    { key: "row_no", label: "No.", source: "fixed" },
    { key: "trial_name", label: "Trial", source: "fixed" },
    { key: "area_name", label: "Area", source: "fixed" },
    { key: "replication", label: "Replication", source: "fixed" },
    { key: "entry_name", label: "Entry", source: "fixed" },
    { key: "sample", label: "Sample", source: "fixed" },
  ];

  const rows = [];
  let rowCounter = 0;

  trials.forEach((trial) => {
    const trialParamIds = new Set(trial.parameters || []);
    const trialNonFormula = orderedParams.filter(
      (p) => trialParamIds.has(p.id) && (p.type || "").toLowerCase() !== "formula",
    );

    (trial.areas || []).forEach((area, areaIndex) => {
      if (!area?.layout?.result) return;

      const areaName = area.name || "Area " + (areaIndex + 1);

      area.layout.result.forEach((rep, repIndex) => {
        rep.forEach((row) => {
          row.forEach((cell) => {
            if (!cell) return;

            const maxSamples = Math.max(
              1,
              ...trialNonFormula.map((p) => Math.max(1, Number(p.numberOfSamples || 1))),
            );

            for (let sampleIndex = 0; sampleIndex < maxSamples; sampleIndex++) {
              rowCounter++;
              const rowObj = {
                row_no: String(rowCounter),
                trial_name: trial.name || "",
                area_name: areaName,
                replication: String(repIndex + 1),
                entry_name: cell.name || "",
                sample: String(sampleIndex + 1),
              };

              const formulaContext = buildFormulaObservationContext(
                trial,
                areaIndex,
                cell.id,
                repIndex,
                trialNonFormula,
              );

              orderedParams.forEach((param) => {
                const colKey = "param_" + param.id;

                if (!trialParamIds.has(param.id)) {
                  rowObj[colKey] = "";
                  return;
                }

                if ((param.type || "").toLowerCase() === "formula") {
                  const result = evaluateFormulaForReport(param.formula, formulaContext.values);
                  rowObj[colKey] = result.ok ? String(result.value) : "";
                } else {
                  const sampleCount = Math.max(1, Number(param.numberOfSamples || 1));
                  if (sampleIndex >= sampleCount) {
                    rowObj[colKey] = "";
                  } else {
                    const obs = getObservationReportEntry(
                      trial,
                      areaIndex,
                      param,
                      cell.id,
                      repIndex,
                      sampleIndex,
                    );
                    rowObj[colKey] = obs.value;
                  }
                }
              });

              rows.push(rowObj);
            }
          });
        });
      });
    });
  });

  return {
    fixedColumns: fixedColumns,
    extraColumns: [],
    parameterColumns: orderedParams.map((p) => ({ id: p.id, name: p.name })),
    rows: rows,
  };
}

function buildTrialObservationSheetRows(trial, area, areaIndex, trialParameters) {
  const formulaParams = (trialParameters || []).filter((p) => (p.type || "").toLowerCase() === "formula");
  const nonFormulaParams = (trialParameters || []).filter((p) => (p.type || "").toLowerCase() !== "formula");
  const allParams = [...nonFormulaParams, ...formulaParams];

  const rows = [[
    "No",
    "Area",
    "Replication",
    "Entry",
    "Sample",
    ...allParams.map((param) => String(param.name || "Parameter")),
  ]];

  if (!area?.layout?.result || allParams.length === 0) {
    return rows;
  }

  const areaName = area.name || `Area ${areaIndex + 1}`;
  let rowNumber = 1;

  area.layout.result.forEach((rep, repIndex) => {
    rep.forEach((row) => {
      row.forEach((cell) => {
        if (!cell) return;

        const maxSamples = Math.max(
          1,
          ...nonFormulaParams.map((param) => Math.max(1, Number(param.numberOfSamples || 1))),
        );

        for (let sampleIndex = 0; sampleIndex < maxSamples; sampleIndex++) {
          const rowValues = [
            rowNumber++,
            areaName,
            repIndex + 1,
            cell.name || "",
            sampleIndex + 1,
          ];

          const formulaContext = buildFormulaObservationContext(
            trial,
            areaIndex,
            cell.id,
            repIndex,
            nonFormulaParams,
          );

          allParams.forEach((param) => {
            if ((param.type || "").toLowerCase() === "formula") {
              const formulaResult = evaluateFormulaForReport(param.formula, formulaContext.values);
              rowValues.push(formulaResult.ok ? formulaResult.value : "");
            } else {
              const sampleCount = Math.max(1, Number(param.numberOfSamples || 1));
              if (sampleIndex >= sampleCount) {
                rowValues.push("");
              } else {
                const observation = getObservationReportEntry(
                  trial,
                  areaIndex,
                  param,
                  cell.id,
                  repIndex,
                  sampleIndex,
                );
                rowValues.push(observation.value);
              }
            }
          });

          rows.push(rowValues);
        }
      });
    });
  });

  return rows;
}

function buildTrialAgronomySheetRows(trial, area, areaIndex) {
  const items = getTrialAgronomyItems(trial);
  const rows = [[
    "No",
    "Area",
    ...items.map((item) => String(item.activity || item.name || "Activity")),
  ]];

  const areaName = area?.name || `Area ${areaIndex + 1}`;

  if (items.length === 0) return rows;

  const values = items.map((item) => {
    const response = trial.agronomyResponses?.[areaIndex]?.[item.id] || {};
    return formatReportTimestamp(response.applicationDate);
  });

  rows.push([areaIndex + 1, areaName, ...values]);

  return rows;
}

function getObservationReportEntry(trial, areaIndex, param, lineId, repIndex, sampleIndex) {
  const areaResponses = trial.responses?.[areaIndex]?.[param.id] || {};
  const sampleKey = `${lineId}_${repIndex}_${sampleIndex}`;
  const legacyKey = `${lineId}_${repIndex}`;

  const valueEntry = areaResponses[sampleKey] || (sampleIndex === 0 ? areaResponses[legacyKey] : null) || {};
  const value = valueEntry?.value ?? "";

  let photoKey = sampleKey;
  const photoMode = param.photoMode || "per-sample";
  if (photoMode === "per-line") {
    photoKey = `${lineId}_${repIndex}`;
  }

  const photoEntry = areaResponses[photoKey] || {};
  const photoList = Array.isArray(photoEntry.photos) ? photoEntry.photos : [];
  const timestamp = valueEntry.timestamp || photoEntry.timestamp || "";

  return {
    value,
    hasPhoto: photoList.length > 0,
    photoCount: photoList.length,
    timestamp,
  };
}

function formatReportTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function buildFormulaObservationContext(trial, areaIndex, lineId, repIndex, nonFormulaParams) {
  const values = {};

  nonFormulaParams.forEach((param) => {
    const numeric = getNumericObservationAggregate(trial, areaIndex, param, lineId, repIndex);
    if (numeric === null) return;

    const tokens = [];
    if (param.initial) tokens.push(String(param.initial).trim());
    if (param.name) tokens.push(String(param.name).trim().replace(/\s+/g, "_"));

    tokens.forEach((token) => {
      if (!token) return;
      values[token] = numeric;
    });
  });

  return { values };
}

function getNumericObservationAggregate(trial, areaIndex, param, lineId, repIndex) {
  const sampleCount = Math.max(1, Number(param.numberOfSamples || 1));
  const nums = [];

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
    const entry = getObservationReportEntry(trial, areaIndex, param, lineId, repIndex, sampleIndex);
    const parsed = parseReportNumber(entry.value);
    if (parsed !== null) nums.push(parsed);
  }

  if (nums.length === 0) return null;
  const sum = nums.reduce((acc, val) => acc + val, 0);
  return Number((sum / nums.length).toFixed(6));
}

function parseReportNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value).trim().replace(/,/g, ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function evaluateFormulaForReport(formula, contextValues) {
  const source = String(formula || "").trim();
  if (!source) return { ok: false, value: "", references: [] };

  const compact = source.replace(/\s+/g, "");
  const tokens = compact.match(/([A-Za-z_][A-Za-z0-9_]*|\d*\.?\d+|[()+\-*/])/g);
  if (!tokens || tokens.join("") !== compact) {
    return { ok: false, value: "", references: [] };
  }

  const references = [];
  let expression = "";

  for (const token of tokens) {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) {
      references.push(token);
      const value = contextValues[token];
      if (value === undefined || value === null || !Number.isFinite(Number(value))) {
        return { ok: false, value: "", references };
      }
      expression += `(${Number(value)})`;
    } else {
      expression += token;
    }
  }

  if (!/^[0-9()+\-*/.\s]+$/.test(expression)) {
    return { ok: false, value: "", references };
  }

  try {
    const result = Function(`"use strict"; return (${expression});`)();
    if (!Number.isFinite(result)) {
      return { ok: false, value: "", references };
    }
    return { ok: true, value: Number(result.toFixed(6)), references };
  } catch (_) {
    return { ok: false, value: "", references };
  }
}

function getTrialPlantingYear(trial) {
  const source = String(
    getTrialPrimaryPlantingDate(trial) || trial?.plantingStart || trial?.plantingEnd || "",
  ).trim();
  const match = source.match(/^(\d{4})/);
  return match ? match[1] : "";
}

function buildTrialDetailLayoutResultHtml(area) {
  const layouts = Array.isArray(area?.layout?.result) ? area.layout.result : [];

  if (layouts.length === 0) {
    return `
      <div class='td-area-lines'>
        <div class='td-icon'>
          <span class="material-symbols-rounded">table_view</span>
        </div>
        <div class='td-content'>
          <div class='td-label'>Layouting Result:</div>
          <div class='td-value'>-</div>
        </div>
      </div>
    `;
  }

  return `
    <div class='td-area-lines'>
      <div class='td-icon'>
        <span class="material-symbols-rounded">table_view</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Layouting Result:</div>
        ${layouts
          .map((grid, repIndex) => {
            const rows = Array.isArray(grid) ? grid : [];
            return `
              <div class="layouting-table-wrap">
                <div class="layouting-table-title">Replication ${repIndex + 1}</div>
                <table class="layouting-table">
                  <tbody>
                    ${rows
                      .map((row, rowIdx) => {
                        const cells = Array.isArray(row) ? row : [];
                        return `
                          <tr>
                            <td class="layouting-row-header">Range ${rowIdx + 1}</td>
                            ${cells
                              .map((cell) => `
                                <td class="layouting-td">${cell ? escapeHtml(cell.name) : "-"}</td>
                              `)
                              .join("")}
                          </tr>
                        `;
                      })
                      .join("")}
                  </tbody>
                </table>
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

// Show trial detail modal
function showTrialDetail(trialId) {
  const trial = trialState.trials.find(t => t.id === trialId);
  if (!trial) return;

  const modal = document.getElementById('trialDetailModal');
  if (!modal) return;

  // Store current trial for editing/deleting
  window.currentDetailTrialId = trialId;

  const archiveBtn = document.getElementById('trialDetailArchiveBtn');
  const editBtn = document.getElementById('trialDetailEditBtn');

  if (archiveBtn) {
    if (trial.archived) {
      archiveBtn.innerHTML = '<span class="material-symbols-rounded" style="color:var(--warning)">unarchive</span> Unarchive';
      archiveBtn.onclick = function() { unarchiveTrialFromDetail(); closeAllToolbarDropdowns(); };
    } else {
      archiveBtn.innerHTML = '<span class="material-symbols-rounded" style="color:var(--warning)">archive</span> Archive';
      archiveBtn.onclick = function() { archiveTrialFromDetail(); closeAllToolbarDropdowns(); };
    }
    archiveBtn.style.display = '';
  }
  if (editBtn) {
    editBtn.style.display = trial.archived ? 'none' : '';
  }

  // Set header info
  document.getElementById('trialDetailTitle').textContent = trial.name;

  // Build comprehensive body content
  const body = document.getElementById('trialDetailBody');
  if (!body) return;

  // Resolve parameters
  const paramDetails = (trial.parameters || []).map(paramId => {
    return inventoryState.items.parameters.find(p => p.id === paramId);
  }).filter(Boolean);

  // Resolve location
  const location = inventoryState.items.locations?.find(l => l.id === trial.locationId);

  // Progress (combined observation + agronomy)
  const progress = getTrialProgress(trial);
  const progressColor = progress.percentage === 100 ? 'var(--success)' 
                      : progress.percentage > 50 ? 'var(--primary)' 
                      : progress.percentage > 0 ? 'var(--warning)' 
                      : 'var(--text-tertiary)';

  // Areas summary
  const areaCount = trial.areas ? trial.areas.length : 0;
  const factorCount = normalizeTrialFactorsCount(trial.trialFactors);
  const factorDefinitions = normalizeTrialFactorDefinitions(trial);
  const totalLines = trial.areas?.reduce((sum, area) => {
    if (area.layout?.result) {
      let count = 0;
      area.layout.result.forEach(rep => rep.forEach(row => row.forEach(cell => { if (cell) count++; })));
      return sum + count;
    }
    return sum + (area.layout?.lines?.length || 0);
  }, 0) || 0;

  // Calculate total samples (lines × parameters × numberOfSamples)
  const totalSamples = trial.areas?.reduce((sum, area) => {
    if (area.layout?.result) {
      let count = 0;
      // Count cells (lines)
      area.layout.result.forEach(rep => rep.forEach(row => row.forEach(cell => { if (cell) count++; })));
      // Multiply by number of parameters and their samples
      const paramSampleCount = (trial.parameters || []).reduce((paramSum, paramId) => {
        const param = inventoryState.items.parameters.find((p) => p.id === paramId);
        const numberOfSamples = param?.numberOfSamples || 1;
        return paramSum + numberOfSamples;
      }, 0);
      return sum + (count * paramSampleCount);
    }
    return sum;
  }, 0) || 0;

  // Detailed progress text
  const obsText = `${progress.obs.completed}/${progress.obs.total} observations`;
  const agroText = progress.agro.total > 0 ? ` · ${progress.agro.completed}/${progress.agro.total} agronomy` : '';

  body.innerHTML = `

  <div class='td-container grid-2 td-intro'>

    <div class='td-section td-progress'>
      <svg class="td-progress-circle" width="120" height="120" viewBox="0 0 64 64"> <circle cx="32" cy="32" r="28" class="progress-circle-bg"></circle> <circle cx="32" cy="32" r="28" class="progress-circle-fill" style="stroke-dasharray: ${progress.percentage * 1.75} 175; stroke: ${getProgressGradientColor(progress.percentage)}"></circle> <text x="32" y="37" class="progress-circle-text" text-anchor="middle">${progress.percentage}%</text> </svg>
    </div>

    <div class='td-section td-description'>
      <div class='td-icon'>
        <span class="material-symbols-rounded td-section-icon">description</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Description</div>
        <div class='td-value'>${escapeHtml(trial.description)}</div>
        <div class='td-text'>${obsText}${agroText} completed</div>
      </div>
    </div>

  </div>

  <div class='td-title'>
    <p>General</p>
  </div>

  <div class='td-container grid-4'>

    <div class='td-section td-crop'>
      <div class='td-icon'>
        <span class="material-symbols-rounded td-info-icon">psychiatry</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Crop</div>
        <div class='td-value'>${escapeHtml(trial.cropName || "-")}</div>
      </div>
    </div>
  
    <div class='td-section td-pollination'>
      <div class='td-icon'>
        <span class="material-symbols-rounded td-info-icon">spa</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Type of Pollination</div>
        <div class='td-value'>${escapeHtml(trial.pollination || "-")}</div>
      </div>
    </div>

    <div class='td-section td-type'>
      <div class='td-icon'>
        <span class="material-symbols-rounded td-info-icon">science</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Trial Type</div>
        <div class='td-value'>${escapeHtml(trial.trialType || "-")}</div>
      </div>
    </div>

    <div class='td-section td-planting-window'>
      <div class='td-icon'>
        <span class="material-symbols-rounded td-info-icon">calendar_month</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Planting Window</div>
        <div class='td-value'>${trial.plantingStart ? formatMonthYear(trial.plantingStart) : "-"} — ${trial.plantingEnd ? formatMonthYear(trial.plantingEnd) : "-"}</div>
      </div>
    </div>

    <div class='td-section'>
      <div class='td-icon'>
        <span class="material-symbols-rounded td-info-icon">wb_sunny</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Planting Season</div>
        <div class='td-value'>${escapeHtml(trial.plantingSeason || "-")}</div>
      </div>
    </div>

    <div class='td-section' style='grid-column: 2 / span 2;'>
      <div class='td-icon'>
        <span class="material-symbols-rounded td-info-icon">dashboard_customize</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Experimental Design</div>
        <div class='td-value'>${escapeHtml(trial.expDesign ? ({CRD:'Completely Randomized Design (CRD)',RBD:'Randomized Block Design (RBD)',LSD:'Latin Square Design (LSD)'}[trial.expDesign] || trial.expDesign) : "-")}</div>
      </div>
    </div>

    <div class='td-section'>
      <div class='td-icon'>
        <span class="material-symbols-rounded td-info-icon">category</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>No. of Factors</div>
        <div class='td-value'>${factorCount}</div>
      </div>
    </div>

  </div>

  <div class='td-container'>
    <div class='td-section'>
      <div class='td-icon'>
        <span class="material-symbols-rounded td-section-icon">manufacturing</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Factors & Treatments</div>
        ${factorDefinitions.length > 0 ? `
          <div class='td-grid'>
            ${factorDefinitions.map((factor, index) => `
              <div class='td-item' style='display:block;'>
                <div style='font-weight:600; margin-bottom:0.25rem;'>Factor ${index + 1}: ${escapeHtml(factor.name || "-")}</div>
                <div class='td-param-name'>${factor.treatments.length > 0 ? escapeHtml(factor.treatments.join(", ")) : "-"}</div>
              </div>
            `).join("")}
          </div>
        ` : `<div class='td-value'>-</div>`}
      </div>
    </div>
  </div>

  <div class='td-container'>

    <div class='td-section td-param'>
      <div class='td-icon'>
        <span class="material-symbols-rounded td-section-icon">biotech</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Observation Parameters</div>
        ${paramDetails.length > 0 ? `
        <div class='td-grid grid-4'>
          ${paramDetails.map((param) => `
            <div class='td-item'>
              <span class="material-symbols-rounded td-param-icon">${getParamIcon(param.type)}</span>
              <span class="td-param-name">${escapeHtml(param.name)}</span>
            </div>
          `,).join("")}
        </div>
        ` : `No parameters assigned.`}
      </div>
    </div>

    ${trial.agronomyMonitoring ? (() => {
      const agronomyDetails = (trial.agronomyItems || []).map(itemId => {
        return inventoryState.items.agronomy?.find(a => a.id === itemId);
      }).filter(Boolean);
      return `
    <div class='td-section td-agronomy'>
      <div class='td-icon'>
        <span class="material-symbols-rounded td-section-icon">local_florist</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Agronomy Monitoring</div>
        ${agronomyDetails.length > 0 ? `
        <div class='td-grid grid-4'>
          ${agronomyDetails.map(item => {
            const dap = item.dapMin != null && item.dapMax != null && item.dapMax !== '' && item.dapMax !== item.dapMin
              ? item.dapMin + '-' + item.dapMax + ' DAP'
              : item.dapMin != null ? item.dapMin + ' DAP' : '';
            const meta = [dap, item.chemical, item.dose].filter(Boolean).join(' · ');
            return `
            <div class='td-item'>
              <span class="material-symbols-rounded td-param-icon">radio_button_checked</span>
              <span class="td-param-name">${escapeHtml(item.activity || item.name || '-')}</span>
            </div>`;
          }).join('')}
        </div>
        ` : `No agronomy items assigned.`}
      </div>
    </div>
`;
    })() : ''}

  </div>

  <div class='td-title'>
    <p>Plot Specifications</p>
  </div>

  ${trial.trialType === 'Micropilot' ? `
  <div class='td-container grid-2'>

    <div class='td-section'>
      <div class='td-icon'>
        <span class="material-symbols-rounded">dashboard</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Panel</div>
        <div class='td-value'>${trial.mpPanel ?? '-'}</div>
      </div>
    </div>

    <div class='td-section'>
      <div class='td-icon'>
        <span class="material-symbols-rounded">female</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Ratio Female : Male</div>
        <div class='td-value'>${trial.ratioFemale ?? '-'} : ${trial.ratioMale ?? '-'}</div>
      </div>
    </div>

  </div>

  <div class='td-container grid-3'>

    <div class='td-section'>
      <div class='td-icon'>
        <span class="material-symbols-rounded">straighten</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Plot Length</div>
        <div class='td-value'>${trial.mpPlotLength != null ? trial.mpPlotLength + ' m' : '-'}</div>
      </div>
    </div>

    <div class='td-section'>
      <div class='td-icon'>
        <span class="material-symbols-rounded">space_dashboard</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Plant Spacing</div>
        <div class='td-value'>${trial.mpSpacingWidth ?? '-'} × ${trial.mpSpacingHeight ?? '-'} cm</div>
      </div>
    </div>

    <div class='td-section'>
      <div class='td-icon'>
        <span class="material-symbols-rounded"> activity_zone </span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Plot Area</div>
        <div class='td-value'>${trial.mpPlotArea != null ? trial.mpPlotArea.toFixed(2) + ' m²' : '-'}</div>
      </div>
    </div>

    <div class='td-section'>
      <div class='td-icon'>
        <span class="material-symbols-rounded">view_agenda</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Total Female Rows</div>
        <div class='td-value'>${trial.mpTotalFemaleRows ?? '-'}</div>
      </div>
    </div>

    <div class='td-section'>
      <div class='td-icon'>
        <span class="material-symbols-rounded"> nest_farsight_eco </span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Female Population/plot</div>
        <div class='td-value'>${trial.mpExpectedFemale != null ? Math.round(trial.mpExpectedFemale).toLocaleString() + ' plants' : '-'}</div>
      </div>
    </div>

    <div class='td-section'>
      <div class='td-icon'>
        <span class="material-symbols-rounded"> nest_eco_leaf </span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Female Population/ha</div>
        <div class='td-value'>${trial.mpPopFemale != null ? Math.round(trial.mpPopFemale).toLocaleString() + ' plants' : '-'}</div>
      </div>
    </div>

    <div class='td-section'>
      <div class='td-icon'>
        <span class="material-symbols-rounded">view_agenda</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Total Male Rows</div>
        <div class='td-value'>${trial.mpTotalMaleRows ?? '-'}</div>
      </div>
    </div>

    <div class='td-section'>
      <div class='td-icon'>
        <span class="material-symbols-rounded"> nest_farsight_eco </span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Male Population/plot</div>
        <div class='td-value'>${trial.mpExpectedMale != null ? Math.round(trial.mpExpectedMale).toLocaleString() + ' plants' : '-'}</div>
      </div>
    </div>

    <div class='td-section'>
      <div class='td-icon'>
        <span class="material-symbols-rounded"> nest_eco_leaf </span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Male Population/ha</div>
        <div class='td-value'>${trial.mpPopMale != null ? Math.round(trial.mpPopMale).toLocaleString() + ' plants' : '-'}</div>
      </div>
    </div>

  </div>
  ` : `
  <div class='td-container grid-3'>

    <div class='td-section td-no-rows'>
      <div class='td-icon'>
        <span class="material-symbols-rounded">view_agenda</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>No. of Rows per Plot</div>
        <div class='td-value'>${trial.rowsPerPlot} rows</div>
      </div>
    </div>

    <div class='td-section td-plot-length'>
      <div class='td-icon'>
        <span class="material-symbols-rounded">straighten</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Plot Length</div>
        <div class='td-value'>${trial.plotLength} m</div>
      </div>
    </div>

    <div class='td-section td-expected-plant'>
      <div class='td-icon'>
        <span class="material-symbols-rounded td-info-icon">nest_farsight_eco</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Exp. No. of Plants per Plot</div>
        <div class='td-value'>${trial.expectedPlantsPerPlot != null ? Math.round(trial.expectedPlantsPerPlot).toLocaleString() + ' plants' : '-'}</div>
      </div>
    </div>

    <div class='td-section td-spacing'>
      <div class='td-icon'>
        <span class="material-symbols-rounded">space_dashboard</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Plant Spacing</div>
        <div class='td-value'>${trial.plantSpacingWidth} × ${trial.plantSpacingHeight} cm</div>
      </div>
    </div>

    <div class='td-section td-plot-area'>
      <div class='td-icon'>
        <span class="material-symbols-rounded"> activity_zone </span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Plot Area</div>
        <div class='td-value'>${trial.plotArea != null ? trial.plotArea.toFixed(2) + ' m²' : '-'}</div>
      </div>
    </div>

    <div class='td-section td-population'>
      <div class='td-icon'>
        <span class="material-symbols-rounded td-info-icon">nest_eco_leaf</span>
      </div>
      <div class='td-content'>
        <div class='td-label'>Population per Hectare</div>
        <div class='td-value'>${trial.populationPerHa != null ? Math.round(trial.populationPerHa).toLocaleString() + ' plants' : '-'}</div>
      </div>
    </div>

  </div>
  `}

  <div class='td-title'>
    <p>Trial Areas</p>
  </div>

  <div class='td-container'>

    ${trial.areas && trial.areas.length > 0 ? trial.areas.map((area, areaIdx) => {
      // Collect unique lines from layout result
      const uniqueLines = [];
      const seenIds = new Set();
      if (area.layout?.result) {
        area.layout.result.forEach(rep => {
          rep.forEach(row => {
            row.forEach(cell => {
              if (cell && !seenIds.has(cell.id)) {
                seenIds.add(cell.id);
                uniqueLines.push(cell);
              }
            });
          });
        });
      } else if (area.layout?.lines) {
        area.layout.lines.forEach(line => {
          if (!seenIds.has(line.id)) {
            seenIds.add(line.id);
            uniqueLines.push(line);
          }
        });
      }
      
      return `
    <div class='td-section td-area'>
      <div class='td-area-header td-grid grid-4'>
        <div class='td-area-map' id='detailAreaMap${areaIdx}'>
        </div>
        <div class='td-area-head-info'>
          <div class='td-area-title'>
            <p>${escapeHtml(area.name || `Area ${areaIdx + 1}`)}</p>
          </div>
          <div class='td-area-size'>
            <span class="material-symbols-rounded"> straighten </span>
            <p>~${area.areaSize.hectares.toFixed(2)} ha</p>
          </div>
          <div class='td-area-address'>
            <span class="material-symbols-rounded"> location_on </span>
            <p>${escapeHtml(area.address)}</p>
          </div>
          <div class='td-area-ranges'>
            <span class="material-symbols-rounded">grid_3x3</span>
            <p>Ranges: ${area.layout.numRanges || 0}</p>
          </div>
          <div class='td-area-replication'>
            <span class="material-symbols-rounded">repeat</span>
            <p>Reps: ${area.layout.result?.length || 0}</p>
          </div>
          <div class='td-area-direction'>
            <span class="material-symbols-rounded">compare_arrows</span>
            <p>Direction: ${escapeHtml(area.layout.direction === "serpentine" ? "Serpentine" : "Straight")}</p>
          </div>
          <div class='td-area-randomization'>
            <span class="material-symbols-rounded">shuffle</span>
            <p>Randomization: ${escapeHtml(area.layout.randomization === "random" ? "Random" : "Normal")}</p>
          </div>
          <div class='td-area-planting-date'>
            <span class="material-symbols-rounded">event</span>
            <p>Planting Date: ${area?.plantingDate ? new Date(area.plantingDate + 'T00:00:00').toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'}) : '-'}</p>
          </div>
        </div>
      </div>
      ${uniqueLines.length > 0 ? `
      <div class='td-area-lines'>
        <div class='td-icon'>
          <span class="material-symbols-rounded">grass</span>
        </div>
        <div class='td-content'>
          <div class='td-label'>Entries used (${uniqueLines.length}):</div>
          <div class='td-lines-flex'>
            ${uniqueLines.map(line => `<div class='td-item'><span class="td-param-name">${escapeHtml(line.name)}</span></div>`).join('')}
          </div>
        </div>
      </div>
      ` : ''}
      ${buildTrialDetailLayoutResultHtml(area)}
    </div>
    `;}).join("") : ``}

  </div>

    <div class="td-timestamps">
      ${
        trial.createdAt
          ? `
      <div class="td-timestamp">
        <span class="material-symbols-rounded">schedule</span>
        Created: ${new Date(trial.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
      </div>`
          : ""
      }
      ${
        trial.updatedAt
          ? `
      <div class="td-timestamp">
        <span class="material-symbols-rounded">update</span>
        Updated: ${new Date(trial.updatedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
      </div>`
          : ""
      }
    </div>
  `;

  // Show modal first, then initialize maps after a tick (so container is visible)
  modal.classList.add('active');
  lockBodyScroll();

  // Initialize area maps after modal is fully laid out
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      initializeTrialDetailAreaMaps(trial);
    });
  });
}

// Helper: Get icon name for parameter type
function getParamIcon(type) {
  const icons = {
    'number': 'pin',
    'text': 'text_fields',
    'radio': 'radio_button_checked',
    'checkbox': 'check_box',
    'range': 'linear_scale',
    'date': 'calendar_today',
    'photo': 'photo_camera',
  };
  return icons[type] || 'science';
}

// Close trial detail modal
function closeTrialDetailModal() {
  const modal = document.getElementById('trialDetailModal');
  if (modal) {
    modal.classList.remove('active');
    unlockBodyScroll();
    // Clean up all area preview maps
    if (window.trialDetailAreaMaps) {
      Object.values(window.trialDetailAreaMaps).forEach(map => {
        if (map) map.remove();
      });
      window.trialDetailAreaMaps = null;
    }
  }
}

async function downloadTrialDetailPdf() {
  const detailBody = document.getElementById('trialDetailBody');
  if (!detailBody) {
    showToast('Trial detail not found', 'error');
    return;
  }

  if (typeof html2canvas === 'undefined' || !window.jspdf || !window.jspdf.jsPDF) {
    showToast('PDF library not loaded. Please try again.', 'error');
    return;
  }

  const exportWidth = 1200;
  const trialTitle = (document.getElementById('trialDetailTitle')?.textContent || 'Trial Detail').trim();
  const safeName = trialTitle.replace(/[^a-z0-9_\- ]/gi, '').replace(/\s+/g, '_') || 'Trial_Detail';

  const wrapper = document.createElement('div');
  wrapper.style.position = 'fixed';
  wrapper.style.left = '-20000px';
  wrapper.style.top = '0';
  wrapper.style.width = `${exportWidth}px`;
  wrapper.style.background = '#ffffff';
  wrapper.style.padding = '24px';
  wrapper.style.boxSizing = 'border-box';
  wrapper.style.zIndex = '-1';

  const header = document.createElement('div');
  header.className = 'library-detail-header';
  header.style.marginBottom = '16px';
  header.innerHTML = `
    <div class="library-detail-info">
      <h3 style="margin:0;">${escapeHtml(trialTitle)}</h3>
    </div>
  `;

  const clone = detailBody.cloneNode(true);
  clone.style.width = '100%';
  clone.style.maxHeight = 'none';
  clone.style.overflow = 'visible';

  const defaultTrialAreasTitle = Array.from(clone.querySelectorAll('.td-title')).find((titleEl) => {
    const text = titleEl.querySelector('p')?.textContent || '';
    return String(text).trim().toLowerCase() === 'trial areas';
  });
  let exportTrialAreasTitle = null;
  if (defaultTrialAreasTitle) {
    exportTrialAreasTitle = document.createElement('div');
    exportTrialAreasTitle.className = 'library-detail-header';
    exportTrialAreasTitle.style.marginBottom = '16px';
    exportTrialAreasTitle.innerHTML = `
      <div class="library-detail-info">
        <h3 style="margin:0;">Trial Areas</h3>
      </div>
    `;
    defaultTrialAreasTitle.replaceWith(exportTrialAreasTitle);
  }

  clone.querySelectorAll('.td-progress svg').forEach((svgEl) => {
    svgEl.style.transform = 'none';
    svgEl.querySelectorAll('.progress-circle-fill').forEach((circle) => {
      circle.setAttribute('transform', 'rotate(-90 32 32)');
    });
    svgEl.querySelectorAll('.progress-circle-text').forEach((textEl) => {
      textEl.style.transform = 'none';
      textEl.removeAttribute('transform');
    });
  });

  wrapper.appendChild(header);
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  const originalBtn = document.getElementById('trialDetailDownloadBtn');
  if (originalBtn) {
    originalBtn.disabled = true;
    originalBtn.classList.add('loading');
  }

  try {
    await new Promise((resolve) => setTimeout(resolve, 50));

    const canvas = await html2canvas(wrapper, {
      backgroundColor: '#ffffff',
      scale: Math.max(1.5, window.devicePixelRatio || 1),
      useCORS: true,
      allowTaint: false,
      logging: false,
      windowWidth: exportWidth,
      width: exportWidth,
      height: Math.ceil(wrapper.scrollHeight),
    });

    const pdf = new window.jspdf.jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4',
      compress: true,
    });

    const pageWidthPt = pdf.internal.pageSize.getWidth();
    const pageHeightPt = pdf.internal.pageSize.getHeight();
    const marginPt = 1;
    const printableWidthPt = pageWidthPt - (marginPt * 2);
    const printableHeightPt = pageHeightPt - (marginPt * 2);

    const scalePtPerPx = printableWidthPt / canvas.width;
    const pageSliceHeightPx = Math.max(1, Math.floor(printableHeightPt / scalePtPerPx));

    const wrapperRect = wrapper.getBoundingClientRect();
    const trialAreasTitle = exportTrialAreasTitle
      || Array.from(clone.querySelectorAll('.td-title p')).find(
        (el) => String(el.textContent || '').trim().toLowerCase() === 'trial areas',
      )?.closest('.td-title');
    const forcedBreaksPx = [];
    if (trialAreasTitle) {
      const titleRect = trialAreasTitle.getBoundingClientRect();
      const relativeTopCssPx = Math.max(0, titleRect.top - wrapperRect.top);
      const captureScale = canvas.width / Math.max(1, wrapper.scrollWidth);
      const breakAtPx = Math.round(relativeTopCssPx * captureScale);
      if (breakAtPx > 0 && breakAtPx < canvas.height) {
        forcedBreaksPx.push(breakAtPx);
      }
    }

    let offsetYpx = 0;
    let pageIndex = 0;
    let breakIndex = 0;

    while (offsetYpx < canvas.height) {
      const remaining = canvas.height - offsetYpx;
      let sliceHeightPx = Math.min(pageSliceHeightPx, remaining);

      const nextBreakPx = forcedBreaksPx[breakIndex];
      if (
        Number.isFinite(nextBreakPx) &&
        nextBreakPx > offsetYpx + 8 &&
        nextBreakPx < offsetYpx + sliceHeightPx - 8
      ) {
        sliceHeightPx = nextBreakPx - offsetYpx;
        breakIndex += 1;
      } else if (Number.isFinite(nextBreakPx) && nextBreakPx <= offsetYpx + 8) {
        breakIndex += 1;
      }

      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeightPx;
      const pageCtx = pageCanvas.getContext('2d');
      if (!pageCtx) break;

      pageCtx.fillStyle = '#ffffff';
      pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      pageCtx.drawImage(
        canvas,
        0,
        offsetYpx,
        canvas.width,
        sliceHeightPx,
        0,
        0,
        canvas.width,
        sliceHeightPx,
      );

      const pageImgData = pageCanvas.toDataURL('image/png');
      const renderHeightPt = sliceHeightPx * scalePtPerPx;

      if (pageIndex > 0) {
        pdf.addPage('a4', 'portrait');
      }

      pdf.addImage(
        pageImgData,
        'PNG',
        marginPt,
        marginPt,
        printableWidthPt,
        renderHeightPt,
        undefined,
        'FAST',
      );

      offsetYpx += sliceHeightPx;
      pageIndex += 1;
    }

    pdf.save(`${safeName}.pdf`);
    showToast('Trial detail downloaded', 'success');
  } catch (error) {
    console.error('Failed to export trial detail PDF:', error);
    showToast('Failed to download PDF', 'error');
  } finally {
    if (originalBtn) {
      originalBtn.disabled = false;
      originalBtn.classList.remove('loading');
    }
    wrapper.remove();
  }
}

// Initialize separate maps for each trial area in detail view
function initializeTrialDetailAreaMaps(trial) {
  // Initialize storage for maps
  if (!window.trialDetailAreaMaps) {
    window.trialDetailAreaMaps = {};
  } else {
    // Clean up old maps
    Object.values(window.trialDetailAreaMaps).forEach(map => {
      if (map) map.remove();
    });
    window.trialDetailAreaMaps = {};
  }

  const areas = trial.areas || [];
  if (areas.length === 0) return;

  // Render map into each area's container
  requestAnimationFrame(() => {
    areas.forEach((area, index) => {
      renderDetailAreaMap(area, index);
    });
  });
}

// Render individual area map in trial detail
function renderDetailAreaMap(area, index) {
  const mapContainer = document.getElementById(`detailAreaMap${index}`);
  if (!mapContainer) return;

  // Check container has dimensions — if not, wait until it does
  if (mapContainer.offsetWidth === 0 || mapContainer.offsetHeight === 0) {
    const ro = new ResizeObserver((entries, observer) => {
      if (mapContainer.offsetWidth > 0 && mapContainer.offsetHeight > 0) {
        observer.disconnect();
        renderDetailAreaMap(area, index);
      }
    });
    ro.observe(mapContainer);
    return;
  }

  // Collect polygon coordinates first
  let latlngs = [];
  if (area.coordinates && area.coordinates.length > 0) {
    latlngs = area.coordinates.map(coord => [coord[0], coord[1]]);
  } else if (area.polygon && area.polygon.length > 0) {
    latlngs = area.polygon.map(coord => [coord.lat, coord.lng]);
  }

  // Compute initial view from polygon so map starts at the right place
  let initCenter = [-6.2, 106.8];
  let initZoom = 12;
  if (latlngs.length > 0) {
    const bounds = L.latLngBounds(latlngs);
    initCenter = bounds.getCenter();
    initZoom = 16; // a reasonable default, fitBounds will correct it
  }

  // Create map instance
  const map = L.map(mapContainer, {
    zoomControl: false,
    attributionControl: false,
    fadeAnimation: false,
    zoomAnimation: false
  }).setView(initCenter, initZoom);

  // Add satellite layer
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxNativeZoom: 17,
    maxZoom: 25
  }).addTo(map);

  // Add labels layer
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png', {
    maxNativeZoom: 17,
    maxZoom: 25,
    pane: 'shadowPane'
  }).addTo(map);

  // Disable all interactions
  map.dragging.disable();
  map.touchZoom.disable();
  map.doubleClickZoom.disable();
  map.scrollWheelZoom.disable();
  map.boxZoom.disable();
  map.keyboard.disable();
  if (map.tap) map.tap.disable();

  // Draw polygon and fit bounds
  if (latlngs.length > 0) {
    L.polygon(latlngs, {
      color: '#2563eb',
      fillColor: '#3b82f6',
      fillOpacity: 0.3,
      weight: 2
    }).addTo(map);

    map.fitBounds(latlngs, { padding: [20, 20], animate: false });
  }

  // Store map instance
  window.trialDetailAreaMaps[index] = map;

  // Force a reliable invalidateSize after rendering is complete
  setTimeout(() => {
    map.invalidateSize({ animate: false });
    if (latlngs.length > 0) {
      map.fitBounds(latlngs, { padding: [20, 20], animate: false });
    }
  }, 300);
}

// Edit trial from detail modal
function editTrialFromDetail() {
  if (window.currentDetailTrialId) {
    closeTrialDetailModal();
    openEditTrialModal(window.currentDetailTrialId);
  }
}

// Run trial from detail modal
function runTrialFromDetail() {
  if (window.currentDetailTrialId) {
    closeTrialDetailModal();
    startRunTrial(window.currentDetailTrialId);
  }
}

// Archive trial from detail modal
function archiveTrialFromDetail() {
  if (window.currentDetailTrialId) {
    closeTrialDetailModal();
    archiveTrial(window.currentDetailTrialId);
  }
}

// Unarchive trial from detail modal
function unarchiveTrialFromDetail() {
  if (window.currentDetailTrialId) {
    closeTrialDetailModal();
    unarchiveTrial(window.currentDetailTrialId);
  }
}

// Delete trial from detail modal
function deleteTrialFromDetail() {
  if (window.currentDetailTrialId) {
    const trial = trialState.trials.find(t => t.id === window.currentDetailTrialId);
    if (trial) {
      showConfirmModal(
        "Delete Trial",
        "Are you sure you want to delete this trial? This action cannot be undone.",
        () => {
          closeTrialDetailModal();
          deleteTrialById(window.currentDetailTrialId);
          showToast("Trial deleted", "success");
        }
      );
    }
  }
}

// Helper to delete trial by ID
function deleteTrialById(trialId) {
  trialState.trials = trialState.trials.filter(t => t.id !== trialId);
  renderTrials();
  
  if (typeof saveLocalCache === 'function') {
    saveLocalCache('trials', { trials: trialState.trials });
  }

  enqueueSync({
    label: 'Delete Trial',
    run: () => deleteTrialFromGoogleDrive(trialId),
  });
}
