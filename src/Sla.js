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

    const lastRow = sheet.getLastRow();
    const rawData = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    const displayData = sheet.getRange(2, 1, lastRow - 1, 2).getDisplayValues();

    for (let i = 0; i < rawData.length; i++) {
      const key = String(displayData[i][0] || rawData[i][0] || '').trim();
      if (!key) continue;

      let val = '';
      if (rawData[i][1] instanceof Date) {
        if (key === 'BREAK_TIME_START' || key === 'BREAK_TIME_END') {
          val = Utilities.formatDate(rawData[i][1], CONFIG.TIMEZONE, 'HH:mm');
        } else {
          val = Utilities.formatDate(rawData[i][1], CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
        }
      } else {
        val = String(displayData[i][1] !== undefined && displayData[i][1] !== null ? displayData[i][1] : rawData[i][1] || '').trim();
      }

      // If it's a break time and has date string, extract HH:mm
      if (key === 'BREAK_TIME_START' || key === 'BREAK_TIME_END') {
        const timeMatch = val.match(/(\d{1,2}):(\d{2})/);
        if (timeMatch) {
          val = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
        }
      }

      settings[key] = val;
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
        let cleanVal = String(v).trim();

        // Format break times as HH:mm
        if (cleanKey === 'BREAK_TIME_START' || cleanKey === 'BREAK_TIME_END') {
          const m = cleanVal.match(/(\d{1,2}):(\d{2})/);
          if (m) {
            cleanVal = `${m[1].padStart(2, '0')}:${m[2]}`;
          }
        }
        
        if (existingKeys[cleanKey]) {
          const row = existingKeys[cleanKey];
          const valCell = sheet.getRange(row, 2);
          valCell.setNumberFormat('@'); // Plain text format
          valCell.setValue(cleanVal);
          sheet.getRange(row, 4).setValue(now);
          sheet.getRange(row, 5).setValue(user.email);
        } else {
          sheet.appendRow([cleanKey, cleanVal, '', now, user.email]);
          const newRow = sheet.getLastRow();
          sheet.getRange(newRow, 2).setNumberFormat('@');
        }
        updatedKeys.push(cleanKey);
      }

      return successResponse({ updated: updatedKeys }, 'บันทึกการตั้งค่าสำเร็จ');
    });
  } catch (err) {
    return errorResponse(err.message, 'UPDATE_SETTINGS_ERROR');
  }
}

