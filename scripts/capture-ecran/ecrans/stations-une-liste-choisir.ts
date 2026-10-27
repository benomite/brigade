// La même section (#1778), les projets de macbook-air-de-benoit ouverts : la machine appairée et enregistrée, ses cases à
// cocher sous sa ligne. Le sélecteur trouve son geste avant #1778 (sa ligne dans la liste du compte) comme après (« choose
// projects », à côté de sa ligne unique) : les deux captures montrent le même état.
import { stationsDuChef } from "./stations-une-liste.ts";

export const ecran = stationsDuChef("Les stations du chef, les projets de macbook-air-de-benoit ouverts (#1778) : la machine appairée et enregistrée, ses cases à cocher", [
  { cliquer: `#accueil-stations li[data-station="e1c3"] > button.ligne, #accueil-stations [data-station="e1c3"] button.choisir-ses-projets` },
]);
