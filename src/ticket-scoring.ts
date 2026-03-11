export type EasyTicketFixType =
  | "copy_change"
  | "config_small"
  | "ui_text"
  | "small_bugfix"
  | "unknown";

export interface EasyTicketHeuristicInput {
  sourceCanonicalId: string;
  repo: string;
  changedFileCount: number;
  affectedAreas: string[];
  hasTests: boolean;
  hasDeterministicVerification: boolean;
  requiredContextAvailable: boolean;
  touchesInfrastructure: boolean;
  touchesAuthOrPermissions: boolean;
  touchesDataModel: boolean;
  repeatedPatternCount: number;
  fixType: EasyTicketFixType;
}

export interface EasyTicketHeuristicResult {
  easy: boolean;
  score: number;
  passedRules: string[];
  blockingReasons: string[];
  rationale: string[];
}

const HARD_FAIL_MAX_FILES = 5;
const EASY_THRESHOLD = 0.65;

export function scoreEasyTicketHeuristics(
  input: EasyTicketHeuristicInput,
): EasyTicketHeuristicResult {
  const passedRules: string[] = [];
  const blockingReasons: string[] = [];
  const rationale: string[] = [];
  let score = 0;

  if (!input.repo.trim()) {
    blockingReasons.push("missing-repo");
    rationale.push("Missing repo assignment blocks automatic easy-ticket classification.");
  }

  if (!input.requiredContextAvailable) {
    blockingReasons.push("missing-context");
    rationale.push("Required context is incomplete, so the ticket fails closed.");
  }

  if (!input.hasDeterministicVerification) {
    blockingReasons.push("no-deterministic-verification");
    rationale.push("No deterministic verification path is available.");
  }

  if (input.changedFileCount > HARD_FAIL_MAX_FILES) {
    blockingReasons.push("too-many-files");
    rationale.push(`Changed file count ${input.changedFileCount} exceeds the safe limit of ${HARD_FAIL_MAX_FILES}.`);
  }

  if (input.affectedAreas.length > 1) {
    blockingReasons.push("multi-area-change");
    rationale.push("Work spans multiple product areas and should not be treated as an easy ticket.");
  }

  if (input.touchesInfrastructure) {
    blockingReasons.push("touches-infrastructure");
    rationale.push("Infrastructure-impacting changes are out of scope for low-risk bot tickets.");
  }

  if (input.touchesAuthOrPermissions) {
    blockingReasons.push("touches-auth");
    rationale.push("Auth/permission changes are too risky for automatic easy-ticket classification.");
  }

  if (input.touchesDataModel) {
    blockingReasons.push("touches-data-model");
    rationale.push("Data model changes are considered higher risk.");
  }

  if (blockingReasons.length === 0) {
    if (input.changedFileCount <= 2) {
      score += 0.25;
      passedRules.push("small-file-count");
      rationale.push("File count is within a very small, low-risk range.");
    } else if (input.changedFileCount <= HARD_FAIL_MAX_FILES) {
      score += 0.15;
      passedRules.push("bounded-file-count");
      rationale.push("File count stays within the bounded heuristic window.");
    }

    if (input.affectedAreas.length <= 1) {
      score += 0.15;
      passedRules.push("single-area");
      rationale.push("The work is isolated to a single product area.");
    }

    if (input.hasTests) {
      score += 0.15;
      passedRules.push("has-tests");
      rationale.push("Automated tests exist for the affected area.");
    }

    if (input.hasDeterministicVerification) {
      score += 0.15;
      passedRules.push("deterministic-verification");
      rationale.push("A deterministic verification path exists.");
    }

    if (input.requiredContextAvailable) {
      score += 0.1;
      passedRules.push("context-available");
      rationale.push("Required context is already available to the bot.");
    }

    if (input.repeatedPatternCount >= 2) {
      score += 0.1;
      passedRules.push("repeated-pattern");
      rationale.push("The issue matches a repeated known pattern.");
    }

    if (
      ["copy_change", "config_small", "ui_text", "small_bugfix"].includes(
        input.fixType,
      )
    ) {
      score += 0.1;
      passedRules.push(`fix-type:${input.fixType}`);
      rationale.push(`Fix type ${input.fixType} is within the preferred low-risk set.`);
    }
  }

  score = Math.min(1, Number(score.toFixed(2)));

  return {
    easy: blockingReasons.length === 0 && score >= EASY_THRESHOLD,
    score,
    passedRules,
    blockingReasons,
    rationale,
  };
}
