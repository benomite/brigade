// @ts-check
// Ce qui bloque un projet, sur sa page (ticket 1399, épique 1393) : tous ses blocages, tels que sa principale les
// publie (ticket 1394, `blocages` du suivi), une ligne chacun. Ce qui est bloqué en une phrase, pourquoi dessous ; le
// geste, quand l'app sait le faire, en bouton ; quand il se fait hors de l'app, un lien qui nomme la page exacte
// et l'ouvre. Ce qu'une commande a dit n'est jamais le message : il reste replié derrière « details ». Aucun
// blocage, aucune section. Ce module ne connaît aucun blocage : la vue lui donne les gestes qu'elle sait faire,
// par l'identifiant d'action que le runtime publie — un blocage dont l'app ne sait pas le geste se montre sans
// bouton, et le dit. Il ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js).

import { buttonAction, hover } from "../bricks.js";
import { lineEmpty } from "../components/line-empty/line-empty.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../../projects/request.ts").Blockage} Blockage */
// Un geste que l'app sait faire : son libellé et ce qu'il fait — ou, impossible pour l'instant, pourquoi en une ligne.
/** @typedef {{ libelle: string, faire: () => void } | { sans: string }} Action */

export const DETAILS = "details";
export const FAILURE_OF_SETUP = "setup";
export const HELP_OF_SETUP = "You can open the details, or ask the second.";
export const WITHOUT_ACTION = "this app cannot do it for you yet";

/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

// La page qu'un lien ouvre, nommée : son hôte et son chemin, sans `https://`, sans requête ni barre finale —
// « github.com/settings/personal-access-tokens ».
/** @param {string} url */
export function placeOf(url) {
  try {
    const { host, pathname } = new URL(url);
    return `${host}${pathname.replace(/\/+$/, "")}`;
  } catch {
    return url;
  }
}


/**
 * @param {Fabrique} doc @param {Blockage} blockage
 * @param {{ gestes: Readonly<Record<string, Action>>, ouvrir: (url: string) => void, deplies: ReadonlySet<string>, deplier: (id: string, opened: boolean) => void }} faire
 */
function line(doc, blockage, { gestes: actions, ouvrir: open, deplies: unfoldedOnes, deplier: unfold }) {
  const pose = created(doc, "li");
  pose.className = "blocage";
  pose.dataset.blocage = blockage.id;
  const message = created(doc, "p", blockage.message);
  message.className = "message";
  pose.append(message);
  // Le producteur qui n'a qu'une phrase la donne pour les deux : elle ne se dit qu'une fois.
  if (blockage.cause !== blockage.message) {
    const cause = created(doc, "p", blockage.cause);
    cause.className = "cause";
    pose.append(cause);
  }
  // Un échec du setup qu'aucun besoin connu n'explique : une ligne dit au chef ce qu'il peut faire.
  if (blockage.id === FAILURE_OF_SETUP) {
    const help = created(doc, "p", HELP_OF_SETUP);
    help.className = "aide-du-blocage";
    pose.append(help);
  }
  const action = blockage.action === undefined ? undefined : actions[blockage.action];
  if (action !== undefined || blockage.link !== undefined || blockage.action !== undefined) {
    const actionsOfBlockage = created(doc, "p");
    actionsOfBlockage.className = "gestes-du-blocage";
    if (action !== undefined && "faire" in action) actionsOfBlockage.append(buttonAction(doc, action.libelle, action.faire, { recommande: true }));
    else if (action !== undefined) {
      const without = lineEmpty(doc, action.sans, { classe: "sans-geste", balise: "span" });
      actionsOfBlockage.append(without);
    } else if (blockage.action !== undefined) {
      // Un geste que cette version de l'app ne connaît pas : pas de bouton qui ne ferait rien.
      const without = lineEmpty(doc, WITHOUT_ACTION, { classe: "sans-geste", balise: "span" });
      actionsOfBlockage.append(without, hover(doc, `the station names the gesture “${blockage.action}”, which this version of the app does not know`));
    }
    if (blockage.link !== undefined) {
      const url = blockage.link;
      const link = created(doc, "a", `open ${placeOf(url)}`);
      link.className = "lien-du-blocage";
      link.href = url;
      link.title = url;
      link.addEventListener("click", (/** @type {{ preventDefault(): void }} */ event) => {
        event.preventDefault();
        open(url);
      });
      actionsOfBlockage.append(link);
    }
    pose.append(actionsOfBlockage);
  }
  if (blockage.detail !== undefined) {
    // Replié, sauf si le chef l'a déplié : une relecture ne le referme pas.
    const details = created(doc, "details");
    if (unfoldedOnes.has(blockage.id)) details.open = true;
    details.addEventListener("toggle", () => unfold(blockage.id, details.open === true));
    details.append(created(doc, "summary", DETAILS), created(doc, "pre", blockage.detail));
    pose.append(details);
  }
  return pose;
}

