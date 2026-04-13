// ===========================
// DAILY REMINDER NOTIFICATION MODULE
// ===========================
// Sends local notifications to installed PWA (mobile + desktop) showing
// counts of "today" and "overdue" reminders.
// Schedule and frequency are fully configurable via User Settings > Notifications.

const NotificationsModule = (() => {
  const STORAGE_KEY_LAST_DATES = "notifLastShownDates";
  const STORAGE_KEY_PERMISSION_ASKED = "notifPermissionAsked";

  // ---- Default schedule ----
  const DEFAULT_SETTINGS = {
    enabled: true,
    scope: "general",
    overdue: {
      enabled: true,
      timesPerDay: 1,
      hours: [8],
    },
    today: {
      enabled: true,
      timesPerDay: 1,
      hours: [7],
    },
  };

  // ---- Helpers ----

  function isSupported() {
    return "Notification" in window && "serviceWorker" in navigator;
  }

  function getSettings() {
    const stored = userSettingsState?.data?.notifications;
    if (stored && typeof stored === "object") return stored;
    return DEFAULT_SETTINGS;
  }

  function getShownRecord() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_LAST_DATES);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveShownRecord(record) {
    localStorage.setItem(STORAGE_KEY_LAST_DATES, JSON.stringify(record));
  }

  function todayKey() {
    return new Date().toISOString().split("T")[0];
  }

  function currentHour() {
    return new Date().getHours();
  }

  // ---- Reminder counting ----

  function getReminderCounts() {
    let todayCount = 0;
    let overdueCount = 0;

    try {
      if (typeof buildObservationReminders === "function") {
        buildObservationReminders().forEach((tg) => {
          tg.areaGroups.forEach((ag) => {
            ag.items.forEach((item) => {
              if (item.status === "today") todayCount++;
              if (item.status === "overdue") overdueCount++;
            });
          });
        });
      }
      if (typeof buildAgronomyReminders === "function") {
        buildAgronomyReminders().forEach((tg) => {
          tg.areaGroups.forEach((ag) => {
            ag.items.forEach((item) => {
              if (item.status === "today") todayCount++;
              if (item.status === "overdue") overdueCount++;
            });
          });
        });
      }
    } catch (err) {
      console.warn("NotificationsModule: failed to count reminders", err);
    }

    return { todayCount, overdueCount };
  }

  /**
   * Group reminder counts by trial or by location.
   * Returns an array of { id, name, todayCount, overdueCount }.
   */
  function getReminderCountsGrouped(groupBy) {
    const groups = {};

    function addToGroup(groupId, groupName, items) {
      if (!groups[groupId]) groups[groupId] = { id: groupId, name: groupName, todayCount: 0, overdueCount: 0 };
      items.forEach((item) => {
        if (item.status === "today") groups[groupId].todayCount++;
        if (item.status === "overdue") groups[groupId].overdueCount++;
      });
    }

    function processGroups(builders) {
      builders.forEach((buildFn) => {
        if (typeof buildFn !== "function") return;
        try {
          buildFn().forEach((tg) => {
            const trial = tg.trial;
            tg.areaGroups.forEach((ag) => {
              if (groupBy === "per-trial") {
                addToGroup(trial.id, trial.name, ag.items);
              } else if (groupBy === "per-location") {
                const locId = trial.locationId || "unknown";
                const loc = (typeof inventoryState !== "undefined" && inventoryState.items?.locations || [])
                  .find((l) => l.id === locId);
                const locName = loc ? loc.name : (trial.locationName || "Unknown Location");
                addToGroup(locId, locName, ag.items);
              }
            });
          });
        } catch (err) {
          console.warn("NotificationsModule: grouped count error", err);
        }
      });
    }

    processGroups([
      typeof buildObservationReminders === "function" ? buildObservationReminders : null,
      typeof buildAgronomyReminders === "function" ? buildAgronomyReminders : null,
    ].filter(Boolean));

    return Object.values(groups).filter((g) => g.todayCount > 0 || g.overdueCount > 0);
  }

  // ---- Permission ----

  function requestPermission() {
    if (!isSupported()) return;
    localStorage.setItem(STORAGE_KEY_PERMISSION_ASKED, "1");
    Notification.requestPermission();
  }

  // ---- Schedule logic ----

  /**
   * Determine if a notification should fire for a particular type ("today"|"overdue").
   * Returns true if the current hour matches one of the configured hours
   * AND that hour has not already been shown today.
   */
  function shouldFire(typeKey) {
    const settings = getSettings();
    if (!settings.enabled) return false;
    const cfg = settings[typeKey];
    if (!cfg || !cfg.enabled) return false;

    const hours = Array.isArray(cfg.hours) ? cfg.hours : [];
    if (hours.length === 0) return false;

    const nowHour = currentHour();
    // Find the latest hour <= nowHour in the schedule
    const matchedHour = hours.filter((h) => h <= nowHour).sort((a, b) => b - a)[0];
    if (matchedHour == null) return false;

    // Check if already fired for that hour today
    const record = getShownRecord();
    const dayRecord = record[todayKey()] || {};
    const firedHours = dayRecord[typeKey] || [];
    return !firedHours.includes(matchedHour);
  }

  function markFired(typeKey) {
    const record = getShownRecord();
    const day = todayKey();

    // Clean old days (keep only today)
    for (const key of Object.keys(record)) {
      if (key !== day) delete record[key];
    }

    if (!record[day]) record[day] = {};
    if (!record[day][typeKey]) record[day][typeKey] = [];

    const nowHour = currentHour();
    const settings = getSettings();
    const hours = settings[typeKey]?.hours || [];
    const matchedHour = hours.filter((h) => h <= nowHour).sort((a, b) => b - a)[0];
    if (matchedHour != null && !record[day][typeKey].includes(matchedHour)) {
      record[day][typeKey].push(matchedHour);
    }

    saveShownRecord(record);
  }

  // ---- Show notification ----

  function showNotification(title, body, tag) {
    if (Notification.permission !== "granted") return;

    navigator.serviceWorker.ready.then((registration) => {
      registration.showNotification(title, {
        body,
        icon: "icons/SPECTRA%20Logo.png",
        badge: "icons/SPECTRA%20Logo.png",
        tag,
        requireInteraction: false,
        silent: false,
      });
    }).catch(() => {
      // Fallback: direct Notification (desktop)
      const n = new Notification(title, {
        body,
        icon: "icons/SPECTRA%20Logo.png",
        tag,
      });
      n.addEventListener("click", () => {
        n.close();
        window.focus();
        if (typeof switchPage === "function") switchPage("reminder");
      });
    });
  }

  // ---- Core check ----

  function checkAndNotify() {
    if (!isSupported()) return;
    if (Notification.permission !== "granted") return;

    const settings = getSettings();
    const scope = settings.scope || "general";

    if (scope === "general") {
      const { todayCount, overdueCount } = getReminderCounts();

      if (overdueCount > 0 && shouldFire("overdue")) {
        showNotification(
          `\u26A0\uFE0F ${overdueCount} Overdue Reminder${overdueCount > 1 ? "s" : ""}`,
          `You have ${overdueCount} overdue task${overdueCount > 1 ? "s" : ""}. Check your reminders!`,
          "spectra-overdue",
        );
        markFired("overdue");
      }

      if (todayCount > 0 && shouldFire("today")) {
        showNotification(
          `\uD83D\uDCCB ${todayCount} Task${todayCount > 1 ? "s" : ""} Due Today`,
          `You have ${todayCount} reminder${todayCount > 1 ? "s" : ""} scheduled for today.`,
          "spectra-today",
        );
        markFired("today");
      }
    } else {
      // Per-trial or per-location
      const groups = getReminderCountsGrouped(scope);

      if (shouldFire("overdue")) {
        const overdueGroups = groups.filter((g) => g.overdueCount > 0);
        overdueGroups.forEach((g) => {
          showNotification(
            `\u26A0\uFE0F ${g.name}: ${g.overdueCount} Overdue`,
            `${g.overdueCount} overdue task${g.overdueCount > 1 ? "s" : ""} in ${g.name}.`,
            `spectra-overdue-${g.id}`,
          );
        });
        if (overdueGroups.length > 0) markFired("overdue");
      }

      if (shouldFire("today")) {
        const todayGroups = groups.filter((g) => g.todayCount > 0);
        todayGroups.forEach((g) => {
          showNotification(
            `\uD83D\uDCCB ${g.name}: ${g.todayCount} Due Today`,
            `${g.todayCount} task${g.todayCount > 1 ? "s" : ""} due today in ${g.name}.`,
            `spectra-today-${g.id}`,
          );
        });
        if (todayGroups.length > 0) markFired("today");
      }
    }
  }

  // ---- Interval ----

  let _intervalId = null;

  function startInterval() {
    if (_intervalId) return;
    // Check every 15 minutes
    _intervalId = setInterval(checkAndNotify, 15 * 60 * 1000);
  }

  function stopInterval() {
    if (_intervalId) {
      clearInterval(_intervalId);
      _intervalId = null;
    }
  }

  // ---- Init ----

  function init() {
    if (!isSupported()) return;

    // Ask permission first time
    if (Notification.permission === "default" && !localStorage.getItem(STORAGE_KEY_PERMISSION_ASKED)) {
      requestPermission();
    }

    // Check once on load (delayed to let data load)
    setTimeout(checkAndNotify, 5000);

    // Re-check when app regains focus
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) checkAndNotify();
    });

    startInterval();
  }

  // ---- Public API for settings UI ----

  return {
    DEFAULT_SETTINGS,
    init,
    checkAndNotify,
    requestPermission,
    isSupported,
    getReminderCounts,
    startInterval,
    stopInterval,
  };
})();

// Auto-initialize after DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => NotificationsModule.init());
} else {
  NotificationsModule.init();
}
