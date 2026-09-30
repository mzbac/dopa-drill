# Engine performance: measured before and after

Measured on 2026-09-30, Linux x64, Node 24.19.0, Intel Xeon Platinum 8573C. This is a shared development host, **not an iPad**. The baseline is the complete deployed Rust implementation at commit `467be6948812ffbe21f8cf374bcbfbea7d1008c8`, including every generator, numeric column model and game rule. Both sides use identical English grid builders and seeded workloads. No calculation moved back to JavaScript.

## Paired warm-throughput results

Separate old/new WASM instances and JS modules run in the same Node process. Each receives the same seed or populated progress state. Three complete warm-up passes precede nine timed runs; the order alternates old/new then new/old. Values below are median wall-clock time, including all costs named in the row.

| Work measured | Previous Rust build | Optimized Rust build | Reduction |
|---|---:|---:|---:|
| Full question: Rust generation, bridge and English JS grid | 29.082 µs/question | 15.306 µs/question | 47.4% |
| All 58 skill states, stars and mastery ratios | 1.680 ms/summary | 0.362 ms/summary | 78.4% |
| Complete daily-quest planning and bridge | 24.707 µs/plan | 23.277 µs/plan | 5.8% |

Question runs cycle through all 58 skills, 11,600 questions per sample. Skill-summary runs contain 500 complete summaries per sample; quest runs contain 4,000 plans. Raw samples, artifact hashes and exact methodology are in [performance-results.json](performance-results.json). The quest samples overlap substantially; treat that small difference as inconclusive, rather than a reliable gameplay gain.

This does **not** mean the whole game is 47% faster. It measures question preparation. UI rendering, audio, animation and deliberate inter-question pauses are separate. The full Rust path remains slower than the earlier upstream-JavaScript generation benchmark, which measured about 4.9 µs/question and has different presentation allocation sizes. Rust is an implementation choice, not an automatic speed advantage.

## What changed

Initial profiling found approximately 16 µs/question in Rust generation/serialization, 24 µs including the bridge, and 1.4 µs in JS layout alone. Those separate profiling samples locate the bottleneck; they are not subtraction-compatible measurements or the final paired comparison.

- Typed question/column serializers avoid allocating JSON maps and field-name strings for every answer digit; the ten digit strings are shared
- The generation ABI uses the supplied curriculum index directly instead of searching all skill IDs again
- Input JSON is encoded straight into reusable WASM memory, avoiding a temporary byte array, copy and allocation/free pair
- One fresh skill snapshot replaces the skill tree's 364 individual state/star/ratio calls; its separate rust/retention query remains
- Title and collection totals batch cosmetic eligibility checks
- Quest context sends the needed summaries, omitting unused copies of saved skill histories and question grids
- Browser initialization uses streaming compilation on WASM-MIME hosts, while preserving byte loading on generic-MIME servers

All 58 generators, carry/borrow/partial-product/long-division models, scoring, mastery, adaptive planning, quests and rewards still run in Rust. A further 29,000 deterministic fixtures compare complete recipes and RNG state with the deployed pre-optimization engine, on top of the existing upstream arithmetic and progress/reward parity suites.

## Initialization and size

Fresh-process Node initialization was measured seven times for each artifact, with bytes loaded before timing. Median compile/instantiate time was **3.35 ms before** and **3.38 ms after**. Samples overlap widely: there is no demonstrated cold-start improvement here. This excludes downloading and browser page startup.

The WASM file increased from 496,891 to 506,458 bytes; gzip size increased from 157,730 to 159,783 bytes, about 2 KB. The size-optimized release profile is retained. A speed-optimized compiler-profile experiment enlarged the artifact and was not selected.

## Browser measurements and correctness

`tools/bench-browser.mjs` measures baseline and optimized apps with the same Chromium runner and seeded saved state. Its raw JSON and Actions summary distinguish browser startup, synchronous event-handler work and waiting for a rendered frame. Local HTTP and Chromium touch emulation are not measurements of GitHub Pages download speed, physical iPad input latency, or Safari.

The publication workflow runs the complete touch/gameplay/replay/offline regression before deployment. This development container cannot launch Chromium because its sandbox denies a required socket; browser tests run in GitHub Actions. Do not treat unrun browser stages as passed. Re-measure on a physical target iPad before making an iPad-specific performance claim.

## Reproduce

Create an untouched baseline checkout or extract the baseline commit outside the working checkout, then run:

```sh
bash tools/build-wasm.sh
node --test tests/*.test.mjs
node tools/bench-performance.mjs /path/to/baseline results.json
node tools/bench-browser.mjs /path/to/baseline browser-results.json
```

Both scripts retain raw samples and intentionally have no speed pass/fail thresholds. Shared CPU load and browser scheduling can move absolute timings. The benchmark input is the complete baseline app, not an old WASM artifact paired with a new, incompatible bridge.

For the older upstream comparison and numerical microbenchmarks, `node tools/bench-core.mjs` remains available. [Historical results](benchmark-results.json) preserve the earlier unpaired measurements and their limitations; they are not the current before/after baseline.
