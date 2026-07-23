/**
 * TenantRent — LocalStorage Persistence Service
 * Keeps a local cache so the app works even when offline or before Google Sheets is connected.
 */

var STORAGE_KEY_TENANTS  = "tenantrent_v2_tenants";
var STORAGE_KEY_SUPABASE = "tenantrent_v2_supabase";

var StorageService = /** @class */ (function () {
  function StorageService() {
    this.bIsCloudConnected = false;
    this.objSupabaseClient = null;
    this._initSupabase();
  }

  // ── Tenants ────────────────────────────────────────────────────────────────
  StorageService.prototype.getTenants = function () {
    try {
      var sRaw = localStorage.getItem(STORAGE_KEY_TENANTS);
      if (!sRaw) return [];                           // ← always empty on first open
      var arrParsed = JSON.parse(sRaw);
      return Array.isArray(arrParsed) ? arrParsed : [];
    } catch (err) {
      console.error("StorageService.getTenants:", err);
      return [];
    }
  };

  StorageService.prototype.saveTenants = function (pArrTenants) {
    try {
      localStorage.setItem(STORAGE_KEY_TENANTS, JSON.stringify(pArrTenants));
    } catch (err) {
      console.error("StorageService.saveTenants:", err);
    }
  };

  StorageService.prototype.clearAll = function () {
    localStorage.removeItem(STORAGE_KEY_TENANTS);
  };

  // ── Supabase (optional — kept for future use) ─────────────────────────────
  StorageService.prototype.getSupabaseConfig = function () {
    try {
      var sRaw = localStorage.getItem(STORAGE_KEY_SUPABASE);
      return sRaw ? JSON.parse(sRaw) : { sUrl: "", sAnonKey: "" };
    } catch (err) {
      return { sUrl: "", sAnonKey: "" };
    }
  };

  StorageService.prototype.saveSupabaseConfig = function (pUrl, pKey) {
    var objConfig = { sUrl: (pUrl || "").trim(), sAnonKey: (pKey || "").trim() };
    localStorage.setItem(STORAGE_KEY_SUPABASE, JSON.stringify(objConfig));
    this._initSupabase();
  };

  StorageService.prototype._initSupabase = function () {
    var cfg = this.getSupabaseConfig();
    if (cfg.sUrl && cfg.sAnonKey && window.supabase) {
      try {
        this.objSupabaseClient = window.supabase.createClient(cfg.sUrl, cfg.sAnonKey);
        this.bIsCloudConnected = true;
      } catch (err) {
        this.bIsCloudConnected = false;
      }
    } else {
      this.bIsCloudConnected = false;
    }
  };

  return StorageService;
}());

var storageService = new StorageService();
