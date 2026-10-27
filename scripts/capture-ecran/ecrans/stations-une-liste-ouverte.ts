// La même section (#1778), nas cliquée : la station seulement enregistrée sous le compte, et les dépôts du chef en cases.
import { stationsDuChef } from "./stations-une-liste.ts";

export const ecran = stationsDuChef("Les stations du chef, nas cliquée (#1778) : la station seulement enregistrée sous le compte GitHub, et ses cases à cocher", [{ cliquer: `#accueil-stations [data-station="e2d4"] button.ligne` }]);
