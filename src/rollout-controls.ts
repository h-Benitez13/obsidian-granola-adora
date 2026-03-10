export interface RolloutControlInput {
  dryRun: boolean;
  processedCount: number;
  budgetLimit: number;
}

export interface RolloutControlResult {
  allowed: boolean;
  reason: "dry-run" | "within-budget" | "budget-exceeded";
}

export function evaluateRolloutControl(
  input: RolloutControlInput,
): RolloutControlResult {
  if (input.dryRun) {
    return {
      allowed: false,
      reason: "dry-run",
    };
  }

  if (input.processedCount >= input.budgetLimit) {
    return {
      allowed: false,
      reason: "budget-exceeded",
    };
  }

  return {
    allowed: true,
    reason: "within-budget",
  };
}
