// @ts-check
// La pause de quota GitHub du compte, à l'écran (ticket 3482) : ce n'est jamais une panne. Elle se dit une fois pour tout le
// compte, en tête de l'app — au-dessus de l'accueil comme d'un projet, au bureau comme sur le téléphone —, d'une couleur
// calme, avec une horloge : quelle limite, la reprise et dans combien de temps, et qu'il n'y a rien à faire. Le compte à
// rebours bouge, et la ligne tombe d'elle-même à la reprise. Chaque projet dit seulement qu'il est en pause pour la même
// raison : ni FAULT, ni « offline », ni « Start it on its computer » — sauf la panne qui ne vient pas de la pause (aucune station ne
// le sert, ou la sienne est vraiment arrêtée), qui garde sa ligne et son geste.
// La pause vient de `facts` (`pauseQuota`, pause-quota.ts) ; ce module ne touche ni `document` ni l'horloge : il reçoit une
// fabrique, l'élément de tête et l'instant.

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("./pause-quota.ts").PauseOfAccount} PauseOfAccount */

// Chaque limite, en clair.
/** @type {Record<string, string>} */
export const LIMITS = {
  core: "Paused: GitHub quota of the account reached (its core quota).",
  ecriture: "Paused: GitHub's write limit reached for the account.",
};
export const NOTHING_A_DO = "Nothing to do.";
export const RESUMPTION_UNKNOWN = "When it resumes is not known yet.";
// Ce que chaque projet en dit : la même raison, sans la redire.
export const SAME_REASON = "for the same reason: GitHub quota of the account";
export const PROJECT_IN_PAUSE = `Paused ${SAME_REASON}.`;
// Les pannes que la pause n'explique pas : aucune station ne sert le projet, ou la sienne est vraiment arrêtée.
export const OUTAGES_OUTSIDE_PAUSE = ["aucune-station", "arretee"];

// L'heure, comme le reste de l'app (vue.js, `heureCourte`).
/** @param {string} instant */
const hour = (instant) => new Date(instant).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

// Dans combien de temps : « in 42 s », « in 7 min », « in 1 h 05 ».
/** @param {number} ms */
export function inHowMany(ms) {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  if (seconds < 60) return `in ${seconds} s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `in ${minutes} min`;
  return `in ${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}

// La pause tient-elle encore à cet instant : sa reprise est à venir, ou elle n'est pas sue.
/** @param {PauseOfAccount | undefined} pause @param {number} now @returns {pause is PauseOfAccount} */
export const inProgress = (pause, now) => pause !== undefined && (pause.jusqua === null || Date.parse(pause.jusqua) > now);

// La pause du compte, d'après celles que les projets portent : chacun la lit des mêmes stations, la dernière reprise
// l'emporte ; une reprise inconnue la rend inconnue.
/** @param {readonly (PauseOfAccount | undefined)[]} pauses @param {number} now @returns {PauseOfAccount | undefined} */
export function pauseOfProjects(pauses, now) {
  const heldEntries = pauses.filter(/** @returns {p is PauseOfAccount} */ (p) => inProgress(p, now));
  const unknown = heldEntries.find(({ jusqua: until }) => until === null);
  if (unknown !== undefined) return unknown;
  return [...heldEntries].sort((a, b) => Date.parse(b.jusqua ?? "") - Date.parse(a.jusqua ?? ""))[0];
}

// Ce que la ligne dit : la limite, puis la reprise et rien à faire.
/** @param {PauseOfAccount} pause @param {number} now */
export function sentencesOfThePause({ limite: limit, jusqua: until }, now) {
  const resumption = until === null ? RESUMPTION_UNKNOWN : `Resumes at ${hour(until)} (${inHowMany(Date.parse(until) - now)}).`;
  return { titre: LIMITS[limit] ?? LIMITS.core, reprise: resumption, rien: NOTHING_A_DO };
}

// L'horloge : un cadran dessiné en CSS (pause-quota.css), aucune police n'y est pour rien.
/** @param {Fabrique} doc */
function clock(doc) {
  const dial = doc.createElement("span");
  dial.className = "horloge";
  dial.ariaHidden = "true";
  return dial;
}

// La ligne de tête, posée dans `element` : `suivre` lui donne la pause du compte à chaque lecture. Tant qu'elle tient, son
// compte à rebours bouge à chaque `battre` ; à la reprise, elle se retire et `auRetour` est appelé — le projet affiché se
// redessine sans sa ligne de pause.
/** @param {HTMLElement} element @param {Fabrique} doc @param {{ maintenant(): number, auRetour(): void }} options */
export function holdThePause(element, doc, options) {
  /** @type {PauseOfAccount | undefined} */
  let pause;
  /** @type {HTMLElement | undefined} */
  let resumption;
  const set = () => {
    const now = options.maintenant();
    if (!inProgress(pause, now)) {
      const was = pause !== undefined;
      pause = undefined;
      resumption = undefined;
      element.hidden = true;
      element.replaceChildren();
      if (was) options.auRetour();
      return;
    }
    const { titre: title, reprise: when, rien: nothing } = sentencesOfThePause(pause, now);
    if (resumption === undefined) {
      const line = doc.createElement("p");
      line.className = "bandeau-pause";
      line.role = "status";
      const fort = doc.createElement("strong");
      fort.textContent = title;
      const calm = doc.createElement("span");
      calm.className = "rien-a-faire";
      calm.textContent = nothing;
      /** @type {HTMLElement} */
      const writtenOne = doc.createElement("span");
      writtenOne.className = "reprise";
      resumption = writtenOne;
      // Le texte coule d'un bloc à côté de l'horloge : sur un téléphone, il passe à la ligne sous lui-même.
      const text = doc.createElement("span");
      text.className = "texte";
      text.append(fort, " ", writtenOne, " ", calm);
      line.append(clock(doc), text);
      element.replaceChildren(line);
      element.hidden = false;
    }
    resumption.textContent = when;
  };
  return {
    /** @param {PauseOfAccount | undefined} readEntry */
    suivre(readEntry) {
      const before = JSON.stringify(pause);
      pause = readEntry;
      if (JSON.stringify(pause) !== before) resumption = undefined;
      set();
    },
    // Le compte à rebours : appelé chaque seconde.
    battre: set,
  };
}

// Ce que le rail d'un projet dit pendant la pause : sa ligne de pause, à la place du rail bloqué et de l'attente de la file
// — sauf une panne que la pause n'explique pas, qui garde sa ligne et son geste.
/** @typedef {{ cause: string } | { illisible: string }} RailBlockedSeen */
/** @typedef {{ raison: string }} WaitVue */
/**
 * @template {RailBlockedSeen} R @template {WaitVue} A
 * `redemarre` : la station de cet ordinateur redémarre pour une mise à jour (ticket 3637) : « arrêtée » et « hors ligne » ne sont pas
 * des pannes, aucune alerte ne demande rien au chef — le projet le dit par « restarting » (onglet Stations).
 * @param {{ pauseQuota?: PauseOfAccount, railBloque?: R, attenteDuRail?: A }} tableau @param {number} now @param {boolean} [restarts]
 * @returns {{ railBloque?: R, attenteDuRail?: A, enPause: boolean }}
 */
export function whatTheRailSays({ pauseQuota, railBloque: railBlocked, attenteDuRail: waitOfRail }, now, restarts = false) {
  if (restarts) {
    const relaunch = (/** @type {string} */ cause) => cause === "arretee" || cause === "hors-ligne";
    railBlocked = railBlocked !== undefined && "cause" in railBlocked && relaunch(railBlocked.cause) ? undefined : railBlocked;
    waitOfRail = waitOfRail !== undefined && relaunch(waitOfRail.raison) ? undefined : waitOfRail;
  }
  if (!inProgress(pauseQuota, now)) return { railBloque: railBlocked, attenteDuRail: waitOfRail, enPause: false };
  const outsidePause = (/** @type {string} */ reason) => OUTAGES_OUTSIDE_PAUSE.includes(reason);
  const blocked = railBlocked !== undefined && ("illisible" in railBlocked || outsidePause(railBlocked.cause)) ? railBlocked : undefined;
  const wait = waitOfRail !== undefined && outsidePause(waitOfRail.raison) ? waitOfRail : undefined;
  return { railBloque: blocked, attenteDuRail: wait, enPause: blocked === undefined && wait === undefined };
}

// La ligne du projet en pause, en tête de son rail : calme, avec l'horloge, sans geste.
/** @param {Fabrique} doc @param {boolean} inPause @returns {HTMLElement[]} */
export function lineOfProjectInPause(doc, inPause) {
  if (!inPause) return [];
  const line = doc.createElement("p");
  line.className = "pause-du-projet";
  const sentence = doc.createElement("span");
  sentence.textContent = PROJECT_IN_PAUSE;
  line.append(clock(doc), sentence);
  return [line];
}
