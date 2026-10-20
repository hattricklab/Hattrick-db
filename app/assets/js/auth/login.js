// ---------- Login ----------
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const authSubmit = document.getElementById('authSubmit');
  const authMsg = document.getElementById('authMsg');

  let currentEmployee = null;
  let syncInvInvoiceDate = () => {};
  let syncAcctFilterDate = () => {};
  let syncExpDate = () => {};
  let openSession = null;
  let tickHandle = null;

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
      usernameInput.value = ''; passwordInput.value = '';
      showScreen('admin');
      startIdleWatch();
      await Promise.allSettled([
        loadEmployees(),
        loadServices(),
        pkgLoadServiceSelector(),
        pkgLoadList(),
        loadAdminCustomers(),
        loadAdminStats(),
        acctRefreshAdminOverview(),
        loadDashboardAccountsCard()
      ]);
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
    currentEmployee = data;
    usernameInput.value = ''; passwordInput.value = '';
    document.getElementById('empGreeting').textContent = data.name || data.username;
    showScreen('employee');
    startIdleWatch();
    await loadOpenSession();
    await Promise.allSettled([
      loadHistory(),
      loadCustomers(),
      suggestNextPatientId(),
      invLoadInitialData(),
      acctRefreshEmployeeAccounts()
    ]);
    startTicking();
  });

  // ---------- Logout & idle timeout ----------
  // Logout reloads the page so ALL in-memory data (ledger, customers, invoices,
  // DOM contents) is discarded. Hiding the screen alone left everything readable.
  const IDLE_LOGOUT_MS = 20 * 60 * 1000;   // 20 minutes without activity
  const IDLE_FLAG_KEY = 'hm_idle_logout';
  let idleTimer = null;
  let idleListenersAttached = false;

  async function doLogout(reason){
    if (tickHandle) clearInterval(tickHandle);
    if (idleTimer) clearTimeout(idleTimer);
    currentEmployee = null;
    openSession = null;
    try {
      if (reason === 'idle') sessionStorage.setItem(IDLE_FLAG_KEY, '1');
    } catch (e) { /* storage unavailable: ignore */ }
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
