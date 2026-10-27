// Publishes every package in packages/ whose version isn't on npm yet, then
// tags each published version (e.g. react-render-pulse@1.0.0).
//
// `pnpm pack` builds each tarball, so `workspace:` dependencies become real
// version ranges, and the npm CLI publishes it. npm handles authentication:
// trusted publishing (OIDC) in GitHub Actions when the package has a trusted
// publisher, otherwise NODE_AUTH_TOKEN or your `npm login`.
//
// Usage: node scripts/publish-packages.mjs [--dry-run]
// Run `pnpm build` first; this script doesn't build.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dryRun = process.argv.includes("--dry-run");
const root = new URL("..", import.meta.url);
const packagesDir = join(root.pathname.replace(/^\/([A-Za-z]:)/, "$1"), "packages");
// npm and pnpm are .cmd shims on Windows, which need a shell to run.
const shell = process.platform === "win32";

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: "utf8", shell, stdio: ["ignore", "pipe", "pipe"], ...options }).trim();
}

function isPublished(name, version) {
  try {
    return run("npm", ["view", `${name}@${version}`, "version"]) === version;
  } catch (error) {
    if (/E404|404 Not Found/.test(`${error.stderr ?? ""}${error.stdout ?? ""}`)) return false;
    throw error;
  }
}

// The client first: the collector and viewer depend on it.
const order = ["client", "collector", "viewer"];
const dirs = readdirSync(packagesDir).sort((a, b) => order.indexOf(a) - order.indexOf(b));
const outDir = mkdtempSync(join(tmpdir(), "render-pulse-publish-"));
const published = [];

try {
  for (const dir of dirs) {
    const cwd = join(packagesDir, dir);
    const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
    if (pkg.private) continue;
    const id = `${pkg.name}@${pkg.version}`;

    if (isPublished(pkg.name, pkg.version)) {
      console.log(`skip     ${id} (already on npm)`);
      continue;
    }

    run("pnpm", ["pack", "--pack-destination", outDir], { cwd });
    const tarball = join(outDir, `${pkg.name}-${pkg.version}.tgz`);
    const args = ["publish", tarball, "--access", "public"];
    if (dryRun) args.push("--dry-run");

    console.log(`${dryRun ? "dry-run " : "publish "} ${id}`);
    execFileSync("npm", args, { stdio: "inherit", shell });
    published.push(id);
  }
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

if (!dryRun) {
  for (const id of published) run("git", ["tag", id]);
}
console.log(
  published.length > 0
    ? `\n${dryRun ? "Would publish" : "Published"}: ${published.join(", ")}`
    : "\nNothing to publish.",
);
