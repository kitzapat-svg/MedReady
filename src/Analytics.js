/**
 * Helper to determine shift name from ISO timestamp in Bangkok timezone
 * Morning (เช้า): 08:00 - 15:59
 * Afternoon (บ่าย): 16:00 - 23:59
 * Night (ดึก): 00:00 - 07:59
 */
function getShiftFromTimestamp(isoString) {
  if (!isoString) return 'ไม่ระบุ';
  const timeStr = formatThaiTime(isoString); // "HH:mm"
  const hour = parseInt(timeStr.split(':')[0], 10);
  if (isNaN(hour)) return 'ไม่ระบุ';
  if (hour >= 8 && hour < 16) return 'เวรเช้า (08:00 - 16:00)';
  if (hour >= 16 && hour < 24) return 'เวรบ่าย (16:00 - 24:00)';
  return 'เวรดึก (00:00 - 08:00)';
}

/**
 * Calculates aggregated KPIs and performance metrics
 * @param {Object} options - Optional filters: { date: 'YYYY-MM-DD', startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD', ward: 'ALL', shift: 'ALL', targetMinutes: 40 }
 */
function apiGetAnalytics(options) {
  try {
    const user = requireAuthorization([CONFIG.ROLES.PHARMACY, CONFIG.ROLES.SUPER_ADMIN]);
    const ss = getSpreadsheet();
    const casesSheet = ss.getSheetByName(CONFIG.SHEETS.CASES);
    
    const settings = apiGetSettingsPublic();
    const normalMax = parseInt(settings.SLA_NORMAL_MAX || '30', 10);
    const approachingMax = parseInt(settings.SLA_APPROACHING_MAX || '45', 10);
    const targetMinutes = (options && options.targetMinutes && !isNaN(Number(options.targetMinutes)) && Number(options.targetMinutes) > 0)
      ? Number(options.targetMinutes)
      : parseInt(settings.WAITING_TIME_TARGET_MINUTES || '40', 10);

    const breakConfig = {
      enabled: settings.BREAK_TIME_ENABLED !== 'false',
      start: settings.BREAK_TIME_START || '12:00',
      end: settings.BREAK_TIME_END || '13:00'
    };

    const emptyStats = calculateWaitingTimeStats([], targetMinutes);
    const emptyMetrics = {
      totalCases: 0,
      activeCases: 0,
      completedCases: 0,
      median: 0,
      p90: 0,
      withinTargetPercent: 0,
      mean: 0,
      sd: 0,
      min: 0,
      p25: 0,
      p75: 0,
      iqr: 0,
      p95: 0,
      max: 0,
      targetMinutes: targetMinutes,
      withinTargetCount: 0,
      overTargetCount: 0,
      overTargetPercent: 0,
      outlierCount: 0,
      invalidCount: 0,
      stats: emptyStats,
      avgPrepLeadMinutes: 0,
      avgPrepLeadText: '0 นาที',
      avgActivePrepMinutes: 0,
      avgActivePrepText: '0 นาที',
      avgPatientWaitingMinutes: 0,
      avgPatientWaitingText: '0 นาที',
      slaBreachRate: 0,
      slaComplianceRate: 100,
      slaNormalCount: 0,
      slaApproachingCount: 0,
      slaBreachedCount: 0,
      stageCounts: {
        SUBMITTED: 0,
        IN_PROGRESS: 0,
        READY: 0,
        BASKET_RECEIVED: 0,
        DISPENSED: 0
      },
      wardBreakdown: {},
      hourlyBreakdown: {},
      shiftBreakdown: {},
      waitingTimeBuckets: {
        under15: 0,
        under30: 0,
        under45: 0,
        over45: 0
      },
      filterDate: (options && options.date) || ''
    };

    let data = [];
    if (casesSheet && casesSheet.getLastRow() > 1) {
      data = data.concat(casesSheet.getRange(2, 1, casesSheet.getLastRow() - 1, 14).getValues());
    }
    const archiveSheet = ss.getSheetByName(CONFIG.SHEETS.CASES_ARCHIVE);
    if (archiveSheet && archiveSheet.getLastRow() > 1) {
      data = data.concat(archiveSheet.getRange(2, 1, archiveSheet.getLastRow() - 1, 14).getValues());
    }

    if (data.length === 0) {
      return successResponse(emptyMetrics);
    }

    const targetDate = options && options.date ? String(options.date).trim() : '';
    const startDate = options && options.startDate ? String(options.startDate).trim() : '';
    const endDate = options && options.endDate ? String(options.endDate).trim() : '';
    const wardFilter = options && options.ward && options.ward !== 'ALL' ? String(options.ward).trim() : '';
    const shiftFilter = options && options.shift && options.shift !== 'ALL' ? String(options.shift).trim() : '';

    let totalCases = 0;
    let activeCases = 0;
    let completedCases = 0;
    let totalPrepLeadMins = 0;
    let prepLeadCount = 0;
    let totalActivePrepMins = 0;
    let activePrepCount = 0;

    let slaNormalCount = 0;
    let slaApproachingCount = 0;
    let slaBreachedCount = 0;

    const stageCounts = {
      SUBMITTED: 0,
      IN_PROGRESS: 0,
      READY: 0,
      BASKET_RECEIVED: 0,
      DISPENSED: 0
    };

    const wardBreakdown = {};
    const wardTimesMap = {};
    const hourlyBreakdown = {};
    const shiftBreakdown = {
      'เวรเช้า (08:00 - 16:00)': { count: 0, times: [] },
      'เวรบ่าย (16:00 - 24:00)': { count: 0, times: [] },
      'เวรดึก (00:00 - 08:00)': { count: 0, times: [] }
    };
    const waitingTimeBuckets = {
      under15: 0,
      under30: 0,
      under45: 0,
      over45: 0
    };

    const patientWaitingTimes = [];
    let invalidRecordsCount = 0;

    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      const caseId = String(r[0] || '').trim();
      if (!caseId) continue;

      const wardScope = String(r[4] || 'ตึกพิเศษ').trim();
      const currentState = String(r[5] || 'SUBMITTED').trim();
      const submittedAt = r[6] ? toIsoString(r[6]) : '';
      const startedAt = r[7] ? toIsoString(r[7]) : '';
      const readyAt = r[8] ? toIsoString(r[8]) : '';
      const basketReceivedAt = r[9] ? toIsoString(r[9]) : '';
      const dispensedAt = r[10] ? toIsoString(r[10]) : '';

      // Date filtering logic
      const caseDate = submittedAt ? formatDateBangkok(submittedAt) : '';
      if (targetDate && caseDate !== targetDate) continue;
      if (startDate && caseDate < startDate) continue;
      if (endDate && caseDate > endDate) continue;
      if (wardFilter && wardScope !== wardFilter) continue;

      // Shift derivation
      const shiftName = getShiftFromTimestamp(basketReceivedAt || submittedAt);
      if (shiftFilter && shiftFilter !== 'ALL' && shiftName !== shiftFilter) continue;

      totalCases++;

      // Stage count
      if (stageCounts[currentState] !== undefined) {
        stageCounts[currentState]++;
      }

      // Ward count
      wardBreakdown[wardScope] = (wardBreakdown[wardScope] || 0) + 1;
      if (!wardTimesMap[wardScope]) wardTimesMap[wardScope] = [];

      // Shift count
      if (shiftBreakdown[shiftName]) {
        shiftBreakdown[shiftName].count++;
      }

      // Hourly breakdown based on submission time
      if (submittedAt) {
        const h = formatThaiTime(submittedAt).split(':')[0] + ':00';
        hourlyBreakdown[h] = (hourlyBreakdown[h] || 0) + 1;
      }

      if (currentState === CONFIG.STATES.DISPENSED.key) {
        completedCases++;
      } else {
        activeCases++;
      }

      // Preparation Lead Time (readyAt - submittedAt)
      if (readyAt && submittedAt) {
        const prepLead = getDurationMinutes(submittedAt, readyAt, breakConfig);
        totalPrepLeadMins += prepLead;
        prepLeadCount++;
      }

      // Active Prep Time (readyAt - startedAt)
      if (readyAt && startedAt) {
        const activePrep = getDurationMinutes(startedAt, readyAt, breakConfig);
        totalActivePrepMins += activePrep;
        activePrepCount++;
      }

      // True Patient Waiting Time (dispensedAt - basketReceivedAt)
      if (dispensedAt && basketReceivedAt) {
        const rawMins = getDurationMinutes(basketReceivedAt, dispensedAt, breakConfig);
        const recordValidation = validateWaitingRecord({
          recordId: caseId,
          dischargeDate: caseDate,
          ward: wardScope,
          startTimestamp: basketReceivedAt,
          endTimestamp: dispensedAt,
          waitingTimeMinutes: rawMins
        });

        if (recordValidation.isValid) {
          patientWaitingTimes.push(rawMins);
          wardTimesMap[wardScope].push(rawMins);
          if (shiftBreakdown[shiftName]) {
            shiftBreakdown[shiftName].times.push(rawMins);
          }

          // Bucket distribution
          if (rawMins <= 15) waitingTimeBuckets.under15++;
          else if (rawMins <= 30) waitingTimeBuckets.under30++;
          else if (rawMins <= 45) waitingTimeBuckets.under45++;
          else waitingTimeBuckets.over45++;
        } else {
          invalidRecordsCount++;
        }
      }

      // SLA classification
      const endTimestamp = dispensedAt || null;
      const elapsed = getDurationMinutes(submittedAt, endTimestamp, breakConfig);
      if (elapsed > approachingMax) {
        slaBreachedCount++;
      } else if (elapsed > normalMax) {
        slaApproachingCount++;
      } else {
        slaNormalCount++;
      }
    }

    // Standardized Statistical Engine Calculation
    const stats = calculateWaitingTimeStats(patientWaitingTimes, targetMinutes);
    stats.invalidCount += invalidRecordsCount;

    const avgPrepLead = prepLeadCount > 0 ? Math.round(totalPrepLeadMins / prepLeadCount) : 0;
    const avgActivePrep = activePrepCount > 0 ? Math.round(totalActivePrepMins / activePrepCount) : 0;
    const slaBreachRate = totalCases > 0 ? Math.round((slaBreachedCount / totalCases) * 100) : 0;
    const slaComplianceRate = totalCases > 0 ? Math.round((slaNormalCount / totalCases) * 100) : 100;

    // Shift Stats Object
    const shiftStatsResult = {};
    for (const [sKey, sObj] of Object.entries(shiftBreakdown)) {
      shiftStatsResult[sKey] = {
        count: sObj.count,
        stats: calculateWaitingTimeStats(sObj.times, targetMinutes)
      };
    }

    // Ward Stats Object
    const wardStatsResult = {};
    for (const [wKey, wCount] of Object.entries(wardBreakdown)) {
      wardStatsResult[wKey] = {
        count: wCount,
        stats: calculateWaitingTimeStats(wardTimesMap[wKey] || [], targetMinutes)
      };
    }

    return successResponse({
      totalCases: totalCases,
      activeCases: activeCases,
      completedCases: completedCases,
      // 5 Primary & Secondary KPIs
      median: stats.median,
      p90: stats.p90,
      withinTargetPercent: stats.withinTargetPercent,
      mean: stats.mean,
      cases: completedCases,
      // Detailed Statistics
      sd: stats.sd,
      min: stats.min,
      p25: stats.p25,
      p75: stats.p75,
      iqr: stats.iqr,
      p95: stats.p95,
      max: stats.max,
      targetMinutes: stats.targetMinutes,
      withinTargetCount: stats.withinTargetCount,
      overTargetCount: stats.overTargetCount,
      overTargetPercent: stats.overTargetPercent,
      outlierCount: stats.outlierCount,
      invalidCount: stats.invalidCount,
      stats: stats,
      // Backward-compatible fields
      avgPrepLeadMinutes: avgPrepLead,
      avgPrepLeadText: formatDurationThai(avgPrepLead),
      avgActivePrepMinutes: avgActivePrep,
      avgActivePrepText: formatDurationThai(avgActivePrep),
      avgPatientWaitingMinutes: stats.mean,
      avgPatientWaitingText: formatDurationThai(stats.median),
      slaBreachRate: slaBreachRate,
      slaComplianceRate: slaComplianceRate,
      slaNormalCount: slaNormalCount,
      slaApproachingCount: slaApproachingCount,
      slaBreachedCount: slaBreachedCount,
      stageCounts: stageCounts,
      wardBreakdown: wardBreakdown,
      wardStats: wardStatsResult,
      hourlyBreakdown: hourlyBreakdown,
      shiftBreakdown: shiftStatsResult,
      waitingTimeBuckets: waitingTimeBuckets,
      filterDate: targetDate || (startDate && endDate ? `${startDate} ถึง ${endDate}` : 'ทั้งหมด')
    });
  } catch (err) {
    return errorResponse(err.message, 'GET_ANALYTICS_ERROR');
  }
}

/**
 * Get Daily Summaries list from pre-aggregated Daily_Summaries sheet
 */
function apiGetDailySummaryList(limit) {
  try {
    const user = requireAuthorization([CONFIG.ROLES.PHARMACY, CONFIG.ROLES.SUPER_ADMIN]);
    const ss = getSpreadsheet();
    const autoSheets = ensureArchiveAndSummarySheets(ss);
    const sheet = autoSheets.summarySheet;

    const summaries = [];
    if (sheet && sheet.getLastRow() > 1) {
      const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 15).getValues();
      for (let i = data.length - 1; i >= 0; i--) {
        const r = data[i];
        const dateStr = r[0] ? formatDateBangkok(r[0]) : '';
        if (!dateStr) continue;

        let wardJson = {};
        let hourlyJson = {};
        try { wardJson = JSON.parse(r[12] || '{}'); } catch(e) {}
        try { hourlyJson = JSON.parse(r[13] || '{}'); } catch(e) {}

        summaries.push({
          date: dateStr,
          totalCases: Number(r[1]) || 0,
          completedCases: Number(r[2]) || 0,
          activeCases: Number(r[3]) || 0,
          avgPatientWaitingMinutes: Number(r[4]) || 0,
          avgPatientWaitingText: formatDurationThai(Number(r[4]) || 0),
          avgPrepLeadMinutes: Number(r[5]) || 0,
          avgPrepLeadText: formatDurationThai(Number(r[5]) || 0),
          avgActivePrepMinutes: Number(r[6]) || 0,
          slaNormalCount: Number(r[7]) || 0,
          slaApproachingCount: Number(r[8]) || 0,
          slaBreachedCount: Number(r[9]) || 0,
          slaBreachRate: Number(r[10]) || 0,
          slaComplianceRate: Number(r[11]) || 0,
          wardBreakdown: wardJson,
          hourlyBreakdown: hourlyJson,
          generatedAt: r[14] ? toIsoString(r[14]) : ''
        });

        if (limit && summaries.length >= limit) break;
      }
    }

    return successResponse(summaries);
  } catch (err) {
    return errorResponse(err.message, 'GET_DAILY_SUMMARY_ERROR');
  }
}

/**
 * Auto-provision archive and summary sheets if they do not exist yet
 */
function ensureArchiveAndSummarySheets(ss) {
  let summarySheet = ss.getSheetByName(CONFIG.SHEETS.DAILY_SUMMARIES);
  if (!summarySheet) {
    summarySheet = ss.insertSheet(CONFIG.SHEETS.DAILY_SUMMARIES);
    const dailySummaryHeaders = [
      'Date', 'Total Cases', 'Completed Cases', 'Active Cases',
      'Avg Patient Waiting (Mins)', 'Avg Prep Lead (Mins)', 'Avg Active Prep (Mins)',
      'SLA Normal Count', 'SLA Approaching Count', 'SLA Breached Count',
      'SLA Breach Rate (%)', 'SLA Compliance Rate (%)',
      'Ward Breakdown JSON', 'Hourly Breakdown JSON', 'Generated At'
    ];
    summarySheet.getRange(1, 1, 1, dailySummaryHeaders.length).setValues([dailySummaryHeaders]);
    try {
      summarySheet.getRange(1, 1, 1, dailySummaryHeaders.length).setFontWeight('bold').setBackground('#f0edef');
      summarySheet.setFrozenRows(1);
    } catch(e) {}
  }

  let casesArchiveSheet = ss.getSheetByName(CONFIG.SHEETS.CASES_ARCHIVE);
  if (!casesArchiveSheet) {
    casesArchiveSheet = ss.insertSheet(CONFIG.SHEETS.CASES_ARCHIVE);
    const casesArchiveHeaders = [
      'Case ID', 'AN', 'Room/Bed', 'Appointment Status', 'Ward Scope', 'Current State',
      'submittedAt', 'startedAt', 'readyAt', 'basketReceivedAt', 'dispensedAt',
      'SLA Snapshot', 'Created By', 'Updated At', 'Archived At'
    ];
    casesArchiveSheet.getRange(1, 1, 1, casesArchiveHeaders.length).setValues([casesArchiveHeaders]);
    try {
      casesArchiveSheet.getRange(1, 1, 1, casesArchiveHeaders.length).setFontWeight('bold').setBackground('#f0edef');
      casesArchiveSheet.setFrozenRows(1);
    } catch(e) {}
  }

  let timelineArchiveSheet = ss.getSheetByName(CONFIG.SHEETS.TIMELINE_ARCHIVE);
  if (!timelineArchiveSheet) {
    timelineArchiveSheet = ss.insertSheet(CONFIG.SHEETS.TIMELINE_ARCHIVE);
    const timelineArchiveHeaders = [
      'Log ID', 'Case ID', 'Event', 'Actor', 'Timestamp', 'From State', 'To State', 'Details', 'Archived At'
    ];
    timelineArchiveSheet.getRange(1, 1, 1, timelineArchiveHeaders.length).setValues([timelineArchiveHeaders]);
    try {
      timelineArchiveSheet.getRange(1, 1, 1, timelineArchiveHeaders.length).setFontWeight('bold').setBackground('#f0edef');
      timelineArchiveSheet.setFrozenRows(1);
    } catch(e) {}
  }

  return { summarySheet, casesArchiveSheet, timelineArchiveSheet };
}

/**
 * End-of-Day Archiving & Aggregation Engine
 * Calculates metrics for targetDate, writes to Daily_Summaries, and moves old completed records to archive.
 */
function apiRunDailyArchiving(targetDateStr) {
  return withLock(function() {
    try {
      const user = requireAuthorization([CONFIG.ROLES.PHARMACY, CONFIG.ROLES.SUPER_ADMIN]);
      const dateToProcess = targetDateStr || getTodayBangkokDateString();
      const ss = getSpreadsheet();
      
      // Auto-create archive & summary sheets if not present
      const autoSheets = ensureArchiveAndSummarySheets(ss);
      const summarySheet = autoSheets.summarySheet;
      const casesArchiveSheet = autoSheets.casesArchiveSheet;
      const timelineArchiveSheet = autoSheets.timelineArchiveSheet;

      const casesSheet = ss.getSheetByName(CONFIG.SHEETS.CASES);
      const timelineSheet = ss.getSheetByName(CONFIG.SHEETS.TIMELINE);

      if (!casesSheet || !summarySheet) {
        throw new Error('ไม่พบตาราง Cases หรือ Daily_Summaries ในฐานข้อมูล');
      }

      // 1. Calculate Analytics for target date
      const analyticsRes = apiGetAnalytics({ date: dateToProcess });
      if (!analyticsRes.success) throw new Error(analyticsRes.error);
      const metrics = analyticsRes.data;

      // 2. Check existing row in Daily_Summaries
      let existingRow = -1;
      if (summarySheet.getLastRow() > 1) {
        const dateCol = summarySheet.getRange(2, 1, summarySheet.getLastRow() - 1, 1).getValues();
        for (let i = 0; i < dateCol.length; i++) {
          if (formatDateBangkok(dateCol[i][0]) === dateToProcess) {
            existingRow = i + 2;
            break;
          }
        }
      }

      const summaryRow = [
        dateToProcess,
        metrics.totalCases,
        metrics.completedCases,
        metrics.activeCases,
        metrics.avgPatientWaitingMinutes,
        metrics.avgPrepLeadMinutes,
        metrics.avgActivePrepMinutes,
        metrics.slaNormalCount,
        metrics.slaApproachingCount,
        metrics.slaBreachedCount,
        metrics.slaBreachRate,
        metrics.slaComplianceRate,
        JSON.stringify(metrics.wardBreakdown || {}),
        JSON.stringify(metrics.hourlyBreakdown || {}),
        new Date().toISOString()
      ];

      if (existingRow > 1) {
        summarySheet.getRange(existingRow, 1, 1, summaryRow.length).setValues([summaryRow]);
      } else {
        summarySheet.appendRow(summaryRow);
      }

      // 3. Clear completed cases (DISPENSED) of the target date / past days into Archive
      const archiveRes = archiveCompletedCases(dateToProcess);
      const archivedCount = archiveRes.archivedCount || 0;
      const cleanedNotifsCount = archiveRes.cleanedNotifsCount || 0;

      return successResponse({
        date: dateToProcess,
        metrics: metrics,
        archivedOldCasesCount: archivedCount,
        cleanedNotificationsCount: cleanedNotifsCount
      }, `บันทึกสรุปข้อมูลประจำวัน ${dateToProcess} และเคลียร์เคสที่จ่ายยาเสร็จแล้วเรียบร้อย (${archivedCount} เคสถูกย้ายไป Archive, ล้างแจ้งเตือน ${cleanedNotifsCount} รายการ)`);
    } catch (err) {
      return errorResponse(err.message, 'RUN_ARCHIVE_ERROR');
    }
  }, 45);
}

/**
 * Moves completed cases (DISPENSED) to Cases_Archive and Timeline_Archive,
 * removing them from active Cases & Timeline sheets to keep database lean and fast.
 * Uncompleted cases (SUBMITTED, IN_PROGRESS, READY, BASKET_RECEIVED) are PRESERVED in Cases sheet.
 * @param {string} [maxDateStr] - Optional max date (YYYY-MM-DD) to archive. If omitted, archives all DISPENSED cases.
 */
function archiveCompletedCases(maxDateStr) {
  const ss = getSpreadsheet();
  const autoSheets = ensureArchiveAndSummarySheets(ss);
  const casesArchiveSheet = autoSheets.casesArchiveSheet;
  const timelineArchiveSheet = autoSheets.timelineArchiveSheet;
  const casesSheet = ss.getSheetByName(CONFIG.SHEETS.CASES);
  const timelineSheet = ss.getSheetByName(CONFIG.SHEETS.TIMELINE);

  if (!casesSheet || casesSheet.getLastRow() <= 1) {
    return { archivedCount: 0, cleanedNotifsCount: 0 };
  }

  let archivedCount = 0;
  const data = casesSheet.getRange(2, 1, casesSheet.getLastRow() - 1, 14).getValues();
  const rowsToKeep = [];
  const rowsToArchive = [];
  const archivedCaseIds = new Set();
  const now = new Date().toISOString();

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const caseId = String(row[0] || '').trim();
    if (!caseId) continue;

    const state = String(row[5] || '').trim();
    const submittedAt = row[6] ? toIsoString(row[6]) : '';
    const dispensedAt = row[10] ? toIsoString(row[10]) : '';
    const caseDate = (dispensedAt ? formatDateBangkok(dispensedAt) : '') || (submittedAt ? formatDateBangkok(submittedAt) : '');

    // Only archive if DISPENSED (completed) and within maxDateStr if specified
    const shouldArchive = state === CONFIG.STATES.DISPENSED.key && (!maxDateStr || (caseDate && caseDate <= maxDateStr));

    if (shouldArchive) {
      const archiveRow = row.concat([now]);
      rowsToArchive.push(archiveRow);
      archivedCaseIds.add(caseId);
    } else {
      rowsToKeep.push(row);
    }
  }

  if (rowsToArchive.length > 0) {
    // 1. Append to Cases_Archive
    if (casesArchiveSheet) {
      casesArchiveSheet.getRange(casesArchiveSheet.getLastRow() + 1, 1, rowsToArchive.length, rowsToArchive[0].length).setValues(rowsToArchive);
    }

    // 2. Rewrite Cases sheet keeping only uncompleted / active rows
    casesSheet.getRange(2, 1, casesSheet.getLastRow() - 1, 14).clearContent();
    if (rowsToKeep.length > 0) {
      casesSheet.getRange(2, 1, rowsToKeep.length, rowsToKeep[0].length).setValues(rowsToKeep);
    }
    archivedCount = rowsToArchive.length;

    // 3. Move corresponding timeline events to Timeline_Archive
    if (timelineSheet && timelineArchiveSheet && timelineSheet.getLastRow() > 1) {
      const tData = timelineSheet.getRange(2, 1, timelineSheet.getLastRow() - 1, 8).getValues();
      const tKeep = [];
      const tArchive = [];
      for (let j = 0; j < tData.length; j++) {
        const tRow = tData[j];
        const tCaseId = String(tRow[1] || '').trim();
        if (archivedCaseIds.has(tCaseId)) {
          tArchive.push(tRow.concat([now]));
        } else {
          tKeep.push(tRow);
        }
      }

      if (tArchive.length > 0) {
        timelineArchiveSheet.getRange(timelineArchiveSheet.getLastRow() + 1, 1, tArchive.length, tArchive[0].length).setValues(tArchive);
        timelineSheet.getRange(2, 1, timelineSheet.getLastRow() - 1, 8).clearContent();
        if (tKeep.length > 0) {
          timelineSheet.getRange(2, 1, tKeep.length, tKeep[0].length).setValues(tKeep);
        }
      }
    }
  }

  // 4. Cleanup old notifications
  let cleanedNotifsCount = 0;
  try {
    const notifCleanRes = cleanupOldNotifications();
    if (notifCleanRes && notifCleanRes.success) {
      cleanedNotifsCount = notifCleanRes.count || 0;
    }
  } catch (ne) {
    Logger.log('Notification cleanup warning: ' + ne.message);
  }

  return { archivedCount: archivedCount, cleanedNotifsCount: cleanedNotifsCount };
}

/**
 * Export detailed case-level dataset for Academic Research (R2R / CQI)
 * Returns CSV string with UTF-8 BOM ready for Excel / SPSS import.
 */
function apiExportAcademicData(options) {
  try {
    const user = requireAuthorization([CONFIG.ROLES.PHARMACY, CONFIG.ROLES.SUPER_ADMIN]);
    const ss = getSpreadsheet();
    const casesSheet = ss.getSheetByName(CONFIG.SHEETS.CASES);
    const archiveSheet = ss.getSheetByName(CONFIG.SHEETS.CASES_ARCHIVE);

    const settings = apiGetSettingsPublic();
    const normalMax = parseInt(settings.SLA_NORMAL_MAX || '30', 10);
    const approachingMax = parseInt(settings.SLA_APPROACHING_MAX || '45', 10);
    const breakConfig = {
      enabled: settings.BREAK_TIME_ENABLED !== 'false',
      start: settings.BREAK_TIME_START || '12:00',
      end: settings.BREAK_TIME_END || '13:00'
    };

    const targetMinutes = (options && options.targetMinutes && !isNaN(Number(options.targetMinutes)))
      ? Number(options.targetMinutes)
      : parseInt(settings.WAITING_TIME_TARGET_MINUTES || '40', 10);

    const targetDate = options && options.date ? String(options.date).trim() : '';
    const startDate = options && options.startDate ? String(options.startDate).trim() : '';
    const endDate = options && options.endDate ? String(options.endDate).trim() : '';
    const wardFilter = options && options.ward && options.ward !== 'ALL' ? String(options.ward).trim() : '';

    let combinedRows = [];

    if (casesSheet && casesSheet.getLastRow() > 1) {
      const data = casesSheet.getRange(2, 1, casesSheet.getLastRow() - 1, 14).getValues();
      combinedRows = combinedRows.concat(data);
    }
    if (archiveSheet && archiveSheet.getLastRow() > 1) {
      const aData = archiveSheet.getRange(2, 1, archiveSheet.getLastRow() - 1, 14).getValues();
      combinedRows = combinedRows.concat(aData);
    }

    const rawCaseRecords = [];
    const validWaitingTimes = [];

    for (let i = 0; i < combinedRows.length; i++) {
      const r = combinedRows[i];
      const caseId = String(r[0] || '').trim();
      if (!caseId) continue;

      const rawAN = String(r[1] || '').trim();
      const room = String(r[2] || '').trim();
      const appt = String(r[3] || '').trim();
      const ward = String(r[4] || 'ตึกพิเศษ').trim();
      const state = String(r[5] || 'SUBMITTED').trim();
      const submittedAt = r[6] ? toIsoString(r[6]) : '';
      const startedAt = r[7] ? toIsoString(r[7]) : '';
      const readyAt = r[8] ? toIsoString(r[8]) : '';
      const basketReceivedAt = r[9] ? toIsoString(r[9]) : '';
      const dispensedAt = r[10] ? toIsoString(r[10]) : '';

      const caseDate = (dispensedAt ? formatDateBangkok(dispensedAt) : '') || (submittedAt ? formatDateBangkok(submittedAt) : '');
      if (targetDate && caseDate !== targetDate) continue;
      if (startDate && caseDate < startDate) continue;
      if (endDate && caseDate > endDate) continue;
      if (wardFilter && ward !== wardFilter) continue;

      // Metrics calculation
      let prepLeadMins = '';
      if (readyAt && submittedAt) {
        prepLeadMins = getDurationMinutes(submittedAt, readyAt, breakConfig);
      }

      let activePrepMins = '';
      if (readyAt && startedAt) {
        activePrepMins = getDurationMinutes(startedAt, readyAt, breakConfig);
      }

      let patientWaitMins = '';
      let isWithinTarget = '';
      let isValid = true;
      let invalidReason = '';

      if (dispensedAt && basketReceivedAt) {
        patientWaitMins = getDurationMinutes(basketReceivedAt, dispensedAt, breakConfig);
        const vRes = validateWaitingRecord({
          recordId: caseId,
          dischargeDate: caseDate,
          ward: ward,
          startTimestamp: basketReceivedAt,
          endTimestamp: dispensedAt,
          waitingTimeMinutes: patientWaitMins
        });
        isValid = vRes.isValid;
        invalidReason = vRes.invalidReason;

        if (isValid) {
          validWaitingTimes.push(patientWaitMins);
          isWithinTarget = patientWaitMins <= targetMinutes ? 'YES' : 'NO';
        }
      } else if (state === CONFIG.STATES.DISPENSED.key) {
        isValid = false;
        invalidReason = 'Missing basketReceivedAt or dispensedAt in dispensed case';
      }

      let totalTurnaroundMins = '';
      if (dispensedAt && submittedAt) {
        totalTurnaroundMins = getDurationMinutes(submittedAt, dispensedAt, breakConfig);
      }

      let slaStatus = 'ปกติ (Normal)';
      let slaCompliant = 'YES';
      const endTimestamp = dispensedAt || null;
      const elapsed = getDurationMinutes(submittedAt, endTimestamp, breakConfig);
      if (elapsed > approachingMax) {
        slaStatus = 'เกินเกณฑ์ (Breached)';
        slaCompliant = 'NO';
      } else if (elapsed > normalMax) {
        slaStatus = 'ใกล้เกินเกณฑ์ (Approaching)';
        slaCompliant = 'YES';
      }

      rawCaseRecords.push({
        caseId: caseId,
        maskedAn: maskAN(rawAN),
        ward: ward,
        room: room,
        appt: appt,
        state: state,
        caseDate: caseDate,
        submittedAt: submittedAt,
        startedAt: startedAt,
        readyAt: readyAt,
        basketReceivedAt: basketReceivedAt,
        dispensedAt: dispensedAt,
        prepLeadMins: prepLeadMins,
        activePrepMins: activePrepMins,
        patientWaitMins: patientWaitMins,
        totalTurnaroundMins: totalTurnaroundMins,
        isWithinTarget: isWithinTarget,
        isValid: isValid,
        invalidReason: invalidReason,
        slaStatus: slaStatus,
        slaCompliant: slaCompliant
      });
    }

    // Compute Overall Summary Statistics
    const stats = calculateWaitingTimeStats(validWaitingTimes, targetMinutes);
    const dateLabel = targetDate || (startDate && endDate ? `${startDate}_to_${endDate}` : 'ALL');

    // Build CSV Output
    const csvRows = [];

    // 1. SECTION: SUMMARY STATISTICS
    csvRows.push(['# --- SUMMARY STATISTICS (CQI / R2R / Operational Analytics) ---']);
    csvRows.push([
      'date',
      'ward',
      'count',
      'mean_waiting_time',
      'sd_waiting_time',
      'min_waiting_time',
      'p25_waiting_time',
      'median_waiting_time',
      'p75_waiting_time',
      'iqr_waiting_time',
      'p90_waiting_time',
      'p95_waiting_time',
      'max_waiting_time',
      'target_minutes',
      'within_target_count',
      'within_target_percent',
      'over_target_count',
      'over_target_percent'
    ]);

    csvRows.push([
      dateLabel,
      wardFilter || 'ALL',
      stats.count,
      stats.mean,
      stats.sd,
      stats.min,
      stats.p25,
      stats.median,
      stats.p75,
      stats.iqr,
      stats.p90,
      stats.p95,
      stats.max,
      stats.targetMinutes,
      stats.withinTargetCount,
      stats.withinTargetPercent + '%',
      stats.overTargetCount,
      stats.overTargetPercent + '%'
    ]);

    csvRows.push([]); // Empty line separator

    // 2. SECTION: RAW CASE-LEVEL DATA
    csvRows.push(['# --- RAW CASE-LEVEL DATA ---']);
    const caseHeaders = [
      'record_id',
      'masked_an',
      'ward',
      'room_bed',
      'appointment_status',
      'current_state',
      'discharge_date',
      'submitted_time',
      'started_time',
      'ready_time',
      'start_timestamp (basket_received)',
      'end_timestamp (dispensed)',
      'waiting_time_minutes',
      'prep_lead_minutes',
      'active_prep_minutes',
      'total_turnaround_minutes',
      'is_within_target',
      'is_outlier',
      'is_invalid',
      'invalid_reason',
      'sla_status',
      'sla_compliant'
    ];
    csvRows.push(caseHeaders);

    for (let i = 0; i < rawCaseRecords.length; i++) {
      const c = rawCaseRecords[i];
      let isOutlier = 'NO';
      if (c.patientWaitMins !== '' && typeof c.patientWaitMins === 'number' && stats.count > 0) {
        if (c.patientWaitMins < stats.iqrLowerThreshold || c.patientWaitMins > stats.iqrUpperThreshold) {
          isOutlier = 'YES';
        }
      }

      csvRows.push([
        c.caseId,
        c.maskedAn,
        c.ward,
        c.room,
        c.appt,
        c.state,
        c.caseDate,
        formatThaiTime(c.submittedAt),
        formatThaiTime(c.startedAt),
        formatThaiTime(c.readyAt),
        c.basketReceivedAt ? toIsoString(c.basketReceivedAt) : '',
        c.dispensedAt ? toIsoString(c.dispensedAt) : '',
        c.patientWaitMins !== '' ? c.patientWaitMins : '',
        c.prepLeadMins !== '' ? c.prepLeadMins : '',
        c.activePrepMins !== '' ? c.activePrepMins : '',
        c.totalTurnaroundMins !== '' ? c.totalTurnaroundMins : '',
        c.isWithinTarget,
        isOutlier,
        c.isValid ? 'NO' : 'YES',
        c.invalidReason,
        c.slaStatus,
        c.slaCompliant
      ]);
    }

    // Format to CSV string
    const csvString = csvRows.map(row => {
      return row.map(cell => {
        let cellStr = String(cell == null ? '' : cell).replace(/"/g, '""');
        if (cellStr.search(/("|,|\n|\r)/g) >= 0) {
          cellStr = `"${cellStr}"`;
        }
        return cellStr;
      }).join(',');
    }).join('\r\n');

    return successResponse({
      csvContent: '\uFEFF' + csvString, // UTF-8 BOM
      rowCount: rawCaseRecords.length,
      stats: stats,
      filename: `MedReady_Discharge_Waiting_Time_Report_${dateLabel}.csv`
    });
  } catch (err) {
    return errorResponse(err.message, 'EXPORT_ACADEMIC_DATA_ERROR');
  }
}

