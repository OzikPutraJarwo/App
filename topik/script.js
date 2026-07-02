"use strict";

/* =========================================================
 * TOPIK Practice — TOPIK I Reading (읽기 31~70)
 * Shell design mirrors app.kodejarwo.com apps.
 *
 * - Question bank: data/bank1..4.json (pools per slot type)
 * - Every test draws a random exam from the pools; items the
 *   user has seen less often are drawn first (localStorage).
 * - Finished attempts are stored in a history (viewable,
 *   deletable) including the drawn items + answers, so any
 *   past attempt can be reviewed again.
 * ========================================================= */

const BANK_FILES = ["data/bank1.json", "data/bank2.json", "data/bank3.json", "data/bank4.json"];
const PROGRESS_KEY = "topik1-read-progress-v1";
const SEEN_KEY = "topik1-read-seen-v1";
const HISTORY_KEY = "topik-history-v1";
const TEST_NAME = "TOPIK I 읽기";

const CIRCLED = ["①", "②", "③", "④"];
const CIRCLED_FILLED = ["❶", "❷", "❸", "❹"];

/* Exam blueprint: mirrors the structure/point weighting of the
 * current TOPIK I reading section. Total = 100 points. */
const BLUEPRINT = [
  {
    key: "31-33", kind: "singles", pool: "topic",
    label: { ko: "화제 고르기", en: "Choosing the topic" },
    instruction: {
      ko: "[31~33] 무엇에 대한 이야기입니까? <보기>와 같이 알맞은 것을 고르십시오.",
      en: "What is the passage about? Choose the correct answer as in the example."
    },
    example: { box: "덥습니다. 바다에서 수영합니다.", choices: ["여름", "날씨", "나이", "나라"], answer: 1 },
    picks: [{ n: 31, pts: 2 }, { n: 32, pts: 2 }, { n: 33, pts: 2 }]
  },
  {
    key: "34-39", kind: "singles",
    label: { ko: "빈칸에 알맞은 말", en: "Fill in the blank" },
    instruction: {
      ko: "[34~39] <보기>와 같이 (      )에 들어갈 말로 가장 알맞은 것을 고르십시오.",
      en: "Choose the best word for the blank, as in the example."
    },
    example: { box: "날씨가 좋습니다. (      )이 맑습니다.", choices: ["눈", "밤", "하늘", "구름"], answer: 3 },
    picks: [
      { n: 34, pts: 2, pool: "blank-particle" },
      { n: 35, pts: 2, pool: "blank-noun" },
      { n: 36, pts: 2, pool: "blank-verb" },
      { n: 37, pts: 3, pool: "blank-adj" },
      { n: 38, pts: 3, pool: "blank-adverb" },
      { n: 39, pts: 2, pool: "blank-verb2" }
    ]
  },
  {
    key: "40-42", kind: "singles", pool: "notmatch",
    label: { ko: "실용문 — 맞지 않는 것", en: "Practical text — NOT correct" },
    instruction: {
      ko: "[40~42] 다음을 읽고 맞지 않는 것을 고르십시오.",
      en: "Read the following and choose the statement that is NOT correct."
    },
    picks: [{ n: 40, pts: 3 }, { n: 41, pts: 3 }, { n: 42, pts: 3 }]
  },
  {
    key: "43-45", kind: "singles", pool: "match",
    label: { ko: "내용과 같은 것", en: "Matching content" },
    instruction: {
      ko: "[43~45] 다음의 내용과 같은 것을 고르십시오.",
      en: "Choose the statement that matches the content."
    },
    picks: [{ n: 43, pts: 3 }, { n: 44, pts: 2 }, { n: 45, pts: 3 }]
  },
  {
    key: "46-48", kind: "singles", pool: "mainidea",
    label: { ko: "중심 생각", en: "Main idea" },
    instruction: {
      ko: "[46~48] 다음을 읽고 중심 생각을 고르십시오.",
      en: "Read the following and choose the main idea."
    },
    picks: [{ n: 46, pts: 3 }, { n: 47, pts: 3 }, { n: 48, pts: 2 }]
  },
  pairGroup("49-50", "pair-49-50", [{ n: 49, pts: 2 }, { n: 50, pts: 2 }]),
  pairGroup("51-52", "pair-51-52", [{ n: 51, pts: 3 }, { n: 52, pts: 2 }]),
  pairGroup("53-54", "pair-53-54", [{ n: 53, pts: 2 }, { n: 54, pts: 3 }]),
  pairGroup("55-56", "pair-55-56", [{ n: 55, pts: 2 }, { n: 56, pts: 3 }]),
  {
    key: "57-58", kind: "singles", pool: "ordering",
    label: { ko: "문장 순서 배열", en: "Sentence ordering" },
    instruction: {
      ko: "[57~58] 다음을 순서대로 맞게 나열한 것을 고르십시오.",
      en: "Choose the correct order of the sentences."
    },
    picks: [{ n: 57, pts: 2 }, { n: 58, pts: 3 }]
  },
  pairGroup("59-60", "pair-59-60", [{ n: 59, pts: 2 }, { n: 60, pts: 3 }]),
  pairGroup("61-62", "pair-61-62", [{ n: 61, pts: 2 }, { n: 62, pts: 2 }]),
  pairGroup("63-64", "pair-63-64", [{ n: 63, pts: 2 }, { n: 64, pts: 3 }]),
  pairGroup("65-66", "pair-65-66", [{ n: 65, pts: 2 }, { n: 66, pts: 3 }]),
  pairGroup("67-68", "pair-67-68", [{ n: 67, pts: 3 }, { n: 68, pts: 3 }]),
  pairGroup("69-70", "pair-69-70", [{ n: 69, pts: 3 }, { n: 70, pts: 3 }])
];

function pairGroup(key, pool, picks) {
  return {
    key, kind: "pair", pool, picks,
    label: { ko: "지문 읽고 답하기 [" + key.replace("-", "~") + "]", en: "Passage questions " + key.replace("-", "–") },
    instruction: {
      ko: "[" + key.replace("-", "~") + "] 다음을 읽고 물음에 답하십시오.",
      en: "Read the following and answer the questions."
    }
  };
}

const state = {
  pools: null,
  exam: null,        // { groups: [{ bp, sharedBox, chosenIds, items:[...] }] }
  answers: {},       // question number -> 1..4
  limit: 0,          // seconds at start
  remaining: 0,      // seconds
  timerId: null,
  finished: false,
  mode: null,        // "exam" while a test is running
  lastResult: null   // kept for result <-> review navigation
};

const SCREENS = ["main", "exam", "result", "review"];

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", init);

/* ---------------- init & data loading ---------------- */

async function init() {
  $("btn-home").addEventListener("click", (e) => { e.preventDefault(); goHome(); });
  $("btn-start").addEventListener("click", () => startExam());
  $("btn-submit").addEventListener("click", () => submit(false));
  $("btn-submit-bottom").addEventListener("click", () => submit(false));
  $("btn-resume").addEventListener("click", resumeSaved);
  $("btn-discard").addEventListener("click", () => {
    clearProgress();
    renderHome();
    notify("저장된 시험을 삭제했습니다. (Saved test discarded.)", "info");
  });
  $("btn-clear-history").addEventListener("click", clearHistoryAll);
  $("btn-review").addEventListener("click", () => openReviewFromResult());
  $("btn-new-test").addEventListener("click", () => startExam());
  $("btn-result-home").addEventListener("click", goHome);
  $("btn-review-back").addEventListener("click", () => showScreen("result"));
  $("btn-review-home").addEventListener("click", goHome);
  $("btn-review-home-bottom").addEventListener("click", goHome);

  try {
    const datasets = await Promise.all(
      BANK_FILES.map((f) =>
        fetch(f).then((r) => {
          if (!r.ok) throw new Error(f + " → HTTP " + r.status);
          return r.json();
        })
      )
    );
    state.pools = {};
    for (const d of datasets) Object.assign(state.pools, d.pools);
    checkBank();
  } catch (err) {
    showLoadError(err);
  }

  renderHome();
  showScreen("main");
}

function checkBank() {
  for (const bp of BLUEPRINT) {
    if (bp.kind === "pair") {
      const pool = state.pools[bp.pool];
      if (!pool || pool.length < 1) throw new Error("문제 은행에 '" + bp.pool + "' 풀이 없습니다.");
    } else {
      const need = {};
      for (const p of bp.picks) {
        const name = p.pool || bp.pool;
        need[name] = (need[name] || 0) + 1;
      }
      for (const [name, n] of Object.entries(need)) {
        const pool = state.pools[name];
        if (!pool || pool.length < n) throw new Error("문제 은행 '" + name + "'에 문제가 부족합니다.");
      }
    }
  }
}

function showLoadError(err) {
  const box = $("load-error");
  box.textContent =
    "문제를 불러올 수 없습니다. (Could not load the question bank.)\n" +
    String(err && err.message ? err.message : err) +
    "\n\n로컬에서 여는 경우 정적 서버로 실행해 주세요:\npython3 -m http.server  →  http://localhost:8000";
  box.classList.remove("none");
  $("btn-start").disabled = true;
  state.pools = null;
}

/* ---------------- navigation ---------------- */

function showScreen(name) {
  for (const s of SCREENS) $("screen-" + s).classList.toggle("none", s !== name);
  document.body.classList.toggle("main", name === "main");
  window.scrollTo(0, 0);
}

function goHome() {
  if (state.mode === "exam" && !state.finished) {
    const ok = window.confirm(
      "홈으로 이동할까요? 진행 중인 시험은 저장되고 이어서 할 수 있습니다.\n(Go home? Your progress is saved and can be resumed.)"
    );
    if (!ok) return;
    saveProgress();
    stopTimer();
    state.mode = null;
  }
  renderHome();
  showScreen("main");
}

/* ---------------- home screen ---------------- */

function renderHome() {
  const saved = state.pools ? loadProgress() : null;
  const exam = saved ? rebuildExam(saved) : null;
  $("resume-box").classList.toggle("none", !exam);
  renderHistory();
}

function resumeSaved() {
  const saved = loadProgress();
  const exam = saved ? rebuildExam(saved) : null;
  if (!exam) {
    notify("저장된 시험을 불러올 수 없습니다. (Could not load the saved test.)", "error");
    clearProgress();
    renderHome();
    return;
  }
  state.exam = exam;
  state.answers = saved.answers || {};
  state.limit = typeof saved.limit === "number" ? saved.limit : timeLimitSeconds();
  state.remaining = typeof saved.remaining === "number" ? saved.remaining : state.limit;
  state.finished = false;
  state.mode = "exam";
  enterExamScreen();
}

/* ---------------- sampling ---------------- */

function loadSeen() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY)) || {}; } catch { return {}; }
}
function saveSeen(seen) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch { /* ignore */ }
}

function pickOne(poolName, seen, used) {
  const pool = state.pools[poolName];
  let candidates = pool.filter((it) => !used.has(it.id));
  if (candidates.length === 0) candidates = pool.slice();
  const minSeen = Math.min(...candidates.map((it) => seen[it.id] || 0));
  const fresh = candidates.filter((it) => (seen[it.id] || 0) === minSeen);
  const item = fresh[Math.floor(Math.random() * fresh.length)];
  used.add(item.id);
  return item;
}

function sampleExam() {
  const seen = loadSeen();
  const used = new Set();
  const groups = BLUEPRINT.map((bp) => {
    if (bp.kind === "pair") {
      const v = pickOne(bp.pool, seen, used);
      const items = v.questions.map((q, i) => ({
        number: bp.picks[i].n,
        points: bp.picks[i].pts,
        box: q.box || null,
        stem: q.stem || null,
        choices: q.choices,
        answer: q.answer,
        explanation: q.explanation
      }));
      return { bp, sharedBox: v.sharedBox, chosenIds: [v.id], items };
    }
    const items = bp.picks.map((p) => {
      const it = pickOne(p.pool || bp.pool, seen, used);
      return {
        number: p.n,
        points: p.pts,
        box: it.box || null,
        stem: it.stem || null,
        choices: it.choices,
        answer: it.answer,
        explanation: it.explanation,
        srcId: it.id
      };
    });
    return { bp, sharedBox: null, chosenIds: items.map((i) => i.srcId), items };
  });

  for (const g of groups) for (const id of g.chosenIds) seen[id] = (seen[id] || 0) + 1;
  saveSeen(seen);

  return { groups };
}

/* Rebuild an exam from stored item ids ({chosen: {groupKey: [ids]}}).
 * Returns the exam object or null (e.g. bank changed). */
function rebuildExam(saved) {
  if (!saved || !saved.chosen || !state.pools) return null;
  try {
    const groups = BLUEPRINT.map((bp) => {
      const ids = saved.chosen[bp.key];
      if (!ids || !ids.length) throw new Error("missing " + bp.key);
      if (bp.kind === "pair") {
        const v = state.pools[bp.pool].find((x) => x.id === ids[0]);
        if (!v) throw new Error("missing item " + ids[0]);
        const items = v.questions.map((q, i) => ({
          number: bp.picks[i].n, points: bp.picks[i].pts,
          box: q.box || null, stem: q.stem || null,
          choices: q.choices, answer: q.answer, explanation: q.explanation
        }));
        return { bp, sharedBox: v.sharedBox, chosenIds: ids, items };
      }
      const items = bp.picks.map((p, i) => {
        const pool = state.pools[p.pool || bp.pool];
        const it = pool.find((x) => x.id === ids[i]);
        if (!it) throw new Error("missing item " + ids[i]);
        return {
          number: p.n, points: p.pts,
          box: it.box || null, stem: it.stem || null,
          choices: it.choices, answer: it.answer, explanation: it.explanation, srcId: it.id
        };
      });
      return { bp, sharedBox: null, chosenIds: ids, items };
    });
    return { groups };
  } catch {
    return null;
  }
}

function chosenMap(exam) {
  const chosen = {};
  for (const g of exam.groups) chosen[g.bp.key] = g.chosenIds;
  return chosen;
}

/* ---------------- progress persistence ---------------- */

function saveProgress() {
  if (state.finished || !state.exam) return;
  const data = {
    chosen: chosenMap(state.exam),
    answers: state.answers,
    limit: state.limit,
    remaining: state.remaining,
    t: Date.now()
  };
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

function loadProgress() {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY)); } catch { return null; }
}

function clearProgress() {
  try { localStorage.removeItem(PROGRESS_KEY); } catch { /* ignore */ }
}

/* ---------------- history ---------------- */

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
}

function saveHistory(list) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

function addHistory(entry) {
  const list = loadHistory();
  list.unshift(entry);
  saveHistory(list);
}

function deleteHistoryEntry(id) {
  saveHistory(loadHistory().filter((e) => e.id !== id));
  renderHistory();
  notify("기록을 삭제했습니다. (Attempt deleted.)", "info");
}

function clearHistoryAll() {
  if (!window.confirm("모든 기록을 삭제할까요? (Delete ALL history?)")) return;
  saveHistory([]);
  renderHistory();
  notify("모든 기록을 삭제했습니다. (History cleared.)", "info");
}

function renderHistory() {
  const list = loadHistory();
  $("history-empty").classList.toggle("none", list.length > 0);
  $("history-wrap").classList.toggle("none", list.length === 0);
  $("btn-clear-history").classList.toggle("none", list.length === 0);

  const tbody = $("history-body");
  tbody.innerHTML = "";
  for (const entry of list) {
    const tr = document.createElement("tr");

    tr.appendChild(el("td", null, esc(fmtDate(entry.ts))));
    tr.appendChild(el("td", null, esc(entry.test)));
    tr.appendChild(el("td", null, "<strong>" + entry.score + "</strong>/" + entry.max));
    tr.appendChild(el("td", null,
      '<span class="level-chip ' + (entry.levelCls === "pass" ? "pass" : "fail") + '">' + esc(entry.level) + "</span>"));
    tr.appendChild(el("td", null, esc(fmtDuration(entry.timeUsed))));

    const tdView = el("td", "actions-cell");
    const viewBtn = el("button", "btn-secondary small", "보기 <span class=\"en\">View</span>");
    viewBtn.type = "button";
    viewBtn.addEventListener("click", () => openHistoryReview(entry));
    tdView.appendChild(viewBtn);
    tr.appendChild(tdView);

    const tdDel = el("td", "actions-cell");
    const delBtn = el("button", "btn-danger small", "삭제 <span class=\"en\">Del</span>");
    delBtn.type = "button";
    delBtn.addEventListener("click", () => deleteHistoryEntry(entry.id));
    tdDel.appendChild(delBtn);
    tr.appendChild(tdDel);

    tbody.appendChild(tr);
  }
}

function fmtDate(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}

function fmtDuration(sec) {
  if (typeof sec !== "number" || sec < 0) return "-";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

/* ---------------- exam flow ---------------- */

function timeLimitSeconds() {
  const p = new URLSearchParams(location.search).get("time");
  const minutes = p ? Math.max(0.1, parseFloat(p)) : 60;
  return Math.round(minutes * 60);
}

function startExam() {
  if (!state.pools) {
    notify("문제 은행이 로드되지 않았습니다. (Question bank not loaded.)", "error");
    return;
  }
  clearProgress();
  state.exam = sampleExam();
  state.answers = {};
  state.limit = timeLimitSeconds();
  state.remaining = state.limit;
  state.finished = false;
  state.mode = "exam";
  saveProgress();
  enterExamScreen();
}

function enterExamScreen() {
  renderExam();
  updateAnswerUI();
  showScreen("exam");
  startTimer();
}

/* ---------------- timer ---------------- */

function startTimer() {
  stopTimer();
  renderTimer();
  state.timerId = setInterval(() => {
    state.remaining -= 1;
    renderTimer();
    if (state.remaining % 10 === 0) saveProgress();
    if (state.remaining <= 0) {
      stopTimer();
      submit(true);
    }
  }, 1000);
}

function stopTimer() {
  if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
}

function renderTimer() {
  const t = Math.max(0, state.remaining);
  const m = Math.floor(t / 60);
  const s = t % 60;
  const el2 = $("timer");
  el2.textContent = String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  el2.classList.toggle("warn", t <= 600 && t > 300);
  el2.classList.toggle("danger", t <= 300);
}

/* ---------------- rendering helpers ---------------- */

function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ---------------- exam rendering ---------------- */

function renderExam() {
  const body = $("exam-body");
  body.innerHTML = "";
  const nav = $("nav-grid");
  nav.innerHTML = "";

  for (const g of state.exam.groups) {
    const groupEl = el("section", "item group");
    groupEl.appendChild(el("h2", "instruction",
      "※ " + esc(g.bp.instruction.ko) + '<span class="en">' + esc(g.bp.instruction.en) + "</span>"));

    if (g.bp.example) groupEl.appendChild(renderExample(g.bp.example));
    if (g.sharedBox) groupEl.appendChild(el("div", "qbox shared", esc(g.sharedBox)));

    for (const q of g.items) {
      groupEl.appendChild(renderQuestion(q, false, state.answers));

      const navBtn = el("button", null, String(q.number));
      navBtn.id = "nav-" + q.number;
      navBtn.type = "button";
      navBtn.addEventListener("click", () => {
        const target = $("q-" + q.number);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      nav.appendChild(navBtn);
    }
    body.appendChild(groupEl);
  }
}

function renderExample(ex) {
  const box = el("div", "example");
  box.appendChild(el("span", "example-label", "&lt;보 기&gt;"));
  box.appendChild(el("div", null, esc(ex.box)));
  const ch = el("div", "example-choices");
  ex.choices.forEach((c, i) => {
    const isAns = i + 1 === ex.answer;
    ch.appendChild(el("span", isAns ? "ex-answer" : null,
      (isAns ? CIRCLED_FILLED[i] : CIRCLED[i]) + " " + esc(c)));
  });
  box.appendChild(ch);
  return box;
}

function renderQuestion(q, review, answers) {
  const wrap = el("article", "question" + (review ? " review" : ""));
  wrap.id = (review ? "r-" : "q-") + q.number;

  let head = q.number + ". <span class=\"pts\">(" + q.points + "점)</span>";
  if (review) {
    const user = answers[q.number];
    if (user === q.answer) head += ' <span class="review-status ok">정답 ✓</span>';
    else if (user) head += ' <span class="review-status no">오답 ✗</span>';
    else head += ' <span class="review-status no">무응답 (no answer)</span>';
  }
  wrap.appendChild(el("div", "qhead", head));

  if (q.box) wrap.appendChild(el("div", "qbox", esc(q.box)));
  if (q.stem) wrap.appendChild(el("p", "qstem", esc(q.stem)));

  const ul = el("ul", "choices");
  q.choices.forEach((c, i) => {
    const li = el("li");
    const btn = el("button", "choice-btn");
    btn.type = "button";
    btn.innerHTML = '<span class="marker">' + CIRCLED[i] + "</span><span>" + esc(c) + "</span>";

    if (review) {
      const user = answers[q.number];
      if (i + 1 === q.answer) btn.classList.add("correct-answer");
      if (user === i + 1 && user !== q.answer) btn.classList.add("user-wrong");
      btn.tabIndex = -1;
    } else {
      if (answers[q.number] === i + 1) btn.classList.add("selected");
      btn.addEventListener("click", () => selectAnswer(q.number, i + 1));
    }
    li.appendChild(btn);
    ul.appendChild(li);
  });
  wrap.appendChild(ul);

  if (review && q.explanation) {
    wrap.appendChild(el("div", "explain",
      "<strong>정답 " + CIRCLED[q.answer - 1] + "</strong> — " + esc(q.explanation.ko) +
      '<span class="en">' + esc(q.explanation.en) + "</span>"));
  }
  return wrap;
}

function selectAnswer(number, choice) {
  if (state.finished || state.mode !== "exam") return;
  state.answers[number] = choice;
  const qEl = $("q-" + number);
  if (qEl) {
    qEl.querySelectorAll(".choice-btn").forEach((b, i) => {
      b.classList.toggle("selected", i + 1 === choice);
    });
  }
  updateAnswerUI();
  saveProgress();
}

function updateAnswerUI() {
  let total = 0, answered = 0;
  for (const g of state.exam.groups) {
    for (const q of g.items) {
      total += 1;
      const has = !!state.answers[q.number];
      if (has) answered += 1;
      const navBtn = $("nav-" + q.number);
      if (navBtn) navBtn.classList.toggle("answered", has);
    }
  }
  $("answered-count").textContent = answered + "/" + total;
}

/* ---------------- submit & results ---------------- */

function submit(auto) {
  if (state.finished || state.mode !== "exam") return;

  if (!auto) {
    const un = countUnanswered();
    const msg = un > 0
      ? "아직 " + un + "문제를 풀지 않았습니다. 제출하시겠습니까?\n(" + un + " unanswered. Submit anyway?)"
      : "제출하시겠습니까? (Submit now?)";
    if (!window.confirm(msg)) return;
  }

  state.finished = true;
  state.mode = null;
  stopTimer();
  clearProgress();

  const res = computeResults();
  const lvl = levelInfo(res.score);
  const entry = {
    id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    ts: Date.now(),
    test: TEST_NAME,
    score: res.score,
    max: res.maxScore,
    level: lvl.badge,
    levelCls: lvl.cls,
    timeUsed: Math.max(0, state.limit - Math.max(0, state.remaining)),
    chosen: chosenMap(state.exam),
    answers: Object.assign({}, state.answers)
  };
  addHistory(entry);

  state.lastResult = { res, lvl, entry, auto };
  renderResult(state.lastResult);
  showScreen("result");
}

function countUnanswered() {
  let n = 0;
  for (const g of state.exam.groups)
    for (const q of g.items)
      if (!state.answers[q.number]) n += 1;
  return n;
}

function computeResults() {
  let score = 0, maxScore = 0;
  const rows = [];
  for (const g of state.exam.groups) {
    let correct = 0, pts = 0, ptsMax = 0;
    for (const q of g.items) {
      maxScore += q.points;
      ptsMax += q.points;
      if (state.answers[q.number] === q.answer) {
        correct += 1;
        pts += q.points;
        score += q.points;
      }
    }
    rows.push({ bp: g.bp, correct, count: g.items.length, pts, ptsMax });
  }
  return { score, maxScore, rows };
}

function levelInfo(score) {
  /* Official TOPIK I cutoffs (out of 200 = listening + reading):
   * Level 1: 80–139, Level 2: 140+.
   * Reading-only projection: score × 2 (assumes equal listening score). */
  const projected = score * 2;
  if (projected >= 140) return { badge: "2급 (Level 2)", cls: "pass", projected };
  if (projected >= 80) return { badge: "1급 (Level 1)", cls: "pass", projected };
  return { badge: "불합격 (Fail)", cls: "fail", projected };
}

function renderResult(r) {
  const { res, lvl, entry, auto } = r;

  $("score-panel").innerHTML =
    '<div class="conclusion ' + (lvl.cls === "pass" ? "normal" : "not-normal") + '">' +
    '<div class="score-line">' + res.score + "<span> / " + res.maxScore + "점</span></div>" +
    '<div class="level-line">예상 ' + esc(lvl.badge) + "</div>" +
    "</div>";

  $("result-meta").innerHTML =
    (auto ? "⏰ 시험 시간이 끝나서 자동으로 제출되었습니다. (Time is up — submitted automatically.)<br>" : "") +
    esc(fmtDate(entry.ts)) + " · 사용 시간 " + esc(fmtDuration(entry.timeUsed)) + " · " + esc(entry.test) + "<br>" +
    "예상 등급은 듣기 점수가 읽기와 같다고 가정한 값입니다: " + res.score + "점 × 2 = " + lvl.projected + "점 / 200점 기준 (1급 80점↑, 2급 140점↑)." +
    '<span class="en">The estimate assumes an equal listening score (reading × 2, out of 200). Official cutoffs: Level 1 ≥ 80, Level 2 ≥ 140.</span>';

  const tbody = $("breakdown-body");
  tbody.innerHTML = "";
  for (const row of res.rows) {
    const tr = document.createElement("tr");
    tr.appendChild(el("td", null, esc(row.bp.key.replace("-", "–"))));
    tr.appendChild(el("td", "type-cell", esc(row.bp.label.ko) + '<span class="en">' + esc(row.bp.label.en) + "</span>"));
    tr.appendChild(el("td", null, row.correct + "/" + row.count));
    tr.appendChild(el("td", null, row.pts + "/" + row.ptsMax));
    tbody.appendChild(tr);
  }
}

/* ---------------- review ---------------- */

function openReviewFromResult() {
  if (!state.lastResult) return;
  const { res, entry } = state.lastResult;
  renderReviewBody(state.exam, state.answers);
  $("review-meta").textContent =
    fmtDate(entry.ts) + " · " + entry.test + " · " + res.score + "/" + res.maxScore + "점 · 예상 " + entry.level;
  $("btn-review-back").classList.remove("none");
  showScreen("review");
}

function openHistoryReview(entry) {
  if (!state.pools) {
    notify("문제 은행이 로드되지 않았습니다. (Question bank not loaded.)", "error");
    return;
  }
  const exam = rebuildExam({ chosen: entry.chosen });
  if (!exam) {
    notify("문제 은행이 바뀌어 이 기록을 다시 볼 수 없습니다. (Bank changed — cannot rebuild this attempt.)", "error");
    return;
  }
  renderReviewBody(exam, entry.answers || {});
  $("review-meta").textContent =
    fmtDate(entry.ts) + " · " + entry.test + " · " + entry.score + "/" + entry.max + "점 · 예상 " + entry.level;
  $("btn-review-back").classList.add("none");
  showScreen("review");
}

function renderReviewBody(exam, answers) {
  const body = $("review-body");
  body.innerHTML = "";
  for (const g of exam.groups) {
    const card = el("section", "item group review");
    card.appendChild(el("h3", "review-group-title", "※ " + esc(g.bp.instruction.ko)));
    if (g.sharedBox) card.appendChild(el("div", "qbox shared", esc(g.sharedBox)));
    for (const q of g.items) card.appendChild(renderQuestion(q, true, answers));
    body.appendChild(card);
  }
}

/* ---------------- notification ---------------- */

let notifTimer = null;

function notify(msg, type) {
  const n = $("notification");
  n.textContent = msg;
  n.setAttribute("type", type || "info");
  n.classList.add("show");
  if (notifTimer) clearTimeout(notifTimer);
  notifTimer = setTimeout(() => n.classList.remove("show"), 2600);
}
