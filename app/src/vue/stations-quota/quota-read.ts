// Le quota GitHub du compte, tel que `facts` le porte (runtime, `quotaGithub`, ticket 3483) : absent d'un runtime d'avant ce champ,
// et alors l'onglet Stations n'affiche pas le quota. Présent mais mal formé, il se lit quand même : un nombre qui n'en est pas un
// devient NaN, que le quota dit « unavailable » plutôt que d'inventer un chiffre ; une ligne d'usage mal formée est omise.
export type CallOfQuota = { station: string; projet: string; typeAppel: string; nombre: number };
export type QuotaGithub = { limite: string; pauseJusqua: string | null; utilise: number; maximum: number; renouvellement: string | null; parStationEtProjet: CallOfQuota[] };

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
const count = (value: unknown): number => (typeof value === "number" ? value : Number.NaN);

// `quotaGithub`, de la racine de `facts`.
export function quotaRead(value: unknown): { quotaGithub?: QuotaGithub } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const { limite: limit, pauseJusqua: pauseUntil, utilise, maximum, renouvellement: renewal, parStationEtProjet: parStationAndProject } = value as Record<string, unknown>;
  const calls = (Array.isArray(parStationAndProject) ? parStationAndProject : []).flatMap((call: unknown): CallOfQuota[] => {
    if (typeof call !== "object" || call === null) return [];
    const { station, projet: project, typeAppel: typeCall, nombre: n } = call as Record<string, unknown>;
    return typeof station === "string" && typeof project === "string" && typeof typeCall === "string" && typeof n === "number" ? [{ station, projet: project, typeAppel: typeCall, nombre: n }] : [];
  });
  return { quotaGithub: { limite: text(limit) ?? "", pauseJusqua: text(pauseUntil), utilise: count(utilise), maximum: count(maximum), renouvellement: text(renewal), parStationEtProjet: calls } };
}
