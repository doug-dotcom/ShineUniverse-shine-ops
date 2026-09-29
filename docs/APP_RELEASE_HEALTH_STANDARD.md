# Shine app release-health standard

This document is the shared control-room contract for Shine user-facing apps.

A product layer number is not a release-health result. Each app is tracked across independent coordinates so development progress, CI, deployment and real-device acceptance cannot be confused with one another.

## Required release coordinates

Every controlled app should expose or record:

1. **Product head** — current meaningful product layer/version.
2. **Canonical source** — repository and branch that contain that product head.
3. **CI / test result** — the exact commit that was verified and the required workflow conclusion.
4. **Shine Defence result** — where Defence applies, its certification/attestation state for the same release line.
5. **Foundation / shared-service result** — where the app depends on Foundation, Shine AI, Concierge or another shared service, the relevant capability check.
6. **Production source** — the repository, branch and commit Railway or another host actually deployed.
7. **Deployment result** — deployment ID/status plus a working health endpoint where available.
8. **Physical-device acceptance** — a human-observed device receipt, not a simulated-browser claim.

## Health rules

- **Green** means the evidence for that coordinate is explicitly present and successful.
- **Red** means a required check failed or the deployed source is known to be wrong.
- **Untested** means there is no qualifying evidence yet. Untested is never silently promoted to green.
- A successful Railway deployment proves that the host accepted and started that build; it does not by itself prove the product works correctly.
- A passing DOM, browser simulation or unit test does not count as physical-device acceptance.
- A development/review branch must not be reported as production unless the production service actually tracks it.
- If the production branch is different from the most advanced development branch, both positions must be recorded.

## Minimum physical-device acceptance

The receipt must identify the release commit/branch and the actual device/browser used.

### Core journey

- cold launch;
- reload/reopen;
- primary user journey from start to successful completion;
- save/write confirmation where the product writes data;
- reopen and confirm persisted state;
- recover gracefully from one interrupted or failed operation;
- navigate away and return without stale or misleading state.

### Phone interaction

- representative narrow-screen layout;
- touch targets usable without accidental neighbouring actions;
- keyboard does not hide the active control or primary action;
- focus returns to a sensible location after dialogs, errors and navigation;
- portrait orientation works; landscape is checked where the app supports or is likely to be used in it;
- text enlargement does not make the primary flow unusable.

### Network and lifecycle

Where relevant:

- normal connection;
- slow/interrupted connection;
- offline or flight-mode behaviour;
- background/resume;
- process termination and cold reopen;
- installed Home Screen/PWA launch.

The receipt must distinguish **supported**, **gracefully unavailable**, and **not applicable**. An app does not need to pretend an offline feature exists if it does not.

### Permissions and hardware

Only test capabilities the app actually uses, but test both grant and denial/recovery paths:

- microphone;
- camera;
- location;
- file picker/upload;
- notifications;
- Bluetooth or other specialist hardware.

A simulator cannot certify microphone quality, camera behaviour, permission dialogs, Home Screen lifecycle or similar hardware/platform behaviour.

### Data safety

For apps that store personal/user data:

- save and reload;
- edit conflict/stale-state path where supported;
- backup/export where supported;
- restore/import where supported;
- failed write does not masquerade as success;
- browser/device clearing risk is accurately communicated when storage is device-local.

## Standard receipt

A device acceptance receipt should contain, at minimum:

```json
{
  "schema_version": 1,
  "app": "Shine Example",
  "product_layer": 123,
  "repository": "doug-dotcom/example",
  "branch": "main",
  "commit_sha": "40-character-sha",
  "production_deployment_id": "deployment-id-or-null",
  "tested_at": "ISO-8601 timestamp",
  "tester": "human identifier",
  "devices": [
    {
      "device": "iPhone model",
      "os": "iOS version",
      "browser_or_mode": "Safari / Home Screen",
      "core_journey": "pass",
      "lifecycle": "pass",
      "permissions": "pass|not_applicable",
      "data_safety": "pass",
      "notes": []
    }
  ],
  "overall": "pass|fail|partial",
  "outstanding": []
}
```

The control room records **partial** when some required target devices or workflows remain untested.

## Default target matrix

For a general consumer Shine web app:

- real iPhone + Safari;
- real iPhone Home Screen mode when installable/PWA behaviour is part of the product;
- real Android + Chrome before broad public release;
- desktop browser only when the app exposes a meaningful desktop workflow.

An app may narrow this matrix when its product scope explicitly targets fewer platforms, but that exception must be recorded.

## Close-out gate

A user-facing release can be described as fully accepted only when:

1. the canonical product commit is known;
2. required CI/tests are green;
3. required Defence/shared-service gates are green;
4. production is running the intended source commit;
5. the required physical-device receipt is complete.

Anything else is reported by its actual state rather than rounded up.
