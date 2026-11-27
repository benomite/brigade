// Le rail de « parade » quand deux stations refusent le projet (#3198, épique #3196) : une ligne chacune sous la ligne d'alerte
// — son nom, sa raison et le geste qui la lève, tels que la station les écrit (runtime/src/projets/refus.ts).
import type { Faits } from "../../../app/src/faits.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT, type Rendu } from "./commun.ts";
import { FACTS } from "./cooks-stations-commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

const PARADE = RENDUS.parade as Rendu;
const PUSH = {
  status: "refused" as const,
  code: "push-blocked" as const,
  message: "The repository refuses to let the station write to it.",
  action: "Give the station's GitHub account write access to the repository, then wait for the next check.",
  noRemedy: "Only an owner of the repository can grant access.",
};
const STATIONS_REFUSANT = FACTS.stations?.map((station) => (station.station === "box/claude" ? { ...station, cuisson: "refused", refus: PUSH } : station)) ?? [];

export const ecran: Ecran = {
  dit: "Le rail de « parade » : la box et le PC refusent le projet — une ligne chacune, avec sa raison et le geste qui la lève (#3198)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR],
  donnees: () => {
    const base = donnees({ ...SUR_LA_BOX });
    const lues = base.reponses.demarrage as Record<string, unknown>;
    return {
      maintenant: MAINTENANT,
      reponses: { ...base.reponses, demarrage: { ...demarrage(configuration(PROJETS), (nom) => nom === "parade"), stations: lues.stations, projetsDesStations: lues.projetsDesStations }, espace: [] },
      envois: cuisine({ ...RENDUS, parade: { ...PARADE, facts: { ...FACTS, stations: STATIONS_REFUSANT } as Faits } }),
    };
  },
};
