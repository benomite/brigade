// Le label d'un ticket sensible (ticket 3224, docs/sensitive-tickets.md), tel que le runtime l'écrit
// (runtime/src/sensible/sensible.ts, `LABEL_SENSITIVE`). Sans import : la lecture du rail (vue/rail/github.ts) le lit, et
// ne charge que ce qui lit GitHub (test/tableau/lecture.test.ts).
export const LABEL_SENSIBLE = "sensitive";

export const estSensible = (labels: readonly string[]) => labels.includes(LABEL_SENSIBLE);
