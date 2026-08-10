// ---------- Add / Edit Expense (shared modal) ----------
  let editingExpenseId = null;

  const FIXED_EXPENSE_CATEGORIES = ['Rent','Electricity (EB Bill)','Salary','Recharge','Water Can',
    'Interest on EMI','SRM Settlement','Home Collection Charge','Supplies','Maintenance','Misc','Other'];

  function expSelectModePill(mode){
    const pills = document.querySelectorAll('#addExpenseModePills .mode-pill');
    pills.forEach(p => p.classList.toggle('selected', p.dataset.mode === mode));
  }

  // Pulls every category that's actually been used before (including custom
  // ones typed via "+ New category…") and rebuilds the dropdown so they
  // never have to be re-typed — they just show up as normal options.
  async function expRefreshCategoryOptions(){
    const select = document.getElementById('addExpenseCategory');
    const { data } = await sb.from('expenses').select('category').limit(5000);
    const usedCategories = Array.from(new Set((data || []).map(r => (r.category || '').trim()).filter(Boolean)));
    const customCategories = usedCategories.filter(c => !FIXED_EXPENSE_CATEGORIES.includes(c)).sort();

    const allCategories = [...FIXED_EXPENSE_CATEGORIES, ...customCategories];
    select.innerHTML = allCategories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')
      + '<option value="__new__">+ New category…</option>';
  }

  document.getElementById('ledgerAddExpenseBtn').addEventListener('click', async () => {
    editingExpenseId = null;
    document.querySelector('#addExpenseModal .modal-title').textContent = 'Add Expense';
    document.getElementById('addExpenseValue').value = '';
    document.getElementById('addExpenseDescription').value = '';
    await expRefreshCategoryOptions();
    document.getElementById('addExpenseCategory').value = 'Other';
    document.getElementById('addExpenseNewCategory').value = '';
    document.getElementById('addExpenseNewCategoryWrap').style.display = 'none';
    document.getElementById('addExpenseDate').value = acctToday();
    expSelectModePill('Cash');
    clearMsg(document.getElementById('addExpenseMsg'));
    openModal('addExpenseModal');
  });

  // Called from admin-full-ledger.js when "Edit" is clicked on an existing expense row.
  async function openExpenseEditModal(entry){
    editingExpenseId = entry._expenseId;
    document.querySelector('#addExpenseModal .modal-title').textContent = 'Edit Expense';
    document.getElementById('addExpenseValue').value = entry.paid || 0;
    document.getElementById('addExpenseDescription').value = entry.customer || '';
    document.getElementById('addExpenseDate').value = entry.date || acctToday();

    await expRefreshCategoryOptions();
    const category = entry.category || 'Other';
    const catSelect = document.getElementById('addExpenseCategory');
    const optionExists = Array.from(catSelect.options).some(o => o.value === category);
    if (optionExists){
      catSelect.value = category;
      document.getElementById('addExpenseNewCategoryWrap').style.display = 'none';
      document.getElementById('addExpenseNewCategory').value = '';
    } else {
      catSelect.value = '__new__';
      document.getElementById('addExpenseNewCategoryWrap').style.display = 'block';
      document.getElementById('addExpenseNewCategory').value = category;
    }

    expSelectModePill(entry.mode || 'Cash');
    clearMsg(document.getElementById('addExpenseMsg'));
    openModal('addExpenseModal');
  }

  document.getElementById('addExpenseCancelBtn').addEventListener('click', () => closeModal('addExpenseModal'));

  document.getElementById('addExpenseCategory').addEventListener('change', (e) => {
    document.getElementById('addExpenseNewCategoryWrap').style.display = e.target.value === '__new__' ? 'block' : 'none';
  });

  document.getElementById('addExpenseSaveBtn').addEventListener('click', async () => {
    const msgEl = document.getElementById('addExpenseMsg');
    const amount = parseFloat(document.getElementById('addExpenseValue').value);
    const description = document.getElementById('addExpenseDescription').value.trim();
    const categorySelect = document.getElementById('addExpenseCategory').value;
    const category = categorySelect === '__new__'
      ? document.getElementById('addExpenseNewCategory').value.trim()
      : categorySelect;
    const mode = getSelectedMode('addExpenseModePills');
    const dateVal = document.getElementById('addExpenseDate').value || acctToday();

    if (isNaN(amount) || amount <= 0){
      showMsg(msgEl, 'Enter a valid amount.', 'err');
      return;
    }
    if (categorySelect === '__new__' && !category){
      showMsg(msgEl, 'Enter a name for the new category.', 'err');
      return;
    }
    if (category === 'Other' && !description){
      showMsg(msgEl, 'Description is required when category is "Other".', 'err');
      return;
    }

    let error;
    if (editingExpenseId){
      ({ error } = await sb.from('expenses').update({
        category, description, amount, source: mode, date: dateVal
      }).eq('id', editingExpenseId));
    } else {
      ({ error } = await sb.from('expenses').insert({
        date: dateVal, category, description, amount, source: mode, added_by: 'admin'
      }));
    }
    if (error){ showMsg(msgEl, 'Could not save: ' + error.message, 'err'); return; }

    editingExpenseId = null;
    closeModal('addExpenseModal');
    await acctLoadLedgerAll();
    await acctLoadBalances();
    await expLoad();
  });
