/**
 * TenantRent — Google Sheets Bi-Directional Sync Service
 * Uses the clean 2-sheet schema: "tenants" + "billing_records"
 * Every CRUD action sends an individual targeted request (not a full dump).
 */

var STORAGE_KEY_GS_URL = "tenantrent_v2_gs_url";

var GoogleSheetsService = /** @class */ (function () {
  function GoogleSheetsService() {
    this.sWebAppUrl = localStorage.getItem(STORAGE_KEY_GS_URL) || "";
    this.bIsConnected = !!this.sWebAppUrl;
  }

  // ── Config ─────────────────────────────────────────────────────────────────
  GoogleSheetsService.prototype.getWebAppUrl = function () {
    return this.sWebAppUrl;
  };

  GoogleSheetsService.prototype.setWebAppUrl = function (psUrl) {
    this.sWebAppUrl = (psUrl || "").trim();
    this.bIsConnected = !!this.sWebAppUrl;
    if (this.sWebAppUrl) {
      localStorage.setItem(STORAGE_KEY_GS_URL, this.sWebAppUrl);
    } else {
      localStorage.removeItem(STORAGE_KEY_GS_URL);
    }
  };

  // ── READ: Fetch all tenants + billing records from Google Sheets ───────────
  GoogleSheetsService.prototype.fetchAll = async function () {
    if (!this.bIsConnected) return null;
    try {
      var response = await fetch(this.sWebAppUrl);
      if (!response.ok) throw new Error("HTTP " + response.status);
      var json = await response.json();
      if (json && json.status === "success" && Array.isArray(json.data)) {
        return json.data;   // array of tenant objects with billing_records embedded
      }
    } catch (err) {
      console.warn("GoogleSheetsService.fetchAll:", err);
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

  // ── Internal POST helper ───────────────────────────────────────────────────
  GoogleSheetsService.prototype._post = async function (pPayload) {
    if (!this.bIsConnected) return false;
    try {
      await fetch(this.sWebAppUrl, {
        method:  "POST",
        mode:    "no-cors",   // Google Apps Script redirects require no-cors for simple POSTs
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
