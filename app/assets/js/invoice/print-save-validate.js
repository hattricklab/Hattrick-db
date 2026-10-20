// ---------- Print / Save / Validate ----------
  function invValidateInvoiceData(){
    const c = invGetSelectedCustomerData();
    if (!c){ invAlertModal('Please select a customer before generating the invoice.', 'error'); return false; }
    if (invSelectedTests.length === 0 && invSelectedPackages.length === 0){
      invAlertModal('Please select at least one service/test or package.', 'error');
      return false;
    }
    return true;
  }

  async function invGenerateAndPrint(){
    if (!invValidateInvoiceData()) return;
    invCalculateTotal();

    if (window.invInvoiceData.customer.id !== 'WALKIN'){
      const msg = await invSaveInvoiceTransaction(window.invInvoiceData);
      invAlertModal(msg, 'info');
    } else {
      invAlertModal('Walk-in invoice generated (not saved to customer history).', 'info');
    }

    document.getElementById('invInvoicePrintArea').innerHTML = invGenerateInvoiceHTML(window.invInvoiceData);
    window.print();
  }
  document.getElementById('invPrintBtn').addEventListener('click', invGenerateAndPrint);

  function invSaveInvoiceHTML(){
    if (!invValidateInvoiceData()) return;
    invCalculateTotal();

    const invoiceHTML = invGenerateInvoiceHTML(window.invInvoiceData);
    const fullHTML = `<!DOCTYPE html>
      <html lang="en"><head><meta charset="UTF-8"><title>Invoice ${escapeHtml(window.invInvoiceData.invoiceNumber)}</title>
      <style>
        body{ font-family:'Inter',sans-serif; margin:0; padding:20px; color:#000; }
        .invoice-table{ width:100%; border-collapse:collapse; margin-top:20px; font-size:11pt; }
        .invoice-table th,.invoice-table td{ border:1px solid #333; padding:8px; text-align:left; }
        .invoice-table th{ background-color:#f2f2f2; }
        .total-row strong{ color:#d63333; }
      </style></head><body>
        ${invoiceHTML}
        <p style="text-align:center; margin-top:50px; font-size:0.8em; color:#555;">-- Saved from Hattrick Lab Invoice Generator --</p>
      </body></html>`;

    const blob = new Blob([fullHTML], { type: 'text/html;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `INV_${window.invInvoiceData.invoiceNumber}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    invAlertModal(`Invoice ${window.invInvoiceData.invoiceNumber} saved. Check your Downloads folder.`, 'info');
  }
  document.getElementById('invSaveHtmlBtn').addEventListener('click', invSaveInvoiceHTML);

  function invGenerateInvoiceHTML(data){
    const customer = data.customer;
    const tests = [...data.selectedTests];
    const invoiceNumber = data.invoiceNumber;
    const fmt = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

    const chargesNote = data.chargesNote;
    const chargesNoteRow = (chargesNote.trim().length > 0) ? `
      <tr><td colspan="5" style="border:none; padding:0 0 8px 0; font-style:italic; font-size:0.9em;">
        <span style="font-weight:bold;">Note:</span> ${escapeHtml(chargesNote)}
      </td></tr>` : '';

    tests.sort((a, b) => a.name.localeCompare(b.name));

    const serviceRows = tests.map((test, index) => {
      const price = parseFloat(test.price).toLocaleString('en-IN', fmt);
      return `<tr>
        <td style="border:1px solid #333; padding:8px;">${index + 1}</td>
        <td style="border:1px solid #333; padding:8px;">${escapeHtml(test.name)}</td>
        <td style="text-align:right; border:1px solid #333; padding:8px;">1</td>
        <td style="text-align:right; border:1px solid #333; padding:8px;">₹${price}</td>
        <td style="text-align:right; border:1px solid #333; padding:8px;">₹${price}</td>
      </tr>`;
    }).join('');

    const fillerCount = Math.max(0, 8 - tests.length);
    const fillerRows = Array(fillerCount).fill('<tr><td style="border:1px solid #ddd; padding:8px;">&nbsp;</td><td style="border:1px solid #ddd; padding:8px;"></td><td style="border:1px solid #ddd; padding:8px;"></td><td style="border:1px solid #ddd; padding:8px;"></td><td style="border:1px solid #ddd; padding:8px;"></td></tr>').join('');

    const subtotal = data.subtotal.toLocaleString('en-IN', fmt);
    const discount = data.discount.toLocaleString('en-IN', fmt);
    const charges = data.charges.toLocaleString('en-IN', fmt);
    const grandTotalDisplay = data.invoiceTotal.toLocaleString('en-IN', fmt);
    const paymentStatus = data.isFullPayment ? 'Full Payment' : 'Advance/Partial Payment';
    const amountReceived = data.amountReceived.toLocaleString('en-IN', fmt);
    const balanceDue = data.balanceDue.toLocaleString('en-IN', fmt);
    const paymentModeText = document.getElementById('invPaymentMode').value;

    const paymentRow = `
      <tr>
        <td colspan="3" style="border:none; padding:8px 0; font-weight:bold; font-size:0.9em;">Payment Status: ${paymentStatus} (${escapeHtml(paymentModeText)})</td>
        <td style="text-align:right; border:1px solid #333; border-top:1px solid #333; background-color:#f9f9f9; padding:8px;">Amount Paid:</td>
        <td style="text-align:right; border:1px solid #333; border-top:1px solid #333; background-color:#f9f9f9; padding:8px;">₹${amountReceived}</td>
      </tr>
      <tr style="background-color:#ffe6e6;">
        <td colspan="3" style="border:none; padding:8px 0;"></td>
        <td style="text-align:right; font-weight:bold; border:1px solid #333; padding:8px;">Balance Due:</td>
        <td style="text-align:right; font-weight:bold; color:#d63333; border:1px solid #333; padding:8px;">₹${balanceDue}</td>
      </tr>`;

    return `
      <div style="max-width:700px; margin:0 auto; padding:20px; border:1px solid #ccc; color:#000; font-size:11pt;">
        <div style="border-bottom:2px solid #333; padding-bottom:10px; margin-bottom:20px; display:flex; align-items:center;">
          <div style="flex-shrink:0; margin-right:16px;">
            <img src="${LOGO_DATA_URI}" alt="Hattrick Diagnostic Lab" style="width:90px; height:90px; object-fit:contain;" />
          </div>
          <div style="flex-grow:1; text-align:center;">
            <h1 style="margin:0; color:#000; font-size:1.8em;">HATTRICK DIAGNOSTIC LAB</h1>
            <p style="margin:5px 0 0 0; font-size:0.9em;">35/18, Samy street, Egmore, Near by Childrens Hospotal, Chennai - 600 008.<br>Phone: 95 00 00 5061</p>
          </div>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:20px;">
          <div style="flex:1;">
            <p style="margin:0;"><strong>INVOICE NO:</strong> ${escapeHtml(invoiceNumber)}</p>
            <p style="margin:5px 0 0 0;"><strong>PATIENT ID:</strong> ${escapeHtml(customer.id)}</p>
            <p style="margin:5px 0 0 0;"><strong>DATE:</strong> ${formatDMY(data.invoiceDate)}</p>
          </div>
          <div style="flex:1; text-align:right;">
            <p style="margin:0; font-weight:bold;">BILL TO:</p>
            <p style="margin:0; font-weight:bold;">${escapeHtml(customer.name)}</p>
            <p style="margin:0; font-size:0.9em;"><strong>Age:</strong> ${escapeHtml(customer.age)} &nbsp;|&nbsp; <strong>Sex:</strong> ${escapeHtml(customer.sex)}</p>
            <p style="margin:0; font-size:0.9em;">Ph: ${escapeHtml(customer.phone)}</p>
            <p style="margin:0; font-size:0.9em;">Addr: ${escapeHtml(customer.address)}</p>
          </div>
        </div>
        <table class="invoice-table" style="width:100%; border-collapse:collapse; margin-top:20px;">
          <thead><tr>
            <th style="width:5%; border:1px solid #333; background-color:#f2f2f2; padding:8px;">#</th>
            <th style="width:50%; border:1px solid #333; background-color:#f2f2f2; padding:8px;">Test Name</th>
            <th style="width:15%; text-align:right; border:1px solid #333; background-color:#f2f2f2; padding:8px;">Qty</th>
            <th style="width:15%; text-align:right; border:1px solid #333; background-color:#f2f2f2; padding:8px;">Unit Price (₹)</th>
            <th style="width:15%; text-align:right; border:1px solid #333; background-color:#f2f2f2; padding:8px;">Amount (₹)</th>
          </tr></thead>
          <tbody>${serviceRows}${fillerRows}</tbody>
          <tfoot>
            ${chargesNoteRow}
            <tr>
              <td colspan="3" style="border:none; padding:8px 0; border-top:1px solid #ddd;"></td>
              <td style="text-align:right; border:1px solid #333; border-bottom:none; border-top:1px solid #333; background-color:#f9f9f9; padding:8px;">Subtotal:</td>
              <td style="text-align:right; border:1px solid #333; border-bottom:none; border-top:1px solid #333; background-color:#f9f9f9; padding:8px;">₹${subtotal}</td>
            </tr>
            <tr>
              <td colspan="3" style="border:none;"></td>
              <td style="text-align:right; border:1px solid #333; border-top:none; border-bottom:none; background-color:#f9f9f9; padding:8px;">Discount:</td>
              <td style="text-align:right; border:1px solid #333; border-top:none; border-bottom:none; background-color:#f9f9f9; padding:8px;">- ₹${discount}</td>
            </tr>
            <tr>
              <td colspan="3" style="border:none;"></td>
              <td style="text-align:right; border:1px solid #333; border-top:none; border-bottom:2px solid #333; background-color:#f9f9f9; padding:8px;">Other Charges:</td>
              <td style="text-align:right; border:1px solid #333; border-top:none; border-bottom:2px solid #333; background-color:#f9f9f9; padding:8px;">+ ₹${charges}</td>
            </tr>
            <tr style="background-color:#f2f2f2;">
              <td colspan="4" style="text-align:right; font-size:1.1em; border:1px solid #333; padding:8px;"><strong>GRAND TOTAL:</strong></td>
              <td class="total-row" style="text-align:right; font-size:1.1em; border:1px solid #333; padding:8px;"><strong>₹${grandTotalDisplay}</strong></td>
            </tr>
            ${paymentRow}
          </tfoot>
        </table>
        <div style="margin-top:20px; font-size:0.8em; color:#555;">
          <p><em>*Prices are inclusive of all standard charges. Thank you for visiting the Hattrick.</em></p>
        </div>
        <div style="border-top:1px dashed #aaa; margin-top:50px; padding-top:20px; text-align:right;">
          <p style="margin:0; padding-top:30px; color:#000;">Authorized Signature</p>
        </div>
      </div>`;
  }

  function invAlertModal(message, type = 'info'){
    const div = document.createElement('div');
    div.className = 'inv-toast';
    div.style.backgroundColor = type === 'error' ? 'var(--red)' : (type === 'warning' ? '#d99a3e' : 'var(--moss)');
    div.textContent = message;
    document.body.appendChild(div);
    setTimeout(() => { div.style.opacity = '0'; setTimeout(() => div.remove(), 300); }, 4000);
  }

  // ============================================================
  // ACCOUNTS — live balances from ledger, pending payment history,
  // simple closing verification
  // ============================================================
  function acctFmt(n){
    return `₹${(parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  function acctToday(){ return istDateStr(nowIST()); }

  let acctAllClearances = [];   // full payment_clearances table, cached
  let acctCashBalanceVal = 0;
  let acctDigitalBalanceVal = 0;

  // Sum of clearances already recorded against one invoice
  function acctClearedTotalFor(invoiceNumber){
    return acctAllClearances
      .filter(c => c.invoiceNumber === invoiceNumber)
      .reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);
  }

  async function acctLoadClearances(){
    const { data, error } = await sb
      .from('payment_clearances')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(300);
    acctAllClearances = (!error && data) ? data : [];
  }
