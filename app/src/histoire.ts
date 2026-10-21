// L'histoire d'un ticket et ce qu'il a coûté, sur sa fiche : ce que le runtime en dit par
// `pass -- <ticket> --json` (runtime/src/histoire-ticket.ts), posé tel quel — les étapes dans
// l'ordre de la box, chacune avec son heure, et le coût. Rien n'est inventé : une étape qui n'a
// pas eu lieu n'y est pas, une valeur que la box ne communique pas est écrite comme telle.
// S'y ajoutent, pour un ticket vivant, ce que son cook fait en ce moment ou ce qui le bloque,
// lus de ce que sa carte porte déjà (faits.ts) — aucune lecture de plus.
import { duree } from "./faits.ts";

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
const nombre = (valeur: unknown): valeur is number => typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur >= 0;
const texte = (valeur: unknown): valeur is string => typeof valeur === "string";
const heure = (valeur: unknown): valeur is string => texte(valeur) && !Number.isNaN(Date.parse(valeur));
const objet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);

const ILLISIBLE = "not read: the station did not return the history in the expected shape";

function etape(brut: unknown): EtapeDite | undefined {
  if (!objet(brut) || !heure(brut.at)) return undefined;
  const at = instant(brut.at);
  switch (brut.kind) {
    case "arrived":
      return { libelle: "arrived", at };
    case "taken":
      return { libelle: texte(brut.station) ? `taken by ${brut.station}` : "taken", at };
    case "delivered":
      return { libelle: "delivered", at };
    case "reviewed": {
      const { verdict, summary } = brut;
      const detail = texte(summary) && summary !== "" ? { detail: summary } : {};
      if (verdict === "green") return { libelle: "reviewed: green", at, ton: "vert", ...detail };
      if (verdict === "red") return { libelle: "reviewed: red", at, ton: "rouge", ...detail };
      return verdict === "unreadable" ? { libelle: "reviewed: verdict unreadable", at, ...detail } : undefined;
    }
    case "judged":
      if (brut.verdict === "green") return { libelle: "judged: green", at, ton: "vert" };
      return brut.verdict === "red" ? { libelle: "judged: red", at, ton: "rouge" } : undefined;
    case "merged":
      return { libelle: brut.by === "outside" ? "merged (outside the pass)" : "merged", at };
    case "served":
      return { libelle: "served without a merge", at };
    default:
      return undefined;
  }
}

// Une rétro en laisse au plus trois (runtime/src/apprentissage/retro.ts, `LECONS_MAX`).
export const LECONS_MAX = 3;
export const SANS_RETRO = "no retro for this ticket yet";
const RETRO_PAS_DONNEE = "retro not communicated: this station does not give it yet";
const RETRO_ILLISIBLE = "retro not read: the station did not return it in the expected shape";

// La rétro, telle que `pass -- <ticket> --json` la donne (`retro`) : nulle, le ticket n'a pas
// été servi ; absente, la box est d'avant la rétro sur la fiche.
function retroDe(brute: unknown): RetroDite {
  if (brute === undefined) return { sans: RETRO_PAS_DONNEE };
  if (brute === null) return { aucune: SANS_RETRO };
  if (!objet(brute)) return { sans: RETRO_ILLISIBLE };
  const { at, text, lessons } = brute;
  if (!heure(at) || !(text === null || texte(text)) || !Array.isArray(lessons)) return { sans: RETRO_ILLISIBLE };
  const lecons = lessons.slice(0, LECONS_MAX).flatMap((lecon: unknown): LeconDite[] => {
    if (!objet(lecon) || (lecon.kind !== "propose" && lecon.kind !== "reconfirm")) return [];
    const { id, text: dite } = lecon;
    return [{ id: texte(id) && id !== "" ? id : "id not given", texte: texte(dite) && dite !== "" ? dite : "text not given", reconfirmee: lecon.kind === "reconfirm" }];
  });
  return { at: instant(at), texte: text === "" ? null : text, lecons };
}

// Ce que `pass -- <ticket> --json` a rendu, en mots de la fiche — ou pourquoi on n'en lit rien.
export function histoireDe(sortie: string): Histoire {
  let lu: unknown;
  try {
    lu = JSON.parse(sortie);
  } catch {
    return { sans: ILLISIBLE };
  }
  if (!objet(lu) || !Array.isArray(lu.steps) || !objet(lu.cost)) return { sans: ILLISIBLE };
  const { attempts, tokens, durationMs, incomplete } = lu.cost;
  if (!nombre(attempts) || (tokens !== null && !nombre(tokens)) || (durationMs !== null && !nombre(durationMs))) return { sans: ILLISIBLE };
  const etapes = lu.steps.flatMap((brute) => etape(brute) ?? []);
  return {
    etapes,
    cout: {
      tokens: tokens === null ? NON_COMMUNIQUE : String(tokens),
      duree: durationMs === null ? NON_COMMUNIQUE : duree(durationMs),
      // Les essais sont toujours connus : aucun cook lancé, c'est zéro, pas un manque.
      essais: String(attempts),
      minimum: incomplete === true,
    },
    retro: retroDe(lu.retro),
  };
}

// Ce que la fiche d'un ticket vivant dit en plus : ce que son cook fait en ce moment (ticket pris
// ou en pass), ou ce qui le bloque (ticket en attente). Lu des faits que sa carte porte — mots du
// runtime, mot pour mot ; ce qui manque est écrit. Jamais la ligne de la file : ce qu'on attend
// du chef se dit en tête de la fiche, dans les mots de l'app (decision.ts) — et rien ici ne le
// répète quand la carte ne dit rien d'autre.
export type Situation = { libelle: string; lignes: string[] } | undefined;
type Carte = { etat?: string; attendu?: boolean; attend: readonly string[]; dit: readonly { libelle: string; valeur: string }[] };

const AU_TRAVAIL = ["pris", "en pass"];
const EN_ATTENTE = ["en attente", "BLOQUÉ", "WAITING", "86"];
const CE_QUI_BLOQUE = ["blocked by", "set aside", "waiting for", "from", "since", "follow-up", "on arrival", "came back"];

export function situation(carte: Carte): Situation {
  const { etat } = carte;
  if (etat !== undefined && AU_TRAVAIL.includes(etat)) {
    const fait = carte.dit.find(({ libelle }) => libelle === "right now");
    return { libelle: "right now", lignes: [fait?.valeur ?? "activity not given"] };
  }
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
  return situation({ ...(texte(carte.etat) ? { etat: carte.etat } : {}), attend: carte.attend.filter(texte), dit });
}
