(function initializeAnalysisModule() {
  const AnalysisApp = window.AnalysisApp || {};

  AnalysisApp.state = AnalysisApp.state || {
    active: false,
    treatmentColumn: null,
    valueColumn: null,
    assignedColumns: {},
    visibleColumnKeys: null,
    columns: [],
    rows: [],
    filters: {},
    sort: null,
    freezeUntilColKey: null,
    draggedColKey: null,
    draggedColLabel: null,
    currentTypeId: null,
    currentDesignId: null,
    currentFactorCount: null,
    selectedPostHoc: [],
    sectionLayout: "horizontal",
    sectionFocus: "balanced",
    resultTabs: [],
    currentResultTabId: null,
    resultTabCounter: 0,
    dataSource: "trial",        // "trial" or "custom"
    customColumns: null,        // columns from custom upload
    customRows: null,           // rows from custom upload
    customFileName: null,       // name of uploaded file
  };

  AnalysisApp.fullscreenState = AnalysisApp.fullscreenState || {
    active: false,
    previousPageTitle: "",
    previousMenuHtml: "",
    previousMenuOnclick: null,
    previousDisplays: {},
  };

  AnalysisApp.resizeState = AnalysisApp.resizeState || {
    current: null,
  };

  AnalysisApp.registry = AnalysisApp.registry || new Map();
  AnalysisApp.controlsBound = AnalysisApp.controlsBound || false;
  AnalysisApp.columnMenuOpen = AnalysisApp.columnMenuOpen || null;

  AnalysisApp.registerType = function registerType(typeDefinition) {
    if (!typeDefinition || !typeDefinition.id) {
      throw new Error("Analysis type registration requires an id.");
    }

    const existingType = AnalysisApp.registry.get(typeDefinition.id);
    if (!existingType) {
      AnalysisApp.registry.set(typeDefinition.id, {
        id: String(typeDefinition.id),
        label: String(typeDefinition.label || typeDefinition.id),
        designs: Array.isArray(typeDefinition.designs)
          ? typeDefinition.designs.map((design) => ({ ...design }))
          : [],
      });
      return;
    }

    if (typeDefinition.label) {
      existingType.label = String(typeDefinition.label);
    }

    const incomingDesigns = Array.isArray(typeDefinition.designs)
      ? typeDefinition.designs
      : [];

    incomingDesigns.forEach((design) => {
      if (!design || !design.id) return;
      const existingDesignIndex = existingType.designs.findIndex(
        (item) => item.id === design.id,
      );

      if (existingDesignIndex >= 0) {
        existingType.designs[existingDesignIndex] = {
          ...existingType.designs[existingDesignIndex],
          ...design,
        };
      } else {
        existingType.designs.push({ ...design });
      }
    });
  };

  AnalysisApp.getTypes = function getTypes() {
    return Array.from(AnalysisApp.registry.values());
  };

  AnalysisApp.getSelectedType = function getSelectedType() {
    const state = AnalysisApp.state;
    return AnalysisApp.registry.get(state.currentTypeId) || AnalysisApp.getTypes()[0] || null;
  };

  AnalysisApp.getSelectedDesign = function getSelectedDesign() {
    const state = AnalysisApp.state;
    const selectedType = AnalysisApp.getSelectedType();
    if (!selectedType) return null;
    return (
      selectedType.designs.find((design) => design.id === state.currentDesignId) ||
      selectedType.designs[0] ||
      null
    );
  };

  AnalysisApp.getSelectedFactorCount = function getSelectedFactorCount() {
    const selectedDesign = AnalysisApp.getSelectedDesign();
    if (!selectedDesign) return null;

    const factors = Array.isArray(selectedDesign.supportedFactors)
      ? selectedDesign.supportedFactors.map((value) => String(value))
      : ["1"];

    if (!AnalysisApp.state.currentFactorCount || !factors.includes(String(AnalysisApp.state.currentFactorCount))) {
      AnalysisApp.state.currentFactorCount = factors[0];
    }

    return String(AnalysisApp.state.currentFactorCount);
  };

  AnalysisApp.getSelectedPostHocTests = function getSelectedPostHocTests() {
    const tests = [];
    if (document.getElementById("postHocLSD")?.checked) tests.push("lsd");
    if (document.getElementById("postHocHSD")?.checked) tests.push("hsd");
    if (document.getElementById("postHocDMRT")?.checked) tests.push("dmrt");
    if (document.getElementById("postHocSNK")?.checked) tests.push("snk");
    if (document.getElementById("postHocSK")?.checked) tests.push("scott-knott");
    return tests;
  };

  AnalysisApp.populateSelectors = function populateSelectors() {
    const typeSelect = document.getElementById("analysisType");
    const designSelect = document.getElementById("analysisDesign");
    const factorsSelect = document.getElementById("analysisFactors");
    const types = AnalysisApp.getTypes();

    if (!typeSelect || !designSelect || !factorsSelect || types.length === 0) return;

    const state = AnalysisApp.state;
    if (!state.currentTypeId || !AnalysisApp.registry.has(state.currentTypeId)) {
      state.currentTypeId = types[0].id;
    }

    typeSelect.innerHTML = types
      .map((type) => {
        // A type is implemented if at least one design has getDropzones
        const hasImpl = type.designs.some((d) => typeof d.getDropzones === "function");
        return `<option value="${type.id}"${hasImpl ? "" : " disabled"}>${escapeHtml(type.label)}</option>`;
      })
      .join("");
    typeSelect.value = state.currentTypeId;

    const selectedType = AnalysisApp.getSelectedType();
    const designs = selectedType?.designs || [];
    if (!state.currentDesignId || !designs.some((design) => design.id === state.currentDesignId)) {
      state.currentDesignId = designs[0]?.id || null;
    }

    designSelect.innerHTML = designs
      .map((design) => `<option value="${design.id}">${escapeHtml(design.label || design.id)}</option>`)
      .join("");
    if (state.currentDesignId) {
      designSelect.value = state.currentDesignId;
    }

    const selectedDesign = AnalysisApp.getSelectedDesign();
    const supportedFactors = Array.isArray(selectedDesign?.supportedFactors)
      ? selectedDesign.supportedFactors.map((value) => String(value))
      : ["1"];

    if (!state.currentFactorCount || !supportedFactors.includes(String(state.currentFactorCount))) {
      state.currentFactorCount = supportedFactors[0] || "1";
    }

    factorsSelect.innerHTML = supportedFactors
      .map((value) => {
        // Use custom option label from design if provided
        if (typeof selectedDesign?.factorsOptionLabel === "function") {
          return `<option value="${value}">${escapeHtml(selectedDesign.factorsOptionLabel(value))}</option>`;
        }
        const factorNumber = Number(value);
        const label = Number.isFinite(factorNumber) && factorNumber > 1
          ? `${factorNumber} Factors`
          : `${value} Factor`;
        return `<option value="${value}">${escapeHtml(label)}</option>`;
      })
      .join("");
    factorsSelect.value = String(state.currentFactorCount);

    // Update Factors group label and visibility
    const factorsGroup = document.getElementById("analysisFactorsGroup");
    if (factorsGroup) {
      const hideFactors = state.currentTypeId === "ttest";
      factorsGroup.style.display = hideFactors ? "none" : "";

      // Update the label text based on design config
      const factorsLabel = factorsGroup.querySelector("label");
      if (factorsLabel) {
        factorsLabel.textContent = selectedDesign?.factorsLabel || "Factors";
      }
    }

    // Show/hide Post Hoc group based on analysis type
    const postHocGroup = document.getElementById("analysisPostHocGroup");
    if (postHocGroup) {
      const isAnova = state.currentTypeId === "anova";
      postHocGroup.style.display = isAnova ? "" : "none";
    }
  };

  AnalysisApp.resetAnalysisSelections = function resetAnalysisSelections() {
    const state = AnalysisApp.state;
    state.treatmentColumn = null;
    state.valueColumn = null;
    state.assignedColumns = {};

    if (typeof AnalysisApp.renderDropzones === "function") {
      AnalysisApp.renderDropzones();
    } else if (typeof AnalysisApp.resetDropzones === "function") {
      AnalysisApp.resetDropzones();
    }
    if (typeof AnalysisApp.updateAnalyzeButtonState === "function") {
      AnalysisApp.updateAnalyzeButtonState();
    }
  };

  AnalysisApp.handleTypeChange = function handleTypeChange() {
    const typeSelect = document.getElementById("analysisType");
    AnalysisApp.state.currentTypeId = typeSelect?.value || null;
    AnalysisApp.state.currentDesignId = null;
    AnalysisApp.state.currentFactorCount = null;
    AnalysisApp.populateSelectors();
    AnalysisApp.resetAnalysisSelections();
  };

  AnalysisApp.handleDesignChange = function handleDesignChange() {
    const designSelect = document.getElementById("analysisDesign");
    AnalysisApp.state.currentDesignId = designSelect?.value || null;
    AnalysisApp.state.currentFactorCount = null;
    AnalysisApp.populateSelectors();
    AnalysisApp.resetAnalysisSelections();
  };

  AnalysisApp.handleFactorChange = function handleFactorChange() {
    const factorsSelect = document.getElementById("analysisFactors");
    AnalysisApp.state.currentFactorCount = factorsSelect?.value || null;
    AnalysisApp.resetAnalysisSelections();
  };

  AnalysisApp.bindControls = function bindControls() {
    if (AnalysisApp.controlsBound) return;

    const typeSelect = document.getElementById("analysisType");
    const designSelect = document.getElementById("analysisDesign");
    const factorsSelect = document.getElementById("analysisFactors");

    typeSelect?.addEventListener("change", AnalysisApp.handleTypeChange);
    designSelect?.addEventListener("change", AnalysisApp.handleDesignChange);
    factorsSelect?.addEventListener("change", AnalysisApp.handleFactorChange);

    AnalysisApp.controlsBound = true;
  };

  AnalysisApp.init = function initAnalysis() {
    const state = AnalysisApp.state;

    // Determine data source
    if (state.dataSource === "custom" && state.customColumns && state.customRows) {
      // Use custom uploaded dataset
      state.columns = state.customColumns;
      state.rows = state.customRows;
    } else {
      // Warn if any trials have unloaded responses
      if (typeof trialState !== "undefined" && trialState.trials) {
        const unloadedTrials = trialState.trials.filter(t => !t.archived && !t._responsesLoaded);
        if (unloadedTrials.length > 0) {
          const names = unloadedTrials.map(t => t.name).join(", ");
          if (typeof showToast === "function") {
            showToast(`Warning: ${unloadedTrials.length} trial(s) have unloaded data (${names}). Analysis results may be incomplete. Use "Load Latest Data" to fetch responses first.`, "warning", 6000);
          }
        }
      }

      // Use trial/database dataset
      const dataset = buildDatabaseDataset();
      state.columns = [
        ...dataset.fixedColumns.map((column) => ({
          key: column.key,
          label: column.label,
          source: column.source || "fixed",
        })),
        ...(dataset.extraColumns || []).map((column) => ({
          key: column.key,
          label: column.label,
          source: column.source || "extra",
        })),
        ...dataset.parameterColumns.map((parameter) => ({
          key: `param_${parameter.id}`,
          label: parameter.name || "Parameter",
          source: "param",
        })),
      ];
      state.rows = dataset.rows;
    }

    state.filters = {};
    state.sort = null;
    state.freezeUntilColKey = null;
    state.draggedColKey = null;
    state.draggedColLabel = null;
    state.resultTabs = [];
    state.currentResultTabId = null;
    state.resultTabCounter = 0;

    AnalysisApp.bindControls();
    AnalysisApp.populateSelectors();
    AnalysisApp.resetAnalysisSelections();

    if (typeof AnalysisApp.resetResults === "function") {
      AnalysisApp.resetResults({ clearTabs: true });
    }

    if (typeof AnalysisApp.renderTable === "function") {
      AnalysisApp.renderTable();
    }

    // Sync UI for dataset source controls
    if (typeof syncAnalysisDataSourceUI === "function") {
      syncAnalysisDataSourceUI();
    }
  };

  AnalysisApp.run = function runAnalysis() {
    const selectedType = AnalysisApp.getSelectedType();
    const selectedDesign = AnalysisApp.getSelectedDesign();

    if (!selectedType || !selectedDesign) {
      if (typeof showToast === "function") {
        showToast("Please select an analysis configuration.", "error");
      }
      return;
    }

    if (typeof selectedDesign.run !== "function") {
      if (typeof AnalysisApp.renderComingSoonResult === "function") {
        AnalysisApp.renderComingSoonResult(
          `${selectedType.label} / ${selectedDesign.label}`,
          "This analysis configuration is not available yet.",
        );
      }
      return;
    }

    selectedDesign.run({
      state: AnalysisApp.state,
      type: selectedType,
      design: selectedDesign,
      factorCount: AnalysisApp.getSelectedFactorCount(),
      assignedColumns: AnalysisApp.state.assignedColumns || {},
      postHocTests: AnalysisApp.getSelectedPostHocTests(),
      rows: AnalysisApp.state.rows,
      applyFilters:
        typeof AnalysisApp.applyFilters === "function"
          ? AnalysisApp.applyFilters
          : (rows) => rows,
      applySort:
        typeof AnalysisApp.applySort === "function"
          ? AnalysisApp.applySort
          : (rows) => rows,
    });
  };

  window.AnalysisApp = AnalysisApp;
  window.initAnalysis = AnalysisApp.init;
  window.runAnalysis = AnalysisApp.run;
})();
