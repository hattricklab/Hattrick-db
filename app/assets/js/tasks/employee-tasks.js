  // ---------- Employee: Today's Tasks (calm list, pending, request a help) ----------
  const TASK_CHEERS = [
    'Wonderful, {n}! One more done', 'Nicely done, {n}!', 'You are on a roll, {n}!',
    'Lovely work, {n}. Keep going', 'That is how it is done, {n}!', 'Smooth and steady, {n}. Great job!'
  ];
  const TASK_ALL_DONE = [
    'All done for today, {n}! Take a deep breath, you earned it.',
    'Every task finished, {n}! What a calm, productive day.'
  ];
  const TASK_CONFETTI_COLORS = ['#5f8f7b', '#e9b44c', '#e07a5f', '#8a84e2', '#7fc8a9', '#f2a65a'];
  const TASK_REPEAT_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };

  let taskItems = [];        // task_list_mine rows
  let taskRequests = [];     // task_my_requests rows
  let taskAdmins = [];       // admins I can ask for help
  let taskSub = 'today';
  let taskToastTimer = null;
  let taskAllDoneShown = false;

  const taskEl = id => document.getElementById(id);
  function taskMyName(){ return (typeof currentEmployee !== 'undefined' && currentEmployee) ? (currentEmployee.name || currentEmployee.username || '') : ''; }
  function taskFirstName(){ return (taskMyName().trim().split(/\s+/)[0]) || 'friend'; }
  function taskTodayStr(){ return istDateStr(nowIST()); }
  function taskPick(list){ return list[Math.floor(Math.random() * list.length)].replace('{n}', taskFirstName()); }

  function taskDaysBetween(fromStr, toStr){
    const a = fromStr.split('-').map(Number), b = toStr.split('-').map(Number);
    return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
  }
  function taskTime(v){ return new Date(v).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); }

  function taskGreeting(){
    const h = nowIST().getUTCHours();
    const part = h < 12 ? 'Good morning' : (h < 17 ? 'Good afternoon' : 'Good evening');
    return `${part}, ${taskFirstName()}`;
  }

  // ----- Rendering -----
  function taskChips(t){
    let html = '';
    if (t.priority === 'urgent') html += '<span class="tk-chip urgent">Urgent</span>';
    if (t.repeat_kind && t.repeat_kind !== 'none') html += `<span class="tk-chip repeat">${TASK_REPEAT_LABEL[t.repeat_kind] || ''}</span>`;
    if (t.status === 'waiting') html += '<span class="tk-chip waiting">Waiting for reply</span>';
    return html;
  }

  function taskMeta(t){
    const parts = [];
    if (t.assigned_by) parts.push('From ' + escapeHtml(t.assigned_by));
    if (t.status === 'done'){
      parts.push('Done at ' + taskTime(t.completed_at));
    } else {
      const diff = taskDaysBetween(t.due_date, taskTodayStr());
      if (diff > 0) parts.push(`<span class="late">Overdue by ${diff} day${diff > 1 ? 's' : ''}</span>`);
      else parts.push('Due today');
    }
    return parts.join(' &middot; ');
  }

  const TASK_CHECK_SVG = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  function taskCardHtml(t, index, animate){
    const done = t.status === 'done';
    const waiting = t.status === 'waiting';
    const cls = ['task-card'];
    if (t.priority === 'urgent') cls.push('urgent');
    if (waiting) cls.push('waiting');
    if (done) cls.push('is-done');
    if (animate) cls.push('tk-enter');
    const from = escapeHtml(t.assigned_by || 'the admin');

    let notes = '';
    if (t.help_message && (waiting || t.admin_reply)){
      notes += `<div class="task-note-box ask"><b>You asked</b>${escapeHtml(t.help_message)}</div>`;
    }
    if (t.admin_reply){
      notes += `<div class="task-note-box reply"><b>Reply from ${from}</b>${escapeHtml(t.admin_reply)}</div>`;
    }
    if (done && t.completion_note){
      notes += `<div class="task-note-box reply"><b>Your update</b>${escapeHtml(t.completion_note)}</div>`;
    }

    let actions = '';
    if (t.description) actions += '<button type="button" class="task-link task-toggle">Details</button>';
    if (t.status === 'pending') actions += '<button type="button" class="task-link help task-help-btn">Need help?</button>';

    const forms = done ? '' : `
      <div class="task-inline" data-form="complete" hidden>
        <textarea class="task-textarea task-note" maxlength="500" placeholder="Add a quick update for the admin (optional)"></textarea>
        <div class="task-inline-row">
          <button type="button" class="tk-btn ghost task-cancel">Cancel</button>
          <button type="button" class="tk-btn task-confirm-done">Mark as done</button>
        </div>
      </div>
      <div class="task-inline" data-form="help" hidden>
        <textarea class="task-textarea task-helptext" maxlength="500" placeholder="Why can't you do this, or what is your doubt? This goes to ${from}."></textarea>
        <div class="task-inline-row">
          <button type="button" class="tk-btn ghost task-cancel">Cancel</button>
          <button type="button" class="tk-btn lav task-send-help">Send to ${from}</button>
        </div>
      </div>`;

    return `
      <div class="${cls.join(' ')}" data-id="${t.instance_id}" style="--i:${index}">
        <button type="button" class="task-check" aria-label="${done ? 'Completed' : 'Mark as done'}"${done ? ' disabled' : ''}>${TASK_CHECK_SVG}</button>
        <div class="task-main">
          <div class="task-title-row"><span class="task-title">${escapeHtml(t.title)}</span>${taskChips(t)}</div>
          <div class="task-meta">${taskMeta(t)}</div>
          ${t.description ? `<div class="task-desc" hidden>${escapeHtml(t.description)}</div>` : ''}
          ${notes}
          ${actions ? `<div class="task-actions">${actions}</div>` : ''}
          ${forms}
        </div>
      </div>`;
  }

  function taskGroups(){
    const today = taskTodayStr();
    const todays = taskItems.filter(t => (t.status === 'pending' && t.due_date === today) || t.status === 'done')
      .sort((a, b) => (a.status === 'done') - (b.status === 'done'));
    const waiting = taskItems.filter(t => t.status === 'waiting');
    const carried = taskItems.filter(t => t.status === 'pending' && t.due_date < today);
    const totalToday = taskItems.filter(t => t.due_date === today || t.status === 'done').length;
    const doneToday = taskItems.filter(t => t.status === 'done').length;
    return { todays, waiting, carried, totalToday, doneToday };
  }

  function taskRenderRing(done, total){
    const C = 2 * Math.PI * 34;
    const fg = taskEl('tkRingFg');
    fg.style.strokeDasharray = String(C);
    fg.style.strokeDashoffset = String(total ? C * (1 - done / total) : C);
    taskEl('tkRingText').textContent = `${done}/${total}`;
  }

  function taskRender(animate){
    const g = taskGroups();
    taskEl('tkHello').textContent = taskGreeting();
    taskEl('tkDate').textContent = new Date(Date.now() + 5.5 * 3600000).toLocaleDateString('en-GB',
      { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
    taskRenderRing(g.doneToday, g.totalToday);

    // Today
    const todayBox = taskEl('tkTodayList');
    if (!g.todays.length){
      todayBox.innerHTML = '<div class="tk-empty"><span class="big">&#127807;</span>Nothing on your list today. Enjoy the calm.</div>';
    } else {
      const allDone = g.todays.every(t => t.status === 'done');
      todayBox.innerHTML = (allDone ? '<div class="tk-allclear">All done for today. Lovely work!</div>' : '')
        + g.todays.map((t, i) => taskCardHtml(t, i, animate)).join('');
    }

    // Pending
    const pendBox = taskEl('tkPendingList');
    let pend = '';
    if (g.waiting.length){
      pend += '<div class="tk-group-title">Waiting for reply</div>' + g.waiting.map((t, i) => taskCardHtml(t, i, animate)).join('');
    }
    if (g.carried.length){
      pend += '<div class="tk-group-title">Carried over, still to do</div>' + g.carried.map((t, i) => taskCardHtml(t, i, animate)).join('');
    }
    pendBox.innerHTML = pend || '<div class="tk-empty"><span class="big">&#10024;</span>Nothing pending. You are all caught up.</div>';

    // Badges
    const pendingCount = g.waiting.length + g.carried.length;
    [taskEl('tkPendingBadge'), taskEl('taskTabBadge')].forEach(b => {
      b.textContent = String(pendingCount);
      b.hidden = pendingCount === 0;
    });

    taskRenderRequests();
  }

  // ----- Request a help (employee -> admin) -----
  const TASK_REQ_STATUS = { pending: 'Waiting for admin', waiting: 'Waiting for admin', done: 'Done', cancelled: 'Cancelled' };

  function taskRenderRequests(){
    const sel = taskEl('tkReqAdmin');
    const keep = sel.value;
    sel.innerHTML = taskAdmins.length
      ? taskAdmins.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('')
      : '<option value="">No admin available</option>';
    if (keep && taskAdmins.some(a => a.id === keep)) sel.value = keep;

    const list = taskEl('tkRequestList');
    if (!taskRequests.length){
      list.innerHTML = '<div class="tk-empty"><span class="big">&#128172;</span>You have not asked for any help yet.</div>';
      return;
    }
    list.innerHTML = taskRequests.map(r => {
      const st = r.status === 'waiting' ? 'pending' : r.status;
      return `
      <div class="task-card ${r.priority === 'urgent' ? 'urgent' : ''} ${r.status === 'done' ? 'is-done' : ''}" data-task="${r.task_id}">
        <div class="task-main">
          <div class="task-title-row"><span class="task-title">${escapeHtml(r.title)}</span>
            ${r.priority === 'urgent' ? '<span class="tk-chip urgent">Urgent</span>' : ''}
            <span class="tk-chip ${st}">${TASK_REQ_STATUS[r.status] || r.status}</span></div>
          <div class="task-meta">To ${escapeHtml(r.assigned_to || 'admin')} &middot; ${formatDMY(r.created_at)}${r.completed_at ? ' &middot; Done ' + formatDMY(r.completed_at) + ' ' + taskTime(r.completed_at) : ''}</div>
          ${r.description ? `<div class="task-desc">${escapeHtml(r.description)}</div>` : ''}
          ${r.completion_note ? `<div class="task-note-box reply"><b>Update from ${escapeHtml(r.assigned_to || 'admin')}</b>${escapeHtml(r.completion_note)}</div>` : ''}
          ${r.status === 'pending' || r.status === 'waiting' ? '<div class="task-actions"><button type="button" class="task-link task-cancel-request">Cancel request</button></div>' : ''}
        </div>
      </div>`;
    }).join('');
  }

  async function taskSendRequest(){
    const msg = taskEl('tkReqMsg');
    const adminId = taskEl('tkReqAdmin').value;
    const title = taskEl('tkReqTitle').value.trim();
    const desc = taskEl('tkReqDesc').value.trim();
    const urgent = taskEl('tkReqUrgent').checked;
    const show = (t, k) => { msg.textContent = t; msg.className = 'tk-msg ' + k; };
    if (!adminId){ show('Choose an admin.', 'err'); return; }
    if (!title){ show('Please write what you need help with.', 'err'); return; }
    const btn = taskEl('tkReqSend'); btn.disabled = true;
    const { error } = await sb.rpc('task_request_help', { p_admin_id: adminId, p_title: title, p_description: desc, p_priority: urgent ? 'urgent' : 'normal' });
    btn.disabled = false;
    if (error){ show(error.message, 'err'); return; }
    taskEl('tkReqTitle').value = ''; taskEl('tkReqDesc').value = ''; taskEl('tkReqUrgent').checked = false;
    show('Sent. You can follow the status below.', 'ok');
    await taskLoad();
    taskRender(false);
  }

  // ----- Data -----
  async function taskLoad(){
    const [mine, reqs, admins] = await Promise.all([
      sb.rpc('task_list_mine'), sb.rpc('task_my_requests'), sb.rpc('task_assignees')
    ]);
    if (!mine.error) taskItems = mine.data || [];
    if (!reqs.error) taskRequests = reqs.data || [];
    if (!admins.error) taskAdmins = admins.data || [];
  }

  async function taskRefresh(animate){
    await taskLoad();
    taskRender(animate);
  }

  // ----- Cheer-ups -----
  function taskToast(text){
    let el = taskEl('tkToast');
    if (!el){ el = document.createElement('div'); el.id = 'tkToast'; el.className = 'tk-toast'; document.body.appendChild(el); }
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(taskToastTimer);
    taskToastTimer = setTimeout(() => el.classList.remove('show'), 3400);
  }

  function taskConfetti(originEl, count){
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = originEl.getBoundingClientRect();
    const box = document.createElement('div');
    box.className = 'tk-confetti';
    box.style.left = (r.left + r.width / 2) + 'px';
    box.style.top = (r.top + r.height / 2) + 'px';
    for (let i = 0; i < count; i++){
      const p = document.createElement('i');
      const ang = Math.random() * Math.PI * 2;
      const dist = 50 + Math.random() * (count > 40 ? 300 : 160);
      p.style.setProperty('--x', Math.round(Math.cos(ang) * dist) + 'px');
      p.style.setProperty('--y', Math.round(Math.sin(ang) * dist - 30 + Math.random() * 140) + 'px');
      p.style.setProperty('--r', Math.round(Math.random() * 720 - 360) + 'deg');
      p.style.setProperty('--c', TASK_CONFETTI_COLORS[i % TASK_CONFETTI_COLORS.length]);
      p.style.setProperty('--t', (0.9 + Math.random() * 0.9).toFixed(2) + 's');
      if (Math.random() < 0.35) p.className = 'dot';
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 2300);
  }

  // ----- Actions -----
  async function taskComplete(instanceId, note, cardEl){
    const { error } = await sb.rpc('task_complete', { p_instance: instanceId, p_note: note || '' });
    if (error) return { ok: false, message: error.message };
    if (cardEl){
      cardEl.classList.add('celebrate');
      const check = cardEl.querySelector('.task-check');
      if (check) taskConfetti(check, 36);
    }
    taskToast(taskPick(TASK_CHEERS));
    await new Promise(r => setTimeout(r, 900));       // let the check mark animation play
    await taskLoad();
    taskRender(false);
    const g = taskGroups();
    if (g.todays.length && g.todays.every(t => t.status === 'done') && !g.waiting.length && !g.carried.length){
      const ring = taskEl('tkRingFg');
      setTimeout(() => { taskConfetti(ring, 90); taskToast(taskPick(TASK_ALL_DONE)); }, 700);
    }
    return { ok: true };
  }

  async function taskAskHelp(instanceId, message){
    if (!message || !message.trim()) return { ok: false, message: 'Please write your doubt or the reason first.' };
    const { error } = await sb.rpc('task_ask_help', { p_instance: instanceId, p_message: message.trim() });
    if (error) return { ok: false, message: error.message };
    taskToast('Sent. You will see the reply under Pending.');
    await taskLoad();
    taskRender(false);
    return { ok: true };
  }

  // ----- Wiring (one delegated listener for all cards) -----
  function taskSwitchSub(name){
    taskSub = name;
    document.querySelectorAll('#tab-tasks .tk-subtab').forEach(b => b.classList.toggle('active', b.dataset.sub === name));
    document.querySelectorAll('#tab-tasks .tk-subpanel').forEach(p => p.classList.toggle('active', p.dataset.sub === name));
  }

  taskEl('tab-tasks').addEventListener('click', async e => {
    const t = e.target;
    const sub = t.closest('.tk-subtab');
    if (sub){ taskSwitchSub(sub.dataset.sub); return; }
    if (t.closest('#tkReqSend')){ taskSendRequest(); return; }

    const reqBtn = t.closest('.task-cancel-request');
    if (reqBtn){
      const taskId = reqBtn.closest('.task-card').dataset.task;
      reqBtn.disabled = true;
      const { error } = await sb.rpc('task_stop', { p_task: taskId });
      if (error){ reqBtn.disabled = false; taskToast(error.message); return; }
      await taskLoad(); taskRender(false);
      return;
    }

    const card = t.closest('.task-card');
    if (!card || !card.dataset.id) return;
    const id = card.dataset.id;
    const forms = {
      complete: card.querySelector('[data-form="complete"]'),
      help: card.querySelector('[data-form="help"]')
    };
    const openForm = name => {
      Object.keys(forms).forEach(k => { if (forms[k]) forms[k].hidden = (k !== name) ? true : !forms[k].hidden; });
      const ta = forms[name] && forms[name].querySelector('textarea');
      if (ta && !forms[name].hidden) ta.focus();
    };

    if (t.closest('.task-check')){ if (!card.classList.contains('is-done')) openForm('complete'); return; }
    if (t.closest('.task-help-btn')){ openForm('help'); return; }
    if (t.closest('.task-cancel')){ Object.values(forms).forEach(f => { if (f) f.hidden = true; }); return; }
    if (t.closest('.task-toggle')){
      const d = card.querySelector('.task-desc');
      if (d){ d.hidden = !d.hidden; t.closest('.task-toggle').textContent = d.hidden ? 'Details' : 'Hide details'; }
      return;
    }
    if (t.closest('.task-confirm-done')){
      const btn = t.closest('.task-confirm-done'); btn.disabled = true;
      const r = await taskComplete(id, card.querySelector('.task-note').value, card);
      if (!r.ok){ btn.disabled = false; taskToast(r.message); }
      return;
    }
    if (t.closest('.task-send-help')){
      const btn = t.closest('.task-send-help'); btn.disabled = true;
      const r = await taskAskHelp(id, card.querySelector('.task-helptext').value);
      if (!r.ok){ btn.disabled = false; taskToast(r.message); }
      return;
    }
  });

  // Called by login.js once an employee is signed in.
  async function taskInitEmployee(){
    taskSwitchSub('today');
    await taskRefresh(true);
    // Pick up new tasks / admin replies without a reload (skipped while someone is typing).
    setInterval(() => { if (!document.querySelector('#tab-tasks .task-inline:not([hidden])')) taskRefresh(false); }, 120000);
  }

  // Called by attendance.js when the check-in popup closes: play the entrance animation.
  function taskOnGateClosed(previousMode){
    if (previousMode !== 'checkin' && previousMode !== 'stale' && previousMode !== 'notice') return;
    if (typeof currentEmployee === 'undefined' || !currentEmployee) return;   // employees only
    taskSwitchSub('today');
    taskRender(true);
  }

  const taskTabBtn = document.querySelector('.tab-btn[data-tab="tasks"]');
  if (taskTabBtn) taskTabBtn.addEventListener('click', () => taskRefresh(true));
