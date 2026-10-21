# Backends

Per-provider capability notes and the numbers actually measured. Every figure below is from a single run on the stated date and must be read together with its environment record — see `../protocol.md`.

Measured 2026-10-21 on one host (Fedora 44, kernel 7.2.x, 12 vCPU), one sandbox per provider, created and destroyed inside the probe.

| Provider | create | exec (round-trip) | destroy | guest `nproc` | runtime | toolchain preinstalled |
|---|---|---|---|---|---|---|
| bwrap (local) | 1.9 ms (`prepare` p50) | 6.4 ms (p50) | — | host | namespace | host |
| Daytona | 1612 ms | 824 ms | 488 ms | **48** | not verified | bun, git, node, python |
| LithosBox | 609 ms | 620 ms | 593 ms | 2 | container | none (base image) |
| E2B | 696 ms | 1000–1200 ms | — | 2 | not verified | git, curl, node, python |
| Modal | 23,801 ms (incl. image build) | 1717 ms | 246 ms | 2 | **gvisor** | none in `debian_slim` |
| instabox | 2400 ms (prior evidence) | not measured | not measured | 4 (plan) | vm | none (sudo required) |

## bwrap

- Local only; shares the host kernel. Not a multi-tenant boundary.
- Sandbox-side `nproc` equals the host because there is no CPU quota.
- Measured on this machine: 200-file git bundle clone p50 37.7 ms; `bun test` costs +6.6 ms over the host.
- Isolation probe results (denials for `/etc`, `~/.ssh`, host `/proc`, unix sockets, LAN, metadata) are in the upstream `bun-nolo` repository under `reports/linux-sandbox/security.md`.

## Daytona

Snapshot / restore (measured 2026-10-21, n=2-3 — **high variance, treat as provisional**):

Ten-attempt runs (2026-10-21, sequential with 1.5 s gaps; per protocol item 6 these still need re-runs at other times):

- **create default (n=10): min 1.40 s, p50 1.65 s, p95 2.62 s, CV 0.24**
- **create from snapshot (n=10): min 1.98 s, p50 2.21 s, p95 2.69 s, CV 0.10**
- snapshot create: 6.4 s in this run (6.5 s and 24.9 s in earlier single samples — high variance)
- early single-sample figure of 13.4 s was a **first-ever restore on a cold node**; steady state is ~2 s

Interpretation: on Daytona a snapshot restore is **not faster than a default create** — the default image is already warm. The value of the snapshot is carrying workspace state, i.e. **zero re-upload**, not lower latency.
- `networkBlockAll: true` **works**: all egress blocked, including the normally allowed dev domains.
- **Default egress is a domain allowlist, not "open"**: in a default sandbox `bun.sh`, `github.com`, `registry.npmjs.org`, `pypi.org`, `api.github.com` all return 200, while `example.com` returns 000 — the connection is reset after the TLS ClientHello, i.e. filtering happens on SNI, not on reachability. DNS inside points at 8.8.8.8 / 1.1.1.1.
- Consequence: `networkAllowList` (CIDR) **cannot add an arbitrary destination** — `1.1.1.1/32` did not make `1.1.1.1` reachable. So an operator-owned credential proxy on a new domain is **not viable on Daytona**; the allowlist is ours to shrink, not to extend.
- `fork()` is **not supported**: rejected for the default container class and also with `sandboxClass: "linux-vm"`.

Also from the SDK surface (not yet exercised): `secrets` mounts org secrets as **opaque placeholders substituted only on outbound requests to allowed hosts** — the same credential-proxy model described in `modes.md`; `networkAllowList` / `domainAllowList` / `outboundProxyUrl`; `autoStopInterval` (default 15 min), `autoPauseInterval` (default 60 min for pausable classes), `autoArchiveInterval` (7 days), `autoDeleteInterval`, `ephemeral`, `ttlMinutes`.


- `nproc` inside the sandbox reported **48** while the sandbox was billed as 4 vCPU — the quota is enforced but not reflected in the guest view. Treat guest-visible specs as unreliable for this provider.
- Default image ships `bun`, `git`, `node`, `python3`, `curl`; a `bun test` run needs no preparation.
- Open questions: whether outbound network can be denied per sandbox; whether the runtime is a container or a VM.

## E2B

- Egress **open**: all six probed domains return 200 (no per-domain filtering, and no API-level block observed).
- Idle 90 s with no processes: no suspend; next exec 1.04 s vs 1.57 s baseline — no penalty, but the box keeps running (Hobby has a 1 h per-session cap).
- Non-root guest: `/work` is not writable, use the home directory.
- Ships `git`, `curl`, `node`, `python3`; no `bun` (install it: ~2.9 s).
- Create is the fastest observed (696 ms) but each `exec` round-trip is the slowest of the measured set (~1.0–1.1 s).
- Open question: runtime type (container vs microVM).

- Non-root guest: `/work` is not writable, use the home directory.
- Ships `git`, `curl`, `node`, `python3`; no `bun` (install it: ~2.9 s).
- Create is the fastest observed (696 ms) but each `exec` round-trip is the slowest of the measured set.
- Open questions: runtime type (container vs microVM); egress policy.

## Modal

- Runs on **gVisor** (`Linux 4.19.0-gvisor`) — the only candidate here with a syscall-interception boundary rather than plain containers.
- `debian_slim` has no `curl`; `apt_install(...)` adds ~23 s to the first create (image build). Warm creates need re-measuring.
- Guest `nproc` = 2 (honest quota) but `/proc/meminfo` shows host-scale memory: memory quota is not reflected in the guest view.
- Egress open by default.

## instabox

Measured 2026-10-21 (free plan, `agent-browser` template):

- **create → running: 2.4 s / 11.1 s** across two runs (async operation: `POST /machines` returns `operationId`, then poll).
- **stop → start → running: variable** — n=10 valid starts: min **5.17 s**, p50 **7.39 s**, p95 **16.6 s**, max **19.7 s** (CV 0.55), and **2 of 10 further starts exceeded a 60 s poll window**. The earlier single-shot 5.4 s was the best case. `/data` content **survives** (marker file read back after restart). Second run needs **zero re-upload**.
- exec round-trip 570 ms; kernel `6.18.54-instabox`; `nproc` = 4 (honest quota).
- `/data` is `root:root` — writes from the non-root exec user require `sudo -n` (passwordless, confirmed).
- Free plan can only create from the **`agent-browser` template or a snapshot**; `universal` is rejected with `template_not_allowed`.
- `DELETE` requires an `Idempotency-Key` header (otherwise 400); create responses carry both `id` (operation) and `machineId`.

- Whole VM per machine, 4 vCPU / 8 GB, `/data` persists across stop/start.
- `sudo` is passwordless inside; outbound network is open with no per-machine control — **not** a tenant-isolation candidate as-is.
- Orphan cleanup is manual (`cloudSlotReconciler` only reports).
- Real concurrency ceiling is unverified.

## LithosBox

- Fastest create measured (609 ms); guest `nproc` = 2 and memory reflects the request (honest quota).
- **Egress can be disabled at create time** (`disable_internet: true`) and the block was verified from inside (`curl` → connection failure). The only measured provider where this works.
- Base image is bare: no `bun`, `git`, `curl`. Custom OCI images require a template build first; the template path was not fully verified in this round.
- No public pricing; usage metered per minute (CPU + memory + storage).

## M3 idle behaviour (measured 2026-10-21)

The realistic agent shape keeps a box across a turn while the model thinks. Measured per provider:

| Provider | idle → sleep | resume latency | sleeping still billed? |
|---|---|---|---|
| LithosBox | `running` at 60 s, `slept` at 75 s (no processes) | **630 ms** — equal to the 625 ms warm baseline, no wake penalty | **yes**: one slept window metered `cpu 24 s`, `memory 12,288 MB·s`, `vm 12 s` |
| LithosBox (with a background process) | never slept through 90 s; process kept writing 1 line/s | 675 ms | n/a |
| GitHub Codespaces | did not suspend at 90 s idle (uptime 6 min) | 7.1 s per command, dominated by the `gh codespace ssh` tunnel per call | not measured |

Design consequence: **sleep is not free.** Auto-sleep stops CPU burn but memory and box time keep accruing. A session layer that wants to avoid paying for a 10-minute model pause must either accept it, or snapshot-to-storage and destroy the box.

## Docker Sandbox Cloud

Credits-only entry: not benchmarked here. Prior evidence from the upstream repository: 4 vCPU / 8 GiB at $0.28/h, new sandbox + 38 MB delivery took 95.6 s, warm pool wake 2 s, volume-backed sandboxes cannot hibernate, and a volume remounted into a new sandbox read back empty.
