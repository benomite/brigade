// Ce que les écrans des gestes de la file sur le téléphone partagent (ticket 1164) : la file de `telephone-file`, où
// deux cartes attendent le chef dans TODO — #12, verte, que la pass ne merge pas sans le grant (la merger), et #31,
// dont la PR a été fermée sans merge (la sortir du rail) —, reçue par l'app Android appairée à la box. Un geste de la
// fiche part par `gesteDeFiche`, comme sur le desktop ; sur le téléphone, le pont rend ce que la station a fait
// (`fait`), ou pourquoi rien (`refus`) — ce que chaque écran fige.
import type { Faits } from "../../../app/src/faits.ts";
import { gestesDeCarte } from "../../../app/src/gestes-fiche.ts";
import { carteDe, cuisine, type Donnees, type Ecran, type Etape, type Rendu } from "./commun.ts";
import { RENDUS } from "./cuisine-figee.ts";
import { STATUS } from "./file-ou-cuit.ts";
import { HAUTEUR, LARGEUR } from "./telephone-commun.ts";
import { donneesDeLaFile, FAITS as FILE, OUVRIR_COOKS, OUVRIR_PARADE } from "./telephone-file-commun.ts";

const TRI = "Le tri des fournisseurs";
export const FAITS: Faits = {
  ...FILE,
  compteurs: { ...FILE.compteurs, attend: 2 },
  rail: [...FILE.rail, { ticket: 31, etat: "en pass", titre: TRI, url: "https://github.com/chef/parade/issues/31", activite: null, attente: null }],
  attend: [
    { ticket: 12, titre: "Validation SIRET", url: "https://github.com/chef/parade/issues/12", decision: { quoi: "merge", motif: "no-grant", cause: null, pr: "https://github.com/chef/parade/pull/40" } },
    { ticket: 31, titre: TRI, url: "https://github.com/chef/parade/issues/31", decision: { quoi: "fermee", motif: null, cause: null, pr: null } },
  ],
};
const RENDU: Rendu = { ...(RENDUS.parade as Rendu), facts: FAITS, status: STATUS };

// La carte d'un ticket de TODO touchée : sa fiche s'ouvre. Puis le geste touché, et son « oui ».
const TOUCHER: Record<number, Etape> = {
  12: { cliquer: "#rail .colonne[data-attend] li.bon:nth-of-type(1)" },
  31: { cliquer: "#rail .colonne[data-attend] li.bon:nth-of-type(2)" },
};
const geste = (id: string): Etape => ({ cliquer: `#fiche li[data-geste="${id}"] button:not(.aide)` });
const OUI: Etape = { cliquer: "#fiche .gestes-fiche .confirmation button.recommande" };

function donnees(faits: Faits, reponses: Record<string, unknown>): Donnees {
  const file = donneesDeLaFile();
  return { ...file, reponses: { ...file.reponses, ...reponses }, envois: cuisine({ ...RENDUS, parade: { ...RENDU, facts: faits } }) };
}

// Un geste de la fiche d'un ticket de TODO : sa carte touchée, le geste touché, et — `confirme` — son « oui ».
// `rendu` : ce que le pont rend du geste parti.
export function gesteDeLaFiche(dit: string, ticket: 12 | 31, id: string, confirme: boolean, rendu?: unknown): Ecran {
  return {
    dit,
    largeur: LARGEUR,
    hauteur: HAUTEUR,
    etapes: [OUVRIR_PARADE, TOUCHER[ticket] as Etape, geste(id), ...(confirme ? [OUI] : [])],
    donnees: () => donnees(FAITS, { gestesDeFiche: gestesDeCarte(carteDe(RENDU, "parade", ticket)), ...(rendu === undefined ? {} : { gesteDeFiche: rendu }) }),
  };
}

// L'onglet Cooks : la station de la box, dans l'état que `cuisson` dit ; `stop` — son bouton touché, et ce que le pont
// en rend.
export function cuisson(dit: string, cuit: "cooking" | "stopped", stop?: unknown): Ecran {
  const faits: Faits = { ...FAITS, stations: (FAITS.stations ?? []).map((station) => (station.station === "box/claude" ? { ...station, cuisson: cuit, arreteeDepuis: cuit === "stopped" ? "2026-10-13T10:03:40.000Z" : null } : station)) };
  return {
    dit,
    largeur: LARGEUR,
    hauteur: HAUTEUR,
    etapes: [OUVRIR_PARADE, OUVRIR_COOKS, ...(stop === undefined ? [] : [{ cliquer: '#rail .station-de-cuisson[data-station="box/claude"] .geste-de-cuisson button' }])],
    donnees: () => donnees(faits, stop === undefined ? {} : { cuireSurLaStation: stop }),
  };
}
