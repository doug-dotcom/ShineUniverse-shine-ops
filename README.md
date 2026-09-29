# Shine Universe Ops

Control-plane repository for the Shine Universe build fleet.

## Purpose

This repository turns Doug's room-level commands into one governed orchestration surface.

- `Go` = one core formation pass.
- `Go 2` = two sequential core formation passes.
- Each pass runs independent verification surfaces in parallel where safe.
- Pass 2 never starts if pass 1 fails.
- Every run emits a machine-readable receipt and a human-readable GitHub Actions summary.
- Shared CI surfaces are de-duplicated: Project L also certifies Me; Foundation also certifies Concierge.

## Current core map

| Surface | Repository | Workflow | Components |
| --- | --- | --- | --- |
| Project L | `doug-dotcom/Project-L-Modular` | `ci.yml` | L, Me |
| Shine AI | `doug-dotcom/Shine-Ai` | `ci.yml` | Shine AI |
| Defence | `doug-dotcom/ShineUniverse-shine-core` | `shine-defence-core.yml` | Defence |
| Foundation | `doug-dotcom/ShineUniverse-shine-core` | `shine-foundation.yml` | Foundation, Concierge |

Wave 1 runs Project L/Me, Shine AI and Defence. Wave 2 runs Foundation/Concierge after Wave 1 is green.

## Triggering

Primary mode is **Chat Control**: ChatGPT reads the manifest, writes one shared dispatch marker into the three target repositories, waits for the existing CI workflows, and records a consolidated receipt. This requires no cross-repository GitHub secret and means Doug can stay in one room.

An optional GitHub Actions autonomous mode remains available through manual `workflow_dispatch`. That mode requires a repository secret named `SHINE_UNIVERSE_TOKEN` with Actions write/read access to the target repositories and fails closed if the credential is absent.

## Safety

The dispatcher does not bypass any project CI. It only invokes the existing trusted workflows and waits for their conclusions. A failed or missing child run stops the formation before the next pass.


## App estate registry

The user-facing/product estate is tracked separately from the six-surface core dispatcher.

- `config/apps.json` is the authoritative production-source snapshot for the controlled app fleet.
- It records the real Railway repository/branch/service, active deployment, health path, product layer, runtime-provenance support and device-acceptance state.
- Review, validation and legacy Railway services are listed separately and are explicitly excluded from production health.
- `docs/APP_RELEASE_HEALTH_STANDARD.md` defines how product layer, CI, Defence, shared services, deployment and physical-device acceptance are kept separate.
- `receipts/device-acceptance-template.json` is the canonical human device-test receipt.

The registry is intentionally evidence-based. A review branch, successful build, simulated browser test or Railway service existing somewhere in the account is never promoted to production status without the matching production-source evidence.
