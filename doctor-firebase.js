// doctor-firebase.js: Firebase Auth Domain Doctor core logic.
//
// Pure, deterministic, 100% client-side: given a Firebase Auth error code
// (auth/unauthorized-domain, auth/redirect-cancelled-by-user,
// auth/operation-not-supported-in-this-environment, auth/popup-blocked,
// auth/missing-initial-state, auth/web-storage-unsupported,
// auth/invalid-continue-uri, ...), your firebaseConfig's authDomain, the
// origin the app is actually served from, Authentication -> Settings ->
// Authorized domains, whether you call signInWithPopup or
// signInWithRedirect, where the app is hosted, and which OAuth provider
// you're using, this works out the redirect/handler URL Firebase and your
// provider console both need, flags the specific mismatch, and gives a
// copy-paste fix.
//
// Nothing in this file makes a network request. It only reads the object
// you pass to diagnose().
//
// This is the fifth sibling in the "Doctor" family (after the Google OAuth,
// Expo, web, and Flutter Supabase Redirect Doctors): same diagnose()-shape
// contract, same zero-dependency, single-file design, different domain:
// Firebase Authentication's authDomain / authorized-domains / redirect
// mechanics instead of a plain OAuth redirect_uri allow-list.
//
// Rules implemented here are sourced from:
//  - https://firebase.google.com/docs/auth/web/redirect-best-practices
//      (authDomain: "specifies the domain ... Firebase Authentication uses
//      to run operations that require an authentication domain", defaults
//      to the firebaseapp.com domain; the redirect flow depends on "a
//      cross-origin iframe that connects to your app's Firebase Hosting
//      domain"; browsers that block third-party/cross-origin storage access
//      -- Chrome M115+, Firefox 109+, Safari 16.1+ -- break that iframe,
//      which is exactly what surfaces as auth/missing-initial-state or a
//      silent failure to return the signed-in user; the auth handler URL is
//      "https://<the-domain-that-serves-your-app>/__/auth/handler"; the five
//      documented ways out: (1) set authDomain to your own domain and add
//      *that* domain to your OAuth provider's authorized redirect URIs, with
//      a reverse proxy forwarding /__/auth/* to <project>.firebaseapp.com
//      transparently (not a 302); (2) use signInWithPopup() instead, which
//      does not depend on that cross-origin iframe, at the cost of
//      popup-blocker / mobile-browser limitations; (3) a reverse proxy in
//      front of your own domain forwarding /__/auth/ to firebaseapp.com;
//      (4) self-host the helper files under your own domain; (5) call each
//      provider's own SDK directly and exchange the credential via
//      signInWithCredential())
//  - https://firebase.google.com/docs/auth/web/google-signin
//      (signInWithPopup opens a popup window; signInWithRedirect navigates
//      away and you retrieve the outcome later with getRedirectResult();
//      "the redirect method is preferred on mobile devices"; Cordova/webview
//      environments are called out separately from plain popup/redirect)
//  - https://firebase.google.com/docs/auth/admin/errors
//      (auth/invalid-continue-uri: "The continue URL must be a valid URL
//      string" -- the same error code and continue-URL concept the client
//      SDK uses; a continue URL's domain must also be on the Authorized
//      domains allow-list used for the rest of the auth flow)
//  - https://firebase.google.com/docs/hosting/custom-domain
//      (a custom domain "instead of a Firebase-generated domain" is
//      connected to exactly one Hosting site via DNS records, with Firebase
//      auto-provisioning the SSL certificate: the mechanism behind Option 4/5
//      of the redirect-best-practices guide, serving your app -- and,
//      when set up as authDomain, the auth handler pages -- from one domain
//      you control instead of *.firebaseapp.com)
//
// The remaining error codes this file reasons about (auth/unauthorized-domain,
// auth/popup-blocked, auth/operation-not-supported-in-this-environment,
// auth/web-storage-unsupported, auth/redirect-cancelled-by-user) are the
// Firebase JS SDK's own documented auth error codes; their triggers below
// (an origin missing from Authorized domains, a popup opened outside a
// user-gesture click handler, an embedded WebView/Capacitor context, a
// browser blocking storage access such as Safari Private Browsing, or the
// user simply cancelling the provider's consent screen) are standard,
// widely-documented Firebase troubleshooting knowledge, cross-checked
// against the redirect-best-practices root cause above rather than invented.
//
// Works as an ES module (import { diagnose, expectedValues } from
// './doctor-firebase.js') and, when loaded with <script type="module">, also
// publishes window.FirebaseAuthDoctor = { diagnose, expectedValues } for
// console/debug use.

// ───────────────────────── small string / host helpers ─────────────────────────

function safeStr(v) {
  return typeof v === 'string' ? v : '';
}

function isLoopbackHost(host) {
  const h = safeStr(host).toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]' || /^127(\.\d{1,3}){3}$/.test(h);
}

function isRawIp(host) {
  const h = safeStr(host);
  if (!h) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true;
  if (h.includes(':')) return true; // crude IPv6 detection
  return false;
}

// Accepts a bare hostname ("myapp.com"), a full origin
// ("https://myapp.com"), or a pasted URL with a path: always returns just
// the lowercase hostname, or "" if nothing usable was given. A missing
// scheme is assumed to be https:// so a bare domain still parses.
function parseHost(raw) {
  const s = safeStr(raw).trim();
  if (!s) return { host: '', valid: false, raw: s };
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : 'https://' + s;
  try {
    const u = new URL(candidate);
    return { host: u.hostname.toLowerCase(), valid: true, raw: s };
  } catch (e) {
    return { host: '', valid: false, raw: s };
  }
}

function normalizeDomainEntry(raw) {
  return parseHost(raw).host;
}

// ───────────────────────── static reference data ─────────────────────────

const ERROR_CODES = [
  'auth/unauthorized-domain',
  'auth/redirect-cancelled-by-user',
  'auth/operation-not-supported-in-this-environment',
  'auth/popup-blocked',
  'auth/missing-initial-state',
  'auth/web-storage-unsupported',
  'auth/invalid-continue-uri',
];

const METHOD_OPTIONS = ['popup', 'redirect'];
const HOSTING_OPTIONS = ['firebase', 'vercel', 'netlify', 'custom', 'localhost', 'capacitor'];
const BROWSER_OPTIONS = ['chrome', 'safari', 'firefox'];
const PROVIDER_NAMES = ['google', 'apple', 'facebook', 'github', 'microsoft'];

const PROVIDER_LABEL = {
  google: 'Google Cloud Console → APIs & Services → Credentials',
  apple: 'Apple Developer → Certificates, Identifiers & Profiles → Services IDs',
  facebook: 'Meta for Developers → Facebook Login → Settings',
  github: 'GitHub → Settings → Developer settings → OAuth Apps',
  microsoft: 'Microsoft Entra ID → App registrations → Authentication',
};

const FIREBASE_JSON_PROXY_SNIPPET = [
  '{',
  '  "hosting": {',
  '    "rewrites": [',
  '      {',
  '        "source": "/__/auth/**",',
  '        "function": "authProxy"',
  '      }',
  '    ]',
  '  }',
  '}',
].join('\n');

const AUTH_PROXY_FUNCTION_SNIPPET = [
  '// functions/authProxy: forwards every /__/auth/** request on your own',
  '// domain to <project-id>.firebaseapp.com, transparently (never a 302).',
  'exports.authProxy = onRequest((req, res) => {',
  '  const target = `https://<project-id>.firebaseapp.com${req.originalUrl}`;',
  '  return proxyRequest(target, req, res); // e.g. via http-proxy-middleware',
  '});',
].join('\n');

// ───────────────────────── expected-value builder ─────────────────────────

function computeExpected(cfg) {
  const app = cfg.app && typeof cfg.app === 'object' ? cfg.app : {};
  const provider = cfg.provider && typeof cfg.provider === 'object' ? cfg.provider : {};

  const authDomain = normalizeDomainEntry(app.authDomain);
  const page = parseHost(app.pageOrigin);
  const pageHost = page.valid ? page.host : '';

  const handlerUri = authDomain ? `https://${authDomain}/__/auth/handler` : null;

  const domainsNeeded = [];
  if (pageHost && !isLoopbackHost(pageHost)) domainsNeeded.push(pageHost);
  if (authDomain && authDomain !== pageHost && !isLoopbackHost(authDomain)) domainsNeeded.push(authDomain);
  const authorizedDomainsNeeded = Array.from(new Set(domainsNeeded));

  const providerName = PROVIDER_NAMES.includes(provider.name) ? provider.name : '';
  const providerLabel = providerName ? PROVIDER_LABEL[providerName] : null;

  const missingField = !authDomain ? 'app.authDomain' : (!pageHost ? 'app.pageOrigin' : null);

  const crossOrigin = !!(authDomain && pageHost && authDomain !== pageHost);

  const note = authDomain
    ? `Firebase's own sign-in helper pages live at https://${authDomain}/__/auth/handler. Every OAuth provider (Google, Apple, Facebook, GitHub, Microsoft) needs that exact URL in its own redirect/callback URI field, and "${authDomain}" itself has to be on Authentication → Settings → Authorized domains.`
    : 'Set app.authDomain to the authDomain value from your firebaseConfig so the auth handler URL can be computed and checked against your provider console and Authorized domains.';

  return {
    authDomain: authDomain || null,
    handlerUri,
    authorizedDomainsNeeded,
    pageHost: pageHost || null,
    crossOrigin,
    providerName: providerName || null,
    providerLabel,
    missingField,
    note,
  };
}

// ───────────────────────── diagnose() ─────────────────────────

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

function sortProblems(problems) {
  return problems
    .map((p, idx) => ({ p, idx }))
    .sort((a, b) => (SEVERITY_ORDER[a.p.severity] - SEVERITY_ORDER[b.p.severity]) || (a.idx - b.idx))
    .map((x) => x.p);
}

function pushProblem(problems, { severity, code, message, path, value, fix }) {
  problems.push({ severity, code, message, path: path || null, value: value == null ? null : value, fix: fix || null, where: path || null });
}

/**
 * @param {object} config
 * @param {{code?:string}} [config.error]
 * @param {{pageOrigin?:string, authDomain?:string, authorizedDomains?:string[], method?:'popup'|'redirect'|'', hosting?:string, customAuthDomain?:boolean|null, reverseProxyForAuthHandler?:boolean|null, browser?:string, thirdPartyCookiesBlocked?:boolean|null}} [config.app]
 * @param {{name?:string, consoleRedirectUri?:string}} [config.provider]
 * @returns {{status:'pass'|'warn'|'fail', summary:string, expected:object, problems:Array, fixes:Array, checklist:string[], disclaimer:string}}
 */
export function diagnose(config) {
  const cfg = config && typeof config === 'object' ? config : {};
  const errorCfg = cfg.error && typeof cfg.error === 'object' ? cfg.error : {};
  const app = cfg.app && typeof cfg.app === 'object' ? cfg.app : {};
  const provider = cfg.provider && typeof cfg.provider === 'object' ? cfg.provider : {};

  const problems = [];
  const fixes = [];
  const checklist = [];

  const errorCode = ERROR_CODES.includes(errorCfg.code) ? errorCfg.code : '';
  const pageOriginRaw = safeStr(app.pageOrigin).trim();
  const authDomainRaw = safeStr(app.authDomain).trim();
  const method = METHOD_OPTIONS.includes(app.method) ? app.method : '';
  const hosting = HOSTING_OPTIONS.includes(app.hosting) ? app.hosting : '';
  const customAuthDomain = app.customAuthDomain === true ? true : app.customAuthDomain === false ? false : null;
  const reverseProxy = app.reverseProxyForAuthHandler === true ? true : app.reverseProxyForAuthHandler === false ? false : null;
  const browser = BROWSER_OPTIONS.includes(app.browser) ? app.browser : '';
  const thirdPartyCookiesBlocked = app.thirdPartyCookiesBlocked === true ? true : app.thirdPartyCookiesBlocked === false ? false : null;
  const authorizedDomains = Array.isArray(app.authorizedDomains)
    ? app.authorizedDomains.filter((x) => typeof x === 'string' && x.trim())
    : [];
  const providerName = PROVIDER_NAMES.includes(provider.name) ? provider.name : '';
  const consoleRedirectUri = safeStr(provider.consoleRedirectUri).trim();

  const expected = computeExpected(cfg);

  // ── 0. nothing to go on at all ──────────────────────────────────────
  if (!errorCode && !pageOriginRaw && !authDomainRaw) {
    pushProblem(problems, {
      severity: 'medium',
      code: 'config_incomplete',
      message: 'Nothing to check yet. Fill in at least the error code from Firebase (if you have one), app.pageOrigin (the URL your app actually runs at), and app.authDomain (the authDomain value from your firebaseConfig).',
      path: 'app',
    });
  }

  // ── a. pageOrigin host missing from Authorized domains ──────────────
  const pageHost = expected.pageHost;
  if (pageHost) {
    const normalizedList = authorizedDomains.map(normalizeDomainEntry).filter(Boolean);
    const exempt = isLoopbackHost(pageHost); // Firebase includes localhost by default
    const present = normalizedList.includes(pageHost);
    const listProvided = normalizedList.length > 0;
    const ipHost = isRawIp(pageHost) && !exempt;
    if (errorCode === 'auth/unauthorized-domain' || (listProvided && !exempt && !present)) {
      pushProblem(problems, {
        severity: 'high',
        code: 'unauthorized_domain',
        message: ipHost
          ? `"${pageHost}" is a raw IP address. Firebase's Authorized domains list does not accept IP addresses at all, only real hostnames, so signInWithPopup/signInWithRedirect from here always throws auth/unauthorized-domain.`
          : `"${pageHost}" is not on Authentication → Settings → Authorized domains${listProvided ? '' : ' (per the error code reported)'}. Firebase blocks signInWithPopup/signInWithRedirect from any origin not on that allow-list with auth/unauthorized-domain.`,
        path: 'app.authorizedDomains',
        value: pageHost,
        fix: ipHost ? 'Serve the app from a real hostname instead of a bare IP address, then authorize that hostname.' : `Add "${pageHost}" in Firebase Console → Authentication → Settings → Authorized domains.`,
      });
      if (!ipHost) {
        fixes.push({ title: 'Add to Firebase Console → Authentication → Settings → Authorized domains', value: pageHost, where: 'Authorized domains' });
      }
    }
  } else if (errorCode === 'auth/unauthorized-domain') {
    pushProblem(problems, {
      severity: 'medium',
      code: 'unauthorized_domain_unknown_host',
      message: 'Got auth/unauthorized-domain, but app.pageOrigin is empty so the exact host to add to Authorized domains can\'t be shown. Fill it in with the URL the browser actually shows when the error happens.',
      path: 'app.pageOrigin',
      fix: 'Set app.pageOrigin to the failing page\'s URL.',
    });
  }

  // ── b. signInWithRedirect across origins + third-party cookies blocked ──
  const crossOriginRedirect = method === 'redirect' && expected.crossOrigin;
  const cookieIssue = errorCode === 'auth/missing-initial-state' || (crossOriginRedirect && thirdPartyCookiesBlocked !== false);
  if (cookieIssue) {
    const modernBrowserNote = browser
      ? `You reported "${browser}", one of the browsers that blocks it by default now (Chrome M115+, Firefox 109+, Safari 16.1+).`
      : 'Chrome M115+, Firefox 109+, and Safari 16.1+ all block it by default now, regardless of any explicit user cookie setting.';
    pushProblem(problems, {
      severity: 'high',
      code: 'redirect_third_party_cookie_blocked',
      message: `app.method is "redirect"${expected.authDomain && pageHost ? ` and authDomain ("${expected.authDomain}") is a different origin from pageOrigin ("${pageHost}")` : ''}. signInWithRedirect() depends on a cross-origin iframe to authDomain to read the pending sign-in state; browsers that block that cross-origin storage access break the flow silently or throw auth/missing-initial-state. ${modernBrowserNote}`,
      path: 'app.method',
      value: 'redirect',
      fix: 'Point authDomain at your own domain with a reverse proxy (Option 1), switch to signInWithPopup() (Option 2/3), or serve the app from a Firebase Hosting custom domain (Option 4/5).',
    });
    fixes.push({ title: 'firebaseConfig: point authDomain at your own domain', value: `authDomain: "${pageHost || 'your-domain.com'}"`, where: 'firebaseConfig' });
    fixes.push({ title: 'firebase.json: proxy /__/auth/** to <project>.firebaseapp.com', value: FIREBASE_JSON_PROXY_SNIPPET, where: 'firebase.json (Hosting rewrites)' });
    fixes.push({ title: 'Or: switch to signInWithPopup()', value: 'signInWithPopup(auth, provider)', where: 'your sign-in code' });
  } else if (crossOriginRedirect && thirdPartyCookiesBlocked === false) {
    pushProblem(problems, {
      severity: 'low',
      code: 'redirect_cross_origin_fragile',
      message: `app.method is "redirect" across two different origins (pageOrigin "${pageHost}" vs. authDomain "${expected.authDomain}"). You reported third-party cookies as not currently blocked here, so it may work today, but every major browser is moving toward blocking that cross-origin storage access by default: this will break without any code change on your side.`,
      path: 'app.method',
      fix: 'Plan a move to a same-origin authDomain (Option 1) or signInWithPopup() before browsers tighten this further.',
    });
  }

  // ── c. custom authDomain without a confirmed reverse proxy ──────────
  if (customAuthDomain === true && reverseProxy !== true) {
    pushProblem(problems, {
      severity: 'high',
      code: 'custom_auth_domain_missing_proxy',
      message: `app.customAuthDomain is true${expected.authDomain ? ` ("${expected.authDomain}" is not a *.firebaseapp.com / *.web.app domain)` : ''}, but app.reverseProxyForAuthHandler is not confirmed true. Without a reverse proxy that transparently forwards every /__/auth/* request on that domain to <project>.firebaseapp.com (not a redirect), Firebase's sign-in helper pages simply don't exist there, and both popup and redirect flows break.`,
      path: 'app.reverseProxyForAuthHandler',
      fix: 'Set up a reverse proxy (a Firebase Hosting rewrite to a function, nginx, a Cloudflare Worker, Next.js middleware, ...) that forwards /__/auth/** on this domain to <project>.firebaseapp.com.',
    });
    fixes.push({ title: 'firebase.json: proxy /__/auth/** to <project>.firebaseapp.com', value: FIREBASE_JSON_PROXY_SNIPPET, where: 'firebase.json (Hosting rewrites)' });
    fixes.push({ title: 'Proxy function: forward the request, don\'t redirect it', value: AUTH_PROXY_FUNCTION_SNIPPET, where: 'functions/authProxy' });
  }

  // ── d. provider console redirect URI must equal the auth handler URL ──
  if (expected.handlerUri) {
    if (consoleRedirectUri && consoleRedirectUri !== expected.handlerUri) {
      pushProblem(problems, {
        severity: 'high',
        code: 'provider_redirect_uri_mismatch',
        message: `The redirect/callback URI registered with ${expected.providerLabel || providerName || 'your OAuth provider'} is "${consoleRedirectUri}", but Firebase needs exactly "${expected.handlerUri}". Anything else and the provider either rejects the request outright or returns the user to the wrong place, which Firebase's helper page can't complete.`,
        path: 'provider.consoleRedirectUri',
        value: consoleRedirectUri,
        fix: `Set it to exactly: ${expected.handlerUri}`,
      });
      fixes.push({ title: `Register in ${expected.providerLabel || providerName || 'your OAuth provider'}`, value: expected.handlerUri, where: 'Authorized redirect URI / Callback URL' });
    } else if (!consoleRedirectUri) {
      checklist.push(`Register "${expected.handlerUri}" as the redirect/callback URI in ${expected.providerLabel || (providerName ? providerName : 'your OAuth provider’s') + ' console'}.`);
    }
  }

  // ── e. embedded WebView / Capacitor: popup unsupported ──────────────
  if (errorCode === 'auth/operation-not-supported-in-this-environment' || (hosting === 'capacitor' && method === 'popup')) {
    pushProblem(problems, {
      severity: 'medium',
      code: 'popup_unsupported_in_webview',
      message: 'signInWithPopup() (and often signInWithRedirect(), unless a custom URL-scheme handler is wired up) is not reliably supported inside an embedded WebView such as Capacitor\'s: Firebase throws auth/operation-not-supported-in-this-environment for exactly this environment.',
      path: 'app.hosting',
      value: hosting || null,
      fix: 'Open the OAuth flow in the system browser (Capacitor Browser plugin, an in-app SFSafariViewController / Custom Tab) and hand the resulting token back to signInWithCredential(), or use a plugin that wraps the provider’s native sign-in SDK directly.',
    });
  }

  // ── f. popup blocked ──────────────────────────────────────────────
  if (errorCode === 'auth/popup-blocked') {
    pushProblem(problems, {
      severity: 'medium',
      code: 'popup_blocked',
      message: 'The browser’s popup blocker stopped the sign-in window. Browsers only let window.open() through their popup blocker when it runs synchronously inside a direct user gesture; an await, a promise callback, or a call on page load loses that gesture and gets blocked.',
      path: 'app.method',
      value: 'popup',
      fix: 'Call signInWithPopup() synchronously, directly inside the click handler, with nothing awaited before it; or fall back to signInWithRedirect().',
    });
  }

  // ── g. invalid continue URI ─────────────────────────────────────────
  if (errorCode === 'auth/invalid-continue-uri') {
    pushProblem(problems, {
      severity: 'high',
      code: 'invalid_continue_uri',
      message: 'Firebase rejected the continue/redirect URL: "The continue URL must be a valid URL string." It also needs a domain that is itself on Authentication → Settings → Authorized domains, the same allow-list the rest of the sign-in flow uses.',
      path: 'app',
      fix: 'Pass a complete, valid URL (with an https:// scheme) as the continue URL, and make sure its domain is on Authorized domains.',
    });
  }

  // ── h. web storage unsupported (private mode / third-party context) ──
  if (errorCode === 'auth/web-storage-unsupported') {
    pushProblem(problems, {
      severity: 'medium',
      code: 'web_storage_unsupported',
      message: 'The browser is blocking storage access for the auth handler page, typically Safari Private Browsing, an in-app browser with tracking protection enabled, or a browser configured to block all cookies/localStorage in a third-party context. Firebase Auth needs storage on authDomain to complete the flow.',
      path: 'app.browser',
      value: browser || null,
      fix: 'Ask the user to leave private/incognito mode, or move to a same-origin authDomain (Option 1) so the storage Firebase needs is first-party instead of third-party.',
    });
  }

  // ── informational: redirect cancelled by the user, not a bug ────────
  if (errorCode === 'auth/redirect-cancelled-by-user') {
    pushProblem(problems, {
      severity: 'low',
      code: 'redirect_cancelled_by_user',
      message: 'The user closed or backed out of the provider’s consent screen themselves. This is not a configuration bug: getRedirectResult() simply resolves with a null result, and the app should just show the sign-in button again.',
      path: 'error.code',
      value: errorCode,
    });
  }

  // ── checklist ─────────────────────────────────────────────────────
  if (expected.authorizedDomainsNeeded.length) {
    checklist.push(`Confirm these are on Authentication → Settings → Authorized domains: ${expected.authorizedDomainsNeeded.join(', ')}.`);
  } else {
    checklist.push('Once app.pageOrigin and app.authDomain are filled in, this checklist will name the exact domains to authorize.');
  }
  checklist.push('Confirm the authDomain in the firebaseConfig actually deployed matches the one you’re checking here — prod, staging, and localhost builds often carry different values.');
  checklist.push('If you use signInWithRedirect() across two different origins, plan around third-party cookie blocking now: Chrome, Firefox, and Safari all restrict it by default in current releases.');
  if (expected.note) checklist.push(expected.note);

  const sorted = sortProblems(problems);
  const highCount = sorted.filter((p) => p.severity === 'high').length;
  const medCount = sorted.filter((p) => p.severity === 'medium').length;
  const lowCount = sorted.filter((p) => p.severity === 'low').length;

  let status = 'pass';
  if (highCount > 0) status = 'fail';
  else if (medCount > 0 || lowCount > 0) status = 'warn';

  let summary;
  if (status === 'pass') {
    summary = 'No mismatches found. The domains and redirect URIs you entered line up with what Firebase and your provider console both expect.';
  } else if (status === 'fail') {
    const top = sorted.find((p) => p.severity === 'high');
    summary = `${highCount} blocking mismatch${highCount > 1 ? 'es' : ''} found. Most urgent: ${top.message}`;
  } else {
    const top = sorted[0];
    summary = `Nothing blocking, but ${medCount + lowCount} thing${medCount + lowCount > 1 ? 's' : ''} worth checking. Top of the list: ${top.message}`;
  }

  return {
    status,
    summary,
    expected,
    problems: sorted,
    fixes,
    checklist,
    disclaimer:
      'Read-only, client-side analysis of the values you entered. Nothing is verified against your live Firebase project: always confirm in the Firebase console and your provider’s console before shipping. Not affiliated with Google or Firebase.',
  };
}

/**
 * Standalone helper: just the expected values for a config, without running
 * the full diagnostic. Handy for live-updating a preview as the user types.
 */
export function expectedValues(config) {
  const cfg = config && typeof config === 'object' ? config : {};
  return computeExpected(cfg);
}

// Also expose as a plain browser global when loaded via <script type="module">.
if (typeof window !== 'undefined') {
  window.FirebaseAuthDoctor = { diagnose, expectedValues };
}
