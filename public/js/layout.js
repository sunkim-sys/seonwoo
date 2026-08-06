(function() {
  // Theme
  const THEME_KEY = 'wt-theme';
  const saved = localStorage.getItem(THEME_KEY) || 'light';
  document.documentElement.setAttribute('data-theme', saved);

  document.addEventListener('DOMContentLoaded', () => {
    const themeBtn = document.getElementById('themeToggle');
    const sidebarBtn = document.getElementById('sidebarToggle');
    const sidebar = document.querySelector('.sidebar');

    function updateThemeIcon() {
      const t = document.documentElement.getAttribute('data-theme');
      if (themeBtn) themeBtn.textContent = t === 'dark' ? '☀' : '🌙';
    }
    updateThemeIcon();

    themeBtn?.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem(THEME_KEY, next);
      updateThemeIcon();
    });

    sidebarBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar?.classList.toggle('open');
    });

    // Close sidebar when clicking backdrop on mobile
    document.addEventListener('click', (e) => {
      if (!sidebar?.classList.contains('open')) return;
      if (sidebar.contains(e.target)) return;
      if (sidebarBtn?.contains(e.target)) return;
      sidebar.classList.remove('open');
    });

    // Collapsible nav groups
    const NAV_GROUP_KEY = 'wt-nav-groups';
    function getGroupState() {
      try { return JSON.parse(localStorage.getItem(NAV_GROUP_KEY) || '{}'); } catch { return {}; }
    }
    function setGroupState(state) {
      localStorage.setItem(NAV_GROUP_KEY, JSON.stringify(state));
    }

    document.querySelectorAll('.nav-group').forEach(group => {
      const toggle = group.querySelector('.nav-group-toggle');
      const label = toggle?.querySelector('.nav-group-label')?.textContent.trim();
      const hasActiveChild = !!group.querySelector('a.active');
      const stored = getGroupState()[label];
      group.classList.toggle('open', hasActiveChild || stored === true);

      toggle?.addEventListener('click', () => {
        const isOpen = group.classList.toggle('open');
        const state = getGroupState();
        state[label] = isOpen;
        setGroupState(state);
      });
    });
  });
})();
