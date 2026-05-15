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
	"strategy":"minimax_worst_bucket",
	"history":[{"guess":"0123","a":1,"b":1}],
	"options":{"allowFallback":true,"exactThreshold":3000,"sampleSize":4096}
}
```

`tree` mode requires history to follow the precomputed tree from the fixed first guess. `dynamic` mode accepts any valid history and recomputes the remaining set.

## POST /api/human/start

Creates a stateless encrypted session token containing the server secret.

## POST /api/human/guess

Submits a user guess against the encrypted session.

## POST /api/pvp/start

Starts a human-vs-computer game. In the current verified mode, `humanSecret` is provided up front so the server can reject false computer feedback.

## POST /api/pvp/turn

Submits the human guess and the feedback for the previous computer guess. The server updates both sides and returns the next computer guess unless solved.
