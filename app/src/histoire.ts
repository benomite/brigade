// L'histoire d'un ticket et ce qu'il a coûté, sur sa fiche : les types que la fiche dit, remplis de ce que
// GitHub en garde (fiche-github.ts) — les étapes dans l'ordre, chacune avec son heure, et le coût. Rien
// n'est inventé : une valeur que GitHub ne porte pas est écrite « not communicated ».
// S'y ajoutent, pour un ticket vivant, ce que son cook fait en ce moment ou ce qui le bloque,
// lus de ce que sa carte porte déjà (faits.ts) — aucune lecture de plus.
export const NON_COMMUNIQUE = "not communicated";

// Une étape, dite : son mot, l'heure de la box, sa couleur quand elle juge (`vert`, `rouge`), et
// ce qu'elle porte de plus — le résumé d'une relecture.
export type EtapeDite = { libelle: string; at: string; ton?: "vert" | "rouge"; detail?: string };
// Le coût, dit : chaque valeur est un texte, ou « not communicated ». `minimum` : au moins un
// cook n'a rien déclaré, les sommes sont alors un minimum.
export type CoutDit = { tokens: string; duree: string; essais: string; minimum: boolean };
// Une leçon de la rétro, dite : son id et son texte — ou ce que la box n'en donne pas —, et
// `reconfirmee` : la rétro reconfirme une leçon du projet plutôt que d'en proposer une. Toutes
// sont provisoires : rien ne les a validées.
export type LeconDite = { id: string; texte: string; reconfirmee: boolean };
// La rétro du ticket servi, dite : ce que son cook a écrit — `texte` nul, il n'a rien écrit — et
// ses leçons, au plus trois. `aucune` : le ticket n'en a pas encore, en une phrase. `sans` : la box
// ne l'a pas donnée, ou pas dans sa forme — pourquoi.
export type RetroDite = { at: string; texte: string | null; lecons: LeconDite[] } | { aucune: string } | { sans: string };
export type Histoire = { etapes: EtapeDite[]; cout: CoutDit; retro: RetroDite } | { sans: string };

// Un instant de la box, tel qu'elle l'a donné : son jour et son heure, en UTC.
export const instant = (iso: string) => `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;
const texte = (valeur: unknown): valeur is string => typeof valeur === "string";
const objet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);

// Une rétro en laisse au plus trois (runtime/src/apprentissage/retro.ts, `LECONS_MAX`).
export const LECONS_MAX = 3;
export const SANS_RETRO = "no retro for this ticket yet";

// Ce que la fiche d'un ticket vivant dit en plus : ce que son cook fait en ce moment (ticket pris
// ou en pass), ou ce qui le bloque (ticket en attente). Lu des faits que sa carte porte — mots du
// runtime, mot pour mot ; ce qui manque est écrit. Jamais la ligne de la file : ce qu'on attend
// du chef se dit en tête de la fiche, dans les mots de l'app (decision.ts) — et rien ici ne le
// répète quand la carte ne dit rien d'autre.
export type Situation = { libelle: string; lignes: string[] } | undefined;
// `question` : celle qu'une carte du chef lue de GitHub pose (#2434) — la fiche la dit, plutôt que « not communicated ».
type Carte = { etat?: string; attendu?: boolean; attend: readonly string[]; dit: readonly { libelle: string; valeur: string }[]; question?: string };

const AU_TRAVAIL = ["pris", "en pass"];
const EN_ATTENTE = ["en attente", "BLOQUÉ", "WAITING", "86"];
const CE_QUI_BLOQUE = ["blocked by", "set aside", "waiting for", "from", "since", "follow-up", "on arrival", "came back"];

export function situation(carte: Carte): Situation {
  const { etat } = carte;
  if (etat !== undefined && AU_TRAVAIL.includes(etat)) {
    const fait = carte.dit.find(({ libelle }) => libelle === "right now");
    return { libelle: "right now", lignes: [fait?.valeur ?? "activity not given"] };
  }
  if (carte.question !== undefined && carte.question.trim() !== "") return { libelle: "question", lignes: [carte.question] };
  if ((etat !== undefined && EN_ATTENTE.includes(etat)) || carte.attend.length > 0) {
    const dits = carte.dit.filter(({ libelle }) => CE_QUI_BLOQUE.includes(libelle)).map(({ libelle, valeur }) => `${libelle}: ${valeur}`);
    if (dits.length > 0) return { libelle: "blocked", lignes: dits };
    return carte.attend.length > 0 ? undefined : { libelle: "blocked", lignes: ["what blocks it: not communicated"] };
  }
  return undefined;
}

// La même, d'une carte venue de la vue : ce qui n'a pas la forme d'une carte n'a pas de situation.
export function situationDe(carte: unknown): Situation {
  if (!objet(carte) || !Array.isArray(carte.attend) || !Array.isArray(carte.dit)) return undefined;
  const dit = carte.dit.flatMap((fait) => (objet(fait) && texte(fait.libelle) && texte(fait.valeur) ? [{ libelle: fait.libelle, valeur: fait.valeur }] : []));
  return situation({ ...(texte(carte.etat) ? { etat: carte.etat } : {}), attend: carte.attend.filter(texte), dit, ...(texte(carte.question) ? { question: carte.question } : {}) });
}
