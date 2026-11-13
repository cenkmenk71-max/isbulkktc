import { jobTypeKeys, type JobTypeKey } from "@/features/jobs/job-type-slugs";
import {
  northernCyprusDistrictValues,
  type NorthernCyprusDistrict,
} from "@/features/locations/northern-cyprus-districts";

/**
 * A district or employment-type landing page answers 200 with the empty state
 * when its filter matches nothing, and `generateMetadata` marks such a page
 * `noindex` so Google does not file it as a Soft 404. The sitemap must agree:
 * advertising a `<loc>` that answers `noindex` is a contradiction the indexing
 * verifier fails on, and a sitemap that lists a URL crawlers are told to skip
 * spends crawl budget on nothing.
 *
 * The projection below is derived from the same vacancy rows the sitemap already
 * loads, so the two cannot drift: a facet is available exactly when at least one
 * currently published, unexpired vacancy carries it.
 */
export type LandingAvailability = {
  districts: Set<NorthernCyprusDistrict>;
  jobTypes: Set<JobTypeKey>;
};

export function computeLandingAvailability(
  jobs: readonly {
    district: NorthernCyprusDistrict | null;
    jobType: JobTypeKey;
  }[],
): LandingAvailability {
  const districts = new Set<NorthernCyprusDistrict>();
  const jobTypes = new Set<JobTypeKey>();

  for (const job of jobs) {
    if (job.district) districts.add(job.district);
    jobTypes.add(job.jobType);
  }

  return { districts, jobTypes };
}

/**
 * The district values whose landing page has at least one vacancy, in the
 * canonical `northernCyprusDistrictValues` order the cross-link block renders.
 */
export function availableDistricts(
  availability: LandingAvailability,
): NorthernCyprusDistrict[] {
  return northernCyprusDistrictValues.filter((district) =>
    availability.districts.has(district),
  );
}

/** The employment types whose landing page has at least one vacancy. */
export function availableJobTypes(
  availability: LandingAvailability,
): JobTypeKey[] {
  return jobTypeKeys.filter((jobType) => availability.jobTypes.has(jobType));
}
