// ---------- Password change (any user) + Boss tools: accounts, reset, requests ----------
  const PW_MIN_LENGTH = 8;

  function pwGenerate(){
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const buf = new Uint32Array(12);
    crypto.getRandomValues(buf);
    return Array.from(buf, n => chars[n % chars.length]).join('');
  }

  // Shared by the popup and the boss "My password" panel. Returns { ok, message }.
  async function pwChangeMine(current, next, confirm){
    if (!current || !next || !confirm) return { ok: false, message: 'Fill in all three fields.' };
    if (next !== confirm) return { ok: false, message: 'New passwords do not match.' };
    if (next.length < PW_MIN_LENGTH) return { ok: false, message: `New password must be at least ${PW_MIN_LENGTH} characters.` };
    if (next === current) return { ok: false, message: 'New password must be different from the current one.' };
    const { error } = await sb.rpc('change_my_password', { p_current: current, p_new: next });
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  }

  // ----- Popup shown at login when the boss asked this user to change their password -----
  const pwReqNote = document.getElementById('pwReqNote');
  const pwReqMsg = document.getElementById('pwReqMsg');
  const pwReqCurrent = document.getElementById('pwReqCurrent');
  const pwReqNew = document.getElementById('pwReqNew');
  const pwReqConfirm = document.getElementById('pwReqConfirm');
  const pwReqSave = document.getElementById('pwReqSave');

  async function pwCheckPending(){
    try {
      const { data, error } = await sb.rpc('my_pending_password_request');
      if (error || !data || !data.length) return;
      pwReqCurrent.value = ''; pwReqNew.value = ''; pwReqConfirm.value = '';
      clearMsg(pwReqMsg);
      showMsg(pwReqNote, data[0].message || 'Please change your password.', 'ok');
      openModal('pwReqModal');
    } catch (e) { /* no popup if the check fails */ }
  }

  pwReqSave.addEventListener('click', async () => {
    pwReqSave.disabled = true;
    const r = await pwChangeMine(pwReqCurrent.value, pwReqNew.value, pwReqConfirm.value);
    pwReqSave.disabled = false;
    if (!r.ok){ showMsg(pwReqMsg, r.message, 'err'); return; }
    pwReqCurrent.value = ''; pwReqNew.value = ''; pwReqConfirm.value = '';
    showMsg(pwReqMsg, 'Password changed.', 'ok');
    setTimeout(() => closeModal('pwReqModal'), 1200);
  });
  document.getElementById('pwReqLater').addEventListener('click', () => {
    pwReqCurrent.value = ''; pwReqNew.value = ''; pwReqConfirm.value = '';
    closeModal('pwReqModal');
  });

  // ----- Boss: create account -----
  const bossCreateMsg = document.getElementById('bossCreateMsg');
  const bossUsersMsg = document.getElementById('bossUsersMsg');

  document.getElementById('bossCreateBtn').addEventListener('click', async () => {
    const kind = document.getElementById('bossNewKind').value;
    const name = document.getElementById('bossNewName').value.trim();
    const username = document.getElementById('bossNewUsername').value.trim();
    const password = document.getElementById('bossNewPassword').value;
    if (!username || !password){ showMsg(bossCreateMsg, 'Username and password are required.', 'err'); return; }
    if (password.length < PW_MIN_LENGTH){ showMsg(bossCreateMsg, `Password must be at least ${PW_MIN_LENGTH} characters.`, 'err'); return; }

    const { error } = await sb.rpc('boss_create_user', { p_kind: kind, p_name: name, p_username: username, p_password: password });
    if (error){
      showMsg(bossCreateMsg, /duplicate/i.test(error.message) ? 'That username is already taken.' : error.message, 'err');
      return;
    }
    showMsg(bossCreateMsg, (kind === 'admin' ? 'Admin' : 'Employee') + ' created.', 'ok');
    document.getElementById('bossNewName').value = '';
    document.getElementById('bossNewUsername').value = '';
    document.getElementById('bossNewPassword').value = '';
    await bossRefresh();
    if (typeof loadEmployees === 'function') loadEmployees();
    if (typeof loadAdminStats === 'function') loadAdminStats();
  });

  // ----- Boss: accounts list -----
  async function bossLoadUsers(){
    const list = document.getElementById('bossUserList');
    const { data, error } = await sb.rpc('boss_list_users');
    if (error){ list.innerHTML = '<div class="empty">Could not load accounts.</div>'; return; }
    if (!data || !data.length){ list.innerHTML = '<div class="empty">No accounts yet.</div>'; return; }
    list.innerHTML = data.map(u => `
      <div class="emp-row">
        <div>
          <div class="emp-name">${escapeHtml(u.name) || '(no name)'}
            <span class="att-kind">${u.kind === 'admin' ? 'Admin' : 'Employee'}</span>
            ${u.active ? '' : '<span class="cust-meta" style="color:var(--red);">(deactivated)</span>'}
            ${u.pending_request ? '<span class="att-badge amber">Password change pending</span>' : ''}
          </div>
          <div class="emp-username">${escapeHtml(u.username)}</div>
        </div>
        <div class="boss-actions">
          <button class="btn ghost boss-act" data-act="att" data-kind="${u.kind}" data-id="${u.id}" data-name="${escapeHtml(u.name || u.username)}">Attendance</button>
          <button class="btn ghost boss-act" data-act="reset" data-kind="${u.kind}" data-id="${u.id}" data-name="${escapeHtml(u.name || u.username)}">Reset password</button>
          <button class="btn ghost boss-act" data-act="ask" data-kind="${u.kind}" data-id="${u.id}" data-name="${escapeHtml(u.name || u.username)}">Ask to change</button>
          <button class="btn ${u.active ? 'red' : 'moss'} boss-act" data-act="toggle" data-kind="${u.kind}" data-id="${u.id}" data-active="${u.active}" data-name="${escapeHtml(u.name || u.username)}">${u.active ? 'Deactivate' : 'Reactivate'}</button>
        </div>
      </div>`).join('');
  }

  document.getElementById('bossUserList').addEventListener('click', e => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const { act, kind, id, name } = btn.dataset;
    if (act === 'att') bossShowAttendance(kind, id, name);
    if (act === 'reset') bossOpenReset(kind, id, name);
    if (act === 'ask') bossAsk('one', kind, id, name);
    if (act === 'toggle') bossToggle(kind, id, btn.dataset.active === 'true', name);
  });

  function bossToggle(kind, id, isActive, name){
    const verb = isActive ? 'Deactivate' : 'Reactivate';
    showConfirm(`${verb} ${name}?` + (isActive ? ' They will be logged out and cannot log in.' : ''), async () => {
      const { error } = await sb.rpc('boss_set_user_active', { p_kind: kind, p_id: id, p_active: !isActive });
      if (error){ showMsg(bossUsersMsg, error.message, 'err'); return; }
      showMsg(bossUsersMsg, `${name} ${isActive ? 'deactivated' : 'reactivated'}.`, 'ok');
      await bossRefresh();
      if (typeof loadEmployees === 'function') loadEmployees();
      if (typeof loadAdminStats === 'function') loadAdminStats();
    }, verb);
  }

  async function bossAsk(scope, kind, id, name){
    const run = async () => {
      const { data, error } = await sb.rpc('boss_request_password_change',
        { p_scope: scope, p_kind: kind || null, p_id: id || null, p_message: null });
      if (error){ showMsg(bossUsersMsg, error.message, 'err'); return; }
      showMsg(bossUsersMsg, scope === 'everyone' ? `Request sent to ${data} user(s).` : `Request sent to ${name}.`, 'ok');
      await bossRefresh();
    };
    if (scope === 'everyone') showConfirm('Ask EVERY employee and admin to change their password at next login?', run, 'Send to everyone');
    else run();
  }
  document.getElementById('bossAskAllBtn').addEventListener('click', () => bossAsk('everyone'));

  // ----- Boss: reset password (new password shown once) -----
  const bossResetMsg = document.getElementById('bossResetMsg');
  const bossResetPassword = document.getElementById('bossResetPassword');
  const bossResetForm = document.getElementById('bossResetForm');
  const bossResetShown = document.getElementById('bossResetShown');
  const bossResetValue = document.getElementById('bossResetValue');
  const bossResetConfirm = document.getElementById('bossResetConfirm');
  const bossResetCancel = document.getElementById('bossResetCancel');
  let bossResetTarget = null;

  function bossOpenReset(kind, id, name){
    bossResetTarget = { kind, id, name };
    document.getElementById('bossResetTitle').textContent = 'Reset password: ' + name;
    bossResetPassword.value = '';
    clearMsg(bossResetMsg);
    bossResetForm.style.display = '';
    bossResetShown.style.display = 'none';
    bossResetValue.textContent = '';
    bossResetConfirm.style.display = '';
    bossResetConfirm.disabled = false;
    bossResetCancel.textContent = 'Cancel';
    openModal('bossResetModal');
  }
  document.getElementById('bossResetGenerate').addEventListener('click', () => { bossResetPassword.value = pwGenerate(); });
  bossResetCancel.addEventListener('click', () => {
    bossResetValue.textContent = '';           // wipe the shown password from the page
    bossResetPassword.value = '';
    bossResetTarget = null;
    closeModal('bossResetModal');
  });
  bossResetConfirm.addEventListener('click', async () => {
    const pw = bossResetPassword.value;
    if (pw.length < PW_MIN_LENGTH){ showMsg(bossResetMsg, `Password must be at least ${PW_MIN_LENGTH} characters.`, 'err'); return; }
    bossResetConfirm.disabled = true;
    const { error } = await sb.rpc('boss_reset_password', { p_kind: bossResetTarget.kind, p_id: bossResetTarget.id, p_new: pw });
    if (error){ bossResetConfirm.disabled = false; showMsg(bossResetMsg, error.message, 'err'); return; }
    showMsg(bossResetMsg, 'Password set. The user was logged out everywhere.', 'ok');
    bossResetForm.style.display = 'none';
    bossResetPassword.value = '';
    bossResetValue.textContent = pw;
    bossResetShown.style.display = '';
    bossResetConfirm.style.display = 'none';
    bossResetCancel.textContent = 'Close';
    bossRefresh();
  });

  // ----- Boss: attendance history of one employee / admin -----
  async function bossShowAttendance(kind, id, name){
    document.getElementById('bossAttTitle').textContent = 'Attendance: ' + name + (kind === 'admin' ? ' (Admin)' : '');
    const body = document.getElementById('bossAttBody');
    const summary = document.getElementById('bossAttSummary');
    body.innerHTML = '<div class="empty">Loading...</div>';
    summary.textContent = '';
    openModal('bossAttModal');

    const col = kind === 'admin' ? 'admin_id' : 'employee_id';
    const { data, error } = await sb.from('checkins')
      .select('check_in, check_out, duration_seconds, forgot_checkout, idle_logout_at')
      .eq(col, id).order('check_in', { ascending: false }).limit(60);
    if (error){ body.innerHTML = '<div class="empty">Could not load attendance.</div>'; return; }
    if (!data || !data.length){ body.innerHTML = '<div class="empty">No attendance records yet.</div>'; return; }

    const tm = v => new Date(v).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const dur = sec => { const m = Math.max(0, Math.round(sec / 60)); return `${Math.floor(m / 60)}h ${m % 60}m`; };
    let totalSec = 0;
    body.innerHTML = data.map(r => {
      const open = !r.check_out;
      if (!open) totalSec += (r.duration_seconds || 0);
      const durText = open ? dur((Date.now() - new Date(r.check_in).getTime()) / 1000) : dur(r.duration_seconds || 0);
      const flags = [];
      if (open) flags.push('<span class="att-badge amber">On shift / not checked out</span>');
      if (r.forgot_checkout) flags.push('<span class="att-badge red">Forgot to check out</span>');
      if (r.idle_logout_at) flags.push(`<span class="att-badge amber">Idle logout ${tm(r.idle_logout_at)}</span>`);
      return `
        <div class="req-row">
          <div>
            <div class="emp-name">${formatDMY(new Date(r.check_in))}</div>
            <div class="att-sub">In ${tm(r.check_in)} &rarr; Out ${open ? '-' : tm(r.check_out)} &middot; ${durText}</div>
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">${flags.join('')}</div>
        </div>`;
    }).join('');
    summary.textContent = `Last ${data.length} session(s). Total of completed sessions: ${dur(totalSec)}`;
  }
  document.getElementById('bossAttClose').addEventListener('click', () => closeModal('bossAttModal'));

  // ----- Boss: request list (pending / done) -----
  async function bossLoadRequests(){
    const list = document.getElementById('bossRequestList');
    const { data, error } = await sb.rpc('boss_list_password_requests');
    if (error){ list.innerHTML = '<div class="empty">Could not load requests.</div>'; return; }
    if (!data || !data.length){ list.innerHTML = '<div class="empty">No password requests yet.</div>'; return; }
    const fmt = v => formatDMY(new Date(v)) + ' ' + new Date(v).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    list.innerHTML = data.map(r => `
      <div class="req-row">
        <div>
          <div class="emp-name">${escapeHtml(r.name || r.username || 'Unknown')} <span class="att-kind">${r.kind === 'admin' ? 'Admin' : 'Employee'}</span></div>
          <div class="att-sub">Sent ${fmt(r.created_at)}${r.completed_at ? ' · Done ' + fmt(r.completed_at) : ''}</div>
        </div>
        <span class="att-badge ${r.status === 'done' ? 'ok' : 'amber'}">${r.status === 'done' ? 'Done' : 'Pending'}</span>
      </div>`).join('');
  }

  async function bossRefresh(){ await Promise.all([bossLoadUsers(), bossLoadRequests()]); }
  const bossTabBtn = document.querySelector('.tab-btn[data-tab="admin-security"]');
  if (bossTabBtn) bossTabBtn.addEventListener('click', bossRefresh);

  // ----- Boss: my own password -----
  document.getElementById('bossPwBtn').addEventListener('click', async () => {
    const msg = document.getElementById('bossPwMsg');
    const cur = document.getElementById('bossPwCurrent'), nw = document.getElementById('bossPwNew'), cf = document.getElementById('bossPwConfirm');
    const r = await pwChangeMine(cur.value, nw.value, cf.value);
    if (!r.ok){ showMsg(msg, r.message, 'err'); return; }
    cur.value = ''; nw.value = ''; cf.value = '';
    showMsg(msg, 'Your password was changed.', 'ok');
  });
