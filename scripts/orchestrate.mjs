import crypto from "node:crypto";
import fs from "node:fs/promises";
import process from "node:process";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return "";
  return process.argv[index + 1] ?? "";
}

async function readJson(path) {
  return JSON.parse(await fs.readFile(path, "utf8"));
}

async function api(path, { method = "GET", body } = {}) {
  const token = process.env.SHINE_UNIVERSE_TOKEN || process.env.GH_TOKEN;
  if (!token) throw new Error("SHINE_UNIVERSE_TOKEN is not configured");

  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "shine-universe-ops"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GitHub API ${method} ${path} failed (${response.status}): ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function dispatch(target, orchestrationId, pass) {
  const dispatchedAt = new Date().toISOString();
  await api(
    `/repos/${target.repo}/actions/workflows/${encodeURIComponent(target.workflow)}/dispatches`,
    {
      method: "POST",
      body: {
        ref: target.branch,
        inputs: {
          orchestration_id: orchestrationId,
          pass: String(pass)
        }
      }
    }
  );
  return { target, dispatchedAt };
}

async function findRun(launch, orchestrationId) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const data = await api(
      `/repos/${launch.target.repo}/actions/workflows/${encodeURIComponent(launch.target.workflow)}/runs?event=workflow_dispatch&branch=${encodeURIComponent(launch.target.branch)}&per_page=20`
    );
    const run = (data.workflow_runs ?? []).find((candidate) =>
      String(candidate.display_title ?? candidate.name ?? "").includes(orchestrationId)
    );
    if (run) return run;
    await sleep(5000);
  }
  throw new Error(`Timed out waiting for dispatched run: ${launch.target.id}`);
}

async function waitForCompletion(target, run) {
  for (let attempt = 0; attempt < 480; attempt += 1) {
    const current = await api(`/repos/${target.repo}/actions/runs/${run.id}`);
    if (current.status === "completed") {
      return {
        id: target.id,
        repo: target.repo,
        workflow: target.workflow,
        components: target.components,
        wave: target.wave,
        run_id: current.id,
        run_number: current.run_number,
        run_url: current.html_url,
        head_sha: current.head_sha,
        status: current.status,
        conclusion: current.conclusion,
        created_at: current.created_at,
        updated_at: current.updated_at
      };
    }
    await sleep(5000);
  }
  throw new Error(`Timed out waiting for completion: ${target.id}`);
}

async function runWave(targets, orchestrationId, pass) {
  const launches = await Promise.all(targets.map((target) => dispatch(target, orchestrationId, pass)));
  const discovered = await Promise.all(launches.map((launch) => findRun(launch, orchestrationId)));
  const results = await Promise.all(
    discovered.map((run, index) => waitForCompletion(targets[index], run))
  );
  const ok = results.every((item) => item.conclusion === "success");
  return { ok, results };
}

function buildSummary(receipt) {
  const lines = [
    "# Shine Universe formation receipt",
    "",
    `**Status:** ${receipt.status}`,
    `**Passes requested:** ${receipt.passes_requested}`,
    `**Passes completed:** ${receipt.passes_completed}`,
    `**Receipt hash:** \`${receipt.receipt_hash}\``,
    ""
  ];

  for (const pass of receipt.passes) {
    lines.push(`## Pass ${pass.pass}`, "");
    lines.push("| Wave | Surface | Components | Conclusion | Run |", "| ---: | --- | --- | --- | --- |");
    for (const wave of pass.waves) {
      for (const run of wave.runs) {
        lines.push(
          `| ${wave.wave} | ${run.id} | ${run.components.join(", ")} | ${run.conclusion} | [#${run.run_number}](${run.run_url}) |`
        );
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function writeReceipt(receipt) {
  await fs.mkdir("receipts", { recursive: true });
  const unsigned = { ...receipt };
  delete unsigned.receipt_hash;
  receipt.receipt_hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(unsigned))
    .digest("hex");

  await fs.writeFile("receipts/universe-receipt.json", JSON.stringify(receipt, null, 2) + "\n");

  if (process.env.GITHUB_STEP_SUMMARY) {
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, buildSummary(receipt) + "\n");
  }
}

async function main() {
  const config = await readJson("config/universe.json");
  const request = await readJson("requests/go.json");
  const requested = readArg("--passes").trim();
  const passes = Number(requested || request.passes || 1);

  if (!Number.isInteger(passes) || passes < 1 || passes > config.max_passes) {
    throw new Error(`passes must be between 1 and ${config.max_passes}`);
  }
  if (!(process.env.SHINE_UNIVERSE_TOKEN || process.env.GH_TOKEN)) {
    throw new Error("SHINE_UNIVERSE_TOKEN is required for cross-repository workflow dispatch");
  }

  const startedAt = new Date().toISOString();
  const baseId = `su-${process.env.GITHUB_RUN_ID || Date.now()}-${process.env.GITHUB_RUN_ATTEMPT || 1}`;
  const receipt = {
    schema_version: 1,
    orchestration_id: baseId,
    scope: "core",
    source: {
      repository: process.env.GITHUB_REPOSITORY ?? null,
      run_id: process.env.GITHUB_RUN_ID ?? null,
      run_number: process.env.GITHUB_RUN_NUMBER ?? null,
      source_sha: process.env.GITHUB_SHA ?? null
    },
    started_at: startedAt,
    finished_at: null,
    status: "running",
    passes_requested: passes,
    passes_completed: 0,
    passes: [],
    receipt_hash: null
  };

  try {
    const waves = [...new Set(config.workflows.map((item) => item.wave))].sort((a, b) => a - b);

    for (let pass = 1; pass <= passes; pass += 1) {
      const passReceipt = { pass, status: "running", waves: [] };

      for (const wave of waves) {
        const targets = config.workflows.filter((item) => item.wave === wave);
        const orchestrationId = `${baseId}-p${pass}-w${wave}`;
        const result = await runWave(targets, orchestrationId, pass);

        passReceipt.waves.push({
          wave,
          orchestration_id: orchestrationId,
          status: result.ok ? "success" : "failed",
          runs: result.results
        });

        if (!result.ok) {
          passReceipt.status = "failed";
          receipt.passes.push(passReceipt);
          receipt.status = "failed";
          receipt.finished_at = new Date().toISOString();
          await writeReceipt(receipt);
          process.exitCode = 1;
          return;
        }
      }

      passReceipt.status = "success";
      receipt.passes.push(passReceipt);
      receipt.passes_completed = pass;
    }

    receipt.status = "success";
    receipt.finished_at = new Date().toISOString();
    await writeReceipt(receipt);
  } catch (error) {
    receipt.status = "error";
    receipt.finished_at = new Date().toISOString();
    receipt.error = error instanceof Error ? error.message : String(error);
    await writeReceipt(receipt);
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
