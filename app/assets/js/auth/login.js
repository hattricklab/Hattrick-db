// ---------- Login ----------
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const authSubmit = document.getElementById('authSubmit');
  const authMsg = document.getElementById('authMsg');

  let currentEmployee = null;
  let currentAdmin = null;
  let appIsBoss = false;   // UI only; the database enforces boss-only actions
  let syncInvInvoiceDate = () => {};
  let syncAcctFilterDate = () => {};
  let syncExpDate = () => {};
  let openSession = null;
  let tickHandle = null;

  // Employee panels that admins and the boss can also use (their own tabs, "Staff tools").
  const STAFF_PANEL_IDS = ['tab-customer', 'tab-invoice', 'tab-inventory', 'tab-accounts', 'tab-timelog'];
  function staffToolsAttach(){
    const wrap = document.getElementById('adminWrap');
    STAFF_PANEL_IDS.forEach(id => {
      const panel = document.getElementById(id);
      if (!panel) return;
      if (panel.parentElement !== wrap) wrap.appendChild(panel);
      panel.classList.remove('active');
    });
  }

  // fresh = true after typing a password (shows the "you forgot last time" reminder when needed);
  // fresh = false when a refresh restores the session.
  async function enterAsAdmin(adminRow, username, fresh){
    currentAdmin = adminRow;
    appIsBoss = adminRow.role === 'boss';
    document.body.classList.toggle('is-boss', appIsBoss);
    document.getElementById('adminGreeting').textContent = appIsBoss ? 'Boss' : 'Admin';
    usernameInput.value = ''; passwordInput.value = '';
    const wasUnclean = leaveGuardOn(username);
    const reminderDone = fresh ? leaveReminder(wasUnclean, adminRow.name || adminRow.username, appIsBoss) : Promise.resolve(false);
    staffToolsAttach();
    showScreen('admin');
    await reminderDone;
    startIdleWatch();
    // Boss has no check-in rules; admins and employees do.
    attInit({ kind: appIsBoss ? 'boss' : 'admin', id: adminRow.id, name: adminRow.name || adminRow.username });
    pwCheckPending();
    taskAdminInit();
    await Promise.allSettled([
      loadEmployees(),
      loadServices(),
      pkgLoadServiceSelector(),
      pkgLoadList(),
      loadAdminCustomers(),
      loadAdminStats(),
      acctRefreshAdminOverview(),
      loadDashboardAccountsCard(),
      // the staff tools (customer registration, invoice generator, ...) need their data too
      loadCustomers(),
      suggestNextPatientId(),
      invLoadInitialData(),
      appIsBoss ? Promise.resolve() : loadHistory()
    ]);
  }

  async function enterAsEmployee(row, username, fresh){
    currentEmployee = row;
    usernameInput.value = ''; passwordInput.value = '';
    document.getElementById('empGreeting').textContent = row.name || row.username;
    const wasUnclean = leaveGuardOn(username);
    const reminderDone = fresh ? leaveReminder(wasUnclean, row.name || row.username, false) : Promise.resolve(false);
    showScreen('employee');
    await reminderDone;
    startIdleWatch();
    await loadOpenSession();
    pwCheckPending();
    taskInitEmployee();
    await Promise.allSettled([
      loadHistory(),
      loadCustomers(),
      suggestNextPatientId(),
      invLoadInitialData(),
      acctRefreshEmployeeAccounts()
    ]);
    startTicking();
  }

  authSubmit.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    if (!username || !password){ showMsg(authMsg, 'Enter both username and password.', 'err'); return; }

    clearMsg(authMsg);
    authSubmit.disabled = true;

    const { data: adminRows } = await sb.rpc('login_admin', {
      p_username: username,
      p_password: password
    });
    const adminMatch = adminRows && adminRows.length ? adminRows[0] : null;

    if (adminMatch){
      setAppSessionToken(adminMatch.token);
      await enterAsAdmin(adminMatch, username, true);
      authSubmit.disabled = false;
      return;
    }

    const { data: employeeRows, error } = await sb.rpc('login_employee', {
      p_username: username,
      p_password: password
    });
    const data = employeeRows && employeeRows.length ? employeeRows[0] : null;

    authSubmit.disabled = false;

    if (error || !data){
      showMsg(authMsg, 'Invalid username or password.', 'err');
      return;
    }

    setAppSessionToken(data.token);
    await enterAsEmployee(data, username, true);
  });

  // A page refresh keeps the session token (sessionStorage): ask the server who it belongs to and
  // go straight back in, no password. Any problem (expired, deactivated, offline) = normal login.
  async function restoreSession(){
    if (!getStoredSessionToken()) return;
    authSubmit.disabled = true;
    showMsg(authMsg, 'Restoring your session...', 'ok');
    let me = null;
    try {
      const { data, error } = await sb.rpc('session_whoami');
      me = (!error && data && data.length) ? data[0] : null;
    } catch (e) { me = null; }
    if (!me){
      setAppSessionToken(null);
      clearMsg(authMsg);
      authSubmit.disabled = false;
      return;
    }
    clearMsg(authMsg);
    if (me.role === 'employee'){
      await enterAsEmployee({ id: me.user_id, username: me.username, name: me.name, active: true }, me.username, false);
    } else {
      await enterAsAdmin({ id: me.user_id, username: me.username, name: me.name, role: me.role }, me.username, false);
    }
    authSubmit.disabled = false;
  }

  // ---------- Logout & idle timeout ----------
  // Logout reloads the page so ALL in-memory data (ledger, customers, invoices,
  // DOM contents) is discarded. Hiding the screen alone left everything readable.
  const IDLE_LOGOUT_MS = 60 * 60 * 1000;   // 1 hour without activity
  const IDLE_FLAG_KEY = 'hm_idle_logout';
  let idleTimer = null;
  let idleListenersAttached = false;

  async function doLogout(reason){
    leaveGuardOff();      // deliberate exit: no "Leave site?" warning, and nothing to remind next time
    if (tickHandle) clearInterval(tickHandle);
    if (idleTimer) clearTimeout(idleTimer);
    currentEmployee = null;
    openSession = null;
    try {
      if (reason === 'idle') sessionStorage.setItem(IDLE_FLAG_KEY, '1');
    } catch (e) { /* storage unavailable: ignore */ }
    // Idle logout leaves the check-in OPEN (no auto check-out) but records it for the admin.
    if (reason === 'idle'){
      try { await Promise.race([attMarkIdleLogout(), new Promise(r => setTimeout(r, 2000))]); } catch (e) { /* ignore */ }
    }
    attStop();
    showScreen('auth');
    // Invalidate the session on the server (best effort, max 2s), then wipe memory.
    try {
      await Promise.race([sb.rpc('app_logout'), new Promise(r => setTimeout(r, 2000))]);
    } catch (e) { /* ignore: token also expires server-side */ }
    setAppSessionToken(null);
    window.location.reload();
  }

  function resetIdleTimer(){
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => doLogout('idle'), IDLE_LOGOUT_MS);
  }

  function startIdleWatch(){
    resetIdleTimer();
    if (idleListenersAttached) return;
    idleListenersAttached = true;
    ['click', 'keydown', 'touchstart', 'scroll', 'mousemove'].forEach(evt => {
      let last = 0;
      window.addEventListener(evt, () => {
        const now = Date.now();
        if (now - last < 5000) return;   // throttle: reset at most every 5s
        last = now;
        if (idleTimer) resetIdleTimer();
      }, { passive: true });
    });
  }

  document.getElementById('adminLogout').addEventListener('click', () => doLogout());
  document.getElementById('empLogout').addEventListener('click', () => doLogout());

  try {
    if (sessionStorage.getItem(IDLE_FLAG_KEY)){
      sessionStorage.removeItem(IDLE_FLAG_KEY);
      showMsg(authMsg, 'You were logged out due to inactivity. Please log in again.', 'err');
    }
  } catch (e) { /* ignore */ }

  // Wait until every script has loaded before restoring (the app functions it calls live in later files).
  window.addEventListener('load', restoreSession);
