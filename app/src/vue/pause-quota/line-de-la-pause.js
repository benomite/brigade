// @ts-check
// La pause de quota GitHub du compte, à l'écran (ticket 3482) : ce n'est jamais une panne. Elle se dit une fois pour tout le
// compte, en tête de l'app — au-dessus de l'accueil comme d'un projet, au bureau comme sur le téléphone —, d'une couleur
// calme, avec une horloge : quelle limite, la reprise et dans combien de temps, et qu'il n'y a rien à faire. Le compte à
// rebours bouge, et la ligne tombe d'elle-même à la reprise. Chaque projet dit seulement qu'il est en pause pour la même
// raison : ni FAULT, ni « offline », ni « Start it on its computer » — sauf la panne qui ne vient pas de la pause (aucune station ne
// le sert, ou la sienne est vraiment arrêtée), qui garde sa ligne et son geste.
// La pause vient de `facts` (`pauseQuota`, pause-quota.ts) ; ce module ne touche ni `document` ni l'horloge : il reçoit une
// fabrique, l'élément de tête et l'instant.

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("./pause-quota.ts").PauseDuAccount} PauseDuAccount */

// Chaque limite, en clair.
/** @type {Record<string, string>} */
export const LIMITES = {
  core: "Paused: GitHub quota of the account reached (its core quota).",
  ecriture: "Paused: GitHub's write limit reached for the account.",
};
export const RIEN_A_FAIRE = "Nothing to do.";
export const RESUMPTION_INCONNUE = "When it resumes is not known yet.";
// Ce que chaque projet en dit : la même raison, sans la redire.
export const MEME_RAISON = "for the same reason: GitHub quota of the account";
export const PROJECT_EN_PAUSE = `Paused ${MEME_RAISON}.`;
// Les pannes que la pause n'explique pas : aucune station ne sert le projet, ou la sienne est vraiment arrêtée.
export const OUTAGES_OUTSIDE_PAUSE = ["aucune-station", "arretee"];

// L'heure, comme le reste de l'app (vue.js, `heureCourte`).
/** @param {string} instant */
const heure = (instant) => new Date(instant).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

// Dans combien de temps : « in 42 s », « in 7 min », « in 1 h 05 ».
/** @param {number} ms */
export function dansCombien(ms) {
  const secondes = Math.max(1, Math.ceil(ms / 1000));
  if (secondes < 60) return `in ${secondes} s`;
  const minutes = Math.ceil(secondes / 60);
  if (minutes < 60) return `in ${minutes} min`;
  return `in ${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}

// La pause tient-elle encore à cet instant : sa reprise est à venir, ou elle n'est pas sue.
/** @param {PauseDuAccount | undefined} pause @param {number} maintenant @returns {pause is PauseDuAccount} */
export const enCours = (pause, maintenant) => pause !== undefined && (pause.jusqua === null || Date.parse(pause.jusqua) > maintenant);

// La pause du compte, d'après celles que les projets portent : chacun la lit des mêmes stations, la dernière reprise
// l'emporte ; une reprise inconnue la rend inconnue.
/** @param {readonly (PauseDuAccount | undefined)[]} pauses @param {number} maintenant @returns {PauseDuAccount | undefined} */
export function pauseDesProjects(pauses, maintenant) {
  const tenues = pauses.filter(/** @returns {p is PauseDuAccount} */ (p) => enCours(p, maintenant));
  const inconnue = tenues.find(({ jusqua }) => jusqua === null);
  if (inconnue !== undefined) return inconnue;
  return [...tenues].sort((a, b) => Date.parse(b.jusqua ?? "") - Date.parse(a.jusqua ?? ""))[0];
}

// Ce que la ligne dit : la limite, puis la reprise et rien à faire.
/** @param {PauseDuAccount} pause @param {number} maintenant */
export function phrasesDeLaPause({ limite: limit, jusqua }, maintenant) {
  const resumption = jusqua === null ? RESUMPTION_INCONNUE : `Resumes at ${heure(jusqua)} (${dansCombien(Date.parse(jusqua) - maintenant)}).`;
  return { titre: LIMITES[limit] ?? LIMITES.core, reprise: resumption, rien: RIEN_A_FAIRE };
}

// L'horloge : un cadran dessiné en CSS (pause-quota.css), aucune police n'y est pour rien.
/** @param {Fabrique} doc */
function horloge(doc) {
  const cadran = doc.createElement("span");
  cadran.className = "horloge";
  cadran.ariaHidden = "true";
  return cadran;
}

// La ligne de tête, posée dans `element` : `suivre` lui donne la pause du compte à chaque lecture. Tant qu'elle tient, son
// compte à rebours bouge à chaque `battre` ; à la reprise, elle se retire et `auRetour` est appelé — le projet affiché se
// redessine sans sa ligne de pause.
/** @param {HTMLElement} element @param {Fabrique} doc @param {{ maintenant(): number, auRetour(): void }} options */
export function holdLaPause(element, doc, options) {
  /** @type {PauseDuAccount | undefined} */
  let pause;
  /** @type {HTMLElement | undefined} */
  let resumption;
  const poser = () => {
    const maintenant = options.maintenant();
    if (!enCours(pause, maintenant)) {
      const etait = pause !== undefined;
      pause = undefined;
      resumption = undefined;
      element.hidden = true;
      element.replaceChildren();
      if (etait) options.auRetour();
      return;
    }
    const { titre, reprise: quand, rien } = phrasesDeLaPause(pause, maintenant);
    if (resumption === undefined) {
      const line = doc.createElement("p");
      line.className = "bandeau-pause";
      line.role = "status";
      const fort = doc.createElement("strong");
      fort.textContent = titre;
      const calme = doc.createElement("span");
      calme.className = "rien-a-faire";
      calme.textContent = rien;
      /** @type {HTMLElement} */
      const ecrite = doc.createElement("span");
      ecrite.className = "reprise";
      resumption = ecrite;
      // Le texte coule d'un bloc à côté de l'horloge : sur un téléphone, il passe à la ligne sous lui-même.
      const texte = doc.createElement("span");
      texte.className = "texte";
      texte.append(fort, " ", ecrite, " ", calme);
      line.append(horloge(doc), texte);
      element.replaceChildren(line);
      element.hidden = false;
    }
    resumption.textContent = quand;
  };
  return {
    /** @param {PauseDuAccount | undefined} lue */
    suivre(lue) {
      const avant = JSON.stringify(pause);
      pause = lue;
      if (JSON.stringify(pause) !== avant) resumption = undefined;
      poser();
    },
    // Le compte à rebours : appelé chaque seconde.
    battre: poser,
  };
}

// Ce que le rail d'un projet dit pendant la pause : sa ligne de pause, à la place du rail bloqué et de l'attente de la file
// — sauf une panne que la pause n'explique pas, qui garde sa ligne et son geste.
/** @typedef {{ cause: string } | { illisible: string }} RailBlockedVu */
/** @typedef {{ raison: string }} WaitVue */
/**
 * @template {RailBlockedVu} R @template {WaitVue} A
 * `redemarre` : la station de cet ordinateur redémarre pour une mise à jour (ticket 3637) : « arrêtée » et « hors ligne » ne sont pas
 * des pannes, aucune alerte ne demande rien au chef — le projet le dit par « restarting » (onglet Stations).
 * @param {{ pauseQuota?: PauseDuAccount, railBloque?: R, attenteDuRail?: A }} tableau @param {number} maintenant @param {boolean} [redemarre]
 * @returns {{ railBloque?: R, attenteDuRail?: A, enPause: boolean }}
 */
export function ceQueLeRailDit({ pauseQuota, railBloque: railBlocked, attenteDuRail: waitDuRail }, maintenant, redemarre = false) {
  if (redemarre) {
    const relance = (/** @type {string} */ cause) => cause === "arretee" || cause === "hors-ligne";
    railBlocked = railBlocked !== undefined && "cause" in railBlocked && relance(railBlocked.cause) ? undefined : railBlocked;
    waitDuRail = waitDuRail !== undefined && relance(waitDuRail.raison) ? undefined : waitDuRail;
  }
  if (!enCours(pauseQuota, maintenant)) return { railBloque: railBlocked, attenteDuRail: waitDuRail, enPause: false };
  const outsidePause = (/** @type {string} */ raison) => OUTAGES_OUTSIDE_PAUSE.includes(raison);
  const blocked = railBlocked !== undefined && ("illisible" in railBlocked || outsidePause(railBlocked.cause)) ? railBlocked : undefined;
  const wait = waitDuRail !== undefined && outsidePause(waitDuRail.raison) ? waitDuRail : undefined;
  return { railBloque: blocked, attenteDuRail: wait, enPause: blocked === undefined && wait === undefined };
}

// La ligne du projet en pause, en tête de son rail : calme, avec l'horloge, sans geste.
/** @param {Fabrique} doc @param {boolean} enPause @returns {HTMLElement[]} */
export function lineDuProjectEnPause(doc, enPause) {
  if (!enPause) return [];
  const line = doc.createElement("p");
  line.className = "pause-du-projet";
  const phrase = doc.createElement("span");
  phrase.textContent = PROJECT_EN_PAUSE;
  line.append(horloge(doc), phrase);
  return [line];
}
