// ===== PWA =====

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js", { scope: "./" })
      .then((reg) => console.log("SW active:", reg.scope))
      .catch((err) => console.error("SW failed:", err));
  });
}

// ===== GLOBALS =====

let fileId = null;
let data = {};
let currentView = "month";
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;

const cloudSuccess = document.querySelector(".cloud-success");
const cloudSync = document.querySelector(".cloud-sync");
const cloudFailed = document.querySelector(".cloud-failed");
const tpAnnounce = document.querySelector(".tp-announce");
const tpFab = document.getElementById("tp-fab");
const tpToolbar = document.querySelector(".tp-toolbar");

// ===== UTILITIES =====

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateForTable_WeekDay(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-US", { weekday: "short" });
}

function formatDateForTable_Day(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-US", { day: "numeric" });
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatMonth(month) {
  return MONTH_NAMES[month - 1];
}

function getShortMonth(month) {
  return MONTH_NAMES[month - 1].substring(0, 3);
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month - 1, 1).getDay();
}

function isToday(year, month, day) {
  const t = new Date();
  return t.getFullYear() === year && t.getMonth() + 1 === month && t.getDate() === day;
}

function compareTasksByTime(a, b) {
  if (a.time && b.time) return a.time.localeCompare(b.time);
  if (a.time && !b.time) return -1;
  if (!a.time && b.time) return 1;
  return a.id.localeCompare(b.id);
}

function sortTasks(tasks) {
  return tasks.sort(compareTasksByTime);
}

// ===== AUTH CALLBACKS =====

function appOnLogin() {
  tpFab.style.display = "block";
  tpToolbar.style.display = "flex";
  tpAnnounce.classList.add("none");
  loadDataFromDrive();
}

function appOnLogout() {
  tpFab.style.display = "none";
  tpToolbar.style.display = "none";
  document.getElementById("month-container").innerHTML = "";
  document.getElementById("year-container").innerHTML = "";
  data = {};
  fileId = null;
  tpAnnounce.classList.remove("none");
}

loginCallbacks.push(appOnLogin);
logoutCallbacks.push(appOnLogout);

// ===== DATA MANAGEMENT =====

function addTask(task) {
  const date = new Date(task.date);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  if (!data[year]) data[year] = {};
  if (!data[year][month]) data[year][month] = {};
  if (!data[year][month][day]) data[year][month][day] = [];

  task.id = generateId();
  task.completed = false;
  task.createdAt = new Date().toISOString();
  data[year][month][day].push(task);
  data[year][month][day] = sortTasks(data[year][month][day]);
  return task.id;
}

function updateTask(taskId, updatedTask) {
  for (const year in data) {
    for (const month in data[year]) {
      for (const day in data[year][month]) {
        const index = data[year][month][day].findIndex((t) => t.id === taskId);
        if (index === -1) continue;

        const oldDate = data[year][month][day][index].date;
        const newDate = updatedTask.date || oldDate;

        if (newDate !== oldDate) {
          const taskToMove = { ...data[year][month][day][index], ...updatedTask };
          data[year][month][day].splice(index, 1);
          if (!data[year][month][day].length) delete data[year][month][day];
          if (!Object.keys(data[year][month]).length) delete data[year][month];
          if (!Object.keys(data[year]).length) delete data[year];

          const nd = new Date(newDate);
          const ny = nd.getFullYear();
          const nm = String(nd.getMonth() + 1).padStart(2, "0");
          const nd2 = String(nd.getDate()).padStart(2, "0");
          if (!data[ny]) data[ny] = {};
          if (!data[ny][nm]) data[ny][nm] = {};
          if (!data[ny][nm][nd2]) data[ny][nm][nd2] = [];
          data[ny][nm][nd2].push(taskToMove);
          data[ny][nm][nd2] = sortTasks(data[ny][nm][nd2]);
        } else {
          data[year][month][day][index] = { ...data[year][month][day][index], ...updatedTask };
          data[year][month][day] = sortTasks(data[year][month][day]);
        }
        return true;
      }
    }
  }
  return false;
}

function deleteTask(taskId) {
  for (const year in data) {
    for (const month in data[year]) {
      for (const day in data[year][month]) {
        const index = data[year][month][day].findIndex((t) => t.id === taskId);
        if (index === -1) continue;
        data[year][month][day].splice(index, 1);
        if (!data[year][month][day].length) delete data[year][month][day];
        if (!Object.keys(data[year][month]).length) delete data[year][month];
        if (!Object.keys(data[year]).length) delete data[year];
        return true;
      }
    }
  }
  return false;
}

function getTaskById(taskId) {
  for (const year in data) {
    for (const month in data[year]) {
      for (const day in data[year][month]) {
        const task = data[year][month][day].find((t) => t.id === taskId);
        if (task) return { task, year, month, day };
      }
    }
  }
  return null;
}

function toggleTaskComplete(taskId) {
  const info = getTaskById(taskId);
  if (info) {
    info.task.completed = !info.task.completed;
    return true;
  }
  return false;
}

// ===== RENDER — MONTH VIEW =====

function renderMonthView() {
  const container = document.getElementById("month-container");
  container.innerHTML = "";

  document.getElementById("view-title").textContent =
    `${formatMonth(currentMonth)} ${currentYear}`;

  const agenda = document.createElement("div");
  agenda.className = "tp-agenda";

  // Header row
  const head = document.createElement("div");
  head.className = "tp-agenda-head";
  head.innerHTML = "<div>Date</div><div>Task</div><div>Time</div><div></div>";
  agenda.appendChild(head);

  const yearStr = currentYear.toString();
  const monthStr = String(currentMonth).padStart(2, "0");
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = String(day).padStart(2, "0");
    const dateStr = `${currentYear}-${monthStr}-${dayStr}`;
    const tasks = data[yearStr]?.[monthStr]?.[dayStr] || [];
    const weekday = new Date(currentYear, currentMonth - 1, day).getDay();

    const row = document.createElement("div");
    row.className = "tp-row";
    if (isToday(currentYear, currentMonth, day)) row.classList.add("tp-today");
    if (weekday === 0 || weekday === 6) row.classList.add("tp-weekend");

    // Date column
    const dateCol = document.createElement("div");
    dateCol.className = "tp-date";
    dateCol.innerHTML = `
      <span class="tp-date-day">${formatDateForTable_WeekDay(dateStr)}</span>
      <span class="tp-date-num">${day}</span>
    `;
    row.appendChild(dateCol);

    // Tasks column
    const tasksCol = document.createElement("div");
    tasksCol.className = "tp-tasks";

    if (tasks.length === 0) {
      const empty = document.createElement("div");
      empty.className = "tp-empty-day";
      empty.textContent = "—";
      tasksCol.appendChild(empty);
    } else {
      tasks.forEach((task) => {
        const taskEl = document.createElement("div");
        taskEl.className = "tp-task";
        if (task.completed) taskEl.classList.add("tp-done");

        const nameSpan = document.createElement("span");
        nameSpan.className = "tp-task-name";
        nameSpan.textContent = task.title;

        const timeSpan = document.createElement("span");
        timeSpan.className = "tp-task-time";
        timeSpan.textContent = task.time || "—";

        const checkLabel = document.createElement("label");
        checkLabel.className = "tp-task-check";
        checkLabel.onclick = (e) => e.stopPropagation();

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = task.completed;
        checkbox.addEventListener("change", () => {
          toggleTaskComplete(task.id);
          saveDataToDrive();
          renderCurrentView();
        });

        checkLabel.appendChild(checkbox);
        taskEl.appendChild(nameSpan);
        taskEl.appendChild(timeSpan);
        taskEl.appendChild(checkLabel);

        taskEl.addEventListener("click", (e) => {
          if (e.target.type !== "checkbox") openDetailModal(task.id);
        });

        tasksCol.appendChild(taskEl);
      });
    }

    row.appendChild(tasksCol);
    agenda.appendChild(row);
  }

  container.appendChild(agenda);
}

// ===== RENDER — YEAR VIEW =====

function renderYearView() {
  const container = document.getElementById("year-container");
  container.innerHTML = "";

  document.getElementById("view-title").textContent = currentYear;

  const grid = document.createElement("div");
  grid.className = "tp-year-grid";

  const yearStr = currentYear.toString();

  for (let month = 1; month <= 12; month++) {
    const card = document.createElement("div");
    card.className = "tp-year-card";

    const title = document.createElement("div");
    title.className = "tp-year-month-name";
    title.textContent = formatMonth(month);

    const days = document.createElement("div");
    days.className = "tp-year-days";

    // Day headers
    ["S", "M", "T", "W", "T", "F", "S"].forEach((d) => {
      const dh = document.createElement("div");
      dh.className = "tp-year-dh";
      dh.textContent = d;
      days.appendChild(dh);
    });

    const firstDay = getFirstDayOfMonth(currentYear, month);
    const daysInMonth = getDaysInMonth(currentYear, month);

    for (let i = 0; i < firstDay; i++) {
      const ec = document.createElement("div");
      ec.className = "tp-year-dc tp-empty";
      days.appendChild(ec);
    }

    const monthStr = String(month).padStart(2, "0");

    for (let day = 1; day <= daysInMonth; day++) {
      const dc = document.createElement("div");
      dc.className = "tp-year-dc";
      dc.textContent = day;

      if (isToday(currentYear, month, day)) dc.classList.add("tp-today-cell");

      const dayStr = String(day).padStart(2, "0");
      const hasTasks = data[yearStr]?.[monthStr]?.[dayStr]?.length > 0;
      if (hasTasks) {
        dc.classList.add("tp-has-task");
        const dot = document.createElement("div");
        dot.className = "tp-year-dot";
        dc.appendChild(dot);
      }

      days.appendChild(dc);
    }

    // Task count
    let total = 0, done = 0;
    if (data[yearStr]?.[monthStr]) {
      for (const d in data[yearStr][monthStr]) {
        const dayTasks = data[yearStr][monthStr][d];
        total += dayTasks.length;
        done += dayTasks.filter((t) => t.completed).length;
      }
    }

    const count = document.createElement("div");
    count.className = "tp-year-task-count";
    count.textContent = total > 0 ? `${done}/${total} done` : "No tasks";

    card.appendChild(title);
    card.appendChild(days);
    card.appendChild(count);

    card.onclick = () => {
      currentMonth = month;
      switchToMonthView();
    };

    grid.appendChild(card);
  }

  container.appendChild(grid);
}

// ===== VIEW CONTROLS =====

function switchToMonthView() {
  currentView = "month";
  document.getElementById("month-view-btn").classList.add("active");
  document.getElementById("year-view-btn").classList.remove("active");
  document.getElementById("month-container").style.display = "block";
  document.getElementById("year-container").style.display = "none";
  renderMonthView();
}

function switchToYearView() {
  currentView = "year";
  document.getElementById("year-view-btn").classList.add("active");
  document.getElementById("month-view-btn").classList.remove("active");
  document.getElementById("month-container").style.display = "none";
  document.getElementById("year-container").style.display = "block";
  renderYearView();
}

function renderCurrentView() {
  if (currentView === "month") renderMonthView();
  else renderYearView();
}

function navigatePrev() {
  if (currentView === "month") {
    currentMonth--;
    if (currentMonth < 1) { currentMonth = 12; currentYear--; }
    renderMonthView();
  } else {
    currentYear--;
    renderYearView();
  }
}

function navigateNext() {
  if (currentView === "month") {
    currentMonth++;
    if (currentMonth > 12) { currentMonth = 1; currentYear++; }
    renderMonthView();
  } else {
    currentYear++;
    renderYearView();
  }
}

function goToToday() {
  const t = new Date();
  currentYear = t.getFullYear();
  currentMonth = t.getMonth() + 1;
  if (currentView === "year") switchToMonthView();
  else renderMonthView();
}

// ===== MODAL — TASK =====

function openTaskModal() {
  document.getElementById("edit-task-id").value = "";
  document.getElementById("task-title").value = "";
  document.getElementById("task-date").value = new Date().toISOString().split("T")[0];
  document.getElementById("task-time").value = "";
  document.getElementById("task-location").value = "";
  document.getElementById("task-notes").value = "";
  document.getElementById("tp-dialog-title").textContent = "Add Task";
  document.getElementById("tp-task-overlay").classList.add("tp-show");
  setTimeout(() => document.getElementById("task-title").focus(), 100);
}

function openTaskModalForEdit(taskId) {
  const info = getTaskById(taskId);
  if (!info) return;
  const task = info.task;
  document.getElementById("edit-task-id").value = task.id;
  document.getElementById("task-title").value = task.title;
  document.getElementById("task-date").value = task.date;
  document.getElementById("task-time").value = task.time || "";
  document.getElementById("task-location").value = task.location || "";
  document.getElementById("task-notes").value = task.notes || "";
  document.getElementById("tp-dialog-title").textContent = "Edit Task";
  document.getElementById("tp-task-overlay").classList.add("tp-show");
  setTimeout(() => document.getElementById("task-title").focus(), 100);
}

function closeTaskModal() {
  document.getElementById("tp-task-overlay").classList.remove("tp-show");
}

function saveTask() {
  const taskId = document.getElementById("edit-task-id").value;
  const task = {
    title: document.getElementById("task-title").value.trim(),
    date: document.getElementById("task-date").value,
    time: document.getElementById("task-time").value || null,
    location: document.getElementById("task-location").value.trim() || null,
    notes: document.getElementById("task-notes").value.trim() || null,
  };

  if (!task.title) { showNotification("Task name is required", "error"); return; }
  if (!task.date) { showNotification("Date is required", "error"); return; }

  if (taskId) {
    if (updateTask(taskId, task)) showNotification("Task updated", "success");
  } else {
    addTask(task);
    showNotification("Task added", "success");
  }

  renderCurrentView();
  closeTaskModal();
  saveDataToDrive();
}

// ===== MODAL — DETAIL =====

function openDetailModal(taskId) {
  const info = getTaskById(taskId);
  if (!info) return;
  const task = info.task;

  document.getElementById("tp-detail-title").textContent = task.title;
  document.getElementById("tp-detail-date").textContent = formatDate(task.date);
  document.getElementById("tp-detail-time").textContent = task.time || "—";
  document.getElementById("tp-detail-location").textContent = task.location || "—";
  document.getElementById("tp-detail-notes").textContent = task.notes || "—";

  const toggleBtn = document.getElementById("tp-toggle-status");
  toggleBtn.textContent = task.completed ? "Set Pending ⏳" : "Complete ✓";
  toggleBtn.style.background = task.completed ? "var(--red)" : "var(--green)";

  toggleBtn.onclick = () => {
    toggleTaskComplete(taskId);
    saveDataToDrive();
    openDetailModal(taskId);
    renderCurrentView();
  };

  document.getElementById("tp-edit-btn").onclick = () => {
    closeDetailModal();
    openTaskModalForEdit(taskId);
  };

  document.getElementById("tp-delete-btn").onclick = () => {
    if (confirm("Delete this task?")) {
      deleteTask(taskId);
      showNotification("Task deleted", "success");
      closeDetailModal();
      renderCurrentView();
      saveDataToDrive();
    }
  };

  document.getElementById("tp-detail-overlay").classList.add("tp-show");
}

function closeDetailModal() {
  document.getElementById("tp-detail-overlay").classList.remove("tp-show");
}

// ===== PDF DOWNLOAD =====

function downloadPDF() {
  const area = document.getElementById("tp-pdf-area");
  const yearStr = currentYear.toString();
  const monthStr = String(currentMonth).padStart(2, "0");
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);

  // Count total rows to determine font size
  let totalRows = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = String(day).padStart(2, "0");
    const tasks = data[yearStr]?.[monthStr]?.[dayStr] || [];
    totalRows += Math.max(tasks.length, 1);
  }

  const fontSize = totalRows <= 35 ? "9pt" : totalRows <= 50 ? "8pt" : "7pt";
  const cellPad = totalRows <= 35 ? "5px 7px" : "3px 5px";

  let rows = "";
  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = String(day).padStart(2, "0");
    const dateStr = `${currentYear}-${monthStr}-${dayStr}`;
    const tasks = data[yearStr]?.[monthStr]?.[dayStr] || [];
    const wd = formatDateForTable_WeekDay(dateStr);
    const isWeekend = [0, 6].includes(new Date(currentYear, currentMonth - 1, day).getDay());
    const wdColor = isWeekend ? "color:#c0392b;" : "";
    const borderB = "border-bottom:1px solid #ddd;";

    if (tasks.length === 0) {
      rows += `<tr>
        <td style="${borderB}padding:${cellPad};text-align:center;font-weight:600;${wdColor}">${wd}</td>
        <td style="${borderB}padding:${cellPad};text-align:center;font-weight:700;${wdColor}">${day}</td>
        <td style="${borderB}padding:${cellPad};color:#bbb;font-style:italic;" colspan="4">—</td>
      </tr>`;
    } else {
      tasks.forEach((task, i) => {
        const dateCell = i === 0
          ? `<td style="${borderB}padding:${cellPad};text-align:center;font-weight:600;${wdColor}" rowspan="${tasks.length}">${wd}</td>
             <td style="${borderB}padding:${cellPad};text-align:center;font-weight:700;${wdColor}" rowspan="${tasks.length}">${day}</td>`
          : "";
        const deco = task.completed ? "text-decoration:line-through;color:#aaa;" : "";
        rows += `<tr>
          ${dateCell}
          <td style="${borderB}padding:${cellPad};${deco}">${task.title}</td>
          <td style="${borderB}padding:${cellPad};text-align:center;color:#666;">${task.time || "—"}</td>
          <td style="${borderB}padding:${cellPad};text-align:center;color:#666;">${task.location || "—"}</td>
          <td style="${borderB}padding:${cellPad};text-align:center;">${task.completed ? "✓" : ""}</td>
        </tr>`;
      });
    }
  }

  area.innerHTML = `
    <div style="font-family:Arial,Helvetica,sans-serif;width:190mm;margin:auto;padding:8mm 0;">
      <h2 style="text-align:center;font-size:13pt;margin:-16pt 0 4px 0;color:#222;">
        Task Planner
      </h2>
      <p style="text-align:center;font-size:10pt;margin:0 0 12px;color:#666;">
        ${formatMonth(currentMonth)} ${currentYear}
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:${fontSize};">
        <thead>
          <tr style="background:#f5f5f5;">
            <th style="padding:${cellPad};border:1px solid #ddd;text-align:center;width:36px;">Day</th>
            <th style="padding:${cellPad};border:1px solid #ddd;text-align:center;width:24px;">#</th>
            <th style="padding:${cellPad};border:1px solid #ddd;text-align:left;">Task</th>
            <th style="padding:${cellPad};border:1px solid #ddd;text-align:center;width:42px;">Time</th>
            <th style="padding:${cellPad};border:1px solid #ddd;text-align:center;width:60px;">Location</th>
            <th style="padding:${cellPad};border:1px solid #ddd;text-align:center;width:22px;">✓</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  const el = area.firstElementChild;

  if (typeof html2pdf !== "undefined") {
    html2pdf()
      .set({
        margin: [8, 8, 16, 10],
        filename: `Tasks_${formatMonth(currentMonth)}_${currentYear}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .from(el)
      .save()
      .then(() => {
        area.innerHTML = "";
        showNotification("PDF downloaded", "success");
      });
  } else {
    // Fallback: open print dialog
    const w = window.open("", "_blank");
    w.document.write(`<!DOCTYPE html><html><head><title>Tasks ${formatMonth(currentMonth)} ${currentYear}</title>
      <style>@page{size:A4;margin:10mm;}body{margin:0;}</style></head><body>${el.outerHTML}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
    area.innerHTML = "";
  }
}

// ===== GOOGLE DRIVE =====

async function loadDataFromDrive() {
  showNotification("Loading...");
  cloudSync.classList.remove("none");
  cloudSuccess.classList.add("none");
  cloudFailed.classList.add("none");

  try {
    const res = await gapi.client.drive.files.list({
      q: "name='taskplanner-kodejarwo.json' and trashed=false",
      fields: "files(id, name)",
      spaces: "drive",
    });

    if (res.result.files && res.result.files.length > 0) {
      fileId = res.result.files[0].id;
      const file = await gapi.client.drive.files.get({ fileId, alt: "media" });
      data = file.result?.data || {};

      for (const year in data)
        for (const month in data[year])
          for (const day in data[year][month])
            data[year][month][day] = sortTasks(data[year][month][day]);

      renderCurrentView();
    } else {
      fileId = null;
      data = {};
    }

    showNotification("Data loaded", "success");
    cloudSync.classList.add("none");
    cloudSuccess.classList.remove("none");
    cloudFailed.classList.add("none");
  } catch (e) {
    console.error(e);
    showNotification("Failed to load data", "error");
    cloudSync.classList.add("none");
    cloudSuccess.classList.add("none");
    cloudFailed.classList.remove("none");
  }
}

async function saveDataToDrive() {
  cloudSync.classList.remove("none");
  cloudSuccess.classList.add("none");
  cloudFailed.classList.add("none");

  try {
    const blob = new Blob([JSON.stringify({ data })], { type: "application/json" });
    const metadata = { name: "taskplanner-kodejarwo.json", mimeType: "application/json" };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", blob);

    const token = gapi.auth.getToken().access_token;
    const url = fileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id`
      : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id`;

    const res = await fetch(url, {
      method: fileId ? "PATCH" : "POST",
      headers: { Authorization: "Bearer " + token },
      body: form,
    });

    if (!res.ok) throw new Error("Save failed");
    fileId = (await res.json()).id;

    cloudSync.classList.add("none");
    cloudSuccess.classList.remove("none");
    cloudFailed.classList.add("none");
  } catch (e) {
    console.error(e);
    cloudSync.classList.add("none");
    cloudSuccess.classList.add("none");
    cloudFailed.classList.remove("none");
  }
}

// ===== INITIALIZATION =====

document.addEventListener("DOMContentLoaded", () => {
  const today = new Date();
  currentYear = today.getFullYear();
  currentMonth = today.getMonth() + 1;

  // Navigation
  document.getElementById("prev-btn").onclick = navigatePrev;
  document.getElementById("next-btn").onclick = navigateNext;
  document.getElementById("today-btn").onclick = goToToday;

  // View switch
  document.getElementById("month-view-btn").onclick = switchToMonthView;
  document.getElementById("year-view-btn").onclick = switchToYearView;

  // Task modal
  document.getElementById("save-task-btn").onclick = saveTask;

  // PDF
  document.getElementById("download-pdf-btn").onclick = downloadPDF;

  // Close overlays on backdrop click
  document.querySelectorAll(".tp-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.classList.remove("tp-show");
    });
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeTaskModal();
      closeDetailModal();
    }
  });

  // Enter to save in task modal
  ["task-title", "task-date", "task-time", "task-location"].forEach((id) => {
    document.getElementById(id).addEventListener("keydown", (e) => {
      if (e.key === "Enter") saveTask();
    });
  });
});
