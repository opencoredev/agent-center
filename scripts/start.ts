/**
 * Railway start script — routes to the correct service based on RAILWAY_SERVICE env var.
 * Usage: RAILWAY_SERVICE=api bun scripts/start.ts
 */

const service = process.env.APP_SERVICE || process.env.RAILWAY_SERVICE;

if (!service) {
  console.error("APP_SERVICE env var is required. Set to: api, runner, worker, or web");
  process.exit(1);
}

console.log(`[start] launching service: ${service}`);

switch (service) {
  case "api":
    // Run migrations first, then start API
    await import("../packages/db/src/migrate");
    await import("../apps/api/src/index");
    break;

  case "runner":
    await import("../apps/runner/src/index");
    break;

  case "worker":
    await import("../apps/worker/src/index");
    break;

  case "web":
    // Static file server for the built frontend
    const { execSync } = await import("node:child_process");
    const port = process.env.PORT || "3000";
    execSync(`bunx serve apps/web/dist -s -l ${port}`, { stdio: "inherit" });
    break;

  default:
    console.error(`Unknown service: ${service}. Use: api, runner, worker, or web`);
    process.exit(1);
}
