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
| **M2** | GitHub Codespaces over a **persistent SSH connection** | **per-command latency UNMEASURED.** An earlier 191 ms/cmd figure (n=20) is **retracted**: the harness never executed the remote command — a connectivity proof (`echo HELLO`) printed *nothing*, so those timings measured a failing ssh invocation, not execution. The working path (`gh codespace ssh -c <name> -- <cmd>`) costs **7–9 s per command** because it spawns a tunnel per call. Multiplexing must be re-measured before any latency claim. Persistent disk, no suspend at 90 s idle |
| **M3** | **Codespaces** (persistent disk; per-command latency unmeasured, see M2) or **LithosBox** (wake 618 ms p50, n=5) | instabox measured worse than first thought: start **5.2–19.7 s (p50 6.7 s, CV 0.53) with 2/10 starts exceeding 60 s** — `/data` persistence is still the best part, but the latency is not |
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
- Codespaces: **every** number produced through the multiplexed channel is suspect, not just the 201 ms clone. The channel was shown not to execute remote commands at all (silent `echo`), so the whole 186–193 ms band (clone / noop / CPU-loop) is measuring the failed invocation's return time. Status: **not measured**.
- Every figure above except the Daytona n=10 runs is **n=1–3**; per `protocol.md` §6 these must be repeated across sessions before being used for ranking inside a mode.

## 7. One table: mode × provider

Cell meaning: **OK** = measured and adequate for that mode; **weak** = works but a measured property hurts; **no** = measured property disqualifies it.

| Provider | Free allowance | In our units (2 vCPU / 4 GiB, 3-min run ≈ $0.008) | M1 out-of-loop | M2 in-loop | M3 persistent |
|---|---|---|---|---|---|
| **Codespaces** | monthly quota (hours depend on plan) | not monetary — it is a time quota | OK (batch over one session) | **UNMEASURED — 191 ms/cmd retracted (harness did not execute)** | **OK — disk persists, no suspend at 90 s** |
| **LithosBox** | no published price | unknown | weak (no price transparency) | OK — 620 ms/cmd | OK — wake 618 ms (n=5), but **sleeping is billed** |
| **Daytona** | $200 credit | ≈ 12 000 runs at 4 vCPU/8 GiB; ≈ 24 000 at 2/4 | **OK — snapshot restore 2.2 s, create 1.65 s** | OK — ~820 ms/cmd | OK — snapshot 2.2 s; `autoPause` 60 min |
| **E2B** | $100 one-time | ≈ 12 000 runs at 2/4 | OK — create 696 ms | weak — 1.0–1.1 s/cmd | weak — 1 h session cap on Hobby |
| **Modal** | $30 / month, recurring | monthly allowance, rate not pinned | OK — warm create 289 ms, gVisor | **no — 1.4 s/cmd** | weak — persistence not measured |
| **instabox** | 5 machines, free | n/a | weak — create 2.4–11.1 s | n/a (no per-command channel measured) | **no — start 5.2–19.7 s, 2/10 > 60 s** |
| **bwrap (local)** | free forever | $0 | OK (local files) | OK (6.4 ms) | n/a (workspace is the host) |

### Reading the table

- **M2 cannot be decided yet**: its only headline number (191 ms/cmd) is retracted. If multiplexing does hold, a 4× spread (191 ms vs 820 ms vs 1.4 s) would compound — 5.7 s vs 25 s vs 42 s of pure round-trip for a 30-call turn — which is why re-measuring this one figure matters more than adding rows.
- **M3 is decided by what happens during model thinking**: only Codespaces and Daytona survive 60+ s of idle without a visible penalty; Lithos sleeps but wakes in 0.6 s (and bills for it); instabox's restart is too variable.
- **M1 is decided by cost and correctness**, and there the free allowances are effectively unlimited for evaluation volume — the constraint is egress control, not money.
