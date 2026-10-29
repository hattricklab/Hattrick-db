  // ---------- Leave guard ----------
  // 1) While someone is logged in, closing the tab / window / refreshing asks the browser to show its
  //    own "Leave site?" warning. (Browsers do not allow a custom text or design for this one.)
  // 2) If they leave anyway (tab closed without check-out / logout), the NEXT login starts with a
  //    friendly reminder that fades away on its own, and only then the normal check-in / logout popup.
  const LEAVE_MAP_KEY = 'labOpenLogins';        // localStorage: { username: lastHeartbeatMs } while logged in
  const LEAVE_TAB_KEY = 'labLoginUser';         // sessionStorage: survives a reload, NOT a closed tab
  const LEAVE_RECENT_MS = 90 * 1000;            // a heartbeat newer than this = another tab is still open
  const LEAVE_BEAT_MS = 30 * 1000;

  let leaveGuardActive = false;
  let leaveBeatHandle = null;

  function leaveReadMap(){
    try { return JSON.parse(localStorage.getItem(LEAVE_MAP_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function leaveWriteMap(map){
    try { localStorage.setItem(LEAVE_MAP_KEY, JSON.stringify(map)); } catch (e) { /* storage unavailable */ }
  }
  function leaveKey(username){ return String(username || '').trim().toLowerCase(); }
  function leaveFirstName(full){ return (String(full || '').trim().split(/\s+/)[0]) || 'friend'; }

  // A refresh keeps sessionStorage, so it is not a "forgot to log out" case: forget the marker.
  (function leaveClearAfterReload(){
    try {
      const user = sessionStorage.getItem(LEAVE_TAB_KEY);
      if (user){
        const map = leaveReadMap();
        delete map[user];
        leaveWriteMap(map);
        sessionStorage.removeItem(LEAVE_TAB_KEY);
      }
    } catch (e) { /* ignore */ }
  })();

  // Call right after a successful login. Returns true when the previous session of this user
  // ended by closing the tab (no logout) and no other tab of theirs is still alive.
  function leaveGuardOn(username){
    const key = leaveKey(username);
    const map = leaveReadMap();
    const previous = map[key];
    const wasUnclean = typeof previous === 'number' && (Date.now() - previous) > LEAVE_RECENT_MS;
    map[key] = Date.now();
    leaveWriteMap(map);
    try { sessionStorage.setItem(LEAVE_TAB_KEY, key); } catch (e) { /* ignore */ }
    leaveGuardActive = true;
    if (leaveBeatHandle) clearInterval(leaveBeatHandle);
    leaveBeatHandle = setInterval(() => {
      const m = leaveReadMap();
      m[key] = Date.now();
      leaveWriteMap(m);
    }, LEAVE_BEAT_MS);
    return wasUnclean;
  }

  // Call at every deliberate exit (logout button, idle logout, check-out auto logout) BEFORE reloading.
  function leaveGuardOff(){
    leaveGuardActive = false;
    if (leaveBeatHandle){ clearInterval(leaveBeatHandle); leaveBeatHandle = null; }
    try {
      const key = sessionStorage.getItem(LEAVE_TAB_KEY);
      if (key){
        const map = leaveReadMap();
        delete map[key];
        leaveWriteMap(map);
        sessionStorage.removeItem(LEAVE_TAB_KEY);
      }
    } catch (e) { /* ignore */ }
  }

  window.addEventListener('beforeunload', event => {
    if (!leaveGuardActive) return undefined;
    event.preventDefault();
    event.returnValue = '';           // makes the browser show its own confirmation
    return '';
  });

  // ----- "You forgot last time" reminder -----
  const LEAVE_MESSAGES = [
    { emoji: '🙈', title: 'Hey {name}!', text: 'Last time you left without saying goodbye! Please, pretty please, {what} before you leave today. 🙏😄' },
    { emoji: '😅', title: 'Oopsie, {name}!', text: 'The app waited all alone last time... Today, kindly {what} before leaving. Thank you! 💛' },
    { emoji: '🤫', title: 'Psst, {name}...', text: 'You forgot to {what} last time. We forgive you! 🥰 Please do not forget today. 🙏✨' },
    { emoji: '🥺', title: '{name}, we missed your goodbye!', text: 'One tiny reminder: please {what} when you finish today. You are the best! 🌟👋' }
  ];

  function leaveReminderSeconds(text){
    const words = String(text).trim().split(/\s+/).length;
    return Math.min(10, Math.max(6, Math.ceil(words / 3.2) + 2));   // enough time to read, never long
  }

  // Shows the overlay immediately; resolves when it has faded away by itself.
  function leaveReminder(wasUnclean, fullName, isBoss){
    if (!wasUnclean) return Promise.resolve(false);
    const msg = LEAVE_MESSAGES[Math.floor(Math.random() * LEAVE_MESSAGES.length)];
    const fill = s => s.replace('{name}', leaveFirstName(fullName)).replace('{what}', isBoss ? 'log out' : 'check out and log out');
    const title = fill(msg.title), text = fill(msg.text);
    const seconds = leaveReminderSeconds(text);

    const box = document.getElementById('forgetReminder');
    document.getElementById('forgetEmoji').textContent = msg.emoji;
    document.getElementById('forgetTitle').textContent = title;
    document.getElementById('forgetText').textContent = text;
    const bar = document.getElementById('forgetBar');
    bar.style.animation = 'none';
    void bar.offsetWidth;                                   // restart the countdown animation
    bar.style.animation = `forgetBar ${seconds}s linear forwards`;
    box.classList.remove('leaving');
    box.style.display = 'flex';

    return new Promise(resolve => {
      setTimeout(() => {
        box.classList.add('leaving');
        setTimeout(() => { box.style.display = 'none'; box.classList.remove('leaving'); resolve(true); }, 450);
      }, seconds * 1000);
    });
  }
