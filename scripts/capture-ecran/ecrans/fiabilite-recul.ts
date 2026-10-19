// Settings → Reliability de « parade » quand des corrections de ses consignes ont été acceptées (#1001,
// épique 994) : sous la fiabilité des cooks, ce que chaque correction a fait de sa cause, avant et après
// son merge. Ce que la box rend de plus que la cuisine figée : le champ `reculs` de `facts`
// (runtime/src/correctif/recul.ts), quatre corrections dans les quatre états qu'il connaît — la cause
// recule, elle ne recule pas, mergée sans ticket fini depuis, pas encore mergée. La lecture de l'onglet
// est celle de la page sans correction (fiabilite.ts).
import { cuisine, type Ecran, type Rendu } from "./commun.ts";
import { RENDUS } from "./cuisine-figee.ts";
import { ecran as fiabilite } from "./fiabilite.ts";

const PARADE = RENDUS.parade as Rendu;
const PR = (numero: number) => `https://github.com/chef/parade/pull/${numero}`;
const releve = (tickets: number, atteints: number[], essais = atteints.length) => ({ tickets, atteints, essais, part: atteints.length / tickets });

export const RECULS = [
  {
    proposition: 412,
    cause: "gates-app",
    titre: "red gates: app tests",
    pr: PR(41),
    etat: "mesuree",
    mergee: "2026-10-08T15:20:00.000Z",
    avant: releve(20, [3, 5, 8, 11, 14, 17], 8),
    apres: releve(8, [29]),
    recule: true,
  },
  {
    proposition: 431,
    cause: "relecture",
    titre: "blocking review",
    pr: PR(44),
    etat: "mesuree",
    mergee: "2026-10-10T09:02:00.000Z",
    avant: releve(20, [9, 12, 16]),
    apres: releve(9, [22, 33]),
    recule: false,
  },
  { proposition: 455, cause: "plafond", titre: "cap on turns or duration", pr: PR(47), etat: "rien-a-comparer", mergee: "2026-10-13T08:41:00.000Z", avant: releve(20, [18, 24]) },
  { proposition: 470, cause: "conflit", titre: "conflict with the base", pr: PR(49), etat: "en-cours" },
];

export const ecran: Ecran = {
  ...fiabilite,
  dit: "Settings → Reliability de « parade » avec quatre corrections acceptées : sous la fiabilité des cooks, chaque cause corrigée avant et après le merge — elle recule, elle ne recule pas, rien à comparer encore, pas encore mergée",
  donnees: () => {
    const sans = fiabilite.donnees();
    return { ...sans, envois: { ...sans.envois, ...cuisine({ ...RENDUS, parade: { ...PARADE, facts: { ...PARADE.facts, reculs: RECULS } as Rendu["facts"] } }) } };
  },
};
