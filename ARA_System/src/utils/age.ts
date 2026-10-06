// Whole-year age from an ISO "YYYY-MM-DD" date string, measured at `asOf`
// (default today). Returns null for missing/invalid/future dates. Shared by
// the adoption form (live "age at application") and the questionnaire answer
// renderer (staff queue + applicant modal).
export function calculateAge(dob: string | null | undefined, asOf: Date = new Date()): number | null {
  if (!dob) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob.trim());
  if (!match) return null;
  const birth = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(birth.getTime())) return null;
  // Guard against overflow dates like 2026-02-30 rolling into March.
  if (
    birth.getFullYear() !== Number(match[1]) ||
    birth.getMonth() !== Number(match[2]) - 1 ||
    birth.getDate() !== Number(match[3])
  ) {
    return null;
  }
  let age = asOf.getFullYear() - birth.getFullYear();
  const hadBirthdayThisYear =
    asOf.getMonth() > birth.getMonth() ||
    (asOf.getMonth() === birth.getMonth() && asOf.getDate() >= birth.getDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age < 0 ? null : age;
}

export const ADULT_AGE = 18;
