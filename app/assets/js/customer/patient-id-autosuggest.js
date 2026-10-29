// ---------- Patient ID auto-suggest (highest existing numeric ID + 1) ----------
  async function suggestNextPatientId(){
    const { data } = await sb.from('customers').select('patientId');
    let maxNum = 0, width = 3; // default 3-digit padding, matching typical existing IDs like "030"
    (data || []).forEach(c => {
      const val = (c.patientId || '').trim();
      if (/^\d+$/.test(val)){
        const num = parseInt(val, 10);
        if (num > maxNum){ maxNum = num; width = val.length; }
      }
    });
    const nextNum = maxNum + 1;
    const nextStr = String(nextNum);
    document.getElementById('custPatientId').value = nextStr.padStart(Math.max(width, nextStr.length), '0');
  }

  // Strips everything except digits, then keeps the last 10 — this way
  // "9876543210", "98765 43210", and "+91 98765-43210" are all recognised
  // as the same number, instead of only catching exact character matches.
  function normalizePhone(raw){
    const digits = (raw || '').replace(/\D/g, '');
    return digits.slice(-10);
  }

  async function findDuplicateCustomer(phone, patientIdVal, excludeId){
    const normalized = normalizePhone(phone);
    if (normalized.length === 10){
      const { data } = await sb.from('customers').select('*').ilike('phone', `%${normalized}%`).limit(5);
      const match = (data || []).find(c => c.id !== excludeId);
      if (match) return match;
    }
    if (patientIdVal){
      const { data } = await sb.from('customers').select('*').eq('patientId', patientIdVal).limit(5);
      const match = (data || []).find(c => c.id !== excludeId);
      if (match) return match;
    }
    return null;
  }

  async function actuallyCreateCustomer(){
    const name = document.getElementById('custName').value.trim();
    const phone = document.getElementById('custPhone').value.trim();

    const newCustomer = {
      id: (crypto.randomUUID ? crypto.randomUUID() : 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2)),
      patientId: document.getElementById('custPatientId').value.trim() || null,
      title: document.getElementById('custTitle').value,
      name: name,
      age: document.getElementById('custAge').value.trim() || null,
      sex: document.getElementById('custSex').value,
      phone: phone || null,
      email: document.getElementById('custEmail').value.trim() || null,
      address: document.getElementById('custAddress').value.trim() || null,
      branch: document.getElementById('custBranch').value.trim() || null,
      dateAdded: new Date().toISOString()
    };

    const { error } = await sb.from('customers').insert(newCustomer);
    if (error){
      showMsg(custMsg, error.message, 'err');
      return;
    }

    // Instantly searchable in the invoice generator; the lists below refresh in the background.
    invAddCustomerLocally(newCustomer);
    showMsg(custMsg, 'Customer added.', 'ok');
    ['custName','custAge','custPhone','custEmail','custAddress','custBranch'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('custTitle').value = 'Mr.';
    document.getElementById('custSex').value = 'Male';
    // These used to run one after another (each waiting for the previous). Now they run together
    // and nothing blocks the person who just added the customer.
    Promise.allSettled([loadCustomers(), suggestNextPatientId(), loadAdminStats()]);
  }

  document.getElementById('createCustBtn').addEventListener('click', async () => {
    const name = document.getElementById('custName').value.trim();
    const phone = document.getElementById('custPhone').value.trim();

    if (!name){
      showMsg(custMsg, 'Name is required.', 'err');
      return;
    }

    const patientIdVal = document.getElementById('custPatientId').value.trim();
    const dup = await findDuplicateCustomer(phone, patientIdVal);

    if (dup){
      showConfirm(
        `This phone/ID matches an existing patient — ${dup.name} (ID: ${dup.patientId || dup.id}, Ph: ${dup.phone}). Add this as a new customer anyway?`,
        actuallyCreateCustomer,
        'Add Anyway'
      );
      return;
    }

    await actuallyCreateCustomer();
  });

  const CUSTOMER_FIELDS = ['id','patientId','title','name','age','sex','phone','email','address','branch','dateAdded'];
  function sanitizeCustomerRecord(r){
    const out = {};
    CUSTOMER_FIELDS.forEach(f => {
      const v = r[f];
      out[f] = (v === undefined || v === '') ? null : v;
    });
    if (out.id !== null) out.id = String(out.id);
    return out;
  }

  const importBtn = document.getElementById('importBtn');
  const importFile = document.getElementById('importFile');
  importBtn.addEventListener('click', () => importFile.click());

  importFile.addEventListener('change', async () => {
    const file = importFile.files[0];
    if (!file) return;

    importBtn.disabled = true;
    showMsg(custMsg, 'Reading file…', 'ok');

    try{
      const text = await file.text();
      const parsed = JSON.parse(text);
      const rawRecords = Array.isArray(parsed) ? parsed : [parsed];

      if (rawRecords.length === 0){
        showMsg(custMsg, 'File has no records.', 'err');
        importBtn.disabled = false;
        return;
      }

      const records = rawRecords.map(sanitizeCustomerRecord);
      const skippedHistoryCount = rawRecords.filter(r => r.history && r.history.length > 0).length;

      const { error } = await sb.from('customers').upsert(records, { onConflict: 'id' });

      if (error){
        showMsg(custMsg, 'Import failed: ' + error.message, 'err');
      } else {
        let msg = `Imported ${records.length} customer(s) successfully.`;
        if (skippedHistoryCount > 0){
          msg += ` (${skippedHistoryCount} had invoice history — that will be imported once Invoice Generator is built.)`;
        }
        showMsg(custMsg, msg, 'ok');
        await loadCustomers();
        await suggestNextPatientId();
        await loadAdminStats();
      }
    } catch(e){
      showMsg(custMsg, 'Invalid JSON file: ' + e.message, 'err');
    }

    importFile.value = '';
    importBtn.disabled = false;
  });

  // ============================================================
  // INVOICE GENERATOR (reads customers/services from Supabase,
  // writes to invoice_history + ledger tables)
  // ============================================================
  let invAllCustomers = [];
  let invAllTests = [];
  let invSelectedTests = [];
  let invAllPackages = [];
  let invSelectedPackages = [];
  let invCurrentSelectedCustomerId = null;

  const INV_DEFAULT_CUSTOMERS = [
    { id: '1', patientId: 'P1001', title: 'Mr.', name: 'John Doe', age: '35', sex: 'Male', phone: '9876543210', email: null, address: '123 Main St', dateAdded: new Date().toISOString() },
    { id: '2', patientId: 'P1002', title: 'Ms.', name: 'Jane Smith', age: '28', sex: 'Female', phone: '9000123456', email: null, address: '456 Oak Ave', dateAdded: new Date().toISOString() }
  ];
  const INV_DEFAULT_TESTS = [
    { id: 101, name: 'COMPLETE BLOOD COUNT (CBC)', price: 450.00 },
    { id: 102, name: 'LIVER FUNCTION TEST (LFT)', price: 900.00 }
  ];

  // Re-reads ONLY the customer list used by the invoice generator, so a newly added /
  // edited / archived customer shows up without logging out and in again.
  async function invRefreshCustomers(){
    const { data, error } = await sb.from('customers').select('*').order('name', { ascending: true });
    if (error || !data) return;                       // keep the current list if the read fails
    invAllCustomers = data.length > 0 ? data : INV_DEFAULT_CUSTOMERS;
  }

  // Puts a just-created patient into the invoice generator's list immediately (no network wait).
  function invAddCustomerLocally(customer){
    const row = Object.assign({ active: true }, customer);
    invAllCustomers = [row, ...(Array.isArray(invAllCustomers) ? invAllCustomers.filter(c => c.id !== row.id) : [])];
  }

  async function invLoadInitialData(){
    // Logo is embedded as base64, so this is instant — no network wait.
    const logoImg = document.getElementById('invLogoDisplay');
    if (logoImg) logoImg.src = LOGO_DATA_URI;

    const { data: testsFromDb, error: testsErr } = await sb.from('services').select('id, name, price, visible_external').order('name', { ascending: true });
    const { data: customersFromDb, error: custErr } = await sb.from('customers').select('*').order('name', { ascending: true });
    const { data: packagesFromDb } = await sb.from('packages').select('*').eq('active', true).order('name', { ascending: true });

    invAllTests = (!testsErr && testsFromDb && testsFromDb.length > 0) ? testsFromDb : INV_DEFAULT_TESTS;
    invAllCustomers = (!custErr && customersFromDb && customersFromDb.length > 0) ? customersFromDb : INV_DEFAULT_CUSTOMERS;
    invAllPackages = packagesFromDb || [];

    document.getElementById('invInvoiceDate').value = istDateStr(nowIST());
    syncInvInvoiceDate();
    invUpdateCustomerDisplay();
    invPopulateServiceSelector();
    invUpdatePkgSuggestions();
    invPopulatePackageSelector();
    invHandlePaymentTypeChange();
    invCalculateTotal();
  }
