/**
 * MedReady - Notification Engine
 * Creates and delivers in-app notifications when cases transition to READY.
 * Tracks per-user read/dismiss state and provides daily database cleanup.
 */

/**
 * Helper to parse a list of user emails from a cell (supports JSON array or comma-separated string)
 */
function parseUserList(val) {
  if (!val) return [];
  const str = String(val).trim();
  if (!str) return [];
  if (str.toUpperCase() === 'FALSE' || str.toUpperCase() === 'TRUE') return [];
  if (str.startsWith('[') && str.endsWith(']')) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) {
        return parsed.map(e => String(e).toLowerCase().trim()).filter(Boolean);
      }
    } catch (e) {}
  }
  return str.split(',').map(e => e.toLowerCase().trim()).filter(Boolean);
}

/**
 * Helper to serialize list of user emails as JSON
 */
function serializeUserList(list) {
  if (!Array.isArray(list)) return '[]';
  const set = new Set(list.map(e => String(e).toLowerCase().trim()).filter(Boolean));
  return JSON.stringify(Array.from(set));
}

/**
 * Creates a READY notification for the submitting ward
 */
function createReadyNotification(params) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.NOTIFICATIONS);
    if (!sheet) return;

    const notifId = generateUUID();
    const now = new Date().toISOString();
    const wardScope = params.wardScope || 'ตึกพิเศษ';
    const roomBed = params.roomBed || '-';
    const caseId = params.caseId;

    const title = 'ยาพร้อมจ่ายแล้ว';
    const message = caseId + '\n' + roomBed + '\nส่งผู้ป่วยหรือญาติมารับยาได้';

    sheet.appendRow([
      notifId,
      caseId,
      wardScope,
      params.recipientEmail || '',  // Recipient Email (empty means all users in ward)
      title,
      message,
      now,
      '[]',            // Read By (JSON array of user emails)
      '[]'             // Dismissed By (JSON array of user emails)
    ]);
  } catch (e) {
    Logger.log('Error creating notification: ' + e.message);
  }
}

/**
 * Lists notifications for the current user (filtered by ward scope and per-user dismissal)
 */
function apiListNotifications() {
  try {
    const user = requireAuthorization();
    const userEmail = (user.email || '').toLowerCase().trim();
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.NOTIFICATIONS);
    
    if (!sheet || sheet.getLastRow() <= 1) {
      return successResponse([], 'ไม่มีการแจ้งเตือน');
    }

    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
    const list = [];

    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      const notifId = String(r[0] || '').trim();
      if (!notifId) continue;

      const caseId = String(r[1] || '');
      const wardScope = String(r[2] || '');
      const recipientEmail = String(r[3] || '').toLowerCase().trim();
      const title = String(r[4] || '');
      const message = String(r[5] || '');
      const timestamp = r[6] ? toIsoString(r[6]) : '';
      const readUsers = parseUserList(r[7]);
      const dismissedUsers = parseUserList(r[8]);

      // If user has dismissed this notification, do not show it
      if (userEmail && dismissedUsers.includes(userEmail)) {
        continue;
      }

      // Recipient Email scoping (if set to a specific user)
      if (recipientEmail && userEmail && recipientEmail !== userEmail) {
        continue;
      }

      // Role and ward scoping
      if (user.role === CONFIG.ROLES.WARD && user.wardScope !== 'ALL') {
        if (wardScope !== user.wardScope) {
          continue;
        }
      }

      const isRead = userEmail ? readUsers.includes(userEmail) : false;

      list.push({
        notificationId: notifId,
        caseId: caseId,
        wardScope: wardScope,
        title: title,
        message: message,
        timestamp: timestamp,
        timeThai: formatThaiTime(timestamp),
        dateTimeThai: formatThaiDateTime(timestamp),
        read: isRead
      });
    }

    // Sort newest first
    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return successResponse(list);
  } catch (err) {
    return errorResponse(err.message, 'LIST_NOTIFICATIONS_ERROR');
  }
}

/**
 * Marks specific notifications as read for the current user
 */
function apiMarkNotificationsAsRead(notificationIds) {
  try {
    const user = requireAuthorization();
    const userEmail = (user.email || '').toLowerCase().trim();
    if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0 || !userEmail) {
      return successResponse(null);
    }

    return withLock(function() {
      const ss = getSpreadsheet();
      const sheet = ss.getSheetByName(CONFIG.SHEETS.NOTIFICATIONS);
      if (!sheet || sheet.getLastRow() <= 1) return successResponse(null);

      const lastRow = sheet.getLastRow();
      const range = sheet.getRange(2, 1, lastRow - 1, 9);
      const data = range.getValues();
      const idSet = new Set(notificationIds.map(id => String(id).trim()));
      let updated = false;

      for (let i = 0; i < data.length; i++) {
        const id = String(data[i][0] || '').trim();
        if (idSet.has(id)) {
          const readUsers = parseUserList(data[i][7]);
          if (!readUsers.includes(userEmail)) {
            readUsers.push(userEmail);
            data[i][7] = serializeUserList(readUsers);
            updated = true;
          }
        }
      }

      if (updated) {
        const writeRange = sheet.getRange(2, 8, lastRow - 1, 1);
        const writeValues = data.map(r => [r[7]]);
        writeRange.setValues(writeValues);
      }

      return successResponse(null, 'อัปเดตสถานะการอ่านสำเร็จ');
    });
  } catch (err) {
    return errorResponse(err.message, 'MARK_READ_ERROR');
  }
}

/**
 * Marks all notifications for the current user (based on ward scope) as read
 */
function apiMarkAllNotificationsRead() {
  try {
    const user = requireAuthorization();
    const userEmail = (user.email || '').toLowerCase().trim();
    if (!userEmail) return successResponse(null);

    return withLock(function() {
      const ss = getSpreadsheet();
      const sheet = ss.getSheetByName(CONFIG.SHEETS.NOTIFICATIONS);
      if (!sheet || sheet.getLastRow() <= 1) {
        return successResponse(null, 'ไม่มีการแจ้งเตือน');
      }

      const lastRow = sheet.getLastRow();
      const range = sheet.getRange(2, 1, lastRow - 1, 9);
      const data = range.getValues();
      let updated = false;

      for (let i = 0; i < data.length; i++) {
        const r = data[i];
        const notifId = String(r[0] || '').trim();
        if (!notifId) continue;

        const wardScope = String(r[2] || '');
        const recipientEmail = String(r[3] || '').toLowerCase().trim();
        const dismissedUsers = parseUserList(r[8]);

        if (dismissedUsers.includes(userEmail)) continue;
        if (recipientEmail && recipientEmail !== userEmail) continue;

        // Role and ward scoping
        if (user.role === CONFIG.ROLES.WARD && user.wardScope !== 'ALL') {
          if (wardScope !== user.wardScope) {
            continue;
          }
        }

        const readUsers = parseUserList(r[7]);
        if (!readUsers.includes(userEmail)) {
          readUsers.push(userEmail);
          data[i][7] = serializeUserList(readUsers);
          updated = true;
        }
      }

      if (updated) {
        const writeRange = sheet.getRange(2, 8, lastRow - 1, 1);
        const writeValues = data.map(r => [r[7]]);
        writeRange.setValues(writeValues);
      }

      return successResponse(null, 'อ่านการแจ้งเตือนทั้งหมดสำเร็จ');
    });
  } catch (err) {
    return errorResponse(err.message, 'MARK_ALL_READ_ERROR');
  }
}

/**
 * Dismisses/Hides all visible notifications for the current user
 * Does not delete rows from sheet so other ward staff are not affected.
 */
function apiDeleteAllNotifications() {
  try {
    const user = requireAuthorization();
    const userEmail = (user.email || '').toLowerCase().trim();
    if (!userEmail) return successResponse(null);

    return withLock(function() {
      const ss = getSpreadsheet();
      const sheet = ss.getSheetByName(CONFIG.SHEETS.NOTIFICATIONS);
      if (!sheet || sheet.getLastRow() <= 1) {
        return successResponse(null, 'ไม่มีการแจ้งเตือน');
      }

      const lastRow = sheet.getLastRow();
      const range = sheet.getRange(2, 1, lastRow - 1, 9);
      const data = range.getValues();
      let updated = false;

      for (let i = 0; i < data.length; i++) {
        const r = data[i];
        const notifId = String(r[0] || '').trim();
        if (!notifId) continue;

        const wardScope = String(r[2] || '');
        const recipientEmail = String(r[3] || '').toLowerCase().trim();

        if (recipientEmail && recipientEmail !== userEmail) continue;

        // Role and ward scoping
        if (user.role === CONFIG.ROLES.WARD && user.wardScope !== 'ALL') {
          if (wardScope !== user.wardScope) {
            continue;
          }
        }

        const dismissedUsers = parseUserList(r[8]);
        if (!dismissedUsers.includes(userEmail)) {
          dismissedUsers.push(userEmail);
          data[i][8] = serializeUserList(dismissedUsers);
          updated = true;
        }
      }

      if (updated) {
        const writeRange = sheet.getRange(2, 9, lastRow - 1, 1);
        const writeValues = data.map(r => [r[8]]);
        writeRange.setValues(writeValues);
      }

      return successResponse(null, 'ลบการแจ้งเตือนทั้งหมดเรียบร้อยแล้ว');
    });
  } catch (err) {
    return errorResponse(err.message, 'DELETE_ALL_NOTIFICATIONS_ERROR');
  }
}

/**
 * Dismisses/Hides a single notification for the current user
 */
function apiDismissNotification(notificationId) {
  try {
    const user = requireAuthorization();
    const userEmail = (user.email || '').toLowerCase().trim();
    if (!notificationId || !userEmail) return successResponse(null);

    return withLock(function() {
      const ss = getSpreadsheet();
      const sheet = ss.getSheetByName(CONFIG.SHEETS.NOTIFICATIONS);
      if (!sheet || sheet.getLastRow() <= 1) return successResponse(null);

      const lastRow = sheet.getLastRow();
      const range = sheet.getRange(2, 1, lastRow - 1, 9);
      const data = range.getValues();
      let updated = false;

      for (let i = 0; i < data.length; i++) {
        const id = String(data[i][0] || '').trim();
        if (id === String(notificationId).trim()) {
          const dismissedUsers = parseUserList(data[i][8]);
          if (!dismissedUsers.includes(userEmail)) {
            dismissedUsers.push(userEmail);
            data[i][8] = serializeUserList(dismissedUsers);
            updated = true;
          }
          break;
        }
      }

      if (updated) {
        const writeRange = sheet.getRange(2, 9, lastRow - 1, 1);
        const writeValues = data.map(r => [r[8]]);
        writeRange.setValues(writeValues);
      }

      return successResponse(null, 'ลบการแจ้งเตือนเรียบร้อยแล้ว');
    });
  } catch (err) {
    return errorResponse(err.message, 'DISMISS_NOTIFICATION_ERROR');
  }
}

/**
 * Cleans up old notifications to prevent database bloat.
 * Purges rows older than the retention period (in days) from the Notifications sheet.
 */
function cleanupOldNotifications(retentionDays) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.NOTIFICATIONS);
    if (!sheet || sheet.getLastRow() <= 1) return { success: true, count: 0 };

    let days = retentionDays;
    if (days === undefined || days === null) {
      try {
        const settings = typeof apiGetSettingsPublic === 'function' ? apiGetSettingsPublic() : {};
        days = parseInt(settings.NOTIFICATION_RETENTION_DAYS || CONFIG.DEFAULT_SETTINGS.NOTIFICATION_RETENTION_DAYS || '1', 10);
      } catch (e) {
        days = 1;
      }
      if (isNaN(days) || days < 0) days = 1;
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffTime = cutoff.getTime();

    const lastRow = sheet.getLastRow();
    const data = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
    const rowsToKeep = [];
    let deletedCount = 0;

    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      const notifId = String(r[0] || '').trim();
      if (!notifId) continue;

      const timestampStr = r[6] ? toIsoString(r[6]) : '';
      const notifTime = timestampStr ? new Date(timestampStr).getTime() : 0;

      // Keep notification if created within retention cutoff
      if (notifTime >= cutoffTime) {
        rowsToKeep.push(r);
      } else {
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      sheet.getRange(2, 1, lastRow - 1, 9).clearContent();
      if (rowsToKeep.length > 0) {
        sheet.getRange(2, 1, rowsToKeep.length, 9).setValues(rowsToKeep);
      }
    }

    Logger.log('Cleaned up ' + deletedCount + ' old notifications (retention: ' + days + ' days)');
    return { success: true, count: deletedCount };
  } catch (e) {
    Logger.log('Error cleaning up notifications: ' + e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Public API to trigger notification cleanup on demand
 */
function apiCleanupNotifications(retentionDays) {
  try {
    requireAuthorization([CONFIG.ROLES.PHARMACY, CONFIG.ROLES.SUPER_ADMIN]);
    const res = cleanupOldNotifications(retentionDays);
    if (!res.success) throw new Error(res.error);
    return successResponse(res, `ล้างการแจ้งเตือนเก่าเรียบร้อยแล้ว (${res.count} รายการถูกลบ)`);
  } catch (err) {
    return errorResponse(err.message, 'CLEANUP_NOTIFICATIONS_ERROR');
  }
}
