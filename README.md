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

The control workflow can be started manually from GitHub Actions or by committing a new `requests/go.json` request. ChatGPT can update that request file from the control room, so the user does not need to visit each project room.

Cross-repository workflow dispatch requires a repository secret named `SHINE_UNIVERSE_TOKEN` with Actions write/read access to the target repositories. The workflow fails closed if that credential is absent.

## Safety

The dispatcher does not bypass any project CI. It only invokes the existing trusted workflows and waits for their conclusions. A failed or missing child run stops the formation before the next pass.
