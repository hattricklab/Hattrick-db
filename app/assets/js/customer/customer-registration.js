// ---------- Customer registration (shared controller — used by Employee & Admin views) ----------
  const custMsg = document.getElementById('custMsg');
  const custTableBody = document.getElementById('custTableBody');

  function makeCustomerListController(ids){
    let allRows = [];

    // Sorts by Patient ID, highest first — numeric-aware so "0193" correctly
    // sorts above "0140" (not just lexicographically), with non-numeric IDs
    // pushed to the end.
    function comparePatientIdDesc(a, b){
      const aId = (a.patientId || '').trim();
      const bId = (b.patientId || '').trim();
      const aNum = /^\d+$/.test(aId) ? parseInt(aId, 10) : null;
      const bNum = /^\d+$/.test(bId) ? parseInt(bId, 10) : null;
      if (aNum !== null && bNum !== null) return bNum - aNum;
      if (aNum !== null) return -1;
      if (bNum !== null) return 1;
      return bId.localeCompare(aId);
    }

    function matchesSearch(c, term){
      return (c.name || '').toLowerCase().includes(term) ||
        (c.phone || '').toLowerCase().includes(term) ||
        (c.patientId || '').toLowerCase().includes(term);
    }

    function applyFilter(){
      const term = document.getElementById(ids.searchId).value.toLowerCase().trim();
      if (!term){
        render([...allRows].sort(comparePatientIdDesc));
        return;
      }
      // Search the FULL customers table directly — don't rely on the capped
      // local cache, or customers outside that window would never be
      // findable via search either.
      (async () => {
        const showArchived = document.getElementById(ids.archiveId).checked;
        const safeTerm = term.replace(/[,()%]/g, '');
        let query = sb.from('customers')
          .select('*')
          .or(`name.ilike.%${safeTerm}%,phone.ilike.%${safeTerm}%,patientId.ilike.%${safeTerm}%`)
          .limit(500);
        query = showArchived ? query : query.eq('active', true);
        const { data, error } = await query;
        render(((!error && data) ? data : []).sort(comparePatientIdDesc));
      })();
    }

    function render(rows){
      const tbody = document.getElementById(ids.tbodyId);
      if (!rows || rows.length === 0){
        tbody.innerHTML = '<tr><td colspan="7" class="empty">No customers found.</td></tr>';
        return;
      }

      tbody.innerHTML = rows.map((c, idx) => {
        const rowId = ids.tbodyId + '-edit-' + idx;
        return `
        <tr>
          <td><div class="cust-name">${escapeHtml(c.title || '')} ${escapeHtml(c.name || '')}</div></td>
          <td class="cust-meta">${escapeHtml(c.age || '—')} / ${escapeHtml(c.sex || '—')}</td>
          <td class="cust-meta">${escapeHtml(c.phone || '—')}</td>
          <td class="cust-meta">${escapeHtml(c.patientId || '—')}</td>
          <td class="cust-meta">${escapeHtml(c.branch || '—')}</td>
          <td class="cust-meta">${formatDMY(c.dateAdded)}</td>
          <td style="text-align:right; white-space:nowrap;">
            <button class="pkg-expand-toggle cust-edit-toggle" data-target="${rowId}" style="margin-left:0; margin-right:10px;">Edit</button>
            <button class="emp-del cust-archive" data-id="${escapeHtml(c.id)}" data-active="${c.active}" style="color:${c.active === false ? 'var(--moss)' : 'var(--red)'};">${c.active === false ? 'Restore' : 'Archive'}</button>
          </td>
        </tr>
        <tr id="${rowId}" style="display:none;">
          <td colspan="7" style="background:var(--amber-soft);">
            <div class="ledger-detail-grid" style="margin-bottom:14px;">
              <div class="field" style="margin-bottom:0;"><label>Title</label>
                <select class="field-select cust-edit-title">
                  <option ${c.title==='Mr.'?'selected':''}>Mr.</option><option ${c.title==='Mrs.'?'selected':''}>Mrs.</option>
                  <option ${c.title==='Ms.'?'selected':''}>Ms.</option><option ${c.title==='Miss.'?'selected':''}>Miss.</option>
                  <option ${c.title==='Master.'?'selected':''}>Master.</option><option ${c.title==='Baby.'?'selected':''}>Baby.</option>
                  <option ${c.title==='Child.'?'selected':''}>Child.</option><option ${c.title==='Dr.'?'selected':''}>Dr.</option>
                </select>
              </div>
              <div class="field" style="margin-bottom:0;"><label>Name</label><input type="text" class="cust-edit-name" value="${escapeHtml(c.name || '')}" /></div>
              <div class="field" style="margin-bottom:0;"><label>Age</label><input type="text" class="cust-edit-age" value="${escapeHtml(c.age || '')}" /></div>
              <div class="field" style="margin-bottom:0;"><label>Sex</label>
                <select class="field-select cust-edit-sex">
                  <option ${c.sex==='Male'?'selected':''}>Male</option><option ${c.sex==='Female'?'selected':''}>Female</option><option ${c.sex==='Other'?'selected':''}>Other</option>
                </select>
              </div>
              <div class="field" style="margin-bottom:0;"><label>Patient ID</label><input type="text" class="cust-edit-patientid" value="${escapeHtml(c.patientId || '')}" /></div>
              <div class="field" style="margin-bottom:0;"><label>Phone</label><input type="text" class="cust-edit-phone" value="${escapeHtml(c.phone || '')}" /></div>
              <div class="field" style="margin-bottom:0;"><label>Email</label><input type="text" class="cust-edit-email" value="${escapeHtml(c.email || '')}" /></div>
              <div class="field" style="margin-bottom:0;"><label>Branch / Spot</label><input type="text" class="cust-edit-branch" value="${escapeHtml(c.branch || '')}" /></div>
              <div class="field" style="margin-bottom:0; grid-column:span 2;"><label>Address</label><input type="text" class="cust-edit-address" value="${escapeHtml(c.address || '')}" /></div>
            </div>
            <div class="msg" id="${rowId}-msg"></div>
            <button class="btn moss btn-sm cust-edit-save" data-id="${escapeHtml(c.id)}">Save</button>
            <button class="btn ghost btn-sm cust-edit-cancel" data-target="${rowId}">Cancel</button>
          </td>
        </tr>`;
      }).join('');

      tbody.querySelectorAll('.cust-edit-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
          const row = document.getElementById(btn.dataset.target);
          const show = row.style.display === 'none';
          row.style.display = show ? 'table-row' : 'none';
        });
      });

      tbody.querySelectorAll('.cust-edit-cancel').forEach(btn => {
        btn.addEventListener('click', () => { document.getElementById(btn.dataset.target).style.display = 'none'; });
      });

      tbody.querySelectorAll('.cust-edit-save').forEach(btn => {
        btn.addEventListener('click', async () => {
          const tr = btn.closest('tr');
          const msgEl = tr.querySelector('.msg');
          const updated = {
            title: tr.querySelector('.cust-edit-title').value,
            name: tr.querySelector('.cust-edit-name').value.trim(),
            age: tr.querySelector('.cust-edit-age').value.trim() || null,
            sex: tr.querySelector('.cust-edit-sex').value,
            patientId: tr.querySelector('.cust-edit-patientid').value.trim() || null,
            phone: tr.querySelector('.cust-edit-phone').value.trim() || null,
            email: tr.querySelector('.cust-edit-email').value.trim() || null,
            address: tr.querySelector('.cust-edit-address').value.trim() || null,
            branch: tr.querySelector('.cust-edit-branch').value.trim() || null
            // dateAdded / created_at are intentionally never included here —
            // editing a customer must never change their position in the list.
          };
          if (!updated.name){ showMsg(msgEl, 'Name is required.', 'err'); return; }

          const doSave = async () => {
            const { error } = await sb.from('customers').update(updated).eq('id', btn.dataset.id);
            if (error){ showMsg(msgEl, error.message, 'err'); return; }
            await load();
          };

          const dup = await findDuplicateCustomer(updated.phone, updated.patientId, btn.dataset.id);
          if (dup){
            showConfirm(
              `This phone/ID also belongs to ${dup.name} (ID: ${dup.patientId || dup.id}, Ph: ${dup.phone}). Save this change anyway?`,
              doSave,
              'Save Anyway'
            );
            return;
          }

          await doSave();
        });
      });

      tbody.querySelectorAll('.cust-archive').forEach(btn => {
        btn.addEventListener('click', async () => {
          const isCurrentlyActive = btn.dataset.active !== 'false';
          await sb.from('customers').update({ active: !isCurrentlyActive }).eq('id', btn.dataset.id);
          await load();
        });
      });
    }

    async function load(){
      const showArchived = document.getElementById(ids.archiveId).checked;
      let query = sb.from('customers').select('*').limit(1000);
      query = showArchived ? query : query.eq('active', true);
      const { data, error } = await query;
      allRows = (!error && data) ? data : [];
      applyFilter();
      if (typeof invRefreshCustomers === 'function') invRefreshCustomers();
    }

    let searchDebounceHandle = null;
    document.getElementById(ids.searchId).addEventListener('input', () => {
      clearTimeout(searchDebounceHandle);
      searchDebounceHandle = setTimeout(applyFilter, 300);
    });
    document.getElementById(ids.archiveId).addEventListener('change', load);

    return { load };
  }

  const employeeCustList = makeCustomerListController({ tbodyId: 'custTableBody', searchId: 'custSearchFilter', archiveId: 'custShowArchived' });
  const adminCustList = makeCustomerListController({ tbodyId: 'adminCustTableBody', searchId: 'adminCustSearchFilter', archiveId: 'adminCustShowArchived' });

  async function loadCustomers(){ await employeeCustList.load(); }
  async function loadAdminCustomers(){ await adminCustList.load(); }

  document.getElementById('statCustomersCard').addEventListener('click', () => {
    document.querySelector('#adminWrap .tab-btn[data-tab="admin-customers"]').click();
  });
  document.getElementById('statEmployeesCard').addEventListener('click', () => {
    document.querySelector('#adminWrap .tab-btn[data-tab="admin-employees"]').click();
  });
  document.getElementById('statServicesCard').addEventListener('click', () => {
    document.querySelector('#adminWrap .tab-btn[data-tab="admin-services"]').click();
  });
  document.getElementById('statAccountsCard').addEventListener('click', () => {
    document.querySelector('#adminWrap .tab-btn[data-tab="admin-accounts"]').click();
  });
