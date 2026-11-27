// @ts-check
// La ligne d'une version plus haute (le ticket 1528, épique 1525 ; une ligne, sans croix, depuis le ticket 2431), en tête
// de l'app sur un Mac, sous Windows et sur Android : « Brigade 1.4.0 is running — 1.5.0 is out », puis où en est la
// mise à jour de l'app installée — `downloading 1.5.0, 40 %`, `1.5.0 is downloaded: it installs at the next launch`,
// `installing 1.5.0 — the app relaunches itself…`, avec « Update now » tant qu'elle n'est pas lancée —, ou, quand elle ne se fait pas d'elle-même (une
// release sans `latest-mac.yml`, une mise à jour en échec, Android), le lien « Download » du paquet de ce poste — le
// .dmg, l'installeur .exe ou l'.apk —, jamais la page des releases. Elle reste tant que l'app ne tourne pas sur la
// dernière version : rien ne l'écarte. Sans version plus haute, rien n'est posé.
//
// Ce que la ligne montre vient du process principal — l'avis (update/opinion.ts) et l'état de la mise à jour
// (mise-a-jour/etat.ts) : la vue ne lit pas GitHub. Ce module ne touche pas `document` et n'ouvre rien : il reçoit de
// quoi créer un élément (bricks.js) et ce que chaque geste appelle, et rend un élément — ou rien.

import { buttonAction } from "../bricks.js";
import { PUT_A_DAY } from "../lexicon.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../../update/opinion.ts").Opinion} Opinion */
/** @typedef {import("../../update/opinion.ts").Hint} Hint */
/** @typedef {import("../../update/state.ts").StateOfUpdate} StateOfUpdate */

// Le premier lancement, par poste, au survol du lien : une app non signée ne s'ouvre pas d'un double-clic la première fois.
/** @type {Record<Hint, string>} */
export const HINTS = {
  "mac-right-click-open": "First open of this unsigned build: right-click Brigade, then Open.",
  "windows-more-info-run-anyway": "First open of this unsigned build: in SmartScreen, click More info, then Run anyway.",
};

// Le nom du paquet, au survol du lien : le dernier morceau de son adresse.
/** @param {string} url */
const packageOf = (url) => decodeURIComponent(url.slice(url.lastIndexOf("/") + 1));

// Deux versions par leurs nombres, comme update/flux.ts : ce qui suit `+` ne compte pas. Négatif : `a` est plus ancienne.
/** @param {string} a @param {string} b */
export function compare(a, b) {
  /** @param {string} version */
  const numbers = (version) => (version.split("+")[0] ?? "").split(".").map(Number);
  const [na, nb] = [numbers(a), numbers(b)];
  for (let i = 0; i < Math.max(na.length, nb.length); i++) {
    const gap = (na[i] ?? 0) - (nb[i] ?? 0);
    if (gap !== 0) return gap;
  }
  return 0;
}

// La version que la mise à jour de l'app installée a trouvée au-dessus de la sienne, quand elle en a une.
/** @param {StateOfUpdate | undefined} state */
const newOf = (state) => (state !== undefined && "nouvelle" in state ? state.nouvelle : undefined);

// Ce que la ligne dit : la version qui tourne, la dernière publiée, et ce que la mise à jour en fait. Rien quand l'app
// tourne sur la dernière version qu'elle connaît.
/** @param {Opinion | undefined} opinion @param {StateOfUpdate | undefined} state */
export function lineOfVersion(opinion, state) {
  const newEntry = newOf(state);
  const current = opinion?.courante ?? state?.version;
  const last = opinion === undefined ? newEntry : newEntry !== undefined && compare(newEntry, opinion.version) > 0 ? newEntry : opinion.version;
  if (current === undefined || last === undefined || compare(last, current) <= 0) return undefined;
  return { courante: current, derniere: last, nouvelle: newEntry };
}

// La ligne : la phrase, puis la suite que donne l'état de la mise à jour — son geste « Update now », ou le lien
// « Download » quand l'app ne se met pas à jour d'elle-même. `refus` : pourquoi « Update now » n'a pas installé.
// `demande` : « Update now » a été cliqué, et attend la fin du téléchargement pour installer.
// La ligne ne nomme jamais deux versions à venir (#4494) : la suite dit où en est la dernière ; une mise à jour qui
// porte une version moins haute (une plus haute est sortie depuis) n'en dit rien, et « Update now » va chercher la
// dernière.
/** @param {Fabrique} doc @param {{ courante: string, derniere: string, nouvelle?: string }} line @param {Opinion | undefined} opinion @param {StateOfUpdate | undefined} state @param {{ telecharger: (url: string) => void, installer: () => void }} gestes @param {string} [refusal] @param {boolean} [asked] */
export function setBanner(doc, line, opinion, state, { telecharger: fetchDownload, installer }, refusal, asked = false) {
  const root = doc.createElement("div");
  root.className = "bandeau-mise-a-jour";
  root.role = "status";
  const sentence = doc.createElement("p");
  sentence.className = "phrase";
  sentence.append(`Brigade ${line.courante} is running — ${line.derniere} is out`);
  const latest = line.derniere;
  const ofTheLatest = line.nouvelle === line.derniere;
  const then = asked ? " — it installs as soon as it is downloaded, then the app relaunches itself" : "";
  /** @type {string | undefined} */
  let suite;
  let link = false;
  if (state?.etat === "erreur") {
    suite = "it could not update itself";
    sentence.title = state.raison;
    link = true;
  } else if (state?.etat === "telechargement" || state?.etat === "disponible" || state?.etat === "prete" || state?.etat === "installation") {
    if (refusal !== undefined) suite = refusal;
    else if (!ofTheLatest) suite = undefined;
    else if (state.etat === "telechargement") suite = `downloading ${latest}, ${state.taille > 0 ? Math.floor((100 * state.recus) / state.taille) : 0} %${then}`;
    else if (state.etat === "disponible") suite = `downloading ${latest}${then}`;
    else if (state.etat === "prete") suite = `${latest} is downloaded: it installs at the next launch`;
    else suite = `installing ${latest} — the app relaunches itself…`;
  } else link = true;
  if (suite !== undefined) sentence.append(` · ${suite}`);
  if (link && opinion !== undefined) {
    // Un lien ne navigue pas dans l'app : le clic demande au pont de l'ouvrir dans le navigateur.
    const download = doc.createElement("a");
    download.className = "telecharger";
    download.href = opinion.url;
    download.textContent = "Download";
    download.title = [`download ${packageOf(opinion.url)} in your browser`, ...(opinion.indice === undefined ? [] : [HINTS[opinion.indice]])].join(" — ");
    download.addEventListener("click", (/** @type {{ preventDefault(): void }} */ event) => {
      event.preventDefault();
      fetchDownload(opinion.url);
    });
    sentence.append(" — ", download);
  }
  root.append(sentence);
  // « Update now » installe la dernière version : prête, elle s'installe ; en route, elle s'installe à la fin de son
  // téléchargement, sans second clic.
  if (!asked && (state?.etat === "prete" || state?.etat === "telechargement" || state?.etat === "disponible")) root.append(buttonAction(doc, PUT_A_DAY, installer, { recommande: true, prix: `closes the app's terminals, then relaunches it on ${latest}` }));
  return root;
}

// Ce que la vue tient de la ligne : le dernier avis reçu et le dernier état de la mise à jour. Chacun la repose ; elle
// disparaît quand l'app tourne sur la dernière version.
/** @param {HTMLElement} place @param {Fabrique} doc @param {{ telecharger: (url: string) => unknown, installer: () => Promise<{ refus: string } | undefined> | { refus: string } | undefined }} bridge */
export function holdBanner(place, doc, bridge) {
  /** @type {Opinion | undefined} */
  let opinion;
  /** @type {StateOfUpdate | undefined} */
  let state;
  /** @type {string | undefined} */
  let refusal;
  let asked = false;
  const set = () => {
    const line = lineOfVersion(opinion, state);
    place.hidden = line === undefined;
    place.replaceChildren(
      ...(line === undefined
        ? []
        : [
            setBanner(doc, line, opinion, state, {
              telecharger: (url) => void bridge.telecharger(url),
              installer: () => {
                asked = true;
                set();
                void Promise.resolve(bridge.installer()).then((rendered) => {
                  asked = false;
                  if (rendered !== undefined) refusal = rendered.refus;
                  set();
                });
              },
            }, refusal, asked),
          ]),
    );
  };
  return {
    // Un avis, ou rien : la dernière vérification n'a rien trouvé de plus haut.
    /** @param {Opinion | undefined | null} received */
    recevoir(received) {
      opinion = received ?? undefined;
      set();
    },
    // L'état de la mise à jour de l'app installée, à chaque changement.
    /** @param {StateOfUpdate | undefined | null} received */
    suivre(received) {
      state = received ?? undefined;
      refusal = undefined;
      set();
    },
  };
}
