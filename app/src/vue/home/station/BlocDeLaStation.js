// @ts-check
// Le bloc de la station de cet ordinateur, sur l'accueil (ticket 2640, épique 2497) : le second des deux blocs de
// l'accueil (ticket 2638). Trois états :
//  - cet ordinateur n'a pas de station : un seul bouton, « Install this computer's station », et aucun autre réglage ;
//  - le bouton a été pressé : l'installation tourne, puis les premiers réglages se déroulent un à un, jusqu'à ce que la
//    station soit prête (un refus de l'installation se dit en une ligne, son détail au survol, et le bouton revient) ;
//  - la station est installée : sa carte (Home.dc.html, ticket 2912) — son nom, sa phrase, puis une seconde rangée avec « Station
//    settings », qui ouvre sa page — pas de bouton d'installation —, puis les autres stations du chef, chacune avec le sien.
// Vide de lecture, le bloc dit qu'il lit.
//
// Il ne touche ni `document` ni le pont : la vue lui donne une fabrique (briques.js), l'installation, les étapes des
// premiers réglages et l'ouverture d'une page de station.

import { buttonAction } from "../../briques.js";
import { lineError } from "../../composants/line-error/line-error.js";
import { REESSAYER, READ_DE, CET_ORDINATEUR } from "../../lexique.js";

/** @typedef {import("../../briques.js").Fabrique} Fabrique */
// `version` : la version qui tourne et si elle est en retard, quand le statut de la station la dit (station-version.js).
/** @typedef {{ id: string, nom: string, phrase: string, version?: string }} UneStation */
/**
 * Ce que la vue a lu : indéfini, la lecture est en route ; `station` nulle, cet ordinateur n'en a pas ; sinon sa station
 * et les autres du chef.
 * @typedef {{ station: UneStation | null, autres?: readonly UneStation[] }} Read
 */
/**
 * Un premier réglage. `geste` : ce que le chef y fait, s'il y a un geste — son libellé et ce qu'il rend (un refus en une
 * ligne, ou rien). Sans geste, l'étape se lit et se passe.
 * @typedef {{ nom: string, dit: string, geste?: { libelle: string, faire(): Promise<{ refus: string, detail?: string } | void> } }} Step
 */
/**
 * `installer` rend un refus en une ligne (son détail à part), ou rien quand la station est installée. `ouvrir` : la page
 * d'une station, par son id.
 * @typedef {{ installer(): Promise<{ refus: string, detail?: string } | void>, etapes: readonly Step[], ouvrir(id: string): void }} Actions
 */

export const TITRE = "This computer's station";
export const INSTALLER = `Install ${CET_ORDINATEUR}'s station`;
export const INSTALLATION = "installing the station…";
export const INSTALLATION_SURVOL = "downloads the station, starts it, and connects it to GitHub and Max: it can take a couple of minutes";
export const REFUSAL = "the station could not be installed";
export { REESSAYER };
export const READ = READ_DE(`${CET_ORDINATEUR}'s station`);
export const PRETE = "the station is ready";
export const SA_PAGE = "Station settings";
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
function lineDeStation(doc, station, ouvrir) {
  const line = doc.createElement("button");
  line.type = "button";
  line.className = "ligne";
  line.title = station.phrase;
  line.append(avec(doc, "span", station.nom, "nom"), avec(doc, "span", station.phrase, "dit"));
  line.addEventListener("click", () => ouvrir(station.id));
  return line;
}

/**
 * Le bloc vivant : `lire` redit ce que la vue a lu, `racine` se pose sur l'accueil.
 * @param {Fabrique} doc @param {Actions} stationActions
 */
export function holdBlocDeLaStation(doc, stationActions) {
  const racine = poserBlocDeLaStation(doc);
  const corps = racine.children[1];
  /** @type {Read | undefined} */
  let read;
  /** @type {"repos" | "installation" | "reglages"} */
  let phase = "repos";
  let step = 0;
  let prete = false;
  /** @type {{ refus: string, detail?: string } | undefined} */
  let refusal;
  /** @type {{ refus: string, detail?: string } | undefined} */
  let refusalDeLStep;

  function stepCourante() {
    const { nom: name, dit, geste: action } = /** @type {Step} */ (stationActions.etapes[step]);
    const rendu = doc.createElement("div");
    rendu.className = "etape";
    rendu.dataset.etape = String(step + 1);
    const enTete = avec(doc, "p", `Step ${step + 1} of ${stationActions.etapes.length} — ${name}`, "dit");
    const actions = doc.createElement("p");
    actions.className = "champ";
    if (action !== undefined) {
      actions.append(
        buttonAction(doc, action.libelle, () => {
          refusalDeLStep = undefined;
          void Promise.resolve(action.faire()).then(
            (rendue) => {
              refusalDeLStep = rendue ?? undefined;
              rendre();
            },
            () => {
              refusalDeLStep = { refus: "that step failed" };
              rendre();
            },
          );
        }),
      );
    }
    const dernier = step === stationActions.etapes.length - 1;
    actions.append(
      buttonAction(
        doc,
        dernier ? TERMINER : SUIVANT,
        () => {
          refusalDeLStep = undefined;
          if (dernier) {
            phase = "repos";
            prete = true;
          } else step++;
          rendre();
        },
        { recommande: action === undefined },
      ),
    );
    rendu.append(enTete, avec(doc, "p", dit), actions);
    if (refusalDeLStep !== undefined) rendu.append(lineError(doc, refusalDeLStep.refus, refusalDeLStep.detail ?? ""));
    return rendu;
  }

  function installer() {
    refusal = undefined;
    phase = "installation";
    rendre();
    void Promise.resolve(stationActions.installer()).then(
      (rendu) => {
        if (rendu === undefined) {
          phase = stationActions.etapes.length > 0 ? "reglages" : "repos";
          step = 0;
          prete = stationActions.etapes.length === 0;
        } else {
          phase = "repos";
          refusal = rendu;
        }
        rendre();
      },
      () => {
        phase = "repos";
        refusal = { refus: REFUSAL };
        rendre();
      },
    );
  }

  function sansStation() {
    const button = buttonAction(doc, INSTALLER, installer, { recommande: true });
    const rendu = [button];
    if (refusal !== undefined) rendu.push(lineError(doc, REFUSAL, [refusal.refus, refusal.detail ?? ""].filter(Boolean).join(" — ")));
    return rendu;
  }

  function installee(/** @type {UneStation} */ station, /** @type {readonly UneStation[]} */ autres) {
    const resume = doc.createElement("p");
    resume.className = "station-installee";
    resume.title = station.phrase;
    resume.append(avec(doc, "strong", station.nom), avec(doc, "span", station.phrase, "dit"));
    const page = doc.createElement("p");
    page.className = "station-page";
    if (station.version !== undefined) page.append(avec(doc, "span", station.version, "dit"));
    page.append(buttonAction(doc, SA_PAGE, () => stationActions.ouvrir(station.id)));
    const rendu = [resume, page];
    if (autres.length > 0) rendu.push(avec(doc, "h3", LES_AUTRES), ...autres.map((autre) => lineDeStation(doc, autre, stationActions.ouvrir)));
    return rendu;
  }

  function rendre() {
    corps.hidden = false;
    if (phase === "installation") {
      const dit = avec(doc, "p", INSTALLATION, "dit");
      dit.title = INSTALLATION_SURVOL;
      corps.replaceChildren(dit);
    } else if (phase === "reglages") corps.replaceChildren(stepCourante());
    else if (read === undefined) corps.replaceChildren(avec(doc, "p", READ, "dit"));
    else if (read.station === null) corps.replaceChildren(...(prete ? [avec(doc, "p", `${PRETE} — it shows here once it has paired`, "dit")] : sansStation()));
    else corps.replaceChildren(...installee(read.station, read.autres ?? []));
  }

  return {
    racine,
    /** @param {Read | undefined} lue */
    lire(lue) {
      read = lue;
      if (lue?.station != null) prete = false;
      rendre();
    },
  };
}
