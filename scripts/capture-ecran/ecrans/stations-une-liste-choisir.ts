// La même section (#1778, #1779), macbook-air-de-benoit cliquée : la machine appairée et enregistrée. Sa ligne ouvre la page de la station,
// où se cochent ses projets (avant #1779, « choose projects » les ouvrait sous la ligne).
import { stationsDuChef } from "./stations-une-liste.ts";

export const ecran = stationsDuChef("Les stations du chef, les projets de macbook-air-de-benoit ouverts (#1778) : la machine appairée et enregistrée, ses cases à cocher", [
  { cliquer: `#accueil-stations button.ligne[aria-label^="macbook-air-de-benoit —"]` },
]);
