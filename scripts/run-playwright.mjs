import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const localBrowserPath = resolve('.tools', 'playwright-browsers')
const environment = { ...process.env }
if (!environment.PLAYWRIGHT_BROWSERS_PATH && existsSync(localBrowserPath)) {
  environment.PLAYWRIGHT_BROWSERS_PATH = localBrowserPath
}

const executable = resolve(
  'node_modules',
  '@playwright',
  'test',
  'cli.js',
)
const result = spawnSync(process.execPath, [executable, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: environment,
  stdio: 'inherit',
})

if (result.error) {
  throw result.error
}

process.exitCode = result.status ?? 1
