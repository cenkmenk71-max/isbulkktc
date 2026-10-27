import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);

if (args.length === 0) {
  throw new Error("Pass a Supabase CLI command, for example: start, status, or test db.");
}

if (process.platform !== "win32") {
  const result = spawnSync("supabase", args, {
    cwd: projectRoot,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

const distro = process.env.ISBULKKTC_WSL_DISTRO || "Ubuntu-24.04";
const drive = path.parse(projectRoot).root.slice(0, 1).toLowerCase();
const projectPath = projectRoot
  .slice(path.parse(projectRoot).root.length)
  .split(path.sep)
  .filter(Boolean)
  .join("/");

if (!drive || !projectPath) {
  throw new Error("The WSL Supabase setup requires the project on a local Windows drive.");
}

const linuxProjectRoot = `/mnt/${drive}/${projectPath}`;
const linuxCli = `${linuxProjectRoot}/.tools/supabase-wsl/supabase`;

const executableCheck = spawnSync(
  "wsl.exe",
  ["-d", distro, "--", "test", "-x", linuxCli],
  { cwd: projectRoot, stdio: "ignore" },
);

if (executableCheck.error) throw executableCheck.error;
if (executableCheck.status !== 0) {
  throw new Error(
    `Supabase CLI is not installed in the project WSL tools directory. Run "npm run tools:supabase-wsl" and verify Docker is available in WSL distro "${distro}".`,
  );
}

const result = spawnSync(
  "wsl.exe",
  [
    "-d",
    distro,
    "--cd",
    linuxProjectRoot,
    "--",
    linuxCli,
    ...args,
  ],
  { cwd: projectRoot, stdio: "inherit" },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
