// ---------- Expenses ----------
  const EXP_FIXED_CATEGORIES = ['Rent','Electricity (EB Bill)','Salary','Recharge','Water Can',
    'Interest on EMI','SRM Settlement','Home Collection Charge','Supplies','Maintenance','Misc','Other'];

  async function expRefreshEmployeeCategoryOptions(){
    const select = document.getElementById('expCategory');
    const { data } = await sb.from('expenses').select('category').limit(5000);
    const usedCategories = Array.from(new Set((data || []).map(r => (r.category || '').trim()).filter(Boolean)));
    const customCategories = usedCategories.filter(c => !EXP_FIXED_CATEGORIES.includes(c)).sort();
    const allCategories = [...EXP_FIXED_CATEGORIES, ...customCategories];
    const previousValue = select.value;
    select.innerHTML = allCategories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    if (allCategories.includes(previousValue)) select.value = previousValue;
  }

  async function expLoad(){
    await expRefreshEmployeeCategoryOptions();
    const { data, error } = await sb.from('expenses').select('*').neq('added_by', 'admin').order('date', { ascending: false }).limit(100);
    const body = document.getElementById('expTableBody');
    if (error || !data || data.length === 0){
      body.innerHTML = '<tr><td colspan="5" class="empty">No expenses recorded yet.</td></tr>';
      return;
    }
    body.innerHTML = data.map(e => `
      <tr>
        <td class="cust-meta">${escapeHtml(e.date)}</td>
        <td class="cust-meta">${escapeHtml(e.category)}</td>
        <td>${escapeHtml(e.description)}</td>
        <td style="color:var(--red); font-weight:600;">${acctFmt(e.amount)}</td>
        <td class="cust-meta">${escapeHtml(e.source || 'Cash')}</td>
        <td style="text-align:right;"><button class="emp-del exp-del" data-id="${e.id}">Remove</button></td>
      </tr>`).join('');

    body.querySelectorAll('.exp-del').forEach(btn => {
      btn.addEventListener('click', () => {
        showConfirm('Remove this expense?', async () => {
          await sb.from('expenses').delete().eq('id', btn.dataset.id);
          await expLoad();
          await acctLoadBalances();
        }, 'Remove');
      });
    });
  }

  document.getElementById('expAddBtn').addEventListener('click', async () => {
    const date = document.getElementById('expDate').value || acctToday();
    const category = document.getElementById('expCategory').value;
    const description = document.getElementById('expDescription').value.trim();
    const amount = parseFloat(document.getElementById('expAmount').value);
    const source = document.getElementById('expSource').value;

    if (isNaN(amount) || amount <= 0){
      showMsg(document.getElementById('expMsg'), 'Enter a valid amount.', 'err');
      return;
    }
    if (category === 'Other' && !description){
      showMsg(document.getElementById('expMsg'), 'Description is required when category is "Other".', 'err');
      return;
    }

    const { error } = await sb.from('expenses').insert({ date, category, description, amount, source, added_by: 'employee' });
    if (error){
      showMsg(document.getElementById('expMsg'), error.message, 'err');
      return;
    }

    showMsg(document.getElementById('expMsg'), 'Expense added.', 'ok');
    document.getElementById('expDescription').value = '';
    document.getElementById('expAmount').value = '';
    await expLoad();
    await acctLoadBalances();
  });
