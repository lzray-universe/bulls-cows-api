# Strategy

## Feedback

Feedback `(A,B)` is valid when:

- `A+B<=n`
- `0<=A<=n`
- `0<=B<=n`
- `(n-1,1)` is impossible and rejected

Feedback codes are dense in row-major order over `(A,B)`, skipping invalid pairs.

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

## optimal

`optimal` is a tree-only strategy backed by a precomputed 4-digit decision tree in `assets/bc/v1/n4/tree.optimal.part000.bin`. It is not available in dynamic mode.
