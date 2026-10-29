const SUPABASE_URL = "https://ghpyktztztxrwombheah.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_DcV-CK4A8aq_xxYOO7LMEA_Djr3Tz90";

  // Session token issued by login_admin / login_employee.
  // It lives in sessionStorage: a page REFRESH keeps you logged in, while closing the tab
  // (or logging out / idle logout) discards it. Never in localStorage.
  // Every request carries it in the x-session-token header; the database
  // (RLS policies via app_role()) decides what this session may read/write.
  const SESSION_TOKEN_KEY = 'labSessionToken';
  let appSessionToken = null;
  try { appSessionToken = sessionStorage.getItem(SESSION_TOKEN_KEY) || null; } catch (e) { /* storage unavailable */ }
  function setAppSessionToken(token){
    appSessionToken = token || null;
    try {
      if (appSessionToken) sessionStorage.setItem(SESSION_TOKEN_KEY, appSessionToken);
      else sessionStorage.removeItem(SESSION_TOKEN_KEY);
    } catch (e) { /* storage unavailable */ }
  }

  function getStoredSessionToken(){ return appSessionToken; }

  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      fetch: (input, init = {}) => {
        const headers = new Headers(init.headers || {});
        if (appSessionToken) headers.set('x-session-token', appSessionToken);
        return fetch(input, { ...init, headers });
      }
    }
  });
