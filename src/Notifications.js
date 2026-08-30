/**
 * MedReady - Notification Engine
 * Creates and delivers in-app notifications when cases transition to READY.
 */

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
      '',              // Recipient Email (empty means all users in ward)
      title,
      message,
      now,
      'FALSE',         // Read
      ''               // Read At
    ]);
  } catch (e) {
    Logger.log('Error creating notification: ' + e.message);
  }
}

/**
 * Lists notifications for the current user (filtered by ward scope)
 */
function apiListNotifications() {
  try {
    const user = requireAuthorization();
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
      const title = String(r[4] || '');
      const message = String(r[5] || '');
      const timestamp = r[6] ? toIsoString(r[6]) : '';
      const isRead = String(r[7]).toUpperCase() === 'TRUE';

      // Role and ward scoping
      if (user.role === CONFIG.ROLES.WARD && user.wardScope !== 'ALL') {
        if (wardScope !== user.wardScope) {
          continue;
        }
      }

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
 * Marks notifications as read
 */
function apiMarkNotificationsAsRead(notificationIds) {
  try {
    const user = requireAuthorization();
    if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
      return successResponse(null);
    }

    return withLock(function() {
      const ss = getSpreadsheet();
      const sheet = ss.getSheetByName(CONFIG.SHEETS.NOTIFICATIONS);
      if (!sheet || sheet.getLastRow() <= 1) return successResponse(null);

      const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
      const idSet = new Set(notificationIds);
      const now = new Date().toISOString();

      for (let i = 0; i < data.length; i++) {
        const id = String(data[i][0] || '').trim();
        if (idSet.has(id)) {
          sheet.getRange(i + 2, 8).setValue('TRUE');
          sheet.getRange(i + 2, 9).setValue(now);
        }
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
    return withLock(function() {
      const ss = getSpreadsheet();
      const sheet = ss.getSheetByName(CONFIG.SHEETS.NOTIFICATIONS);
      if (!sheet || sheet.getLastRow() <= 1) {
        return successResponse(null, 'ไม่มีการแจ้งเตือน');
      }

      const lastRow = sheet.getLastRow();
      const range = sheet.getRange(2, 1, lastRow - 1, 9);
      const data = range.getValues();
      const now = new Date().toISOString();
      let updated = false;

      for (let i = 0; i < data.length; i++) {
        const r = data[i];
        const notifId = String(r[0] || '').trim();
        if (!notifId) continue;

        const wardScope = String(r[2] || '');
        const isRead = String(r[7]).toUpperCase() === 'TRUE';

        if (isRead) continue;

        // Role and ward scoping
        if (user.role === CONFIG.ROLES.WARD && user.wardScope !== 'ALL') {
          if (wardScope !== user.wardScope) {
            continue;
          }
        }

        // Update in-memory data
        data[i][7] = 'TRUE';
        data[i][8] = now;
        updated = true;
      }

      if (updated) {
        // Write the columns 8 and 9 (Read, Read At) back to the sheet
        const writeRange = sheet.getRange(2, 8, lastRow - 1, 2);
        const writeValues = data.map(r => [r[7], r[8]]);
        writeRange.setValues(writeValues);
      }

      return successResponse(null, 'อ่านการแจ้งเตือนทั้งหมดสำเร็จ');
    });
  } catch (err) {
    return errorResponse(err.message, 'MARK_ALL_READ_ERROR');
  }
}

/**
 * Deletes all notifications for the current user (based on ward scope)
 */
function apiDeleteAllNotifications() {
  try {
    const user = requireAuthorization();
    return withLock(function() {
      const ss = getSpreadsheet();
      const sheet = ss.getSheetByName(CONFIG.SHEETS.NOTIFICATIONS);
      if (!sheet || sheet.getLastRow() <= 1) {
        return successResponse(null, 'ไม่มีการแจ้งเตือน');
      }

      const lastRow = sheet.getLastRow();
      const range = sheet.getRange(2, 1, lastRow - 1, 9);
      const data = range.getValues();
      const remainingRows = [];
      let deletedCount = 0;

      for (let i = 0; i < data.length; i++) {
        const r = data[i];
        const notifId = String(r[0] || '').trim();
        if (!notifId) {
          remainingRows.push(r);
          continue;
        }

        const wardScope = String(r[2] || '');

        // Check if this row should be deleted
        let shouldDelete = true;
        if (user.role === CONFIG.ROLES.WARD && user.wardScope !== 'ALL') {
          if (wardScope !== user.wardScope) {
            shouldDelete = false; // keep it, it's not the user's ward scope
          }
        }

        if (shouldDelete) {
          deletedCount++;
        } else {
          remainingRows.push(r);
        }
      }

      if (deletedCount > 0) {
        // Clear the existing data rows
        sheet.getRange(2, 1, lastRow - 1, 9).clearContent();
        
        // Write remaining rows back
        if (remainingRows.length > 0) {
          sheet.getRange(2, 1, remainingRows.length, 9).setValues(remainingRows);
        }
      }

      return successResponse(null, 'ลบการแจ้งเตือนทั้งหมดสำเร็จ');
    });
  } catch (err) {
    return errorResponse(err.message, 'DELETE_ALL_NOTIFICATIONS_ERROR');
  }
}

