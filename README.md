# Dopa Drill — English iPad Edition

An unofficial, non-commercial English adaptation of [gear_machine’s Dopa Drill](https://github.com/grmchn/dopa-drill). The original cheerful math game, Dopakichi mascot, music, celebrations, 58 skills, skill tree, review, trophies and collections are preserved.

## Play on iPad

The GitHub Pages project URL is `https://mzbac.github.io/dopa-drill/` after Pages has been enabled and the deployment workflow succeeds.

1. Open the game in Safari.
2. Tap **Share → Add to Home Screen** for an app-style icon.
3. Open it once while online. The **Play on iPad & about this game** panel says when the offline download is ready.
4. Choose **My Level** for a skill check, a grade for a mixed round, or a skill to practice. Tap the number pad to fill the glowing box. Written arithmetic starts at the ones place; fractions ask for the denominator first.

Portrait and landscape layouts support touch. A Home button pauses the round and asks before leaving; returning from another app pauses it too. Sound starts only after an interaction. Settings include sound, volume, reduced motion, round length and progress reset. The original grade groupings follow the original Japanese curriculum sequence, rather than a claim of alignment with a particular English-language school system.

Scores, skills and settings are stored in this browser’s localStorage, with no accounts, ads, analytics or score uploads. Safari and a Home Screen installation may use separate storage. Clearing website data removes progress. Browser storage may be evicted by the operating system. Ordinary website requests are still served by GitHub Pages.

## What runs in Rust

Calculation and non-UI game logic compile to WebAssembly. JavaScript handles the browser, touch input, English text, grids, animation, audio, and browser persistence. The app waits for the Rust engine before enabling play. See [the engine boundary and build notes](docs/RUST-ENGINE.md), `rust/`, and `app/js/math-core.js` for the ABI and source.

WebAssembly is used as an implementation choice; this project does not claim that all work is faster than JavaScript. The current optimization cuts full-question time by about 47% and a complete skill summary by about 78% against the preceding Rust build in paired Node measurements. Per-call overhead and device/browser differences still matter; these are not physical iPad measurements. [Reproducible benchmark results](docs/BENCHMARKS.md) show the costs, including the bridge.

## Run locally

Node.js 20 or newer is needed for tests. No npm packages or network dependencies are required to play the checked-in browser app. Playwright is a development-only dependency for browser regression tests.

```sh
node tools/serve.mjs
# Open http://localhost:4173/dopa-drill/
```

ES modules and WebAssembly require HTTP(S); opening `index.html` as a local file will not work.

## Build and verify

```sh
rustup target add wasm32-unknown-unknown
bash tools/build-wasm.sh
node --test tests/*.test.mjs
node tools/build-pwa.mjs
node tools/check-assets.mjs
npm ci
npx playwright install chromium
npm run test:browser
```

Run `node tools/build-pwa.mjs` after changing any app asset. The generated service worker uses a content-hashed cache, stays within the `/dopa-drill/` scope, and waits for old windows to close before activating an update. Runtime assets are local and cached together, including the WebAssembly engine. The cache makes no request to third-party CDNs.

## GitHub Pages

In **Settings → Pages → Build and deployment**, choose **GitHub Actions** once. Then push to `main` or run **Test and deploy English iPad game** from Actions. The workflow builds the Rust engine, runs correctness checks, creates the offline cache and publishes only `app/`.

No personal access token is required. The deployment job has only `pages: write` and `id-token: write`; source checkout is read-only. Initial Pages setup must be completed by an administrator before the deployment can succeed.

## License and attribution

Original source: Copyright © 2026 gear_machine, MIT License. Original revision: `fdacd5fc8322f251f92ddc07f13ae85ccb2263dd`.

The **Dopa Drill name/logo and Dopakichi character are not MIT-licensed**. The original license allows non-commercial unofficial forks and forbids presenting them as official or using them as branding for another product. This is a non-commercial modified version of the same game. All original license terms and font notices are retained in [`LICENSE`](LICENSE) and `app/fonts/OFL-*.txt`. The user-facing game links the complete license too.

The original Japanese README is preserved at `docs/README-original-ja.md`.
