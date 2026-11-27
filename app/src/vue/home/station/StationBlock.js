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
// Il ne touche ni `document` ni le pont : la vue lui donne une fabrique (bricks.js), l'installation, les étapes des
// premiers réglages et l'ouverture d'une page de station.

import { buttonAction } from "../../bricks.js";
import { lineError } from "../../components/line-error/line-error.js";
import { RETRY, READ_OF, THIS_COMPUTER } from "../../lexicon.js";

/** @typedef {import("../../bricks.js").Fabrique} Fabrique */
// `version` : la version qui tourne et si elle est en retard, quand le statut de la station la dit (station-version.js).
/** @typedef {{ id: string, nom: string, phrase: string, version?: string }} OneStation */
/**
 * Ce que la vue a lu : indéfini, la lecture est en route ; `station` nulle, cet ordinateur n'en a pas ; sinon sa station
 * et les autres du chef.
 * @typedef {{ station: OneStation | null, autres?: readonly OneStation[] }} Reading
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

export const TITLE = "This computer's station";
export const INSTALLER = `Install ${THIS_COMPUTER}'s station`;
export const INSTALLATION = "installing the station…";
export const INSTALLATION_HOVER = "downloads the station, starts it, and connects it to GitHub and Max: it can take a couple of minutes";
export const REFUSAL = "the station could not be installed";
export { RETRY };
export const READING = READ_OF(`${THIS_COMPUTER}'s station`);
export const READY = "the station is ready";
export const ITS_PAGE = "Station settings";
export const THE_OTHERS = "Your other stations";
export const NEXT = "Next";
export const FINISH = "Done";

/** @param {Fabrique} doc @param {string} balise @param {string} text @param {string} [classe] */
function withIt(doc, balise, text, classe) {
  const pose = doc.createElement(balise);
  pose.textContent = text;
  if (classe !== undefined) pose.className = classe;
  return pose;
}

// La place du bloc : son titre et son corps, vide. La vue le pose sur l'accueil ; `tenirBlocDeLaStation` le remplit.
/** @param {Fabrique} doc */
export function setBlockOfTheStation(doc) {
  const root = doc.createElement("section");
  root.id = "accueil-bloc-station";
  root.className = "bloc-de-l-accueil";
  root.ariaLabel = TITLE;
  const body = doc.createElement("div");
  body.className = "liste";
  body.hidden = true;
  root.append(withIt(doc, "h2", TITLE), body);
  return root;
}

// Une station, en une ligne qui se clique : son nom, ce qu'elle dit, et sa page au bout du clic.
/** @param {Fabrique} doc @param {OneStation} station @param {(id: string) => void} open */
function lineOfStation(doc, station, open) {
  const line = doc.createElement("button");
  line.type = "button";
  line.className = "ligne";
  line.title = station.phrase;
  line.append(withIt(doc, "span", station.nom, "nom"), withIt(doc, "span", station.phrase, "dit"));
  line.addEventListener("click", () => open(station.id));
  return line;
}

/**
 * Le bloc vivant : `lire` redit ce que la vue a lu, `racine` se pose sur l'accueil.
 * @param {Fabrique} doc @param {Actions} stationActions
 */
export function holdBlockOfTheStation(doc, stationActions) {
  const root = setBlockOfTheStation(doc);
  const body = root.children[1];
  /** @type {Reading | undefined} */
  let reading;
  /** @type {"repos" | "installation" | "reglages"} */
  let phase = "repos";
  let step = 0;
  let ready = false;
  /** @type {{ refus: string, detail?: string } | undefined} */
  let refusal;
  /** @type {{ refus: string, detail?: string } | undefined} */
  let refusalOfTheStep;

  function stepCurrent() {
    const { nom: name, dit: said, geste: action } = /** @type {Step} */ (stationActions.etapes[step]);
    const rendered = doc.createElement("div");
    rendered.className = "etape";
    rendered.dataset.etape = String(step + 1);
    const inHead = withIt(doc, "p", `Step ${step + 1} of ${stationActions.etapes.length} — ${name}`, "dit");
    const actions = doc.createElement("p");
    actions.className = "champ";
    if (action !== undefined) {
      actions.append(
        buttonAction(doc, action.libelle, () => {
          refusalOfTheStep = undefined;
          void Promise.resolve(action.faire()).then(
            (renderedOne) => {
              refusalOfTheStep = renderedOne ?? undefined;
              render();
            },
            () => {
              refusalOfTheStep = { refus: "that step failed" };
              render();
            },
          );
        }),
      );
    }
    const last = step === stationActions.etapes.length - 1;
    actions.append(
      buttonAction(
        doc,
        last ? FINISH : NEXT,
        () => {
          refusalOfTheStep = undefined;
          if (last) {
            phase = "repos";
            ready = true;
          } else step++;
          render();
        },
        { recommande: action === undefined },
      ),
    );
    rendered.append(inHead, withIt(doc, "p", said), actions);
    if (refusalOfTheStep !== undefined) rendered.append(lineError(doc, refusalOfTheStep.refus, refusalOfTheStep.detail ?? ""));
    return rendered;
  }

  function installer() {
    refusal = undefined;
    phase = "installation";
    render();
    void Promise.resolve(stationActions.installer()).then(
      (rendered) => {
        if (rendered === undefined) {
          phase = stationActions.etapes.length > 0 ? "reglages" : "repos";
          step = 0;
          ready = stationActions.etapes.length === 0;
        } else {
          phase = "repos";
          refusal = rendered;
        }
        render();
      },
      () => {
        phase = "repos";
        refusal = { refus: REFUSAL };
        render();
      },
    );
  }

  function withoutStation() {
    const button = buttonAction(doc, INSTALLER, installer, { recommande: true });
    const rendered = [button];
    if (refusal !== undefined) rendered.push(lineError(doc, REFUSAL, [refusal.refus, refusal.detail ?? ""].filter(Boolean).join(" — ")));
    return rendered;
  }

  function installedOne(/** @type {OneStation} */ station, /** @type {readonly OneStation[]} */ others) {
    const resume = doc.createElement("p");
    resume.className = "station-installee";
    resume.title = station.phrase;
    resume.append(withIt(doc, "strong", station.nom), withIt(doc, "span", station.phrase, "dit"));
    const page = doc.createElement("p");
    page.className = "station-page";
    if (station.version !== undefined) page.append(withIt(doc, "span", station.version, "dit"));
    page.append(buttonAction(doc, ITS_PAGE, () => stationActions.ouvrir(station.id)));
    const rendered = [resume, page];
    if (others.length > 0) rendered.push(withIt(doc, "h3", THE_OTHERS), ...others.map((other) => lineOfStation(doc, other, stationActions.ouvrir)));
    return rendered;
  }

  function render() {
    body.hidden = false;
    if (phase === "installation") {
      const said = withIt(doc, "p", INSTALLATION, "dit");
      said.title = INSTALLATION_HOVER;
      body.replaceChildren(said);
    } else if (phase === "reglages") body.replaceChildren(stepCurrent());
    else if (reading === undefined) body.replaceChildren(withIt(doc, "p", READING, "dit"));
    else if (reading.station === null) body.replaceChildren(...(ready ? [withIt(doc, "p", `${READY} — it shows here once it has paired`, "dit")] : withoutStation()));
    else body.replaceChildren(...installedOne(reading.station, reading.autres ?? []));
  }

  return {
    racine: root,
    /** @param {Reading | undefined} readEntry */
    lire(readEntry) {
      reading = readEntry;
      if (readEntry?.station != null) ready = false;
      render();
    },
  };
}
