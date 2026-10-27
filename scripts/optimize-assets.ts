import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const [input, output] = process.argv.slice(2);

if (!input || !output) {
  throw new Error("Usage: npm run optimize:assets -- <input.glb|gltf> <output.glb>");
}

const inputPath = path.resolve(input);
const outputPath = path.resolve(output);

if (!existsSync(inputPath)) {
  throw new Error(`Input asset does not exist: ${inputPath}`);
}

if (inputPath === outputPath) {
  throw new Error("Input and output paths must be different.");
}

const cliModule = createRequire(import.meta.url).resolve("@gltf-transform/cli");
const gltfTransformCli = path.resolve(path.dirname(cliModule), "../bin/cli.js");
execFileSync(
  process.execPath,
  [gltfTransformCli, "optimize", inputPath, outputPath, "--compress", "meshopt"],
  { stdio: "inherit" },
);
