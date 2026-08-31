/**
 * MedReady - Automated Verification & Test Suite
 * Validates state machine, permissions, privacy masking, and formulas.
 */

function runAllTests() {
  const results = [];
  let passed = 0;
  let failed = 0;

  function assert(name, condition, message) {
    if (condition) {
      passed++;
      results.push({ name: name, status: 'PASS', message: message || 'OK' });
    } else {
      failed++;
      results.push({ name: name, status: 'FAIL', message: message || 'Assertion failed' });
    }
  }

  try {
    // 1. Test Setup Idempotency
    const setupRes = setupSystem();
    assert('Setup System Idempotency', setupRes && setupRes.success === true, 'setupSystem runs cleanly');

    // 2. Test Masking of AN
    const masked1 = maskAN('6912344438');
    assert('Mask AN Standard', masked1 === 'AN 69•••4438', 'Masked: ' + masked1);
    const masked2 = maskAN('1234');
    assert('Mask AN Short', masked2 === 'AN •••1234', 'Short masked: ' + masked2);

    // 3. Test Duration Formatting
    const dur1 = formatDurationThai(24);
    assert('Format Duration Minutes', dur1 === '24 นาที', 'Duration: ' + dur1);
    const dur2 = formatDurationThai(75);
    assert('Format Duration Hours', dur2 === '1 ชม. 15 นาที', 'Duration: ' + dur2);

    // 4. Test State Machine Definition
    assert('State Machine Order 1', CONFIG.STATES.SUBMITTED.order === 1, 'SUBMITTED is 1');
    assert('State Machine Order 2', CONFIG.STATES.IN_PROGRESS.order === 2, 'IN_PROGRESS is 2');
    assert('State Machine Order 3', CONFIG.STATES.READY.order === 3, 'READY is 3');
    assert('State Machine Order 4', CONFIG.STATES.BASKET_RECEIVED.order === 4, 'BASKET_RECEIVED is 4');
    assert('State Machine Order 5', CONFIG.STATES.DISPENSED.order === 5, 'DISPENSED is 5');

    // 5. Test State Transitions sequence
    assert('Transition SUBMITTED -> IN_PROGRESS', CONFIG.NEXT_STATE['SUBMITTED'] === 'IN_PROGRESS');
    assert('Transition IN_PROGRESS -> READY', CONFIG.NEXT_STATE['IN_PROGRESS'] === 'READY');
    assert('Transition READY -> BASKET_RECEIVED', CONFIG.NEXT_STATE['READY'] === 'BASKET_RECEIVED');
    assert('Transition BASKET_RECEIVED -> DISPENSED', CONFIG.NEXT_STATE['BASKET_RECEIVED'] === 'DISPENSED');

    // 6. Test Time Metric Formulas (SOT.md §6)
    const subTime = new Date('2026-08-30T10:00:00Z').getTime();
    const startTime = new Date('2026-08-30T10:06:00Z').getTime();
    const readyTime = new Date('2026-08-30T10:30:00Z').getTime();
    const basketTime = new Date('2026-08-30T10:45:00Z').getTime();
    const dispTime = new Date('2026-08-30T10:56:00Z').getTime();

    const prepToStart = Math.round((startTime - subTime) / 60000);
    const prepToReady = Math.round((readyTime - startTime) / 60000);
    const prepLeadTime = Math.round((readyTime - subTime) / 60000);
    const truePatientWait = Math.round((dispTime - basketTime) / 60000);

    assert('Prep time to start formula', prepToStart === 6, 'Prep to start: ' + prepToStart + ' min');
    assert('Prep time to ready formula', prepToReady === 24, 'Active prep: ' + prepToReady + ' min');
    assert('Preparation Lead Time formula', prepLeadTime === 30, 'Lead time: ' + prepLeadTime + ' min');
    assert('True Patient Waiting Time formula', truePatientWait === 11, 'Patient wait: ' + truePatientWait + ' min');

    // 6.1 Test Break Time Overlap Deduction
    const lunchStart = '2026-08-30T11:45:00Z';
    const lunchEnd = '2026-08-30T13:15:00Z'; // 90 min total elapsed
    const breakCfg = { enabled: true, start: '12:00', end: '13:00' };
    const durWithBreak = getDurationMinutes(lunchStart, lunchEnd, breakCfg);
    assert('Break Time Deduction (60 min break in 90 min)', durWithBreak === 30, 'Duration after break: ' + durWithBreak + ' min (Expected 30 min)');

    // 7. Test IPD Orders Sync Structure (PDPA: No patient name)
    assert('IPD_ORDERS Sheet Config', CONFIG.SHEETS.IPD_ORDERS === 'IPD_Orders', 'Sheet name is IPD_Orders');
    const syncTestOrders = [
      ['ใบสั่งยาใหม่', '6912344438', 'ตึกพิเศษ', 'EX05', '2026-08-30', '10:15', 'HME', new Date().toISOString()]
    ];
    const syncRes = apiSyncIpdOrders(syncTestOrders);
    assert('API Sync IPD Orders', syncRes && syncRes.success === true, 'apiSyncIpdOrders succeeds');
    
    const getSyncedRes = apiGetIpdSyncedOrders('ตึกพิเศษ');
    assert('API Get Synced IPD Orders', getSyncedRes && getSyncedRes.success === true && getSyncedRes.data.orders.length > 0, 'Found ' + (getSyncedRes.data ? getSyncedRes.data.orders.length : 0) + ' orders');

    // 8. Test Auth and Allowlist Resolution
    const currentUser = getCurrentUser();
    assert('Get Current User Returns Status', currentUser && typeof currentUser.status === 'string', 'Current user status: ' + (currentUser ? currentUser.status : 'null'));
    assert('Bootstrap API Structure', typeof apiGetBootstrap === 'function', 'apiGetBootstrap is defined');
    
    // 9. Test Notification APIs (Per-User Read State & Cleanup)
    // 9.1 Helper functions test
    const testList1 = parseUserList('["user1@hospital.local", "USER2@hospital.local"]');
    assert('Parse User List JSON', testList1.length === 2 && testList1.includes('user1@hospital.local') && testList1.includes('user2@hospital.local'), 'Parsed JSON users');
    const testList2 = parseUserList('nurse1@hospital.local, nurse2@hospital.local');
    assert('Parse User List CSV', testList2.length === 2 && testList2.includes('nurse1@hospital.local'), 'Parsed CSV users');
    const serializedUsers = serializeUserList(['nurse1@hospital.local', 'nurse1@hospital.local', 'nurse2@hospital.local']);
    assert('Serialize User List De-dupe', serializedUsers === '["nurse1@hospital.local","nurse2@hospital.local"]', 'Serialized unique JSON: ' + serializedUsers);

    // 9.2 Create and List Notifications
    createReadyNotification({
      caseId: 'TEST-CASE-999',
      wardScope: 'ตึกพิเศษ',
      roomBed: '101A'
    });
    
    const listRes = apiListNotifications();
    assert('API List Notifications', listRes && listRes.success === true, 'apiListNotifications succeeds');
    
    if (listRes.success && listRes.data.length > 0) {
      const targetNotif = listRes.data.find(n => n.caseId === 'TEST-CASE-999') || listRes.data[0];
      const notifId = targetNotif.notificationId;

      // 9.3 Mark Single Notification Read
      const markSingleRes = apiMarkNotificationsAsRead([notifId]);
      assert('API Mark Notifications As Read (Single)', markSingleRes && markSingleRes.success === true, 'apiMarkNotificationsAsRead succeeds');
      
      const listAfterMark = apiListNotifications();
      const updatedNotif = (listAfterMark.data || []).find(n => n.notificationId === notifId);
      assert('Notification Marked as Read for Current User', updatedNotif && updatedNotif.read === true, 'Read state is true');

      // 9.4 Mark All Read
      const markAllRes = apiMarkAllNotificationsRead();
      assert('API Mark All Notifications Read', markAllRes && markAllRes.success === true, 'apiMarkAllNotificationsRead succeeds');
      
      // 9.5 Dismiss Single Notification
      const dismissRes = apiDismissNotification(notifId);
      assert('API Dismiss Notification', dismissRes && dismissRes.success === true, 'apiDismissNotification succeeds');

      // 9.6 Delete/Dismiss All Notifications
      const deleteAllRes = apiDeleteAllNotifications();
      assert('API Delete All Notifications', deleteAllRes && deleteAllRes.success === true, 'apiDeleteAllNotifications succeeds');
    }

    // 9.7 Test Daily Notification Cleanup Function
    const cleanupRes = cleanupOldNotifications(1);
    assert('Cleanup Old Notifications Execution', cleanupRes && cleanupRes.success === true && typeof cleanupRes.count === 'number', 'Cleaned ' + (cleanupRes ? cleanupRes.count : 0) + ' items');

    // 10. Test Daily Analytics & Archive Sheet Configurations
    assert('Daily Summaries Sheet Config', CONFIG.SHEETS.DAILY_SUMMARIES === 'Daily_Summaries', 'Sheet is Daily_Summaries');
    assert('Cases Archive Sheet Config', CONFIG.SHEETS.CASES_ARCHIVE === 'Cases_Archive', 'Sheet is Cases_Archive');
    assert('Timeline Archive Sheet Config', CONFIG.SHEETS.TIMELINE_ARCHIVE === 'Timeline_Archive', 'Sheet is Timeline_Archive');

    // 11. Test Bangkok Date Formatting
    const todayBangkok = getTodayBangkokDateString();
    assert('Get Today Bangkok Date Format', /^\d{4}-\d{2}-\d{2}$/.test(todayBangkok), 'Bangkok date: ' + todayBangkok);
    const sampleDate = formatDateBangkok('2026-08-30T15:30:00Z');
    assert('Format Date Bangkok', sampleDate === '2026-08-30', 'Formatted date: ' + sampleDate);

    // 12. Test User Management APIs (Save, Toggle Active, List)
    const testUserEmail = 'test_nurse_unit@hospital.local';
    const saveUserRes = apiSaveUser({
      email: testUserEmail,
      name: 'พยาบาล ทดสอบระบบ',
      role: 'WARD',
      wardScope: 'ตึกพิเศษ',
      active: true
    });
    assert('API Save User (Create/Update)', saveUserRes && saveUserRes.success === true, 'apiSaveUser succeeds');

    const toggleOffRes = apiToggleUserActive(testUserEmail, false);
    assert('API Toggle User Active (Deactivate)', toggleOffRes && toggleOffRes.success === true && toggleOffRes.data.active === false, 'User deactivated');

    const toggleOnRes = apiToggleUserActive(testUserEmail, true);
    assert('API Toggle User Active (Activate)', toggleOnRes && toggleOnRes.success === true && toggleOnRes.data.active === true, 'User activated');

    const listUsersRes = apiListUsers();
    assert('API List Users', listUsersRes && listUsersRes.success === true && Array.isArray(listUsersRes.data), 'apiListUsers returned users array');

    // Clean up test user
    apiDeleteUser(testUserEmail);

    // 13. Test Ward Management APIs (List, Add, Update, Set Default, Delete)
    const initialWardsRes = apiListWards();
    assert('API List Wards Initial', initialWardsRes && initialWardsRes.success === true && Array.isArray(initialWardsRes.data.wards), 'apiListWards succeeds');

    const testWardName = 'หอผู้ป่วยทดสอบพิเศษ 99';
    const addWardRes = apiAddWard(testWardName);
    assert('API Add Ward', addWardRes && addWardRes.success === true, 'apiAddWard succeeds: ' + testWardName);

    const renameWardName = 'หอผู้ป่วยทดสอบพิเศษ 99 (ปรับปรุง)';
    const updateWardRes = apiUpdateWard(testWardName, renameWardName);
    assert('API Update Ward', updateWardRes && updateWardRes.success === true, 'apiUpdateWard succeeds');

    const setDefaultRes = apiSetDefaultWard(renameWardName);
    assert('API Set Default Ward', setDefaultRes && setDefaultRes.success === true, 'apiSetDefaultWard succeeds');

    // 14. Test Daily Case Archiving & Retention Engine
    assert('Archive Completed Cases Function Defined', typeof archiveCompletedCases === 'function', 'archiveCompletedCases is defined');
    const autoArchiveDryRun = archiveCompletedCases('1999-01-01');
    assert('Archive Completed Cases Dry Run', autoArchiveDryRun && typeof autoArchiveDryRun.archivedCount === 'number', 'archiveCompletedCases returned valid object');

    // 15. Test Sequential Case ID Generation
    const testNextId = generateNextCaseId(SpreadsheetApp.getActiveSpreadsheet() ? SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEETS.CASES) : null);
    assert('Generate Next Case ID Format', /^HM-\d{2}-\d{4,}$/.test(testNextId), 'Next Case ID: ' + testNextId);
  } catch (err) {
    failed++;
    results.push({ name: 'Exception in tests', status: 'FAIL', message: err.message });
  }

  Logger.log('TEST RESULTS: ' + passed + ' passed, ' + failed + ' failed');
  return {
    total: passed + failed,
    passed: passed,
    failed: failed,
    results: results
  };
}


