# OEDRO AI Research for Drivers

## Five-owner pilot (2026-09-27)

The active study now asks eight text-only topics: an actual after-dark task, a specific visibility outcome, the owner's existing-light criterion, a hypothetical switchable near-wide/farther-forward beam, evidence needed to judge its lens-shaped beams, practical barriers, an exploratory total cost, and one change. The concept is not a performance or launch claim. English, Simplified Chinese and Spanish have reviewed authored questions; the participant chooses one of those languages on the consent screen. The study records participant provenance, explicit consent, a 30-day retention policy, and no automatic reward. Recruitment and any promotional material require separate review and verified contact permissions.

Existing `fixture-3.5-natural-buddy` sessions retain their exact original study snapshot, questions and seven-topic progress through `/legacy`. The root page detects an active legacy session on the same browser and returns it to that route. The old synthetic fixture and its price-tier regressions remain under `study/legacy-fixture-3.5.json`; the active manifest is `study/study.json`. The optional isolated database test `SURVEY_MIGRATION_DB=1 AI_PROVIDER=mock npm test -- tests/participant-migration-db.test.ts` verifies continuation after the upgrade.

The production URL is still a free Render service. The separate English invitation landing page and channel copy are review-only local artifacts, not deployed from this repository. Do not count local or synthetic acceptance sessions toward the five real interviews.

Oedro Buddy runs a conversational lighting study with natural model-generated replies, source-linked evidence and saved-answer retry. Questions cannot be skipped: both the API and moderator enforce this, including typed skip requests. Participants can stop at any time; the stopped screen retains export and deletion controls. The header uses the official OEDRO logo. Background motion is disabled rather than keeping an Options menu.

This directory contains the complete Next.js application. GitHub Pages publishes the Hub's entry page and screenshot only; it cannot execute these route handlers. The Hub entry opens `https://oedro-light-research.onrender.com/`, hosted on Render Free in Singapore with Neon Free PostgreSQL. It does not depend on a local Mac.

## Run the application

Use a supported Node.js version and PostgreSQL. Copy `.env.example` to `.env.local` and provide your own server-side database connection and DeepSeek key. Set `DEEPSEEK_KEYCHAIN_SERVICE` explicitly to use a macOS Keychain item when an environment key is not supplied. No credentials belong in Git or client code.

```sh
npm ci
npm run build -- --webpack
npm run start -- --hostname 127.0.0.1 --port 54810
```

The server creates the required tables when first used. Stop the foreground server with Ctrl+C; stopping does not delete records. Explicit participant deletion is implemented through the application API.

## Verify

```sh
npm run typecheck
npm test
npm run lint
npm run build -- --webpack
```

Database and real-provider suites are opt-in and require isolated test infrastructure. Historical local export files are not included. Portable price-outcome regression uses synthetic data, preserving none versus not_sure and raw evidence. The earlier machine-specific real-replay test remains in the local development evidence rather than the public repository.

The first question is canonical English; subsequent replies follow substantive participant language. Model wording is checked for safety, repetition and declared topic/field scope. When the server selects a different move, one bounded wording generation may be requested. It cannot rewrite facts or consume budgets twice. Invalid wording returns an explicit saved-answer retry state, never a fixed conversational substitute.

The selected OTF and generated background are served locally from `public/`. Chinese and unsupported glyphs use a system serif fallback. New deployments must use their own appropriate asset rights and operational settings.

The export and retention scripts require an explicit `DATABASE_URL`. With a configured `.env.local`, run them using `node --env-file=.env.local scripts/export-sessions.mjs` or `node --env-file=.env.local scripts/manage-session-data.mjs`; inspect their usage before selecting records.

## Cloud test hosting

The repository root `render.yaml` defines one free Node web service in Singapore. It builds this subdirectory using `npm ci` and the existing webpack build, then listens on Render's assigned `PORT` on all interfaces. `/api/health` is a liveness check and never calls the model or writes an interview.

Supply `DATABASE_URL` from a Neon project and `DEEPSEEK_API_KEY` through Render's secret environment settings. Use the Neon connection string with TLS enabled; do not commit either value. The existing schema initializer creates tables on first use. A new cloud database starts without local interview records.

The cloud service passed a real four-turn conversation, saved-session retrieval, and pause check on 2026-09-11. Uninterpretable answers stayed on the same question; a meaningful answer advanced the interview. Free Render services sleep when idle and can take time to wake.

Render service: `srv-dahsmf142hec73abns4g`. Neon project: `little-wind-27223557`. The service uses the public Git repository on `main`; deploy subsequent app changes from the Render dashboard. Account login uses GitHub.

## Reading and input

The selected display face remains throughout the page. User answers use 25px on desktop and 22px on mobile. Choice controls use open rows with visible selected states. The answer field grows with content up to a viewport-aware limit, then scrolls internally. Small visual viewports retain 44px send and stop controls.

`public/oedro-logo.png` is the unmodified transparent 320×96 logo verified against the OEDRO homepage, copied from the Hub's `assets/brand/oedro-logo-official.png`. Its source is recorded with the shared brand asset. This is not an AI-redrawn mark.

2026-09-14 local verification: typecheck, lint, webpack production build, and 243 deterministic tests passed; 40 database/provider opt-in tests were not run. Mocked-browser send and stop passed at 1440×900 and 390×844 with no horizontal overflow. Forged model actions, legacy API skip requests, and typed skip/refusal cannot bypass the unanswered-question gate. These checks created no production interview and do not establish real-provider or cloud deployment acceptance for this revision.

## Standing question clarity and recovery contract

Every new topic and every revision must review main questions, follow-ups, clarifications, choices and placeholders in every authored language. Name the concrete object, requested fact and relevant time/event; preserve units, conditions, negation and neutral meaning in translation. Use natural everyday wording in dynamically selected languages too. A misunderstood question needs a more concrete explanation of the missing detail, not a longer paraphrase or automatic advancement. Unknown, no need and no experience remain valid answers. Authored wording states scope; the model phrases the conversation naturally.

Objective category examples require an explicitly reviewed `clarificationStyle: objective_categories` field and a participant-requested clarification. They may explain a category in a declarative sentence before one open question. They cannot suggest opinions or buying reasons, force selection among the examples, assume an answer, or bypass privacy and leading-question checks. Ordinary answers and gibberish do not enable this exception. Field-specific repairs retain their exact field; legacy sessions infer it only from one unambiguous outstanding field.

The submitted composer clears immediately while the original request remains available for idempotent saved-answer retry, including after reload. Definite unsaved rejections restore the draft. The wording pass cannot change evidence or routing; it receives one server-selected task and structured rejection feedback. Diagnostics store fixed rejection codes, not participant or provider text.

Validation for the clarity revision: deterministic regressions plus real synthetic provider samples cover all seven topics and repeated misunderstanding in English, Simplified Chinese and Spanish. The optional command is `SURVEY_REAL_CLARITY=1 AI_PROVIDER=deepseek npm test -- tests/clarity-real.test.ts` with a server-side credential supplied separately. Inspect the ignored `output/clarity-real.json` wording as well as pass counts. Other dynamically generated languages follow the same prompt contract but are not established as individually reviewed by these three-language samples.
