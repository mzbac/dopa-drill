# Engine benchmark: measured results, no speedup claim

Measured on 2026-09-30, Linux x64, Node 24.19.0, Intel Xeon Platinum 8573C. This is a shared development host, **not an iPad**. Browser rendering, Safari behavior, touch latency and network download were not benchmarked here.

## Final implementation

Five timed runs after warm-up; values below are median wall-clock microseconds per operation. Question runs contain 29,000 problems cycling through all 58 skills. Tiny numerical operations use 500,000 iterations per run.

| Work measured | Time |
|---|---:|
| Original JavaScript generation + original grid layout | 4.896 µs/question |
| Final Rust/WASM generation, numeric column model, JSON bridge + English JS grid layout | 29.076 µs/question |
| Original JavaScript scoring curve | 0.042 µs/call |
| Rust/WASM scoring curve, raw numerical ABI | 0.098 µs/call |
| Rust/WASM digit validation including bridge | 0.069 µs/call |
| Rust/WASM complete daily-quest planning | 28.831 µs/plan |

**The Rust port is slower than the original JavaScript in these measured end-to-end workloads.** Its roughly 0.029 ms/question cost is small on this machine, but that does not establish iPad performance. Native Rust's recipe construction plus JSON serialization measured 11.854 µs/recipe; it excludes JS layout and is not evidence of browser speed.

The final WASM file is 496,891 bytes (157,730 bytes with gzip). Instantiating already-loaded bytes measured 3.242 ms in Node; that excludes downloading them.

## Overhead reductions

The final port returns an entire question, including all carry/borrow/partial-product/long-division values, in one ABI call. Score/digit APIs use numerical exports. Skill queries send only relevant fields; trophy metrics are batched. The output buffer is reused and recipe/result wrappers move values rather than copying complete JSON trees.

Before that final buffer/copy reduction, the same full-column Rust/WASM path measured 52.232 µs/question; afterward it measured 29.076 µs/question. These are separate runs on a shared host, so treat the difference as directional evidence rather than a stable percentage gain. The original-JS baseline also varied between runs (3.171–4.896 µs/question). Neither Rust measurement beat JavaScript.

The baseline retains the original Japanese presentation, while the port uses English strings and horizontal layouts. Numerical problems and input sequences match through deterministic fixtures, but complete presentation allocation sizes are not identical.

## Reproduce

```sh
bash tools/build-wasm.sh
node tools/bench-core.mjs results.json
(cd rust && cargo run --release --example bench)
```

For a different compatible WASM artifact:

```sh
DOPA_WASM_PATH=/absolute/path/to/dopa_core.wasm node tools/bench-core.mjs
```

See [raw results](benchmark-results.json) for counts, hardware, initialization times and both measured runs. Tests should gate correctness; these timings intentionally have no pass/fail thresholds. Re-measure on a physical target iPad before claiming a performance benefit.
