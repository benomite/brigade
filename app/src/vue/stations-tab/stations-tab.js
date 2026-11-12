// @ts-check
// L'onglet Stations d'un projet, posé (ticket 3195, épique 3194) : un seul composant, qui répond à trois questions.
//   1. Qui le cuit, et est-ce que ça marche : une ligne en tête, dans exactement un de quatre états (etat.js, `hautDe`) —
//      verte seulement quand une station en ligne le cuit ou attend son prochain ticket. Hors ligne, elle dit que rien ne
//      cuit, comment ramener la station, et offre de déménager vers cet ordinateur d'un clic ; personne, combien de tickets
//      `fire` attendent, « Cook it on this computer » — recommandé, quand cet ordinateur ne le sert pas encore (ticket 3399)
//      — et « Choose who cooks it ».
//   2. Une carte par station qui sert le projet, elles seules : son nom, ce qu'elle est en clair, son état à l'instant, ce
//      qu'elle tient du projet (les tickets de ses cooks, ou « idle »), ses deux gestes — « Move to another station »,
//      « Stop cooking here » — et « Details », replié, qui porte ses réglages et ses lectures, chacun avec son contrôle.
//   3. Comment le changer : le choix de station (choix.js), ouvert sous la ligne du haut — qui le cuit, ou où déménager.
// Ce module ne touche ni `document` ni le pont : la vue lui donne une fabrique (briques.js), ce qu'elle a lu et les gestes.

import { boutonAction, replie, survol } from "../briques.js";
import { confirmationDeGeste } from "../composants/confirmation/confirmation.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { ligneVide } from "../composants/ligne-vide/ligne-vide.js";
import { marque } from "../composants/pastille/pastille.js";
import { ANNULER, CET_ORDINATEUR, ENREGISTREMENT, LECTURE_DE, OUI } from "../lexique.js";
import { lignesDeCooks } from "../stations-de-cuisson.js";
import { poserLesChoix } from "./choix.js";
import { BLOQUE, CHOISIR, CUIRE_ICI, phraseDuHaut, VERS_ICI } from "./etat.js";

/** @typedef {import("../composants/poele/poele.js").Fabrique} Fabrique */
/** @typedef {import("./etat.js").Haut} Haut */
/** @typedef {import("./etat.js").Servante} Servante */
/** @typedef {import("./etat.js").Sorte} Sorte */
/** @typedef {import("./choix.js").Choix} Choix */
/**
 * Ce que l'onglet montre.
 *   `projet`      son nom ; `poste` : le nom que l'écran donne à cet ordinateur (« this Mac »).
 *   `lues`        les stations sont lues : sans elles, l'onglet ne dit ni qui cuit ni que personne ne cuit.
 *   `haut`        la ligne du haut ; `ramener` : comment ramener la station hors ligne, au survol ; `versIci` : cet ordinateur
 *                 peut reprendre sa cuisine — le bouton qui l'y déménage est offert ; `cuireIci` : personne ne le cuit et cet
 *                 ordinateur peut le servir — « Cook it on this computer » est offert.
 *   `servantes`   une carte chacune ; `enCuisson` : la lecture de leurs cooks dit encore vrai (la poêle, ticket 2984).
 *   `choix`       le choix ouvert : son titre, ses choix, s'il déménage la cuisine (son prix se dit), celui qui s'écrit, le
 *                 refus du dernier.
 *   `dit`         ce que le dernier geste a rendu, en une ligne — refusé, son détail au survol.
 *   `deplacable`  le déménagement est offert ; sinon, pourquoi, au survol du bouton.
 *   `arret`       la station dont « Stop cooking here » attend sa confirmation, ou qui s'arrête (`enCours`).
 *   `details`     les lignes de « Details » de chaque station, par sa clé (`cleDe`) ; `ouverts` : celles dont « Details » est
 *                 déplié ; `arret.id` : la clé de la station qui s'arrête.
 *   `lecture`     l'écran étroit : il se lit sans rien régler (ticket 1186) — ni geste, ni « Details ».
 *   `quiCuit`     « Choose who cooks it » est offert : l'app connaît le dépôt du projet, et peut y écrire (ticket 3163).
 * @typedef {{
 *   projet: string,
 *   poste: string,
 *   lues: boolean,
 *   haut: Haut,
 *   ramener?: string,
 *   versIci?: boolean,
 *   cuireIci?: boolean,
 *   servantes: readonly Servante[],
 *   enCuisson?: boolean,
 *   choix?: { titre: string, choix: readonly Choix[], deplacement: boolean, enCours?: string, refus?: { ligne: string, detail: string } },
 *   dit?: { texte: string, refus: boolean, detail?: string },
 *   deplacable: { offert: boolean, pourquoi: string },
 *   arret?: { id: string, enCours: boolean },
 *   details: ReadonlyMap<string, readonly any[]>,
 *   ouverts: ReadonlySet<string>,
 *   lecture?: boolean,
 *   quiCuit?: boolean,
 * }} VuDeLOnglet
 */
/**
 * @typedef {{
 *   choisirQuiCuit(): void,
 *   deplacer(): void,
 *   versIci(): void,
 *   cuireIci(): void,
 *   choisir(choix: Choix): void,
 *   annuler(): void,
 *   arreter(id: string): void,
 *   confirmerArret(id: string): void,
 *   renoncerArret(): void,
 *   basculer(id: string, ouvert: boolean): void,
 * }} GestesDeLOnglet
 */

export const LECTURE = LECTURE_DE("your stations on GitHub");
export const DEPLACER = "Move to another station";
export const ARRETER = "Stop cooking here";
export const DETAILS = "Details";
export const DETAILS_RESUME = "folders, sandbox, Claude connection, cooks at once, ordinary tickets";
export const AU_REPOS = "idle";
// Ce qu'est chaque station, en clair.
/** @type {(poste: string) => Record<Sorte, string>} */
export const CE_QU_ELLE_EST = (poste) => ({
  ici: `${poste}: cooks while the app is open`,
  box: "always-on box: cooks while your computer sleeps",
  ordinateur: "another computer: cooks while Brigade is open on it",
});
// Son état, au mot de sa pilule.
export const EN_LIGNE = "online";
export const DEMARRE = "starting";
// Le choix ouvert, son titre.
/** @param {string} projet */
export const QUI_CUIT = (projet) => `Who cooks ${projet}?`;
/** @param {string} projet @param {string} de */
export const OU_DEPLACER = (projet, de) => `Move ${projet}'s kitchen from ${de} to:`;
// Ce que coûte un déménagement, dit sous son choix (le prix de la confirmation d'un geste qui coûte).
export const PRIX_DU_DEPLACEMENT = "Its cooks in flight stop and their tickets go back to the rail; its whole journal follows it.";
// « Stop cooking here » : ce qu'il fait, en une ligne.
/** @param {string} projet @param {string} station */
export const ARRET = (projet, station) => `Stop cooking ${projet} on ${station}?`;
/** @param {string} projet @param {string} station */
export const PRIX_DE_L_ARRET = (projet, station) => `${station} takes no more of ${projet}'s tickets; its cooks in flight finish.`;
export const OUI_ARRET = OUI("stop cooking here");

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue pose (peau.test.ts).
/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Le ton de la ligne du haut : vert quand une station le cuit ou attend son prochain ticket, et seulement alors.
/** @param {Haut} haut */
export const tonDuHaut = (haut) => (haut.vert ? "vert" : haut.etat === "deplacement" ? "jaune" : haut.etat === "hors-ligne" ? "rouge" : "gris");

// La ligne du haut : sa pastille, sa phrase, et ses gestes.
/** @param {Fabrique} doc @param {VuDeLOnglet} vu @param {GestesDeLOnglet} gestes */
function ligneDuHaut(doc, vu, gestes) {
  const { haut } = vu;
  const ligne = cree(doc, "div");
  ligne.className = "haut-des-stations";
  ligne.dataset.etat = haut.etat;
  ligne.dataset.ton = tonDuHaut(haut);
  ligne.ariaLive = "polite";
  const phrase = cree(doc, "p");
  phrase.className = "phrase";
  phrase.append(marque(doc, tonDuHaut(haut)), cree(doc, "strong", phraseDuHaut(haut)));
  if (haut.etat === "hors-ligne" && vu.ramener !== undefined && vu.ramener !== "") phrase.append(survol(doc, vu.ramener));
  ligne.append(phrase);
  if (haut.etat === "deplacement" && haut.bloque !== null) {
    const bloque = cree(doc, "p", BLOQUE(haut.bloque));
    bloque.className = "bloque";
    ligne.append(bloque);
  }
  // Les gestes : le cuire ici d'un clic, ou choisir qui le cuit ; ou, rien ne cuisant, le déménager ici d'un clic — vers une
  // autre station, c'est le geste de sa carte. Un choix ouvert les remplace.
  if (vu.choix !== undefined || vu.lecture === true) return ligne;
  const ici = haut.etat === "personne" && vu.cuireIci === true;
  const boutons = [
    ...(ici ? [boutonAction(doc, CUIRE_ICI, gestes.cuireIci, { recommande: true })] : []),
    ...(haut.etat === "personne" && vu.quiCuit === true ? [boutonAction(doc, CHOISIR, gestes.choisirQuiCuit, { recommande: !ici })] : []),
    ...(haut.etat === "hors-ligne" && vu.versIci === true ? [boutonAction(doc, VERS_ICI, gestes.versIci, { recommande: true })] : []),
  ];
  if (boutons.length > 0) {
    const pied = cree(doc, "p");
    pied.className = "gestes";
    pied.append(...boutons);
    ligne.append(pied);
  }
  return ligne;
}

// « Move to another station » : offert, il ouvre le choix ; sinon il attend, et dit pourquoi au survol.
/** @param {Fabrique} doc @param {VuDeLOnglet} vu @param {GestesDeLOnglet} gestes */
function boutonDeDeplacement(doc, { deplacable }, gestes) {
  const action = boutonAction(doc, DEPLACER, gestes.deplacer);
  const bouton = action.children?.[0];
  if (bouton !== undefined && !deplacable.offert) {
    bouton.disabled = true;
    bouton.title = deplacable.pourquoi;
  }
  return action;
}

// Le choix ouvert : son titre, la liste (choix.js), et « Cancel » — un déménagement dit aussi son prix.
/** @param {Fabrique} doc @param {NonNullable<VuDeLOnglet["choix"]>} choix @param {GestesDeLOnglet} gestes */
function leChoix(doc, choix, gestes) {
  const racine = cree(doc, "section");
  racine.className = "choix-des-stations";
  racine.ariaLabel = choix.titre;
  const attendu = cree(doc, "p", choix.titre);
  attendu.className = "attendu";
  racine.append(attendu);
  const etat = { choix: choix.choix, ...(choix.enCours === undefined ? {} : { enCours: choix.enCours }), ...(choix.refus === undefined ? {} : { refus: choix.refus }) };
  racine.append(...poserLesChoix(doc, etat, gestes.choisir));
  if (choix.deplacement) {
    const prix = cree(doc, "p", PRIX_DU_DEPLACEMENT);
    prix.className = "prix";
    racine.append(prix);
  }
  const pied = cree(doc, "p");
  pied.className = "gestes";
  const annuler = boutonAction(doc, ANNULER, gestes.annuler);
  const bouton = annuler.children?.[0];
  if (bouton !== undefined) bouton.disabled = choix.enCours !== undefined;
  pied.append(annuler);
  racine.append(pied);
  return racine;
}

// L'état d'une station, à l'instant : sa pilule, son ton — vert seulement en ligne.
/** @param {Servante} station */
export const etatDit = ({ etat, dit }) =>
  etat === "en-ligne" ? { mot: EN_LIGNE, ton: "vert" } : etat === "demarre" ? { mot: DEMARRE, ton: "jaune" } : { mot: dit, ton: etat === "illisible" ? "gris" : "rouge" };

// La clé d'une station de l'onglet : son gist, sinon son nom — une station que le projet nomme sans que l'app la connaisse.
// Ses gestes et son « Details » la retrouvent par elle.
/** @param {Pick<Servante, "id" | "nom">} station */
export const cleDe = ({ id, nom }) => (id === "" ? nom : id);

// Une carte : la station qui sert le projet.
/** @param {Fabrique} doc @param {VuDeLOnglet} vu @param {Servante} station @param {GestesDeLOnglet} gestes */
function carte(doc, vu, station, gestes) {
  const racine = cree(doc, "section");
  racine.className = "carte-de-station";
  const cle = cleDe(station);
  racine.dataset.station = cle;
  racine.dataset.etat = station.etat;
  racine.ariaLabel = station.nom;
  // Son nom — « this computer » pour celle de cet ordinateur, son nom d'hôte après —, ce qu'elle est, et son état.
  const tete = cree(doc, "header");
  const nom = cree(doc, "h4");
  const appele = cree(doc, "strong", station.ici ? CET_ORDINATEUR : station.nom);
  if (!station.ici) appele.className = "mono";
  nom.append(appele);
  if (station.ici) {
    const hote = cree(doc, "span", station.nom);
    hote.className = "hote mono";
    nom.append(hote);
  }
  const { mot, ton } = etatDit(station);
  const etat = cree(doc, "span");
  etat.className = "pilule etat";
  etat.dataset.ton = ton;
  etat.append(marque(doc, ton), cree(doc, "strong", mot));
  // Ce qui la retient encore — sa machine pleine, la limite de GitHub, son refus — se dit à côté.
  if (station.note !== undefined && station.note !== "") {
    const note = cree(doc, "small", station.note);
    note.className = "note";
    etat.append(note);
  }
  tete.append(nom, etat);
  const ceQuElleEst = cree(doc, "p", CE_QU_ELLE_EST(vu.poste)[station.sorte]);
  ceQuElleEst.className = "ce-qu-elle-est";
  racine.append(tete, ceQuElleEst);
  // Ce qu'elle tient du projet : les tickets de ses cooks, ce qu'elle fait tourner d'autre ; rien, elle est au repos.
  const tient = station.cooks.length + station.agents.length > 0;
  racine.append(
    tient
      ? lignesDeCooks(doc, station.cooks, station.agents, vu.enCuisson === true && station.etat === "en-ligne")
      : ligneVide(doc, AU_REPOS, { classe: "au-repos" }),
  );
  // Ses gestes, ou la confirmation de son arrêt — puis, confirmé, qu'il s'écrit. La station où la cuisine déménage n'en a
  // pas tant qu'elle démarre : la ligne du haut suit le déménagement.
  if (vu.arret?.id === cle && vu.arret.enCours) {
    const enCours = cree(doc, "p", ENREGISTREMENT);
    enCours.className = "dit";
    racine.append(enCours);
  } else if (vu.arret?.id === cle) {
    racine.append(
      confirmationDeGeste(
        doc,
        { titre: ARRET(vu.projet, station.nom), phrase: PRIX_DE_L_ARRET(vu.projet, station.nom), oui: OUI_ARRET, non: ANNULER },
        { oui: () => gestes.confirmerArret(cle), non: gestes.renoncerArret },
      ),
    );
  } else if (vu.choix === undefined && vu.lecture !== true && station.etat !== "demarre") {
    const pied = cree(doc, "p");
    pied.className = "gestes";
    pied.append(boutonDeDeplacement(doc, vu, gestes), boutonAction(doc, ARRETER, () => gestes.arreter(cle), { sorte: "discret" }));
    racine.append(pied);
  }
  // « Details », replié tant que le chef ne l'ouvre pas : ses réglages et ses lectures, chacun avec son contrôle.
  const lignes = vu.details.get(cle) ?? [];
  if (lignes.length > 0) {
    const contenu = cree(doc, "div");
    contenu.className = "details-de-station";
    contenu.append(...lignes);
    racine.append(replie(doc, { titre: DETAILS, resume: DETAILS_RESUME, ouvert: vu.ouverts.has(cle), basculer: (ouvert) => gestes.basculer(cle, ouvert) }, [contenu]));
  }
  return racine;
}

/** @param {Fabrique} doc @param {VuDeLOnglet} vu @param {GestesDeLOnglet} gestes */
export function poserLOngletDesStations(doc, vu, gestes) {
  const racine = cree(doc, "section");
  racine.className = "onglet-des-stations";
  racine.dataset.bloc = "stations-tab";
  racine.ariaLabel = "Stations";
  if (!vu.lues) {
    racine.append(ligneVide(doc, LECTURE, { classe: "lecture" }));
    return racine;
  }
  racine.append(ligneDuHaut(doc, vu, gestes));
  if (vu.dit !== undefined && vu.dit.texte !== "") {
    const dit = cree(doc, "p", vu.dit.texte);
    dit.className = "dit-des-stations";
    racine.append(vu.dit.refus ? ligneErreur(doc, vu.dit.texte, vu.dit.detail ?? "", { classe: "dit-des-stations" }) : dit);
  }
  if (vu.choix !== undefined) racine.append(leChoix(doc, vu.choix, gestes));
  if (vu.servantes.length > 0) {
    const cartes = cree(doc, "div");
    cartes.className = "cartes-des-stations";
    cartes.append(...vu.servantes.map((station) => carte(doc, vu, station, gestes)));
    racine.append(cartes);
  }
  return racine;
}
