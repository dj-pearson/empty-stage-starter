// Google Analytics loader — externalized from index.html so the page needs no
// inline <script>, letting the CSP drop 'unsafe-inline'/'unsafe-eval' from
// script-src (US-529). Served from same-origin, so `script-src 'self'` allows
// it. Behaviour is unchanged from the former inline block: GA is deferred to
// the first user interaction or 5s, whichever comes first, to protect LCP/FCP.
(function () {
  if (typeof window === 'undefined') return;
  var gaLoaded = false;
  function loadGA() {
    if (gaLoaded) return;
    gaLoaded = true;
    var script = document.createElement('script');
    script.src = 'https://www.googletagmanager.com/gtag/js?id=G-H6792J1CQT';
    script.async = true;
    document.head.appendChild(script);
    script.onload = function () {
      window.dataLayer = window.dataLayer || [];
      function gtag() { dataLayer.push(arguments); }
      window.gtag = gtag;
      gtag('js', new Date());
      gtag('config', 'G-H6792J1CQT');
    };
  }
  // Load on first user interaction or after 5 seconds.
  window.addEventListener('click', loadGA, { once: true });
  window.addEventListener('scroll', loadGA, { once: true });
  window.addEventListener('keydown', loadGA, { once: true });
  setTimeout(loadGA, 5000);
})();
