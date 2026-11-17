// La fiche de #41 (comme attente-github-fiche), qui porte maintenant les enregistrements de ses critères (#3728) : un critère
// où tout est passé (done), un dont deux mutations ont survécu (failed, avec ses lignes), un dont l'enregistrement est vide
// (pending) — et le renvoi de la pass. La box ne publie pas encore ces enregistrements : ils sont posés ici sur la carte.
import type { Ecran, Envoi } from "./commun.ts";
import { donnees as donneesDeLaFiche } from "./attente-github-commun.ts";
import { OUVRIR_PARADE, TODO } from "./attente-github-commun.ts";

const TESTS = {
  sendBack: "a frozen acceptance test was modified",
  criteria: [
    { criterion: "The journal can be exported as CSV", testPath: "app/test/export-csv.test.ts", redOnMain: true, greenOnBranch: true, mutationsCaught: 5, mutationsTotal: 5, survivingLines: [] },
    {
      criterion: "A failed export says why in one line",
      testPath: "app/test/export-erreur.test.ts",
      redOnMain: true,
      greenOnBranch: true,
      mutationsCaught: 3,
      mutationsTotal: 5,
      survivingLines: ["app/src/export.ts:41 — `rows.length > 0` -> `rows.length >= 0`", "app/src/export.ts:58 — `return` removed"],
    },
    { criterion: "The export button is on the journal page", testPath: "app/test/vue/export-bouton.test.ts", redOnMain: true },
  ],
};

// Tout objet-carte de #41 que la vue reçoit prend ses enregistrements.
const porter = (valeur: unknown): unknown => {
  if (Array.isArray(valeur)) return valeur.map(porter);
  if (valeur === null || typeof valeur !== "object") return valeur;
  const objet = Object.fromEntries(Object.entries(valeur).map(([cle, suite]) => [cle, porter(suite)]));
  return (objet as { ticket?: unknown }).ticket === 41 && "fiche" in objet ? { ...objet, tests: TESTS } : objet;
};

export const ecran: Ecran = {
  dit: "la fiche de #41 ouverte depuis TODO : le test et le chemin de chacun de ses trois critères (done, failed, pending) et le renvoi de la pass (#3728)",
  largeur: 1440,
  hauteur: 1500,
  etapes: [OUVRIR_PARADE, { cliquer: `${TODO} li.bon:first-of-type` }],
  donnees() {
    const base = donneesDeLaFiche();
    const pose = (envois: Envoi[] = []) => envois.map((envoi): Envoi => ({ ...envoi, args: porter(envoi.args) as unknown[] }));
    const { faits, tous, regarder } = base.envois;
    return { ...base, envois: { faits: pose(faits), tous: pose(tous), regarder: Object.fromEntries(Object.entries(regarder ?? {}).map(([projet, envois]) => [projet, pose(envois)])) } };
  },
};
