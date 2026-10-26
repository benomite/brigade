// @ts-check
// La carte d'un profil de cook proposé (ticket 1053, épique 1033), dans la file du projet, au-dessus des
// colonnes du rail, comme celle d'une correction (correction/carte.js) : ce qu'on attend du chef en
// tête, le nom du profil et son domaine, les chiffres qui le justifient — les seuils au survol —, les
// tickets du domaine — chacun s'ouvre d'un clic —, ce que le profil contiendrait (skills, périmètre,
// carnet de départ), et les deux réponses : « yes », recommandé, ce qu'il écrit au survol ; « no », ce
// qu'il fait de la proposition au survol.
//
// Tout est calculé dans le process principal (app/src/profil.ts) : la carte pose. Le geste part par lui
// aussi, sur le tableau de la cuisine du projet (`/brigade profile yes|no <proposition>`) — jamais par la
// box. Le geste en route se tient comme celui d'une correction — mêmes étapes (`Etat`), mêmes mots, mêmes
// réponses posées (`poserLesReponses`). Ce module ne touche pas `document` :
// il reçoit de quoi créer un élément (briques.js) et ce que chaque bouton appelle, et rend des éléments.

import { boutonAction, survol } from "../briques.js";
import { poserLesReponses } from "../correction/carte.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../profil.ts").CarteDeProfil} Carte */
/** @typedef {import("../../correction.ts").Reponse} Reponse */
/** @typedef {import("../correction/carte.js").Etat} Etat */

export const ATTENDU = "One part of the code keeps needing more than one try: give it a cook profile of its own?";
export const PILULE = "profile proposed";
export const TICKETS = "its tickets:";
export const CONTIENDRAIT = "what the profile would hold";
export const SANS_SKILLS = "none proposed";
export const POURQUOI_SANS_SKILLS = "the measure does not say which skills a domain needs: add them to the profile's definition once it is written";
export const CARNET_VIDE = "starts empty: no lesson of the project comes from this domain yet";
export const OUI = "yes, create the profile";
export const NON = "no";
export const EFFET_DU_OUI = "writes the profile's definition, its notebook included, under .claude/brigade/profils/ in the project's repository";
export const EFFET_DU_NON = "it is not proposed again until this domain crosses the thresholds again, on tickets served after your “no”";

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Un instant de la box, comme la vue les dit ailleurs.
const quand = (/** @type {string} */ instant) => (Number.isNaN(Date.parse(instant)) ? instant : new Date(instant).toLocaleString("en-US"));

// Les tickets du domaine : chacun son numéro, en monospace, qui ouvre son issue d'un clic — ou, sans
// adresse que l'app puisse ouvrir, posé seul. Les mêmes que sur la carte d'une correction.
/** @param {Fabrique} doc @param {Carte["tickets"]} tickets @param {(ticket: number) => void} ouvrir */
function tickets(doc, tickets, ouvrir) {
  const ligne = cree(doc, "p");
  ligne.className = "tickets";
  ligne.append(cree(doc, "span", TICKETS));
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

// Une ligne de ce que le profil contiendrait : son libellé, puis ce qu'elle porte.
/** @param {Fabrique} doc @param {string} libelle @param {any[]} contenu */
export function ligneDuContenu(doc, libelle, contenu) {
  const ligne = cree(doc, "p");
  ligne.className = "ligne-contenu";
  const nom = cree(doc, "span", libelle);
  nom.className = "libelle";
  ligne.append(nom, ...contenu);
  return ligne;
}

// Des chemins ou des noms, chacun en monospace : ce qui se recopie.
/** @param {Fabrique} doc @param {string[]} noms */
export const enMono = (doc, noms) =>
  noms.map((nom) => {
    const pose = cree(doc, "code", nom);
    pose.className = "mono";
    return pose;
  });

// Ce que le profil contiendrait : ses skills, son périmètre, son carnet de départ — chaque leçon par son
// identifiant, son texte et les rétros qui la portent.
/** @param {Fabrique} doc @param {Carte} carte */
function contenu(doc, { skills, perimetre, carnet }) {
  const bloc = cree(doc, "div");
  bloc.className = "contenu";
  const titre = cree(doc, "p", CONTIENDRAIT);
  titre.className = "titre-contenu";
  const sansSkills = cree(doc, "span", SANS_SKILLS);
  sansSkills.className = "aucune";
  const lignes = [
    ligneDuContenu(doc, "skills", skills.length === 0 ? [sansSkills, survol(doc, POURQUOI_SANS_SKILLS)] : enMono(doc, skills)),
    ligneDuContenu(doc, "perimeter", enMono(doc, perimetre)),
    ligneDuContenu(doc, "notebook", [cree(doc, "span", carnet.length === 0 ? CARNET_VIDE : `starts with ${carnet.length} lesson${carnet.length > 1 ? "s" : ""} of the project, born of this domain's tickets`)]),
  ];
  bloc.append(titre, ...lignes);
  if (carnet.length > 0) {
    const lecons = cree(doc, "ul");
    lecons.className = "carnet";
    for (const { id, texte, de } of carnet) {
      const lecon = cree(doc, "li");
      const nom = cree(doc, "code", id);
      nom.className = "mono";
      lecon.append(nom, cree(doc, "span", texte));
      if (de !== "") {
        const origine = cree(doc, "span", de);
        origine.className = "de";
        lecon.append(origine);
      }
      lecons.append(lecon);
    }
    bloc.append(lecons);
  }
  return bloc;
}

// La carte d'un profil proposé, dans son état. Elle reste posée tant que le tableau de la cuisine la porte.
/** @param {Fabrique} doc @param {Carte} carte @param {Etat} etat @param {{ ouvrir: (ticket: number) => void, repondre: (reponse: Reponse) => void }} gestes */
export function poserProfil(doc, carte, etat, gestes) {
  const racine = cree(doc, "section");
  racine.className = "profil";
  racine.ariaLabel = `cook profile proposed: ${carte.nom}`;

  const attendu = cree(doc, "p", ATTENDU);
  attendu.className = "attendu";

  const tete = cree(doc, "div");
  tete.className = "tete-profil";
  const pilule = cree(doc, "span", PILULE);
  pilule.className = "pilule";
  const domaine = cree(doc, "span");
  domaine.className = "domaine";
  domaine.append(cree(doc, "span", "for "), ...enMono(doc, [carte.domaine]));
  tete.append(pilule, cree(doc, "strong", carte.nom), domaine);

  const frequence = cree(doc, "p", carte.frequence);
  frequence.className = "chiffres";
  const premierCoup = cree(doc, "p");
  premierCoup.className = "chiffres";
  premierCoup.append(cree(doc, "span", carte.premierCoup), survol(doc, carte.seuils));

  const proposee = cree(doc, "p", `proposed ${quand(carte.proposee)}`);
  proposee.className = "quand";

  const oui = boutonAction(doc, OUI, () => gestes.repondre("yes"), { recommande: true, prix: EFFET_DU_OUI });
  const non = boutonAction(doc, NON, () => gestes.repondre("no"), { prix: EFFET_DU_NON });

  racine.append(attendu, tete, frequence, premierCoup, tickets(doc, carte.tickets, gestes.ouvrir), contenu(doc, carte), proposee, ...poserLesReponses(doc, etat, [oui, non]));
  return [racine];
}

// Les cartes de la file d'un projet, la plus ancienne d'abord, chacune dans son état.
/** @param {Fabrique} doc @param {Carte[] | undefined} cartes @param {(proposition: number) => Etat} etatDe @param {{ ouvrir: (ticket: number) => void, repondre: (proposition: number, reponse: Reponse) => void }} gestes */
export function poserProfils(doc, cartes, etatDe, gestes) {
  return (cartes ?? []).flatMap((carte) => poserProfil(doc, carte, etatDe(carte.proposition), { ouvrir: gestes.ouvrir, repondre: (reponse) => gestes.repondre(carte.proposition, reponse) }));
}
