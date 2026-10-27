import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const distro = process.env.ISBULKKTC_WSL_DISTRO || "Ubuntu-24.04";

// Local Supabase runs inside WSL. Windows only keeps the WSL published ports
// reachable (localhost forwarding and the WSL virtual network) while a wsl.exe
// session is attached; without one the connections to 127.0.0.1:54321 start
// failing a few seconds after the last session ends. The dev server therefore
// holds a silent WSL session open for the whole `npm run dev` lifetime and
// releases it on exit, so registration and login keep working locally.
let keepAlive = null;

function startKeepAlive() {
  if (process.platform !== "win32") return;
  if (process.env.ISBULKKTC_SKIP_WSL_KEEPALIVE === "1") return;

  const probe = spawnSync("wsl.exe", ["-d", distro, "--", "true"], {
    cwd: projectRoot,
    stdio: "ignore",
  });

  if (probe.error || probe.status !== 0) {
    // No WSL distro available: the dev server still works against a hosted Supabase.
    return;
  }

  keepAlive = spawn(
    "wsl.exe",
    ["-d", distro, "--", "bash", "-lc", "while true; do sleep 60; done"],
    { cwd: projectRoot, stdio: "ignore" },
  );

  keepAlive.on("error", () => {
    keepAlive = null;
  });
  keepAlive.on("exit", () => {
    keepAlive = null;
  });
}

function stopKeepAlive() {
  if (!keepAlive) return;

  const child = keepAlive;
  keepAlive = null;
  child.kill();
}

startKeepAlive();

const nextBin = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
const dev = spawn(process.execPath, [nextBin, "dev", "--turbopack"], {
  cwd: projectRoot,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopKeepAlive();
    dev.kill(signal);
  });
}

dev.on("error", (error) => {
  stopKeepAlive();
  throw error;
});

dev.on("exit", (code) => {
  stopKeepAlive();
  process.exit(code ?? 1);
});
