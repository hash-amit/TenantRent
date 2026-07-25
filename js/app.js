/**
 * TenantRent — Main Application Logic
 * Supports Dual Role Mode:
 *   - ADMIN: Full financial dashboard, stats, multi-tenant ledger, CRUD operations.
 *   - TENANT: Strict isolated 1-tenant passbook portal.
 */

var TenantRentApp = /** @class */ (function () {
  function TenantRentApp() {
    this.arrTenants        = [];
    this.sActiveTenantId   = null;
    this.bIsTenantView     = false;
    this.sEditingRecordId  = null;
    this.sEditingTenantId  = null;
    this.activeReceiptRecord = null;
    this.activeReceiptTenant = null;

    this._init();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALISATION
  // ═══════════════════════════════════════════════════════════════════════════
  TenantRentApp.prototype._init = async function () {
    var self = this;
    this._initTheme();

    // 1. Load from LocalStorage cache first
    this.arrTenants = storageService.getTenants();

    // Populate login screen dropdown with initial cached tenants
    if (typeof pinAuth !== "undefined") {
      pinAuth.populateTenantDropdown(this.arrTenants);
    }

    var syncDot  = document.getElementById("login-sync-dot");
    var syncText = document.getElementById("login-sync-text");

    // 2. If Google Sheets is connected, fetch live data
    if (googleSheetsService.bIsConnected) {
      if (syncDot)  syncDot.style.background = "#f59e0b";
      if (syncText) syncText.innerText = "Syncing live data from Google Sheet...";

      var jsonLive = await googleSheetsService.fetchAll(3);
      if (jsonLive !== null) {
        if (Array.isArray(jsonLive.data)) {
          this.arrTenants = jsonLive.data;
          storageService.saveTenants(this.arrTenants);
        }
        if (jsonLive.admin_config) {
          var sPinVal = jsonLive.admin_config.admin_pin || jsonLive.admin_config.admin_pin_hash;
          if (sPinVal) {
            sPinVal = String(sPinVal).replace(/^h_/, "").trim();
            if (sPinVal === "12401f" || !sPinVal) sPinVal = "1234";
            if (typeof pinAuth !== "undefined") {
              pinAuth.setAdminPin(sPinVal);
            }
          }
          if (jsonLive.admin_config.water_formula_type && typeof STORAGE_KEY_WATER_FORMULA !== "undefined") {
            var cfg = {
              sType: jsonLive.admin_config.water_formula_type,
              fDivisor: parseFloat(jsonLive.admin_config.water_formula_divisor) || 2
            };
            localStorage.setItem(STORAGE_KEY_WATER_FORMULA, JSON.stringify(cfg));
          }
        }
        if (syncDot)  syncDot.style.background = "#10b981";
        if (syncText) syncText.innerText = "✅ Synced with Google Sheet";
      } else {
        if (syncDot)  syncDot.style.background = "#3b82f6";
        if (syncText) syncText.innerText = "ℹ️ Offline / Cached Data Active";
      }
    } else {
      if (syncDot)  syncDot.style.background = "#9ca3af";
      if (syncText) syncText.innerText = "Local Mode";
    }

    // Refresh login screen dropdown with live tenants
    if (typeof pinAuth !== "undefined") {
      pinAuth.populateTenantDropdown(this.arrTenants);
    }

    // 3. Set active tenant
    if (this.arrTenants.length > 0) {
      this.sActiveTenantId = this.arrTenants[0].tenant_id;
    }

    // 4. Wire up UI events
    this._setupEvents();

    // 5. If already authenticated via session, apply role UI
    if (typeof pinAuth !== "undefined" && pinAuth.isLoggedIn()) {
      this.onAuthSuccess(pinAuth.getLoggedInRole(), pinAuth.getLoggedInTenantId());
    } else {
      this._render();
    }

    if (window.feather) feather.replace();
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTH ROLE HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════
  TenantRentApp.prototype.onAuthSuccess = function (psRole, psTenantId) {
    var viewPill    = document.getElementById("view-toggle-pill");
    var btnGS       = document.getElementById("btn-gsheets-sync");
    var portalGroup = document.getElementById("portal-controls-group");
    var roleBadge   = document.getElementById("user-role-badge");

    if (psRole === "admin") {
      this.bIsTenantView = false;
      if (viewPill)    { viewPill.classList.remove("hidden");    viewPill.style.display = ""; }
      if (btnGS)       { btnGS.classList.remove("hidden");       btnGS.style.display = ""; }
      if (portalGroup) { portalGroup.classList.remove("hidden"); portalGroup.style.display = ""; }
      if (roleBadge)   roleBadge.innerText = "Admin Dashboard";

      if (this.arrTenants.length > 0 && !this.sActiveTenantId) {
        this.sActiveTenantId = this.arrTenants[0].tenant_id;
      }
      this._setMode(false);
    } else if (psRole === "tenant") {
      this.bIsTenantView = true;
      if (psTenantId) this.sActiveTenantId = psTenantId;

      if (viewPill)    { viewPill.classList.add("hidden");    viewPill.style.display = "none"; }
      if (btnGS)       { btnGS.classList.add("hidden");       btnGS.style.display = "none"; }
      if (portalGroup) { portalGroup.classList.add("hidden"); portalGroup.style.display = "none"; }

      var objT = this.arrTenants.find(function (t) { return t.tenant_id === psTenantId; });
      if (roleBadge) {
        roleBadge.innerText = objT ? "Tenant: " + objT.name : "Tenant Portal";
      }

      this._setMode(true);
    }
  };

  TenantRentApp.prototype.onLogout = function () {
    this.sActiveTenantId = null;
    this._render();
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT WIRING
  // ═══════════════════════════════════════════════════════════════════════════
  TenantRentApp.prototype._setupEvents = function () {
    var self = this;

    function _on(psId, psEvent, fnHandler) {
      var el = document.getElementById(psId);
      if (el) el.addEventListener(psEvent, fnHandler);
    }

    _on("btn-mode-admin", "click", function () { self._setMode(false); });
    _on("btn-mode-tenant", "click", function () { self._setMode(true); });
    _on("btn-theme-toggle", "click", function () { self._toggleTheme(); });
    _on("btn-logout", "click", function () {
      if (typeof pinAuth !== "undefined") pinAuth.logout();
    });

    _on("btn-gsheets-sync", "click", function () { self._openGSModal(); });
    _on("btn-close-gsheets-modal", "click", function () { self._closeGSModal(); });
    _on("btn-disconnect-gsheets", "click", function () {
      googleSheetsService.setWebAppUrl("");
      self._closeGSModal();
      self._render();
      alert("Google Sheets Sync disconnected.");
    });
    _on("btn-copy-mobile-sync-link", "click", function () {
      var sLink = googleSheetsService.getMobileSyncLink();
      if (!sLink) return;
      navigator.clipboard.writeText(sLink)
        .then(function () { alert("📱 Mobile Sync Link copied!\n\nSend or open this link on your mobile phone once to automatically connect Google Sheets without entering the URL again:\n\n" + sLink); })
        .catch(function () { alert("Mobile Link: " + sLink); });
    });
    _on("btn-save-gsheets", "click", async function () {
      var elInp = document.getElementById("input-gsheets-url");
      var sUrl = elInp ? elInp.value.trim() : "";
      googleSheetsService.setWebAppUrl(sUrl);
      self._closeGSModal();
      self._render();
      if (googleSheetsService.bIsConnected) {
        var jsonLive = await googleSheetsService.fetchAll();
        if (jsonLive !== null) {
          if (Array.isArray(jsonLive.data)) self.arrTenants = jsonLive.data;
          storageService.saveTenants(self.arrTenants);
          if (typeof pinAuth !== "undefined") pinAuth.populateTenantDropdown(self.arrTenants);
          if (self.arrTenants.length > 0) self.sActiveTenantId = self.arrTenants[0].tenant_id;
          self._render();
          alert("✅ Connected! Live data loaded from Google Sheets.");
        } else {
          alert("✅ Connected! Sheet is empty — add your first tenant below.");
        }
      }
    });

    _on("btn-add-tenant", "click", function () { self._openTenantModal(); });
    _on("btn-close-tenant-modal", "click", function () { self._closeTenantModal(); });
    _on("btn-cancel-tenant", "click", function () { self._closeTenantModal(); });
    _on("form-tenant", "submit", function (e) { self._handleSaveTenant(e); });

    _on("btn-new-billing", "click", function () { self._openBillingModal(); });
    _on("btn-close-billing-modal", "click", function () { self._closeBillingModal(); });
    _on("btn-cancel-billing", "click", function () { self._closeBillingModal(); });
    _on("form-billing", "submit", function (e) { self._handleSaveBilling(e); });

    document.querySelectorAll(".meter-calc").forEach(function (inp) {
      inp.addEventListener("input", function () { self._recalcBill(); });
    });

    _on("input-search-billing", "input", function (e) {
      self._renderBillingTable(e.target.value);
    });

    _on("select-portal-tenant", "change", function (e) {
      if (typeof pinAuth !== "undefined" && pinAuth.getLoggedInRole() === "tenant") return;
      self.sActiveTenantId = e.target.value;
      self._render();
    });

    _on("btn-send-bill-whatsapp", "click", function () { self._sendLatestBillWhatsApp(); });

    _on("btn-close-receipt-modal", "click", function () {
      var modal = document.getElementById("modal-receipt");
      if (modal) modal.classList.add("hidden");
    });
    _on("btn-print-receipt", "click", function () { window.print(); });
    _on("btn-whatsapp-share", "click", function () { self._sendWhatsApp(); });
  };


  // ═══════════════════════════════════════════════════════════════════════════
  // DATA PERSISTENCE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════
  TenantRentApp.prototype._saveAll = function () {
    storageService.saveTenants(this.arrTenants);
    if (typeof pinAuth !== "undefined") pinAuth.populateTenantDropdown(this.arrTenants);
  };

  TenantRentApp.prototype._saveTenant = async function (pTenant) {
    storageService.saveTenants(this.arrTenants);
    if (typeof pinAuth !== "undefined") pinAuth.populateTenantDropdown(this.arrTenants);
    if (googleSheetsService.bIsConnected) {
      await googleSheetsService.upsertTenant(pTenant);
    }
  };

  TenantRentApp.prototype._deleteTenantRemote = async function (psTenantId) {
    storageService.saveTenants(this.arrTenants);
    if (typeof pinAuth !== "undefined") pinAuth.populateTenantDropdown(this.arrTenants);
    if (googleSheetsService.bIsConnected) {
      await googleSheetsService.deleteTenant(psTenantId);
    }
  };

  TenantRentApp.prototype._saveBilling = async function (pRecord) {
    storageService.saveTenants(this.arrTenants);
    if (googleSheetsService.bIsConnected) {
      await googleSheetsService.upsertBilling(pRecord);
    }
  };

  TenantRentApp.prototype._deleteBillingRemote = async function (psRecordId) {
    storageService.saveTenants(this.arrTenants);
    if (googleSheetsService.bIsConnected) {
      await googleSheetsService.deleteBilling(psRecordId);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // UI MODE & THEME
  // ═══════════════════════════════════════════════════════════════════════════
  TenantRentApp.prototype._setMode = function (pbTenant) {
    var bIsTenantRole = (typeof pinAuth !== "undefined" && pinAuth.getLoggedInRole() === "tenant");
    if (bIsTenantRole) {
      pbTenant = true; // Tenants are strictly forced to Tenant View only!
    }

    this.bIsTenantView = pbTenant;
    var btnAdmin  = document.getElementById("btn-mode-admin");
    var btnTenant = document.getElementById("btn-mode-tenant");
    var viewAdmin = document.getElementById("view-admin");
    var viewPort  = document.getElementById("view-tenant-portal");

    if (btnAdmin)  btnAdmin.classList.toggle("active", !pbTenant);
    if (btnTenant) btnTenant.classList.toggle("active",  pbTenant);
    if (viewAdmin) viewAdmin.classList.toggle("hidden",  pbTenant);
    if (viewPort)  viewPort.classList.toggle("hidden", !pbTenant);

    this._render();
  };


  TenantRentApp.prototype._initTheme = function () {
    var sSaved = localStorage.getItem("tenantrent_theme");
    var sTheme = sSaved || "light";
    document.documentElement.setAttribute("data-theme", sTheme);
  };

  TenantRentApp.prototype._toggleTheme = function () {
    var html = document.documentElement;
    var sCurrent = html.getAttribute("data-theme") || "light";
    var sNext = sCurrent === "dark" ? "light" : "dark";
    html.setAttribute("data-theme", sNext);
    localStorage.setItem("tenantrent_theme", sNext);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // GOOGLE SHEETS MODAL
  // ═══════════════════════════════════════════════════════════════════════════
  TenantRentApp.prototype._openGSModal = function () {
    var sUrl = googleSheetsService.getWebAppUrl();
    document.getElementById("input-gsheets-url").value = sUrl;
    var elMobCont = document.getElementById("mobile-sync-container");
    if (elMobCont) {
      elMobCont.style.display = googleSheetsService.bIsConnected ? "block" : "none";
    }
    document.getElementById("modal-gsheets-sync").classList.remove("hidden");
  };
  TenantRentApp.prototype._closeGSModal = function () {
    document.getElementById("modal-gsheets-sync").classList.add("hidden");
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // TENANT MODAL (Admin Only)
  // ═══════════════════════════════════════════════════════════════════════════
  TenantRentApp.prototype._openTenantModal = function (psTenantId) {
    this.sEditingTenantId = psTenantId || null;
    document.getElementById("modal-tenant-title").innerText = psTenantId ? "Edit Tenant Profile" : "Add New Tenant Profile";
    var form = document.getElementById("form-tenant");
    form.reset();
    document.getElementById("input-meter-rate").value = "8";
    document.getElementById("input-movein-date").value = new Date().toISOString().slice(0, 10);

    if (psTenantId) {
      var obj = this.arrTenants.find(function (t) { return t.tenant_id === psTenantId; });
      if (obj) {
        document.getElementById("input-room-name")      .value = obj.room;
        document.getElementById("input-tenant-name")    .value = obj.name;
        document.getElementById("input-phone")          .value = obj.phone;
        document.getElementById("input-movein-date")    .value = obj.move_in_date;
        document.getElementById("input-advance-deposit").value = obj.advance;
        document.getElementById("input-base-rent")      .value = obj.base_rent;
        document.getElementById("input-meter-rate")     .value = obj.meter_rate;
      }
    }
    document.getElementById("modal-tenant").classList.remove("hidden");
  };

  TenantRentApp.prototype._closeTenantModal = function () {
    document.getElementById("modal-tenant").classList.add("hidden");
    this.sEditingTenantId = null;
  };

  TenantRentApp.prototype._handleSaveTenant = async function (pEvent) {
    pEvent.preventDefault();
    var self = this;

    var sRoom    = document.getElementById("input-room-name")      .value.trim();
    var sName    = document.getElementById("input-tenant-name")    .value.trim();
    var sPhone   = document.getElementById("input-phone")          .value.trim();
    var sMoveIn  = document.getElementById("input-movein-date")    .value;
    var mAdvance = parseFloat(document.getElementById("input-advance-deposit").value) || 0;
    var mRent    = parseFloat(document.getElementById("input-base-rent")      .value) || 0;
    var mRate    = parseFloat(document.getElementById("input-meter-rate")     .value) || 8;

    var objTenant;

    if (this.sEditingTenantId) {
      objTenant = this.arrTenants.find(function (t) { return t.tenant_id === self.sEditingTenantId; });
      if (objTenant) {
        objTenant.room          = sRoom;
        objTenant.name          = sName;
        objTenant.phone         = sPhone;
        objTenant.move_in_date  = sMoveIn;
        objTenant.advance       = mAdvance;
        objTenant.base_rent     = mRent;
        objTenant.meter_rate    = mRate;
      }
    } else {
      objTenant = createTenant({
        room: sRoom, name: sName, phone: sPhone,
        move_in_date: sMoveIn, advance: mAdvance,
        base_rent: mRent, meter_rate: mRate
      });
      this.arrTenants.push(objTenant);
      this.sActiveTenantId = objTenant.tenant_id;
    }

    await this._saveTenant(objTenant);
    this._closeTenantModal();
    this._render();
  };

  TenantRentApp.prototype.deleteTenant = async function (psTenantId) {
    var self = this;
    var objTenant = this.arrTenants.find(function (t) { return t.tenant_id === psTenantId; });
    if (!objTenant) return;

    if (confirm("Soft Delete: Deactivate tenant '" + objTenant.name + "'? The tenant profile and billing history will be safely archived (soft deleted) as Inactive.")) {
      objTenant.status = "Inactive";
      await this._saveTenant(objTenant);

      var arrActive = this.arrTenants.filter(function (t) { return (t.status || "Active") !== "Inactive"; });
      this.sActiveTenantId = arrActive.length > 0 ? arrActive[0].tenant_id : null;
      this._render();
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // BILLING MODAL (Admin Only)
  // ═══════════════════════════════════════════════════════════════════════════
  TenantRentApp.prototype._openBillingModal = function (psRecordId) {
    var objTenant = this.arrTenants.find(function (t) { return t.tenant_id === this.sActiveTenantId; }.bind(this));
    if (!objTenant) { alert("Please select or add a tenant first."); return; }

    this.sEditingRecordId = psRecordId || null;
    document.getElementById("modal-billing-title").innerText = psRecordId ? "Edit Monthly Bill" : "Add Monthly Bill";
    document.getElementById("calc-rate-display").innerText = objTenant.meter_rate || 8;

    var form = document.getElementById("form-billing");
    form.reset();

    if (psRecordId) {
      var objRec = (objTenant.billing_records || []).find(function (r) { return r.record_id === psRecordId; });
      if (objRec) {
        document.getElementById("input-from-date")       .value = objRec.period_from;
        document.getElementById("input-to-date")         .value = objRec.period_to;
        document.getElementById("input-elec-before")     .value = objRec.elec_prev;
        document.getElementById("input-elec-current")    .value = objRec.elec_curr;
        document.getElementById("input-elec-unit")       .value = objRec.elec_units;
        document.getElementById("input-water-before")    .value = objRec.water_prev;
        document.getElementById("input-water-current")   .value = objRec.water_curr;
        document.getElementById("input-water-unit")      .value = objRec.water_units;
        document.getElementById("input-monthly-rent")    .value = objRec.rent;
        document.getElementById("input-extra-charge")    .value = objRec.extra;
        document.getElementById("input-extra-reason")    .value = objRec.extra_reason || "";
        document.getElementById("input-received-amount") .value = objRec.paid_amount;
        document.getElementById("input-received-date")   .value = objRec.paid_date;
        document.getElementById("input-remark")          .value = objRec.notes;
      }
    } else {
      var arrRecs = objTenant.billing_records || [];
      var sLastTo  = new Date().toISOString().slice(0, 10);
      var fLastElec  = 0, fLastWater = 0;
      if (arrRecs.length > 0) {
        var objLast = arrRecs[arrRecs.length - 1];
        sLastTo    = objLast.period_to  || sLastTo;
        fLastElec  = objLast.elec_curr  || 0;
        fLastWater = objLast.water_curr || 0;
      }
      document.getElementById("input-from-date")    .value = sLastTo;
      document.getElementById("input-elec-before")  .value = fLastElec;
      document.getElementById("input-water-before") .value = fLastWater;
      document.getElementById("input-monthly-rent") .value = objTenant.base_rent;
      document.getElementById("input-extra-charge") .value = 0;
      document.getElementById("input-extra-reason") .value = "";
      document.getElementById("input-received-amount").value = 0;
    }

    this._recalcBill();
    document.getElementById("modal-billing").classList.remove("hidden");
  };

  TenantRentApp.prototype._closeBillingModal = function () {
    document.getElementById("modal-billing").classList.add("hidden");
    this.sEditingRecordId = null;
  };

  TenantRentApp.prototype._recalcBill = function () {
    var objTenant = this.arrTenants.find(function (t) { return t.tenant_id === this.sActiveTenantId; }.bind(this));
    var mRate = objTenant ? (objTenant.meter_rate || 8) : 8;

    var fEB = parseFloat(document.getElementById("input-elec-before") .value) || 0;
    var fEC = parseFloat(document.getElementById("input-elec-current").value) || 0;
    var fEU = Math.max(0, fEC - fEB);
    document.getElementById("input-elec-unit").value = fEU.toFixed(2);

    var fWB = parseFloat(document.getElementById("input-water-before") .value) || 0;
    var fWC = parseFloat(document.getElementById("input-water-current").value) || 0;

    var elWaterUnit = document.getElementById("input-water-unit");
    var bWaterManual = (document.activeElement === elWaterUnit);
    var fWU;
    if (bWaterManual) {
      fWU = parseFloat(elWaterUnit.value) || 0;
    } else {
      fWU = (typeof waterFormula !== "undefined")
        ? waterFormula.compute(fWC, fWB)
        : Math.max(0, fWC - fWB);
      elWaterUnit.value = fWU.toFixed(2);
    }

    var sFormulaLabel = (typeof waterFormula !== "undefined") ? waterFormula.getLabel() : "Curr − Prev";
    var elFormulaInfo = document.getElementById("calc-water-formula");
    if (elFormulaInfo) elFormulaInfo.innerText = "Water formula: " + sFormulaLabel;

    var fTU    = fEU + fWU;
    var mMeter = fTU * mRate;
    var mRent  = parseFloat(document.getElementById("input-monthly-rent").value)    || 0;
    var mExtra = parseFloat(document.getElementById("input-extra-charge").value)    || 0;
    var mTotal = mRent + mMeter + mExtra;
    var mPaid  = parseFloat(document.getElementById("input-received-amount").value) || 0;
    var mBal   = mTotal - mPaid;

    document.getElementById("calc-total-units")  .innerText = fTU.toFixed(2) + " Units";
    document.getElementById("calc-meter-bill")   .innerText = formatCurrency(mMeter);
    document.getElementById("calc-rent-display") .innerText = formatCurrency(mRent);
    document.getElementById("input-total-bill")  .value     = mTotal.toFixed(2);
    document.getElementById("input-balance")     .value     = mBal.toFixed(2);
  };

  TenantRentApp.prototype._handleSaveBilling = async function (pEvent) {
    pEvent.preventDefault();
    var self    = this;
    var objTenant = this.arrTenants.find(function (t) { return t.tenant_id === self.sActiveTenantId; });
    if (!objTenant) return;

    var fEB = parseFloat(document.getElementById("input-elec-before") .value) || 0;
    var fEC = parseFloat(document.getElementById("input-elec-current").value) || 0;
    var fEU = parseFloat(document.getElementById("input-elec-unit")   .value) || 0;
    var fWB = parseFloat(document.getElementById("input-water-before") .value) || 0;
    var fWC = parseFloat(document.getElementById("input-water-current").value) || 0;
    var fWU = parseFloat(document.getElementById("input-water-unit")   .value) || 0;
    var fTU = fEU + fWU;

    var mRate  = objTenant.meter_rate || 8;
    var mMeter = fTU * mRate;
    var mRent  = parseFloat(document.getElementById("input-monthly-rent")    .value) || 0;
    var mExtra = parseFloat(document.getElementById("input-extra-charge")    .value) || 0;
    var sExtraReason = document.getElementById("input-extra-reason").value.trim();
    var mTotal = mRent + mMeter + mExtra;
    var mPaid  = parseFloat(document.getElementById("input-received-amount") .value) || 0;
    var mBal   = mTotal - mPaid;
    var sStatus = computePaymentStatus(mTotal, mPaid);

    var objRecord;
    if (!objTenant.billing_records) objTenant.billing_records = [];

    if (this.sEditingRecordId) {
      objRecord = objTenant.billing_records.find(function (r) { return r.record_id === self.sEditingRecordId; });
      if (objRecord) {
        Object.assign(objRecord, {
          period_from: document.getElementById("input-from-date")      .value,
          period_to:   document.getElementById("input-to-date")        .value,
          elec_prev: fEB, elec_curr: fEC, elec_units: fEU,
          water_prev: fWB, water_curr: fWC, water_units: fWU,
          total_units: fTU, unit_rate: mRate, meter_charges: mMeter,
          rent: mRent, extra: mExtra, extra_reason: sExtraReason, total_due: mTotal,
          paid_amount: mPaid,
          paid_date: document.getElementById("input-received-date").value,
          balance: mBal, payment_status: sStatus,
          notes: document.getElementById("input-remark").value.trim()
        });
      }
    } else {
      objRecord = createBillingRecord(objTenant.tenant_id, {
        period_from: document.getElementById("input-from-date").value,
        period_to:   document.getElementById("input-to-date")  .value,
        elec_prev: fEB, elec_curr: fEC, elec_units: fEU,
        water_prev: fWB, water_curr: fWC, water_units: fWU,
        total_units: fTU, unit_rate: mRate, meter_charges: mMeter,
        rent: mRent, extra: mExtra, extra_reason: sExtraReason, total_due: mTotal,
        paid_amount: mPaid,
        paid_date: document.getElementById("input-received-date").value,
        balance: mBal, payment_status: sStatus,
        notes: document.getElementById("input-remark").value.trim()
      });
      objTenant.billing_records.push(objRecord);
    }

    await this._saveBilling(objRecord);
    this._closeBillingModal();
    this._render();
  };

  TenantRentApp.prototype.deleteRecord = async function (psRecordId) {
    var self = this;
    var objTenant = this.arrTenants.find(function (t) { return t.tenant_id === self.sActiveTenantId; });
    if (!objTenant) return;
    if (confirm("Delete this billing record? This cannot be undone.")) {
      objTenant.billing_records = (objTenant.billing_records || []).filter(function (r) { return r.record_id !== psRecordId; });
      await this._deleteBillingRemote(psRecordId);
      this._render();
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT WIRING
  // ═══════════════════════════════════════════════════════════════════════════
  TenantRentApp.prototype._initEvents = function () {
    var self = this;
    function _on(id, ev, fn) { var el = document.getElementById(id); if (el) el.addEventListener(ev, fn); }

    _on("btn-add-tenant", "click", function () { self._openTenantModal(); });
    _on("form-tenant", "submit", function (e) { self._handleSaveTenant(e); });
    _on("btn-close-tenant-modal", "click", function () { self._closeTenantModal(); });

    _on("btn-add-bill", "click", function () { self._openBillingModal(); });
    _on("form-billing", "submit", function (e) { self._handleSaveBilling(e); });
    _on("btn-close-billing-modal", "click", function () { self._closeBillingModal(); });
    _on("input-elec-before", "input", function () { self._recalcBill(); });
    _on("input-elec-current", "input", function () { self._recalcBill(); });
    _on("input-water-before", "input", function () { self._recalcBill(); });
    _on("input-water-current", "input", function () { self._recalcBill(); });
    _on("input-monthly-rent", "input", function () { self._recalcBill(); });
    _on("input-extra-charge", "input", function () { self._recalcBill(); });
    _on("input-received-amount", "input", function () { self._recalcBill(); });
    _on("btn-send-bill-whatsapp", "click", function () { self._sendLatestBillWhatsApp(); });

    _on("btn-close-receipt-modal", "click", function () {
      var modal = document.getElementById("modal-receipt");
      if (modal) modal.classList.add("hidden");
    });
    _on("btn-print-receipt", "click", function () { window.print(); });
    _on("btn-whatsapp-share", "click", function () { self._sendWhatsApp(); });
  };


  // ═══════════════════════════════════════════════════════════════════════════
  // DATA PERSISTENCE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════
  TenantRentApp.prototype._saveAll = function () {
    storageService.saveTenants(this.arrTenants);
    if (typeof pinAuth !== "undefined") pinAuth.populateTenantDropdown(this.arrTenants);
  };

  TenantRentApp.prototype._saveTenant = async function (pTenant) {
    storageService.saveTenants(this.arrTenants);
    if (typeof pinAuth !== "undefined") pinAuth.populateTenantDropdown(this.arrTenants);
    if (googleSheetsService.bIsConnected) {
      await googleSheetsService.upsertTenant(pTenant);
    }
  };

  TenantRentApp.prototype._deleteTenantRemote = async function (psTenantId) {
    storageService.saveTenants(this.arrTenants);
    if (typeof pinAuth !== "undefined") pinAuth.populateTenantDropdown(this.arrTenants);
    if (googleSheetsService.bIsConnected) {
      await googleSheetsService.deleteTenant(psTenantId);
    }
  };

  TenantRentApp.prototype._saveBilling = async function (pRecord) {
    storageService.saveTenants(this.arrTenants);
    if (googleSheetsService.bIsConnected) {
      await googleSheetsService.upsertBilling(pRecord);
    }
  };

  TenantRentApp.prototype._deleteBillingRemote = async function (psRecordId) {
    storageService.saveTenants(this.arrTenants);
    if (googleSheetsService.bIsConnected) {
      await googleSheetsService.deleteBilling(psRecordId);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RECEIPT & WHATSAPP
  // ═══════════════════════════════════════════════════════════════════════════
  TenantRentApp.prototype.openReceipt = function (psRecordId) {
    var self = this;
    var objTenant = this.arrTenants.find(function (t) { return t.tenant_id === self.sActiveTenantId; });
    if (!objTenant && this.activeReceiptTenant) objTenant = this.activeReceiptTenant;
    if (!objTenant) return;

    var objRec = (objTenant.billing_records || []).find(function (r) { return r.record_id === psRecordId; });
    if (!objRec && this.activeReceiptRecord) objRec = this.activeReceiptRecord;
    if (!objRec) return;

    this.activeReceiptRecord = objRec;
    this.activeReceiptTenant = objTenant;

    var bIsAdmin = (typeof pinAuth !== "undefined" && pinAuth.getLoggedInRole() === "admin");
    var btnWA = document.getElementById("btn-whatsapp-share");
    if (btnWA) btnWA.style.display = bIsAdmin ? "inline-flex" : "none";

    var sSiteUrl = "https://hash-amit.github.io/TenantRent/";

    var sHtml =
      "<div style='background:#ffffff;color:#0f172a;padding:1rem 1.25rem;border:1px solid #cbd5e1;border-radius:12px;max-width:720px;margin:0 auto;font-family:\"Plus Jakarta Sans\",sans-serif;box-sizing:border-box'>" +
        "<div style='display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #6366f1;padding-bottom:0.5rem;margin-bottom:0.6rem'>" +
          "<div>" +
            "<h1 style='margin:0;font-size:1.35rem;font-weight:800;color:#4f46e5;display:flex;align-items:center;gap:6px'>" +
              "<i data-feather=\"home\" style=\"width:20px;height:20px\"></i> TenantRent" +
            "</h1>" +
            "<p style='margin:2px 0 0;font-size:0.75rem;color:#64748b'>Smart Rent &amp; Utility Statement</p>" +
          "</div>" +
          "<div style='text-align:right'>" +
            "<span style='font-size:0.7rem;font-weight:700;letter-spacing:0.5px;color:#64748b;text-transform:uppercase'>Receipt ID</span>" +
            "<div style='font-size:0.85rem;font-weight:800;color:#0f172a'>#" + (objRec.record_id || "REC") + "</div>" +
            "<div style='font-size:0.7rem;color:#64748b'>" + formatDateDisplay(objRec.created_at ? objRec.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10)) + "</div>" +
          "</div>" +
        "</div>" +

        "<div style='display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;background:#f8fafc;padding:0.6rem 0.85rem;border-radius:8px;margin-bottom:0.6rem;border:1px solid #e2e8f0;font-size:0.8rem'>" +
          "<div>" +
            "<span style='color:#64748b;font-size:0.7rem;display:block'>TENANT NAME</span>" +
            "<strong style='color:#0f172a;font-size:0.9rem'>" + objTenant.name + "</strong>" +
            "<div style='color:#475569;margin-top:2px'>📞 " + (objTenant.phone || "—") + "</div>" +
          "</div>" +
          "<div>" +
            "<span style='color:#64748b;font-size:0.7rem;display:block'>ROOM / HOUSE LABEL</span>" +
            "<strong style='color:#0f172a;font-size:0.9rem'>" + objTenant.room + "</strong>" +
            "<div style='color:#475569;margin-top:2px'>📅 Move-in: " + formatDateDisplay(objTenant.move_in_date) + "</div>" +
          "</div>" +
        "</div>" +

        "<div style='background:#e0e7ff;color:#3730a3;padding:0.4rem 0.85rem;border-radius:6px;font-size:0.8rem;font-weight:700;margin-bottom:0.6rem;display:flex;justify-content:space-between'>" +
          "<span>Billing Cycle:</span>" +
          "<span>" + formatDateDisplay(objRec.period_from) + " &nbsp;to&nbsp; " + formatDateDisplay(objRec.period_to) + "</span>" +
        "</div>" +

        "<table style='width:100%;border-collapse:collapse;margin-bottom:0.6rem;font-size:0.8rem'>" +
          "<thead>" +
            "<tr style='background:#f1f5f9;color:#334155;text-align:left'>" +
              "<th style='padding:0.4rem 0.6rem;border-bottom:1px solid #cbd5e1'>Item Description</th>" +
              "<th style='padding:0.4rem 0.6rem;border-bottom:1px solid #cbd5e1'>Readings / Details</th>" +
              "<th style='padding:0.4rem 0.6rem;border-bottom:1px solid #cbd5e1;text-align:right'>Rate</th>" +
              "<th style='padding:0.4rem 0.6rem;border-bottom:1px solid #cbd5e1;text-align:right'>Amount (₹)</th>" +
            "</tr>" +
          "</thead>" +
          "<tbody>" +
            "<tr>" +
              "<td style='padding:0.4rem 0.6rem;border-bottom:1px solid #e2e8f0'>⚡ Electricity Meter</td>" +
              "<td style='padding:0.4rem 0.6rem;border-bottom:1px solid #e2e8f0;color:#475569'>" + objRec.elec_prev + " → " + objRec.elec_curr + " (<strong>" + objRec.elec_units + " units</strong>)</td>" +
              "<td style='padding:0.4rem 0.6rem;border-bottom:1px solid #e2e8f0;text-align:right'>₹" + objRec.unit_rate + "</td>" +
              "<td style='padding:0.4rem 0.6rem;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600'>" + formatCurrency(objRec.elec_units * objRec.unit_rate) + "</td>" +
            "</tr>" +
            "<tr>" +
              "<td style='padding:0.4rem 0.6rem;border-bottom:1px solid #e2e8f0'>💧 Water Meter</td>" +
              "<td style='padding:0.4rem 0.6rem;border-bottom:1px solid #e2e8f0;color:#475569'>" + objRec.water_prev + " → " + objRec.water_curr + " (<strong>" + objRec.water_units + " units</strong>)</td>" +
              "<td style='padding:0.4rem 0.6rem;border-bottom:1px solid #e2e8f0;text-align:right'>₹" + objRec.unit_rate + "</td>" +
              "<td style='padding:0.4rem 0.6rem;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600'>" + formatCurrency(objRec.water_units * objRec.unit_rate) + "</td>" +
            "</tr>" +
            "<tr>" +
              "<td style='padding:0.4rem 0.6rem;border-bottom:1px solid #e2e8f0'>🏠 Base Rent</td>" +
              "<td style='padding:0.4rem 0.6rem;border-bottom:1px solid #e2e8f0;color:#475569'>Monthly Base Charge</td>" +
              "<td style='padding:0.4rem 0.6rem;border-bottom:1px solid #e2e8f0;text-align:right'>—</td>" +
              "<td style='padding:0.4rem 0.6rem;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600'>" + formatCurrency(objRec.rent) + "</td>" +
            "</tr>" +
            (objRec.extra > 0 ?
            "<tr>" +
              "<td style='padding:0.4rem 0.6rem;border-bottom:1px solid #e2e8f0'>➕ Extra Charges</td>" +
              "<td style='padding:0.4rem 0.6rem;border-bottom:1px solid #e2e8f0;color:#475569'>" + (objRec.extra_reason ? objRec.extra_reason : "Miscellaneous") + "</td>" +
              "<td style='padding:0.4rem 0.6rem;border-bottom:1px solid #e2e8f0;text-align:right'>—</td>" +
              "<td style='padding:0.4rem 0.6rem;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600'>" + formatCurrency(objRec.extra) + "</td>" +
            "</tr>" : "") +
            "<tr style='background:#f8fafc;font-weight:800;font-size:0.9rem'>" +
              "<td colspan='3' style='padding:0.5rem 0.6rem;border-top:2px solid #cbd5e1;text-align:right'>TOTAL DUE AMOUNT:</td>" +
              "<td style='padding:0.5rem 0.6rem;border-top:2px solid #cbd5e1;text-align:right;color:#4f46e5'>" + formatCurrency(objRec.total_due) + "</td>" +
            "</tr>" +
          "</tbody>" +
        "</table>" +

        "<div style='display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.4rem;background:#f1f5f9;padding:0.6rem;border-radius:8px;text-align:center;font-size:0.75rem;margin-bottom:0.6rem'>" +
          "<div>" +
            "<span style='color:#64748b;display:block'>AMOUNT RECEIVED</span>" +
            "<strong style='color:#10b981;font-size:0.9rem'>" + formatCurrency(objRec.paid_amount) + "</strong>" +
            "<div style='font-size:0.68rem;color:#64748b'>" + (objRec.paid_date ? formatDateDisplay(objRec.paid_date) : "—") + "</div>" +
          "</div>" +
          "<div>" +
            "<span style='color:#64748b;display:block'>BALANCE DUE</span>" +
            "<strong style='color:" + (objRec.balance > 0 ? "#ef4444" : "#10b981") + ";font-size:0.9rem'>" + formatCurrency(objRec.balance) + "</strong>" +
          "</div>" +
          "<div>" +
            "<span style='color:#64748b;display:block'>PAYMENT STATUS</span>" +
            "<span style='display:inline-block;padding:2px 8px;border-radius:12px;font-weight:700;margin-top:2px;background:" + (objRec.payment_status === "Paid" ? "#d1fae5;color:#065f46" : (objRec.payment_status === "Pending" ? "#fee2e2;color:#991b1b" : "#fef3c7;color:#92400e")) + "'>" + objRec.payment_status.toUpperCase() + "</span>" +
          "</div>" +
        "</div>" +

        (objRec.notes ? "<p style='font-size:0.75rem;color:#475569;margin:0 0 0.6rem;font-style:italic'>Note: " + objRec.notes + "</p>" : "") +

        "<div style='background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:0.5rem 0.6rem;text-align:center;font-size:0.75rem;color:#475569'>" +
          "👉 <a href='" + sSiteUrl + "' target='_blank' style='color:#4f46e5;font-weight:700;text-decoration:underline'>Click here to view your past bills &amp; payment history online</a>" +
        "</div>" +
      "</div>";

    var elScreenArea = document.getElementById("receipt-printable-area");
    if (elScreenArea) elScreenArea.innerHTML = sHtml;

    var elPrintArea = document.getElementById("print-receipt-container");
    if (elPrintArea) elPrintArea.innerHTML = sHtml;

    document.getElementById("modal-receipt").classList.remove("hidden");
    if (window.feather) feather.replace();
  };

  TenantRentApp.prototype._sendWhatsApp = function (pRecord) {
    var r = pRecord || this.activeReceiptRecord;
    var t = this.activeReceiptTenant;
    if (!t && this.arrTenants) {
      t = this.arrTenants.find(function (x) { return x.tenant_id === (r ? r.tenant_id : null); });
    }
    if (!r || !t) { alert("No billing record selected."); return; }

    var sPhone = (t.phone || "").replace(/[^0-9]/g, "");
    var sSiteUrl = "https://hash-amit.github.io/TenantRent/";
    var sMsg =
      "*RENT & UTILITY BILL STATEMENT* 🏠\n" +
      "Room: " + (t.room || "—") + "\n" +
      "Tenant: " + (t.name || "—") + "\n" +
      "Period: " + formatDateDisplay(r.period_from) + " to " + formatDateDisplay(r.period_to) + "\n\n" +
      "⚡ *Electricity*: " + r.elec_prev + " → " + r.elec_curr + " (" + r.elec_units + " units)\n" +
      "💧 *Water*: " + r.water_prev + " → " + r.water_curr + " (" + r.water_units + " units)\n" +
      "📊 *Meter Charges*: " + formatCurrency(r.meter_charges) + " (@ ₹" + r.unit_rate + "/unit)\n" +
      "🏠 *Base Rent*: " + formatCurrency(r.rent) + "\n" +
      (r.extra > 0 ? "➕ *Extra Charges*" + (r.extra_reason ? " (" + r.extra_reason + ")" : "") + ": " + formatCurrency(r.extra) + "\n" : "") +
      "💵 *TOTAL DUE*: *" + formatCurrency(r.total_due) + "*\n\n" +
      "✅ Received: " + formatCurrency(r.paid_amount) + (r.paid_date ? " (" + formatDateDisplay(r.paid_date) + ")" : "") + "\n" +
      "⚠️ Balance: *" + formatCurrency(r.balance) + "*\n" +
      "Status: *" + (r.payment_status || "Pending").toUpperCase() + "*\n\n" +
      "👉 *Click here to view your past bills & payment history online*:\n" + sSiteUrl + "\n\n" +
      "Please make payment at your earliest. Thank you!";

    window.open("https://wa.me/" + (sPhone.length === 10 ? "91" + sPhone : sPhone) + "?text=" + encodeURIComponent(sMsg), "_blank");
  };

  TenantRentApp.prototype._sendLatestBillWhatsApp = function () {
    var self = this;
    var objTenant = this.arrTenants.find(function (t) { return t.tenant_id === self.sActiveTenantId; });
    if (!objTenant) { alert("Please select a tenant profile first."); return; }
    var arrRecs = objTenant.billing_records || [];
    if (arrRecs.length === 0) { alert("No billing records found for this tenant."); return; }

    var objLatest = arrRecs[arrRecs.length - 1];
    this.activeReceiptRecord = objLatest;
    this.activeReceiptTenant = objTenant;
    this._sendWhatsApp(objLatest);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDERING
  // ═══════════════════════════════════════════════════════════════════════════
  TenantRentApp.prototype._render = function () {
    var bIsTenantRole = (typeof pinAuth !== "undefined" && pinAuth.getLoggedInRole() === "tenant");

    var viewPill    = document.getElementById("view-toggle-pill");
    var btnGS       = document.getElementById("btn-gsheets-sync");
    var portalGroup = document.getElementById("portal-controls-group");

    if (bIsTenantRole) {
      if (viewPill)    { viewPill.classList.add("hidden");    viewPill.style.display = "none"; }
      if (btnGS)       { btnGS.classList.add("hidden");       btnGS.style.display = "none"; }
      if (portalGroup) { portalGroup.classList.add("hidden"); portalGroup.style.display = "none"; }
      this.bIsTenantView = true;
    } else {
      if (viewPill)    { viewPill.classList.remove("hidden");    viewPill.style.display = ""; }
      if (btnGS)       { btnGS.classList.remove("hidden");       btnGS.style.display = ""; }
      if (portalGroup) { portalGroup.classList.remove("hidden"); portalGroup.style.display = ""; }
    }

    this._renderSyncBadges();
    this._renderStats();
    if (!this.bIsTenantView) {
      this._renderTenantTabs();
      this._renderTenantSummary();
      this._renderBillingTable();
    } else {
      this._renderPortal();
    }
    if (window.feather) feather.replace();
  };


  TenantRentApp.prototype._renderSyncBadges = function () {
    var btnGS = document.getElementById("btn-gsheets-sync");
    var txtGS = document.getElementById("gsheets-sync-text");
    var bIsTenantRole = (typeof pinAuth !== "undefined" && pinAuth.getLoggedInRole() === "tenant");

    if (btnGS && bIsTenantRole) {
      btnGS.classList.add("hidden");
      return;
    }

    if (googleSheetsService.bIsConnected) {
      if (btnGS) { btnGS.className = "btn btn-secondary"; btnGS.style.borderColor = "var(--success)"; }
      if (txtGS) txtGS.innerHTML = "<span style='color:var(--success)'>Sheet Synced \u2705</span>";
    } else {
      if (btnGS) { btnGS.className = "btn btn-outline"; btnGS.style.borderColor = ""; }
      if (txtGS) txtGS.innerText = "Google Sheets Sync";
    }
  };


  TenantRentApp.prototype._renderStats = function () {
    var arrActive = this.arrTenants.filter(function (t) { return (t.status || "Active") !== "Inactive"; });
    var iTenants = arrActive.length;
    var mCollected = 0, mPending = 0, fUnits = 0;
    arrActive.forEach(function (t) {
      (t.billing_records || []).forEach(function (r) {
        mCollected += Number(r.paid_amount) || 0;
        mPending   += Number(r.balance) > 0 ? Number(r.balance) : 0;
        fUnits     += Number(r.total_units) || 0;
      });
    });
    document.getElementById("stat-active-tenants") .innerText = iTenants + " Tenant(s)";
    document.getElementById("stat-collected-amount").innerText = formatCurrency(mCollected);
    document.getElementById("stat-pending-amount")  .innerText = formatCurrency(mPending);
    document.getElementById("stat-total-units")     .innerText = fUnits.toFixed(1) + " Units";
  };

  TenantRentApp.prototype._renderTenantTabs = function () {
    var self = this;
    var container = document.getElementById("tenant-tabs-container");
    container.innerHTML = "";

    var arrActive = this.arrTenants.filter(function (t) { return (t.status || "Active") !== "Inactive"; });

    if (arrActive.length === 0) {
      container.innerHTML = "<span style='color:var(--text-muted);font-size:0.875rem;padding:0.5rem'>No active tenants yet. Click <strong>Add New Tenant</strong> to get started.</span>";
      return;
    }

    arrActive.forEach(function (t) {
      var btn = document.createElement("button");
      btn.className = "tenant-tab" + (t.tenant_id === self.sActiveTenantId ? " active" : "");
      btn.innerHTML = "<i data-feather='user'></i> " + t.name + " <small>(" + t.room + ")</small>";
      btn.addEventListener("click", function () { self.sActiveTenantId = t.tenant_id; self._render(); });
      container.appendChild(btn);
    });
  };

  TenantRentApp.prototype._renderTenantSummary = function () {
    var self = this;
    var container = document.getElementById("tenant-summary-card");
    var objTenant = this.arrTenants.find(function (t) { return t.tenant_id === self.sActiveTenantId; });

    if (!objTenant) {
      container.innerHTML = "<div style='color:var(--text-muted);padding:1rem'>Select a tenant above, or click <strong>Add New Tenant</strong>.</div>";
      return;
    }

    container.innerHTML =
      "<div class='tenant-info-main'><h2>" + objTenant.name + "</h2><span class='tenant-room-tag'><i data-feather='home'></i> " + objTenant.room + "</span></div>" +
      "<div class='tenant-meta-grid'>" +
        "<div class='meta-item'><span class='meta-label'>Phone / WhatsApp</span><span class='meta-value'>" + (objTenant.phone || "—") + "</span></div>" +
        "<div class='meta-item'><span class='meta-label'>Move-in Date</span><span class='meta-value'>" + formatDateDisplay(objTenant.move_in_date) + "</span></div>" +
        "<div class='meta-item'><span class='meta-label'>Advance Deposit</span><span class='meta-value' style='color:var(--success)'>" + formatCurrency(objTenant.advance) + "</span></div>" +
        "<div class='meta-item'><span class='meta-label'>Base Monthly Rent</span><span class='meta-value'>" + formatCurrency(objTenant.base_rent) + "</span></div>" +
        "<div class='meta-item'><span class='meta-label'>Meter Rate</span><span class='meta-value'>₹" + (objTenant.meter_rate || 8) + "/unit</span></div>" +
      "</div>" +
      "<div style='display:flex;gap:0.75rem;align-items:center;margin-left:auto'>" +
        "<button class='btn btn-outline' onclick=\"app._openTenantModal('" + objTenant.tenant_id + "')\"><i data-feather='edit'></i> Edit</button>" +
        "<button class='btn btn-danger'  onclick=\"app.deleteTenant('" + objTenant.tenant_id + "')\"><i data-feather='trash-2'></i> Delete</button>" +
      "</div>";
  };


  TenantRentApp.prototype._renderBillingTable = function (psFilter) {
    var self = this;
    var tbody = document.getElementById("tbody-billing");
    var badge = document.getElementById("badge-record-count");
    tbody.innerHTML = "";

    var objTenant = this.arrTenants.find(function (t) { return t.tenant_id === self.sActiveTenantId; });
    if (!objTenant) {
      badge.innerText = "0 Entries";
      tbody.innerHTML = "<tr><td colspan='10' style='text-align:center;padding:2.5rem;color:var(--text-muted)'>No tenant selected.</td></tr>";
      return;
    }

    var arrRecs = objTenant.billing_records || [];

    if (psFilter) {
      var q = psFilter.toLowerCase();
      arrRecs = arrRecs.filter(function (r) {
        return (r.period_from || "").includes(q) || (r.period_to || "").includes(q) || (r.payment_status || "").toLowerCase().includes(q) || (r.notes || "").toLowerCase().includes(q);
      });
    }

    badge.innerText = arrRecs.length + " Entries";

    if (arrRecs.length === 0) {
      tbody.innerHTML = "<tr><td colspan='10' style='text-align:center;padding:2.5rem;color:var(--text-muted)'>No billing records yet. Click <strong>Add Monthly Bill</strong> to add one.</td></tr>";
      return;
    }

    arrRecs.slice().reverse().forEach(function (r) {
      var sCls = r.payment_status === "Paid" ? "paid" : (r.payment_status === "Pending" ? "pending" : "partial");
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td><strong>" + formatMonthYear(r.period_from) + "</strong><span class='meter-reading-sub'>" + formatDateDisplay(r.period_from) + " – " + formatDateDisplay(r.period_to) + "</span></td>" +
        "<td><strong>" + r.elec_units + " units</strong><span class='meter-reading-sub'>" + r.elec_prev + " → " + r.elec_curr + "</span></td>" +
        "<td><strong>" + r.water_units + " units</strong><span class='meter-reading-sub'>" + r.water_prev + " → " + r.water_curr + "</span></td>" +
        "<td>" + formatCurrency(r.meter_charges) + "</td>" +
        "<td>" + formatCurrency(r.rent) + "</td>" +
        "<td><strong>" + formatCurrency(r.total_due) + "</strong></td>" +
        "<td><span class='status-pill " + sCls + "'>" + r.payment_status + "</span></td>" +
        "<td>" + formatCurrency(r.paid_amount) + (r.paid_date ? "<span class='meter-reading-sub'>" + r.paid_date + "</span>" : "") + "</td>" +
        "<td style='font-weight:700;color:" + (r.balance > 0 ? "var(--danger)" : "var(--text-primary)") + "'>" + formatCurrency(r.balance) + "</td>" +
        "<td><div class='table-actions'>" +
          "<button class='btn-table-icon' title='Receipt' onclick=\"app.openReceipt('" + r.record_id + "')\"><i data-feather='file-text'></i></button>" +
          "<button class='btn-table-icon' title='Edit' onclick=\"app._openBillingModal('" + r.record_id + "')\"><i data-feather='edit'></i></button>" +
          "<button class='btn-table-icon' title='Delete' onclick=\"app.deleteRecord('" + r.record_id + "')\"><i data-feather='trash'></i></button>" +
        "</div></td>";
      tbody.appendChild(tr);
    });
  };

  // ─── Tenant Portal (Isolated View for logged-in tenant or Admin preview) ──────
  TenantRentApp.prototype._renderPortal = function () {
    var self = this;
    var bIsTenantUser = (typeof pinAuth !== "undefined" && pinAuth.getLoggedInRole() === "tenant");
    var bIsAdmin      = (typeof pinAuth !== "undefined" && pinAuth.getLoggedInRole() === "admin");

    var btnSendBill = document.getElementById("btn-send-bill-whatsapp");
    if (btnSendBill) btnSendBill.style.display = bIsAdmin ? "inline-flex" : "none";

    var arrActive = this.arrTenants.filter(function (t) { return (t.status || "Active") !== "Inactive"; });

    var sel = document.getElementById("select-portal-tenant");
    if (sel) {
      sel.innerHTML = "";
      arrActive.forEach(function (t) {
        var opt = document.createElement("option");
        opt.value   = t.tenant_id;
        opt.innerText = t.name + " (" + t.room + ")";
        if (t.tenant_id === self.sActiveTenantId) opt.selected = true;
        sel.appendChild(opt);
      });
    }

    var objTenant = this.arrTenants.find(function (t) { return t.tenant_id === self.sActiveTenantId; });
    if (!objTenant && arrActive.length > 0) {
      objTenant = arrActive[0];
      this.sActiveTenantId = objTenant.tenant_id;
    }

    if (!objTenant) {
      document.getElementById("portal-tenant-name").innerText = "Welcome!";
      document.getElementById("portal-room-name")  .innerText = "No records found";
      document.getElementById("latest-bill-container").innerHTML = "<p style='color:var(--text-muted)'>No billing details available yet.</p>";
      document.getElementById("tbody-tenant-history").innerHTML = "";
      return;
    }

    document.getElementById("portal-tenant-name").innerText = objTenant.name;
    document.getElementById("portal-room-name")  .innerHTML = "<i data-feather='map-pin'></i> " + objTenant.room;

    var arrRecs = objTenant.billing_records || [];
    var objLatest = arrRecs.length > 0 ? arrRecs[arrRecs.length - 1] : null;
    var latestCard = document.getElementById("latest-bill-container");

    if (objLatest) {
      var sCls = objLatest.payment_status === "Paid" ? "paid" : (objLatest.payment_status === "Pending" ? "pending" : "partial");
      var sLabel = "Total Amount Due";
      var mDisplayVal = objLatest.total_due;
      var sValColor = "var(--primary)";

      if (objLatest.paid_amount > 0) {
        if (objLatest.payment_status === "Paid") {
          sLabel = "Paid in Full ✅";
          mDisplayVal = 0;
          sValColor = "var(--success)";
        } else {
          sLabel = "Balance Due";
          mDisplayVal = objLatest.balance;
          sValColor = "var(--danger)";
        }
      }

      var sBreakdownSub = "";
      if (objLatest.paid_amount > 0) {
        sBreakdownSub = "<div style='font-size:0.75rem;color:var(--text-muted);margin-top:2px'>Total Bill: " + formatCurrency(objLatest.total_due) + " &middot; Paid: " + formatCurrency(objLatest.paid_amount) + "</div>";
      }

      latestCard.innerHTML =
        "<div style='display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem'>" +
          "<div><span class='badge'>Current Billing Cycle</span>" +
          "<h2 style='margin:0.5rem 0'>" + formatDateDisplay(objLatest.period_from) + " to " + formatDateDisplay(objLatest.period_to) + "</h2>" +
          "<p>⚡ Elec: " + objLatest.elec_units + " units | 💧 Water: " + objLatest.water_units + " units | Rate: ₹" + objLatest.unit_rate + "/unit" + (objLatest.extra > 0 ? " | ➕ Extra: " + formatCurrency(objLatest.extra) + (objLatest.extra_reason ? " (" + objLatest.extra_reason + ")" : "") : "") + "</p></div>" +
          "<div style='text-align:right'>" +
            "<span style='font-size:0.85rem;font-weight:600;color:var(--text-muted)'>" + sLabel + "</span>" +
            "<h1 style='color:" + sValColor + ";font-size:2rem;margin:2px 0'>" + formatCurrency(mDisplayVal) + "</h1>" +
            sBreakdownSub +
            "<span class='status-pill " + sCls + "' style='margin-top:4px'>" + objLatest.payment_status + "</span>" +
          "</div>" +
        "</div>";
    } else {
      latestCard.innerHTML = "<p style='color:var(--text-muted)'>No billing records yet.</p>";
    }

    var tbody = document.getElementById("tbody-tenant-history");
    if (tbody) tbody.innerHTML = "";

    arrRecs.slice().reverse().forEach(function (r) {

      var sCls = r.payment_status === "Paid" ? "paid" : (r.payment_status === "Pending" ? "pending" : "partial");
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + formatDateDisplay(r.period_from) + " – " + formatDateDisplay(r.period_to) + "</td>" +
        "<td>" + r.elec_units + " units</td>" +
        "<td>" + r.water_units + " units</td>" +
        "<td>" + formatCurrency(r.meter_charges) + "</td>" +
        "<td>" + formatCurrency(r.rent) + "</td>" +
        "<td><strong>" + formatCurrency(r.total_due) + "</strong></td>" +
        "<td><span class='status-pill " + sCls + "'>" + r.payment_status + "</span></td>" +
        "<td>" + formatCurrency(r.paid_amount) + "</td>" +
        "<td><button class='btn btn-secondary' style='padding:0.35rem 0.75rem;font-size:0.8rem;border-radius:8px' onclick=\"app.openReceipt('" + r.record_id + "')\"><i data-feather='eye'></i> Receipt</button></td>";
      tbody.appendChild(tr);
    });
  };


  return TenantRentApp;
}());

// ─── Bootstrap ───────────────────────────────────────────────────────────────
var app;
window.addEventListener("DOMContentLoaded", function () { app = new TenantRentApp(); });
