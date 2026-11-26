// Ce qu'une carte du rail dit en deux lignes : une phrase en mots simples qui dit ce qui se passe,
// et au plus un signal quand quelque chose demande l'attention du chef. Une phrase par état, écrite
// d'après les seuls faits que la file donne déjà de la carte (facts.ts) ; tout le reste — qui le
// tient, son bail, ce qu'il brûle, ce que la file ne dit pas — est dans la fiche. Rien n'est
// inventé : quand le fait manque, la phrase de l'état le dit en deux mots et `repere` s'allume.
//
//   au travail   `<fait> <cible> · <durée> ago`       (« writing app/src/slip.ts · 12 min ago » ; sans activité connue : « no activity yet »)
//   en pass      la même, l'étape de la pass à la place du geste quand le runtime la donne (« CI running · 45 s ago »)
//   base rouge   `waits for main to be green · <durée>`
//   en attente   `Waiting for #a, #b` (chaque numéro s'ouvre) ; ou ce qui le retient ; ou, en file derrière un ticket, chaque
//                attente et sa source, `waits for #N — read from the body: '…'` (tickets 3433, 3763) ; sinon « ready, waits
//                for a place in the kitchen »
//   en tête      en tête de la file sans partir : `does not leave: <raison du runtime>` (ticket 1347)
//   bloquée      ce qui la retient ; signal « blocked »
//   mise de côté `Will not start: <raison en mots simples>.` (refusal.ts) ; signal « set aside »
//   en WAITING   `waiting for <quoi> · from <qui>` ; signal si la relance est passée
//   répondue     `answered by <qui> · the manager's turn` (#503)
//   m'attend     ce qu'on attend du chef, en une phrase (decision.ts)
//   livrée       `served at HH:MM · <résumé>`
import { heureHM } from "./format.ts";
import { refusalEnClair } from "./refusal.ts";
import { type ActivityDeCard, tellActivity, PAS_ENCORE_D_ACTIVITY } from "./vue/card/activity.ts";
import { dayDe } from "./vue/wait/saisie.ts";

// `signal` : ce qui demande l'attention. `repere` : la file ne dit pas tout, la fiche le détaille. `liens` : les tickets que la
// ligne nomme et que la carte ouvre d'un clic.
export type LineDeCard = { ligne: string; signal?: string; repere?: true; liens?: number[] };

export const PRET = "ready, waits for a place in the kitchen";
export const AWAITS_YOUR_DECISION = "waits for your decision";
export const BLOCKED = "blocked";
export const MISE_DE_SIDE = "set aside";
export const RELANCE_PASSEE = "follow-up date passed";

// Au travail ou en pass : ce que la cuisine en fait et depuis quand (vue/card/activity.ts) ; `duree` est déjà écrite. Sans
// activité connue, la carte le dit en trois mots, et le repère.
export function lineAuTravail(activity: ActivityDeCard | null | undefined, duree: string): LineDeCard {
  const dit = tellActivity(activity, duree);
  return dit === null ? { ligne: PAS_ENCORE_D_ACTIVITY, repere: true } : { ligne: dit };
}

// En pass, tenu par une base rouge : il attend que main soit verte, depuis que sa PR est ouverte (comme `in pass`) ; sans
// date, la ligne le dit sans durée.
export const lineBaseRed = (duree: string): LineDeCard => ({ ligne: `waits for main to be green${duree === "" ? "" : ` · ${duree}`}`, ...(duree === "" ? { repere: true as const } : {}) });

// Sur le rail, rien ne le tient : ce qui le retient s'il y en a, sinon il attend sa place.
// Un retenu par des tickets se dit « Waiting for #a, #b » ; un texte sans numéro est relayé tel quel.
// `derriere` : la ligne que le runtime donne à une carte en file qui ne part pas la prochaine (ticket 3433), et les tickets
// qu'elle attend, faute d'autre raison : elle ne remplace pas celle d'un retenu. Ses liens sont ces tickets, jamais un numéro
// de la phrase du corps qu'elle cite (« waits for #1912 — read from the body: 'Builds on #1908' » n'ouvre que #1912, ticket 3763).
export function queuedLine(state: string, retient: string | undefined, derriere?: { ligne: string; attendus: readonly number[] }): LineDeCard {
  const numeros = retient === undefined && derriere !== undefined ? [...new Set(derriere.attendus)] : [...new Set((retient?.match(/#\d+/g) ?? []).map((numero) => Number(numero.slice(1))))];
  const phrase = retient === undefined && derriere !== undefined ? derriere.ligne : numeros.length > 0 ? `Waiting for ${numeros.map((n) => `#${n}`).join(", ")}` : retient;
  const liens = numeros.length > 0 ? { liens: numeros } : {};
  if (state === "BLOQUÉ") return { ligne: phrase ?? BLOCKED, signal: BLOCKED, ...liens, ...(phrase === undefined ? { repere: true as const } : {}) };
  return { ligne: phrase ?? PRET, ...liens };
}

// En tête de la file, et il ne part pas : pourquoi, dans les mots du runtime — une zone tenue, la machine saturée.
export function lineDeTete(state: string, raison: string): LineDeCard {
  return { ligne: `does not leave: ${raison}`, ...(state === "BLOQUÉ" ? { signal: BLOCKED } : {}) };
}

// Mis de côté (86) : sa raison, telle que le runtime la donne.
export const lineMiseDeSide = (raison: string): LineDeCard => ({ ligne: raison, signal: MISE_DE_SIDE });

// Mis de côté (86) sans qu'un humain ait à trancher une question, donc que plus aucun cook ne prendra (ticket 3147) : la
// raison en mots simples (refusal.ts), d'après le message de la station.
export const lineRefusee = (brut: string | null | undefined): LineDeCard => ({ ligne: refusalEnClair(brut), signal: MISE_DE_SIDE });

// Qui m'attend : ce qu'on attend du chef, en une phrase.
export const lineAwaitingMe = (phrase: string | undefined): LineDeCard => (phrase === undefined ? { ligne: AWAITS_YOUR_DECISION, repere: true } : { ligne: phrase });

// En WAITING : ce qu'il attend, de qui, et le jour de sa relance, au calendrier du poste (#3075) ; la relance passée est
// le signal.
export const lineEnWaiting = (tiers: { quoi: string; qui: string; relance?: string | null } | null | undefined, relancePassee: boolean): LineDeCard =>
  tiers == null
    ? { ligne: "waits for a third party", repere: true }
    : { ligne: `waiting for ${tiers.quoi} · from ${tiers.qui}${tiers.relance == null ? "" : ` · follow-up ${dayDe(new Date(tiers.relance))}`}`, ...(relancePassee ? { signal: RELANCE_PASSEE } : {}) };

// Une question du manager répondue, qui attend qu'il lise la réponse (repondues.ts) : qui y a répondu.
export const lineRepondue = (par: string): LineDeCard => ({ ligne: `answered by ${par} · the manager's turn` });

// Livrée : l'heure, locale, et ce qui a été livré en une phrase — sans résumé, l'heure seule.
export function lineLivree(quand: string, resume: string | undefined): LineDeCard {
  const heure = `served at ${heureHM(quand)}`;
  const phrase = resume?.split(/(?<=[.!?])\s/)[0]?.trim();
  return phrase === undefined || phrase === "" ? { ligne: heure, repere: true } : { ligne: `${heure} · ${phrase}` };
}

// Une carte que l'app n'a pas su lire — la box en sait plus qu'elle : la forme est plus récente. Seule cette carte en pâtit.
export const lineIllisible = (): LineDeCard => ({ ligne: "the app could not read this card — update the app to fix it", signal: "unreadable" });
