// @ts-check
// La page des résumés hebdomadaires (ticket 3263, épique 3251), ouverte par sa ligne « Weekly summary » parmi celles de
// tous les projets : ce que la cuisine de chaque projet a servi, semaine par semaine, écrit pour un product owner
// (runtime/src/resume-hebdomadaire/resume.ts). Par projet : le jour du résumé, réglé dans son dépôt ; ses résumés, le
// plus récent d'abord, et celui qu'on a choisi déplié — ses thèmes en intertitres, chaque ligne avec le lien de son
// ticket, puis l'autonomie de la semaine quand elle a été comptée, et pour finir ce qui attend le chef. Sous le résumé,
// « Publish as release notes » demande un tag de version, puis le publie.
//
// La vue n'y lit rien : le process principal lit et publie (resume-kitchen.ts). Le bloc garde ce qu'il a lu de chaque
// projet dix minutes. Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js).

import { survol } from "../briques.js";
import { DELAY, SENDBack, SANS_HUMAN, TITRE as TITRE_AUTONOMY } from "../autonomy/figures.js";
import { button } from "../composants/button/button.js";
import { lineError } from "../composants/line-error/line-error.js";
import { lineEmpty } from "../composants/line-empty/line-empty.js";
import { ditDuSetting, rangeeDeSetting } from "../composants/setting/setting.js";
import { ANNULER, READ_DE, NON_ATTEINT, PAS_ENCORE } from "../lexique.js";
import { niveauDe } from "../niveaux.js";
import { dureeEnClair } from "../project/delay.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("./resume-kitchen.ts").ResumesDuProject} Read */
/** @typedef {import("./resume-kitchen.ts").ResumeWeekly} Resume */
/** @typedef {import("./resume-kitchen.ts").LineDuResume} Line */
/** @typedef {import("./resume-kitchen.ts").RenduDuDay} RenduDuDay */
/** @typedef {import("./resume-kitchen.ts").RenduDeLaPublication} RenduDeLaPublication */
/** @typedef {import("../composants/setting/setting.js").Dit} Dit */

export const TITRE = "Weekly summary";
export const HOME = "what each kitchen served, week by week · release notes";
export const ATTENDU = "What each kitchen served, week by week. Publish a week as the release notes of a version.";
export const DAY = "Summary day";
export const DAY_POURQUOI = "The day each week the kitchen writes its summary of the seven days before, and mentions you on GitHub with it (UTC).";
// Les jours, dans l'ordre du runtime (runtime/src/resume-hebdomadaire/jour.ts, `JOURS_DU_RESUME`) — le test les compare.
export const JOURS = /** @type {const} */ (["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
/** @param {string} day */
export const dayDit = (day) => day.charAt(0).toUpperCase() + day.slice(1);
export const PAR_DEFAUT = "default";
// Les titres du runtime (resume.ts, `TITRE_ATTENTE`, `TITRE_AUTONOMIE`) — le test les compare.
export const WAIT = "Waiting for the chef";
export const AUTONOMY = TITRE_AUTONOMY;
export const RIEN_SERVED = "Nothing was served this week.";
export const RIEN_N_AWAITING = "Nothing is waiting for you.";
export const PUBLIER = "Publish as release notes";
export const PUBLIER_POURQUOI = "The summary becomes the GitHub release of a version tag of this project's repository. The tag must already exist there.";
export const TAG = "Version tag";
export const ENVOYER = "Publish";
export const PUBLICATION = "Publishing…";
export const OUVRIR_LA_RELEASE = "open the release";
export const AUCUN_PROJECT = "No project cooks on a station yet.";
export const SANS_READ = NON_ATTEINT("weekly summaries");
export const FRAICHEUR_MS = 10 * 60_000;
/** @param {{ weekStart: string, weekEnd: string }} resume */
export const semaineDite = ({ weekStart, weekEnd }) => `Week of ${weekStart} to ${weekEnd}`;

/** @param {number | null} part */
const pourcent = (part) => (part === null ? "unknown" : `${Math.round(part * 100)} %`);

/**
 * Les trois chiffres d'autonomie d'une semaine, en liste — ceux de la page des résumés, que l'écran « since you were away » reprend.
 * @param {Fabrique} doc
 * @param {NonNullable<Resume["autonomy"]>} a
 */
export function figuresDeLAutonomy(doc, a) {
  const figures = doc.createElement("ul");
  figures.className = "autonomie";
  for (const [name, dit] of [
    [SANS_HUMAN, `${a.servedWithoutHuman} of ${a.tickets} (${pourcent(a.shareWithoutHuman)})`],
    [DELAY, a.medianLeadTimeMs === null ? "unknown" : `${dureeEnClair(a.medianLeadTimeMs)} (median)`],
    [SENDBack, `${a.sentBack} of ${a.tickets} (${pourcent(a.shareSentBack)})`],
  ]) {
    const li = doc.createElement("li");
    const quoi = doc.createElement("span");
    quoi.className = "nom";
    quoi.textContent = name;
    const combien = doc.createElement("span");
    combien.className = "valeur";
    combien.textContent = dit;
    li.append(quoi, combien);
    figures.append(li);
  }
  return figures;
}

/**
 * Le bloc, son état, et `poser(projets)` qui le rend à jour — et lit chaque projet qui ne l'a pas été depuis dix minutes.
 * @param {Fabrique} doc
 * @param {{
 *   lire: (project: string) => Promise<Read>,
 *   changerJour: (project: string, day: string) => Promise<RenduDuDay>,
 *   publier: (project: string, resume: Resume, tag: string) => Promise<RenduDeLaPublication>,
 *   ouvrir: (url: string) => void,
 *   ouvrirProposition?: (url: string) => void,
 *   maintenant?: () => number,
 * }} options
 */
export function holdLesResumesHebdomadaires(doc, { lire, changerJour: changerDay, publier, ouvrir, ouvrirProposition, maintenant = Date.now }) {
  const element = doc.createElement("section");
  element.className = "resumes-hebdomadaires";
  element.ariaLabel = TITRE;
  element.dataset.bloc = "resumes-hebdomadaires";
  /** @type {string[]} */
  let projects = [];
  /** @type {Map<string, { le: number, lecture: Read | null }>} */
  const lus = new Map();
  /** @type {Map<string, string>} la semaine choisie de chaque projet */
  const choisies = new Map();
  /** @type {Map<string, Dit>} ce que le dernier changement du jour a rendu */
  const jours = new Map();
  /**
   * La publication de chaque résumé, par projet et semaine : le tag en cours de saisie, l'envoi, ou ce qu'il a rendu.
   * @type {Map<string, { tag: string } | { envoi: string } | { rendu: RenduDeLaPublication }>}
   */
  const publications = new Map();
  /** @type {any} le champ du tag posé par le dernier rendu */
  let saisie;
  /** @param {string} project @param {string} weekStart */
  const cle = (project, weekStart) => `${project}/${weekStart}`;

  /** @param {string} project */
  const lireProject = (project) => {
    lus.set(project, { le: maintenant(), lecture: lus.get(project)?.lecture ?? null });
    void Promise.resolve()
      .then(() => lire(project))
      .then(
        (lue) => (typeof lue === "object" && lue !== null && "resumes" in lue && "jour" in lue ? lue : { projet: project, jour: { sans: SANS_READ }, resumes: { sans: SANS_READ, detail: "the app gave no summaries" } }),
        (/** @type {unknown} */ error) => ({ projet: project, jour: { sans: SANS_READ }, resumes: { sans: SANS_READ, detail: error instanceof Error ? error.message : String(error) } }),
      )
      .then((read) => {
        lus.set(project, { le: lus.get(project)?.le ?? maintenant(), lecture: /** @type {Read} */ (read) });
        rendre();
      });
  };

  const rendre = () => {
    const titre = doc.createElement("h2");
    titre.textContent = TITRE;
    const attendu = doc.createElement("p");
    attendu.className = "attendu";
    attendu.textContent = ATTENDU;
    saisie = undefined;
    element.replaceChildren(titre, attendu, ...(projects.length === 0 ? [lineEmpty(doc, AUCUN_PROJECT)] : projects.map(duProject)));
    // La saisie du tag survit à un rendu : son champ garde le clavier.
    saisie?.focus();
  };

  /** @param {string} project */
  const duProject = (project) => {
    const section = doc.createElement("section");
    section.className = "resume-du-projet";
    section.ariaLabel = project;
    section.dataset.projet = project;
    const name = doc.createElement("h3");
    name.textContent = project;
    section.append(name);
    const read = lus.get(project)?.lecture ?? null;
    if (read === null) {
      section.append(lineEmpty(doc, READ_DE("the weekly summaries"), { classe: "lecture" }));
      return section;
    }
    section.append(rangeeDuDay(project, read.jour));
    const { resumes } = read;
    if ("sans" in resumes) {
      section.append(lineError(doc, resumes.sans, resumes.detail ?? ""));
      return section;
    }
    if (resumes.resumes.length === 0) section.append(lineEmpty(doc, PAS_ENCORE("weekly summary"), { detail: "None was written in the last weeks starting on the summary day." }));
    else {
      const choisie = resumes.resumes.find(({ weekStart }) => weekStart === choisies.get(project)) ?? resumes.resumes[0];
      if (resumes.resumes.length > 1) section.append(semaines(project, resumes.resumes, choisie));
      if (choisie !== undefined) section.append(resume(project, choisie));
    }
    if (resumes.illisibles.length > 0) {
      section.append(
        lineError(doc, `not read: ${resumes.illisibles.map(({ weekStart }) => `week of ${weekStart}`).join(", ")}`, resumes.illisibles.map(({ weekStart, detail }) => `${weekStart}: ${detail}`).join("\n"), {
          classe: "illisibles",
        }),
      );
    }
    return section;
  };

  /** @param {string} project @param {Read["jour"]} lu */
  const rangeeDuDay = (project, lu) => {
    const liste = doc.createElement("select");
    liste.ariaLabel = `${DAY}, ${project}`;
    if ("sans" in lu) {
      const empty = doc.createElement("option");
      empty.value = "";
      empty.textContent = "—";
      liste.append(empty);
    }
    for (const day of JOURS) {
      const option = doc.createElement("option");
      option.value = day;
      option.textContent = dayDit(day);
      liste.append(option);
    }
    liste.value = "sans" in lu ? "" : lu.jour;
    liste.addEventListener("change", () => changer(project, liste.value));
    const valeur = "sans" in lu ? [lineError(doc, lu.sans, lu.detail ?? "", { balise: "span" })] : [lu.pose ? dayDit(lu.jour) : `${dayDit(lu.jour)} (${PAR_DEFAUT})`];
    return rangeeDeSetting(doc, {
      nom: DAY,
      cle: "weeklySummaryDay",
      niveau: niveauDe(doc, "jour-du-resume"),
      valeur,
      controle: [liste, survol(doc, DAY_POURQUOI)],
      dessous: ditDuSetting(doc, jours.get(project), ouvrirProposition === undefined ? {} : { ouvrir: ouvrirProposition }),
      classe: "jour-du-resume",
    });
  };

  /** @param {string} project @param {string} day */
  const changer = (project, day) => {
    if (!(/** @type {readonly string[]} */ (JOURS).includes(day))) return;
    jours.set(project, { enCours: "proposing…" });
    rendre();
    void Promise.resolve()
      .then(() => changerDay(project, day))
      .then(
        (rendu) => (typeof rendu === "object" && rendu !== null ? rendu : { refus: "nothing was changed: the app gave no answer" }),
        (/** @type {unknown} */ error) => ({ refus: "nothing was changed", detail: error instanceof Error ? error.message : String(error) }),
      )
      .then((rendu) => {
        jours.set(project, "pr" in rendu ? { pr: rendu.pr, numero: rendu.numero, valeur: dayDit(rendu.jour) } : rendu);
        rendre();
      });
  };

  /** @param {string} project @param {Resume[]} resumes @param {Resume | undefined} choisie */
  const semaines = (project, resumes, choisie) => {
    const groupe = doc.createElement("div");
    groupe.className = "semaines";
    groupe.role = "group";
    groupe.ariaLabel = `weeks of ${project}`;
    for (const lu of resumes) {
      const choice = button(
        doc,
        `week of ${lu.weekStart}`,
        () => {
          choisies.set(project, lu.weekStart);
          rendre();
        },
        { sorte: "discret" },
      );
      choice.ariaPressed = String(lu === choisie);
      groupe.append(choice);
    }
    return groupe;
  };

  /** @param {string} titre */
  const intertitre = (titre) => {
    const h4 = doc.createElement("h4");
    h4.textContent = titre;
    return h4;
  };

  /** @param {Line[]} lines @param {string} classe */
  const liste = (lines, classe) => {
    const ul = doc.createElement("ul");
    ul.className = classe;
    for (const { text, ticketNumber, ticketUrl } of lines) {
      const li = doc.createElement("li");
      const texte = doc.createElement("span");
      texte.className = "texte";
      texte.textContent = text;
      const lien = button(doc, `#${ticketNumber}`, () => ouvrir(ticketUrl), { sorte: "discret" });
      lien.className = "ticket";
      lien.title = ticketUrl;
      lien.dataset.ticket = String(ticketNumber);
      li.append(texte, lien);
      ul.append(li);
    }
    return ul;
  };

  /** @param {string} project @param {Resume} lu */
  const resume = (project, lu) => {
    const article = doc.createElement("article");
    article.className = "resume";
    article.ariaLabel = semaineDite(lu);
    article.dataset.semaine = lu.weekStart;
    const tete = doc.createElement("p");
    tete.className = "semaine";
    tete.textContent = semaineDite(lu);
    article.append(tete);
    if (lu.themes.length === 0) article.append(lineEmpty(doc, RIEN_SERVED));
    for (const theme of lu.themes) article.append(intertitre(theme.title), liste(theme.lines, "lignes"));
    if (lu.autonomy !== undefined) article.append(intertitre(AUTONOMY), figuresDeLAutonomy(doc, lu.autonomy));
    article.append(intertitre(WAIT), lu.waiting.length === 0 ? lineEmpty(doc, RIEN_N_AWAITING) : liste(lu.waiting, "attentes"));
    article.append(publication(project, lu));
    return article;
  };

  /** @param {string} project @param {Resume} lu */
  const publication = (project, lu) => {
    const zone = doc.createElement("div");
    zone.className = "publication";
    const state = publications.get(cle(project, lu.weekStart));
    const offrir = () => {
      const action = button(doc, PUBLIER, () => {
        publications.set(cle(project, lu.weekStart), { tag: "" });
        rendre();
      });
      action.className = "publier";
      zone.append(action, survol(doc, PUBLIER_POURQUOI));
    };
    if (state === undefined) {
      offrir();
      return zone;
    }
    if ("tag" in state) {
      const name = doc.createElement("label");
      name.textContent = TAG;
      const champ = doc.createElement("input");
      champ.type = "text";
      champ.className = "tag";
      champ.ariaLabel = TAG;
      champ.placeholder = "v1.0.0";
      champ.value = state.tag;
      saisie = champ;
      champ.addEventListener("input", () => publications.set(cle(project, lu.weekStart), { tag: champ.value }));
      const envoyer = () => envoyerLaPublication(project, lu, champ.value);
      champ.addEventListener("keydown", (/** @type {{ key?: string }} */ event) => {
        if (event.key === "Enter") envoyer();
      });
      const envoi = button(doc, ENVOYER, envoyer, { sorte: "recommande" });
      envoi.className = "recommande envoyer";
      const renoncer = button(
        doc,
        ANNULER,
        () => {
          publications.delete(cle(project, lu.weekStart));
          rendre();
        },
        { sorte: "discret" },
      );
      zone.append(name, champ, envoi, renoncer, survol(doc, PUBLIER_POURQUOI));
      return zone;
    }
    if ("envoi" in state) {
      zone.append(lineEmpty(doc, PUBLICATION, { classe: "en-cours" }));
      return zone;
    }
    const { rendu } = state;
    if ("refus" in rendu) {
      zone.append(lineError(doc, rendu.refus, rendu.detail ?? "", { classe: "refus", alerte: true }));
      offrir();
      return zone;
    }
    const dit = doc.createElement("p");
    dit.className = "publiee" in rendu ? "publiee" : "deja-publiee";
    dit.role = "status";
    const phrase = doc.createElement("span");
    phrase.textContent = "publiee" in rendu ? rendu.publiee : rendu.dejaPubliee;
    const lien = button(doc, OUVRIR_LA_RELEASE, () => ouvrir(rendu.url), { sorte: "discret" });
    lien.title = rendu.url;
    dit.append(phrase, lien);
    zone.append(dit);
    return zone;
  };

  /** @param {string} project @param {Resume} lu @param {string} saisi */
  const envoyerLaPublication = (project, lu, saisi) => {
    const tag = saisi.trim();
    const ici = cle(project, lu.weekStart);
    if (tag === "" || !(publications.get(ici) !== undefined && "tag" in /** @type {object} */ (publications.get(ici)))) return;
    publications.set(ici, { envoi: tag });
    rendre();
    void Promise.resolve()
      .then(() => publier(project, lu, tag))
      .then(
        (rendu) => (typeof rendu === "object" && rendu !== null ? rendu : { refus: "nothing was published: the app gave no answer" }),
        (/** @type {unknown} */ error) => ({ refus: "nothing was published", detail: error instanceof Error ? error.message : String(error) }),
      )
      .then((rendu) => {
        publications.set(ici, { rendu });
        rendre();
      });
  };

  /** @param {string[]} noms */
  const poser = (noms) => {
    projects = [...noms];
    for (const project of projects) {
      const lu = lus.get(project);
      if (lu === undefined || maintenant() - lu.le >= FRAICHEUR_MS) lireProject(project);
    }
    rendre();
    return element;
  };

  return { element, poser };
}
