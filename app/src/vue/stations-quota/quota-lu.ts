// Le quota GitHub du compte, tel que `facts` le porte (runtime, `quotaGithub`, ticket 3483) : absent d'un runtime d'avant ce champ,
// et alors l'onglet Stations n'a pas de jauge. Présent mais mal formé, il se lit quand même : un nombre qui n'en est pas un
// devient NaN, que la jauge dit « unavailable » plutôt que d'inventer un chiffre ; une ligne d'usage mal formée est omise.
export type AppelDuQuota = { station: string; projet: string; typeAppel: string; nombre: number };
export type QuotaGithub = { limite: string; pauseJusqua: string | null; utilise: number; maximum: number; renouvellement: string | null; parStationEtProjet: AppelDuQuota[] };

const texte = (valeur: unknown): string | null => (typeof valeur === "string" ? valeur : null);
const nombre = (valeur: unknown): number => (typeof valeur === "number" ? valeur : Number.NaN);

// `quotaGithub`, de la racine de `facts`.
export function quotaLu(valeur: unknown): { quotaGithub?: QuotaGithub } {
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) return {};
  const { limite, pauseJusqua, utilise, maximum, renouvellement, parStationEtProjet } = valeur as Record<string, unknown>;
  const appels = (Array.isArray(parStationEtProjet) ? parStationEtProjet : []).flatMap((appel: unknown): AppelDuQuota[] => {
    if (typeof appel !== "object" || appel === null) return [];
    const { station, projet, typeAppel, nombre: n } = appel as Record<string, unknown>;
    return typeof station === "string" && typeof projet === "string" && typeof typeAppel === "string" && typeof n === "number" ? [{ station, projet, typeAppel, nombre: n }] : [];
  });
  return { quotaGithub: { limite: texte(limite) ?? "", pauseJusqua: texte(pauseJusqua), utilise: nombre(utilise), maximum: nombre(maximum), renouvellement: texte(renouvellement), parStationEtProjet: appels } };
}
