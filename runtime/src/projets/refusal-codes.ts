// Les codes de refus d'une station, seuls : le fichier `en-service` ne garde
// que le code.
export const REFUSAL_CODES = [
  // La cuisine du projet refuse de s'ouvrir.
  "sandbox-unusable",
  "configuration-invalid",
  "clone-missing",
  "already-served",
  "door-not-open",
  "proxy-port-set",
  // La station ne peut pas préparer le projet.
  "clone-failed",
  "fetch-blocked",
  "push-blocked",
  "decisions-not-written",
  "hand-written-line",
  "handed-over-elsewhere",
  "kitchen-not-joinable",
  // Ni sa cuisine ni son service GitHub seul ne prend les tickets du projet.
  "not-served",
  // Tout le reste.
  "unexpected",
] as const;

export type RefusalCode = (typeof REFUSAL_CODES)[number];
