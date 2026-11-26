// Le quota GitHub du compte, tel que `facts` le porte (runtime, `quotaGithub`, ticket 3483) : absent d'un runtime d'avant ce champ,
// et alors l'onglet Stations n'affiche pas le quota. Présent mais mal formé, il se lit quand même : un nombre qui n'en est pas un
// devient NaN, que le quota dit « unavailable » plutôt que d'inventer un chiffre ; une ligne d'usage mal formée est omise.
export type CallDuQuota = { station: string; projet: string; typeAppel: string; nombre: number };
export type QuotaGithub = { limite: string; pauseJusqua: string | null; utilise: number; maximum: number; renouvellement: string | null; parStationEtProjet: CallDuQuota[] };

const texte = (valeur: unknown): string | null => (typeof valeur === "string" ? valeur : null);
const nombre = (valeur: unknown): number => (typeof valeur === "number" ? valeur : Number.NaN);

// `quotaGithub`, de la racine de `facts`.
export function quotaLu(valeur: unknown): { quotaGithub?: QuotaGithub } {
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) return {};
  const { limite: limit, pauseJusqua, utilise, maximum, renouvellement, parStationEtProjet: parStationEtProject } = valeur as Record<string, unknown>;
  const calls = (Array.isArray(parStationEtProject) ? parStationEtProject : []).flatMap((call: unknown): CallDuQuota[] => {
    if (typeof call !== "object" || call === null) return [];
    const { station, projet: project, typeAppel: typeCall, nombre: n } = call as Record<string, unknown>;
    return typeof station === "string" && typeof project === "string" && typeof typeCall === "string" && typeof n === "number" ? [{ station, projet: project, typeAppel: typeCall, nombre: n }] : [];
  });
  return { quotaGithub: { limite: texte(limit) ?? "", pauseJusqua: texte(pauseJusqua), utilise: nombre(utilise), maximum: nombre(maximum), renouvellement: texte(renouvellement), parStationEtProjet: calls } };
}
