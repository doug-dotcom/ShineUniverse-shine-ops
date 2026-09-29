import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const apps=JSON.parse(fs.readFileSync(new URL("../config/apps.json",import.meta.url),"utf8"));
const gates=JSON.parse(fs.readFileSync(new URL("../config/release-gates.json",import.meta.url),"utf8"));
const queue=JSON.parse(fs.readFileSync(new URL("../config/device-acceptance-queue.json",import.meta.url),"utf8"));

test("release gate matrix covers the full registered estate exactly once",()=>{
  const registered=new Set(apps.apps.map(a=>a.id));
  const ids=gates.entries.map(e=>e.app);
  assert.equal(ids.length,registered.size);
  assert.equal(new Set(ids).size,ids.length);
  for(const id of ids) assert.ok(registered.has(id),id);
  assert.equal(gates.summary.registered_entries,registered.size);
  assert.equal(gates.summary.app_level_open_release_gate_gaps,0);
});

test("all live app-level production scopes are release-gated",()=>{
  const allowed=new Set(["converged","converged-for-capability-only","core-managed"]);
  for(const entry of gates.entries){
    assert.ok(allowed.has(entry.state),entry.app);
    assert.ok(entry.coverage.length>0,entry.app);
    assert.ok(entry.evidence.length>20,entry.app);
  }
  assert.equal(gates.entries.filter(e=>e.state==="converged").length,10);
  assert.equal(gates.entries.filter(e=>e.state==="converged-for-capability-only").length,1);
  assert.equal(gates.entries.filter(e=>e.state==="core-managed").length,2);
});

test("device queue contains only human-testable live user surfaces and none are pre-passed",()=>{
  const queued=queue.entries.map(e=>e.app);
  assert.equal(queued.length,10);
  assert.equal(new Set(queued).size,queued.length);
  for(const item of queue.entries){
    const app=apps.apps.find(a=>a.id===item.app);
    assert.ok(app,item.app);
    assert.equal(item.status,"untested");
    assert.ok(item.focus.length>=4,item.app);
    assert.ok(!["backend-service","capability-only","companion-backend"].includes(app.production_scope),item.app);
  }
  assert.deepEqual(queue.entries.map(e=>e.order),[1,2,3,4,5,6,7,8,9,10]);
});

test("D&D, Project L and Shine AI are explicitly excluded for truthful reasons",()=>{
  const exclusions=new Map(queue.excluded.map(e=>[e.app,e.reason]));
  assert.match(exclusions.get("shine-dnd"),/not live/i);
  assert.match(exclusions.get("project-l"),/backend/i);
  assert.match(exclusions.get("shine-ai"),/not applicable/i);
});
