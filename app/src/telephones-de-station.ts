// Les téléphones d'une station, depuis sa ligne de l'accueil (#1598, épique #1595) : tirer un code d'appairage et ce
// que son QR porte, dire où en est ce code, lister les téléphones appairés à la station, en révoquer un. L'app ne fait
// rien de cela elle-même : elle lance la commande de box qui existe, `phones code | status <code> | list | revoke
// <phone>` (runtime/src/telephones.ts), sur la station — par `ssh` sur sa machine, ou ici, sans `ssh`, quand c'est la
// station de cet ordinateur (box.ts, `lancerLa`). La règle de la station est ce qui authentifie cet ordinateur : elle
// refuse tout autre avant de rien lire.
//
// La commande se lance au nom d'un projet que la station porte : le geste de la box ne part qu'au nom d'un projet
// qu'il connaît, et le registre des téléphones est celui de la station, pas du projet.
//
// Ce qui revient à l'écran est en une ligne, dans les mots du chef ; le survol dit quoi vérifier. Ni commande, ni
// `ssh`, ni `sudo`, ni sortie brute de la box : l'écran d'appairage n'en montre aucun, pas même au survol.
import type { ExecFileException } from "node:child_process";
import { cite, type Locale, type Lu, type Rendu } from "./box.ts";
import { machineDuNom } from "./projets/projets.ts";
import type { StationVue } from "./stations/stations.ts";

// Un code tiré : le code, son échéance, ce que son QR porte tel que la station l'a rendu, et l'adresse du guichet où
// le téléphone l'envoie — nulle quand la station n'en connaît aucune.
export type CodeTire = { code: string; expireLe: string; qr: string; adresse: string | null };
export type EtatDuCode = "valable" | "expire" | "utilise";
export type TelephoneAppaire = { nom: string; machine: string; appaireLe: string };
// `refus` : en une ligne, ce que l'écran dit à la place ; `detail` : ce qui se lit à son survol.
export type Refus = { refus: string; detail: string };
export type RenduDuCode = { tire: CodeTire } | Refus;
export type RenduDeLEtat = { etat: EtatDuCode; telephone: string | null } | Refus;
export type RenduDeLaListe = { telephones: TelephoneAppaire[] } | Refus;
export type RenduDeLaRevocation = { revoque: string } | Refus;

// Ce qui lance une commande sur la station visée — ou pourquoi rien ne part.
export type Cible = { lu: Lu } | Refus;
export type Lancer = (lu: Lu, commande: string) => Promise<Rendu>;

// Ce que `ssh` s'accorde pour joindre la station, et le délai d'une commande : ceux de toutes les commandes de box.
export const DELAI_S = 30;

// La station d'une ligne de l'accueil, telle qu'une commande la joint : la station de cet ordinateur se lance ici ;
// une autre, par `ssh` sur sa machine — le nom de la station, `<machine>/<moteur>` donnant la machine. Un téléphone
// n'appaire pas de téléphone, et une station qui ne porte encore aucun projet n'a pas de geste où se lancer.
export function cibleDeLaStation(station: StationVue | undefined, ici: { gist: string | null; locale: Locale | undefined }): Cible {
  if (station === undefined) return { refus: "This station is no longer paired with this app.", detail: "It left the list of your stations: open the home again to see the ones that remain." };
  if (station.cuisine === false) return { refus: `${station.nom} is a phone: phones pair with a station, not with each other.`, detail: "Open this screen from the line of a station that cooks." };
  const projet = station.projets[0];
  if (projet === undefined) return { refus: `${station.nom} carries no project yet: a phone pairs with it once it does.`, detail: `The app reaches ${station.nom} through one of the projects it carries. Add a project to it from its page, then come back.` };
  if (station.id === ici.gist && ici.locale !== undefined) return { lu: { nom: projet, cuisine: { locale: ici.locale } } };
  const hote = machineDuNom(station.nom);
  if (hote === undefined) return { refus: `The app cannot reach ${station.nom}: its name is not one of a machine.`, detail: `“${station.nom}” is not the name of a machine on your network.` };
  return { lu: { nom: projet, cuisine: { hote } } };
}

// Ce qu'une commande en échec dit, en une ligne. Le code de sortie prouve le cas (box.ts) : 255, ou aucun code, la
// station n'a pas été jointe ; 68, elle a refusé cet ordinateur ; 69 ou 127, la commande lui manque — son runtime est
// d'avant elle. Le reste est un refus de la station, dit sans sa sortie.
export function refusDe(station: string, erreur: ExecFileException, local: boolean): Refus {
  const code = erreur.killed === true ? undefined : typeof erreur.code === "number" ? erreur.code : undefined;
  if (code === undefined || (code === 255 && !local))
    return {
      refus: `${station} did not answer: it may be off, or offline.`,
      detail: local
        ? `This computer's station did not answer within ${DELAI_S} s. Check that it is running (the home says so), then try again.`
        : `The app got no answer from ${station} within ${DELAI_S} s. Check that its machine is on and connected to your network, then try again.`,
    };
  if (code === 68) return { refus: `${station} refused: this computer is not allowed to manage its phones.`, detail: `${station} only lets the computer it was set up with issue pairing codes and revoke phones.` };
  if (code === 69 || code === 127) return { refus: `${station} cannot pair phones yet: its version is too old.`, detail: `Update ${station} to the latest version, then try again.` };
  if (code === 65) return { refus: `${station} no longer carries the project the app reached it through.`, detail: `Open the home again: the app reads ${station}'s projects every thirty seconds.` };
  return { refus: `${station} refused the request.`, detail: `It answered with an error (code ${code}). Try again; if it keeps refusing, check ${station}'s page.` };
}

const ILLISIBLE = (station: string): Refus => ({ refus: `${station} answered something this app cannot read.`, detail: `${station} and this app are not on the same version: update both, then try again.` });

function json(texte: string): Record<string, unknown> | undefined {
  try {
    const lu: unknown = JSON.parse(texte);
    return typeof lu === "object" && lu !== null && !Array.isArray(lu) ? (lu as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

const estTexte = (valeur: unknown): valeur is string => typeof valeur === "string" && valeur !== "";
const local = (lu: Lu) => "locale" in lu.cuisine;

// Un code neuf, pour un quart d'heure : `phones code`. Ce que le QR porte est rendu tel quel — la vue le dessine sans
// le relire.
export async function tirerUnCode(lancer: Lancer, cible: Cible, station: string): Promise<RenduDuCode> {
  if ("refus" in cible) return cible;
  const rendu = await lancer(cible.lu, "phones code");
  if (rendu.erreur !== null) return refusDe(station, rendu.erreur, local(cible.lu));
  const lu = json(rendu.sortie);
  const { code, expiresAt, qr, url } = lu ?? {};
  if (!estTexte(code) || !estTexte(expiresAt) || Number.isNaN(Date.parse(expiresAt)) || !estTexte(qr)) return ILLISIBLE(station);
  return { tire: { code, expireLe: expiresAt, qr, adresse: estTexte(url) ? url : null } };
}

// La forme d'un code d'appairage : huit signes, un tiret au milieu ou non.
const CODE = /^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/;
const ETATS: Readonly<Record<string, EtatDuCode>> = { valid: "valable", expired: "expire", used: "utilise" };

// Où en est un code tiré : `phones status <code>`. Un code que la station ne connaît plus (refusé, code 1) ne vaut
// plus rien : il se dit expiré — dans les deux cas, c'est un code neuf qu'il faut.
export async function etatDuCode(lancer: Lancer, cible: Cible, station: string, code: unknown): Promise<RenduDeLEtat> {
  if ("refus" in cible) return cible;
  if (typeof code !== "string" || !CODE.test(code)) return { refus: "This is not a pairing code.", detail: "A pairing code has eight letters and digits, like 7KQ2-M9XD." };
  const rendu = await lancer(cible.lu, `phones status ${code}`);
  if (rendu.erreur !== null) return rendu.erreur.code === 1 ? { etat: "expire", telephone: null } : refusDe(station, rendu.erreur, local(cible.lu));
  const lu = json(rendu.sortie);
  const etat = typeof lu?.status === "string" ? ETATS[lu.status] : undefined;
  if (etat === undefined) return ILLISIBLE(station);
  return { etat, telephone: estTexte(lu?.phone) ? lu.phone : null };
}

// Les téléphones appairés à la station, dans l'ordre de leur nom : `phones list`.
export async function telephonesAppaires(lancer: Lancer, cible: Cible, station: string): Promise<RenduDeLaListe> {
  if ("refus" in cible) return cible;
  const rendu = await lancer(cible.lu, "phones list");
  if (rendu.erreur !== null) return refusDe(station, rendu.erreur, local(cible.lu));
  const phones = json(rendu.sortie)?.phones;
  if (!Array.isArray(phones)) return ILLISIBLE(station);
  const telephones: TelephoneAppaire[] = [];
  for (const phone of phones as unknown[]) {
    const { name, machine, pairedAt } = (phone ?? {}) as Record<string, unknown>;
    if (!estTexte(name)) return ILLISIBLE(station);
    telephones.push({ nom: name, machine: typeof machine === "string" ? machine : "", appaireLe: typeof pairedAt === "string" ? pairedAt : "" });
  }
  return { telephones };
}

// Un téléphone retiré — perdu, donné : `phones revoke <phone>`. Son jeton n'ouvre plus rien, d'aucun réseau. Un nom que
// la station ne connaît plus (refusé, code 1) n'y est déjà plus appairé.
export async function revoquerUnTelephone(lancer: Lancer, cible: Cible, station: string, nom: unknown): Promise<RenduDeLaRevocation> {
  if ("refus" in cible) return cible;
  if (typeof nom !== "string" || nom.trim() === "" || nom.startsWith("-")) return { refus: "No phone was named.", detail: "Choose the phone to revoke in the list." };
  const rendu = await lancer(cible.lu, `phones revoke ${cite(nom)}`);
  if (rendu.erreur !== null) {
    if (rendu.erreur.code === 1) return { refus: `${nom} is no longer paired with ${station}.`, detail: "Someone revoked it already: the list is read again." };
    return refusDe(station, rendu.erreur, local(cible.lu));
  }
  return { revoque: nom };
}
