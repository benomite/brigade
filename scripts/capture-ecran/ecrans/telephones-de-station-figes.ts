// Ce que les écrans « Pair a phone » partagent (#1598) : la home de telephone-station.ts — la box, ce Mac et un
// téléphone —, et ce que le process principal rendrait de `phones code` et `phones list` (telephones-de-station.ts) ;
// on y entre par le bouton « pair a phone » de la ligne de la box.
import type { RenduDeLaListe, RenduDeLEtat, RenduDuCode, Refus } from "../../../app/src/telephones-de-station.ts";
import { type Donnees, type Ecran, type Etape, MAINTENANT } from "./commun.ts";
import { accueil } from "./telephone-station.ts";

// Un code tiré il y a 28 s : il vaut encore 14:32.
const CODE: RenduDuCode = { tire: { code: "7KQ2-M9XD", expireLe: new Date(Date.parse(MAINTENANT) + 872_000).toISOString(), qr: "brigade://pair?code=7KQ2-M9XD&url=https%3A%2F%2Fbox.tail1234.ts.net", adresse: "https://box.tail1234.ts.net" } };
const LISTE: RenduDeLaListe = {
  telephones: [
    { nom: "galaxy", machine: "Android 15 · Galaxy S24", appaireLe: "2026-10-02T18:40:00.000Z" },
    { nom: "pixel-8", machine: "Android 14 · Pixel 8", appaireLe: "2026-09-21T09:12:00.000Z" },
  ],
};
const VALABLE: RenduDeLEtat = { etat: "valable", telephone: null };

export const OUVRIR: Etape = { cliquer: '#accueil-stations button.appairer-un-telephone[aria-label="pair a phone with box"]' };

// `expire` : le code rendu est déjà échu ; `refus` : la station ne répond pas, au code comme à la liste.
export function donnees({ expire = false, refus }: { expire?: boolean; refus?: Refus } = {}): Donnees {
  const base = accueil();
  const code = refus ?? ("tire" in CODE && expire ? { tire: { ...CODE.tire, expireLe: MAINTENANT } } : CODE);
  return { ...base, reponses: { ...base.reponses, tirerUnCodeDeTelephone: code, telephonesDeLaStation: refus ?? LISTE, etatDuCodeDeTelephone: VALABLE } };
}

export const ecranDesTelephones = (dit: string, etapes: Etape[], options: Parameters<typeof donnees>[0] = {}): Ecran => ({ dit, largeur: 1440, hauteur: 900, etapes: [OUVRIR, ...etapes], donnees: () => donnees(options) });
