// @ts-check
// Le bloc de la station de cet ordinateur, sur l'accueil (ticket 2640, épique 2497) : le second des deux blocs de
// l'accueil (ticket 2638). Trois états :
//  - cet ordinateur n'a pas de station : un seul bouton, « Install this computer's station », et aucun autre réglage ;
//  - le bouton a été pressé : l'installation tourne, puis les premiers réglages se déroulent un à un, jusqu'à ce que la
//    station soit prête (un refus de l'installation se dit en une ligne, son détail au survol, et le bouton revient) ;
//  - la station est installée : son nom, sa phrase et un lien vers sa page — pas de bouton d'installation —, puis les
//    autres stations du chef, chacune avec le sien.
// Vide de lecture, le bloc dit qu'il lit.
//
// Il ne touche ni `document` ni le pont : la vue lui donne une fabrique (briques.js), l'installation, les étapes des
// premiers réglages et l'ouverture d'une page de station.

import { boutonAction, lectureIndisponible } from "../../briques.js";

/** @typedef {import("../../briques.js").Fabrique} Fabrique */
/** @typedef {{ id: string, nom: string, phrase: string }} UneStation */
/**
 * Ce que la vue a lu : indéfini, la lecture est en route ; `station` nulle, cet ordinateur n'en a pas ; sinon sa station
 * et les autres du chef.
 * @typedef {{ station: UneStation | null, autres?: readonly UneStation[] }} Lecture
 */
/**
 * Un premier réglage. `geste` : ce que le chef y fait, s'il y a un geste — son libellé et ce qu'il rend (un refus en une
 * ligne, ou rien). Sans geste, l'étape se lit et se passe.
 * @typedef {{ nom: string, dit: string, geste?: { libelle: string, faire(): Promise<{ refus: string, detail?: string } | void> } }} Etape
 */
/**
 * `installer` rend un refus en une ligne (son détail à part), ou rien quand la station est installée. `ouvrir` : la page
 * d'une station, par son id.
 * @typedef {{ installer(): Promise<{ refus: string, detail?: string } | void>, etapes: readonly Etape[], ouvrir(id: string): void }} Gestes
 */

export const TITRE = "This computer's station";
export const INSTALLER = "Install this computer's station";
export const INSTALLATION = "installing the station…";
export const INSTALLATION_SURVOL = "downloads the station, starts it, and connects it to GitHub and Max: it can take a couple of minutes";
export const REFUS = "the station could not be installed";
export const REESSAYER = "Try again";
export const LECTURE = "reading this computer's station…";
export const PRETE = "the station is ready";
export const SA_PAGE = "Open its page";
export const LES_AUTRES = "Your other stations";
export const SUIVANT = "Next";
export const TERMINER = "Done";

/** @param {Fabrique} doc @param {string} balise @param {string} texte @param {string} [classe] */
function avec(doc, balise, texte, classe) {
  const pose = doc.createElement(balise);
  pose.textContent = texte;
  if (classe !== undefined) pose.className = classe;
  return pose;
}

// La place du bloc : son titre et son corps, vide. La vue le pose sur l'accueil ; `tenirBlocDeLaStation` le remplit.
/** @param {Fabrique} doc */
export function poserBlocDeLaStation(doc) {
  const racine = doc.createElement("section");
  racine.id = "accueil-bloc-station";
  racine.className = "bloc-de-l-accueil";
  racine.ariaLabel = TITRE;
  const corps = doc.createElement("div");
  corps.className = "liste";
  corps.hidden = true;
  racine.append(avec(doc, "h2", TITRE), corps);
  return racine;
}

// Une station, en une ligne qui se clique : son nom, ce qu'elle dit, et sa page au bout du clic.
/** @param {Fabrique} doc @param {UneStation} station @param {(id: string) => void} ouvrir */
function ligneDeStation(doc, station, ouvrir) {
  const ligne = doc.createElement("button");
  ligne.type = "button";
  ligne.className = "ligne";
  ligne.title = station.phrase;
  ligne.append(avec(doc, "span", station.nom, "nom"), avec(doc, "span", station.phrase, "dit"));
  ligne.addEventListener("click", () => ouvrir(station.id));
  return ligne;
}

/**
 * Le bloc vivant : `lire` redit ce que la vue a lu, `racine` se pose sur l'accueil.
 * @param {Fabrique} doc @param {Gestes} gestes
 */
export function tenirBlocDeLaStation(doc, gestes) {
  const racine = poserBlocDeLaStation(doc);
  const corps = racine.children[1];
  /** @type {Lecture | undefined} */
  let lecture;
  /** @type {"repos" | "installation" | "reglages"} */
  let phase = "repos";
  let etape = 0;
  let prete = false;
  /** @type {{ refus: string, detail?: string } | undefined} */
  let refus;
  /** @type {{ refus: string, detail?: string } | undefined} */
  let refusDeLEtape;

  function etapeCourante() {
    const { nom, dit, geste } = /** @type {Etape} */ (gestes.etapes[etape]);
    const rendu = doc.createElement("div");
    rendu.className = "etape";
    rendu.dataset.etape = String(etape + 1);
    const enTete = avec(doc, "p", `Step ${etape + 1} of ${gestes.etapes.length} — ${nom}`, "dit");
    const actions = doc.createElement("p");
    actions.className = "champ";
    if (geste !== undefined) {
      actions.append(
        boutonAction(doc, geste.libelle, () => {
          refusDeLEtape = undefined;
          void Promise.resolve(geste.faire()).then(
            (rendue) => {
              refusDeLEtape = rendue ?? undefined;
              rendre();
            },
            () => {
              refusDeLEtape = { refus: "that step failed" };
              rendre();
            },
          );
        }),
      );
    }
    const dernier = etape === gestes.etapes.length - 1;
    actions.append(
      boutonAction(
        doc,
        dernier ? TERMINER : SUIVANT,
        () => {
          refusDeLEtape = undefined;
          if (dernier) {
            phase = "repos";
            prete = true;
          } else etape++;
          rendre();
        },
        { recommande: geste === undefined },
      ),
    );
    rendu.append(enTete, avec(doc, "p", dit), actions);
    if (refusDeLEtape !== undefined) rendu.append(lectureIndisponible(doc, refusDeLEtape.refus, refusDeLEtape.detail ?? ""));
    return rendu;
  }

  function installer() {
    refus = undefined;
    phase = "installation";
    rendre();
    void Promise.resolve(gestes.installer()).then(
      (rendu) => {
        if (rendu === undefined) {
          phase = gestes.etapes.length > 0 ? "reglages" : "repos";
          etape = 0;
          prete = gestes.etapes.length === 0;
        } else {
          phase = "repos";
          refus = rendu;
        }
        rendre();
      },
      () => {
        phase = "repos";
        refus = { refus: REFUS };
        rendre();
      },
    );
  }

  function sansStation() {
    const bouton = boutonAction(doc, INSTALLER, installer, { recommande: true });
    const rendu = [bouton];
    if (refus !== undefined) rendu.push(lectureIndisponible(doc, REFUS, [refus.refus, refus.detail ?? ""].filter(Boolean).join(" — ")));
    return rendu;
  }

  function installee(/** @type {UneStation} */ station, /** @type {readonly UneStation[]} */ autres) {
    const resume = doc.createElement("p");
    resume.className = "station-installee";
    resume.title = station.phrase;
    resume.append(avec(doc, "strong", station.nom), avec(doc, "span", station.phrase, "dit"));
    const rendu = [resume, boutonAction(doc, SA_PAGE, () => gestes.ouvrir(station.id), { recommande: true })];
    if (autres.length > 0) rendu.push(avec(doc, "h3", LES_AUTRES), ...autres.map((autre) => ligneDeStation(doc, autre, gestes.ouvrir)));
    return rendu;
  }

  function rendre() {
    corps.hidden = false;
    if (phase === "installation") {
      const dit = avec(doc, "p", INSTALLATION, "dit");
      dit.title = INSTALLATION_SURVOL;
      corps.replaceChildren(dit);
    } else if (phase === "reglages") corps.replaceChildren(etapeCourante());
    else if (lecture === undefined) corps.replaceChildren(avec(doc, "p", LECTURE, "dit"));
    else if (lecture.station === null) corps.replaceChildren(...(prete ? [avec(doc, "p", `${PRETE} — reading it…`, "dit")] : sansStation()));
    else corps.replaceChildren(...installee(lecture.station, lecture.autres ?? []));
  }

  return {
    racine,
    /** @param {Lecture | undefined} lue */
    lire(lue) {
      lecture = lue;
      if (lue?.station != null) prete = false;
      rendre();
    },
  };
}
