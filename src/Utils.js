/**
 * MedReady - Utility Functions
 * Helper functions for masking, formatting, locking, and standardized responses.
 */

/**
 * Standard Success Response envelope
 */
function successResponse(data, message) {
  return {
    success: true,
    data: data || null,
    message: message || '',
    timestamp: new Date().toISOString()
  };
}

/**
 * Standard Error Response envelope
 */
function errorResponse(message, code, conflict) {
  return {
    success: false,
    error: message || 'เกิดข้อผิดพลาดในการประมวลผล',
    code: code || 'UNKNOWN_ERROR',
    conflict: !!conflict,
    timestamp: new Date().toISOString()
  };
}

/**
 * Mask AN according to SOT.md: "AN 69•••4438"
 * Data minimization & pseudonymization boundary.
 */
function maskAN(an) {
  if (!an) return '';
  const clean = String(an).trim();
  if (clean.length <= 4) {
    return 'AN •••' + clean;
  }
  const prefix = clean.substring(0, 2);
  const suffix = clean.substring(clean.length - 4);
  return 'AN ' + prefix + '•••' + suffix;
}

/**
 * Format Date to ISO string in Asia/Bangkok
 */
function toIsoString(date) {
  if (!date) return '';
  if (typeof date === 'string') return date;
  return new Date(date).toISOString();
}

/**
 * Format Date to readable Thai time "HH:mm"
 */
function formatThaiTime(date) {
  if (!date) return '-';
  const d = new Date(date);
  return Utilities.formatDate(d, CONFIG.TIMEZONE, 'HH:mm');
}

/**
 * Format any time/date value into clean "HH:mm น." in Asia/Bangkok
 */
function formatCleanTime(timeVal) {
  if (!timeVal) return '-';
  if (typeof timeVal === 'object' && timeVal instanceof Date) {
    return Utilities.formatDate(timeVal, CONFIG.TIMEZONE, 'HH:mm น.');
  }
  const str = String(timeVal).trim();
  if (str.includes('GMT') || str.includes('1899') || str.includes('T')) {
    try {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        return Utilities.formatDate(d, CONFIG.TIMEZONE, 'HH:mm น.');
      }
    } catch(e) {}
  }
  const m = str.match(/(\d{1,2}:\d{2})/);
  if (m) return m[1] + ' น.';
  return str;
}

/**
 * Format Date to readable Thai datetime "dd/MM/yyyy HH:mm"
 */
function formatThaiDateTime(date) {
  if (!date) return '-';
  const d = new Date(date);
  return Utilities.formatDate(d, CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm');
}

/**
 * Calculate overlap in milliseconds between [start, end] and daily break windows [breakStart, breakEnd]
 */
function calculateBreakOverlapMs(startDate, endDate, breakStartStr, breakEndStr) {
  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end.getTime() <= start.getTime()) return 0;

    const startParts = String(breakStartStr || '12:00').trim().split(':');
    const endParts = String(breakEndStr || '13:00').trim().split(':');
    const startHour = parseInt(startParts[0], 10) || 12;
    const startMin = parseInt(startParts[1], 10) || 0;
    const endHour = parseInt(endParts[0], 10) || 13;
    const endMin = parseInt(endParts[1], 10) || 0;

    let totalOverlapMs = 0;
    const current = new Date(start.getTime());
    current.setHours(0, 0, 0, 0);

    const lastDay = new Date(end.getTime());
    lastDay.setHours(0, 0, 0, 0);

    while (current.getTime() <= lastDay.getTime()) {
      const breakStart = new Date(current.getTime());
      breakStart.setHours(startHour, startMin, 0, 0);

      const breakEnd = new Date(current.getTime());
      breakEnd.setHours(endHour, endMin, 0, 0);

      if (breakEnd > breakStart) {
        const windowStart = Math.max(start.getTime(), breakStart.getTime());
        const windowEnd = Math.min(end.getTime(), breakEnd.getTime());
        if (windowEnd > windowStart) {
          totalOverlapMs += (windowEnd - windowStart);
        }
      }

      current.setDate(current.getDate() + 1);
    }

    return totalOverlapMs;
  } catch (e) {
    return 0;
  }
}

/**
 * Calculate duration in minutes between two dates, optionally excluding break/lunch time
 * @param {Date|string} startDate
 * @param {Date|string} endDate
 * @param {Object} [breakConfig] - { enabled: boolean|string, start: string, end: string }
 */
function getDurationMinutes(startDate, endDate, breakConfig) {
  if (!startDate) return null;
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date();
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end.getTime() < start.getTime()) return 0;

  let durationMs = end.getTime() - start.getTime();

  if (breakConfig && (breakConfig.enabled === true || breakConfig.enabled === 'true') && breakConfig.start && breakConfig.end) {
    const breakOverlapMs = calculateBreakOverlapMs(start, end, breakConfig.start, breakConfig.end);
    durationMs = Math.max(0, durationMs - breakOverlapMs);
  }

  return Math.round(durationMs / (1000 * 60));
}

/**
 * Format minutes into readable Thai text (e.g. "24 นาที", "1 ชม. 15 นาที")
 */
function formatDurationThai(minutes) {
  if (minutes === null || minutes === undefined || isNaN(minutes)) return '-';
  const mins = Math.max(0, Math.round(minutes));
  if (mins < 60) {
    return mins + ' นาที';
  }
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  if (remainingMins === 0) {
    return hours + ' ชม.';
  }
  return hours + ' ชม. ' + remainingMins + ' นาที';
}

/**
 * Executes a callback with ScriptLock for concurrency safety
 */
function withLock(callback, timeoutSeconds) {
  const lock = LockService.getScriptLock();
  const timeoutMs = (timeoutSeconds || 30) * 1000;
  
  try {
    const hasLock = lock.tryLock(timeoutMs);
    if (!hasLock) {
      throw new Error('ไม่สามารถเข้าถึงฐานข้อมูลได้เนื่องจากมีการใช้งานหนาแน่น กรุณาลองใหม่อีกครั้ง');
    }
    return callback();
  } finally {
    try {
      lock.releaseLock();
    } catch (e) {
      // Ignore lock release error if already released
    }
  }
}

/**
 * Generate Next Case ID, e.g. MR-0001, MR-0248
 */
function generateNextCaseId(casesSheet) {
  const lastRow = casesSheet.getLastRow();
  if (lastRow <= 1) {
    return 'MR-0001';
  }
  
  const idColValues = casesSheet.getRange(2, 1, lastRow - 1, 1).getValues();
  let maxNumber = 0;
  
  for (let i = 0; i < idColValues.length; i++) {
    const val = String(idColValues[i][0] || '').trim();
    const match = val.match(/^MR-(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNumber) {
        maxNumber = num;
      }
    }
  }
  
  const nextNum = maxNumber + 1;
  const padded = ('0000' + nextNum).slice(-4);
  return 'MR-' + padded;
}

/**
 * Generate unique UUID / ID for logs, flags, etc.
 */
function generateUUID() {
  return Utilities.getUuid();
}

