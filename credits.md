# Free tier and credits

What each provider gives you, and what it costs after that. Every row carries a `verification` value; `unverified` means the number came from an owner/customer statement and has not been confirmed on the provider's own page.

`observedAt: 2026-10-21`. Providers change terms without notice — always re-check before relying on a number here.

## Summary

| Provider | Free / credits | Card required | Billing unit | Verification |
|---|---|---|---|---|
| Daytona | $200 compute | No | per second | verified (pricing page) |
| E2B | $100 one-time usage | No | per second | verified (pricing page) |
| Modal | $30 / month, recurring | No | per second | verified (pricing page) |
| Docker Sandbox Cloud | $250 usage credit | **Yes** | per second | **unverified** (owner-stated) |
| instabox | 5 machines × 4 vCPU / 8 GB | No | not published | verified (pricing page), concurrency limit unverified |
| LithosBox (lithosai) | none published | n/a | per minute, CPU + memory + storage | verified (docs: "pricing agreement") |

## Published rates

| Provider | vCPU | Memory | Storage | Notes |
|---|---|---|---|---|
| Daytona | $0.0504 / vCPU-hour | $0.0162 / GiB-hour | $0.000108 / GiB-hour | first 5 GiB storage free |
| E2B | $0.000014 / vCPU-second (= $0.0504/h) | $0.0000045 / GiB-second (= $0.0162/h) | included | sandboxes are CPU-only; 1–8 vCPU, 1–8 GiB |
| Modal | per-second CPU | per-second memory | volumes up to 1 TiB included in Starter | GPU rates are separate |
| Docker Sandbox Cloud | — | — | — | observed rate $0.00007778/s (=$0.28/h at 4 vCPU / 8 GiB) |
| instabox | fixed plan (4 vCPU / 8 GB) | fixed plan | /data volume | free tier records `runningSeconds` / `vcpuSeconds` / `memGiBSeconds` |
| LithosBox | — | — | — | usage is metered per minute; charged per account agreement |

## Cost per verification run

Reference workload: 2 vCPU / 4 GiB / 3 minutes.

- Daytona or E2B at those rates: `2 × 0.0504/60 × 3 + 4 × 0.0162/60 × 3` ≈ **$0.008**
- 1,000 runs ≈ **$8**
- Docker Sandbox Cloud at 4 vCPU / 8 GiB: **$0.28/h** ≈ $201/month if left running

Break-even against a self-hosted 4 vCPU / 8 GiB VM (list price ~$0.055/h, ≈ $40–48/month): roughly **145 machine-hours per month**. Below that, free credits plus per-second billing are cheaper than owning the box.

## Docker $250 — status

Owner-stated 2026-10-21: **$250 in usage credits, credit card verification required**. Not confirmed on Docker's public pricing page.

Independent observation from this repo: an account showed `Available to spend $89.20` with a verified rate line of `$0.00007778/s` (`packages/agent-runtime/dockerBrowserQuota.test.ts:68`). That is a balance snapshot at one point in time, not a contradiction of the $250 grant.

## Unverified items (do not treat as facts)

- instabox: real concurrency ceiling; whether `/usr` changes survive stop/start; whether stopped machines are billed.
- Modal and instabox: whether a card is required (not checked).
- Daytona, E2B, Modal: whether outbound network can be denied per sandbox.
