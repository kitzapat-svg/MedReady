/**
 * MedReady - Admin & User Access Management
 * Server-side user allowlist management and audit logs.
 */

/**
 * Lists all users (Admin only)
 */
function apiListUsers() {
  try {
    requireAuthorization([CONFIG.ROLES.SUPER_ADMIN]);
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.USERS);
    if (!sheet || sheet.getLastRow() <= 1) return successResponse([]);

    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
    const users = [];

    for (let i = 0; i < data.length; i++) {
      const email = String(data[i][0] || '').trim();
      if (!email) continue;

      users.push({
        email: email,
        role: String(data[i][1] || '').trim(),
        wardScope: String(data[i][2] || '').trim(),
        active: String(data[i][3]).toUpperCase() === 'TRUE',
        name: String(data[i][4] || '').trim(),
        createdAt: data[i][5] ? toIsoString(data[i][5]) : '',
        lastLogin: data[i][6] ? toIsoString(data[i][6]) : ''
      });
    }

    return successResponse(users);
  } catch (err) {
    return errorResponse(err.message, 'LIST_USERS_ERROR');
  }
}

/**
 * Creates or updates a user in the allowlist (Admin only)
 */
function apiSaveUser(userData) {
  try {
    const admin = requireAuthorization([CONFIG.ROLES.SUPER_ADMIN]);
    if (!userData || !userData.email || !userData.role) {
      return errorResponse('กรุณาระบุอีเมลและบทบาท (Role)', 'INVALID_INPUT');
    }

    const email = String(userData.email).toLowerCase().trim();
    const role = String(userData.role).toUpperCase().trim();
    const wardScope = String(userData.wardScope || 'ตึกพิเศษ').trim();
    const active = userData.active !== false;
    const name = String(userData.name || email.split('@')[0]).trim();

    if (![CONFIG.ROLES.WARD, CONFIG.ROLES.PHARMACY, CONFIG.ROLES.SUPER_ADMIN].includes(role)) {
      return errorResponse('บทบาทไม่ถูกต้อง (' + role + ')', 'INVALID_ROLE');
    }

    return withLock(function() {
      const ss = getSpreadsheet();
      const sheet = ss.getSheetByName(CONFIG.SHEETS.USERS);
      if (!sheet) throw new Error('ไม่พบตาราง Users');

      const lastRow = sheet.getLastRow();
      let rowIndex = -1;

      if (lastRow > 1) {
        const emails = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        for (let i = 0; i < emails.length; i++) {
          if (String(emails[i][0] || '').toLowerCase().trim() === email) {
            rowIndex = i + 2;
            break;
          }
        }
      }

      const now = new Date().toISOString();

      if (rowIndex > 0) {
        // Update existing
        sheet.getRange(rowIndex, 2).setValue(role);
        sheet.getRange(rowIndex, 3).setValue(wardScope);
        sheet.getRange(rowIndex, 4).setValue(active ? 'TRUE' : 'FALSE');
        sheet.getRange(rowIndex, 5).setValue(name);
      } else {
        // Add new user
        sheet.appendRow([
          email,
          role,
          wardScope,
          active ? 'TRUE' : 'FALSE',
          name,
          now,
          ''
        ]);
      }

      logTimelineEvent({
        caseId: '-',
        event: 'USER_MODIFIED',
        actor: admin.name + ' (' + admin.email + ')',
        details: (rowIndex > 0 ? 'แก้ไขผู้ใช้ ' : 'เพิ่มผู้ใช้ใหม่ ') + email + ' (' + role + ', ' + wardScope + ')'
      });

      return successResponse({ email: email, role: role, active: active }, 'บันทึกข้อมูลผู้ใช้สำเร็จ');
    });
  } catch (err) {
    return errorResponse(err.message, 'SAVE_USER_ERROR');
  }
}

/**
 * Deletes a user from the allowlist (Admin only)
 */
function apiDeleteUser(email) {
  try {
    const admin = requireAuthorization([CONFIG.ROLES.SUPER_ADMIN]);
    if (!email) return errorResponse('กรุณาระบุอีเมล', 'INVALID_INPUT');
    const cleanEmail = String(email).toLowerCase().trim();

    return withLock(function() {
      const ss = getSpreadsheet();
      const sheet = ss.getSheetByName(CONFIG.SHEETS.USERS);
      if (!sheet) throw new Error('ไม่พบตาราง Users');

      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        const emails = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        for (let i = 0; i < emails.length; i++) {
          if (String(emails[i][0] || '').toLowerCase().trim() === cleanEmail) {
            sheet.deleteRow(i + 2);
            logTimelineEvent({
              caseId: '-',
              event: 'USER_DELETED',
              actor: admin.name + ' (' + admin.email + ')',
              details: 'ลบผู้ใช้ ' + cleanEmail
            });
            return successResponse({ email: cleanEmail }, 'ลบผู้ใช้สำเร็จ');
          }
        }
      }
      return errorResponse('ไม่พบผู้ใช้งานนี้ในระบบ', 'NOT_FOUND');
    });
  } catch (err) {
    return errorResponse(err.message, 'DELETE_USER_ERROR');
  }
}

/**
 * Lists all "MedReady Database" Google Sheets in Drive.
 * Useful for reviewing duplicate files.
 */
function listDuplicateDatabases() {
  const list = [];
  const currentSheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  
  try {
    const files = DriveApp.getFilesByName('MedReady Database');
    while (files.hasNext()) {
      const file = files.next();
      if (!file.isTrashed()) {
        const id = file.getId();
        let casesCount = 0;
        try {
          const ss = SpreadsheetApp.openById(id);
          const casesSheet = ss.getSheetByName(CONFIG.SHEETS.CASES);
          if (casesSheet) {
            casesCount = Math.max(0, casesSheet.getLastRow() - 1);
          }
        } catch (e) {}

        list.push({
          id: id,
          name: file.getName(),
          url: file.getUrl(),
          lastUpdated: file.getLastUpdated().toISOString(),
          casesCount: casesCount,
          isCurrentActive: id === currentSheetId
        });
      }
    }
  } catch (err) {
    Logger.log('Error listing duplicate spreadsheets: ' + err.message);
  }

  Logger.log('Found ' + list.length + ' "MedReady Database" spreadsheets in Drive.');
  Logger.log(JSON.stringify(list, null, 2));
  return list;
}

/**
 * Consolidates to a single database.
 * Sets the chosen spreadsheet as the active SHEET_ID in Script Properties.
 * Optionally moves duplicate/unused files to Trash.
 * 
 * @param {string} keepSpreadsheetId - The Sheet ID to keep as primary (optional).
 * @param {boolean} trashDuplicates - If true, moves other redundant files to Trash.
 */
function cleanupDuplicateDatabases(keepSpreadsheetId, trashDuplicates) {
  const currentProp = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  let primaryId = keepSpreadsheetId || currentProp;
  const duplicates = [];

  const files = DriveApp.getFilesByName('MedReady Database');
  const allFiles = [];

  while (files.hasNext()) {
    const file = files.next();
    if (!file.isTrashed()) {
      allFiles.push(file);
    }
  }

  if (allFiles.length === 0) {
    Logger.log('No "MedReady Database" files found.');
    return { success: false, message: 'No files found' };
  }

  // If no primaryId specified or found, pick the one with the latest update or highest case count
  if (!primaryId) {
    let maxCases = -1;
    let selectedFile = allFiles[0];

    for (let i = 0; i < allFiles.length; i++) {
      try {
        const ss = SpreadsheetApp.openById(allFiles[i].getId());
        const cs = ss.getSheetByName(CONFIG.SHEETS.CASES);
        const count = cs ? cs.getLastRow() : 0;
        if (count > maxCases) {
          maxCases = count;
          selectedFile = allFiles[i];
        }
      } catch (e) {}
    }
    primaryId = selectedFile.getId();
  }

  // Save the selected ID into Script Properties
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', primaryId);
  Logger.log('Primary MedReady Database set to ID: ' + primaryId);

  // Handle other files
  let trashedCount = 0;
  for (let i = 0; i < allFiles.length; i++) {
    const file = allFiles[i];
    const fileId = file.getId();
    if (fileId !== primaryId) {
      duplicates.push({ id: fileId, name: file.getName(), url: file.getUrl() });
      if (trashDuplicates === true) {
        file.setTrashed(true);
        trashedCount++;
        Logger.log('Trashed duplicate spreadsheet: ' + fileId);
      }
    }
  }

  // Ensure setup on the primary sheet
  setupSystem(primaryId);

  return {
    success: true,
    primarySpreadsheetId: primaryId,
    primarySpreadsheetUrl: 'https://docs.google.com/spreadsheets/d/' + primaryId + '/edit',
    totalFound: allFiles.length,
    duplicatesCount: duplicates.length,
    trashedCount: trashedCount,
    duplicates: duplicates
  };
}

/**
 * Manually bind the system to a specific Google Spreadsheet ID.
 * @param {string} spreadsheetId - The ID from the Google Sheet URL.
 */
function setPrimarySpreadsheetId(spreadsheetId) {
  if (!spreadsheetId || typeof spreadsheetId !== 'string') {
    throw new Error('Please provide a valid spreadsheet ID.');
  }
  const cleanId = spreadsheetId.trim();
  const ss = SpreadsheetApp.openById(cleanId);
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', cleanId);
  setupSystem(cleanId);
  Logger.log('Successfully bound MedReady to spreadsheet: ' + cleanId + ' (' + ss.getName() + ')');
  return {
    success: true,
    spreadsheetId: cleanId,
    spreadsheetName: ss.getName(),
    url: ss.getUrl()
  };
}

