// ---------- Edit Invoice Entry (from Admin > Ledger) ----------
  let editingLedgerId = null;

  function ledgerSelectModePill(containerId, mode){
    document.querySelectorAll(`#${containerId} .mode-pill`).forEach(p => {
      p.classList.toggle('selected', p.dataset.mode === mode);
    });
  }

  function openInvoiceEditModal(entry){
    editingLedgerId = entry._ledgerId;
    document.getElementById('editInvCustomer').value = entry.customer || '';
    document.getElementById('editInvDate').value = entry.date || acctToday();
    document.getElementById('editInvDiscount').value = entry.discount || 0;
    document.getElementById('editInvOtherCharges').value = entry.otherCharges || 0;
    document.getElementById('editInvPaidAmount').value = entry.paid || 0;
    ledgerSelectModePill('editInvModePills', entry.mode || 'Cash');
    clearMsg(document.getElementById('editInvoiceMsg'));
    openModal('editInvoiceModal');
  }

  document.getElementById('editInvoiceCancelBtn').addEventListener('click', () => closeModal('editInvoiceModal'));

  document.getElementById('editInvoiceSaveBtn').addEventListener('click', async () => {
    const msgEl = document.getElementById('editInvoiceMsg');
    if (!editingLedgerId) return;

    const entry = ledgerAllRows.find(r => r._ledgerId === editingLedgerId);
    const invoiceTotal = entry ? (parseFloat(entry.total) || 0) : 0;

    const customerName = document.getElementById('editInvCustomer').value.trim();
    const invoiceDate = document.getElementById('editInvDate').value;
    const discount = parseFloat(document.getElementById('editInvDiscount').value) || 0;
    const otherCharges = parseFloat(document.getElementById('editInvOtherCharges').value) || 0;
    const paidAmount = parseFloat(document.getElementById('editInvPaidAmount').value) || 0;
    const mode = getSelectedMode('editInvModePills');

    if (!customerName){
      showMsg(msgEl, 'Customer name is required.', 'err');
      return;
    }
    if (!invoiceDate){
      showMsg(msgEl, 'Date is required.', 'err');
      return;
    }

    const grandTotal = Math.max(0, invoiceTotal - discount + otherCharges);
    const balanceDue = Math.max(0, grandTotal - paidAmount);

    const { error } = await sb.from('ledger').update({
      customerName, invoiceDate, discount, otherCharges,
      customerPaidAmount: paidAmount, customerPaymentMode: mode,
      grandTotal, balanceDue
    }).eq('id', editingLedgerId);

    if (error){ showMsg(msgEl, 'Could not save: ' + error.message, 'err'); return; }

    editingLedgerId = null;
    closeModal('editInvoiceModal');
    await acctLoadLedgerAll();
    await acctLoadBalances();
  });

  // ---------- Edit Payment Entry (from Admin > Ledger) ----------
  let editingClearanceId = null;

  function openPaymentEditModal(entry){
    editingClearanceId = entry._clearanceId;
    document.getElementById('editPaymentAmount').value = entry.paid || 0;
    document.getElementById('editPaymentDate').value = entry.date || acctToday();
    ledgerSelectModePill('editPaymentModePills', entry.mode || 'Cash');
    clearMsg(document.getElementById('editPaymentMsg'));
    openModal('editPaymentModal');
  }

  document.getElementById('editPaymentCancelBtn').addEventListener('click', () => closeModal('editPaymentModal'));

  document.getElementById('editPaymentSaveBtn').addEventListener('click', async () => {
    const msgEl = document.getElementById('editPaymentMsg');
    if (!editingClearanceId) return;

    const amount = parseFloat(document.getElementById('editPaymentAmount').value);
    const clearedDate = document.getElementById('editPaymentDate').value;
    const mode = getSelectedMode('editPaymentModePills');

    if (isNaN(amount) || amount <= 0){
      showMsg(msgEl, 'Enter a valid amount.', 'err');
      return;
    }

    const { error } = await sb.from('payment_clearances').update({
      amount, clearedDate, paymentMode: mode
    }).eq('id', editingClearanceId);

    if (error){ showMsg(msgEl, 'Could not save: ' + error.message, 'err'); return; }

    editingClearanceId = null;
    closeModal('editPaymentModal');
    await acctLoadClearances();
    await acctLoadLedgerAll();
    await acctLoadBalances();
  });
