// Le label d'un ticket sensible (ticket 3224, docs/sensitive-tickets.md), tel que le runtime l'écrit
// (runtime/src/sensible/sensible.ts, `LABEL_SENSITIVE`). Sans import : la lecture du rail (vue/rail/github.ts) le lit, et
// ne charge que ce qui lit GitHub (test/tableau/read.test.ts).
export const SENSITIVE_LABEL = "sensitive";

export const estSensitive = (labels: readonly string[]) => labels.includes(SENSITIVE_LABEL);
