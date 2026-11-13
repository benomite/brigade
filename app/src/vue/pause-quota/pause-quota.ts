// La pause de quota GitHub du compte (ticket 3482, épique 3475) : quand le quota GitHub du compte est épuisé, les stations
// tournent mais ne peuvent plus écrire leur signe de vie. Ce n'est pas une panne : rien n'est à faire, elles reprennent
// seules. La pause se dit une fois pour tout le compte, en tête de l'app (ligne-de-la-pause.js) ; chaque projet dit
// seulement qu'il est en pause pour la même raison, jamais « offline » ni « Start the station ».
//
// Le contrat (publié par le runtime, ticket du même épique) : l'état de chaque station porte `quotaGithub` =
// `{ limite: 'core' | 'ecriture', pauseJusqua: ISO | null, utilise, maximum, renouvellement, parStationEtProjet }`.
// `pauseJusqua` nul : la station ne sait pas quand le quota revient — la vue le dit.
//
// Ce module ne lit rien et ne touche pas `document` : la lecture du rail (vue/rail/github.ts, `avecLeRail`) lui donne les
// signes de vie des stations du compte, et il rend la pause du compte, que `facts` porte sous `pauseQuota`. Une station en
// pause reçoit la retenue que le contrat de l'enregistrement connaît déjà (`heldBy`, ticket 2443) : la règle de fraîcheur
// (`disponible`) la dit là, et le rail bloqué comme l'attente du rail disent « quota », jamais « offline ».
// Rien n'y est cru sur parole : un `quotaGithub` mal formé n'est pas une pause — la station se juge comme avant.
import { enregistrementLu, type RetenueParGitHub } from "../../../../runtime/src/enregistrement-station/contrat.ts";

export type LimiteDuQuota = "core" | "ecriture";
export type QuotaGithub = { limite: LimiteDuQuota; pauseJusqua: string | null; utilise: number | null; maximum: number | null };
// La pause du compte : la limite atteinte, et la reprise — nulle quand aucune station ne la sait.
export type PauseDuCompte = { limite: LimiteDuQuota; jusqua: string | null };

// Ce que les signes de vie portent, du contrat : son dernier signe, son arrêt, et son quota.
export type Signe = { lastSeen: string; stoppedAt: string | null; heldBy?: RetenueParGitHub | null; quotaGithub?: QuotaGithub };

const LIMITES: readonly LimiteDuQuota[] = ["core", "ecriture"];
// La limite du contrat de l'enregistrement (`github-limite.ts`, `SORTES_DE_LIMITE`) qui dit la même chose.
const RETENUE: Record<LimiteDuQuota, string> = { core: "primary", ecriture: "secondary-writes" };

const objet = (valeur: unknown): Record<string, unknown> | null => (typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : null);
const date = (valeur: unknown): valeur is string => typeof valeur === "string" && !Number.isNaN(Date.parse(valeur));
const nombre = (valeur: unknown): number | null => (typeof valeur === "number" && Number.isFinite(valeur) ? valeur : null);

// `quotaGithub` d'une station, ou null : absent, ou mal formé — une limite inconnue, une reprise illisible.
export function quotaGithubLu(brut: unknown): QuotaGithub | null {
  const lu = objet(brut);
  if (lu === null || !LIMITES.includes(lu.limite as LimiteDuQuota)) return null;
  if (lu.pauseJusqua !== null && !date(lu.pauseJusqua)) return null;
  return { limite: lu.limite as LimiteDuQuota, pauseJusqua: lu.pauseJusqua, utilise: nombre(lu.utilise), maximum: nombre(lu.maximum) };
}

// La station est-elle en pause à cet instant : sa reprise est à venir ; ou elle ne la sait pas, et son quota ne dit pas
// qu'il lui reste des appels.
export function enPause({ pauseJusqua, utilise, maximum }: QuotaGithub, maintenant: number): boolean {
  if (pauseJusqua !== null) return Date.parse(pauseJusqua) > maintenant;
  return !(utilise !== null && maximum !== null && utilise < maximum);
}

const arretee = ({ stoppedAt, lastSeen }: Signe) => stoppedAt !== null && Date.parse(stoppedAt) >= Date.parse(lastSeen);

// Les stations en pause : celles qui tournent — une station arrêtée l'est vraiment, la pause ne la couvre pas.
const enPauseParmi = <S extends Signe>(signes: readonly S[], maintenant: number) =>
  signes.flatMap((signe) => (signe.quotaGithub === undefined || arretee(signe) || !enPause(signe.quotaGithub, maintenant) ? [] : [{ signe, quota: signe.quotaGithub }]));

// La pause du compte, ou null : aucune station ne la dit. Elle dure jusqu'à la reprise la plus tardive ; une station qui
// ne la sait pas la rend inconnue. La limite est celle de la station qui reprend le plus tard.
export function pauseDuCompte(signes: readonly Signe[], maintenant: number): PauseDuCompte | null {
  const enPauses = enPauseParmi(signes, maintenant);
  if (enPauses.length === 0) return null;
  const inconnue = enPauses.find(({ quota }) => quota.pauseJusqua === null);
  if (inconnue !== undefined) return { limite: inconnue.quota.limite, jusqua: null };
  const [derniere] = [...enPauses].sort((a, b) => Date.parse(b.quota.pauseJusqua as string) - Date.parse(a.quota.pauseJusqua as string));
  return { limite: (derniere as (typeof enPauses)[number]).quota.limite, jusqua: (derniere as (typeof enPauses)[number]).quota.pauseJusqua };
}

// Les signes de vie, chaque station en pause retenue par GitHub (`heldBy`) jusqu'à sa reprise — ou, inconnue, jusqu'à cet
// instant : la retenue tient tant que la pause tient. Une retenue que la station a déjà écrite reste la sienne.
export function avecLaPause<S extends Signe>(signes: readonly S[], maintenant: number): S[] {
  const enPauses = new Set(enPauseParmi(signes, maintenant).map(({ signe }) => signe));
  return signes.map((signe) => {
    if (!enPauses.has(signe) || (signe.heldBy ?? null) !== null) return signe;
    const quota = signe.quotaGithub as QuotaGithub;
    return { ...signe, heldBy: { limit: RETENUE[quota.limite], since: signe.lastSeen, until: quota.pauseJusqua ?? new Date(maintenant).toISOString() } };
  });
}

// La station de cet ordinateur, que l'app voit tourner (son process, poste/station.ts), n'est pas tue, même quand le quota
// GitHub l'empêche d'écrire son signe de vie : son dernier signe est cet instant. `id` : son gist (pannes/login.ts,
// `gistLocal`), nul quand elle ne tourne pas ici — rien ne change alors.
export function avecLaStationLocale<S extends Signe & { id?: string }>(signes: readonly S[], id: string | null, maintenant: number): S[] {
  if (id === null) return [...signes];
  const instant = new Date(maintenant).toISOString();
  return signes.map((signe) => (signe.id === id && Date.parse(signe.lastSeen) < maintenant ? { ...signe, lastSeen: instant } : signe));
}

// Les présences qui disent une station du compte en ligne (stations-du-compte.ts, `avecLeurEtat`), et celle de la station de
// cet ordinateur quand l'app la voit tourner : son nom, celui de son enregistrement.
export type Presence = { nom: string; etat: string };
export function avecLaPresenceLocale(presences: readonly Presence[], stations: readonly { id: string; name: string }[], id: string | null): Presence[] {
  const ici = id === null ? undefined : stations.find((station) => station.id === id);
  return ici === undefined ? [...presences] : [...presences, { nom: ici.name, etat: "en-ligne" }];
}

// Le téléphone (lecture-github-telephone.ts) lit l'enregistrement de chaque station dans son gist, tel quel : son signe de
// vie et son quota GitHub, ou null quand il ne se lit pas — il ne dit alors aucune pause.
export function signeDeLEnregistrement(brut: string | undefined): Signe | null {
  if (brut === undefined) return null;
  const lu = enregistrementLu(brut);
  if ("illisible" in lu) return null;
  const quotaGithub = quotaGithubLu((JSON.parse(brut) as { quotaGithub?: unknown }).quotaGithub);
  return { lastSeen: lu.lastSeen, stoppedAt: lu.stoppedAt, ...(quotaGithub === null ? {} : { quotaGithub }) };
}

// `pauseQuota`, de la racine de `facts` (faits.ts, `comprendre`) : rien de mal formé ne le pose.
export function pauseQuotaLue(valeur: unknown): { pauseQuota?: PauseDuCompte } {
  const lu = objet(valeur);
  if (lu === null || !LIMITES.includes(lu.limite as LimiteDuQuota)) return {};
  if (lu.jusqua !== null && !date(lu.jusqua)) return {};
  return { pauseQuota: { limite: lu.limite as LimiteDuQuota, jusqua: lu.jusqua } };
}
