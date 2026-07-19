const STORAGE_KEY = 'cv-generator';
const PX_PER_MM = 96 / 25.4;
const PAGE_W_MM = 210;
const PAGE_H_MM = 297;

const MARGINS = { normal: 25.4, medium: 19.05, narrow: 12.7 };

const FONT_STACKS = {
  'Arial': 'Arial, Helvetica, sans-serif',
  'Calibri': 'Calibri, Carlito, "Segoe UI", sans-serif',
  'Georgia': 'Georgia, "Times New Roman", serif',
  'Helvetica': 'Helvetica, Arial, sans-serif',
  'Times New Roman': '"Times New Roman", Times, serif'
};

const TYPES = {
  summary:    { entry: null },
  experience: { entry: 'organization' },
  education:  { entry: 'education' },
  skills:     { entry: 'skill group' },
  list:       { entry: 'item' },
  languages:  { entry: 'language' },
  custom:     { entry: 'item' }
};

const SECTION_DEFS = [
  { type: 'summary',    icon: 'notes',               label: 'Professional Summary', desc: 'A short intro paragraph',     en: 'PROFESSIONAL SUMMARY', id: 'RINGKASAN PROFESIONAL' },
  { type: 'experience', icon: 'work',                label: 'Experience',           desc: 'Organizations & positions',   en: 'EXPERIENCE',           id: 'PENGALAMAN' },
  { type: 'education',  icon: 'school',              label: 'Education',            desc: 'Degrees, schools, score',     en: 'EDUCATION',            id: 'PENDIDIKAN' },
  { type: 'skills',     icon: 'construction',        label: 'Skills',               desc: 'Grouped by category',         en: 'SKILLS',               id: 'KEAHLIAN' },
  { type: 'list',       icon: 'workspace_premium',   label: 'Certifications',       desc: 'Name, issuer, number, year',  en: 'CERTIFICATIONS',       id: 'SERTIFIKASI' },
  { type: 'languages',  icon: 'translate',           label: 'Languages',            desc: 'Language and proficiency',    en: 'LANGUAGES',            id: 'BAHASA' },
  { type: 'custom',     icon: 'dashboard_customize', label: 'Custom Section',       desc: 'Awards, projects, etc.',      en: 'CUSTOM SECTION',       id: 'BAGIAN KUSTOM' }
];

const EXTRA_TITLES = [
  { en: 'WORK EXPERIENCE',   id: 'PENGALAMAN KERJA' },
  { en: 'PROJECTS',          id: 'PROYEK' },
  { en: 'AWARDS AND HONORS', id: 'PENGHARGAAN' },
  { en: 'ORGANIZATIONS',     id: 'ORGANISASI' },
  { en: 'VOLUNTEERING',      id: 'PENGALAMAN SUKARELAWAN' },
  { en: 'PUBLICATIONS',      id: 'PUBLIKASI' },
  { en: 'REFERENCES',        id: 'REFERENSI' }
];

const TITLE_LOOKUP = {};
[...SECTION_DEFS, ...EXTRA_TITLES].forEach(d => { TITLE_LOOKUP[d.en] = d; TITLE_LOOKUP[d.id] = d; });

let data = null;
let cleanPrint = false;

function uid() {
  return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function newRole() {
  return { role: '', start: '', end: '', bullets: [''] };
}

function newEntry(type) {
  switch (type) {
    case 'experience': return { company: '', location: '', roles: [newRole()] };
    case 'education':  return { degree: '', school: '', location: '', start: '', end: '', scoreLabel: '', score: '', details: [] };
    case 'skills':     return { label: '', items: '' };
    case 'list':       return { name: '', detail: '', num: '', date: '' };
    case 'languages':  return { name: '', level: '' };
    case 'custom':     return { heading: '', sub: '', date: '', bullets: [''] };
  }
  return {};
}

function newSection(def, lang) {
  const sec = { id: uid(), type: def.type, title: def[lang || data.settings.lang] || def.en, icon: def.icon };
  if (def.type === 'summary') sec.text = '';
  else sec.entries = [newEntry(def.type)];
  return sec;
}

function blankData(lang) {
  lang = lang || 'en';
  const def = name => SECTION_DEFS.find(d => d.label === name);
  return {
    settings: { font: 'Arial', size: '11', margin: 'narrow', lang, mode: 'form' },
    personal: { name: '', title: '', email: '', phone: '', city: '', country: '', linkedin: '', website: '' },
    sections: [
      newSection(def('Professional Summary'), lang),
      newSection(def('Experience'), lang),
      newSection(def('Education'), lang),
      newSection(def('Skills'), lang)
    ]
  };
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function joinComma(...parts) {
  return parts.map(p => (p || '').trim()).filter(Boolean).join(', ');
}

function dateRange(a, b) {
  a = (a || '').trim(); b = (b || '').trim();
  return a && b ? `${a} – ${b}` : (a || b);
}

function bulletLines(lines) {
  return (Array.isArray(lines) ? lines : String(lines || '').split('\n'))
    .map(l => String(l).trim().replace(/^[•\-*]+\s*/, ''))
    .filter(Boolean);
}

function contactLine() {
  const p = data.personal;
  return [joinComma(p.city, p.country), p.phone, p.email, p.linkedin, p.website]
    .map(v => (v || '').trim()).filter(Boolean).join(' | ');
}

function T(en, id) {
  return data.settings.lang === 'id' ? id : en;
}

function scoreLabelOf(e) {
  return (e.scoreLabel || '').trim() || T('GPA', 'IPK');
}

function numLabel() {
  return T('Credential ID', 'No. Sertifikat');
}

function eduSub(e) {
  const base = joinComma(e.school, e.location);
  const score = (e.score || '').trim();
  if (!score) return base;
  const part = `${scoreLabelOf(e)}: ${score}`;
  return base ? `${base} | ${part}` : part;
}

function roleHasContent(r) {
  return ((r.role || '') + (r.start || '') + (r.end || '') + bulletLines(r.bullets).join('')).trim() !== '';
}

function expHasContent(e) {
  return ((e.company || '') + (e.location || '')).trim() !== '' || (e.roles || []).some(roleHasContent);
}

function findSec(id) {
  return data.sections.find(s => s.id === id);
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

let refreshTimer;
function refresh() {
  save();
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(renderPreview, 120);
}

function fieldHtml(label, k, value, ph) {
  return `<div class="f"><label>${label}</label><input data-k="${k}" value="${esc(value)}" placeholder="${esc(ph)}"></div>`;
}

function linesHtml(key, lines, label, addLabel, ph) {
  const rows = (lines || []).map((l, i) => `
    <div class="line" data-line="${i}">
      <span class="line-dot">•</span>
      <input value="${esc(l)}" placeholder="${esc(ph)}">
      <button type="button" class="icon-btn line-del" data-act="line-del" aria-label="Remove line" tabindex="-1"><span class="material-symbols-rounded">close</span></button>
    </div>`).join('');
  return `
    <div class="f"><label>${label}</label>
      <div class="lines" data-lk="${key}">
        ${rows}
        <button type="button" class="add-line" data-act="line-add"><span class="material-symbols-rounded">add</span>${addLabel}</button>
      </div>
    </div>`;
}

function roleHtml(r, i, total) {
  return `
    <div class="role" data-ridx="${i}">
      <div class="role-bar">
        <span class="entry-num">Position #${i + 1}</span>
        <button type="button" class="icon-btn" data-act="role-up" ${i === 0 ? 'disabled' : ''} aria-label="Move up"><span class="material-symbols-rounded">arrow_upward</span></button>
        <button type="button" class="icon-btn" data-act="role-down" ${i === total - 1 ? 'disabled' : ''} aria-label="Move down"><span class="material-symbols-rounded">arrow_downward</span></button>
        <button type="button" class="icon-btn danger" data-act="role-del" ${total === 1 ? 'disabled' : ''} aria-label="Delete position"><span class="material-symbols-rounded">delete</span></button>
      </div>
      <div class="grid-only">
        ${fieldHtml('Position', 'role', r.role, 'Senior Software Engineer')}
        <div class="f"><label>Start &ndash; End</label>
          <div class="grid-d">
            <input data-k="start" value="${esc(r.start)}" placeholder="Jan 2023">
            <input data-k="end" value="${esc(r.end)}" placeholder="Present">
          </div>
        </div>
      </div>
      ${linesHtml('bullets', r.bullets, 'Achievements', 'Add achievement', 'Led a project that improved a metric by X%')}
    </div>`;
}

function entryFieldsHtml(type, e) {
  switch (type) {
    case 'experience': return `
      <div class="grid-only">
        ${fieldHtml('Company / Organization', 'company', e.company, 'PT Teknologi Nusantara')}
        ${fieldHtml('Location', 'location', e.location, 'Jakarta, Indonesia')}
      </div>
      <div class="roles">
        ${(e.roles || []).map((r, i) => roleHtml(r, i, e.roles.length)).join('')}
        <button type="button" class="add-line" data-act="role-add"><span class="material-symbols-rounded">add</span>Add position</button>
      </div>`;
    case 'education': return `
      <div class="grid-only">
        ${fieldHtml('Degree', 'degree', e.degree, 'Bachelor of Science in Computer Science')}
        ${fieldHtml('Institution', 'school', e.school, 'Institut Teknologi Bandung')}
        ${fieldHtml('Location', 'location', e.location, 'Bandung, Indonesia')}
        <div class="f"><label>Start &ndash; End</label>
          <div class="grid-d">
            <input data-k="start" value="${esc(e.start)}" placeholder="2016">
            <input data-k="end" value="${esc(e.end)}" placeholder="2020">
          </div>
        </div>
        <div class="f"><label>Score</label>
          <div class="grid-d">
            <input data-k="scoreLabel" value="${esc(e.scoreLabel)}" placeholder="GPA / IPK / Score">
            <input data-k="score" value="${esc(e.score)}" placeholder="3.75/4.00">
          </div>
        </div>
      </div>
      ${linesHtml('details', e.details, 'Details (optional)', 'Add detail', 'Relevant coursework, honors, thesis')}`;
    case 'skills': return `
      <div class="grid-only">
        ${fieldHtml('Category (optional)', 'label', e.label, 'Programming')}
        ${fieldHtml('Skills (comma separated)', 'items', e.items, 'JavaScript, TypeScript, Python, SQL')}
      </div>`;
    case 'list': return `
      <div class="grid-only">
        ${fieldHtml('Name', 'name', e.name, 'AWS Certified Solutions Architect')}
        ${fieldHtml('Issuer / Detail', 'detail', e.detail, 'Amazon Web Services')}
        ${fieldHtml('Number (optional)', 'num', e.num, 'Credential ID or number')}
        ${fieldHtml('Date', 'date', e.date, '2024')}
      </div>`;
    case 'languages': return `
      <div class="grid-only">
        ${fieldHtml('Language', 'name', e.name, 'English')}
        ${fieldHtml('Proficiency', 'level', e.level, 'Professional working proficiency')}
      </div>`;
    case 'custom': return `
      <div class="grid-only">
        ${fieldHtml('Heading', 'heading', e.heading, 'Award or item name')}
        ${fieldHtml('Sub-heading (optional)', 'sub', e.sub, 'Organization or detail')}
        ${fieldHtml('Date (optional)', 'date', e.date, '2024')}
      </div>
      ${linesHtml('bullets', e.bullets, 'Details', 'Add detail', 'Describe it briefly')}`;
  }
  return '';
}

function sectionBody(sec) {
  if (sec.type === 'summary') {
    return `
      <div class="f"><label>Summary</label>
        <textarea data-k="text" rows="4" placeholder="2–4 sentences about your profession, experience, and strengths.">${esc(sec.text)}</textarea>
      </div>`;
  }
  const entries = (sec.entries || []).map((e, i) => `
    <div class="entry" data-idx="${i}">
      <div class="entry-bar">
        <span class="entry-num">#${i + 1}</span>
        <button type="button" class="icon-btn" data-act="entry-up" ${i === 0 ? 'disabled' : ''} aria-label="Move up"><span class="material-symbols-rounded">arrow_upward</span></button>
        <button type="button" class="icon-btn" data-act="entry-down" ${i === sec.entries.length - 1 ? 'disabled' : ''} aria-label="Move down"><span class="material-symbols-rounded">arrow_downward</span></button>
        <button type="button" class="icon-btn danger" data-act="entry-del" aria-label="Delete entry"><span class="material-symbols-rounded">delete</span></button>
      </div>
      ${entryFieldsHtml(sec.type, e)}
    </div>`).join('');
  return entries + `
    <button type="button" class="add-entry" data-act="entry-add">
      <span class="material-symbols-rounded">add</span> Add ${TYPES[sec.type].entry}
    </button>`;
}

function sectionCard(sec, i, total) {
  const card = document.createElement('div');
  card.className = 'item section-card' + (sec.collapsed ? ' collapsed' : '');
  card.dataset.id = sec.id;
  card.innerHTML = `
    <div class="sec-head">
      <span class="drag-handle material-symbols-rounded" title="Drag to reorder">drag_indicator</span>
      <span class="sec-icon material-symbols-rounded">${sec.icon || 'notes'}</span>
      <input class="sec-title" value="${esc(sec.title)}" spellcheck="false" aria-label="Section title">
      <div class="sec-actions">
        <button type="button" class="icon-btn" data-act="sec-up" ${i === 0 ? 'disabled' : ''} aria-label="Move section up"><span class="material-symbols-rounded">arrow_upward</span></button>
        <button type="button" class="icon-btn" data-act="sec-down" ${i === total - 1 ? 'disabled' : ''} aria-label="Move section down"><span class="material-symbols-rounded">arrow_downward</span></button>
        <button type="button" class="icon-btn danger" data-act="sec-del" aria-label="Delete section"><span class="material-symbols-rounded">delete</span></button>
        <button type="button" class="icon-btn" data-act="collapse" aria-label="Collapse"><span class="material-symbols-rounded">${sec.collapsed ? 'expand_more' : 'expand_less'}</span></button>
      </div>
    </div>
    <div class="sec-body">${sectionBody(sec)}</div>`;
  wireDrag(card);
  return card;
}

function renderSections() {
  const host = document.getElementById('sections');
  host.innerHTML = '';
  data.sections.forEach((sec, i) => host.appendChild(sectionCard(sec, i, data.sections.length)));
}

let dragCard = null;

function wireDrag(card) {
  const handle = card.querySelector('.drag-handle');
  handle.addEventListener('mousedown', () => { card.draggable = true; });
  handle.addEventListener('mouseup', () => { card.draggable = false; });
  card.addEventListener('dragstart', (e) => {
    dragCard = card;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.dataset.id);
  });
  card.addEventListener('dragend', () => {
    card.draggable = false;
    card.classList.remove('dragging');
    dragCard = null;
    const order = [...document.querySelectorAll('#sections .section-card')].map(c => c.dataset.id);
    data.sections.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    renderSections();
    refresh();
  });
}

function wireDropZone() {
  const host = document.getElementById('sections');
  host.addEventListener('dragover', (e) => {
    if (!dragCard) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const cards = [...host.querySelectorAll('.section-card:not(.dragging)')];
    const after = cards.find(c => {
      const r = c.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    if (!after) host.appendChild(dragCard);
    else if (after !== dragCard) host.insertBefore(dragCard, after);
  });
  host.addEventListener('drop', (e) => e.preventDefault());
}

function lineCtx(el) {
  const card = el.closest('.section-card');
  const sec = findSec(card.dataset.id);
  const entryEl = el.closest('.entry');
  const ei = +entryEl.dataset.idx;
  const roleEl = el.closest('.role');
  const key = el.closest('.lines').dataset.lk;
  const lineEl = el.closest('.line');
  const holder = roleEl ? sec.entries[ei].roles[+roleEl.dataset.ridx] : sec.entries[ei];
  return {
    sec, ei, key,
    ri: roleEl ? +roleEl.dataset.ridx : -1,
    li: lineEl ? +lineEl.dataset.line : -1,
    arr: holder[key]
  };
}

function focusLine(secId, ei, ri, key, li, cursorEnd) {
  const roleSel = ri >= 0 ? ` .role[data-ridx="${ri}"]` : '';
  const inp = document.querySelector(
    `.section-card[data-id="${secId}"] .entry[data-idx="${ei}"]${roleSel} .lines[data-lk="${key}"] .line[data-line="${li}"] input`);
  if (inp) {
    inp.focus();
    if (cursorEnd) inp.setSelectionRange(inp.value.length, inp.value.length);
  }
}

function onSectionsInput(e) {
  const t = e.target;
  const card = t.closest('.section-card');
  if (!card) return;
  const sec = findSec(card.dataset.id);
  if (!sec) return;
  if (t.classList.contains('sec-title')) {
    sec.title = t.value;
    refresh();
    return;
  }
  if (t.closest('.line')) {
    const c = lineCtx(t);
    c.arr[c.li] = t.value;
    refresh();
    return;
  }
  const k = t.dataset.k;
  if (!k) return;
  if (sec.type === 'summary') {
    sec.text = t.value;
  } else {
    const entryEl = t.closest('.entry');
    if (!entryEl) return;
    const entry = sec.entries[+entryEl.dataset.idx];
    const roleEl = t.closest('.role');
    if (roleEl) entry.roles[+roleEl.dataset.ridx][k] = t.value;
    else entry[k] = t.value;
  }
  refresh();
}

function onSectionsKeydown(e) {
  const inp = e.target;
  if (inp.tagName !== 'INPUT' || !inp.closest('.line')) return;
  const c = lineCtx(inp);
  if (e.key === 'Enter') {
    e.preventDefault();
    c.arr.splice(c.li + 1, 0, '');
    renderSections();
    refresh();
    focusLine(c.sec.id, c.ei, c.ri, c.key, c.li + 1);
  } else if (e.key === 'Backspace' && inp.value === '' && c.arr.length > 1) {
    e.preventDefault();
    c.arr.splice(c.li, 1);
    renderSections();
    refresh();
    focusLine(c.sec.id, c.ei, c.ri, c.key, Math.max(0, c.li - 1), true);
  }
}

function moveSection(sec, dir) {
  const idx = data.sections.indexOf(sec);
  const to = idx + dir;
  if (to < 0 || to >= data.sections.length) return;
  data.sections.splice(idx, 1);
  data.sections.splice(to, 0, sec);
}

function moveItem(arr, i, dir) {
  const to = i + dir;
  if (to < 0 || to >= arr.length) return;
  [arr[to], arr[i]] = [arr[i], arr[to]];
}

function onSectionsClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn || btn.disabled) return;
  const act = btn.dataset.act;
  if (act === 'collapse') return;
  const card = btn.closest('.section-card');
  const sec = findSec(card.dataset.id);
  if (!sec) return;
  const idx = data.sections.indexOf(sec);

  if (act === 'line-add' || act === 'line-del') {
    if (act === 'line-add') {
      const entryEl = btn.closest('.entry');
      const ei = +entryEl.dataset.idx;
      const roleEl = btn.closest('.role');
      const ri = roleEl ? +roleEl.dataset.ridx : -1;
      const key = btn.closest('.lines').dataset.lk;
      const holder = roleEl ? sec.entries[ei].roles[ri] : sec.entries[ei];
      holder[key].push('');
      renderSections();
      refresh();
      focusLine(sec.id, ei, ri, key, holder[key].length - 1);
    } else {
      const c = lineCtx(btn);
      c.arr.splice(c.li, 1);
      renderSections();
      refresh();
    }
    return;
  }

  const entryEl = btn.closest('.entry');
  const ei = entryEl ? +entryEl.dataset.idx : -1;

  if (act === 'sec-up' || act === 'sec-down') {
    moveSection(sec, act === 'sec-up' ? -1 : 1);
  } else if (act === 'sec-del') {
    if (!confirm(`Delete section "${sec.title || 'Untitled'}"?`)) return;
    data.sections.splice(idx, 1);
  } else if (act === 'entry-add') {
    sec.entries.push(newEntry(sec.type));
  } else if (act === 'entry-del') {
    if (!confirm('Delete this entry?')) return;
    sec.entries.splice(ei, 1);
  } else if (act === 'entry-up') {
    moveItem(sec.entries, ei, -1);
  } else if (act === 'entry-down') {
    moveItem(sec.entries, ei, 1);
  } else if (act === 'role-add') {
    sec.entries[ei].roles.push(newRole());
  } else if (act === 'role-del' || act === 'role-up' || act === 'role-down') {
    const ri = +btn.closest('.role').dataset.ridx;
    if (act === 'role-del') {
      if (!confirm('Delete this position?')) return;
      sec.entries[ei].roles.splice(ri, 1);
    } else {
      moveItem(sec.entries[ei].roles, ri, act === 'role-up' ? -1 : 1);
    }
  }
  renderSections();
  refresh();
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act="collapse"]');
  if (!btn) return;
  const card = btn.closest('.section-card');
  const collapsed = card.classList.toggle('collapsed');
  btn.querySelector('.material-symbols-rounded').textContent = collapsed ? 'expand_more' : 'expand_less';
  const sec = card.dataset.id ? findSec(card.dataset.id) : null;
  if (sec) { sec.collapsed = collapsed; save(); }
});

function block(cls, html, keep) {
  const d = document.createElement('div');
  d.className = cls;
  d.innerHTML = html;
  if (keep) d.dataset.keep = '1';
  return d;
}

function rowHtml(left, right) {
  return right
    ? `<div class="pv-row"><div class="pv-left">${left}</div><div class="pv-date">${right}</div></div>`
    : `<div class="pv-row"><div class="pv-left">${left}</div></div>`;
}

function ed(secId, key, value, ph, opts) {
  opts = opts || {};
  const idx = opts.ei !== undefined ? ` data-eidx="${opts.ei}"` : '';
  const ridx = opts.ri !== undefined ? ` data-ridx="${opts.ri}"` : '';
  const line = opts.line !== undefined ? ` data-eline="${opts.line}"` : '';
  const ml = opts.ml ? ' data-ml="1"' : '';
  const cls = 'pv-edit' + (opts.cls ? ' ' + opts.cls : '');
  const tag = opts.blockEl ? 'div' : 'span';
  return `<${tag} class="${cls}" contenteditable="plaintext-only" spellcheck="false"` +
    ` data-esec="${secId}" data-ekey="${key}"${idx}${ridx}${line}${ml} data-ph="${esc(ph)}">${esc(value || '')}</${tag}>`;
}

function toolBtn(act, icon, title, danger) {
  return `<button type="button" data-pact="${act}" title="${title}"${danger ? ' class="dngr"' : ''}><span class="material-symbols-rounded">${icon}</span></button>`;
}

function secToolsHtml(sec) {
  const hasEntries = sec.type !== 'summary';
  return `<span class="pv-tools" contenteditable="false">
    ${toolBtn('sec-up', 'arrow_upward', 'Move section up')}
    ${toolBtn('sec-down', 'arrow_downward', 'Move section down')}
    ${hasEntries ? toolBtn('entry-add', 'add', 'Add ' + TYPES[sec.type].entry) : ''}
    ${toolBtn('sec-del', 'delete', 'Delete section', true)}
  </span>`;
}

function entryToolsHtml(withRole) {
  return `<span class="pv-tools" contenteditable="false">
    ${toolBtn('entry-up', 'arrow_upward', 'Move entry up')}
    ${toolBtn('entry-down', 'arrow_downward', 'Move entry down')}
    ${withRole ? toolBtn('role-add', 'person_add', 'Add position') : ''}
    ${toolBtn('entry-del', 'delete', 'Delete entry', true)}
  </span>`;
}

function roleToolsHtml() {
  return `<span class="pv-tools" contenteditable="false">
    ${toolBtn('role-up', 'arrow_upward', 'Move position up')}
    ${toolBtn('role-down', 'arrow_downward', 'Move position down')}
    ${toolBtn('role-del', 'delete', 'Delete position', true)}
  </span>`;
}

function liBlock(text, sub) {
  return block('pv-li' + (sub ? ' pv-ind' : ''), `<span class="pv-b">•</span><div class="pv-lt">${esc(text)}</div>`);
}

function liBlockEdit(secId, key, opts, j, text, ph, sub) {
  const o = Object.assign({}, opts, { line: j, cls: 'pv-lt', blockEl: true });
  return block('pv-li' + (sub ? ' pv-ind' : ''), `<span class="pv-b">•</span>${ed(secId, key, text, ph, o)}`);
}

function entryBlocks(head, sub, dateTxt, bullets, indent) {
  const out = [];
  let h = rowHtml(`<span class="pv-strong">${esc(head)}</span>`, esc(dateTxt));
  if (sub) h += `<div class="pv-sub">${esc(sub)}</div>`;
  out.push(block('pv-eh' + (indent ? ' pv-ind' : ''), h, bullets.length > 0));
  bullets.forEach(t => out.push(liBlock(t, indent)));
  return out;
}

function ownerBlock(cls, html, sec, ei, ri, keep) {
  const b = block(cls + ' pv-owner', html, keep);
  b.dataset.sec = sec.id;
  if (ei !== undefined) b.dataset.eidx = ei;
  if (ri !== undefined) b.dataset.ridx = ri;
  return b;
}

function roleRowEdit(sec, ei, r, ri, indent) {
  const s = sec.id;
  const o = { ei, ri };
  const date = `<span class="pv-date">${ed(s, 'start', r.start, T('Start', 'Mulai'), o)}<span class="pv-sep"> – </span>${ed(s, 'end', r.end, T('End', 'Selesai'), o)}</span>`;
  const h = `<div class="pv-row"><div class="pv-left"><span class="pv-strong">${ed(s, 'role', r.role, T('Position title', 'Nama posisi'), o)}</span></div>${date}</div>`;
  return { h, o };
}

function expBlocksEdit(sec, e, ei) {
  const out = [];
  const s = sec.id;
  const multi = (e.roles || []).length > 1;
  if (!multi) {
    const r = e.roles[0];
    const { h } = roleRowEdit(sec, ei, r, 0);
    const sub = `<div class="pv-sub">${ed(s, 'company', e.company, T('Company / organization', 'Perusahaan / organisasi'), { ei })}<span class="pv-sep">, </span>${ed(s, 'location', e.location, T('Location', 'Lokasi'), { ei })}</div>`;
    out.push(ownerBlock('pv-eh', h + sub + entryToolsHtml(true), sec, ei, undefined, true));
    const lines = (r.bullets && r.bullets.length) ? r.bullets : [''];
    lines.forEach((t, j) => out.push(liBlockEdit(s, 'bullets', { ei, ri: 0 }, j, t, T('Achievement or responsibility', 'Pencapaian atau tanggung jawab'))));
    return out;
  }
  const org = `<div class="pv-row"><div class="pv-left"><span class="pv-strong">${ed(s, 'company', e.company, T('Company / organization', 'Perusahaan / organisasi'), { ei })}</span><span class="pv-sep">, </span>${ed(s, 'location', e.location, T('Location', 'Lokasi'), { ei })}</div></div>`;
  out.push(ownerBlock('pv-eh', org + entryToolsHtml(true), sec, ei, undefined, true));
  e.roles.forEach((r, ri) => {
    const { h } = roleRowEdit(sec, ei, r, ri, true);
    out.push(ownerBlock('pv-eh pv-ind', h + roleToolsHtml(), sec, ei, ri, true));
    const lines = (r.bullets && r.bullets.length) ? r.bullets : [''];
    lines.forEach((t, j) => out.push(liBlockEdit(s, 'bullets', { ei, ri }, j, t, T('Achievement or responsibility', 'Pencapaian atau tanggung jawab'), true)));
  });
  return out;
}

function eduBlocksEdit(sec, e, ei) {
  const out = [];
  const s = sec.id;
  const o = { ei };
  const date = `<span class="pv-date">${ed(s, 'start', e.start, T('Start', 'Mulai'), o)}<span class="pv-sep"> – </span>${ed(s, 'end', e.end, T('End', 'Selesai'), o)}</span>`;
  let h = `<div class="pv-row"><div class="pv-left"><span class="pv-strong">${ed(s, 'degree', e.degree, T('Degree / field of study', 'Gelar / bidang studi'), o)}</span></div>${date}</div>`;
  h += `<div class="pv-sub">${ed(s, 'school', e.school, T('Institution', 'Institusi'), o)}<span class="pv-sep">, </span>${ed(s, 'location', e.location, T('Location', 'Lokasi'), o)}<span class="pv-sep"> | </span>${ed(s, 'scoreLabel', e.scoreLabel, T('GPA', 'IPK'), o)}<span class="pv-sep">: </span>${ed(s, 'score', e.score, T('Score', 'Skor'), o)}</div>`;
  out.push(ownerBlock('pv-eh', h + entryToolsHtml(), sec, ei, undefined, true));
  const lines = (e.details && e.details.length) ? e.details : [''];
  lines.forEach((t, j) => out.push(liBlockEdit(s, 'details', o, j, t, T('Additional detail', 'Detail tambahan'))));
  return out;
}

function customBlocksEdit(sec, e, ei) {
  const out = [];
  const s = sec.id;
  const o = { ei };
  const date = `<span class="pv-date">${ed(s, 'date', e.date, T('Date', 'Tanggal'), o)}</span>`;
  let h = `<div class="pv-row"><div class="pv-left"><span class="pv-strong">${ed(s, 'heading', e.heading, T('Item name', 'Nama item'), o)}</span></div>${date}</div>`;
  h += `<div class="pv-sub">${ed(s, 'sub', e.sub, T('Sub-heading', 'Sub-judul'), o)}</div>`;
  out.push(ownerBlock('pv-eh', h + entryToolsHtml(), sec, ei, undefined, true));
  const lines = (e.bullets && e.bullets.length) ? e.bullets : [''];
  lines.forEach((t, j) => out.push(liBlockEdit(s, 'bullets', o, j, t, T('Short description', 'Deskripsi singkat'))));
  return out;
}

function sectionBlocks(sec, editing) {
  const out = [];
  const s = sec.id;
  switch (sec.type) {
    case 'summary':
      if (editing) {
        out.push(block('pv-p', ed(s, 'text', sec.text, T('Write a short professional summary', 'Tulis ringkasan profesional singkat'), { ml: true, blockEl: true })));
      } else {
        String(sec.text || '').split('\n').map(t => t.trim()).filter(Boolean)
          .forEach(t => out.push(block('pv-p', esc(t))));
      }
      break;
    case 'skills':
      if (editing) {
        (sec.entries || []).forEach((e, ei) => {
          out.push(ownerBlock('pv-p',
            `<span class="pv-strong">${ed(s, 'label', e.label, T('Category', 'Kategori'), { ei })}<span class="pv-sep">:</span></span> ${ed(s, 'items', e.items, T('List of skills', 'Daftar keahlian'), { ei })}` + entryToolsHtml(), sec, ei));
        });
      } else {
        (sec.entries || []).filter(e => ((e.items || '') + (e.label || '')).trim()).forEach(e => {
          const label = (e.label || '').trim();
          out.push(block('pv-p', label ? `<span class="pv-strong">${esc(label)}:</span> ${esc(e.items)}` : esc(e.items)));
        });
      }
      break;
    case 'languages':
      if (editing) {
        (sec.entries || []).forEach((e, ei) => {
          out.push(ownerBlock('pv-p',
            `${ed(s, 'name', e.name, T('Language', 'Bahasa'), { ei })}<span class="pv-sep"> (</span>${ed(s, 'level', e.level, T('Proficiency', 'Tingkat kemahiran'), { ei })}<span class="pv-sep">)</span>` + entryToolsHtml(), sec, ei));
        });
      } else {
        const line = (sec.entries || [])
          .filter(e => (e.name || '').trim())
          .map(e => (e.level || '').trim() ? `${e.name.trim()} (${e.level.trim()})` : e.name.trim())
          .join(', ');
        if (line) out.push(block('pv-p', esc(line)));
      }
      break;
    case 'list':
      if (editing) {
        (sec.entries || []).forEach((e, ei) => {
          out.push(ownerBlock('pv-row-block', rowHtml(
            `<span class="pv-strong">${ed(s, 'name', e.name, T('Name', 'Nama'), { ei })}</span><span class="pv-sep">, </span>${ed(s, 'detail', e.detail, T('Issuer / detail', 'Penerbit / detail'), { ei })}<span class="pv-sep"> (${numLabel()}: </span>${ed(s, 'num', e.num, T('Number', 'Nomor'), { ei })}<span class="pv-sep">)</span>`,
            ed(s, 'date', e.date, T('Year', 'Tahun'), { ei })) + entryToolsHtml(), sec, ei));
        });
      } else {
        (sec.entries || []).filter(e => ((e.name || '') + (e.detail || '') + (e.num || '') + (e.date || '')).trim()).forEach(e => {
          const name = (e.name || '').trim(), detail = (e.detail || '').trim(), num = (e.num || '').trim();
          const left = `<span class="pv-strong">${esc(name)}</span>${name && detail ? ', ' : ''}${esc(detail)}${num ? ` (${numLabel()}: ${esc(num)})` : ''}`;
          out.push(block('pv-row-block', rowHtml(left, esc((e.date || '').trim()))));
        });
      }
      break;
    case 'experience':
      if (editing) {
        (sec.entries || []).forEach((e, ei) => out.push(...expBlocksEdit(sec, e, ei)));
      } else {
        (sec.entries || []).filter(expHasContent).forEach(e => {
          const roles = (e.roles || []).filter(roleHasContent);
          const useRoles = roles.length ? roles : (e.roles || []).slice(0, 1);
          if (useRoles.length <= 1) {
            const r = useRoles[0] || newRole();
            out.push(...entryBlocks(r.role, joinComma(e.company, e.location), dateRange(r.start, r.end), bulletLines(r.bullets)));
          } else {
            out.push(block('pv-eh', rowHtml(`<span class="pv-strong">${esc(e.company)}</span>${(e.location || '').trim() ? ', ' + esc(e.location) : ''}`, ''), true));
            useRoles.forEach(r => {
              out.push(...entryBlocks(r.role, '', dateRange(r.start, r.end), bulletLines(r.bullets), true));
            });
          }
        });
      }
      break;
    case 'education':
      if (editing) {
        (sec.entries || []).forEach((e, ei) => out.push(...eduBlocksEdit(sec, e, ei)));
      } else {
        (sec.entries || []).filter(e => ((e.degree || '') + (e.school || '') + (e.score || '') + bulletLines(e.details).join('')).trim()).forEach(e => {
          out.push(...entryBlocks(e.degree, eduSub(e), dateRange(e.start, e.end), bulletLines(e.details)));
        });
      }
      break;
    case 'custom':
      if (editing) {
        (sec.entries || []).forEach((e, ei) => out.push(...customBlocksEdit(sec, e, ei)));
      } else {
        (sec.entries || []).filter(e => ((e.heading || '') + (e.sub || '') + bulletLines(e.bullets).join('')).trim()).forEach(e => {
          out.push(...entryBlocks(e.heading, (e.sub || '').trim(), (e.date || '').trim(), bulletLines(e.bullets)));
        });
      }
      break;
  }
  return out;
}

function buildBlocks(editing) {
  const B = [];
  const p = data.personal;
  const namePh = T('Full name', 'Nama lengkap');
  let h;
  if (editing) {
    const sep = '<span class="pv-sep"> | </span>';
    h = `<div class="pv-name">${ed('personal', 'name', p.name, namePh)}</div>` +
      `<div class="pv-headline">${ed('personal', 'title', p.title, T('Job title / profession', 'Jabatan / profesi'))}</div>` +
      `<div class="pv-contact">${ed('personal', 'city', p.city, T('City', 'Kota'))}<span class="pv-sep">, </span>${ed('personal', 'country', p.country, T('Country', 'Negara'))}${sep}${ed('personal', 'phone', p.phone, T('Phone', 'Telepon'))}${sep}${ed('personal', 'email', p.email, 'Email')}${sep}${ed('personal', 'linkedin', p.linkedin, 'LinkedIn')}${sep}${ed('personal', 'website', p.website, 'Website')}</div>`;
  } else {
    const contact = contactLine();
    h = `<div class="pv-name">${(p.name || '').trim() ? esc(p.name) : `<span class="pv-ph">${namePh}</span>`}</div>`;
    if ((p.title || '').trim()) h += `<div class="pv-headline">${esc(p.title)}</div>`;
    if (contact) h += `<div class="pv-contact">${esc(contact)}</div>`;
  }
  B.push(block('pv-header', h));

  data.sections.forEach(sec => {
    const content = sectionBlocks(sec, editing);
    const title = (sec.title || '').trim();
    if (!editing && !title && !content.length) return;
    if (editing) {
      const hb = ownerBlock('pv-h', ed(sec.id, 'title', sec.title, T('SECTION TITLE', 'JUDUL BAGIAN')) + secToolsHtml(sec), sec, undefined, undefined, true);
      B.push(hb);
    } else if (title) {
      B.push(block('pv-h', esc(title), true));
    }
    B.push(...content);
  });
  return B;
}

let lastScale = 1;
let userZoom = 1;
const Z_MIN = 0.5;
const Z_MAX = 3;

function newPage() {
  const s = data.settings;
  const slot = document.createElement('div');
  slot.className = 'page-slot';
  const page = document.createElement('div');
  page.className = 'page';
  page.style.fontFamily = FONT_STACKS[s.font] || s.font;
  page.style.fontSize = s.size + 'pt';
  page.style.padding = MARGINS[s.margin] + 'mm';
  page.style.setProperty('--pm', MARGINS[s.margin] + 'mm');
  const inner = document.createElement('div');
  inner.className = 'page-inner';
  page.appendChild(inner);
  slot.appendChild(page);
  return { slot, inner, page };
}

function renderPreview() {
  const pages = document.getElementById('pages');
  const editing = data.settings.mode === 'paper' && !cleanPrint;
  pages.innerHTML = '';
  const blocks = buildBlocks(editing);
  let pg = newPage();
  pages.appendChild(pg.slot);

  blocks.forEach(b => {
    pg.inner.appendChild(b);
    if (pg.inner.scrollHeight > pg.inner.clientHeight + 1) {
      const moved = [b];
      let prev = b.previousElementSibling;
      while (prev && prev.dataset.keep === '1') {
        moved.unshift(prev);
        prev = prev.previousElementSibling;
      }
      if (moved.length < pg.inner.children.length) {
        pg = newPage();
        pages.appendChild(pg.slot);
        moved.forEach(m => pg.inner.appendChild(m));
      }
    }
  });

  fitScale();
}

function fitScale() {
  const pages = document.getElementById('pages');
  const cs = getComputedStyle(pages);
  const avail = pages.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    - (data.settings.mode === 'paper' ? 52 : 0);
  if (avail <= 0) return;
  const pw = PAGE_W_MM * PX_PER_MM;
  const ph = PAGE_H_MM * PX_PER_MM;
  lastScale = Math.min(1, avail / pw) * userZoom;
  const w = pw * lastScale;
  pages.querySelectorAll('.page-slot').forEach(slot => {
    slot.style.width = w + 'px';
    slot.style.height = ph * lastScale + 'px';
    slot.style.marginLeft = w > avail ? '0' : 'auto';
    slot.style.marginRight = w > avail ? '0' : 'auto';
    slot.querySelector('.page').style.transform = lastScale !== 1 ? `scale(${lastScale})` : '';
  });
  updatePvBar();
}

const pagesEl = document.getElementById('pages');
let repagTimer;
let pinch = null;

function touchDist(e) {
  const a = e.touches[0], b = e.touches[1];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

pagesEl.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) pinch = { d: touchDist(e), z: userZoom };
}, { passive: true });

pagesEl.addEventListener('touchmove', (e) => {
  if (pinch && e.touches.length === 2) {
    e.preventDefault();
    userZoom = Math.min(Z_MAX, Math.max(1, pinch.z * touchDist(e) / pinch.d));
    fitScale();
  }
}, { passive: false });

pagesEl.addEventListener('touchend', (e) => {
  if (e.touches.length < 2) pinch = null;
});

function setZoom(z) {
  userZoom = Math.min(Z_MAX, Math.max(Z_MIN, z));
  fitScale();
}

function currentPage(slots) {
  const mid = pagesEl.scrollTop + pagesEl.clientHeight / 2;
  let cur = 0;
  slots.forEach((s, i) => { if (s.offsetTop <= mid) cur = i; });
  return cur;
}

function updatePvBar() {
  const ind = document.getElementById('page-ind');
  if (!ind) return;
  const slots = [...pagesEl.querySelectorAll('.page-slot')];
  const cur = slots.length ? currentPage(slots) : 0;
  ind.textContent = (cur + 1) + ' / ' + Math.max(1, slots.length);
  document.getElementById('pg-prev').disabled = cur <= 0;
  document.getElementById('pg-next').disabled = cur >= slots.length - 1;
  document.getElementById('zoom-out').disabled = userZoom <= Z_MIN;
  document.getElementById('zoom-in').disabled = userZoom >= Z_MAX;
  document.getElementById('zoom-pct').textContent = Math.round(lastScale * 100) + '%';
}

function goPage(dir) {
  const slots = [...pagesEl.querySelectorAll('.page-slot')];
  if (!slots.length) return;
  const t = Math.min(slots.length - 1, Math.max(0, currentPage(slots) + dir));
  pagesEl.scrollTo({ top: Math.max(0, slots[t].offsetTop - 16), behavior: 'smooth' });
}

function setView(v) {
  document.querySelector('.cv-layout').dataset.view = v;
  document.querySelectorAll('#view-bar .view-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.view === v));
  requestAnimationFrame(fitScale);
}

document.getElementById('pg-prev').addEventListener('click', () => goPage(-1));
document.getElementById('pg-next').addEventListener('click', () => goPage(1));
document.getElementById('zoom-in').addEventListener('click', () => setZoom(userZoom * 1.2));
document.getElementById('zoom-out').addEventListener('click', () => setZoom(userZoom / 1.2));
document.getElementById('zoom-pct').addEventListener('click', () => setZoom(1));
pagesEl.addEventListener('scroll', () => requestAnimationFrame(updatePvBar), { passive: true });
pagesEl.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  setZoom(userZoom * (e.deltaY < 0 ? 1.08 : 0.93));
}, { passive: false });

function paperText(el) {
  const t = el.innerText;
  return el.dataset.ml === '1' ? t.replace(/\n+$/, '') : t.replace(/\n/g, ' ');
}

function caretToEnd(el) {
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
}

function focusPaperEdit(selector) {
  const el = pagesEl.querySelector(selector);
  if (el) {
    el.focus();
    caretToEnd(el);
  }
}

function paperCtx(el) {
  const secId = el.dataset.esec;
  return {
    secId,
    key: el.dataset.ekey,
    sec: secId === 'personal' ? null : findSec(secId),
    ei: el.dataset.eidx !== undefined ? +el.dataset.eidx : -1,
    ri: el.dataset.ridx !== undefined ? +el.dataset.ridx : -1,
    line: el.dataset.eline !== undefined ? +el.dataset.eline : -1
  };
}

function paperHolder(c) {
  const entry = c.sec.entries[c.ei];
  return c.ri >= 0 ? entry.roles[c.ri] : entry;
}

function onPaperInput(e) {
  const el = e.target.closest('.pv-edit');
  if (!el) return;
  const c = paperCtx(el);
  const text = paperText(el);
  if (c.secId === 'personal') {
    data.personal[c.key] = text;
  } else if (!c.sec) {
    return;
  } else if (c.key === 'title') {
    c.sec.title = text;
  } else if (c.key === 'text') {
    c.sec.text = text;
  } else if (c.line >= 0) {
    paperHolder(c)[c.key][c.line] = text;
  } else {
    paperHolder(c)[c.key] = text;
  }
  save();
}

function onPaperKeydown(e) {
  const el = e.target.closest('.pv-edit');
  if (!el) return;
  const c = paperCtx(el);
  const isBullet = c.line >= 0;

  if (e.key === 'Enter') {
    if (el.dataset.ml === '1') return;
    e.preventDefault();
    if (isBullet) {
      const arr = paperHolder(c)[c.key];
      if (!arr.length) arr.push(paperText(el));
      arr.splice(c.line + 1, 0, '');
      save();
      renderPreview();
      const rsel = c.ri >= 0 ? `[data-ridx="${c.ri}"]` : ':not([data-ridx])';
      focusPaperEdit(`.pv-edit[data-esec="${c.secId}"][data-ekey="${c.key}"][data-eidx="${c.ei}"]${rsel}[data-eline="${c.line + 1}"]`);
    } else {
      el.blur();
    }
  } else if (e.key === 'Backspace' && isBullet && paperText(el).trim() === '') {
    const arr = paperHolder(c)[c.key];
    if (arr.length > 1) {
      e.preventDefault();
      arr.splice(c.line, 1);
      save();
      renderPreview();
      const rsel = c.ri >= 0 ? `[data-ridx="${c.ri}"]` : ':not([data-ridx])';
      focusPaperEdit(`.pv-edit[data-esec="${c.secId}"][data-ekey="${c.key}"][data-eidx="${c.ei}"]${rsel}[data-eline="${Math.max(0, c.line - 1)}"]`);
    }
  }
}

function onPaperToolClick(e) {
  const btn = e.target.closest('[data-pact]');
  if (!btn) return;
  const holder = btn.closest('[data-sec]');
  const sec = findSec(holder.dataset.sec);
  if (!sec) return;
  const act = btn.dataset.pact;
  const ei = holder.dataset.eidx !== undefined ? +holder.dataset.eidx : -1;
  const ri = holder.dataset.ridx !== undefined ? +holder.dataset.ridx : -1;

  if (act === 'sec-up') moveSection(sec, -1);
  else if (act === 'sec-down') moveSection(sec, 1);
  else if (act === 'sec-del') {
    if (!confirm(`Delete section "${sec.title || 'Untitled'}"?`)) return;
    data.sections.splice(data.sections.indexOf(sec), 1);
  } else if (act === 'entry-add') {
    sec.entries.push(newEntry(sec.type));
  } else if (act === 'entry-del') {
    if (!confirm('Delete this entry?')) return;
    sec.entries.splice(ei, 1);
  } else if (act === 'entry-up') moveItem(sec.entries, ei, -1);
  else if (act === 'entry-down') moveItem(sec.entries, ei, 1);
  else if (act === 'role-add') sec.entries[ei].roles.push(newRole());
  else if (act === 'role-del') {
    if (sec.entries[ei].roles.length <= 1) return;
    if (!confirm('Delete this position?')) return;
    sec.entries[ei].roles.splice(ri, 1);
  } else if (act === 'role-up') moveItem(sec.entries[ei].roles, ri, -1);
  else if (act === 'role-down') moveItem(sec.entries[ei].roles, ri, 1);

  save();
  renderSections();
  renderPreview();
}

pagesEl.addEventListener('input', onPaperInput);
pagesEl.addEventListener('keydown', onPaperKeydown);
pagesEl.addEventListener('click', onPaperToolClick);
pagesEl.addEventListener('mousedown', (e) => {
  if (e.target.closest('.pv-tools')) e.preventDefault();
});
pagesEl.addEventListener('focusout', (e) => {
  if (!(e.target instanceof Element) || !e.target.closest('.pv-edit')) return;
  clearTimeout(repagTimer);
  repagTimer = setTimeout(renderPreview, 250);
});
pagesEl.addEventListener('focusin', (e) => {
  if (e.target instanceof Element && e.target.closest('.pv-edit')) clearTimeout(repagTimer);
});

function applyMode() {
  const paper = data.settings.mode === 'paper';
  document.body.classList.toggle('paper-mode', paper);
  document.querySelectorAll('.mode-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.mode === data.settings.mode));
  setView(paper ? 'preview' : 'edit');
  renderPreview();
}

document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (data.settings.mode === btn.dataset.mode) return;
    data.settings.mode = btn.dataset.mode;
    save();
    if (data.settings.mode === 'form') {
      bindPersonal();
      renderSections();
    }
    closeOverlays();
    applyMode();
  });
});

function fileBase() {
  const name = (data.personal.name || '').replace(/[\\/:*?"<>|]/g, '').trim();
  return name ? name + ' - CV' : 'CV';
}

window.addEventListener('beforeprint', () => {
  if (data.settings.mode === 'paper') {
    cleanPrint = true;
    renderPreview();
  }
});
window.addEventListener('afterprint', () => {
  if (cleanPrint) {
    cleanPrint = false;
    renderPreview();
  }
});

function downloadPdf() {
  const prev = document.title;
  document.title = fileBase();
  showNotification('Choose "Save as PDF" in the print dialog', 'info');
  setTimeout(() => {
    window.print();
    document.title = prev;
  }, 350);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(u8) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function zipStore(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  files.forEach(f => {
    const nameU8 = enc.encode(f.name);
    const dataU8 = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(dataU8);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0, true);
    lh.setUint16(8, 0, true);
    lh.setUint16(10, 0, true);
    lh.setUint16(12, 0x21, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, dataU8.length, true);
    lh.setUint32(22, dataU8.length, true);
    lh.setUint16(26, nameU8.length, true);
    lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), nameU8, dataU8);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0, true);
    ch.setUint16(10, 0, true);
    ch.setUint16(12, 0, true);
    ch.setUint16(14, 0x21, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, dataU8.length, true);
    ch.setUint32(24, dataU8.length, true);
    ch.setUint16(28, nameU8.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), nameU8);
    offset += 30 + nameU8.length + dataU8.length;
  });
  let cdSize = 0;
  central.forEach(u => { cdSize += u.length; });
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, files.length, true);
  eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, cdSize, true);
  eocd.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(eocd.buffer)]);
}

function xesc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function docxRun(r) {
  if (r.tab) return '<w:r><w:tab/></w:r>';
  let rPr = `<w:rFonts w:ascii="${DOCX_FONT}" w:hAnsi="${DOCX_FONT}" w:cs="${DOCX_FONT}"/>`;
  if (r.b) rPr += '<w:b/>';
  const sz = Math.round((r.sz || DOCX_BASE) * 2);
  rPr += `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>`;
  return `<w:r><w:rPr>${rPr}</w:rPr><w:t xml:space="preserve">${xesc(r.t)}</w:t></w:r>`;
}

function docxP(runs, o) {
  o = o || {};
  let pPr = '';
  if (o.num) pPr += '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>';
  if (o.border) pPr += '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="444444"/></w:pBdr>';
  if (o.tabsRight) pPr += `<w:tabs><w:tab w:val="right" w:pos="${o.tabsRight}"/></w:tabs>`;
  if (o.before !== undefined || o.after !== undefined) {
    pPr += `<w:spacing w:before="${o.before || 0}" w:after="${o.after || 0}" w:line="300" w:lineRule="auto"/>`;
  }
  if (o.indLeft) pPr += `<w:ind w:left="${o.indLeft}"${o.hang ? ` w:hanging="${o.hang}"` : ''}/>`;
  if (o.jc) pPr += `<w:jc w:val="${o.jc}"/>`;
  const body = runs.filter(r => r.tab || (r.t || '') !== '').map(docxRun).join('');
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${body}</w:p>`;
}

let DOCX_FONT = 'Arial';
let DOCX_BASE = 11;

function buildDocx() {
  const s = data.settings;
  const p = data.personal;
  DOCX_FONT = s.font;
  DOCX_BASE = parseFloat(s.size);
  const mTw = Math.round(MARGINS[s.margin] / 25.4 * 1440);
  const contentTw = 11906 - 2 * mTw;
  const P = [];

  if ((p.name || '').trim()) P.push(docxP([{ t: p.name.trim(), b: 1, sz: DOCX_BASE + 7 }], { jc: 'center', after: 20 }));
  if ((p.title || '').trim()) P.push(docxP([{ t: p.title.trim(), sz: DOCX_BASE + 1 }], { jc: 'center', after: 20 }));
  const contact = contactLine();
  if (contact) P.push(docxP([{ t: contact, sz: Math.max(DOCX_BASE - 1, 8) }], { jc: 'center', after: 60 }));

  const bullets = (lines, ind) => lines.forEach(t =>
    P.push(docxP([{ t }], { num: 1, after: 30, indLeft: ind ? 480 : 252, hang: 252 })));
  const headRow = (left, right, ind) =>
    P.push(docxP([{ t: left, b: 1 }, { tab: 1 }, { t: right }], { tabsRight: contentTw, before: 60, after: 20, indLeft: ind ? 200 : 0 }));
  const subRow = (t, ind) => { if (t) P.push(docxP([{ t }], { after: 20, indLeft: ind ? 200 : 0 })); };

  data.sections.forEach(sec => {
    const title = (sec.title || '').trim();
    const parts = [];
    switch (sec.type) {
      case 'summary':
        String(sec.text || '').split('\n').map(t => t.trim()).filter(Boolean)
          .forEach(t => parts.push(() => P.push(docxP([{ t }], { after: 60 }))));
        break;
      case 'skills':
        (sec.entries || []).filter(e => ((e.items || '') + (e.label || '')).trim()).forEach(e => {
          const label = (e.label || '').trim();
          parts.push(() => P.push(docxP(label
            ? [{ t: label + ': ', b: 1 }, { t: e.items || '' }]
            : [{ t: e.items || '' }], { after: 40 })));
        });
        break;
      case 'languages': {
        const line = (sec.entries || [])
          .filter(e => (e.name || '').trim())
          .map(e => (e.level || '').trim() ? `${e.name.trim()} (${e.level.trim()})` : e.name.trim())
          .join(', ');
        if (line) parts.push(() => P.push(docxP([{ t: line }], { after: 40 })));
        break;
      }
      case 'list':
        (sec.entries || []).filter(e => ((e.name || '') + (e.detail || '') + (e.num || '') + (e.date || '')).trim()).forEach(e => {
          const name = (e.name || '').trim(), detail = (e.detail || '').trim(), num = (e.num || '').trim();
          parts.push(() => P.push(docxP([
            { t: name, b: 1 },
            { t: name && detail ? ', ' + detail : detail },
            { t: num ? ` (${numLabel()}: ${num})` : '' },
            { tab: 1 },
            { t: (e.date || '').trim() }
          ], { tabsRight: contentTw, after: 30 })));
        });
        break;
      case 'experience':
        (sec.entries || []).filter(expHasContent).forEach(e => {
          const roles = (e.roles || []).filter(roleHasContent);
          const useRoles = roles.length ? roles : (e.roles || []).slice(0, 1);
          if (useRoles.length <= 1) {
            const r = useRoles[0] || newRole();
            parts.push(() => {
              headRow(r.role || '', dateRange(r.start, r.end));
              subRow(joinComma(e.company, e.location));
              bullets(bulletLines(r.bullets));
            });
          } else {
            parts.push(() => {
              P.push(docxP([
                { t: (e.company || '').trim(), b: 1 },
                { t: (e.location || '').trim() ? ', ' + e.location.trim() : '' }
              ], { before: 60, after: 20 }));
              useRoles.forEach(r => {
                headRow(r.role || '', dateRange(r.start, r.end), true);
                bullets(bulletLines(r.bullets), true);
              });
            });
          }
        });
        break;
      case 'education':
        (sec.entries || []).filter(e => ((e.degree || '') + (e.school || '') + (e.score || '') + bulletLines(e.details).join('')).trim()).forEach(e => {
          parts.push(() => {
            headRow(e.degree || '', dateRange(e.start, e.end));
            subRow(eduSub(e));
            bullets(bulletLines(e.details));
          });
        });
        break;
      case 'custom':
        (sec.entries || []).filter(e => ((e.heading || '') + (e.sub || '') + bulletLines(e.bullets).join('')).trim()).forEach(e => {
          parts.push(() => {
            headRow(e.heading || '', (e.date || '').trim());
            subRow((e.sub || '').trim());
            bullets(bulletLines(e.bullets));
          });
        });
        break;
    }
    if (!title && !parts.length) return;
    P.push(docxP([{ t: title.toUpperCase(), b: 1, sz: DOCX_BASE + 1 }], { border: 1, before: 200, after: 80 }));
    parts.forEach(fn => fn());
  });

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${P.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="${mTw}" w:right="${mTw}" w:bottom="${mTw}" w:left="${mTw}" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${DOCX_FONT}" w:hAnsi="${DOCX_FONT}" w:cs="${DOCX_FONT}"/><w:sz w:val="${Math.round(DOCX_BASE * 2)}"/><w:szCs w:val="${Math.round(DOCX_BASE * 2)}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`;

  const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="252" w:hanging="252"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`;

  const relsRoot = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

  const relsDoc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`;

  return zipStore([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: relsRoot },
    { name: 'word/document.xml', data: documentXml },
    { name: 'word/styles.xml', data: stylesXml },
    { name: 'word/numbering.xml', data: numberingXml },
    { name: 'word/_rels/document.xml.rels', data: relsDoc }
  ]);
}

function downloadWord() {
  const blob = new Blob([buildDocx()], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileBase() + '.docx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  showNotification('Word document (.docx) downloaded', 'success');
}

function scrollToCard(target, smooth) {
  const el = target === 'personal'
    ? document.getElementById('personal-card')
    : document.querySelector(`.section-card[data-id="${target}"]`);
  if (!el) return;
  el.classList.remove('collapsed');
  const sec = el.dataset.id ? findSec(el.dataset.id) : null;
  if (sec) sec.collapsed = false;
  el.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'instant' });
}

function buildAddMenu() {
  const grid = document.getElementById('add-grid');
  grid.innerHTML = '';
  SECTION_DEFS.forEach(def => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'add-tile';
    btn.innerHTML = `
      <span class="add-tile-icon material-symbols-rounded">${def.icon}</span>
      <span class="add-tile-txt"><b>${def.label}</b><small>${def.desc}</small></span>`;
    btn.addEventListener('click', () => {
      const sec = newSection(def);
      data.sections.push(sec);
      renderSections();
      refresh();
      popupClose(btn);
      showNotification(`${def.label} section added`, 'success');
      if (data.settings.mode === 'paper') {
        setTimeout(() => {
          renderPreview();
          const hb = pagesEl.querySelector(`.pv-h[data-sec="${sec.id}"]`);
          if (hb) hb.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 150);
      } else {
        if (MOBILE_MQ.matches) setView('edit');
        setTimeout(() => scrollToCard(sec.id, !MOBILE_MQ.matches), 80);
      }
    });
    grid.appendChild(btn);
  });
}

function bindPersonal() {
  document.querySelectorAll('[data-p]').forEach(inp => {
    inp.value = data.personal[inp.dataset.p] || '';
  });
}

function applyLang() {
  const L = data.settings.lang;
  data.sections.forEach(sec => {
    const def = TITLE_LOOKUP[(sec.title || '').trim().toUpperCase()];
    if (def) sec.title = def[L];
  });
}

function bindSettings() {
  ['lang', 'font', 'size', 'margin'].forEach(key => {
    const el = document.getElementById('set-' + key);
    el.value = data.settings[key];
    el.addEventListener('change', () => {
      data.settings[key] = el.value;
      if (key === 'lang') {
        applyLang();
        renderSections();
      }
      refresh();
    });
  });
}

function syncSettingsInputs() {
  ['lang', 'font', 'size', 'margin'].forEach(key => {
    document.getElementById('set-' + key).value = data.settings[key];
  });
}

function migrate(d) {
  d.settings = Object.assign({ font: 'Arial', size: '11', margin: 'narrow', lang: 'en', mode: 'form' }, d.settings || {});
  (d.sections || []).forEach(sec => {
    (sec.entries || []).forEach(en => {
      ['bullets', 'details'].forEach(k => {
        if (typeof en[k] === 'string') en[k] = en[k] ? en[k].split('\n') : [];
      });
      if (sec.type === 'education') {
        if (en.score === undefined) en.score = en.gpa || '';
        if (en.scoreLabel === undefined) en.scoreLabel = '';
        delete en.gpa;
      }
      if (sec.type === 'list' && en.num === undefined) en.num = '';
      if (sec.type === 'experience' && !Array.isArray(en.roles)) {
        en.roles = [{
          role: en.role || '',
          start: en.start || '',
          end: en.end || '',
          bullets: Array.isArray(en.bullets) ? en.bullets : (en.bullets ? String(en.bullets).split('\n') : [''])
        }];
        delete en.role; delete en.start; delete en.end; delete en.bullets;
      }
    });
  });
  return d;
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.sections) && parsed.personal && parsed.settings) {
        data = migrate(parsed);
        return;
      }
    }
  } catch (e) { }
  data = blankData();
}

function resetAll() {
  const mode = data.settings.mode;
  data = blankData(data.settings.lang);
  data.settings.mode = mode;
  save();
  bindPersonal();
  syncSettingsInputs();
  renderSections();
  applyMode();
}

loadData();
bindPersonal();
bindSettings();
buildAddMenu();
renderSections();
wireDropZone();
applyMode();

document.querySelectorAll('[data-p]').forEach(inp => {
  inp.addEventListener('input', () => {
    data.personal[inp.dataset.p] = inp.value;
    refresh();
  });
});

const sectionsEl = document.getElementById('sections');
sectionsEl.addEventListener('input', onSectionsInput);
sectionsEl.addEventListener('click', onSectionsClick);
sectionsEl.addEventListener('keydown', onSectionsKeydown);
document.getElementById('add-section-btn').addEventListener('click', () => popupShow('#popup'));
document.getElementById('paper-add-btn').addEventListener('click', () => popupShow('#popup'));
document.getElementById('btn-pdf').addEventListener('click', () => { closeOverlays(); downloadPdf(); });
document.getElementById('btn-word').addEventListener('click', () => { closeOverlays(); downloadWord(); });
document.getElementById('btn-clear').addEventListener('click', () => {
  if (confirm('Clear all CV data and start over?')) { closeOverlays(); resetAll(); }
});

new ResizeObserver(() => fitScale()).observe(pagesEl);

const MOBILE_MQ = window.matchMedia('(max-width: 999px)');

function closeOverlays() {
  document.querySelectorAll('.dd.open').forEach(d => d.classList.remove('open'));
}

document.querySelectorAll('.dd-trigger').forEach(btn => {
  btn.addEventListener('click', () => {
    const dd = btn.closest('.dd');
    const wasOpen = dd.classList.contains('open');
    closeOverlays();
    if (!wasOpen) dd.classList.add('open');
  });
});

document.querySelectorAll('#view-bar .view-btn').forEach(btn => {
  btn.addEventListener('click', () => setView(btn.dataset.view));
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeOverlays(); });

document.addEventListener('click', (e) => {
  if (!e.target.closest('.dd')) closeOverlays();
});
