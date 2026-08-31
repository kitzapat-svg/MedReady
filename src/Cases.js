/**
 * MedReady - Case Operations & State Machine Engine
 * Strictly enforces state sequence: SUBMITTED -> IN_PROGRESS -> READY -> BASKET_RECEIVED -> DISPENSED
 * Protected by LockService and Write-Conflict detection.
 */

/**
 * Creates a new case (Ward submission: "ส่งให้ห้องยา")
 * Fields: an, roomBed, appointmentStatus, wardScope (optional, defaults to user's ward)
 */
function apiCreateCase(params) {
  try {
    const user = requireAuthorization([CONFIG.ROLES.WARD, CONFIG.ROLES.SUPER_ADMIN]);
    
    if (!params || !params.an || !params.roomBed) {
      return errorResponse('กรุณาระบุ AN และ ห้อง/เตียง ให้ครบถ้วน', 'INVALID_INPUT');
    }

    const cleanAn = String(params.an).trim().replace(/[^0-9a-zA-Z]/g, '');
    const cleanRoomBed = String(params.roomBed).trim();
    const apptStatus = params.appointmentStatus === 'นัดหมายแล้ว' ? 'นัดหมายแล้ว' : 'ไม่มีนัด';
    const wardScope = (user.role === CONFIG.ROLES.SUPER_ADMIN && params.wardScope) 
      ? params.wardScope 
      : (user.wardScope !== 'ALL' ? user.wardScope : (params.wardScope || 'ตึกพิเศษ'));

    return withLock(function() {
      const ss = getSpreadsheet();
      const casesSheet = ss.getSheetByName(CONFIG.SHEETS.CASES);
      if (!casesSheet) {
        throw new Error('ตาราง Cases ไม่พบในระบบ');
      }

      const caseId = generateNextCaseId(casesSheet);
      const now = new Date().toISOString();

      const newRow = [
        caseId,                      // 1: Case ID
        cleanAn,                     // 2: AN (Stored raw, masked in UI)
        cleanRoomBed,                // 3: Room/Bed
        apptStatus,                  // 4: Appointment Status
        wardScope,                   // 5: Ward Scope
        CONFIG.STATES.SUBMITTED.key, // 6: Current State
        now,                         // 7: submittedAt
        '',                          // 8: startedAt
        '',                          // 9: readyAt
        '',                          // 10: basketReceivedAt
        '',                          // 11: dispensedAt
        'NORMAL',                    // 12: SLA Snapshot
        user.email,                  // 13: Created By
        now                          // 14: Updated At
      ];

      casesSheet.appendRow(newRow);

      // Write Timeline Audit Log
      logTimelineEvent({
        caseId: caseId,
        event: 'WARD_SUBMITTED',
        actor: user.name + ' (' + user.email + ')',
        fromState: '-',
        toState: CONFIG.STATES.SUBMITTED.key,
        details: 'Ward ส่งข้อมูลผู้ป่วย (' + wardScope + ' ' + cleanRoomBed + ')'
      });

      return successResponse({
        caseId: caseId,
        maskedAn: maskAN(cleanAn),
        roomBed: cleanRoomBed,
        appointmentStatus: apptStatus,
        wardScope: wardScope,
        currentState: CONFIG.STATES.SUBMITTED.key,
        submittedAt: now
      }, 'ส่งข้อมูลให้ห้องยาเรียบร้อยแล้ว (' + caseId + ')');
    });
  } catch (err) {
    return errorResponse(err.message, 'CREATE_CASE_ERROR');
  }
}

/**
 * Transition case to next state (Pharmacy workflow)
 * Strict state machine: SUBMITTED -> IN_PROGRESS -> READY -> BASKET_RECEIVED -> DISPENSED
 */
function apiTransitionCase(params) {
  try {
    const user = requireAuthorization([CONFIG.ROLES.PHARMACY, CONFIG.ROLES.SUPER_ADMIN]);
    
    if (!params || !params.caseId || !params.targetState) {
      return errorResponse('พารามิเตอร์ไม่ถูกต้อง (ต้องการ Case ID และ Target State)', 'INVALID_INPUT');
    }

    const caseId = String(params.caseId).trim();
    const expectedCurrentState = params.expectedCurrentState ? String(params.expectedCurrentState).trim() : null;
    const targetStateKey = String(params.targetState).trim();

    const targetConfig = CONFIG.STATES[targetStateKey];
    if (!targetConfig) {
      return errorResponse('สถานะเป้าหมายไม่ถูกต้อง: ' + targetStateKey, 'INVALID_STATE');
    }

    return withLock(function() {
      const ss = getSpreadsheet();
      const casesSheet = ss.getSheetByName(CONFIG.SHEETS.CASES);
      const lastRow = casesSheet.getLastRow();
      
      if (lastRow <= 1) {
        return errorResponse('ไม่พบรายการเคสในระบบ', 'NOT_FOUND');
      }

      const data = casesSheet.getRange(2, 1, lastRow - 1, 14).getValues();
      let rowIndex = -1;
      let currentRow = null;

      for (let i = 0; i < data.length; i++) {
        if (String(data[i][0] || '').trim() === caseId) {
          rowIndex = i + 2;
          currentRow = data[i];
          break;
        }
      }

      if (!currentRow || rowIndex === -1) {
        return errorResponse('ไม่พบเคส ' + caseId, 'NOT_FOUND');
      }

      const dbCurrentState = String(currentRow[5] || '').trim();

      // Write-Conflict check
      if (expectedCurrentState && dbCurrentState !== expectedCurrentState) {
        return errorResponse(
          'รายการนี้ถูกอัปเดตโดยผู้ใช้อื่นแล้ว ระบบได้โหลดข้อมูลล่าสุดให้แล้ว',
          'WRITE_CONFLICT',
          true
        );
      }

      // State machine validity check
      const validNextState = CONFIG.NEXT_STATE[dbCurrentState];
      if (validNextState !== targetStateKey) {
        return errorResponse(
          'ไม่สามารถเปลี่ยนสถานะจาก ' + (CONFIG.STATES[dbCurrentState] ? CONFIG.STATES[dbCurrentState].thai : dbCurrentState) + 
          ' ไปยัง ' + targetConfig.thai + ' ได้ (ต้องเป็นไปตามลำดับขั้นตอนเท่านั้น)',
          'INVALID_TRANSITION'
        );
      }

      const now = new Date().toISOString();
      const updateRange = casesSheet.getRange(rowIndex, 1, 1, 14);
      const rowValues = [...currentRow];

      // Update Current State
      rowValues[5] = targetStateKey;
      rowValues[13] = now; // Updated At

      // Set state-specific timestamp column
      if (targetStateKey === CONFIG.STATES.IN_PROGRESS.key) {
        rowValues[7] = now; // startedAt
      } else if (targetStateKey === CONFIG.STATES.READY.key) {
        rowValues[8] = now; // readyAt
      } else if (targetStateKey === CONFIG.STATES.BASKET_RECEIVED.key) {
        rowValues[9] = now; // basketReceivedAt
      } else if (targetStateKey === CONFIG.STATES.DISPENSED.key) {
        rowValues[10] = now; // dispensedAt
      }

      updateRange.setValues([rowValues]);

      // Log to Timeline
      logTimelineEvent({
        caseId: caseId,
        event: 'STATE_CHANGED_' + targetStateKey,
        actor: user.name + ' (' + user.email + ')',
        fromState: dbCurrentState,
        toState: targetStateKey,
        details: 'เปลี่ยนสถานะเป็น ' + targetConfig.thai
      });

      // If transition to READY -> trigger notification to Ward
      if (targetStateKey === CONFIG.STATES.READY.key) {
        createReadyNotification({
          caseId: caseId,
          wardScope: String(rowValues[4]),
          roomBed: String(rowValues[2])
        });
      }

      return successResponse({
        caseId: caseId,
        fromState: dbCurrentState,
        toState: targetStateKey,
        timestamp: now
      }, 'อัปเดตสถานะเป็น ' + targetConfig.thai + ' สำเร็จ');
    });
  } catch (err) {
    return errorResponse(err.message, 'TRANSITION_ERROR');
  }
}

/**
 * Lists cases filtered by role and optional filters
 */
function apiListCases(filters) {
  try {
    const user = requireAuthorization();
    const ss = getSpreadsheet();
    const casesSheet = ss.getSheetByName(CONFIG.SHEETS.CASES);
    
    if (!casesSheet || casesSheet.getLastRow() <= 1) {
      return successResponse([], 'ไม่มีข้อมูลเคส');
    }

    const settings = apiGetSettingsPublic();
    const normalMax = parseInt(settings.SLA_NORMAL_MAX || '30', 10);
    const approachingMax = parseInt(settings.SLA_APPROACHING_MAX || '45', 10);
    const breakConfig = {
      enabled: settings.BREAK_TIME_ENABLED !== 'false',
      start: settings.BREAK_TIME_START || '12:00',
      end: settings.BREAK_TIME_END || '13:00'
    };

    const data = casesSheet.getRange(2, 1, casesSheet.getLastRow() - 1, 14).getValues();
    const flagsMap = getActiveIssueFlagsMap();

    const casesList = [];

    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      const caseId = String(r[0] || '').trim();
      if (!caseId) continue;

      const rawAn = String(r[1] || '');
      const roomBed = String(r[2] || '');
      const apptStatus = String(r[3] || '');
      const wardScope = String(r[4] || '');
      const currentState = String(r[5] || 'SUBMITTED');
      const submittedAt = r[6] ? toIsoString(r[6]) : '';
      const startedAt = r[7] ? toIsoString(r[7]) : '';
      const readyAt = r[8] ? toIsoString(r[8]) : '';
      const basketReceivedAt = r[9] ? toIsoString(r[9]) : '';
      const dispensedAt = r[10] ? toIsoString(r[10]) : '';
      const updatedAt = r[13] ? toIsoString(r[13]) : submittedAt;

      // Role-based Ward filter: WARD users only see their assigned ward (unless ALL)
      if (user.role === CONFIG.ROLES.WARD && user.wardScope !== 'ALL') {
        if (wardScope !== user.wardScope) {
          continue;
        }
      }

      // Optional client filter by ward
      if (filters && filters.ward && filters.ward !== 'ALL' && wardScope !== filters.ward) {
        continue;
      }

      // Optional client filter by state
      if (filters && filters.state && filters.state !== 'ALL' && currentState !== filters.state) {
        continue;
      }

      // Calculate elapsed durations
      const elapsedMinutes = getDurationMinutes(submittedAt, dispensedAt || null, breakConfig);
      
      // True Patient Waiting Time (dispensedAt - basketReceivedAt, or now - basketReceivedAt if in BASKET_RECEIVED)
      let patientWaitingMinutes = null;
      if (basketReceivedAt) {
        patientWaitingMinutes = getDurationMinutes(basketReceivedAt, dispensedAt || null, breakConfig);
      }

      // Preparation Lead Time (readyAt - submittedAt)
      let prepLeadMinutes = null;
      if (readyAt) {
        prepLeadMinutes = getDurationMinutes(submittedAt, readyAt, breakConfig);
      }

      // SLA Band calculation (measured from submittedAt for open cases)
      let slaBand = 'NORMAL';
      let slaLabel = 'ปกติ';
      if (currentState !== CONFIG.STATES.DISPENSED.key) {
        if (elapsedMinutes > approachingMax) {
          slaBand = 'BREACHED';
          slaLabel = 'เกิน SLA';
        } else if (elapsedMinutes > normalMax) {
          slaBand = 'APPROACHING';
          slaLabel = 'ใกล้ SLA';
        }
      }

      const stateConfig = CONFIG.STATES[currentState] || CONFIG.STATES.SUBMITTED;
      const nextStateKey = CONFIG.NEXT_STATE[currentState] || null;
      const nextStateConfig = nextStateKey ? CONFIG.STATES[nextStateKey] : null;

      casesList.push({
        caseId: caseId,
        rawAn: rawAn,
        maskedAn: maskAN(rawAn),
        roomBed: roomBed,
        appointmentStatus: apptStatus,
        wardScope: wardScope,
        currentState: currentState,
        stateThai: stateConfig.thai,
        progress: stateConfig.progress,
        submittedAt: submittedAt,
        startedAt: startedAt,
        readyAt: readyAt,
        basketReceivedAt: basketReceivedAt,
        dispensedAt: dispensedAt,
        updatedAt: updatedAt,
        elapsedMinutes: elapsedMinutes,
        elapsedText: formatDurationThai(elapsedMinutes),
        prepLeadMinutes: prepLeadMinutes,
        prepLeadText: prepLeadMinutes !== null ? formatDurationThai(prepLeadMinutes) : '-',
        patientWaitingMinutes: patientWaitingMinutes,
        patientWaitingText: patientWaitingMinutes !== null ? formatDurationThai(patientWaitingMinutes) : '-',
        slaBand: slaBand,
        slaLabel: slaLabel,
        nextState: nextStateKey,
        nextActionLabel: nextStateConfig ? nextStateConfig.buttonLabel : null,
        flags: flagsMap[caseId] || []
      });
    }

    // Sort: Open cases first (most urgent/longest waiting), then sorted by submittedAt desc
    casesList.sort((a, b) => {
      const aDone = a.currentState === CONFIG.STATES.DISPENSED.key ? 1 : 0;
      const bDone = b.currentState === CONFIG.STATES.DISPENSED.key ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
    });

    return successResponse(casesList);
  } catch (err) {
    return errorResponse(err.message, 'LIST_CASES_ERROR');
  }
}

/**
 * Gets full details and timeline of a single case
 */
function apiGetCaseDetail(caseId) {
  try {
    const user = requireAuthorization();
    if (!caseId) return errorResponse('ระบุ Case ID', 'INVALID_INPUT');

    const cleanCaseId = String(caseId).trim();
    const listRes = apiListCases({ caseId: cleanCaseId });
    if (!listRes.success) return listRes;

    const matched = listRes.data.find(c => c.caseId === cleanCaseId);
    if (!matched) return errorResponse('ไม่พบข้อมูลเคส ' + cleanCaseId, 'NOT_FOUND');

    const timeline = getCaseTimeline(cleanCaseId);
    const flags = getCaseIssueFlags(cleanCaseId);

    return successResponse({
      case: matched,
      timeline: timeline,
      flags: flags
    });
  } catch (err) {
    return errorResponse(err.message, 'GET_CASE_DETAIL_ERROR');
  }
}

/**
 * Gets IPD Dispensing Dashboard orders synced from Intranet
 * Matches against active MedReady cases to highlight already-submitted patients.
 */
function apiGetIpdSyncedOrders(wardFilter) {
  try {
    const user = requireAuthorization();
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.IPD_ORDERS);
    
    if (!sheet || sheet.getLastRow() <= 1) {
      return successResponse({
        orders: [],
        lastSync: null,
        count: 0
      }, 'ยังไม่มีข้อมูล Sync จาก Intranet');
    }

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
    const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    // Find column indexes dynamically from headers
    let anIdx = headers.findIndex(h => h.toUpperCase().includes('AN'));
    let wardIdx = headers.findIndex(h => h.includes('หอผู้ป่วย') || h.includes('ตึก') || h.toLowerCase().includes('ward'));
    let bedIdx = headers.findIndex(h => h.includes('เตียง') || h.includes('ห้อง'));
    let dateIdx = headers.findIndex(h => h.includes('วันที่'));
    let timeIdx = headers.findIndex(h => h.includes('เวลา') && !h.includes('อัปเดต'));
    let typeIdx = headers.findIndex(h => h === 'ประเภท' || (h.includes('ประเภท') && !h.includes('ยา')));
    let medTypeIdx = headers.findIndex(h => h.includes('ประเภทยา'));
    let updatedIdx = headers.findIndex(h => h.includes('อัปเดต'));

    // Safe fallbacks
    if (anIdx === -1) anIdx = 1;
    if (wardIdx === -1) wardIdx = lastCol >= 9 ? 3 : 2;
    if (bedIdx === -1) bedIdx = lastCol >= 9 ? 4 : 3;
    if (dateIdx === -1) dateIdx = lastCol >= 9 ? 5 : 4;
    if (timeIdx === -1) timeIdx = lastCol >= 9 ? 6 : 5;
    if (typeIdx === -1) typeIdx = 0;
    if (medTypeIdx === -1) medTypeIdx = lastCol >= 9 ? 7 : 6;
    if (updatedIdx === -1) updatedIdx = lastCol >= 9 ? 8 : 7;

    // Fetch existing active cases to identify already submitted ANs
    const activeCasesRes = apiListCases();
    const activeCasesMap = {};
    if (activeCasesRes.success && activeCasesRes.data) {
      activeCasesRes.data.forEach(c => {
        if (c.rawAn) {
          activeCasesMap[String(c.rawAn).trim().toLowerCase()] = {
            caseId: c.caseId,
            currentState: c.currentState,
            stateThai: CONFIG.STATES[c.currentState] ? CONFIG.STATES[c.currentState].thai : c.currentState,
            roomBed: c.roomBed,
            submittedAt: c.submittedAt
          };
        }
      });
    }

    const targetWard = (user.role === CONFIG.ROLES.WARD && user.wardScope !== 'ALL')
      ? user.wardScope
      : (wardFilter && wardFilter !== 'ALL' ? wardFilter : null);

    const orders = [];
    let latestTimestamp = '';

    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      const orderType = typeIdx >= 0 ? String(r[typeIdx] || '').trim() : 'ใบสั่งยาใหม่';
      const rawAn = anIdx >= 0 ? String(r[anIdx] || '').trim() : '';
      const ward = wardIdx >= 0 ? String(r[wardIdx] || '').trim() : '';
      const roomBed = bedIdx >= 0 ? String(r[bedIdx] || '').trim() : '';
      const orderDate = dateIdx >= 0 ? String(r[dateIdx] || '').trim() : '';
      const orderTime = timeIdx >= 0 ? formatCleanTime(r[timeIdx]) : '';
      const medType = medTypeIdx >= 0 ? String(r[medTypeIdx] || '').trim() : '';
      const updatedAt = updatedIdx >= 0 ? String(r[updatedIdx] || '').trim() : '';

      if (!rawAn) continue;
      if (updatedAt && (!latestTimestamp || updatedAt > latestTimestamp)) {
        latestTimestamp = updatedAt;
      }

      // Flexible Ward matching
      if (targetWard && ward && targetWard !== 'ALL') {
        const tw = targetWard.replace(/\s+/g, '').toLowerCase();
        const w = ward.replace(/\s+/g, '').toLowerCase();
        if (tw !== w && !w.includes(tw) && !tw.includes(w)) {
          continue;
        }
      }

      const cleanAnLower = rawAn.toLowerCase().replace(/[^0-9a-z]/g, '');
      const existingCase = activeCasesMap[cleanAnLower] || null;

      orders.push({
        orderType: orderType || 'ใบสั่งยาใหม่',
        rawAn: rawAn,
        maskedAn: maskAN(rawAn),
        ward: ward,
        roomBed: roomBed,
        orderDate: orderDate,
        orderTime: orderTime,
        medType: medType,
        updatedAt: updatedAt,
        isSubmitted: !!existingCase,
        existingCase: existingCase
      });
    }

    // Fallback: If filtered orders is empty but data has rows, return all rows
    if (orders.length === 0 && data.length > 0) {
      for (let i = 0; i < data.length; i++) {
        const r = data[i];
        const rawAn = anIdx >= 0 ? String(r[anIdx] || '').trim() : '';
        if (!rawAn) continue;
        const cleanAnLower = rawAn.toLowerCase().replace(/[^0-9a-z]/g, '');
        const existingCase = activeCasesMap[cleanAnLower] || null;

        orders.push({
          orderType: typeIdx >= 0 ? String(r[typeIdx] || '').trim() : 'ใบสั่งยาใหม่',
          rawAn: rawAn,
          maskedAn: maskAN(rawAn),
          ward: wardIdx >= 0 ? String(r[wardIdx] || '').trim() : '',
          roomBed: bedIdx >= 0 ? String(r[bedIdx] || '').trim() : '',
          orderDate: dateIdx >= 0 ? String(r[dateIdx] || '').trim() : '',
          orderTime: timeIdx >= 0 ? formatCleanTime(r[timeIdx]) : '',
          medType: medTypeIdx >= 0 ? String(r[medTypeIdx] || '').trim() : '',
          updatedAt: updatedIdx >= 0 ? String(r[updatedIdx] || '').trim() : '',
          isSubmitted: !!existingCase,
          existingCase: existingCase
        });
      }
    }

    return successResponse({
      orders: orders,
      lastSync: latestTimestamp || null,
      count: orders.length,
      totalRowsInSheet: data.length,
      targetWard: targetWard
    }, 'ดึงข้อมูล sync สำเร็จ (' + orders.length + ' รายการ)');
  } catch (err) {
    return errorResponse(err.message, 'GET_IPD_ORDERS_ERROR');
  }
}

/**
 * Saves/updates synced IPD orders into IPD_Orders sheet (PDPA Compliant - No Patient Name)
 */
function apiSyncIpdOrders(ordersList) {
  try {
    if (!ordersList || !Array.isArray(ordersList)) {
      return errorResponse('พารามิเตอร์ orders ต้องเป็น Array', 'INVALID_INPUT');
    }

    return withLock(function() {
      const ss = getSpreadsheet();
      let sheet = ss.getSheetByName(CONFIG.SHEETS.IPD_ORDERS);
      if (!sheet) {
        sheet = ss.insertSheet(CONFIG.SHEETS.IPD_ORDERS);
      }

      const headers = [
        'ประเภท',
        'AN',
        'หอผู้ป่วย',
        'เตียง',
        'วันที่',
        'เวลา',
        'ประเภทยา',
        'อัปเดตล่าสุด'
      ];

      sheet.clear();
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);

      const rows = [];
      const now = new Date().toISOString();

      ordersList.forEach(item => {
        if (Array.isArray(item)) {
          // Array format: [orderType, an, ward, bed, date, time, medType, updatedAt]
          // If 9 items passed (with name at index 2), skip index 2
          if (item.length >= 9) {
            rows.push([
              item[0] || '',
              item[1] || '',
              item[3] || '',
              item[4] || '',
              item[5] || '',
              item[6] || '',
              item[7] || '',
              item[8] || now
            ]);
          } else {
            rows.push([
              item[0] || '',
              item[1] || '',
              item[2] || '',
              item[3] || '',
              item[4] || '',
              item[5] || '',
              item[6] || '',
              item[7] || now
            ]);
          }
        } else if (typeof item === 'object' && item !== null) {
          // Object format
          rows.push([
            item.orderType || item.type || 'ใบสั่งยาใหม่',
            item.an || item.rawAn || '',
            item.ward || '',
            item.roomBed || item.bed || '',
            item.orderDate || item.date || '',
            item.orderTime || item.time || '',
            item.medType || item.type || 'HME',
            item.updatedAt || now
          ]);
        }
      });

      if (rows.length > 0) {
        sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
      }

      return successResponse({
        count: rows.length,
        syncedAt: now
      }, 'บันทึกข้อมูล sync สำเร็จ (' + rows.length + ' รายการ)');
    });
  } catch (err) {
    return errorResponse(err.message, 'SYNC_IPD_ORDERS_ERROR');
  }
}

