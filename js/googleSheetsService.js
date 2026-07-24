/**
 * TenantRent — Google Sheets Bi-Directional Sync Service
 * Uses 3-sheet schema: "tenants" + "billing_records" + "admin_config"
 * Supports DEFAULT_GS_WEB_APP_URL so data connects automatically across all devices.
 */

var STORAGE_KEY_GS_URL = "tenantrent_v2_gs_url";

// Set default Google Sheets Web App URL here for automatic cross-device sync across all phones & PCs
var DEFAULT_GS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwI5oOiakD_lf3turOhpnDKmpUlwlmJSgSPEVWyaMsrOubqAlrNVpKPsFRDBXyIlFHE/exec";

var GoogleSheetsService = /** @class */ (function () {
  function GoogleSheetsService() {
    this.sWebAppUrl = "";
    this.bIsConnected = false;
    this._initUrl();
  }

  GoogleSheetsService.prototype._initUrl = function () {
    // 1. Check URL query parameters e.g. ?gs_url=... or ?gs=... or ?sheetUrl=...
    var sQueryUrl = this._getParamFromUrl();
    if (sQueryUrl) {
      localStorage.setItem(STORAGE_KEY_GS_URL, sQueryUrl);
      this._cleanQueryParam();
    }

    // 2. Read from localStorage or fallback to DEFAULT_GS_WEB_APP_URL
    var sStoredUrl = localStorage.getItem(STORAGE_KEY_GS_URL);
    this.sWebAppUrl = (sStoredUrl || DEFAULT_GS_WEB_APP_URL || "").trim();

    // 3. If connected via DEFAULT_GS_WEB_APP_URL, save it to localStorage for offline cache
    if (this.sWebAppUrl && !sStoredUrl) {
      localStorage.setItem(STORAGE_KEY_GS_URL, this.sWebAppUrl);
    }

    this.bIsConnected = !!this.sWebAppUrl;
  };

  GoogleSheetsService.prototype._getParamFromUrl = function () {
    try {
      if (typeof window === "undefined" || !window.location) return null;
      var objParams = new URLSearchParams(window.location.search);
      var sVal = objParams.get("gs_url") || objParams.get("gs") || objParams.get("sheetUrl");
      return sVal ? decodeURIComponent(sVal).trim() : null;
    } catch (err) {
      console.warn("GoogleSheetsService._getParamFromUrl error:", err);
      return null;
    }
  };

  GoogleSheetsService.prototype._cleanQueryParam = function () {
    try {
      if (typeof window !== "undefined" && window.history && window.history.replaceState) {
        var objUrl = new URL(window.location.href);
        objUrl.searchParams.delete("gs_url");
        objUrl.searchParams.delete("gs");
        objUrl.searchParams.delete("sheetUrl");
        window.history.replaceState({}, document.title, objUrl.pathname + objUrl.search + objUrl.hash);
      }
    } catch (err) {
      console.warn("GoogleSheetsService._cleanQueryParam error:", err);
    }
  };

  GoogleSheetsService.prototype.getMobileSyncLink = function () {
    if (!this.sWebAppUrl || typeof window === "undefined") return "";
    var sBaseUrl = window.location.origin + window.location.pathname;
    return sBaseUrl + "?gs_url=" + encodeURIComponent(this.sWebAppUrl);
  };

  // ── Config ─────────────────────────────────────────────────────────────────
  GoogleSheetsService.prototype.getWebAppUrl = function () {
    return this.sWebAppUrl;
  };

  GoogleSheetsService.prototype.setWebAppUrl = function (psUrl) {
    var sCleanUrl = (psUrl || "").trim();
    this.sWebAppUrl = sCleanUrl || DEFAULT_GS_WEB_APP_URL;
    this.bIsConnected = !!this.sWebAppUrl;
    if (sCleanUrl) {
      localStorage.setItem(STORAGE_KEY_GS_URL, sCleanUrl);
    } else {
      localStorage.removeItem(STORAGE_KEY_GS_URL);
    }
  };

  // ── READ: Fetch all tenants + billing records + admin config from Google Sheets ───────────
  GoogleSheetsService.prototype.fetchAll = async function (iMaxAttempts) {
    if (!this.bIsConnected) return null;
    var iAttempts = iMaxAttempts || 3;
    for (var iAttempt = 1; iAttempt <= iAttempts; iAttempt++) {
      try {
        var response = await fetch(this.sWebAppUrl);
        if (!response.ok) throw new Error("HTTP " + response.status);
        var json = await response.json();
        if (json && json.status === "success") {
          return json; // returns { data: arrTenants, admin_config: objAdminConfig }
        }
      } catch (err) {
        console.warn("GoogleSheetsService.fetchAll attempt " + iAttempt + " failed:", err);
        if (iAttempt < iAttempts) {
          await new Promise(function (resolve) { setTimeout(resolve, 1000); });
        }
      }
    }
    return null;
  };

  // ── WRITE: Upsert a tenant (create or update) ──────────────────────────────
  GoogleSheetsService.prototype.upsertTenant = async function (pTenant) {
    return this._post({ action: "upsert_tenant", tenant: pTenant });
  };

  // ── WRITE: Delete a tenant (and all its billing records) ──────────────────
  GoogleSheetsService.prototype.deleteTenant = async function (psTenantId) {
    return this._post({ action: "delete_tenant", tenant_id: psTenantId });
  };

  // ── WRITE: Upsert a billing record ────────────────────────────────────────
  GoogleSheetsService.prototype.upsertBilling = async function (pRecord) {
    return this._post({ action: "upsert_billing", record: pRecord });
  };

  // ── WRITE: Delete a billing record ────────────────────────────────────────
  GoogleSheetsService.prototype.deleteBilling = async function (psRecordId) {
    return this._post({ action: "delete_billing", record_id: psRecordId });
  };

  // ── WRITE: Update Admin Config in Google Sheet ─────────────────────────────
  GoogleSheetsService.prototype.updateAdminConfig = async function (pObjConfig) {
    return this._post({ action: "update_admin_config", config: pObjConfig });
  };

  // ── Internal POST helper ───────────────────────────────────────────────────
  GoogleSheetsService.prototype._post = async function (pPayload) {
    if (!this.bIsConnected) return false;
    try {
      await fetch(this.sWebAppUrl, {
        method:  "POST",
        mode:    "no-cors",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(pPayload)
      });
      return true;
    } catch (err) {
      console.warn("GoogleSheetsService._post:", err);
      return false;
    }
  };

  return GoogleSheetsService;
}());

var googleSheetsService = new GoogleSheetsService();
