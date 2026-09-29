import fs from "node:fs";
import { pathToFileURL } from "node:url";

const RESULT_STATES=new Set(["untested","in-progress","pass","partial","fail","superseded"]);
const CHECK_STATES=new Set(["untested","pass","fail","not-applicable"]);

function issue(path,message){ return {path,message}; }

export function validatePack(pack){
  const issues=[];
  if(!RESULT_STATES.has(pack.status)) issues.push(issue("status","invalid overall status"));
  if(!Array.isArray(pack.checks)||pack.checks.length===0) issues.push(issue("checks","universal checks required"));
  if(!Array.isArray(pack.focus_checks)||pack.focus_checks.length===0) issues.push(issue("focus_checks","app-specific focus checks required"));

  const allChecks=[
    ...(Array.isArray(pack.checks)?pack.checks.map(c=>({kind:"checks",...c})):[]),
    ...(Array.isArray(pack.focus_checks)?pack.focus_checks.map(c=>({kind:"focus_checks",...c})):[])
  ];

  for(const [index,check] of allChecks.entries()){
    if(!check.name) issues.push(issue(`check[${index}].name`,"check name required"));
    if(!CHECK_STATES.has(check.status)) issues.push(issue(`check[${index}].status`,"invalid check status"));
    if(!Array.isArray(check.notes)) issues.push(issue(`check[${index}].notes`,"notes must be an array"));
  }

  const passCount=allChecks.filter(c=>c.status==="pass"||c.status==="not-applicable").length;
  const failCount=allChecks.filter(c=>c.status==="fail").length;
  const pendingCount=allChecks.filter(c=>c.status==="untested").length;
  const blockers=Array.isArray(pack.blockers)?pack.blockers:[];

  if(pack.status==="untested"){
    if(pack.tested_at!==null) issues.push(issue("tested_at","untested pack cannot have tested_at"));
    if(pack.tester!==null) issues.push(issue("tester","untested pack cannot have tester"));
    if(Array.isArray(pack.devices)&&pack.devices.length>0) issues.push(issue("devices","untested pack cannot contain device evidence"));
    if(allChecks.some(c=>c.status!=="untested")) issues.push(issue("checks","untested pack cannot contain completed checks"));
  }

  if(["in-progress","pass","partial","fail"].includes(pack.status)){
    if(!pack.tested_at||Number.isNaN(Date.parse(pack.tested_at))) issues.push(issue("tested_at","tested timestamp required"));
    if(!pack.tester||typeof pack.tester!=="string") issues.push(issue("tester","tester required"));
    if(!Array.isArray(pack.devices)||pack.devices.length===0) issues.push(issue("devices","at least one real device record required"));
  }

  if(pack.status==="pass"){
    if(failCount>0) issues.push(issue("checks","pass cannot contain failed checks"));
    if(pendingCount>0) issues.push(issue("checks","pass cannot contain untested checks"));
    if(passCount!==allChecks.length) issues.push(issue("checks","every check must be pass or not-applicable"));
    if(blockers.length>0) issues.push(issue("blockers","pass cannot contain blockers"));
  }

  if(pack.status==="partial"){
    if(passCount===0) issues.push(issue("checks","partial requires at least one completed passing check"));
    if(pendingCount===0&&failCount===0&&blockers.length===0) issues.push(issue("checks","partial requires unfinished or failed evidence"));
  }

  if(pack.status==="fail"){
    if(failCount===0&&blockers.length===0) issues.push(issue("checks","fail requires a failed check or blocker"));
  }

  if(pack.status==="superseded"){
    const notes=Array.isArray(pack.notes)?pack.notes:[];
    if(notes.length===0&&blockers.length===0) issues.push(issue("notes","superseded pack requires a reason"));
  }

  return issues;
}

export function validateDeviceAcceptance(config){
  const issues=[];
  if(config.schema_version!==2) issues.push(issue("schema_version","must be 2"));
  if(!Array.isArray(config.packs)||config.packs.length===0) issues.push(issue("packs","packs required"));
  for(const pack of config.packs||[]){
    for(const problem of validatePack(pack)){
      issues.push(issue(`${pack.app_id}.${problem.path}`,problem.message));
    }
  }
  return issues;
}

function main(){
  const file=process.argv[2]||"config/device-acceptance-packs.json";
  const config=JSON.parse(fs.readFileSync(file,"utf8"));
  const issues=validateDeviceAcceptance(config);
  if(issues.length){
    for(const problem of issues) console.error(`DEVICE ACCEPTANCE INVALID: ${problem.path}: ${problem.message}`);
    process.exitCode=1;
    return;
  }
  console.log(`Device acceptance evidence OK: ${config.packs.length} packs validated; no false-green receipt states detected.`);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) main();
