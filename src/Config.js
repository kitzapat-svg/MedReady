/**
 * MedReady - System Configuration & Constants
 * Source of Truth (SOT.md) reference.
 */

const CONFIG = {
  APP_NAME: 'MedReady',
  TAGLINE: 'รู้เมื่อยาเสร็จ ลดเวลารอ เชื่อม Ward กับ Pharmacy',
  VERSION: '1.2.0',
  TIMEZONE: 'Asia/Bangkok',
  
  // Explicit Spreadsheet ID
  SPREADSHEET_ID: '1-OOO_cdun4sTTP4Ug80OfWqJqvqnlkLg2C87zVw7OwE',

  // Sheet Names
  SHEETS: {
    CASES: 'Cases',
    TIMELINE: 'Timeline',
    ISSUE_FLAGS: 'Issue Flags',
    USERS: 'Users',
    SETTINGS: 'Settings',
    NOTIFICATIONS: 'Notifications',
    IPD_ORDERS: 'IPD_Orders',
    DAILY_SUMMARIES: 'Daily_Summaries',
    CASES_ARCHIVE: 'Cases_Archive',
    TIMELINE_ARCHIVE: 'Timeline_Archive'
  },

  // State Machine (Sequential)
  STATES: {
    SUBMITTED: {
      key: 'SUBMITTED',
      order: 1,
      thai: 'รอห้องยาดำเนินการ',
      progress: 10,
      timestampField: 'submittedAt',
      buttonLabel: 'ส่งให้ห้องยา'
    },
    IN_PROGRESS: {
      key: 'IN_PROGRESS',
      order: 2,
      thai: 'กำลังเตรียมยา',
      progress: 45,
      timestampField: 'startedAt',
      buttonLabel: 'เริ่มดำเนินงาน'
    },
    READY: {
      key: 'READY',
      order: 3,
      thai: 'พร้อมจ่าย',
      progress: 75,
      timestampField: 'readyAt',
      buttonLabel: 'ตรวจสอบแล้ว • พร้อมจ่าย'
    },
    BASKET_RECEIVED: {
      key: 'BASKET_RECEIVED',
      order: 4,
      thai: 'รอจ่ายยา',
      progress: 85,
      timestampField: 'basketReceivedAt',
      buttonLabel: 'รับตะกร้ายากลับบ้าน'
    },
    DISPENSED: {
      key: 'DISPENSED',
      order: 5,
      thai: 'จ่ายยาแล้ว',
      progress: 100,
      timestampField: 'dispensedAt',
      buttonLabel: 'จ่ายยาแล้ว'
    }
  },

  // Next State Mapping
  NEXT_STATE: {
    'SUBMITTED': 'IN_PROGRESS',
    'IN_PROGRESS': 'READY',
    'READY': 'BASKET_RECEIVED',
    'BASKET_RECEIVED': 'DISPENSED'
  },

  // User Roles
  ROLES: {
    WARD: 'WARD',
    PHARMACY: 'PHARMACY',
    SUPER_ADMIN: 'SUPER_ADMIN'
  },

  // Issue Flags
  ISSUE_FLAGS: [
    'รอประสาน Ward',
    'รอแพทย์',
    'รอแก้ไขคำสั่ง',
    'อื่น ๆ'
  ],

  // Appointment Status Options
  APPOINTMENT_STATUS: [
    'นัดหมายแล้ว',
    'ไม่มีนัด'
  ],

  // Default SLA Settings (in minutes)
  DEFAULT_SETTINGS: {
    SLA_NORMAL_MAX: '30',
    SLA_APPROACHING_MAX: '45',
    BREAK_TIME_ENABLED: 'true',
    BREAK_TIME_START: '12:00',
    BREAK_TIME_END: '13:00',
    WARD_OPTIONS: 'ตึกพิเศษ,Ward 1,Ward 2,Ward 3',
    DEFAULT_WARD: 'ตึกพิเศษ',
    POLL_INTERVAL_SECONDS: '30'
  }
};

/**
 * Returns database spreadsheet instance
 */
function getSpreadsheet() {
  // 1. Check CONFIG.SPREADSHEET_ID if user defined it
  if (CONFIG.SPREADSHEET_ID && String(CONFIG.SPREADSHEET_ID).trim() !== '') {
    try {
      const ss = SpreadsheetApp.openById(String(CONFIG.SPREADSHEET_ID).trim());
      PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
      return ss;
    } catch (e) {
      Logger.log('Could not open spreadsheet by CONFIG.SPREADSHEET_ID: ' + e.message);
    }
  }

  // 2. Check Script Properties
  const scriptProp = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (scriptProp) {
    try {
      return SpreadsheetApp.openById(scriptProp);
    } catch (e) {
      Logger.log('Could not open spreadsheet by SHEET_ID: ' + e.message);
    }
  }
  
  // 3. Check Active Spreadsheet (if container-bound)
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) {
      PropertiesService.getScriptProperties().setProperty('SHEET_ID', active.getId());
      return active;
    }
  } catch (e) {}

  // 4. Search Drive for existing "MedReady Database" to reuse single file
  try {
    const files = DriveApp.getFilesByName('MedReady Database');
    while (files.hasNext()) {
      const file = files.next();
      if (!file.isTrashed()) {
        const id = file.getId();
        PropertiesService.getScriptProperties().setProperty('SHEET_ID', id);
        Logger.log('Found and bound existing MedReady Database in Drive: ' + id);
        return SpreadsheetApp.openById(id);
      }
    }
  } catch (e) {
    Logger.log('Could not search Drive for MedReady Database: ' + e.message);
  }
  
  // 5. Safe initialization (creates or finds single spreadsheet)
  const res = setupSystem();
  if (res && res.spreadsheetId) {
    return SpreadsheetApp.openById(res.spreadsheetId);
  }

  throw new Error('Spreadsheet not configured. Please run setupSystem() or set SHEET_ID in Script Properties.');
}
