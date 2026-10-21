# Adapter requirements, derived from measurements

This file turns the numbers in `decision.md` into requirements for any backend adapter (ours or a plugin's). Each requirement cites the measurement that forces it; nothing here is hypothetical.

## 1. Capability contract

An adapter must declare, up front, what it can do — because the same vendor differs per mode:

```ts
describe(): {
  lifecycle: { start: boolean; stop: boolean; snapshot: boolean; restore: boolean };
  transport: "persistent-channel" | "per-call-cli";
  workspace: "ephemeral" | "persistent-disk" | "snapshot";
  idle: { policy: "none" | "auto-stop" | "auto-pause" | "sleep"; billedWhileIdle: boolean | "unknown" };
  egress: { mode: "blocked" | "allowlist" | "open"; canAddDestination: boolean };
  billing: { unit: "per-second" | "per-minute" | "monthly-quota" | "free"; published: boolean };
  runtime: "container" | "vm" | "gvisor" | "namespace" | "unknown";
}
```

## 2. Requirements and the measurement that forces each one

| Requirement | Forced by |
|---|---|
| **`exec` must use a long-lived channel, never spawn a CLI per call** | Codespaces: **7–9 s per command** via `gh codespace ssh` vs **191 ms (n=20, CV 0.01)** over a multiplexed connection. A 30-call turn is 5.7 s vs 4+ minutes |
| **`ensure()` must return `readyMs` separately from `execMs`** | Modes have opposite bottlenecks: Modal warm create 289 ms but 1.4 s/command; Daytona 1.65 s create but 0.82 s/command |
| **Workspace must be persistent or snapshot-based; `ensure()` must report `transferBytes`** | Cold path costs 3.8 MB/s (15.3 MB in 4.04 s) and scales with repo size; snapshot restore is 2.2 s flat, instabox start is 5.4 s with **zero** transfer |
| **`restore`/`start` must be treated as unreliable, with an explicit timeout and a surfaced failure** | instabox: n=10 starts ranged **5.2–19.7 s** with **2/10 exceeding 60 s**. A hang must become an error the caller can act on, never a silent wait |
| **Idle policy must be declared, and "sleeping" must not be reported as "free"** | LithosBox sleeps at 60–75 s and still bills memory/box time while slept (measured `slept` state accruing `memory 12,288 MB·s`) |
| **Egress mode must be declared; adapters must not claim proxy enforcement they cannot deliver** | Daytona filters by domain (allowlist, cannot add destinations); instabox / E2B / Modal / LithosBox are open (all six probed domains 200); only LithosBox can go fully offline |
| **Credentials must never enter the sandbox** | No free tier can enforce an operator-owned proxy; the only honest options are platform-side materialization or a short-lived scoped token with an explicit risk label |
| **`release()`/`delete()` must confirm the deletion** | instabox `DELETE` requires an `Idempotency-Key`; a 400 must be surfaced, not swallowed, or orphan machines accumulate |
| **Provider quirks stay inside the adapter** | instabox returns both `id` (operation) and `machineId`, is async, needs a template and `Idempotency-Key`; Daytona needs `sandboxClass`/`snapshot` semantics. None of this may leak into the calling interface |

## 3. What an adapter must **not** assume

- **Do not assume "start" is cheap.** 5–20 s with 20 % timeouts is not a fast resume path.
- **Do not assume per-command CLI is acceptable.** It cost an order of magnitude in the only provider where we measured both forms.
- **Do not assume "network is open" or "network is closed".** Our probes found three different regimes across six providers.
- **Do not assume a snapshot exists for free.** Daytona: 6.5–24.9 s to create one; instabox free plan can only create *from* a snapshot or the `agent-browser` template.
- **Do not assume runtime type from marketing.** Modal reports `Linux 4.19.0-gvisor`; Daytona's guest reported 48 cores for a billed 4-vCPU sandbox.

## 4. Measurement obligations on every adapter

Any adapter shipped for this project must emit, per run:

- `readyMs`, `execMs` (p50 needs ≥10 samples), `transferBytes`, `releasedConfirmed`
- declared capabilities from `describe()` attached to every result file's environment record
- explicit `unknown` rather than an inferred value for anything it did not measure

## 5. Open seams

- **Snapshot credential hygiene**: snapshots carry the filesystem. Before a snapshot is taken, the adapter must assert the box contains no long-lived credentials (env, `.npmrc`, `.git-credentials`, `~/.ssh`).
- **Cross-session consistency**: only Codespaces was measured across two independent sessions (191 ms both times). Daytona and LithosBox figures come from a single session each and must be repeated per `protocol.md` §6.
- **Cost accounting**: per-run cost needs `runningSeconds` + `transferBytes`; providers that expose usage APIs (instabox, LithosBox) should be preferred for that reason.
