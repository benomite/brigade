// Ce qu'une carte du rail dit en deux lignes : une phrase en mots simples qui dit ce qui se passe,
// et au plus un signal quand quelque chose demande l'attention du chef. Une phrase par état, écrite
// d'après les seuls faits que la file donne déjà de la carte (faits.ts) ; tout le reste — qui le
// tient, son bail, ce qu'il brûle, ce que la file ne dit pas — est dans la fiche. Rien n'est
// inventé : quand le fait manque, la phrase de l'état le dit en deux mots et `repere` s'allume.
//
//   au travail   `<fait> <cible> · <durée>`           (« writes the tests · 12 min »)
//   en pass      la même, sinon « review in progress »
//   en attente   `after #a, #b` ; ou ce qui le retient ; sinon « ready, waits for a place in the kitchen »
//   en tête      en tête de la file sans partir : `does not leave: <raison du runtime>` (ticket 1347)
//   bloquée      ce qui la retient ; signal « blocked »
//   mise de côté sa raison en clair ; signal « set aside »
//   en WAITING   `waiting for <quoi> · from <qui>` ; signal si la relance est passée
//   répondue     `answered by <qui> · the manager's turn` (#503)
//   m'attend     ce qu'on attend du chef, en une phrase (decision.ts)
//   livrée       `served at HH:MM · <résumé>`
import { heureHM } from "./format.ts";

// `signal` : ce qui demande l'attention. `repere` : la file ne dit pas tout, la fiche le détaille.
export type LigneDeCarte = { ligne: string; signal?: string; repere?: true };

export const TRAVAIL_SANS_DETAIL = "in the kitchen";
export const PASS_SANS_DETAIL = "review in progress";
export const PRET = "ready, waits for a place in the kitchen";
export const ATTEND_TA_DECISION = "waits for your decision";
export const BLOQUEE = "blocked";
export const MISE_DE_COTE = "set aside";
export const RELANCE_PASSEE = "follow-up date passed";

// Au travail ou en pass : le geste, ce qu'il vise, depuis combien de temps (`duree`, déjà écrite).
// `activite` : nulle ou absente, la box ne dit pas ce qu'on en fait.
export function ligneAuTravail(etat: "pris" | "en pass", activite: { fait: string; cible: string | null } | null | undefined, duree: string): LigneDeCarte {
  if (activite == null) return { ligne: etat === "pris" ? TRAVAIL_SANS_DETAIL : PASS_SANS_DETAIL, repere: true };
  return { ligne: `${activite.cible === null ? activite.fait : `${activite.fait} ${activite.cible}`} · ${duree}` };
}

// Sur le rail, rien ne le tient : ce qui le retient s'il y en a, sinon il attend sa place.
// Un retenu par des tickets se dit « after #a, #b » ; un texte sans numéro est relayé tel quel.
export function ligneEnAttente(etat: string, retient: string | undefined): LigneDeCarte {
  const numeros = [...new Set(retient?.match(/#\d+/g) ?? [])];
  const phrase = numeros.length > 0 ? `after ${numeros.join(", ")}` : retient;
  if (etat === "BLOQUÉ") return { ligne: phrase ?? BLOQUEE, signal: BLOQUEE, ...(phrase === undefined ? { repere: true as const } : {}) };
  return { ligne: phrase ?? PRET };
}

// En tête de la file, et il ne part pas : pourquoi, dans les mots du runtime — une zone tenue, la machine saturée.
export function ligneDeTete(etat: string, raison: string): LigneDeCarte {
  return { ligne: `does not leave: ${raison}`, ...(etat === "BLOQUÉ" ? { signal: BLOQUEE } : {}) };
}

// Mis de côté (86) : sa raison, telle que le runtime la donne.
export const ligneMiseDeCote = (raison: string): LigneDeCarte => ({ ligne: raison, signal: MISE_DE_COTE });

// Qui m'attend : ce qu'on attend du chef, en une phrase.
export const ligneQuiMAttend = (phrase: string | undefined): LigneDeCarte => (phrase === undefined ? { ligne: ATTEND_TA_DECISION, repere: true } : { ligne: phrase });

// En WAITING : ce qu'il attend et de qui ; la relance passée est le signal.
export const ligneEnWaiting = (tiers: { quoi: string; qui: string } | null | undefined, relancePassee: boolean): LigneDeCarte =>
  tiers == null ? { ligne: "waits for a third party", repere: true } : { ligne: `waiting for ${tiers.quoi} · from ${tiers.qui}`, ...(relancePassee ? { signal: RELANCE_PASSEE } : {}) };

// Une question du manager répondue, qui attend qu'il lise la réponse (repondues.ts) : qui y a répondu.
export const ligneRepondue = (par: string): LigneDeCarte => ({ ligne: `answered by ${par} · the manager's turn` });

// Livrée : l'heure, locale, et ce qui a été livré en une phrase — sans résumé, l'heure seule.
export function ligneLivree(quand: string, resume: string | undefined): LigneDeCarte {
  const heure = `served at ${heureHM(quand)}`;
  const phrase = resume?.split(/(?<=[.!?])\s/)[0]?.trim();
  return phrase === undefined || phrase === "" ? { ligne: heure, repere: true } : { ligne: `${heure} · ${phrase}` };
}

// Une carte que l'app n'a pas su lire — la box en sait plus qu'elle : la forme est plus récente. Seule cette carte en pâtit.
export const ligneIllisible = (): LigneDeCarte => ({ ligne: "the app could not read this card — update the app to fix it", signal: "unreadable" });
