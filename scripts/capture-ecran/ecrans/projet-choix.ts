// La page de « parade », confiée à sa box, à qui manquent un Postgres et Docker pour ses tests (#1400, épique
// 1393) : une carte par besoin, ce qui manque en une phrase, pourquoi dessous, et ses trois issues — le cuire sur
// une station qui l'a, le fournir sur la box, adapter les tests —, chacune avec ce qui en suit. Les choix sont ceux
// que la box publie dans son suivi (runtime/src/installation/besoins/), sous `choix`, avec le blocage qui attend
// chacun, sous `blocages`.
import type { Blocage, Choix } from "../../../app/src/projets/demande.ts";
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";

export const CHOIX: Choix[] = [
  {
    id: "need:postgres",
    need: "postgres",
    message: "The tests of parade need a Postgres database, which box does not have.",
    cause: "`.claude/brigade/worktree-setup.sh` runs `psql`; `apps/api/package.json` depends on `pg`.",
    options: [
      { id: "cook-elsewhere", label: "Cook it on a station that has it", consequence: "The tickets of parade whose tests need a Postgres database wait until a station that provides `postgres` is declared for parade; none is today, so they do not start." },
      { id: "provide-here", label: "Provide it on box", consequence: "A PostgreSQL server (the `postgresql` package) is installed on box and runs there as a service, and the tests of parade run there with it: no ticket waits for another station." },
      { id: "adapt-tests", label: "Adapt the tests", consequence: "A ticket of parade rewrites its tests so they pass without a Postgres database: the tests that use the database run against a substitute or are skipped, so queries and migrations are no longer checked against a real Postgres." },
    ],
    status: "pending",
  },
  {
    id: "need:docker",
    need: "docker",
    message: "The tests of parade need Docker, which box does not have.",
    cause: "`apps/api/package.json` depends on `testcontainers`.",
    options: [
      { id: "cook-elsewhere", label: "Cook it on a station that has it", consequence: "The tickets of parade whose tests need Docker wait for macbook, which provides it; box keeps cooking the others." },
      { id: "provide-here", label: "Provide it on box", consequence: "Docker Engine (the `docker.io` package) is installed on box and the station's account joins the `docker` group, which lets every cook of the box start containers, and the tests of parade run there with it: no ticket waits for another station." },
      { id: "adapt-tests", label: "Adapt the tests", consequence: "A ticket of parade rewrites its tests so they pass without Docker: the tests that start containers are skipped on this station, so what runs inside them is no longer checked here." },
    ],
    status: "pending",
  },
];

// Le blocage qui attend chaque choix, tel que la box le publie à côté (`choose-need`).
export const BLOCAGES: Blocage[] = CHOIX.map(({ id, message, cause }) => ({ id, message, cause, action: "choose-need" }));

export const ecran: Ecran = {
  dit: "L'espace de « parade » à qui manquent un Postgres et Docker : une carte par besoin, ses trois issues et ce qui suit de chacune (#1400)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR],
  donnees: () => donnees({ ...SUR_LA_BOX, blocages: BLOCAGES, choix: CHOIX }),
};
