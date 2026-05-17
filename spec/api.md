# API

All API responses use:

```json
{"ok":true,"data":{}}
```

Errors use:

```json
{"ok":false,"error":{"code":"BAD_REQUEST","message":"...","details":null}}
```

## GET /api/meta

Returns supported lengths, strategies, fixed first guesses, and the asset manifest summary.

Response data includes:

```json
{
	"version":"0.1.0",
	"n":[3,4,5,6],
	"engines":["js","wasm"],
	"defaultFirstGuess":{"3":"012","4":"0123","5":"01234","6":"012345"},
	"strategies":[],
	"assetManifest":{}
}
```

## GET /api/strategies

Returns dynamic engines, strategy ids, mode support, and short descriptions.

```json
{
	"engines":["js","wasm"],
	"strategies":[
		{"name":"expected_size","id":3,"dynamic":true,"tree":true,"desc":"Irving 1978: minimize expected remaining set size"}
	]
}
```

## GET /api/errors

Returns stable API error codes and short descriptions.

## POST /api/feedback

Request:

```json
{"n":4,"secret":"1234","guess":"1324"}
```

Response data:

```json
{"a":2,"b":2,"text":"2A2B"}
```

## POST /api/solve/next

Request:

```json
{
	"n":4,
	"mode":"dynamic",
	"engine":"js",
	"strategy":"minimax_worst_bucket",
	"history":[{"guess":"0123","a":1,"b":1}],
	"options":{"allowFallback":true,"exactThreshold":3000,"sampleSize":4096}
}
```

Fields:

```text
n          3, 4, 5, or 6.
mode       tree or dynamic.
engine     Optional for dynamic: js or wasm. Default js.
strategy   first_remaining, minimax_worst_bucket, expected_size, feedback_count, or optimal.
history    Array of previous guess + feedback records.
options    Dynamic solver options.
```

`tree` mode requires history to follow the precomputed tree from the fixed first guess. `dynamic` mode accepts any valid history and recomputes the remaining set.

For `dynamic` mode, `engine` is optional and may be `js` or `wasm`. It may be sent as top-level `engine` or `options.engine`; top-level wins. The default is `js`. `wasm` uses the Rust packed hot path and returns the same logical result.

`tree` mode ignores `engine`.

Dynamic options:

```text
allowFallback    If true, return first remaining when exact scoring exceeds threshold.
exactThreshold   Maximum remaining candidate count for exact scoring. Default env.EXACT_THRESHOLD or 3000.
sampleSize       Reserved for sampled strategies. Current dynamic WASM path ignores it.
engine           Optional engine fallback location. Top-level engine wins.
```

Response data:

```json
{
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
```

When the answer is uniquely determined:

```json
{
	"nextGuess":"1234",
	"nextGuessIndex":1234,
	"remaining":1,
	"solved":true,
	"answer":"1234",
	"diagnostics":{"usedFallback":false,"maxBucket":1,"candidateCount":5040}
}
```

## POST /api/solve/run-tree

Runs a complete computer simulation against a provided secret using a precomputed tree. This is useful for checking the exact table path for a given answer.

Request:

```json
{
	"n":4,
	"secret":"1234",
	"strategy":"optimal",
	"history":[],
	"maxSteps":32
}
```

Fields:

```text
n          3, 4, 5, or 6.
secret     The secret to solve. It must be a valid unique-digit number.
strategy   Tree strategy. The tree asset must exist.
history    Optional completed guesses. If present, it must follow the tree path.
maxSteps   Optional safety limit from 1 to 128. Default 32.
```

The endpoint computes feedback from `secret`, follows the tree, and returns every computed step. Supplied history is verified against the secret before the run continues.

Response data:

```json
{
	"n":4,
	"mode":"tree",
	"strategy":"optimal",
	"secret":"1234",
	"givenSteps":[],
	"steps":[
		{"turn":1,"source":"computed","guess":"0123","guessIndex":123,"a":0,"b":3,"text":"0A3B","remaining":5040,"solved":false}
	],
	"allSteps":[
		{"turn":1,"source":"computed","guess":"0123","guessIndex":123,"a":0,"b":3,"text":"0A3B","remaining":5040,"solved":false}
	],
	"attempts":1,
	"solved":false
}
```

## POST /api/solve/run-dynamic

Runs a complete computer simulation against a provided secret using dynamic solving. This endpoint can continue from already completed guesses.

Request:

```json
{
	"n":4,
	"secret":"1234",
	"strategy":"expected_size",
	"engine":"wasm",
	"history":[{"guess":"0123","a":0,"b":3}],
	"options":{"allowFallback":true,"exactThreshold":3000},
	"maxSteps":32
}
```

Fields:

```text
n          3, 4, 5, or 6.
secret     The secret to solve. It must be a valid unique-digit number.
strategy   Dynamic strategy. optimal is not allowed because it is tree-only.
engine     Optional: js or wasm. Default js.
history    Optional completed guesses. Feedback is checked against secret.
options    Dynamic solver options, same as /api/solve/next.
maxSteps   Optional safety limit from 1 to 128. Default 32.
```

Response data:

```json
{
	"n":4,
	"mode":"dynamic",
	"engine":"wasm",
	"strategy":"expected_size",
	"secret":"1234",
	"givenSteps":[{"turn":1,"source":"history","guess":"0123","a":0,"b":3,"text":"0A3B","solved":false}],
	"steps":[
		{"turn":2,"source":"computed","guess":"1435","guessIndex":602,"a":2,"b":1,"text":"2A1B","remaining":120,"solved":false}
	],
	"allSteps":[
		{"turn":1,"source":"history","guess":"0123","a":0,"b":3,"text":"0A3B","solved":false},
		{"turn":2,"source":"computed","guess":"1435","guessIndex":602,"a":2,"b":1,"text":"2A1B","remaining":120,"solved":false}
	],
	"attempts":2,
	"solved":false
}
```

If the safety limit is reached before a hit, `solved` is `false` and `answer` is omitted.

## POST /api/human/start

Creates a stateless encrypted session token containing the server secret.

## POST /api/human/guess

Submits a user guess against the encrypted session.

## POST /api/pvp/start

Starts a human-vs-computer game. In the current verified mode, `humanSecret` is provided up front so the server can reject false computer feedback.

Request:

```json
{
	"n":4,
	"humanSecret":"1234",
	"computerStrategy":"expected_size",
	"computerMode":"dynamic",
	"computerEngine":"wasm"
}
```

For dynamic computer play, `computerEngine` or `engine` may be `js` or `wasm`. The chosen engine is stored in the session token and may be overridden on a later turn because it does not change strategy semantics.

Response data:

```json
{
	"sessionToken":"...",
	"firstComputerGuess":"0123",
	"computerEngine":"wasm",
	"humanAttempts":0,
	"computerAttempts":1
}
```

## POST /api/pvp/turn

Submits the human guess and the feedback for the previous computer guess. The server updates both sides and returns the next computer guess unless solved.

Request:

```json
{
	"sessionToken":"...",
	"engine":"wasm",
	"humanGuess":"5678",
	"computerFeedback":{"a":0,"b":3}
}
```

`computerFeedback` is checked against the `humanSecret` provided at start. Invalid or dishonest feedback returns `INVALID_FEEDBACK`.

Response data:

```json
{
	"sessionToken":"...",
	"humanFeedback":{"a":1,"b":1,"text":"1A1B"},
	"nextComputerGuess":"1435",
	"computerEngine":"wasm",
	"humanSolved":false,
	"computerSolved":false,
	"winner":null,
	"humanAttempts":1,
	"computerAttempts":2
}
```

## WebSocket /ws/solve

Text JSON messages:

```json
{"id":"1","type":"next","payload":{"n":4,"mode":"dynamic","engine":"wasm","strategy":"expected_size","history":[{"guess":"0123","a":1,"b":1}],"options":{"allowFallback":true,"exactThreshold":3000}}}
```

Add `"engine":"wasm"` to a dynamic `next` payload to use the Rust WASM hot path.

Supported types are `ping`, `strategies`, `feedback`, and `next`. Responses use the same `{ok,data}` or `{ok:false,error}` envelope and echo `id`.

## WebSocket /ws/pvp

Text JSON messages:

```json
{"id":"start","type":"start","payload":{"n":4,"humanSecret":"1234","computerStrategy":"expected_size","computerMode":"dynamic","computerEngine":"wasm"}}
```

For dynamic PVP, use `"computerEngine":"wasm"` or `"engine":"wasm"` in `start` or `turn` payloads.

```json
{"id":"turn1","type":"turn","payload":{"humanGuess":"5678","computerFeedback":{"a":1,"b":1}}}
```

The connection keeps the latest encrypted session token. A client may also include `sessionToken` in `turn` payload to restore state. `engine` or `computerEngine` may be included in `turn` to switch between `js` and `wasm` for future dynamic computer guesses.
