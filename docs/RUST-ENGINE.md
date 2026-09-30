# Rust/WebAssembly engine

The app initializes one required WebAssembly instance before enabling play. A failed download/compile produces a visible startup error and retry action. There is no JavaScript calculation fallback.

## Boundary

Rust owns:

- All 58 skill generators and original seeded random consumption
- Integer/decimal/fraction calculations, reduction, rounding, ratios and equations
- Written-calculation answer digits, carry/borrow marks, multiplication partial products, and long-division intermediate values
- Legacy fixed-template generation and digit correctness checks
- Scoring curves, combo timing and Dopa accumulation
- Mastery, unlocks, star eligibility, retention/rust, placement, adaptive and grade planning, dependency relocking, and time capsules
- Lifetime statistics, historical migration and improvement comparisons
- Daily quest choice, progress events and once-per-day reward eligibility
- Trophy metrics/threshold evaluation and cosmetic unlock/selection rules
- Monthly score summaries, calendar streaks, Streak Saver eligibility/use, login stickers, and quest-day/crown totals

JavaScript keeps DOM/touch handling, grid geometry and rendering, localized presentation, animation, WebAudio, navigation/round orchestration, clocks, localStorage I/O, and static display/asset catalogs. Calendar timestamps and random inputs are supplied explicitly by the host. Grid builders consume the Rust numeric models; their remaining arithmetic concerns positions, sizes and indexes.

## ABI and performance choices

`app/js/math-core.js` is the only WebAssembly loader/bridge. Simple numerical scoring and digit checks use raw numerical exports. A question is generated in one call, including its column-step model. Other operations accept/return serializable JSON. A reusable output buffer is decoded before the next call; input allocations are always released.

Read-only skill-tree queries send only fields they actually need, avoiding repeated copies of historical question grids. Trophy metrics are evaluated as a batch, avoiding hundreds of per-skill ABI calls. Planning and cosmetic selection request exactly the random draws needed, preserving generic callback streams as well as seeded streams. State reconciliation preserves existing JS object references.

Rust is **not automatically faster than JavaScript**. Arithmetic in this game is small. JSON serialization, WebAssembly crossings, and grid rendering can cost more than the calculation itself. The reproducible benchmark records end-to-end costs and does not use native Rust results as proof of browser speed. See [BENCHMARKS.md](BENCHMARKS.md) for measured results and limitations.

## Build

The build pins Rust 1.98.1 and locks crate dependencies. No wasm-bindgen or browser-side package loader is needed.

```sh
bash tools/build-wasm.sh
node --test tests/*.test.mjs
node tools/build-pwa.mjs
node tools/check-assets.mjs
```

For native validation:

```sh
cd rust
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test --locked
cargo run --release --example bench
```

For WebAssembly plus JavaScript benchmark:

```sh
node tools/bench-core.mjs
```

`app/wasm/dopa_core.wasm` is checked in for a self-contained static app. The CI deployment rebuilds it. `rust/target/` is intentionally excluded. Rust `serde_json` uses insertion-preserving maps to retain saved-data tie ordering.

## Regression evidence

The tests execute the actual checked-in WebAssembly module, not a JavaScript mock. Portable upstream-derived fixtures cover 14,500 seeded generated answers/input sequences and thousands of deterministic progress/planning/statistics snapshots. Original numerical behavior is preserved while English wording and horizontal expression layout may differ. Native tests also cover boundary cases, leap dates, fractional arithmetic, score caps, exact carry/borrow/long-division sequences and state retention.

The upstream JavaScript fixture in `tests/fixtures/original-problems.js.txt` is development-only, used to measure the original implementation. It is not shipped in `app/` and is never a runtime fallback. It retains the original MIT license attribution in the repository's LICENSE.
