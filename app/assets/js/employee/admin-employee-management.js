// ---------- Admin: employee management ----------
  const empMsg = document.getElementById('empMsg');
  const empList = document.getElementById('empList');

  async function loadEmployees(){
    const showArchived = document.getElementById('empShowArchived').checked;
    let query = sb.from('employees').select('*').order('created_at', { ascending: false });
    query = showArchived ? query : query.eq('active', true);
    const { data, error } = await query;

    if (error || !data || data.length === 0){
      empList.innerHTML = '<div class="empty">No employees yet. Add one above.</div>';
      return;
    }
    empList.innerHTML = data.map(e => `
      <div class="emp-row">
        <div>
          <div class="emp-name">${escapeHtml(e.name) || '(no name)'} ${e.active === false ? '<span class="cust-meta" style="color:var(--red);">(archived)</span>' : ''}</div>
          <div class="emp-username">${escapeHtml(e.username)}</div>
        </div>
        <div>
          <button class="btn ghost btn-sm emp-attendance-btn" data-id="${e.id}" data-name="${escapeHtml(e.name || e.username)}" style="margin-right:10px;">Attendance</button>
          <button class="emp-del" data-id="${e.id}" data-active="${e.active}" style="color:${e.active === false ? 'var(--moss)' : 'var(--red)'};">${e.active === false ? 'Restore' : 'Archive'}</button>
        </div>
      </div>
    `).join('');

    empList.querySelectorAll('.emp-attendance-btn').forEach(btn => {
      btn.addEventListener('click', () => empShowAttendance(btn.dataset.id, btn.dataset.name));
    });

    empList.querySelectorAll('.emp-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const isActive = btn.dataset.active === 'true';
        await sb.from('employees').update({ active: !isActive }).eq('id', btn.dataset.id);
        await loadEmployees();
        await loadAdminStats();
      });
    });
  }
  document.getElementById('empShowArchived').addEventListener('change', loadEmployees);

  // ---------- Attendance (per-employee, filtered by month) ----------
  let empAttendanceEmployeeId = null;
  const EMP_MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  function empPopulateAttendanceDropdowns(){
    const monthSel = document.getElementById('empAttendanceMonthSelect');
    const yearSel = document.getElementById('empAttendanceYearSelect');
    if (monthSel.dataset.populated === 'true') return;

    monthSel.innerHTML = EMP_MONTH_NAMES.map((name, i) => `<option value="${i + 1}">${name}</option>`).join('');

    const currentYear = new Date().getFullYear();
    const years = [];
    for (let y = currentYear + 1; y >= currentYear - 4; y--) years.push(y);
    yearSel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');

    monthSel.dataset.populated = 'true';
  }

  function empShowAttendance(employeeId, employeeName){
    empAttendanceEmployeeId = employeeId;
    document.getElementById('empAttendanceName').textContent = employeeName;
    document.getElementById('empAttendancePanel').style.display = 'block';
    empPopulateAttendanceDropdowns();
    const now = new Date();
    document.getElementById('empAttendanceMonthSelect').value = now.getMonth() + 1;
    document.getElementById('empAttendanceYearSelect').value = now.getFullYear();
    document.getElementById('empAttendancePanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    empLoadAttendance();
  }

  function empFormatDuration(seconds){
    if (!seconds && seconds !== 0) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }

  async function empLoadAttendance(){
    if (!empAttendanceEmployeeId) return;
    const m = parseInt(document.getElementById('empAttendanceMonthSelect').value, 10);
    const y = parseInt(document.getElementById('empAttendanceYearSelect').value, 10);
    const tbody = document.getElementById('empAttendanceTableBody');
    const footer = document.getElementById('empAttendanceFooter');
    if (!m || !y){
      tbody.innerHTML = '<tr><td colspan="4" class="empty">Pick a month.</td></tr>';
      footer.innerHTML = '';
      return;
    }

    const rangeStart = new Date(y, m - 1, 1).toISOString();
    const rangeEnd = new Date(y, m, 1).toISOString();

    const { data, error } = await sb
      .from('checkins')
      .select('id, check_in, check_out, duration_seconds, forgot_checkout')
      .eq('employee_id', empAttendanceEmployeeId)
      .gte('check_in', rangeStart)
      .lt('check_in', rangeEnd)
      .order('check_in', { ascending: false });

    if (error || !data || data.length === 0){
      tbody.innerHTML = '<tr><td colspan="4" class="empty">No check-ins for this month.</td></tr>';
      footer.innerHTML = '';
      return;
    }

    tbody.innerHTML = data.map(row => {
      const d = new Date(row.check_in);
      const inTime = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const outTime = row.check_out ? new Date(row.check_out).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—';
      return `
        <tr>
          <td>${formatDMY(d)}</td>
          <td class="cust-meta">${inTime}</td>
          <td class="cust-meta">${outTime}${row.forgot_checkout ? ' <span style="color:var(--red); font-weight:600;">(forgot to check out)</span>' : ''}</td>
          <td class="cust-meta">${row.check_out ? empFormatDuration(row.duration_seconds) : '(on shift)'}</td>
        </tr>`;
    }).join('');

    const totalSeconds = data.reduce((sum, r) => sum + (r.duration_seconds || 0), 0);
    footer.innerHTML = `<tr><td colspan="3" style="text-align:right; font-weight:700;">Total for month</td><td style="font-weight:700;">${empFormatDuration(totalSeconds)}</td></tr>`;
  }

  document.getElementById('empAttendanceMonthSelect').addEventListener('change', empLoadAttendance);
  document.getElementById('empAttendanceYearSelect').addEventListener('change', empLoadAttendance);

  document.getElementById('createEmpBtn').addEventListener('click', async () => {
    const name = document.getElementById('empName').value.trim();
    const username = document.getElementById('empUsername').value.trim();
    const password = document.getElementById('empPassword').value;

    if (!username || !password){
      showMsg(empMsg, 'Username and password are required.', 'err');
      return;
    }

    const { error } = await sb.rpc('admin_create_employee', {
      p_name: name,
      p_username: username,
      p_password: password
    });
    if (error){
      showMsg(empMsg, error.message.includes('duplicate') ? 'That username is already taken.' : error.message, 'err');
      return;
    }

    showMsg(empMsg, 'Employee created.', 'ok');
    document.getElementById('empName').value = '';
    document.getElementById('empUsername').value = '';
    document.getElementById('empPassword').value = '';
    await loadEmployees();
    await loadAdminStats();
  });
