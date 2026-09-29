import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const config = JSON.parse(fs.readFileSync("config/universe.json", "utf8"));

test("core formation covers all six conceptual components exactly once", () => {
  const components = config.workflows.flatMap((item) => item.components).sort();
  assert.deepEqual(components, ["Concierge", "Defence", "Foundation", "L", "Me", "Shine AI"]);
});

test("v1 uses four de-duplicated workflow surfaces", () => {
  assert.equal(config.workflows.length, 4);
  assert.equal(new Set(config.workflows.map((item) => `${item.repo}:${item.workflow}`)).size, 4);
});

test("formation is dependency ordered", () => {
  const wave1 = config.workflows.filter((item) => item.wave === 1).map((item) => item.id).sort();
  const wave2 = config.workflows.filter((item) => item.wave === 2).map((item) => item.id).sort();
  assert.deepEqual(wave1, ["defence", "project-l", "shine-ai"]);
  assert.deepEqual(wave2, ["foundation"]);
});

test("v1 caps a command at two passes", () => {
  assert.equal(config.max_passes, 2);
});
