# Launch posts — Firebase Auth Domain Doctor

Research date: 2026-09-06. Tool: https://arling.sk/firebase-auth-domain-doctor/

Method: GitHub REST search API (`api.github.com/search/issues`) for the tool's
own error codes and messages (`auth/unauthorized-domain`, "missing initial
state", `authDomain` + third-party cookies), plus repo-scoped searches on
`firebase/firebase-js-sdk`. Per the brief, Stack Overflow was not queried.
Every thread below was actually fetched via the GitHub API; nothing here is
invented. Dates are UTC, from each thread's own API data.

**Rule applied:** closed issue with its last activity more than 12 months ago
→ skip. Open issues are judged on relevance and whether a reply would look
welcome (a live troubleshooting thread with a real, currently-stuck human) vs.
unwelcome (an internal task tracker, an AI-agent-coordinator log, or a case
already solved in-thread).

---

## 1. Findings

### 1.1 Broad search: `"auth/unauthorized-domain" is:issue`, sorted by updated

Dominated by small repos where GitHub Issues is used as an internal,
often AI-agent-driven task tracker rather than a public Q&A thread —
several rows below are literally coordinator/reviewer bot comments
("Coordinator assignment briefing", "exit code 0", "duration 3 minutes 51
seconds") rather than a human asking for help. Posting a tool link into one
of those reads as spam, not help.

| Repo / issue | State | Last activity (UTC) | Recommendation |
|---|---|---|---|
| [conteit/sudoku-coach#84](https://github.com/conteit/sudoku-coach/issues/84) — "Blocker: create the Firebase project and enable Google sign-in" | closed | 2026-09-03 | Skip — internal setup checklist item, already closed same day. |
| [jobizzness/bench#52](https://github.com/jobizzness/bench/issues/52) | open | 2026-09-03 | Skip — internal identity-verification task, not a public question. |
| [JDonaghy/natal-chart#51](https://github.com/JDonaghy/natal-chart/issues/51) — "Sign-in broken on Cloudflare Pages: Firebase auth/unauthorized-domain" | closed | 2026-08-24 | **Skip** — verified in full: root cause (Firebase's Authorized domains list still had the old GitHub Pages domain after a Cloudflare Pages migration) was correctly self-diagnosed, and every comment on the thread is an automated coordinator/reviewer log ("Coordinator completion notice. Exit code 0, duration 2 minutes 21 seconds"), not a human exchange. Good confirmation of the rule this tool checks, not a place to reply. |
| [JDonaghy/natal-chart#53](https://github.com/JDonaghy/natal-chart/issues/53) — "ARCHITECTURE.md wrongly says Firebase can't authorize Pages preview URLs" | closed | 2026-08-24 | Skip — same repo/pattern as #51, a same-day internal doc-fix follow-up. |
| [uditt490-pixel/YuvaHub#160](https://github.com/uditt490-pixel/YuvaHub/issues/160) | open | 2026-08-28 | Skip — about bookmarks not appearing, unrelated to domain authorization despite surfacing in the search. |
| [ipetropolsky/navy#64](https://github.com/ipetropolsky/navy/issues/64) — "Firebase 2: вход через аккаунт и правила безопасности" | closed | 2026-08-27 | Skip — Russian-language internal feature-build issue for the repo's own security-rules work, not a troubleshooting question. |
| [irfanrafeek/imposter#75](https://github.com/irfanrafeek/imposter/issues/75) / [#74](https://github.com/irfanrafeek/imposter/issues/74) | open | 2026-08-27 | Skip — internal error-handling/instrumentation backlog items, 0 comments, no question to answer. |
| [krlybnd/squint-genai#4](https://github.com/krlybnd/squint-genai/issues/4) | open | 2026-08-26 | Skip — a feature-request backlog item ("Global error provider"), not a live bug report. |
| [KinetiqDev/system-cloie#541](https://github.com/KinetiqDev/system-cloie/issues/541) | closed | 2026-08-26 | Skip — closed, internal Supabase RLS task. |
| [firmeen/FLOW#40](https://github.com/firmeen/FLOW/issues/40) | open | 2026-08-21 | Skip — internal architecture-planning issue ("pre-authentication data boundary"), not a troubleshooting thread. |

### 1.2 Broad search: `"missing initial state" firebase is:issue`

| Repo / issue | State | Last activity (UTC) | Recommendation |
|---|---|---|---|
| [firebase/firebase-ios-sdk#16277](https://github.com/firebase/firebase-ios-sdk/issues/16277) — "Firebase Auth with Microsoft (Entra AD) - Login not possible" | open, 6 comments | 2026-08-07 | Skip — iOS-native SDK issue (Swift), not the JS/web `authDomain`/redirect case this tool diagnoses; a reply here would be off-topic advice from a web tool. |
| [capawesome-team/capacitor-firebase#33](https://github.com/capawesome-team/capacitor-firebase/issues/33) — "Error: `Unable to process request due to missing initial state.`" | **open**, 14 comments | 2026-07-15 | **Post** (see §2.3). Open since November 2021, "help wanted" label, no maintainer fix, and a fresh independent report landed 2026-07-15 with the maintainer not yet having replied. Directly in scope: this tool's own audience list names Capacitor/webviews explicitly. |
| all other rows (Expensify/App, skerishKang/*, pat792/set-picks, brim-borium/spotify_sdk, CadenaWizard/signer_app, Run-MPRC/*) | mixed | various | Skip — verified each is either closed >12 months, an unrelated app-specific bug (Spotify SDK tokens, wallet key entropy, admin product bindings), or another AI-agent-coordinator log with no real "missing initial state" content beyond the search snippet matching incidentally. |

### 1.3 Repo-scoped: `firebase/firebase-js-sdk`

| Issue | State | Last activity | Recommendation |
|---|---|---|---|
| [#7342 — "In Firebase Auth, using 'Redirect Best Practices' prevents testing with localhost because it always uses HTTPS"](https://github.com/firebase/firebase-js-sdk/issues/7342) | **open**, 40 comments | 2026-05-19 (latest comment verified 2025-12-07) | **Post** (see §2.1). The single most on-topic live thread found: `authDomain`/redirect-best-practices friction, open 3+ years, actively commented through late 2025 ("It really is painful to see such a basic thing is on pending to fix mode since ages" — Nov 2025), no maintainer fix landed. |
| [#8040 — "signInWithRedirect question"](https://github.com/firebase/firebase-js-sdk/issues/8040) | **open**, 0 comments | 2026-01-30 | **Post** (see §2.2). Zero replies on a reverse-proxy setup (redirect-best-practices Option 3) that halts at the auth handler — exactly the `custom_auth_domain_missing_proxy` case this tool flags. |
| [#3115 — getRedirectResult() always returns NULL](https://github.com/firebase/firebase-js-sdk/issues/3115) | closed | 2025-10-14 | Skip — closed, and superseded in relevance by the two open threads above covering the same root cause more specifically. |
| [#4256 — "Unable to process request due to missing initial state."](https://github.com/firebase/firebase-js-sdk/issues/4256) | closed | 2025-10-14 | Skip — closed; 275 comments already, thoroughly discussed, a new comment would add nothing. Used as a source for the exact error message text in this tool's docs instead. |
| [#8652 — getRedirectResult always null despite success](https://github.com/firebase/firebase-js-sdk/issues/8652) | closed | 2025-02-09 | Skip — closed >12 months from today. |
| [#8329 — "signInWithRedirect doesn't work on Chrome 115+, Safari 16.1+, and Firefox 109+"](https://github.com/firebase/firebase-js-sdk/issues/8329) | open, 0 comments | 2024-06-21 | Skip — technically open, but zero engagement for over 2 years; effectively dead, same pattern as issues the sibling tools' research skipped for the same reason. |
| [#5262](https://github.com/firebase/firebase-js-sdk/issues/5262), [#3004](https://github.com/firebase/firebase-js-sdk/issues/3004), [#6801](https://github.com/firebase/firebase-js-sdk/issues/6801), [#5913](https://github.com/firebase/firebase-js-sdk/issues/5913), [#6337](https://github.com/firebase/firebase-js-sdk/issues/6337), [#2284](https://github.com/firebase/firebase-js-sdk/issues/2284), [#631](https://github.com/firebase/firebase-js-sdk/issues/631), [#865](https://github.com/firebase/firebase-js-sdk/issues/865) | all closed | 2019–2024 | Skip — closed, all well over 12 months old. |

### 1.4 Vercel-adjacent search: `"unauthorized-domain" vercel is:issue`

No genuinely new, on-topic, open, human-authored thread beyond what's already
listed above — results were either the same AI-coordinator-log pattern seen
in §1.1 (novanexus-ai, edebatte-org), unrelated CORS/infra issues that
matched incidentally (Project_Baldin, mcpdoc, boomtick), or a Firebase→
Supabase migration issue (fluffygeek/LiveOakv3, closed) rather than a
domain-authorization question. All skipped.

**Stack Overflow:** not queried, per this launch's own instructions (GitHub
issue search only for this tool).

---

## 2. Drafted replies (first person, as Andrej)

Post these only where the thread is still open for replies. Each ends with
exactly one sentence pointing at the tool.

### 2.1 → https://github.com/firebase/firebase-js-sdk/issues/7342

> Chiming in since this keeps coming up: the HTTPS-on-localhost behavior isn't arbitrary, it falls straight out of how `getHandlerBase()` is used. `authDomain` defaults to `<project-id>.firebaseapp.com`, and the whole redirect flow depends on a cross-origin iframe + storage access between your app's origin and that domain — which browsers only grant to a secure (HTTPS) context now that Safari/Firefox/Chrome all gate cross-site storage access behind it. Forcing `https://localhost` isn't the SDK being difficult, it's trying to keep local dev on the same code path as prod instead of quietly working today and breaking the moment a browser tightens third-party storage further.
>
> Two things that get people unstuck faster than waiting on this issue:
> 1. `signInWithPopup()` for local dev, `signInWithRedirect()` in prod (several people upthread already landed on this) — popup doesn't touch that cross-origin iframe at all, so it's immune to both the HTTPS requirement and the third-party-cookie blocking that's the same root cause as `auth/missing-initial-state`.
> 2. If you specifically need to test the redirect path locally, a local HTTPS dev server (`localhost` cert via mkcert, or Vite's `--https` flag) sidesteps this without touching `authDomain` at all.
>
> I put together a free tool that walks through exactly this authDomain/origin relationship and tells you which of Firebase's five documented workarounds actually applies to your setup: https://arling.sk/firebase-auth-domain-doctor/

### 2.2 → https://github.com/firebase/firebase-js-sdk/issues/8040

> The proxy stalling at the handler and never reaching Google's page is almost always because only `/__/auth/handler` itself got proxied, not everything under it. `handler.js` pulls in `experiments.js` and further requests for `/__/auth/iframe`, `iframe.js`, `/__/auth/links`, `links.js`, and `/__/firebase/init.json` — all resolved relative to whatever origin `authDomain` currently is. If your nginx/rewrite rule only matches the single `/__/auth/handler` path, those follow-up requests either 404 on your domain or quietly resolve back against `project.firebaseapp.com`, and the flow just stops instead of erroring cleanly.
>
> Worth double-checking: the rule needs to match `/__/auth/**` (every sub-path) and `/__/firebase/init.json` too, and it has to be a transparent proxy/rewrite, not a 302 redirect — a redirect changes the origin the browser thinks it's on, which defeats the point.
>
> I built a free tool that checks this exact authDomain-vs-reverse-proxy setup and lists precisely which paths need to be forwarded for your case: https://arling.sk/firebase-auth-domain-doctor/

### 2.3 → https://github.com/capawesome-team/capacitor-firebase/issues/33

> For anyone landing here from the web SDK side rather than this plugin specifically: this is the same root cause as `firebase/firebase-js-sdk#4256` on plain web — Firebase's redirect flow writes pending sign-in state before leaving, then reads it back through a cross-origin iframe to `authDomain` when the user returns. Any environment that partitions or blocks that cross-origin storage access (iOS WKWebView's Intelligent Tracking Prevention, Firefox's Enhanced Tracking Protection on Android, or — per the report just above — Safari on first launch before a user gesture reopens it) breaks that read and throws exactly this "missing initial state" message.
>
> On plain web, Firebase's own fix is pointing `authDomain` at a domain that's same-origin with the app (via a reverse proxy to `/__/auth/**`) or switching to `signInWithPopup()`. Neither one maps cleanly onto a packaged native shell the way it does a website, which is probably why this has stayed open since 2021 — the actual fix has to happen at the plugin level (opening the OAuth screen in the system browser via `@capacitor/browser` so it isn't subject to the WebView's own storage partitioning, as suggested upthread, rather than anything configurable from the JS side).
>
> If it's useful for narrowing down which of Firebase's documented options applies to a given setup, I built a free client-side tool for exactly this authDomain/origin relationship: https://arling.sk/firebase-auth-domain-doctor/

---

## 3. Facts for Andrej's own post (8 points, verifiable)

1. Firebase's own error for a page origin that isn't authorized is `auth/unauthorized-domain`: "This domain is not authorized for OAuth operations for your Firebase project." (source: `firebase-js-sdk/packages/auth/src/core/errors.ts`)
2. Only `localhost` and the project's own `*.firebaseapp.com`/`*.web.app` domains are pre-authorized by default. Every other host — a custom domain, a Vercel/Netlify deployment, a raw IP — needs manual addition to Authentication → Settings → Authorized domains, and connecting a custom domain to Firebase Hosting does not do this automatically (source: Firebase's "Connect a custom domain" docs say nothing about Auth; confirmed separately by Google's own "Set a web app's OAuth redirect domains" help article).
3. Authorized domains has no wildcard support and doesn't accept IP addresses at all — only exact hostnames. Every Vercel/Netlify preview subdomain needs its own entry.
4. Since Safari 16.1, Firefox 109, and Chrome M115 (mandatory since 24 June 2024), `signInWithRedirect()` breaks whenever `authDomain` is a different origin from the app itself, because the flow relies on a cross-origin iframe that these browsers now block by default. The visible symptom is often not `auth/unauthorized-domain` at all, it's "Unable to process request due to missing initial state," or the flow just silently fails to return the user.
5. Firebase documents 5 fixes for that; the least-code one is pointing `authDomain` at the app's own domain via a reverse proxy that forwards `/__/auth/**` to `<project-id>.firebaseapp.com` — a plain redirect (302) instead of a transparent proxy does not work, since it changes the origin the browser sees.
6. Switching `authDomain` to a custom domain creates a second, separate registration step: every OAuth provider (Google Cloud Console, Apple Developer, Meta, GitHub, Microsoft Entra ID) needs `https://<your-domain>/__/auth/handler` added to its own redirect/callback URI field — missing this is a distinct failure from the Authorized domains one.
7. This isn't a solved problem even inside Google: a Firebase JS SDK GitHub issue about the `authDomain`/HTTPS/redirect conflict, opened June 2023, is still open with 40 comments as of this writing, including a November 2025 comment calling login "P1... on pending to fix mode since ages."
8. It also hits native shells: a Capacitor Firebase plugin issue about this exact "missing initial state" error has been open since November 2021, labeled "help wanted," with a fresh independent report as recently as July 2026.

---

## 4. Article outline

**Working title:** *Firebase's `auth/unauthorized-domain` vs. "missing initial state": two different errors, two different fixes*

1. **The hook** — these two get conflated constantly, but they're triggered by unrelated things: one is a missing Console entry, the other is a browser privacy feature nobody enabled on purpose.
2. **What Firebase actually checks** — Authentication → Settings → Authorized domains, the pre-authorized defaults (`localhost`, `*.firebaseapp.com`, `*.web.app`), no wildcards, no IP addresses (cite Firebase Help + the JS SDK error source).
3. **Case 1: `auth/unauthorized-domain`** — the exact trigger (page origin's host isn't on the list), and the two places people forget it: connecting a custom domain to Hosting (a separate setting from authorizing it for Auth), and preview-deploy subdomains on Vercel/Netlify.
4. **Case 2: the third-party-cookie wall** — since Safari 16.1 / Firefox 109 / Chrome 115 (mandatory since 24 June 2024), `signInWithRedirect()` with `authDomain` on a different origin than the app breaks via a cross-origin iframe getting blocked; quote the "missing initial state" message and Firebase's five documented options, in order of effort (redirect-best-practices doc).
5. **The proxy trap** — Option 1/3's reverse proxy has to forward the entire `/__/auth/**` tree and `/__/firebase/init.json`, not just `/__/auth/handler`, and has to be a transparent proxy, not a redirect — the exact mistake behind a live, unanswered `firebase-js-sdk` issue.
6. **The second registration step** — after switching `authDomain`, each OAuth provider's own console needs `https://<domain>/__/auth/handler` registered too, a step separate from Firebase's own Authorized domains.
7. **Where it also bites: Capacitor/webviews** — `auth/operation-not-supported-in-this-environment` for popups, and the same "missing initial state" symptom via WebView storage partitioning instead of browser third-party-cookie blocking (cite the open capacitor-firebase issue).
8. **A checklist to run by hand** — or the free tool that computes the exact handler URL and Authorized-domains set automatically (link at the end, not before).
9. **Sources** — link every official doc cited above and the two live GitHub issues referenced, so the article holds up to scrutiny.
