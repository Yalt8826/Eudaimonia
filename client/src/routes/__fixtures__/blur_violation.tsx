// FIXTURE THAT FAILS the blur-budget grep (T0.6, EXECUTION.md §4 job 1):
// two backdrop-filter occurrences in one screen-route file. Excluded from
// the build, tsc and eslint (tsconfig/eslint ignore __fixtures__); included
// in the lint glob so scripts/lint_greps.sh selfcheck can prove the rule
// fires. Never import this file.

export const blurViolation = [
  "backdrop-filter: blur(14px);",
  "backdrop-filter: blur(24px);",
].join("\n");
