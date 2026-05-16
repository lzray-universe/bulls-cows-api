# Strategy

## Feedback

Feedback `(A,B)` is valid when:

- `A+B<=n`
- `0<=A<=n`
- `0<=B<=n`
- `(n-1,1)` is impossible and rejected

Feedback codes are dense in row-major order over `(A,B)`, skipping invalid pairs.

## Dynamic Execution

Dynamic solving has two Worker engines:

```text
js      TypeScript implementation used by default for compatibility.
wasm    Rust WebAssembly packed path used when clients pass engine:"wasm".
```

Both engines enumerate the same candidate universe, apply the same feedback rules, and use the same tie-break order. The selected engine is an execution detail, not part of strategy identity.

The WASM path receives packed history arrays from TypeScript:

```text
guess packed as u32 with 4 bits per digit
A values as u8 array
B values as u8 array
strategy id as u8
```

This avoids JSON parsing inside the scoring hot path. Results are returned in the normal API shape. `diagnostics.engine` is set to `wasm` for WASM dynamic calls.

The current WASM scorer preserves exact results and uses result-preserving short-circuiting:

```text
minimax_worst_bucket stops scoring a probe once a bucket exceeds the current best maximum.
expected_size stops scoring a probe once the partial sum of bucket squares exceeds the current best sum.
feedback_count tracks non-empty buckets, maximum bucket, and square sum in one pass.
```

## first_remaining

After filtering candidates by history, choose the lowest indexed remaining candidate.

## minimax_worst_bucket

For each allowed probe guess, split the remaining candidate set by feedback code and minimize the largest bucket.

Tie-break order:

1. Smaller largest bucket.
2. Guess is inside the remaining candidate set.
3. Smaller sum of squared bucket sizes.
4. Smaller candidate index.

The Worker refuses exact minimax when `remaining>exactThreshold` unless fallback is enabled. The offline C++ tool supports `--probe-space candidates|universe` and deterministic `--approx-sample`.

## expected_size

Irving, 1978 average-case metric. For a probe guess, split the remaining set by feedback buckets and minimize `sum(bucket_size^2)`, which is proportional to expected remaining set size.

Tie-break order:

1. Smaller sum of squared bucket sizes.
2. Guess is inside the remaining candidate set.
3. Smaller largest bucket.
4. Smaller candidate index.

## feedback_count

Kooi, 2005 feedback-count metric. For a probe guess, maximize the number of non-empty feedback buckets.

Tie-break order:

1. More non-empty feedback buckets.
2. Guess is inside the remaining candidate set.
3. Smaller largest bucket.
4. Smaller sum of squared bucket sizes.
5. Smaller candidate index.

## optimal

`optimal` is a tree-only strategy backed by a precomputed 4-digit decision tree in `assets/bc/v1/n4/tree.optimal.part000.bin`. It is not available in dynamic mode.
