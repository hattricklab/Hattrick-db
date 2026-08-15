// ---------- Admin: Profit & Loss — Excel-style grid (months as columns) ----------
  const PNL_MONTH_NAMES_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const PNL_COGS_CATEGORIES = ['SRM Settlement', 'Home Collection Charge'];
  const PNL_CATEGORY_ORDER = ['Rent','Electricity (EB Bill)','Salary','Recharge','Water Can','Interest on EMI',
    'SRM Settlement','Home Collection Charge','Supplies','Maintenance','Misc','Other'];

  // Normalizes for comparison only (trims + collapses spaces + lowercases) so
  // "srm settlement", " SRM Settlement", "SRM  Settlement" etc. all still
  // correctly count as Cost of Goods Sold instead of silently falling into
  // regular Expenses. The ORIGINAL casing is still what gets displayed.
  function pnlNormalizeCat(str){
    return String(str || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }
  const PNL_COGS_NORMALIZED = PNL_COGS_CATEGORIES.map(pnlNormalizeCat);

  function pnlIsCogsCategory(cat){
    return PNL_COGS_NORMALIZED.includes(pnlNormalizeCat(cat));
  }

  // Accepts "YYYY-MM-DD" (normal) or "DD/MM/YYYY" (older CSV-imported rows)
  // and always returns a "YYYY-MM" grouping key, or null if unparseable.
  function pnlMonthKey(dateStr){
    if (!dateStr) return null;
    const s = String(dateStr).trim();
    if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
    const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}`;
    return null;
  }

  function pnlFormatMonth(key){
    const [y, mo] = key.split('-');
    return `${PNL_MONTH_NAMES_SHORT[parseInt(mo, 10) - 1]}-${y.slice(2)}`;
  }

  function pnlSortCategories(cats){
    const known = PNL_CATEGORY_ORDER.filter(c => cats.includes(c));
    const unknown = cats.filter(c => !PNL_CATEGORY_ORDER.includes(c)).sort();
    return [...known, ...unknown];
  }

  async function pnlLoad(){
    const thead = document.getElementById('pnlTableHead');
    const tbody = document.getElementById('pnlTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td class="empty">Loading…</td></tr>';

    const [{ data: invRows }, { data: expRows }, { data: clearanceRows }] = await Promise.all([
      sb.from('ledger').select('invoiceDate, invoiceNumber, invoiceTotal, discount, otherCharges, customerPaidAmount, type').limit(5000),
      sb.from('expenses').select('date, category, amount').limit(5000),
      sb.from('payment_clearances').select('invoiceNumber, amount').limit(5000)
    ]);

    // Sum of payments already collected against each invoice's original
    // balanceDue (payment_clearances is a separate table, never rolled back
    // into ledger.balanceDue itself — without this, Outstanding would keep
    // counting invoices that were actually paid off later).
    const clearedByInvoice = {};
    (clearanceRows || []).forEach(c => {
      const amt = parseFloat(c.amount) || 0;
      clearedByInvoice[c.invoiceNumber] = (clearedByInvoice[c.invoiceNumber] || 0) + amt;
    });

    const months = {};
    const ensureMonth = (key) => months[key] || (months[key] = {
      sales: 0, outstanding: 0, cogsByCategory: {}, expByCategory: {}
    });

    (invRows || []).forEach(r => {
      if (r.type && r.type !== 'INVOICE') return; // AMOUNT_IN/etc aren't real sales
      const key = pnlMonthKey(r.invoiceDate);
      if (!key) return;
      const m = ensureMonth(key);
      // The stored grandTotal column has been found to be unreliable on
      // some rows (sometimes = invoiceTotal, sometimes = amount paid,
      // sometimes 0) — so Sales is computed fresh here instead of trusted
      // from that column.
      const invoiceTotal = parseFloat(r.invoiceTotal) || 0;
      const discount = parseFloat(r.discount) || 0;
      const otherCharges = parseFloat(r.otherCharges) || 0;
      const trueGrandTotal = Math.max(0, invoiceTotal - discount + otherCharges);
      m.sales += trueGrandTotal;
      const paidAmount = parseFloat(r.customerPaidAmount) || 0;
      const trueBalanceDue = Math.max(0, trueGrandTotal - paidAmount);
      const cleared = clearedByInvoice[r.invoiceNumber] || 0;
      m.outstanding += Math.max(0, trueBalanceDue - cleared);
    });

    (expRows || []).forEach(r => {
      const key = pnlMonthKey(r.date);
      if (!key) return;
      const m = ensureMonth(key);
      const amt = parseFloat(r.amount) || 0;
      const catDisplay = (r.category || 'Misc').trim() || 'Misc';
      const bucket = pnlIsCogsCategory(catDisplay) ? m.cogsByCategory : m.expByCategory;
      bucket[catDisplay] = (bucket[catDisplay] || 0) + amt;
    });

    const monthKeys = Object.keys(months).sort(); // oldest → newest, left to right, like the sheet

    if (monthKeys.length === 0){
      thead.innerHTML = '<tr><th>Income</th></tr>';
      tbody.innerHTML = '<tr><td class="empty">No data yet — add some invoices or expenses first.</td></tr>';
      return;
    }

    // Only show category rows that actually have data in at least one shown month.
    const allCogsCats = new Set();
    const allExpCats = new Set();
    monthKeys.forEach(k => {
      Object.keys(months[k].cogsByCategory).forEach(c => allCogsCats.add(c));
      Object.keys(months[k].expByCategory).forEach(c => allExpCats.add(c));
    });
    const cogsCats = pnlSortCategories([...allCogsCats]);
    const expCats = pnlSortCategories([...allExpCats]);

    const currentMonthKey = pnlMonthKey(acctToday());

    // ---------- Header ----------
    thead.innerHTML = `<tr><th>Income</th>${monthKeys.map(k =>
      `<th class="${k === currentMonthKey ? 'pnl-current-month' : ''}">${pnlFormatMonth(k)}</th>`
    ).join('')}</tr>`;

    // ---------- Body ----------
    const rupee = (n) => n ? acctFmt(n) : '<span class="pnl-zero">–</span>';
    const cell = (fn) => monthKeys.map(k =>
      `<td class="${k === currentMonthKey ? 'pnl-current-month' : ''}">${rupee(fn(months[k]))}</td>`
    ).join('');

    const rows = [];

    rows.push(`<tr class="pnl-row-highlight"><td>Sales</td>${cell(m => m.sales)}</tr>`);

    rows.push(`<tr class="pnl-row-highlight"><td>Cost of Goods Sold</td>${cell(m => Object.values(m.cogsByCategory).reduce((a,b)=>a+b,0))}</tr>`);
    cogsCats.forEach(cat => {
      rows.push(`<tr class="pnl-row-sub"><td>${escapeHtml(cat)}</td>${cell(m => m.cogsByCategory[cat] || 0)}</tr>`);
    });

    rows.push(`<tr class="pnl-row-highlight pnl-row-bold"><td>Gross Profit (Sales − COGS)</td>${cell(m => {
      const cogsTotal = Object.values(m.cogsByCategory).reduce((a,b)=>a+b,0);
      return m.sales - cogsTotal;
    })}</tr>`);

    rows.push(`<tr class="pnl-row-section"><td>Expenses</td>${monthKeys.map(() => '<td></td>').join('')}</tr>`);
    expCats.forEach(cat => {
      rows.push(`<tr class="pnl-row-sub"><td>${escapeHtml(cat)}</td>${cell(m => m.expByCategory[cat] || 0)}</tr>`);
    });

    rows.push(`<tr class="pnl-row-danger pnl-row-bold"><td>Total Expenses</td>${cell(m => Object.values(m.expByCategory).reduce((a,b)=>a+b,0))}</tr>`);

    rows.push(`<tr class="pnl-row-net pnl-row-bold"><td>Net Profit</td>${monthKeys.map(k => {
      const m = months[k];
      const cogsTotal = Object.values(m.cogsByCategory).reduce((a,b)=>a+b,0);
      const expTotal = Object.values(m.expByCategory).reduce((a,b)=>a+b,0);
      const net = m.sales - cogsTotal - expTotal;
      const cls = k === currentMonthKey ? 'pnl-current-month' : '';
      return `<td class="${cls}" style="color:${net >= 0 ? 'var(--moss)' : 'var(--red)'}; font-weight:700;">${acctFmt(net)}</td>`;
    }).join('')}</tr>`);

    rows.push(`<tr class="pnl-row-outstanding"><td>Outstanding</td>${cell(m => m.outstanding)}</tr>`);

    tbody.innerHTML = rows.join('');
  }
