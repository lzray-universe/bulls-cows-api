# Asset Format

Assets are rooted at `apps/worker/public/assets/bc/v1`.

## candidates.bin

For each `n`, `nX/candidates.bin` stores all candidates in lexicographic order. Each record is a little-endian `u32`, with digit `i` stored in bits `[i*4,i*4+3]`.

Candidate counts:

| n | count |
| - | - |
| 3 | 720 |
| 4 | 5040 |
| 5 | 30240 |
| 6 | 151200 |

## tree.*.partNNN.bin

Large tree files are sliced to keep every asset under 25 MiB.

Header is 64 bytes:

| offset | type | field |
| - | - | - |
| 0 | char[4] | `BCST` |
| 4 | u16 | version, currently `1` |
| 6 | u8 | n |
| 8 | u16 | strategy id |
| 10 | u32 | node count |
| 14 | u32 | candidate count |
| 18 | u8 | feedback count |

Node record is 13 bytes:

| field | type |
| - | - |
| guess_index | u32 |
| child_base | u32 |
| terminal | u8 |
| answer_index | u32 |

The child table follows all node records. Each child is a `u32` node id. Missing branches are `UINT32_MAX`.

## manifest.json

Records candidate metadata and tree parts:

```json
{
	"version":1,
	"format":"bc-assets-v1",
	"ns":{"n4":{"candidateCount":5040,"feedbackCount":14,"files":["assets/bc/v1/n4/candidates.bin"]}},
	"trees":{"n4:minimax_worst_bucket":{"n":4,"strategy":"minimax_worst_bucket","nodeCount":1,"hash":"...","parts":[]}}
}
```
