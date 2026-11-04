// L'onglet Cooks de « parade », une station cloud déjà ajoutée, la liste approuvée (#2232) : son coût par ticket servi
// — 12,60 $ ce mois, 7 tickets —, ses plafonds, et « Add a cloud station » cliqué : la seconde s'ajoute sans redemander
// l'approbation, et la ligne dit ce qui est fait. La liste approuvée est repliée.
import type { VuDuCloud } from "../../../app/src/stations-cloud/stations-cloud.ts";
import type { Ecran } from "./commun.ts";
import { AJOUTER, cloud, ecran as base, SANS_STATION } from "./cooks-cloud.ts";

export const UNE_STATION: VuDuCloud = {
  ...SANS_STATION,
  ajoutees: 1,
  plafonds: { aLaFois: 2, heuresParJour: 4, heuresParMois: 60 },
  approuvee: true,
  cout: { projet: "parade", coutTotal: 12.6, ticketsServis: 7, coutParTicket: 1.8 },
};

export const ecran: Ecran = {
  dit: "L'onglet Cooks de « parade » : une station cloud, son coût par ticket servi, et la seconde ajoutée sans redemander l'approbation",
  largeur: 1440,
  hauteur: 1800,
  etapes: [...base.etapes, AJOUTER],
  donnees: cloud(UNE_STATION, { ajouterStationCloud: { fait: "A second cloud station is added to parade: it starts when the rail has work no other station takes" } }),
};
