// ---------- Employee: timer ----------
  const statusTag = document.getElementById('statusTag');
  const statusText = document.getElementById('statusText');
  const timerEl = document.getElementById('timer');
  const punchBtn = document.getElementById('punchBtn');
  const historyList = document.getElementById('historyList');

  function formatElapsed(ms){
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
    const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const s = String(totalSec % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  function startTicking(){
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = setInterval(renderTimer, 1000);
    renderTimer();
  }

  function renderTimer(){
    if (openSession){
      const elapsed = Date.now() - new Date(openSession.check_in).getTime();
      timerEl.textContent = formatElapsed(elapsed);
      timerEl.classList.remove('idle');
      statusTag.classList.add('active');
      statusText.textContent = 'On shift';
      punchBtn.textContent = 'Check Out';
      punchBtn.className = 'punch-btn out';
    } else {
      timerEl.textContent = '00:00:00';
      timerEl.classList.add('idle');
      statusTag.classList.remove('active');
      statusText.textContent = 'Off shift';
      punchBtn.textContent = 'Check In';
      punchBtn.className = 'punch-btn in';
    }
  }

  async function loadOpenSession(){
    // Attendance module loads the open session and shows the forced check-in popup if needed.
    await attInit({ kind: 'employee', id: currentEmployee.id, name: currentEmployee.name || currentEmployee.username });
  }

  async function loadHistory(){
    const { data, error } = await sb
      .from('checkins')
      .select('id, check_in, check_out, duration_seconds')
      .eq('employee_id', currentEmployee.id)
      .not('check_out', 'is', null)
      .order('check_in', { ascending: false })
      .limit(10);

    if (error || !data || data.length === 0){
      historyList.innerHTML = '<div class="empty">No completed sessions yet.</div>';
      return;
    }

    historyList.innerHTML = data.map(row => {
      const d = new Date(row.check_in);
      const dateStr = formatDMY(d);
      const inTime = d.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
      const outTime = new Date(row.check_out).toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
      return `
        <div class="row">
          <div>
            <div class="row-date">${dateStr}</div>
            <div class="row-time">${inTime} → ${outTime}</div>
          </div>
          <div class="row-duration">${formatElapsed(row.duration_seconds * 1000)}</div>
        </div>`;
    }).join('');
  }

  punchBtn.addEventListener('click', async () => {
    punchBtn.disabled = true;
    if (!openSession){
      await attPunchIn();
    } else {
      const r = await attPunchOut();
      if (r && r.ok) await loadHistory();
    }
    punchBtn.disabled = false;
  });
