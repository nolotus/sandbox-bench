# sandbox-bench

Reproducible benchmarks for **agent execution sandboxes**: isolated machines or containers that an AI agent uses to run shell commands, read and edit files, and execute test suites.

This is deliberately *not* a model benchmark. For LLM API latency / caching / streaming, see [`llm-api-bench`](https://github.com/nolotus/llm-api-bench).

## What this measures

- **Cold start**: time from "create request" to "first command can run".
- **Command round-trip**: time per `exec` call, including control-plane overhead.
- **Workspace materialization**: git bundle upload → clone → `git status` / `git diff`.
- **Real workload**: `bun test` on a fixed fixture, plus peak RSS / CPU / block IO of the sandbox process tree.
- **Concurrency**: 1 / 2 / 4 / 8 sandboxes in parallel, and whether the host stays responsive.
- **Persistence**: retain → destroy → recreate → verify file hashes and modes.
- **Isolation**: attempts to read the host, other tenants, credentials, sockets, metadata endpoints; symlink and traversal escapes.

## What this does not measure

- Model quality or token throughput.
- Long-running (hours) sessions, GPU workloads, or production concurrency (1,000s of sandboxes).
- Billing accuracy. Costs here are estimates from published rates, not invoices.

## Layout

```
protocol.md                  measurement rules (W0–W6, metrics, known bias)
modes.md                     execution modes M1–M3 and workspace strategies
credits.md                   free tier / credits per provider, with verification status
schema/results.schema.json   one JSON object per line (results.jsonl)
schema/environment.schema.json  the required head record
backends/README.md           per-provider capabilities, measured numbers, open questions
CONTRIBUTING.md              how to add a backend, and what must never be committed
```

## Reproduce

```sh
# 1. pick a backend, put its credential in nolo secret (never in a file)
nolo secret list
nolo secret run --with daytona_api_key -- bun run bench.ts --backend daytona

# 2. emit raw results (one JSON object per line)
#    results.jsonl + aggregates.json, same shape for every backend

# 3. recompute statistics without re-running measurements
bun run bench.ts --aggregate-only
```

## Validity rules (summary)

- **≥ 10 repetitions** for every latency figure; report `p50` and `p95` (nearest-rank).
- **Cold and hot separated**: never mix a first-ever create with a warm reuse into one number.
- **Full cost per run**, not boot alone: transfer bytes + runtime + storage.
- **Record the environment**: provider, region, image, vCPU, memory, runtime type, kernel, billing model.
- Numbers without a recorded environment are not comparable and must not be ranked.

See [`protocol.md`](protocol.md) for the exact rules and known measurement bias.

## Data and licensing

Raw evidence (`results.jsonl`) is published alongside every summary. Fixtures are synthetic: no real credentials, no user data, no host paths containing usernames.

Code and data: MIT.
