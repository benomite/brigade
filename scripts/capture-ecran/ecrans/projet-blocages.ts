// La page de « parade », confiée à sa box, que trois blocages retiennent (#1399, épique 1393) : chacun en une
// phrase, sa cause dessous ; le geste que l'app sait faire en bouton, la page où le faire hors de l'app en lien
// qui la nomme ; ce qu'une commande a dit, replié derrière « details ». Les blocages sont ceux que la box publie
// dans son suivi (runtime/src/installation/blocages/), sous `blocages`.
import type { Blocage } from "../../../app/src/projets/demande.ts";
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";

export const BLOCAGES: Blocage[] = [
  {
    id: "clone",
    message: "box cannot clone benomite/parade: the GitHub account brigade-cook does not see this repository.",
    cause: "A fine-grained token only covers the repositories chosen for it, and benomite/parade is not one of them.",
    link: "https://github.com/settings/personal-access-tokens",
    detail: "GraphQL: Could not resolve to a Repository with the name 'benomite/parade'. (repository)\nfailed to run git: exit status 128",
  },
  {
    id: "need:postgres",
    message: "The tests of parade need a Postgres that box does not have.",
    cause: "The worktree setup runs psql against a local database.",
    action: "choose-station",
  },
  {
    id: "setup",
    message: "The worktree setup of this project fails on box: the preparation ticket is on it.",
    cause: "The setup needs apps/api/.env, which is not in the repository.",
    detail: "+ cp apps/api/.env apps/api/.env.test\ncp: cannot stat 'apps/api/.env': No such file or directory\nexit status 1",
  },
];

export const ecran: Ecran = {
  dit: "L'espace de « parade » que trois blocages retiennent : une phrase et sa cause chacun, le bouton du geste ou le lien qui nomme la page, le détail replié (#1399)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR],
  donnees: () => donnees({ ...SUR_LA_BOX, blocages: BLOCAGES }),
};
