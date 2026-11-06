// @ts-check
// Ce que « All projects » dit, sur un téléphone appairé à une station avant le ticket 2500 (le ticket 1414) : la liste
// des projets de sa station, lue à son guichet. L'écran qui appairait le téléphone — l'adresse de la station, son code,
// son QR — n'est plus (le ticket 2500) : une installation neuve se connecte à GitHub (connexion-github.js). Ce module
// ne touche pas `document` et ne joint rien : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { boutonAction, lectureIndisponible } from "../briques.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */

// Le nom qu'une machine porte sur le tailnet du chef : `box.tail1234.ts.net` (MagicDNS).
const TAILNET = /\.ts\.net$/i;

// L'adresse tapée — `192.168.1.20:7010`, avec ou sans `http://` — telle que le pont la joint :
// `http://192.168.1.20:7010`. Un nom du tailnet sans protocole — `box.tail1234.ts.net` — se joint en
// https : `tailscale serve` n'y publie le guichet qu'ainsi. Null si ce n'est pas une adresse http(s).
/** @param {string} tapee @returns {string | null} */
export function adresseDuGuichet(tapee) {
  const ecrite = tapee.trim();
  if (ecrite === "") return null;
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(ecrite) ? ecrite : `http://${ecrite}`);
    if (url.protocol === "http:" && url.port === "" && TAILNET.test(url.hostname) && !/^http:/i.test(ecrite)) url = new URL(`https://${url.host}`);
  } catch {
    return null;
  }
  return (url.protocol === "http:" || url.protocol === "https:") && url.hostname !== "" ? url.origin : null;
}

// Ce que l'écran écrit d'une adresse — dans le champ, dans ses lignes : sans son protocole quand on le
// retrouve sans lui (`192.168.1.20:7010`, `box.tail1234.ts.net`), entière sinon.
/** @param {string} adresse */
const machineDe = (adresse) => {
  const court = adresse.replace(/^https?:\/\//, "");
  return adresseDuGuichet(court) === adresse ? court : adresse;
};

// L'adresse est-elle sur le tailnet du chef : un nom en `.ts.net`, ou une adresse de Tailscale
// (100.64.0.0/10) ?
/** @param {string} adresse */
export function parLeTailnet(adresse) {
  let machine;
  try {
    machine = new URL(adresse).hostname;
  } catch {
    return false;
  }
  const [, second] = /^100\.(\d+)\.\d+\.\d+$/.exec(machine) ?? [];
  return TAILNET.test(machine) || (second !== undefined && Number(second) >= 64 && Number(second) <= 127);
}

// Ce que la liste dit d'un guichet qui ne se joint pas, en une ligne et son détail au survol. Elle nomme ce qui ne se
// joint pas : l'adresse (`injoignable`), sur le tailnet ou non ; le guichet derrière une adresse qui répond
// (`sans-guichet` : `tailscale serve`, la station arrêtée) ; ou ce qui répond à sa place (`inattendu`).
/** @param {"injoignable" | "sans-guichet" | "inattendu"} reason @param {string} said @param {string} adresse @returns {{ ligne: string, detail: string }} */
export function issueDe(reason, said, adresse) {
  const machine = machineDe(adresse);
  if (reason === "injoignable" && parLeTailnet(adresse)) return { ligne: `This phone cannot reach ${machine} on your tailnet.`, detail: `${said} — check that the Tailscale app is on, on this phone, signed in to your account, and that the station's machine is on.` };
  if (reason === "injoignable") return { ligne: `This phone cannot reach your station at ${machine}.`, detail: `${said} — on the station's network, check that it is running.` };
  if (reason === "sans-guichet") return { ligne: `${machine} answers, but the station's phone desk behind it does not.`, detail: `${said} — check that the station is running there, with its phone desk on.` };
  return { ligne: `What answers at ${machine} is not a station's phone desk.`, detail: said };
}

// Appairé, « All projects » liste les projets de la station, lus à son guichet toutes les trente secondes (le ticket
// 1414). Au-dessus de leurs lignes, la section dit en une phrase ce qui manque à la liste — rien quand elle vient d'être
// lue et en porte : sa première lecture en cours, une station qui n'en sert aucun, ou ce qui ne se joint pas — les
// projets déjà connus restent dessous. Une station qui ne connaît plus ce téléphone (son jeton révoqué) le dit aussi,
// avec le geste qui l'oublie — aucun appairage neuf ne se tire plus. `oublier` : ce geste.
/** @param {Fabrique} doc @param {import("../pont.d.ts").Telephone & { appaire: true }} telephone @param {number} projets @param {() => void} oublier @returns {any[]} */
export function poserLaListe(doc, telephone, projets, oublier) {
  const { station, adresse, liste } = telephone;
  /** @param {string} texte */
  const phrase = (texte) => {
    const ligne = doc.createElement("p");
    ligne.textContent = texte;
    return ligne;
  };
  if (liste === undefined) return projets > 0 ? [] : [phrase(`${station}'s projects: first read in progress…`)];
  if (liste.lue) return projets > 0 ? [] : [phrase(`${station} serves no project yet: a project is added from a computer.`)];
  if (liste.reason === "oublie") {
    const ligne = lectureIndisponible(doc, `${station} no longer knows this phone.`, `${liste.said} — this phone was revoked on the station, or paired again elsewhere.`);
    ligne.dataset.etat = "oublie";
    ligne.append(boutonAction(doc, "forget the station", oublier, { recommande: true }));
    return [ligne];
  }
  const { ligne, detail } = issueDe(liste.reason, liste.said, adresse);
  const dite = lectureIndisponible(doc, ligne, `${detail} This phone tries again every 30 s.`);
  dite.dataset.etat = "injoignable";
  return [dite];
}
