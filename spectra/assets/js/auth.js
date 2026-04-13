// Google OAuth Configuration
const CLIENT_ID =
  "400272927751-t5ehe632lahuk9p38eie583tv2obv60s.apps.googleusercontent.com";
const API_KEY = "AIzaSyACgQqP_f8cohSUMTJEN2CbKwiNvQN2E7Y";
const DISCOVERY_DOCS = [
  "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
];
const SCOPES =
  "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email";

// Placeholder for showLoading - will be overridden by app.js
function showLoading(isLoading) {
  const loader = document.getElementById("loadingContainer");
  if (loader) {
    loader.style.display = isLoading ? "flex" : "none";
  }
}

let tokenClient;
let currentUser = null;
let accessToken = null;
let tokenExpiresAt = null;
let tokenRefreshTimer = null;
let tokenCountdownTimer = null;
let authExpiryHandlingInProgress = false;

// Token refresh interval: 50 minutes (tokens expire at ~60min)
const TOKEN_REFRESH_INTERVAL = 50 * 60 * 1000;

// Initialize Google APIs
function initializeGoogleAPIs() {
  return new Promise((resolve) => {
    gapi.load("client", async () => {
      await gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: DISCOVERY_DOCS,
      });

      // Initialize Google Identity Services
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: handleAuthResponse,
      });

      resolve();
    });
  });
}

function handleAuthResponse(response) {
  if (response.error) {
    console.error("Auth error:", response);
    showLoading(false);

    // If this was a silent refresh attempt, resolve the pending promise
    if (_silentRefreshResolve) {
      _silentRefreshResolve(false);
      _silentRefreshResolve = null;
    }

    showToast("Authentication failed. Please try again.", "error");
    return;
  }

  if (response.access_token) {
    accessToken = response.access_token;
    gapi.client.setToken({ access_token: accessToken });

    // Calculate token expiry (default 3600s = 1 hour)
    const expiresIn = (response.expires_in || 3600) * 1000;
    tokenExpiresAt = Date.now() + expiresIn;

    // Save to localStorage
    localStorage.setItem("accessToken", accessToken);
    localStorage.setItem("tokenExpiresAt", tokenExpiresAt.toString());

    // Start auto-refresh timer
    scheduleTokenRefresh();
    // Start countdown UI update
    startTokenCountdown();

    // If this was a silent refresh, resolve promise and return
    if (_silentRefreshResolve) {
      console.log("Token silently refreshed, expires in", Math.round(expiresIn / 60000), "min");
      _silentRefreshResolve(true);
      _silentRefreshResolve = null;
      return;
    }

    // Get user info (only on first login, not on refresh)
    fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => res.json())
      .then((userInfo) => {
        currentUser = {
          email: userInfo.email,
          name: userInfo.name,
          picture: userInfo.picture,
        };

        // Save to localStorage
        localStorage.setItem("currentUser", JSON.stringify(currentUser));

        // Initialize app
        initializeApp();
      })
      .catch((error) => {
        console.error("Error getting user info:", error);
        showLoading(false);
        showToast("Failed to get user information. Please try again.", "error");
      });
  }
}

// Silent refresh callback resolver
let _silentRefreshResolve = null;

// Schedule automatic token refresh before expiry
function scheduleTokenRefresh() {
  if (tokenRefreshTimer) {
    clearTimeout(tokenRefreshTimer);
  }

  const timeUntilRefresh = tokenExpiresAt
    ? Math.max(tokenExpiresAt - Date.now() - 10 * 60 * 1000, 60000) // 10 min before expiry, minimum 1 min
    : TOKEN_REFRESH_INTERVAL;

  tokenRefreshTimer = setTimeout(async () => {
    console.log("Auto-refreshing token...");
    const success = await silentTokenRefresh();
    if (!success) {
      console.warn("Silent refresh failed, will retry on next sync");
    }
  }, timeUntilRefresh);

  console.log("Token refresh scheduled in", Math.round(timeUntilRefresh / 60000), "min");
  // Update the realtime countdown displayed in the user dropdown
  startTokenCountdown();
}

// Start updating the token countdown every second
function startTokenCountdown() {
  stopTokenCountdown();
  const el = document.getElementById("tokenCountdown");
  if (!el) return;

  function update() {
    if (!tokenExpiresAt) {
      el.textContent = "--:--:--";
      return;
    }

    const remaining = tokenExpiresAt - Date.now();
    if (remaining <= 0) {
      el.textContent = "00:00:00";
      return;
    }

    el.textContent = formatRemainingTime(remaining);
  }

  update();
  tokenCountdownTimer = setInterval(update, 1000);
}

function stopTokenCountdown() {
  if (tokenCountdownTimer) {
    clearInterval(tokenCountdownTimer);
    tokenCountdownTimer = null;
  }
}

function formatRemainingTime(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60) - 10;
  const seconds = totalSeconds % 60;
  return `Auto relogin in: ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

// Silently refresh the token without user interaction
function silentTokenRefresh() {
  return new Promise((resolve) => {
    if (!tokenClient || currentUser?.isGuest) {
      resolve(false);
      return;
    }

    _silentRefreshResolve = resolve;

    // Timeout: if no response in 10s, consider failed
    const timeout = setTimeout(() => {
      if (_silentRefreshResolve) {
        _silentRefreshResolve = null;
        resolve(false);
      }
    }, 10000);

    try {
      // prompt: '' means silent refresh (no popup if user already authorized)
      tokenClient.requestAccessToken({ prompt: "" });
    } catch (e) {
      clearTimeout(timeout);
      _silentRefreshResolve = null;
      console.error("Silent refresh error:", e);
      resolve(false);
    }
  });
}

// Check if token is expired or about to expire
function isTokenExpired() {
  if (!tokenExpiresAt) return true;
  // Consider expired if less than 2 minutes remaining
  return Date.now() > tokenExpiresAt - 2 * 60 * 1000;
}

// Ensure we have a valid token, refresh if needed
// Returns true if token is valid, false if re-login is required
async function ensureValidToken() {
  if (currentUser?.isGuest) return true;
  if (!isTokenExpired()) return true;

  console.log("Token expired, attempting silent refresh...");
  const refreshed = await silentTokenRefresh();

  if (refreshed) {
    return true;
  }

  // Silent refresh failed - need interactive re-login
  console.warn("Silent refresh failed, requesting interactive login...");
  return await interactiveReLogin();
}

// Show re-login popup without leaving the app
function interactiveReLogin() {
  return new Promise((resolve) => {
    showToast("Session expired. Logging in again...", "warning", 5000);

    _silentRefreshResolve = resolve;

    // Use consent prompt since silent failed
    try {
      tokenClient.requestAccessToken({ prompt: "consent" });
    } catch (e) {
      _silentRefreshResolve = null;
      console.error("Interactive re-login error:", e);
      resolve(false);
    }
  });
}

function requestLogin() {
  showLoading(true);
  tokenClient.requestAccessToken({ prompt: "consent" });
}

// Guest login
function loginAsGuest() {
  currentUser = {
    email: null,
    name: "Guest",
    picture: null,
    isGuest: true,
  };
  localStorage.setItem("currentUser", JSON.stringify(currentUser));
  showView("app");
  initializeApp();
}

function logout() {
  const wasGuest = currentUser?.isGuest;

  // Revoke the token if Google user
  if (!wasGuest && accessToken) {
    google.accounts.oauth2.revoke(accessToken, () => {
      console.log("Token revoked");
    });
  }

  // Clear refresh timer
  if (tokenRefreshTimer) {
    clearTimeout(tokenRefreshTimer);
    tokenRefreshTimer = null;
  }
  // Stop countdown updates and clear UI
  stopTokenCountdown();
  const countdownEl = document.getElementById("tokenCountdown");
  if (countdownEl) countdownEl.textContent = "--:--:--";

  // Clear data
  gapi.client.setToken(null);
  currentUser = null;
  accessToken = null;
  tokenExpiresAt = null;
  localStorage.removeItem("currentUser");
  localStorage.removeItem("accessToken");
  localStorage.removeItem("tokenExpiresAt");
  if (typeof clearLocalCache === "function") {
    clearLocalCache();
  }

  // Reload page to ensure clean state and remove all event listeners
  window.location.reload();
}

function getCurrentUser() {
  const stored = localStorage.getItem("currentUser");
  return stored ? JSON.parse(stored) : null;
}

function getAccessToken() {
  return accessToken || localStorage.getItem("accessToken");
}

function isAuthenticationError(error) {
  if (!error) return false;

  const status = Number(error?.status || error?.result?.error?.code || 0);
  if (status === 401) return true;

  const message = String(
    error?.message || error?.result?.error?.message || error?.body || "",
  ).toLowerCase();

  return (
    message.includes("unauthenticated") ||
    message.includes("unauthorized") ||
    message.includes("invalid credentials") ||
    message.includes("login required") ||
    message.includes("401")
  );
}

function handleAuthExpiredError(error, contextMessage = "Session expired") {
  if (!isAuthenticationError(error) || currentUser?.isGuest) {
    return false;
  }

  if (authExpiryHandlingInProgress) {
    return true;
  }

  authExpiryHandlingInProgress = true;
  console.warn("Authentication expired:", error);

  showToast(`${contextMessage}. Please login again.`, "warning", 5000);

  setTimeout(() => {
    logout();
  }, 250);

  return true;
}

window.isAuthenticationError = isAuthenticationError;
window.handleAuthExpiredError = handleAuthExpiredError;

// Initialize on page load
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await initializeGoogleAPIs();

    // Setup login button
    const loginBtn = document.getElementById("googleLoginBtn");
    if (loginBtn) {
      loginBtn.addEventListener("click", requestLogin);
    }

    // Setup guest login button
    const guestBtn = document.getElementById("guestLoginBtn");
    if (guestBtn) {
      guestBtn.addEventListener("click", loginAsGuest);
    }

    // Check if user was previously logged in
    const storedToken = localStorage.getItem("accessToken");
    const storedUser = localStorage.getItem("currentUser");
    const storedExpiry = localStorage.getItem("tokenExpiresAt");

    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);

      // Guest user — restore locally
      if (parsedUser.isGuest) {
        currentUser = parsedUser;
        showView("app");
        initializeApp();
        return;
      }

      // Google user — verify token or silently refresh
      if (storedToken) {
        accessToken = storedToken;
        currentUser = parsedUser;
        tokenExpiresAt = storedExpiry ? parseInt(storedExpiry) : null;
        gapi.client.setToken({ access_token: accessToken });

        // Check if token is still valid
        if (!isTokenExpired()) {
          // Token may still be revoked server-side, validate before entering app
          try {
            await gapi.client.drive.about.get({ fields: "user" });
            showView("app");
            scheduleTokenRefresh();
            // Start countdown UI update based on stored expiry
            startTokenCountdown();
            initializeApp();
          } catch (validationError) {
            console.warn("Stored token invalid on startup:", validationError);
            handleAuthExpiredError(validationError, "Session expired");
          }
        } else {
          // Token expired, try silent refresh
          console.log("Stored token expired, attempting silent refresh...");
          const refreshed = await silentTokenRefresh();
          if (refreshed) {
            showView("app");
            initializeApp();
          } else {
            // Silent refresh failed, clear and show login
            console.log("Silent refresh failed, please login again");
            localStorage.removeItem("accessToken");
            localStorage.removeItem("currentUser");
            localStorage.removeItem("tokenExpiresAt");
            accessToken = null;
            currentUser = null;
            tokenExpiresAt = null;
          }
        }
      }
    }
  } catch (error) {
    console.error("Error initializing:", error);
  }
});
