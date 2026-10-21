# Decision: which execution form for which agent loop

All numbers are measured on 2026-10-21 and live in `results/2026-10-21-measured.jsonl`. Free-tier terms are in `credits.md`. This document only ranks **forms of execution**, not vendors: the same vendor scores differently per loop mode.

## 1. The shape of the problem

Three loops, three different bottlenecks:

- **M1 out-of-loop** (delegated task, nobody waiting): bottleneck is **cost per task** and correctness. Latency is irrelevant.
- **M2 in-loop** (subagent runs while a human watches): bottleneck is **per-command round-trip** — 30 tool calls × RTT is the perceived lag.
- **M3 in-loop with a persistent box** (the realistic Nolo shape): bottleneck is **what happens during 10–120 s of model thinking**, plus how fast the workspace is ready again on the next run.

## 2. Recommendation

| Mode | Recommended form | Why (measured) |
|---|---|---|
| **M1** | Modal (warm image) or Daytona | Modal warm create **289 ms** after the image is built (gVisor boundary); Daytona create p50 **1.65 s**, snapshot restore **2.21 s** (n=10). Both bill per second, both sit inside the free allowance for our volume |
| **M2** | GitHub Codespaces over a **persistent SSH connection** | **p50 191 ms / p95 195 ms per command (n=20 across 2 sessions, CV 0.01)** once the connection is multiplexed, vs 7–9 s when `gh` spawns a tunnel per call. Persistent disk, no suspend at 90 s idle |
| **M3** | **Codespaces** (persistent disk, 191 ms commands) or **LithosBox** (wake 618 ms p50, n=5) | instabox measured worse than first thought: start **5.2–19.7 s (p50 6.7 s, CV 0.53) with 2/10 starts exceeding 60 s** — `/data` persistence is still the best part, but the latency is not |
| **Large repos, any mode** | Never re-upload | Cold path costs **3.8 MB/s** (15.3 MB in 4.04 s) and scales with repo size; snapshot/start paths are flat (3.72 s snapshot restore, 5.36 s instabox start) |
| **Multi-tenant isolation** | Not solved by any free tier | see §4 |

## 3. The 95.6 s question

Docker Cloud historically delivered 38 MB in 95.6 s (~0.4 MB/s). On Daytona the same operation runs at **~3.8 MB/s**, i.e. an order of magnitude faster per byte — but the real fix is not a faster pipe:

- **Cold path total: 6.76 s** for 15.3 MB (create 1.82 + upload 4.04 + clone 0.89).
- **Snapshot path total: 3.72 s** for the same workspace, **zero transfer**, and it does not grow with repo size.
- **instabox start: 5.36 s**, zero transfer.

The only scalable answer is: **materialize once, then start or restore**. Any design that re-sends the tree on every run has a hard ceiling around 3.8 MB/s.

## 4. What the free tiers do **not** give us

1. **Enforced egress**: only Daytona filters by domain (allowlist), and its `networkAllowList` cannot add destinations. instabox, E2B, Modal and LithosBox are simply open (all six probed domains return 200); LithosBox alone can go fully offline. **Therefore an operator-owned credential proxy cannot be enforced on any free tier** — the credential strategy reduces to platform-side materialization (no credentials in the box) or a short-lived scoped token.
2. **Organization secrets**: Daytona's API returns `Access denied` on the free plan.
3. **Quota guarantees**: instabox concurrency ceiling unverified; Codespaces quota depends on plan; LithosBox has no published price.

## 5. Free-tier sufficiency (order of magnitude)

- Daytona $200 at 4 vCPU / 8 GiB ($0.3312/h) ≈ **600 machine-hours**; at 2 vCPU / 4 GiB ≈ **1 200 hours**.
- E2B $100 one-time ≈ **600 hours** at 2 vCPU / 4 GiB.
- Modal $30/month recurring — rate not pinned in this repo, but it is a monthly allowance, i.e. the only one that survives month two without a new signup.
- instabox: 5 machines, free plan restricted to `agent-browser` template or snapshot.
- Codespaces: included monthly quota (hours depend on plan; not read).
- LithosBox: no published price.

At our measured cost of ≈ $0.008 per 3-minute verification run, $200 is ~24 000 runs. **Cost is not the binding constraint at evaluation volume; the binding constraints are egress control and workspace reuse.**

## 6. Still unverified

- Modal: idle behaviour, network policy beyond "open", volume-backed reuse.
- LithosBox: custom-image/template path (one attempt did not produce `bun`), billed-idle cost at scale.
- Codespaces: clone over the multiplexed channel returned an implausible 201 ms — treat as unmeasured.
- Every figure above except the Daytona n=10 runs is **n=1–3**; per `protocol.md` §6 these must be repeated across sessions before being used for ranking inside a mode.
