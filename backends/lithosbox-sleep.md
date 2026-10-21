# LithosBox — sleep behaviour (measured 2026-10-21)

Probe: `POST /vms` (2 vCPU / 1024 MB) → one `exec` → **no processes left running** → poll `GET /vms/{id}` every 15 s → resume.

## Timeline

| t | state |
|---|---|
| 0 s | `running` (create returned in 887 ms) |
| +15 s | `running` |
| +30 s | `running` |
| +45 s | `running` |
| **+60 s** | `running` |
| **+75 s** | **`slept`** |
| +90 s | `slept` |

Resume: `exec` immediately after 90 s of sleep took **630 ms**, against a **625 ms** warm baseline measured before the idle window. No wake penalty, no visible warm-up. The following call was 627 ms.

## With a background process

Second run, same probe but with `for i in $(seq 1 200); do echo ... >> /tmp/beat.log; sleep 1; done &` left running:

- state stayed `running` at 15 / 30 / 45 / 60 / 75 / 90 s — **it never slept**
- the loop kept writing: **95 lines in 90 s** (≈1/s), timestamps contiguous
- resume call after the window: 675 ms

Conclusion: an active background process keeps the sandbox awake. Long builds and long test runs are not frozen mid-flight.

## Sleep is billed

`GET /usage` for the same window, split by state:

| state | cpu_seconds | memory_mb_seconds | vm_seconds |
|---|---|---|---|
| creating | 2 | 2,048 | 1 |
| running | 482 | 354,304 | 241 |
| **slept** | **24** | **12,288** | **12** |
| deleting | 8 | 6,144 | 4 |

Auto-sleep stops CPU burn but **memory and machine time keep accruing**. A ten-minute model pause at 1 GiB is ≈ 600,000 MB·s of memory billing — the same order as leaving the box running, minus CPU.

## Design consequence

- **< 60 s gap**: do nothing; every measured provider keeps the box alive and wake cost is zero.
- **1–10 min gap**: sleeping is *not* a cost saving. Choose on wake latency, not on sleep.
- **> 10 min gap**: the only real saving is `snapshot → destroy → restore`, trading memory billing for storage billing.

A session registry therefore has to store `snapshotId` and `lastActiveAt` next to `boxId`, with a policy: `idle > N minutes → snapshot and destroy`.
