// ---------- View mode: Auto (default) / Mobile / PC ----------
  // Auto picks the layout from the screen size, so a new user always sees a layout that fits
  // (wide screens use the full PC layout, phones and small tablets use the compact one).
  const VIEW_MODE_KEY = 'labAppViewMode2';
  const VIEW_PC_MIN_WIDTH = 900;
  let currentViewMode = 'auto';

  function viewModeIsPc(){
    return currentViewMode === 'pc' || (currentViewMode === 'auto' && window.innerWidth >= VIEW_PC_MIN_WIDTH);
  }

  function applyViewMode(mode){
    currentViewMode = (mode === 'pc' || mode === 'mobile') ? mode : 'auto';
    document.body.classList.toggle('pc-view', viewModeIsPc());
    document.getElementById('viewModeAutoBtn').classList.toggle('active', currentViewMode === 'auto');
    document.getElementById('viewModeMobileBtn').classList.toggle('active', currentViewMode === 'mobile');
    document.getElementById('viewModePcBtn').classList.toggle('active', currentViewMode === 'pc');
    try{ localStorage.setItem(VIEW_MODE_KEY, currentViewMode); }catch(e){}
  }
  document.getElementById('viewModeAutoBtn').addEventListener('click', () => applyViewMode('auto'));
  document.getElementById('viewModeMobileBtn').addEventListener('click', () => applyViewMode('mobile'));
  document.getElementById('viewModePcBtn').addEventListener('click', () => applyViewMode('pc'));

  // Auto mode follows the window: rotating a tablet or resizing the browser re-fits the layout.
  window.addEventListener('resize', () => {
    if (currentViewMode === 'auto') document.body.classList.toggle('pc-view', viewModeIsPc());
  });

  let savedViewMode = 'auto';
  try{ savedViewMode = localStorage.getItem(VIEW_MODE_KEY) || 'auto'; }catch(e){}
  applyViewMode(savedViewMode);
