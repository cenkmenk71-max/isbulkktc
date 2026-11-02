/**
 * The listing routes (`/`, `/jobs`) advertise the newest vacancy's modification
 * instant as their `<lastmod>`, so it must equal the date the vacancy entry
 * itself carries. Taking it from `publishedAt` would make the two disagree as
 * soon as a listing is edited after publication, and Google drops a `<lastmod>`
 * it cannot verify against the page.
 *
 * The input is deliberately narrowed to `modifiedAt` so the compiler rejects a
 * call site that tries to reintroduce the publication date.
 */
export function newestJobModifiedAt(
  jobs: readonly { modifiedAt: string }[],
): Date | null {
  return jobs.reduce<Date | null>((newest, job) => {
    const modified = new Date(job.modifiedAt);
    return newest === null || modified > newest ? modified : newest;
  }, null);
}
