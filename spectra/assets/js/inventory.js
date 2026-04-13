// Inventory Management
let _currentEntryType = "parental";

/**
 * Get folder IDs for an item, supporting both legacy `folderId` (string)
 * and new `folderIds` (array) formats. Returns an array.
 */
function _getItemFolderIds(item) {
  if (Array.isArray(item.folderIds) && item.folderIds.length > 0) return item.folderIds;
  if (item.folderId) return [item.folderId];
  return [];
}

/**
 * Check if an item belongs to a given folder.
 */
function _itemInFolder(item, folderId) {
  return _getItemFolderIds(item).includes(folderId);
}

/**
 * Check if an item is in ANY folder.
 */
function _itemHasFolder(item) {
  return _getItemFolderIds(item).length > 0;
}

let inventoryState = {
  currentCategory: "crops",
  viewMode: {
    global: "grid",
    byCategory: {
      crops: "default",
      locations: "default",
      parameters: "default",
      agronomy: "default",
    },
  },
  items: {
    crops: [],
    entries: [],
    locations: [],
    parameters: [],
    agronomy: [],
  },
  folders: {
    crops: [],
    locations: [],
    parameters: [],
    agronomy: [],
  },
  editingItemId: null,
  filterCrop: "",
  sortBy: "name",
  searchQuery: "",
  currentFolderId: null,
  parametersSortInitialized: false,
  listColumnWidths: {},
};

function normalizeInventoryCategoryView(value) {
  if (value === "grid" || value === "list") return value;
  return "default";
}

function getEffectiveInventoryViewMode(category) {
  const perCategory = inventoryState.viewMode?.byCategory?.[category];
  if (perCategory === "grid" || perCategory === "list") {
    return perCategory;
  }
  return inventoryState.viewMode?.global === "list" ? "list" : "grid";
}

function applyInventoryUserSettings(appearanceSettings = {}) {
  const safe = appearanceSettings && typeof appearanceSettings === "object"
    ? appearanceSettings
    : {};
  const byCategory = safe.inventoryCategoryViews && typeof safe.inventoryCategoryViews === "object"
    ? safe.inventoryCategoryViews
    : {};

  inventoryState.viewMode.global = safe.inventoryViewMode === "list" ? "list" : "grid";
  inventoryState.viewMode.byCategory = {
    crops: normalizeInventoryCategoryView(byCategory.crops),
    locations: normalizeInventoryCategoryView(byCategory.locations),
    parameters: normalizeInventoryCategoryView(byCategory.parameters),
    agronomy: normalizeInventoryCategoryView(byCategory.agronomy),
  };

  if (document.getElementById("inventoryList")) {
    renderInventoryItems();
  }
}

function toggleCropFields(show) {
  const group = document.getElementById("cropTypeGroup");
  const input = document.getElementById("cropType");
  if (!group || !input) return;

  const entryTypeGroup = document.getElementById("cropEntryTypeGroup");
  const entryTypeInput = document.getElementById("cropEntryType");

  if (show) {
    group.classList.remove("hidden");
    input.setAttribute("required", "required");
    if (entryTypeGroup) entryTypeGroup.classList.remove("hidden");
    if (entryTypeInput) entryTypeInput.setAttribute("required", "required");
  } else {
    group.classList.add("hidden");
    input.removeAttribute("required");
    input.value = "";
    if (entryTypeGroup) entryTypeGroup.classList.add("hidden");
    if (entryTypeInput) {
      entryTypeInput.removeAttribute("required");
      entryTypeInput.value = "";
    }
  }
}

function toggleLineFields(show) {
  // Groups always visible for entries
  const sharedGroups = [
    "lineCropGroup",
    "lineQuantityGroup",
    "lineStageGroup",
    "lineSeedOriginGroup",
    "lineRegisteredDateGroup",
  ];
  // Parental-only groups
  const parentalGroups = [
    "lineArrivalDateGroup",
    "lineParentCodeGroup",
    "lineHybridCodeGroup",
    "lineSprCodeGroup",
    "lineRoleGroup",
  ];
  // Hybrid-only groups
  const hybridGroups = [
    "lineHybridCodeHybridGroup",
    "lineFieldCodeGroup",
    "lineFemaleParentGroup",
    "lineMaleParentGroup",
    "lineSplitPlantingGroup",
  ];

  const allGroups = [...sharedGroups, ...parentalGroups, ...hybridGroups];
  allGroups.forEach((id) => {
    const group = document.getElementById(id);
    if (!group) return;
    if (show) {
      group.classList.remove("hidden");
    } else {
      group.classList.add("hidden");
    }
  });

  if (show) {
    handleLineTypeChange(_currentEntryType);
  }
}

function handleLineTypeChange(entryType) {
  _currentEntryType = entryType || "parental";
  const isParental = _currentEntryType === "parental";

  const parentalGroups = [
    "lineArrivalDateGroup",
    "lineParentCodeGroup",
    "lineHybridCodeGroup",
    "lineSprCodeGroup",
    "lineRoleGroup",
  ];
  const hybridGroups = [
    "lineHybridCodeHybridGroup",
    "lineFieldCodeGroup",
    "lineFemaleParentGroup",
    "lineMaleParentGroup",
    "lineSplitPlantingGroup",
  ];

  parentalGroups.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("hidden", !isParental);
  });
  hybridGroups.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("hidden", isParental);
  });
}

function toggleLocationFields(show) {
  const groups = ["locationCoordGroup"];

  groups.forEach((id) => {
    const group = document.getElementById(id);
    if (!group) return;
    if (show) {
      group.classList.remove("hidden");
    } else {
      group.classList.add("hidden");
    }
  });
}

function toggleParameterFields(show) {
  const groups = [
    "paramInitialGroup",
    "paramTypeGroup",
    "paramUnitGroup",
    "paramQuantityGroup",
    "paramPhotoGroup",
  ];

  groups.forEach((id) => {
    const group = document.getElementById(id);
    if (!group) return;
    if (show) {
      group.classList.remove("hidden");
    } else {
      group.classList.add("hidden");
    }
  });

  // Show/hide DoO side panel
  const dooPanel = document.getElementById('modalDooPanel');
  const formulaPanel = document.getElementById('modalFormulaPanel');
  const modal = document.getElementById('itemModal');
  if (dooPanel && modal) {
    if (show) {
      dooPanel.classList.remove('hidden');
      modal.classList.add('has-doo-panel');
    } else {
      dooPanel.classList.add('hidden');
      modal.classList.remove('has-doo-panel');
    }
  }
  if (formulaPanel) {
    formulaPanel.classList.add('hidden');
    if (modal) modal.classList.remove('has-formula-panel');
  }

  // Hide conditional fields initially
  if (show) {
    handleParameterTypeChange();
  } else {
    const conditionalGroups = [
      "paramRangeGroup",
      "paramRadioGroup",
      "paramCheckboxGroup",
      "paramFormulaGroup",
    ];
    conditionalGroups.forEach((id) => {
      const group = document.getElementById(id);
      if (group) group.classList.add("hidden");
    });
  }
}

function handleParameterTypeChange() {
  const typeSelect = document.getElementById("paramType");
  if (!typeSelect) return;

  const type = typeSelect.value;

  // Hide all conditional fields first
  document.getElementById("paramRangeGroup")?.classList.add("hidden");
  document.getElementById("paramRadioGroup")?.classList.add("hidden");
  document.getElementById("paramCheckboxGroup")?.classList.add("hidden");
  document.getElementById("paramFormulaGroup")?.classList.add("hidden");

  // Show relevant field based on type
  if (type === "range") {
    document.getElementById("paramRangeGroup")?.classList.remove("hidden");
  } else if (type === "radio") {
    document.getElementById("paramRadioGroup")?.classList.remove("hidden");
  } else if (type === "checkbox") {
    document.getElementById("paramCheckboxGroup")?.classList.remove("hidden");
  } else if (type === "formula") {
    // paramFormulaGroup stays hidden; the formula panel replaces it visually.
    // The hidden #paramFormula input is synced from the formula editor.
    initFormulaPanel();
  }

  const quantityGroup = document.getElementById("paramQuantityGroup");
  const photoGroup = document.getElementById("paramPhotoGroup");
  const formulaPanel = document.getElementById("modalFormulaPanel");
  const modal = document.getElementById("itemModal");
  const isFormula = type === "formula";

  if (quantityGroup) quantityGroup.classList.toggle("hidden", isFormula);
  if (photoGroup) photoGroup.classList.toggle("hidden", isFormula);
  if (formulaPanel) formulaPanel.classList.toggle("hidden", !isFormula);
  if (modal) modal.classList.toggle("has-formula-panel", isFormula);

  if (isFormula) {
    const qtyInput = document.getElementById("paramQuantity");
    if (qtyInput) qtyInput.value = "1";
    const photoCheckbox = document.getElementById("paramPhoto");
    if (photoCheckbox) photoCheckbox.checked = false;
    togglePhotoModeGroup();
  }

  const formulaError = document.getElementById("paramFormulaError");
  if (formulaError) formulaError.classList.add("hidden");
}

function getAvailableFormulaParameters() {
  return (inventoryState.items.parameters || [])
    .filter((param) => {
      if (!param || !param.id) return false;
      if (inventoryState.editingItemId && param.id === inventoryState.editingItemId) return false;
      if ((param.type || "").toLowerCase() === "formula") return false;
      return true;
    });
}

function populateFormulaParameterList() {
  const list = document.getElementById("paramFormulaParamList");
  if (!list) return;

  const params = getAvailableFormulaParameters();
  if (params.length === 0) {
    list.innerHTML = '<span class="formula-param-empty">No parameter references available</span>';
    return;
  }

  list.innerHTML = params
    .map((param) => {
      const token = (param.initial || param.name || "").trim();
      const label = `${param.name || ""}${param.initial ? ` (${param.initial})` : ""}`;
      return `<button type="button" class="formula-param-chip" data-token="${escapeHtml(token)}" title="Insert ${escapeHtml(label)}">${escapeHtml(token)}</button>`;
    })
    .join("");

  list.querySelectorAll(".formula-param-chip").forEach((button) => {
    button.addEventListener("click", () => {
      insertFormulaToken(button.dataset.token || "");
    });
  });
}

// --- Formula panel / rich editor ---

function _getFormulaTokenSet() {
  return new Set(
    getAvailableFormulaParameters().flatMap(p => {
      const refs = [];
      if (p.initial) refs.push(String(p.initial).trim());
      if (p.name) refs.push(String(p.name).trim().replace(/\s+/g, '_'));
      return refs.filter(Boolean);
    })
  );
}

function highlightFormula(text) {
  const tokens = _getFormulaTokenSet();
  // Tokenize: identifiers, numbers (incl decimal), operators, parens, whitespace
  const parts = String(text).match(/[A-Za-z_][A-Za-z0-9_]*|\d+\.?\d*|[+\-*/().]|\s+/g) || [];
  return parts.map(p => {
    if (tokens.has(p)) {
      return `<span class="formula-hl-ref">${escapeHtml(p)}</span>`;
    }
    if (/^[+\-*/]$/.test(p)) {
      return `<span class="formula-hl-op">${escapeHtml(p)}</span>`;
    }
    if (/^[()]$/.test(p)) {
      return `<span class="formula-hl-paren">${escapeHtml(p)}</span>`;
    }
    if (/^\d/.test(p)) {
      return `<span class="formula-hl-num">${escapeHtml(p)}</span>`;
    }
    // Unknown identifier (might be invalid ref)
    if (/^[A-Za-z_]/.test(p)) {
      return `<span class="formula-hl-unknown">${escapeHtml(p)}</span>`;
    }
    return escapeHtml(p);
  }).join('');
}

function _getEditorPlainText(editor) {
  return (editor.innerText || editor.textContent || '').replace(/\n/g, '').trim();
}

function syncFormulaEditorToInput() {
  const editor = document.getElementById('formulaEditorDisplay');
  const input = document.getElementById('paramFormula');
  if (!editor || !input) return;
  input.value = _getEditorPlainText(editor);
}

function renderFormulaHighlight() {
  const editor = document.getElementById('formulaEditorDisplay');
  if (!editor) return;
  const raw = _getEditorPlainText(editor);
  if (!raw) { editor.innerHTML = ''; return; }

  // Save caret offset
  const sel = window.getSelection();
  let caretOffset = 0;
  if (sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
    const range = sel.getRangeAt(0).cloneRange();
    range.selectNodeContents(editor);
    range.setEnd(sel.anchorNode, sel.anchorOffset);
    caretOffset = range.toString().length;
  }

  editor.innerHTML = highlightFormula(raw);

  // Restore caret
  _restoreCaret(editor, caretOffset);

  syncFormulaEditorToInput();
  renderFormulaParamPickerList();
}

function _restoreCaret(editor, offset) {
  const sel = window.getSelection();
  const range = document.createRange();
  let charCount = 0;
  let found = false;

  function walk(node) {
    if (found) return;
    if (node.nodeType === 3) {
      const len = node.textContent.length;
      if (charCount + len >= offset) {
        range.setStart(node, offset - charCount);
        range.collapse(true);
        found = true;
        return;
      }
      charCount += len;
    } else {
      for (const child of node.childNodes) {
        walk(child);
        if (found) return;
      }
    }
  }
  walk(editor);
  if (!found) {
    range.selectNodeContents(editor);
    range.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

function insertFormulaToken(token) {
  const editor = document.getElementById('formulaEditorDisplay');
  if (!editor || !token) return;

  editor.focus();
  const sel = window.getSelection();
  let caretOffset = _getEditorPlainText(editor).length;
  if (sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
    const r = sel.getRangeAt(0).cloneRange();
    r.selectNodeContents(editor);
    r.setEnd(sel.anchorNode, sel.anchorOffset);
    caretOffset = r.toString().length;
  }

  const raw = _getEditorPlainText(editor);
  const before = raw.slice(0, caretOffset);
  const after = raw.slice(caretOffset);
  const needLeft = before.length > 0 && !/[\s(*/+\-]$/.test(before);
  const insertion = `${needLeft ? ' ' : ''}${token}`;
  const newRaw = before + insertion + after;
  const newOffset = before.length + insertion.length;

  editor.innerHTML = highlightFormula(newRaw);
  _restoreCaret(editor, newOffset);
  syncFormulaEditorToInput();
  renderFormulaParamPickerList();

  const err = document.getElementById('formulaPanelError');
  if (err) err.classList.add('hidden');
}

function renderFormulaParamPickerList(filter) {
  const list = document.getElementById('formulaParamPickerList');
  if (!list) return;

  const params = getAvailableFormulaParameters();
  if (params.length === 0) {
    list.innerHTML = '<div class="formula-picker-empty">No parameters available</div>';
    return;
  }

  const currentFormula = _getEditorPlainText(document.getElementById('formulaEditorDisplay') || document.createElement('div'));
  const usedTokens = new Set(
    (currentFormula.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [])
  );

  const search = (filter ?? document.getElementById('formulaParamSearch')?.value ?? '').toLowerCase().trim();

  const filtered = params.filter(p => {
    if (!search) return true;
    const name = (p.name || '').toLowerCase();
    const initial = (p.initial || '').toLowerCase();
    return name.includes(search) || initial.includes(search);
  });

  if (filtered.length === 0) {
    list.innerHTML = '<div class="formula-picker-empty">No matching parameters</div>';
    return;
  }

  list.innerHTML = filtered.map(p => {
    const token = (p.initial || p.name || '').trim();
    const name = p.name || '';
    const initial = p.initial || '';
    const label = initial ? `${escapeHtml(name)} <span class="formula-picker-initial">(${escapeHtml(initial)})</span>` : escapeHtml(name);
    const isUsed = usedTokens.has(token);
    return `<div class="formula-picker-item${isUsed ? ' is-used' : ''}" data-token="${escapeHtml(token)}" title="Click to insert ${escapeHtml(token)}">
      <span class="formula-picker-item-name">${label}</span>
      ${isUsed ? '<span class="formula-picker-used-badge">used</span>' : ''}
    </div>`;
  }).join('');

  list.querySelectorAll('.formula-picker-item').forEach(item => {
    item.addEventListener('click', () => {
      insertFormulaToken(item.dataset.token || '');
    });
  });
}

function initFormulaPanel() {
  const editor = document.getElementById('formulaEditorDisplay');
  const input = document.getElementById('paramFormula');
  const searchInput = document.getElementById('formulaParamSearch');

  if (!editor) return;

  // Populate editor from existing formula input value
  const existingFormula = input?.value || '';
  editor.innerHTML = existingFormula ? highlightFormula(existingFormula) : '';

  // Remove old listeners
  if (editor._formulaInput) editor.removeEventListener('input', editor._formulaInput);
  if (editor._formulaPaste) editor.removeEventListener('paste', editor._formulaPaste);
  if (editor._formulaKeydown) editor.removeEventListener('keydown', editor._formulaKeydown);
  if (searchInput?._formulaSearch) searchInput.removeEventListener('input', searchInput._formulaSearch);

  editor._formulaInput = () => {
    renderFormulaHighlight();
    const err = document.getElementById('formulaPanelError');
    if (err) err.classList.add('hidden');
  };
  editor.addEventListener('input', editor._formulaInput);

  editor._formulaPaste = (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  };
  editor.addEventListener('paste', editor._formulaPaste);

  editor._formulaKeydown = (e) => {
    if (e.key === 'Enter') e.preventDefault();
  };
  editor.addEventListener('keydown', editor._formulaKeydown);

  if (searchInput) {
    searchInput.value = '';
    searchInput._formulaSearch = () => renderFormulaParamPickerList();
    searchInput.addEventListener('input', searchInput._formulaSearch);
  }

  // Build old-style chips too (for backward compat in paramFormulaGroup)
  populateFormulaParameterList();
  renderFormulaParamPickerList();
}

function validateFormulaExpression(formula) {
  const source = String(formula || "").trim();
  if (!source) return { ok: false, message: "Formula is required for Formula type" };

  if (!/^[0-9A-Za-z_+\-*/().\s]+$/.test(source)) {
    return { ok: false, message: "Formula contains invalid characters" };
  }

  const compact = source.replace(/\s+/g, "");
  const tokens = compact.match(/([A-Za-z_][A-Za-z0-9_]*|\d*\.?\d+|[()+\-*/])/g);
  if (!tokens || tokens.join("") !== compact) {
    return { ok: false, message: "Formula format is invalid" };
  }

  let expectOperand = true;
  let parenDepth = 0;
  const operators = new Set(["+", "-", "*", "/"]);

  for (const token of tokens) {
    if (token === "(") {
      if (!expectOperand) return { ok: false, message: 'Missing operator before "("' };
      parenDepth += 1;
      continue;
    }
    if (token === ")") {
      if (expectOperand) return { ok: false, message: 'Unexpected ")" or missing operand' };
      parenDepth -= 1;
      if (parenDepth < 0) return { ok: false, message: "Unbalanced parentheses" };
      expectOperand = false;
      continue;
    }
    if (operators.has(token)) {
      if (expectOperand) return { ok: false, message: `Invalid operator sequence near "${token}"` };
      expectOperand = true;
      continue;
    }

    if (!expectOperand) return { ok: false, message: "Missing operator between values" };
    expectOperand = false;
  }

  if (expectOperand) return { ok: false, message: "Formula cannot end with an operator" };
  if (parenDepth !== 0) return { ok: false, message: "Unbalanced parentheses" };

  const references = tokens.filter((t) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(t));
  if (references.length > 0) {
    const validRefs = new Set(
      getAvailableFormulaParameters().flatMap((p) => {
        const refs = [];
        if (p.initial) refs.push(String(p.initial).trim());
        if (p.name) refs.push(String(p.name).trim().replace(/\s+/g, "_"));
        return refs.filter(Boolean);
      }),
    );
    const invalidRef = references.find((ref) => !validRefs.has(ref));
    if (invalidRef) {
      return { ok: false, message: `Unknown parameter reference: ${invalidRef}` };
    }
  }

  return { ok: true, message: "" };
}

function togglePhotoModeGroup() {
  const photoCheckbox = document.getElementById("paramPhoto");
  const photoModeGroup = document.getElementById("paramPhotoModeGroup");
  if (!photoCheckbox || !photoModeGroup) return;
  
  if (photoCheckbox.checked) {
    photoModeGroup.classList.remove("hidden");
  } else {
    photoModeGroup.classList.add("hidden");
  }
}

function toggleAgronomyFields(show) {
  const groups = [
    "agronomyActivityGroup",
    "agronomyDapGroup",
    "agronomyChemicalGroup",
    "agronomyDoseGroup",
    "agronomyRemarkGroup",
  ];

  groups.forEach((id) => {
    const group = document.getElementById(id);
    if (!group) return;
    if (show) {
      group.classList.remove("hidden");
    } else {
      group.classList.add("hidden");
    }
  });

  // Hide the generic name field for agronomy (activity IS the name)
  const nameField = document.getElementById("itemName");
  const nameGroup = nameField?.closest(".form-group");
  if (nameGroup) nameGroup.classList.toggle("hidden", show);

  // Show/hide Agronomy Crops side panel
  const agroCropsPanel = document.getElementById('modalAgroCropsPanel');
  const modal = document.getElementById('itemModal');
  if (agroCropsPanel && modal) {
    if (show) {
      agroCropsPanel.classList.remove('hidden');
      modal.classList.add('has-agro-crops-panel');
    } else {
      agroCropsPanel.classList.add('hidden');
      modal.classList.remove('has-agro-crops-panel');
    }
  }

  // Populate crop picklist when showing
  if (show) {
    populateAgronomyCropPicklist();
  }
}

// ---- Agronomy Crops Dual-Picklist Side Panel ----
let _agroCropSelected = []; // Array of selected crop IDs (in order)

function populateAgronomyCropPicklist(selectedCropIds = []) {
  _agroCropSelected = [...selectedCropIds];
  const searchInput = document.getElementById('agroCropSearch');
  const availableList = document.getElementById('agroCropAvailable');
  const selectedList = document.getElementById('agroCropSelected');
  const summary = document.getElementById('agroCropSummary');
  if (!availableList || !selectedList) return;

  const crops = inventoryState.items.crops || [];

  // Remove old listeners
  if (searchInput && searchInput._agroSearch) {
    searchInput.removeEventListener('input', searchInput._agroSearch);
  }

  function renderAvailable(searchTerm = '') {
    const term = searchTerm.toLowerCase();
    const available = crops.filter(c => !_agroCropSelected.includes(c.id) &&
      (!term || c.name.toLowerCase().includes(term)));

    if (available.length === 0) {
      availableList.innerHTML = '<div style="padding:0.5rem;text-align:center;font-size:0.75rem;color:var(--text-tertiary)">' +
        (crops.length === 0 ? 'No crops' : 'None') + '</div>';
    } else {
      availableList.innerHTML = available.map(c => {
        const typeLabel = c.entryType === "hybrid" ? "Hybrid" : "Parental";
        return `<div class="agro-crop-item" draggable="true" data-id="${c.id}">${escapeHtml(c.name)} <span class="crop-type-badge">${typeLabel}</span></div>`;
      }).join('');
    }

    // Attach drag + click on available items
    availableList.querySelectorAll('.agro-crop-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        if (!_agroCropSelected.includes(id)) {
          _agroCropSelected.push(id);
          renderAvailable(searchInput?.value || '');
          renderSelected();
          updateSummary();
        }
      });
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', el.dataset.id);
        e.dataTransfer.effectAllowed = 'move';
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
    });
  }

  function renderSelected() {
    if (_agroCropSelected.length === 0) {
      selectedList.innerHTML = '<div style="padding:0.5rem;text-align:center;font-size:0.75rem;color:var(--text-tertiary)">Drag or click to add</div>';
    } else {
      selectedList.innerHTML = _agroCropSelected.map(id => {
        const crop = crops.find(c => c.id === id);
        if (!crop) return '';
        const typeLabel = crop.entryType === "hybrid" ? "Hybrid" : "Parental";
        return `<div class="agro-crop-item" draggable="true" data-id="${id}">${escapeHtml(crop.name)} <span class="crop-type-badge">${typeLabel}</span></div>`;
      }).join('');
    }

    // Attach drag + click on selected items
    selectedList.querySelectorAll('.agro-crop-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        _agroCropSelected = _agroCropSelected.filter(x => x !== id);
        renderAvailable(searchInput?.value || '');
        renderSelected();
        updateSummary();
      });
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', el.dataset.id);
        e.dataTransfer.effectAllowed = 'move';
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
      // Reorder drag-over within selected list
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        el.classList.add('drag-over');
      });
      el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('drag-over');
        const dragId = e.dataTransfer.getData('text/plain');
        const targetId = el.dataset.id;
        if (dragId === targetId) return;
        // If from available → add before target
        if (!_agroCropSelected.includes(dragId)) {
          const idx = _agroCropSelected.indexOf(targetId);
          _agroCropSelected.splice(idx, 0, dragId);
        } else {
          // Reorder within selected
          _agroCropSelected = _agroCropSelected.filter(x => x !== dragId);
          const idx = _agroCropSelected.indexOf(targetId);
          _agroCropSelected.splice(idx, 0, dragId);
        }
        renderAvailable(searchInput?.value || '');
        renderSelected();
        updateSummary();
      });
    });
  }

  function updateSummary() {
    if (!summary) return;
    summary.textContent = `${_agroCropSelected.length} crop(s) selected`;
  }

  // List-level drop handlers (drop on empty area)
  [availableList, selectedList].forEach(list => {
    list.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!e.target.classList.contains('agro-crop-item')) {
        list.classList.add('drag-over-list');
      }
    });
    list.addEventListener('dragleave', (e) => {
      if (!list.contains(e.relatedTarget)) {
        list.classList.remove('drag-over-list');
      }
    });
    list.addEventListener('drop', (e) => {
      e.preventDefault();
      list.classList.remove('drag-over-list');
      if (e.target.classList.contains('agro-crop-item')) return; // handled by item drop
      const dragId = e.dataTransfer.getData('text/plain');
      const isSelected = list.dataset.list === 'selected';
      if (isSelected) {
        if (!_agroCropSelected.includes(dragId)) {
          _agroCropSelected.push(dragId);
        }
      } else {
        _agroCropSelected = _agroCropSelected.filter(x => x !== dragId);
      }
      renderAvailable(searchInput?.value || '');
      renderSelected();
      updateSummary();
    });
  });

  // Search handler
  if (searchInput) {
    searchInput.value = '';
    searchInput._agroSearch = () => renderAvailable(searchInput.value);
    searchInput.addEventListener('input', searchInput._agroSearch);
  }

  renderAvailable();
  renderSelected();
  updateSummary();
}

function getAgroCropSelectedIds() {
  return [..._agroCropSelected];
}

// Legacy alias (backwards compat)
function populateAgronomyCropCheckboxes(selectedCropIds = []) {
  populateAgronomyCropPicklist(selectedCropIds);
}

// Populate Days of Observation panel: crop select + range inputs
let _dooTempData = {}; // Temporary store for DoO values while editing

function populateParamDoo(existingDoo = {}) {
  _dooTempData = {};
  const cropSelect = document.getElementById('dooCropSelect');
  const minInput = document.getElementById('dooRangeMin');
  const maxInput = document.getElementById('dooRangeMax');
  const summary = document.getElementById('dooSummary');
  if (!cropSelect || !minInput || !maxInput) return;

  const crops = inventoryState.items.crops || [];

  // Normalize existing data: support both number and {min,max} formats
  crops.forEach(crop => {
    const val = existingDoo[crop.id];
    if (val != null) {
      if (typeof val === 'object' && val.min != null) {
        _dooTempData[crop.id] = { min: val.min, max: val.max ?? val.min };
      } else {
        _dooTempData[crop.id] = { min: Number(val), max: Number(val) };
      }
    }
  });

  // Populate crop select
  cropSelect.innerHTML = '<option value="">Select crop</option>' +
    crops.map(c => {
      const et = c.entryType ? ` (${c.entryType.charAt(0).toUpperCase() + c.entryType.slice(1)})` : '';
      return `<option value="${c.id}">${escapeHtml(c.name + et)}</option>`;
    }).join('');
  cropSelect.value = '';
  minInput.value = '';
  maxInput.value = '';

  // Remove old listeners
  cropSelect.removeEventListener('change', cropSelect._dooChange);
  minInput.removeEventListener('input', minInput._dooInput);
  maxInput.removeEventListener('input', maxInput._dooInput);

  // Crop select change: load saved values for that crop
  cropSelect._dooChange = () => {
    const cid = cropSelect.value;
    if (!cid) { minInput.value = ''; maxInput.value = ''; return; }
    const saved = _dooTempData[cid];
    minInput.value = saved ? saved.min : '';
    maxInput.value = saved ? saved.max : '';
  };
  cropSelect.addEventListener('change', cropSelect._dooChange);

  // Save on input change
  const saveCurrent = () => {
    const cid = cropSelect.value;
    if (!cid) return;
    const vMin = minInput.value.trim();
    const vMax = maxInput.value.trim();
    if (vMin !== '' || vMax !== '') {
      _dooTempData[cid] = { min: vMin !== '' ? Number(vMin) : 0, max: vMax !== '' ? Number(vMax) : (vMin !== '' ? Number(vMin) : 0) };
    } else {
      delete _dooTempData[cid];
    }
    renderDooSummary();
  };
  minInput._dooInput = saveCurrent;
  maxInput._dooInput = saveCurrent;
  minInput.addEventListener('input', minInput._dooInput);
  maxInput.addEventListener('input', maxInput._dooInput);

  renderDooSummary();
}

function renderDooSummary() {
  const summary = document.getElementById('dooSummary');
  if (!summary) return;
  const crops = inventoryState.items.crops || [];
  const entries = Object.entries(_dooTempData);
  if (entries.length === 0) {
    summary.innerHTML = '<span style="font-size:0.75rem;color:var(--text-tertiary)">No DoO set</span>';
    return;
  }
  summary.innerHTML = entries.map(([cid, val]) => {
    const crop = crops.find(c => c.id === cid);
    const et = crop?.entryType ? ` (${crop.entryType.charAt(0).toUpperCase() + crop.entryType.slice(1)})` : '';
    const name = crop ? escapeHtml(crop.name + et) : 'Unknown';
    const display = val.min === val.max ? `${val.min}` : `${val.min}–${val.max}`;
    return `<div class="modal-doo-summary-row"><span class="modal-doo-summary-crop" title="${name}">${name}</span><span class="modal-doo-summary-val">${display}</span><button type="button" class="modal-doo-delete-btn" data-crop-id="${cid}" title="Remove"><span class="material-symbols-rounded" style="font-size:16px">close</span></button></div>`;
  }).join('');
  summary.querySelectorAll('.modal-doo-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cid = btn.dataset.cropId;
      delete _dooTempData[cid];
      const cropSelect = document.getElementById('dooCropSelect');
      if (cropSelect && cropSelect.value === cid) {
        const minInput = document.getElementById('dooRangeMin');
        const maxInput = document.getElementById('dooRangeMax');
        if (minInput) minInput.value = '';
        if (maxInput) maxInput.value = '';
      }
      renderDooSummary();
    });
  });
}

// Collect DoO values from temp store
function collectParamDoo() {
  return { ..._dooTempData };
}

function serializeParamDooForExport(daysOfObservation) {
  if (!daysOfObservation || typeof daysOfObservation !== "object") return "";
  const crops = inventoryState.items.crops || [];
  const parts = [];

  Object.entries(daysOfObservation).forEach(([cropId, value]) => {
    if (value == null) return;
    const crop = crops.find((c) => c.id === cropId);
    const cropLabel = crop?.name || cropId;
    let formatted = "";

    if (typeof value === "object" && value.min != null) {
      const min = Number(value.min);
      const max = value.max != null ? Number(value.max) : min;
      formatted = min === max ? `${min}` : `${min}-${max}`;
    } else {
      const numeric = Number(value);
      if (!Number.isNaN(numeric)) {
        formatted = `${numeric}`;
      }
    }

    if (formatted) {
      parts.push(`${cropLabel}:${formatted}`);
    }
  });

  return parts.join(" | ");
}

function parseParamDooImport(raw) {
  const result = {};
  const input = String(raw || "").trim();
  if (!input) return result;

  const crops = inventoryState.items.crops || [];
  const byName = new Map(crops.map((c) => [(c.name || "").toLowerCase().trim(), c.id]));
  const byId = new Set(crops.map((c) => c.id));

  const resolveCropId = (token) => {
    const key = String(token || "").trim();
    if (!key) return null;
    if (byId.has(key)) return key;
    return byName.get(key.toLowerCase()) || null;
  };

  const normalizeValue = (val) => {
    if (val == null || val === "") return null;
    if (typeof val === "object" && val.min != null) {
      const min = Number(val.min);
      const max = val.max != null ? Number(val.max) : min;
      if (Number.isNaN(min) || Number.isNaN(max)) return null;
      return { min, max };
    }
    const str = String(val).trim();
    if (!str) return null;
    const rangeMatch = str.match(/^(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)$/);
    if (rangeMatch) {
      const min = Number(rangeMatch[1]);
      const max = Number(rangeMatch[2]);
      if (Number.isNaN(min) || Number.isNaN(max)) return null;
      return { min, max };
    }
    const single = Number(str);
    if (Number.isNaN(single)) return null;
    return { min: single, max: single };
  };

  if (input.startsWith("{") && input.endsWith("}")) {
    try {
      const parsed = JSON.parse(input);
      Object.entries(parsed || {}).forEach(([cropToken, val]) => {
        const cropId = resolveCropId(cropToken);
        const normalized = normalizeValue(val);
        if (cropId && normalized) {
          result[cropId] = normalized;
        }
      });
      return result;
    } catch (_) {
      // fallback to plain parser below
    }
  }

  input.split(/[|;]+/).forEach((part) => {
    const segment = part.trim();
    if (!segment) return;
    const sep = segment.indexOf(":");
    if (sep < 0) return;
    const cropToken = segment.slice(0, sep).trim();
    const valueToken = segment.slice(sep + 1).trim();
    const cropId = resolveCropId(cropToken);
    const normalized = normalizeValue(valueToken);
    if (cropId && normalized) {
      result[cropId] = normalized;
    }
  });

  return result;
}

// Update inventory filter controls based on current category
function updateInventoryFilters() {
  const wrapper = document.getElementById('inventoryFilterWrapper');
  const cropSelect = document.getElementById('inventoryFilterCrop');
  const sortSelect = document.getElementById('inventorySortBy');
  if (!wrapper) return;

  const cat = inventoryState.currentCategory;
  // Show filters for parameters and agronomy
  if (cat === 'parameters' || cat === 'agronomy') {
    wrapper.style.display = '';
    // Populate crop filter
    const crops = inventoryState.items.crops || [];
    cropSelect.innerHTML = '<option value="">All Crops</option>' +
      crops.map(c => {
        const et = c.entryType ? ` (${c.entryType.charAt(0).toUpperCase() + c.entryType.slice(1)})` : '';
        return `<option value="${c.id}">${escapeHtml(c.name + et)}</option>`;
      }).join('');
    cropSelect.value = inventoryState.filterCrop || '';
    sortSelect.value = inventoryState.sortBy || (cat === 'parameters' ? 'updatedAt' : 'name');
  } else {
    wrapper.style.display = 'none';
  }
}

function updateLineCropOptions() {
  const select = document.getElementById("lineCrop");
  if (!select) return;

  const crops = inventoryState.items.crops || [];

  select.innerHTML = [
    '<option value="">Select crop</option>',
    ...crops.map((crop) => {
      const et = crop.entryType ? ` (${crop.entryType.charAt(0).toUpperCase() + crop.entryType.slice(1)})` : '';
      return `<option value="${crop.id}">${escapeHtml(crop.name + et)}</option>`;
    }),
  ].join("");
}

function updateCropTypeSuggestions() {
  const datalist = document.getElementById("cropTypeList");
  if (!datalist) return;

  const types = inventoryState.items.crops
    .map((item) => (item.cropType || "").trim())
    .filter((type) => type.length > 0);

  const uniqueTypes = Array.from(new Set(types)).sort((a, b) =>
    a.localeCompare(b),
  );

  datalist.innerHTML = uniqueTypes
    .map((type) => `<option value="${escapeHtml(type)}"></option>`)
    .join("");
}

// Initialize inventory
async function initializeInventory(options = {}) {
  const onProgress = options.onProgress;
  let hasCache = false;

  try {
    let cached = null;
    if (typeof loadLocalCache === "function") {
      cached = await loadLocalCache("inventory");
    }

    if (cached?.items) {
      inventoryState.items = cached.items;
      // Load folders from cache
      if (cached.folders) {
        inventoryState.folders = cached.folders;
      }
      // Backward compat: migrate old "lines" key to "entries"
      if (inventoryState.items.lines && !inventoryState.items.entries) {
        inventoryState.items.entries = inventoryState.items.lines;
        delete inventoryState.items.lines;
      }
      // Ensure entries array exists
      if (!inventoryState.items.entries) {
        inventoryState.items.entries = [];
      }
      // Ensure agronomy array exists (migration for older caches)
      if (!inventoryState.items.agronomy) {
        inventoryState.items.agronomy = [];
      }
      hasCache = true;

      // Migrate lines - ensure cropId is set from crop field if missing
      if (inventoryState.items.entries && inventoryState.items.crops) {
        inventoryState.items.entries.forEach((line) => {
          if (!line.cropId && line.crop) {
            line.cropId = line.crop;
          }
        });
      }

      updateDashboardCounts();
      inventoryState.currentCategory = inventoryState.currentCategory || "crops";
      switchCategory(inventoryState.currentCategory);
      updateCropTypeSuggestions();

      if (onProgress) {
        onProgress(0.15, "Loaded inventory from device");
      }
    }

    // Load items for all categories from Drive (skip for guest)
    const isGuest = typeof getCurrentUser === 'function' && getCurrentUser()?.isGuest;
    if (!isGuest) {
      const total = CATEGORIES.length;
      let done = 0;

      // Load folders from Drive
      if (typeof enqueueSync === 'function' && typeof loadInventoryFoldersFromGoogleDrive === 'function') {
        enqueueSync({
          label: 'Load Folders',
          fileKey: 'inventory_folders',
          run: async () => {
            const driveFolders = await loadInventoryFoldersFromGoogleDrive();
            if (driveFolders && typeof driveFolders === 'object') {
              inventoryState.folders = driveFolders;
              saveFoldersToCache();
              if (inventoryState.currentCategory) {
                switchCategory(inventoryState.currentCategory);
              }
            }
          }
        });
      }

      for (const category of CATEGORIES) {
        const key = category.toLowerCase();
        
        // Add to sync queue for visibility
        if (typeof enqueueSync === 'function') {
          enqueueSync({
            label: `Load ${category}`,
            run: async () => {
              inventoryState.items[key] = await loadItemsFromGoogleDrive(category);
              done += 1;
              if (onProgress) {
                onProgress(done / total, `Syncing ${category}...`);
              }
              
              // Update UI after each category
              updateDashboardCounts();
              if (inventoryState.currentCategory === key) {
                switchCategory(inventoryState.currentCategory);
              }
              updateCropTypeSuggestions();

              // Refresh trial editor entries lists when entries/crops load
              if ((key === 'entries' || key === 'crops') && typeof refreshFactorEntriesLists === 'function') {
                refreshFactorEntriesLists();
              }
              
              if (typeof saveLocalCache === 'function') {
                saveLocalCache('inventory', { items: inventoryState.items });
              }
            }
          });
        } else {
          inventoryState.items[key] = await loadItemsFromGoogleDrive(category);
          done += 1;
          if (onProgress) {
            onProgress(done / total, `Syncing ${category}...`);
          }
        }
      }
    }

    // Migrate entries - ensure cropId is set from crop field if missing
    // Also ensure lineType defaults to "parental" for legacy items
    if (inventoryState.items.entries && inventoryState.items.crops) {
      inventoryState.items.entries.forEach((line) => {
        if (!line.cropId && line.crop) {
          line.cropId = line.crop;
        }
        if (!line.lineType) {
          // Derive from parent crop's entryType if available
          const parentCrop = inventoryState.items.crops.find(c => c.id === line.cropId);
          line.lineType = parentCrop?.entryType || "parental";
        }
      });
    }

    updateDashboardCounts();
    inventoryState.currentCategory = inventoryState.currentCategory || "crops";
    switchCategory(inventoryState.currentCategory);
    updateCropTypeSuggestions();

    if (typeof saveLocalCache === "function") {
      saveLocalCache("inventory", { items: inventoryState.items, folders: inventoryState.folders });
    }

    if (onProgress) {
      onProgress(1, "Inventory synced");
    }
  } catch (error) {
    console.error("Error initializing inventory:", error);
    if (!hasCache) {
      showToast("Error loading inventory data. Please refresh the page.", "error");
    }
  }
}

// Switch category
function switchCategory(category) {
  const key = category.toLowerCase();
  // Don't allow switching to 'entries' - it's merged with crops
  if (key === "entries") {
    return;
  }
  inventoryState.currentCategory = key;
  inventoryState.currentFolderId = null;
  inventoryState.searchQuery = "";
  const searchInput = document.getElementById("inventorySearchInput");
  if (searchInput) searchInput.value = "";

  if (key === "parameters" && !inventoryState.parametersSortInitialized) {
    inventoryState.sortBy = "updatedAt";
    inventoryState.parametersSortInitialized = true;
  }

  if (typeof syncInventoryNavState === "function") {
    syncInventoryNavState(key);
  }

  // Update title
  const categoryTitle = {
    crops: "Crops",
    locations: "Locations",
    parameters: "Parameters",
    agronomy: "Agronomy",
  };
  document.getElementById("categoryTitle").textContent = categoryTitle[key];

  toggleCropFields(key === "crops");
  toggleLineFields(key === "crops"); // Show line fields when editing lines from crops
  toggleLocationFields(key === "locations");
  toggleParameterFields(key === "parameters");
  toggleAgronomyFields(key === "agronomy");
  if (key === "crops") {
    updateCropTypeSuggestions();
    updateLineCropOptions();
  }

  // Update inventory filters
  updateInventoryFilters();

  // Update import/export buttons visibility
  updateImportExportVisibility();

  // Render items
  renderInventoryItems();
}

function getInventoryListColumns(category) {
  if (category === "crops") {
    return [
      { key: "name", label: "Name", min: 120, flex: true },
      { key: "cropType", label: "Crop Type", min: 100, width: 140 },
      { key: "entryType", label: "Entry Type", min: 90, width: 120 },
      { key: "entries", label: "Entries", min: 70, width: 90 },
      { key: "updated", label: "Updated", min: 100, width: 130 },
      { key: "actions", label: "Actions", auto: true, fixed: true },
    ];
  }

  if (category === "locations") {
    return [
      { key: "name", label: "Name", min: 120, flex: true },
      { key: "coordinates", label: "Coordinates", min: 140, width: 200 },
      { key: "updated", label: "Updated", min: 100, width: 130 },
      { key: "actions", label: "Actions", auto: true, fixed: true },
    ];
  }

  if (category === "parameters") {
    return [
      { key: "name", label: "Name", min: 120, flex: true },
      { key: "initial", label: "Initial", min: 60, width: 80 },
      { key: "type", label: "Type", min: 80, width: 100 },
      { key: "unit", label: "Unit", min: 60, width: 80 },
      { key: "samples", label: "Samples", min: 70, width: 90 },
      { key: "updated", label: "Updated", min: 100, width: 130 },
      { key: "actions", label: "Actions", auto: true, fixed: true },
    ];
  }

  return [
    { key: "activity", label: "Activity", min: 120, flex: true },
    { key: "crops", label: "Crops", min: 140, width: 200 },
    { key: "dap", label: "DAP", min: 60, width: 70 },
    { key: "chemical", label: "Chemical", min: 100, width: 140 },
    { key: "dose", label: "Dose", min: 80, width: 100 },
    { key: "remark", label: "Remark", min: 120, width: 160 },
    { key: "updated", label: "Updated", min: 100, width: 130 },
    { key: "actions", label: "Actions", auto: true, fixed: true },
  ];
}

function getInventoryListTemplate(widths, columns) {
  return widths.map((w, i) => {
    const col = columns?.[i];
    if (col?.flex) return `minmax(${col.min || 80}px, 1fr)`;
    if (col?.auto) return "auto";
    return `${Math.max(60, Number(w) || 60)}px`;
  }).join(" ");
}

function getInventoryListWidths(category, columns) {
  const saved = Array.isArray(inventoryState.listColumnWidths?.[category])
    ? inventoryState.listColumnWidths[category]
    : [];

  const widths = columns.map((col, idx) => {
    const fallback = col.width || 140;
    const raw = Number(saved[idx]);
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
  });

  if (!inventoryState.listColumnWidths) inventoryState.listColumnWidths = {};
  inventoryState.listColumnWidths[category] = widths;
  return widths;
}

function formatInventoryItemDate(item) {
  if (!item?.updatedAt) return "-";
  return new Date(item.updatedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function resolveAgronomyCropNamesWithType(cropIds) {
  if (!Array.isArray(cropIds) || cropIds.length === 0) return "-";
  return cropIds
    .map((id) => {
      const crop = inventoryState.items.crops.find((c) => c.id === id);
      if (!crop) return "Unknown";
      const typeLabel = crop.entryType === "hybrid" ? "(Hybrid)" : "(Parental)";
      return `${escapeHtml(crop.name)} ${typeLabel}`;
    })
    .join(", ");
}

function formatAgronomyDap(item) {
  if (item.dapMin != null && item.dapMax != null && item.dapMax !== "" && item.dapMax !== item.dapMin) {
    return `${item.dapMin}-${item.dapMax}`;
  }
  return item.dapMin != null ? `${item.dapMin}` : "-";
}

function renderInventoryListCell(item, col, category) {
  if (col.key === "actions") {
    const cropAction = category === "crops"
      ? `<button class="expand-crop-btn" data-crop-id="${item.id}" title="View Entries"><span class="material-symbols-rounded">visibility</span></button>`
      : "";
    return `
      <div class="inventory-list-cell inventory-list-cell-actions">
        <div class="item-actions">
          ${cropAction}
          <button class="move-folder-btn" data-id="${item.id}" title="Move to Folder"><span class="material-symbols-rounded">drive_file_move</span></button>
          <button class="edit-btn" data-id="${item.id}" title="Edit"><span class="material-symbols-rounded">edit</span></button>
          <button class="delete-btn" data-id="${item.id}" title="Delete"><span class="material-symbols-rounded">delete</span></button>
        </div>
      </div>
    `;
  }

  if (category === "crops") {
    const entryCount = inventoryState.items.entries.filter((line) => line.cropId === item.id || line.crop === item.id).length;
    const entryType = item.entryType === "hybrid" ? "Hybrid" : "Parental";
    const cropValues = {
      name: escapeHtml(item.name || "-"),
      cropType: escapeHtml(item.cropType || "-"),
      entryType,
      entries: entryCount > 0 ? String(entryCount) : "0",
      updated: formatInventoryItemDate(item),
    };
    return `<div class="inventory-list-cell" title="${cropValues[col.key] || "-"}">${cropValues[col.key] || "-"}</div>`;
  }

  if (category === "locations") {
    const values = {
      name: escapeHtml(item.name || "-"),
      coordinates: escapeHtml(item.coordinates || "-"),
      updated: formatInventoryItemDate(item),
    };
    return `<div class="inventory-list-cell" title="${values[col.key] || "-"}">${values[col.key] || "-"}</div>`;
  }

  if (category === "parameters") {
    const values = {
      name: escapeHtml(item.name || "-"),
      initial: escapeHtml(item.initial || "-"),
      type: escapeHtml(item.type || "-"),
      unit: escapeHtml(item.unit || "-"),
      samples: String(item.numberOfSamples ?? item.quantity ?? "-"),
      updated: formatInventoryItemDate(item),
    };
    return `<div class="inventory-list-cell" title="${values[col.key] || "-"}">${values[col.key] || "-"}</div>`;
  }

  const agronomyValues = {
    activity: escapeHtml(item.activity || item.name || "-"),
    crops: resolveAgronomyCropNamesWithType(item.cropIds),
    dap: formatAgronomyDap(item),
    chemical: escapeHtml(item.chemical || "-"),
    dose: escapeHtml(item.dose || "-"),
    remark: escapeHtml(item.remark || "-"),
    updated: formatInventoryItemDate(item),
  };
  return `<div class="inventory-list-cell" title="${agronomyValues[col.key] || "-"}">${agronomyValues[col.key] || "-"}</div>`;
}

function applyInventoryListTemplate(container, template) {
  const table = container.querySelector(".inventory-list-table");
  if (table) table.style.gridTemplateColumns = template;
}

function setupInventoryListColumnResize(container, category, columns, widths) {
  const header = container.querySelector(".inventory-list-header");
  if (!header) return;

  header.querySelectorAll(".inventory-col-resizer").forEach((handle) => {
    handle.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const idx = Number(handle.dataset.colIndex);
      if (!Number.isFinite(idx)) return;

      const minWidth = columns[idx]?.min || 80;
      const startX = event.clientX;
      const startWidth = widths[idx];

      const onMouseMove = (moveEvent) => {
        const next = Math.max(minWidth, startWidth + (moveEvent.clientX - startX));
        widths[idx] = next;
        inventoryState.listColumnWidths[category] = [...widths];
        applyInventoryListTemplate(container, getInventoryListTemplate(widths, columns));
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });
  });
}

function attachInventoryListActionListeners(container, category) {
  if (category === "crops") {
    container.querySelectorAll(".expand-crop-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        showCropLinesPopup(btn.dataset.cropId);
      });
    });
  }

  container.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openEditModal(btn.dataset.id);
    });
  });

  container.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteItem(btn.dataset.id);
    });
  });

  container.querySelectorAll(".move-folder-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openMoveToFolderModal(btn.dataset.id);
    });
  });
}

function renderInventoryListMode(container, items, folderCardsHtml) {
  const category = inventoryState.currentCategory;
  const columns = getInventoryListColumns(category);
  const widths = getInventoryListWidths(category, columns);
  const template = getInventoryListTemplate(widths, columns);

  const headerHtml = `
    <div class="inventory-list-header">
      ${columns.map((col, idx) => `
        <div class="inventory-list-head-cell">
          <span>${escapeHtml(col.label)}</span>
          ${idx < columns.length - 1 && !col.fixed
            ? `<span class="inventory-col-resizer" data-col-index="${idx}" aria-hidden="true"></span>`
            : ""}
        </div>
      `).join("")}
    </div>
  `;

  const rowsHtml = items.map((item) => `
    <div class="inventory-list-row" data-id="${item.id}">
      ${columns.map((col) => renderInventoryListCell(item, col, category)).join("")}
    </div>
  `).join("");

  container.innerHTML = folderCardsHtml + `<div class="inventory-list-table" style="grid-template-columns:${template}">${headerHtml}${rowsHtml}</div>`;

  attachFolderCardListeners(container);
  attachInventoryListActionListeners(container, category);
  setupInventoryListColumnResize(container, category, columns, widths);
}

// Render inventory items
function renderInventoryItems() {
  const container = document.getElementById("inventoryList");
  if (!container) return;

  const activeViewMode = getEffectiveInventoryViewMode(inventoryState.currentCategory);
  container.classList.remove("inventory-view-grid", "inventory-view-list");
  container.classList.add(activeViewMode === "list" ? "inventory-view-list" : "inventory-view-grid");

  let items = [...(inventoryState.items[inventoryState.currentCategory] || [])];
  const isCrops = inventoryState.currentCategory === "crops";
  const isLocations = inventoryState.currentCategory === "locations";
  const isParameters = inventoryState.currentCategory === "parameters";
  const isAgronomy = inventoryState.currentCategory === "agronomy";
  const inFolder = inventoryState.currentFolderId != null;

  // Filter by folder
  if (inFolder) {
    items = items.filter(it => _itemInFolder(it, inventoryState.currentFolderId));
  }

  // Apply filters for parameters and agronomy
  if ((isParameters || isAgronomy) && inventoryState.filterCrop) {
    const cropId = inventoryState.filterCrop;
    if (isParameters) {
      items = items.filter(p => {
        if (!p.daysOfObservation) return false;
        const val = p.daysOfObservation[cropId];
        if (val == null) return false;
        return typeof val === 'object' ? (val.min != null || val.max != null) : true;
      });
    } else if (isAgronomy) {
      items = items.filter(a => a.cropIds && a.cropIds.includes(cropId));
    }
  }

  // Apply sorting
  if ((isParameters || isAgronomy) && inventoryState.sortBy === 'updatedAt') {
    items.sort((a, b) => {
      const da = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const db = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return db - da; // newest first
    });
  } else if ((isParameters || isAgronomy) && inventoryState.sortBy === 'name') {
    items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  // Apply search filter
  const sq = (inventoryState.searchQuery || "").trim().toLowerCase();
  if (sq) {
    items = items.filter(it => {
      const name = (it.name || "").toLowerCase();
      if (name.includes(sq)) return true;
      if (isCrops && (it.cropType || "").toLowerCase().includes(sq)) return true;
      if (isParameters) {
        if ((it.initial || "").toLowerCase().includes(sq)) return true;
        if ((it.type || "").toLowerCase().includes(sq)) return true;
        if ((it.unit || "").toLowerCase().includes(sq)) return true;
      }
      if (isAgronomy) {
        if ((it.activity || "").toLowerCase().includes(sq)) return true;
        if ((it.chemical || "").toLowerCase().includes(sq)) return true;
        if ((it.remark || "").toLowerCase().includes(sq)) return true;
      }
      return false;
    });
  }

  // Get folders for current category
  const categoryFolders = inventoryState.folders[inventoryState.currentCategory] || [];

  // Update folder navigation UI
  const folderBackBtn = document.getElementById("folderBackBtn");
  const folderBreadcrumb = document.getElementById("folderBreadcrumb");
  if (folderBackBtn) folderBackBtn.classList.toggle("hidden", !inFolder);
  if (folderBreadcrumb) {
    if (inFolder) {
      const openFolder = categoryFolders.find(f => f.id === inventoryState.currentFolderId);
      folderBreadcrumb.innerHTML = `<span class="material-symbols-rounded" style="font-size:16px">${escapeHtml(openFolder?.icon || "folder")}</span> ${escapeHtml(openFolder?.name || "Folder")}`;
      folderBreadcrumb.classList.remove("hidden");
    } else {
      folderBreadcrumb.classList.add("hidden");
    }
  }

  // Build folder cards HTML if at root level and not searching
  let folderCardsHtml = "";
  if (!inFolder && !sq && categoryFolders.length > 0) {
    // Filter folders by search if needed (not searching here)
    const unfolderedItems = items.filter(it => !_itemHasFolder(it));

    folderCardsHtml = categoryFolders.map(folder => {
      const folderItems = (inventoryState.items[inventoryState.currentCategory] || []).filter(it => _itemInFolder(it, folder.id));
      const count = folderItems.length;
      const iconName = folder.icon || "folder";
      const colorStyle = folder.color ? `color:${folder.color};` : "";
      const borderStyle = folder.color ? `border-left: 3px solid ${folder.color};` : "";
      return `
        <div class="inventory-folder-card" data-folder-id="${folder.id}" style="${borderStyle}">
          <div class="folder-card-icon" style="${colorStyle}">
            <span class="material-symbols-rounded">${escapeHtml(iconName)}</span>
          </div>
          <div class="folder-card-meta">
            <div class="folder-card-name">${escapeHtml(folder.name)}</div>
            <div class="folder-card-count">${count} item${count !== 1 ? "s" : ""}</div>
          </div>
          <div class="folder-card-actions">
            <button class="folder-edit-btn" data-folder-id="${folder.id}" title="Edit folder">
              <span class="material-symbols-rounded">edit</span>
            </button>
          </div>
        </div>
      `;
    }).join("");

    // When at root, only show unfoldered items
    items = unfolderedItems;
  } else if (!inFolder && !sq) {
    // No folders exist, show all items (none are foldered without folders)
  }

  const hasContent = items.length > 0 || folderCardsHtml;
  if (!hasContent) {
    container.classList.add("empty-grid");
    container.innerHTML = `
            <div class="empty-state">
                <span class="material-symbols-rounded">inbox</span>
                <p>${sq ? "No items match your search." : "No items yet. Create your first item to get started."}</p>
            </div>
        `;
    return;
  } else {
    container.classList.remove("empty-grid");
  }

  if (activeViewMode === "list") {
    renderInventoryListMode(container, items, folderCardsHtml);
    return;
  }

  // Special rendering for Crops with nested Entries
  if (isCrops) {
    const cropCardsHtml = items
      .map((crop, idx) => {
        const relatedLines = inventoryState.items.entries.filter((line) => {
          // Match by cropId (new way)
          if (line.cropId === crop.id) {
            return true;
          }
          // Match by crop field (legacy way)
          if (line.crop === crop.id) {
            return true;
          }

          return false;
        });

        const entryCount = relatedLines.length;
        const entryTypeLabel = crop.entryType === "hybrid" ? "Hybrid" : "Parental";
        const typeBadgeClass = crop.entryType === "hybrid" ? "hybrid" : "parental";
        const countText = entryCount > 0 ? `${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}` : "No entries";

        return `
                <div class="inventory-item-group">
                    <div class="inventory-item" data-crop-id="${crop.id}">
                        <div class="item-meta">
                            <div class="item-name">${escapeHtml(crop.name)}</div>
                            <div class="item-subtext">Type: ${crop.cropType ? `${escapeHtml(crop.cropType)}` : "-"} · <span class="line-type-badge ${typeBadgeClass}">${entryTypeLabel}</span></div>
                            <div class="item-subtext">${countText}</div>
                        </div>
                        <div class="item-actions">
                            <button class="expand-crop-btn" data-crop-id="${crop.id}" title="View Entries">
                                <span class="material-symbols-rounded">visibility</span>
                            </button>
                            <button class="move-folder-btn" data-id="${crop.id}" title="Move to Folder">
                                <span class="material-symbols-rounded">drive_file_move</span>
                            </button>
                            <button class="edit-btn" data-id="${crop.id}" title="Edit">
                                <span class="material-symbols-rounded">edit</span>
                            </button>
                            <button class="delete-btn" data-id="${crop.id}" title="Delete">
                                <span class="material-symbols-rounded">delete</span>
                            </button>
                        </div>
                    </div>
                </div>
            `;
      })
      .join("");

    container.innerHTML = folderCardsHtml + cropCardsHtml;

    // Add folder card event listeners
    attachFolderCardListeners(container);

    // Add event listeners for crops
    container.querySelectorAll(".expand-crop-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const cropId = btn.dataset.cropId;
        showCropLinesPopup(cropId);
      });
    });

    container.querySelectorAll(".edit-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const itemId = btn.dataset.id;
        const category = btn.dataset.category || "crops";
        const prevCategory = inventoryState.currentCategory;
        inventoryState.currentCategory = category;
        openEditModal(itemId);
        setTimeout(() => {
          inventoryState.currentCategory = prevCategory;
        }, 0);
      });
    });

    container.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const itemId = btn.dataset.id;
        const category = btn.dataset.category || "crops";
        const prevCategory = inventoryState.currentCategory;
        inventoryState.currentCategory = category;
        deleteItem(itemId);
        inventoryState.currentCategory = prevCategory;
      });
    });

    container.querySelectorAll(".move-folder-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openMoveToFolderModal(btn.dataset.id);
      });
    });
  } else if (isAgronomy) {
    // Table rendering for Agronomy
    const resolveCropNames = (cropIds) => {
      if (!cropIds || !Array.isArray(cropIds)) return "-";
      return cropIds.map(id => {
        const crop = inventoryState.items.crops.find(c => c.id === id);
        if (!crop) return "Unknown";
        const typeLabel = crop.entryType === "hybrid" ? "(Hybrid)" : "(Parental)";
        return `${escapeHtml(crop.name)} ${typeLabel}`;
      }).join(", ") || "-";
    };

    const formatDap = (item) => {
      if (item.dapMin != null && item.dapMax != null && item.dapMax !== "" && item.dapMax !== item.dapMin) {
        return `${item.dapMin}-${item.dapMax}`;
      }
      return item.dapMin != null ? `${item.dapMin}` : "-";
    };

    const agronomyCardsHtml = items
      .map((item) => {
        const cropNames = resolveCropNames(item.cropIds);
        const dapDisplay = formatDap(item);
        
        return `
          <div class="inventory-item agronomy-item">
            <div class="item-meta">
              <div class="item-name">${escapeHtml(item.activity || item.name || "-")}</div>
              <div class="item-subtext">Crops: ${cropNames}</div>
              <div class="item-subtext">DAP: ${dapDisplay}</div>
              <div class="item-subtext">Chemical: ${escapeHtml(item.chemical || "-")}</div>
              <div class="item-subtext">Dose: ${escapeHtml(item.dose || "-")}</div>
              ${item.remark ? `<div class="item-subtext">Remark: ${escapeHtml(item.remark)}</div>` : ''}
            </div>
            <div class="item-actions">
              <button class="move-folder-btn" data-id="${item.id}" title="Move to Folder">
                <span class="material-symbols-rounded">drive_file_move</span>
              </button>
              <button class="edit-btn" data-id="${item.id}" title="Edit">
                <span class="material-symbols-rounded">edit</span>
              </button>
              <button class="delete-btn" data-id="${item.id}" title="Delete">
                <span class="material-symbols-rounded">delete</span>
              </button>
            </div>
          </div>
        `;
      })
      .join("");

    container.innerHTML = folderCardsHtml + agronomyCardsHtml;

    // Add folder card event listeners
    attachFolderCardListeners(container);

    // Add event listeners
    container.querySelectorAll(".edit-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openEditModal(btn.dataset.id);
      });
    });
    container.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteItem(btn.dataset.id);
      });
    });
    container.querySelectorAll(".move-folder-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openMoveToFolderModal(btn.dataset.id);
      });
    });
  } else {
    const stdCardsHtml = items
      .map((item) => {
        const locationMeta = "";

        const paramMeta = isParameters
          ? `
                <div class="item-subtext">Type: ${escapeHtml(item.type || "-")} · Initial: ${escapeHtml(item.initial || "-")} · Unit: ${escapeHtml(item.unit || "-")}</div>${item.updatedAt ? `<div class="item-subtext item-updated">Last updated: ${new Date(item.updatedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</div>` : ''}
            `
          : "";

        // Add map preview for locations
        const mapPreview = isLocations
          ? `<div id="locationPreviewMap${item.id}" class="location-preview-map"></div>`
          : "";

        return `
                <div class="inventory-item${isLocations ? ' location-item' : ''}">
                    ${mapPreview}
                    <div class="item-meta">
                        <div class="item-name">${escapeHtml(item.name)}</div>
                        ${locationMeta || paramMeta}
                    </div>
                    <div class="item-actions">
                        <button class="move-folder-btn" data-id="${item.id}" title="Move to Folder">
                            <span class="material-symbols-rounded">drive_file_move</span>
                        </button>
                        <button class="edit-btn" data-id="${item.id}" title="Edit">
                            <span class="material-symbols-rounded">edit</span>
                        </button>
                        <button class="delete-btn" data-id="${item.id}" title="Delete">
                            <span class="material-symbols-rounded">delete</span>
                        </button>
                    </div>
                </div>
            `;
      })
      .join("");

    container.innerHTML = folderCardsHtml + stdCardsHtml;

    // Add folder card event listeners
    attachFolderCardListeners(container);

    // Initialize location preview maps
    if (isLocations) {
      items.forEach((location) => {
        renderLocationPreviewMap(location);
      });
    }

    // Add event listeners
    container.querySelectorAll(".edit-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const itemId = btn.dataset.id;
        openEditModal(itemId);
      });
    });

    container.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const itemId = btn.dataset.id;
        deleteItem(itemId);
      });
    });

    container.querySelectorAll(".move-folder-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openMoveToFolderModal(btn.dataset.id);
      });
    });
  }
}

// =============================
// FOLDER SYSTEM
// =============================

function attachFolderCardListeners(container) {
  container.querySelectorAll(".inventory-folder-card").forEach(card => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".folder-edit-btn")) return;
      const folderId = card.dataset.folderId;
      inventoryState.currentFolderId = folderId;
      renderInventoryItems();
    });
  });
  container.querySelectorAll(".folder-edit-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openFolderModal(btn.dataset.folderId);
    });
  });
}

function navigateBackFromFolder() {
  inventoryState.currentFolderId = null;
  renderInventoryItems();
}

let _editingFolderId = null;

function openFolderModal(folderId) {
  _editingFolderId = folderId || null;
  const modal = document.getElementById("folderModal");
  const titleEl = document.getElementById("folderModalTitle");
  const nameInput = document.getElementById("folderNameInput");
  const iconInput = document.getElementById("folderIconInput");
  const iconPreview = document.getElementById("folderIconPreview");
  const saveBtn = document.getElementById("folderModalSaveBtn");
  const deleteBtn = document.getElementById("folderModalDeleteBtn");
  const colorPicker = document.getElementById("folderColorPicker");

  if (_editingFolderId) {
    const cat = inventoryState.currentCategory;
    const folder = (inventoryState.folders[cat] || []).find(f => f.id === _editingFolderId);
    if (!folder) return;
    titleEl.textContent = "Edit Folder";
    nameInput.value = folder.name;
    iconInput.value = folder.icon || "";
    iconPreview.textContent = folder.icon || "folder";
    saveBtn.textContent = "Save";
    deleteBtn.style.display = "inline-flex";

    // Set color
    colorPicker.querySelectorAll(".folder-color-swatch").forEach(s => {
      s.classList.toggle("active", s.dataset.color === (folder.color || ""));
    });
  } else {
    titleEl.textContent = "New Folder";
    nameInput.value = "";
    iconInput.value = "";
    iconPreview.textContent = "folder";
    saveBtn.textContent = "Create";
    deleteBtn.style.display = "none";

    colorPicker.querySelectorAll(".folder-color-swatch").forEach(s => {
      s.classList.toggle("active", s.dataset.color === "");
    });
  }

  modal.classList.remove("hidden");
  lockBodyScroll();
  setTimeout(() => nameInput.focus(), 100);
}

function closeFolderModal() {
  document.getElementById("folderModal").classList.add("hidden");
  unlockBodyScroll();
  _editingFolderId = null;
}

function saveFolder() {
  const nameInput = document.getElementById("folderNameInput");
  const iconInput = document.getElementById("folderIconInput");
  const colorPicker = document.getElementById("folderColorPicker");

  const name = nameInput.value.trim();
  if (!name) {
    showToast("Folder name is required", "error");
    nameInput.focus();
    return;
  }

  const icon = iconInput.value.trim() || "";
  const activeColor = colorPicker.querySelector(".folder-color-swatch.active");
  const color = activeColor ? activeColor.dataset.color : "";
  const cat = inventoryState.currentCategory;

  if (!inventoryState.folders[cat]) {
    inventoryState.folders[cat] = [];
  }

  if (_editingFolderId) {
    const folder = inventoryState.folders[cat].find(f => f.id === _editingFolderId);
    if (folder) {
      folder.name = name;
      folder.icon = icon;
      folder.color = color;
      folder.updatedAt = new Date().toISOString();
    }
  } else {
    inventoryState.folders[cat].push({
      id: `folder_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name,
      icon,
      color,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  saveFoldersToCache();
  closeFolderModal();
  renderInventoryItems();

  if (typeof enqueueSync === "function") {
    const actionLabel = _editingFolderId ? "Update" : "Create";
    enqueueSync({
      label: `${actionLabel} Folder: ${name}`,
      fileKey: "inventory_folders",
      run: () => saveInventoryFoldersToGoogleDrive(inventoryState.folders),
    });
  }
}

function deleteFolder(folderId) {
  const cat = inventoryState.currentCategory;
  const folder = (inventoryState.folders[cat] || []).find(f => f.id === folderId);
  if (!folder) return;

  if (!confirm(`Delete folder "${folder.name}"? Items inside will be moved out of the folder (not deleted).`)) return;

  // Remove this folder from all items
  (inventoryState.items[cat] || []).forEach(item => {
    if (Array.isArray(item.folderIds)) {
      item.folderIds = item.folderIds.filter(id => id !== folderId);
      if (item.folderIds.length === 0) delete item.folderIds;
    }
    if (item.folderId === folderId) delete item.folderId;
  });

  inventoryState.folders[cat] = inventoryState.folders[cat].filter(f => f.id !== folderId);

  // If currently in this folder, go back
  if (inventoryState.currentFolderId === folderId) {
    inventoryState.currentFolderId = null;
  }

  saveFoldersToCache();
  saveItemsToCache();
  closeFolderModal();
  renderInventoryItems();

  if (typeof enqueueSync === "function") {
    enqueueSync({
      label: `Delete Folder: ${folder.name}`,
      fileKey: "inventory_folders",
      run: () => saveInventoryFoldersToGoogleDrive(inventoryState.folders),
    });
  }
}

function saveFoldersToCache() {
  if (typeof saveLocalCache === "function") {
    saveLocalCache("inventory", {
      items: inventoryState.items,
      folders: inventoryState.folders,
    });
  }
}

function saveItemsToCache() {
  if (typeof saveLocalCache === "function") {
    saveLocalCache("inventory", {
      items: inventoryState.items,
      folders: inventoryState.folders,
    });
  }
}

// Move to folder modal (multi-folder with checkboxes)
function openMoveToFolderModal(itemId) {
  const cat = inventoryState.currentCategory;
  const item = (inventoryState.items[cat] || []).find(it => it.id === itemId);
  if (!item) return;

  const folders = inventoryState.folders[cat] || [];
  const listEl = document.getElementById("moveFolderList");
  const currentIds = _getItemFolderIds(item);

  let html = folders.map(f => {
    const checked = currentIds.includes(f.id);
    const iconName = f.icon || "folder";
    const colorStyle = f.color ? `color:${f.color};` : "";
    return `<label class="move-folder-option${checked ? ' active' : ''}" data-folder-id="${f.id}">
      <input type="checkbox" value="${f.id}" ${checked ? "checked" : ""} style="display:none">
      <span class="material-symbols-rounded move-folder-check">${checked ? "check_box" : "check_box_outline_blank"}</span>
      <span class="material-symbols-rounded" style="${colorStyle}">${escapeHtml(iconName)}</span>
      <span>${escapeHtml(f.name)}</span>
    </label>`;
  }).join("");

  if (folders.length === 0) {
    html = `<div class="move-folder-empty" style="text-align:center;padding:1rem;opacity:0.6;">No folders yet. Create a folder first.</div>`;
  }

  listEl.innerHTML = html;

  // Toggle logic for checkboxes
  listEl.querySelectorAll(".move-folder-option").forEach(opt => {
    const cb = opt.querySelector("input[type=checkbox]");
    if (!cb) return;
    opt.addEventListener("click", (e) => {
      e.preventDefault();
      cb.checked = !cb.checked;
      opt.classList.toggle("active", cb.checked);
      opt.querySelector(".move-folder-check").textContent = cb.checked ? "check_box" : "check_box_outline_blank";

      // Collect all checked folder IDs
      const selectedIds = [];
      listEl.querySelectorAll("input[type=checkbox]:checked").forEach(c => selectedIds.push(c.value));

      // Update item
      if (selectedIds.length > 0) {
        item.folderIds = selectedIds;
      } else {
        delete item.folderIds;
      }
      // Clean up legacy folderId
      delete item.folderId;

      saveItemsToCache();

      // Sync to Drive
      const categoryName = cat.charAt(0).toUpperCase() + cat.slice(1);
      enqueueSync({
        label: `Update ${categoryName}: ${item.name}`,
        run: () => saveItemToGoogleDrive(categoryName, item),
      });

      renderInventoryItems();
    });
  });

  document.getElementById("moveToFolderModal").classList.remove("hidden");
  lockBodyScroll();
}

function closeMoveToFolderModal() {
  document.getElementById("moveToFolderModal").classList.add("hidden");
  unlockBodyScroll();
}

// Initialize folder system event listeners
function initFolderSystem() {
  // Add folder button
  const addFolderBtn = document.getElementById("addFolderBtn");
  if (addFolderBtn) {
    addFolderBtn.addEventListener("click", () => openFolderModal());
  }

  // Back button
  const folderBackBtn = document.getElementById("folderBackBtn");
  if (folderBackBtn) {
    folderBackBtn.addEventListener("click", navigateBackFromFolder);
  }

  // Folder modal buttons
  const folderModalCloseBtn = document.getElementById("folderModalCloseBtn");
  if (folderModalCloseBtn) folderModalCloseBtn.addEventListener("click", closeFolderModal);

  const folderModalCancelBtn = document.getElementById("folderModalCancelBtn");
  if (folderModalCancelBtn) folderModalCancelBtn.addEventListener("click", closeFolderModal);

  const folderModalSaveBtn = document.getElementById("folderModalSaveBtn");
  if (folderModalSaveBtn) folderModalSaveBtn.addEventListener("click", saveFolder);

  const folderModalDeleteBtn = document.getElementById("folderModalDeleteBtn");
  if (folderModalDeleteBtn) {
    folderModalDeleteBtn.addEventListener("click", () => {
      if (_editingFolderId) deleteFolder(_editingFolderId);
    });
  }

  // Color picker
  const colorPicker = document.getElementById("folderColorPicker");
  if (colorPicker) {
    colorPicker.addEventListener("click", (e) => {
      const swatch = e.target.closest(".folder-color-swatch");
      if (!swatch) return;
      colorPicker.querySelectorAll(".folder-color-swatch").forEach(s => s.classList.remove("active"));
      swatch.classList.add("active");
    });
  }

  // Icon suggestions
  const iconSuggestions = document.getElementById("folderIconSuggestions");
  if (iconSuggestions) {
    iconSuggestions.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-icon]");
      if (!btn) return;
      const icon = btn.dataset.icon;
      document.getElementById("folderIconInput").value = icon;
      document.getElementById("folderIconPreview").textContent = icon;
    });
  }

  // Icon input live preview
  const iconInput = document.getElementById("folderIconInput");
  if (iconInput) {
    iconInput.addEventListener("input", () => {
      const val = iconInput.value.trim();
      document.getElementById("folderIconPreview").textContent = val || "folder";
    });
  }

  // Move to folder modal close
  const moveToFolderCloseBtn = document.getElementById("moveToFolderCloseBtn");
  if (moveToFolderCloseBtn) moveToFolderCloseBtn.addEventListener("click", closeMoveToFolderModal);

  // Close modals on overlay click
  document.getElementById("folderModal")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeFolderModal();
  });
  document.getElementById("moveToFolderModal")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeMoveToFolderModal();
  });

  // Search input
  const searchInput = document.getElementById("inventorySearchInput");
  if (searchInput) {
    let searchTimer;
    searchInput.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        inventoryState.searchQuery = searchInput.value;
        renderInventoryItems();
      }, 200);
    });
  }
}

// =============================
// END FOLDER SYSTEM
// =============================

// Open add item modal
function openAddModal() {
  inventoryState.editingItemId = null;
  document.getElementById("modalTitle").textContent = "Add New Item";
  document.getElementById("itemName").value = "";
  document.getElementById("itemForm").reset();
  toggleCropFields(inventoryState.currentCategory === "crops");
  if (inventoryState.currentCategory === "crops") {
    updateCropTypeSuggestions();
    document.getElementById("cropType").value = "";
  }
  toggleLineFields(inventoryState.currentCategory === "entries");
  if (inventoryState.currentCategory === "entries") {
    updateLineCropOptions();
    // Make sure lineCropGroup is visible for normal "Add Entry" modal
    const lineCropGroup = document.getElementById("lineCropGroup");
    if (lineCropGroup) {
      lineCropGroup.classList.remove("hidden");
    }
    document.getElementById("lineCrop").value = "";
    _currentEntryType = "parental";
    document.getElementById("lineQuantity").value = "";
    document.getElementById("lineStage").value = "";
    document.getElementById("lineSeedOrigin").value = "";
    document.getElementById("lineArrivalDate").value = "";
    document.getElementById("lineRegisteredDate").value = "";
    document.getElementById("lineParentCode").value = "";
    document.getElementById("lineHybridCode").value = "";
    document.getElementById("lineSprCode").value = "";
    document.getElementById("lineRole").value = "";
    // Reset hybrid-only fields
    document.getElementById("lineHybridCodeHybrid").value = "";
    document.getElementById("lineFieldCode").value = "";
    document.getElementById("lineFemaleParent").value = "";
    document.getElementById("lineMaleParent").value = "";
    document.getElementById("lineFemaleSplit").value = "";
    document.getElementById("lineFirstMaleSplit").value = "";
    document.getElementById("lineSecondMaleSplit").value = "";
    handleLineTypeChange(_currentEntryType);
  }
  toggleLocationFields(inventoryState.currentCategory === "locations");
  if (inventoryState.currentCategory === "locations") {
    document.getElementById("locationCoord").value = "";
    initializeLocationMap();
  }
  toggleParameterFields(inventoryState.currentCategory === "parameters");
  if (inventoryState.currentCategory === "parameters") {
    document.getElementById("paramInitial").value = "";
    document.getElementById("paramType").value = "";
    document.getElementById("paramRangeMin").value = "";
    document.getElementById("paramRangeMax").value = "";
    document.getElementById("paramRadio").value = "";
    document.getElementById("paramCheckbox").value = "";
    document.getElementById("paramFormula").value = "";
    const formulaError = document.getElementById("paramFormulaError");
    if (formulaError) formulaError.classList.add("hidden");
    document.getElementById("paramUnit").value = "";
    document.getElementById("paramQuantity").value = "1";
    document.getElementById("paramPhoto").checked = false;
    
    // Reset photo mode
    const photoModeRadios = document.querySelectorAll('input[name="photoMode"]');
    if (photoModeRadios.length > 0) photoModeRadios[0].checked = true;
    
    // Hide photo mode group initially
    togglePhotoModeGroup();
    
    // Setup photo checkbox listener
    const photoCheckbox = document.getElementById("paramPhoto");
    if (photoCheckbox) {
      photoCheckbox.removeEventListener("change", togglePhotoModeGroup);
      photoCheckbox.addEventListener("change", togglePhotoModeGroup);
    }
    
    // Setup type change listener
    const typeSelect = document.getElementById("paramType");
    if (typeSelect) {
      typeSelect.removeEventListener("change", handleParameterTypeChange);
      typeSelect.addEventListener("change", handleParameterTypeChange);
    }

    const formulaInput = document.getElementById("paramFormula");
    if (formulaInput) {
      formulaInput.oninput = () => {
        const errorEl = document.getElementById("paramFormulaError");
        if (errorEl) errorEl.classList.add("hidden");
      };
    }
    populateFormulaParameterList();
    initFormulaPanel();
    
    // Populate DoO inputs
    populateParamDoo();
  }
  toggleAgronomyFields(inventoryState.currentCategory === "agronomy");
  if (inventoryState.currentCategory === "agronomy") {
    document.getElementById("agronomyActivity").value = "";
    document.getElementById("agronomyDapMin").value = "";
    document.getElementById("agronomyDapMax").value = "";
    document.getElementById("agronomyChemical").value = "";
    document.getElementById("agronomyDose").value = "";
    document.getElementById("agronomyRemark").value = "";
    populateAgronomyCropCheckboxes();
  }
  document.getElementById("itemModal").classList.add("active");
  lockBodyScroll();
  document.getElementById("itemName").focus();
}

// Show crop lines popup (library-preview-modal style)
function showCropLinesPopup(cropId) {
  const crop = inventoryState.items.crops.find((c) => c.id === cropId);
  if (!crop) return;

  const relatedLines = inventoryState.items.entries.filter((line) => {
    return line.cropId === crop.id || line.crop === crop.id;
  });

  const entryTypeLabel = crop.entryType === "hybrid" ? "Hybrid" : "Parental";
  const entryCount = relatedLines.length;

  // Remove existing popup if any
  const existing = document.getElementById("cropLinesPopup");
  if (existing) existing.remove();

  const popup = document.createElement("div");
  popup.id = "cropLinesPopup";
  popup.className = "library-preview-modal active crop-lines-popup";
  popup.innerHTML = `
    <div class="library-preview-modal-content crop-lines-popup-content">
      <div class="library-detail-header">
        <div class="library-detail-info">
          <h3>${escapeHtml(crop.name)} — ${entryTypeLabel} Entries</h3>
          <p class="library-detail-meta">${crop.cropType ? escapeHtml(crop.cropType) + ' · ' : ''}${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}</p>
        </div>
        <div class="library-detail-actions">
          <button class="btn btn-secondary btn-sm" id="cropLinesExportBtn" title="Export to Excel">
            <span class="material-symbols-rounded">download</span>
            <span>Export</span>
          </button>
          <button class="btn btn-secondary btn-sm" id="cropLinesImportBtn" title="Import from Excel/CSV">
            <span class="material-symbols-rounded">upload</span>
            <span>Import</span>
          </button>
          <button class="btn btn-primary" id="cropLinesAddBtn">
            <span class="material-symbols-rounded">add</span>
            <span>Add</span>
          </button>
          <button class="btn btn-secondary" id="cropLinesCloseBtn">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>
      </div>
      <div class="library-preview crop-lines-preview">
        ${relatedLines.length === 0
          ? `<div class="crop-lines-empty">
              <span class="material-symbols-rounded">psychiatry</span>
              <p>No ${entryTypeLabel.toLowerCase()} entries yet for this crop.</p>
            </div>`
          : `<div class="crop-lines-list">
              ${relatedLines.map((line) => {
                const itemType = line.lineType || crop.entryType || "parental";
                const metaParts = [];
                if (line.stage) metaParts.push('Stage: ' + escapeHtml(line.stage));
                if (line.quantity != null && line.quantity !== '') metaParts.push('Qty: ' + line.quantity);
                if (line.seedOrigin) metaParts.push('Seed: ' + escapeHtml(line.seedOrigin));
                if (itemType === "parental") {
                  if (line.role) metaParts.push('Role: ' + escapeHtml(line.role));
                  if (line.sprCode) metaParts.push('SPR: ' + escapeHtml(line.sprCode));
                  if (line.parentCode) metaParts.push('Parent: ' + escapeHtml(line.parentCode));
                  if (line.hybridCode) metaParts.push('Hybrid Code: ' + escapeHtml(line.hybridCode));
                  if (line.arrivalDate) metaParts.push('Arrival: ' + escapeHtml(line.arrivalDate));
                  if (line.registeredDate) metaParts.push('Reg: ' + escapeHtml(line.registeredDate));
                } else {
                  if (line.hybridCode) metaParts.push('Hybrid Code: ' + escapeHtml(line.hybridCode));
                  if (line.fieldCode) metaParts.push('Field: ' + escapeHtml(line.fieldCode));
                  if (line.femaleParent) metaParts.push('♀: ' + escapeHtml(line.femaleParent));
                  if (line.maleParent) metaParts.push('♂: ' + escapeHtml(line.maleParent));
                  if (line.registeredDate) metaParts.push('Reg: ' + escapeHtml(line.registeredDate));
                  const splits = [];
                  if (line.femaleSplit) splits.push('F:' + line.femaleSplit);
                  if (line.firstMaleSplit) splits.push('1M:' + line.firstMaleSplit);
                  if (line.secondMaleSplit) splits.push('2M:' + line.secondMaleSplit);
                  if (splits.length > 0) metaParts.push('Split: ' + splits.join('/'));
                }
                const metaLine1 = metaParts.slice(0, 4).join(' · ');
                const metaLine2 = metaParts.slice(4).join(' · ');
                return `
                <div class="inventory-item">
                  <div class="item-meta">
                    <div class="item-name crop-line-name">${escapeHtml(line.name)}</div>
                    ${metaLine1 ? `<div class="item-subtext">${metaLine1}</div>` : `<div class="item-subtext">No details</div>`}
                    ${metaLine2 ? `<div class="item-subtext">${metaLine2}</div>` : ''}
                  </div>
                  <div class="item-actions">
                    <button class="popup-line-edit-btn" data-id="${line.id}" title="Edit">
                      <span class="material-symbols-rounded">edit</span>
                    </button>
                    <button class="popup-line-delete-btn" data-id="${line.id}" title="Delete">
                      <span class="material-symbols-rounded">delete</span>
                    </button>
                  </div>
                </div>`;
              }).join("")}
            </div>`
        }
      </div>
    </div>
  `;

  document.body.appendChild(popup);
  lockBodyScroll();

  // Close button
  popup.querySelector("#cropLinesCloseBtn").addEventListener("click", () => {
    popup.remove();
    unlockBodyScroll();
  });

  // Click backdrop to close
  popup.addEventListener("click", (e) => {
    if (e.target === popup) { popup.remove(); unlockBodyScroll(); }
  });

  // Add line button
  popup.querySelector("#cropLinesAddBtn").addEventListener("click", () => {
    popup.remove();
    unlockBodyScroll();
    openAddLineForCropModal(crop);
  });

  // Export lines button
  popup.querySelector("#cropLinesExportBtn").addEventListener("click", () => {
    exportCropLines(crop.id);
  });

  // Import lines button
  popup.querySelector("#cropLinesImportBtn").addEventListener("click", () => {
    popup.remove();
    unlockBodyScroll();
    importCropLines(crop.id);
  });

  // Edit line buttons
  popup.querySelectorAll(".popup-line-edit-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const lineId = btn.dataset.id;
      popup.remove();
      inventoryState.currentCategory = "entries";
      openEditModal(lineId);
    });
  });

  // Delete line buttons
  popup.querySelectorAll(".popup-line-delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const lineId = btn.dataset.id;
      const line = inventoryState.items.entries.find(l => l.id === lineId);
      const lineName = line ? line.name : lineId;
      showConfirmModal(
        "Delete Entry",
        `Are you sure you want to delete "${escapeHtml(lineName)}"? This action cannot be undone.`,
        async () => {
          try {
            const idx = inventoryState.items.entries.findIndex(l => l.id === lineId);
            if (idx >= 0) {
              inventoryState.items.entries.splice(idx, 1);
            }
            enqueueSync({
              label: `Delete Entry: ${lineName} from Crops: ${escapeHtml(crop.name)}`,
              run: () => deleteItemFromGoogleDrive("Entries", lineId),
            });
            updateDashboardCounts();
            renderInventoryItems();
            if (typeof saveLocalCache === "function") {
              saveLocalCache("inventory", { items: inventoryState.items, folders: inventoryState.folders });
            }
            showToast("Entry deleted", "success");
            // Re-open the crop lines popup to reflect changes
            popup.remove();
            unlockBodyScroll();
            showCropLinesPopup(crop.id);
          } catch (error) {
            console.error("Error deleting entry:", error);
            showToast("Error deleting entry. Please try again.", "error");
          }
        }
      );
    });
  });
}

// Open add line for crop modal
function openAddLineForCropModal(crop) {
  inventoryState.editingItemId = null;
  inventoryState.currentCategory = "entries"; // Set category to entries for saving

  document.getElementById("modalTitle").textContent =
    `Add to ${escapeHtml(crop.name)}`;
  document.getElementById("itemName").value = "";

  // Hide crops fields, show entries fields
  toggleCropFields(false);
  toggleLineFields(true);

  // Make sure line crop options are loaded
  updateLineCropOptions();

  // Hide the crop select field since we already know the crop
  const lineCropGroup = document.getElementById("lineCropGroup");
  if (lineCropGroup) {
    lineCropGroup.classList.add("hidden");
  }

  // Pre-fill the crop - do this AFTER updateLineCropOptions
  const lineCropSelect = document.getElementById("lineCrop");
  if (lineCropSelect) {
    lineCropSelect.value = crop.id;
  }

  // Set entry type from crop's entryType
  _currentEntryType = crop.entryType || "parental";
  handleLineTypeChange(_currentEntryType);

  // Reset shared line fields
  document.getElementById("lineQuantity").value = "";
  document.getElementById("lineStage").value = "";
  document.getElementById("lineSeedOrigin").value = "";
  document.getElementById("lineRegisteredDate").value = "";

  // Reset parental-only fields
  document.getElementById("lineArrivalDate").value = "";
  document.getElementById("lineParentCode").value = "";
  document.getElementById("lineHybridCode").value = "";
  document.getElementById("lineSprCode").value = "";
  document.getElementById("lineRole").value = "";

  // Reset hybrid-only fields
  document.getElementById("lineHybridCodeHybrid").value = "";
  document.getElementById("lineFieldCode").value = "";
  document.getElementById("lineFemaleParent").value = "";
  document.getElementById("lineMaleParent").value = "";
  document.getElementById("lineFemaleSplit").value = "";
  document.getElementById("lineFirstMaleSplit").value = "";
  document.getElementById("lineSecondMaleSplit").value = "";

  document.getElementById("itemModal").classList.add("active");
  document.getElementById("itemName").focus();
}

// Open edit item modal
function openEditModal(itemId) {
  inventoryState.editingItemId = itemId;
  const item = inventoryState.items[inventoryState.currentCategory].find(
    (i) => i.id === itemId,
  );

  if (!item) return;

  document.getElementById("modalTitle").textContent = "Edit Item";
  document.getElementById("itemName").value = item.name;
  toggleCropFields(inventoryState.currentCategory === "crops");
  if (inventoryState.currentCategory === "crops") {
    updateCropTypeSuggestions();
    document.getElementById("cropType").value = item.cropType || "";
    const cropEntryTypeSelect = document.getElementById("cropEntryType");
    if (cropEntryTypeSelect) {
      cropEntryTypeSelect.value = item.entryType || "";
    }
  }
  toggleLineFields(inventoryState.currentCategory === "entries");
  if (inventoryState.currentCategory === "entries") {
    updateLineCropOptions();
    document.getElementById("lineCrop").value = item.cropId || item.crop || "";
    // Derive entry type from parent crop
    const parentCrop = inventoryState.items.crops.find(c => c.id === (item.cropId || item.crop));
    _currentEntryType = parentCrop?.entryType || item.lineType || "parental";
    document.getElementById("lineQuantity").value = item.quantity ?? "";
    document.getElementById("lineStage").value = item.stage || "";
    document.getElementById("lineSeedOrigin").value = item.seedOrigin || "";
    document.getElementById("lineRegisteredDate").value =
      item.registeredDate || "";
    // Parental-only fields
    document.getElementById("lineArrivalDate").value = item.arrivalDate || "";
    document.getElementById("lineParentCode").value = item.parentCode || "";
    document.getElementById("lineHybridCode").value = item.hybridCode || "";
    document.getElementById("lineSprCode").value = item.sprCode || "";
    document.getElementById("lineRole").value = item.role || "";
    // Hybrid-only fields
    document.getElementById("lineHybridCodeHybrid").value = item.hybridCode || "";
    document.getElementById("lineFieldCode").value = item.fieldCode || "";
    document.getElementById("lineFemaleParent").value = item.femaleParent || "";
    document.getElementById("lineMaleParent").value = item.maleParent || "";
    document.getElementById("lineFemaleSplit").value = item.femaleSplit ?? "";
    document.getElementById("lineFirstMaleSplit").value = item.firstMaleSplit ?? "";
    document.getElementById("lineSecondMaleSplit").value = item.secondMaleSplit ?? "";
    handleLineTypeChange(_currentEntryType);
  }
  toggleLocationFields(inventoryState.currentCategory === "locations");
  if (inventoryState.currentCategory === "locations") {
    document.getElementById("locationCoord").value = item.coordinates || "";
    initializeLocationMap(item.coordinates);
  }
  toggleParameterFields(inventoryState.currentCategory === "parameters");
  if (inventoryState.currentCategory === "parameters") {
    document.getElementById("paramInitial").value = item.initial || "";
    document.getElementById("paramType").value = item.type || "";
    
    // Handle new range fields with backward compatibility
    if (item.rangeMin !== undefined && item.rangeMax !== undefined) {
      document.getElementById("paramRangeMin").value = item.rangeMin;
      document.getElementById("paramRangeMax").value = item.rangeMax;
    } else if (item.rangeDefinition) {
      // Parse legacy format "min-max"
      const parts = item.rangeDefinition.split("-");
      if (parts.length === 2) {
        document.getElementById("paramRangeMin").value = parts[0].trim();
        document.getElementById("paramRangeMax").value = parts[1].trim();
      }
    }
    
    document.getElementById("paramRadio").value = item.radioOptions || "";
    document.getElementById("paramCheckbox").value = item.checkboxOptions || "";
    document.getElementById("paramFormula").value = item.formula || "";
    document.getElementById("paramUnit").value = item.unit || "";
    document.getElementById("paramQuantity").value = item.numberOfSamples ?? item.quantity ?? 1;
    document.getElementById("paramPhoto").checked = item.requirePhoto || false;
    
    // Set photo mode radio buttons
    const photoMode = item.photoMode || 'per-sample';
    const photoModeRadio = document.querySelector(`input[name="photoMode"][value="${photoMode}"]`);
    if (photoModeRadio) photoModeRadio.checked = true;
    
    // Show/hide photo mode based on requirePhoto
    togglePhotoModeGroup();

    // Setup type change listener
    const typeSelect = document.getElementById("paramType");
    if (typeSelect) {
      typeSelect.removeEventListener("change", handleParameterTypeChange);
      typeSelect.addEventListener("change", handleParameterTypeChange);
      handleParameterTypeChange(); // Trigger to show correct conditional field
    }

    const formulaInput = document.getElementById("paramFormula");
    if (formulaInput) {
      formulaInput.oninput = () => {
        const errorEl = document.getElementById("paramFormulaError");
        if (errorEl) errorEl.classList.add("hidden");
      };
    }
    populateFormulaParameterList();
    initFormulaPanel();
    
    // Setup photo checkbox listener
    const photoCheckbox = document.getElementById("paramPhoto");
    if (photoCheckbox) {
      photoCheckbox.removeEventListener("change", togglePhotoModeGroup);
      photoCheckbox.addEventListener("change", togglePhotoModeGroup);
    }
    
    // Populate DoO inputs with existing data
    populateParamDoo(item.daysOfObservation || {});
  }
  toggleAgronomyFields(inventoryState.currentCategory === "agronomy");
  if (inventoryState.currentCategory === "agronomy") {
    document.getElementById("agronomyActivity").value = item.activity || "";
    document.getElementById("agronomyDapMin").value = item.dapMin ?? "";
    document.getElementById("agronomyDapMax").value = item.dapMax ?? "";
    document.getElementById("agronomyChemical").value = item.chemical || "";
    document.getElementById("agronomyDose").value = item.dose || "";
    document.getElementById("agronomyRemark").value = item.remark || "";
    populateAgronomyCropCheckboxes(item.cropIds || []);
  }
  document.getElementById("itemModal").classList.add("active");
  lockBodyScroll();
  document.getElementById("itemName").focus();
}

// Close modal
function closeModal() {
  const modal = document.getElementById("itemModal");
  document.getElementById("itemModal").classList.remove("active");
  unlockBodyScroll();
  inventoryState.editingItemId = null;
  // If we were editing/adding entries, switch back to crops view
  if (inventoryState.currentCategory === "entries") {
    inventoryState.currentCategory = "crops";
    renderInventoryItems();
  }
  document.getElementById("itemForm").reset();
  const cropTypeInput = document.getElementById("cropType");
  if (cropTypeInput) {
    cropTypeInput.value = "";
  }
  const cropEntryTypeInput = document.getElementById("cropEntryType");
  if (cropEntryTypeInput) {
    cropEntryTypeInput.value = "";
  }
  const lineFields = [
    "lineCrop",
    "lineQuantity",
    "lineStage",
    "lineSeedOrigin",
    "lineArrivalDate",
    "lineRegisteredDate",
    "lineParentCode",
    "lineHybridCode",
    "lineSprCode",
    "lineRole",
    "lineHybridCodeHybrid",
    "lineFieldCode",
    "lineFemaleParent",
    "lineMaleParent",
    "lineFemaleSplit",
    "lineFirstMaleSplit",
    "lineSecondMaleSplit",
  ];
  lineFields.forEach((id) => {
    const field = document.getElementById(id);
    if (field) field.value = "";
  });
  const locationFields = ["locationCoord"];
  locationFields.forEach((id) => {
    const field = document.getElementById(id);
    if (field) field.value = "";
  });
  const paramFields = [
    "paramInitial",
    "paramType",
    "paramRangeMin",
    "paramRangeMax",
    "paramRadio",
    "paramCheckbox",
    "paramFormula",
    "paramUnit",
    "paramQuantity",
  ];
  paramFields.forEach((id) => {
    const field = document.getElementById(id);
    if (field) field.value = "";
  });
  const paramPhoto = document.getElementById("paramPhoto");
  if (paramPhoto) paramPhoto.checked = false;
  const formulaError = document.getElementById("paramFormulaError");
  if (formulaError) formulaError.classList.add("hidden");
  const formulaPanelError = document.getElementById("formulaPanelError");
  if (formulaPanelError) formulaPanelError.classList.add("hidden");
  const formulaEditor = document.getElementById("formulaEditorDisplay");
  if (formulaEditor) formulaEditor.innerHTML = '';
  const formulaPanel = document.getElementById("modalFormulaPanel");
  if (formulaPanel) formulaPanel.classList.add("hidden");
  if (modal) modal.classList.remove("has-formula-panel");

  // Reset DoO panel
  _dooTempData = {};
  const dooPanel = document.getElementById('modalDooPanel');
  if (dooPanel) dooPanel.classList.add('hidden');
  if (modal) modal.classList.remove('has-doo-panel');
  const dooCropSelect = document.getElementById('dooCropSelect');
  if (dooCropSelect) dooCropSelect.innerHTML = '';
  const dooMin = document.getElementById('dooRangeMin');
  const dooMax = document.getElementById('dooRangeMax');
  if (dooMin) dooMin.value = '';
  if (dooMax) dooMax.value = '';
  const dooSummary = document.getElementById('dooSummary');
  if (dooSummary) dooSummary.innerHTML = '';

  // Reset photo mode
  const photoModeRadios = document.querySelectorAll('input[name="photoMode"]');
  if (photoModeRadios.length > 0) photoModeRadios[0].checked = true;
  
  // Reset agronomy fields
  const agronomyFields = [
    "agronomyActivity",
    "agronomyDapMin",
    "agronomyDapMax",
    "agronomyChemical",
    "agronomyDose",
    "agronomyRemark",
  ];
  agronomyFields.forEach((id) => {
    const field = document.getElementById(id);
    if (field) field.value = "";
  });

  // Reset agronomy crops panel
  _agroCropSelected = [];
  const agroCropsPanel = document.getElementById('modalAgroCropsPanel');
  if (agroCropsPanel) agroCropsPanel.classList.add('hidden');
  if (modal) modal.classList.remove('has-agro-crops-panel');
  const agroCropSearch = document.getElementById('agroCropSearch');
  if (agroCropSearch) agroCropSearch.value = '';
  const agroCropAvailable = document.getElementById('agroCropAvailable');
  if (agroCropAvailable) agroCropAvailable.innerHTML = '';
  const agroCropSel = document.getElementById('agroCropSelected');
  if (agroCropSel) agroCropSel.innerHTML = '';
  const agroCropSummary = document.getElementById('agroCropSummary');
  if (agroCropSummary) agroCropSummary.textContent = '';
  
  destroyLocationMap();
}

// Save item
async function saveItem() {
  let name = document.getElementById("itemName").value.trim();
  const isCrops = inventoryState.currentCategory === "crops";
  const isEntries = inventoryState.currentCategory === "entries";
  const isLocations = inventoryState.currentCategory === "locations";
  const isParameters = inventoryState.currentCategory === "parameters";
  const isAgronomy = inventoryState.currentCategory === "agronomy";

  // For agronomy, activity IS the item name
  if (isAgronomy) {
    const activityVal = document.getElementById("agronomyActivity")?.value.trim() || "";
    name = activityVal;
  }

  const cropTypeInput = document.getElementById("cropType");
  const cropType = isCrops && cropTypeInput ? cropTypeInput.value.trim() : "";
  const cropEntryTypeInput = document.getElementById("cropEntryType");
  const cropEntryType = isCrops && cropEntryTypeInput ? cropEntryTypeInput.value.trim() : "";

  const lineCrop = isEntries
    ? document.getElementById("lineCrop")?.value.trim()
    : "";
  // Derive lineType from parent crop's entryType
  let lineType = "parental";
  if (isEntries) {
    const parentCrop = inventoryState.items.crops.find(c => c.id === lineCrop);
    lineType = parentCrop?.entryType || _currentEntryType || "parental";
  }
  const lineQuantity = isEntries
    ? document.getElementById("lineQuantity")?.value.trim()
    : "";
  const lineStage = isEntries
    ? document.getElementById("lineStage")?.value.trim()
    : "";
  const lineSeedOrigin = isEntries
    ? document.getElementById("lineSeedOrigin")?.value.trim()
    : "";
  const lineRegisteredDate = isEntries
    ? document.getElementById("lineRegisteredDate")?.value
    : "";
  // Parental-only fields
  const lineArrivalDate = isEntries && lineType === "parental"
    ? document.getElementById("lineArrivalDate")?.value
    : "";
  const lineParentCode = isEntries && lineType === "parental"
    ? document.getElementById("lineParentCode")?.value.trim()
    : "";
  const lineHybridCode = isEntries && lineType === "parental"
    ? document.getElementById("lineHybridCode")?.value.trim()
    : "";
  const lineSprCode = isEntries && lineType === "parental"
    ? document.getElementById("lineSprCode")?.value.trim()
    : "";
  const lineRole = isEntries && lineType === "parental"
    ? document.getElementById("lineRole")?.value.trim()
    : "";
  // Hybrid-only fields
  const lineHybridCodeHybrid = isEntries && lineType === "hybrid"
    ? document.getElementById("lineHybridCodeHybrid")?.value.trim()
    : "";
  const lineFieldCode = isEntries && lineType === "hybrid"
    ? document.getElementById("lineFieldCode")?.value.trim()
    : "";
  const lineFemaleParent = isEntries && lineType === "hybrid"
    ? document.getElementById("lineFemaleParent")?.value.trim()
    : "";
  const lineMaleParent = isEntries && lineType === "hybrid"
    ? document.getElementById("lineMaleParent")?.value.trim()
    : "";
  const lineFemaleSplit = isEntries && lineType === "hybrid"
    ? document.getElementById("lineFemaleSplit")?.value.trim()
    : "";
  const lineFirstMaleSplit = isEntries && lineType === "hybrid"
    ? document.getElementById("lineFirstMaleSplit")?.value.trim()
    : "";
  const lineSecondMaleSplit = isEntries && lineType === "hybrid"
    ? document.getElementById("lineSecondMaleSplit")?.value.trim()
    : "";

  const locationCoord = isLocations
    ? document.getElementById("locationCoord")?.value.trim()
    : "";

  const paramInitial = isParameters
    ? document.getElementById("paramInitial")?.value.trim()
    : "";
  const paramType = isParameters
    ? document.getElementById("paramType")?.value.trim()
    : "";
  const paramRangeMin = isParameters
    ? document.getElementById("paramRangeMin")?.value.trim()
    : "";
  const paramRangeMax = isParameters
    ? document.getElementById("paramRangeMax")?.value.trim()
    : "";
  const paramRadio = isParameters
    ? document.getElementById("paramRadio")?.value.trim()
    : "";
  const paramCheckbox = isParameters
    ? document.getElementById("paramCheckbox")?.value.trim()
    : "";
  const paramFormula = isParameters
    ? document.getElementById("paramFormula")?.value.trim()
    : "";
  const paramUnit = isParameters
    ? document.getElementById("paramUnit")?.value.trim()
    : "";
  const paramQuantity = isParameters
    ? document.getElementById("paramQuantity")?.value.trim()
    : "";
  const paramPhoto = isParameters
    ? document.getElementById("paramPhoto")?.checked
    : false;
  const paramPhotoMode = isParameters && paramPhoto
    ? document.querySelector('input[name="photoMode"]:checked')?.value || 'per-sample'
    : undefined;
  const paramDoo = isParameters ? collectParamDoo() : {};

  // Agronomy fields
  const agronomyCropIds = isAgronomy
    ? getAgroCropSelectedIds()
    : [];
  const agronomyActivity = isAgronomy
    ? document.getElementById("agronomyActivity")?.value.trim()
    : "";
  const agronomyDapMin = isAgronomy
    ? document.getElementById("agronomyDapMin")?.value.trim()
    : "";
  const agronomyDapMax = isAgronomy
    ? document.getElementById("agronomyDapMax")?.value.trim()
    : "";
  const agronomyChemical = isAgronomy
    ? document.getElementById("agronomyChemical")?.value.trim()
    : "";
  const agronomyDose = isAgronomy
    ? document.getElementById("agronomyDose")?.value.trim()
    : "";
  const agronomyRemark = isAgronomy
    ? document.getElementById("agronomyRemark")?.value.trim()
    : "";

  if (!name) {
    showToast("Please enter an item name", "error");
    return;
  }

  if (isCrops && !cropType) {
    showToast("Please enter a crop type", "error");
    return;
  }

  if (isCrops && !cropEntryType) {
    showToast("Please select an entry type (Parental or Hybrid)", "error");
    return;
  }

  if (isEntries) {
    if (!lineCrop) {
      showToast("Please select a crop", "error");
      return;
    }
    if (!lineQuantity) {
      showToast("Please enter quantity", "error");
      return;
    }
    if (!lineStage) {
      showToast("Please select a stage", "error");
      return;
    }
    if (lineType === "parental" && !lineRole) {
      showToast("Please select a role", "error");
      return;
    }
  }

  if (isLocations) {
    if (!locationCoord) {
      showToast("Please select a location on the map", "error");
      return;
    }
  }

  if (isParameters) {
    if (!paramInitial) {
      showToast("Please enter parameter initial", "error");
      return;
    }
    if (!paramType) {
      showToast("Please select a type", "error");
      return;
    }
    if (paramType === "range" && (!paramRangeMin || !paramRangeMax)) {
      showToast("Please enter both minimum and maximum values for range", "error");
      return;
    }
    if (paramType === "range" && Number(paramRangeMin) >= Number(paramRangeMax)) {
      showToast("Minimum value must be less than maximum value", "error");
      return;
    }
    if (paramType === "radio" && !paramRadio) {
      showToast("Please enter radio options", "error");
      return;
    }
    if (paramType === "checkbox" && !paramCheckbox) {
      showToast("Please enter checkbox options", "error");
      return;
    }
    if (paramType === "formula") {
      const result = validateFormulaExpression(paramFormula);
      if (!result.ok) {
        const errorEl = document.getElementById("paramFormulaError");
        if (errorEl) {
          errorEl.textContent = result.message;
          errorEl.classList.remove("hidden");
        }
        const panelErr = document.getElementById("formulaPanelError");
        if (panelErr) {
          panelErr.textContent = result.message;
          panelErr.classList.remove("hidden");
        }
        showToast(result.message, "error");
        return;
      }
    }
  }

  if (isAgronomy) {
    if (agronomyCropIds.length === 0) {
      showToast("Please select at least one crop", "error");
      return;
    }
    if (!agronomyActivity) {
      showToast("Please enter an activity", "error");
      return;
    }
  }

  try {
    const category = inventoryState.currentCategory;
    let item;

    if (inventoryState.editingItemId) {
      // Update existing item
      item = inventoryState.items[category].find(
        (i) => i.id === inventoryState.editingItemId,
      );
      if (item) {
        item.name = name;
        if (isCrops) {
          item.cropType = cropType;
          item.entryType = cropEntryType;
        }
        if (isEntries) {
          item.crop = lineCrop;
          item.cropId = lineCrop;
          item.lineType = lineType;
          item.quantity = Number(lineQuantity);
          item.stage = lineStage;
          item.seedOrigin = lineSeedOrigin;
          item.registeredDate = lineRegisteredDate;
          if (lineType === "parental") {
            item.arrivalDate = lineArrivalDate;
            item.parentCode = lineParentCode;
            item.hybridCode = lineHybridCode;
            item.sprCode = lineSprCode;
            item.role = lineRole;
            // Clear hybrid fields
            delete item.fieldCode;
            delete item.femaleParent;
            delete item.maleParent;
            delete item.femaleSplit;
            delete item.firstMaleSplit;
            delete item.secondMaleSplit;
          } else {
            item.hybridCode = lineHybridCodeHybrid;
            item.fieldCode = lineFieldCode;
            item.femaleParent = lineFemaleParent;
            item.maleParent = lineMaleParent;
            item.femaleSplit = lineFemaleSplit ? Number(lineFemaleSplit) : undefined;
            item.firstMaleSplit = lineFirstMaleSplit ? Number(lineFirstMaleSplit) : undefined;
            item.secondMaleSplit = lineSecondMaleSplit ? Number(lineSecondMaleSplit) : undefined;
            // Clear parental fields
            delete item.arrivalDate;
            delete item.parentCode;
            delete item.sprCode;
            delete item.role;
          }
        }
        if (isLocations) {
          item.coordinates = locationCoord;
        }
        if (isParameters) {
          item.initial = paramInitial;
          item.type = paramType;
          item.rangeMin = paramType === "range" ? Number(paramRangeMin) : undefined;
          item.rangeMax = paramType === "range" ? Number(paramRangeMax) : undefined;
          // Keep legacy rangeDefinition for backward compatibility
          item.rangeDefinition = paramType === "range" ? `${paramRangeMin}-${paramRangeMax}` : undefined;
          item.radioOptions = paramType === "radio" ? paramRadio : undefined;
          item.checkboxOptions =
            paramType === "checkbox" ? paramCheckbox : undefined;
          item.formula = paramType === "formula" ? paramFormula : undefined;
          item.unit = paramUnit;
          item.numberOfSamples = paramType === "formula" ? 1 : (paramQuantity ? Number(paramQuantity) : 1);
          item.requirePhoto = paramType === "formula" ? false : paramPhoto;
          item.photoMode = paramType === "formula" ? undefined : paramPhotoMode;
          item.daysOfObservation = paramDoo;
        }
        if (isAgronomy) {
          item.cropIds = agronomyCropIds;
          item.activity = agronomyActivity;
          item.dapMin = agronomyDapMin ? Number(agronomyDapMin) : null;
          item.dapMax = agronomyDapMax ? Number(agronomyDapMax) : null;
          item.chemical = agronomyChemical;
          item.dose = agronomyDose;
          item.remark = agronomyRemark;
        }
        item.updatedAt = new Date().toISOString();
      }
    } else {
      // Create new item
      item = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: name,
        cropType: isCrops ? cropType : undefined,
        entryType: isCrops ? cropEntryType : undefined,
        cropId: isEntries ? lineCrop : undefined,
        crop: isEntries ? lineCrop : undefined,
        lineType: isEntries ? lineType : undefined,
        quantity: isEntries
          ? Number(lineQuantity)
          : isParameters && paramQuantity
            ? Number(paramQuantity)
            : undefined,
        stage: isEntries ? lineStage : undefined,
        seedOrigin: isEntries ? lineSeedOrigin : undefined,
        registeredDate: isEntries ? lineRegisteredDate : undefined,
        // Parental-only fields
        arrivalDate: isEntries && lineType === "parental" ? lineArrivalDate : undefined,
        parentCode: isEntries && lineType === "parental" ? lineParentCode : undefined,
        hybridCode: isEntries
          ? (lineType === "parental" ? lineHybridCode : lineHybridCodeHybrid)
          : undefined,
        sprCode: isEntries && lineType === "parental" ? lineSprCode : undefined,
        role: isEntries && lineType === "parental" ? lineRole : undefined,
        // Hybrid-only fields
        fieldCode: isEntries && lineType === "hybrid" ? lineFieldCode : undefined,
        femaleParent: isEntries && lineType === "hybrid" ? lineFemaleParent : undefined,
        maleParent: isEntries && lineType === "hybrid" ? lineMaleParent : undefined,
        femaleSplit: isEntries && lineType === "hybrid" && lineFemaleSplit ? Number(lineFemaleSplit) : undefined,
        firstMaleSplit: isEntries && lineType === "hybrid" && lineFirstMaleSplit ? Number(lineFirstMaleSplit) : undefined,
        secondMaleSplit: isEntries && lineType === "hybrid" && lineSecondMaleSplit ? Number(lineSecondMaleSplit) : undefined,
        coordinates: isLocations ? locationCoord : undefined,
        initial: isParameters ? paramInitial : undefined,
        type: isParameters ? paramType : undefined,
        rangeMin:
          isParameters && paramType === "range" ? Number(paramRangeMin) : undefined,
        rangeMax:
          isParameters && paramType === "range" ? Number(paramRangeMax) : undefined,
        rangeDefinition:
          isParameters && paramType === "range" ? `${paramRangeMin}-${paramRangeMax}` : undefined,
        radioOptions:
          isParameters && paramType === "radio" ? paramRadio : undefined,
        checkboxOptions:
          isParameters && paramType === "checkbox" ? paramCheckbox : undefined,
        formula:
          isParameters && paramType === "formula" ? paramFormula : undefined,
        unit: isParameters ? paramUnit : undefined,
        numberOfSamples: isParameters ? (paramType === "formula" ? 1 : (paramQuantity ? Number(paramQuantity) : 1)) : 1,
        requirePhoto: isParameters ? (paramType === "formula" ? false : paramPhoto) : undefined,
        photoMode: isParameters ? (paramType === "formula" ? undefined : paramPhotoMode) : undefined,
        daysOfObservation: isParameters ? paramDoo : undefined,
        cropIds: isAgronomy ? agronomyCropIds : undefined,
        activity: isAgronomy ? agronomyActivity : undefined,
        dapMin: isAgronomy && agronomyDapMin ? Number(agronomyDapMin) : undefined,
        dapMax: isAgronomy && agronomyDapMax ? Number(agronomyDapMax) : undefined,
        chemical: isAgronomy ? agronomyChemical : undefined,
        dose: isAgronomy ? agronomyDose : undefined,
        remark: isAgronomy ? agronomyRemark : undefined,
        folderIds: inventoryState.currentFolderId ? [inventoryState.currentFolderId] : undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      inventoryState.items[category].push(item);
    }

    if (!item) {
      throw new Error("Failed to create/update item object");
    }

    // Save to Google Drive
    const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
    console.log(`Queueing save - Category: ${categoryName}, Item:`, item);
    enqueueSync({
      label: `Save ${categoryName}: ${item.name}`,
      run: () => saveItemToGoogleDrive(categoryName, item),
    });

    // Update dashboard
    updateDashboardCounts();

    if (isCrops) {
      updateCropTypeSuggestions();
    }
    if (isEntries) {
      updateLineCropOptions();
      // Switch back to crops view after adding an entry
      inventoryState.currentCategory = "crops";
    }

    // Render items
    renderInventoryItems();

    if (typeof saveLocalCache === "function") {
      saveLocalCache("inventory", { items: inventoryState.items, folders: inventoryState.folders });
    }

    // Close modal
    closeModal();

    // Show success message
    showSuccessMessage("Item saved locally. Syncing in background.");
  } catch (error) {
    console.error("Error saving item:", error);
    showErrorMessage(`Error saving item: ${error.message}`);
  }
}

// Delete item
function deleteItem(itemId) {
  showConfirmModal(
    "Delete Item",
    "Are you sure you want to delete this item? This action cannot be undone.",
    async () => {
      try {
        const category = inventoryState.currentCategory;
        const itemIndex = inventoryState.items[category].findIndex(
          (i) => i.id === itemId,
        );
        const removedItem = inventoryState.items[category][itemIndex];

        if (itemIndex >= 0) {
          inventoryState.items[category].splice(itemIndex, 1);
        }

        // Delete from Google Drive
        const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
        enqueueSync({
          label: `Delete ${categoryName}: ${removedItem?.name || itemId}`,
          run: () => deleteItemFromGoogleDrive(categoryName, itemId),
        });

        // Update dashboard
        updateDashboardCounts();

        if (category === "crops") {
          updateCropTypeSuggestions();
        }

        // Render items
        renderInventoryItems();

        if (typeof saveLocalCache === "function") {
          saveLocalCache("inventory", { items: inventoryState.items, folders: inventoryState.folders });
        }
        
        showToast("Item deleted", "success");
      } catch (error) {
        console.error("Error deleting item:", error);
        showToast("Error deleting item. Please try again.", "error");
      }
    }
  );
}

// Update dashboard counts
async function updateDashboardCounts() {
  try {
    for (const category of CATEGORIES) {
      const key = category.toLowerCase();
      const count = inventoryState.items[key].length;
      const elementId = `${key}Count`;
      const element = document.getElementById(elementId);
      if (element) {
        element.textContent = `${count} ${count === 1 ? "item" : "items"}`;
      }
    }
    
    // Also update trial progress on dashboard
    if (typeof renderDashboardTrialProgress === 'function') {
      renderDashboardTrialProgress();
    }

    // Also update reminder views
    if (typeof refreshReminderViewsRealtime === 'function') {
      refreshReminderViewsRealtime();
    } else if (typeof renderDashboardReminders === 'function') {
      renderDashboardReminders();
    }
  } catch (error) {
    console.error("Error updating dashboard counts:", error);
  }
}

// Render location preview map
function renderLocationPreviewMap(location) {
  const mapContainer = document.getElementById(`locationPreviewMap${location.id}`);
  if (!mapContainer) return;

  // Remove old map if exists
  if (window[`locationMap${location.id}`]) {
    window[`locationMap${location.id}`].remove();
  }

  // Parse coordinates
  let center = [-6.2, 106.8];
  if (location.coordinates) {
    try {
      // Try parsing as JSON object first
      let coords = location.coordinates;
      if (typeof coords === 'string') {
        coords = JSON.parse(coords);
      }
      if (coords && coords.lat && coords.lng) {
        center = [coords.lat, coords.lng];
      }
    } catch (e) {
      // Try parsing as "lat,lng" string format
      try {
        const parts = location.coordinates.split(',').map(p => parseFloat(p.trim()));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          center = [parts[0], parts[1]];
        }
      } catch (e2) {
        console.log('Could not parse coordinates:', location.coordinates);
      }
    }
  }

  // Create map (with no zoom control)
  const map = L.map(mapContainer, {
    zoomControl: false,
    attributionControl: false
  }).setView(center, 13);

  // Add satellite layer
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: '',
    maxNativeZoom: 17,
    maxZoom: 25
  }).addTo(map);

  // Add labels layer
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png', {
    attribution: '',
    maxNativeZoom: 20,
    maxZoom: 25,
    pane: 'shadowPane'
  }).addTo(map);

  // Add marker
  L.marker(center, {
    icon: L.icon({
      iconUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41]
    })
  }).addTo(map);

  // Disable all interactions
  map.dragging.disable();
  map.touchZoom.disable();
  map.doubleClickZoom.disable();
  map.scrollWheelZoom.disable();
  map.boxZoom.disable();
  map.keyboard.disable();
  if (map.tap) map.tap.disable();

  // Store map instance
  window[`locationMap${location.id}`] = map;

  // Fix map size
  setTimeout(() => map.invalidateSize(), 100);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ===========================
// IMPORT / EXPORT
// ===========================

let importState = {
  step: 1,
  fileData: null,    // parsed rows (array of arrays)
  headers: null,     // first row headers
  mapping: {},       // { appField: fileColumnIndex }
  parsedItems: [],   // mapped data ready to import
  duplicates: [],    // indices of duplicate rows
};

function ensureImportNextButtonElements() {
  const nextBtn = document.getElementById("importNextBtn");
  if (!nextBtn) return { nextBtn: null, nextLabel: null, nextIcon: null };

  let nextLabel = document.getElementById("importNextLabel");
  let nextIcon = document.getElementById("importNextIcon");

  const missingOrDetached =
    !nextLabel ||
    !nextIcon ||
    !nextBtn.contains(nextLabel) ||
    !nextBtn.contains(nextIcon);

  if (missingOrDetached) {
    nextBtn.innerHTML =
      '<span id="importNextLabel">Next</span><span class="material-symbols-rounded" id="importNextIcon">arrow_forward</span>';
    nextLabel = document.getElementById("importNextLabel");
    nextIcon = document.getElementById("importNextIcon");
  }

  return { nextBtn, nextLabel, nextIcon };
}

// --- Field definitions per category ---
function getImportFields(category) {
  switch (category) {
    case "locations":
      return [
        { key: "name", label: "Location Name", icon: "label", required: true },
        { key: "latitude", label: "Latitude", icon: "explore", required: true },
        { key: "longitude", label: "Longitude", icon: "explore", required: true },
      ];
    case "crops":
      return [
        { key: "name", label: "Crop Name", icon: "label", required: true },
        { key: "cropType", label: "Crop Type", icon: "category", required: true },
        { key: "entryType", label: "Entry Type", icon: "spa", required: false, hint: "parental / hybrid (defaults to parental)" },
      ];
    case "parameters":
      return [
        { key: "name", label: "Parameter Name", icon: "label", required: true },
        { key: "initial", label: "Initial", icon: "abc", required: true },
        { key: "type", label: "Type", icon: "tune", required: true, hint: "text / range / radio / checkbox / date / formula" },
        { key: "rangeMin", label: "Range Min", icon: "arrow_downward", required: false },
        { key: "rangeMax", label: "Range Max", icon: "arrow_upward", required: false },
        { key: "radioOptions", label: "Radio Options", icon: "radio_button_checked", required: false, hint: "comma-separated" },
        { key: "checkboxOptions", label: "Checkbox Options", icon: "check_box", required: false, hint: "comma-separated" },
        { key: "formula", label: "Formula", icon: "calculate", required: false, hint: "e.g. 100/A * B" },
        { key: "unit", label: "Unit", icon: "straighten", required: false },
        { key: "daysOfObservation", label: "Days of Observation", icon: "event", required: false, hint: "CropName:min-max | CropName2:10" },
        { key: "numberOfSamples", label: "Number of Samples", icon: "tag", required: false },
        { key: "requirePhoto", label: "Require Photo", icon: "photo_camera", required: false, hint: "true / false" },
        { key: "photoMode", label: "Photo Mode", icon: "burst_mode", required: false, hint: "per-sample / per-line" },
      ];
    case "agronomy":
      return [
        { key: "activity", label: "Activity", icon: "agriculture", required: true },
        { key: "cropNames", label: "Crop Names", icon: "eco", required: false, hint: "comma-separated crop names" },
        { key: "dapMin", label: "DAP From", icon: "event", required: false },
        { key: "dapMax", label: "DAP To", icon: "event", required: false },
        { key: "chemical", label: "Chemical", icon: "science", required: false },
        { key: "dose", label: "Dose", icon: "medication", required: false },
        { key: "remark", label: "Remark", icon: "notes", required: false },
      ];
    case "entries": {
      const entryType = importState.targetCropId
        ? (inventoryState.items.crops.find(c => c.id === importState.targetCropId)?.entryType || "parental")
        : "parental";
      const shared = [
        { key: "name", label: "Item Name", icon: "label", required: true },
        { key: "quantity", label: "Quantity", icon: "tag", required: false },
        { key: "stage", label: "Stage", icon: "trending_up", required: false, hint: "Breeder Seed / Pre Basic 1 / Pre Basic 2 / Basic Seed / Parent Seed / Commercial" },
        { key: "seedOrigin", label: "Seed Origin", icon: "eco", required: false },
        { key: "registeredDate", label: "Registered Date", icon: "event", required: false, hint: "YYYY-MM-DD" },
      ];
      if (entryType === "hybrid") {
        return [
          ...shared,
          { key: "hybridCode", label: "Hybrid Code", icon: "label", required: false },
          { key: "fieldCode", label: "Field Code", icon: "code", required: false },
          { key: "femaleParent", label: "Female Parent", icon: "person", required: false },
          { key: "maleParent", label: "Male Parent", icon: "person", required: false },
          { key: "femaleSplit", label: "Female Split", icon: "call_split", required: false },
          { key: "firstMaleSplit", label: "1st Male Split", icon: "call_split", required: false },
          { key: "secondMaleSplit", label: "2nd Male Split", icon: "call_split", required: false },
        ];
      }
      return [
        ...shared,
        { key: "arrivalDate", label: "Arrival Date", icon: "event", required: false, hint: "YYYY-MM-DD" },
        { key: "parentCode", label: "Parent Code", icon: "code", required: false },
        { key: "hybridCode", label: "Hybrid Code", icon: "code", required: false },
        { key: "sprCode", label: "SPR Code", icon: "code", required: false },
        { key: "role", label: "Role", icon: "person", required: false, hint: "Male / Female / Both" },
      ];
    }
    default:
      return [];
  }
}

// --- Show/Hide IO buttons based on category ---
function updateImportExportVisibility() {
  const wrapper = document.getElementById("inventoryIoWrapper");
  if (!wrapper) return;
  const cat = inventoryState.currentCategory;
  const supported = ["locations", "crops", "parameters", "agronomy"];
  wrapper.style.display = supported.includes(cat) ? "" : "none";
}

// ===========================
// EXPORT
// ===========================

function exportInventoryData() {
  const cat = inventoryState.currentCategory;
  const items = inventoryState.items[cat] || [];
  if (items.length === 0) {
    showToast("No data to export", "error");
    return;
  }

  if (typeof XLSX === "undefined") {
    showToast("Excel library not loaded. Please try again.", "error");
    return;
  }

  let rows = [];
  if (cat === "locations") {
    rows.push(["Location Name", "Latitude", "Longitude"]);
    items.forEach(item => {
      let lat = "", lng = "";
      if (item.coordinates) {
        try {
          let coords = item.coordinates;
          if (typeof coords === "string") {
            try {
              coords = JSON.parse(coords);
            } catch (_) {
              const parts = coords.split(",").map(p => p.trim());
              if (parts.length === 2) {
                coords = { lat: parts[0], lng: parts[1] };
              }
            }
          }
          if (coords && coords.lat !== undefined) {
            lat = coords.lat;
            lng = coords.lng;
          }
        } catch (_) {}
      }
      rows.push([item.name || "", lat, lng]);
    });
  } else if (cat === "crops") {
    rows.push(["Crop Name", "Crop Type", "Entry Type"]);
    items.forEach(item => {
      rows.push([item.name || "", item.cropType || "", item.entryType || "parental"]);
    });
  } else if (cat === "parameters") {
    rows.push(["Parameter Name", "Initial", "Type", "Range Min", "Range Max",
      "Radio Options", "Checkbox Options", "Formula", "Unit", "Days of Observation", "Number of Samples",
      "Require Photo", "Photo Mode"]);
    items.forEach(item => {
      const isFormula = (item.type || "").toLowerCase() === "formula";
      rows.push([
        item.name || "",
        item.initial || "",
        item.type || "",
        item.rangeMin ?? "",
        item.rangeMax ?? "",
        item.radioOptions || "",
        item.checkboxOptions || "",
        item.formula || "",
        item.unit || "",
        isFormula ? "" : serializeParamDooForExport(item.daysOfObservation),
        isFormula ? 1 : (item.numberOfSamples ?? 1),
        isFormula ? "" : (item.requirePhoto ? "true" : "false"),
        isFormula ? "" : (item.photoMode || ""),
      ]);
    });
  } else if (cat === "agronomy") {
    rows.push(["Activity", "Crop Names", "DAP From", "DAP To", "Chemical", "Dose", "Remark"]);
    const allCrops = inventoryState.items.crops || [];
    items.forEach(item => {
      // Resolve cropIds to crop names
      const cropNames = (item.cropIds || []).map(cid => {
        const c = allCrops.find(cr => cr.id === cid);
        return c ? c.name : cid;
      }).join(", ");
      rows.push([
        item.activity || item.name || "",
        cropNames,
        item.dapMin ?? "",
        item.dapMax ?? "",
        item.chemical || "",
        item.dose || "",
        item.remark || "",
      ]);
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  // Auto-fit column widths
  const colWidths = rows[0].map((_, colIdx) => {
    let max = 10;
    rows.forEach(row => {
      const val = String(row[colIdx] || "");
      if (val.length > max) max = val.length;
    });
    return { wch: Math.min(max + 2, 40) };
  });
  ws["!cols"] = colWidths;

  const wb = XLSX.utils.book_new();
  const catName = cat.charAt(0).toUpperCase() + cat.slice(1);
  XLSX.utils.book_append_sheet(wb, ws, catName);
  XLSX.writeFile(wb, `${catName}_Export.xlsx`);
  showToast(`Exported ${items.length} ${catName.toLowerCase()} to Excel`, "success");
}

// ===========================
// EXPORT ENTRIES PER CROP
// ===========================
function exportCropLines(cropId) {
  const crop = inventoryState.items.crops.find(c => c.id === cropId);
  if (!crop) return;

  const entryType = crop.entryType || "parental";
  const isParental = entryType === "parental";
  const typeLabel = isParental ? "Parental" : "Hybrid";

  const lines = (inventoryState.items.entries || []).filter(l => l.cropId === cropId || l.crop === cropId);
  if (lines.length === 0) {
    showToast("No items to export for this crop", "error");
    return;
  }

  if (typeof XLSX === "undefined") {
    showToast("Excel library not loaded. Please try again.", "error");
    return;
  }

  const rows = [];
  if (isParental) {
    rows.push(["Item Name", "Quantity", "Stage", "Seed Origin", "Registered Date",
      "Arrival Date", "Parent Code", "Hybrid Code", "SPR Code", "Role"]);
    lines.forEach(line => {
      rows.push([
        line.name || "",
        line.quantity ?? "",
        line.stage || "",
        line.seedOrigin || "",
        line.registeredDate || "",
        line.arrivalDate || "",
        line.parentCode || "",
        line.hybridCode || "",
        line.sprCode || "",
        line.role || "",
      ]);
    });
  } else {
    rows.push(["Item Name", "Quantity", "Stage", "Seed Origin", "Registered Date",
      "Hybrid Code", "Field Code", "Female Parent", "Male Parent", "Female Split", "1st Male Split", "2nd Male Split"]);
    lines.forEach(line => {
      rows.push([
        line.name || "",
        line.quantity ?? "",
        line.stage || "",
        line.seedOrigin || "",
        line.registeredDate || "",
        line.hybridCode || "",
        line.fieldCode || "",
        line.femaleParent || "",
        line.maleParent || "",
        line.femaleSplit ?? "",
        line.firstMaleSplit ?? "",
        line.secondMaleSplit ?? "",
      ]);
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const colWidths = rows[0].map((_, colIdx) => {
    let max = 10;
    rows.forEach(row => {
      const val = String(row[colIdx] || "");
      if (val.length > max) max = val.length;
    });
    return { wch: Math.min(max + 2, 40) };
  });
  ws["!cols"] = colWidths;

  const wb = XLSX.utils.book_new();
  const safeName = (crop.name || "Entries").replace(/[^a-zA-Z0-9_ ]/g, "").substring(0, 30);
  XLSX.utils.book_append_sheet(wb, ws, safeName);
  XLSX.writeFile(wb, `${safeName}_${typeLabel}_Export.xlsx`);
  showToast(`Exported ${lines.length} ${typeLabel.toLowerCase()} item(s) for ${crop.name}`, "success");
}

// ===========================
// IMPORT ENTRIES PER CROP
// ===========================
function importCropLines(cropId) {
  const crop = inventoryState.items.crops.find(c => c.id === cropId);
  if (!crop) return;

  // Temporarily switch category to "entries" so the import modal works for entries
  const prevCategory = inventoryState.currentCategory;
  inventoryState.currentCategory = "entries";
  // Store the target cropId for this import session
  importState.targetCropId = cropId;
  importState.targetCropName = crop.name;
  importState.returnCategory = prevCategory;

  const fields = getImportFields("entries");
  if (fields.length === 0) {
    showToast("Import not supported", "error");
    inventoryState.currentCategory = prevCategory;
    return;
  }

  importState.step = 1;
  importState.fileData = null;
  importState.headers = null;
  importState.mapping = {};
  importState.parsedItems = [];
  importState.duplicates = [];

  const typeLabel = (crop.entryType || "parental") === "hybrid" ? "Hybrid" : "Parental";
  document.getElementById("importModalTitle").textContent = `Import ${typeLabel} — ${escapeHtml(crop.name)}`;
  document.getElementById("importStep1").classList.remove("hidden");
  document.getElementById("importStep2").classList.add("hidden");
  document.getElementById("importStep3").classList.add("hidden");
  document.getElementById("importFileInfo").classList.add("hidden");
  document.getElementById("importDropzone").style.display = "";
  document.getElementById("importBackBtn").style.display = "none";
  const { nextBtn, nextLabel, nextIcon } = ensureImportNextButtonElements();
  if (nextBtn) nextBtn.disabled = true;
  if (nextLabel) nextLabel.textContent = "Next";
  if (nextIcon) nextIcon.textContent = "arrow_forward";
  document.getElementById("importModal").classList.remove("hidden");

  setupImportDropzone();
}

// ===========================
// IMPORT
// ===========================

function openImportModal() {
  const cat = inventoryState.currentCategory;
  const fields = getImportFields(cat);
  if (fields.length === 0) {
    showToast("Import not supported for this category", "error");
    return;
  }

  importState = { step: 1, fileData: null, headers: null, mapping: {}, parsedItems: [], duplicates: [] };
  const catName = cat.charAt(0).toUpperCase() + cat.slice(1);
  document.getElementById("importModalTitle").textContent = `Import ${catName}`;

  // Reset UI
  document.getElementById("importStep1").classList.remove("hidden");
  document.getElementById("importStep2").classList.add("hidden");
  document.getElementById("importStep3").classList.add("hidden");
  document.getElementById("importFileInfo").classList.add("hidden");
  document.getElementById("importDropzone").style.display = "";
  document.getElementById("importBackBtn").style.display = "none";
  const { nextBtn, nextLabel, nextIcon } = ensureImportNextButtonElements();
  if (nextBtn) nextBtn.disabled = true;
  if (nextLabel) nextLabel.textContent = "Next";
  if (nextIcon) nextIcon.textContent = "arrow_forward";
  document.getElementById("importModal").classList.remove("hidden");
  lockBodyScroll();

  // Setup drag-and-drop
  setupImportDropzone();
}

function closeImportModal() {
  document.getElementById("importModal").classList.add("hidden");
  unlockBodyScroll();
  // Restore previous category if we were importing lines
  if (importState.returnCategory) {
    inventoryState.currentCategory = importState.returnCategory;
  }
  importState = { step: 1, fileData: null, headers: null, mapping: {}, parsedItems: [], duplicates: [] };
}

function setupImportDropzone() {
  const dropzone = document.getElementById("importDropzone");
  const fileInput = document.getElementById("importFileInput");

  // Remove old listeners by replacing node
  const newDropzone = dropzone.cloneNode(true);
  dropzone.parentNode.replaceChild(newDropzone, dropzone);
  const newFileInput = newDropzone.querySelector("#importFileInput") || document.getElementById("importFileInput");

  newDropzone.addEventListener("click", () => newFileInput.click());
  newDropzone.addEventListener("dragover", (e) => { e.preventDefault(); newDropzone.classList.add("dragover"); });
  newDropzone.addEventListener("dragleave", () => newDropzone.classList.remove("dragover"));
  newDropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    newDropzone.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (file) handleInventoryImportFile(file);
  });
  newFileInput.addEventListener("change", (e) => {
    if (e.target.files[0]) handleInventoryImportFile(e.target.files[0]);
  });
}

function handleInventoryImportFile(file) {
  const validTypes = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv",
    ".xlsx", ".xls", ".csv"
  ];
  const ext = file.name.split(".").pop().toLowerCase();
  if (!["xlsx", "xls", "csv"].includes(ext)) {
    showToast("Please upload an Excel (.xlsx/.xls) or CSV (.csv) file", "error");
    return;
  }

  if (typeof XLSX === "undefined") {
    showToast("Excel library not loaded. Please try again.", "error");
    return;
  }

  document.getElementById("importFileName").textContent = file.name;
  document.getElementById("importFileInfo").classList.remove("hidden");
  document.getElementById("importDropzone").style.display = "none";

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });

      // Filter out empty rows
      const rows = jsonData.filter(row => row.some(cell => cell !== "" && cell !== null && cell !== undefined));
      if (rows.length < 2) {
        showToast("File must have a header row and at least one data row", "error");
        clearImportFile();
        return;
      }

      importState.headers = rows[0].map(h => String(h).trim());
      importState.fileData = rows.slice(1);
      document.getElementById("importNextBtn").disabled = false;
    } catch (err) {
      console.error("Error parsing file:", err);
      showToast("Failed to parse file. Please check the format.", "error");
      clearImportFile();
    }
  };
  reader.readAsArrayBuffer(file);
}

function clearImportFile() {
  importState.fileData = null;
  importState.headers = null;
  document.getElementById("importFileInfo").classList.add("hidden");
  document.getElementById("importDropzone").style.display = "";
  document.getElementById("importNextBtn").disabled = true;
  const fileInput = document.getElementById("importFileInput");
  if (fileInput) fileInput.value = "";
}

function importStepNext() {
  if (importState.step === 1) {
    // Go to Step 2: Column Mapping
    importState.step = 2;
    renderImportColumnMapping();
    document.getElementById("importStep1").classList.add("hidden");
    document.getElementById("importStep2").classList.remove("hidden");
    document.getElementById("importBackBtn").style.display = "";
    document.getElementById("importNextBtn").disabled = false;
    document.getElementById("importNextLabel").textContent = "Preview";
    document.getElementById("importNextIcon").textContent = "visibility";
  } else if (importState.step === 2) {
    // Validate mapping
    if (!validateImportMapping()) return;
    // Go to Step 3: Preview
    importState.step = 3;
    renderImportPreview();
    document.getElementById("importStep2").classList.add("hidden");
    document.getElementById("importStep3").classList.remove("hidden");
    document.getElementById("importNextLabel").textContent = "Import";
    document.getElementById("importNextIcon").textContent = "check";
  } else if (importState.step === 3) {
    // Execute import
    executeImport();
  }
}

function importStepBack() {
  if (importState.step === 2) {
    importState.step = 1;
    document.getElementById("importStep2").classList.add("hidden");
    document.getElementById("importStep1").classList.remove("hidden");
    document.getElementById("importBackBtn").style.display = "none";
    document.getElementById("importNextLabel").textContent = "Next";
    document.getElementById("importNextIcon").textContent = "arrow_forward";
    document.getElementById("importNextBtn").disabled = !importState.fileData;
  } else if (importState.step === 3) {
    importState.step = 2;
    document.getElementById("importStep3").classList.add("hidden");
    document.getElementById("importStep2").classList.remove("hidden");
    document.getElementById("importNextLabel").textContent = "Preview";
    document.getElementById("importNextIcon").textContent = "visibility";
  }
}

// --- Step 2: Column Mapping ---
function renderImportColumnMapping() {
  const container = document.getElementById("importColumnMapping");
  const cat = inventoryState.currentCategory;
  const fields = getImportFields(cat);

  // Auto-detect mapping from headers
  const headerLower = importState.headers.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ""));

  fields.forEach(field => {
    let bestIdx = -1;
    // Try to match
    const fieldKey = field.key.toLowerCase();
    const fieldLabel = field.label.toLowerCase().replace(/[^a-z0-9]/g, "");
    headerLower.forEach((h, idx) => {
      if (h === fieldKey || h === fieldLabel || h.includes(fieldKey)) {
        if (bestIdx === -1) bestIdx = idx;
      }
    });
    importState.mapping[field.key] = bestIdx >= 0 ? bestIdx : -1;
  });

  let html = "";
  fields.forEach(field => {
    const options = importState.headers.map((h, idx) =>
      `<option value="${idx}" ${importState.mapping[field.key] === idx ? "selected" : ""}>${escapeHtml(h)}</option>`
    ).join("");

    html += `
      <div class="import-map-row">
        <div class="import-map-field">
          <span class="material-symbols-rounded">${field.icon}</span>
          <div>
            ${escapeHtml(field.label)}${field.required ? ' <span style="color:var(--danger)">*</span>' : ''}
            ${field.hint ? `<small class="import-map-hint">${escapeHtml(field.hint)}</small>` : ''}
          </div>
        </div>
        <span class="material-symbols-rounded import-map-arrow">arrow_forward</span>
        <select class="import-map-select" data-field="${field.key}" onchange="updateImportMapping(this)">
          <option value="-1">-- Skip --</option>
          ${options}
        </select>
      </div>
    `;
  });

  container.innerHTML = html;
}

function updateImportMapping(select) {
  const field = select.dataset.field;
  importState.mapping[field] = parseInt(select.value);
}

function validateImportMapping() {
  const cat = inventoryState.currentCategory;
  const fields = getImportFields(cat);
  const required = fields.filter(f => f.required);

  for (const field of required) {
    if (importState.mapping[field.key] === -1 || importState.mapping[field.key] === undefined) {
      showToast(`Please map the "${field.label}" field`, "error");
      return false;
    }
  }
  return true;
}

// --- Step 3: Preview ---
function renderImportPreview() {
  const cat = inventoryState.currentCategory;
  const fields = getImportFields(cat);
  const mapping = importState.mapping;
  const existingItems = inventoryState.items[cat] || [];

  importState.parsedItems = [];
  importState.duplicates = [];

  // Parse rows based on mapping
  importState.fileData.forEach((row, rowIdx) => {
    const item = {};
    let hasData = false;
    fields.forEach(field => {
      const colIdx = mapping[field.key];
      if (colIdx >= 0 && colIdx < row.length) {
        const val = String(row[colIdx] ?? "").trim();
        item[field.key] = val;
        if (val) hasData = true;
      } else {
        item[field.key] = "";
      }
    });
    if (hasData) {
      importState.parsedItems.push(item);
    }
  });

  // Detect duplicates
  importState.parsedItems.forEach((item, idx) => {
    let isDup = false;
    if (cat === "locations") {
      isDup = existingItems.some(existing => {
        const nameMatch = (existing.name || "").toLowerCase().trim() === (item.name || "").toLowerCase().trim();
        if (!nameMatch) return false;
        let exLat = "", exLng = "";
        if (existing.coordinates) {
          try {
            let coords = existing.coordinates;
            if (typeof coords === "string") {
              try { coords = JSON.parse(coords); } catch (_) {
                const parts = coords.split(",").map(p => p.trim());
                if (parts.length === 2) coords = { lat: parts[0], lng: parts[1] };
              }
            }
            if (coords && coords.lat !== undefined) {
              exLat = String(coords.lat);
              exLng = String(coords.lng);
            }
          } catch (_) {}
        }
        return exLat === item.latitude && exLng === item.longitude;
      });
    } else if (cat === "crops") {
      isDup = existingItems.some(existing =>
        (existing.name || "").toLowerCase().trim() === (item.name || "").toLowerCase().trim() &&
        (existing.cropType || "").toLowerCase().trim() === (item.cropType || "").toLowerCase().trim()
      );
    } else if (cat === "parameters") {
      isDup = existingItems.some(existing =>
        (existing.name || "").toLowerCase().trim() === (item.name || "").toLowerCase().trim() &&
        (existing.initial || "").toLowerCase().trim() === (item.initial || "").toLowerCase().trim() &&
        (existing.type || "").toLowerCase().trim() === (item.type || "").toLowerCase().trim()
      );
    } else if (cat === "agronomy") {
      isDup = existingItems.some(existing =>
        (existing.activity || existing.name || "").toLowerCase().trim() === (item.activity || "").toLowerCase().trim()
      );
    } else if (cat === "entries") {
      const targetCropId = importState.targetCropId;
      isDup = existingItems.some(existing =>
        (existing.cropId === targetCropId || existing.crop === targetCropId) &&
        (existing.name || "").toLowerCase().trim() === (item.name || "").toLowerCase().trim()
      );
    }
    if (isDup) importState.duplicates.push(idx);
  });

  // Render preview table
  const table = document.getElementById("importPreviewTable");
  let html = "<thead><tr><th>#</th>";
  fields.forEach(f => { html += `<th>${escapeHtml(f.label)}</th>`; });
  html += "</tr></thead><tbody>";

  importState.parsedItems.forEach((item, idx) => {
    const isDup = importState.duplicates.includes(idx);
    html += `<tr class="${isDup ? 'duplicate-row' : ''}"><td>${idx + 1}</td>`;
    fields.forEach(f => { html += `<td>${escapeHtml(item[f.key] || "-")}</td>`; });
    html += "</tr>";
  });
  html += "</tbody>";
  table.innerHTML = html;

  // Update count
  document.getElementById("importPreviewCount").textContent =
    `${importState.parsedItems.length} item(s) to import`;

  // Duplicate warning
  const dupWarning = document.getElementById("importDuplicateWarning");
  if (importState.duplicates.length > 0) {
    document.getElementById("importDuplicateCount").textContent = importState.duplicates.length;
    dupWarning.classList.remove("hidden");
  } else {
    dupWarning.classList.add("hidden");
  }

  document.getElementById("importNextBtn").disabled = importState.parsedItems.length === 0;
}

// --- Execute Import ---
async function executeImport() {
  const cat = inventoryState.currentCategory;
  const catName = cat.charAt(0).toUpperCase() + cat.slice(1);
  const items = importState.parsedItems;
  const duplicateAction = document.querySelector('input[name="duplicateAction"]:checked')?.value || "skip";

  if (items.length === 0) {
    showToast("No items to import", "error");
    return;
  }

  // Disable button during import
  const btn = document.getElementById("importNextBtn");
  btn.disabled = true;
  btn.innerHTML = '<span class="material-symbols-rounded spin">sync</span> Importing...';

  try {
    let imported = 0;
    let skipped = 0;
    let replaced = 0;
    const existingItems = inventoryState.items[cat] || [];

    for (let idx = 0; idx < items.length; idx++) {
      const rawItem = items[idx];
      const isDup = importState.duplicates.includes(idx);

      if (isDup) {
        if (duplicateAction === "skip") {
          skipped++;
          continue;
        } else if (duplicateAction === "replace") {
          const existingIdx = findExistingDuplicate(cat, existingItems, rawItem);
          if (existingIdx >= 0) {
            const existing = existingItems[existingIdx];
            applyImportUpdate(cat, existing, rawItem);
            existing.updatedAt = new Date().toISOString();
            enqueueSync({
              label: `Save ${catName}: ${existing.name || existing.activity}`,
              run: () => saveItemToGoogleDrive(catName, existing),
            });
            replaced++;
            continue;
          }
        }
        // duplicateAction === "add" falls through to create new
      }

      // Create new item
      const newItem = buildNewItem(cat, rawItem, idx);

      if (newItem) {
        inventoryState.items[cat].push(newItem);
        enqueueSync({
          label: `Save ${catName}: ${newItem.name}`,
          run: () => saveItemToGoogleDrive(catName, newItem),
        });
        imported++;
      }
    }

    // Update UI
    updateDashboardCounts();

    let msg = `Imported ${imported} new item(s)`;
    if (replaced > 0) msg += `, replaced ${replaced}`;
    if (skipped > 0) msg += `, skipped ${skipped} duplicate(s)`;
    showToast(msg, "success");

    // Re-open crop lines popup if we were importing entries
    const targetCropId = importState.targetCropId;
    closeImportModal();

    // Render after closing modal so category is restored
    renderInventoryItems();

    if (cat === "entries" && targetCropId) {
      showCropLinesPopup(targetCropId);
    }
  } catch (err) {
    console.error("Import error:", err);
    showToast("Import failed: " + err.message, "error");
    btn.disabled = false;
    btn.innerHTML = '<span id="importNextLabel">Import</span><span class="material-symbols-rounded" id="importNextIcon">check</span>';
  }
}

// --- Import helpers: find duplicate, apply update, build new item ---

function findExistingDuplicate(cat, existingItems, rawItem) {
  if (cat === "locations") {
    return existingItems.findIndex(existing => {
      const nameMatch = (existing.name || "").toLowerCase().trim() === (rawItem.name || "").toLowerCase().trim();
      if (!nameMatch) return false;
      let exLat = "", exLng = "";
      if (existing.coordinates) {
        try {
          let coords = existing.coordinates;
          if (typeof coords === "string") {
            try { coords = JSON.parse(coords); } catch (_) {
              const parts = coords.split(",").map(p => p.trim());
              if (parts.length === 2) coords = { lat: parts[0], lng: parts[1] };
            }
          }
          if (coords && coords.lat !== undefined) { exLat = String(coords.lat); exLng = String(coords.lng); }
        } catch (_) {}
      }
      return exLat === rawItem.latitude && exLng === rawItem.longitude;
    });
  } else if (cat === "crops") {
    return existingItems.findIndex(ex =>
      (ex.name || "").toLowerCase().trim() === (rawItem.name || "").toLowerCase().trim() &&
      (ex.cropType || "").toLowerCase().trim() === (rawItem.cropType || "").toLowerCase().trim()
    );
  } else if (cat === "parameters") {
    return existingItems.findIndex(ex =>
      (ex.name || "").toLowerCase().trim() === (rawItem.name || "").toLowerCase().trim() &&
      (ex.initial || "").toLowerCase().trim() === (rawItem.initial || "").toLowerCase().trim() &&
      (ex.type || "").toLowerCase().trim() === (rawItem.type || "").toLowerCase().trim()
    );
  } else if (cat === "agronomy") {
    return existingItems.findIndex(ex =>
      (ex.activity || ex.name || "").toLowerCase().trim() === (rawItem.activity || "").toLowerCase().trim()
    );
  } else if (cat === "entries") {
    const targetCropId = importState.targetCropId;
    return existingItems.findIndex(ex =>
      (ex.cropId === targetCropId || ex.crop === targetCropId) &&
      (ex.name || "").toLowerCase().trim() === (rawItem.name || "").toLowerCase().trim()
    );
  }
  return -1;
}

function applyImportUpdate(cat, existing, rawItem) {
  if (cat === "locations") {
    existing.name = rawItem.name;
    existing.coordinates = `${rawItem.latitude},${rawItem.longitude}`;
  } else if (cat === "crops") {
    existing.name = rawItem.name;
    existing.cropType = rawItem.cropType;
    const et = (rawItem.entryType || "").toLowerCase().trim();
    if (et === "parental" || et === "hybrid") existing.entryType = et;
  } else if (cat === "parameters") {
    const normalizedType = (rawItem.type || "").toLowerCase().trim();
    const importedDoo = parseParamDooImport(rawItem.daysOfObservation);
    existing.name = rawItem.name;
    existing.initial = rawItem.initial;
    existing.type = rawItem.type;
    if (rawItem.rangeMin) existing.rangeMin = Number(rawItem.rangeMin);
    if (rawItem.rangeMax) existing.rangeMax = Number(rawItem.rangeMax);
    if (rawItem.rangeMin && rawItem.rangeMax) existing.rangeDefinition = `${rawItem.rangeMin}-${rawItem.rangeMax}`;
    if (rawItem.radioOptions) existing.radioOptions = rawItem.radioOptions;
    if (rawItem.checkboxOptions) existing.checkboxOptions = rawItem.checkboxOptions;
    existing.formula = (rawItem.type || "").toLowerCase().trim() === "formula"
      ? (rawItem.formula || "")
      : undefined;
    if (rawItem.unit) existing.unit = rawItem.unit;
    existing.numberOfSamples = normalizedType === "formula"
      ? 1
      : (rawItem.numberOfSamples ? Number(rawItem.numberOfSamples) || 1 : (existing.numberOfSamples || 1));
    existing.requirePhoto = normalizedType === "formula" ? false : (rawItem.requirePhoto === "true");
    existing.photoMode = normalizedType === "formula" ? undefined : (rawItem.photoMode || existing.photoMode);
    existing.daysOfObservation = normalizedType === "formula" ? {} : importedDoo;
  } else if (cat === "agronomy") {
    existing.activity = rawItem.activity;
    existing.name = rawItem.activity;
    existing.cropIds = resolveCropNames(rawItem.cropNames);
    if (rawItem.dapMin) existing.dapMin = Number(rawItem.dapMin) || null;
    if (rawItem.dapMax) existing.dapMax = Number(rawItem.dapMax) || null;
    if (rawItem.chemical !== undefined) existing.chemical = rawItem.chemical;
    if (rawItem.dose !== undefined) existing.dose = rawItem.dose;
    if (rawItem.remark !== undefined) existing.remark = rawItem.remark;
  } else if (cat === "entries") {
    existing.name = rawItem.name || existing.name;
    // Derive type from parent crop's entryType
    const parentCrop = inventoryState.items.crops.find(c => c.id === importState.targetCropId);
    const entryType = parentCrop?.entryType || existing.lineType || "parental";
    existing.lineType = entryType;
    if (rawItem.quantity) existing.quantity = rawItem.quantity;
    if (rawItem.stage) existing.stage = rawItem.stage;
    if (rawItem.seedOrigin) existing.seedOrigin = rawItem.seedOrigin;
    if (rawItem.registeredDate) existing.registeredDate = rawItem.registeredDate;
    // Parental fields
    if (rawItem.arrivalDate) existing.arrivalDate = rawItem.arrivalDate;
    if (rawItem.parentCode) existing.parentCode = rawItem.parentCode;
    if (rawItem.hybridCode) existing.hybridCode = rawItem.hybridCode;
    if (rawItem.sprCode) existing.sprCode = rawItem.sprCode;
    if (rawItem.role) existing.role = rawItem.role;
    // Hybrid fields
    if (rawItem.hybridCode) existing.hybridCode = rawItem.hybridCode;
    if (rawItem.fieldCode) existing.fieldCode = rawItem.fieldCode;
    if (rawItem.femaleParent) existing.femaleParent = rawItem.femaleParent;
    if (rawItem.maleParent) existing.maleParent = rawItem.maleParent;
    if (rawItem.femaleSplit) existing.femaleSplit = Number(rawItem.femaleSplit) || undefined;
    if (rawItem.firstMaleSplit) existing.firstMaleSplit = Number(rawItem.firstMaleSplit) || undefined;
    if (rawItem.secondMaleSplit) existing.secondMaleSplit = Number(rawItem.secondMaleSplit) || undefined;
  }
}

function buildNewItem(cat, rawItem, idx) {
  const now = new Date().toISOString();
  const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${idx}`;

  if (cat === "locations") {
    return {
      id, name: rawItem.name || "Unnamed",
      coordinates: `${rawItem.latitude},${rawItem.longitude}`,
      createdAt: now, updatedAt: now,
    };
  } else if (cat === "crops") {
    const et = (rawItem.entryType || "parental").toLowerCase().trim();
    return {
      id, name: rawItem.name || "Unnamed",
      cropType: rawItem.cropType || "",
      entryType: (et === "hybrid") ? "hybrid" : "parental",
      createdAt: now, updatedAt: now,
    };
  } else if (cat === "parameters") {
    const type = (rawItem.type || "text").toLowerCase().trim();
    const importedDoo = parseParamDooImport(rawItem.daysOfObservation);
    const item = {
      id, name: rawItem.name || "Unnamed",
      initial: rawItem.initial || "",
      type: type,
      formula: type === "formula" ? (rawItem.formula || "") : undefined,
      unit: rawItem.unit || "",
      numberOfSamples: type === "formula" ? 1 : (Number(rawItem.numberOfSamples) || 1),
      requirePhoto: type === "formula" ? false : (rawItem.requirePhoto === "true"),
      photoMode: type === "formula" ? undefined : (rawItem.photoMode || ""),
      daysOfObservation: type === "formula" ? {} : importedDoo,
      createdAt: now, updatedAt: now,
    };
    if (type === "range") {
      item.rangeMin = Number(rawItem.rangeMin) || 0;
      item.rangeMax = Number(rawItem.rangeMax) || 0;
      item.rangeDefinition = `${item.rangeMin}-${item.rangeMax}`;
    }
    if (type === "radio" && rawItem.radioOptions) item.radioOptions = rawItem.radioOptions;
    if (type === "checkbox" && rawItem.checkboxOptions) item.checkboxOptions = rawItem.checkboxOptions;
    return item;
  } else if (cat === "agronomy") {
    return {
      id, name: rawItem.activity || "Unnamed",
      activity: rawItem.activity || "Unnamed",
      cropIds: resolveCropNames(rawItem.cropNames),
      dapMin: rawItem.dapMin ? Number(rawItem.dapMin) : null,
      dapMax: rawItem.dapMax ? Number(rawItem.dapMax) : null,
      chemical: rawItem.chemical || "",
      dose: rawItem.dose || "",
      remark: rawItem.remark || "",
      createdAt: now, updatedAt: now,
    };
  } else if (cat === "entries") {
    // Derive type from parent crop's entryType
    const parentCrop = inventoryState.items.crops.find(c => c.id === importState.targetCropId);
    const lt = parentCrop?.entryType || "parental";
    const item = {
      id, name: rawItem.name || "Unnamed",
      cropId: importState.targetCropId || "",
      lineType: lt,
      quantity: rawItem.quantity || "",
      stage: rawItem.stage || "",
      seedOrigin: rawItem.seedOrigin || "",
      registeredDate: rawItem.registeredDate || "",
      createdAt: now, updatedAt: now,
    };
    if (lt === "parental") {
      item.arrivalDate = rawItem.arrivalDate || "";
      item.parentCode = rawItem.parentCode || "";
      item.hybridCode = rawItem.hybridCode || "";
      item.sprCode = rawItem.sprCode || "";
      item.role = rawItem.role || "";
    } else {
      item.hybridCode = rawItem.hybridCode || "";
      item.fieldCode = rawItem.fieldCode || "";
      item.femaleParent = rawItem.femaleParent || "";
      item.maleParent = rawItem.maleParent || "";
      item.femaleSplit = rawItem.femaleSplit ? Number(rawItem.femaleSplit) : undefined;
      item.firstMaleSplit = rawItem.firstMaleSplit ? Number(rawItem.firstMaleSplit) : undefined;
      item.secondMaleSplit = rawItem.secondMaleSplit ? Number(rawItem.secondMaleSplit) : undefined;
    }
    return item;
  }
  return null;
}

// Resolve comma-separated crop names to cropIds
function resolveCropNames(cropNamesStr) {
  if (!cropNamesStr) return [];
  const allCrops = inventoryState.items.crops || [];
  return cropNamesStr.split(",").map(n => n.trim()).filter(Boolean).map(name => {
    const found = allCrops.find(c => (c.name || "").toLowerCase().trim() === name.toLowerCase());
    return found ? found.id : null;
  }).filter(Boolean);
}
