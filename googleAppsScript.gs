/**
 * TenantRent — Google Apps Script (3-Sheet Architecture)
 * Sheet 1: "tenants"        — One row per tenant profile (Column K = "pin")
 * Sheet 2: "billing_records" — One row per monthly billing entry
 * Sheet 3: "admin_config"    — Admin PIN & app settings
 *
 * HOW TO USE:
 * 1. Open your Google Sheet → Extensions → Apps Script
 * 2. Delete all existing code and paste this entire file
 * 3. In the toolbar, select "setupSheets" and click Run ▶️
 * 4. Click Deploy → New deployment → Web app (Access: Anyone)
 */

// ─── Sheet name constants ─────────────────────────────────────────────────────
var SHEET_TENANTS  = "tenants";
var SHEET_BILLING  = "billing_records";
var SHEET_ADMIN    = "admin_config";

// ─── Column definitions for "tenants" sheet (A=0, B=1 …) ────────────────────
var TENANT_COLS = {
  tenant_id:      0,   // A — Unique ID e.g. T001
  name:           1,   // B — Full name
  room:           2,   // C — Room / house label
  phone:          3,   // D — WhatsApp / phone
  move_in_date:   4,   // E — YYYY-MM-DD
  advance:        5,   // F — Advance deposit ₹
  base_rent:      6,   // G — Monthly base rent ₹
  meter_rate:     7,   // H — ₹ per utility unit
  share_key:      8,   // I — Read-only share token
  status:         9,   // J — Active | Inactive
  pin:           10,   // K — Plain text 4-digit Tenant PIN e.g. 1234
  created_at:    11    // L — ISO timestamp
};

// ─── Column definitions for "billing_records" sheet ──────────────────────────
var BILLING_COLS = {
  record_id:      0,   // A — Unique ID e.g. R20260001
  tenant_id:      1,   // B — FK → tenants.tenant_id
  period_from:    2,   // C — Billing start date YYYY-MM-DD
  period_to:      3,   // D — Billing end date YYYY-MM-DD
  elec_prev:      4,   // E — Electricity previous reading
  elec_curr:      5,   // F — Electricity current reading
  elec_units:     6,   // G — Electricity units consumed
  water_prev:     7,   // H — Water previous reading
  water_curr:     8,   // I — Water current reading
  water_units:    9,   // J — Water units consumed
  total_units:   10,   // K — Total utility units (Elec + Water)
  unit_rate:     11,   // L — Rate per unit (₹)
  meter_charges: 12,   // M — Total utility charges = total_units × unit_rate
  rent:          13,   // N — Monthly rent for this cycle
  extra:         14,   // O — Extra / miscellaneous charges
  total_due:     15,   // P — Grand total due = meter_charges + rent + extra
  paid_amount:   16,   // Q — Amount received from tenant
  paid_date:     17,   // R — Date payment was received
  balance:       18,   // S — Outstanding balance = total_due − paid_amount
  payment_status: 19,  // T — Paid | Partial | Pending
  notes:         20,   // U — Remarks / notes
  created_at:    21,   // V — ISO timestamp when record was created
  extra_reason:  22    // W — Reason / details for extra charges
};

// ─── Header rows ─────────────────────────────────────────────────────────────
var TENANT_HEADERS = [
  "tenant_id","name","room","phone","move_in_date",
  "advance","base_rent","meter_rate","share_key","status","pin","created_at"
];

var BILLING_HEADERS = [
  "record_id","tenant_id","period_from","period_to",
  "elec_prev","elec_curr","elec_units",
  "water_prev","water_curr","water_units",
  "total_units","unit_rate","meter_charges",
  "rent","extra","total_due",
  "paid_amount","paid_date","balance","payment_status",
  "notes","created_at","extra_reason"
];

var ADMIN_HEADERS = ["key", "value", "updated_at"];

// Default admin PIN
var DEFAULT_ADMIN_PIN = "1234";

// ─── Direct Setup Runner (Select "setupSheets" & click Run ▶️ in Apps Script) ───
function setupSheets() {
  var sheets = ensureSheets();
  var wsTenants = sheets.tenants;

  // Force header row update
  wsTenants.getRange(1, 1, 1, TENANT_HEADERS.length).setValues([TENANT_HEADERS]).setFontWeight("bold");

  // Fill default PIN "1234" for existing rows if empty
  var iLastRow = wsTenants.getLastRow();
  if (iLastRow > 1) {
    for (var r = 2; r <= iLastRow; r++) {
      var valPin = val(wsTenants.getRange(r, TENANT_COLS.pin + 1).getValue(), 0);
      if (!valPin || valPin.indexOf("h_") === 0) {
        wsTenants.getRange(r, TENANT_COLS.pin + 1).setValue("1234");
      }
    }
  }

  Logger.log("✅ All sheets updated! Column 'pin' created at Column K.");
}

// ─── Ensure sheets exist with header rows & correct schema ────────────────────
function ensureSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var wsTenants = ss.getSheetByName(SHEET_TENANTS);
  if (!wsTenants) {
    wsTenants = ss.insertSheet(SHEET_TENANTS);
    wsTenants.appendRow(TENANT_HEADERS);
    wsTenants.getRange(1, 1, 1, TENANT_HEADERS.length).setFontWeight("bold");
  } else {
    // Migration check: ensure column K is "pin"
    var arrHeaders = wsTenants.getRange(1, 1, 1, Math.max(wsTenants.getLastColumn(), 1)).getValues()[0];
    var iPinIdx = arrHeaders.indexOf("pin");
    var iPinHashIdx = arrHeaders.indexOf("pin_hash");

    if (iPinHashIdx !== -1) {
      wsTenants.getRange(1, iPinHashIdx + 1).setValue("pin").setFontWeight("bold");
    } else if (iPinIdx === -1) {
      var iCreatedIdx = arrHeaders.indexOf("created_at");
      if (iCreatedIdx !== -1) {
        wsTenants.insertColumnBefore(iCreatedIdx + 1);
        wsTenants.getRange(1, iCreatedIdx + 1).setValue("pin").setFontWeight("bold");
      } else {
        wsTenants.getRange(1, 1, 1, TENANT_HEADERS.length).setValues([TENANT_HEADERS]).setFontWeight("bold");
      }
    }
  }

  var wsBilling = ss.getSheetByName(SHEET_BILLING);
  if (!wsBilling) {
    wsBilling = ss.insertSheet(SHEET_BILLING);
    wsBilling.appendRow(BILLING_HEADERS);
    wsBilling.getRange(1, 1, 1, BILLING_HEADERS.length).setFontWeight("bold");
  } else {
    wsBilling.getRange(1, 1, 1, BILLING_HEADERS.length).setValues([BILLING_HEADERS]).setFontWeight("bold");
  }

  var wsAdmin = ss.getSheetByName(SHEET_ADMIN);
  if (!wsAdmin) {
    wsAdmin = ss.insertSheet(SHEET_ADMIN);
    wsAdmin.appendRow(ADMIN_HEADERS);
    wsAdmin.getRange(1, 1, 1, ADMIN_HEADERS.length).setFontWeight("bold");
    var sNow = new Date().toISOString();
    wsAdmin.appendRow(["admin_pin", DEFAULT_ADMIN_PIN, sNow]);
    wsAdmin.appendRow(["water_formula_type", "default", sNow]);
    wsAdmin.appendRow(["water_formula_divisor", "2", sNow]);
  }

  return { tenants: wsTenants, billing: wsBilling, admin: wsAdmin };
}

// ─── HTTP GET — fetch all tenants, billing records & admin config ───────────
function doGet(e) {
  try {
    var sheets = ensureSheets();
    var arrTenants = readAllTenants(sheets.tenants, sheets.billing);
    var objAdmin   = readAdminConfig(sheets.admin);
    return jsonResponse({ status: "success", data: arrTenants, admin_config: objAdmin });
  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  }
}

function readAllTenants(wsTenants, wsBilling) {
  var tenantRows = getAllRows(wsTenants);
  var billingRows = getAllRows(wsBilling);

  var arrTenants = tenantRows.map(function(row) {
    var sTenantId = val(row, TENANT_COLS.tenant_id);
    var arrRecords = billingRows
      .filter(function(b) { return val(b, BILLING_COLS.tenant_id) === sTenantId; })
      .map(function(b) { return rowToBillingObj(b); });

    var rawPin = val(row, TENANT_COLS.pin) || "1234";
    var sCleanPin = rawPin.replace(/^h_/, "").trim();
    if (sCleanPin === "12401f" || !sCleanPin) sCleanPin = "1234";

    return {
      tenant_id:    sTenantId,
      name:         val(row, TENANT_COLS.name),
      room:         val(row, TENANT_COLS.room),
      phone:        val(row, TENANT_COLS.phone),
      move_in_date: val(row, TENANT_COLS.move_in_date),
      advance:      numVal(row, TENANT_COLS.advance),
      base_rent:    numVal(row, TENANT_COLS.base_rent),
      meter_rate:   numVal(row, TENANT_COLS.meter_rate),
      share_key:    val(row, TENANT_COLS.share_key),
      status:       val(row, TENANT_COLS.status) || "Active",
      pin:          sCleanPin,
      pin_hash:     sCleanPin,
      created_at:   val(row, TENANT_COLS.created_at),
      billing_records: arrRecords
    };
  });

  return arrTenants;
}

function readAdminConfig(wsAdmin) {
  var rows = getAllRows(wsAdmin);
  var config = {
    admin_pin: DEFAULT_ADMIN_PIN,
    admin_pin_hash: DEFAULT_ADMIN_PIN,
    water_formula_type: "default",
    water_formula_divisor: "2"
  };

  rows.forEach(function(r) {
    var k = val(r, 0);
    var v = val(r, 1);
    if (k) {
      var sCleanV = String(v).replace(/^h_/, "").trim();
      if (sCleanV === "12401f" || !sCleanV) sCleanV = DEFAULT_ADMIN_PIN;
      config[k] = sCleanV;
      if (k === "admin_pin" || k === "admin_pin_hash") {
        config["admin_pin"] = sCleanV;
        config["admin_pin_hash"] = sCleanV;
      }
    }
  });

  return config;
}

function rowToBillingObj(row) {
  return {
    record_id:      val(row, BILLING_COLS.record_id),
    tenant_id:      val(row, BILLING_COLS.tenant_id),
    period_from:    val(row, BILLING_COLS.period_from),
    period_to:      val(row, BILLING_COLS.period_to),
    elec_prev:      numVal(row, BILLING_COLS.elec_prev),
    elec_curr:      numVal(row, BILLING_COLS.elec_curr),
    elec_units:     numVal(row, BILLING_COLS.elec_units),
    water_prev:     numVal(row, BILLING_COLS.water_prev),
    water_curr:     numVal(row, BILLING_COLS.water_curr),
    water_units:    numVal(row, BILLING_COLS.water_units),
    total_units:    numVal(row, BILLING_COLS.total_units),
    unit_rate:      numVal(row, BILLING_COLS.unit_rate),
    meter_charges:  numVal(row, BILLING_COLS.meter_charges),
    rent:           numVal(row, BILLING_COLS.rent),
    extra:          numVal(row, BILLING_COLS.extra),
    total_due:      numVal(row, BILLING_COLS.total_due),
    paid_amount:    numVal(row, BILLING_COLS.paid_amount),
    paid_date:      val(row, BILLING_COLS.paid_date),
    balance:        numVal(row, BILLING_COLS.balance),
    payment_status: val(row, BILLING_COLS.payment_status) || "Pending",
    notes:          val(row, BILLING_COLS.notes),
    created_at:     val(row, BILLING_COLS.created_at),
    extra_reason:   val(row, BILLING_COLS.extra_reason)
  };
}

// ─── HTTP POST — handles all write operations ────────────────────────────────
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var action  = payload.action;
    var sheets  = ensureSheets();

    switch (action) {

      case "upsert_tenant":
        upsertTenant(sheets.tenants, payload.tenant);
        return jsonResponse({ status: "success", message: "Tenant saved." });

      case "delete_tenant":
        deleteRowById(sheets.tenants, TENANT_COLS.tenant_id, payload.tenant_id);
        deleteRowsWhere(sheets.billing, BILLING_COLS.tenant_id, payload.tenant_id);
        return jsonResponse({ status: "success", message: "Tenant and records deleted." });

      case "upsert_billing":
        upsertBilling(sheets.billing, payload.record);
        return jsonResponse({ status: "success", message: "Billing record saved." });

      case "delete_billing":
        deleteRowById(sheets.billing, BILLING_COLS.record_id, payload.record_id);
        return jsonResponse({ status: "success", message: "Billing record deleted." });

      case "update_admin_config":
        updateAdminConfig(sheets.admin, payload.config);
        return jsonResponse({ status: "success", message: "Admin settings updated." });

      default:
        return jsonResponse({ status: "error", message: "Unknown action: " + action });
    }
  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  }
}

// ─── Upsert helpers ──────────────────────────────────────────────────────────
function upsertTenant(ws, t) {
  var sNow = new Date().toISOString();
  var sPin = (t.pin || t.pin_hash || "1234").toString().replace(/^h_/, "").trim();
  if (sPin === "12401f" || !sPin) sPin = "1234";

  var newRow = [
    t.tenant_id, t.name, t.room, t.phone, t.move_in_date,
    t.advance, t.base_rent, t.meter_rate, t.share_key,
    t.status || "Active", sPin, t.created_at || sNow
  ];
  upsertRow(ws, TENANT_COLS.tenant_id, t.tenant_id, newRow);
}

function upsertBilling(ws, b) {
  var sNow = new Date().toISOString();
  var newRow = [
    b.record_id, b.tenant_id, b.period_from, b.period_to,
    b.elec_prev, b.elec_curr, b.elec_units,
    b.water_prev, b.water_curr, b.water_units,
    b.total_units, b.unit_rate, b.meter_charges,
    b.rent, b.extra, b.total_due,
    b.paid_amount, b.paid_date, b.balance, b.payment_status,
    b.notes, b.created_at || sNow, b.extra_reason || ""
  ];
  upsertRow(ws, BILLING_COLS.record_id, b.record_id, newRow);
}

function updateAdminConfig(wsAdmin, objConfig) {
  var sNow = new Date().toISOString();
  for (var key in objConfig) {
    if (objConfig.hasOwnProperty(key)) {
      var sValStr = String(objConfig[key]).replace(/^h_/, "").trim();
      if (sValStr === "12401f" || !sValStr) sValStr = "1234";
      upsertRow(wsAdmin, 0, key, [key, sValStr, sNow]);
      if (key === "admin_pin") {
        upsertRow(wsAdmin, 0, "admin_pin_hash", ["admin_pin_hash", sValStr, sNow]);
      }
    }
  }
}

// ─── Generic sheet utilities ─────────────────────────────────────────────────
function getAllRows(ws) {
  var arrAll = ws.getDataRange().getValues();
  return arrAll.slice(1).filter(function(r) { return r[0] !== "" && r[0] !== null && r[0] !== undefined; });
}

function upsertRow(ws, iIdCol, sId, arrNewRow) {
  var arrAll = ws.getDataRange().getValues();
  for (var i = 1; i < arrAll.length; i++) {
    if (String(arrAll[i][iIdCol]).trim() === String(sId).trim()) {
      ws.getRange(i + 1, 1, 1, arrNewRow.length).setValues([arrNewRow]);
      return;
    }
  }
  ws.appendRow(arrNewRow);
}

function deleteRowById(ws, iIdCol, sId) {
  var arrAll = ws.getDataRange().getValues();
  for (var i = arrAll.length - 1; i >= 1; i--) {
    if (String(arrAll[i][iIdCol]).trim() === String(sId).trim()) {
      ws.deleteRow(i + 1);
      return;
    }
  }
}

function deleteRowsWhere(ws, iCol, sVal) {
  var arrAll = ws.getDataRange().getValues();
  for (var i = arrAll.length - 1; i >= 1; i--) {
    if (String(arrAll[i][iCol]).trim() === String(sVal).trim()) {
      ws.deleteRow(i + 1);
    }
  }
}

// ─── Value helpers ────────────────────────────────────────────────────────────
function val(row, idx) {
  var v = row[idx];
  if (v === undefined || v === null) return "";
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
  return String(v).trim();
}

function numVal(row, idx) {
  var f = parseFloat(String(row[idx] || "0").replace(/[^0-9.-]/g, ""));
  return isNaN(f) ? 0 : f;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
