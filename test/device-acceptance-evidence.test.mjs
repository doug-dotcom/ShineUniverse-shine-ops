import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {validatePack,validateDeviceAcceptance} from "../scripts/validate-device-acceptance.mjs";

const config=JSON.parse(fs.readFileSync(new URL("../config/device-acceptance-packs.json",import.meta.url),"utf8"));

function clone(value){ return JSON.parse(JSON.stringify(value)); }

test("current Wave 1 packs are valid and remain untested",()=>{
  const issues=validateDeviceAcceptance(config);
  assert.deepEqual(issues,[]);
  assert.equal(config.schema_version,2);
  assert.equal(config.packs.length,10);
  for(const pack of config.packs){
    assert.equal(pack.status,"untested");
    assert.ok(pack.focus_checks.length>0);
    assert.ok(pack.focus_checks.every(c=>c.status==="untested"));
  }
});

test("pass is rejected without complete real-device evidence",()=>{
  const pack=clone(config.packs[0]);
  pack.status="pass";
  const issues=validatePack(pack).map(x=>x.message);
  assert.ok(issues.includes("tested timestamp required"));
  assert.ok(issues.includes("tester required"));
  assert.ok(issues.includes("at least one real device record required"));
  assert.ok(issues.includes("pass cannot contain untested checks"));
});

test("pass is valid only after every required check is explicit",()=>{
  const pack=clone(config.packs[0]);
  pack.status="pass";
  pack.tested_at="2026-09-29T23:59:00+10:00";
  pack.tester="human-tester";
  pack.devices=[{device:"real iPhone",os:"iOS",browser:"Safari"}];
  pack.checks=pack.checks.map(c=>({...c,status:"pass"}));
  pack.focus_checks=pack.focus_checks.map(c=>({...c,status:"pass"}));
  assert.deepEqual(validatePack(pack),[]);
});

test("partial and fail require evidence rather than labels",()=>{
  const partial=clone(config.packs[0]);
  partial.status="partial";
  partial.tested_at="2026-09-29T23:59:00+10:00";
  partial.tester="human-tester";
  partial.devices=[{device:"real iPhone",os:"iOS",browser:"Safari"}];
  assert.ok(validatePack(partial).some(x=>x.message==="partial requires at least one completed passing check"));

  const failed=clone(config.packs[0]);
  failed.status="fail";
  failed.tested_at="2026-09-29T23:59:00+10:00";
  failed.tester="human-tester";
  failed.devices=[{device:"real iPhone",os:"iOS",browser:"Safari"}];
  assert.ok(validatePack(failed).some(x=>x.message==="fail requires a failed check or blocker"));
});

test("superseded requires an audit reason",()=>{
  const pack=clone(config.packs[0]);
  pack.status="superseded";
  pack.notes=[];
  pack.blockers=[];
  assert.ok(validatePack(pack).some(x=>x.message==="superseded pack requires a reason"));
});
