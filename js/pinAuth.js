/**
 * TenantRent — Dual-Role PIN Authentication & Session Manager
 *
 * Roles:
 * 1. ADMIN (Landlord)
 *    - Full access to Admin View, tenant management, billing entries, stats.
 *    - Default PIN: 1234 (changeable via Change PIN modal).
 *
 * 2. TENANT
 *    - Isolated access strictly to logged-in tenant's own passbook/portal.
 *    - Default PIN: 1234 for new tenants (changeable by tenant or admin).
 *    - Cannot switch tenants, see admin view, or view other tenants' records.
 */

var STORAGE_KEY_ADMIN_PIN   = "tenantrent_v2_admin_pin";
var STORAGE_KEY_AUTH_ROLE   = "tenantrent_v2_auth_role";      // "admin" | "tenant"
var STORAGE_KEY_AUTH_TENANT = "tenantrent_v2_auth_tenant_id"; // tenant_id if role === "tenant"
var STORAGE_KEY_SESSION_TS  = "tenantrent_v2_session_ts";
var SESSION_DURATION_MS     = 8 * 60 * 60 * 1000;              // 8 hours
var DEFAULT_PIN             = "1234";

function hashPin(psPin) {
  var sClean = (psPin || DEFAULT_PIN).toString().replace(/^h_/, "").trim();
  return (sClean === "12401f" || !sClean) ? DEFAULT_PIN : sClean;
}

var pinAuth = (function () {

  // ── State ──────────────────────────────────────────────────────────────────
  var _sSelectedRole     = "admin"; // "admin" | "tenant"
  var _sCurrentInputPin  = "";
  var _sLoggedInRole     = null;    // "admin" | "tenant" | null
  var _sLoggedInTenantId = null;

  // ── Internal Helpers ───────────────────────────────────────────────────────
  function _getAdminPin() {
    var sRaw = localStorage.getItem(STORAGE_KEY_ADMIN_PIN) || DEFAULT_PIN;
    var sClean = sRaw.toString().replace(/^h_/, "").trim();
    return (sClean === "12401f" || !sClean) ? DEFAULT_PIN : sClean;
  }

  function _isAdminPinCorrect(psPin) {
    var sInput = (psPin || "").toString().trim();
    return sInput === _getAdminPin();
  }

  function _isSessionValid() {
    var sTs = localStorage.getItem(STORAGE_KEY_SESSION_TS);
    if (!sTs) return false;
    return (Date.now() - parseInt(sTs, 10)) < SESSION_DURATION_MS;
  }

  function _startSession(psRole, psTenantId) {
    localStorage.setItem(STORAGE_KEY_SESSION_TS, Date.now().toString());
    localStorage.setItem(STORAGE_KEY_AUTH_ROLE, psRole);
    if (psTenantId) {
      localStorage.setItem(STORAGE_KEY_AUTH_TENANT, psTenantId);
    } else {
      localStorage.removeItem(STORAGE_KEY_AUTH_TENANT);
    }
    _sLoggedInRole     = psRole;
    _sLoggedInTenantId = psTenantId || null;
  }

  function _clearSession() {
    localStorage.removeItem(STORAGE_KEY_SESSION_TS);
    localStorage.removeItem(STORAGE_KEY_AUTH_ROLE);
    localStorage.removeItem(STORAGE_KEY_AUTH_TENANT);
    _sLoggedInRole     = null;
    _sLoggedInTenantId = null;
  }

  // ── UI Updates ─────────────────────────────────────────────────────────────
  function _updateDots() {
    var dots = [
      document.getElementById("dot-0"),
      document.getElementById("dot-1"),
      document.getElementById("dot-2"),
      document.getElementById("dot-3")
    ];
    for (var i = 0; i < 4; i++) {
      if (dots[i]) {
        dots[i].classList.toggle("filled", i < _sCurrentInputPin.length);
      }
    }
  }

  function _setRoleUI(psRole) {
    _sSelectedRole    = psRole;
    _sCurrentInputPin = "";
    _updateDots();

    var errEl = document.getElementById("pin-error");
    if (errEl) errEl.innerText = "";

    var btnAdmin  = document.getElementById("login-role-admin");
    var btnTenant = document.getElementById("login-role-tenant");
    var tenantSelBox = document.getElementById("login-tenant-select-group");
    var pinLabel  = document.getElementById("pin-label");

    if (btnAdmin)  btnAdmin.classList.toggle("active", psRole === "admin");
    if (btnTenant) btnTenant.classList.toggle("active", psRole === "tenant");

    if (tenantSelBox) {
      tenantSelBox.classList.toggle("hidden", psRole !== "tenant");
    }

    if (pinLabel) {
      pinLabel.innerText = psRole === "admin"
        ? "Enter 4-digit Admin PIN"
        : "Enter 4-digit Tenant PIN";
    }
  }

  // Populate tenant selector dropdown on login screen
  function populateTenantDropdown(pArrTenants) {
    var sel = document.getElementById("login-tenant-select");
    if (!sel) return;
    sel.innerHTML = "";

    if (!pArrTenants || pArrTenants.length === 0) {
      var opt = document.createElement("option");
      opt.value = "";
      opt.innerText = "No tenants found (Default PIN: 1234)";
      sel.appendChild(opt);
      return;
    }

    pArrTenants.forEach(function (t) {
      var opt = document.createElement("option");
      opt.value = t.tenant_id;
      opt.innerText = t.name + " (" + (t.room || "Room") + ")";
      sel.appendChild(opt);
    });
  }

  // ── Keypad Actions ─────────────────────────────────────────────────────────
  function _onKeyPress(pDigit) {
    if (_sCurrentInputPin.length >= 4) return;
    _sCurrentInputPin += pDigit;
    var errEl = document.getElementById("pin-error");
    if (errEl) errEl.innerText = "";
    _updateDots();

    if (_sCurrentInputPin.length === 4) {
      _verifyLogin();
    }
  }

  function _onDelete() {
    if (_sCurrentInputPin.length > 0) {
      _sCurrentInputPin = _sCurrentInputPin.slice(0, -1);
      _updateDots();
      var errEl = document.getElementById("pin-error");
      if (errEl) errEl.innerText = "";
    }
  }

  function _onClear() {
    _sCurrentInputPin = "";
    _updateDots();
    var errEl = document.getElementById("pin-error");
    if (errEl) errEl.innerText = "";
  }

  // ── Verification ───────────────────────────────────────────────────────────
  function _verifyLogin() {
    var pinCard = document.getElementById("pin-card");
    var errEl   = document.getElementById("pin-error");

    if (_sSelectedRole === "admin") {
      if (_isAdminPinCorrect(_sCurrentInputPin)) {
        var sAdminPin = _getAdminPin();
        _startSession("admin", null);
        _unlockUI();

        // Prompt admin to change default PIN ONLY if it's still 1234
        if (sAdminPin === DEFAULT_PIN) {
          setTimeout(function () {
            alert("⚠️ Welcome Admin! Your default PIN is 1234. Please click the 🔒 icon in the header to change your PIN.");
          }, 300);
        }
      } else {
        _onWrongPin();
      }
    } else {
      // Tenant login
      var sel = document.getElementById("login-tenant-select");
      var sTenantId = sel ? sel.value : null;

      if (!sTenantId) {
        if (errEl) errEl.innerText = "Please select your name/room first.";
        _sCurrentInputPin = "";
        _updateDots();
        return;
      }

      var objTenant = (typeof app !== "undefined" && app.arrTenants)
        ? app.arrTenants.find(function (t) { return t.tenant_id === sTenantId; })
        : null;

      var sExpectedPin = (objTenant && (objTenant.pin || objTenant.pin_hash))
        ? hashPin(objTenant.pin || objTenant.pin_hash)
        : DEFAULT_PIN;

      if (_sCurrentInputPin.trim() === sExpectedPin) {
        _startSession("tenant", sTenantId);
        _unlockUI();

        // Prompt tenant to change default PIN ONLY if it's still 1234
        if (sExpectedPin === DEFAULT_PIN) {
          setTimeout(function () {
            alert("⚠️ Welcome! Your default PIN is 1234. Please click the 🔒 icon in the header to change your PIN.");
          }, 300);
        }
      } else {
        _onWrongPin();
      }
    }
  }

  function _onWrongPin() {
    var pinCard = document.getElementById("pin-card");
    var errEl   = document.getElementById("pin-error");
    _sCurrentInputPin = "";
    _updateDots();
    if (errEl) errEl.innerText = "Incorrect PIN. Please enter your 4-digit PIN.";
    if (pinCard) {
      pinCard.classList.add("pin-shake");
      setTimeout(function () { pinCard.classList.remove("pin-shake"); }, 400);
    }
  }

  function _unlockUI() {
    var lockScreen = document.getElementById("pin-lock-screen");
    if (lockScreen) lockScreen.classList.add("hidden");

    if (typeof app !== "undefined" && typeof app.onAuthSuccess === "function") {
      app.onAuthSuccess(_sLoggedInRole, _sLoggedInTenantId);
    }
  }

  function logout() {
    _clearSession();
    _sCurrentInputPin = "";
    _updateDots();
    var lockScreen = document.getElementById("pin-lock-screen");
    if (lockScreen) lockScreen.classList.remove("hidden");

    if (typeof app !== "undefined" && app.arrTenants) {
      populateTenantDropdown(app.arrTenants);
    }

    if (typeof app !== "undefined" && typeof app.onLogout === "function") {
      app.onLogout();
    }
  }

  // ── Init & Event Wiring ────────────────────────────────────────────────────
  function init() {
    var btnAdmin  = document.getElementById("login-role-admin");
    var btnTenant = document.getElementById("login-role-tenant");

    if (btnAdmin)  btnAdmin.addEventListener("click",  function () { _setRoleUI("admin"); });
    if (btnTenant) btnTenant.addEventListener("click", function () { _setRoleUI("tenant"); });

    // Keypad listeners
    document.querySelectorAll(".pin-key").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var sDigit  = btn.getAttribute("data-digit");
        var sAction = btn.getAttribute("data-action");
        if (sDigit  !== null) { _onKeyPress(sDigit); }
        if (sAction === "del")   { _onDelete(); }
        if (sAction === "clear") { _onClear(); }
      });
    });

    // Keyboard support
    document.addEventListener("keydown", function (e) {
      var lockScreen = document.getElementById("pin-lock-screen");
      if (!lockScreen || lockScreen.classList.contains("hidden")) return;
      if (e.key >= "0" && e.key <= "9") { _onKeyPress(e.key); }
      else if (e.key === "Backspace")    { _onDelete(); }
      else if (e.key === "Escape")       { _onClear(); }
    });

    // Wire Change PIN modal
    _setupChangePinModal();

    // Check saved session
    if (_isSessionValid()) {
      _sLoggedInRole     = localStorage.getItem(STORAGE_KEY_AUTH_ROLE) || "admin";
      _sLoggedInTenantId = localStorage.getItem(STORAGE_KEY_AUTH_TENANT) || null;

      // Ensure lock screen is hidden
      var lockScreen = document.getElementById("pin-lock-screen");
      if (lockScreen) lockScreen.classList.add("hidden");
    } else {
      _clearSession();
      _setRoleUI("admin");
    }
  }

  // ── Change PIN Modal Wiring ────────────────────────────────────────────────
  function _setupChangePinModal() {
    var btnNavPin       = document.getElementById("btn-change-pin");
    var modal           = document.getElementById("modal-change-pin");
    var btnClose        = document.getElementById("btn-close-pin-modal");
    var btnCancel       = document.getElementById("btn-cancel-pin-modal");
    var btnSave         = document.getElementById("btn-save-new-pin");

    if (btnNavPin) {
      btnNavPin.addEventListener("click", function () {
        document.getElementById("input-current-pin").value = "";
        document.getElementById("input-new-pin").value     = "";
        document.getElementById("input-confirm-pin").value = "";
        modal.classList.remove("hidden");
      });
    }

    function _closeModal() { if (modal) modal.classList.add("hidden"); }
    if (btnClose)  btnClose.addEventListener("click",  _closeModal);
    if (btnCancel) btnCancel.addEventListener("click", _closeModal);

    if (btnSave) {
      btnSave.addEventListener("click", async function () {
        var sCurrent = document.getElementById("input-current-pin").value.trim();
        var sNew     = document.getElementById("input-new-pin").value.trim();
        var sConfirm = document.getElementById("input-confirm-pin").value.trim();

        if (!/^\d{4}$/.test(sNew)) {
          alert("New PIN must be exactly 4 digits.");
          return;
        }
        if (sNew !== sConfirm) {
          alert("New PIN and Confirm PIN do not match.");
          return;
        }

        if (_sLoggedInRole === "admin") {
          if (!_isAdminPinCorrect(sCurrent)) {
            alert("Current Admin PIN is incorrect.");
            return;
          }
          localStorage.setItem(STORAGE_KEY_ADMIN_PIN, sNew);
          if (typeof googleSheetsService !== "undefined" && googleSheetsService.bIsConnected) {
            await googleSheetsService.updateAdminConfig({ admin_pin: sNew, admin_pin_hash: sNew });
          }
          _closeModal();
          alert("✅ Admin PIN updated successfully & synced to Google Sheet!");
        } else if (_sLoggedInRole === "tenant" && _sLoggedInTenantId) {

          var objTenant = (typeof app !== "undefined" && app.arrTenants)
            ? app.arrTenants.find(function (t) { return t.tenant_id === _sLoggedInTenantId; })
            : null;

          var sExpectedPin = objTenant && (objTenant.pin || objTenant.pin_hash) ? hashPin(objTenant.pin || objTenant.pin_hash) : DEFAULT_PIN;
          if (sCurrent !== sExpectedPin) {
            alert("Current PIN is incorrect.");
            return;
          }

          if (objTenant) {
            objTenant.pin = sNew;
            objTenant.pin_hash = sNew;
            if (typeof app !== "undefined" && typeof app._saveTenant === "function") {
              await app._saveTenant(objTenant);
            }
          }
          _closeModal();
          alert("✅ Your PIN updated successfully!");
        }
      });
    }
  }

  function setAdminPin(psPin) {
    if (psPin) {
      var sClean = psPin.toString().replace(/^h_/, "").trim();
      if (sClean === "12401f" || !sClean) sClean = DEFAULT_PIN;
      localStorage.setItem(STORAGE_KEY_ADMIN_PIN, sClean);
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────
  return {
    init:                   init,
    logout:                 logout,
    populateTenantDropdown: populateTenantDropdown,
    setAdminPin:            setAdminPin,
    setAdminPinHash:        setAdminPin,
    getLoggedInRole:        function () { return _sLoggedInRole; },
    getLoggedInTenantId:    function () { return _sLoggedInTenantId; },
    isLoggedIn:             function () { return _sLoggedInRole !== null; }
  };

})();

window.addEventListener("DOMContentLoaded", function () { pinAuth.init(); });
