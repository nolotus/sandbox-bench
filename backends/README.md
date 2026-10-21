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

- `nproc` inside the sandbox reported **48** while the sandbox was billed as 4 vCPU — the quota is enforced but not reflected in the guest view. Treat guest-visible specs as unreliable for this provider.
- Default image ships `bun`, `git`, `node`, `python3`, `curl`; a `bun test` run needs no preparation.
- Open questions: whether outbound network can be denied per sandbox; whether the runtime is a container or a VM.

## E2B

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
- **stop → start → running: 5.4 s**, and `/data` content **survives** (marker file read back after restart). Second run needs **zero re-upload**.
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
