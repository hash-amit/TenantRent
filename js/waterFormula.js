/**
 * TenantRent — Water Unit Formula Manager
 *
 * Supported formulas:
 *   "default"  → units = current − previous
 *   "divided"  → units = (current − previous) ÷ divisor
 *
 * Settings are saved to localStorage and persist across all sessions.
 * The formula is applied automatically every time the billing modal recalculates.
 */

var STORAGE_KEY_WATER_FORMULA = "tenantrent_v2_water_formula";

var waterFormula = (function () {

  // ─── Internal state ─────────────────────────────────────────────────────────
  var _objConfig = { sType: "default", fDivisor: 2 };

  // ─── Load saved config on boot ───────────────────────────────────────────────
  (function _load() {
    try {
      var sRaw = localStorage.getItem(STORAGE_KEY_WATER_FORMULA);
      if (sRaw) {
        var parsed = JSON.parse(sRaw);
        if (parsed && parsed.sType) _objConfig = parsed;
      }
    } catch (e) {
      _objConfig = { sType: "default", fDivisor: 2 };
    }
    _updateBadge();
  })();

  // ─── Public: compute water units from readings ───────────────────────────────
  function compute(pfCurrent, pfPrevious) {
    var fRaw = pfCurrent - pfPrevious;
    if (fRaw < 0) fRaw = 0;

    if (_objConfig.sType === "divided") {
      var iDiv = Math.max(1, parseInt(_objConfig.fDivisor) || 2);
      return fRaw / iDiv;
    }
    return fRaw;
  }

  // ─── Public: get active formula label for display ────────────────────────────
  function getLabel() {
    if (_objConfig.sType === "divided") {
      return "(Curr − Prev) ÷ " + (_objConfig.fDivisor || 2);
    }
    return "Curr − Prev";
  }

  // ─── Badge update ────────────────────────────────────────────────────────────
  function _updateBadge() {
    var badge = document.getElementById("water-formula-badge");
    if (!badge) return;
    if (_objConfig.sType === "divided") {
      badge.innerText = "⚙ ÷" + (_objConfig.fDivisor || 2);
      badge.style.background = "#fef3c7";
      badge.style.color       = "#92400e";
      badge.style.borderColor = "#f59e0b";
    } else {
      badge.innerText = "⚙ Formula";
      badge.style.background  = "var(--primary-light)";
      badge.style.color       = "var(--primary)";
      badge.style.borderColor = "var(--primary)";
    }
  }

  // ─── Public: open formula settings panel ─────────────────────────────────────
  function openSettings() {
    var panel = document.getElementById("water-formula-panel");
    if (!panel) return;

    // Set radio to saved value
    var radDefault  = document.getElementById("radio-formula-default");
    var radDivided  = document.getElementById("radio-formula-divided");
    var divisorRow  = document.getElementById("formula-divisor-row");
    var divisorInp  = document.getElementById("input-formula-divisor");

    if (_objConfig.sType === "divided") {
      radDivided.checked = true;
      divisorRow.classList.remove("hidden");
    } else {
      radDefault.checked = true;
      divisorRow.classList.add("hidden");
    }
    divisorInp.value = _objConfig.fDivisor || 2;

    // Wire radio change handlers (re-wire each open to avoid duplicate listeners)
    var _handleRadioChange = function () {
      var bDivided = radDivided.checked;
      if (bDivided) {
        divisorRow.classList.remove("hidden");
      } else {
        divisorRow.classList.add("hidden");
      }
    };

    radDefault.onchange = _handleRadioChange;
    radDivided.onchange = _handleRadioChange;

    panel.classList.remove("hidden");
  }

  // ─── Public: close settings panel ────────────────────────────────────────────
  function closeSettings() {
    var panel = document.getElementById("water-formula-panel");
    if (panel) panel.classList.add("hidden");
  }

  // ─── Public: save settings and apply immediately ──────────────────────────────
  function saveSettings() {
    var radDivided = document.getElementById("radio-formula-divided");
    var divisorInp = document.getElementById("input-formula-divisor");

    var sNewType  = radDivided && radDivided.checked ? "divided" : "default";
    var fNewDiv   = parseFloat(divisorInp ? divisorInp.value : "2") || 2;

    if (sNewType === "divided" && fNewDiv < 1) {
      alert("Number of tenants must be at least 1.");
      return;
    }

    _objConfig = { sType: sNewType, fDivisor: fNewDiv };
    localStorage.setItem(STORAGE_KEY_WATER_FORMULA, JSON.stringify(_objConfig));
    if (typeof googleSheetsService !== "undefined" && googleSheetsService.bIsConnected) {
      googleSheetsService.updateAdminConfig({
        water_formula_type: sNewType,
        water_formula_divisor: fNewDiv
      });
    }
    _updateBadge();
    closeSettings();


    // Trigger recalc in the billing form if it's open
    if (typeof app !== "undefined" && typeof app._recalcBill === "function") {
      app._recalcBill();
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────────────
  return {
    compute:       compute,
    getLabel:      getLabel,
    openSettings:  openSettings,
    closeSettings: closeSettings,
    saveSettings:  saveSettings,
    getConfig:     function () { return _objConfig; }
  };

})();
