# Contributing

## Adding a backend

A backend is four hooks plus the environment record. No shared framework is required.

| Hook | Contract |
|---|---|
| `create(spec)` | Create the sandbox/VM with `cpus`, `memory_mb`, `image`; return a handle. Record wall time as `prepareMs`. |
| `exec(handle, argv, opts)` | Run one command, return `{stdout, stderr, exitCode}`. Shell features (pipes, redirects) must be explicit: pass a shell only when the workload needs one. |
| `upload(handle, bytes, remotePath)` | Send a payload (git bundle, fixture). Record `bytes`. |
| `destroy(handle)` | Release compute. Report honestly whether deletion was confirmed; do not report success on an unconfirmed delete. |

The runner must emit `results.jsonl` in the shape defined by `schema/results.schema.json`, with the environment record as the first line.

## Rules that are not negotiable

1. **No real credentials anywhere in the repository.** Not in code, not in fixtures, not in `results.jsonl`, not in commit messages.
2. **Synthetic fixtures only.** The W6 denial probes must use files you created for the test (a fake `~/.ssh` inside the fixture tree), never the operator's real keys.
3. **No guessing.** A provider value you did not read or measure is `null` with a `note`. Wrong numbers are worse than missing ones.
4. **Scrub before committing evidence.** No account IDs, no internal hostnames or private IPs, no host paths containing a username, no billing screenshots.
5. **Failed probes stay in the data.** Report `ok: false` with the reason. Do not delete a failing row to make a summary look clean.

## Reporting a result

- `p50` and `p95` (nearest-rank), `min`/`max`, and the attempt count.
- The environment block for every table.
- Link the raw `results.jsonl`.
- State explicitly which parts you did **not** verify.

## Licence

By contributing you agree your contribution is licensed under MIT.
