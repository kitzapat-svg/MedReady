/**
 * MedReady - Authentication & Authorization Engine
 * Enforces Google Sign-In allowlist and server-side role / ward-scope verification.
 */

/**
 * Resolves current authenticated user from Session and Users sheet.
 * Never trusts client-supplied role or credentials.
 */
function getCurrentUser() {
  let email = '';
  try {
    email = Session.getActiveUser().getEmail();
  } catch (e) {}
  
  email = (email || '').toLowerCase().trim();

  let webAppUrl = 'https://script.google.com/macros/s/AKfycbzuKdmZAvBMl854yaqDJha8z0NxOo_sRBK0daPKrkWJEli7QlJI3_QOoyPsPpGrQorI/exec';
  try {
    const serviceUrl = ScriptApp.getService().getUrl();
    if (serviceUrl) webAppUrl = serviceUrl;
  } catch (e) {}

  if (!email) {
    return {
      authenticated: false,
      email: '',
      role: null,
      wardScope: null,
      name: '',
      active: false,
      status: 'UNAUTHENTICATED',
      webAppUrl: webAppUrl,
      message: 'ไม่พบข้อมูลการเข้าสู่ระบบ Google กรุณาเข้าสู่ระบบด้วยบัญชี Google'
    };
  }

  const ss = getSpreadsheet();
  const userSheet = ss.getSheetByName(CONFIG.SHEETS.USERS);
  if (!userSheet) {
    throw new Error('ตาราง Users ยังไม่ได้ถูกสร้าง กรุณาติดต่อผู้ดูแลระบบ');
  }

  const lastRow = userSheet.getLastRow();
  if (lastRow <= 1) {
    return {
      authenticated: true,
      email: email,
      role: null,
      wardScope: null,
      name: '',
      active: false,
      status: 'ACCESS_DENIED',
      webAppUrl: webAppUrl,
      message: 'ระบบยังไม่มีรายชื่อผู้ใช้งานที่ได้รับอนุญาต'
    };
  }

  const data = userSheet.getRange(2, 1, lastRow - 1, 7).getValues();
  let matchedUser = null;
  let userRowIndex = -1;

  for (let i = 0; i < data.length; i++) {
    const rowEmail = String(data[i][0] || '').toLowerCase().trim();
    if (rowEmail === email) {
      matchedUser = {
        email: rowEmail,
        role: String(data[i][1] || '').trim().toUpperCase(),
        wardScope: String(data[i][2] || 'ตึกพิเศษ').trim(),
        active: String(data[i][3]).toUpperCase() === 'TRUE',
        name: String(data[i][4] || '').trim() || rowEmail.split('@')[0]
      };
      userRowIndex = i + 2;
      break;
    }
  }

  if (!matchedUser) {
    return {
      authenticated: true,
      email: email,
      role: null,
      wardScope: null,
      name: email.split('@')[0],
      active: false,
      status: 'ACCESS_DENIED',
      webAppUrl: webAppUrl,
      message: 'อีเมลนี้ (' + email + ') ยังไม่ได้รับสิทธิ์เข้าใช้งาน MedReady กรุณาติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์'
    };
  }

  if (!matchedUser.active) {
    return {
      authenticated: true,
      email: email,
      role: matchedUser.role,
      wardScope: matchedUser.wardScope,
      name: matchedUser.name,
      active: false,
      status: 'ACCOUNT_DEACTIVATED',
      webAppUrl: webAppUrl,
      message: 'บัญชีผู้ใช้งานของคุณ (' + email + ') ถูกระงับการใช้งานชั่วคราว'
    };
  }

  // Update Last Login timestamp asynchronously or directly
  try {
    userSheet.getRange(userRowIndex, 7).setValue(new Date().toISOString());
  } catch (e) {}

  return {
    authenticated: true,
    email: matchedUser.email,
    role: matchedUser.role,
    wardScope: matchedUser.wardScope,
    name: matchedUser.name,
    active: true,
    status: 'AUTHORIZED',
    webAppUrl: webAppUrl
  };
}

/**
 * Server-side authorization guard.
 * Checks if current user is active and belongs to one of the allowed roles.
 * Optionally validates ward scope.
 */
function requireAuthorization(allowedRoles, requiredWard) {
  const user = getCurrentUser();
  
  if (!user.authenticated || !user.active || user.status !== 'AUTHORIZED') {
    throw new Error(user.message || 'ไม่มีสิทธิ์เข้าใช้งานระบบ (Unauthorized)');
  }

  if (allowedRoles && Array.isArray(allowedRoles) && allowedRoles.length > 0) {
    if (!allowedRoles.includes(user.role) && user.role !== CONFIG.ROLES.SUPER_ADMIN) {
      throw new Error('คุณไม่มีสิทธิ์ในการกระทำนี้ (Role Required: ' + allowedRoles.join(', ') + ')');
    }
  }

  // If role is WARD, ensure case belongs to their ward scope (unless wardScope is 'ALL')
  if (user.role === CONFIG.ROLES.WARD && requiredWard && user.wardScope !== 'ALL') {
    if (user.wardScope !== requiredWard) {
      throw new Error('คุณไม่มีสิทธิ์เข้าถึงข้อมูลของ ' + requiredWard + ' (สิทธิ์ของคุณ: ' + user.wardScope + ')');
    }
  }

  return user;
}

/**
 * Client bootstrap API call.
 * Fetches current authenticated user profile, active settings, and available wards.
 */
function apiGetBootstrap() {
  try {
    const user = getCurrentUser();
    const settings = apiGetSettingsPublic();
    
    return successResponse({
      user: user,
      settings: settings,
      wards: (settings.WARD_OPTIONS || 'ตึกพิเศษ,Ward 1,Ward 2,Ward 3').split(',').map(s => s.trim()),
      serverTime: new Date().toISOString()
    });
  } catch (err) {
    return errorResponse(err.message, 'BOOTSTRAP_ERROR');
  }
}

/**
 * Client API call to get current user authorization info
 */
function apiGetCurrentUser() {
  return getCurrentUser();
}
