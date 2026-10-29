// ---------- Closing check (live match/mismatch as you type) ----------
  function acctUpdateClosingCheck(){
    const cashInput = document.getElementById('acctActualCash').value;
    const digitalInput = document.getElementById('acctActualDigital').value;
    const cashDiffEl = document.getElementById('acctCashDiff');
    const digitalDiffEl = document.getElementById('acctDigitalDiff');
    const cashRow = document.getElementById('acctCashDiffRow');
    const digitalRow = document.getElementById('acctDigitalDiffRow');

    if (cashInput === ''){
      cashDiffEl.textContent = 'Enter amount above';
      cashDiffEl.style.color = 'var(--ink-dim)';
      cashRow.style.borderTopColor = 'var(--rule)';
    } else {
      const diff = (parseFloat(cashInput) || 0) - acctClosingCashVal;
      const ok = Math.abs(diff) < 0.01;
      cashDiffEl.textContent = ok ? '✓ Matches' : `✗ Off by ${acctFmt(Math.abs(diff))}`;
      cashDiffEl.style.color = ok ? 'var(--moss)' : 'var(--red)';
      cashRow.style.borderTopColor = ok ? 'var(--moss)' : 'var(--red)';
    }

    if (digitalInput === ''){
      digitalDiffEl.textContent = 'Enter amount above';
      digitalDiffEl.style.color = 'var(--ink-dim)';
      digitalRow.style.borderTopColor = 'var(--rule)';
    } else {
      const diff = (parseFloat(digitalInput) || 0) - acctClosingUpiVal;
      const ok = Math.abs(diff) < 0.01;
      digitalDiffEl.textContent = ok ? '✓ Matches' : `✗ Off by ${acctFmt(Math.abs(diff))}`;
      digitalDiffEl.style.color = ok ? 'var(--moss)' : 'var(--red)';
      digitalRow.style.borderTopColor = ok ? 'var(--moss)' : 'var(--red)';
    }
  }
  ['acctActualCash','acctActualDigital'].forEach(id => {
    document.getElementById(id).addEventListener('input', acctUpdateClosingCheck);
  });

  async function acctLoadHistory(){
    const { data, error } = await sb
      .from('account_closures')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(10);

    const body = document.getElementById('acctHistoryBody');
    if (error || !data || data.length === 0){
      body.innerHTML = '<tr><td colspan="4" class="empty">No closing reports yet.</td></tr>';
      return;
    }

    body.innerHTML = data.map(r => {
      const cashOk = Math.abs(parseFloat(r.cashDifference) || 0) < 0.01;
      const digOk = Math.abs(parseFloat(r.digitalDifference) || 0) < 0.01;
      return `
        <tr>
          <td class="cust-meta">${formatDMY(r.closureDate)}</td>
          <td>${escapeHtml(r.employeeName)}</td>
          <td style="color:${cashOk ? 'var(--moss)' : 'var(--red)'};">${cashOk ? '✓ Matched' : '✗ ' + acctFmt(r.cashDifference)}</td>
          <td style="color:${digOk ? 'var(--moss)' : 'var(--red)'};">${digOk ? '✓ Matched' : '✗ ' + acctFmt(r.digitalDifference)}</td>
        </tr>`;
    }).join('');
  }

  document.getElementById('acctSubmitBtn').addEventListener('click', async () => {
    const actualCashRaw = document.getElementById('acctActualCash').value;
    const actualDigitalRaw = document.getElementById('acctActualDigital').value;

    if (actualCashRaw === '' || actualDigitalRaw === ''){
      showMsg(document.getElementById('acctMsg'), 'Enter actual cash counted and actual UPI received before closing.', 'err');
      return;
    }

    const actualCash = parseFloat(actualCashRaw) || 0;
    const actualDigital = parseFloat(actualDigitalRaw) || 0;

    const record = {
      closureDate: acctToday(),
      employeeName: (currentEmployee || currentAdmin) ? ((currentEmployee || currentAdmin).name || (currentEmployee || currentAdmin).username) : 'Unknown',
      calculatedCash: acctClosingCashVal,
      actualCash,
      cashDifference: parseFloat((actualCash - acctClosingCashVal).toFixed(2)),
      calculatedDigital: acctClosingUpiVal,
      actualDigital,
      digitalDifference: parseFloat((actualDigital - acctClosingUpiVal).toFixed(2))
    };

    const { error } = await sb.from('account_closures').insert(record);
    if (error){
      showMsg(document.getElementById('acctMsg'), error.message, 'err');
      return;
    }

    const bothMatch = Math.abs(record.cashDifference) < 0.01 && Math.abs(record.digitalDifference) < 0.01;
    showMsg(document.getElementById('acctMsg'),
      bothMatch ? 'Everything matches — report saved.' : 'Mismatch found — report saved with the difference recorded.',
      bothMatch ? 'ok' : 'err');

    document.getElementById('acctActualCash').value = '';
    document.getElementById('acctActualDigital').value = '';
    acctUpdateClosingCheck();
    await acctLoadHistory();
  });
