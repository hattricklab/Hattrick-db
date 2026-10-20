const SUPABASE_URL = "https://ghpyktztztxrwombheah.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_DcV-CK4A8aq_xxYOO7LMEA_Djr3Tz90";

  // Session token issued by login_admin / login_employee. Kept in memory only
  // (never in localStorage), so closing/reloading the tab logs the user out.
  // Every request carries it in the x-session-token header; the database
  // (RLS policies via app_role()) decides what this session may read/write.
  let appSessionToken = null;
  function setAppSessionToken(token){ appSessionToken = token || null; }

  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      fetch: (input, init = {}) => {
        const headers = new Headers(init.headers || {});
        if (appSessionToken) headers.set('x-session-token', appSessionToken);
        return fetch(input, { ...init, headers });
      }
    }
  });
