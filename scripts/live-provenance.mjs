import fs from "node:fs";
import { pathToFileURL } from "node:url";

const HEADER_MAP = Object.freeze({
  provider: "x-shine-runtime-provider",
  repository: "x-shine-runtime-repository",
  commit: "x-shine-runtime-commit",
  branch: "x-shine-runtime-branch",
  deployment: "x-shine-runtime-deployment",
  service: "x-shine-runtime-service",
  environment: "x-shine-runtime-environment"
});

const SHA = /^[0-9a-f]{40}$/i;

export function evaluateObservation(app, observation) {
  if (!observation.reachable) {
    return {
      status: "unreachable",
      severe: true,
      reasons: [observation.error || "health-endpoint-unreachable"]
    };
  }

  if (observation.http_status < 200 || observation.http_status >= 300) {
    return {
      status: "unreachable",
      severe: true,
      reasons: [`health-http-${observation.http_status}`]
    };
  }

  const headers = observation.headers || {};
  const missing = Object.values(HEADER_MAP).filter((name) => !headers[name]);
  if (missing.length) {
    return {
      status: "missing-provenance",
      severe: true,
      reasons: missing.map((name) => `missing-${name}`)
    };
  }

  const sourceReasons = [];
  if (headers[HEADER_MAP.provider] !== "railway") sourceReasons.push("provider-mismatch");
  if (headers[HEADER_MAP.repository] !== app.repository) sourceReasons.push("repository-mismatch");
  if (headers[HEADER_MAP.branch] !== app.production_branch) sourceReasons.push("branch-mismatch");
  if (headers[HEADER_MAP.service] !== app.railway.service_name) sourceReasons.push("service-mismatch");
  if (headers[HEADER_MAP.environment] !== "production") sourceReasons.push("environment-mismatch");
  if (!SHA.test(headers[HEADER_MAP.commit])) sourceReasons.push("commit-shape-invalid");

  if (sourceReasons.length) {
    return { status: "source-drift", severe: true, reasons: sourceReasons };
  }

  const snapshotReasons = [];
  if (headers[HEADER_MAP.commit] !== app.railway.active_deployment.commit_sha) {
    snapshotReasons.push("commit-snapshot-drift");
  }
  if (headers[HEADER_MAP.deployment] !== app.railway.active_deployment.id) {
    snapshotReasons.push("deployment-snapshot-drift");
  }

  if (snapshotReasons.length) {
    return { status: "snapshot-drift", severe: false, reasons: snapshotReasons };
  }

  return { status: "ok", severe: false, reasons: [] };
}

async function observeApp(app, { fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const domain = app.railway.domains?.[0];
  if (!domain) {
    return {
      app: app.id,
      name: app.name,
      reachable: false,
      url: null,
      error: "no-production-domain",
      headers: {}
    };
  }

  const url = `https://${domain}${app.railway.health_path}`;
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": "Shine-Universe-Ops-Provenance/1.0" }
    });

    const headers = {};
    for (const name of Object.values(HEADER_MAP)) {
      headers[name] = response.headers.get(name);
    }

    return {
      app: app.id,
      name: app.name,
      reachable: true,
      url,
      http_status: response.status,
      headers
    };
  } catch (error) {
    return {
      app: app.id,
      name: app.name,
      reachable: false,
      url,
      error: error instanceof Error ? error.message : String(error),
      headers: {}
    };
  }
}

export function evaluateDevicePack(pack, observation) {
  if (!pack) {
    return {
      status: "not-applicable",
      reasons: []
    };
  }

  if (!observation?.reachable || observation.http_status < 200 || observation.http_status >= 300) {
    return {
      status: "blocked-runtime",
      reasons: ["production-health-unavailable"]
    };
  }

  const headers = observation.headers || {};
  const required = [
    HEADER_MAP.repository,
    HEADER_MAP.commit,
    HEADER_MAP.branch,
    HEADER_MAP.deployment,
    HEADER_MAP.service,
    HEADER_MAP.environment
  ];
  if (required.some((name) => !headers[name])) {
    return {
      status: "blocked-runtime",
      reasons: ["production-provenance-unavailable"]
    };
  }

  const sourceMismatch =
    headers[HEADER_MAP.repository] !== pack.repository ||
    headers[HEADER_MAP.branch] !== pack.branch ||
    headers[HEADER_MAP.environment] !== "production";

  if (sourceMismatch) {
    return {
      status: "blocked-runtime",
      reasons: ["production-source-mismatch"]
    };
  }

  const reasons = [];
  if (headers[HEADER_MAP.commit] !== pack.commit_sha) reasons.push("commit-changed");
  if (headers[HEADER_MAP.deployment] !== pack.production_deployment_id) reasons.push("deployment-changed");

  if (reasons.length) {
    return {
      status: "stale-release",
      reasons
    };
  }

  return {
    status: pack.status === "untested" ? "ready-for-human-test" : pack.status,
    reasons: []
  };
}

export async function buildReport(registry, options = {}) {
  const observed = await Promise.all(registry.apps.map((app) => observeApp(app, options)));
  const devicePacks = options.devicePacks?.packs || [];

  const results = observed.map((observation) => {
    const app = registry.apps.find((item) => item.id === observation.app);
    const pack = devicePacks.find((item) => item.app_id === observation.app);
    return {
      ...observation,
      expected: {
        repository: app.repository,
        branch: app.production_branch,
        service: app.railway.service_name,
        deployment_id: app.railway.active_deployment.id,
        commit_sha: app.railway.active_deployment.commit_sha
      },
      evaluation: evaluateObservation(app, observation),
      device_pack: evaluateDevicePack(pack, observation)
    };
  });

  const counts = results.reduce((acc, item) => {
    acc[item.evaluation.status] = (acc[item.evaluation.status] || 0) + 1;
    return acc;
  }, {});

  const devicePackCounts = results.reduce((acc, item) => {
    if (item.device_pack.status !== "not-applicable") {
      acc[item.device_pack.status] = (acc[item.device_pack.status] || 0) + 1;
    }
    return acc;
  }, {});

  return {
    schema_version: 2,
    checked_at: new Date().toISOString(),
    registry_verified_at: registry.verified_at,
    device_packs_generated_at: options.devicePacks?.generated_at || null,
    total: results.length,
    counts,
    severe_count: results.filter((item) => item.evaluation.severe).length,
    snapshot_drift_count: results.filter((item) => item.evaluation.status === "snapshot-drift").length,
    device_pack_counts: devicePackCounts,
    device_pack_ready_count: devicePackCounts["ready-for-human-test"] || 0,
    device_pack_stale_count: devicePackCounts["stale-release"] || 0,
    device_pack_blocked_count: devicePackCounts["blocked-runtime"] || 0,
    results
  };
}

async function main() {
  const registry = JSON.parse(fs.readFileSync(new URL("../config/apps.json", import.meta.url), "utf8"));
  const devicePacks = JSON.parse(fs.readFileSync(new URL("../config/device-acceptance-packs.json", import.meta.url), "utf8"));
  const report = await buildReport(registry, { devicePacks });
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");

  const strict = process.argv.includes("--strict");
  const fail = strict
    ? report.results.some((item) => item.evaluation.status !== "ok")
    : report.severe_count > 0;

  if (fail) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
