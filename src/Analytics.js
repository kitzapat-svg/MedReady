/**
 * MedReady - Analytics & Operational Metrics Engine
 * Calculates True Patient Waiting Time, Preparation Lead Time, SLA compliance,
 * Daily Summaries, and Long-term Historical Archiving for Academic Research (R2R / QI).
 */

/**
 * Calculates aggregated KPIs and performance metrics
 * @param {Object} options - Optional filters: { date: 'YYYY-MM-DD', startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD', ward: 'ALL' }
 */
function apiGetAnalytics(options) {
  try {
    const user = requireAuthorization([CONFIG.ROLES.PHARMACY, CONFIG.ROLES.SUPER_ADMIN]);
    const ss = getSpreadsheet();
    const casesSheet = ss.getSheetByName(CONFIG.SHEETS.CASES);
    
    const settings = apiGetSettingsPublic();
    const normalMax = parseInt(settings.SLA_NORMAL_MAX || '30', 10);
    const approachingMax = parseInt(settings.SLA_APPROACHING_MAX || '45', 10);
    const breakConfig = {
      enabled: settings.BREAK_TIME_ENABLED !== 'false',
      start: settings.BREAK_TIME_START || '12:00',
      end: settings.BREAK_TIME_END || '13:00'
    };

    const emptyMetrics = {
      totalCases: 0,
      activeCases: 0,
      completedCases: 0,
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
      waitingTimeBuckets: {
        under15: 0,
        under30: 0,
        under45: 0,
        over45: 0
      },
      filterDate: (options && options.date) || ''
    };

    if (!casesSheet || casesSheet.getLastRow() <= 1) {
      return successResponse(emptyMetrics);
    }

    const data = casesSheet.getRange(2, 1, casesSheet.getLastRow() - 1, 14).getValues();

    const targetDate = options && options.date ? String(options.date).trim() : '';
    const startDate = options && options.startDate ? String(options.startDate).trim() : '';
    const endDate = options && options.endDate ? String(options.endDate).trim() : '';
    const wardFilter = options && options.ward && options.ward !== 'ALL' ? String(options.ward).trim() : '';

    let totalCases = 0;
    let activeCases = 0;
    let completedCases = 0;
    let totalPrepLeadMins = 0;
    let prepLeadCount = 0;
    let totalActivePrepMins = 0;
    let activePrepCount = 0;
    let totalPatientWaitMins = 0;
    let patientWaitCount = 0;

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
    const hourlyBreakdown = {};
    const waitingTimeBuckets = {
      under15: 0,
      under30: 0,
      under45: 0,
      over45: 0
    };

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

      totalCases++;

      // Stage count
      if (stageCounts[currentState] !== undefined) {
        stageCounts[currentState]++;
      }

      // Ward count
      wardBreakdown[wardScope] = (wardBreakdown[wardScope] || 0) + 1;

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
        const patientWait = getDurationMinutes(basketReceivedAt, dispensedAt, breakConfig);
        totalPatientWaitMins += patientWait;
        patientWaitCount++;

        // Bucket distribution for academic analysis
        if (patientWait <= 15) waitingTimeBuckets.under15++;
        else if (patientWait <= 30) waitingTimeBuckets.under30++;
        else if (patientWait <= 45) waitingTimeBuckets.under45++;
        else waitingTimeBuckets.over45++;
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

    const avgPrepLead = prepLeadCount > 0 ? Math.round(totalPrepLeadMins / prepLeadCount) : 0;
    const avgActivePrep = activePrepCount > 0 ? Math.round(totalActivePrepMins / activePrepCount) : 0;
    const avgPatientWait = patientWaitCount > 0 ? Math.round(totalPatientWaitMins / patientWaitCount) : 0;
    const slaBreachRate = totalCases > 0 ? Math.round((slaBreachedCount / totalCases) * 100) : 0;
    const slaComplianceRate = totalCases > 0 ? Math.round((slaNormalCount / totalCases) * 100) : 100;

    return successResponse({
      totalCases: totalCases,
      activeCases: activeCases,
      completedCases: completedCases,
      avgPrepLeadMinutes: avgPrepLead,
      avgPrepLeadText: formatDurationThai(avgPrepLead),
      avgActivePrepMinutes: avgActivePrep,
      avgActivePrepText: formatDurationThai(avgActivePrep),
      avgPatientWaitingMinutes: avgPatientWait,
      avgPatientWaitingText: formatDurationThai(avgPatientWait),
      slaBreachRate: slaBreachRate,
      slaComplianceRate: slaComplianceRate,
      slaNormalCount: slaNormalCount,
      slaApproachingCount: slaApproachingCount,
      slaBreachedCount: slaBreachedCount,
      stageCounts: stageCounts,
      wardBreakdown: wardBreakdown,
      hourlyBreakdown: hourlyBreakdown,
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
    const sheet = ss.getSheetByName(CONFIG.SHEETS.DAILY_SUMMARIES);

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
 * End-of-Day Archiving & Aggregation Engine
 * Calculates metrics for targetDate, writes to Daily_Summaries, and moves old completed records to archive.
 */
function apiRunDailyArchiving(targetDateStr) {
  return withLock(function() {
    try {
      const user = requireAuthorization([CONFIG.ROLES.PHARMACY, CONFIG.ROLES.SUPER_ADMIN]);
      const dateToProcess = targetDateStr || getTodayBangkokDateString();
      const ss = getSpreadsheet();
      
      const casesSheet = ss.getSheetByName(CONFIG.SHEETS.CASES);
      const timelineSheet = ss.getSheetByName(CONFIG.SHEETS.TIMELINE);
      const summarySheet = ss.getSheetByName(CONFIG.SHEETS.DAILY_SUMMARIES);
      const casesArchiveSheet = ss.getSheetByName(CONFIG.SHEETS.CASES_ARCHIVE);
      const timelineArchiveSheet = ss.getSheetByName(CONFIG.SHEETS.TIMELINE_ARCHIVE);

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

      // 3. Selective Archiving of old completed cases (> 7 days old) to keep active Cases sheet lean
      let archivedCount = 0;
      if (casesArchiveSheet && casesSheet.getLastRow() > 1) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 7);
        const cutoffStr = formatDateBangkok(cutoffDate);

        const data = casesSheet.getRange(2, 1, casesSheet.getLastRow() - 1, 14).getValues();
        const rowsToKeep = [];
        const rowsToArchive = [];
        const archivedCaseIds = new Set();

        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          const caseId = String(row[0] || '').trim();
          const state = String(row[5] || '').trim();
          const submittedAt = row[6] ? toIsoString(row[6]) : '';
          const caseDate = submittedAt ? formatDateBangkok(submittedAt) : '';

          if (state === CONFIG.STATES.DISPENSED.key && caseDate && caseDate < cutoffStr) {
            const archiveRow = row.concat([new Date().toISOString()]);
            rowsToArchive.push(archiveRow);
            archivedCaseIds.add(caseId);
          } else {
            rowsToKeep.push(row);
          }
        }

        if (rowsToArchive.length > 0) {
          // Append to Cases_Archive
          casesArchiveSheet.getRange(casesArchiveSheet.getLastRow() + 1, 1, rowsToArchive.length, rowsToArchive[0].length).setValues(rowsToArchive);

          // Clear Cases sheet and rewrite only rows to keep
          casesSheet.getRange(2, 1, casesSheet.getLastRow() - 1, 14).clearContent();
          if (rowsToKeep.length > 0) {
            casesSheet.getRange(2, 1, rowsToKeep.length, rowsToKeep[0].length).setValues(rowsToKeep);
          }
          archivedCount = rowsToArchive.length;

          // Also archive corresponding timeline logs
          if (timelineSheet && timelineArchiveSheet && timelineSheet.getLastRow() > 1) {
            const tData = timelineSheet.getRange(2, 1, timelineSheet.getLastRow() - 1, 8).getValues();
            const tKeep = [];
            const tArchive = [];
            for (let j = 0; j < tData.length; j++) {
              const tRow = tData[j];
              const tCaseId = String(tRow[1] || '').trim();
              if (archivedCaseIds.has(tCaseId)) {
                tArchive.push(tRow.concat([new Date().toISOString()]));
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
      }

      return successResponse({
        date: dateToProcess,
        metrics: metrics,
        archivedOldCasesCount: archivedCount
      }, `บันทึกสรุปข้อมูลประจำวัน ${dateToProcess} และจัดเก็บคลังประวัติเรียบร้อยแล้ว (${archivedCount} เคสเก่าถูกย้ายไป Archive)`);
    } catch (err) {
      return errorResponse(err.message, 'RUN_ARCHIVE_ERROR');
    }
  }, 45);
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

    const targetDate = options && options.date ? String(options.date).trim() : '';
    const startDate = options && options.startDate ? String(options.startDate).trim() : '';
    const endDate = options && options.endDate ? String(options.endDate).trim() : '';

    let combinedRows = [];

    if (casesSheet && casesSheet.getLastRow() > 1) {
      const data = casesSheet.getRange(2, 1, casesSheet.getLastRow() - 1, 14).getValues();
      combinedRows = combinedRows.concat(data);
    }
    if (archiveSheet && archiveSheet.getLastRow() > 1) {
      const aData = archiveSheet.getRange(2, 1, archiveSheet.getLastRow() - 1, 14).getValues();
      combinedRows = combinedRows.concat(aData);
    }

    const csvHeaders = [
      'Case ID',
      'AN (Masked)',
      'Ward/หอผู้ป่วย',
      'Room/Bed',
      'Appointment Status',
      'Current State',
      'Submitted Date',
      'Submitted Time',
      'Started Time',
      'Ready Time',
      'Basket Received Time',
      'Dispensed Time',
      'Preparation Lead Time (Mins)',
      'Active Prep Time (Mins)',
      'True Patient Waiting Time (Mins)',
      'Total Turnaround Time (Mins)',
      'SLA Status',
      'SLA Compliant (<=45 min)'
    ];

    const csvData = [csvHeaders];

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

      const caseDate = submittedAt ? formatDateBangkok(submittedAt) : '';
      if (targetDate && caseDate !== targetDate) continue;
      if (startDate && caseDate < startDate) continue;
      if (endDate && caseDate > endDate) continue;

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
      if (dispensedAt && basketReceivedAt) {
        patientWaitMins = getDurationMinutes(basketReceivedAt, dispensedAt, breakConfig);
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

      csvData.push([
        caseId,
        maskAN(rawAN),
        ward,
        room,
        appt,
        state,
        caseDate,
        formatThaiTime(submittedAt),
        formatThaiTime(startedAt),
        formatThaiTime(readyAt),
        formatThaiTime(basketReceivedAt),
        formatThaiTime(dispensedAt),
        prepLeadMins,
        activePrepMins,
        patientWaitMins,
        totalTurnaroundMins,
        slaStatus,
        slaCompliant
      ]);
    }

    // Format to CSV string
    const csvString = csvData.map(row => {
      return row.map(cell => {
        let cellStr = String(cell == null ? '' : cell).replace(/"/g, '""');
        if (cellStr.search(/("|,|\n)/g) >= 0) {
          cellStr = `"${cellStr}"`;
        }
        return cellStr;
      }).join(',');
    }).join('\r\n');

    return successResponse({
      csvContent: '\uFEFF' + csvString, // UTF-8 BOM
      rowCount: csvData.length - 1,
      filename: `MedReady_Academic_Report_${targetDate || (startDate + '_to_' + endDate) || 'All'}.csv`
    });
  } catch (err) {
    return errorResponse(err.message, 'EXPORT_ACADEMIC_DATA_ERROR');
  }
}

