# Light Research

Hawthorne is the selected typeface. Oedro Buddy runs a conversational lighting study with natural model-generated replies, bounded topic routing, source-linked evidence and saved-answer retry. Prestion and Sorella comparison variants are not included.

This directory contains the complete Next.js application. GitHub Pages publishes the Hub's entry page and screenshot only; it cannot execute these route handlers. The Hub entry opens an existing service at `http://127.0.0.1:54810/` on the visitor's own computer. It is not a cloud API endpoint.

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
