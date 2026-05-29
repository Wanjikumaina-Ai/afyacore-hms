// scripts/bundle-electron.mjs
import { build } from "esbuild";
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC  = join(ROOT, "src");

console.log("[bundle] Bundling from:", SRC);

await build({
  entryPoints: [
    join(SRC, "lib/db/database.ts"),
    join(SRC, "lib/auth/auth-service.ts"),
    join(SRC, "lib/auth/rbac-seeder.ts"),
    join(SRC, "lib/audit/audit-logger.ts"),
    join(SRC, "lib/license/license-service.ts"),
    join(SRC, "lib/sync/sync-engine.ts"),
    join(SRC, "server/routes/api.ts"),
    join(SRC, "server/routes/setup.ts"),
    join(SRC, "server/websocket/ws-server.ts"),
  ],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outdir: join(ROOT, "dist-server"),
  outbase: SRC,
  splitting: true,
  external: [
    "electron", "node:*", "bcryptjs", "sql.js",
    "ws", "hono", "@hono/node-server",
  ],
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
  },
  sourcemap: "inline",
  minify: false,
  logLevel: "info",
});

const wasmSrc = join(ROOT, "node_modules/sql.js/dist/sql-wasm.wasm");
if (existsSync(wasmSrc)) {
  copyFileSync(wasmSrc, join(ROOT, "dist-server/sql-wasm.wasm"));
  console.log("[bundle] Copied sql-wasm.wasm");
}

const schemaSrc = join(SRC, "lib/db/schema.sql");
const schemaDst = join(ROOT, "dist-server/lib/db/schema.sql");
mkdirSync(dirname(schemaDst), { recursive: true });
if (existsSync(schemaSrc)) {
  copyFileSync(schemaSrc, schemaDst);
  console.log("[bundle] Copied schema.sql");
}

console.log("[bundle] Done - dist-server/ ready");
