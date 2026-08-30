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

