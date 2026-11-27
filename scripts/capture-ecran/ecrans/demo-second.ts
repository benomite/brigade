// Scène 2 de la démo (ticket 2875) : l'espace de « parade », son second qui a posé un plan et propose un seul ticket,
// #21 « L'export du journal », et demande de choisir dans son terminal.
import type { Ecran } from "./commun.ts";
import { donneesDe, OUVRIR_PARADE, SECOND, VIDE } from "./demo-commun.ts";

const ECRAN_DU_SECOND = [
  "\x1b[1msecond · parade\x1b[0m",
  "",
  "> I want to export a project's journal to a file.",
  "",
  "  Plan: read the journal, write it out one file per project.",
  "  Proposed ticket: \x1b[1mThe journal export\x1b[0m",
  "  One export per project, or a single one for all projects?",
  "",
  "  A. One per project: each project keeps its own file",
  "  B. A single export, all projects together",
  "",
  "\x1b[2m> \x1b[0m",
].join("\r\n");

export const ecran: Ecran = {
  dit: "La démo, scène 2 : le second de « parade » pose un plan, propose un ticket (l'export du journal) et demande de choisir",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR_PARADE],
  donnees: () => {
    const base = donneesDe(VIDE);
    const regarder = base.envois.regarder ?? {};
    // Le second a écrit son plan : sa sortie remplace celle du repos.
    return { ...base, envois: { ...base.envois, regarder: { ...regarder, parade: [...(regarder.parade ?? []).slice(0, -1), { sur: "surSortie", args: [SECOND.id, ECRAN_DU_SECOND] }] } } };
  },
};
