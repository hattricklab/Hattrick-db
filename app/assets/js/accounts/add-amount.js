// ---------- Add Amount (manual cash-in) ----------
  document.getElementById('ledgerAddAmountBtn').addEventListener('click', () => {
    document.getElementById('addAmountValue').value = '';
    document.getElementById('addAmountReason').value = 'Manual Cash Input';
    document.getElementById('addAmountDate').value = acctToday();
    clearMsg(document.getElementById('addAmountMsg'));
    openModal('addAmountModal');
  });
  document.getElementById('addAmountCancelBtn').addEventListener('click', () => closeModal('addAmountModal'));

  document.getElementById('addAmountSaveBtn').addEventListener('click', async () => {
    const msgEl = document.getElementById('addAmountMsg');
    const amount = parseFloat(document.getElementById('addAmountValue').value);
    const reason = document.getElementById('addAmountReason').value.trim() || 'Manual Cash Input';
    const mode = getSelectedMode('addAmountModePills');
    const dateVal = document.getElementById('addAmountDate').value || acctToday();

    if (isNaN(amount) || amount <= 0){
      showMsg(msgEl, 'Enter a valid amount.', 'err');
      return;
    }

    const record = {
      invoiceNumber: `CASH-${Date.now()}`,
      invoiceDate: dateVal,
      customerId: null,
      customerName: reason,
      b2bName: '',
      customerPaymentMode: mode,
      paymentType: 'Full',
      invoiceTotal: 0,
      grandTotal: amount,
      customerPaidAmount: amount,
      balanceDue: 0,
      paidAmountToB2B: 0,
      discount: 0,
      otherCharges: 0,
      testsCount: 0,
      type: 'AMOUNT_IN'
    };
    const { error } = await sb.from('ledger').insert(record);
    if (error){ showMsg(msgEl, 'Could not save: ' + error.message, 'err'); return; }

    closeModal('addAmountModal');
    await acctLoadLedgerAll();
    await acctLoadBalances();
  });
