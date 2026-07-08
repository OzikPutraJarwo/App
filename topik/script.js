"use strict";

/* =========================================================
 * TOPIK Practice — TOPIK I Reading & TOPIK II Writing+Reading
 * Shell design mirrors app.kodejarwo.com apps.
 *
 * - Question bank: bank.json (pools per slot type, shared file)
 * - Every test draws a random exam from the pools; items the
 *   user has seen less often are drawn first (localStorage).
 *   Slot order (easy → hard) is fixed by each BLUEPRINT; only
 *   which item fills a slot is randomized.
 * - TOPIK II includes writing questions (textareas). They are
 *   self-graded on the result screen against model answers;
 *   self-scores are saved into history.
 * - Finished attempts are stored in a history (viewable,
 *   deletable) including the drawn items + answers.
 * ========================================================= */

const BANK_FILE = "bank.json";
const HISTORY_KEY = "topik-history-v1";

const CIRCLED = ["①", "②", "③", "④"];
const CIRCLED_FILLED = ["❶", "❷", "❸", "❹"];

/* ---------------- blueprints ---------------- */

/* TOPIK I Reading: questions 1–40, 100 points. */
const BLUEPRINT_T1 = [
  {
    key: "1-3", kind: "singles", pool: "topic",
    label: "Choosing the topic",
    instruction: {
      ko: "[1~3] 무엇에 대한 이야기입니까? <보기>와 같이 알맞은 것을 고르십시오.",
      en: "What is the passage about? Choose the correct answer as in the example."
    },
    example: { box: "덥습니다. 바다에서 수영합니다.", choices: ["여름", "날씨", "나이", "나라"], answer: 1 },
    picks: [{ n: 1, pts: 2 }, { n: 2, pts: 2 }, { n: 3, pts: 2 }]
  },
  {
    key: "4-9", kind: "singles",
    label: "Fill in the blank",
    instruction: {
      ko: "[4~9] <보기>와 같이 (      )에 들어갈 말로 가장 알맞은 것을 고르십시오.",
      en: "Choose the best word for the blank, as in the example."
    },
    example: { box: "날씨가 좋습니다. (      )이 맑습니다.", choices: ["눈", "밤", "하늘", "구름"], answer: 3 },
    picks: [
      { n: 4, pts: 2, pool: "blank-particle" },
      { n: 5, pts: 2, pool: "blank-noun" },
      { n: 6, pts: 2, pool: "blank-verb" },
      { n: 7, pts: 3, pool: "blank-adj" },
      { n: 8, pts: 3, pool: "blank-adverb" },
      { n: 9, pts: 2, pool: "blank-verb2" }
    ]
  },
  {
    key: "10-12", kind: "singles", pool: "notmatch",
    label: "Practical text — NOT correct",
    instruction: {
      ko: "[10~12] 다음을 읽고 맞지 않는 것을 고르십시오.",
      en: "Read the following and choose the statement that is NOT correct."
    },
    picks: [{ n: 10, pts: 3 }, { n: 11, pts: 3 }, { n: 12, pts: 3 }]
  },
  {
    key: "13-15", kind: "singles", pool: "match",
    label: "Matching content",
    instruction: {
      ko: "[13~15] 다음의 내용과 같은 것을 고르십시오.",
      en: "Choose the statement that matches the content."
    },
    picks: [{ n: 13, pts: 3 }, { n: 14, pts: 2 }, { n: 15, pts: 3 }]
  },
  {
    key: "16-18", kind: "singles", pool: "mainidea",
    label: "Main idea",
    instruction: {
      ko: "[16~18] 다음을 읽고 중심 생각을 고르십시오.",
      en: "Read the following and choose the main idea."
    },
    picks: [{ n: 16, pts: 3 }, { n: 17, pts: 3 }, { n: 18, pts: 2 }]
  },
  pairGroup("19-20", "pair-49-50", [{ n: 19, pts: 2 }, { n: 20, pts: 2 }]),
  pairGroup("21-22", "pair-51-52", [{ n: 21, pts: 3 }, { n: 22, pts: 2 }]),
  pairGroup("23-24", "pair-53-54", [{ n: 23, pts: 2 }, { n: 24, pts: 3 }]),
  pairGroup("25-26", "pair-55-56", [{ n: 25, pts: 2 }, { n: 26, pts: 3 }]),
  {
    key: "27-28", kind: "singles", pool: "ordering",
    label: "Sentence ordering",
    instruction: {
      ko: "[27~28] 다음을 순서대로 맞게 나열한 것을 고르십시오.",
      en: "Choose the correct order of the sentences."
    },
    picks: [{ n: 27, pts: 2 }, { n: 28, pts: 3 }]
  },
  pairGroup("29-30", "pair-59-60", [{ n: 29, pts: 2 }, { n: 30, pts: 3 }]),
  pairGroup("31-32", "pair-61-62", [{ n: 31, pts: 2 }, { n: 32, pts: 2 }]),
  pairGroup("33-34", "pair-63-64", [{ n: 33, pts: 2 }, { n: 34, pts: 3 }]),
  pairGroup("35-36", "pair-65-66", [{ n: 35, pts: 2 }, { n: 36, pts: 3 }]),
  pairGroup("37-38", "pair-67-68", [{ n: 37, pts: 3 }, { n: 38, pts: 3 }]),
  pairGroup("39-40", "pair-69-70", [{ n: 39, pts: 3 }, { n: 40, pts: 3 }])
];

/* TOPIK II Writing + Reading: questions 1–54, 200 points.
 * Writing (1–4, 100 pts) mirrors real questions 51–54;
 * Reading (5–54, 50 × 2 pts) mirrors real questions 1–50. */
const BLUEPRINT_T2 = [
  {
    key: "1-2", kind: "write",
    label: "Writing — sentence blanks",
    instruction: {
      ko: "[1~2] 다음을 읽고 ㉠과 ㉡에 들어갈 말을 한 문장씩 쓰십시오. (각 10점)",
      en: "Read each text and write one appropriate sentence for ㉠ and ㉡."
    },
    picks: [
      { n: 1, pts: 10, pool: "t2w-51" },
      { n: 2, pts: 10, pool: "t2w-52" }
    ]
  },
  {
    key: "3", kind: "write",
    label: "Writing — describing data",
    instruction: {
      ko: "[3] 다음 자료를 참고하여 조사 결과를 설명하는 글을 200~300자로 쓰십시오. (30점)",
      en: "Describe and compare the survey results in 200–300 characters."
    },
    picks: [{ n: 3, pts: 30, pool: "t2w-53" }]
  },
  {
    key: "4", kind: "write",
    label: "Writing — essay",
    instruction: {
      ko: "[4] 다음을 주제로 하여 자신의 생각을 600~700자로 글을 쓰십시오. (50점)",
      en: "Write an essay of 600–700 characters on the given topic."
    },
    picks: [{ n: 4, pts: 50, pool: "t2w-54" }]
  },
  {
    key: "5-6", kind: "singles", pool: "t2r-gram",
    label: "Grammar blank",
    instruction: {
      ko: "[5~6] (      )에 들어갈 말로 가장 알맞은 것을 고르십시오. (각 2점)",
      en: "Choose the most appropriate expression for the blank."
    },
    picks: [{ n: 5, pts: 2 }, { n: 6, pts: 2 }]
  },
  {
    key: "7-8", kind: "singles", pool: "t2r-sim",
    label: "Similar meaning",
    instruction: {
      ko: "[7~8] 밑줄 친 부분과 의미가 가장 비슷한 것을 고르십시오. (각 2점)",
      en: "Choose the option closest in meaning to the underlined part."
    },
    picks: [{ n: 7, pts: 2 }, { n: 8, pts: 2 }]
  },
  {
    key: "9-12", kind: "singles", pool: "t2r-ad",
    label: "What the text is about",
    instruction: {
      ko: "[9~12] 다음은 무엇에 대한 글인지 고르십시오. (각 2점)",
      en: "Choose what the text is about."
    },
    picks: [{ n: 9, pts: 2 }, { n: 10, pts: 2 }, { n: 11, pts: 2 }, { n: 12, pts: 2 }]
  },
  {
    key: "13-16", kind: "singles",
    label: "Matching info (notice/graph/text)",
    instruction: {
      ko: "[13~16] 다음 글 또는 그래프의 내용과 같은 것을 고르십시오. (각 2점)",
      en: "Choose the statement that matches the text or graph."
    },
    picks: [
      { n: 13, pts: 2, pool: "t2r-info-notice" },
      { n: 14, pts: 2, pool: "t2r-info-graph" },
      { n: 15, pts: 2, pool: "t2r-info-text" },
      { n: 16, pts: 2, pool: "t2r-info-text" }
    ]
  },
  {
    key: "17-19", kind: "singles", pool: "t2r-order",
    label: "Sentence ordering",
    instruction: {
      ko: "[17~19] 다음을 순서에 맞게 배열한 것을 고르십시오. (각 2점)",
      en: "Choose the correct order of the sentences."
    },
    picks: [{ n: 17, pts: 2 }, { n: 18, pts: 2 }, { n: 19, pts: 2 }]
  },
  {
    key: "20-22", kind: "singles", pool: "t2r-blank1",
    label: "Fill in the blank",
    instruction: {
      ko: "[20~22] (      )에 들어갈 말로 가장 알맞은 것을 고르십시오. (각 2점)",
      en: "Choose the most appropriate expression for the blank."
    },
    picks: [{ n: 20, pts: 2 }, { n: 21, pts: 2 }, { n: 22, pts: 2 }]
  },
  pairGroupT2("23-24", "t2r-pair-a", "Adverb blank + theme"),
  pairGroupT2("25-26", "t2r-pair-b", "Idiom + matching content"),
  pairGroupT2("27-28", "t2r-pair-c", "Essay — feeling + content"),
  {
    key: "29-31", kind: "singles", pool: "t2r-head",
    label: "News headlines",
    instruction: {
      ko: "[29~31] 다음 신문 기사의 제목을 가장 잘 설명한 것을 고르십시오. (각 2점)",
      en: "Choose the best explanation of the newspaper headline."
    },
    picks: [{ n: 29, pts: 2 }, { n: 30, pts: 2 }, { n: 31, pts: 2 }]
  },
  {
    key: "32-35", kind: "singles", pool: "t2r-blank2",
    label: "Fill in the blank (long)",
    instruction: {
      ko: "[32~35] (      )에 들어갈 말로 가장 알맞은 것을 고르십시오. (각 2점)",
      en: "Choose the most appropriate expression for the blank."
    },
    picks: [{ n: 32, pts: 2 }, { n: 33, pts: 2 }, { n: 34, pts: 2 }, { n: 35, pts: 2 }]
  },
  {
    key: "36-38", kind: "singles", pool: "t2r-match",
    label: "Matching content",
    instruction: {
      ko: "[36~38] 다음을 읽고 글의 내용과 같은 것을 고르십시오. (각 2점)",
      en: "Choose the statement that matches the passage."
    },
    picks: [{ n: 36, pts: 2 }, { n: 37, pts: 2 }, { n: 38, pts: 2 }]
  },
  {
    key: "39-42", kind: "singles", pool: "t2r-theme",
    label: "Theme of the passage",
    instruction: {
      ko: "[39~42] 다음을 읽고 글의 주제로 가장 알맞은 것을 고르십시오. (각 2점)",
      en: "Choose the best statement of the passage's theme."
    },
    picks: [{ n: 39, pts: 2 }, { n: 40, pts: 2 }, { n: 41, pts: 2 }, { n: 42, pts: 2 }]
  },
  {
    key: "43-45", kind: "singles", pool: "t2r-insert",
    label: "Sentence insertion",
    instruction: {
      ko: "[43~45] 주어진 문장이 들어갈 곳으로 가장 알맞은 것을 고르십시오. (각 2점)",
      en: "Choose where the given sentence best fits in the passage."
    },
    picks: [{ n: 43, pts: 2 }, { n: 44, pts: 2 }, { n: 45, pts: 2 }]
  },
  pairGroupT2("46-47", "t2r-pair-d", "Fiction — feeling + inference"),
  pairGroupT2("48-49", "t2r-pair-e", "Blank + theme"),
  pairGroupT2("50-51", "t2r-pair-f", "Writer's attitude + content"),
  pairGroupT2("52-54", "t2r-pair-g", "Purpose + blank + content")
];

function pairGroup(key, pool, picks) {
  return {
    key, kind: "pair", pool, picks,
    label: "Passage questions " + key.replace("-", "–"),
    instruction: {
      ko: "[" + key.replace("-", "~") + "] 다음을 읽고 물음에 답하십시오.",
      en: "Read the following and answer the questions."
    }
  };
}

function pairGroupT2(key, pool, label) {
  const nums = key.split("-").map(Number);
  const picks = [];
  for (let n = nums[0]; n <= nums[1]; n++) picks.push({ n, pts: 2 });
  return {
    key, kind: "pair", pool, picks, label,
    instruction: {
      ko: "[" + key.replace("-", "~") + "] 다음을 읽고 물음에 답하십시오. (각 2점)",
      en: "Read the following and answer the questions."
    }
  };
}

/* ---------------- tests registry ---------------- */

const TESTS = {
  t1: {
    name: "TOPIK I Reading",
    minutes: 60,
    blueprint: BLUEPRINT_T1,
    progressKey: "topik1-read-progress-v1",
    seenKey: "topik1-read-seen-v1",
    hasWriting: false,
    /* Official TOPIK I cutoffs out of 200 (listening + reading):
     * Level 1: 80–139, Level 2: 140+. Projection: reading × 2. */
    level(score) {
      const projected = score * 2;
      if (projected >= 140) return { badge: "Level 2", cls: "pass", projected, base: 200 };
      if (projected >= 80) return { badge: "Level 1", cls: "pass", projected, base: 200 };
      return { badge: "Not passing", cls: "fail", projected, base: 200 };
    },
    levelNote(score, lvl) {
      return "The estimated level assumes an equal Listening score: " + score + " × 2 = " + lvl.projected +
        " out of 300 total is not used here — TOPIK I is graded out of 200 (Level 1 ≥ 80, Level 2 ≥ 140).";
    }
  },
  t2: {
    name: "TOPIK II Writing + Reading",
    minutes: 120,
    blueprint: BLUEPRINT_T2,
    progressKey: "topik2-progress-v1",
    seenKey: "topik2-seen-v1",
    hasWriting: true,
    /* Official TOPIK II cutoffs out of 300 (listening + writing + reading):
     * Level 3 ≥ 120, Level 4 ≥ 150, Level 5 ≥ 190, Level 6 ≥ 230.
     * Projection from writing+reading (200 pts): score × 1.5. */
    level(score) {
      const projected = Math.round(score * 1.5);
      if (projected >= 230) return { badge: "Level 6", cls: "pass", projected, base: 300 };
      if (projected >= 190) return { badge: "Level 5", cls: "pass", projected, base: 300 };
      if (projected >= 150) return { badge: "Level 4", cls: "pass", projected, base: 300 };
      if (projected >= 120) return { badge: "Level 3", cls: "pass", projected, base: 300 };
      return { badge: "Not passing", cls: "fail", projected, base: 300 };
    },
    levelNote(score, lvl) {
      return "The estimated level assumes a proportional Listening score: " + score + " × 1.5 = " + lvl.projected +
        " out of 300 (Level 3 ≥ 120, Level 4 ≥ 150, Level 5 ≥ 190, Level 6 ≥ 230). Writing is self-graded.";
    }
  }
};

/* ---------------- state ---------------- */

const state = {
  pools: null,
  testId: "t1",
  exam: null,        // { groups: [{ bp, sharedBox, chosenIds, items:[...] }] }
  answers: {},       // number -> 1..4 (MCQ) | string / string[] (writing)
  selfScores: {},    // number -> self-graded points (writing)
  limit: 0,
  remaining: 0,
  timerId: null,
  finished: false,
  mode: null,        // "exam" while a test is running
  lastResult: null
};

const SCREENS = ["main", "exam", "result", "review"];

const $ = (id) => document.getElementById(id);

const curTest = () => TESTS[state.testId];

document.addEventListener("DOMContentLoaded", init);

/* ---------------- init & data loading ---------------- */

async function init() {
  // $("btn-home").addEventListener("click", (e) => { e.preventDefault(); goHome(); });
  $("btn-submit").addEventListener("click", () => submit(false));
  $("btn-submit-bottom").addEventListener("click", () => submit(false));
  $("btn-clear-history").addEventListener("click", clearHistoryAll);
  $("btn-review").addEventListener("click", () => openReviewFromResult());
  $("btn-new-test").addEventListener("click", () => startExam(state.testId));
  $("btn-result-home").addEventListener("click", goHome);
  $("btn-review-back").addEventListener("click", () => showScreen("result"));
  $("btn-review-home").addEventListener("click", goHome);
  $("btn-review-home-bottom").addEventListener("click", goHome);

  for (const t of Object.keys(TESTS)) {
    $("btn-start-" + t).addEventListener("click", () => startExam(t));
    $("btn-resume-" + t).addEventListener("click", () => resumeSaved(t));
    $("btn-discard-" + t).addEventListener("click", () => {
      clearProgress(t);
      renderHome();
      notify("Saved test discarded.", "info");
    });
  }

  $("answered-count").addEventListener("click", () => toggleNavPanel());
  $("answered-count").addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleNavPanel(); }
  });
  document.addEventListener("click", (e) => {
    const panel = $("nav-panel");
    if (panel.classList.contains("none")) return;
    if (panel.contains(e.target) || $("answered-count").contains(e.target)) return;
    closeNavPanel();
  });

  try {
    const data = await fetch(BANK_FILE).then((r) => {
      if (!r.ok) throw new Error(BANK_FILE + " → HTTP " + r.status);
      return r.json();
    });
    state.pools = data.pools;
    for (const t of Object.keys(TESTS)) checkBank(TESTS[t].blueprint);
  } catch (err) {
    showLoadError(err);
  }

  renderHome();
  showScreen("main");
}

function checkBank(blueprint) {
  for (const bp of blueprint) {
    const need = {};
    for (const p of bp.picks) {
      const name = p.pool || bp.pool;
      need[name] = (need[name] || 0) + (bp.kind === "pair" ? 0 : 1);
      if (bp.kind === "pair") need[name] = Math.max(need[name], 1);
    }
    for (const [name, n] of Object.entries(need)) {
      const pool = state.pools[name];
      if (!pool || pool.length < n) throw new Error("Bank pool '" + name + "' is missing or too small.");
    }
  }
}

function icon(name) {
  return '<span class="material-symbols-rounded">' + name + "</span>";
}

function showLoadError(err) {
  const box = $("load-error");
  box.innerHTML =
    icon("error") + " Could not load the question bank.<br>" +
    esc(String(err && err.message ? err.message : err)) +
    "<br><br>If you're opening this file locally, run a static server instead — " +
    "e.g. <em>python3 -m http.server</em>, then open http://localhost:8000";
  box.classList.remove("none");
  for (const t of Object.keys(TESTS)) $("btn-start-" + t).disabled = true;
  state.pools = null;
}

/* ---------------- navigation ---------------- */

function showScreen(name) {
  for (const s of SCREENS) $("screen-" + s).classList.toggle("none", s !== name);
  document.body.classList.toggle("main", name === "main");
  document.body.classList.toggle("exam-active", name === "exam");
  closeNavPanel();
  window.scrollTo(0, 0);
}

function toggleNavPanel() {
  if ($("nav-panel").classList.contains("none")) openNavPanel();
  else closeNavPanel();
}

function openNavPanel() {
  $("nav-panel").classList.remove("none");
  $("answered-count").setAttribute("aria-expanded", "true");
  $("nav-toggle-icon").textContent = "expand_more";
}

function closeNavPanel() {
  $("nav-panel").classList.add("none");
  $("answered-count").setAttribute("aria-expanded", "false");
  $("nav-toggle-icon").textContent = "expand_less";
}

function goHome() {
  if (state.mode === "exam" && !state.finished) {
    const ok = window.confirm(
      "Go to the main menu? Your progress will be saved so you can resume later."
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
  for (const t of Object.keys(TESTS)) {
    const saved = state.pools ? loadProgress(t) : null;
    const exam = saved ? rebuildExam(saved, TESTS[t].blueprint) : null;
    $("resume-box-" + t).classList.toggle("none", !exam);
  }
  renderHistory();
}

function resumeSaved(testId) {
  const saved = loadProgress(testId);
  const exam = saved ? rebuildExam(saved, TESTS[testId].blueprint) : null;
  if (!exam) {
    notify("Could not load the saved test.", "error");
    clearProgress(testId);
    renderHome();
    return;
  }
  state.testId = testId;
  state.exam = exam;
  state.answers = saved.answers || {};
  state.selfScores = {};
  state.limit = typeof saved.limit === "number" ? saved.limit : timeLimitSeconds();
  state.remaining = typeof saved.remaining === "number" ? saved.remaining : state.limit;
  state.finished = false;
  state.mode = "exam";
  enterExamScreen();
}

/* ---------------- sampling ---------------- */

function loadSeen() {
  try { return JSON.parse(localStorage.getItem(curTest().seenKey)) || {}; } catch { return {}; }
}
function saveSeen(seen) {
  try { localStorage.setItem(curTest().seenKey, JSON.stringify(seen)); } catch { /* ignore */ }
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

function mcqItem(p, it) {
  return {
    number: p.n, points: p.pts,
    box: it.box || null, box2: it.box2 || null, stem: it.stem || null,
    choices: it.choices, answer: it.answer, explanation: it.explanation,
    srcId: it.id
  };
}

function writeItem(p, it) {
  return {
    number: p.n, points: p.pts, type: "write", task: it.task,
    box: it.box, blanks: it.blanks || null,
    min: it.min || null, max: it.max || null,
    model: it.model, explanation: it.explanation,
    srcId: it.id
  };
}

function pairQuestionItem(pick, q) {
  return {
    number: pick.n, points: pick.pts,
    box: q.box || null, box2: q.box2 || null, stem: q.stem || null,
    choices: q.choices, answer: q.answer, explanation: q.explanation
  };
}

/* Draws one random exam for the current test. The blueprint
 * order (easy → hard) stays fixed; only which item fills each
 * slot is randomized, weighted toward least-seen items. */
function sampleExam() {
  const blueprint = curTest().blueprint;
  const seen = loadSeen();
  const used = new Set();
  const groups = blueprint.map((bp) => {
    if (bp.kind === "pair") {
      const v = pickOne(bp.pool, seen, used);
      const items = v.questions.map((q, i) => pairQuestionItem(bp.picks[i], q));
      return { bp, sharedBox: v.sharedBox, chosenIds: [v.id], items };
    }
    const items = bp.picks.map((p) => {
      const it = pickOne(p.pool || bp.pool, seen, used);
      return bp.kind === "write" ? writeItem(p, it) : mcqItem(p, it);
    });
    return { bp, sharedBox: null, chosenIds: items.map((i) => i.srcId), items };
  });

  for (const g of groups) for (const id of g.chosenIds) seen[id] = (seen[id] || 0) + 1;
  saveSeen(seen);

  return { groups };
}

/* Rebuild an exam from stored item ids for a given blueprint.
 * Returns the exam object or null (e.g. bank changed). */
function rebuildExam(saved, blueprint) {
  if (!saved || !saved.chosen || !state.pools) return null;
  try {
    const groups = blueprint.map((bp) => {
      const ids = saved.chosen[bp.key];
      if (!ids || !ids.length) throw new Error("missing " + bp.key);
      if (bp.kind === "pair") {
        const v = state.pools[bp.pool].find((x) => x.id === ids[0]);
        if (!v) throw new Error("missing item " + ids[0]);
        const items = v.questions.map((q, i) => pairQuestionItem(bp.picks[i], q));
        return { bp, sharedBox: v.sharedBox, chosenIds: ids, items };
      }
      const items = bp.picks.map((p, i) => {
        const pool = state.pools[p.pool || bp.pool];
        const it = pool.find((x) => x.id === ids[i]);
        if (!it) throw new Error("missing item " + ids[i]);
        return bp.kind === "write" ? writeItem(p, it) : mcqItem(p, it);
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
    testId: state.testId,
    chosen: chosenMap(state.exam),
    answers: state.answers,
    limit: state.limit,
    remaining: state.remaining,
    t: Date.now()
  };
  try { localStorage.setItem(curTest().progressKey, JSON.stringify(data)); } catch { /* ignore */ }
}

function loadProgress(testId) {
  try { return JSON.parse(localStorage.getItem(TESTS[testId].progressKey)); } catch { return null; }
}

function clearProgress(testId) {
  try { localStorage.removeItem(TESTS[testId || state.testId].progressKey); } catch { /* ignore */ }
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

function updateHistoryEntry(entry) {
  const list = loadHistory();
  const i = list.findIndex((e) => e.id === entry.id);
  if (i >= 0) { list[i] = entry; saveHistory(list); }
}

function deleteHistoryEntry(id) {
  saveHistory(loadHistory().filter((e) => e.id !== id));
  renderHistory();
  notify("Attempt deleted.", "info");
}

function clearHistoryAll() {
  if (!window.confirm("Delete ALL history? This cannot be undone.")) return;
  saveHistory([]);
  renderHistory();
  notify("History cleared.", "info");
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
    const viewBtn = el("button", "btn-secondary small", icon("visibility") + " View");
    viewBtn.type = "button";
    viewBtn.addEventListener("click", () => openHistoryReview(entry));
    tdView.appendChild(viewBtn);
    tr.appendChild(tdView);

    const tdDel = el("td", "actions-cell");
    const delBtn = el("button", "btn-danger small", icon("delete") + " Delete");
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
  const minutes = p ? Math.max(0.1, parseFloat(p)) : curTest().minutes;
  return Math.round(minutes * 60);
}

function startExam(testId) {
  if (!state.pools) {
    notify("Question bank not loaded.", "error");
    return;
  }
  state.testId = testId;
  clearProgress(testId);
  state.exam = sampleExam();
  state.answers = {};
  state.selfScores = {};
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
  $("timer-value").textContent = String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  const wrap = $("timer");
  wrap.classList.toggle("warn", t <= 600 && t > 300);
  wrap.classList.toggle("danger", t <= 300);
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

/* Escape, then apply light markup: {u}...{/u} → underline. */
function fmt(s) {
  return esc(s).replace(/\{u\}/g, "<u>").replace(/\{\/u\}/g, "</u>");
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
    if (g.sharedBox) groupEl.appendChild(el("div", "qbox shared", fmt(g.sharedBox)));

    for (const q of g.items) {
      groupEl.appendChild(q.type === "write"
        ? renderWriteQuestion(q, false, state.answers, state.selfScores)
        : renderQuestion(q, false, state.answers));

      const navBtn = el("button", null, String(q.number));
      navBtn.id = "nav-" + q.number;
      navBtn.type = "button";
      navBtn.addEventListener("click", () => {
        closeNavPanel();
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
    if (user === q.answer) head += ' <span class="review-status ok">' + icon("check_circle") + " Correct</span>";
    else if (user) head += ' <span class="review-status no">' + icon("cancel") + " Incorrect</span>";
    else head += ' <span class="review-status no">' + icon("help") + " No answer</span>";
  }
  wrap.appendChild(el("div", "qhead", head));

  if (q.box) wrap.appendChild(el("div", "qbox", fmt(q.box)));
  if (q.box2) wrap.appendChild(el("div", "qbox", fmt(q.box2)));
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

/* Writing question: textareas in exam mode; user answer + model
 * answer + self-score in review mode. */
function renderWriteQuestion(q, review, answers, selfScores) {
  const wrap = el("article", "question write" + (review ? " review" : ""));
  wrap.id = (review ? "r-" : "q-") + q.number;

  let head = q.number + ". <span class=\"pts\">(" + q.points + "점)</span>";
  head += ' <span class="write-chip">' + icon("edit_note") + " Writing</span>";
  if (review) {
    const self = selfScores && typeof selfScores[q.number] === "number" ? selfScores[q.number] : 0;
    head += ' <span class="review-status ' + (self > 0 ? "ok" : "no") + '">Self-graded: ' + self + "/" + q.points + "</span>";
  }
  wrap.appendChild(el("div", "qhead", head));

  wrap.appendChild(el("div", "qbox", fmt(q.box)));

  if (!review) {
    if (q.task === "blanks") {
      const cur = Array.isArray(answers[q.number]) ? answers[q.number] : [];
      q.blanks.forEach((label, i) => {
        const row = el("div", "write-blank");
        row.appendChild(el("span", "write-blank-label", esc(label)));
        const ta = document.createElement("textarea");
        ta.rows = 2;
        ta.placeholder = "Write one sentence for " + label;
        ta.value = cur[i] || "";
        ta.addEventListener("input", () => {
          const arr = Array.isArray(state.answers[q.number]) ? state.answers[q.number] : q.blanks.map(() => "");
          arr[i] = ta.value;
          setWriteAnswer(q, arr);
        });
        row.appendChild(ta);
        wrap.appendChild(row);
      });
    } else {
      const ta = document.createElement("textarea");
      ta.rows = q.max >= 600 ? 14 : 8;
      ta.className = "write-essay";
      ta.placeholder = q.min + "–" + q.max + " characters";
      ta.value = typeof answers[q.number] === "string" ? answers[q.number] : "";
      const counter = el("div", "char-counter");
      const updateCounter = () => {
        const n = ta.value.replace(/\n/g, "").length;
        counter.textContent = n + " / " + q.min + "–" + q.max + "자";
        counter.classList.toggle("bad", n > 0 && (n < q.min || n > q.max));
      };
      ta.addEventListener("input", () => {
        setWriteAnswer(q, ta.value);
        updateCounter();
      });
      updateCounter();
      wrap.appendChild(ta);
      wrap.appendChild(counter);
    }
  } else {
    const user = answers[q.number];
    if (q.task === "blanks") {
      q.blanks.forEach((label, i) => {
        const text = Array.isArray(user) && user[i] && user[i].trim() ? user[i] : null;
        wrap.appendChild(el("div", "write-answer" + (text ? "" : " empty"),
          '<span class="write-blank-label">' + esc(label) + "</span>" +
          (text ? esc(text) : "(no answer)")));
      });
    } else {
      const text = typeof user === "string" && user.trim() ? user : null;
      const n = text ? text.replace(/\n/g, "").length : 0;
      wrap.appendChild(el("div", "write-answer essay" + (text ? "" : " empty"),
        text ? fmtMultiline(text) + '<span class="char-note">' + n + "자</span>" : "(no answer)"));
    }

    const modelHtml = Array.isArray(q.model)
      ? q.model.map((m, i) => '<div><span class="write-blank-label">' + esc(q.blanks ? q.blanks[i] : (i + 1)) + "</span>" + esc(m) + "</div>").join("")
      : fmtMultiline(q.model);
    wrap.appendChild(el("div", "model-box",
      '<div class="model-title">' + icon("workspace_premium") + " Model answer</div>" + modelHtml));

    if (q.explanation) {
      wrap.appendChild(el("div", "explain",
        esc(q.explanation.ko) + '<span class="en">' + esc(q.explanation.en) + "</span>"));
    }
  }
  return wrap;
}

function fmtMultiline(s) {
  return esc(s).replace(/\n/g, "<br>");
}

let writeSaveTimer = null;

function setWriteAnswer(q, value) {
  if (state.finished || state.mode !== "exam") return;
  state.answers[q.number] = value;
  updateAnswerUI();
  if (writeSaveTimer) clearTimeout(writeSaveTimer);
  writeSaveTimer = setTimeout(saveProgress, 600);
}

function isAnswered(q, answers) {
  const a = answers[q.number];
  if (q.type === "write") {
    if (q.task === "blanks") {
      return Array.isArray(a) && q.blanks.every((_, i) => a[i] && a[i].trim().length > 0);
    }
    return typeof a === "string" && a.trim().length > 0;
  }
  return !!a;
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
      const has = isAnswered(q, state.answers);
      if (has) answered += 1;
      const navBtn = $("nav-" + q.number);
      if (navBtn) navBtn.classList.toggle("answered", has);
    }
  }
  $("answered-value").textContent = answered + "/" + total;
}

/* ---------------- submit & results ---------------- */

function submit(auto) {
  if (state.finished || state.mode !== "exam") return;

  if (!auto) {
    let un = 0;
    for (const g of state.exam.groups)
      for (const q of g.items)
        if (!isAnswered(q, state.answers)) un += 1;
    const msg = un > 0
      ? "You have " + un + " unanswered question(s). Submit anyway?"
      : "Submit now?";
    if (!window.confirm(msg)) return;
  }

  state.finished = true;
  state.mode = null;
  stopTimer();
  clearProgress(state.testId);

  state.selfScores = {};
  const res = computeResults();
  const lvl = curTest().level(res.score);
  const entry = {
    id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    ts: Date.now(),
    testId: state.testId,
    test: curTest().name,
    score: res.score,
    max: res.maxScore,
    level: lvl.badge,
    levelCls: lvl.cls,
    timeUsed: Math.max(0, state.limit - Math.max(0, state.remaining)),
    chosen: chosenMap(state.exam),
    answers: Object.assign({}, state.answers),
    selfScores: {}
  };
  addHistory(entry);

  state.lastResult = { res, lvl, entry, auto };
  renderResult();
  showScreen("result");
}

function computeResults() {
  let score = 0, maxScore = 0;
  const rows = [];
  for (const g of state.exam.groups) {
    let correct = 0, pts = 0, ptsMax = 0, writing = false;
    for (const q of g.items) {
      maxScore += q.points;
      ptsMax += q.points;
      if (q.type === "write") {
        writing = true;
        const self = Math.min(q.points, Math.max(0, state.selfScores[q.number] || 0));
        pts += self;
        score += self;
      } else if (state.answers[q.number] === q.answer) {
        correct += 1;
        pts += q.points;
        score += q.points;
      }
    }
    rows.push({ bp: g.bp, correct, count: g.items.length, pts, ptsMax, writing });
  }
  return { score, maxScore, rows };
}

function levelInfo(score) {
  return curTest().level(score);
}

function renderResult() {
  renderScorePanel();
  renderResultMeta();
  renderBreakdown();
  renderWritingGrade();
}

function renderScorePanel() {
  const { res, lvl } = state.lastResult;
  $("score-panel").innerHTML =
    '<div class="conclusion ' + (lvl.cls === "pass" ? "normal" : "not-normal") + '">' +
    '<div class="score-line">' + res.score + "<span> / " + res.maxScore + " pts</span></div>" +
    '<div class="level-line">Estimated ' + esc(lvl.badge) + "</div>" +
    "</div>";
}

function renderResultMeta() {
  const { res, lvl, entry, auto } = state.lastResult;
  const test = TESTS[entry.testId];
  let note;
  if (entry.testId === "t2") {
    note = "The estimated level assumes a proportional Listening score: " + res.score + " × 1.5 = " + lvl.projected +
      " out of 300 (Level 3 ≥ 120, Level 4 ≥ 150, Level 5 ≥ 190, Level 6 ≥ 230). Writing questions are self-graded below.";
  } else {
    note = "The estimated level assumes an equal Listening score: " + res.score + " × 2 = " + lvl.projected +
      " out of 200 (Level 1 ≥ 80, Level 2 ≥ 140).";
  }
  $("result-meta").innerHTML =
    (auto ? icon("alarm") + " Time is up — submitted automatically.<br>" : "") +
    esc(fmtDate(entry.ts)) + " · Time used " + esc(fmtDuration(entry.timeUsed)) + " · " + esc(test.name) + "<br>" +
    note;
}

function renderBreakdown() {
  const { res } = state.lastResult;
  const tbody = $("breakdown-body");
  tbody.innerHTML = "";
  for (const row of res.rows) {
    const tr = document.createElement("tr");
    tr.appendChild(el("td", null, esc(row.bp.key.replace("-", "–"))));
    tr.appendChild(el("td", "type-cell", esc(row.bp.label)));
    tr.appendChild(el("td", null, row.writing ? "self" : row.correct + "/" + row.count));
    tr.appendChild(el("td", null, row.pts + "/" + row.ptsMax));
    tbody.appendChild(tr);
  }
}

function renderWritingGrade() {
  const { entry } = state.lastResult;
  const card = $("writing-grade");
  if (!TESTS[entry.testId].hasWriting) {
    card.classList.add("none");
    return;
  }
  card.classList.remove("none");
  const rows = $("writing-grade-rows");
  rows.innerHTML = "";
  for (const g of state.exam.groups) {
    for (const q of g.items) {
      if (q.type !== "write") continue;
      const row = el("div", "grade-row");
      row.appendChild(el("span", "grade-label",
        "Q" + q.number + ' <span class="en">' + esc(g.bp.label) + "</span>"));
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.max = String(q.points);
      input.step = q.points >= 30 ? "5" : "1";
      input.value = String(state.selfScores[q.number] || 0);
      input.addEventListener("change", () => {
        let v = Math.round(Number(input.value) || 0);
        v = Math.min(q.points, Math.max(0, v));
        input.value = String(v);
        onSelfScore(q.number, v);
      });
      row.appendChild(input);
      row.appendChild(el("span", "grade-max", "/ " + q.points));
      rows.appendChild(row);
    }
  }
}

function onSelfScore(number, value) {
  state.selfScores[number] = value;
  const res = computeResults();
  const lvl = curTest().level(res.score);
  const { entry } = state.lastResult;
  entry.selfScores = Object.assign({}, state.selfScores);
  entry.score = res.score;
  entry.level = lvl.badge;
  entry.levelCls = lvl.cls;
  updateHistoryEntry(entry);
  state.lastResult.res = res;
  state.lastResult.lvl = lvl;
  renderScorePanel();
  renderResultMeta();
  renderBreakdown();
}

/* ---------------- review ---------------- */

function openReviewFromResult() {
  if (!state.lastResult) return;
  const { res, entry } = state.lastResult;
  renderReviewBody(state.exam, state.answers, state.selfScores);
  $("review-meta").textContent =
    fmtDate(entry.ts) + " · " + entry.test + " · " + res.score + "/" + res.maxScore + " pts · Estimated " + entry.level;
  $("btn-review-back").classList.remove("none");
  showScreen("review");
}

function openHistoryReview(entry) {
  if (!state.pools) {
    notify("Question bank not loaded.", "error");
    return;
  }
  const testId = entry.testId || "t1";
  const exam = rebuildExam({ chosen: entry.chosen }, TESTS[testId].blueprint);
  if (!exam) {
    notify("The question bank has changed — this attempt can no longer be reviewed.", "error");
    return;
  }
  renderReviewBody(exam, entry.answers || {}, entry.selfScores || {});
  $("review-meta").textContent =
    fmtDate(entry.ts) + " · " + entry.test + " · " + entry.score + "/" + entry.max + " pts · Estimated " + entry.level;
  $("btn-review-back").classList.add("none");
  showScreen("review");
}

function renderReviewBody(exam, answers, selfScores) {
  const body = $("review-body");
  body.innerHTML = "";
  for (const g of exam.groups) {
    const card = el("section", "item group review");
    card.appendChild(el("h3", "review-group-title", "※ " + esc(g.bp.instruction.ko)));
    if (g.sharedBox) card.appendChild(el("div", "qbox shared", fmt(g.sharedBox)));
    for (const q of g.items) {
      card.appendChild(q.type === "write"
        ? renderWriteQuestion(q, true, answers, selfScores)
        : renderQuestion(q, true, answers));
    }
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
