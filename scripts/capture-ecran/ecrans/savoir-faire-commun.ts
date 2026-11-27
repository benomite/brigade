// L'onglet Know-how de « parade » (#4570), ouvert depuis le menu du projet : ce que les écrans `savoir-faire-*` ont en commun —
// l'espace de `espace-projet.ts`, et la réponse de `savoirDuProjet`, telle que le process principal la rend
// (vue/know-how/know-how-github.ts). Ce fichier n'est pas un écran.
import type { Ecran } from "./commun.ts";
import { configuration, cuisine, demarrage, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

type Entree = { section: string; text: string; ticket: number | null; line: number };

export const ENTREES: Entree[] = [
  { section: "Conventions", text: "Run the app's typecheck before committing: the gates run it on every change to app/.", ticket: 4001, line: 3 },
  { section: "Conventions", text: "Test fakes live in test/aides/; reuse them before writing a new one.", ticket: 4013, line: 4 },
  { section: "Pitfalls", text: "Never kill a process by its name; keep its pid and kill that one.", ticket: 4002, line: 7 },
  { section: "Pitfalls", text: "A test that waits for the clock is flaky on a loaded station: wait for a fact instead.", ticket: 4027, line: 8 },
  { section: "Tools", text: "Use `gh api` to read the rate limits.", ticket: null, line: 11 },
];

// Le menu : Rail · Stations · Agents · Know-how · Settings — Know-how est le quatrième.
export const OUVRIR_LE_SAVOIR_FAIRE = [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets-du-projet > :nth-child(4)" }];

export const savoirFaire = (entrees: Entree[]): Ecran["donnees"] => () => ({
  maintenant: MAINTENANT,
  reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [], savoirDuProjet: { depot: "benomite/parade", branche: "main", vide: entrees.length === 0, entries: entrees } },
  envois: cuisine(RENDUS),
});
