/**
 * TenantRent — Data Model Definitions & Utility Functions
 * No seed / demo data. App starts completely empty.
 */

// ─── ID Generators ────────────────────────────────────────────────────────────
function generateTenantId() {
  // Format: T + timestamp suffix e.g. T1721234567890
  return "T" + Date.now();
}

function generateRecordId() {
  // Format: R + timestamp suffix e.g. R1721234567890
  return "R" + Date.now();
}

function generateShareKey() {
  return "SK" + Math.random().toString(36).substring(2, 10).toUpperCase();
}

// ─── Factory: create a blank tenant object ────────────────────────────────────
function createTenant(pOverrides) {
  var sNow = new Date().toISOString().slice(0, 10);
  var defaults = {
    tenant_id:      generateTenantId(),
    name:           "",
    room:           "",
    phone:          "",
    move_in_date:   sNow,
    advance:        0,
    base_rent:      0,
    meter_rate:     8,
    share_key:      generateShareKey(),
    status:         "Active",
    created_at:     new Date().toISOString(),
    billing_records: []
  };
  return Object.assign(defaults, pOverrides || {});
}

// ─── Factory: create a blank billing record object ────────────────────────────
function createBillingRecord(pTenantId, pOverrides) {
  var sNow = new Date().toISOString().slice(0, 10);
  var defaults = {
    record_id:      generateRecordId(),
    tenant_id:      pTenantId || "",
    period_from:    sNow,
    period_to:      sNow,
    elec_prev:      0,
    elec_curr:      0,
    elec_units:     0,
    water_prev:     0,
    water_curr:     0,
    water_units:    0,
    total_units:    0,
    unit_rate:      8,
    meter_charges:  0,
    rent:           0,
    extra:          0,
    total_due:      0,
    paid_amount:    0,
    paid_date:      "",
    balance:        0,
    payment_status: "Pending",
    notes:          "",
    created_at:     new Date().toISOString()
  };
  return Object.assign(defaults, pOverrides || {});
}

// ─── Display Formatters ───────────────────────────────────────────────────────
function formatCurrency(pAmount) {
  var mVal = Number(pAmount) || 0;
  return "₹" + mVal.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatDateDisplay(pDateStr) {
  if (!pDateStr) return "—";
  // Already in DD/MM/YYYY
  if (pDateStr.includes("/")) return pDateStr;
  // YYYY-MM-DD → DD/MM/YYYY
  var arrP = pDateStr.split("-");
  if (arrP.length === 3) return arrP[2] + "/" + arrP[1] + "/" + arrP[0];
  return pDateStr;
}

function formatMonthYear(pDateStr) {
  if (!pDateStr) return "—";
  try {
    var dt = new Date(pDateStr);
    return dt.toLocaleString("en-IN", { month: "short", year: "numeric" });
  } catch(e) {
    return pDateStr;
  }
}

function computePaymentStatus(pTotalDue, pPaidAmount) {
  var mDue  = Number(pTotalDue)    || 0;
  var mPaid = Number(pPaidAmount)  || 0;
  if (mDue <= 0)       return "Pending";
  if (mPaid <= 0)      return "Pending";
  if (mPaid >= mDue)   return "Paid";
  return "Partial";
}
