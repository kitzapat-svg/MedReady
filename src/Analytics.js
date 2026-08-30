/**
 * MedReady - Analytics & Operational Metrics Engine
 * Calculates True Patient Waiting Time, Preparation Lead Time, and SLA compliance.
 */

/**
 * Calculates aggregated KPIs and performance metrics
 */
function apiGetAnalytics(timeRange) {
  try {
    const user = requireAuthorization([CONFIG.ROLES.PHARMACY, CONFIG.ROLES.SUPER_ADMIN]);
    const ss = getSpreadsheet();
    const casesSheet = ss.getSheetByName(CONFIG.SHEETS.CASES);
    
    const settings = apiGetSettingsPublic();
    const normalMax = parseInt(settings.SLA_NORMAL_MAX || '30', 10);
    const approachingMax = parseInt(settings.SLA_APPROACHING_MAX || '45', 10);

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
      wardBreakdown: {}
    };

    if (!casesSheet || casesSheet.getLastRow() <= 1) {
      return successResponse(emptyMetrics);
    }

    const data = casesSheet.getRange(2, 1, casesSheet.getLastRow() - 1, 14).getValues();

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

      totalCases++;

      // Stage count
      if (stageCounts[currentState] !== undefined) {
        stageCounts[currentState]++;
      }

      // Ward count
      wardBreakdown[wardScope] = (wardBreakdown[wardScope] || 0) + 1;

      if (currentState === CONFIG.STATES.DISPENSED.key) {
        completedCases++;
      } else {
        activeCases++;
      }

      // Preparation Lead Time (readyAt - submittedAt)
      if (readyAt && submittedAt) {
        const prepLead = getDurationMinutes(submittedAt, readyAt);
        totalPrepLeadMins += prepLead;
        prepLeadCount++;
      }

      // Active Prep Time (readyAt - startedAt)
      if (readyAt && startedAt) {
        const activePrep = getDurationMinutes(startedAt, readyAt);
        totalActivePrepMins += activePrep;
        activePrepCount++;
      }

      // True Patient Waiting Time (dispensedAt - basketReceivedAt)
      if (dispensedAt && basketReceivedAt) {
        const patientWait = getDurationMinutes(basketReceivedAt, dispensedAt);
        totalPatientWaitMins += patientWait;
        patientWaitCount++;
      }

      // SLA classification
      const endTimestamp = dispensedAt || null;
      const elapsed = getDurationMinutes(submittedAt, endTimestamp);
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
      slaNormalCount: slaNormalCount,
      slaApproachingCount: slaApproachingCount,
      slaBreachedCount: slaBreachedCount,
      stageCounts: stageCounts,
      wardBreakdown: wardBreakdown
    });
  } catch (err) {
    return errorResponse(err.message, 'GET_ANALYTICS_ERROR');
  }
}

