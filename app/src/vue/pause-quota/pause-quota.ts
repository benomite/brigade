// La pause de quota GitHub du compte (ticket 3482, épique 3475) : quand le quota GitHub du compte est épuisé, les stations
// tournent mais ne peuvent plus écrire leur signe de vie. Ce n'est pas une panne : rien n'est à faire, elles reprennent
// seules. La pause se dit une fois pour tout le compte, en tête de l'app (line-of-the-pause.js) ; chaque projet dit
// seulement qu'il est en pause pour la même raison, jamais « offline » ni « Start it on its computer ».
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

export type LimitOfQuota = "core" | "ecriture";
export type QuotaGithub = { limite: LimitOfQuota; pauseJusqua: string | null; utilise: number | null; maximum: number | null };
// La pause du compte : la limite atteinte, et la reprise — nulle quand aucune station ne la sait.
export type PauseOfAccount = { limite: LimitOfQuota; jusqua: string | null };

// Ce que les signes de vie portent, du contrat : son dernier signe, son arrêt, et son quota.
export type Sign = { lastSeen: string; stoppedAt: string | null; heldBy?: RetenueParGitHub | null; quotaGithub?: QuotaGithub };

const LIMITS: readonly LimitOfQuota[] = ["core", "ecriture"];
// La limite du contrat de l'enregistrement (`github-limite.ts`, `SORTES_DE_LIMITE`) qui dit la même chose.
const HELD: Record<LimitOfQuota, string> = { core: "primary", ecriture: "secondary-writes" };

const object = (value: unknown): Record<string, unknown> | null => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null);
const date = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));
const count = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

// `quotaGithub` d'une station, ou null : absent, ou mal formé — une limite inconnue, une reprise illisible.
export function quotaGithubRead(raw: unknown): QuotaGithub | null {
  const readOne = object(raw);
  if (readOne === null || !LIMITS.includes(readOne.limite as LimitOfQuota)) return null;
  if (readOne.pauseJusqua !== null && !date(readOne.pauseJusqua)) return null;
  return { limite: readOne.limite as LimitOfQuota, pauseJusqua: readOne.pauseJusqua, utilise: count(readOne.utilise), maximum: count(readOne.maximum) };
}

// La station est-elle en pause à cet instant : sa reprise est à venir ; ou elle ne la sait pas, et son quota ne dit pas
// qu'il lui reste des appels.
function enPause({ pauseJusqua: pauseUntil, utilise, maximum }: QuotaGithub, now: number): boolean {
  if (pauseUntil !== null) return Date.parse(pauseUntil) > now;
  return !(utilise !== null && maximum !== null && utilise < maximum);
}

const stopped = ({ stoppedAt, lastSeen }: Sign) => stoppedAt !== null && Date.parse(stoppedAt) >= Date.parse(lastSeen);

// Les stations en pause : celles qui tournent — une station arrêtée l'est vraiment, la pause ne la couvre pas.
const enPauseAmong = <S extends Sign>(signs: readonly S[], now: number) =>
  signs.flatMap((sign) => (sign.quotaGithub === undefined || stopped(sign) || !enPause(sign.quotaGithub, now) ? [] : [{ signe: sign, quota: sign.quotaGithub }]));

// La pause du compte, ou null : aucune station ne la dit. Elle dure jusqu'à la reprise la plus tardive ; une station qui
// ne la sait pas la rend inconnue. La limite est celle de la station qui reprend le plus tard.
export function pauseOfAccount(signs: readonly Sign[], now: number): PauseOfAccount | null {
  const enPauses = enPauseAmong(signs, now);
  if (enPauses.length === 0) return null;
  const unknown = enPauses.find(({ quota }) => quota.pauseJusqua === null);
  if (unknown !== undefined) return { limite: unknown.quota.limite, jusqua: null };
  const [last] = [...enPauses].sort((a, b) => Date.parse(b.quota.pauseJusqua as string) - Date.parse(a.quota.pauseJusqua as string));
  return { limite: (last as (typeof enPauses)[number]).quota.limite, jusqua: (last as (typeof enPauses)[number]).quota.pauseJusqua };
}

// Les signes de vie, chaque station en pause retenue par GitHub (`heldBy`) jusqu'à sa reprise — ou, inconnue, jusqu'à cet
// instant : la retenue tient tant que la pause tient. Une retenue que la station a déjà écrite reste la sienne.
export function withThePause<S extends Sign>(signs: readonly S[], now: number): S[] {
  const enPauses = new Set(enPauseAmong(signs, now).map(({ signe: sign }) => sign));
  return signs.map((sign) => {
    if (!enPauses.has(sign) || (sign.heldBy ?? null) !== null) return sign;
    const quota = sign.quotaGithub as QuotaGithub;
    return { ...sign, heldBy: { limit: HELD[quota.limite], since: sign.lastSeen, until: quota.pauseJusqua ?? new Date(now).toISOString() } };
  });
}

// La station de cet ordinateur, que l'app voit tourner (son process, workstation/station.ts), n'est pas tue, même quand le quota
// GitHub l'empêche d'écrire son signe de vie : son dernier signe est cet instant. `id` : son gist (outages/login.ts,
// `gistLocal`), nul quand elle ne tourne pas ici — rien ne change alors.
export function withTheStationLocale<S extends Sign & { id?: string }>(signs: readonly S[], id: string | null, now: number): S[] {
  if (id === null) return [...signs];
  const instant = new Date(now).toISOString();
  return signs.map((sign) => (sign.id === id && Date.parse(sign.lastSeen) < now ? { ...sign, lastSeen: instant } : sign));
}

// Les présences qui disent une station du compte en ligne (stations-of-account.ts, `avecLeurEtat`), et celle de la station de
// cet ordinateur quand l'app la voit tourner : son nom, celui de son enregistrement.
export type Presence = { nom: string; etat: string };
export function withThePresenceLocale(presences: readonly Presence[], stations: readonly { id: string; name: string }[], id: string | null): Presence[] {
  const here = id === null ? undefined : stations.find((station) => station.id === id);
  return here === undefined ? [...presences] : [...presences, { nom: here.name, etat: "en-ligne" }];
}

// Le téléphone (read-github-phone.ts) lit l'enregistrement de chaque station dans son gist, tel quel : son signe de
// vie et son quota GitHub, ou null quand il ne se lit pas — il ne dit alors aucune pause.
export function signOfTheRecording(raw: string | undefined): Sign | null {
  if (raw === undefined) return null;
  const readOne = enregistrementLu(raw);
  if ("illisible" in readOne) return null;
  const quotaGithub = quotaGithubRead((JSON.parse(raw) as { quotaGithub?: unknown }).quotaGithub);
  return { lastSeen: readOne.lastSeen, stoppedAt: readOne.stoppedAt, ...(quotaGithub === null ? {} : { quotaGithub }) };
}

// `pauseQuota`, de la racine de `facts` (facts.ts, `comprendre`) : rien de mal formé ne le pose.
export function pauseQuotaRead(value: unknown): { pauseQuota?: PauseOfAccount } {
  const readOne = object(value);
  if (readOne === null || !LIMITS.includes(readOne.limite as LimitOfQuota)) return {};
  if (readOne.jusqua !== null && !date(readOne.jusqua)) return {};
  return { pauseQuota: { limite: readOne.limite as LimitOfQuota, jusqua: readOne.jusqua } };
}
