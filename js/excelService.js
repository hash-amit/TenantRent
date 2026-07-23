/**
 * TenantRent — Excel Import & Export Service (SheetJS)
 * Aligned with the clean 2-sheet Google Sheets schema.
 */

var ExcelService = /** @class */ (function () {
  function ExcelService() {}

  ExcelService.prototype.exportToExcel = function (pArrTenants) {
    if (!window.XLSX) { alert("SheetJS library is loading. Please retry in a moment."); return; }

    var wb = XLSX.utils.book_new();

    // Sheet 1: tenants
    var arrTenantRows = [
      ["tenant_id","name","room","phone","move_in_date","advance","base_rent","meter_rate","share_key","status","created_at"]
    ];
    pArrTenants.forEach(function (t) {
      arrTenantRows.push([
        t.tenant_id, t.name, t.room, t.phone, t.move_in_date,
        t.advance, t.base_rent, t.meter_rate, t.share_key,
        t.status || "Active", t.created_at || ""
      ]);
    });
    var wsTenants = XLSX.utils.aoa_to_sheet(arrTenantRows);
    XLSX.utils.book_append_sheet(wb, wsTenants, "tenants");

    // Sheet 2: billing_records
    var arrBillingRows = [
      ["record_id","tenant_id","period_from","period_to",
       "elec_prev","elec_curr","elec_units","water_prev","water_curr","water_units",
       "total_units","unit_rate","meter_charges","rent","extra","total_due",
       "paid_amount","paid_date","balance","payment_status","notes","created_at"]
    ];
    pArrTenants.forEach(function (t) {
      (t.billing_records || []).forEach(function (r) {
        arrBillingRows.push([
          r.record_id, r.tenant_id, r.period_from, r.period_to,
          r.elec_prev, r.elec_curr, r.elec_units,
          r.water_prev, r.water_curr, r.water_units,
          r.total_units, r.unit_rate, r.meter_charges,
          r.rent, r.extra, r.total_due,
          r.paid_amount, r.paid_date, r.balance, r.payment_status,
          r.notes, r.created_at || ""
        ]);
      });
    });
    var wsBilling = XLSX.utils.aoa_to_sheet(arrBillingRows);
    XLSX.utils.book_append_sheet(wb, wsBilling, "billing_records");

    var sFileName = "TenantRent_Export_" + new Date().toISOString().slice(0, 10) + ".xlsx";
    XLSX.writeFile(wb, sFileName);
  };

  ExcelService.prototype.parseExcelFile = function (pFile, pOnSuccess, pOnError) {
    if (!window.XLSX) { if (pOnError) pOnError("SheetJS not available."); return; }

    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });

        // Try new 2-sheet format first
        if (wb.SheetNames.includes("tenants") && wb.SheetNames.includes("billing_records")) {
          var arrTRows  = XLSX.utils.sheet_to_json(wb.Sheets["tenants"],         { header: 1 }).slice(1);
          var arrBRows  = XLSX.utils.sheet_to_json(wb.Sheets["billing_records"], { header: 1 }).slice(1);

          var arrTenants = arrTRows.filter(function (r) { return r[0]; }).map(function (r) {
            var sTenantId = strVal(r[0]);
            var arrRecs   = arrBRows
              .filter(function (b) { return strVal(b[1]) === sTenantId; })
              .map(function (b) {
                return {
                  record_id: strVal(b[0]), tenant_id: strVal(b[1]),
                  period_from: strVal(b[2]), period_to: strVal(b[3]),
                  elec_prev: numVal(b[4]), elec_curr: numVal(b[5]), elec_units: numVal(b[6]),
                  water_prev: numVal(b[7]), water_curr: numVal(b[8]), water_units: numVal(b[9]),
                  total_units: numVal(b[10]), unit_rate: numVal(b[11]), meter_charges: numVal(b[12]),
                  rent: numVal(b[13]), extra: numVal(b[14]), total_due: numVal(b[15]),
                  paid_amount: numVal(b[16]), paid_date: strVal(b[17]),
                  balance: numVal(b[18]), payment_status: strVal(b[19]) || "Pending",
                  notes: strVal(b[20]), created_at: strVal(b[21])
                };
              });
            return {
              tenant_id: sTenantId, name: strVal(r[1]), room: strVal(r[2]),
              phone: strVal(r[3]), move_in_date: strVal(r[4]),
              advance: numVal(r[5]), base_rent: numVal(r[6]), meter_rate: numVal(r[7]) || 8,
              share_key: strVal(r[8]) || generateShareKey(),
              status: strVal(r[9]) || "Active", created_at: strVal(r[10]),
              billing_records: arrRecs
            };
          });
          if (pOnSuccess) pOnSuccess(arrTenants);
          return;
        }

        // Fallback: unknown format
        if (pOnError) pOnError("Unrecognised file format. Please export from TenantRent and re-import.");
      } catch (err) {
        if (pOnError) pOnError(err.message);
      }
    };
    reader.readAsArrayBuffer(pFile);
  };

  return ExcelService;
}());

function strVal(v) { return (v !== undefined && v !== null) ? String(v).trim() : ""; }
function numVal(v) {
  var f = parseFloat(String(v || "0").replace(/[^0-9.-]/g, ""));
  return isNaN(f) ? 0 : f;
}

var excelService = new ExcelService();
