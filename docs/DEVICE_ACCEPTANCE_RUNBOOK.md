# Physical Device Acceptance Runbook

This runbook is for real-phone validation only. Automated CI, browser emulation, Railway health checks and live provenance do **not** count as physical-device acceptance.

## Source of truth

- Queue: `config/device-acceptance-queue.json`
- Bound test packs: `config/device-acceptance-packs.json`
- Release registry: `config/apps.json`
- Standard: `docs/APP_RELEASE_HEALTH_STANDARD.md`

A test is valid only for the exact commit and Railway deployment recorded in the pack. If production changes before or after testing, re-bind the pack to the new release and retest.

## Test sequence

1. Confirm the app URL and the exact release bound in the pack.
2. Record the real device, OS version and browser.
3. Run the app-specific focus checks.
4. Run every universal check in the pack.
5. Record permission grant **and** denial/recovery for any hardware capability the app uses.
6. Verify failed writes, timeouts and interrupted journeys never report fake success.
7. Record notes and blockers while reproducing them.
8. Finish with one overall state only:
   - `pass` — every required check passed on the bound release;
   - `partial` — useful coverage completed but one or more required checks remain untested;
   - `fail` — a required user journey or safety/integrity behaviour failed;
   - `superseded` — production moved to a different commit/deployment before acceptance was completed.

## Minimum mobile matrix

- real iPhone + Safari
- real iPhone Home Screen/PWA when applicable
- real Android + Chrome before broad public release

Desktop checks may supplement this matrix but never replace it for consumer mobile apps.

## Evidence rule

A phone test receipt should identify:
- app and product layer;
- repository and branch;
- exact commit;
- exact Railway deployment;
- device model;
- OS version;
- browser and version where visible;
- tester;
- tested time;
- pass/fail/partial status for each check;
- blockers and reproduction notes.

Never round an untested item to green.
