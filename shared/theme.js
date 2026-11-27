/* 共用主题逻辑:平台与六站共用 1kni4r-theme-v1;首屏由内联脚本设置 data-theme。 */
(function () {
  var KEY = '1kni4r-theme-v1';
  function apply(t) {
    var d = t === 'dark';
    document.documentElement.dataset.theme = d ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', d);
    var bs = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < bs.length; i++) {
      bs[i].textContent = d ? '浅色' : '深色';
      bs[i].setAttribute('aria-pressed', String(d));
    }
  }
  function current() {
    try {
      var s = localStorage.getItem(KEY);
      if (s === 'dark' || s === 'light') return s;
    } catch (e) {}
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  }
  function init() { apply(current()); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-theme-toggle]');
    if (b) {
      var n = current() === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, n); } catch (e2) {}
      apply(n);
      return;
    }
    var m = e.target.closest('[data-nav-toggle]');
    if (m) {
      var open = document.documentElement.classList.toggle('nav-open');
      m.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
  });
  window.__kTheme = { current: current, set: function (t) { try { localStorage.setItem(KEY, t); } catch (e) {} apply(t); } };
})();
