// La fiche de #22, `prio:2` dans la file de « parade » : `1` choisi, « change the priority » cliqué (#1739) — GitHub a
// refusé le label : rien n'a changé, la fiche garde `prio:2` et le dit en une ligne, la réponse de GitHub au survol.
import type { Ecran } from "./commun.ts";
import { fichePriorite } from "./fiche-priorite.ts";

export const ecran: Ecran = fichePriorite(
  "La fiche de #22, `prio:2` dans la file de « parade » : `1` choisi, « change the priority » cliqué (#1739) — GitHub refuse le label, la fiche garde `prio:2` et dit pourquoi",
  { refus: "nothing was changed: GitHub did not put `prio:1` on #22", detail: "GitHub refused the label `prio:1` (HTTP 403): Resource not accessible by integration" },
);
