import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const apps=JSON.parse(fs.readFileSync(new URL("../config/apps.json",import.meta.url),"utf8"));
const queue=JSON.parse(fs.readFileSync(new URL("../config/device-acceptance-queue.json",import.meta.url),"utf8"));
const packs=JSON.parse(fs.readFileSync(new URL("../config/device-acceptance-packs.json",import.meta.url),"utf8"));

test("device packs bind every queued app to the exact current production release",()=>{
  assert.equal(packs.schema_version,1);
  assert.equal(packs.packs.length,queue.entries.length);
  const queueIds=queue.entries.map(e=>e.app);
  assert.deepEqual(packs.packs.map(p=>p.app_id),queueIds);

  for(const pack of packs.packs){
    const app=apps.apps.find(a=>a.id===pack.app_id);
    const queued=queue.entries.find(e=>e.app===pack.app_id);
    assert.ok(app,pack.app_id);
    assert.ok(queued,pack.app_id);
    assert.equal(pack.repository,app.repository);
    assert.equal(pack.branch,app.production_branch);
    assert.equal(pack.commit_sha,app.railway.active_deployment.commit_sha);
    assert.equal(pack.production_deployment_id,app.railway.active_deployment.id);
    assert.equal(pack.production_domain,app.railway.domains[0]);
    assert.equal(pack.health_path,app.railway.health_path);
    assert.equal(pack.product_layer,app.product_layer);
    assert.deepEqual(pack.focus,queued.focus);
  }
});

test("no device pack is pre-passed",()=>{
  for(const pack of packs.packs){
    assert.equal(pack.status,"untested");
    assert.equal(pack.tested_at,null);
    assert.equal(pack.tester,null);
    assert.deepEqual(pack.devices,[]);
    assert.ok(pack.checks.length>=10);
    for(const check of pack.checks) assert.equal(check.status,"untested");
  }
});

test("device packs require real mobile targets and fail-safe result states",()=>{
  assert.ok(packs.status_values.includes("superseded"));
  assert.ok(packs.status_values.includes("partial"));
  assert.ok(packs.status_values.includes("fail"));
  for(const pack of packs.packs){
    assert.ok(pack.targets.some(t=>/iPhone/i.test(t)));
    assert.ok(pack.targets.some(t=>/Android/i.test(t)));
    assert.ok(pack.checks.some(c=>/failed writes/i.test(c.name)));
    assert.ok(pack.checks.some(c=>/permission/i.test(c.name)));
  }
});

test("a production move makes a stale pack detectable",()=>{
  const example=packs.packs[0];
  const app=apps.apps.find(a=>a.id===example.app_id);
  assert.equal(example.commit_sha,app.railway.active_deployment.commit_sha);
  assert.equal(example.production_deployment_id,app.railway.active_deployment.id);
});
