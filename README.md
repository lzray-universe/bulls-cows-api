# Bulls Cows API

Cloudflare Workers API for Bulls and Cows , with TypeScript HTTP handling, Rust WASM core logic, and C++20 offline tree precomputation.

## Directory

```text
bulls-cows-api/
	apps/worker/              TypeScript Worker API
	crates/core/              pure Rust candidate, feedback, filtering, dynamic solver
	crates/worker_wasm/       wasm-bindgen wrapper
	tools/precompute-cpp/     deterministic C++20 asset generator
	tools/asset-inspect/      manifest/tree inspection helper
	spec/                     API and binary format specs
```

## Install

```sh
pnpm install
pnpm build
```

## Build Rust WASM

```sh
pnpm build:wasm
```

## Build C++ Precompute Tool

```sh
cmake -S tools/precompute-cpp -B build/precompute -DCMAKE_BUILD_TYPE=Release
cmake --build build/precompute --config Release
```

## Generate Assets

```sh
./build/precompute/precompute --all --strategies first_remaining,minimax_worst_bucket --out apps/worker/public/assets/bc/v1
```

To generate only candidate codebooks first:

```sh
./build/precompute/precompute --all --candidates-only --out apps/worker/public/assets/bc/v1
```

For large jobs:

```sh
./build/precompute/precompute --n 6 --strategy minimax_worst_bucket --probe-space candidates --approx-sample 8192 --threads 16 --out apps/worker/public/assets/bc/v1
```

Every tree part is sliced below 25 MiB. `n=6` exact minimax is expensive; use precomputed tree assets for production or enable deterministic approximation in the generator.

## Local Run

```sh
pnpm dev
```

## Deploy

```sh
wrangler secret put SESSION_SECRET
pnpm deploy
```

`SESSION_SECRET` is required for encrypted stateless game tokens. Do not put it in `wrangler.jsonc`.

## API Examples

```sh
curl -s http://localhost:8787/api/meta
curl -s -X POST http://localhost:8787/api/feedback -H 'content-type: application/json' -d '{"n":4,"secret":"1234","guess":"1324"}'
curl -s -X POST http://localhost:8787/api/solve/next -H 'content-type: application/json' -d '{"n":4,"mode":"dynamic","strategy":"first_remaining","history":[{"guess":"0123","a":1,"b":1}]}'
curl -s -X POST http://localhost:8787/api/human/start -H 'content-type: application/json' -d '{"n":4}'
```

## Modes

`tree` mode follows an offline-generated decision tree from the fixed first guess: `012`, `0123`, `01234`, or `012345`. Strategy is fixed for the whole path.

`dynamic` mode accepts arbitrary valid history, filters the current candidate set, then chooses the next guess. Exact minimax runs only when `remaining<=exactThreshold`; otherwise the API returns `NEED_TREE_OR_APPROX` or falls back if requested.

The bundled `optimal` strategy is a tree-only 4-digit asset converted into the project `BCST` format.

## Tests

```sh
pnpm -C apps/worker test
cargo test --manifest-path crates/core/Cargo.toml
cmake --build build/precompute --config Release
ctest --test-dir build/precompute
```
