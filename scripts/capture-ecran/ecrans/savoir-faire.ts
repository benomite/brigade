// La page de « parade », Settings et sa section « Caps, closer and all projects » : le savoir-faire du projet (#4239),
// les entrées de son `.brigade/know-how.md` par section, chacune avec son ticket source — une sans ticket.
import type { LectureDuSavoir } from "../../../app/src/vue/know-how/know-how-github.ts";
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { PLAFONDS_LUS, SETTINGS } from "./projet-sante.ts";
import { NORMAL } from "./projet-temps-commun.ts";

export const SAVOIR = { defiler: '[data-bloc="know-how"]' };
export const SAVOIR_LU: LectureDuSavoir = {
  depot: "chef/parade",
  branche: "main",
  vide: false,
  entries: [
    { section: "Conventions", text: "Tests live next to the code they test", ticket: 101, line: 3 },
    { section: "Conventions", text: "Identifiers are in French, docs in English", ticket: 102, line: 4 },
    { section: "Pitfalls", text: "Never run the pass with a dirty worktree", ticket: 205, line: 7 },
    { section: "Tools", text: "Use `gh api rate_limit` before a batch of GitHub reads", ticket: 310, line: 10 },
    { section: "Tools", text: "A tool nobody ticketed", ticket: null, line: 11 },
  ],
};

export const ecran: Ecran = {
  dit: "L'espace de « parade », Settings : le savoir-faire du projet, ses entrées par section avec leur ticket source (#4239)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, SETTINGS, SAVOIR],
  donnees: () => donnees({ ...SUR_LA_BOX, temps: { enregistrements: NORMAL, lostTimeMaxMin: 2 } }, { plafondsDuree: PLAFONDS_LUS, savoirDuProjet: SAVOIR_LU }),
};
