// ---------- Tabs (scoped per dashboard, so admin and employee tabs don't clash) ----------
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const container = btn.closest('.dash-wrap');
      container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      container.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');

      const toolsShared = document.getElementById('toolsSharedRoot');
      if (btn.dataset.tab === 'tools' || btn.dataset.tab === 'admin-tools'){
        const tabsNav = btn.closest('.tabs');
        tabsNav.insertAdjacentElement('afterend', toolsShared);
        toolsShared.classList.add('active');
        const activePill = toolsShared.querySelector('.tools-subtab-btn.active');
        if (activePill) toolsLoadToolFor(activePill.dataset.tool);
      } else {
        toolsShared.classList.remove('active');
        container.querySelector('#tab-' + btn.dataset.tab).classList.add('active');
      }

      if (btn.dataset.tab === 'accounts'){ acctRefreshEmployeeAccounts(); }
      if (btn.dataset.tab === 'admin-accounts'){ acctRefreshAdminOverview(); }
      if (btn.dataset.tab === 'admin-customers'){ loadAdminCustomers(); }
      if (btn.dataset.tab === 'admin-inventory'){ loadAdminInventory(); }
      if (btn.dataset.tab === 'admin-services'){ loadServices(); }
      if (btn.dataset.tab === 'admin-dashboard'){ loadDashboardAccountsCard(); loadAdminStats(); }
      if (btn.dataset.tab === 'inventory'){ loadInventoryList(); }
      if (btn.dataset.tab === 'timelog'){ loadHistory(); }
    });
  });
