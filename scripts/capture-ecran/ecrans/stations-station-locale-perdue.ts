// L'onglet Stations de « parade » (#2489), la station de ce Mac ayant perdu sa connexion à Claude : la ligne le dit, et
// « log in » — le bouton de sa panne — la refait ; son bac à sable indisponible, et pourquoi, sous les tickets ordinaires ;
// aucun téléphone appairé.
import { PANNES } from "./stations-station-locale-commun.ts";
import { ecranDeLaStationLocale } from "./stations-station-locale.ts";

export const ecran = ecranDeLaStationLocale({
  dit: "L'onglet Stations de « parade » (#2489), la station de ce Mac ayant perdu sa connexion à Claude : « log in », son bac à sable indisponible, aucun téléphone",
  max: "perdue",
  pannes: PANNES,
  ordinaires: {
    reglable: true,
    actif: true,
    limite: null,
    explication: "Cooks on this Mac run in Claude Code's sandbox: they write only in their own worktree, and reach only the network hosts on the project's list.",
    indisponible: "The sandbox is unavailable on this Mac — Seatbelt (/usr/bin/sandbox-exec) is missing. This Mac takes no ordinary ticket.",
  },
  telephones: { telephones: [] },
});
