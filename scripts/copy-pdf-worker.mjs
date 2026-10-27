import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const worker = resolve(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const publicDirectory = resolve(root, "public");

await mkdir(publicDirectory, { recursive: true });
await copyFile(worker, resolve(publicDirectory, "pdf.worker.min.mjs"));
