// @ts-check
// Le tableau de la cuisine d'un projet (« Kitchen board », ticket 1588, épique 1580) : l'issue que sa box tient à jour
// dans le dépôt du projet, lue de GitHub par l'app (app/src/tableau/lecture.ts) — ni `ssh` ni tailnet. L'onglet Rail en
// tire ce qui attend le chef, chaque ligne avec son geste — au survol, en attendant qu'il soit un bouton —, et l'état de la cuisine, tels que `status` les écrit ; et il
// dit l'âge de cette lecture. Il n'est jamais vide : en tête, toujours une phrase — ce qui attend le chef, ou pourquoi
// le tableau ne se lit pas. Une lecture qui échoue offre le lien direct (`ssh`, le guichet d'une station) quand le projet
// en a un, et seulement alors ; la dernière lecture réussie reste dessous, marquée de son âge.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { boutonAction, survol } from "./briques.js";
import { phrase } from "./onboarding/parcours.js";
import { gestes, phraseEtDetail, RELIRE } from "./premier-lancement.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../tableau/lecture.ts").LectureDuTableauDuDepot} LectureDuTableauDuDepot */
/** @typedef {import("../tableau/lecture.ts").TableauLu} TableauLu */

// Ce que la vue tient du tableau d'un projet. `lu` : absent, sa première lecture est en route. `dernier` : la dernière
// lecture réussie, gardée quand une suivante échoue. `lienDirect` : le projet a un lien direct. `maintenant` : l'heure
// de l'écran, en millisecondes — l'âge se compte jusqu'à elle.
/**
 * @typedef {{
 *   projet: string,
 *   lu?: LectureDuTableauDuDepot,
 *   dernier?: TableauLu,
 *   lienDirect: boolean,
 *   maintenant: number,
 * }} EtatDuTableau
 */
/**
 * @typedef {{
 *   relire: () => void,
 *   prendreLeLienDirect: () => void,
 *   forme?: (ton: string | undefined) => string | undefined,
 * }} GestesDuTableau
 */

export const LECTURE_DU_TABLEAU = "Reading the Kitchen board on GitHub…";
export const LIEN_DIRECT = "use the direct link";
export const RETOUR_AU_TABLEAU = "back to the Kitchen board";
export const PAR_LE_LIEN_DIRECT = "Read over the direct link, not from the Kitchen board.";
// Les deux colonnes : ce qui attend le chef — le mot de la colonne du rail qui le dit déjà —, puis la cuisine.
export const COLONNE_DE_LA_FILE = "TODO";
export const COLONNE_DE_LA_CUISINE = "Kitchen";
export const RIEN_N_ATTEND = "nothing awaits you";
// L'état de la cuisine en un mot (le mot des faits, runtime/src/tableau/rendu/bloc.ts), et son ton.
/** @type {Record<string, { mot: string, ton: string }>} */
const ETATS = {
  ouverte: { mot: "open", ton: "vert" },
  retenue: { mot: "held", ton: "jaune" },
  arrêtée: { mot: "stopped", ton: "rouge" },
  éteinte: { mot: "off", ton: "gris" },
};

// Une durée en secondes, dite courte : `40 s`, `3 min`, `2 h`, `4 d`.
/** @param {number} secondes */
export function dureeCourte(secondes) {
  const s = Math.max(0, Math.floor(secondes));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86_400)} d`;
}

// L'âge d'une lecture à l'heure de l'écran : celui qu'elle avait quand l'app l'a lue — de l'heure où la box a écrit le
// tableau à celle de la lecture —, plus ce qui a passé depuis.
/** @param {TableauLu} lu @param {number} maintenant */
export const ageDe = (lu, maintenant) => lu.age + Math.max(0, (maintenant - Date.parse(lu.luLe)) / 1000);
/** @param {number} secondes */
export const luIlYA = (secondes) => `read ${dureeCourte(secondes)} ago`;

/** @param {string} quand */
const utc = (quand) => `${new Date(quand).toISOString().slice(11, 16)} UTC`;

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// La phrase de tête d'une lecture réussie : ce qui attend le chef, en une phrase.
/** @param {string} projet @param {number} combien */
export function attendDe(projet, combien) {
  if (combien === 0) return `Nothing awaits you on ${projet}.`;
  return combien === 1 ? `1 thing awaits you on ${projet}.` : `${combien} things await you on ${projet}.`;
}

// D'où vient la lecture, au survol : cela ne change rien à ce que fait le chef.
/** @param {TableauLu} lu */
const provenanceDe = (lu) =>
  `From the Kitchen board of ${lu.depot} (issue ${lu.numero}), written by the box at ${utc(lu.genereLe)} and read on GitHub at ${utc(lu.luLe)} — this screen reads GitHub, not the box.`;

// Ce qu'une ligne de la file dit, et le geste du chef qui la finit : `status` l'écrit en code après un tiret
// (« green, waiting for your merge — `brigade parade pass 18` »). Le geste passe au survol — aucune commande à recopier
// à plat ; ce qui le dit en mots reste. Une ligne qui ne finit pas sur un geste reste entière.
export const GESTE_DE_LA_LIGNE = "the gesture, as status writes it:";
const GESTES_EN_FIN = /(?:\s+—\s+`[^`]+`)+\s*$/;
/** @param {string} ligne @returns {{ dit: string, geste: string }} */
export function gesteDe(ligne) {
  const fin = GESTES_EN_FIN.exec(ligne);
  if (fin === null || fin.index === 0) return { dit: ligne, geste: "" };
  return { dit: ligne.slice(0, fin.index), geste: [...fin[0].matchAll(/`([^`]+)`/g)].map(([, code]) => code).join(" · ") };
}

// Une ligne de la file : son nom, depuis quand elle attend, le titre de son ticket, puis ce qui attend et le geste du
// chef, mot pour mot comme `status` l'écrit — le geste en code.
/** @param {Fabrique} doc @param {TableauLu["file"][number]} ligne @param {number} maintenant */
function bonDeLaFile(doc, { nom, titre, depuis, ligne }, maintenant) {
  const bon = cree(doc, "li");
  bon.className = "bon";
  const tete = cree(doc, "div");
  const appele = cree(doc, "span", nom);
  appele.className = "ticket mono";
  tete.append(appele);
  const debut = Date.parse(depuis);
  if (!Number.isNaN(debut)) {
    const attente = cree(doc, "small", `waiting ${dureeCourte((maintenant - debut) / 1000)}`);
    attente.title = `waiting since ${utc(depuis)}`;
    tete.append(attente);
  }
  bon.append(tete);
  if (titre !== null && titre !== "") bon.append(cree(doc, "strong", titre));
  const { dit, geste } = gesteDe(ligne);
  const pose = phrase(doc, "p", dit);
  pose.className = "ligne-carte";
  if (geste !== "") pose.append(survol(doc, `${GESTE_DE_LA_LIGNE} ${geste}`));
  bon.append(pose);
  return bon;
}

/** @param {Fabrique} doc @param {string} nom @param {string} compte @param {string} ton @param {GestesDuTableau} geste */
function colonne(doc, nom, compte, ton, geste) {
  const pose = cree(doc, "section");
  pose.className = "colonne";
  pose.dataset.ton = ton;
  const forme = geste.forme?.(ton);
  if (forme !== undefined) pose.dataset.forme = forme;
  const tete = cree(doc, "h4");
  tete.append(cree(doc, "span", nom), cree(doc, "span", compte));
  pose.append(tete);
  return pose;
}

// Les deux colonnes d'une lecture : TODO, ce qui attend le chef, et ce que `status` en dit sans que ce soit une
// décision ; puis la cuisine, rubrique par rubrique.
/** @param {Fabrique} doc @param {TableauLu} lu @param {number} maintenant @param {GestesDuTableau} geste */
function colonnes(doc, lu, maintenant, geste) {
  const grille = cree(doc, "div");
  grille.className = "colonnes tableau-de-cuisine";
  const file = colonne(doc, COLONNE_DE_LA_FILE, String(lu.file.length), "rouge", geste);
  file.dataset.attend = "";
  if (lu.file.length === 0) {
    const vide = cree(doc, "p", RIEN_N_ATTEND);
    vide.className = "vide";
    file.append(vide);
  } else {
    const liste = cree(doc, "ol");
    liste.append(...lu.file.map((ligne) => bonDeLaFile(doc, ligne, maintenant)));
    file.append(liste);
  }
  file.append(...lu.bilans.map((bilan) => phrase(doc, "p", bilan)));
  const etat = ETATS[lu.cuisine.etat] ?? { mot: lu.cuisine.etat, ton: "gris" };
  const cuisine = colonne(doc, COLONNE_DE_LA_CUISINE, etat.mot, etat.ton, geste);
  const rubriques = cree(doc, "dl");
  rubriques.className = "rubriques";
  for (const { titre, lignes } of lu.cuisine.rubriques) {
    const terme = cree(doc, "dt", titre);
    terme.className = "mono";
    // Comme une ligne de la file : un geste qui finit une ligne passe au survol de sa rubrique.
    const lues = lignes.map(gesteDe);
    const dit = phrase(doc, "dd", lues.map((lue) => lue.dit).join("\n"));
    dit.className = "mono";
    const siens = lues.flatMap((lue) => (lue.geste === "" ? [] : [lue.geste]));
    if (siens.length > 0) dit.append(survol(doc, `${GESTE_DE_LA_LIGNE} ${siens.join(" · ")}`));
    rubriques.append(terme, dit);
  }
  cuisine.append(rubriques);
  grille.append(file, cuisine);
  return grille;
}

// La raison d'un échec, telle que la lecture la donne (app/src/tableau/lecture.ts) : une phrase que l'app montre telle
// quelle — sauf quand GitHub n'a pas été joint, où elle finit sur ce que le réseau a dit (`getaddrinfo ENOTFOUND …`) :
// ce détail passe au survol, aucune erreur brute à plat.
const INJOIGNABLE = /^(GitHub could not be reached to read the Kitchen board of \S+): (.+?)\.?$/s;
/** @param {string} raison @returns {{ phrase: string, detail: string }} */
export function raisonDe(raison) {
  const injoignable = INJOIGNABLE.exec(raison);
  return injoignable === null ? { phrase: raison, detail: "" } : { phrase: `${injoignable[1]}.`, detail: injoignable[2] ?? "" };
}

// L'onglet entier, d'après ce que la vue tient : la phrase de tête, l'âge de la lecture et ses gestes, puis les
// colonnes — ou pourquoi le tableau ne se lit pas, et ce qui reste à faire.
/** @param {Fabrique} doc @param {EtatDuTableau} etat @param {GestesDuTableau} geste @returns {any[]} */
export function poserLeTableauDeCuisine(doc, etat, geste) {
  const { lu, lienDirect, maintenant } = etat;
  /** @param {string} texte @param {string} [detail] */
  const enTete = (texte, detail) => {
    const tete = phraseEtDetail(doc, "h3", texte, detail);
    tete.className = "attendu";
    return tete;
  };
  /** @param {TableauLu} lu @param {any[]} boutons */
  const age = (lu, boutons) => {
    const pose = gestes(doc, boutons);
    const dit = cree(doc, "span", luIlYA(ageDe(lu, maintenant)));
    dit.className = "age";
    dit.title = provenanceDe(lu);
    pose.prepend(dit);
    return pose;
  };
  const relire = (recommande = false) => boutonAction(doc, RELIRE, geste.relire, { recommande });
  const direct = (recommande = false) => (lienDirect ? [boutonAction(doc, LIEN_DIRECT, geste.prendreLeLienDirect, { recommande })] : []);
  if (lu === undefined) return [enTete(LECTURE_DU_TABLEAU)];
  if (lu.lu) return [enTete(attendDe(etat.projet, lu.file.length), provenanceDe(lu)), age(lu, [relire(), ...direct()]), colonnes(doc, lu, maintenant, geste)];
  // Ne se lit pas : la raison en une phrase, l'heure de l'essai au survol. Le lien direct, quand il y en a un, est le
  // geste recommandé ; sinon, relire. La dernière lecture réussie reste dessous, son âge dit.
  const { phrase: raison, detail } = raisonDe(lu.raison);
  const essai = `tried at ${utc(lu.luLe)} — the app reads the Kitchen board on GitHub, in the project's repository: the open issue labelled kitchen-board`;
  const tete = enTete(raison, detail === "" ? essai : `${detail} — ${essai}`);
  const boutons = gestes(doc, [...direct(true), relire(!lienDirect)]);
  const dernier = etat.dernier;
  if (dernier === undefined) return [tete, boutons];
  return [tete, boutons, age(dernier, []), colonnes(doc, dernier, maintenant, geste)];
}

// En tête du rail lu par le lien direct, que le chef a pris : d'où il vient, et le bouton qui ramène au tableau.
/** @param {Fabrique} doc @param {() => void} revenir */
export function ligneDuLienDirect(doc, revenir) {
  const pose = gestes(doc, [boutonAction(doc, RETOUR_AU_TABLEAU, revenir)]);
  pose.className = "gestes lien-direct";
  pose.prepend(cree(doc, "span", PAR_LE_LIEN_DIRECT));
  return pose;
}
