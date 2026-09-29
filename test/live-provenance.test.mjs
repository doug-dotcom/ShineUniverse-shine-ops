import test from "node:test";
import assert from "node:assert/strict";
import { evaluateObservation, evaluateDevicePack, buildReport } from "../scripts/live-provenance.mjs";

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


const devicePack={
  app_id:"example",
  repository:"doug-dotcom/example",
  branch:"main",
  commit_sha:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  production_deployment_id:"deploy-1",
  status:"untested"
};

test("device pack is ready only when live production exactly matches its bound release",()=>{
  assert.deepEqual(
    evaluateDevicePack(devicePack,{reachable:true,http_status:200,headers:goodHeaders}),
    {status:"ready-for-human-test",reasons:[]}
  );
});

test("device pack becomes stale when production advances on the correct source",()=>{
  const result=evaluateDevicePack(devicePack,{
    reachable:true,
    http_status:200,
    headers:{
      ...goodHeaders,
      "x-shine-runtime-commit":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "x-shine-runtime-deployment":"deploy-2"
    }
  });
  assert.equal(result.status,"stale-release");
  assert.deepEqual(result.reasons,["commit-changed","deployment-changed"]);
});

test("device pack is blocked when production provenance is unhealthy",()=>{
  assert.equal(
    evaluateDevicePack(devicePack,{reachable:false,error:"timeout",headers:{}}).status,
    "blocked-runtime"
  );
  assert.equal(
    evaluateDevicePack(devicePack,{
      reachable:true,
      http_status:200,
      headers:{...goodHeaders,"x-shine-runtime-branch":"review"}
    }).status,
    "blocked-runtime"
  );
});

test("report summarises physical-device pack readiness independently from registry drift",async()=>{
  const registry={verified_at:"2026-09-29T00:00:00Z",apps:[app]};
  const response={status:200,headers:{get:name=>goodHeaders[name]??null}};
  const report=await buildReport(registry,{
    fetchImpl:async()=>response,
    timeoutMs:100,
    devicePacks:{generated_at:"2026-09-29T00:00:00Z",packs:[devicePack]}
  });
  assert.equal(report.schema_version,2);
  assert.equal(report.device_pack_ready_count,1);
  assert.equal(report.device_pack_stale_count,0);
  assert.equal(report.device_pack_blocked_count,0);
  assert.equal(report.results[0].device_pack.status,"ready-for-human-test");
});
