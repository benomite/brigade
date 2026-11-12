// Un projet dont la mise en place vient de passer, qu'aucune station ne sert (#3400) : la page demande aussitôt qui le
// sert, cet ordinateur en tête. La capture rend une réponse figée par geste : la mise en place passe ici par « Set up for
// Brigade » sur l'avis (#2628) — `checkRepoSetup` dit ce qui manque, `runRepoSetup` rend prêt —, ce qu'aucune lecture
// relue ne peut faire. Dans l'app, c'est la lecture qui suit le merge de la PR de mise en place (#3170) qui la pose.
import type { Projet } from "../../../app/src/config.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import type { Terminal } from "../../../app/src/terminaux.ts";

const CANTINE: Projet = { ...(PROJETS.find(({ nom }) => nom === "cantine") ?? PROJETS[0]!), depot: "chef/cantine", base: "main" };
const SECOND: Terminal = { id: 1, projet: "cantine", genre: "second", titre: "second · claude", note: "", arrete: false };

export const ecran: Ecran = {
  dit: "Un projet dont la mise en place vient de passer, qu'aucune station ne sert (#3400) : la page demande qui le sert",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="cantine — "]' }, { cliquer: ".avis-depot[data-lieu=page] button.recommande" }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: {
      // Aucune station ne le sert : ni celles du compte, ni celle de cet ordinateur.
      demarrage: { ...demarrage(configuration([CANTINE])), stations: { a: MAINTENANT, stations: [] } },
      espace: [SECOND],
      stationsDuCompte: { state: "listed", stations: [], unreadable: [] },
      projetsServis: { depots: [] },
      checkRepoSetup: { ready: false, missingBindings: ["Gates", "Worktrees"], missingLabels: ["fire", "waiting"] },
      runRepoSetup: { ready: true, missingBindings: [], missingLabels: [] },
    },
    envois: cuisine({ cantine: { ...RENDUS.cantine!, status: "", station: "" } }),
  }),
};
