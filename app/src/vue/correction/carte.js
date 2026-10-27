// @ts-check
// La carte d'une correction proposée des consignes du projet (ticket 999, épique 994), dans la file du
// projet, au-dessus des colonnes du rail : ce qu'on attend du chef en tête, la cause, les tickets
// qu'elle a fait rater — chacun s'ouvre d'un clic —, la correction en diff, fichier par fichier, ses
// lignes ajoutées et retirées chacune de sa couleur, ce que la proposition a coûté, et les deux
// réponses : « yes », recommandé, son prix au survol ; « no ».
//
// Tout est calculé dans le process principal (app/src/correction.ts) : la carte pose. Le geste part
// par lui aussi, sur le tableau de la cuisine du projet (`/brigade correction yes|no <proposition>`,
// tableau-gestes/rail.ts) — jamais par la box. Ce module tient le geste en route —
// `Etat` — et ne touche pas `document` : il reçoit de quoi créer un élément (briques.js) et ce que
// chaque bouton appelle, et rend des éléments.

import { boutonAction, survol } from "../briques.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../correction.ts").CarteDeCorrection} Carte */
/** @typedef {import("../../correction.ts").Reponse} Reponse */
/** @typedef {import("../../correction.ts").Rendu} Rendu */

// Le geste en route, pour une proposition.
//   repos     rien n'est parti : la carte attend le chef
//   envoi     sa réponse part sur le tableau de la cuisine : les deux boutons attendent
//   postee    elle y est postée (`dit`, et `detail`, son commentaire, au survol) : la carte le dit sous ses
//             deux boutons, qui attendent ; la box la tranche à son tick, et la carte quitte la file à la
//             lecture du tableau qui ne la porte plus
//   refus     rien n'a été posté (`dit`, et `detail` au survol) : la carte reste, ses deux boutons aussi
/**
 * @typedef {{ etape: "repos" }
 *   | { etape: "envoi", reponse: Reponse }
 *   | { etape: "postee", reponse: Reponse, dit: string, detail: string }
 *   | { etape: "refus", dit: string, detail: string }} Etat
 */

/** @type {Etat} */
export const REPOS = { etape: "repos" };

export const ATTENDU = "A failure cause keeps coming back: accept this correction of the project's guidance?";
export const PILULE = "correction proposed";
export const RATES = "failed because of it:";
export const OUI = "yes, open it as a PR";
export const NON = "no";
export const PRIX_DU_OUI = "a PR carrying exactly this diff goes through the pass like a delivery — gates, the reviewer's reading, CI — on your quota";
export const ENVOI = { yes: "posting your “yes” on the Kitchen board…", no: "posting your “no” on the Kitchen board…" };
export const COUTE = "this proposal cost";

// L'étape qui suit la réponse du process principal.
/** @param {Reponse} reponse @param {Rendu | undefined} rendu @returns {Etat} */
export function apresRendu(reponse, rendu) {
  if (rendu === undefined) return { etape: "refus", dit: "nothing was posted: this project is not known to the app", detail: "" };
  if ("refus" in rendu) return { etape: "refus", dit: rendu.refus, detail: rendu.detail };
  return { etape: "postee", reponse, dit: `your “${reponse}”: ${rendu.dit}`, detail: rendu.detail };
}

// Les deux réponses d'une carte de la file — celle d'une correction, celle d'un profil (profil/carte.js) —
// dans l'état de son geste : inactives pendant l'envoi et une fois postée, ce qui est en route dit à côté ;
// dessous, en une ligne, ce qui est posté ou ce qui ne l'est pas, le détail au survol.
/** @param {Fabrique} doc @param {Etat} etat @param {ReturnType<typeof boutonAction>[]} boutons @returns {HTMLElement[]} */
export function poserLesReponses(doc, etat, boutons) {
  const reponses = cree(doc, "div");
  reponses.className = "reponses";
  for (const groupe of boutons) {
    const bouton = groupe.children?.[0];
    if (bouton !== undefined) bouton.disabled = etat.etape === "envoi" || etat.etape === "postee";
  }
  reponses.append(...boutons);
  if (etat.etape === "envoi") {
    const envoi = cree(doc, "span", ENVOI[etat.reponse]);
    envoi.className = "en-route";
    reponses.append(envoi);
  }
  if (etat.etape !== "postee" && etat.etape !== "refus") return [reponses];
  const dite = cree(doc, "p");
  // Chaque classe en clair : la peau ne vise que celles que la vue écrit (peau.test.ts).
  if (etat.etape === "postee") dite.className = "postee";
  else dite.className = "refus";
  dite.ariaLive = "polite";
  dite.append(cree(doc, "span", etat.dit));
  if (etat.detail.trim() !== "") dite.append(survol(doc, etat.detail));
  return [reponses, dite];
}

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Un instant de la box, comme la vue les dit ailleurs.
const quand = (/** @type {string} */ instant) => (Number.isNaN(Date.parse(instant)) ? instant : new Date(instant).toLocaleString("en-US"));
const s = (/** @type {number} */ combien) => (combien > 1 ? "s" : "");

// Des tickets, après leur libellé — ceux que la cause a fait rater, ceux du domaine d'un profil
// (profil/carte.js) : chacun son numéro, en monospace, qui ouvre son issue d'un clic — ou, sans adresse
// que l'app puisse ouvrir, posé seul.
/** @param {Fabrique} doc @param {string} libelle @param {Carte["tickets"]} tickets @param {(ticket: number) => void} ouvrir */
export function ligneDesTickets(doc, libelle, tickets, ouvrir) {
  const ligne = cree(doc, "p");
  ligne.className = "tickets";
  ligne.append(cree(doc, "span", libelle));
  for (const { ticket, ouvrable } of tickets) {
    if (!ouvrable) {
      const seul = cree(doc, "span", `#${ticket}`);
      seul.className = "ticket mono";
      seul.title = "the station gave no https address for this ticket: the app does not open it";
      ligne.append(seul);
      continue;
    }
    const numero = cree(doc, "button", `#${ticket}`);
    numero.type = "button";
    numero.className = "ticket mono";
    numero.title = `open issue #${ticket} in the browser`;
    numero.addEventListener("click", () => ouvrir(ticket));
    ligne.append(numero);
  }
  return ligne;
}

// Un fichier de la correction : son nom, ses lignes ajoutées et retirées comptées, puis ses lignes,
// chacune telle quelle, dans un `pre` : une ligne ajoutée et une ligne retirée ont chacune sa couleur,
// et gardent leur `+` et leur `-` — la couleur n'est pas seule à le dire.
/** @param {Fabrique} doc @param {Carte["fichiers"][number]} fichier */
function fichierDuDiff(doc, { fichier, ajoutees, retirees, lignes }) {
  const section = cree(doc, "section");
  section.className = "fichier-diff";
  const tete = cree(doc, "p");
  tete.className = "nom-fichier";
  const nom = cree(doc, "code", fichier === "" ? "(file not named)" : fichier);
  const plus = cree(doc, "span", `+${ajoutees}`);
  plus.className = "ajoutees";
  plus.title = `${ajoutees} line${s(ajoutees)} added`;
  const moins = cree(doc, "span", `−${retirees}`);
  moins.className = "retirees";
  moins.title = `${retirees} line${s(retirees)} removed`;
  tete.append(nom, plus, moins);
  const diff = cree(doc, "pre");
  diff.className = "diff";
  diff.append(
    ...lignes.map(({ genre, texte }, rang) => {
      const ligne = cree(doc, "span", rang === lignes.length - 1 ? texte : `${texte}\n`);
      // Chaque classe en clair : la peau ne vise que celles que la vue écrit (peau.test.ts). Le contexte n'en a pas.
      if (genre === "ajout") ligne.className = "ajout";
      else if (genre === "retrait") ligne.className = "retrait";
      else if (genre === "morceau") ligne.className = "morceau";
      else if (genre === "note") ligne.className = "note";
      return ligne;
    }),
  );
  section.append(tete, diff);
  return section;
}

// La carte d'une correction, dans son état. Elle reste posée tant que le tableau de la cuisine la porte.
/** @param {Fabrique} doc @param {Carte} carte @param {Etat} etat @param {{ ouvrir: (ticket: number) => void, repondre: (reponse: Reponse) => void }} gestes */
export function poserCorrection(doc, carte, etat, gestes) {
  const racine = cree(doc, "section");
  racine.className = "correction";
  racine.ariaLabel = `correction proposed: ${carte.titre}`;

  const attendu = cree(doc, "p", ATTENDU);
  attendu.className = "attendu";

  const tete = cree(doc, "div");
  tete.className = "tete-correction";
  const pilule = cree(doc, "span", PILULE);
  pilule.className = "pilule";
  const titre = cree(doc, "strong", carte.titre);
  tete.append(pilule, titre);

  const corps = [attendu, tete, ligneDesTickets(doc, RATES, carte.tickets, gestes.ouvrir)];
  if (carte.motif !== null) {
    const motif = cree(doc, "p", carte.motif);
    motif.className = "motif";
    corps.push(motif);
  }
  corps.push(...carte.fichiers.map((fichier) => fichierDuDiff(doc, fichier)));

  // Ce que la proposition a coûté : déjà dépensé, ce n'est pas le prix d'un geste — il se lit sur la carte.
  const cout = cree(doc, "p");
  cout.className = "cout-correction";
  const tokens = cree(doc, "span", carte.cout);
  tokens.className = "mono";
  cout.append(cree(doc, "span", `${COUTE} `), tokens, cree(doc, "span", ` · proposed ${quand(carte.proposee)}`));
  corps.push(cout);

  const oui = boutonAction(doc, OUI, () => gestes.repondre("yes"), { recommande: true, prix: PRIX_DU_OUI });
  const non = boutonAction(doc, NON, () => gestes.repondre("no"));
  corps.push(...poserLesReponses(doc, etat, [oui, non]));
  racine.append(...corps);
  return [racine];
}

// Les cartes de la file d'un projet, la plus ancienne d'abord, chacune dans son état.
/** @param {Fabrique} doc @param {Carte[] | undefined} cartes @param {(proposition: number) => Etat} etatDe @param {{ ouvrir: (ticket: number) => void, repondre: (proposition: number, reponse: Reponse) => void }} gestes */
export function poserCorrections(doc, cartes, etatDe, gestes) {
  return (cartes ?? []).flatMap((carte) => poserCorrection(doc, carte, etatDe(carte.proposition), { ouvrir: gestes.ouvrir, repondre: (reponse) => gestes.repondre(carte.proposition, reponse) }));
}
