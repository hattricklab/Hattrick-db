// ---------- Attendance: forced check-in, reminders, heartbeat, admin overview ----------
  // Works for both employees (checkins.employee_id) and admins (checkins.admin_id).
  const ATT_STALE_MS = 14 * 3600 * 1000;      // open session older than this = "forgot to check out"
  const ATT_LIMIT_MS = 4 * 3600 * 1000;       // reminder starts after 4 hours
  const ATT_SNOOZE_MS = 30 * 60 * 1000;       // reminder repeats every 30 min
  const ATT_HEARTBEAT_MS = 5 * 60 * 1000;     // last_seen update interval
  const ATT_OFFLINE_MS = 10 * 60 * 1000;      // no heartbeat for this long = offline
  const ATT_DASH_REFRESH_MS = 60 * 1000;

  let attActor = null;                        // { kind: 'admin' | 'employee', id, name }
  let attSession = null;                      // the open checkins row, or null
  let attGateMode = null;                     // 'checkin' | 'stale' | 'notice' | 'reminder' | 'error' | null
  let attGateActions = { primary: null, secondary: null };
  let attNextReminderAt = 0;
  let attHeartbeatHandle = null, attWatchHandle = null, attDashHandle = null, attClockHandle = null;

  const attGate = document.getElementById('attGate');
  const attGateTitle = document.getElementById('attGateTitle');
  const attGateText = document.getElementById('attGateText');
  const attGatePrimary = document.getElementById('attGatePrimary');
  const attGateSecondary = document.getElementById('attGateSecondary');
  const attGateMsg = document.getElementById('attGateMsg');

  function attFmtTime(v){ return new Date(v).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); }
  function attFmtDateTime(v){ const d = new Date(v); return formatDMY(d) + ' ' + attFmtTime(d); }
  function attFmtDur(ms){ const m = Math.max(0, Math.floor(ms / 60000)); return `${Math.floor(m / 60)}h ${m % 60}m`; }
  function attActorCol(){ return attActor.kind === 'admin' ? 'admin_id' : 'employee_id'; }
  const ATT_SESSION_COLS = 'id, check_in, last_seen, idle_logout_at';

  // ----- Database operations -----
  async function attFetchOpenSession(){
    const { data, error } = await sb.from('checkins').select(ATT_SESSION_COLS)
      .eq(attActorCol(), attActor.id).is('check_out', null)
      .order('check_in', { ascending: false }).limit(1);
    if (error) return { error };
    return { session: (data && data.length) ? data[0] : null };
  }

  async function attPunchIn(){
    const nowIso = new Date().toISOString();
    const row = { actor_name: attActor.name, check_in: nowIso, last_seen: nowIso };
    row[attActorCol()] = attActor.id;
    const { data, error } = await sb.from('checkins').insert(row).select(ATT_SESSION_COLS).single();
    if (error || !data) return { ok: false, error };
    attSession = data;
    attAfterSessionChange();
    return { ok: true };
  }

  async function attPunchOut(){
    if (!attSession) return { ok: false };
    const out = new Date();
    const durationSec = Math.round((out.getTime() - new Date(attSession.check_in).getTime()) / 1000);
    const { error } = await sb.from('checkins')
      .update({ check_out: out.toISOString(), duration_seconds: durationSec, last_seen: out.toISOString(), idle_logout_at: null })
      .eq('id', attSession.id);
    if (error) return { ok: false, error };
    attSession = null;
    attAfterSessionChange();
    attLogoutAfterCheckout();
    return { ok: true };
  }

  // Checking out ends the day: show a short "checked out" screen, then log out.
  function attLogoutAfterCheckout(){
    if (!attActor || (attActor.kind !== 'employee' && attActor.kind !== 'admin')) return;
    attShowGate('bye');
    setTimeout(() => { doLogout(); }, 1500);
  }

  // Close an old, never-checked-out session at the last time we saw the person active.
  async function attCloseStale(){
    const ci = new Date(attSession.check_in).getTime();
    const ls = attSession.last_seen ? new Date(attSession.last_seen).getTime() : 0;
    const closeAt = new Date(ls > ci ? ls : ci);
    const durationSec = Math.round((closeAt.getTime() - ci) / 1000);
    const { error } = await sb.from('checkins')
      .update({ check_out: closeAt.toISOString(), duration_seconds: durationSec, forgot_checkout: true, idle_logout_at: null })
      .eq('id', attSession.id);
    if (error) return { ok: false, error };
    attSession = null;
    return { ok: true };
  }

  async function attHeartbeat(){
    if (!attSession) return;
    try { await sb.from('checkins').update({ last_seen: new Date().toISOString() }).eq('id', attSession.id); } catch (e) { /* ignore */ }
  }

  // Called by login.js right before an idle auto-logout (while the token is still valid).
  async function attMarkIdleLogout(){
    if (!attSession) return;
    try { await sb.from('checkins').update({ idle_logout_at: new Date().toISOString() }).eq('id', attSession.id); } catch (e) { /* ignore */ }
  }

  // ----- Gate / reminder overlay (black & white, cannot be dismissed) -----
  function attShowGate(mode, extra){
    attGateMode = mode;
    const name = attActor ? attActor.name : '';
    const elapsed = attSession ? Date.now() - new Date(attSession.check_in).getTime() : 0;
    let cfg;
    if (mode === 'checkin'){
      cfg = { title: 'Check in to start', text: `Hello ${name}. You must check in before you can use the app.`,
              p: ['Check In', attGateCheckIn], s: ['Log out', attGateLogout] };
    } else if (mode === 'stale'){
      cfg = { title: "You didn't check out last time",
              text: `Your check-in on ${attFmtDateTime(attSession.check_in)} was never closed. It will be marked "forgot to check out" (the admin will see this) and you will check in fresh now.`,
              p: ['Mark it & Check In', attGateStale], s: ['Log out', attGateLogout] };
    } else if (mode === 'notice'){
      cfg = { title: 'Session timed out',
              text: `You were logged out at ${attFmtTime(attSession.idle_logout_at)} because of inactivity. You are still checked in since ${attFmtTime(attSession.check_in)}. Remember to check out when you finish.`,
              p: ['Continue', attGateNotice], s: ['Check out now', attGateCheckOut] };
    } else if (mode === 'reminder'){
      cfg = { title: 'Time to check out?',
              text: `You have been checked in for ${attFmtDur(elapsed)}. Please check out when you finish your shift.`,
              p: ['Check out now', attGateCheckOut], s: ['Remind me in 30 min', attGateSnooze] };
    } else if (mode === 'bye'){
      cfg = { title: 'Checked out', text: `Thanks ${name}. You are checked out. Logging you out now...`,
              p: ['', null], s: ['', null] };
    } else {
      cfg = { title: "Couldn't load attendance", text: extra || 'Check your internet connection and try again.',
              p: ['Retry', attGateRetry], s: ['Log out', attGateLogout] };
    }
    attGateTitle.textContent = cfg.title;
    attGateText.textContent = cfg.text;
    attGatePrimary.textContent = cfg.p[0];
    attGateSecondary.textContent = cfg.s[0];
    attGateActions = { primary: cfg.p[1], secondary: cfg.s[1] };
    attGateMsg.textContent = '';
    attGatePrimary.disabled = false;
    attGateSecondary.disabled = false;
    const showButtons = mode !== 'bye';
    attGatePrimary.style.display = showButtons ? '' : 'none';
    attGateSecondary.style.display = showButtons ? '' : 'none';
    attGate.style.display = 'flex';
  }

  function attHideGate(){
    const previousMode = attGateMode;
    attGateMode = null;
    attGateActions = { primary: null, secondary: null };
    attGate.style.display = 'none';
    // After check-in, the Today's Tasks list floats in (employees only; ignored otherwise).
    if (previousMode && typeof taskOnGateClosed === 'function') taskOnGateClosed(previousMode);
  }

  async function attRunGate(which){
    const fn = attGateActions[which];
    if (!fn) return;
    attGatePrimary.disabled = true;
    attGateSecondary.disabled = true;
    attGateMsg.textContent = '';
    try { await fn(); } catch (e) { attGateMsg.textContent = 'Something went wrong. Please try again.'; }
    if (attGateMode){ attGatePrimary.disabled = false; attGateSecondary.disabled = false; }
  }
  attGatePrimary.addEventListener('click', () => attRunGate('primary'));
  attGateSecondary.addEventListener('click', () => attRunGate('secondary'));

  const ATT_SAVE_FAIL = 'Could not save. Check your connection and try again.';
  async function attGateCheckIn(){
    const r = await attPunchIn();
    if (!r.ok){ attGateMsg.textContent = ATT_SAVE_FAIL; return; }
    attHideGate();
  }
  async function attGateStale(){
    const c = await attCloseStale();
    if (!c.ok){ attGateMsg.textContent = ATT_SAVE_FAIL; return; }
    const r = await attPunchIn();
    if (!r.ok){ attGateMsg.textContent = ATT_SAVE_FAIL; attAfterSessionChange(); return; }
    attHideGate();
  }
  async function attGateNotice(){
    const { error } = await sb.from('checkins').update({ idle_logout_at: null }).eq('id', attSession.id);
    if (error){ attGateMsg.textContent = ATT_SAVE_FAIL; return; }
    attSession.idle_logout_at = null;
    attHideGate();
  }
  async function attGateCheckOut(){
    const r = await attPunchOut();
    if (!r.ok){ attGateMsg.textContent = ATT_SAVE_FAIL; return; }
    // attPunchOut already switched to the "Checked out" screen and will log out.
  }
  async function attGateSnooze(){
    attNextReminderAt = Date.now() + ATT_SNOOZE_MS;
    attHideGate();
  }
  async function attGateRetry(){ await attInit(attActor); }
  async function attGateLogout(){ await doLogout(); }

  // ----- Session lifecycle -----
  function attAfterSessionChange(){
    if (attActor && attActor.kind === 'employee'){
      openSession = attSession;
      try { renderTimer(); } catch (e) { /* employee screen not ready */ }
    }
    if (attActor && attActor.kind === 'admin'){
      attRenderAdminWidget();
      attLoadDashboard();
    }
    if (attHeartbeatHandle){ clearInterval(attHeartbeatHandle); attHeartbeatHandle = null; }
    if (attSession) attHeartbeatHandle = setInterval(attHeartbeat, ATT_HEARTBEAT_MS);
    attNextReminderAt = 0;
  }

  function attWatchTick(){
    if (!attActor || !attSession || attActor.kind !== 'employee' || attGateMode) return;
    const elapsed = Date.now() - new Date(attSession.check_in).getTime();
    if (elapsed >= ATT_LIMIT_MS && Date.now() >= attNextReminderAt) attShowGate('reminder');
  }

  async function attInit(actor){
    attStop();
    attActor = actor;
    if (actor.kind === 'boss'){
      // The boss has no check-in rules: no popup, no timer, no heartbeat. Only the overview card.
      const wrap = document.getElementById('admClockWrap');
      if (wrap) wrap.style.display = 'none';
      attLoadDashboard();
      attStartDashRefresh();
      return;
    }
    const res = await attFetchOpenSession();
    if (res.error){ attShowGate('error'); return; }
    attSession = res.session;
    attAfterSessionChange();

    if (!attSession){
      attShowGate('checkin');
    } else if (Date.now() - new Date(attSession.check_in).getTime() > ATT_STALE_MS){
      attShowGate('stale');
    } else if (attSession.idle_logout_at){
      attShowGate('notice');
    }

    attWatchHandle = setInterval(attWatchTick, 30 * 1000);
    if (actor.kind === 'admin'){
      attClockHandle = setInterval(attRenderAdminWidget, 1000);
      attStartDashRefresh();
    }
  }

  function attStartDashRefresh(){
    attDashHandle = setInterval(() => {
      const panel = document.getElementById('tab-admin-dashboard');
      if (panel && panel.classList.contains('active')) attLoadDashboard();
    }, ATT_DASH_REFRESH_MS);
  }

  function attStop(){
    [attHeartbeatHandle, attWatchHandle, attDashHandle, attClockHandle].forEach(h => { if (h) clearInterval(h); });
    attHeartbeatHandle = attWatchHandle = attDashHandle = attClockHandle = null;
    attHideGate();
    attActor = null;
    attSession = null;
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) attHeartbeat(); });

  // ----- Admin: own check-in widget (header) -----
  const admStatusTag = document.getElementById('admStatusTag');
  const admStatusText = document.getElementById('admStatusText');
  const admTimer = document.getElementById('admTimer');
  const admPunchBtn = document.getElementById('admPunchBtn');

  function attRenderAdminWidget(){
    if (attSession){
      admTimer.textContent = formatElapsed(Date.now() - new Date(attSession.check_in).getTime());
      admTimer.classList.remove('idle');
      admStatusTag.classList.add('active');
      admStatusText.textContent = 'On shift';
      admPunchBtn.textContent = 'Check Out';
      admPunchBtn.className = 'punch-btn out';
    } else {
      admTimer.textContent = '00:00:00';
      admTimer.classList.add('idle');
      admStatusTag.classList.remove('active');
      admStatusText.textContent = 'Off shift';
      admPunchBtn.textContent = 'Check In';
      admPunchBtn.className = 'punch-btn in';
    }
  }
  admPunchBtn.addEventListener('click', async () => {
    admPunchBtn.disabled = true;
    if (!attSession) await attPunchIn(); else await attPunchOut();
    admPunchBtn.disabled = false;
  });

  // ----- Admin: dashboard "on shift now" card -----
  async function attLoadDashboard(){
    const body = document.getElementById('attDashBody');
    if (!body) return;
    const { data, error } = await sb.from('checkins')
      .select('id, check_in, last_seen, idle_logout_at, actor_name, employee_id, admin_id, employees(name, username)')
      .is('check_out', null).order('check_in', { ascending: true });
    if (error){ body.innerHTML = '<div class="empty">Could not load attendance.</div>'; return; }
    if (!data || data.length === 0){ body.innerHTML = '<div class="empty">Nobody is checked in right now.</div>'; return; }

    const now = Date.now();
    const rows = data.map(r => {
      const emp = r.employees || {};
      const name = r.actor_name || emp.name || emp.username || 'Unknown';
      const elapsed = now - new Date(r.check_in).getTime();
      const lastSeen = new Date(r.last_seen || r.check_in).getTime();
      const offline = now - lastSeen > ATT_OFFLINE_MS;
      let level = 'ok', badge = 'Active';
      if (elapsed > ATT_STALE_MS){ level = 'red'; badge = `Forgot to check out? (since ${attFmtDateTime(r.check_in)})`; }
      else if (elapsed >= ATT_LIMIT_MS){ level = 'red'; badge = 'Not checked out (4h+)'; }
      else if (offline){ level = 'amber'; badge = 'Offline'; }
      const notes = [];
      if (offline) notes.push(`Last seen ${attFmtTime(lastSeen)}`);
      if (r.idle_logout_at) notes.push(`Idle logout at ${attFmtTime(r.idle_logout_at)}`);
      return { name, kind: r.admin_id ? 'Admin' : 'Employee', checkedIn: attFmtTime(r.check_in),
               hours: attFmtDur(elapsed), level, badge, notes: notes.join(' · '), rank: level === 'red' ? 0 : (level === 'amber' ? 1 : 2) };
    }).sort((a, b) => a.rank - b.rank);

    body.innerHTML = rows.map(r => `
      <div class="att-row">
        <div>
          <div class="att-name">${escapeHtml(r.name)} <span class="att-kind">${r.kind}</span></div>
          <div class="att-sub">In at ${r.checkedIn} · ${r.hours}${r.notes ? ' · ' + escapeHtml(r.notes) : ''}</div>
        </div>
        <span class="att-badge ${r.level}">${escapeHtml(r.badge)}</span>
      </div>`).join('');
  }
  const attDashRefreshBtn = document.getElementById('attDashRefresh');
  if (attDashRefreshBtn) attDashRefreshBtn.addEventListener('click', attLoadDashboard);
