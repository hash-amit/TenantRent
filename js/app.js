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

    // 1. Load from LocalStorage cache first
    this.arrTenants = storageService.getTenants();

    // 2. If Google Sheets is connected, fetch live data
    if (googleSheetsService.bIsConnected) {
      var jsonLive = await googleSheetsService.fetchAll();
      if (jsonLive !== null) {
        if (Array.isArray(jsonLive.data)) {
          this.arrTenants = jsonLive.data;
          storageService.saveTenants(this.arrTenants);
        }
        if (jsonLive.admin_config) {
          if (jsonLive.admin_config.admin_pin_hash) {
            if (typeof pinAuth !== "undefined") {
              pinAuth.setAdminPinHash(jsonLive.admin_config.admin_pin_hash);
            } else if (typeof STORAGE_KEY_ADMIN_PIN !== "undefined") {
              localStorage.setItem(STORAGE_KEY_ADMIN_PIN, jsonLive.admin_config.admin_pin_hash);
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
      }
    }


    // Populate login screen dropdown
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

    _on("btn-share-tenant-link", "click", function () { self._copyShareLink(); });

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


  TenantRentApp.prototype._toggleTheme = function () {
    var html = document.documentElement;
    html.setAttribute("data-theme", html.getAttribute("data-theme") === "dark" ? "light" : "dark");
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
    if (confirm("Delete this tenant and ALL their billing records? This cannot be undone.")) {
      this.arrTenants = this.arrTenants.filter(function (t) { return t.tenant_id !== psTenantId; });
      this.sActiveTenantId = this.arrTenants.length > 0 ? this.arrTenants[0].tenant_id : null;
      await this._deleteTenantRemote(psTenantId);
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
          rent: mRent, extra: mExtra, total_due: mTotal,
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
        rent: mRent, extra: mExtra, total_due: mTotal,
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
  // RECEIPT & WHATSAPP
  // ═══════════════════════════════════════════════════════════════════════════
  TenantRentApp.prototype.openReceipt = function (psRecordId) {
    var self = this;
    var objTenant = this.arrTenants.find(function (t) { return t.tenant_id === self.sActiveTenantId; });
    if (!objTenant) return;
    var objRec = (objTenant.billing_records || []).find(function (r) { return r.record_id === psRecordId; });
    if (!objRec) return;

    this.activeReceiptRecord = objRec;
    this.activeReceiptTenant = objTenant;

    document.getElementById("receipt-printable-area").innerHTML =
      "<div class=\"receipt-box\">" +
        "<div class=\"receipt-header\">" +
          "<h2>RENT & UTILITY STATEMENT</h2>" +
          "<p><strong>" + objTenant.room + "</strong> \u2014 " + objTenant.name + "</p>" +
          "<p><small>Period: " + formatDateDisplay(objRec.period_from) + " to " + formatDateDisplay(objRec.period_to) + "</small></p>" +
        "</div>" +
        "<table class=\"receipt-table\">" +
          "<tr><td>Electricity Reading:</td><td style=\"text-align:right\">" + objRec.elec_prev + " \u2192 " + objRec.elec_curr + " (<strong>" + objRec.elec_units + " units</strong>)</td></tr>" +
          "<tr><td>Water Reading:</td><td style=\"text-align:right\">" + objRec.water_prev + " \u2192 " + objRec.water_curr + " (<strong>" + objRec.water_units + " units</strong>)</td></tr>" +
          "<tr><td>Meter Charges (@ \u20b9" + objRec.unit_rate + "/unit):</td><td style=\"text-align:right\">" + formatCurrency(objRec.meter_charges) + "</td></tr>" +
          "<tr><td>Monthly Rent:</td><td style=\"text-align:right\">" + formatCurrency(objRec.rent) + "</td></tr>" +
          (objRec.extra > 0 ? "<tr><td>Extra Charges:</td><td style=\"text-align:right\">" + formatCurrency(objRec.extra) + "</td></tr>" : "") +
          "<tr class=\"total-row\"><td><strong>TOTAL DUE:</strong></td><td style=\"text-align:right\"><strong>" + formatCurrency(objRec.total_due) + "</strong></td></tr>" +
          "<tr><td>Paid Amount:</td><td style=\"text-align:right;color:var(--success)\">" + formatCurrency(objRec.paid_amount) + " (" + (objRec.paid_date || "Pending") + ")</td></tr>" +
          "<tr><td>Balance:</td><td style=\"text-align:right;color:var(--danger);font-weight:700\">" + formatCurrency(objRec.balance) + "</td></tr>" +
        "</table>" +
        "<div style=\"margin-top:1rem;padding:0.75rem;background:var(--bg-surface);border-radius:var(--radius-md);text-align:center;font-size:0.8rem\">" +
          "<p><strong>Status: " + objRec.payment_status.toUpperCase() + "</strong></p>" +
          "<p>" + (objRec.notes ? "Note: " + objRec.notes : "Thank you for your prompt payment!") + "</p>" +
        "</div>" +
      "</div>";

    document.getElementById("modal-receipt").classList.remove("hidden");
    if (window.feather) feather.replace();
  };

  TenantRentApp.prototype._sendWhatsApp = function () {
    if (!this.activeReceiptRecord || !this.activeReceiptTenant) return;
    var t = this.activeReceiptTenant;
    var r = this.activeReceiptRecord;
    var sPhone = (t.phone || "").replace(/[^0-9]/g, "");
    var sMsg =
      "*RENT & UTILITY BILL* \uD83C\uDFE0\n" +
      "Room: " + t.room + "\nTenant: " + t.name + "\n" +
      "Period: " + formatDateDisplay(r.period_from) + " to " + formatDateDisplay(r.period_to) + "\n\n" +
      "\u26A1 *Electricity*: " + r.elec_prev + " \u2192 " + r.elec_curr + " (" + r.elec_units + " units)\n" +
      "\uD83D\uDCA7 *Water*: " + r.water_prev + " \u2192 " + r.water_curr + " (" + r.water_units + " units)\n" +
      "\uD83D\uDCC8 *Meter Bill*: " + formatCurrency(r.meter_charges) + " @ \u20b9" + r.unit_rate + "/unit\n" +
      "\uD83C\uDFE0 *Rent*: " + formatCurrency(r.rent) + "\n" +
      "\uD83D\uDCB5 *TOTAL DUE*: *" + formatCurrency(r.total_due) + "*\n\n" +
      "\u2705 Paid: " + formatCurrency(r.paid_amount) + "\n" +
      "\u26A0\uFE0F Balance: *" + formatCurrency(r.balance) + "*\n" +
      "Status: *" + r.payment_status.toUpperCase() + "*\n\nPlease make payment at your earliest. Thank you!";
    window.open("https://wa.me/" + (sPhone.length === 10 ? "91" + sPhone : sPhone) + "?text=" + encodeURIComponent(sMsg), "_blank");
  };

  TenantRentApp.prototype._copyShareLink = function () {
    var self = this;
    var objTenant = this.arrTenants.find(function (t) { return t.tenant_id === self.sActiveTenantId; });
    if (!objTenant) return;
    var sBaseUrl = window.location.origin + window.location.pathname;
    var sHash = "#tenant/" + (objTenant.share_key || objTenant.tenant_id);
    var sLink = sBaseUrl + sHash;
    if (googleSheetsService.bIsConnected && googleSheetsService.getWebAppUrl()) {
      sLink = sBaseUrl + "?gs_url=" + encodeURIComponent(googleSheetsService.getWebAppUrl()) + sHash;
    }
    navigator.clipboard.writeText(sLink)
      .then(function () { alert("Tenant passbook link copied!\n\n" + sLink); })
      .catch(function () { alert("Link: " + sLink); });
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
    var iTenants = this.arrTenants.length;
    var mCollected = 0, mPending = 0, fUnits = 0;
    this.arrTenants.forEach(function (t) {
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

    if (this.arrTenants.length === 0) {
      container.innerHTML = "<span style='color:var(--text-muted);font-size:0.875rem;padding:0.5rem'>No tenants yet. Click <strong>Add New Tenant</strong> to get started.</span>";
      return;
    }

    this.arrTenants.forEach(function (t) {
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

    var sel = document.getElementById("select-portal-tenant");
    if (sel) {
      sel.innerHTML = "";
      this.arrTenants.forEach(function (t) {
        var opt = document.createElement("option");
        opt.value   = t.tenant_id;
        opt.innerText = t.name + " (" + t.room + ")";
        if (t.tenant_id === self.sActiveTenantId) opt.selected = true;
        sel.appendChild(opt);
      });
    }

    var objTenant = this.arrTenants.find(function (t) { return t.tenant_id === self.sActiveTenantId; });
    if (!objTenant && this.arrTenants.length > 0) {
      objTenant = this.arrTenants[0];
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
      var sCls = objLatest.payment_status === "Paid" ? "paid" : "pending";
      latestCard.innerHTML =
        "<div style='display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem'>" +
          "<div><span class='badge'>Current Billing Cycle</span>" +
          "<h2 style='margin:0.5rem 0'>" + formatDateDisplay(objLatest.period_from) + " to " + formatDateDisplay(objLatest.period_to) + "</h2>" +
          "<p>⚡ Elec: " + objLatest.elec_units + " units | 💧 Water: " + objLatest.water_units + " units | Rate: ₹" + objLatest.unit_rate + "/unit</p></div>" +
          "<div style='text-align:right'><span style='font-size:0.8rem;color:var(--text-muted)'>Total Amount Due</span>" +
          "<h1 style='color:var(--primary);font-size:2rem'>" + formatCurrency(objLatest.total_due) + "</h1>" +
          "<span class='status-pill " + sCls + "'>" + objLatest.payment_status + "</span></div>" +
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
