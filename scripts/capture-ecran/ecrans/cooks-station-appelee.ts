// L'onglet Cooks de « parade » à qui manque un navigateur pour ses tests, « Cook it on a station that has it » cliqué sur
// sa carte (#1511, épique #1506) : le formulaire de pc/claude, la station de ce poste, s'ouvre sous sa ligne avec
// `navigateur-headless` déjà coché, en plus de code et raisonnement qu'elle fournissait. Rien n'est écrit tant que le chef
// n'a pas cliqué sur « Save ».
import type { Blocage, Choix } from "../../../app/src/projets/demande.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { DEFAUTS } from "./ajouter-station.ts";
import { DECLAREES as TOUTES, guide } from "./cooks-stations-declarees.ts";
import { donnees, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { FACTS } from "./cooks-stations.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const NAVIGATEUR: Choix = {
  id: "need:browser",
  need: "browser",
  message: "The tests of parade need a headless browser, which box does not have.",
  cause: "`apps/web/package.json` depends on `playwright`; `.github/workflows/tests.yml` runs `npx playwright test`.",
  options: [
    { id: "cook-elsewhere", label: "Cook it on a station that has it", consequence: "The tickets of parade whose tests need a headless browser wait for mac, which provides it; box keeps cooking the others." },
    { id: "provide-here", label: "Provide it on box", consequence: "A headless Chromium is installed on box, and the tests of parade run there with it: no ticket waits for another station." },
    { id: "adapt-tests", label: "Adapt the tests", consequence: "A ticket of parade rewrites its tests so they pass without a browser: the end-to-end tests are skipped on this station, so the screens are no longer checked in a real browser." },
  ],
  status: "pending",
};
const BLOCAGES: Blocage[] = [{ id: NAVIGATEUR.id, message: NAVIGATEUR.message, cause: NAVIGATEUR.cause, action: "choose-need" }];

// La cuisine de parade tourne sur ce poste, que sert pc/claude, qui ne fournit pas de navigateur : les autres stations sont ailleurs.
const DECLAREES = { ...TOUTES, declarees: TOUTES.declarees.map((station) => ({ ...station, distante: station.nom !== "pc/claude" })) };
const PARADE = RENDUS.parade as Rendu;

export const ecran: Ecran = {
  dit: "L'onglet Cooks de « parade » : « Cook it on a station that has it » cliqué sur la carte du navigateur — le formulaire de pc/claude, navigateur-headless déjà coché",
  largeur: 1440,
  hauteur: 1700,
  etapes: [
    { cliquer: '#projets > button[title^="parade — "]' },
    { cliquer: "#onglets-du-projet button:nth-child(2)" },
    { cliquer: '#choix-du-projet section[data-choix="need:browser"] li[data-issue="cook-elsewhere"] button' },
  ],
  donnees: () => {
    const base = donnees({ ...SUR_LA_BOX, blocages: BLOCAGES, choix: [NAVIGATEUR] });
    const lues = base.reponses.demarrage as Record<string, unknown>;
    return {
      maintenant: MAINTENANT,
      reponses: { ...base.reponses, demarrage: { ...demarrage(configuration(PROJETS), (nom) => nom === "parade"), stations: lues.stations, projetsDesStations: lues.projetsDesStations }, espace: [], service: guide(DECLAREES), defautsDeStation: DEFAUTS },
      envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS } }),
    };
  },
};
