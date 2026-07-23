/**
 * TenantRent — PIN Authentication Module
 *
 * Logic:
 * 1. On page load:
 *    - If URL hash is #tenant/... → skip PIN → show read-only Tenant Portal directly.
 *    - Otherwise → show PIN lock screen.
 *    - If admin session is still valid (within 8 hours) → skip PIN automatically.
 *
 * 2. Default PIN: 1234  (stored as a simple hash in localStorage — change via 🔐 button)
 * 3. Session: once correct PIN is entered, admin is unlocked for 8 hours on that device.
 * 4. Tenant share link: always bypasses PIN → read-only view, no admin controls.
 */

var STORAGE_KEY_PIN     = "tenantrent_v2_pin_hash";
var STORAGE_KEY_SESSION = "tenantrent_v2_session_ts";
var SESSION_DURATION_MS = 8 * 60 * 60 * 1000;    // 8 hours
var DEFAULT_PIN         = "1234";

// ─── Simple hash (not cryptographic, just obfuscation for localStorage) ──────
function _hashPin(psPin) {
  var iHash = 0;
  for (var i = 0; i < psPin.length; i++) {
    iHash = ((iHash << 5) - iHash) + psPin.charCodeAt(i);
    iHash |= 0;
  }
  return "h_" + Math.abs(iHash).toString(16);
}

function _getStoredHash() {
  return localStorage.getItem(STORAGE_KEY_PIN) || _hashPin(DEFAULT_PIN);
}

function _isPinCorrect(psPin) {
  return _hashPin(psPin) === _getStoredHash();
}

function _isSessionValid() {
  var sTs = localStorage.getItem(STORAGE_KEY_SESSION);
  if (!sTs) return false;
  return (Date.now() - parseInt(sTs, 10)) < SESSION_DURATION_MS;
}

function _startSession() {
  localStorage.setItem(STORAGE_KEY_SESSION, Date.now().toString());
}

function _clearSession() {
  localStorage.removeItem(STORAGE_KEY_SESSION);
}

// ─── Check if this is a tenant share link ────────────────────────────────────
function _isTenantShareLink() {
  return window.location.hash.startsWith("#tenant/");
}

// ─── DOM references ───────────────────────────────────────────────────────────
var lockScreen  = document.getElementById("pin-lock-screen");
var pinCard     = document.getElementById("pin-card");
var pinDots     = [
  document.getElementById("dot-0"),
  document.getElementById("dot-1"),
  document.getElementById("dot-2"),
  document.getElementById("dot-3")
];
var pinError    = document.getElementById("pin-error");
var pinLabel    = document.getElementById("pin-label");

var sCurrentPin = "";

// ─── Update dot indicators ────────────────────────────────────────────────────
function _updateDots() {
  for (var i = 0; i < 4; i++) {
    if (i < sCurrentPin.length) {
      pinDots[i].classList.add("filled");
    } else {
      pinDots[i].classList.remove("filled");
    }
  }
}

// ─── Handle keypad press ──────────────────────────────────────────────────────
function _onKeyPress(pDigit) {
  if (sCurrentPin.length >= 4) return;
  sCurrentPin += pDigit;
  pinError.innerText = "";
  _updateDots();

  if (sCurrentPin.length === 4) {
    _verifyPin();
  }
}

function _onDelete() {
  if (sCurrentPin.length > 0) {
    sCurrentPin = sCurrentPin.slice(0, -1);
    _updateDots();
    pinError.innerText = "";
  }
}

function _onClear() {
  sCurrentPin = "";
  _updateDots();
  pinError.innerText = "";
}

// ─── Verify PIN ───────────────────────────────────────────────────────────────
function _verifyPin() {
  if (_isPinCorrect(sCurrentPin)) {
    _startSession();
    _unlockAdmin();
  } else {
    // Wrong PIN feedback
    sCurrentPin = "";
    _updateDots();
    pinError.innerText = "Incorrect PIN. Please try again.";
    pinCard.classList.add("pin-shake");
    setTimeout(function () { pinCard.classList.remove("pin-shake"); }, 400);
  }
}

// ─── Unlock: hide lock screen, show app ───────────────────────────────────────
function _unlockAdmin() {
  lockScreen.classList.add("hidden");
}

// ─── Lock: clear session, show lock screen ────────────────────────────────────
function lockApp() {
  _clearSession();
  sCurrentPin = "";
  _updateDots();
  pinError.innerText = "";
  lockScreen.classList.remove("hidden");
}

// ─── Keyboard support ─────────────────────────────────────────────────────────
document.addEventListener("keydown", function (e) {
  if (lockScreen.classList.contains("hidden")) return;
  if (e.key >= "0" && e.key <= "9") { _onKeyPress(e.key); }
  else if (e.key === "Backspace")    { _onDelete(); }
  else if (e.key === "Escape")       { _onClear(); }
});

// ─── Wire up keypad buttons ───────────────────────────────────────────────────
document.querySelectorAll(".pin-key").forEach(function (btn) {
  btn.addEventListener("click", function () {
    var sDigit  = btn.getAttribute("data-digit");
    var sAction = btn.getAttribute("data-action");
    if (sDigit  !== null) { _onKeyPress(sDigit); }
    if (sAction === "del")   { _onDelete(); }
    if (sAction === "clear") { _onClear(); }
  });
});

// ─── Change PIN modal wiring ──────────────────────────────────────────────────
var btnChangePinNav   = document.getElementById("btn-change-pin");
var modalChangePin    = document.getElementById("modal-change-pin");
var btnClosePinModal  = document.getElementById("btn-close-pin-modal");
var btnCancelPinModal = document.getElementById("btn-cancel-pin-modal");
var btnSaveNewPin     = document.getElementById("btn-save-new-pin");

btnChangePinNav.addEventListener("click", function () {
  document.getElementById("input-current-pin").value = "";
  document.getElementById("input-new-pin").value     = "";
  document.getElementById("input-confirm-pin").value = "";
  modalChangePin.classList.remove("hidden");
});

function _closePinModal() {
  modalChangePin.classList.add("hidden");
}

btnClosePinModal .addEventListener("click", _closePinModal);
btnCancelPinModal.addEventListener("click", _closePinModal);

btnSaveNewPin.addEventListener("click", function () {
  var sCurrent = document.getElementById("input-current-pin").value.trim();
  var sNew     = document.getElementById("input-new-pin").value.trim();
  var sConfirm = document.getElementById("input-confirm-pin").value.trim();

  if (!_isPinCorrect(sCurrent)) {
    alert("Current PIN is incorrect.");
    return;
  }
  if (!/^\d{4}$/.test(sNew)) {
    alert("New PIN must be exactly 4 digits.");
    return;
  }
  if (sNew !== sConfirm) {
    alert("New PIN and Confirm PIN do not match.");
    return;
  }

  localStorage.setItem(STORAGE_KEY_PIN, _hashPin(sNew));
  _closePinModal();
  alert("✅ PIN changed successfully!");
});

// ═══════════════════════════════════════════════════════════════════════════════
// INITIALISE AUTH on page load
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  // Tenant share links → skip PIN, go straight to read-only portal
  if (_isTenantShareLink()) {
    lockScreen.classList.add("hidden");
    return;
  }

  // Valid admin session → auto-unlock
  if (_isSessionValid()) {
    lockScreen.classList.add("hidden");
    return;
  }

  // Show PIN screen (default: PIN lock is visible on load via no .hidden class)
})();
