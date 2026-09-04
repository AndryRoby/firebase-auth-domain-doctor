// tests.mjs — plain Node test runner for doctor-firebase.js (no external dependencies).
// Run with: node tests.mjs

import { diagnose, expectedValues } from './doctor-firebase.js';

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(`${name}${detail ? ' — ' + detail : ''}`);
  }
}

function eq(name, actual, expected) {
  const condition = actual === expected;
  ok(name, condition, condition ? '' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function has(name, arr, code) {
  const condition = Array.isArray(arr) && arr.some((p) => p.code === code);
  ok(name, condition, condition ? '' : `expected a problem with code "${code}", got codes [${(arr || []).map((p) => p.code).join(', ')}]`);
}

function lacks(name, arr, code) {
  const condition = Array.isArray(arr) && !arr.some((p) => p.code === code);
  ok(name, condition, condition ? '' : `did not expect a problem with code "${code}"`);
}

function severityOf(arr, code) {
  const p = (arr || []).find((x) => x.code === code);
  return p ? p.severity : undefined;
}

function messageOf(arr, code) {
  const p = (arr || []).find((x) => x.code === code);
  return p ? p.message : '';
}

// ─────────────────────────────────────────────────────────────────────────
// 1. expectedValues() — authDomain / handler URL / authorized-domains set
// ─────────────────────────────────────────────────────────────────────────

eq('expectedValues({}) has no authDomain', expectedValues({}).authDomain, null);
eq('expectedValues({}) has no handlerUri', expectedValues({}).handlerUri, null);
eq('expectedValues({}) missingField is app.authDomain', expectedValues({}).missingField, 'app.authDomain');
eq('expectedValues(undefined) does not throw and returns null authDomain', expectedValues(undefined).authDomain, null);

eq('authDomain -> handlerUri is https://<authDomain>/__/auth/handler',
  expectedValues({ app: { authDomain: 'myapp.firebaseapp.com' } }).handlerUri,
  'https://myapp.firebaseapp.com/__/auth/handler');

eq('authDomain with mixed case is lowercased',
  expectedValues({ app: { authDomain: 'MyApp.FirebaseApp.com' } }).authDomain,
  'myapp.firebaseapp.com');

eq('pageOrigin without a scheme still parses to just the host',
  expectedValues({ app: { pageOrigin: 'myapp.com' } }).pageHost, 'myapp.com');

eq('pageOrigin with a scheme and path parses to just the host',
  expectedValues({ app: { pageOrigin: 'https://myapp.com/some/path?x=1' } }).pageHost, 'myapp.com');

eq('authDomain present, pageOrigin absent -> missingField is app.pageOrigin',
  expectedValues({ app: { authDomain: 'myapp.firebaseapp.com' } }).missingField, 'app.pageOrigin');

eq('pageOrigin present, authDomain absent -> missingField is app.authDomain',
  expectedValues({ app: { pageOrigin: 'https://myapp.com' } }).missingField, 'app.authDomain');

eq('both present -> missingField is null',
  expectedValues({ app: { pageOrigin: 'https://myapp.com', authDomain: 'myapp.firebaseapp.com' } }).missingField, null);

{
  const e = expectedValues({ app: { pageOrigin: 'https://myapp.com', authDomain: 'myproj.firebaseapp.com' } });
  eq('different pageOrigin host and authDomain -> crossOrigin is true', e.crossOrigin, true);
  eq('crossOrigin case: authorizedDomainsNeeded has both entries', e.authorizedDomainsNeeded.length, 2);
  ok('authorizedDomainsNeeded includes the page host', e.authorizedDomainsNeeded.includes('myapp.com'));
  ok('authorizedDomainsNeeded includes the authDomain host', e.authorizedDomainsNeeded.includes('myproj.firebaseapp.com'));
}

{
  const e = expectedValues({ app: { pageOrigin: 'https://myapp.com', authDomain: 'myapp.com' } });
  eq('same-origin pageOrigin/authDomain -> crossOrigin is false', e.crossOrigin, false);
  eq('same-origin case: authorizedDomainsNeeded has exactly one entry (no duplicate)', e.authorizedDomainsNeeded.length, 1);
}

{
  const e = expectedValues({ app: { pageOrigin: 'http://localhost:3000', authDomain: 'myproj.firebaseapp.com' } });
  eq('localhost pageOrigin is excluded from authorizedDomainsNeeded (Firebase includes it by default)',
    e.authorizedDomainsNeeded.includes('localhost'), false);
  eq('localhost vs. a real authDomain still counts as cross-origin', e.crossOrigin, true);
}

eq('known provider name resolves a providerLabel',
  expectedValues({ provider: { name: 'google' } }).providerLabel,
  'Google Cloud Console → APIs & Services → Credentials');

eq('unrecognized provider name resolves no providerLabel',
  expectedValues({ provider: { name: 'made-up-provider' } }).providerLabel, null);

eq('note mentions the computed authDomain when known',
  /myapp\.firebaseapp\.com/.test(expectedValues({ app: { authDomain: 'myapp.firebaseapp.com' } }).note), true);

// ─────────────────────────────────────────────────────────────────────────
// 2. diagnose() — no input / malformed input never throws
// ─────────────────────────────────────────────────────────────────────────

{
  const r = diagnose({});
  has('empty config: flags config_incomplete', r.problems, 'config_incomplete');
  eq('empty config: severity is medium', severityOf(r.problems, 'config_incomplete'), 'medium');
  eq('empty config: status is warn (no high-severity problems)', r.status, 'warn');
  ok('empty config: checklist still has generic guidance', r.checklist.length >= 3);
}

{
  const r = diagnose(undefined);
  ok('diagnose(undefined) does not throw and returns a status', typeof r.status === 'string');
}

{
  const r = diagnose({ error: null, app: null, provider: null });
  ok('diagnose with all-null sections does not throw', typeof r.status === 'string');
}

{
  const r = diagnose({ error: { code: 'not-a-real-firebase-code' } });
  has('an unrecognized error.code is ignored (treated as if no code were given)', r.problems, 'config_incomplete');
}

// ─────────────────────────────────────────────────────────────────────────
// 3. diagnose() — rule (a): pageOrigin host missing from Authorized domains
// ─────────────────────────────────────────────────────────────────────────

{
  const r = diagnose({ app: { pageOrigin: 'https://myapp.com', authorizedDomains: ['otherapp.com'] } });
  has('host missing from Authorized domains is flagged', r.problems, 'unauthorized_domain');
  eq('unauthorized_domain severity is high', severityOf(r.problems, 'unauthorized_domain'), 'high');
  eq('unauthorized_domain: overall status is fail', r.status, 'fail');
  const fix = r.fixes.find((f) => f.title.includes('Authorized domains'));
  ok('a fix offers the exact host to add', !!fix && fix.value === 'myapp.com');
}

{
  const r = diagnose({ app: { pageOrigin: 'https://myapp.com', authorizedDomains: ['myapp.com', 'otherapp.com'] } });
  lacks('host present in Authorized domains is not flagged', r.problems, 'unauthorized_domain');
}

{
  const r = diagnose({ app: { pageOrigin: 'https://myapp.com/', authorizedDomains: ['https://myapp.com/some/path'] } });
  lacks('a full URL in authorizedDomains still normalizes to a host match', r.problems, 'unauthorized_domain');
}

{
  const r = diagnose({ error: { code: 'auth/unauthorized-domain' }, app: { pageOrigin: 'https://myapp.com' } });
  has('error.code auth/unauthorized-domain flags it even with no authorizedDomains list given', r.problems, 'unauthorized_domain');
  eq('reported-error case is still high severity', severityOf(r.problems, 'unauthorized_domain'), 'high');
}

{
  const r = diagnose({ app: { pageOrigin: 'http://localhost:3000', authorizedDomains: [] } });
  lacks('localhost is exempt even with an empty Authorized domains list', r.problems, 'unauthorized_domain');
}

{
  const r = diagnose({ app: { pageOrigin: 'http://127.0.0.1:5000', authorizedDomains: ['myapp.com'] } });
  lacks('127.0.0.1 is treated as loopback and exempt', r.problems, 'unauthorized_domain');
}

{
  const r = diagnose({ app: { pageOrigin: 'http://8.8.8.8', authorizedDomains: ['myapp.com'] } });
  has('a raw non-loopback IP host is flagged', r.problems, 'unauthorized_domain');
  ok('raw-IP message explains IPs are never accepted', /IP address/.test(messageOf(r.problems, 'unauthorized_domain')));
  const fix = r.fixes.find((f) => f.title.includes('Authorized domains') && f.value === '8.8.8.8');
  ok('raw-IP case does not offer to "add" the IP as a fix', !fix);
}

{
  const r = diagnose({ error: { code: 'auth/unauthorized-domain' } });
  has('unauthorized-domain with no pageOrigin at all is flagged as incomplete info', r.problems, 'unauthorized_domain_unknown_host');
  eq('unauthorized_domain_unknown_host severity is medium', severityOf(r.problems, 'unauthorized_domain_unknown_host'), 'medium');
}

// ─────────────────────────────────────────────────────────────────────────
// 4. diagnose() — rule (b): signInWithRedirect across origins + 3rd-party cookies
// ─────────────────────────────────────────────────────────────────────────

{
  const r = diagnose({ app: { method: 'redirect', pageOrigin: 'https://myapp.com', authDomain: 'myproj.firebaseapp.com' } });
  has('cross-origin redirect flow is flagged by default (unknown cookie state = assume risk)', r.problems, 'redirect_third_party_cookie_blocked');
  eq('redirect_third_party_cookie_blocked severity is high', severityOf(r.problems, 'redirect_third_party_cookie_blocked'), 'high');
  ok('a fix suggests pointing authDomain at the app\'s own domain', r.fixes.some((f) => f.title.includes('authDomain')));
  ok('a fix offers a firebase.json proxy snippet', r.fixes.some((f) => f.title.includes('firebase.json')));
  ok('a fix suggests signInWithPopup as an alternative', r.fixes.some((f) => f.value.includes('signInWithPopup')));
}

{
  const r = diagnose({ app: { method: 'popup', pageOrigin: 'https://myapp.com', authDomain: 'myproj.firebaseapp.com' } });
  lacks('signInWithPopup across origins is not flagged (no cross-origin iframe involved)', r.problems, 'redirect_third_party_cookie_blocked');
  lacks('signInWithPopup across origins does not trigger the fragile-cookie warning either', r.problems, 'redirect_cross_origin_fragile');
}

{
  const r = diagnose({ app: { method: 'redirect', pageOrigin: 'https://myapp.com', authDomain: 'myapp.com' } });
  lacks('same-origin redirect flow is not flagged', r.problems, 'redirect_third_party_cookie_blocked');
}

{
  const r = diagnose({
    app: { method: 'redirect', pageOrigin: 'https://myapp.com', authDomain: 'myproj.firebaseapp.com', thirdPartyCookiesBlocked: false },
  });
  lacks('explicitly-not-blocked cookies downgrades away from the high-severity code', r.problems, 'redirect_third_party_cookie_blocked');
  has('...but still surfaces a low-severity fragility warning', r.problems, 'redirect_cross_origin_fragile');
  eq('redirect_cross_origin_fragile severity is low', severityOf(r.problems, 'redirect_cross_origin_fragile'), 'low');
}

{
  const r = diagnose({ error: { code: 'auth/missing-initial-state' } });
  has('auth/missing-initial-state alone (no app fields) still flags the cookie-blocking cause', r.problems, 'redirect_third_party_cookie_blocked');
  eq('status is fail', r.status, 'fail');
}

{
  const r = diagnose({
    app: { method: 'redirect', pageOrigin: 'https://myapp.com', authDomain: 'myproj.firebaseapp.com', browser: 'safari' },
  });
  ok('message names the reported browser when given', /safari/i.test(messageOf(r.problems, 'redirect_third_party_cookie_blocked')));
}

// ─────────────────────────────────────────────────────────────────────────
// 5. diagnose() — rule (c): custom authDomain without a confirmed reverse proxy
// ─────────────────────────────────────────────────────────────────────────

{
  const r = diagnose({ app: { customAuthDomain: true, authDomain: 'auth.myapp.com' } });
  has('custom authDomain with unknown proxy status is flagged', r.problems, 'custom_auth_domain_missing_proxy');
  eq('custom_auth_domain_missing_proxy severity is high', severityOf(r.problems, 'custom_auth_domain_missing_proxy'), 'high');
}

{
  const r = diagnose({ app: { customAuthDomain: true, reverseProxyForAuthHandler: true, authDomain: 'auth.myapp.com' } });
  lacks('custom authDomain with a confirmed proxy is not flagged', r.problems, 'custom_auth_domain_missing_proxy');
}

{
  const r = diagnose({ app: { customAuthDomain: false, authDomain: 'myproj.firebaseapp.com' } });
  lacks('non-custom authDomain is never flagged for a missing proxy', r.problems, 'custom_auth_domain_missing_proxy');
}

{
  const r = diagnose({ app: {} });
  lacks('unset customAuthDomain (null) is not flagged', r.problems, 'custom_auth_domain_missing_proxy');
}

// ─────────────────────────────────────────────────────────────────────────
// 6. diagnose() — rule (d): provider console redirect URI vs. the auth handler
// ─────────────────────────────────────────────────────────────────────────

{
  const r = diagnose({
    app: { authDomain: 'myapp.firebaseapp.com' },
    provider: { name: 'google', consoleRedirectUri: 'https://myapp.com/callback' },
  });
  has('a provider redirect URI that is not the Firebase handler is flagged', r.problems, 'provider_redirect_uri_mismatch');
  eq('provider_redirect_uri_mismatch severity is high', severityOf(r.problems, 'provider_redirect_uri_mismatch'), 'high');
  const fix = r.fixes.find((f) => f.title.startsWith('Register in'));
  ok('a fix names the exact handler URL to register', !!fix && fix.value === 'https://myapp.firebaseapp.com/__/auth/handler');
}

{
  const r = diagnose({
    app: { authDomain: 'myapp.firebaseapp.com' },
    provider: { name: 'google', consoleRedirectUri: 'https://myapp.firebaseapp.com/__/auth/handler' },
  });
  lacks('a matching provider redirect URI is not flagged', r.problems, 'provider_redirect_uri_mismatch');
}

{
  const r = diagnose({ app: { authDomain: 'myapp.firebaseapp.com' }, provider: { name: 'google' } });
  lacks('no console redirect URI given yet is not treated as a mismatch', r.problems, 'provider_redirect_uri_mismatch');
  ok('checklist names the exact handler URL to register once authDomain is known',
    r.checklist.some((c) => c.includes('https://myapp.firebaseapp.com/__/auth/handler')));
}

{
  const r = diagnose({ provider: { name: 'google', consoleRedirectUri: 'https://myapp.com/callback' } });
  lacks('with no authDomain at all, provider mismatch cannot be computed and is skipped', r.problems, 'provider_redirect_uri_mismatch');
}

// ─────────────────────────────────────────────────────────────────────────
// 7. diagnose() — rule (e): popup unsupported in an embedded WebView
// ─────────────────────────────────────────────────────────────────────────

{
  const r = diagnose({ error: { code: 'auth/operation-not-supported-in-this-environment' } });
  has('the operation-not-supported error code is flagged regardless of other fields', r.problems, 'popup_unsupported_in_webview');
  eq('popup_unsupported_in_webview severity is medium', severityOf(r.problems, 'popup_unsupported_in_webview'), 'medium');
}

{
  const r = diagnose({ app: { hosting: 'capacitor', method: 'popup' } });
  has('Capacitor hosting + popup method is flagged even without an explicit error code', r.problems, 'popup_unsupported_in_webview');
}

{
  const r = diagnose({ app: { hosting: 'capacitor', method: 'redirect' } });
  lacks('Capacitor hosting with redirect (no error code) is not flagged', r.problems, 'popup_unsupported_in_webview');
}

{
  const r = diagnose({ app: { hosting: 'vercel', method: 'popup' } });
  lacks('popup method on ordinary web hosting is not flagged', r.problems, 'popup_unsupported_in_webview');
}

// ─────────────────────────────────────────────────────────────────────────
// 8. diagnose() — rule (f)/(g)/(h): direct error-code mappings
// ─────────────────────────────────────────────────────────────────────────

{
  const r = diagnose({ error: { code: 'auth/popup-blocked' } });
  has('auth/popup-blocked is flagged', r.problems, 'popup_blocked');
  eq('popup_blocked severity is medium', severityOf(r.problems, 'popup_blocked'), 'medium');
  ok('the fix mentions calling it inside a click handler', /click handler/i.test(r.problems.find((p) => p.code === 'popup_blocked').fix));
}

{
  const r = diagnose({});
  lacks('no error code at all does not trigger popup_blocked', r.problems, 'popup_blocked');
}

{
  const r = diagnose({ error: { code: 'auth/invalid-continue-uri' } });
  has('auth/invalid-continue-uri is flagged', r.problems, 'invalid_continue_uri');
  eq('invalid_continue_uri severity is high', severityOf(r.problems, 'invalid_continue_uri'), 'high');
  ok('message quotes Firebase\'s own wording', /must be a valid URL string/.test(messageOf(r.problems, 'invalid_continue_uri')));
  eq('status is fail', r.status, 'fail');
}

{
  const r = diagnose({ error: { code: 'auth/web-storage-unsupported' } });
  has('auth/web-storage-unsupported is flagged', r.problems, 'web_storage_unsupported');
  eq('web_storage_unsupported severity is medium', severityOf(r.problems, 'web_storage_unsupported'), 'medium');
}

{
  const r = diagnose({ error: { code: 'auth/web-storage-unsupported' }, app: { browser: 'safari' } });
  eq('reported browser is echoed back as the problem value', r.problems.find((p) => p.code === 'web_storage_unsupported').value, 'safari');
}

// ─────────────────────────────────────────────────────────────────────────
// 9. diagnose() — user-cancelled redirect is informational, not a bug
// ─────────────────────────────────────────────────────────────────────────

{
  const r = diagnose({ error: { code: 'auth/redirect-cancelled-by-user' } });
  has('auth/redirect-cancelled-by-user is flagged', r.problems, 'redirect_cancelled_by_user');
  eq('redirect_cancelled_by_user severity is low', severityOf(r.problems, 'redirect_cancelled_by_user'), 'low');
  eq('a lone low-severity finding yields status warn, not fail', r.status, 'warn');
}

// ─────────────────────────────────────────────────────────────────────────
// 10. diagnose() — overall status + summary
// ─────────────────────────────────────────────────────────────────────────

{
  const r = diagnose({
    app: {
      pageOrigin: 'https://myapp.com',
      authDomain: 'myapp.firebaseapp.com',
      authorizedDomains: ['myapp.com', 'myapp.firebaseapp.com'],
      method: 'popup',
      hosting: 'vercel',
      customAuthDomain: false,
      browser: 'chrome',
    },
    provider: { name: 'google', consoleRedirectUri: 'https://myapp.firebaseapp.com/__/auth/handler' },
  });
  eq('everything matching cleanly yields status "pass"', r.status, 'pass');
  ok('pass summary says no mismatches found', /No mismatches found/.test(r.summary));
  eq('a passing diagnosis reports zero problems', r.problems.length, 0);
}

{
  const r = diagnose({ error: { code: 'auth/redirect-cancelled-by-user' } });
  eq('only a low-severity finding yields status "warn"', r.status, 'warn');
}

{
  const r = diagnose({ app: { pageOrigin: 'https://myapp.com', authorizedDomains: ['otherapp.com'] } });
  eq('any high-severity finding yields status "fail"', r.status, 'fail');
  ok('fail summary names the most urgent problem', /blocking mismatch/.test(r.summary));
}

{
  // Several independent high-severity problems still collapse to one "fail".
  const r = diagnose({
    app: {
      pageOrigin: 'https://myapp.com',
      authDomain: 'auth.myapp.com',
      authorizedDomains: ['otherapp.com'],
      method: 'redirect',
      customAuthDomain: true,
      reverseProxyForAuthHandler: false,
    },
    provider: { name: 'google', consoleRedirectUri: 'https://wrong.com/cb' },
  });
  eq('several high problems at once still yield a single "fail" status', r.status, 'fail');
  ok('all four independent high-severity codes are present', [
    'unauthorized_domain',
    'redirect_third_party_cookie_blocked',
    'custom_auth_domain_missing_proxy',
    'provider_redirect_uri_mismatch',
  ].every((c) => r.problems.some((p) => p.code === c)));
}

// ─────────────────────────────────────────────────────────────────────────
// 11. diagnose() — checklist is always populated and names concrete domains
// ─────────────────────────────────────────────────────────────────────────

{
  const r = diagnose({});
  ok('checklist has generic guidance even with no input at all', r.checklist.length >= 3);
}

{
  const r = diagnose({ app: { pageOrigin: 'https://myapp.com', authDomain: 'myapp.firebaseapp.com' } });
  ok('checklist names both concrete domains once they are known',
    r.checklist.some((c) => c.includes('myapp.com') && c.includes('myapp.firebaseapp.com')));
}

// ─────────────────────────────────────────────────────────────────────────
// 12. sortProblems() — high severity always sorts first regardless of push order
// ─────────────────────────────────────────────────────────────────────────

{
  const r = diagnose({
    error: { code: 'auth/redirect-cancelled-by-user' }, // low, pushed last in code
    app: { pageOrigin: 'https://myapp.com', authorizedDomains: ['otherapp.com'] }, // high, pushed early
  });
  eq('sorted problems: first entry is high severity', r.problems[0].severity, 'high');
  eq('sorted problems: last entry is low severity', r.problems[r.problems.length - 1].severity, 'low');
}

// ─────────────────────────────────────────────────────────────────────────

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
} else {
  console.log('All tests passed.');
}
