import test from "node:test";
import assert from "node:assert/strict";
import { evaluateObservation, buildReport } from "../scripts/live-provenance.mjs";

const app={
  id:"example",
  name:"Example",
  repository:"doug-dotcom/example",
  production_branch:"main",
  railway:{
    service_name:"example-service",
    health_path:"/health",
    domains:["example.test"],
    active_deployment:{
      id:"deploy-1",
      commit_sha:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  }
};

const goodHeaders={
  "x-shine-runtime-provider":"railway",
  "x-shine-runtime-repository":"doug-dotcom/example",
  "x-shine-runtime-commit":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "x-shine-runtime-branch":"main",
  "x-shine-runtime-deployment":"deploy-1",
  "x-shine-runtime-service":"example-service",
  "x-shine-runtime-environment":"production"
};

test("matching live provenance is green",()=>{
  assert.deepEqual(
    evaluateObservation(app,{reachable:true,http_status:200,headers:goodHeaders}),
    {status:"ok",severe:false,reasons:[]}
  );
});

test("new commit on the same production source is non-severe snapshot drift",()=>{
  const headers={...goodHeaders,
    "x-shine-runtime-commit":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "x-shine-runtime-deployment":"deploy-2"
  };
  const result=evaluateObservation(app,{reachable:true,http_status:200,headers});
  assert.equal(result.status,"snapshot-drift");
  assert.equal(result.severe,false);
  assert.deepEqual(result.reasons,["commit-snapshot-drift","deployment-snapshot-drift"]);
});

test("wrong branch is severe source drift",()=>{
  const result=evaluateObservation(app,{reachable:true,http_status:200,headers:{...goodHeaders,"x-shine-runtime-branch":"review"}});
  assert.equal(result.status,"source-drift");
  assert.equal(result.severe,true);
  assert.ok(result.reasons.includes("branch-mismatch"));
});

test("missing provenance and unreachable health fail closed",()=>{
  assert.equal(evaluateObservation(app,{reachable:true,http_status:200,headers:{}}).status,"missing-provenance");
  assert.equal(evaluateObservation(app,{reachable:false,error:"timeout",headers:{}}).status,"unreachable");
});

test("report observes all registered apps and summarises drift",async()=>{
  const registry={verified_at:"2026-09-29T00:00:00Z",apps:[app]};
  const response={
    status:200,
    headers:{get:name=>({
      ...goodHeaders,
      "x-shine-runtime-commit":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    })[name]??null}
  };
  const report=await buildReport(registry,{fetchImpl:async()=>response,timeoutMs:100});
  assert.equal(report.total,1);
  assert.equal(report.severe_count,0);
  assert.equal(report.snapshot_drift_count,1);
  assert.equal(report.counts["snapshot-drift"],1);
});
