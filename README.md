# Bulls Cows API

Cloudflare Workers API for Bulls and Cows, with TypeScript HTTP handling, optional Rust WASM dynamic solving, and C++20 offline tree precomputation.

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
curl -s http://localhost:8787/api/strategies
curl -s http://localhost:8787/api/errors
curl -s -X POST http://localhost:8787/api/feedback -H 'content-type: application/json' -d '{"n":4,"secret":"1234","guess":"1324"}'
curl -s -X POST http://localhost:8787/api/solve/next -H 'content-type: application/json' -d '{"n":4,"mode":"dynamic","strategy":"expected_size","history":[{"guess":"0123","a":1,"b":1}]}'
curl -s -X POST http://localhost:8787/api/solve/next -H 'content-type: application/json' -d '{"n":4,"mode":"dynamic","engine":"wasm","strategy":"minimax_worst_bucket","history":[{"guess":"0123","a":1,"b":1}],"options":{"allowFallback":true,"exactThreshold":3000}}'
curl -s -X POST http://localhost:8787/api/solve/run-tree -H 'content-type: application/json' -d '{"n":4,"secret":"1234","strategy":"optimal"}'
curl -s -X POST http://localhost:8787/api/solve/run-dynamic -H 'content-type: application/json' -d '{"n":4,"secret":"1234","strategy":"expected_size","engine":"wasm","history":[{"guess":"0123","a":0,"b":3}],"options":{"allowFallback":true,"exactThreshold":3000}}'
curl -s -X POST http://localhost:8787/api/human/start -H 'content-type: application/json' -d '{"n":4}'
```

Use the hosted API and documentation site at:

```text
https://bulls-cows-api.lzray.cloud
```

## Modes

`tree` mode follows an offline-generated decision tree from the fixed first guess: `012`, `0123`, `01234`, or `012345`. Strategy is fixed for the whole path.

`dynamic` mode accepts arbitrary valid history, filters the current candidate set, then chooses the next guess. Exact minimax runs only when `remaining<=exactThreshold`; otherwise the API returns `NEED_TREE_OR_APPROX` or falls back if requested.

`/api/solve/run-tree` runs a complete computer simulation against a provided secret using a precomputed tree. It starts from the fixed first guess unless a valid tree-following history is provided.

`/api/solve/run-dynamic` runs a complete computer simulation against a provided secret using dynamic solving. It can continue from already completed guesses by passing `history`; every supplied feedback item is checked against the secret before the simulation continues.

## Dynamic Engines

Dynamic solving supports two execution engines:

```text
js      Default TypeScript path. Stable compatibility path.
wasm    Rust packed hot path. Same strategy semantics, faster for scoring-heavy dynamic calls.
```

Use `engine:"wasm"` on `/api/solve/next` or WebSocket `/ws/solve` `next` payloads. `engine` may also be placed in `options.engine`; top-level `engine` wins.

PVP dynamic computer solving accepts `computerEngine:"js"|"wasm"` or `engine` on start and turn payloads. The selected engine is stored in the encrypted session token and can be overridden later because it does not change the strategy.

Tree mode ignores engine because it reads the precomputed binary tree.

Example dynamic WASM response includes the selected engine in both the top-level data and diagnostics:

```json
{
	"ok":true,
	"data":{
		"n":4,
		"mode":"dynamic",
		"engine":"wasm",
		"strategy":"expected_size",
		"nextGuess":"0145",
		"nextGuessIndex":16,
		"remaining":720,
		"solved":false,
		"diagnostics":{"usedFallback":false,"maxBucket":148,"candidateCount":5040,"engine":"wasm"}
	}
}
```

For n=5 and n=6, exact dynamic scoring can still be expensive. Prefer tree mode for long games or set `allowFallback:true` with a conservative `exactThreshold`.

## Strategies

The bundled `optimal` strategy is a tree-only 4-digit asset converted into the project `BCST` format.

Additional dynamic and tree-generator strategies:

- `expected_size`: Irving 1978 average-case metric; minimizes expected remaining candidate count.
- `feedback_count`: Kooi 2005 partition-count metric; maximizes the number of possible feedback classes.

## WebSocket

Machine solving:

```js
const ws=new WebSocket("wss://bulls-cows-api.lzray.cloud/ws/solve");
ws.onmessage=ev=>console.log(JSON.parse(ev.data));
ws.onopen=()=>ws.send(JSON.stringify({
	id:"next-1",
	type:"next",
	payload:{
		n:4,
		mode:"dynamic",
		engine:"wasm",
		strategy:"expected_size",
		history:[{guess:"0123",a:1,b:1}],
		options:{allowFallback:true,exactThreshold:3000}
	}
}));
```

PVP:

```js
const ws=new WebSocket("wss://bulls-cows-api.lzray.cloud/ws/pvp");
ws.onmessage=ev=>console.log(JSON.parse(ev.data));
ws.onopen=()=>ws.send(JSON.stringify({
	id:"start",
	type:"start",
	payload:{n:4,humanSecret:"1234",computerStrategy:"minimax_worst_bucket",computerMode:"dynamic",computerEngine:"wasm"}
}));
```

For an existing PVP session, a later turn can override only the engine:

```js
ws.send(JSON.stringify({
	id:"turn-2",
	type:"turn",
	payload:{
		engine:"wasm",
		humanGuess:"5678",
		computerFeedback:{a:0,b:3}
	}
}));
```

## Tests

```sh
pnpm -C apps/worker test
cargo test --manifest-path crates/core/Cargo.toml
cmake --build build/precompute --config Release
ctest --test-dir build/precompute
```
