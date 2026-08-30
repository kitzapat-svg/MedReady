/**
 * MedReady - Test Data Seeder
 * Populates realistic sample data across all states for testing and verification.
 */

function seedTestData() {
  // 1. Ensure all sheets and properties exist first
  const setupRes = setupSystem();
  const ss = SpreadsheetApp.openById(setupRes.spreadsheetId);

  const casesSheet = ss.getSheetByName(CONFIG.SHEETS.CASES);
  const timelineSheet = ss.getSheetByName(CONFIG.SHEETS.TIMELINE);
  const flagsSheet = ss.getSheetByName(CONFIG.SHEETS.ISSUE_FLAGS);
  const usersSheet = ss.getSheetByName(CONFIG.SHEETS.USERS);
  const notifSheet = ss.getSheetByName(CONFIG.SHEETS.NOTIFICATIONS);

  const nowMs = new Date().getTime();
  const m = 60 * 1000;
  const nowIso = new Date(nowMs).toISOString();

  // Clear existing sample cases and timeline (keep headers)
  if (casesSheet.getLastRow() > 1) {
    casesSheet.getRange(2, 1, casesSheet.getLastRow() - 1, casesSheet.getLastColumn()).clearContent();
  }
  if (timelineSheet.getLastRow() > 1) {
    timelineSheet.getRange(2, 1, timelineSheet.getLastRow() - 1, timelineSheet.getLastColumn()).clearContent();
  }
  if (flagsSheet && flagsSheet.getLastRow() > 1) {
    flagsSheet.getRange(2, 1, flagsSheet.getLastRow() - 1, flagsSheet.getLastColumn()).clearContent();
  }
  if (usersSheet && usersSheet.getLastRow() > 1) {
    usersSheet.getRange(2, 1, usersSheet.getLastRow() - 1, usersSheet.getLastColumn()).clearContent();
  }
  if (notifSheet && notifSheet.getLastRow() > 1) {
    notifSheet.getRange(2, 1, notifSheet.getLastRow() - 1, notifSheet.getLastColumn()).clearContent();
  }

  // 2. Seed Users
  const curEmail = (Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || 'developer@hospital.local').toLowerCase().trim();
  usersSheet.appendRow([
    curEmail,
    CONFIG.ROLES.SUPER_ADMIN,
    'ALL',
    'TRUE',
    'System Admin (Developer)',
    nowIso,
    nowIso
  ]);

  usersSheet.appendRow([
    'ward.special@hospital.local',
    CONFIG.ROLES.WARD,
    'ตึกพิเศษ',
    'TRUE',
    'พยาบาล ประจำตึกพิเศษ',
    nowIso,
    ''
  ]);

  usersSheet.appendRow([
    'pharmacy.ipd@hospital.local',
    CONFIG.ROLES.PHARMACY,
    'ALL',
    'TRUE',
    'เภสัชกร ประจำห้องยาผู้ป่วยใน',
    nowIso,
    ''
  ]);

  // 3. Sample Cases:
  // Case 1: MR-0248 - READY (ตึกพิเศษ ห้อง 305 / เตียง 1) -> Highlight on Ward Dashboard!
  const c1_sub = new Date(nowMs - 35 * m).toISOString();
  const c1_start = new Date(nowMs - 28 * m).toISOString();
  const c1_ready = new Date(nowMs - 5 * m).toISOString();
  casesSheet.appendRow([
    'MR-0248', '6912344438', 'ห้อง 305 / เตียง 1', 'นัดหมายแล้ว', 'ตึกพิเศษ',
    CONFIG.STATES.READY.key, c1_sub, c1_start, c1_ready, '', '', 'NORMAL', 'ward.special@hospital.local', c1_ready
  ]);

  // Notification for MR-0248
  notifSheet.appendRow([
    Utilities.getUuid(),
    'MR-0248',
    'ตึกพิเศษ',
    '',
    'ยาพร้อมจ่ายแล้ว',
    'MR-0248\nห้อง 305 / เตียง 1\nส่งผู้ป่วยหรือญาติมารับยาได้',
    c1_ready,
    'FALSE',
    ''
  ]);

  // Case 2: MR-0249 - READY (ตึกพิเศษ EX04)
  const c2_sub = new Date(nowMs - 40 * m).toISOString();
  const c2_start = new Date(nowMs - 32 * m).toISOString();
  const c2_ready = new Date(nowMs - 12 * m).toISOString();
  casesSheet.appendRow([
    'MR-0249', '6899451120', 'EX04', 'ไม่มีนัด', 'ตึกพิเศษ',
    CONFIG.STATES.READY.key, c2_sub, c2_start, c2_ready, '', '', 'NORMAL', 'ward.special@hospital.local', c2_ready
  ]);

  // Case 3: MR-0250 - IN_PROGRESS (Approaching SLA)
  const c3_sub = new Date(nowMs - 33 * m).toISOString();
  const c3_start = new Date(nowMs - 20 * m).toISOString();
  casesSheet.appendRow([
    'MR-0250', '6788329911', 'EX12', 'นัดหมายแล้ว', 'ตึกพิเศษ',
    CONFIG.STATES.IN_PROGRESS.key, c3_sub, c3_start, '', '', '', 'APPROACHING', 'ward.special@hospital.local', c3_start
  ]);

  // Case 4: MR-0251 - SUBMITTED (รอห้องยา)
  const c4_sub = new Date(nowMs - 8 * m).toISOString();
  casesSheet.appendRow([
    'MR-0251', '6900145522', 'ห้อง 308 / เตียง 2', 'ไม่มีนัด', 'ตึกพิเศษ',
    CONFIG.STATES.SUBMITTED.key, c4_sub, '', '', '', '', 'NORMAL', 'ward.special@hospital.local', c4_sub
  ]);

  // Case 5: MR-0252 - BASKET_RECEIVED (รอจ่ายยา - patient waiting clock active)
  const c5_sub = new Date(nowMs - 55 * m).toISOString();
  const c5_start = new Date(nowMs - 45 * m).toISOString();
  const c5_ready = new Date(nowMs - 25 * m).toISOString();
  const c5_basket = new Date(nowMs - 6 * m).toISOString();
  casesSheet.appendRow([
    'MR-0252', '6655443322', 'EX18', 'นัดหมายแล้ว', 'ตึกพิเศษ',
    CONFIG.STATES.BASKET_RECEIVED.key, c5_sub, c5_start, c5_ready, c5_basket, '', 'BREACHED', 'ward.special@hospital.local', c5_basket
  ]);

  // Case 6: MR-0245 - DISPENSED (Completed)
  const c6_sub = new Date(nowMs - 120 * m).toISOString();
  const c6_start = new Date(nowMs - 110 * m).toISOString();
  const c6_ready = new Date(nowMs - 85 * m).toISOString();
  const c6_basket = new Date(nowMs - 40 * m).toISOString();
  const c6_disp = new Date(nowMs - 28 * m).toISOString();
  casesSheet.appendRow([
    'MR-0245', '6544332211', 'EX02', 'นัดหมายแล้ว', 'ตึกพิเศษ',
    CONFIG.STATES.DISPENSED.key, c6_sub, c6_start, c6_ready, c6_basket, c6_disp, 'NORMAL', 'ward.special@hospital.local', c6_disp
  ]);

  // 4. Seed Issue Flags
  flagsSheet.appendRow([
    Utilities.getUuid(),
    'MR-0250',
    'รอประสาน Ward',
    'pharmacy.ipd@hospital.local',
    new Date(nowMs - 15 * m).toISOString(),
    'FALSE',
    '',
    ''
  ]);

  // 5. Seed Timeline Events
  // Timeline MR-0248
  timelineSheet.appendRow([Utilities.getUuid(), 'MR-0248', 'WARD_SUBMITTED', 'พยาบาล ประจำตึกพิเศษ', c1_sub, '-', 'SUBMITTED', 'Ward ส่งข้อมูลผู้ป่วย']);
  timelineSheet.appendRow([Utilities.getUuid(), 'MR-0248', 'STATE_CHANGED_IN_PROGRESS', 'เภสัชกร ประจำห้องยา', c1_start, 'SUBMITTED', 'IN_PROGRESS', 'เริ่มดำเนินงาน']);
  timelineSheet.appendRow([Utilities.getUuid(), 'MR-0248', 'STATE_CHANGED_READY', 'เภสัชกร ประจำห้องยา', c1_ready, 'IN_PROGRESS', 'READY', 'ตรวจสอบแล้ว • พร้อมจ่าย']);

  // Timeline MR-0245
  timelineSheet.appendRow([Utilities.getUuid(), 'MR-0245', 'WARD_SUBMITTED', 'พยาบาล ประจำตึกพิเศษ', c6_sub, '-', 'SUBMITTED', 'Ward ส่งข้อมูล']);
  timelineSheet.appendRow([Utilities.getUuid(), 'MR-0245', 'STATE_CHANGED_IN_PROGRESS', 'เภสัชกร', c6_start, 'SUBMITTED', 'IN_PROGRESS', 'เริ่มดำเนินงาน']);
  timelineSheet.appendRow([Utilities.getUuid(), 'MR-0245', 'STATE_CHANGED_READY', 'เภสัชกร', c6_ready, 'IN_PROGRESS', 'READY', 'พร้อมจ่าย']);
  timelineSheet.appendRow([Utilities.getUuid(), 'MR-0245', 'STATE_CHANGED_BASKET_RECEIVED', 'เภสัชกร', c6_basket, 'READY', 'BASKET_RECEIVED', 'รับตะกร้า']);
  timelineSheet.appendRow([Utilities.getUuid(), 'MR-0245', 'STATE_CHANGED_DISPENSED', 'เภสัชกร', c6_disp, 'BASKET_RECEIVED', 'DISPENSED', 'จ่ายยาแล้ว']);

  Logger.log('✅ Seed completed! Database URL: ' + ss.getUrl());
  return {
    success: true,
    spreadsheetUrl: ss.getUrl(),
    message: 'สร้างฐานข้อมูลและข้อมูลจำลอง 6 เคสสำเร็จเรียบร้อยแล้ว'
  };
}
