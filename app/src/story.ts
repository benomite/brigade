// L'histoire d'un ticket et ce qu'il a coûté, sur sa fiche : les types que la fiche dit, remplis de ce que
// GitHub en garde (card-github.ts) — les étapes dans l'ordre, chacune avec son heure, et le coût. Rien
// n'est inventé : une valeur que GitHub ne porte pas est écrite « not communicated ».
// S'y ajoutent, pour un ticket vivant, ce que son cook fait en ce moment ou ce qui le bloque,
// lus de ce que sa carte porte déjà (facts.ts) — aucune lecture de plus.
export const NOT_COMMUNICATED = "not communicated";

// Une étape, dite : son mot, l'heure de la box, sa couleur quand elle juge (`vert`, `rouge`), et
// ce qu'elle porte de plus — le résumé d'une relecture.
export type StepSaid = { libelle: string; at: string; ton?: "vert" | "rouge"; detail?: string };
// Le coût, dit : chaque valeur est un texte, ou « not communicated ». `minimum` : au moins un
// cook n'a rien déclaré, les sommes sont alors un minimum.
export type CostSays = { tokens: string; duree: string; essais: string; minimum: boolean };
// Une leçon de la rétro, dite : son id et son texte — ou ce que la box n'en donne pas —, et
// `reconfirmee` : la rétro reconfirme une leçon du projet plutôt que d'en proposer une. Toutes
// sont provisoires : rien ne les a validées.
export type LessonSaid = { id: string; texte: string; reconfirmee: boolean };
// La rétro du ticket servi, dite : ce que son cook a écrit — `texte` nul, il n'a rien écrit — et
// ses leçons, au plus trois. `aucune` : le ticket n'en a pas encore, en une phrase. `sans` : la box
// ne l'a pas donnée, ou pas dans sa forme — pourquoi.
export type RetroSaid = { at: string; texte: string | null; lecons: LessonSaid[] } | { aucune: string } | { sans: string };
export type Story = { etapes: StepSaid[]; cout: CostSays; retro: RetroSaid } | { sans: string };

// Un instant de la box, tel qu'elle l'a donné : son jour et son heure, en UTC.
export const instant = (iso: string) => `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;
const text = (value: unknown): value is string => typeof value === "string";
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

// Une rétro en laisse au plus trois (runtime/src/apprentissage/retro.ts, `LECONS_MAX`).
export const LESSONS_MAX = 3;
export const WITHOUT_RETRO = "no retro for this ticket yet";

// Ce que la fiche d'un ticket vivant dit en plus : ce que son cook fait en ce moment (ticket pris
// ou en pass), ou ce qui le bloque (ticket en attente). Lu des faits que sa carte porte — mots du
// runtime, mot pour mot ; ce qui manque est écrit. Jamais la ligne de la file : ce qu'on attend
// du chef se dit en tête de la fiche, dans les mots de l'app (decision.ts) — et rien ici ne le
// répète quand la carte ne dit rien d'autre.
export type Situation = { libelle: string; lignes: string[] } | undefined;
// `question` : celle qu'une carte du chef lue de GitHub pose (#2434) — la fiche la dit, plutôt que « not communicated ».
type Card = { etat?: string; attendu?: boolean; attend: readonly string[]; dit: readonly { libelle: string; valeur: string }[]; question?: string };

const AT_WORK = ["pris", "en pass"];
const QUEUED = ["en attente", "tests écrits", "BLOQUÉ", "WAITING", "86"];
const WHAT_BLOCKS = ["blocked by", "set aside", "waiting for", "from", "since", "follow-up", "on arrival", "came back"];

export function situation(card: Card): Situation {
  const { etat: state } = card;
  if (state !== undefined && AT_WORK.includes(state)) {
    const done = card.dit.find(({ libelle: wording }) => wording === "right now");
    return { libelle: "right now", lignes: [done?.valeur ?? "activity not given"] };
  }
  if (card.question !== undefined && card.question.trim() !== "") return { libelle: "question", lignes: [card.question] };
  if ((state !== undefined && QUEUED.includes(state)) || card.attend.length > 0) {
    const saidOnes = card.dit.filter(({ libelle: wording }) => WHAT_BLOCKS.includes(wording)).map(({ libelle: wording, valeur: value }) => `${wording}: ${value}`);
    if (saidOnes.length > 0) return { libelle: "blocked", lignes: saidOnes };
    return card.attend.length > 0 ? undefined : { libelle: "blocked", lignes: ["what blocks it: not communicated"] };
  }
  return undefined;
}

// La même, d'une carte venue de la vue : ce qui n'a pas la forme d'une carte n'a pas de situation.
export function situationOf(card: unknown): Situation {
  if (!object(card) || !Array.isArray(card.attend) || !Array.isArray(card.dit)) return undefined;
  const said = card.dit.flatMap((done) => (object(done) && text(done.libelle) && text(done.valeur) ? [{ libelle: done.libelle, valeur: done.valeur }] : []));
  return situation({ ...(text(card.etat) ? { etat: card.etat } : {}), attend: card.attend.filter(text), dit: said, ...(text(card.question) ? { question: card.question } : {}) });
}
