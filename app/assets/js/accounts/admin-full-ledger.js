// ---------- Admin: Full Ledger view (invoices + expenses + manual entries) ----------
  let ledgerAllRows = [];
  let ledgerOpeningCashVal = 0;
  let ledgerOpeningBankVal = 0;

  function ledgerRowMetrics(r){
    // credit/debit/holding, replicating the original ledger report's logic exactly
    const isExpense = r.type === 'EXPENSE';
    const isAmountIn = r.type === 'AMOUNT_IN' || r.type === 'PAYMENT';
    const isTransfer = r.type === 'TRANSFER';
    const paid = parseFloat(r.paid) || 0;
    const b2bPaid = parseFloat(r.b2bPaid) || 0;
    const clearedAmt = parseFloat(r.clearedAmt) || 0;
    const expenseAmt = isExpense ? paid : 0;

    // TRANSFER rows come in linked pairs (one "out" leg, one "in" leg) with
    // their own explicit credit/debit already set — a transfer never touches
    // Sales/Expenses, it only moves money between the Cash and Bank buckets.
    const credit = isTransfer ? (r._transferCredit || 0) : (isExpense ? 0 : paid);
    const debit = isTransfer ? (r._transferDebit || 0) : (isAmountIn ? 0 : (isExpense ? expenseAmt : b2bPaid));
    const holding = credit - debit;
    // Pending on an invoice also accounts for any amount already cleared
    // separately against it (shown as its own PAYMENT row), so the two
    // views (here and Employee → Pending Payments) always agree.
    const pending = (r.type === 'INVOICE') ? Math.max(0, (parseFloat(r.total) || 0) - paid - clearedAmt) : 0;

    return { credit, debit, holding, pending, expenseAmt };
  }

  async function acctLoadLedgerAll(){
    await acctLoadClearances();
    const { data: invRows } = await sb.from('ledger').select('*').order('timestamp', { ascending: false }).limit(1000);
    const { data: expRows } = await sb.from('expenses').select('*').order('timestamp', { ascending: false }).limit(1000);
    const { data: transferRows } = await sb.from('cash_transfers').select('*').order('timestamp', { ascending: false }).limit(1000);
    const { data: settingsRows } = await sb.from('ledger_settings').select('*').limit(1);

    ledgerOpeningCashVal = (settingsRows && settingsRows[0]) ? parseFloat(settingsRows[0].opening_cash) || 0 : 0;
    ledgerOpeningBankVal = (settingsRows && settingsRows[0]) ? parseFloat(settingsRows[0].opening_bank) || 0 : 0;
    document.getElementById('ledgerOpeningCash').value = ledgerOpeningCashVal;
    document.getElementById('ledgerOpeningBank').value = ledgerOpeningBankVal;

    const invEntries = (invRows || []).map(r => ({
      type: r.type || 'INVOICE', date: r.invoiceDate, invoiceNumber: r.invoiceNumber,
      customer: r.customerName, patientId: r.patientId || '', mode: r.customerPaymentMode,
      total: r.invoiceTotal, discount: r.discount, otherCharges: r.otherCharges, paid: r.customerPaidAmount,
      b2bName: r.b2bName, b2bPaid: r.paidAmountToB2B, timestamp: r.timestamp, _ledgerId: r.id,
      clearedAmt: (r.type || 'INVOICE') === 'INVOICE' ? acctClearedTotalFor(r.invoiceNumber) : 0
    }));
    const expEntries = (expRows || []).map(r => ({
      type: 'EXPENSE', date: r.date, invoiceNumber: r.import_ref || ('EXP-' + r.id.slice(0, 8)),
      customer: r.description, patientId: '', mode: r.source, category: r.category,
      total: 0, discount: 0, paid: r.amount,
      b2bName: '', b2bPaid: 0, timestamp: r.timestamp, _expenseId: r.id, clearedAmt: 0
    }));
    const paymentEntries = (acctAllClearances || []).map(c => ({
      type: 'PAYMENT', date: c.clearedDate, invoiceNumber: c.invoiceNumber,
      customer: c.customerName + ' (payment against pending)', patientId: c.patientId || '', mode: c.paymentMode,
      total: 0, discount: 0, paid: c.amount,
      b2bName: '', b2bPaid: 0, timestamp: c.timestamp, _clearanceId: c.id, clearedAmt: 0
    }));

    const transferEntries = [];
    (transferRows || []).forEach(t => {
      const amt = parseFloat(t.amount) || 0;
      const fromMode = t.direction === 'deposit' ? 'Cash' : 'Bank';
      const toMode = t.direction === 'deposit' ? 'Bank' : 'Cash';
      const label = (t.direction === 'deposit' ? 'Deposit (Cash → Bank)' : 'Withdraw (Bank → Cash)') + (t.note ? ' — ' + t.note : '');
      transferEntries.push({
        type: 'TRANSFER', date: t.date, invoiceNumber: 'XFER-' + t.id.slice(0, 8),
        customer: label, patientId: '', mode: fromMode,
        total: 0, discount: 0, paid: amt, _transferCredit: 0, _transferDebit: amt,
        b2bName: '', b2bPaid: 0, timestamp: t.timestamp, _transferId: t.id, clearedAmt: 0
      });
      transferEntries.push({
        type: 'TRANSFER', date: t.date, invoiceNumber: 'XFER-' + t.id.slice(0, 8),
        customer: label, patientId: '', mode: toMode,
        total: 0, discount: 0, paid: amt, _transferCredit: amt, _transferDebit: 0,
        b2bName: '', b2bPaid: 0, timestamp: t.timestamp, _transferId: t.id, clearedAmt: 0
      });
    });

    ledgerAllRows = [...invEntries, ...expEntries, ...paymentEntries, ...transferEntries].sort((a, b) => {
      const dateDiff = new Date(b.date) - new Date(a.date);
      if (dateDiff !== 0) return dateDiff;
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
    ledgerPopulateMonthFilter();
    ledgerApplyFilters();
  }

  function ledgerPopulateMonthFilter(){
    const months = new Set();
    ledgerAllRows.forEach(r => { if (r.date && r.date.length >= 7) months.add(r.date.slice(0, 7)); });
    const sel = document.getElementById('ledgerMonthFilter');
    const current = sel.value;
    sel.innerHTML = '<option value="">All Months</option>' + Array.from(months).sort().reverse().map(m => {
      const label = new Date(m + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      return `<option value="${m}">${label}</option>`;
    }).join('');
    sel.value = current;
  }

  function ledgerApplyFilters(){
    const search = document.getElementById('ledgerSearch').value.toLowerCase().trim();
    const patientId = document.getElementById('ledgerPatientIdFilter').value.toLowerCase().trim();
    const month = document.getElementById('ledgerMonthFilter').value;
    const mode = document.getElementById('ledgerModeFilter').value;
    const startDate = document.getElementById('ledgerStartDate').value;
    const endDate = document.getElementById('ledgerEndDate').value;

    const filtered = ledgerAllRows.filter(r => {
      if (search){
        const hay = `${r.invoiceNumber || ''} ${r.customer || ''} ${r.b2bName || ''}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      if (patientId && !(r.patientId || '').toLowerCase().includes(patientId)) return false;
      if (month && !(r.date || '').startsWith(month)) return false;
      if (mode && r.mode !== mode) return false;
      if (startDate && r.date < startDate) return false;
      if (endDate && r.date > endDate) return false;
      return true;
    });

    ledgerRenderTable(filtered);
    ledgerRenderDashboard(filtered);
  }

  function ledgerRenderDashboard(rows){
    let income = 0, expenseDebit = 0;
    let cashCredit = 0, cashDebit = 0, bankCredit = 0, bankDebit = 0;
    rows.forEach(r => {
      const m = ledgerRowMetrics(r);
      const isCash = r.mode === 'Cash';
      if (isCash){ cashCredit += m.credit; cashDebit += m.debit; }
      else { bankCredit += m.credit; bankDebit += m.debit; }
      if (r.type === 'INVOICE') income += (parseFloat(r.paid) || 0) - (parseFloat(r.b2bPaid) || 0);
      if (r.type === 'PAYMENT') income += parseFloat(r.paid) || 0;
      if (r.type !== 'AMOUNT_IN' && r.type !== 'TRANSFER') expenseDebit += m.debit;
    });
    const cashClosing = ledgerOpeningCashVal + (cashCredit - cashDebit);
    const bankClosing = ledgerOpeningBankVal + (bankCredit - bankDebit);

    document.getElementById('ledgerIncomeStat').textContent = acctFmt(income);
    document.getElementById('ledgerExpenseStat').textContent = acctFmt(expenseDebit);
    const cashEl = document.getElementById('ledgerCashClosingStat');
    cashEl.textContent = acctFmt(cashClosing);
    cashEl.style.color = cashClosing >= 0 ? 'var(--moss)' : 'var(--red)';
    const bankEl = document.getElementById('ledgerBankClosingStat');
    bankEl.textContent = acctFmt(bankClosing);
    bankEl.style.color = bankClosing >= 0 ? 'var(--moss)' : 'var(--red)';
  }

  function ledgerRenderTable(rows){
    const body = document.getElementById('ledgerAllBody');
    const footer = document.getElementById('ledgerFooter');

    if (!rows || rows.length === 0){
      body.innerHTML = '<tr><td colspan="10" class="empty">No records match this filter.</td></tr>';
      footer.innerHTML = '';
      return;
    }

    const sums = { total:0, discount:0, paid:0, pending:0, b2bPaid:0, expense:0, credit:0, debit:0, holding:0, cashCredit:0, cashDebit:0, bankCredit:0, bankDebit:0 };

    body.innerHTML = rows.map((r, idx) => {
      const m = ledgerRowMetrics(r);
      sums.total += parseFloat(r.total) || 0;
      sums.discount += parseFloat(r.discount) || 0;
      sums.paid += parseFloat(r.paid) || 0;
      sums.pending += m.pending;
      sums.b2bPaid += parseFloat(r.b2bPaid) || 0;
      sums.expense += m.expenseAmt;
      sums.credit += m.credit;
      sums.debit += m.debit;
      sums.holding += m.holding;
      if (r.mode === 'Cash'){ sums.cashCredit += m.credit; sums.cashDebit += m.debit; }
      else { sums.bankCredit += m.credit; sums.bankDebit += m.debit; }

      const typeColor = r.type === 'EXPENSE' ? 'var(--red)' : (r.type === 'AMOUNT_IN' ? 'var(--amber)' : (r.type === 'PAYMENT' ? '#5c8ba8' : (r.type === 'TRANSFER' ? '#8a6fb0' : 'var(--moss)')));
      const canCollect = r.type === 'INVOICE' && m.pending > 0.009;
      const rowId = 'ledger-row-' + idx;

      const mainRow = `
      <tr data-invoice="${escapeHtml(r.invoiceNumber)}" data-pending="${m.pending}" data-exp-id="${r._expenseId || ''}" data-clearance-id="${r._clearanceId || ''}" data-ledger-id="${r._ledgerId || ''}" data-transfer-id="${r._transferId || ''}" data-row-type="${r.type}">
        <td class="cust-meta" style="color:${typeColor};">${r.type}</td>
        <td class="cust-meta">${formatDMY(r.date)}</td>
        <td class="cust-meta">${escapeHtml(r.invoiceNumber)}</td>
        <td>${escapeHtml(r.customer)}</td>
        <td class="cust-meta">${escapeHtml(r.mode)}</td>
        <td class="cust-meta">${acctFmt(r.paid)}</td>
        <td style="color:${m.pending > 0.009 ? 'var(--red)' : 'var(--moss)'};" class="ledger-pending-cell">
          ${canCollect ? `<button class="btn moss btn-sm ledger-collect-open">Collect ₹${m.pending.toFixed(2)}</button>` : acctFmt(m.pending)}
        </td>
        <td style="font-weight:600;">${acctFmt(m.holding)}</td>
        <td><button class="ledger-expand-btn" data-target="${rowId}" type="button">▼</button></td>
        <td>
          <button class="btn ghost btn-sm ledger-edit-row" data-row-idx="${idx}">Edit</button>
          <button class="emp-del ledger-remove">Remove</button>
        </td>
      </tr>`;

      const detailRow = `
      <tr class="ledger-detail-row" id="${rowId}" style="display:none;">
        <td colspan="10">
          <div class="ledger-detail-grid">
            <div class="ledger-detail-item"><div class="dlabel">Patient ID</div><div class="dvalue">${escapeHtml(r.patientId || '—')}</div></div>
            <div class="ledger-detail-item"><div class="dlabel">Total</div><div class="dvalue">${acctFmt(r.total)}</div></div>
            <div class="ledger-detail-item"><div class="dlabel">Discount</div><div class="dvalue">${acctFmt(r.discount)}</div></div>
            <div class="ledger-detail-item"><div class="dlabel">Expense</div><div class="dvalue">${acctFmt(m.expenseAmt)}</div></div>
            <div class="ledger-detail-item"><div class="dlabel">Credit</div><div class="dvalue" style="color:var(--moss);">${acctFmt(m.credit)}</div></div>
            <div class="ledger-detail-item"><div class="dlabel">Debit</div><div class="dvalue" style="color:var(--red);">${acctFmt(m.debit)}</div></div>
          </div>
        </td>
      </tr>`;

      return mainRow + detailRow;
    }).join('');

    footer.innerHTML = `
      <tr class="total-row">
        <td colspan="5" style="text-align:right; font-weight:600;">Totals:</td>
        <td>${acctFmt(sums.paid)}</td>
        <td style="color:var(--red);">${acctFmt(sums.pending)}</td>
        <td style="font-weight:700;">${acctFmt(sums.holding)}</td>
        <td colspan="2">
          <button class="btn ghost btn-sm" id="ledgerToggleFullTotalsBtn" type="button">▼ Full breakdown</button>
        </td>
      </tr>
      <tr class="total-row" id="ledgerFullTotalsRow" style="display:none;">
        <td colspan="10">
          <div class="ledger-detail-grid">
            <div class="ledger-detail-item"><div class="dlabel">Total</div><div class="dvalue">${acctFmt(sums.total)}</div></div>
            <div class="ledger-detail-item"><div class="dlabel">Discount</div><div class="dvalue">${acctFmt(sums.discount)}</div></div>
            <div class="ledger-detail-item"><div class="dlabel">Expense</div><div class="dvalue">${acctFmt(sums.expense)}</div></div>
            <div class="ledger-detail-item"><div class="dlabel">Credit</div><div class="dvalue" style="color:var(--moss);">${acctFmt(sums.credit)}</div></div>
            <div class="ledger-detail-item"><div class="dlabel">Debit</div><div class="dvalue" style="color:var(--red);">${acctFmt(sums.debit)}</div></div>
          </div>
        </td>
      </tr>
      <tr class="total-row">
        <td colspan="9" style="text-align:right; font-weight:700; color:var(--amber);">Cash Closing Balance (Opening Cash + Cash Credit − Cash Debit):</td>
        <td style="font-weight:700; color:var(--amber);">${acctFmt(ledgerOpeningCashVal + (sums.cashCredit - sums.cashDebit))}</td>
      </tr>
      <tr class="total-row">
        <td colspan="9" style="text-align:right; font-weight:700; color:var(--amber);">Bank Closing Balance (Opening Bank + Bank Credit − Bank Debit):</td>
        <td style="font-weight:700; color:var(--amber);">${acctFmt(ledgerOpeningBankVal + (sums.bankCredit - sums.bankDebit))}</td>
      </tr>`;

    document.getElementById('ledgerToggleFullTotalsBtn').addEventListener('click', (e) => {
      const row = document.getElementById('ledgerFullTotalsRow');
      const show = row.style.display === 'none';
      row.style.display = show ? 'table-row' : 'none';
      e.target.textContent = show ? '▲ Hide breakdown' : '▼ Full breakdown';
    });

    body.querySelectorAll('.ledger-expand-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.target);
        const show = target.style.display === 'none';
        target.style.display = show ? 'table-row' : 'none';
        btn.textContent = show ? '▲' : '▼';
      });
    });

    // Edit (routes to the right modal based on row type)
    body.querySelectorAll('.ledger-edit-row').forEach(btn => {
      btn.addEventListener('click', () => {
        const entry = rows[parseInt(btn.dataset.rowIdx, 10)];
        if (!entry) return;
        if (entry.type === 'EXPENSE') openExpenseEditModal(entry);
        else if (entry.type === 'PAYMENT') openPaymentEditModal(entry);
        else if (entry.type === 'TRANSFER') alert('Deposit/Withdraw entries can\u2019t be edited — remove this one and add a new one instead.');
        else openInvoiceEditModal(entry);
      });
    });

    // Remove — each row type lives in a different table, so delete from the right one.
    body.querySelectorAll('.ledger-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const tr = btn.closest('tr');
        const rowType = tr.dataset.rowType;
        showConfirm('Remove this entry permanently? This cannot be undone.', async () => {
          if (rowType === 'EXPENSE'){
            await sb.from('expenses').delete().eq('id', tr.dataset.expId);
          } else if (rowType === 'PAYMENT'){
            await sb.from('payment_clearances').delete().eq('id', tr.dataset.clearanceId);
          } else if (rowType === 'TRANSFER'){
            await sb.from('cash_transfers').delete().eq('id', tr.dataset.transferId);
          } else {
            await sb.from('ledger').delete().eq('id', tr.dataset.ledgerId);
          }
          await acctLoadLedgerAll();
          await acctLoadBalances();
          await expLoad();
        }, 'Remove');
      });
    });

    // Collect (reuses the payment_clearances flow)
    body.querySelectorAll('.ledger-collect-open').forEach(btn => {
      btn.addEventListener('click', () => {
        const tr = btn.closest('tr');
        const pending = parseFloat(tr.dataset.pending);
        const cell = tr.querySelector('.ledger-pending-cell');
        cell.innerHTML = `
          <div class="clear-form">
            <input type="number" class="clear-amount-input" value="${pending.toFixed(2)}" step="0.01" />
            <div class="mode-pills">
              <button type="button" class="mode-pill selected" data-mode="Cash">Cash</button>
              <button type="button" class="mode-pill" data-mode="UPI">UPI</button>
              <button type="button" class="mode-pill" data-mode="Card">Card</button>
            </div>
            <button class="btn moss btn-sm ledger-collect-confirm">Confirm</button>
            <button class="btn ghost btn-sm ledger-collect-cancel">Cancel</button>
          </div>`;

        cell.querySelectorAll('.mode-pill').forEach(p => p.addEventListener('click', () => {
          cell.querySelectorAll('.mode-pill').forEach(x => x.classList.remove('selected'));
          p.classList.add('selected');
        }));
        cell.querySelector('.ledger-collect-cancel').addEventListener('click', () => ledgerApplyFilters());

        cell.querySelector('.ledger-collect-confirm').addEventListener('click', async () => {
          const amount = parseFloat(cell.querySelector('.clear-amount-input').value);
          const mode = cell.querySelector('.mode-pill.selected').dataset.mode;
          if (isNaN(amount) || amount <= 0) return;

          const custNameCell = tr.querySelector('td:nth-child(4)').textContent;
          const sourceRow = ledgerAllRows.find(r => r.invoiceNumber === tr.dataset.invoice && r.type === 'INVOICE');
          await sb.from('payment_clearances').insert({
            invoiceNumber: tr.dataset.invoice, customerName: custNameCell,
            patientId: sourceRow ? (sourceRow.patientId || null) : null,
            amount: parseFloat(amount.toFixed(2)), paymentMode: mode, clearedDate: acctToday()
          });
          await acctLoadClearances();
          await acctLoadLedgerAll();
          await acctLoadBalances();
        });
      });
    });
  }

  ['ledgerSearch','ledgerPatientIdFilter','ledgerMonthFilter','ledgerModeFilter','ledgerStartDate','ledgerEndDate'].forEach(id => {
    document.getElementById(id).addEventListener('input', ledgerApplyFilters);
    document.getElementById(id).addEventListener('change', ledgerApplyFilters);
  });

  document.getElementById('ledgerSaveOpeningBtn').addEventListener('click', async () => {
    const cashVal = parseFloat(document.getElementById('ledgerOpeningCash').value) || 0;
    const bankVal = parseFloat(document.getElementById('ledgerOpeningBank').value) || 0;
    const msgEl = document.getElementById('ledgerOpeningMsg');

    const { data, error: selectError } = await sb.from('ledger_settings').select('id').limit(1);
    if (selectError){
      showMsg(msgEl, 'Could not save: ' + selectError.message, 'err');
      return;
    }

    let saveError = null;
    if (data && data.length > 0){
      const { error } = await sb.from('ledger_settings').update({ opening_cash: cashVal, opening_bank: bankVal }).eq('id', data[0].id);
      saveError = error;
    } else {
      // No settings row exists yet — create one instead of silently doing nothing.
      const { error } = await sb.from('ledger_settings').insert({ opening_cash: cashVal, opening_bank: bankVal });
      saveError = error;
    }

    if (saveError){
      showMsg(msgEl, 'Could not save: ' + saveError.message, 'err');
      return;
    }

    ledgerOpeningCashVal = cashVal;
    ledgerOpeningBankVal = bankVal;
    showMsg(msgEl, 'Opening balances saved.', 'ok');
    ledgerApplyFilters();

    // Keep Overview and the Dashboard card in sync immediately, without
    // needing to log out and back in.
    await acctLoadBalances();
    await loadDashboardAccountsCard();
  });
