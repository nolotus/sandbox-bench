# Execution modes

A sandbox is not one workload. The same box scores very differently depending on how the agent loop uses it, so every result must declare its mode. Latency-first and cost-first conclusions are not interchangeable.

## M1 — out-of-loop delegation

The main agent hands off a whole task and does not wait. A human is not watching the sandbox.

```
create -> materialize workspace -> edit N files -> run tests -> export diff -> destroy
```

Metrics that decide:

- end-to-end wall time
- **full cost per task**: create + runtime + transfer + destroy (not boot alone)
- success rate across repeated runs
- **diff fidelity**: returned patch applies cleanly, untracked files preserved, base commit identified

Latency is not the point here; cost and correctness are.

## M2 — in-loop agent

A subagent runs inside the main loop while a human waits. One task issues 30–60 tool calls.

Metrics that decide:

- **p50 / p95 / p99 per tool call** (p99 drives perceived lag, not p50)
- streaming time-to-first-byte for command output
- **per-turn overhead = per-call round-trip × calls per turn**
- round-trip split: control plane (auth, HTTP, queueing) vs actual process execution; measure a no-op command to isolate the overhead

## M3 — subagent in-loop with a persistent sandbox

The realistic Nolo shape: a subagent keeps a sandbox across a turn while the model thinks between tool calls.

The conflict this mode exposes: **what happens to the box during 10–120 s of model thinking?**

Metrics that decide:

- **resume latency** after 10 / 30 / 60 / 120 s of no activity
- whether that idle window is billed
- whether processes, shell sessions and files survive it
- whether the provider auto-sleeps at a threshold that lands inside normal thinking time (LithosBox documents ~60 s idle sleep — this is exactly the dangerous range)

## Workspace strategies

"Skip the bundle" is not a provider feature; it is a question of how long the box lives.

| Strategy | Box lifetime | First run | Run N | Suits |
|---|---|---|---|---|
| `bundle` | per-run | upload full git bundle | re-upload every run | ephemeral sandboxes |
| `git-pull` | persistent | clone | fetch delta only (requires egress + credentials) | persistent boxes |
| `disk-cache` | persistent | install dependencies | deps already on disk | persistent boxes |

The number to report is **time and bytes to reach "tests runnable" on run #2..N**, per strategy — not the first-run number.

Providers observed to support persistent storage:

- instabox: `/data` volume survives stop/start
- GitHub Codespaces: workspace disk persists across stop/start
- Daytona: volumes / snapshots
- LithosBox: snapshots and archive; sandbox disk is 16/32 GiB, 64 GiB on higher plans
- Modal: volumes (mount for dependency cache); default sandbox filesystem is ephemeral
- E2B: sandboxes are time-limited on the lower plan; template + storage for reuse

## Additional measurements for agent boxes

Beyond the W0–W6 workloads:

1. **Real code edit**, not `bun test` on a toy file: clone a real tree, apply a multi-file edit, run a subset suite, export the diff and verify it byte-for-byte.
2. **Idle cost**: what a 10-minute model pause costs, per provider.
3. **Large transfer**: upload/download throughput at realistic sizes (hundreds of MB of dependencies, GB-scale repositories).
4. **In-sandbox concurrency**: several `exec` calls at once in one box (agents parallelize tool calls).
5. **Neighbour noise**: cannot be controlled on hosted providers, so report **variance across 30 identical runs** as the proxy, plus a co-hosted CPU-pressure trial where the host is ours.
6. **Reliability**: create failure / 429 / timeout / orphaned-box counts over 30 runs.
7. **Security**: egress granularity (all / allowlist / none) and **whether a snapshot or fork clones credentials** placed in env or files.

## Reporting rule

Every result row must carry its mode. A provider ranked on M2 latency cannot be ranked on M1 cost, and neither ranking says anything about M3 until the idle behaviour is measured.

## Credential strategy under the free/local-only rule

This project only uses **local execution and free tiers**. A paid feature is not a design input, even when it is the cleanest solution on paper (example: Daytona's Organization Secrets API returns `Access denied` on the free account — we do not upgrade to use it).

| Provider | Free tier | Egress control on the free tier | Credential strategy that works |
|---|---|---|---|
| bwrap (local) | always free | full network namespace control | resolve locally, never place credentials in the sandbox |
| instabox | 5 machines, `agent-browser` template or snapshot only | **open** (all 6 probed domains return 200; passwordless sudo) | materialize on the platform side (clone/pull outside, deliver bundle) or a short-lived scoped token |
| Daytona | $200 credit | default = **domain allowlist** (dev domains 200, `example.com` reset at TLS); `networkBlockAll` works; `networkAllowList` cannot add destinations | **platform-side materialization** (git pull works for GitHub, which is allowlisted) or a short-lived scoped token. Own proxy not viable; **Org Secrets is a gated feature — not used** |
| LithosBox | no published price | **open by default** (all 6 probed domains 200); `disable_internet` is all-or-nothing | bundle-only, or short-lived token. A proxy cannot be the sole egress target when the switch is binary |
| Modal | $30/month | open (measured: outbound 200) | bundle-only or short-lived token; a proxy cannot be enforced |
| E2B | $100 one-time | **open** (all 6 domains 200, no per-domain filter) | bundle-only or short-lived token |
| GitHub Codespaces | included quota | GitHub-managed | native git auth |

Consequence for the design: "credentials never enter the sandbox" is achievable on local bwrap and on Daytona with an allowlist, but **not** on providers whose only switch is "internet on/off". For those, the honest options are platform-side materialization (no credentials at all in the box) or a short-lived scoped token with an explicit risk label.
