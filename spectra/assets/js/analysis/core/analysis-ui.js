(function initializeAnalysisUiModule() {
  const app = window.AnalysisApp;
  if (!app) {
    throw new Error("AnalysisApp must be loaded before the analysis UI module.");
  }

  const ANALYSIS_FOCUS_MODES = [
    "balanced",
    "focus-results",
    "focus-settings",
    "focus-dataset",
  ];
  const DEFAULT_EMPTY_RESULTS = '<p class="analysis-results-empty">Run an analysis to see results here.</p>';

  let analysisTopbarControlsBound = false;
  let analysisSectionHeadersBound = false;
  let resultsTabControlsBound = false;
  let analysisColumnVisibilityMenuButton = null;

  function ensureResultState() {
    if (!Array.isArray(app.state.resultTabs)) {
      app.state.resultTabs = [];
    }
    if (typeof app.state.resultTabCounter !== "number") {
      app.state.resultTabCounter = 0;
    }
    if (!app.state.currentResultTabId && app.state.resultTabs.length > 0) {
      app.state.currentResultTabId = app.state.resultTabs[app.state.resultTabs.length - 1].id;
    }
  }

  function getVisibleColumns() {
    const allColumns = Array.isArray(app.state.columns) ? app.state.columns : [];
    const visibleColumnKeys = Array.isArray(app.state.visibleColumnKeys)
      ? app.state.visibleColumnKeys
      : null;

    if (!visibleColumnKeys || visibleColumnKeys.length === 0) {
      return allColumns;
    }

    const allowed = new Set(visibleColumnKeys.map((key) => String(key)));
    const visibleColumns = allColumns.filter((column) => allowed.has(String(column.key)));
    return visibleColumns.length > 0 ? visibleColumns : allColumns;
  }

  function getAllColumns() {
    return Array.isArray(app.state.columns) ? app.state.columns : [];
  }

  function normalizeVisibleColumnKeys(columnKeys) {
    const allColumns = getAllColumns();
    const allKeys = new Set(allColumns.map((column) => String(column.key)));
    const normalized = Array.isArray(columnKeys)
      ? Array.from(
        new Set(
          columnKeys
            .map((key) => String(key))
            .filter((key) => (allColumns.length > 0 ? allKeys.has(key) : !!key)),
        ),
      )
      : [];

    if (normalized.length === 0) {
      return null;
    }

    return normalized;
  }

  function updateColumnVisibilityTrigger() {
    const trigger = document.getElementById("analysisColumnsTrigger");
    const label = document.getElementById("analysisColumnsTriggerLabel");
    if (!trigger || !label) return;

    const totalCount = getAllColumns().length;
    const visibleCount = getVisibleColumns().length;
    label.textContent = totalCount > 0
      ? `Columns ${visibleCount}/${totalCount}`
      : "Columns";
    trigger.setAttribute("aria-expanded", analysisColumnVisibilityMenuButton ? "true" : "false");
  }

  function setVisibleColumns(columnKeys, options = {}) {
    const { skipRender = false } = options;
    app.state.visibleColumnKeys = normalizeVisibleColumnKeys(columnKeys);
    updateColumnVisibilityTrigger();

    if (!skipRender && typeof renderTable === "function") {
      renderTable();
    }
  }

  function getAnalysisColumnOptionsForSettings() {
    const allColumns = getAllColumns();
    const visibleColumns = new Set(getVisibleColumns().map((column) => String(column.key)));
    return allColumns.map((column) => ({
      key: String(column.key),
      label: String(column.label || column.key),
      visible: visibleColumns.has(String(column.key)),
    }));
  }

  function closeColumnVisibilityMenu() {
    document.querySelectorAll(".analysis-column-visibility-menu").forEach((menu) => menu.remove());
    analysisColumnVisibilityMenuButton = null;
    updateColumnVisibilityTrigger();
  }

  function applyAnalysisVisibleColumns(nextKeys) {
    const normalizedKeys = normalizeVisibleColumnKeys(nextKeys);
    const allColumns = getAllColumns();
    const safeKeys = normalizedKeys || allColumns.map((column) => String(column.key));

    if (allColumns.length > 0 && safeKeys.length === 0) {
      if (typeof showToast === "function") {
        showToast("At least one Analysis column must be visible", "warning");
      }
      return;
    }

    if (typeof updateStoredAnalysisUserSettings === "function") {
      updateStoredAnalysisUserSettings({ visibleColumns: safeKeys }, { closeMenu: false });
      return;
    }

    setVisibleColumns(safeKeys, { skipRender: false });
  }

  function openColumnVisibilityMenu(event) {
    event.stopPropagation();
    const trigger = event.currentTarget;
    const wasOpen = analysisColumnVisibilityMenuButton === trigger;
    closeColumnVisibilityMenu();
    if (wasOpen) return;

    analysisColumnVisibilityMenuButton = trigger;
    const options = getAnalysisColumnOptionsForSettings();
    const currentVisible = new Set(options.filter((item) => item.visible).map((item) => item.key));

    const menu = document.createElement("div");
    menu.className = "analysis-column-visibility-menu trial-report-column-menu";
    menu.innerHTML = `
      <div class="trial-report-column-menu-section">
        <div class="analysis-column-visibility-header">
          <strong>Visible Columns</strong>
          <button type="button" class="trial-report-column-menu-link" data-action="open-settings">Settings</button>
        </div>
        <div class="analysis-column-visibility-actions">
          <button type="button" class="trial-report-column-menu-btn" data-action="select-all">
            <span class="material-symbols-rounded">select_all</span>
            <span>Select All</span>
          </button>
        </div>
        <div class="analysis-column-visibility-list">
          ${options.map((item) => `
            <label class="analysis-column-visibility-item">
              <input type="checkbox" data-col-key="${escapeHtml(item.key)}" ${currentVisible.has(item.key) ? "checked" : ""}>
              <span>${escapeHtml(item.label)}</span>
            </label>
          `).join("")}
        </div>
      </div>
    `;

    menu.addEventListener("click", (clickEvent) => {
      const actionButton = clickEvent.target.closest("[data-action]");
      if (!actionButton) return;
      const { action } = actionButton.dataset;

      if (action === "select-all") {
        const allKeys = options.map((item) => item.key);
        menu.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
          checkbox.checked = true;
        });
        applyAnalysisVisibleColumns(allKeys);
      }

      if (action === "open-settings" && typeof openUserSettingsModal === "function") {
        closeColumnVisibilityMenu();
        openUserSettingsModal("analysis");
      }
    });

    menu.addEventListener("change", (changeEvent) => {
      if (!changeEvent.target.matches('input[type="checkbox"]')) return;

      const checkedKeys = Array.from(menu.querySelectorAll('input[type="checkbox"]'))
        .filter((checkbox) => checkbox.checked)
        .map((checkbox) => String(checkbox.dataset.colKey || ""))
        .filter(Boolean);

      if (checkedKeys.length === 0) {
        changeEvent.target.checked = true;
        if (typeof showToast === "function") {
          showToast("At least one Analysis column must be visible", "warning");
        }
        return;
      }

      applyAnalysisVisibleColumns(checkedKeys);
    });

    document.body.appendChild(menu);
    positionColumnMenu(menu, trigger);
    updateColumnVisibilityTrigger();
  }

  function getVisibleColumnIndex(colKey) {
    return getVisibleColumns().findIndex((column) => column.key === colKey);
  }

  function isFilterableColumn(colKey) {
    return getVisibleColumnIndex(colKey) > 0;
  }

  function findHeaderButtonByKey(colKey) {
    return Array.from(document.querySelectorAll("#analysisTable .analysis-th-btn")).find(
      (button) => button.dataset.colKey === colKey,
    ) || null;
  }

  function positionColumnMenu(menu, button) {
    if (!menu || !button) return;

    const buttonRect = button.getBoundingClientRect();
    let left = buttonRect.left;
    let top = buttonRect.bottom + 4;
    const menuWidth = Math.min(menu.offsetWidth || 236, 236);
    const menuHeight = Math.min(menu.offsetHeight || 280, 380);

    if (left + menuWidth > window.innerWidth - 8) {
      left = window.innerWidth - menuWidth - 8;
    }
    if (left < 4) {
      left = 4;
    }
    if (top + menuHeight > window.innerHeight - 8) {
      top = Math.max(8, buttonRect.top - menuHeight - 4);
    }

    menu.style.position = "fixed";
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.zIndex = "9999";
    menu.style.maxWidth = "min(236px, calc(100vw - 16px))";
    menu.style.maxHeight = "min(380px, calc(100vh - 16px))";
  }

  function reopenColumnMenu(colKey) {
    requestAnimationFrame(() => {
      const button = findHeaderButtonByKey(colKey);
      if (!button) return;
      openColumnMenu(
        {
          currentTarget: button,
          stopPropagation() {},
        },
        colKey,
        { forceOpen: true },
      );
    });
  }

  function getColumnMode(key) {
    const filterData = app.state.filters[key];
    if (app.state.sort && app.state.sort.key === key) return "sort";
    if (isFilterableColumn(key) && filterData && filterData.excluded && filterData.excluded.length > 0) return "filter";
    if (app.state.freezeUntilColKey === key) return "freeze";
    return "default";
  }

  function applyFilters(rows) {
    const filters = app.state.filters;
    if (!filters || Object.keys(filters).length === 0) return rows;

    return rows.filter((row) =>
      Object.entries(filters).every(([key, filterData]) => {
        if (!isFilterableColumn(key)) return true;
        if (!filterData || !filterData.excluded || filterData.excluded.length === 0) return true;
        const raw = String(row[key] ?? "").trim();
        const normalizedValue = raw || "__BLANK__";
        return !filterData.excluded.includes(normalizedValue);
      }),
    );
  }

  function applySort(rows) {
    if (!app.state.sort) return rows;

    const { key, direction } = app.state.sort;
    const sorted = [...rows];

    sorted.sort((leftRow, rightRow) => {
      const leftValue = leftRow[key] ?? "";
      const rightValue = rightRow[key] ?? "";
      const leftNumber = Number(leftValue);
      const rightNumber = Number(rightValue);

      if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber) && leftValue !== "" && rightValue !== "") {
        return direction === "asc" ? leftNumber - rightNumber : rightNumber - leftNumber;
      }

      const leftString = String(leftValue).toLowerCase();
      const rightString = String(rightValue).toLowerCase();
      if (leftString < rightString) return direction === "asc" ? -1 : 1;
      if (leftString > rightString) return direction === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }

  function closeColumnMenus() {
    document.querySelectorAll(".analysis-col-menu").forEach((menu) => menu.remove());
    app.columnMenuOpen = null;
  }

  function openColumnMenu(event, colKey, options = {}) {
    const { forceOpen = false } = options;
    event.stopPropagation();
    const wasOpen = app.columnMenuOpen === colKey;
    closeColumnMenus();
    if (wasOpen && !forceOpen) return;
    app.columnMenuOpen = colKey;

    const button = event.currentTarget;
    const filterableColumn = isFilterableColumn(colKey);
    const columnValues = new Set();
    app.state.rows.forEach((row) => {
      const value = String(row[colKey] ?? "").trim();
      columnValues.add(value || "__BLANK__");
    });

    const sortedValues = [...columnValues].sort((leftValue, rightValue) => {
      if (leftValue === "__BLANK__") return 1;
      if (rightValue === "__BLANK__") return -1;
      return leftValue.localeCompare(rightValue);
    });

    const filterData = app.state.filters[colKey] || {};
    const excluded = filterData.excluded || [];
    const isFrozen = app.state.freezeUntilColKey === colKey;
    const sortDirection = app.state.sort?.key === colKey ? app.state.sort.direction : null;

    const menu = document.createElement("div");
    menu.className = "analysis-col-menu trial-report-column-menu";
    menu.innerHTML = `
      <div class="trial-report-column-menu-section">
        <button class="trial-report-column-menu-btn ${sortDirection === "asc" ? "active" : ""}" data-action="sort-asc">
          <span class="material-symbols-rounded">arrow_upward</span>
          <span>Sort A–Z</span>
        </button>
        <button class="trial-report-column-menu-btn ${sortDirection === "desc" ? "active" : ""}" data-action="sort-desc">
          <span class="material-symbols-rounded">arrow_downward</span>
          <span>Sort Z–A</span>
        </button>
        ${sortDirection ? `<button class="trial-report-column-menu-btn" data-action="sort-clear">
          <span class="material-symbols-rounded">close</span>
          <span>Clear Sort</span>
        </button>` : ""}
        <button class="trial-report-column-menu-btn ${isFrozen ? "active" : ""}" data-action="freeze">
          <span class="material-symbols-rounded">${isFrozen ? "lock_open" : "push_pin"}</span>
          <span>${isFrozen ? "Unfreeze" : "Freeze Here"}</span>
        </button>
      </div>
      ${filterableColumn ? `<div class="trial-report-column-menu-section trial-report-column-menu-filter">
        <div class="trial-report-column-menu-filter-header">
          <strong>Filter</strong>
          <div>
            <button class="trial-report-column-menu-link" data-action="filter-all">All</button>
            <button class="trial-report-column-menu-link" data-action="filter-none">None</button>
          </div>
        </div>
        <div class="trial-report-column-menu-filter-list">
          ${sortedValues
            .map(
              (value) => `
                <label class="trial-report-column-menu-filter-item">
                  <input type="checkbox" data-filter-val="${encodeURIComponent(value)}" ${!excluded.includes(value) ? "checked" : ""}>
                  <span>${value === "__BLANK__" ? "(blank)" : escapeHtml(value)}</span>
                </label>`,
            )
            .join("")}
        </div>
      </div>` : ""}
    `;

    menu.addEventListener("click", (clickEvent) => {
      const actionButton = clickEvent.target.closest("[data-action]");
      if (!actionButton) return;
      const action = actionButton.dataset.action;

      if (action === "sort-asc") {
        app.state.sort = { key: colKey, direction: "asc" };
        renderTable({ preserveMenuForKey: colKey });
      } else if (action === "sort-desc") {
        app.state.sort = { key: colKey, direction: "desc" };
        renderTable({ preserveMenuForKey: colKey });
      } else if (action === "sort-clear") {
        app.state.sort = null;
        renderTable({ preserveMenuForKey: colKey });
      } else if (action === "freeze") {
        app.state.freezeUntilColKey = isFrozen ? null : colKey;
        renderTable({ preserveMenuForKey: colKey });
      } else if (action === "filter-all" && filterableColumn) {
        menu.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
          checkbox.checked = true;
        });
        app.state.filters[colKey] = { excluded: [] };
        renderTable({ preserveMenuForKey: colKey });
      } else if (action === "filter-none" && filterableColumn) {
        menu.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
          checkbox.checked = false;
        });
        app.state.filters[colKey] = { excluded: [...sortedValues] };
        renderTable({ preserveMenuForKey: colKey });
      }
    });

    menu.addEventListener("change", (changeEvent) => {
      if (!changeEvent.target.matches('input[type="checkbox"]')) return;
      const newExcluded = [];
      menu.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
        if (!checkbox.checked) {
          newExcluded.push(decodeURIComponent(checkbox.dataset.filterVal));
        }
      });
      app.state.filters[colKey] = { excluded: newExcluded };
      renderTable({ preserveMenuForKey: colKey });
    });

    document.body.appendChild(menu);
    positionColumnMenu(menu, button);
  }

  function applyFreezeColumns(tableElement, visibleColumns) {
    if (!app.state.freezeUntilColKey) return;

    const freezeIndex = visibleColumns.findIndex(
      (column) => column.key === app.state.freezeUntilColKey,
    );
    if (freezeIndex < 0) return;

    let left = 0;
    const tableHeaders = tableElement.querySelectorAll("thead th");
    const tableRows = tableElement.querySelectorAll("tbody tr");

    for (let index = 0; index <= freezeIndex; index += 1) {
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

  const ROWS_PER_BATCH = 1000;

  function renderTable(options = {}) {
    const { preserveMenuForKey = null, loadMore = false } = options;
    const tableElement = document.getElementById("analysisTable");
    if (!tableElement) return;

    closeColumnMenus();

    if (!loadMore) {
      app.state._datasetRowLimit = ROWS_PER_BATCH;
    }

    const visibleColumns = getVisibleColumns();
    const allRows = applySort(applyFilters(app.state.rows));
    const currentLimit = app.state._datasetRowLimit || ROWS_PER_BATCH;
    const rows = allRows.slice(0, currentLimit);
    const hasMore = allRows.length > currentLimit;

    const renderHeaderCell = (column, columnIndex) => `
      <th draggable="true"
          ondragstart="handleAnalysisThDragStart(event, '${encodeURIComponent(column.key)}', '${encodeURIComponent(column.label)}')"
          ondragend="handleAnalysisThDragEnd(event)">
        <button type="button" class="trial-report-th-btn analysis-th-btn ${column.source === "param" ? "database-param-th" : ""}"
                data-col-key="${escapeHtml(column.key)}" data-col-index="${columnIndex}"
                onclick="openAnalysisColumnMenu(event, decodeURIComponent('${encodeURIComponent(column.key)}'))">
          <span class="trial-report-th-text">${escapeHtml(column.label)}</span>
          <span class="material-symbols-rounded trial-report-th-marker ${getColumnMode(column.key) !== "default" ? "active" : ""}">filter_alt</span>
        </button>
      </th>`;

    if (rows.length === 0) {
      tableElement.innerHTML = `
        <thead><tr>${visibleColumns.map((column, index) => renderHeaderCell(column, index)).join("")}</tr></thead>
        <tbody><tr><td colspan="${visibleColumns.length}" class="trial-report-empty">No rows</td></tr></tbody>
      `;
      updateColumnVisibilityTrigger();
      return;
    }

    tableElement.innerHTML = `
      <thead><tr>${visibleColumns.map((column, index) => renderHeaderCell(column, index)).join("")}</tr></thead>
      <tbody>
        ${rows
          .map(
            (row) => `<tr>${visibleColumns
              .map(
                (column) => `<td class="${column.source === "param" ? "database-param-td" : ""}">${escapeHtml(String(row[column.key] ?? ""))}</td>`,
              )
              .join("")}</tr>`,
          )
          .join("")}
        ${hasMore ? `<tr class="analysis-load-more-row"><td colspan="${visibleColumns.length}">
          <button type="button" class="analysis-load-more-btn" onclick="window._loadMoreDatasetRows()">
            Showing ${rows.length} of ${allRows.length} rows &mdash; Load More
          </button>
        </td></tr>` : ""}
      </tbody>
    `;

    applyFreezeColumns(tableElement, visibleColumns);
    updateColumnVisibilityTrigger();

    if (preserveMenuForKey) {
      reopenColumnMenu(preserveMenuForKey);
    }
  }

  function getAnalysisSections() {
    return {
      dataset: document.getElementById("analysisDatasetSection"),
      controls: document.getElementById("analysisControls"),
      results: document.getElementById("analysisResults"),
    };
  }

  function getEffectiveLayout() {
    const desired = app.state.sectionLayout === "vertical" ? "vertical" : "horizontal";
    if (window.innerWidth <= 768) return "vertical";
    return desired;
  }

  function getFocusKeyBySection(sectionKey) {
    if (sectionKey === "results") return "focus-results";
    if (sectionKey === "controls") return "focus-settings";
    if (sectionKey === "dataset") return "focus-dataset";
    return "balanced";
  }

  function getHiddenSectionsForFocus(focus) {
    if (focus === "focus-results") return ["dataset", "controls"];
    if (focus === "focus-settings") return ["dataset", "results"];
    if (focus === "focus-dataset") return ["controls", "results"];
    return [];
  }

  function getEffectiveHiddenSections() {
    if (Array.isArray(app.state.hiddenSections)) {
      return [...app.state.hiddenSections];
    }
    return getHiddenSectionsForFocus(app.state.sectionFocus || "balanced");
  }

  function syncFocusSelectValue(hiddenSections) {
    const focusSelect = document.getElementById("analysisSectionFocusTopbar");
    if (!focusSelect) return;

    if (hiddenSections.length === 0) {
      focusSelect.value = "balanced";
      return;
    }

    if (hiddenSections.length === 2) {
      const visibleSectionKey = Object.keys(getAnalysisSections()).find(
        (sectionKey) => !hiddenSections.includes(sectionKey),
      );
      focusSelect.value = getFocusKeyBySection(visibleSectionKey);
      return;
    }

    focusSelect.value = "balanced";
  }

  function syncSectionHeaderA11y() {
    const sections = getAnalysisSections();
    Object.values(sections).forEach((section) => {
      if (!section) return;
      const header = section.querySelector(".analysis-section-header");
      if (!header) return;
      const collapsed = section.classList.contains("is-collapsed");
      header.setAttribute("role", "button");
      header.setAttribute("tabindex", "0");
      header.setAttribute("aria-expanded", collapsed ? "false" : "true");
    });
  }

  function getContainer() {
    return document.getElementById("analysisContainer");
  }

  function resetSectionSizes() {
    const container = getContainer();
    if (!container) return;

    const sections = getAnalysisSections();
    const dataset = sections.dataset;
    const controls = sections.controls;
    const results = sections.results;
    if (!dataset || !controls || !results) return;

    dataset.style.flex = "";
    controls.style.flex = "";
    results.style.flex = "";

    const layout = getEffectiveLayout();
    const hiddenSections = new Set(getEffectiveHiddenSections());

    if (hiddenSections.size === 0) {
      if (layout === "horizontal") {
        dataset.style.flex = "1 1 40%";
        controls.style.flex = "0 0 20%";
        results.style.flex = "0 0 40%";
      } else {
        dataset.style.flex = "1 1 48%";
        controls.style.flex = "0 0 auto";
        results.style.flex = "1 1 32%";
      }
      return;
    }

    const collapsedSize = layout === "horizontal" ? "0 0 58px" : "0 0 52px";
    const expandedSize = "1 1 auto";

    dataset.style.flex = hiddenSections.has("dataset") ? collapsedSize : expandedSize;
    controls.style.flex = hiddenSections.has("controls") ? collapsedSize : expandedSize;
    results.style.flex = hiddenSections.has("results") ? collapsedSize : expandedSize;
  }

  function applySectionLayout(layout, options = {}) {
    const { resetSizes = false } = options;
    const container = getContainer();
    if (!container) return;

    const normalizedLayout = layout === "vertical" ? "vertical" : "horizontal";
    app.state.sectionLayout = normalizedLayout;
    container.dataset.layout = normalizedLayout;

    if (resetSizes) {
      resetSectionSizes();
    }
  }

  function applySectionFocus(mode, options = {}) {
    const { resetSizes = false, syncTopbar = true } = options;
    const container = getContainer();
    const normalizedMode = ANALYSIS_FOCUS_MODES.includes(mode) ? mode : "balanced";
    const hiddenSections = getHiddenSectionsForFocus(normalizedMode);

    app.state.sectionFocus = normalizedMode;
    app.state.hiddenSections = hiddenSections;

    const sections = getAnalysisSections();
    Object.entries(sections).forEach(([sectionKey, sectionElement]) => {
      if (!sectionElement) return;
      const isCollapsed = hiddenSections.includes(sectionKey);
      sectionElement.classList.toggle("is-collapsed", isCollapsed);
      sectionElement.classList.toggle("is-active-focus", !isCollapsed);
    });

    if (container) {
      container.dataset.focus = hiddenSections.length === 0 ? "balanced" : normalizedMode;
    }

    if (syncTopbar) {
      syncFocusSelectValue(hiddenSections);
    }

    syncSectionHeaderA11y();
    if (resetSizes) {
      resetSectionSizes();
    }
  }

  function applyCustomHiddenSections(hiddenSections, options = {}) {
    const { resetSizes = false, syncTopbar = true } = options;
    const container = getContainer();
    const normalizedHiddenSections = Object.keys(getAnalysisSections()).filter((sectionKey) =>
      Array.isArray(hiddenSections) ? hiddenSections.includes(sectionKey) : false,
    );

    app.state.hiddenSections = normalizedHiddenSections;
    app.state.sectionFocus = normalizedHiddenSections.length === 0 ? "balanced" : app.state.sectionFocus;

    const sections = getAnalysisSections();
    Object.entries(sections).forEach(([sectionKey, sectionElement]) => {
      if (!sectionElement) return;
      const isCollapsed = normalizedHiddenSections.includes(sectionKey);
      sectionElement.classList.toggle("is-collapsed", isCollapsed);
      sectionElement.classList.toggle("is-active-focus", !isCollapsed);
    });

    if (container) {
      container.dataset.focus = normalizedHiddenSections.length === 0
        ? "balanced"
        : normalizedHiddenSections.length === 2
          ? getFocusKeyBySection(Object.keys(sections).find((key) => !normalizedHiddenSections.includes(key)))
          : "custom";
    }

    if (syncTopbar) {
      syncFocusSelectValue(normalizedHiddenSections);
    }

    syncSectionHeaderA11y();
    if (resetSizes) {
      resetSectionSizes();
    }
  }

  function bindSectionHeaderInteractions() {
    if (analysisSectionHeadersBound) return;

    const sections = getAnalysisSections();
    Object.entries(sections).forEach(([sectionKey, sectionElement]) => {
      if (!sectionElement) return;
      const header = sectionElement.querySelector(".analysis-section-header");
      if (!header) return;

      const activateFocus = () => {
        const hiddenSections = new Set(getEffectiveHiddenSections());
        const visibleCount = Object.keys(sections).length - hiddenSections.size;

        if (hiddenSections.has(sectionKey)) {
          hiddenSections.delete(sectionKey);
          applyCustomHiddenSections([...hiddenSections], { resetSizes: true, syncTopbar: true });
          return;
        }

        if (hiddenSections.size === 0) {
          applySectionFocus(getFocusKeyBySection(sectionKey), { resetSizes: true, syncTopbar: true });
          return;
        }

        if (visibleCount === 1) {
          applySectionFocus("balanced", { resetSizes: true, syncTopbar: true });
        } else {
          Object.keys(sections).forEach((key) => {
            if (key === sectionKey) {
              hiddenSections.delete(key);
            } else {
              hiddenSections.add(key);
            }
          });
          applyCustomHiddenSections([...hiddenSections], { resetSizes: true, syncTopbar: true });
        }
      };

      header.addEventListener("click", (event) => {
        if (event.target.closest("button, select, input, a")) return;
        activateFocus();
      });

      header.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activateFocus();
        }
      });
    });

    analysisSectionHeadersBound = true;
  }

  function setTopbarControlsVisibility(show) {
    const controls = document.querySelectorAll(".analysis-topbar-control");
    controls.forEach((control) => {
      control.classList.toggle("hidden", !show);
      control.style.display = show ? "" : "none";
    });
  }

  function bindAnalysisTopbarControls() {
    if (analysisTopbarControlsBound) return;

    const layoutSelect = document.getElementById("analysisSectionLayoutTopbar");
    const focusSelect = document.getElementById("analysisSectionFocusTopbar");

    layoutSelect?.addEventListener("change", () => {
      applySectionLayout(layoutSelect.value, { resetSizes: true });
    });

    focusSelect?.addEventListener("change", () => {
      applySectionFocus(focusSelect.value, { resetSizes: true, syncTopbar: false });
    });

    analysisTopbarControlsBound = true;
  }

  function syncAnalysisTopbarControls() {
    const layoutSelect = document.getElementById("analysisSectionLayoutTopbar");
    const focusSelect = document.getElementById("analysisSectionFocusTopbar");

    if (layoutSelect) {
      layoutSelect.value = app.state.sectionLayout || "horizontal";
    }

    if (focusSelect) {
      focusSelect.value = app.state.sectionFocus || "balanced";
    }
  }

  function getResultsTabSelect() {
    return document.getElementById("analysisResultsTabSelect");
  }

  function bindResultsTabControls() {
    if (resultsTabControlsBound) return;
    const select = getResultsTabSelect();
    select?.addEventListener("change", () => {
      switchResultTab(select.value);
    });
    resultsTabControlsBound = true;
  }

  function buildResultTabLabel(label, fallbackPrefix = "Output") {
    const rawLabel = String(label || "").trim();
    if (!rawLabel) {
      return `${fallbackPrefix} ${app.state.resultTabCounter}`;
    }
    return rawLabel.length > 42 ? `${rawLabel.slice(0, 39)}...` : rawLabel;
  }

  function renderResultsTabs() {
    ensureResultState();
    const select = getResultsTabSelect();
    const body = document.getElementById("analysisResultsBody");
    if (!body) return;

    const tabs = app.state.resultTabs;
    const activeTab = tabs.find((tab) => tab.id === app.state.currentResultTabId) || tabs[tabs.length - 1] || null;

    if (activeTab) {
      app.state.currentResultTabId = activeTab.id;
    }

    if (select) {
      if (tabs.length === 0) {
        select.innerHTML = '<option value="">No output yet</option>';
        select.value = "";
        select.disabled = true;
      } else {
        select.innerHTML = tabs
          .map((tab, index) => `<option value="${escapeHtml(tab.id)}">${escapeHtml(tab.label || `Output ${index + 1}`)}</option>`)
          .join("");
        select.disabled = false;
        select.value = activeTab?.id || tabs[0].id;
      }
    }

    if (!activeTab) {
      body.innerHTML = DEFAULT_EMPTY_RESULTS;
      return;
    }

    body.innerHTML = activeTab.content;
    const resultsSection = document.getElementById("analysisResults");
    if (resultsSection) {
      resultsSection.scrollTop = 0;
    }
  }

  function switchResultTab(tabId) {
    ensureResultState();
    if (!tabId) return;
    const exists = app.state.resultTabs.some((tab) => tab.id === tabId);
    if (!exists) return;
    app.state.currentResultTabId = tabId;
    renderResultsTabs();
  }

  function pushResultTab({ label, title, content }) {
    ensureResultState();
    app.state.resultTabCounter += 1;
    const tab = {
      id: `analysis-result-${app.state.resultTabCounter}`,
      label: buildResultTabLabel(label, "Output"),
      title: String(title || label || `Output ${app.state.resultTabCounter}`),
      content: String(content || DEFAULT_EMPTY_RESULTS),
      createdAt: Date.now(),
    };

    app.state.resultTabs.push(tab);
    app.state.currentResultTabId = tab.id;
    renderResultsTabs();
    return tab;
  }

  function resetResults(options = {}) {
    const { clearTabs = false } = options;
    ensureResultState();

    if (clearTabs) {
      app.state.resultTabs = [];
      app.state.currentResultTabId = null;
      app.state.resultTabCounter = 0;
    }

    renderResultsTabs();
  }

  function renderInfoResult(title, message, details = []) {
    const content = `
      <div class="analysis-result-block">
        <div class="analysis-result-title">${escapeHtml(title)}</div>
        <div class="analysis-result-subtitle">${escapeHtml(message)}</div>
        ${details.length > 0 ? `
          <ul class="analysis-result-note" style="margin-top:1rem;padding-left:1.2rem;">
            ${details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join("")}
          </ul>
        ` : ""}
      </div>
    `;

    pushResultTab({
      label: title,
      title,
      content,
    });
  }

  function renderComingSoonResult(title, message) {
    renderInfoResult(title, message, [
      "The file structure is ready for this analysis family.",
      "Its computation logic can be implemented in a dedicated file later.",
    ]);

    if (typeof showToast === "function") {
      showToast(`${title} is not available yet.`, "info");
    }
  }

  function applyAnalysisUserSettings(preferences = {}) {
    const visibleColumns = Array.isArray(preferences.visibleColumns)
      ? preferences.visibleColumns.map((key) => String(key))
      : [];
    const sectionLayout = preferences.sectionLayout === "vertical"
      ? "vertical"
      : "horizontal";
    const sectionFocus = ANALYSIS_FOCUS_MODES.includes(preferences.sectionFocus)
      ? preferences.sectionFocus
      : "balanced";

    setVisibleColumns(visibleColumns, { skipRender: false });

    app.state.sectionLayout = sectionLayout;
    app.state.sectionFocus = sectionFocus;

    const container = getContainer();
    if (container) {
      container.dataset.layout = sectionLayout;
      container.dataset.focus = sectionFocus;
    }

    if (app.fullscreenState?.active) {
      syncAnalysisTopbarControls();
      applySectionLayout(sectionLayout, { resetSizes: false });
      applySectionFocus(sectionFocus, { resetSizes: true, syncTopbar: true });
    }
  }

  function handleThDragStart(event, encodedKey, encodedLabel) {
    const key = decodeURIComponent(encodedKey);
    const label = decodeURIComponent(encodedLabel);

    app.state.draggedColKey = key;
    app.state.draggedColLabel = label;
    event.dataTransfer.setData("text/plain", key);
    event.dataTransfer.effectAllowed = "copy";
    event.currentTarget.classList.add("analysis-th-dragging");

    document.querySelectorAll(".analysis-dropzone-area").forEach((zone) => {
      zone.classList.add("analysis-dropzone-highlight");
    });
  }

  function handleThDragEnd(event) {
    event.currentTarget.classList.remove("analysis-th-dragging");
    app.state.draggedColKey = null;
    app.state.draggedColLabel = null;
    document.querySelectorAll(".analysis-dropzone-area").forEach((zone) => {
      zone.classList.remove("analysis-dropzone-highlight", "analysis-dropzone-over");
    });
  }

  function handleDropzoneDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    event.currentTarget.classList.add("analysis-dropzone-over");
  }

  function handleDropzoneDragLeave(event) {
    event.currentTarget.classList.remove("analysis-dropzone-over");
  }

  function getDesignDropzones() {
    const design = app.getSelectedDesign ? app.getSelectedDesign() : null;
    const factorCount = app.getSelectedFactorCount ? app.getSelectedFactorCount() : "1";

    if (design && typeof design.getDropzones === "function") {
      return design.getDropzones(factorCount);
    }

    // Default fallback: Treatment + Value
    return [
      { id: "analysisTreatmentArea", role: "treatment", label: "Treatment" },
      { id: "analysisValueArea", role: "value", label: "Value" },
    ];
  }

  function renderDropzones() {
    const container = document.getElementById("analysisDropzonesRow");
    if (!container) return;

    const zones = getDesignDropzones();
    const assigned = app.state.assignedColumns || {};

    container.innerHTML = zones.map((zone) => {
      const col = assigned[zone.role];
      const innerHtml = col
        ? `<div class="analysis-dropzone-chip">
             <span>${escapeHtml(col.label)}</span>
             <button type="button" class="analysis-dropzone-chip-remove" onclick="removeAnalysisDropzoneChip('${zone.role}')">
               <span class="material-symbols-rounded" style="font-size:.85rem">close</span>
             </button>
           </div>`
        : '<span class="analysis-dropzone-placeholder">Drag a column header here</span>';

      return `<div class="analysis-dropzone">
        <label>${escapeHtml(zone.label)}</label>
        <div class="analysis-dropzone-area" id="${zone.id}" data-role="${zone.role}"
             ondragover="handleAnalysisDropzoneDragOver(event)"
             ondragleave="handleAnalysisDropzoneDragLeave(event)"
             ondrop="handleAnalysisDropzoneDrop(event, '${zone.role}')">
          ${innerHtml}
        </div>
      </div>`;
    }).join("");
  }

  function renderDropzoneChip(zoneId, label, role) {
    const zone = document.getElementById(zoneId);
    if (!zone) return;

    zone.innerHTML = `
      <div class="analysis-dropzone-chip">
        <span>${escapeHtml(label)}</span>
        <button type="button" class="analysis-dropzone-chip-remove" onclick="removeAnalysisDropzoneChip('${role}')">
          <span class="material-symbols-rounded" style="font-size:.85rem">close</span>
        </button>
      </div>
    `;
  }

  function handleDropzoneDrop(event, role) {
    event.preventDefault();
    event.currentTarget.classList.remove("analysis-dropzone-over", "analysis-dropzone-highlight");

    const key = event.dataTransfer.getData("text/plain") || app.state.draggedColKey;
    if (!key) return;

    const column = app.state.columns.find((item) => item.key === key);
    if (!column) return;

    if (!app.state.assignedColumns) app.state.assignedColumns = {};
    app.state.assignedColumns[role] = { key: column.key, label: column.label };

    // Backward compat
    if (role === "treatment") {
      app.state.treatmentColumn = { key: column.key, label: column.label };
    } else if (role === "value") {
      app.state.valueColumn = { key: column.key, label: column.label };
    }

    const zoneEl = event.currentTarget;
    if (zoneEl) {
      renderDropzoneChip(zoneEl.id, column.label, role);
    }

    updateAnalyzeButtonState();
  }

  function removeDropzoneChip(role) {
    if (!app.state.assignedColumns) app.state.assignedColumns = {};
    delete app.state.assignedColumns[role];

    // Backward compat
    if (role === "treatment") {
      app.state.treatmentColumn = null;
    } else if (role === "value") {
      app.state.valueColumn = null;
    }

    // Find the zone element by role
    const zoneEl = document.querySelector(`.analysis-dropzone-area[data-role="${role}"]`);
    if (zoneEl) {
      zoneEl.innerHTML = '<span class="analysis-dropzone-placeholder">Drag a column header here</span>';
    }

    updateAnalyzeButtonState();
  }

  function resetDropzones() {
    app.state.assignedColumns = {};
    app.state.treatmentColumn = null;
    app.state.valueColumn = null;
    renderDropzones();
  }

  function updateAnalyzeButtonState() {
    const button = document.getElementById("analysisRunBtn");
    if (!button) return;

    const zones = getDesignDropzones();
    const assigned = app.state.assignedColumns || {};
    const allAssigned = zones.every((zone) => assigned[zone.role]);
    button.disabled = !allAssigned;
  }

  function enterFullscreenMode() {
    if (app.fullscreenState.active) return;

    const topbar = document.querySelector(".topbar");
    const pageTitle = document.getElementById("pageTitle");
    const menuToggle = document.getElementById("menuToggle");

    const managedIds = ["loadDataBtn", "syncStatusBtn", "userMenu"];
    app.fullscreenState.previousDisplays = {};
    managedIds.forEach((id) => {
      const element = document.getElementById(id);
      if (!element) return;
      app.fullscreenState.previousDisplays[id] = element.style.display;
      element.style.display = "none";
    });

    app.fullscreenState.previousPageTitle = pageTitle?.textContent || "Data Analysis";
    if (menuToggle) {
      app.fullscreenState.previousMenuHtml = menuToggle.innerHTML;
      app.fullscreenState.previousMenuOnclick = menuToggle.onclick;
      menuToggle.innerHTML = '<span class="material-symbols-rounded">close</span>';
      menuToggle.onclick = () => switchPage("dashboard");
    }

    if (topbar) topbar.classList.add("run-trial-mode");
    if (pageTitle) pageTitle.textContent = "Data Analysis";

    bindAnalysisTopbarControls();
    bindSectionHeaderInteractions();
    bindResultsTabControls();
    setTopbarControlsVisibility(true);
    syncAnalysisTopbarControls();
    renderResultsTabs();
    applySectionLayout(app.state.sectionLayout || "horizontal", { resetSizes: false });
    applySectionFocus(app.state.sectionFocus || "balanced", { resetSizes: true, syncTopbar: true });

    document.body.classList.add("analysis-fullscreen-active", "sidebar-collapsed");
    app.fullscreenState.active = true;
  }

  function exitFullscreenMode() {
    if (!app.fullscreenState.active) return;

    const topbar = document.querySelector(".topbar");
    const pageTitle = document.getElementById("pageTitle");
    const menuToggle = document.getElementById("menuToggle");
    const sidebar = document.querySelector(".sidebar");
    const sidebarOverlay = document.getElementById("sidebarOverlay");

    if (topbar) topbar.classList.remove("run-trial-mode");
    if (pageTitle) {
      pageTitle.textContent = app.fullscreenState.previousPageTitle || "Dashboard";
    }

    if (menuToggle) {
      menuToggle.innerHTML = app.fullscreenState.previousMenuHtml || '<span class="material-symbols-rounded">menu</span>';
      menuToggle.onclick = app.fullscreenState.previousMenuOnclick || null;
    }

    Object.entries(app.fullscreenState.previousDisplays || {}).forEach(([id, display]) => {
      const element = document.getElementById(id);
      if (!element) return;
      element.style.display = display || "";
    });

    document.body.classList.remove("analysis-fullscreen-active", "sidebar-collapsed");
    if (sidebar) sidebar.classList.remove("open");
    if (sidebarOverlay) sidebarOverlay.classList.remove("active");

    setTopbarControlsVisibility(false);
    app.fullscreenState.active = false;
  }

  function startResize(event, handleId) {
    event.preventDefault();
    if ((app.state.sectionFocus || "balanced") !== "balanced") return;

    const container = document.querySelector(".analysis-container");
    if (!container) return;

    const sections = getAnalysisSections();
    const dataset = sections.dataset;
    const controls = sections.controls;
    const results = sections.results;
    if (!dataset || !controls || !results) return;

    const orientation = getEffectiveLayout();
    const handleElement = event.currentTarget;
    handleElement.classList.add("active");

    app.resizeState.current = {
      handleId,
      handleElement,
      orientation,
      dataset,
      controls,
      results,
      startX: event.clientX,
      startY: event.clientY,
      datasetWidth: dataset.offsetWidth,
      datasetHeight: dataset.offsetHeight,
      controlsWidth: controls.offsetWidth,
      controlsHeight: controls.offsetHeight,
      resultsWidth: results.offsetWidth,
      resultsHeight: results.offsetHeight,
    };

    document.body.classList.add("analysis-resizing");
    document.body.classList.toggle("analysis-resizing-col", orientation === "horizontal");
    document.addEventListener("mousemove", onResizeMove);
    document.addEventListener("mouseup", onResizeEnd);
  }

  function applyPairResize(firstElement, secondElement, firstSize, secondSize, delta, orientation) {
    const minSize = orientation === "horizontal" ? 58 : 52;
    const total = firstSize + secondSize;
    let newFirstSize = Math.max(minSize, Math.min(total - minSize, firstSize + delta));
    let newSecondSize = total - newFirstSize;

    if (newSecondSize < minSize) {
      newSecondSize = minSize;
      newFirstSize = total - minSize;
    }

    firstElement.style.flex = `0 0 ${newFirstSize}px`;
    secondElement.style.flex = `0 0 ${newSecondSize}px`;
  }

  function onResizeMove(event) {
    if (!app.resizeState.current) return;

    const {
      handleId,
      orientation,
      dataset,
      controls,
      results,
      startX,
      startY,
      datasetWidth,
      datasetHeight,
      controlsWidth,
      controlsHeight,
      resultsWidth,
      resultsHeight,
    } = app.resizeState.current;

    const delta = orientation === "horizontal"
      ? event.clientX - startX
      : event.clientY - startY;

    if (handleId === "dataset-controls") {
      applyPairResize(
        dataset,
        controls,
        orientation === "horizontal" ? datasetWidth : datasetHeight,
        orientation === "horizontal" ? controlsWidth : controlsHeight,
        delta,
        orientation,
      );
      return;
    }

    if (handleId === "controls-results") {
      applyPairResize(
        controls,
        results,
        orientation === "horizontal" ? controlsWidth : controlsHeight,
        orientation === "horizontal" ? resultsWidth : resultsHeight,
        delta,
        orientation,
      );
    }
  }

  function onResizeEnd() {
    if (app.resizeState.current?.handleElement) {
      app.resizeState.current.handleElement.classList.remove("active");
    }
    app.resizeState.current = null;
    document.body.classList.remove("analysis-resizing");
    document.body.classList.remove("analysis-resizing-col");
    document.removeEventListener("mousemove", onResizeMove);
    document.removeEventListener("mouseup", onResizeEnd);
  }

  document.addEventListener("click", (event) => {
    if (
      app.columnMenuOpen &&
      !event.target.closest(".analysis-col-menu") &&
      !event.target.closest(".analysis-th-btn")
    ) {
      closeColumnMenus();
    }

    if (
      analysisColumnVisibilityMenuButton &&
      !event.target.closest(".analysis-column-visibility-menu") &&
      !event.target.closest("#analysisColumnsTrigger")
    ) {
      closeColumnVisibilityMenu();
    }
  });

  app.getVisibleColumns = getVisibleColumns;
  app.getAnalysisColumnOptionsForSettings = getAnalysisColumnOptionsForSettings;
  app.setVisibleColumns = setVisibleColumns;
  app.getColumnMode = getColumnMode;
  app.applyFilters = applyFilters;
  app.applySort = applySort;
  app.closeColumnMenus = closeColumnMenus;
  app.openColumnMenu = openColumnMenu;
  app.renderTable = renderTable;
  app.renderDropzones = renderDropzones;
  app.renderDropzoneChip = renderDropzoneChip;
  app.resetDropzones = resetDropzones;
  app.updateAnalyzeButtonState = updateAnalyzeButtonState;
  app.resetResults = resetResults;
  app.renderInfoResult = renderInfoResult;
  app.renderComingSoonResult = renderComingSoonResult;
  app.pushResultTab = pushResultTab;
  app.switchResultTab = switchResultTab;
  app.setTopbarControlsVisibility = setTopbarControlsVisibility;
  app.applySectionLayout = applySectionLayout;
  app.applySectionFocus = applySectionFocus;
  app.resetSectionSizes = resetSectionSizes;
  app.applyAnalysisUserSettings = applyAnalysisUserSettings;
  app.enterFullscreenMode = enterFullscreenMode;
  app.exitFullscreenMode = exitFullscreenMode;
  app.startResize = startResize;

  // ═══════════════════════════════════════════════
  // Custom Dataset Upload for Analysis
  // ═══════════════════════════════════════════════

  function syncDataSourceUI() {
    const select = document.getElementById("analysisDataSourceSelect");
    const reuploadBtn = document.getElementById("analysisCustomUploadBtn");
    const state = app.state;

    if (select) select.value = state.dataSource || "trial";

    if (reuploadBtn) {
      const showReupload = state.dataSource === "custom" && state.customRows;
      reuploadBtn.style.display = showReupload ? "" : "none";
    }

    // Update dataset header label to show source info
    const headerTitle = document.querySelector("#analysisDatasetSection .analysis-section-title-wrap h3");
    if (headerTitle) {
      if (state.dataSource === "custom" && state.customFileName) {
        headerTitle.textContent = `Dataset (${state.customFileName})`;
      } else {
        headerTitle.textContent = "Dataset";
      }
    }
  }

  function handleDataSourceChange(value) {
    const state = app.state;

    if (value === "custom") {
      // If we already have custom data, switch to it
      if (state.customColumns && state.customRows) {
        state.dataSource = "custom";
        app.init();
        return;
      }
      // Otherwise trigger upload
      triggerCustomFileUpload();
    } else {
      // Switch back to trial data
      state.dataSource = "trial";
      app.init();
    }
  }

  function triggerCustomFileUpload() {
    const fileInput = document.getElementById("analysisCustomFileInput");
    if (!fileInput) return;

    // Reset value so same file re-triggers
    fileInput.value = "";

    // Remove previous listener by cloning
    const newInput = fileInput.cloneNode(true);
    fileInput.parentNode.replaceChild(newInput, fileInput);

    newInput.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) {
        processCustomDatasetFile(file);
      } else {
        // User cancelled - revert select to current state
        const select = document.getElementById("analysisDataSourceSelect");
        if (select) select.value = app.state.dataSource || "trial";
      }
    });

    newInput.click();
  }

  function openCustomUpload() {
    triggerCustomFileUpload();
  }

  function processCustomDatasetFile(file) {
    if (typeof XLSX === "undefined") {
      if (typeof showToast === "function") showToast("Excel library not loaded. Please try again.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });

        if (workbook.SheetNames.length === 0) {
          if (typeof showToast === "function") showToast("No sheets found in the file", "error");
          return;
        }

        // Use first sheet by default
        const sheetName = workbook.SheetNames[0];
        const ws = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        if (rawRows.length < 2) {
          if (typeof showToast === "function") showToast("File must have at least a header row and one data row", "error");
          // Revert select
          const select = document.getElementById("analysisDataSourceSelect");
          if (select) select.value = app.state.dataSource || "trial";
          return;
        }

        const headerRow = rawRows[0];
        const bodyRows = rawRows.slice(1);

        // Build columns from header
        const columns = headerRow.map((h, idx) => {
          const label = String(h ?? "").trim() || `Column ${idx + 1}`;
          const key = `custom_${idx}_${label.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}`;
          return { key, label, source: "custom" };
        });

        // Build row objects
        const rows = bodyRows.map((row, rowIdx) => {
          const obj = { _rowIndex: rowIdx + 1 };
          columns.forEach((col, colIdx) => {
            const rawValue = row[colIdx];
            // Try to preserve numeric values
            if (rawValue !== "" && rawValue !== null && rawValue !== undefined) {
              const num = Number(rawValue);
              obj[col.key] = Number.isFinite(num) && String(rawValue).trim() !== "" ? num : rawValue;
            } else {
              obj[col.key] = "";
            }
          });
          return obj;
        });

        // Store in state
        const state = app.state;
        state.customColumns = columns;
        state.customRows = rows;
        state.customFileName = file.name;
        state.dataSource = "custom";

        // Re-initialize with custom data
        app.init();

        if (typeof showToast === "function") {
          showToast(`Loaded ${rows.length} rows from "${file.name}" (sheet: ${sheetName})`, "success");
        }
      } catch (error) {
        console.error("Custom dataset parse error:", error);
        if (typeof showToast === "function") {
          showToast("Failed to parse file: " + (error.message || "Unknown error"), "error");
        }
        // Revert select
        const select = document.getElementById("analysisDataSourceSelect");
        if (select) select.value = app.state.dataSource || "trial";
      }
    };

    reader.readAsArrayBuffer(file);
  }

  window.applyAnalysisUserSettings = applyAnalysisUserSettings;
  window.enterAnalysisFullscreenMode = enterFullscreenMode;
  window.exitAnalysisFullscreenMode = exitFullscreenMode;
  window.getAnalysisColumnOptionsForSettings = getAnalysisColumnOptionsForSettings;
  window.setAnalysisVisibleColumns = setVisibleColumns;
  window.toggleAnalysisColumnVisibilityMenu = openColumnVisibilityMenu;
  window.startAnalysisResize = startResize;
  window.openAnalysisColumnMenu = openColumnMenu;
  window._loadMoreDatasetRows = function () {
    app.state._datasetRowLimit = (app.state._datasetRowLimit || ROWS_PER_BATCH) + ROWS_PER_BATCH;
    renderTable({ loadMore: true });
  };
  window.handleAnalysisThDragStart = handleThDragStart;
  window.handleAnalysisThDragEnd = handleThDragEnd;
  window.handleAnalysisDropzoneDragOver = handleDropzoneDragOver;
  window.handleAnalysisDropzoneDragLeave = handleDropzoneDragLeave;
  window.handleAnalysisDropzoneDrop = handleDropzoneDrop;
  window.removeAnalysisDropzoneChip = removeDropzoneChip;
  window.handleAnalysisDataSourceChange = handleDataSourceChange;
  window.openAnalysisCustomUpload = openCustomUpload;
  window.syncAnalysisDataSourceUI = syncDataSourceUI;
})();
