// L'onglet Know-how de « parade » (#4241), ouvert depuis le menu du projet : ce que les trois écrans `savoir-faire-*` ont en
// commun — l'espace de `espace-projet.ts`, et la réponse de `lireLeSavoirFaire`, telle que le process principal la rend
// (vue/savoir-faire/savoir-faire-box.ts). Ce fichier n'est pas un écran.
import type { Ecran } from "./commun.ts";
import { configuration, cuisine, demarrage, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

type Entree = { id: string; text: string; ticket: number };

export const ENTREES: Entree[] = [
  { id: "L1", text: "Run the app's typecheck before committing: the gates run it on every change to app/.", ticket: 4001 },
  { id: "L2", text: "Never kill a process by its name; keep its pid and kill that one.", ticket: 4002 },
  { id: "L3", text: "Test fakes live in test/aides/; reuse them before writing a new one.", ticket: 4013 },
  { id: "L4", text: "A test that waits for the clock is flaky on a loaded station: wait for a fact instead.", ticket: 4027 },
];

export const OUVRIR_LE_SAVOIR_FAIRE = [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets-du-projet > :nth-child(3)" }];

export const savoirFaire = (entrees: Entree[]): Ecran["donnees"] => () => ({
  maintenant: MAINTENANT,
  reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [], lireLeSavoirFaire: { entries: entrees } },
  envois: cuisine(RENDUS),
});
