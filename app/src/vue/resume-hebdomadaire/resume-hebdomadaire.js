// @ts-check
// La page des résumés hebdomadaires (ticket 3263, épique 3251), ouverte par sa ligne « Weekly summary » parmi celles de
// tous les projets : ce que la cuisine de chaque projet a servi, semaine par semaine, écrit pour un product owner
// (runtime/src/resume-hebdomadaire/resume.ts). Par projet : le jour du résumé, réglé dans son dépôt ; ses résumés, le
// plus récent d'abord, et celui qu'on a choisi déplié — ses thèmes en intertitres, chaque ligne avec le lien de son
// ticket, puis l'autonomie de la semaine quand elle a été comptée, et pour finir ce qui attend le chef. Sous le résumé,
// « Publish as release notes » demande un tag de version, puis le publie.
//
// La vue n'y lit rien : le process principal lit et publie (resume-cuisine.ts). Le bloc garde ce qu'il a lu de chaque
// projet dix minutes. Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js).

import { survol } from "../briques.js";
import { DELAI, RENVOI, SANS_HUMAIN, TITRE as TITRE_AUTONOMIE } from "../autonomie/chiffres.js";
import { bouton } from "../composants/bouton/bouton.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { ligneVide } from "../composants/ligne-vide/ligne-vide.js";
import { ditDuReglage, rangeeDeReglage } from "../composants/reglage/reglage.js";
import { ANNULER, LECTURE_DE, NON_ATTEINT, PAS_ENCORE } from "../lexique.js";
import { niveauDe } from "../niveaux.js";
import { dureeEnClair } from "../projet/delai.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("./resume-cuisine.ts").ResumesDuProjet} Lecture */
/** @typedef {import("./resume-cuisine.ts").ResumeHebdomadaire} Resume */
/** @typedef {import("./resume-cuisine.ts").LigneDuResume} Ligne */
/** @typedef {import("./resume-cuisine.ts").RenduDuJour} RenduDuJour */
/** @typedef {import("./resume-cuisine.ts").RenduDeLaPublication} RenduDeLaPublication */
/** @typedef {import("../composants/reglage/reglage.js").Dit} Dit */

export const TITRE = "Weekly summary";
export const ACCUEIL = "what each kitchen served, week by week · release notes";
export const ATTENDU = "What each kitchen served, week by week. Publish a week as the release notes of a version.";
export const JOUR = "Summary day";
export const JOUR_POURQUOI = "The day each week the kitchen writes its summary of the seven days before, and mentions you on GitHub with it (UTC).";
// Les jours, dans l'ordre du runtime (runtime/src/resume-hebdomadaire/jour.ts, `JOURS_DU_RESUME`) — le test les compare.
export const JOURS = /** @type {const} */ (["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
/** @param {string} jour */
export const jourDit = (jour) => jour.charAt(0).toUpperCase() + jour.slice(1);
export const PAR_DEFAUT = "default";
// Les titres du runtime (resume.ts, `TITRE_ATTENTE`, `TITRE_AUTONOMIE`) — le test les compare.
export const ATTENTE = "Waiting for the chef";
export const AUTONOMIE = TITRE_AUTONOMIE;
export const RIEN_SERVI = "Nothing was served this week.";
export const RIEN_N_ATTEND = "Nothing is waiting for you.";
export const PUBLIER = "Publish as release notes";
export const PUBLIER_POURQUOI = "The summary becomes the GitHub release of a version tag of this project's repository. The tag must already exist there.";
export const TAG = "Version tag";
export const ENVOYER = "Publish";
export const PUBLICATION = "Publishing…";
export const OUVRIR_LA_RELEASE = "open the release";
export const AUCUN_PROJET = "No project cooks on a station yet.";
export const SANS_LECTURE = NON_ATTEINT("weekly summaries");
export const FRAICHEUR_MS = 10 * 60_000;
/** @param {{ weekStart: string, weekEnd: string }} resume */
export const semaineDite = ({ weekStart, weekEnd }) => `Week of ${weekStart} to ${weekEnd}`;

/** @param {number | null} part */
const pourcent = (part) => (part === null ? "unknown" : `${Math.round(part * 100)} %`);

/**
 * Le bloc, son état, et `poser(projets)` qui le rend à jour — et lit chaque projet qui ne l'a pas été depuis dix minutes.
 * @param {Fabrique} doc
 * @param {{
 *   lire: (projet: string) => Promise<Lecture>,
 *   changerJour: (projet: string, jour: string) => Promise<RenduDuJour>,
 *   publier: (projet: string, resume: Resume, tag: string) => Promise<RenduDeLaPublication>,
 *   ouvrir: (url: string) => void,
 *   ouvrirProposition?: (url: string) => void,
 *   maintenant?: () => number,
 * }} options
 */
export function tenirLesResumesHebdomadaires(doc, { lire, changerJour, publier, ouvrir, ouvrirProposition, maintenant = Date.now }) {
  const element = doc.createElement("section");
  element.className = "resumes-hebdomadaires";
  element.ariaLabel = TITRE;
  element.dataset.bloc = "resumes-hebdomadaires";
  /** @type {string[]} */
  let projets = [];
  /** @type {Map<string, { le: number, lecture: Lecture | null }>} */
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
  /** @param {string} projet @param {string} weekStart */
  const cle = (projet, weekStart) => `${projet}/${weekStart}`;

  /** @param {string} projet */
  const lireProjet = (projet) => {
    lus.set(projet, { le: maintenant(), lecture: lus.get(projet)?.lecture ?? null });
    void Promise.resolve()
      .then(() => lire(projet))
      .then(
        (lue) => (typeof lue === "object" && lue !== null && "resumes" in lue && "jour" in lue ? lue : { projet, jour: { sans: SANS_LECTURE }, resumes: { sans: SANS_LECTURE, detail: "the app gave no summaries" } }),
        (/** @type {unknown} */ erreur) => ({ projet, jour: { sans: SANS_LECTURE }, resumes: { sans: SANS_LECTURE, detail: erreur instanceof Error ? erreur.message : String(erreur) } }),
      )
      .then((lecture) => {
        lus.set(projet, { le: lus.get(projet)?.le ?? maintenant(), lecture: /** @type {Lecture} */ (lecture) });
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
    element.replaceChildren(titre, attendu, ...(projets.length === 0 ? [ligneVide(doc, AUCUN_PROJET)] : projets.map(duProjet)));
    // La saisie du tag survit à un rendu : son champ garde le clavier.
    saisie?.focus();
  };

  /** @param {string} projet */
  const duProjet = (projet) => {
    const section = doc.createElement("section");
    section.className = "resume-du-projet";
    section.ariaLabel = projet;
    section.dataset.projet = projet;
    const nom = doc.createElement("h3");
    nom.textContent = projet;
    section.append(nom);
    const lecture = lus.get(projet)?.lecture ?? null;
    if (lecture === null) {
      section.append(ligneVide(doc, LECTURE_DE("the weekly summaries"), { classe: "lecture" }));
      return section;
    }
    section.append(rangeeDuJour(projet, lecture.jour));
    const { resumes } = lecture;
    if ("sans" in resumes) {
      section.append(ligneErreur(doc, resumes.sans, resumes.detail ?? ""));
      return section;
    }
    if (resumes.resumes.length === 0) section.append(ligneVide(doc, PAS_ENCORE("weekly summary"), { detail: "None was written in the last weeks starting on the summary day." }));
    else {
      const choisie = resumes.resumes.find(({ weekStart }) => weekStart === choisies.get(projet)) ?? resumes.resumes[0];
      if (resumes.resumes.length > 1) section.append(semaines(projet, resumes.resumes, choisie));
      if (choisie !== undefined) section.append(resume(projet, choisie));
    }
    if (resumes.illisibles.length > 0) {
      section.append(
        ligneErreur(doc, `not read: ${resumes.illisibles.map(({ weekStart }) => `week of ${weekStart}`).join(", ")}`, resumes.illisibles.map(({ weekStart, detail }) => `${weekStart}: ${detail}`).join("\n"), {
          classe: "illisibles",
        }),
      );
    }
    return section;
  };

  /** @param {string} projet @param {Lecture["jour"]} lu */
  const rangeeDuJour = (projet, lu) => {
    const liste = doc.createElement("select");
    liste.ariaLabel = `${JOUR}, ${projet}`;
    if ("sans" in lu) {
      const vide = doc.createElement("option");
      vide.value = "";
      vide.textContent = "—";
      liste.append(vide);
    }
    for (const jour of JOURS) {
      const option = doc.createElement("option");
      option.value = jour;
      option.textContent = jourDit(jour);
      liste.append(option);
    }
    liste.value = "sans" in lu ? "" : lu.jour;
    liste.addEventListener("change", () => changer(projet, liste.value));
    const valeur = "sans" in lu ? [ligneErreur(doc, lu.sans, lu.detail ?? "", { balise: "span" })] : [lu.pose ? jourDit(lu.jour) : `${jourDit(lu.jour)} (${PAR_DEFAUT})`];
    return rangeeDeReglage(doc, {
      nom: JOUR,
      cle: "weeklySummaryDay",
      niveau: niveauDe(doc, "jour-du-resume"),
      valeur,
      controle: [liste, survol(doc, JOUR_POURQUOI)],
      dessous: ditDuReglage(doc, jours.get(projet), ouvrirProposition === undefined ? {} : { ouvrir: ouvrirProposition }),
      classe: "jour-du-resume",
    });
  };

  /** @param {string} projet @param {string} jour */
  const changer = (projet, jour) => {
    if (!(/** @type {readonly string[]} */ (JOURS).includes(jour))) return;
    jours.set(projet, { enCours: "proposing…" });
    rendre();
    void Promise.resolve()
      .then(() => changerJour(projet, jour))
      .then(
        (rendu) => (typeof rendu === "object" && rendu !== null ? rendu : { refus: "nothing was changed: the app gave no answer" }),
        (/** @type {unknown} */ erreur) => ({ refus: "nothing was changed", detail: erreur instanceof Error ? erreur.message : String(erreur) }),
      )
      .then((rendu) => {
        jours.set(projet, "pr" in rendu ? { pr: rendu.pr, numero: rendu.numero, valeur: jourDit(rendu.jour) } : rendu);
        rendre();
      });
  };

  /** @param {string} projet @param {Resume[]} resumes @param {Resume | undefined} choisie */
  const semaines = (projet, resumes, choisie) => {
    const groupe = doc.createElement("div");
    groupe.className = "semaines";
    groupe.role = "group";
    groupe.ariaLabel = `weeks of ${projet}`;
    for (const lu of resumes) {
      const choix = bouton(
        doc,
        `week of ${lu.weekStart}`,
        () => {
          choisies.set(projet, lu.weekStart);
          rendre();
        },
        { sorte: "discret" },
      );
      choix.ariaPressed = String(lu === choisie);
      groupe.append(choix);
    }
    return groupe;
  };

  /** @param {string} titre */
  const intertitre = (titre) => {
    const h4 = doc.createElement("h4");
    h4.textContent = titre;
    return h4;
  };

  /** @param {Ligne[]} lignes @param {string} classe */
  const liste = (lignes, classe) => {
    const ul = doc.createElement("ul");
    ul.className = classe;
    for (const { text, ticketNumber, ticketUrl } of lignes) {
      const li = doc.createElement("li");
      const texte = doc.createElement("span");
      texte.className = "texte";
      texte.textContent = text;
      const lien = bouton(doc, `#${ticketNumber}`, () => ouvrir(ticketUrl), { sorte: "discret" });
      lien.className = "ticket";
      lien.title = ticketUrl;
      lien.dataset.ticket = String(ticketNumber);
      li.append(texte, lien);
      ul.append(li);
    }
    return ul;
  };

  /** @param {string} projet @param {Resume} lu */
  const resume = (projet, lu) => {
    const article = doc.createElement("article");
    article.className = "resume";
    article.ariaLabel = semaineDite(lu);
    article.dataset.semaine = lu.weekStart;
    const tete = doc.createElement("p");
    tete.className = "semaine";
    tete.textContent = semaineDite(lu);
    article.append(tete);
    if (lu.themes.length === 0) article.append(ligneVide(doc, RIEN_SERVI));
    for (const theme of lu.themes) article.append(intertitre(theme.title), liste(theme.lines, "lignes"));
    const a = lu.autonomy;
    if (a !== undefined) {
      const chiffres = doc.createElement("ul");
      chiffres.className = "autonomie";
      for (const [nom, dit] of [
        [SANS_HUMAIN, `${a.servedWithoutHuman} of ${a.tickets} (${pourcent(a.shareWithoutHuman)})`],
        [DELAI, a.medianLeadTimeMs === null ? "unknown" : `${dureeEnClair(a.medianLeadTimeMs)} (median)`],
        [RENVOI, `${a.sentBack} of ${a.tickets} (${pourcent(a.shareSentBack)})`],
      ]) {
        const li = doc.createElement("li");
        const quoi = doc.createElement("span");
        quoi.className = "nom";
        quoi.textContent = nom;
        const combien = doc.createElement("span");
        combien.className = "valeur";
        combien.textContent = dit;
        li.append(quoi, combien);
        chiffres.append(li);
      }
      article.append(intertitre(AUTONOMIE), chiffres);
    }
    article.append(intertitre(ATTENTE), lu.waiting.length === 0 ? ligneVide(doc, RIEN_N_ATTEND) : liste(lu.waiting, "attentes"));
    article.append(publication(projet, lu));
    return article;
  };

  /** @param {string} projet @param {Resume} lu */
  const publication = (projet, lu) => {
    const zone = doc.createElement("div");
    zone.className = "publication";
    const etat = publications.get(cle(projet, lu.weekStart));
    const offrir = () => {
      const geste = bouton(doc, PUBLIER, () => {
        publications.set(cle(projet, lu.weekStart), { tag: "" });
        rendre();
      });
      geste.className = "publier";
      zone.append(geste, survol(doc, PUBLIER_POURQUOI));
    };
    if (etat === undefined) {
      offrir();
      return zone;
    }
    if ("tag" in etat) {
      const nom = doc.createElement("label");
      nom.textContent = TAG;
      const champ = doc.createElement("input");
      champ.type = "text";
      champ.className = "tag";
      champ.ariaLabel = TAG;
      champ.placeholder = "v1.0.0";
      champ.value = etat.tag;
      saisie = champ;
      champ.addEventListener("input", () => publications.set(cle(projet, lu.weekStart), { tag: champ.value }));
      const envoyer = () => envoyerLaPublication(projet, lu, champ.value);
      champ.addEventListener("keydown", (/** @type {{ key?: string }} */ evenement) => {
        if (evenement.key === "Enter") envoyer();
      });
      const envoi = bouton(doc, ENVOYER, envoyer, { sorte: "recommande" });
      envoi.className = "recommande envoyer";
      const renoncer = bouton(
        doc,
        ANNULER,
        () => {
          publications.delete(cle(projet, lu.weekStart));
          rendre();
        },
        { sorte: "discret" },
      );
      zone.append(nom, champ, envoi, renoncer, survol(doc, PUBLIER_POURQUOI));
      return zone;
    }
    if ("envoi" in etat) {
      zone.append(ligneVide(doc, PUBLICATION, { classe: "en-cours" }));
      return zone;
    }
    const { rendu } = etat;
    if ("refus" in rendu) {
      zone.append(ligneErreur(doc, rendu.refus, rendu.detail ?? "", { classe: "refus", alerte: true }));
      offrir();
      return zone;
    }
    const dit = doc.createElement("p");
    dit.className = "publiee" in rendu ? "publiee" : "deja-publiee";
    dit.role = "status";
    const phrase = doc.createElement("span");
    phrase.textContent = "publiee" in rendu ? rendu.publiee : rendu.dejaPubliee;
    const lien = bouton(doc, OUVRIR_LA_RELEASE, () => ouvrir(rendu.url), { sorte: "discret" });
    lien.title = rendu.url;
    dit.append(phrase, lien);
    zone.append(dit);
    return zone;
  };

  /** @param {string} projet @param {Resume} lu @param {string} saisi */
  const envoyerLaPublication = (projet, lu, saisi) => {
    const tag = saisi.trim();
    const ici = cle(projet, lu.weekStart);
    if (tag === "" || !(publications.get(ici) !== undefined && "tag" in /** @type {object} */ (publications.get(ici)))) return;
    publications.set(ici, { envoi: tag });
    rendre();
    void Promise.resolve()
      .then(() => publier(projet, lu, tag))
      .then(
        (rendu) => (typeof rendu === "object" && rendu !== null ? rendu : { refus: "nothing was published: the app gave no answer" }),
        (/** @type {unknown} */ erreur) => ({ refus: "nothing was published", detail: erreur instanceof Error ? erreur.message : String(erreur) }),
      )
      .then((rendu) => {
        publications.set(ici, { rendu });
        rendre();
      });
  };

  /** @param {string[]} noms */
  const poser = (noms) => {
    projets = [...noms];
    for (const projet of projets) {
      const lu = lus.get(projet);
      if (lu === undefined || maintenant() - lu.le >= FRAICHEUR_MS) lireProjet(projet);
    }
    rendre();
    return element;
  };

  return { element, poser };
}
