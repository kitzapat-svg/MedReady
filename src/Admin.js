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

