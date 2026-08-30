/**
 * MedReady - Admin & User Access Management
 * Server-side user allowlist management, ward configuration, and audit logs.
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
 * Toggles a user's active status (Admin only)
 */
function apiToggleUserActive(email, active) {
  try {
    const admin = requireAuthorization([CONFIG.ROLES.SUPER_ADMIN]);
    if (!email) {
      return errorResponse('กรุณาระบุอีเมล', 'INVALID_INPUT');
    }

    const cleanEmail = String(email).toLowerCase().trim();
    const isActive = active === true || String(active).toUpperCase() === 'TRUE';

    // Prevent Admin from deactivating their own account
    if (admin.email.toLowerCase().trim() === cleanEmail && !isActive) {
      return errorResponse('ไม่อนุญาตให้ปิดการใช้งานบัญชีของผู้ดูแลระบบปัจจุบัน', 'SELF_DEACTIVATION_PROHIBITED');
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
          if (String(emails[i][0] || '').toLowerCase().trim() === cleanEmail) {
            rowIndex = i + 2;
            break;
          }
        }
      }

      if (rowIndex <= 0) {
        return errorResponse('ไม่พบผู้ใช้งานนี้ในระบบ', 'NOT_FOUND');
      }

      sheet.getRange(rowIndex, 4).setValue(isActive ? 'TRUE' : 'FALSE');

      logTimelineEvent({
        caseId: '-',
        event: 'USER_STATUS_TOGGLED',
        actor: admin.name + ' (' + admin.email + ')',
        details: (isActive ? 'เปิดการใช้งานบัญชี ' : 'ระงับการใช้งานบัญชี ') + cleanEmail
      });

      return successResponse({
        email: cleanEmail,
        active: isActive
      }, (isActive ? 'เปิดการใช้งาน ' : 'ระงับการใช้งาน ') + cleanEmail + ' สำเร็จ');
    });
  } catch (err) {
    return errorResponse(err.message, 'TOGGLE_USER_ERROR');
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

    // Prevent Admin from deactivating their own account
    if (admin.email.toLowerCase().trim() === email && !active) {
      return errorResponse('ไม่อนุญาตให้ปิดการใช้งานบัญชีของผู้ดูแลระบบปัจจุบัน', 'SELF_DEACTIVATION_PROHIBITED');
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

    if (admin.email.toLowerCase().trim() === cleanEmail) {
      return errorResponse('ไม่อนุญาตให้ลบบัญชีของผู้ดูแลระบบปัจจุบัน', 'SELF_DELETION_PROHIBITED');
    }

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

// =========================================================================
// WARD MANAGEMENT APIS
// =========================================================================

/**
 * Lists all configured Wards with usage statistics (Admin only)
 */
function apiListWards() {
  try {
    const settings = apiGetSettingsPublic();
    const rawWards = (settings.WARD_OPTIONS || CONFIG.DEFAULT_SETTINGS.WARD_OPTIONS)
      .split(',')
      .map(w => w.trim())
      .filter(w => w.length > 0);
    
    const defaultWard = settings.DEFAULT_WARD || CONFIG.DEFAULT_SETTINGS.DEFAULT_WARD;

    const ss = getSpreadsheet();
    
    // Count users per ward
    const userCounts = {};
    const userSheet = ss.getSheetByName(CONFIG.SHEETS.USERS);
    if (userSheet && userSheet.getLastRow() > 1) {
      const uData = userSheet.getRange(2, 3, userSheet.getLastRow() - 1, 1).getValues();
      for (let i = 0; i < uData.length; i++) {
        const w = String(uData[i][0] || '').trim();
        if (w) {
          userCounts[w] = (userCounts[w] || 0) + 1;
        }
      }
    }

    // Count active cases per ward
    const caseCounts = {};
    const caseSheet = ss.getSheetByName(CONFIG.SHEETS.CASES);
    if (caseSheet && caseSheet.getLastRow() > 1) {
      const cData = caseSheet.getRange(2, 5, caseSheet.getLastRow() - 1, 2).getValues();
      for (let i = 0; i < cData.length; i++) {
        const w = String(cData[i][0] || '').trim();
        const state = String(cData[i][1] || '').trim();
        if (w && state !== 'DISPENSED') {
          caseCounts[w] = (caseCounts[w] || 0) + 1;
        }
      }
    }

    const wards = rawWards.map(name => ({
      name: name,
      isDefault: name === defaultWard,
      userCount: userCounts[name] || 0,
      activeCaseCount: caseCounts[name] || 0
    }));

    return successResponse({
      wards: wards,
      defaultWard: defaultWard,
      totalWards: wards.length
    });
  } catch (err) {
    return errorResponse(err.message, 'LIST_WARDS_ERROR');
  }
}

/**
 * Adds a new Ward (Admin only)
 */
function apiAddWard(wardName) {
  try {
    const admin = requireAuthorization([CONFIG.ROLES.SUPER_ADMIN]);
    const cleanName = String(wardName || '').trim();

    if (!cleanName) {
      return errorResponse('กรุณาระบุชื่อ Ward / หอผู้ป่วย', 'INVALID_INPUT');
    }
    if (cleanName.includes(',')) {
      return errorResponse('ชื่อ Ward ห้ามมีเครื่องหมายจุลภาค (,)', 'INVALID_INPUT');
    }

    return withLock(function() {
      const settings = apiGetSettingsPublic();
      let rawWards = (settings.WARD_OPTIONS || CONFIG.DEFAULT_SETTINGS.WARD_OPTIONS)
        .split(',')
        .map(w => w.trim())
        .filter(w => w.length > 0);

      if (rawWards.some(w => w.toLowerCase() === cleanName.toLowerCase())) {
        return errorResponse('มี Ward ชื่อ "' + cleanName + '" ในระบบแล้ว', 'DUPLICATE_WARD');
      }

      rawWards.push(cleanName);
      const newWardOptions = rawWards.join(',');

      apiUpdateSettings({ WARD_OPTIONS: newWardOptions });

      logTimelineEvent({
        caseId: '-',
        event: 'WARD_CREATED',
        actor: admin.name + ' (' + admin.email + ')',
        details: 'เพิ่ม Ward ใหม่: ' + cleanName
      });

      return successResponse({ wardName: cleanName, wards: rawWards }, 'เพิ่ม Ward "' + cleanName + '" สำเร็จ');
    });
  } catch (err) {
    return errorResponse(err.message, 'ADD_WARD_ERROR');
  }
}

/**
 * Updates an existing Ward name and cascades to Users and Cases (Admin only)
 */
function apiUpdateWard(oldName, newName) {
  try {
    const admin = requireAuthorization([CONFIG.ROLES.SUPER_ADMIN]);
    const cleanOld = String(oldName || '').trim();
    const cleanNew = String(newName || '').trim();

    if (!cleanOld || !cleanNew) {
      return errorResponse('กรุณาระบุชื่อ Ward เดิมและชื่อใหม่', 'INVALID_INPUT');
    }
    if (cleanNew.includes(',')) {
      return errorResponse('ชื่อ Ward ห้ามมีเครื่องหมายจุลภาค (,)', 'INVALID_INPUT');
    }
    if (cleanOld === cleanNew) {
      return successResponse({ wardName: cleanNew }, 'ไม่มีการเปลี่ยนแปลง');
    }

    return withLock(function() {
      const settings = apiGetSettingsPublic();
      let rawWards = (settings.WARD_OPTIONS || CONFIG.DEFAULT_SETTINGS.WARD_OPTIONS)
        .split(',')
        .map(w => w.trim())
        .filter(w => w.length > 0);

      const index = rawWards.findIndex(w => w.toLowerCase() === cleanOld.toLowerCase());
      if (index === -1) {
        return errorResponse('ไม่พบ Ward เดิม "' + cleanOld + '" ในระบบ', 'NOT_FOUND');
      }

      if (rawWards.some((w, idx) => idx !== index && w.toLowerCase() === cleanNew.toLowerCase())) {
        return errorResponse('มี Ward ชื่อ "' + cleanNew + '" ในระบบแล้ว', 'DUPLICATE_WARD');
      }

      rawWards[index] = cleanNew;
      const newWardOptions = rawWards.join(',');

      const updatePayload = { WARD_OPTIONS: newWardOptions };
      if (settings.DEFAULT_WARD === cleanOld) {
        updatePayload.DEFAULT_WARD = cleanNew;
      }
      apiUpdateSettings(updatePayload);

      // Cascade update to Users sheet
      const ss = getSpreadsheet();
      const userSheet = ss.getSheetByName(CONFIG.SHEETS.USERS);
      let userUpdatedCount = 0;
      if (userSheet && userSheet.getLastRow() > 1) {
        const uRange = userSheet.getRange(2, 3, userSheet.getLastRow() - 1, 1);
        const uValues = uRange.getValues();
        for (let i = 0; i < uValues.length; i++) {
          if (String(uValues[i][0] || '').trim() === cleanOld) {
            uValues[i][0] = cleanNew;
            userUpdatedCount++;
          }
        }
        uRange.setValues(uValues);
      }

      // Cascade update to Cases sheet
      const caseSheet = ss.getSheetByName(CONFIG.SHEETS.CASES);
      let caseUpdatedCount = 0;
      if (caseSheet && caseSheet.getLastRow() > 1) {
        const cRange = caseSheet.getRange(2, 5, caseSheet.getLastRow() - 1, 1);
        const cValues = cRange.getValues();
        for (let i = 0; i < cValues.length; i++) {
          if (String(cValues[i][0] || '').trim() === cleanOld) {
            cValues[i][0] = cleanNew;
            caseUpdatedCount++;
          }
        }
        cRange.setValues(cValues);
      }

      logTimelineEvent({
        caseId: '-',
        event: 'WARD_UPDATED',
        actor: admin.name + ' (' + admin.email + ')',
        details: 'เปลี่ยนชื่อ Ward จาก ' + cleanOld + ' เป็น ' + cleanNew + ' (อัปเดตผู้ใช้ ' + userUpdatedCount + ' คน, เคส ' + caseUpdatedCount + ' เคส)'
      });

      return successResponse({
        oldName: cleanOld,
        newName: cleanNew,
        userUpdatedCount: userUpdatedCount,
        caseUpdatedCount: caseUpdatedCount
      }, 'แก้ไขชื่อ Ward เป็น "' + cleanNew + '" สำเร็จ');
    });
  } catch (err) {
    return errorResponse(err.message, 'UPDATE_WARD_ERROR');
  }
}

/**
 * Deletes a Ward from the system (Admin only)
 */
function apiDeleteWard(wardName) {
  try {
    const admin = requireAuthorization([CONFIG.ROLES.SUPER_ADMIN]);
    const cleanName = String(wardName || '').trim();

    if (!cleanName) {
      return errorResponse('กรุณาระบุชื่อ Ward ที่ต้องการลบ', 'INVALID_INPUT');
    }

    return withLock(function() {
      const settings = apiGetSettingsPublic();
      let rawWards = (settings.WARD_OPTIONS || CONFIG.DEFAULT_SETTINGS.WARD_OPTIONS)
        .split(',')
        .map(w => w.trim())
        .filter(w => w.length > 0);

      if (rawWards.length <= 1) {
        return errorResponse('ระบบต้องมี Ward อย่างน้อย 1 หอผู้ป่วย (ไม่สามารถลบทั้งหมดได้)', 'MINIMUM_WARD_REQUIRED');
      }

      const index = rawWards.findIndex(w => w.toLowerCase() === cleanName.toLowerCase());
      if (index === -1) {
        return errorResponse('ไม่พบ Ward "' + cleanName + '" ในระบบ', 'NOT_FOUND');
      }

      rawWards.splice(index, 1);
      const newWardOptions = rawWards.join(',');
      const newDefaultWard = (settings.DEFAULT_WARD === cleanName) ? rawWards[0] : (settings.DEFAULT_WARD || rawWards[0]);

      apiUpdateSettings({
        WARD_OPTIONS: newWardOptions,
        DEFAULT_WARD: newDefaultWard
      });

      // Update users who had this ward scope to the fallback default ward
      const ss = getSpreadsheet();
      const userSheet = ss.getSheetByName(CONFIG.SHEETS.USERS);
      let userMigratedCount = 0;
      if (userSheet && userSheet.getLastRow() > 1) {
        const uRange = userSheet.getRange(2, 3, userSheet.getLastRow() - 1, 1);
        const uValues = uRange.getValues();
        for (let i = 0; i < uValues.length; i++) {
          if (String(uValues[i][0] || '').trim() === cleanName) {
            uValues[i][0] = newDefaultWard;
            userMigratedCount++;
          }
        }
        uRange.setValues(uValues);
      }

      logTimelineEvent({
        caseId: '-',
        event: 'WARD_DELETED',
        actor: admin.name + ' (' + admin.email + ')',
        details: 'ลบ Ward: ' + cleanName + ' (ย้ายผู้ใช้งาน ' + userMigratedCount + ' คนไปยัง ' + newDefaultWard + ')'
      });

      return successResponse({
        deletedWard: cleanName,
        fallbackDefaultWard: newDefaultWard,
        migratedUsers: userMigratedCount,
        remainingWards: rawWards
      }, 'ลบ Ward "' + cleanName + '" สำเร็จ');
    });
  } catch (err) {
    return errorResponse(err.message, 'DELETE_WARD_ERROR');
  }
}

/**
 * Sets the default Ward in system settings (Admin only)
 */
function apiSetDefaultWard(wardName) {
  try {
    const admin = requireAuthorization([CONFIG.ROLES.SUPER_ADMIN]);
    const cleanName = String(wardName || '').trim();

    if (!cleanName) {
      return errorResponse('กรุณาระบุชื่อ Ward', 'INVALID_INPUT');
    }

    return withLock(function() {
      const settings = apiGetSettingsPublic();
      const rawWards = (settings.WARD_OPTIONS || CONFIG.DEFAULT_SETTINGS.WARD_OPTIONS)
        .split(',')
        .map(w => w.trim());

      if (!rawWards.includes(cleanName)) {
        return errorResponse('ไม่พบ Ward "' + cleanName + '" ในระบบ', 'NOT_FOUND');
      }

      apiUpdateSettings({ DEFAULT_WARD: cleanName });

      logTimelineEvent({
        caseId: '-',
        event: 'DEFAULT_WARD_CHANGED',
        actor: admin.name + ' (' + admin.email + ')',
        details: 'เปลี่ยน Ward เริ่มต้นเป็น: ' + cleanName
      });

      return successResponse({ defaultWard: cleanName }, 'กำหนด "' + cleanName + '" เป็น Ward เริ่มต้นสำเร็จ');
    });
  } catch (err) {
    return errorResponse(err.message, 'SET_DEFAULT_WARD_ERROR');
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
