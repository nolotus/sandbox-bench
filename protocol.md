# Measurement protocol

## 1. Validity rules

A number is only publishable if all of the following hold.

1. **Repetition.** Every latency figure comes from **≥ 10 attempts** (concurrency tiers: ≥ 5, and the tier count itself is recorded). Fewer attempts must be labelled `insufficient repetitions` in `note`.
2. **Cold and hot are separate.** A cold measurement starts with a provider that has never seen this image/workspace. A hot measurement reuses a live sandbox or a warm image. They are never averaged together.
3. **Percentiles are nearest-rank.** Sort ascending; `p = ceil(k/100 × n)`; take element `p` (1-based). No interpolation, so results are reproducible by hand.
4. **Full cost, not boot alone.** A run's cost is `transfer bytes + runtime seconds + storage`, measured over the same 10-run loop used for latency.
5. **Environment is recorded.** Each `results.jsonl` opens with one `phase:"meta", case:"environment"` record (see `schema/environment.schema.json`). A number without an environment record is not comparable and must not be ranked.
6. **Missing data stays null.** Never infer a provider value. `null` + `note` beats a guess.

## 2. File structure

```
results.jsonl     first line = environment record, then one record per attempt
results/          committed evidence, one file per measurement session (YYYY-MM-DD-*.jsonl)
aggregates.json   derived statistics; the only source for numbers quoted in prose
```

Prose numbers must be reproducible from `aggregates.json`, which must be reproducible from `results.jsonl` (`--aggregate-only` regenerates it without re-running measurements).

## 3. Workloads

Fixtures are synthetic. No real credentials, no user data.

| ID | Workload | Steps |
|---|---|---|
| W0 | Empty workspace | `pwd`; create / append / edit / read a small file |
| W1 | Git bundle restore | host `git bundle create --all` → upload → `git clone` → `git log`, `git status`, `git diff`, untracked file |
| W2 | Warm reuse | re-enter an existing workspace (no re-download); read many small files; edit a few |
| W3 | Real test run | `bun test` on a fixed fixture; record exit result + peak RSS / CPU / block IO |
| W4 | Concurrency | 1 / 2 / 4 / 8 sandboxes running the same CPU-bound command; plus host responsiveness while all are busy |
| W5 | Persistence | retain → destroy → recreate → compare sha256 and permission bits of modified and untracked files |
| W7 | Idle behaviour | no activity for 15/30/45/60/90 s: does it sleep, is the sleep billed, what is the resume latency, do processes survive |
| W6 | Denial tests | parent project, `~/.ssh`, `/etc/shadow`, host `/proc`, unix sockets, LAN, cloud metadata, mount table, symlink and traversal escapes, cross-tenant read/write |

W6 is a safety gate, not a performance number: a bypass is an immediate failure of that backend, regardless of its latency.

## 4. Metrics and known bias

| Field | Meaning | Known bias |
|---|---|---|
| `durationMs` | wall clock of the whole step | includes control-plane HTTP overhead; not pure compute |
| `prepareMs` | create → first usable command | includes image pull/build on a cold provider |
| `firstExecMs` | first command after prepare | first call also warms connections |
| `endToEndMs` | prepare + first exec | the number a user actually feels |
| `peakRssKb` | sampled peak RSS of the **sandbox process tree**, excluding the benchmark host | 20 ms sampling interval; operations shorter than one interval are not sampled |
| `cpuMs` | sum of per-PID `utime+stime` deltas | **lower bound only**: CPU before first sample and of already-reaped children is not counted; short tasks can be under-reported by ~3× and may read 0 |
| `ioBytes` | sampled `read_bytes + write_bytes` | block-device layer; page-cache hits are not visible |
| `bytes` | payload size (e.g. bundle) | — |

Because of the CPU bias, `cpuMs` must not be used to compare implementations or to size capacity. Use `durationMs` and `peakRssKb` for that.

## 5. Reporting

- Report `p50` and `p95` plus `min`/`max` and the attempt count.
- State the environment for every table: provider, region, image, vCPU, memory, runtime type, kernel, billing model.
- Link the raw `results.jsonl` next to any summary.
- List failed probes explicitly. A run with failures is not "passing with caveats" — it is a failed probe with a latency number attached.
