export type JobTypeMessageKey =
  | "jobTypes.full_time"
  | "jobTypes.part_time"
  | "jobTypes.contract"
  | "jobTypes.temporary"
  | "jobTypes.internship"
  | "jobTypes.freelance";

export type WorkplaceModeMessageKey =
  | "workplaceModes.on_site"
  | "workplaceModes.hybrid"
  | "workplaceModes.remote";

export type DistrictMessageKey =
  | "districts.lefkosia"
  | "districts.magusa"
  | "districts.girne"
  | "districts.guzelyurt"
  | "districts.iskele"
  | "districts.lefke";

export type ApplicationStatus =
  | "submitted"
  | "reviewing"
  | "shortlisted"
  | "rejected"
  | "hired"
  | "withdrawn";

export type ApplicationStatusMessageKey =
  | `applicationStatuses.${ApplicationStatus}`;

export function isApplicationStatus(value: string): value is ApplicationStatus {
  return (
    value === "submitted" ||
    value === "reviewing" ||
    value === "shortlisted" ||
    value === "rejected" ||
    value === "hired" ||
    value === "withdrawn"
  );
}

export function getApplicationStatusMessageKey(
  value: string,
): ApplicationStatusMessageKey {
  switch (value) {
    case "submitted":
    case "reviewing":
    case "shortlisted":
    case "rejected":
    case "hired":
    case "withdrawn":
      return `applicationStatuses.${value}`;
    default:
      throw new Error("An application has an unsupported status.");
  }
}

export function getJobTypeMessageKey(value: string): JobTypeMessageKey {
  switch (value) {
    case "full_time":
      return "jobTypes.full_time";
    case "part_time":
      return "jobTypes.part_time";
    case "contract":
      return "jobTypes.contract";
    case "temporary":
      return "jobTypes.temporary";
    case "internship":
      return "jobTypes.internship";
    case "freelance":
      return "jobTypes.freelance";
    default:
      throw new Error("A published job has an unsupported employment type.");
  }
}

export function getWorkplaceModeMessageKey(
  value: string,
): WorkplaceModeMessageKey {
  switch (value) {
    case "on_site":
      return "workplaceModes.on_site";
    case "hybrid":
      return "workplaceModes.hybrid";
    case "remote":
      return "workplaceModes.remote";
    default:
      throw new Error("A published job has an unsupported workplace mode.");
  }
}

export function getDistrictMessageKey(value: string): DistrictMessageKey {
  switch (value) {
    case "Lefkoşa":
      return "districts.lefkosia";
    case "Mağusa":
      return "districts.magusa";
    case "Girne":
      return "districts.girne";
    case "Güzelyurt":
      return "districts.guzelyurt";
    case "İskele":
      return "districts.iskele";
    case "Lefke":
      return "districts.lefke";
    default:
      throw new Error("A published job has an unsupported district.");
  }
}

// Source listings reuse the first sentences of the description as the summary.
// Rendering both the header summary and the description then repeats the same
// paragraph, so callers hide the summary when the description already opens with it.
export function isRedundantJobSummary(
  summary: string | null | undefined,
  description: string | null | undefined,
): boolean {
  if (!summary || !description) return false;
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  const stem = normalize(summary).replace(/[\s.…]+$/, "");
  if (!stem) return false;
  return normalize(description).startsWith(stem);
}
