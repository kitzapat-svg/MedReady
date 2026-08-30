/**
 * MedReady - Main Web App Entry Point & System Setup
 * Connects Ward and IPD Pharmacy for discharge medication readiness.
 */

/**
 * Serves the MedReady Web App
 */
function doGet(e) {
  try {
    const template = HtmlService.createTemplateFromFile('index');
    
    // Evaluate template and set responsive / secure headers
    const output = template.evaluate()
      .setTitle('MedReady — ติดตามความพร้อมยากลับบ้าน')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
      
    return output;
  } catch (err) {
    return HtmlService.createHtmlOutput(
      '<div style="font-family:sans-serif;padding:24px;color:#ba1a1a;">' +
      '<h2>MedReady - เกิดข้อผิดพลาดในการโหลดระบบ</h2>' +
      '<p>' + err.message + '</p>' +
      '</div>'
    );
  }
}

/**
 * Helper to include HTML/CSS/JS partials in Apps Script templates safely
 */
function include(filename) {
  const cleanName = filename.replace(/\.html$/, '');
  try {
    return HtmlService.createHtmlOutputFromFile(cleanName).getContent();
  } catch (e1) {
    try {
      return HtmlService.createHtmlOutputFromFile(filename).getContent();
    } catch (e2) {
      Logger.log('Error including file ' + filename + ': ' + e1.message);
      return '<!-- Error loading ' + filename + ': ' + e1.message + ' -->';
    }
  }
}

/**
 * Idempotent system initialization.
 * Creates or verifies all required sheets, headers, and default settings.
 * Can be safely run multiple times.
 */
function setupSystem(optionalSpreadsheetId) {
  let ss = null;
  const scriptProp = PropertiesService.getScriptProperties();
  const existingSheetId = optionalSpreadsheetId || 
                          (CONFIG.SPREADSHEET_ID && String(CONFIG.SPREADSHEET_ID).trim() !== '' ? String(CONFIG.SPREADSHEET_ID).trim() : null) || 
                          scriptProp.getProperty('SHEET_ID');

  if (existingSheetId) {
    try {
      ss = SpreadsheetApp.openById(existingSheetId);
    } catch (e) {
      Logger.log('Could not open spreadsheet by ID: ' + e.message);
    }
  }

  if (!ss) {
    try {
      const active = SpreadsheetApp.getActiveSpreadsheet();
      if (active) ss = active;
    } catch (e) {}
  }

  // Check Google Drive for an existing "MedReady Database" spreadsheet to avoid creating duplicate files
  if (!ss) {
    try {
      const files = DriveApp.getFilesByName('MedReady Database');
      while (files.hasNext()) {
        const file = files.next();
        if (!file.isTrashed()) {
          ss = SpreadsheetApp.openById(file.getId());
          Logger.log('Reusing existing MedReady Database from Drive with ID: ' + ss.getId());
          break;
        }
      }
    } catch (e) {
      Logger.log('Could not query Drive for existing MedReady Database: ' + e.message);
    }
  }

  // Only create a new spreadsheet if none exists at all
  if (!ss) {
    ss = SpreadsheetApp.create('MedReady Database');
    Logger.log('Created new MedReady Database spreadsheet with ID: ' + ss.getId());
  }

  if (ss) {
    scriptProp.setProperty('SHEET_ID', ss.getId());
  }

  const results = [];

  // 1. Cases Sheet
  const casesHeaders = [
    'Case ID',
    'AN',
    'Room/Bed',
    'Appointment Status',
    'Ward Scope',
    'Current State',
    'submittedAt',
    'startedAt',
    'readyAt',
    'basketReceivedAt',
    'dispensedAt',
    'SLA Snapshot',
    'Created By',
    'Updated At'
  ];
  ensureSheetWithHeaders(ss, CONFIG.SHEETS.CASES, casesHeaders, results);

  // 2. Timeline Sheet
  const timelineHeaders = [
    'Log ID',
    'Case ID',
    'Event',
    'Actor',
    'Timestamp',
    'From State',
    'To State',
    'Details'
  ];
  ensureSheetWithHeaders(ss, CONFIG.SHEETS.TIMELINE, timelineHeaders, results);

  // 3. Issue Flags Sheet
  const flagsHeaders = [
    'Flag ID',
    'Case ID',
    'Flag Type',
    'Actor',
    'Timestamp',
    'Resolved',
    'Resolved At',
    'Resolved By'
  ];
  ensureSheetWithHeaders(ss, CONFIG.SHEETS.ISSUE_FLAGS, flagsHeaders, results);

  // 4. Users / Allowlist Sheet
  const usersHeaders = [
    'Email',
    'Role',
    'Ward Scope',
    'Active',
    'Name',
    'Created At',
    'Last Login'
  ];
  const userSheet = ensureSheetWithHeaders(ss, CONFIG.SHEETS.USERS, usersHeaders, results);
  
  // Seed current user as initial SUPER_ADMIN if users sheet is empty
  if (userSheet.getLastRow() <= 1) {
    const currentEmail = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || 'admin@hospital.local';
    userSheet.appendRow([
      currentEmail.toLowerCase().trim(),
      CONFIG.ROLES.SUPER_ADMIN,
      'ALL',
      'TRUE',
      'System Admin',
      new Date().toISOString(),
      new Date().toISOString()
    ]);
    results.push('Added ' + currentEmail + ' as default SUPER_ADMIN');
  }

  // 5. Settings Sheet
  const settingsHeaders = [
    'Key',
    'Value',
    'Description',
    'Updated At',
    'Updated By'
  ];
  const settingsSheet = ensureSheetWithHeaders(ss, CONFIG.SHEETS.SETTINGS, settingsHeaders, results);
  seedDefaultSettings(settingsSheet, results);

  // 6. Notifications Sheet
  const notifHeaders = [
    'Notification ID',
    'Case ID',
    'Recipient Ward',
    'Recipient Email',
    'Title',
    'Message',
    'Timestamp',
    'Read',
    'Read At'
  ];
  ensureSheetWithHeaders(ss, CONFIG.SHEETS.NOTIFICATIONS, notifHeaders, results);

  // 7. IPD Orders Sheet (Sync from Intranet IPDDispensingDashboard)
  const ipdOrdersHeaders = [
    'ประเภท',
    'AN',
    'ชื่อ-สกุล',
    'หอผู้ป่วย',
    'เตียง',
    'วันที่',
    'เวลา',
    'ประเภทยา',
    'อัปเดตล่าสุด'
  ];
  ensureSheetWithHeaders(ss, CONFIG.SHEETS.IPD_ORDERS, ipdOrdersHeaders, results);

  // Remove default "Sheet1" if it still exists
  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) {
    try {
      ss.deleteSheet(defaultSheet);
      results.push('Removed default Sheet1');
    } catch (e) {}
  }

  return {
    success: true,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    actions: results
  };
}

/**
 * Helper to ensure a sheet exists and has the expected headers
 */
function ensureSheetWithHeaders(ss, sheetName, headers, results) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    results.push('Created sheet: ' + sheetName);
  } else {
    const currentHeaders = sheet.getLastColumn() > 0 
      ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] 
      : [];
    
    if (currentHeaders.length === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
      results.push('Populated missing headers on sheet: ' + sheetName);
    }
  }
  return sheet;
}

/**
 * Seeds default system settings if not already present
 */
function seedDefaultSettings(settingsSheet, results) {
  const existingRows = settingsSheet.getLastRow() > 1 
    ? settingsSheet.getRange(2, 1, settingsSheet.getLastRow() - 1, 1).getValues() 
    : [];
  
  const existingKeys = new Set(existingRows.map(r => String(r[0]).trim()));
  const now = new Date().toISOString();
  
  const defaults = [
    { key: 'SLA_NORMAL_MAX', value: CONFIG.DEFAULT_SETTINGS.SLA_NORMAL_MAX, desc: 'เกณฑ์เวลาปกติ (นาที) ค่าเริ่มต้น 30' },
    { key: 'SLA_APPROACHING_MAX', value: CONFIG.DEFAULT_SETTINGS.SLA_APPROACHING_MAX, desc: 'เกณฑ์เวลาใกล้ SLA (นาที) ค่าเริ่มต้น 45' },
    { key: 'WARD_OPTIONS', value: CONFIG.DEFAULT_SETTINGS.WARD_OPTIONS, desc: 'รายชื่อ Ward ในระบบ (คั่นด้วยจุลภาค)' },
    { key: 'DEFAULT_WARD', value: CONFIG.DEFAULT_SETTINGS.DEFAULT_WARD, desc: 'Ward เริ่มต้นสำหรับการเปิดใช้งานระบบ' },
    { key: 'POLL_INTERVAL_SECONDS', value: CONFIG.DEFAULT_SETTINGS.POLL_INTERVAL_SECONDS, desc: 'ระยะเวลา Polling ข้อมูลหน้าเว็บ (วินาที)' }
  ];

  defaults.forEach(item => {
    if (!existingKeys.has(item.key)) {
      settingsSheet.appendRow([item.key, item.value, item.desc, now, 'SYSTEM']);
      results.push('Added setting: ' + item.key + ' = ' + item.value);
    }
  });
}

/**
 * Handles Webhook HTTP POST requests (e.g. from Python sync script)
 */
function doPost(e) {
  try {
    let payload = null;
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    }
    
    if (!payload || !payload.orders || !Array.isArray(payload.orders)) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Invalid payload: "orders" array required'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const result = apiSyncIpdOrders(payload.orders);
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
