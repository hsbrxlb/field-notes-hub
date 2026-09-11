# Light Research

Oedro Buddy runs a conversational lighting study with natural model-generated replies, source-linked evidence and saved-answer retry. Uninterpretable answers stay on the current question until understood; participants can explicitly skip, stop, or ask to return later.

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

The selected display face remains throughout the page. User answers use 25px on desktop and 22px on mobile. Choice controls use open rows with visible selected states. The answer field grows with content up to a viewport-aware limit, then scrolls internally. Small visual viewports retain 44px send, skip, and stop controls.
