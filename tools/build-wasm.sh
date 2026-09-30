#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
rustup target add wasm32-unknown-unknown
cargo build --manifest-path rust/Cargo.toml --release --target wasm32-unknown-unknown --locked
mkdir -p app/wasm
cp rust/target/wasm32-unknown-unknown/release/dopa_core.wasm app/wasm/dopa_core.wasm
printf 'Built Rust/WASM engine: '
wc -c < app/wasm/dopa_core.wasm
