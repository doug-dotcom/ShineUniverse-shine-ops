# Chat Control protocol

This is the primary one-room dispatcher for the Shine Universe.

## Command mapping

- **Go**: one governed core formation pass.
- **Go 2**: two sequential passes, capped at two in v1.
- **Status**: inspect only; do not mutate repositories.

## Core dispatch groups

A pass writes the same request identity to three repository-local marker files:

1. `doug-dotcom/Project-L-Modular/.shine-universe/dispatch.json`
   - covers **L + Me**
   - required workflow: `ci.yml`
2. `doug-dotcom/Shine-Ai/.shine-universe/dispatch.json`
   - covers **Shine AI**
   - required workflow: `ci.yml`
3. `doug-dotcom/ShineUniverse-shine-core/.shine-universe/dispatch.json`
   - covers **Foundation + Concierge + Defence**
   - required workflows: `shine-foundation.yml` and `shine-defence-core.yml`

The marker commit itself is intentionally non-semantic; its job is to trigger the existing trusted CI on `main`.

## Gate

For each pass:

1. write all three markers with the same request ID and pass number;
2. capture each resulting commit SHA;
3. wait for every required workflow on those SHAs;
4. require `conclusion=success` for all four workflow surfaces;
5. only then may the next pass begin;
6. write a consolidated receipt into this repository.

If any required workflow fails, is cancelled, or cannot be matched to the marker commit, the pass is not green and the next pass must not start.

## Build work versus verification

The dispatch marker accelerates **coordination and verification**. It does not invent product work by itself. Actual layer changes still have to be chosen and implemented in the target repositories; Chat Control can coordinate those changes from one room and then use this protocol as the common close-out gate.
