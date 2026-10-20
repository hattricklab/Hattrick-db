// ---------- Admin: services / tests management ----------
  const svcMsg = document.getElementById('svcMsg');
  const svcTableBody = document.getElementById('svcTableBody');

  const SVC_PRESET_CATEGORIES = [
    'Diabetes Related Tests','Complete Blood Count (CBC) / Haematology Profile','Liver Function Tests (LFT)',
    'Kidney Function Tests (KFT / RFT)','Thyroid Profile','Lipid Profile (Cholesterol)','Vitamins and Minerals Tests',
    'Infection and Inflammation Markers','Blood Grouping and Typing','Cardiac Markers (Heart Markers)',
    'Cancer / Tumor Markers','Hormone Profiles','Autoimmune Disease Tests / Immunology',
    'Coagulation Profiles (Blood Clotting Tests)','Serum Electrolytes and Blood Gas Analysis (ABG)','Allergy Panels',
    'Genetic and DNA Blood Tests','Blood Culture and Sensitivity','Bone Profile / Metabolic Bone Markers',
    'Anemia Profiles (Iron & Ferritin tracking)','STD / STI Screening','Therapeutic Drug Monitoring (TDM)',
    'Toxicology Screening','Prenatal / Screening Tests','Arthritis Profiles','Immunoglobulins Test',
    'Fluid Analysis','Flow Cytometry','Sepsis Markers','Neurological Biomarkers'
  ];

  let svcKnownCategories = [...SVC_PRESET_CATEGORIES];
  let svcSelectedCategories = new Set();

  function svcRenderCategoryPicker(containerId, selectedSet){
    const container = document.getElementById(containerId);
    container.innerHTML = svcKnownCategories.map(c => `
      <button type="button" class="category-pill ${selectedSet.has(c) ? 'selected' : ''}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>
    `).join('');
    container.querySelectorAll('.category-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const cat = pill.dataset.cat;
        if (selectedSet.has(cat)) selectedSet.delete(cat); else selectedSet.add(cat);
        pill.classList.toggle('selected');
      });
    });
  }

  function svcRefreshKnownCategories(extraCategories){
    const cleanExtra = (extraCategories || []).filter(c => c !== 'Uncategorized');
    svcKnownCategories = Array.from(new Set([...SVC_PRESET_CATEGORIES, ...cleanExtra])).sort();

    svcRenderCategoryPicker('svcCategoryPicker', svcSelectedCategories);

    const filterSel = document.getElementById('svcCategoryFilter');
    const currentFilter = filterSel.value;
    filterSel.innerHTML = '<option value="">All Categories</option>' + svcKnownCategories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    filterSel.value = currentFilter;
  }

  document.getElementById('svcAddCategoryBtn').addEventListener('click', () => {
    const val = document.getElementById('svcNewCategoryInput').value.trim();
    if (!val) return;
    if (!svcKnownCategories.includes(val)) svcKnownCategories.push(val);
    svcSelectedCategories.add(val);
    document.getElementById('svcNewCategoryInput').value = '';
    svcRenderCategoryPicker('svcCategoryPicker', svcSelectedCategories);
  });

  let svcAllRows = [];

  // Runs loadServices() (which rebuilds the whole table) but then scrolls
  // back to the exact row the user was just working with, instead of
  // leaving them wherever the page happened to reflow to.
  async function svcReloadKeepingRowInView(serviceId){
    await loadServices();
    const row = svcTableBody.querySelector(`tr[data-service-id="${serviceId}"]`);
    if (row) row.scrollIntoView({ behavior: 'auto', block: 'center' });
  }

  async function loadServices(){
    const showArchived = document.getElementById('svcShowArchived').checked;
    const categoryFilter = document.getElementById('svcCategoryFilter').value;

    let query = sb.from('services').select('*').order('name', { ascending: true });
    query = showArchived ? query : query.eq('active', true);
    if (categoryFilter) query = query.contains('categories', [categoryFilter]);
    const { data, error } = await query;

    // Refresh category pickers/filters with any custom categories already in use
    const { data: allForCats } = await sb.from('services').select('categories');
    const extra = (allForCats || []).flatMap(r => Array.isArray(r.categories) ? r.categories : []).filter(Boolean);
    svcRefreshKnownCategories(extra);

    svcAllRows = (!error && data) ? data : [];
    svcApplyFilter();
  }

  function svcApplyFilter(){
    const term = document.getElementById('svcSearchFilter').value.toLowerCase().trim();
    const uncategorizedOnly = document.getElementById('svcUncategorizedOnly').checked;
    let rows = term ? svcAllRows.filter(s => (s.name || '').toLowerCase().includes(term)) : svcAllRows;
    if (uncategorizedOnly){
      rows = rows.filter(s => {
        const real = (Array.isArray(s.categories) ? s.categories : []).filter(c => c !== 'Uncategorized');
        return real.length === 0;
      });
    }
    svcRenderRows(rows);
  }
  document.getElementById('svcSearchFilter').addEventListener('input', svcApplyFilter);
  document.getElementById('svcUncategorizedOnly').addEventListener('change', svcApplyFilter);

  function svcRenderRows(data){
    if (!data || data.length === 0){
      svcTableBody.innerHTML = '<tr><td colspan="5" class="empty">No services found.</td></tr>';
      return;
    }
    svcTableBody.innerHTML = data.map(s => {
      const realCategories = (Array.isArray(s.categories) ? s.categories : []).filter(c => c !== 'Uncategorized');
      const hasCategories = realCategories.length > 0;
      const categoryCell = hasCategories
        ? escapeHtml(realCategories.join(', '))
        : '<span class="svc-uncategorized-badge" title="This test has no category set">⚠ Uncategorized</span>';
      return `
      <tr data-service-id="${s.id}">
        <td>${escapeHtml(s.name)} ${s.active === false ? '<span class="cust-meta" style="color:var(--red);">(archived)</span>' : ''}</td>
        <td class="cust-meta">${categoryCell}</td>
        <td class="cust-meta">₹${escapeHtml(s.price)}</td>
        <td style="text-align:center;">
          <button class="svc-visibility-toggle" data-id="${s.id}" data-visible="${s.visible_external !== false}" title="${s.visible_external !== false ? 'Visible on linked website — click to hide' : 'Hidden from linked website — click to show'}" style="background:none; border:none; cursor:pointer; font-size:18px; color:${s.visible_external !== false ? 'var(--moss)' : 'var(--red)'}; text-decoration:${s.visible_external !== false ? 'none' : 'line-through'};">👁</button>
        </td>
        <td style="text-align:right; white-space:nowrap;">
          <button class="emp-del svc-edit" data-id="${s.id}" data-name="${escapeHtml(s.name)}" data-price="${escapeHtml(s.price)}" data-categories='${escapeHtml(JSON.stringify(Array.isArray(s.categories) ? s.categories : []))}' style="color:var(--moss); margin-right:14px;">Edit</button>
          <button class="emp-del svc-del" data-id="${s.id}" data-active="${s.active}" style="color:${s.active === false ? 'var(--moss)' : 'var(--red)'};">${s.active === false ? 'Restore' : 'Archive'}</button>
        </td>
      </tr>`;
    }).join('');

    svcTableBody.querySelectorAll('.svc-visibility-toggle').forEach(btn => {
      btn.addEventListener('click', async () => {
        const wasVisible = btn.dataset.visible === 'true';
        const nowVisible = !wasVisible;

        // Update instantly — don't wait for the network round-trip or reload the table.
        btn.dataset.visible = String(nowVisible);
        btn.style.color = nowVisible ? 'var(--moss)' : 'var(--red)';
        btn.style.textDecoration = nowVisible ? 'none' : 'line-through';
        btn.title = nowVisible ? 'Visible on linked website — click to hide' : 'Hidden from linked website — click to show';

        const { error } = await sb.from('services').update({ visible_external: nowVisible }).eq('id', btn.dataset.id);
        if (error){
          // Revert only if the save actually failed
          btn.dataset.visible = String(wasVisible);
          btn.style.color = wasVisible ? 'var(--moss)' : 'var(--red)';
          btn.style.textDecoration = wasVisible ? 'none' : 'line-through';
          btn.title = wasVisible ? 'Visible on linked website — click to hide' : 'Hidden from linked website — click to show';
          showMsg(svcMsg, 'Could not update visibility: ' + error.message, 'err');
        }
      });
    });

    svcTableBody.querySelectorAll('.svc-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const isActive = btn.dataset.active === 'true';
        await sb.from('services').update({ active: !isActive }).eq('id', btn.dataset.id);
        await svcReloadKeepingRowInView(btn.dataset.id);
        await loadAdminStats();
      });
    });

    svcTableBody.querySelectorAll('.svc-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const tr = btn.closest('tr');
        const name = btn.dataset.name;
        const price = btn.dataset.price;
        let currentCategories = [];
        try{ currentCategories = JSON.parse(btn.dataset.categories) || []; }catch(e){ currentCategories = []; }
        const editSelectedCategories = new Set(currentCategories);
        const pickerId = 'svc-edit-cat-picker-' + btn.dataset.id;

        tr.innerHTML = `
          <td><input type="text" class="svc-edit-name" value="${escapeHtml(name)}" style="width:100%; padding:8px 10px; font-size:13px; border:1px solid var(--rule); border-radius:6px; font-family:var(--font-body); background:#fffdfa; color:var(--ink);" /></td>
          <td><div class="category-picker" id="${pickerId}" style="max-height:100px;"></div></td>
          <td><input type="number" class="svc-edit-price" value="${price}" step="0.01" style="width:100px; padding:8px 10px; font-size:13px; border:1px solid var(--rule); border-radius:6px; font-family:var(--font-mono); background:#fffdfa; color:var(--ink);" /></td>
          <td class="cust-meta" style="text-align:center;">—</td>
          <td style="text-align:right; white-space:nowrap;">
            <button class="btn moss btn-sm svc-edit-save">Save</button>
            <button class="btn ghost btn-sm svc-edit-cancel">Cancel</button>
          </td>`;

        svcRenderCategoryPicker(pickerId, editSelectedCategories);

        tr.querySelector('.svc-edit-cancel').addEventListener('click', () => svcApplyFilter());

        tr.querySelector('.svc-edit-save').addEventListener('click', async () => {
          const newName = tr.querySelector('.svc-edit-name').value.trim().toUpperCase();
          const newPrice = parseFloat(tr.querySelector('.svc-edit-price').value);
          const realCategories = Array.from(editSelectedCategories).filter(c => c !== 'Uncategorized');
          const newCategories = realCategories.length > 0 ? realCategories : ['Uncategorized'];
          if (!newName || isNaN(newPrice)){
            showMsg(svcMsg, 'Enter a valid test name and price.', 'err');
            return;
          }
          const { error } = await sb.from('services')
            .update({ name: newName, price: newPrice, categories: newCategories })
            .eq('id', btn.dataset.id);
          if (error){ showMsg(svcMsg, error.message, 'err'); return; }
          await svcReloadKeepingRowInView(btn.dataset.id);
        });
      });
    });
  }
  document.getElementById('svcCategoryFilter').addEventListener('change', loadServices);
  document.getElementById('svcShowArchived').addEventListener('change', loadServices);

  document.getElementById('createSvcBtn').addEventListener('click', async () => {
    const name = document.getElementById('svcName').value.trim().toUpperCase();
    const priceRaw = document.getElementById('svcPrice').value;
    const price = parseFloat(priceRaw);
    const categories = svcSelectedCategories.size > 0 ? Array.from(svcSelectedCategories) : ['Uncategorized'];

    if (!name || isNaN(price)){
      showMsg(svcMsg, 'Enter a test name and a valid price.', 'err');
      return;
    }

    const { data: existing } = await sb.from('services').select('id').order('id', { ascending: false }).limit(1);
    const nextId = (existing && existing.length > 0) ? existing[0].id + 1 : 1;

    const { error } = await sb.from('services').insert({ id: nextId, name, price, categories });
    if (error){ showMsg(svcMsg, error.message, 'err'); return; }

    showMsg(svcMsg, 'Service added.', 'ok');
    document.getElementById('svcName').value = '';
    document.getElementById('svcPrice').value = '';
    svcSelectedCategories = new Set();
    svcRenderCategoryPicker('svcCategoryPicker', svcSelectedCategories);
    await loadServices();
    await loadAdminStats();
  });

  function sanitizeServiceRecord(r){
    let categories;
    if (Array.isArray(r.categories) && r.categories.length > 0){
      categories = r.categories.map(c => String(c).trim()).filter(Boolean);
    } else if (r.category){
      categories = [String(r.category).trim()];
    } else {
      categories = ['Uncategorized'];
    }
    return {
      id: Number(r.id),
      name: String(r.name || '').trim().toUpperCase(),
      price: Number(r.price),
      categories
    };
  }

  const svcImportBtn = document.getElementById('svcImportBtn');
  const svcImportFile = document.getElementById('svcImportFile');
  svcImportBtn.addEventListener('click', () => svcImportFile.click());

  svcImportFile.addEventListener('change', async () => {
    const file = svcImportFile.files[0];
    if (!file) return;

    svcImportBtn.disabled = true;
    showMsg(svcMsg, 'Reading file…', 'ok');

    try{
      const text = await file.text();
      const parsed = JSON.parse(text);
      const rawRecords = Array.isArray(parsed) ? parsed : [parsed];

      if (rawRecords.length === 0){
        showMsg(svcMsg, 'File has no records.', 'err');
        svcImportBtn.disabled = false;
        return;
      }

      const records = rawRecords.map(sanitizeServiceRecord);
      const { error } = await sb.from('services').upsert(records, { onConflict: 'id' });

      if (error){
        showMsg(svcMsg, 'Import failed: ' + error.message, 'err');
      } else {
        showMsg(svcMsg, `Imported ${records.length} service(s) successfully.`, 'ok');
        await loadServices();
        await loadAdminStats();
      }
    } catch(e){
      showMsg(svcMsg, 'Invalid JSON file: ' + e.message, 'err');
    }

    svcImportFile.value = '';
    svcImportBtn.disabled = false;
  });
