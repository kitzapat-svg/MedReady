/**
 * MedReady - SLA Configuration & Calculation Engine
 * Dynamic SLA thresholds stored in Settings sheet.
 */

/**
 * Public function to retrieve system settings
 */
function apiGetSettingsPublic() {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.SETTINGS);
    const settings = { ...CONFIG.DEFAULT_SETTINGS };
    
    if (!sheet || sheet.getLastRow() <= 1) {
      return settings;
    }

    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
    for (let i = 0; i < data.length; i++) {
      const key = String(data[i][0] || '').trim();
      const val = String(data[i][1] || '').trim();
      if (key) {
        settings[key] = val;
      }
    }

    return settings;
  } catch (e) {
    return { ...CONFIG.DEFAULT_SETTINGS };
  }
}

/**
 * Updates SLA and system settings (Admin only)
 */
function apiUpdateSettings(newSettings) {
  try {
    const user = requireAuthorization([CONFIG.ROLES.SUPER_ADMIN]);
    if (!newSettings || typeof newSettings !== 'object') {
      return errorResponse('ข้อมูลการตั้งค่าไม่ถูกต้อง', 'INVALID_INPUT');
    }

    return withLock(function() {
      const ss = getSpreadsheet();
      const sheet = ss.getSheetByName(CONFIG.SHEETS.SETTINGS);
      if (!sheet) throw new Error('ไม่พบตาราง Settings');

      const lastRow = sheet.getLastRow();
      const existingKeys = {};
      
      if (lastRow > 1) {
        const keys = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        for (let i = 0; i < keys.length; i++) {
          existingKeys[String(keys[i][0]).trim()] = i + 2;
        }
      }

      const now = new Date().toISOString();
      const updatedKeys = [];

      for (const [k, v] of Object.entries(newSettings)) {
        const cleanKey = String(k).trim();
        const cleanVal = String(v).trim();
        
        if (existingKeys[cleanKey]) {
          const row = existingKeys[cleanKey];
          sheet.getRange(row, 2).setValue(cleanVal);
          sheet.getRange(row, 4).setValue(now);
          sheet.getRange(row, 5).setValue(user.email);
        } else {
          sheet.appendRow([cleanKey, cleanVal, '', now, user.email]);
        }
        updatedKeys.push(cleanKey);
      }

      return successResponse({ updated: updatedKeys }, 'บันทึกการตั้งค่าสำเร็จ');
    });
  } catch (err) {
    return errorResponse(err.message, 'UPDATE_SETTINGS_ERROR');
  }
}

