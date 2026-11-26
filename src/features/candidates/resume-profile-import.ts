import { computeOpenSections } from "./candidate-profile-sections";
import {
  mergeResumeDraft,
  type CandidateProfileDraft,
} from "./resume-profile-draft";
import type { CandidateResumeDraft } from "./resume-parser";

export function mergeResumeDraftForForm(
  current: CandidateProfileDraft,
  draft: CandidateResumeDraft,
) {
  const result = mergeResumeDraft(current, draft);

  return {
    ...result,
    openSections: computeOpenSections(result.profile),
  };
}
