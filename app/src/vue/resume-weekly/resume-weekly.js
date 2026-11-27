// @ts-check
// La page des résumés hebdomadaires (ticket 3263, épique 3251), ouverte par sa ligne « Weekly summary » parmi celles de
// tous les projets : ce que la cuisine de chaque projet a servi, semaine par semaine, écrit pour un product owner
// (runtime/src/resume-hebdomadaire/resume.ts). Par projet : le jour du résumé, réglé dans son dépôt ; ses résumés, le
// plus récent d'abord, et celui qu'on a choisi déplié — ses thèmes en intertitres, chaque ligne avec le lien de son
// ticket, puis l'autonomie de la semaine quand elle a été comptée, et pour finir ce qui attend le chef. Sous le résumé,
// « Publish as release notes » demande un tag de version, puis le publie.
//
// La vue n'y lit rien : le process principal lit et publie (resume-kitchen.ts). Le bloc garde ce qu'il a lu de chaque
// projet dix minutes. Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js).

import { hover } from "../bricks.js";
import { DELAY, SEND_BACK, WITHOUT_HUMAN, TITLE as TITLE_AUTONOMY } from "../autonomy/figures.js";
import { button } from "../components/button/button.js";
import { lineError } from "../components/line-error/line-error.js";
import { lineEmpty } from "../components/line-empty/line-empty.js";
import { saysOfSetting, rowOfSetting } from "../components/setting/setting.js";
import { CANCEL, READ_OF, NOT_REACHED, NOT_STILL } from "../lexicon.js";
import { levelOf } from "../levels.js";
import { durationInClear } from "../project/delay.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("./resume-kitchen.ts").ResumesOfProject} Reading */
/** @typedef {import("./resume-kitchen.ts").ResumeWeekly} Resume */
/** @typedef {import("./resume-kitchen.ts").LineOfResume} Line */
/** @typedef {import("./resume-kitchen.ts").RenderedOfDay} RenderedOfDay */
/** @typedef {import("./resume-kitchen.ts").RenderedOfThePublication} RenderedOfThePublication */
/** @typedef {import("../components/setting/setting.js").Says} Says */

export const TITLE = "Weekly summary";
export const HOME = "what each kitchen served, week by week · release notes";
export const EXPECTED = "What each kitchen served, week by week. Publish a week as the release notes of a version.";
export const DAY = "Summary day";
export const DAY_WHY = "The day each week the kitchen writes its summary of the seven days before, and mentions you on GitHub with it (UTC).";
// Les jours, dans l'ordre du runtime (runtime/src/resume-hebdomadaire/jour.ts, `JOURS_DU_RESUME`) — le test les compare.
export const DAYS = /** @type {const} */ (["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
/** @param {string} day */
export const daySays = (day) => day.charAt(0).toUpperCase() + day.slice(1);
export const BY_DEFAULT = "default";
// Les titres du runtime (resume.ts, `TITRE_ATTENTE`, `TITRE_AUTONOMIE`) — le test les compare.
export const WAIT = "Waiting for the chef";
export const AUTONOMY = TITLE_AUTONOMY;
export const NOTHING_SERVED = "Nothing was served this week.";
export const NOTHING_N_AWAITING = "Nothing is waiting for you.";
export const PUBLISH = "Publish as release notes";
export const PUBLISH_WHY = "The summary becomes the GitHub release of a version tag of this project's repository. The tag must already exist there.";
export const TAG = "Version tag";
export const SEND = "Publish";
export const PUBLICATION = "Publishing…";
export const OPEN_THE_RELEASE = "open the release";
export const NO_PROJECT = "No project cooks on a station yet.";
export const WITHOUT_READ = NOT_REACHED("weekly summaries");
export const FRESHNESS_MS = 10 * 60_000;
/** @param {{ weekStart: string, weekEnd: string }} resume */
export const weekSaid = ({ weekStart, weekEnd }) => `Week of ${weekStart} to ${weekEnd}`;

/** @param {number | null} part */
const percent = (part) => (part === null ? "unknown" : `${Math.round(part * 100)} %`);

/**
 * Les trois chiffres d'autonomie d'une semaine, en liste — ceux de la page des résumés, que l'écran « since you were away » reprend.
 * @param {Fabrique} doc
 * @param {NonNullable<Resume["autonomy"]>} a
 */
export function figuresOfTheAutonomy(doc, a) {
  const figures = doc.createElement("ul");
  figures.className = "autonomie";
  for (const [name, said] of [
    [WITHOUT_HUMAN, `${a.servedWithoutHuman} of ${a.tickets} (${percent(a.shareWithoutHuman)})`],
    [DELAY, a.medianLeadTimeMs === null ? "unknown" : `${durationInClear(a.medianLeadTimeMs)} (median)`],
    [SEND_BACK, `${a.sentBack} of ${a.tickets} (${percent(a.shareSentBack)})`],
  ]) {
    const li = doc.createElement("li");
    const what = doc.createElement("span");
    what.className = "nom";
    what.textContent = name;
    const howMany = doc.createElement("span");
    howMany.className = "valeur";
    howMany.textContent = said;
    li.append(what, howMany);
    figures.append(li);
  }
  return figures;
}

/**
 * Le bloc, son état, et `poser(projets)` qui le rend à jour — et lit chaque projet qui ne l'a pas été depuis dix minutes.
 * @param {Fabrique} doc
 * @param {{
 *   lire: (project: string) => Promise<Reading>,
 *   changerJour: (project: string, day: string) => Promise<RenderedOfDay>,
 *   publier: (project: string, resume: Resume, tag: string) => Promise<RenderedOfThePublication>,
 *   ouvrir: (url: string) => void,
 *   ouvrirProposition?: (url: string) => void,
 *   maintenant?: () => number,
 * }} options
 */
export function holdTheResumesWeekly(doc, { lire: read, changerJour: changeDay, publier: publish, ouvrir: open, ouvrirProposition: openProposal, maintenant: now = Date.now }) {
  const element = doc.createElement("section");
  element.className = "resumes-hebdomadaires";
  element.ariaLabel = TITLE;
  element.dataset.bloc = "resumes-hebdomadaires";
  /** @type {string[]} */
  let projects = [];
  /** @type {Map<string, { le: number, lecture: Reading | null }>} */
  const readOnes = new Map();
  /** @type {Map<string, string>} la semaine choisie de chaque projet */
  const chosen = new Map();
  /** @type {Map<string, Says>} ce que le dernier changement du jour a rendu */
  const days = new Map();
  /**
   * La publication de chaque résumé, par projet et semaine : le tag en cours de saisie, l'envoi, ou ce qu'il a rendu.
   * @type {Map<string, { tag: string } | { envoi: string } | { rendu: RenderedOfThePublication }>}
   */
  const publications = new Map();
  /** @type {any} le champ du tag posé par le dernier rendu */
  let input;
  /** @param {string} project @param {string} weekStart */
  const key = (project, weekStart) => `${project}/${weekStart}`;

  /** @param {string} project */
  const readProject = (project) => {
    readOnes.set(project, { le: now(), lecture: readOnes.get(project)?.lecture ?? null });
    void Promise.resolve()
      .then(() => read(project))
      .then(
        (readEntry) => (typeof readEntry === "object" && readEntry !== null && "resumes" in readEntry && "jour" in readEntry ? readEntry : { projet: project, jour: { sans: WITHOUT_READ }, resumes: { sans: WITHOUT_READ, detail: "the app gave no summaries" } }),
        (/** @type {unknown} */ error) => ({ projet: project, jour: { sans: WITHOUT_READ }, resumes: { sans: WITHOUT_READ, detail: error instanceof Error ? error.message : String(error) } }),
      )
      .then((reading) => {
        readOnes.set(project, { le: readOnes.get(project)?.le ?? now(), lecture: /** @type {Reading} */ (reading) });
        render();
      });
  };

  const render = () => {
    const title = doc.createElement("h2");
    title.textContent = TITLE;
    const expected = doc.createElement("p");
    expected.className = "attendu";
    expected.textContent = EXPECTED;
    input = undefined;
    element.replaceChildren(title, expected, ...(projects.length === 0 ? [lineEmpty(doc, NO_PROJECT)] : projects.map(ofProject)));
    // La saisie du tag survit à un rendu : son champ garde le clavier.
    input?.focus();
  };

  /** @param {string} project */
  const ofProject = (project) => {
    const section = doc.createElement("section");
    section.className = "resume-du-projet";
    section.ariaLabel = project;
    section.dataset.projet = project;
    const name = doc.createElement("h3");
    name.textContent = project;
    section.append(name);
    const reading = readOnes.get(project)?.lecture ?? null;
    if (reading === null) {
      section.append(lineEmpty(doc, READ_OF("the weekly summaries"), { classe: "lecture" }));
      return section;
    }
    section.append(rowOfDay(project, reading.jour));
    const { resumes } = reading;
    if ("sans" in resumes) {
      section.append(lineError(doc, resumes.sans, resumes.detail ?? ""));
      return section;
    }
    if (resumes.resumes.length === 0) section.append(lineEmpty(doc, NOT_STILL("weekly summary"), { detail: "None was written in the last weeks starting on the summary day." }));
    else {
      const chosenOne = resumes.resumes.find(({ weekStart }) => weekStart === chosen.get(project)) ?? resumes.resumes[0];
      if (resumes.resumes.length > 1) section.append(weeks(project, resumes.resumes, chosenOne));
      if (chosenOne !== undefined) section.append(resume(project, chosenOne));
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

  /** @param {string} project @param {Reading["jour"]} readOne */
  const rowOfDay = (project, readOne) => {
    const list = doc.createElement("select");
    list.ariaLabel = `${DAY}, ${project}`;
    if ("sans" in readOne) {
      const empty = doc.createElement("option");
      empty.value = "";
      empty.textContent = "—";
      list.append(empty);
    }
    for (const day of DAYS) {
      const option = doc.createElement("option");
      option.value = day;
      option.textContent = daySays(day);
      list.append(option);
    }
    list.value = "sans" in readOne ? "" : readOne.jour;
    list.addEventListener("change", () => change(project, list.value));
    const value = "sans" in readOne ? [lineError(doc, readOne.sans, readOne.detail ?? "", { balise: "span" })] : [readOne.pose ? daySays(readOne.jour) : `${daySays(readOne.jour)} (${BY_DEFAULT})`];
    return rowOfSetting(doc, {
      nom: DAY,
      cle: "weeklySummaryDay",
      niveau: levelOf(doc, "jour-du-resume"),
      valeur: value,
      controle: [list, hover(doc, DAY_WHY)],
      dessous: saysOfSetting(doc, days.get(project), openProposal === undefined ? {} : { ouvrir: openProposal }),
      classe: "jour-du-resume",
    });
  };

  /** @param {string} project @param {string} day */
  const change = (project, day) => {
    if (!(/** @type {readonly string[]} */ (DAYS).includes(day))) return;
    days.set(project, { enCours: "proposing…" });
    render();
    void Promise.resolve()
      .then(() => changeDay(project, day))
      .then(
        (rendered) => (typeof rendered === "object" && rendered !== null ? rendered : { refus: "nothing was changed: the app gave no answer" }),
        (/** @type {unknown} */ error) => ({ refus: "nothing was changed", detail: error instanceof Error ? error.message : String(error) }),
      )
      .then((rendered) => {
        days.set(project, "pr" in rendered ? { pr: rendered.pr, numero: rendered.numero, valeur: daySays(rendered.jour) } : rendered);
        render();
      });
  };

  /** @param {string} project @param {Resume[]} resumes @param {Resume | undefined} chosenOne */
  const weeks = (project, resumes, chosenOne) => {
    const group = doc.createElement("div");
    group.className = "semaines";
    group.role = "group";
    group.ariaLabel = `weeks of ${project}`;
    for (const readOne of resumes) {
      const choice = button(
        doc,
        `week of ${readOne.weekStart}`,
        () => {
          chosen.set(project, readOne.weekStart);
          render();
        },
        { sorte: "discret" },
      );
      choice.ariaPressed = String(readOne === chosenOne);
      group.append(choice);
    }
    return group;
  };

  /** @param {string} title */
  const subheading = (title) => {
    const h4 = doc.createElement("h4");
    h4.textContent = title;
    return h4;
  };

  /** @param {Line[]} lines @param {string} classe */
  const list = (lines, classe) => {
    const ul = doc.createElement("ul");
    ul.className = classe;
    for (const { text, ticketNumber, ticketUrl } of lines) {
      const li = doc.createElement("li");
      const wording = doc.createElement("span");
      wording.className = "texte";
      wording.textContent = text;
      const link = button(doc, `#${ticketNumber}`, () => open(ticketUrl), { sorte: "discret" });
      link.className = "ticket";
      link.title = ticketUrl;
      link.dataset.ticket = String(ticketNumber);
      li.append(wording, link);
      ul.append(li);
    }
    return ul;
  };

  /** @param {string} project @param {Resume} readOne */
  const resume = (project, readOne) => {
    const article = doc.createElement("article");
    article.className = "resume";
    article.ariaLabel = weekSaid(readOne);
    article.dataset.semaine = readOne.weekStart;
    const head = doc.createElement("p");
    head.className = "semaine";
    head.textContent = weekSaid(readOne);
    article.append(head);
    if (readOne.themes.length === 0) article.append(lineEmpty(doc, NOTHING_SERVED));
    for (const theme of readOne.themes) article.append(subheading(theme.title), list(theme.lines, "lignes"));
    if (readOne.autonomy !== undefined) article.append(subheading(AUTONOMY), figuresOfTheAutonomy(doc, readOne.autonomy));
    article.append(subheading(WAIT), readOne.waiting.length === 0 ? lineEmpty(doc, NOTHING_N_AWAITING) : list(readOne.waiting, "attentes"));
    article.append(publication(project, readOne));
    return article;
  };

  /** @param {string} project @param {Resume} readOne */
  const publication = (project, readOne) => {
    const zone = doc.createElement("div");
    zone.className = "publication";
    const state = publications.get(key(project, readOne.weekStart));
    const offer = () => {
      const action = button(doc, PUBLISH, () => {
        publications.set(key(project, readOne.weekStart), { tag: "" });
        render();
      });
      action.className = "publier";
      zone.append(action, hover(doc, PUBLISH_WHY));
    };
    if (state === undefined) {
      offer();
      return zone;
    }
    if ("tag" in state) {
      const name = doc.createElement("label");
      name.textContent = TAG;
      const field = doc.createElement("input");
      field.type = "text";
      field.className = "tag";
      field.ariaLabel = TAG;
      field.placeholder = "v1.0.0";
      field.value = state.tag;
      input = field;
      field.addEventListener("input", () => publications.set(key(project, readOne.weekStart), { tag: field.value }));
      const send = () => sendThePublication(project, readOne, field.value);
      field.addEventListener("keydown", (/** @type {{ key?: string }} */ event) => {
        if (event.key === "Enter") send();
      });
      const sending = button(doc, SEND, send, { sorte: "recommande" });
      sending.className = "recommande envoyer";
      const giveUp = button(
        doc,
        CANCEL,
        () => {
          publications.delete(key(project, readOne.weekStart));
          render();
        },
        { sorte: "discret" },
      );
      zone.append(name, field, sending, giveUp, hover(doc, PUBLISH_WHY));
      return zone;
    }
    if ("envoi" in state) {
      zone.append(lineEmpty(doc, PUBLICATION, { classe: "en-cours" }));
      return zone;
    }
    const { rendu: rendered } = state;
    if ("refus" in rendered) {
      zone.append(lineError(doc, rendered.refus, rendered.detail ?? "", { classe: "refus", alerte: true }));
      offer();
      return zone;
    }
    const said = doc.createElement("p");
    said.className = "publiee" in rendered ? "publiee" : "deja-publiee";
    said.role = "status";
    const sentence = doc.createElement("span");
    sentence.textContent = "publiee" in rendered ? rendered.publiee : rendered.dejaPubliee;
    const link = button(doc, OPEN_THE_RELEASE, () => open(rendered.url), { sorte: "discret" });
    link.title = rendered.url;
    said.append(sentence, link);
    zone.append(said);
    return zone;
  };

  /** @param {string} project @param {Resume} readOne @param {string} typed */
  const sendThePublication = (project, readOne, typed) => {
    const tag = typed.trim();
    const here = key(project, readOne.weekStart);
    if (tag === "" || !(publications.get(here) !== undefined && "tag" in /** @type {object} */ (publications.get(here)))) return;
    publications.set(here, { envoi: tag });
    render();
    void Promise.resolve()
      .then(() => publish(project, readOne, tag))
      .then(
        (rendered) => (typeof rendered === "object" && rendered !== null ? rendered : { refus: "nothing was published: the app gave no answer" }),
        (/** @type {unknown} */ error) => ({ refus: "nothing was published", detail: error instanceof Error ? error.message : String(error) }),
      )
      .then((rendered) => {
        publications.set(here, { rendu: rendered });
        render();
      });
  };

  /** @param {string[]} names */
  const set = (names) => {
    projects = [...names];
    for (const project of projects) {
      const readOne = readOnes.get(project);
      if (readOne === undefined || now() - readOne.le >= FRESHNESS_MS) readProject(project);
    }
    render();
    return element;
  };

  return { element, poser: set };
}
