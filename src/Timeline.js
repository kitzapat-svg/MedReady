/**
 * MedReady - Timeline & Issue Flags Service
 * Implements audit logging, milestone intervals, and structured issue flags.
 */

/**
 * Appends an event to the Timeline / Audit Log
 */
function logTimelineEvent(params) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.TIMELINE);
    if (!sheet) return;

    const logId = generateUUID();
    const now = new Date().toISOString();

    sheet.appendRow([
      logId,
      params.caseId || '',
      params.event || '',
      params.actor || 'SYSTEM',
      now,
      params.fromState || '',
      params.toState || '',
      params.details || ''
    ]);
  } catch (e) {
    Logger.log('Error logging timeline event: ' + e.message);
  }
}

/**
 * Gets formatted timeline for a specific case with interval calculations
 */
function getCaseTimeline(caseId) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.TIMELINE);
  let data = [];
  if (sheet && sheet.getLastRow() > 1) {
    data = data.concat(sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues());
  }
  const archiveSheet = ss.getSheetByName(CONFIG.SHEETS.TIMELINE_ARCHIVE);
  if (archiveSheet && archiveSheet.getLastRow() > 1) {
    data = data.concat(archiveSheet.getRange(2, 1, archiveSheet.getLastRow() - 1, 8).getValues());
  }

  if (data.length === 0) return [];

  const caseEvents = [];

  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    if (String(r[1] || '').trim() === caseId) {
      const timestamp = r[4] ? toIsoString(r[4]) : '';
      caseEvents.push({
        logId: r[0],
        caseId: r[1],
        event: r[2],
        actor: r[3],
        timestamp: timestamp,
        timeThai: formatThaiTime(timestamp),
        dateTimeThai: formatThaiDateTime(timestamp),
        fromState: r[5],
        toState: r[6],
        details: r[7]
      });
    }
  }

  // Sort chronologically
  caseEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Compute interval minutes between consecutive milestones
  for (let i = 0; i < caseEvents.length; i++) {
    if (i > 0) {
      const prevTime = new Date(caseEvents[i - 1].timestamp).getTime();
      const currTime = new Date(caseEvents[i].timestamp).getTime();
      const diffMins = Math.max(0, Math.round((currTime - prevTime) / 60000));
      caseEvents[i].intervalMinutes = diffMins;
      caseEvents[i].intervalText = formatDurationThai(diffMins);
    } else {
      caseEvents[i].intervalMinutes = 0;
      caseEvents[i].intervalText = '';
    }
  }

  return caseEvents;
}

/**
 * Adds a structured issue flag to a case (Pharmacy action)
 */
function apiAddIssueFlag(params) {
  try {
    const user = requireAuthorization([CONFIG.ROLES.PHARMACY, CONFIG.ROLES.SUPER_ADMIN]);
    if (!params || !params.caseId || !params.flagType) {
      return errorResponse('กรุณาระบุ Case ID และประเภทปัญหา', 'INVALID_INPUT');
    }

    if (!CONFIG.ISSUE_FLAGS.includes(params.flagType)) {
      return errorResponse('ประเภทปัญหาไม่ถูกต้อง', 'INVALID_FLAG_TYPE');
    }

    return withLock(function() {
      const ss = getSpreadsheet();
      const sheet = ss.getSheetByName(CONFIG.SHEETS.ISSUE_FLAGS);
      const flagId = generateUUID();
      const now = new Date().toISOString();

      sheet.appendRow([
        flagId,
        String(params.caseId).trim(),
        params.flagType,
        user.name + ' (' + user.email + ')',
        now,
        'FALSE',
        '',
        ''
      ]);

      logTimelineEvent({
        caseId: params.caseId,
        event: 'ISSUE_FLAG_ADDED',
        actor: user.name + ' (' + user.email + ')',
        fromState: '',
        toState: '',
        details: 'ติดแท็กปัญหา: ' + params.flagType
      });

      return successResponse({ flagId: flagId, flagType: params.flagType }, 'บันทึกปัญหาเรียบร้อย');
    });
  } catch (err) {
    return errorResponse(err.message, 'ADD_FLAG_ERROR');
  }
}

/**
 * Resolves an issue flag
 */
function apiResolveIssueFlag(flagId) {
  try {
    const user = requireAuthorization([CONFIG.ROLES.PHARMACY, CONFIG.ROLES.SUPER_ADMIN]);
    if (!flagId) return errorResponse('ระบุ Flag ID', 'INVALID_INPUT');

    return withLock(function() {
      const ss = getSpreadsheet();
      const sheet = ss.getSheetByName(CONFIG.SHEETS.ISSUE_FLAGS);
      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) return errorResponse('ไม่พบแท็กปัญหา', 'NOT_FOUND');

      const data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
      let rowIndex = -1;
      let caseId = '';
      let flagType = '';

      for (let i = 0; i < data.length; i++) {
        if (String(data[i][0] || '').trim() === flagId) {
          rowIndex = i + 2;
          caseId = data[i][1];
          flagType = data[i][2];
          break;
        }
      }

      if (rowIndex === -1) return errorResponse('ไม่พบแท็กปัญหา ' + flagId, 'NOT_FOUND');

      const now = new Date().toISOString();
      sheet.getRange(rowIndex, 6).setValue('TRUE');
      sheet.getRange(rowIndex, 7).setValue(now);
      sheet.getRange(rowIndex, 8).setValue(user.email);

      logTimelineEvent({
        caseId: caseId,
        event: 'ISSUE_FLAG_RESOLVED',
        actor: user.name + ' (' + user.email + ')',
        fromState: '',
        toState: '',
        details: 'แก้ไขปัญหาเสร็จสิ้น: ' + flagType
      });

      return successResponse(null, 'ปลดแท็กปัญหาเรียบร้อย');
    });
  } catch (err) {
    return errorResponse(err.message, 'RESOLVE_FLAG_ERROR');
  }
}

/**
 * Gets all active issue flags for a case
 */
function getCaseIssueFlags(caseId) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.ISSUE_FLAGS);
  if (!sheet || sheet.getLastRow() <= 1) return [];

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
  const flags = [];

  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    if (String(r[1] || '').trim() === caseId) {
      flags.push({
        flagId: r[0],
        caseId: r[1],
        flagType: r[2],
        actor: r[3],
        timestamp: r[4] ? toIsoString(r[4]) : '',
        timeThai: r[4] ? formatThaiTime(r[4]) : '',
        resolved: String(r[5]).toUpperCase() === 'TRUE',
        resolvedAt: r[6] ? toIsoString(r[6]) : '',
        resolvedBy: r[7] || ''
      });
    }
  }

  return flags;
}

/**
 * Map of active issue flags indexed by caseId for fast lookup in list views
 */
function getActiveIssueFlagsMap() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.ISSUE_FLAGS);
  const map = {};
  if (!sheet || sheet.getLastRow() <= 1) return map;

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const isResolved = String(r[5]).toUpperCase() === 'TRUE';
    if (!isResolved) {
      const caseId = String(r[1] || '').trim();
      if (!map[caseId]) map[caseId] = [];
      map[caseId].push(String(r[2] || ''));
    }
  }
  return map;
}

