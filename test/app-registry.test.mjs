import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const registry = JSON.parse(fs.readFileSync(new URL("../config/apps.json", import.meta.url), "utf8"));

const SHA = /^[0-9a-f]{40}$/;
const allowedDeviceStates = new Set([
  "outstanding",
  "unknown",
  "separate-user-surface",
  "not-applicable"
]);

test("app production registry has one valid entry per controlled production app", () => {
  assert.equal(registry.schema_version, 1);
  assert.ok(Date.parse(registry.verified_at));
  assert.equal(registry.apps.length, 13);

  const ids = new Set();
  const productionServices = new Set();

  for (const app of registry.apps) {
    assert.ok(app.id);
    assert.ok(app.name);
    assert.match(app.repository, /^doug-dotcom\/[A-Za-z0-9_.-]+$/);
    assert.ok(app.production_branch);
    assert.ok(Number.isInteger(app.product_layer) && app.product_layer > 0);
    assert.equal(app.runtime_provenance_headers, true);
    assert.ok(allowedDeviceStates.has(app.device_acceptance));

    assert.ok(!ids.has(app.id), `duplicate app id ${app.id}`);
    ids.add(app.id);

    const railway = app.railway;
    for (const key of ["project_id", "service_id", "service_name", "environment_id", "health_path"]) {
      assert.ok(railway[key], `${app.id} missing railway.${key}`);
    }
    assert.ok(Array.isArray(railway.domains) && railway.domains.length > 0);
    assert.ok(railway.health_path.startsWith("/"));
    assert.ok(["SUCCESS", "SLEEPING"].includes(railway.active_deployment.status));
    assert.match(railway.active_deployment.commit_sha, SHA);
    assert.ok(railway.active_deployment.id);

    assert.ok(!productionServices.has(railway.service_id), `duplicate production service ${railway.service_id}`);
    productionServices.add(railway.service_id);
  }

  assert.equal(ids.size, 13);
});

test("non-production surfaces are explicitly excluded from production health", () => {
  const productionNames = new Set(registry.apps.map((app) => app.railway.service_name));

  assert.ok(registry.non_production_surfaces.length > 0);
  for (const surface of registry.non_production_surfaces) {
    assert.equal(surface.excluded_from_production_health, true);
    assert.ok(surface.family);
    assert.ok(surface.railway_project_id);
    assert.ok(Array.isArray(surface.services) && surface.services.length > 0);
    for (const service of surface.services) {
      assert.ok(!productionNames.has(service), `${service} appears in both production and non-production sets`);
    }
  }
});

test("special release scopes cannot be mistaken for full public apps", () => {
  const dnd = registry.apps.find((app) => app.id === "shine-dnd");
  assert.equal(dnd.production_scope, "capability-only");
  assert.equal(dnd.full_app_live, false);

  const ai = registry.apps.find((app) => app.id === "shine-ai");
  assert.equal(ai.production_scope, "backend-service");
  assert.equal(ai.device_acceptance, "not-applicable");

  const wellness = registry.pending_apps.find((app) => app.id === "shine-wellness");
  assert.equal(wellness.status, "awaiting-stable-product-head");
});
