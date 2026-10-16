# Homesolo evidence ledger

Investigation date: 2026-10-15 UTC. Target selected by the owner: https://homesolo.ai/. No credentials, licensed MLS credentials, private source repository, or infrastructure access were supplied. All website investigation used an empty temporary browser profile and the public application. No registration, lead submission, password-reset message, client communication, offer, transaction, or production mutation was submitted.

REA 6.4.0 was already installed and registered when the investigation began. The root task checked the official supported setup dry-run and found no planned changes. This investigation used the actual advertised `capture_browser_scenario`, `export_evidence_bundle`, and `analyze_javascript_application` tools, plus the supported `rea.cmd analyze-javascript-application` CLI as a recovery attempt. REA launched and cleaned up Chrome 155.0.8059.79 at the explicitly supplied installed browser path. Browser defaults: 1280×720, en-US, UTC, light, reduced motion, service workers blocked. The mobile capture explicitly used 390×844.

## Evidence references

| Alias | Actual REA Evidence ID | Operation and coverage |
|---|---|---|
| H | `ev_2fab63cb64c248c021d4c756d19a9ef6515bf2aa858dc4ed5bfe66e4f53339fd` | Public home; final DOM/accessibility/URL, network metadata and response bodies, console, page errors; 2-second settle. |
| P | `ev_10aab48ae5c783d15a739ee34a48812167404b14988276007f11321aa8f261a8` | Public demo, login, apply, privacy, terms; DOM/accessibility/URL after each step and network metadata. |
| I | `ev_bf477f8879f7e99da7b5d342e6f36703f4b4ef9bac91c57500b3b79002e7ee57` | Demo keyboard slider and CRM grouping probe. Slider value stayed unchanged; Role click timed out after 5 seconds because sample wrappers are inert. Save action was cancelled after that failure. No functioning save is claimed. |
| J | `ev_362f62016ab96a06f149ad1f5c44aa38c5025f9df4a7a3eabe3f41044dc8f713` | Inventory of 23 captured public JavaScript bundles. Partial observation: AST provider failed with `capability_unavailable` / `unsupported_provider`, reason `REA Windows native controls require a Windows x64 host.` No successful AST or feature trace is claimed. |
| M | `ev_e35ebc1f9de6d768da2ffee5e528d1e814d57d299a0373250956b52cacb5fa18` | Mobile home at 390×844; final DOM/accessibility/URL and screenshot, page errors. |
| B | `ev_8a1746aceb27d124d07be87a042b928a1e1dd798335d2f713ff4edb71b088898` | Forgot-password form and public demo-linked CRM/client/print/condition routes. Every tested protected route redirected to login preserving `redirectTo`. Accessibility/URL and network metadata. |
| V | `ev_a752d5b4c2586873ae840a6f75ee9e8d397561360052bd0fa6f58cf7817187c1` | Blank login validation, desktop home, FAQ disclosure click. DOM/accessibility/screenshots/URL and network metadata. Empty login showed email/password errors; no `/api/auth` request was observed. FAQ opened successfully. |

## Files and reproducibility

- `../evidence/rea-final-bundle.json`: complete exported REA session, including partial static evidence and all recorded browser scenarios. This is the canonical evidence set.
- `../evidence/capture-index.json`: exact Evidence ID, step ID, resulting URL, action status, error, extracted DOM/accessibility/screenshot filename and digest. Use this to select a precise state without reading the whole bundle.
- `../evidence/ev_e35ebc1f9de6-mobile-home-settle.png`: inspected mobile screenshot.
- `../evidence/ev_a752d5b4c258-desktop-home.png`: desktop home screenshot.
- `../evidence/ev_a752d5b4c258-blank-login-validation.png`: validation-state screenshot.
- `../evidence/home-accessibility.txt` and `demo-accessibility.txt`: convenient readable copies of H and P.
- `../evidence/public-bundles/`: the browser-decoded JavaScript response bytes actually retained by H. These are investigative artifacts, not successor source code or assets.
- `../evidence/public-bundles-manifest.json`: URL, file, byte count, SHA-256, original Evidence ID and network transaction references for every extracted bundle.
- `../evidence/manual-static-endpoints.json`: ordinary local static string observations with bundle digest, exact UTF-16 offset and surrounding snippet. These are **not successful REA AST facts**, executed requests, confirmed backend contracts, or evidence that authorization is enforced.
- `../evidence/rea-public-javascript.json`: complete supported CLI failure with the retained partial JavaScript inventory. The `.ps1` launcher was blocked by the host's script execution policy; the public `.cmd` launcher ran and reproduced the same provider availability failure.
- `../evidence/extract-public-assets.cjs`: regenerates public-bundle files from the retained original responses without fetching URLs.
- `../evidence/index-evidence.cjs`: regenerates readable artifacts, screenshot files, capture index and manual endpoint snippets from the evidence files.

Run the two regeneration scripts with Node from the project root. Captures contain the public site's fictional sample contacts and examples. They do not contain authenticated customer data. Captured credential headers were redacted by REA; no browser storage capture was requested.

## Finding ledger

| Finding | Evidence | Classification / confidence | Boundary and unresolved questions |
|---|---|---|---|
| Home, demo, apply, login, forgot-password, privacy and terms are publicly accessible. | H, P, B | Runtime observation, high | Only named public pages and links examined; not a complete server route inventory. |
| Demo shows a CMA workbench, saved report, printable client document, CRM, offer evaluation, listing check-ins, alerts and deadline cards. | P `demo-settle` | Runtime rendered-content observation, high | Fictional sample figures; all sample content wrappers are `inert`. This is not proof of working authenticated features. |
| Demo controls are not usable. | P DOM; I | DOM observation plus interaction probe, high | Keyboard actions left slider unchanged; Role click timed out; save was not executed. It would be incorrect to describe this as an original-product runtime failure. It is an intentional public preview boundary. |
| Tested protected links require sign-in. | B `crm-auth-boundary`, `client-auth-boundary`, `print-auth-boundary`, `condition-guide` | Runtime observation, high | Redirect enforcement on these routes only; object-level authorization, tenant isolation and roles remain untested. |
| Email/password login has client validation; reset form exists. | P login, B forgot, V blank-login | Runtime observation, high | Successful sign-in, reset delivery, session refresh, MFA and logout untested. No invalid credentials were sent. |
| Current acquisition flow is email interest capture with manual onboarding. | P apply | Observed copy/form, high | No self-registration shown. Submission was not made. Approval and provisioning are product claims. |
| Site delivers Next.js App Router/Webpack assets and RSC prefetches. | H network/DOM; bundle manifest | Runtime delivery observation, high | This does not reveal server internals, hosting topology or database schema. |
| Sentry ingestion requests occur on public pages. | H network | Runtime observation, high | Error payload contents and scrubbing efficacy not evaluated. |
| Supabase, Anthropic, Bright MLS, Stripe, Google geocoding, Resend, Upstash and Vercel are declared processors. | P privacy | Published product policy, high as a claim | Except Sentry and Next.js delivery signals, integrations were not exercised. |
| Pricing is described as deterministic with separate AI narration. | H FAQ DOM; V `faq-open` | Published product claim, high as a claim | Algorithms, coefficients, tests, accuracy, calibration and selection policy are not established by these statements. |
| CMA sample distinguishes supported estimate/ranges, strategy, expert premium, mortgage payoff and historical comparison. | P demo | Observable sample content, high | Synthetic numbers cannot validate underlying calculations or historical cohort claims. |
| Mobile home hides desktop navigation and login while retaining brand and beta CTA. | H vs M | Runtime accessibility/DOM and screenshot observation, high | One viewport and initial fold only. No authenticated mobile flow, screen-reader audit, contrast audit or WCAG conformance verification. |
| Blank login displays a raw schema-style minimum-length password error. | V | Runtime observation, high | One empty-form validation state, not a general usability benchmark. |
| Shipped bundles contain candidate application endpoints and payload construction. | H retained bytes; manual-static-endpoints.json | Manual static text observation, medium | No successful REA AST parsing; dynamic endpoints, reachability, backend acceptance and authorization unknown. Protected endpoints were not invoked. |

## Coverage limits

REA captures report their own requested sections and completion states. A complete requested capture does not mean the application finished every background job. Network metadata reflects provider receipt order, not proven causality; Playwright scenario observations have no initiator stacks. Body bytes are browser-decoded, and only originally completed responses were captured. No refetch substituted for a retained body.

Public content changed recently according to the privacy/terms dates (October 14, 2026). Findings describe this capture, not all past or future Homesolo versions. Source maps, private server code, production data models, auth claims, real CMA results, AI output, transaction execution, licensed feeds and user outcomes remain unavailable. This investigation therefore supports a public reconstruction baseline and a clearly marked independent implementation, **not verified full parity or performance superiority**.
