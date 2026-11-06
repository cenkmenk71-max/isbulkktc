import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeResumeDraft,
  type CandidateProfileDraft,
} from "./resume-profile-draft";

/**
 * A CV states a location that is more than one district ("Girne, Lefkoşa"), and
 * the parser emits it as-is because it *is* a location. The profile schema only
 * holds one district, so the merge has to pick one. It used to drop the value
 * entirely — `resolveNorthernCyprusDistrict` returns `null` for a multi-district
 * string, and the merge treated that `null` as "no location" — so a location the
 * CV clearly stated never reached the profile. That is the "too little is
 * extracted" half of #208.
 */

const emptyProfile: CandidateProfileDraft = {
  headline: "",
  location: "",
  skills: [],
  experience: [],
  education: [],
  languages: [],
  certifications: [],
};

test("a multi-district CV location resolves to its first district", () => {
  for (const [value, expected] of [
    ["Girne, Lefkoşa", "Girne"],
    ["Lefkoşa, Girne, Mağusa", "Lefkoşa"],
    ["Kyrenia, Nicosia", "Girne"],
    ["Girne; Lefkoşa", "Girne"],
    ["Girne / Lefkoşa", "Girne"],
    ["Girne | Lefkoşa", "Girne"],
    // An unknown locality ahead of a real district is still not a district, so
    // the scan keeps going rather than giving up on the line.
    ["London, Girne", "Girne"],
  ] as const) {
    const result = mergeResumeDraft(emptyProfile, { location: value });
    assert.equal(result.profile.location, expected, `${value} should resolve`);
    assert.equal(result.added, 1, `${value} should count as added`);
  }
});

test("a multi-district current location is normalised too", () => {
  // The current value is resolved with the same rule, so a profile that already
  // holds a list is cleaned up rather than left as an unresolvable string.
  const result = mergeResumeDraft(
    { ...emptyProfile, location: "Lefkoşa, Girne" },
    { location: "Mağusa" },
  );
  assert.equal(result.profile.location, "Lefkoşa");
});

test("a location with no known district is still dropped", () => {
  // Widening to the first segment must not start accepting arbitrary text.
  const result = mergeResumeDraft(emptyProfile, {
    location: "Somewhere outside the district list",
  });
  assert.equal(result.profile.location, "");
  assert.equal(result.added, 0);
});
