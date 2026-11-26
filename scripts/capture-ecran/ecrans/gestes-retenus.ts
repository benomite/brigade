// Les gestes retenus de « parade » (#4273) : son rail est vide, et deux découpages d'épique attendent l'OK du chef. La vue
// les reçoit du pont (`gestesRetenus`, app/src/held/) : une carte par geste — son résumé, sa raison, Approve — à côté du
// TODO, et le rail vide dit « 2 splits wait for your OK ».
import type { TableauLu } from "../../../app/src/tableau/read.ts";
import { avecLeRail } from "../../../app/src/vue/rail/github.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { renduDeParade, signe } from "./github-seul-commun.ts";

const VIDE: TableauLu = {
  lu: true,
  depot: "chef/parade",
  luLe: MAINTENANT,
  cuisine: { rubriques: [] },
  faits: { etat: "ouverte", lu: MAINTENANT, dernierTick: null, dernierEvenement: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, rail: [] },
  file: [],
  bilans: [],
  lignesDuRail: [],
  activites: [],
};
const RAIL_VIDE = renduDeParade(avecLeRail(VIDE, { lu: MAINTENANT, tickets: [], nonPris: [] }, { lus: [signe("box", MAINTENANT)] }));
const geste = (id: string, epique: number, tickets: number) => ({ id, kind: "manager", summary: `split #${epique} into ${tickets} tickets`, reason: "an epic split is held for your OK", approveCommand: `brigade parade manager approve ${id}`, heldAt: MAINTENANT });

export const ecran: Ecran = {
  dit: "Le rail vide de « parade » et deux découpages retenus pour l'OK du chef : une carte par geste, son résumé, sa raison et Approve, et le rail qui dit « 2 splits wait for your OK » (#4273)",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [], gestesRetenus: { gestes: [geste("3", 4129, 3), geste("4", 4130, 2)] } },
    envois: cuisine({ ...RENDUS, parade: RAIL_VIDE }),
  }),
};
