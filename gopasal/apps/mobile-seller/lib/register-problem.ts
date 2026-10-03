import type { FieldProblem } from "@gopasal/native-data/seller-onboarding";
import type { useT } from "@gopasal/native-ui";

/**
 * One field's problem, in words a shopkeeper can act on.
 *
 * The data layer answers *what* is wrong — a rule and sometimes a bound — and
 * deliberately stops there, because phrasing is a product decision and the
 * package has no dictionary. This turns that answer into the sentence, in one
 * place, so the same broken rule reads identically on every step of the form.
 *
 * "Required" is the interesting case. A registration form is filled in over
 * days, so a field that is empty because the shopkeeper has not got to it yet
 * is the normal state, not an error — the copy says what is still needed at
 * submission, not that they have done something wrong.
 */
export function problemText(
  problem: FieldProblem | null,
  t: ReturnType<typeof useT>,
): string | null {
  if (!problem) return null;

  if (problem.kind === "changes-requested") {
    return t("register.problem.asked");
  }

  if (problem.kind === "missing") {
    return t("register.problem.needed");
  }

  switch (problem.rule) {
    case "too-long":
      return problem.limit === undefined
        ? t("register.problem.tooLong")
        : t("register.problem.tooLongBy", { limit: problem.limit });
    case "too-short":
      return problem.limit === undefined
        ? t("register.problem.tooShort")
        : t("register.problem.tooShortBy", { limit: problem.limit });
    case "not-an-email":
      return t("register.problem.email");
    case "out-of-range":
      return t("register.problem.range");
    default:
      // `DraftRule` is a closed union, so this is unreachable today. It exists
      // so that adding a rule to the data layer shows up as English prose
      // rather than as a field that silently stops explaining itself.
      return t("common.somethingWrong");
  }
}
