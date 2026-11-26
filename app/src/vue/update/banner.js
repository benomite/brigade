// @ts-check
// La ligne d'une version plus haute (le ticket 1528, épique 1525 ; une ligne, sans croix, depuis le ticket 2431), en tête
// de l'app sur un Mac, sous Windows et sur Android : « Brigade 1.4.0 is running — 1.5.0 is out », puis où en est la
// mise à jour de l'app installée — `downloading it, 40 %`, `downloaded: it installs at the next launch` avec
// « Install now », `installing it — the app relaunches itself…` —, ou, quand elle ne se fait pas d'elle-même (une
// release sans `latest-mac.yml`, une mise à jour en échec, Android), le lien « Download » du paquet de ce poste — le
// .dmg, l'installeur .exe ou l'.apk —, jamais la page des releases. Elle reste tant que l'app ne tourne pas sur la
// dernière version : rien ne l'écarte. Sans version plus haute, rien n'est posé.
//
// Ce que la ligne montre vient du process principal — l'avis (update/opinion.ts) et l'état de la mise à jour
// (mise-a-jour/etat.ts) : la vue ne lit pas GitHub. Ce module ne touche pas `document` et n'ouvre rien : il reçoit de
// quoi créer un élément (briques.js) et ce que chaque geste appelle, et rend un élément — ou rien.

import { buttonAction } from "../briques.js";
import { METTRE_A_DAY } from "../lexique.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../update/opinion.ts").Opinion} Opinion */
/** @typedef {import("../../update/opinion.ts").Indice} Indice */
/** @typedef {import("../../update/state.ts").StateDeUpdate} StateDeUpdate */

// Le premier lancement, par poste, au survol du lien : une app non signée ne s'ouvre pas d'un double-clic la première fois.
/** @type {Record<Indice, string>} */
export const INDICES = {
  "mac-right-click-open": "First open of this unsigned build: right-click Brigade, then Open.",
  "windows-more-info-run-anyway": "First open of this unsigned build: in SmartScreen, click More info, then Run anyway.",
};

// Le nom du paquet, au survol du lien : le dernier morceau de son adresse.
/** @param {string} url */
const paquetDe = (url) => decodeURIComponent(url.slice(url.lastIndexOf("/") + 1));

// Deux versions par leurs nombres, comme update/flux.ts : ce qui suit `+` ne compte pas. Négatif : `a` est plus ancienne.
/** @param {string} a @param {string} b */
export function comparer(a, b) {
  /** @param {string} version */
  const nombres = (version) => (version.split("+")[0] ?? "").split(".").map(Number);
  const [na, nb] = [nombres(a), nombres(b)];
  for (let i = 0; i < Math.max(na.length, nb.length); i++) {
    const ecart = (na[i] ?? 0) - (nb[i] ?? 0);
    if (ecart !== 0) return ecart;
  }
  return 0;
}

// La version que la mise à jour de l'app installée a trouvée au-dessus de la sienne, quand elle en a une.
/** @param {StateDeUpdate | undefined} state */
const nouvelleDe = (state) => (state !== undefined && "nouvelle" in state ? state.nouvelle : undefined);

// Ce que la ligne dit : la version qui tourne, la dernière publiée, et ce que la mise à jour en fait. Rien quand l'app
// tourne sur la dernière version qu'elle connaît.
/** @param {Opinion | undefined} opinion @param {StateDeUpdate | undefined} state */
export function lineDeVersion(opinion, state) {
  const nouvelle = nouvelleDe(state);
  const courante = opinion?.courante ?? state?.version;
  const derniere = opinion === undefined ? nouvelle : nouvelle !== undefined && comparer(nouvelle, opinion.version) > 0 ? nouvelle : opinion.version;
  if (courante === undefined || derniere === undefined || comparer(derniere, courante) <= 0) return undefined;
  return { courante, derniere, nouvelle };
}

// La ligne : la phrase, puis la suite que donne l'état de la mise à jour — son geste « Install now », ou le lien
// « Download » quand l'app ne se met pas à jour d'elle-même. `refus` : pourquoi « Install now » n'a pas installé.
/** @param {Fabrique} doc @param {{ courante: string, derniere: string, nouvelle?: string }} line @param {Opinion | undefined} opinion @param {StateDeUpdate | undefined} state @param {{ telecharger: (url: string) => void, installer: () => void }} gestes @param {string} [refusal] */
export function poserBanner(doc, line, opinion, state, { telecharger, installer }, refusal) {
  const racine = doc.createElement("div");
  racine.className = "bandeau-mise-a-jour";
  racine.role = "status";
  const phrase = doc.createElement("p");
  phrase.className = "phrase";
  phrase.append(`Brigade ${line.courante} is running — ${line.derniere} is out`);
  // La version que la mise à jour porte, quand ce n'est pas la dernière (une plus haute est sortie depuis).
  const elle = line.nouvelle === undefined || line.nouvelle === line.derniere ? "it" : line.nouvelle;
  /** @type {string | undefined} */
  let suite;
  let lien = false;
  if (state?.etat === "telechargement") suite = `downloading ${elle}, ${state.taille > 0 ? Math.floor((100 * state.recus) / state.taille) : 0} %`;
  else if (state?.etat === "disponible") suite = `downloading ${elle}`;
  else if (state?.etat === "prete") suite = refusal ?? `${elle === "it" ? "it is" : `${elle} is`} downloaded: it installs at the next launch`;
  else if (state?.etat === "installation") suite = `installing ${elle} — the app relaunches itself…`;
  else if (state?.etat === "erreur") {
    suite = "it could not update itself";
    phrase.title = state.raison;
    lien = true;
  } else lien = true;
  if (suite !== undefined) phrase.append(` · ${suite}`);
  if (lien && opinion !== undefined) {
    // Un lien ne navigue pas dans l'app : le clic demande au pont de l'ouvrir dans le navigateur.
    const telechargement = doc.createElement("a");
    telechargement.className = "telecharger";
    telechargement.href = opinion.url;
    telechargement.textContent = "Download";
    telechargement.title = [`download ${paquetDe(opinion.url)} in your browser`, ...(opinion.indice === undefined ? [] : [INDICES[opinion.indice]])].join(" — ");
    telechargement.addEventListener("click", (/** @type {{ preventDefault(): void }} */ event) => {
      event.preventDefault();
      telecharger(opinion.url);
    });
    phrase.append(" — ", telechargement);
  }
  racine.append(phrase);
  if (state?.etat === "prete") racine.append(buttonAction(doc, METTRE_A_DAY, installer, { recommande: true, prix: "closes the app's terminals, then relaunches it on the new version" }));
  return racine;
}

// Ce que la vue tient de la ligne : le dernier avis reçu et le dernier état de la mise à jour. Chacun la repose ; elle
// disparaît quand l'app tourne sur la dernière version.
/** @param {HTMLElement} lieu @param {Fabrique} doc @param {{ telecharger: (url: string) => unknown, installer: () => Promise<{ refus: string } | undefined> | { refus: string } | undefined }} pont */
export function holdBanner(lieu, doc, pont) {
  /** @type {Opinion | undefined} */
  let opinion;
  /** @type {StateDeUpdate | undefined} */
  let state;
  /** @type {string | undefined} */
  let refusal;
  const poser = () => {
    const line = lineDeVersion(opinion, state);
    lieu.hidden = line === undefined;
    lieu.replaceChildren(
      ...(line === undefined
        ? []
        : [
            poserBanner(doc, line, opinion, state, {
              telecharger: (url) => void pont.telecharger(url),
              installer: () =>
                void Promise.resolve(pont.installer()).then((rendu) => {
                  if (rendu === undefined) return;
                  refusal = rendu.refus;
                  poser();
                }),
            }, refusal),
          ]),
    );
  };
  return {
    // Un avis, ou rien : la dernière vérification n'a rien trouvé de plus haut.
    /** @param {Opinion | undefined | null} recu */
    recevoir(recu) {
      opinion = recu ?? undefined;
      poser();
    },
    // L'état de la mise à jour de l'app installée, à chaque changement.
    /** @param {StateDeUpdate | undefined | null} recu */
    suivre(recu) {
      state = recu ?? undefined;
      refusal = undefined;
      poser();
    },
  };
}
