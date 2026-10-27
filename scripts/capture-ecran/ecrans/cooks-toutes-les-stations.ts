// L'onglet Cooks de « parade », qui cuit sur la box, avec toutes ses stations (#1786) : la box, sa principale — son manager
// et sa pass —, ce Mac ajouté à sa cuisine, atteint, qui y cuit #15, et un PC ajouté lui aussi, que la box ne parvient pas
// à atteindre et qui ne s'est jamais annoncé. Chacune une fois dans « Its stations », la principale d'abord : si elle est
// atteinte, ce qu'elle fournit, ses cooks à la fois, ce qu'elle cuit, et pourquoi le PC ne cuit pas. Ce que chaque station
// fournit vient de la déclaration de la box (`installation stations --json`), comme dans l'app.
import type { Faits } from "../../../app/src/faits.ts";
import type { StationsLues } from "../../../app/src/service.ts";
import { cuisine, type Ecran, type Rendu } from "./commun.ts";
import { FACTS as DEUX } from "./cooks-deux-stations.ts";
import { guide } from "./cooks-stations-declarees.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { RENDUS } from "./cuisine-figee.ts";

const PARADE = RENDUS.parade as Rendu;
const MAC = "macbook/claude";
// Le Mac distant de `cooks-deux-stations`, sous le nom que la box lui donne quand l'app le lui ajoute ; il cuit.
const surLeMac = <T extends { station: string }>(un: T): T => (un.station === "mac/claude" ? { ...un, station: MAC } : un);
const FACTS: Faits = {
  ...DEUX,
  cooks: (DEUX.cooks ?? []).map(surLeMac),
  stations: (DEUX.stations ?? []).map((station) => ({ ...surLeMac(station), ...(station.distante ? { cuisson: "cooking", arreteeDepuis: null, cooks: (station.cooks ?? []).map(surLeMac) } : {}) })),
} as Faits;

const DECLAREES: StationsLues = {
  proposees: [{ nom: "box/claude", moteur: "claude", fournit: ["code", "raisonnement"] }],
  absent: null,
  declarees: [
    { nom: "box/claude", moteur: "claude", fournit: ["code", "raisonnement"], cooks: 3, distante: false },
    { nom: MAC, moteur: "claude", fournit: ["code", "raisonnement", "navigateur-headless"], cooks: 2, distante: true },
    { nom: "pc/claude", moteur: "claude", fournit: ["code", "raisonnement"], cooks: 1, distante: true },
  ],
};

const [box, mac] = SUR_LA_BOX.stations;
const PC = { id: "pc", nom: "pc", principale: false, etat: "secondaire" as const, dit: "not its main station: it runs neither its manager nor its pass", autoriser: [] };

export const ecran: Ecran = {
  dit: "L'onglet Cooks de « parade », cuisant sur la box : toutes ses stations dans « Its stations », la principale d'abord — atteinte ou non, ce qu'elle fournit, ses cooks à la fois, ce qu'elle cuit, et pourquoi le PC ne cuit pas",
  largeur: 1440,
  hauteur: 1100,
  etapes: [OUVRIR, { cliquer: "#onglets-du-projet button:nth-child(2)" }],
  donnees: () => {
    const base = donnees(
      {
        ...SUR_LA_BOX,
        stations: [
          box!,
          { ...mac!, atteinte: { oui: true, dit: "reached: it is online on GitHub", station: MAC } },
          { ...PC, atteinte: { oui: false, dit: "not reached: no sign of life on GitHub since 2026-10-12T18:20:00.000Z", station: "pc/claude", pourquoi: "not reached", geste: "open Brigade on that computer" } },
        ],
      },
      { service: guide(DECLAREES) },
    );
    // Les lectures de la cuisine sont celles de ses trois stations ; le second, à droite, garde son écran.
    const envois = cuisine({ ...RENDUS, parade: { ...PARADE, facts: FACTS } });
    const duSecond = (base.envois.regarder?.parade ?? []).filter(({ sur }) => sur === "surSortie");
    return { ...base, envois: { ...base.envois, ...envois, regarder: { ...envois.regarder, parade: [...(envois.regarder.parade ?? []), ...duSecond] } } };
  },
};
