// ---------- Admin / Boss: assign tasks, answer doubts, follow progress ----------
  // The boss sees every task (employees and admins). An admin sees the tasks they
  // assigned and the help requests addressed to them. The database enforces this.
  const AT_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const AT_STATUS_LABEL = { pending: 'Open', waiting: 'Waiting for reply', done: 'Done', cancelled: 'Cancelled' };

  let atRows = [];          // task_admin_list
  let atRepeating = [];     // task_admin_repeating
  let atEmployees = [];     // task_assignees (employees)
  let atLeaves = [];        // leave_admin_list
  let atLeaveToday = [];    // leave_today

  const atEl = id => document.getElementById(id);
  const atMsgEl = () => atEl('atMsg');
  function atShow(text, kind){ const m = atMsgEl(); m.textContent = text; m.className = 'tk-msg ' + (kind || ''); }
  function atMyId(){ return (typeof currentAdmin !== 'undefined' && currentAdmin) ? currentAdmin.id : null; }
  function atTime(v){ return new Date(v).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); }
  function atWhen(v){ return v ? formatDMY(v) + ' ' + atTime(v) : ''; }

  function atRepeatText(kind, weekday, monthday){
    if (kind === 'daily') return 'Daily';
    if (kind === 'weekly') return 'Weekly, ' + (AT_WEEKDAYS[weekday] || '');
    if (kind === 'monthly') return 'Monthly, day ' + monthday;
    return '';
  }

  // ----- Assign form -----
  function atBuildFormOptions(){
    atEl('atEmployee').innerHTML = atEmployees.length
      ? atEmployees.map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('')
      : '<option value="">No active employees</option>';
    if (!atEl('atWeekday').options.length){
      atEl('atWeekday').innerHTML = AT_WEEKDAYS.map((d, i) => `<option value="${i}">${d}</option>`).join('');
      let days = ''; for (let d = 1; d <= 31; d++) days += `<option value="${d}">${d}</option>`;
      atEl('atMonthday').innerHTML = days;
    }
  }

  function atRepeatChanged(){
    const r = atEl('atRepeat').value;
    atEl('atWeekdayWrap').style.display = r === 'weekly' ? '' : 'none';
    atEl('atMonthdayWrap').style.display = r === 'monthly' ? '' : 'none';
    atEl('atDueWrap').style.display = r === 'none' ? '' : 'none';
  }
  atEl('atRepeat').addEventListener('change', atRepeatChanged);

  atEl('atAssignBtn').addEventListener('click', async () => {
    const employeeId = atEl('atEmployee').value;
    const title = atEl('atTitle').value.trim();
    const repeat = atEl('atRepeat').value;
    if (!employeeId){ atShow('Choose an employee.', 'err'); return; }
    if (!title){ atShow('Write a task title.', 'err'); return; }
    const btn = atEl('atAssignBtn'); btn.disabled = true;
    const { error } = await sb.rpc('task_assign', {
      p_employee_id: employeeId,
      p_title: title,
      p_description: atEl('atDescription').value.trim(),
      p_priority: atEl('atUrgent').checked ? 'urgent' : 'normal',
      p_repeat: repeat,
      p_weekday: repeat === 'weekly' ? parseInt(atEl('atWeekday').value, 10) : null,
      p_monthday: repeat === 'monthly' ? parseInt(atEl('atMonthday').value, 10) : null,
      p_due: (repeat === 'none' && atEl('atDue').value) ? atEl('atDue').value : null
    });
    btn.disabled = false;
    if (error){ atShow(error.message, 'err'); return; }
    atShow('Task assigned.', 'ok');
    atEl('atTitle').value = ''; atEl('atDescription').value = ''; atEl('atUrgent').checked = false; atEl('atDue').value = '';
    await atLoad();
  });

  // ----- Lists -----
  function atChips(r){
    let html = '';
    if (r.priority === 'urgent') html += '<span class="at-chip urgent">Urgent</span>';
    if (r.repeat_kind && r.repeat_kind !== 'none') html += `<span class="at-chip repeat">${r.repeat_kind[0].toUpperCase() + r.repeat_kind.slice(1)}</span>`;
    html += `<span class="at-chip ${r.status}">${AT_STATUS_LABEL[r.status] || r.status}</span>`;
    return html;
  }

  function atPeople(r){
    return `${escapeHtml(r.creator_name || '?')} &rarr; ${escapeHtml(r.assignee_name || '?')}`;
  }

  // What needs MY action: questions from employees, and help requests addressed to me.
  function atAttentionRows(){
    const me = atMyId();
    const boss = typeof appIsBoss !== 'undefined' && appIsBoss;
    return atRows.filter(r =>
      (r.status === 'waiting' && r.creator_kind === 'admin' && (boss || r.creator_id === me)) ||
      (r.status === 'pending' && r.creator_kind === 'employee' && r.assignee_kind === 'admin' && r.assignee_id === me));
  }

  function atRenderAttention(){
    const rows = atAttentionRows();
    const badge = atEl('atBadge');
    const waiting = rows.length + atLeaves.filter(l => l.status === 'pending').length;
    badge.textContent = String(waiting); badge.hidden = waiting === 0;
    const box = atEl('atAttention');
    if (!rows.length){ box.innerHTML = '<div class="empty">Nothing needs your attention right now.</div>'; return; }
    box.innerHTML = rows.map(r => {
      if (r.status === 'waiting'){
        return `
        <div class="at-row" data-instance="${r.instance_id}">
          <div class="at-title">${escapeHtml(r.title)} ${atChips(r)}</div>
          <div class="at-sub">${atPeople(r)} &middot; asked ${atWhen(r.help_at)}</div>
          <div class="at-quote"><b>${escapeHtml(r.assignee_name)} asks</b>${escapeHtml(r.help_message || '')}</div>
          <div class="at-actions">
            <textarea class="task-textarea at-reply-text" maxlength="500" placeholder="Write your reply. The task goes back to ${escapeHtml(r.assignee_name)}."></textarea>
            <button type="button" class="btn moss at-reply-btn">Send reply</button>
          </div>
        </div>`;
      }
      return `
        <div class="at-row" data-instance="${r.instance_id}">
          <div class="at-title">${escapeHtml(r.title)} ${atChips(r)}</div>
          <div class="at-sub">Help request from ${escapeHtml(r.creator_name)} &middot; ${atWhen(r.created_at)}</div>
          ${r.description ? `<div class="at-quote"><b>Details</b>${escapeHtml(r.description)}</div>` : ''}
          <div class="at-actions">
            <textarea class="task-textarea at-done-note" maxlength="500" placeholder="Add an update for ${escapeHtml(r.creator_name)} (optional)"></textarea>
            <button type="button" class="btn moss at-done-btn">Mark as done</button>
          </div>
        </div>`;
    }).join('');
  }

  function atRenderRepeating(){
    const box = atEl('atRepeating');
    if (!atRepeating.length){ box.innerHTML = '<div class="empty">No repeating tasks.</div>'; return; }
    box.innerHTML = atRepeating.map(t => `
      <div class="at-row" data-task="${t.task_id}">
        <div style="display:flex; justify-content:space-between; gap:12px; align-items:center;">
          <div>
            <div class="at-title">${escapeHtml(t.title)}
              ${t.priority === 'urgent' ? '<span class="at-chip urgent">Urgent</span>' : ''}
              <span class="at-chip repeat">${escapeHtml(atRepeatText(t.repeat_kind, t.repeat_weekday, t.repeat_monthday))}</span></div>
            <div class="at-sub">For ${escapeHtml(t.assignee_name || '?')} &middot; since ${formatDMY(t.created_at)}</div>
          </div>
          <button type="button" class="btn ghost btn-sm at-stop-btn">Stop repeating</button>
        </div>
      </div>`).join('');
  }

  function atRenderActivity(){
    const statusF = atEl('atFilterStatus').value;
    const whoF = atEl('atFilterWho').value;
    const rows = atRows.filter(r =>
      (statusF === 'all' || r.status === statusF) &&
      (whoF === 'all' || r.assignee_kind === whoF));
    const box = atEl('atActivity');
    if (!rows.length){ box.innerHTML = '<div class="empty">No tasks match.</div>'; return; }
    box.innerHTML = rows.slice(0, 150).map(r => `
      <div class="at-row" data-task="${r.task_id}">
        <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
          <div style="min-width:0;">
            <div class="at-title">${escapeHtml(r.title)} ${atChips(r)}</div>
            <div class="at-sub">${atPeople(r)} &middot; due ${formatDMY(r.due_date)}${r.repeat_kind !== 'none' ? ' &middot; repeating task' : ''}</div>
          </div>
          ${(r.status === 'pending' || r.status === 'waiting') && r.repeat_kind === 'none'
            ? '<button type="button" class="btn ghost btn-sm at-cancel-btn">Cancel task</button>' : ''}
        </div>
        ${r.description ? `<div class="at-quote"><b>Details</b>${escapeHtml(r.description)}</div>` : ''}
        ${r.help_message ? `<div class="at-quote"><b>${escapeHtml(r.assignee_name)} asked${r.help_at ? ' (' + atWhen(r.help_at) + ')' : ''}</b>${escapeHtml(r.help_message)}</div>` : ''}
        ${r.admin_reply ? `<div class="at-quote"><b>Reply${r.replied_at ? ' (' + atWhen(r.replied_at) + ')' : ''}</b>${escapeHtml(r.admin_reply)}</div>` : ''}
        ${r.status === 'done' ? `<div class="at-quote"><b>Completed ${atWhen(r.completed_at)}</b>${r.completion_note ? escapeHtml(r.completion_note) : 'No update added.'}</div>` : ''}
      </div>`).join('');
  }

  // ----- Leave requests -----
  const AT_LEAVE_TYPE = { casual: 'Casual leave', sick: 'Sick leave', emergency: 'Emergency leave', other: 'Other leave' };
  const AT_PART = { full: '', half_am: 'Half day, morning off', half_pm: 'Half day, afternoon off' };

  function atLeaveDates(l){
    const dates = l.from_date === l.to_date ? formatDMY(l.from_date) : `${formatDMY(l.from_date)} to ${formatDMY(l.to_date)}`;
    const n = Number(l.days);
    return `${dates} &middot; ${n} day${n === 1 ? '' : 's'}${AT_PART[l.day_part] ? ' &middot; ' + AT_PART[l.day_part] : ''}`;
  }

  function atRenderLeaves(){
    const todayBox = atEl('atLeaveToday');
    const partText = p => p === 'half_am' ? 'morning off' : (p === 'half_pm' ? 'afternoon off' : 'full day');
    todayBox.textContent = atLeaveToday.length
      ? 'On leave today: ' + atLeaveToday.map(l => `${l.employee_name} (${partText(l.day_part)})`).join(', ')
      : 'Nobody is on approved leave today.';

    const pending = atLeaves.filter(l => l.status === 'pending');
    atEl('atLeavePending').innerHTML = pending.length ? pending.map(l => `
      <div class="at-row" data-leave="${l.id}">
        <div class="at-title">${escapeHtml(l.employee_name)} <span class="at-chip leave">${AT_LEAVE_TYPE[l.leave_type] || 'Leave'}</span></div>
        <div class="at-sub">${atLeaveDates(l)} &middot; applied ${atWhen(l.created_at)}</div>
        <div class="at-quote"><b>Reason</b>${escapeHtml(l.reason)}</div>
        <div class="at-actions">
          <textarea class="task-textarea at-leave-note" maxlength="500" placeholder="Note for ${escapeHtml(l.employee_name)} (required if you reject)"></textarea>
          <button type="button" class="btn moss at-leave-approve">Approve</button>
          <button type="button" class="btn ghost at-leave-reject">Reject</button>
        </div>
      </div>`).join('') : '<div class="empty">No leave requests waiting.</div>';

    const history = atLeaves.filter(l => l.status !== 'pending').slice(0, 15);
    atEl('atLeaveHistory').innerHTML = history.length ? history.map(l => `
      <div class="at-row">
        <div class="at-title">${escapeHtml(l.employee_name)} <span class="at-chip ${l.status}">${l.status === 'rejected' ? 'Rejected' : l.status[0].toUpperCase() + l.status.slice(1)}</span>
          <span class="at-chip leave">${AT_LEAVE_TYPE[l.leave_type] || 'Leave'}</span></div>
        <div class="at-sub">${atLeaveDates(l)}${l.decided_by_name ? ' &middot; by ' + escapeHtml(l.decided_by_name) : ''}</div>
        ${l.decision_note ? `<div class="at-quote"><b>Note</b>${escapeHtml(l.decision_note)}</div>` : ''}
      </div>`).join('') : '<div class="empty">No decisions yet.</div>';
  }

  function atRenderAll(){
    atRenderLeaves();
    atRenderAttention();
    atRenderRepeating();
    atRenderActivity();
  }

  async function atLoad(){
    const [emps, list, rep, leaves, leaveToday] = await Promise.all([
      sb.rpc('task_assignees'), sb.rpc('task_admin_list'), sb.rpc('task_admin_repeating'),
      sb.rpc('leave_admin_list'), sb.rpc('leave_today')
    ]);
    if (!leaves.error) atLeaves = leaves.data || [];
    if (!leaveToday.error) atLeaveToday = leaveToday.data || [];
    if (!emps.error) atEmployees = emps.data || [];
    if (!list.error) atRows = list.data || [];
    if (!rep.error) atRepeating = rep.data || [];
    if (list.error) atShow(list.error.message, 'err');
    atBuildFormOptions();
    atRepeatChanged();
    atRenderAll();
  }

  // ----- Row actions (delegated) -----
  atEl('tab-admin-tasks').addEventListener('click', async e => {
    const t = e.target;
    const row = t.closest('.at-row');
    if (!row) return;

    if (t.closest('.at-leave-approve') || t.closest('.at-leave-reject')){
      const approve = !!t.closest('.at-leave-approve');
      const btn = t.closest(approve ? '.at-leave-approve' : '.at-leave-reject');
      const note = row.querySelector('.at-leave-note').value;
      if (!approve && !note.trim()){ atShow('Please write the reason for rejecting the leave.', 'err'); return; }
      btn.disabled = true;
      const { error } = await sb.rpc('leave_decide', { p_id: row.dataset.leave, p_approve: approve, p_note: note });
      btn.disabled = false;
      if (error){ atShow(error.message, 'err'); return; }
      atShow(approve ? 'Leave approved. The employee will see it.' : 'Leave rejected. The employee will see your note.', 'ok');
      await atLoad();
    } else if (t.closest('.at-reply-btn')){
      const btn = t.closest('.at-reply-btn');
      const text = row.querySelector('.at-reply-text').value;
      btn.disabled = true;
      const { error } = await sb.rpc('task_admin_reply', { p_instance: row.dataset.instance, p_reply: text });
      btn.disabled = false;
      if (error){ atShow(error.message, 'err'); return; }
      atShow('Reply sent. The task is back on the employee\'s list.', 'ok');
      await atLoad();
    } else if (t.closest('.at-done-btn')){
      const btn = t.closest('.at-done-btn');
      btn.disabled = true;
      const { error } = await sb.rpc('task_complete', { p_instance: row.dataset.instance, p_note: row.querySelector('.at-done-note').value });
      btn.disabled = false;
      if (error){ atShow(error.message, 'err'); return; }
      atShow('Marked as done. The employee can see your update.', 'ok');
      await atLoad();
    } else if (t.closest('.at-stop-btn') || t.closest('.at-cancel-btn')){
      const isStop = !!t.closest('.at-stop-btn');
      showConfirm(isStop ? 'Stop this repeating task? Open copies will be cancelled.' : 'Cancel this task?', async () => {
        const { error } = await sb.rpc('task_stop', { p_task: row.dataset.task });
        if (error){ atShow(error.message, 'err'); return; }
        atShow(isStop ? 'Repeating task stopped.' : 'Task cancelled.', 'ok');
        await atLoad();
      }, isStop ? 'Stop repeating' : 'Cancel task');
    }
  });

  atEl('atFilterStatus').addEventListener('change', atRenderActivity);
  atEl('atFilterWho').addEventListener('change', atRenderActivity);
  atEl('atRefreshBtn').addEventListener('click', atLoad);

  // Called by login.js for admin and boss (keeps the "needs attention" badge fresh).
  async function taskAdminInit(){
    if (typeof appIsBoss !== 'undefined' && appIsBoss){
      atEl('atScope').textContent = 'Showing every task for employees and admins.';
    }
    await atLoad();
    setInterval(() => {
      const active = document.getElementById('tab-admin-tasks').classList.contains('active');
      const typing = document.querySelector('#tab-admin-tasks textarea:focus');
      if (!active || !typing) atLoad();
    }, 120000);
  }
  const atTabBtn = document.querySelector('.tab-btn[data-tab="admin-tasks"]');
  if (atTabBtn) atTabBtn.addEventListener('click', atLoad);
