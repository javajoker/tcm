# Security policy

This is a static, client-only web app: there are no accounts, no server that receives answers, no analytics and no cookies ([privacy](docs/privacy.md)). The security surface is
therefore small — the integrity of the shipped files, the strict Content-Security-Policy, the dependencies, and anything that could make the app send, log or expose what a
person typed — but it is taken seriously because what people type is health information.

## Reporting a vulnerability

**Do not open a public issue.** Report privately through GitHub: **Security → Report a vulnerability** on this repository
(<https://github.com/javajoker/tcm/security/advisories/new>).

Please include: what you found, where (route, file or dependency), the steps to reproduce, the app / knowledge-base / engine versions shown in **Settings → Versions**, and what an
attacker could do with it. **Do not include real personal health information**; use made-up answers.

What to expect: an acknowledgement within **3 working days**, an assessment within **7 days**, and a fix or a mitigation plan for confirmed issues in order of severity. You will be
told when it is fixed, and credited in the changelog if you wish.

## What counts

In scope: the app and its build (`apps/web`, `packages/*`, `scripts/`, the CI workflows), the shipped knowledge base files, the deployment headers, and the dependencies we ship.

- **Anything that moves, logs or exposes user input** — a request to another origin, a value in a URL or in the console, birth data persisted without consent — is the most serious class (S1).
- Script injection, a weaker CSP, a source map or dev code in a release build, a tampered knowledge-base chunk that is accepted.
- A vulnerable dependency that is actually reachable.

Out of scope: findings that need a compromised device or browser profile (the data lives in the user's browser by design), missing headers on a development or preview host,
and denial of service against a static host.

## Not security: safety reports

A wrong contraindication, a missing safety notice, a misleading claim or a medical-content error is a **safety report**, not a vulnerability. Use the *Safety report* issue template
(it is public by design, so include the item id and versions but **no personal health information**). Severity classes and response times are in the
[safety policy §8](docs/safety-policy.md).

## Supported versions

The project is pre-release. Only the latest commit on `main` and, once published, the latest release are supported.

## How the project protects itself

CI checks every build output ([`scripts/check-release.ts`](scripts/check-release.ts)): strict CSP, no inline script, no source maps, no dev profile, no doses or restricted content,
hashed knowledge-base chunks. Privacy tests (`apps/web/test/privacy.test.tsx`) check that no request is made and no value leaks. Dependency and licence checks are part of the
dependency-hygiene job ([release process](docs/release-process.md)).
