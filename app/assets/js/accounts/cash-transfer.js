// ---------- Deposit / Withdraw (Cash <-> Bank transfer) ----------
  wireDateDisplay('transferDate', 'transferDateDisplay');

  document.getElementById('ledgerTransferBtn').addEventListener('click', () => {
    document.getElementById('transferValue').value = '';
    document.getElementById('transferNote').value = '';
    document.getElementById('transferDate').value = acctToday();
    document.getElementById('transferDate').dispatchEvent(new Event('change'));
    clearMsg(document.getElementById('transferMsg'));
    openModal('transferModal');
  });
  document.getElementById('transferCancelBtn').addEventListener('click', () => closeModal('transferModal'));

  document.getElementById('transferSaveBtn').addEventListener('click', async () => {
    const msgEl = document.getElementById('transferMsg');
    const amount = parseFloat(document.getElementById('transferValue').value);
    const note = document.getElementById('transferNote').value.trim();
    const direction = getSelectedMode('transferDirectionPills');
    const dateVal = document.getElementById('transferDate').value || acctToday();

    if (isNaN(amount) || amount <= 0){
      showMsg(msgEl, 'Enter a valid amount.', 'err');
      return;
    }

    const { error } = await sb.from('cash_transfers').insert({
      date: dateVal, direction, amount, note: note || null
    });

    if (error){ showMsg(msgEl, 'Could not save: ' + error.message, 'err'); return; }

    closeModal('transferModal');
    await acctLoadLedgerAll();
    await acctLoadBalances();
  });
