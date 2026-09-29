import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("config/universe.json", "utf8"));

const fail = (message) => {
  console.error("CONFIG INVALID:", message);
  process.exit(1);
};

if (config.schema_version !== 1) fail("schema_version must be 1");
if (config.scope !== "core") fail("v1 scope must be core");
if (!Number.isInteger(config.max_passes) || config.max_passes < 1 || config.max_passes > 2) {
  fail("max_passes must be 1 or 2");
}
if (!Array.isArray(config.workflows) || config.workflows.length === 0) fail("workflows required");

const ids = new Set();
const targets = new Set();
const components = [];

for (const item of config.workflows) {
  for (const key of ["id", "repo", "workflow", "branch", "wave"]) {
    if (item[key] === undefined || item[key] === null || item[key] === "") fail(`missing ${key}`);
  }
  if (ids.has(item.id)) fail(`duplicate id ${item.id}`);
  ids.add(item.id);

  const target = `${item.repo}:${item.workflow}:${item.branch}`;
  if (targets.has(target)) fail(`duplicate workflow target ${target}`);
  targets.add(target);

  if (!Number.isInteger(item.wave) || item.wave < 1) fail(`invalid wave for ${item.id}`);
  if (!Array.isArray(item.components) || item.components.length === 0) fail(`components required for ${item.id}`);
  components.push(...item.components);
}

const expected = ["Concierge", "Defence", "Foundation", "L", "Me", "Shine AI"];
const actual = [...new Set(components)].sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  fail(`component set mismatch: ${actual.join(", ")}`);
}

console.log(`Config OK: ${config.workflows.length} workflow surfaces cover ${actual.length} core components.`);
