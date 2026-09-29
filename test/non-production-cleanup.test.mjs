import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const cleanup=JSON.parse(fs.readFileSync(new URL("../config/non-production-cleanup.json",import.meta.url),"utf8"));
const apps=JSON.parse(fs.readFileSync(new URL("../config/apps.json",import.meta.url),"utf8"));

test("cleanup manifest is non-destructive and never includes a production service",()=>{
  assert.equal(cleanup.schema_version,1);
  assert.equal(cleanup.destructive_action_performed,false);
  assert.equal(cleanup.summary.automatic_deletions,0);

  const productionIds=new Set(apps.apps.map(app=>app.railway.service_id));
  const all=[...cleanup.candidates,...cleanup.holds];
  const seen=new Set();

  for(const item of all){
    assert.ok(item.service_id);
    assert.ok(item.project_id);
    assert.ok(item.service_name);
    assert.equal(item.explicit_approval_required,true);
    assert.ok(!productionIds.has(item.service_id),`${item.service_name} is a production service`);
    assert.ok(!seen.has(item.service_id),`duplicate cleanup service ${item.service_id}`);
    seen.add(item.service_id);
    assert.match(item.latest_commit,/^[0-9a-f]{40}$/);
  }
});

test("retire candidates have no public domains",()=>{
  for(const item of cleanup.candidates){
    assert.deepEqual(item.domains,[]);
    assert.match(item.disposition,/^retire-candidate/);
  }
});

test("holds explain why automatic cleanup is blocked",()=>{
  assert.ok(cleanup.holds.length>0);
  for(const item of cleanup.holds){
    assert.match(item.disposition,/^hold-/);
    assert.ok(item.reason.length>20);
  }

  const legacy=cleanup.holds.find(item=>item.service_name==="Shine-L");
  assert.ok(legacy.domains.includes("shine-l-production.up.railway.app"));
  assert.equal(legacy.disposition,"hold-live-reference-migration");

  const fish=cleanup.holds.find(item=>item.service_name==="shine-fish-validation-temp");
  assert.equal(fish.disposition,"hold-staged-railway-change");
});
