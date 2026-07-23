// Google Analytics loader — externalized from index.html so the page needs no
// inline <script>, letting the CSP drop 'unsafe-inline'/'unsafe-eval' from
// script-src (US-529). Served from same-origin, so `script-src 'self'` allows it.
//
// Consent-gated (compliance audit 2026-07): GA is NEVER loaded until the user
// has granted analytics consent. Google Consent Mode v2 defaults are set to
// `denied` up front, and the analytics tag only loads once consent is granted —
// either from a prior visit (localStorage) or when the consent banner calls
// window.__eatpalLoadGA() at opt-in time.
(function () {
  if (typeof window === 'undefined') return;

  var GA_ID = 'G-H6792J1CQT';
  var CONSENT_KEY = 'eatpal_cookie_consent';

  // Google Consent Mode v2 — default everything to denied until the user opts in.
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = window.gtag || gtag;
  window.gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    wait_for_update: 500,
  });

  function analyticsConsented() {
    try {
      if (window.__eatpalConsent && typeof window.__eatpalConsent.analytics === 'boolean') {
        return window.__eatpalConsent.analytics === true;
      }
      var raw = window.localStorage.getItem(CONSENT_KEY);
      if (!raw) return false;
      return JSON.parse(raw).analytics === true;
    } catch (e) {
      return false;
    }
  }

  var gaLoaded = false;
  function loadGA() {
    if (gaLoaded) return;
    if (!analyticsConsented()) return;
    gaLoaded = true;
    window.gtag('consent', 'update', { analytics_storage: 'granted' });
    var script = document.createElement('script');
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    script.async = true;
    document.head.appendChild(script);
    script.onload = function () {
      window.gtag('js', new Date());
      // anonymize_ip keeps analytics privacy-preserving even once consented.
      window.gtag('config', GA_ID, { anonymize_ip: true });
    };
  }

  // Exposed so the consent banner can load GA immediately when the user opts in.
  window.__eatpalLoadGA = loadGA;

  // Only auto-load (deferred to first interaction or 5s, to protect LCP/FCP) if
  // consent was already granted on a previous visit. With no consent, GA stays
  // dormant until the user explicitly opts in via the banner.
  if (analyticsConsented()) {
    window.addEventListener('click', loadGA, { once: true });
    window.addEventListener('scroll', loadGA, { once: true });
    window.addEventListener('keydown', loadGA, { once: true });
    setTimeout(loadGA, 5000);
  }
})();
