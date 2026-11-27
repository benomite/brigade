// @ts-check
// Une capacité hors du catalogue, dans « What it provides » (ticket 1959, épique 1950) : sous les cases du formulaire
// d'une station, un champ et « Add ». Le chef y tape une capacité que ni le catalogue de la machine ni aucune autre
// station n'offre — celle qu'un ticket attend en WAITING. Ajoutée, elle devient une case, cochée, du formulaire, et elle
// s'applique aussitôt, comme une case cochée : la station la déclare avec les autres (stations-declarees.js,
// `controleDesCapacites`), et le ticket qui l'attendait revient seul sur le rail.
// Déclarée, elle est offerte aux autres stations comme ce qu'elles fournissent (`choixDeCapacites`).
// Un nom vide, illisible ou déjà dans le formulaire est refusé en une ligne sous le champ : rien n'est ajouté, rien
// n'est envoyé.
// Ce que le chef a tapé et ajouté est gardé avec le formulaire ouvert (`Edition`) : un bloc reposé le redonne tel quel.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend un élément.

import { boutonAction, survol } from "../briques.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../stations-declarees.js").Edition} Edition */
/** @typedef {{ capacite: string, dite: string }} Choix */

export const AJOUTER = "Add";
export const INVITE = "a capability not listed";
export const AIDE = "A capability no case offers yet — the one a ticket in WAITING awaits: type its name and add it — it is declared at once. The tickets waiting for it go back on the rail.";

// La règle du nom tapé, celle du runtime (runtime/src/capacite-libre/capacite-libre.ts), que la vue ne peut pas
// importer : elle ne lit pas de TypeScript. Le test de la vue les tient identiques
// (app/test/vue/capacite-libre/capacite-libre.test.ts).
const CAPACITE = /^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u;
const FORME = "letters, digits and hyphens (code, navigateur-headless)";

// Le nom tapé, tel qu'il se déclare — vide s'il ne reste rien.
/** @param {string} ecrite */
export const nomDeCapaciteLibre = (ecrite) =>
  ecrite
    .trim()
    .replace(/^`(.*)`$/s, "$1")
    .trim()
    .replace(/\s+/g, "-")
    .normalize("NFC");

// La capacité à ajouter, ou le refus : vide, illisible, ou déjà parmi `presentes`.
/** @param {string} ecrite @param {readonly string[]} presentes @returns {{ capacite: string } | { refus: string }} */
export function capaciteLibre(ecrite, presentes) {
  const nom = nomDeCapaciteLibre(ecrite);
  if (nom === "") return { refus: "Nothing added: type the capability's name first." };
  if (!CAPACITE.test(nom)) return { refus: `Nothing added: “${nom}” is not a capability name — ${FORME}.` };
  if (presentes.some((presente) => presente.normalize("NFC") === nom)) return { refus: `Nothing added: “${nom}” is already in the form — tick its box.` };
  return { capacite: nom };
}

// Ce que le chef a tapé, le refus de son dernier « Add », et ce qu'il a ajouté — par formulaire ouvert.
/** @type {WeakMap<Edition, { texte: string, refus?: string, ajoutees: Choix[] }>} */
const saisies = new WeakMap();
/** @param {Edition} edition */
function saisieDe(edition) {
  const tenue = saisies.get(edition) ?? { texte: "", ajoutees: [] };
  saisies.set(edition, tenue);
  return tenue;
}

// Les cases du formulaire : celles qu'il offre, puis celles que le chef y a ajoutées — une fois chacune, même quand le
// catalogue de cette machine, lu après, en offre une.
/** @param {Edition} edition @returns {Choix[]} */
export function casesDuFormulaire(edition) {
  const offertes = new Set(edition.choix.map(({ capacite }) => capacite));
  return [...edition.choix, ...(saisies.get(edition)?.ajoutees ?? []).filter(({ capacite }) => !offertes.has(capacite))];
}

// Le champ et « Add », sous les cases. `poserLaCase` pose, cochée, la case d'une capacité ajoutée.
/** @param {Fabrique} doc @param {Edition} edition @param {string} station @param {(choix: Choix) => void} poserLaCase */
export function champDeCapaciteLibre(doc, edition, station, poserLaCase) {
  const saisie = saisieDe(edition);
  const racine = doc.createElement("div");
  racine.className = "capacite-libre";
  const ligne = doc.createElement("div");
  ligne.className = "saisie";
  const champ = doc.createElement("input");
  champ.type = "text";
  // Un nom de capacité est un mot de la machine, écrit tel qu'il se déclare : comme ses cases.
  champ.className = "mono";
  champ.value = saisie.texte;
  champ.placeholder = INVITE;
  champ.ariaLabel = `a capability ${station} provides, outside the list`;
  // Le rail redessiné rend le clavier au champ où le chef tapait (vue.js, `reprise`).
  champ.dataset.cle = `station:${station}`;
  champ.dataset.champ = "capacite-libre";
  champ.disabled = edition.envoi;
  champ.addEventListener("input", () => void (saisie.texte = champ.value));
  /** @type {HTMLElement | undefined} */
  let refus;
  const dire = () => {
    refus?.remove();
    refus = saisie.refus === undefined ? undefined : ligneErreur(doc, saisie.refus, "");
    if (refus !== undefined) racine.append(refus);
  };
  const ajouter = () => {
    if (edition.envoi) return;
    const rendu = capaciteLibre(saisie.texte, casesDuFormulaire(edition).map(({ capacite }) => capacite));
    if ("refus" in rendu) saisie.refus = rendu.refus;
    else {
      const choix = { capacite: rendu.capacite, dite: "" };
      saisie.ajoutees.push(choix);
      saisie.texte = "";
      saisie.refus = undefined;
      champ.value = "";
      edition.fournit = [...edition.fournit, rendu.capacite];
      poserLaCase(choix);
    }
    dire();
  };
  champ.addEventListener("keydown", (/** @type {KeyboardEvent} */ evenement) => {
    if (evenement.key !== "Enter") return;
    evenement.preventDefault();
    ajouter();
  });
  const bouton = boutonAction(doc, AJOUTER, ajouter);
  bouton.firstChild.disabled = edition.envoi;
  ligne.append(champ, bouton, survol(doc, AIDE));
  racine.append(ligne);
  dire();
  return racine;
}
