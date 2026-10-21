// ---------- Service selection ----------
  function invRenderServiceCheckboxes(testsToDisplay){
    const container = document.getElementById('invServiceSelectorContainer');
    container.innerHTML = '';
    if (testsToDisplay.length === 0){
      container.innerHTML = '<p class="empty">No matching services found.</p>';
      return;
    }
    // test id -> names of the (active) packages that already include it
    const packagesByTest = new Map();
    (invAllPackages || []).forEach(pkg => {
      (pkg.test_ids || []).forEach(rawId => {
        const id = Number(rawId);
        if (!packagesByTest.has(id)) packagesByTest.set(id, []);
        packagesByTest.get(id).push(pkg.name);
      });
    });

    testsToDisplay.forEach(test => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'inv-service-item';
      const inPackages = packagesByTest.get(Number(test.id)) || [];
      if (inPackages.length) itemDiv.style.borderLeft = '3px solid #5b4bb7';
      const isChecked = invSelectedTests.some(t => t.id === test.id);

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `inv-test-${test.id}`;
      checkbox.value = String(test.id);
      checkbox.checked = isChecked;
      checkbox.onchange = invHandleTestSelection;

      const label = document.createElement('label');
      label.htmlFor = `inv-test-${test.id}`;
      label.textContent = test.name;
      label.style.flexGrow = '1';
      label.style.marginBottom = '0';
      label.style.fontWeight = '400';
      label.style.cursor = 'pointer';

      // Purple chip: this test is already included in one or more packages.
      let pkgChip = null;
      if (inPackages.length){
        pkgChip = document.createElement('span');
        pkgChip.textContent = inPackages.length === 1 ? 'In package' : `In ${inPackages.length} packages`;
        pkgChip.title = 'Already included in: ' + inPackages.join(', ');
        pkgChip.style.cssText = 'background:#efecfb; color:#5b4bb7; border:1px solid #cfc8f2; border-radius:999px; '
          + 'font-size:10px; font-weight:600; letter-spacing:.03em; padding:2px 8px; margin-right:10px; white-space:nowrap; cursor:help;';
      }

      const eyeSpan = document.createElement('span');
      const isVisible = test.visible_external !== false;
      eyeSpan.textContent = '👁';
      eyeSpan.title = isVisible ? 'Visible on linked website' : 'Hidden from linked website';
      eyeSpan.style.color = isVisible ? 'var(--moss)' : 'var(--red)';
      eyeSpan.style.textDecoration = isVisible ? 'none' : 'line-through';
      eyeSpan.style.fontSize = '13px';
      eyeSpan.style.marginRight = '8px';

      const priceSpan = document.createElement('span');
      priceSpan.className = 'inv-service-price';
      priceSpan.textContent = `₹${parseFloat(test.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

      itemDiv.appendChild(checkbox);
      itemDiv.appendChild(label);
      if (pkgChip) itemDiv.appendChild(pkgChip);
      itemDiv.appendChild(eyeSpan);
      itemDiv.appendChild(priceSpan);
      container.appendChild(itemDiv);
    });
  }

  function invPopulateServiceSelector(){ invFilterServices(''); }

  function invFilterServices(searchTerm){
    const lower = searchTerm.toLowerCase().trim();
    if (invAllTests.length === 0){
      document.getElementById('invServiceSelectorContainer').innerHTML = '<p class="empty">No services/tests found.</p>';
      return;
    }
    if (lower === ''){ invRenderServiceCheckboxes(invAllTests); return; }
    invRenderServiceCheckboxes(invAllTests.filter(t => t.name.toLowerCase().includes(lower)));
  }

  function invHandleTestSelection(event){
    const testId = parseInt(event.target.value, 10);
    const test = invAllTests.find(t => t.id === testId);
    if (event.target.checked){
      if (test && !invSelectedTests.some(t => t.id === test.id)){
        test.price = parseFloat(test.price);
        invSelectedTests.push(test);
      }
    } else {
      invSelectedTests = invSelectedTests.filter(t => t.id !== testId);
    }
    invUpdateSelectionBadges();
    invUpdatePkgSuggestions();
    invCalculateTotal();
  }

  // Shows which packages the currently-selected individual tests overlap
  // with, and the money the customer would save by switching to that
  // package instead — e.g. "add 2 more tests, save ₹500".
  function invUpdatePkgSuggestions(){
    const wrap = document.getElementById('invPkgSuggestWrap');
    const list = document.getElementById('invPkgSuggestList');
    if (!wrap || !list) return;

    if (!invSelectedTests.length || !invAllPackages || !invAllPackages.length){
      wrap.style.display = 'none';
      return;
    }

    const selectedIds = new Set(invSelectedTests.map(t => t.id));
    const priceById = {};
    invAllTests.forEach(t => { priceById[t.id] = parseFloat(t.price) || 0; });
    const currentGrandTotal = (window.invInvoiceData && typeof window.invInvoiceData.invoiceTotal === 'number')
      ? window.invInvoiceData.invoiceTotal : 0;

    const matches = invAllPackages
      .map(pkg => {
        const testIds = pkg.test_ids || [];
        const matchedCount = testIds.filter(id => selectedIds.has(id)).length;
        const individualPrice = testIds.reduce((sum, id) => sum + (priceById[id] || 0), 0);
        const packagePrice = parseFloat(pkg.rate) || 0;
        return {
          pkg, matchedCount, total: testIds.length,
          remaining: testIds.length - matchedCount,
          individualPrice, packagePrice,
          savings: individualPrice - packagePrice,
          // Upsell (package costs more than what's already on the invoice) = good, show green.
          // Undercut (package would be cheaper than what customer already agreed to pay) = bad, show red.
          isUpsell: packagePrice > currentGrandTotal
        };
      })
      .filter(m => m.matchedCount > 0 && m.total > 0 && m.savings > 0)
      .sort((a, b) => (b.matchedCount / b.total) - (a.matchedCount / a.total) || b.savings - a.savings);

    if (!matches.length){
      wrap.style.display = 'none';
      return;
    }

    wrap.style.display = 'block';
    list.innerHTML = matches.map((m, idx) => {
      const pct = Math.round((m.matchedCount / m.total) * 100);
      const full = m.matchedCount === m.total;
      const rupee = (n) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
      const addLine = full
        ? `All ${m.total} tests already selected.`
        : `Add ${m.remaining} more test${m.remaining > 1 ? 's' : ''} to complete this package.`;

      const testRows = (m.pkg.test_ids || []).map(id => {
        const test = invAllTests.find(t => t.id === id);
        const isMatched = selectedIds.has(id);
        const name = test ? test.name : `#${id}`;
        const price = priceById[id] !== undefined ? rupee(priceById[id]) : '—';
        return `
          <div class="inv-pkg-test-row ${isMatched ? 'matched' : 'unmatched'}">
            <span class="inv-pkg-test-icon">${isMatched ? '✓' : '✕'}</span>
            <span class="inv-pkg-test-name">${escapeHtml(name)}</span>
            <span class="inv-pkg-test-price">${price}</span>
          </div>`;
      }).join('');

      return `
        <div class="inv-pkg-suggest-item${full ? ' full-match' : ''}">
          <div class="inv-pkg-suggest-row inv-pkg-suggest-toggle" data-target="inv-pkg-detail-${idx}">
            <span class="inv-pkg-suggest-name">${escapeHtml(m.pkg.name)} <span class="inv-pkg-expand-arrow">▸</span></span>
            <span class="inv-pkg-suggest-count">${m.matchedCount}/${m.total} matched</span>
          </div>
          <div class="inv-pkg-suggest-bar"><div class="inv-pkg-suggest-bar-fill" style="width:${pct}%;"></div></div>
          <div class="inv-pkg-suggest-note">${addLine}</div>
          <div class="inv-pkg-suggest-prices">
            <span>Individually: <s>${rupee(m.individualPrice)}</s></span>
            <span>As package: <strong>${rupee(m.packagePrice)}</strong></span>
            <span class="inv-pkg-suggest-savings ${m.isUpsell ? 'is-upsell' : 'is-undercut'}" title="${m.isUpsell ? 'Package price is more than the current Grand Total — good upsell.' : 'Package price is less than the current Grand Total — do not offer this, it undercuts the sale.'}">Save ${rupee(m.savings)}</span>
          </div>
          <div class="inv-pkg-test-detail collapsed" id="inv-pkg-detail-${idx}">${testRows}</div>
        </div>`;
    }).join('');

    list.querySelectorAll('.inv-pkg-suggest-toggle').forEach(row => {
      row.addEventListener('click', () => {
        const detail = document.getElementById(row.dataset.target);
        const arrow = row.querySelector('.inv-pkg-expand-arrow');
        const nowCollapsed = detail.classList.toggle('collapsed');
        arrow.textContent = nowCollapsed ? '▸' : '▾';
      });
    });
  }

  document.getElementById('invServiceSearch').addEventListener('input', (e) => invFilterServices(e.target.value));
