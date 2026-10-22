// la page d'une station en ligne, avec les appels GitHub de la box sur la dernière heure et ce qui en a fait le plus
import { PAR_DEFAUT, detailDe } from "./plafond-status.ts";
import { pageDeStation } from "./station-pannes.ts";

const appels = { total: 42, topProject: { name: "parade", calls: 30 }, topKind: { name: "issues", calls: 25 } };

export const ecran = pageDeStation("en-ligne", "la page d'une station en ligne : « GitHub calls, last hour: 42 — most from parade (30), mostly issues (25) »", [], { ...detailDe(PAR_DEFAUT), appels });
