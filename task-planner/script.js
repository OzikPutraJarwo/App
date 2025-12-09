// ------ GLOBAL ------

let fileId = null;
let data = {};
let currentView = 'month'; // 'month' or 'year'
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1; // 1-12

let cloudSuccess = document.querySelector('.cloud-success');
let cloudSync = document.querySelector('.cloud-sync');
let cloudFailed = document.querySelector('.cloud-failed');
let announcement = document.querySelector('.announcement');
let fab = document.getElementById('fab');

// ------ UTILITIES ------

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateForTable_WeekDay(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

function formatDateForTable_Day(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { day: 'numeric' });
}

function formatMonth(month) {
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  return monthNames[month - 1];
}

function getShortMonth(month) {
  return formatMonth(month).substring(0, 3);
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month - 1, 1).getDay();
}

function isToday(year, month, day) {
  const today = new Date();
  return today.getFullYear() === year && 
         today.getMonth() + 1 === month && 
         today.getDate() === day;
}

function compareTasksByTime(a, b) {
  // Sort tasks: first by time (if available), then by creation (id)
  if (a.time && b.time) {
    return a.time.localeCompare(b.time);
  } else if (a.time && !b.time) {
    return -1; // a has time, b doesn't - a comes first
  } else if (!a.time && b.time) {
    return 1; // b has time, a doesn't - b comes first
  } else {
    return a.id.localeCompare(b.id); // both have no time, sort by id
  }
}

function sortTasks(tasks) {
  return tasks.sort(compareTasksByTime);
}

// ------ GOOGLE API ------

function appOnLogin() {
  ['add-task-btn', 'today-btn'].forEach(id => document.getElementById(id).style.display = '');
  fab.style.display = 'block';
  document.querySelector('.view-controls').style.display = 'grid';
  announcement.classList.add('none');
  loadDataFromDrive();
}

function appOnLogout() {
  ['add-task-btn', 'today-btn'].forEach(id => document.getElementById(id).style.display = 'none');
  fab.style.display = 'none';
  document.querySelector('.view-controls').style.display = 'none';
  document.getElementById('month-container').innerHTML = '';
  document.getElementById('year-container').innerHTML = '';
  data = {};
  fileId = null;
  announcement.classList.remove('none');
}

loginCallbacks.push(appOnLogin);
logoutCallbacks.push(appOnLogout);

// ------ DATA MANAGEMENT ------

function addTask(task) {
  const date = new Date(task.date);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  if (!data[year]) data[year] = {};
  if (!data[year][month]) data[year][month] = {};
  if (!data[year][month][day]) data[year][month][day] = [];
  
  task.id = generateId();
  task.completed = false;
  task.createdAt = new Date().toISOString();
  data[year][month][day].push(task);
  
  // Sort tasks for this day
  data[year][month][day] = sortTasks(data[year][month][day]);
  
  return task.id;
}

function updateTask(taskId, updatedTask) {
  for (const year in data) {
    for (const month in data[year]) {
      for (const day in data[year][month]) {
        const index = data[year][month][day].findIndex(task => task.id === taskId);
        if (index !== -1) {
          const oldDate = data[year][month][day][index].date;
          const newDate = updatedTask.date || oldDate;
          
          // If date changed, move task to new date
          if (newDate !== oldDate) {
            const taskToMove = { ...data[year][month][day][index], ...updatedTask };
            data[year][month][day].splice(index, 1);
            
            // Remove empty day/month/year
            if (data[year][month][day].length === 0) {
              delete data[year][month][day];
            }
            if (Object.keys(data[year][month]).length === 0) {
              delete data[year][month];
            }
            if (Object.keys(data[year]).length === 0) {
              delete data[year];
            }
            
            // Add to new date
            const newDateObj = new Date(newDate);
            const newYear = newDateObj.getFullYear();
            const newMonth = String(newDateObj.getMonth() + 1).padStart(2, '0');
            const newDay = String(newDateObj.getDate()).padStart(2, '0');
            
            if (!data[newYear]) data[newYear] = {};
            if (!data[newYear][newMonth]) data[newYear][newMonth] = {};
            if (!data[newYear][newMonth][newDay]) data[newYear][newMonth][newDay] = [];
            
            data[newYear][newMonth][newDay].push(taskToMove);
            data[newYear][newMonth][newDay] = sortTasks(data[newYear][newMonth][newDay]);
          } else {
            // Update in place
            data[year][month][day][index] = { ...data[year][month][day][index], ...updatedTask };
            data[year][month][day] = sortTasks(data[year][month][day]);
          }
          return true;
        }
      }
    }
  }
  return false;
}

function deleteTask(taskId) {
  for (const year in data) {
    for (const month in data[year]) {
      for (const day in data[year][month]) {
        const index = data[year][month][day].findIndex(task => task.id === taskId);
        if (index !== -1) {
          data[year][month][day].splice(index, 1);
          if (data[year][month][day].length === 0) {
            delete data[year][month][day];
          }
          if (Object.keys(data[year][month]).length === 0) {
            delete data[year][month];
          }
          if (Object.keys(data[year]).length === 0) {
            delete data[year];
          }
          return true;
        }
      }
    }
  }
  return false;
}

function getTaskById(taskId) {
  for (const year in data) {
    for (const month in data[year]) {
      for (const day in data[year][month]) {
        const task = data[year][month][day].find(task => task.id === taskId);
        if (task) return { task, year, month, day };
      }
    }
  }
  return null;
}

function toggleTaskComplete(taskId) {
  const taskInfo = getTaskById(taskId);
  if (taskInfo) {
    taskInfo.task.completed = !taskInfo.task.completed;
    return true;
  }
  return false;
}

// ------ RENDER FUNCTIONS ------

function renderMonthView() {
  const container = document.getElementById('month-container');
  container.innerHTML = '';
  
  // Update title
  document.getElementById('view-title').textContent = `${formatMonth(currentMonth)} ${currentYear}`;
  
  const tableContainer = document.createElement('div');
  tableContainer.className = 'month-table-container';
  
  const table = document.createElement('table');
  table.className = 'month-table';
  
  // Table header
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th colspan="2">Date</th>
      <th>Task Name</th>
      <th>Time</th>
      <th>Status</th>
    </tr>
  `;
  table.appendChild(thead);
  
  // Table body
  const tbody = document.createElement('tbody');
  
  const yearStr = currentYear.toString();
  const monthStr = String(currentMonth).padStart(2, '0');
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  
  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = String(day).padStart(2, '0');
    const tasks = data[yearStr]?.[monthStr]?.[dayStr] || [];
    const dateStr = `${currentYear}-${monthStr}-${dayStr}`;
    
    if (tasks.length === 0) {
      // Empty day - still show row
      const row = document.createElement('tr');
      row.className = 'task-row';
      
      const dateCell = document.createElement('td');
      dateCell.className = 'date-cell';
      if (isToday(currentYear, currentMonth, day)) {
        dateCell.classList.add('today');
      }
      dateCell.textContent = formatDateForTable_WeekDay(dateStr);
      row.appendChild(dateCell);
      if (dateCell.textContent === 'Sat' || dateCell.textContent === 'Sun') {
        dateCell.parentNode.classList.add('weekend');
      }

      const dayCell = document.createElement('td');
      dayCell.className = 'date-cell';
      if (isToday(currentYear, currentMonth, day)) {
        dayCell.classList.add('today');
      }
      dayCell.textContent = formatDateForTable_Day(dateStr);
      row.appendChild(dayCell);
      
      const taskNameCell = document.createElement('td');
      taskNameCell.className = 'task-name-cell';
      taskNameCell.textContent = 'No tasks';
      taskNameCell.style.color = '#999';
      taskNameCell.style.fontStyle = 'italic';
      row.appendChild(taskNameCell);
      
      const timeCell = document.createElement('td');
      timeCell.className = 'task-time-cell';
      timeCell.textContent = '-';
      row.appendChild(timeCell);
      
      const statusCell = document.createElement('td');
      statusCell.className = 'status-cell';
      row.appendChild(statusCell);
      
      tbody.appendChild(row);
    } else {
      // Create a row for each task
      tasks.forEach((task, index) => {
        const row = document.createElement('tr');
        row.className = 'task-row';
        if (task.completed) {
          row.classList.add('completed');
        }
        
        // Date cell (only show date for first task of the day)
        const dateCell = document.createElement('td');
        dateCell.className = 'date-cell';
        if (isToday(currentYear, currentMonth, day)) {
          dateCell.classList.add('today');
        }
        if (index === 0) {
          dateCell.textContent = formatDateForTable_WeekDay(dateStr);
          dateCell.rowSpan = tasks.length;
        }
        row.appendChild(dateCell);

        const dayCell = document.createElement('td');
        dayCell.className = 'date-cell';
        if (isToday(currentYear, currentMonth, day)) {
          dayCell.classList.add('today');
        }
        if (index === 0) {
          dayCell.textContent = formatDateForTable_Day(dateStr);
          dayCell.rowSpan = tasks.length;
        }
        row.appendChild(dayCell);
        
        // Task name cell
        const taskNameCell = document.createElement('td');
        taskNameCell.className = 'task-name-cell';
        taskNameCell.textContent = task.title;
        taskNameCell.style.cursor = 'pointer';
        taskNameCell.onclick = () => openDetailModal(task.id);
        row.appendChild(taskNameCell);
        
        // Time cell
        const timeCell = document.createElement('td');
        timeCell.className = 'task-time-cell';
        timeCell.textContent = task.time || '-';
        timeCell.style.cursor = 'pointer';
        timeCell.onclick = () => openDetailModal(task.id);
        row.appendChild(timeCell);
        
        // Status cell with checkbox
        const statusCell = document.createElement('td');
        statusCell.className = 'status-cell';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'task-checkbox';
        checkbox.checked = task.completed;
        checkbox.onclick = (e) => {
          e.stopPropagation();
          toggleTaskComplete(task.id);
          saveDataToDrive();
          renderCurrentView();
        };
        
        statusCell.appendChild(checkbox);
        row.appendChild(statusCell);
        
        tbody.appendChild(row);
      });
    }
  }
  
  table.appendChild(tbody);
  tableContainer.appendChild(table);
  container.appendChild(tableContainer);
  document.querySelectorAll('.date-cell:empty').forEach(el => el.classList.add('empty'));
}

function renderYearView() {
  const container = document.getElementById('year-container');
  container.innerHTML = '';
  
  // Update title
  document.getElementById('view-title').textContent = currentYear;
  
  const yearDiv = document.createElement('div');
  yearDiv.className = 'year-calendar';
  
  for (let month = 1; month <= 12; month++) {
    const monthDiv = document.createElement('div');
    monthDiv.className = 'year-month';
    
    const monthTitle = document.createElement('div');
    monthTitle.className = 'month-title';
    // monthTitle.textContent = getShortMonth(month);
    monthTitle.textContent = formatMonth(month);
    
    // Month grid
    const monthGrid = document.createElement('div');
    monthGrid.className = 'year-month-grid';
    
    // Day headers
    const dayHeaders = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    dayHeaders.forEach(day => {
      const dayHeader = document.createElement('div');
      dayHeader.className = 'year-day-header';
      dayHeader.textContent = day;
      monthGrid.appendChild(dayHeader);
    });
    
    // Get first day of month and days in month
    const firstDay = getFirstDayOfMonth(currentYear, month);
    const daysInMonth = getDaysInMonth(currentYear, month);
    
    // Empty cells for days before first day of month
    for (let i = 0; i < firstDay; i++) {
      const emptyCell = document.createElement('div');
      emptyCell.className = 'year-day-cell empty';
      monthGrid.appendChild(emptyCell);
    }
    
    const monthStr = String(month).padStart(2, '0');
    const yearStr = currentYear.toString();
    
    // Day cells
    for (let day = 1; day <= daysInMonth; day++) {
      const dayCell = document.createElement('div');
      dayCell.className = 'year-day-cell';
      const dayStr = String(day).padStart(2, '0');
      
      dayCell.textContent = day;
      
      // Check if today
      if (isToday(currentYear, month, day)) {
        dayCell.classList.add('today');
      }
      
      // Check if has tasks
      const hasTasks = data[yearStr]?.[monthStr]?.[dayStr]?.length > 0;
      if (hasTasks) {
        dayCell.classList.add('has-tasks');
        
        // Add task dot indicator
        const taskDot = document.createElement('div');
        taskDot.className = 'task-dot';
        dayCell.appendChild(taskDot);
      }
      
      monthGrid.appendChild(dayCell);
    }
    
    // Task count for month
    // const monthTaskCount = document.createElement('div');
    // monthTaskCount.className = 'month-task-count';
    // let totalTasks = 0;
    // let completedTasks = 0;
    
    // if (data[yearStr] && data[yearStr][monthStr]) {
    //   for (const day in data[yearStr][monthStr]) {
    //     const dayTasks = data[yearStr][monthStr][day];
    //     totalTasks += dayTasks.length;
    //     completedTasks += dayTasks.filter(task => task.completed).length;
    //   }
    // }
    
    // monthTaskCount.textContent = `${completedTasks}/${totalTasks} done`;
    // monthDiv.appendChild(monthTaskCount);
    
    monthDiv.appendChild(monthTitle);
    monthDiv.appendChild(monthGrid);
    
    // Click on month to switch to month view
    monthDiv.onclick = () => {
      currentMonth = month;
      switchToMonthView();
    };
    
    yearDiv.appendChild(monthDiv);
  }
  
  container.appendChild(yearDiv);
}

// ------ VIEW CONTROLS ------

function switchToMonthView() {
  currentView = 'month';
  document.getElementById('month-view-btn').classList.add('active');
  document.getElementById('year-view-btn').classList.remove('active');
  document.getElementById('month-container').style.display = 'block';
  document.getElementById('year-container').style.display = 'none';
  renderMonthView();
}

function switchToYearView() {
  currentView = 'year';
  document.getElementById('year-view-btn').classList.add('active');
  document.getElementById('month-view-btn').classList.remove('active');
  document.getElementById('month-container').style.display = 'none';
  document.getElementById('year-container').style.display = 'block';
  renderYearView();
}

function renderCurrentView() {
  if (currentView === 'month') {
    renderMonthView();
  } else {
    renderYearView();
  }
}

function navigatePrev() {
  if (currentView === 'month') {
    currentMonth--;
    if (currentMonth < 1) {
      currentMonth = 12;
      currentYear--;
    }
    renderMonthView();
  } else {
    currentYear--;
    renderYearView();
  }
}

function navigateNext() {
  if (currentView === 'month') {
    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
    renderMonthView();
  } else {
    currentYear++;
    renderYearView();
  }
}

function goToToday() {
  const today = new Date();
  currentYear = today.getFullYear();
  currentMonth = today.getMonth() + 1;
  
  if (currentView === 'year') {
    switchToMonthView();
  } else {
    renderMonthView();
  }
}

// ------ MODAL FUNCTIONS ------

function openTaskModal() {
  document.getElementById('edit-task-id').value = '';
  document.getElementById('task-title').value = '';
  document.getElementById('task-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('task-time').value = '';
  document.getElementById('task-location').value = '';
  document.getElementById('task-notes').value = '';
  document.getElementById('modal-title').textContent = 'Add Task';
  document.getElementById('task-modal').style.display = 'block';
}

function openTaskModalWithDate(date) {
  openTaskModal();
  document.getElementById('task-date').value = date;
}

function openTaskModalForEdit(taskId) {
  const taskInfo = getTaskById(taskId);
  if (!taskInfo) return;
  
  const task = taskInfo.task;
  document.getElementById('edit-task-id').value = task.id;
  document.getElementById('task-title').value = task.title;
  document.getElementById('task-date').value = task.date;
  document.getElementById('task-time').value = task.time || '';
  document.getElementById('task-location').value = task.location || '';
  document.getElementById('task-notes').value = task.notes || '';
  document.getElementById('modal-title').textContent = 'Edit Task';
  document.getElementById('task-modal').style.display = 'block';
}

function closeTaskModal() {
  document.getElementById('task-modal').style.display = 'none';
}

function saveTask() {
  const taskId = document.getElementById('edit-task-id').value;
  const task = {
    title: document.getElementById('task-title').value.trim(),
    date: document.getElementById('task-date').value,
    time: document.getElementById('task-time').value || null,
    location: document.getElementById('task-location').value.trim() || null,
    notes: document.getElementById('task-notes').value.trim() || null
  };
  
  if (!task.title) {
    showNotification('Task name is required', 'error');
    return;
  }
  
  if (!task.date) {
    showNotification('Date is required', 'error');
    return;
  }
  
  if (taskId) {
    // Update existing task
    if (updateTask(taskId, task)) {
      showNotification('Task updated', 'success');
    }
  } else {
    // Add new task
    addTask(task);
    showNotification('Task added', 'success');
  }
  
  renderCurrentView();
  closeTaskModal();
  saveDataToDrive();
}

function openDetailModal(taskId) {
  const taskInfo = getTaskById(taskId);
  if (!taskInfo) return;
  
  const task = taskInfo.task;
  document.getElementById('detail-title').textContent = task.title;
  document.getElementById('detail-date').textContent = formatDate(task.date);
  document.getElementById('detail-time').textContent = task.time || '-';
  document.getElementById('detail-location').textContent = task.location || '-';
  document.getElementById('detail-notes').textContent = task.notes || '-';
  document.getElementById('detail-status').textContent = task.completed ? 'Completed' : 'Pending';
  
  const toggleBtn = document.getElementById('toggle-status-btn');
  toggleBtn.textContent = task.completed ? 'Set as Pending ⏳' : 'Set as Complete ✅';
  toggleBtn.className = `button ${task.completed ? 'cancel' : 'ok'}`;
  
  // Set up button actions
  toggleBtn.onclick = () => {
    toggleTaskComplete(taskId);
    saveDataToDrive();
    openDetailModal(taskId); // Refresh modal
    renderCurrentView();
  };
  
  document.getElementById('edit-detail-btn').onclick = () => {
    closeDetailModal();
    openTaskModalForEdit(taskId);
  };
  
  document.getElementById('delete-detail-btn').onclick = () => {
    if (confirm('Are you sure you want to delete this task?')) {
      deleteTask(taskId);
      showNotification('Task deleted', 'success');
      closeDetailModal();
      renderCurrentView();
      saveDataToDrive();
    }
  };
  
  document.getElementById('detail-modal').style.display = 'block';
}

function closeDetailModal() {
  document.getElementById('detail-modal').style.display = 'none';
}

// ------ DRIVE FUNCTIONS ------

async function loadDataFromDrive() {
  showNotification('Loading...');
  cloudSync.classList.remove('none');
  cloudSuccess.classList.add('none');
  cloudFailed.classList.add('none');
  
  try {
    const res = await gapi.client.drive.files.list({
      q: "name='taskplanner-kodejarwo.json' and trashed=false",
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    if (res.result.files && res.result.files.length > 0) {
      fileId = res.result.files[0].id;
      const file = await gapi.client.drive.files.get({
        fileId: fileId,
        alt: 'media'
      });
      const json = file.result;
      data = json.data || {};
      
      // Ensure all tasks are sorted by time
      for (const year in data) {
        for (const month in data[year]) {
          for (const day in data[year][month]) {
            data[year][month][day] = sortTasks(data[year][month][day]);
          }
        }
      }
      
      renderCurrentView();
    } else {
      fileId = null;
      data = {};
    }
    
    showNotification('Data loaded', 'success');
    cloudSync.classList.add('none');
    cloudSuccess.classList.remove('none');
    cloudFailed.classList.add('none');
  } catch (e) {
    console.error(e);
    showNotification('Failed to load data', 'error');
    cloudSync.classList.add('none');
    cloudSuccess.classList.add('none');
    cloudFailed.classList.remove('none');
  }
}

async function saveDataToDrive() {
  cloudSync.classList.remove('none');
  cloudSuccess.classList.add('none');
  cloudFailed.classList.add('none');
  
  try {
    const fileContent = JSON.stringify({ data });
    const file = new Blob([fileContent], { type: 'application/json' });
    const metadata = {
      name: 'taskplanner-kodejarwo.json',
      mimeType: 'application/json'
    };

    const accessToken = gapi.auth.getToken().access_token;
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    const res = await fetch(fileId ?
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id` :
      `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id`, {
      method: fileId ? 'PATCH' : 'POST',
      headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
      body: form
    });

    if (!res.ok) throw new Error('Save failed');

    const result = await res.json();
    fileId = result.id;
    
    cloudSync.classList.add('none');
    cloudSuccess.classList.remove('none');
    cloudFailed.classList.add('none');
  } catch (e) {
    console.error(e);
    cloudSync.classList.add('none');
    cloudSuccess.classList.add('none');
    cloudFailed.classList.remove('none');
  }
}

// ------ INITIALIZATION ------

document.addEventListener('DOMContentLoaded', () => {
  // Set current date
  const today = new Date();
  currentYear = today.getFullYear();
  currentMonth = today.getMonth() + 1;
  
  // Event Listeners
  document.getElementById('add-task-btn').onclick = openTaskModal;
  document.getElementById('today-btn').onclick = goToToday;
  document.getElementById('save-task-btn').onclick = saveTask;
  document.getElementById('month-view-btn').onclick = switchToMonthView;
  document.getElementById('year-view-btn').onclick = switchToYearView;
  document.getElementById('prev-btn').onclick = navigatePrev;
  document.getElementById('next-btn').onclick = navigateNext;
  
  // Close modals when clicking outside
  window.onclick = (event) => {
    if (event.target.classList.contains('modal')) {
      event.target.style.display = 'none';
    }
  };
});