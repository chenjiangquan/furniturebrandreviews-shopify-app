import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const directBuild = "build/server/index.js";
const serverDir = "build/server";

function findServerBuild() {
  if (existsSync(directBuild)) {
    return directBuild;
  }

  if (!existsSync(serverDir)) {
    return "";
  }

  for (const entry of readdirSync(serverDir)) {
    const candidate = join(serverDir, entry, "index.js");
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return "";
}

const serverBuild = findServerBuild();

if (!serverBuild) {
  console.error("Could not find Remix server build. Run npm run build first.");
  process.exit(1);
}

const child = spawn("npx", ["remix-serve", serverBuild], {
  env: process.env,
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
