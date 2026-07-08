"use strict";

/* =========================================================
 * TOPIK Learning Hub — structured study modules per level.
 * Shell design mirrors app.kodejarwo.com apps (same as index.html).
 *
 * - Curriculum: learn.json (levels -> sections -> lessons)
 * - Practice questions: drawn live from bank.json pools (the
 *   same file used by the exam simulator), least-seen first,
 *   using a seen-store separate from the exam's so studying
 *   never reduces variety in real test attempts.
 * - No completion tracking: Learn is a browse-and-practice
 *   reference, not a course with progress state.
 * ========================================================= */

const LEARN_FILE = "learn.json";
const BANK_FILE = "../bank.json";
const LEARN_SEEN_KEY = "topik-learn-seen-v1";

const CIRCLED = ["①", "②", "③", "④"];
const CIRCLED_FILLED = ["❶", "❷", "❸", "❹"];
const SCREENS = ["hub", "level", "lesson"];

const state = {
  learn: null,
  pools: null,
  flatLessons: [],   // [{ level, section, lesson }], unlocked levels only, in curriculum order
  coverage: null     // { missing:[], uncovered:[] }
};

let onPracticeAnswered = null; // set per lesson render, cleared on leave

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", init);
window.addEventListener("hashchange", route);

/* ---------------- init & data loading ---------------- */

async function init() {
  try {
    const [learnData, bankData] = await Promise.all([
      fetch(LEARN_FILE).then((r) => {
        if (!r.ok) throw new Error(LEARN_FILE + " → HTTP " + r.status);
        return r.json();
      }),
      fetch(BANK_FILE).then((r) => {
        if (!r.ok) throw new Error(BANK_FILE + " → HTTP " + r.status);
        return r.json();
      })
    ]);
    state.learn = learnData;
    state.pools = bankData.pools;
    buildFlatLessons();
    checkCoverage();
  } catch (err) {
    showLoadError(err);
    return;
  }

  route();
}

function buildFlatLessons() {
  const flat = [];
  for (const level of state.learn.levels) {
    if (level.locked) continue;
    for (const section of level.sections) {
      for (const lesson of (section.lessons || [])) {
        flat.push({ level, section, lesson });
      }
    }
  }
  state.flatLessons = flat;
}

/* Cross-check learn.json <-> bank.json so the curriculum can
 * never silently point at a pool that doesn't exist, and so
 * newly-added bank.json pools are visible as "not yet covered". */
function checkCoverage() {
  const referenced = new Set();
  for (const level of state.learn.levels) {
    for (const section of level.sections) {
      for (const p of (section.plannedPools || [])) referenced.add(p);
      for (const lesson of (section.lessons || [])) {
        if (lesson.practice) for (const p of lesson.practice.pools) referenced.add(p);
      }
    }
  }
  const missing = [...referenced].filter((p) => !state.pools[p]);
  const uncovered = Object.keys(state.pools).filter((p) => !referenced.has(p));
  if (missing.length) console.error("learn.json references pools missing from bank.json:", missing);
  if (uncovered.length) console.warn("bank.json pools not yet mapped in learn.json:", uncovered);
  state.coverage = { missing, uncovered };
}

function showLoadError(err) {
  const box = $("load-error");
  box.innerHTML =
    icon("error") + " Could not load the Learning Hub.<br>" +
    esc(String(err && err.message ? err.message : err)) +
    "<br><br>If you're opening this file locally, run a static server instead — " +
    "e.g. <em>python3 -m http.server</em>, then open http://localhost:8000";
  box.classList.remove("none");
}

/* ---------------- routing ---------------- */

function route() {
  if (!state.learn || !state.pools) return;
  onPracticeAnswered = null;
  const hash = location.hash.replace(/^#\/?/, "");
  const parts = hash.split("/").filter(Boolean);

  if (parts[0] === "level" && parts[1]) {
    renderLevel(Number(parts[1]));
    showScreen("level");
  } else if (parts[0] === "lesson" && parts[1]) {
    renderLesson(parts[1]);
    showScreen("lesson");
  } else {
    renderHub();
    showScreen("hub");
  }
}

function showScreen(name) {
  for (const s of SCREENS) $("screen-" + s).classList.toggle("none", s !== name);
  window.scrollTo(0, 0);
}

/* ---------------- hub screen ---------------- */

function renderHub() {
  const t1wrap = $("hub-t1-levels");
  const t2wrap = $("hub-t2-levels");
  t1wrap.innerHTML = "";
  t2wrap.innerHTML = "";
  for (const level of state.learn.levels) {
    const card = buildLevelCard(level);
    (level.test === "TOPIK II" ? t2wrap : t1wrap).appendChild(card);
  }

  renderCoverageNote();
}

function buildLevelCard(level) {
  const lessons = level.sections.flatMap((s) => s.lessons || []);

  const card = el("a", "level-card" + (level.locked ? " locked" : ""));
  card.href = "#/level/" + level.id;

  let html = '<div class="level-card-badge">' + esc(level.badge) + "</div>";
  html += "<h3>" + icon(level.icon) + " " + esc(level.title) + "</h3>";
  html += '<p class="level-card-subtitle">' + esc(level.subtitle) + "</p>";
  if (level.locked) {
    html += '<div class="level-card-lock">' + icon("lock") + " Coming soon</div>";
  } else {
    html += '<div class="level-card-meta">' + lessons.length + (lessons.length === 1 ? " lesson" : " lessons") + "</div>";
  }
  card.innerHTML = html;
  return card;
}

function renderCoverageNote() {
  const note = $("hub-coverage-note");
  const { missing, uncovered } = state.coverage;
  if (missing.length) {
    note.className = "coverage-note error";
    note.innerHTML = icon("error") + " learn.json references bank.json pools that do not exist: " + missing.map(esc).join(", ");
    note.classList.remove("none");
    return;
  }
  const totalPools = Object.keys(state.pools).length;
  const covered = totalPools - uncovered.length;
  note.className = "coverage-note info";
  note.innerHTML = icon("info") + " " + covered + " / " + totalPools + " bank.json question pools are mapped into this curriculum.";
  note.classList.remove("none");
}

/* ---------------- level screen ---------------- */

function renderLevel(levelId) {
  const level = state.learn.levels.find((l) => l.id === levelId);
  if (!level) { location.hash = "#/"; return; }

  const testTag = $("level-test-tag");
  testTag.textContent = level.test;
  testTag.className = "test-badge" + (level.test === "TOPIK II" ? " t2" : "");

  $("level-badge").textContent = level.badge;
  $("level-title").innerHTML = icon(level.icon) + " " + esc(level.title);
  $("level-subtitle").textContent = level.subtitle;

  const body = $("level-body");
  body.innerHTML = "";

  if (level.locked) {
    body.appendChild(el("div", "item locked-banner",
      icon("lock") +
      " <strong>Coming soon.</strong> This level's curriculum is mapped to the question pools below; lessons will be added here as they're written."));
  }

  for (const section of level.sections) {
    const card = el("section", "item learn-section");
    card.appendChild(el("h3", "learn-section-title", icon(section.icon) + " " + esc(section.title)));
    card.appendChild(el("p", "learn-section-about", esc(section.about)));

    if (level.locked) {
      const chips = el("div", "pool-chips");
      (section.plannedPools || []).forEach((p) => chips.appendChild(el("span", "pool-chip", esc(p))));
      card.appendChild(chips);
    } else {
      const list = el("div", "lesson-list");
      for (const lesson of section.lessons) {
        const row = el("a", "lesson-row");
        row.href = "#/lesson/" + lesson.id;
        row.innerHTML =
          '<span class="lesson-row-text"><strong>' + esc(lesson.title) + "</strong>" +
          '<span class="lesson-row-summary">' + esc(lesson.summary || "") + "</span></span>" +
          '<span class="material-symbols-rounded lesson-row-arrow">chevron_right</span>';
        list.appendChild(row);
      }
      card.appendChild(list);
    }
    body.appendChild(card);
  }
}

/* ---------------- lesson screen ---------------- */

function renderLesson(lessonId) {
  const found = state.flatLessons.find((f) => f.lesson.id === lessonId);
  if (!found) { location.hash = "#/"; return; }
  const { level, section, lesson } = found;

  $("lesson-crumb").innerHTML =
    '<a href="#/level/' + level.id + '">' + icon("chevron_left") + " " + esc(level.badge) + " · " + esc(section.title) + "</a>";
  $("lesson-title").textContent = lesson.title;

  const body = $("lesson-body");
  body.innerHTML = "";

  const contentCard = el("section", "item lesson-content");
  lesson.content.forEach((block) => contentCard.appendChild(renderContentBlock(block)));
  body.appendChild(contentCard);

  if (lesson.practice) body.appendChild(renderPracticeSection(lesson));

  renderLessonNav(found);
}

function renderContentBlock(block) {
  switch (block.type) {
    case "text": return el("div", "learn-text", block.html);
    case "tip": return el("div", "learn-tip", icon("lightbulb") + "<div>" + block.html + "</div>");
    case "grammar": return renderGrammarBlock(block);
    case "vocab": return renderVocabBlock(block);
    case "example": return renderExampleBlock(block);
    case "writeExample": return renderWriteExampleBlock(block);
    default: return el("div", null, "");
  }
}

function renderGrammarBlock(b) {
  const box = el("div", "grammar-card");
  box.appendChild(el("div", "grammar-pattern", fmt(b.pattern)));
  box.appendChild(el("div", "grammar-meaning", esc(b.meaning)));
  const ex = el("div", "grammar-examples");
  (b.examples || []).forEach((e) => {
    ex.appendChild(el("div", "grammar-example", '<span class="ko">' + fmt(e.ko) + '</span><span class="en">' + esc(e.en) + "</span>"));
  });
  box.appendChild(ex);
  return box;
}

function renderVocabBlock(b) {
  const box = el("div", "vocab-card");
  box.appendChild(el("div", "vocab-title", esc(b.title)));
  const grid = el("div", "vocab-grid");
  (b.words || []).forEach((w) => {
    grid.appendChild(el("div", "vocab-word", '<span class="ko">' + fmt(w.ko) + '</span><span class="en">' + esc(w.en) + "</span>"));
  });
  box.appendChild(grid);
  return box;
}

function renderExampleBlock(b) {
  const box = el("div", "example learn-example");
  box.appendChild(el("span", "example-label", "&lt;보 기&gt;"));
  box.appendChild(el("div", "qbox", fmt(b.box)));
  const ch = el("div", "example-choices");
  b.choices.forEach((c, i) => {
    const isAns = i + 1 === b.answer;
    ch.appendChild(el("span", isAns ? "ex-answer" : null, (isAns ? CIRCLED_FILLED[i] : CIRCLED[i]) + " " + esc(c)));
  });
  box.appendChild(ch);
  if (b.note) box.appendChild(el("div", "explain", esc(b.note)));
  return box;
}

/* Worked example for a writing task: box with blanks + model
 * sentence(s), no multiple-choice — mirrors the write-question
 * review look (model-box) instead of the MCQ example look. */
function renderWriteExampleBlock(b) {
  const box = el("div", "example learn-example");
  box.appendChild(el("span", "example-label", "&lt;보 기&gt;"));
  box.appendChild(el("div", "qbox", fmt(b.box)));
  const modelHtml = Array.isArray(b.model)
    ? b.model.map((m, i) => '<div><span class="write-blank-label">' + esc(b.blanks ? b.blanks[i] : String(i + 1)) + "</span>" + esc(m) + "</div>").join("")
    : fmtMultiline(b.model);
  box.appendChild(el("div", "model-box",
    '<div class="model-title">' + icon("workspace_premium") + " Model answer</div>" + modelHtml));
  if (b.note) box.appendChild(el("div", "explain", esc(b.note)));
  return box;
}

/* ---------------- practice engine ---------------- */

function loadLearnSeen() {
  try { return JSON.parse(localStorage.getItem(LEARN_SEEN_KEY)) || {}; } catch { return {}; }
}
function saveLearnSeen(seen) {
  try { localStorage.setItem(LEARN_SEEN_KEY, JSON.stringify(seen)); } catch { /* ignore */ }
}

/* Same least-seen weighting as the exam sampler (script.js),
 * but tracked separately so studying never skews real-test draws. */
function pickPracticeItem(poolNames, seen, used) {
  const poolName = poolNames[Math.floor(Math.random() * poolNames.length)];
  const pool = state.pools[poolName] || [];
  let candidates = pool.filter((it) => !used.has(it.id));
  if (candidates.length === 0) candidates = pool.slice();
  if (candidates.length === 0) return null;
  const minSeen = Math.min(...candidates.map((it) => seen[it.id] || 0));
  const fresh = candidates.filter((it) => (seen[it.id] || 0) === minSeen);
  const item = fresh[Math.floor(Math.random() * fresh.length)];
  used.add(item.id);
  return { poolName, item };
}

function drawPractice(practice) {
  const seen = loadLearnSeen();
  const used = new Set();
  const drawn = [];
  for (let i = 0; i < practice.count; i++) {
    const picked = pickPracticeItem(practice.pools, seen, used);
    if (picked) drawn.push(picked);
  }
  for (const { item } of drawn) seen[item.id] = (seen[item.id] || 0) + 1;
  saveLearnSeen(seen);
  return drawn;
}

function renderPracticeSection(lesson) {
  const card = el("section", "item practice-section");
  card.appendChild(el("h3", "section-title", icon("fitness_center") + " Practice"));
  card.appendChild(el("p", "practice-hint", "Drawn live from the question bank — click an answer to check it instantly."));

  const drawn = drawPractice(lesson.practice);
  let total = 0;
  drawn.forEach(({ item }) => { total += Array.isArray(item.questions) ? item.questions.length : 1; });

  const status = el("div", "practice-status", "0 / " + total + " answered");
  card.appendChild(status);

  const tally = { attempted: 0, correct: 0, scored: 0 };
  onPracticeAnswered = (correct) => {
    tally.attempted += 1;
    if (correct === true) { tally.correct += 1; tally.scored += 1; }
    else if (correct === false) { tally.scored += 1; }
    status.textContent = tally.attempted + " / " + total + " answered" +
      (tally.scored ? " · " + tally.correct + "/" + tally.scored + " correct" : "");
    if (tally.attempted >= total) status.classList.add("done");
  };

  if (!drawn.length) {
    card.appendChild(el("p", "practice-hint", "No practice questions available yet for this lesson's pool."));
    return card;
  }

  drawn.forEach(({ item }) => card.appendChild(renderPracticeItem(item)));
  return card;
}

function renderPracticeItem(item) {
  if (Array.isArray(item.questions)) {
    const wrap = el("div", "practice-pair");
    if (item.sharedBox) wrap.appendChild(el("div", "qbox shared", fmt(item.sharedBox)));
    item.questions.forEach((q) => wrap.appendChild(renderPracticeMCQ(q)));
    return wrap;
  }
  if (item.task) return renderPracticeWrite(item);
  return renderPracticeMCQ(item);
}

function renderPracticeMCQ(q) {
  const wrap = el("article", "question practice");
  if (q.box) wrap.appendChild(el("div", "qbox", fmt(q.box)));
  if (q.box2) wrap.appendChild(el("div", "qbox", fmt(q.box2)));
  if (q.stem) wrap.appendChild(el("p", "qstem", esc(q.stem)));

  const ul = el("ul", "choices");
  let answered = false;
  let explainBox = null;

  q.choices.forEach((c, i) => {
    const li = el("li");
    const btn = el("button", "choice-btn");
    btn.type = "button";
    btn.innerHTML = '<span class="marker">' + CIRCLED[i] + "</span><span>" + esc(c) + "</span>";
    btn.addEventListener("click", () => {
      if (answered) return;
      answered = true;
      wrap.classList.add("answered");
      const correct = i + 1 === q.answer;
      ul.querySelectorAll(".choice-btn").forEach((b, bi) => {
        b.tabIndex = -1;
        if (bi + 1 === q.answer) b.classList.add("correct-answer");
        else if (bi === i) b.classList.add("user-wrong");
      });
      if (explainBox) explainBox.classList.remove("none");
      if (onPracticeAnswered) onPracticeAnswered(correct);
    });
    li.appendChild(btn);
    ul.appendChild(li);
  });
  wrap.appendChild(ul);

  if (q.explanation) {
    explainBox = el("div", "explain none",
      "<strong>정답 " + CIRCLED[q.answer - 1] + "</strong> — " + esc(q.explanation.ko) +
      '<span class="en">' + esc(q.explanation.en) + "</span>");
    wrap.appendChild(explainBox);
  }
  return wrap;
}

function renderPracticeWrite(item) {
  const wrap = el("article", "question write practice");
  wrap.appendChild(el("div", "qbox", fmt(item.box)));

  const revealBtn = el("button", "btn-secondary small", icon("visibility") + " Show model answer");
  revealBtn.type = "button";

  const modelHtml = Array.isArray(item.model)
    ? item.model.map((m, i) => '<div><span class="write-blank-label">' + esc(item.blanks ? item.blanks[i] : String(i + 1)) + "</span>" + esc(m) + "</div>").join("")
    : fmtMultiline(item.model);
  const modelBox = el("div", "model-box none",
    '<div class="model-title">' + icon("workspace_premium") + " Model answer</div>" + modelHtml);

  revealBtn.addEventListener("click", () => {
    modelBox.classList.remove("none");
    revealBtn.disabled = true;
    if (onPracticeAnswered) onPracticeAnswered(null);
  });

  wrap.appendChild(revealBtn);
  wrap.appendChild(modelBox);
  return wrap;
}

/* ---------------- lesson nav ---------------- */

function renderLessonNav(found) {
  const idx = state.flatLessons.indexOf(found);
  const prev = state.flatLessons[idx - 1];
  const next = state.flatLessons[idx + 1];
  const nav = $("lesson-nav");
  nav.innerHTML = "";

  const allBtn = el("a", "btn-secondary lesson-nav-btn", icon("apps") + " All lessons");
  allBtn.href = "#/level/" + found.level.id;
  nav.appendChild(allBtn);

  const prevBtn = el("a", "btn-secondary lesson-nav-btn" + (prev ? "" : " disabled"), icon("chevron_left") + " Previous");
  prevBtn.href = prev ? "#/lesson/" + prev.lesson.id : "#";
  if (!prev) prevBtn.setAttribute("aria-disabled", "true");
  nav.appendChild(prevBtn);

  const nextBtn = el("a", "btn-start lesson-nav-btn" + (next ? "" : " disabled"), "Next " + icon("chevron_right"));
  nextBtn.href = next ? "#/lesson/" + next.lesson.id : "#";
  if (!next) nextBtn.setAttribute("aria-disabled", "true");
  nav.appendChild(nextBtn);
}

/* ---------------- render helpers ---------------- */

function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

function icon(name) {
  return '<span class="material-symbols-rounded">' + name + "</span>";
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* Escape, then apply light markup: {u}...{/u} -> underline. */
function fmt(s) {
  return esc(s).replace(/\{u\}/g, "<u>").replace(/\{\/u\}/g, "</u>");
}

function fmtMultiline(s) {
  return esc(s).replace(/\n/g, "<br>");
}
