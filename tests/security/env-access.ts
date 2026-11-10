/**
 * Every spelling of a `process.env` read, shared by the security detectors that
 * decide by reading a secret's *name*.
 *
 * Three gates key off an env name: `client-boundary` (a client module must not
 * read a server secret), `log-safety` (a credential must not reach a log) and
 * `cron-route-auth` (a bearer guard's secret must come from a non-public env
 * var). The first version of this reader matched only `process.env.NAME`. That
 * misses `process.env["NAME"]`, `process["env"].NAME`, `process["env"]["NAME"]`
 * and `const { NAME } = process.env` — each carries a secret exactly as far as
 * the dot form, so a detector built on the narrow reader has a hole in the
 * boundary it guards while staying green.
 *
 * One shared, self-tested implementation keeps the three detectors from drifting
 * apart (the `sql-hardening` sibling scanners drifted once already, which is why
 * `authorization-header.ts` exists for the header read).
 */

/**
 * The env names a source text reads, in every access form. Includes
 * `NEXT_PUBLIC_*`; filter with `nonPublicEnvNames` when the public prefix is
 * meant to be excluded.
 */
export function envReadNames(source: string): string[] {
  const names = new Set<string>();
  const add = (name: string | undefined) => {
    if (name) names.add(name);
  };

  // `process.env.NAME`, `process.env?.NAME`, `process.env . NAME`
  for (const m of source.matchAll(/process\s*\.\s*env\s*\??\s*\.\s*([A-Z0-9_]+)/g)) add(m[1]);
  // `process.env["NAME"]`, `process.env['NAME']`, `process.env[`NAME`]`
  for (const m of source.matchAll(/process\s*\.\s*env\s*\[\s*["'`]([A-Z0-9_]+)["'`]\s*\]/g))
    add(m[1]);
  // `process["env"].NAME`
  for (const m of source.matchAll(
    /process\s*\[\s*["'`]env["'`]\s*\]\s*\??\s*\.\s*([A-Z0-9_]+)/g,
  ))
    add(m[1]);
  // `process["env"]["NAME"]`
  for (const m of source.matchAll(
    /process\s*\[\s*["'`]env["'`]\s*\]\s*\[\s*["'`]([A-Z0-9_]+)["'`]\s*\]/g,
  ))
    add(m[1]);
  // `const { NAME } = process.env`, `const { NAME: local } = process.env`,
  // `const { A, B } = process["env"]`
  for (const m of source.matchAll(
    /\{\s*([^}]*?)\}\s*=\s*process\s*(?:\.\s*env|\[\s*["'`]env["'`]\s*\])\b/g,
  )) {
    for (const part of m[1].split(",")) {
      // Drop the local alias (`NAME: local`) — the env name is what matters.
      const id = part.split(":")[0].trim().split(/[\s=]/)[0];
      if (/^[A-Z0-9_]+$/.test(id)) add(id);
    }
  }

  return [...names];
}

/** `envReadNames` minus the `NEXT_PUBLIC_*` names that are safe to ship. */
export function nonPublicEnvNames(source: string): string[] {
  return envReadNames(source).filter((name) => !name.startsWith("NEXT_PUBLIC_"));
}
