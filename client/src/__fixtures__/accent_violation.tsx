// FIXTURE THAT FAILS the accent-hex grep (T0.6, EXECUTION.md §4 job 2): an
// accent hex literal outside client/src/theme.css. Excluded from the build,
// tsc and eslint; included in the lint glob so scripts/lint_greps.sh
// selfcheck can prove the rule fires. Never import this file.

export const accentViolation = "#2DD4BF";
