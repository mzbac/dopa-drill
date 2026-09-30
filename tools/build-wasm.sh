#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
(cd rust && rustup toolchain install 1.98.1 --profile minimal --component rustfmt,clippy --target wasm32-unknown-unknown && cargo build --release --target wasm32-unknown-unknown --locked)
mkdir -p app/wasm
cp rust/target/wasm32-unknown-unknown/release/dopa_core.wasm app/wasm/dopa_core.wasm
printf 'Built Rust/WASM engine: '
wc -c < app/wasm/dopa_core.wasm
