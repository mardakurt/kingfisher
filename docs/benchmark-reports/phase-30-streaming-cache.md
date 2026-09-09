# Streaming cache benchmark report

Generated: 2026-09-09T20:40:19.906Z

```json
{
  "config": {
    "chunks": 200,
    "chunkSize": 16384,
    "memoryBudget": 16777216,
    "persistentBudget": 67108864,
    "concurrency": 4
  },
  "coldWarmMs": 284.082,
  "memoryHits": {
    "medianMs": 0.081,
    "p95Ms": 0.174,
    "meanMs": 0.091,
    "samples": 5
  },
  "persistentHits": {
    "medianMs": 4.773,
    "p95Ms": 6.089,
    "meanMs": 4.964,
    "samples": 5
  },
  "networkMisses": {
    "medianMs": 1132.037,
    "p95Ms": 1133.202,
    "meanMs": 1131.862,
    "samples": 3
  },
  "concurrency": {
    "c2": {
      "medianMs": 569.619,
      "p95Ms": 572.753,
      "meanMs": 568.762,
      "samples": 3
    },
    "c4": {
      "medianMs": 283.744,
      "p95Ms": 288.277,
      "meanMs": 285.221,
      "samples": 3
    },
    "c6": {
      "medianMs": 191.848,
      "p95Ms": 192.495,
      "meanMs": 191.33,
      "samples": 3
    },
    "c8": {
      "medianMs": 140.987,
      "p95Ms": 142.476,
      "meanMs": 141.142,
      "samples": 3
    }
  },
  "persistentBytes": 3284800,
  "persistentCount": 200
}
```
