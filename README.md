# Firebase Auth Domain Doctor

A free tool that finds why Firebase Authentication throws `auth/unauthorized-domain`, `auth/missing-initial-state`, or a silent `signInWithRedirect()` failure, and gives the exact fix, for your `firebaseConfig`, your OAuth provider's console, and Firebase Console's Authorized domains.

Live: https://arling.sk/firebase-auth-domain-doctor/

You paste the Firebase error code (if you have one), the page origin your app actually runs at, your `firebaseConfig`'s `authDomain`, your Authentication → Settings → Authorized domains list, whether you call `signInWithPopup()` or `signInWithRedirect()`, where the app is hosted, and which OAuth provider you're using. The tool computes the exact auth handler URL Firebase and your provider console both need, diffs it against what you've configured, and reports the precise component that differs.

## What it checks

Each check below is a `code` the engine (`doctor-firebase.js`) can return from `diagnose()`:

- `unauthorized_domain`: the page's own host isn't on Authentication → Settings → Authorized domains, so Firebase throws `auth/unauthorized-domain` from `signInWithPopup()`/`signInWithRedirect()`. A raw IP address gets a separate message: Firebase's Authorized domains list never accepts IP addresses, only real hostnames.
- `unauthorized_domain_unknown_host`: you reported the `auth/unauthorized-domain` error code but left the page origin blank, so the tool can't yet show which exact host to authorize.
- `redirect_third_party_cookie_blocked`: `signInWithRedirect()` across two different origins (`authDomain` vs. your app's own origin) depends on a cross-origin iframe to `authDomain`; Chrome M115+, Firefox 109+, and Safari 16.1+ all block that cross-origin storage access by default now, which breaks the flow silently or throws `auth/missing-initial-state`.
- `redirect_cross_origin_fragile`: same cross-origin `signInWithRedirect()` setup, but third-party cookies aren't blocked in your case yet, a low-severity heads-up that this is a matter of when, not if, given where every major browser is heading.
- `custom_auth_domain_missing_proxy`: `authDomain` is set to a domain that isn't `*.firebaseapp.com`/`*.web.app`, but a reverse proxy forwarding `/__/auth/**` to `<project>.firebaseapp.com` isn't confirmed, meaning Firebase's own sign-in helper pages don't actually exist at that domain.
- `provider_redirect_uri_mismatch`: the redirect/callback URI registered with your OAuth provider (Google, Apple, Facebook, GitHub, Microsoft) doesn't exactly equal the auth handler URL Firebase needs, `https://<authDomain>/__/auth/handler`.
- `popup_unsupported_in_webview`: `signInWithPopup()` inside an embedded WebView (Capacitor and similar) throws `auth/operation-not-supported-in-this-environment`, since that environment isn't reliably supported for either popup or plain redirect flows.
- `popup_blocked`: `auth/popup-blocked`, almost always because `signInWithPopup()` ran after an `await` or inside a promise callback instead of synchronously inside the click handler, so the browser lost the user-gesture context that lets it through the popup blocker.
- `invalid_continue_uri`: `auth/invalid-continue-uri`, Firebase's own message is "The continue URL must be a valid URL string"; the continue URL's domain also has to be on Authorized domains, the same allow-list as the rest of the flow.
- `web_storage_unsupported`: `auth/web-storage-unsupported`, typically Safari Private Browsing, an in-app browser with tracking protection on, or a browser blocking third-party storage outright.
- `redirect_cancelled_by_user`: `auth/redirect-cancelled-by-user`, an informational, low-severity result: the user closed the consent screen themselves, `getRedirectResult()` just resolves `null`, and it isn't a configuration bug.

Alongside every diagnosis, the tool computes the exact auth handler URL (`https://<authDomain>/__/auth/handler`) and the exact set of hosts that need to be on Authorized domains, and names the provider console page each provider's redirect URI belongs in (Google Cloud Console, Apple Developer, Meta for Developers, GitHub OAuth Apps, Microsoft Entra ID).

## What it does not do

- It does not call Firebase, your app, or any live API. It only compares the values you type in against each other and against Firebase's documented behavior.
- It does not verify your Firebase project config, sign you in, or test the actual redirect against your live Firebase project.
- It does not send, store, or log your configuration anywhere. There is no account, no login, and no payment wall.
- It does not know about auth providers other than what Firebase Authentication wraps (Google, Apple, Facebook, GitHub, Microsoft, and other OAuth/OIDC providers Firebase supports), or about behavior Firebase has changed since this was last updated (see Sources below).

## How it works

Everything runs in your browser. `doctor-firebase.js`, one dependency-free JavaScript file, exports a single pure function, `diagnose(config)`, which the page calls with the values you fill in and renders the result as a plain-language report. Nothing about your configuration is sent anywhere; the only network activity is loading the page's own static assets and anonymous Umami analytics events (see Privacy).

```js
import { diagnose } from './doctor-firebase.js';

diagnose({
  app: {
    pageOrigin: 'https://myapp.vercel.app',
    authDomain: 'my-project.firebaseapp.com',
    authorizedDomains: ['localhost', 'my-project.firebaseapp.com', 'my-project.web.app'],
    method: 'popup',
    hosting: 'vercel',
  },
  provider: { name: 'google' },
});
```

Output (run against the code above):

```json
{
  "status": "fail",
  "summary": "1 blocking mismatch found. Most urgent: \"myapp.vercel.app\" is not on Authentication → Settings → Authorized domains. Firebase blocks signInWithPopup/signInWithRedirect from any origin not on that allow-list with auth/unauthorized-domain.",
  "expected": {
    "authDomain": "my-project.firebaseapp.com",
    "handlerUri": "https://my-project.firebaseapp.com/__/auth/handler",
    "authorizedDomainsNeeded": ["myapp.vercel.app", "my-project.firebaseapp.com"],
    "pageHost": "myapp.vercel.app",
    "crossOrigin": true,
    "providerName": "google",
    "providerLabel": "Google Cloud Console → APIs & Services → Credentials",
    "missingField": null,
    "note": "Firebase's own sign-in helper pages live at https://my-project.firebaseapp.com/__/auth/handler. Every OAuth provider (Google, Apple, Facebook, GitHub, Microsoft) needs that exact URL in its own redirect/callback URI field, and \"my-project.firebaseapp.com\" itself has to be on Authentication → Settings → Authorized domains."
  },
  "problems": [
    {
      "severity": "high",
      "code": "unauthorized_domain",
      "message": "\"myapp.vercel.app\" is not on Authentication → Settings → Authorized domains. Firebase blocks signInWithPopup/signInWithRedirect from any origin not on that allow-list with auth/unauthorized-domain.",
      "path": "app.authorizedDomains",
      "value": "myapp.vercel.app",
      "fix": "Add \"myapp.vercel.app\" in Firebase Console → Authentication → Settings → Authorized domains.",
      "where": "app.authorizedDomains"
    }
  ],
  "fixes": [
    { "title": "Add to Firebase Console → Authentication → Settings → Authorized domains", "value": "myapp.vercel.app", "where": "Authorized domains" }
  ],
  "checklist": [
    "Register \"https://my-project.firebaseapp.com/__/auth/handler\" as the redirect/callback URI in Google Cloud Console → APIs & Services → Credentials.",
    "Confirm these are on Authentication → Settings → Authorized domains: myapp.vercel.app, my-project.firebaseapp.com.",
    "Confirm the authDomain in the firebaseConfig actually deployed matches the one you’re checking here: prod, staging, and localhost builds often carry different values.",
    "If you use signInWithRedirect() across two different origins, plan around third-party cookie blocking now: Chrome, Firefox, and Safari all restrict it by default in current releases.",
    "Firebase's own sign-in helper pages live at https://my-project.firebaseapp.com/__/auth/handler. Every OAuth provider (Google, Apple, Facebook, GitHub, Microsoft) needs that exact URL in its own redirect/callback URI field, and \"my-project.firebaseapp.com\" itself has to be on Authentication → Settings → Authorized domains."
  ],
  "disclaimer": "Read-only, client-side analysis of the values you entered. Nothing is verified against your live Firebase project: always confirm in the Firebase console and your provider’s console before shipping. Not affiliated with Google or Firebase."
}
```

The app is deployed to a Vercel preview URL that was never added to Firebase's Authorized domains, a one-line miss that a manual read of `firebaseConfig` alone doesn't catch, because `authDomain` (`my-project.firebaseapp.com`) is a completely different string from the host the browser is actually on (`myapp.vercel.app`).

## Run locally

No build step, no dependencies.

```bash
git clone https://github.com/AndryRoby/firebase-auth-domain-doctor.git
cd firebase-auth-domain-doctor
python -m http.server
# or just open index.html directly in a browser
```

## Tests

```bash
node tests.mjs
```

101 assertions, 101 passed, 0 failed as of this writing.

## Privacy

Everything runs client-side; nothing you type into the form is sent anywhere, ever. Product analytics (page views, "run check" clicked) go to a self-hosted Umami instance with no cookies and no personal data, event name and count only. Joining the "tell me about new tools" email list on the page is entirely optional and separate from using the tool. Full policy: https://arling.sk/privacy/.

## Sources

The rules this tool checks are drawn from:

- Firebase: [signInWithRedirect best practices](https://firebase.google.com/docs/auth/web/redirect-best-practices) (authDomain, the cross-origin iframe mechanism, the five documented workarounds, the browser versions that block third-party storage access)
- Firebase: [Authenticate Using Google Sign-In](https://firebase.google.com/docs/auth/web/google-signin) (signInWithPopup vs. signInWithRedirect, getRedirectResult)
- Firebase: [Admin Authentication API errors](https://firebase.google.com/docs/auth/admin/errors) (auth/invalid-continue-uri and the continue-URL/Authorized-domains relationship)
- Firebase: [Connect a custom domain (Hosting)](https://firebase.google.com/docs/hosting/custom-domain) (how a custom domain is connected to a Hosting site, the mechanism a reverse-proxied authDomain relies on)
- Firebase JS SDK source: [`packages/auth/src/core/errors.ts`](https://github.com/firebase/firebase-js-sdk/blob/master/packages/auth/src/core/errors.ts) (exact error codes and messages: `auth/unauthorized-domain`, `auth/popup-blocked`, `auth/popup-closed-by-user`, `auth/auth-domain-config-required`, `auth/web-storage-unsupported`, `auth/redirect-cancelled-by-user`, `auth/redirect-operation-pending`, `auth/invalid-cordova-configuration`)
- Google Help: [Set a web app's OAuth redirect domains](https://support.google.com/firebase/answer/6400741) (localhost and the project's own hosting domain are whitelisted by default; whitelisting is domain names, not IP addresses; no wildcard support)

## Report a problem

Found an `auth/unauthorized-domain` or redirect-flow cause this tool doesn't catch, or a check that flags something that's actually fine? Open an issue: https://github.com/AndryRoby/firebase-auth-domain-doctor/issues, or write to andrej@arling.sk. Please redact anything sensitive (Firebase project IDs, API keys, real domains) before posting; issues are public.

## License

All rights reserved, see [LICENSE-NOTICE.md](LICENSE-NOTICE.md). Reading the source and learning from it is fine; deploying your own copy of it as a competing product is not.

---

ARLing s. r. o., Bratislava, Slovakia. andrej@arling.sk

Hub (more free tools): https://arling.sk/

Sibling tools:
- Google OAuth redirect_uri_mismatch: https://arling.sk/google-oauth-redirect-doctor/
- Supabase Auth on Expo / React Native: https://arling.sk/expo-supabase-auth-doctor/
- Supabase Auth on the web (Next.js / Vite / SvelteKit): https://arling.sk/supabase-redirect-doctor/
- Supabase Auth on Flutter: https://arling.sk/flutter-supabase-doctor/
- Expo Universal Links / App Links: https://arling.sk/expo-universal-links-doctor/
- SEPA pain.001 for Slovak banks: https://arling.sk/sepa-pain001-doctor/
- BookApp: https://arling.sk/bookapp/
