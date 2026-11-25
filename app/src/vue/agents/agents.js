// @ts-check
// L'onglet Agents d'un projet (ticket 4117, spec 2026-11-23-autonomy-trust-control.md, axe 3) : chaque agent que la cuisine
// fait travailler sur le projet — le second, le manager, les cooks, la pass et son reviewer, le closer, le superviseur, et
// tout autre agent qu'elle lance —, l'un sous l'autre. Chacun dit à quoi il sert en une phrase, son état et sa prochaine
// passe, ses chiffres des sept derniers jours — chacun avec son sens —, et ses réglages : un réglage qui se change d'ici
// est une rangée de boutons, un par choix, le courant enfoncé, qui s'applique dès qu'on le clique, sans rien redémarrer, et
// dit quand il a été changé pour la dernière fois et par qui ; un réglage qui ne se change pas d'ici dit où il vit. Un clic
// sur l'agent ouvre ses derniers gestes, chacun avec sa raison et son issue (le fil du ticket 4029).
// Les données passent par agents/source.js, et par lui seul : la vue n'appelle que `source.lire` et `source.regler`. Une
// lecture qui ne rend rien ne pose aucun agent et le dit ; une lecture qui échoue, ou qui ne se lit pas, se dit en une
// ligne, son détail au survol ; un réglage qui échoue aussi, sous sa rangée, et rien ne change à l'écran.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js).

import { heureUtc } from "../activite-du-cook.js";
import { bouton } from "../composants/bouton/bouton.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { ligneVide } from "../composants/ligne-vide/ligne-vide.js";
import { NON_ATTEINT } from "../lexique.js";
import { source } from "./source.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("./source.js").Agent} Agent */
/** @typedef {import("./source.js").Reglage} Reglage */
/** @typedef {import("./source.js").Chiffre} Chiffre */

export const TITRE = "Agents";
const PRESENTATION = "Every agent that works on this project: what it is for, how it is doing, and its settings. Click an agent to read its last gestures.";
const INDISPONIBLE = NON_ATTEINT("the agents");
const ILLISIBLE = "the agents' reading is not readable";
const SANS_LECTURE = "This device does not read the agents.";
const SANS_CHIFFRE = "No figure kept for this agent yet.";
const SANS_GESTE = "No gesture kept for this agent yet.";
const SEMAINE = "Last 7 days";
const MAINTENANT = "Right now";
const REGLAGES = "Its settings";
// Les derniers gestes qu'un fil montre, les plus récents d'abord.
const GESTES_MONTRES = 10;

const texte = (/** @type {unknown} */ valeur) => typeof valeur === "string";
const chiffreLu = (/** @type {any} */ un) => texte(un?.label) && texte(un.value) && texte(un.meaning);
// Ce qu'un enregistrement doit porter pour se montrer : un champ qui manque ne s'invente pas, la lecture se dit illisible.
/** @type {((un: any) => boolean)[]} */
const FORME = [
  (un) => texte(un?.agent) && un.agent !== "",
  (un) => texte(un.role),
  (un) => texte(un.state),
  (un) => texte(un.nextRun?.text),
  (un) => Array.isArray(un.week) && un.week.every(chiffreLu),
  (un) => un.now === undefined || (Array.isArray(un.now) && un.now.every(chiffreLu)),
  (un) => Array.isArray(un.settings) && un.settings.every((/** @type {any} */ r) => texte(r?.key) && texte(r.label) && texte(r.value) && typeof r.editable === "boolean" && (r.options === undefined || (Array.isArray(r.options) && r.options.every(texte)))),
  (un) => Array.isArray(un.gestures) && un.gestures.every((/** @type {any} */ g) => texte(g?.at) && texte(g.line) && texte(g.reason) && texte(g.outcome)),
];
/** @param {unknown} lus @returns {lus is Agent[]} */
const seLit = (lus) => Array.isArray(lus) && lus.every((un) => FORME.every((porte) => porte(un)));

// Un instant, à la minute, en UTC comme le reste de l'app : `2026-11-25 12:10 UTC`.
/** @param {string} iso */
export const momentUtc = (iso) => (Number.isNaN(Date.parse(iso)) ? iso : `${new Date(iso).toISOString().slice(0, 10)} ${heureUtc(iso)}`);

/** @param {Error | unknown} erreur */
const detailDe = (erreur) => {
  const detail = /** @type {{ detail?: unknown }} */ (erreur)?.detail;
  return typeof detail === "string" ? detail : "";
};
/** @param {Error | unknown} erreur */
const phraseDe = (erreur) => (erreur instanceof Error ? erreur.message : String(erreur));

// Les agents posés dans `cadre`, la section de l'onglet. `lire(projet)` les relit — à l'ouverture de l'onglet, à chaque
// lecture du rail tant qu'il est montré ; `montrer(projet)` la montre pour le projet affiché, et la cache pour tout autre ;
// `ouvrir(agent)` ouvre le fil d'un agent (un badge de l'équipe y mène).
/** @param {Fabrique} doc @param {any} cadre */
export function tenirLesAgents(doc, cadre) {
  const element = doc.createElement("div");
  element.className = "agents";
  cadre.replaceChildren(element);
  cadre.hidden = true;
  /** @type {string | undefined} */
  let projet;
  /** @type {string | undefined} */
  let affiche;
  /** @type {Agent[] | null} */
  let agents = null;
  let lu = false;
  /** @type {{ ligne: string, detail: string } | null} */
  let echec = null;
  /** @type {string | null} */
  let ouvert = null;
  // L'agent qu'un badge a demandé d'ouvrir avant que le projet ne soit lu : il reste ouvert à sa première lecture.
  /** @type {string | null} */
  let aOuvrir = null;
  let demande = 0;
  // Les réglages partis, que le chef ne peut pas refaire tant qu'ils n'ont pas répondu ; et ceux qui ont échoué.
  /** @type {Set<string>} */
  const partis = new Set();
  /** @type {Map<string, { ligne: string, detail: string }>} */
  const rates = new Map();

  /** @param {string} nom */
  const lire = (nom) => {
    if (nom !== projet) {
      projet = nom;
      [agents, echec, ouvert, lu] = [null, null, aOuvrir, false];
      rates.clear();
    }
    aOuvrir = null;
    const la = ++demande;
    return Promise.resolve()
      .then(() => source.lire(nom))
      .then(
        (lus) => {
          if (la !== demande) return;
          lu = true;
          if (lus === null) [agents, echec] = [null, null];
          else if (seLit(lus)) [agents, echec] = [lus, null];
          else [agents, echec] = [null, { ligne: ILLISIBLE, detail: JSON.stringify(lus).slice(0, 400) }];
          rendre();
        },
        (/** @type {unknown} */ erreur) => {
          if (la !== demande) return;
          lu = true;
          [agents, echec] = [null, { ligne: `${INDISPONIBLE} ${phraseDe(erreur)}`, detail: detailDe(erreur) }];
          rendre();
        },
      );
  };

  /** @param {string | undefined} nom */
  const montrer = (nom) => {
    const ouvre = nom !== undefined && nom !== affiche;
    affiche = nom;
    if (ouvre) void lire(nom);
    else rendre();
  };

  /** @param {string} agent */
  const ouvrir = (agent) => {
    ouvert = aOuvrir = agent;
    rendre();
  };

  const rendre = () => {
    cadre.hidden = affiche === undefined || affiche !== projet;
    if (cadre.hidden) return;
    const tete = doc.createElement("h2");
    tete.textContent = TITRE;
    const dit = doc.createElement("p");
    dit.className = "presentation";
    dit.textContent = PRESENTATION;
    /** @type {any[]} */
    let corps;
    if (echec !== null) corps = [ligneErreur(doc, echec.ligne, echec.detail)];
    else if (!lu) corps = [ligneVide(doc, "Reading the agents…")];
    else if (agents === null) corps = [ligneVide(doc, SANS_LECTURE)];
    else corps = agents.map(fiche);
    element.replaceChildren(tete, dit, ...corps);
  };

  /** @param {Agent} agent */
  const fiche = (agent) => {
    const est = agent.agent === ouvert;
    const cree = doc.createElement("section");
    cree.className = est ? "agent ouvert" : "agent";
    cree.dataset.agent = agent.agent;
    cree.dataset.etat = agent.state.startsWith("broken") ? "casse" : "";
    const tete = doc.createElement("button");
    tete.type = "button";
    tete.className = "tete";
    tete.ariaExpanded = String(est);
    tete.append(pose("span", "nom", agent.agent), pose("span", "etat", agent.state), pose("span", "prochaine", agent.nextRun.text));
    tete.addEventListener("click", () => {
      ouvert = est ? null : agent.agent;
      rendre();
    });
    cree.append(tete, pose("p", "role", agent.role), chiffres(SEMAINE, agent.week, SANS_CHIFFRE));
    if (agent.now !== undefined && agent.now.length > 0) cree.append(chiffres(MAINTENANT, agent.now, ""));
    cree.append(reglages(agent));
    if (est) cree.append(fil(agent));
    return cree;
  };

  /** @param {string} titre @param {Chiffre[]} liste @param {string} sans */
  const chiffres = (titre, liste, sans) => {
    const cree = doc.createElement("div");
    cree.className = "chiffres";
    cree.ariaLabel = titre;
    cree.append(pose("h3", "titre", titre));
    if (liste.length === 0) {
      if (sans !== "") cree.append(ligneVide(doc, sans));
      return cree;
    }
    const ul = doc.createElement("ul");
    for (const { label, value, meaning } of liste) {
      const li = doc.createElement("li");
      li.className = "chiffre";
      li.append(pose("strong", "valeur", value), pose("span", "libelle", label), pose("small", "sens", meaning));
      ul.append(li);
    }
    cree.append(ul);
    return cree;
  };

  /** @param {Agent} agent */
  const reglages = (agent) => {
    const cree = doc.createElement("div");
    cree.className = "reglages";
    cree.ariaLabel = `${agent.agent}'s settings`;
    cree.append(pose("h3", "titre", REGLAGES), ...agent.settings.map((reglage) => rangee(agent, reglage)));
    return cree;
  };

  // Une rangée : son nom, puis ou bien un bouton par choix — le courant enfoncé —, ou bien sa valeur et là où elle vit ;
  // quand et par qui elle a été changée ; ce que le dernier geste a rendu. Le nom est du texte de la rangée même : un
  // clic, un survol ou un lecteur d'écran la lisent d'un seul tenant.
  /** @param {Agent} agent @param {Reglage} reglage */
  const rangee = (agent, reglage) => {
    const cle = `${agent.agent} ${reglage.key}`;
    const cree = doc.createElement("div");
    cree.className = reglage.editable ? "reglage" : "reglage fixe";
    cree.dataset.cle = reglage.key;
    cree.append(reglage.label);
    if (reglage.editable && reglage.options !== undefined) {
      const choix = doc.createElement("span");
      choix.className = "choix";
      choix.role = "group";
      choix.ariaLabel = `${agent.agent}'s ${reglage.label}`;
      for (const option of reglage.options) {
        const un = bouton(doc, option, () => regler(agent, reglage, option), { sorte: "discret" });
        un.ariaPressed = String(option === reglage.value);
        un.disabled = partis.has(cle);
        choix.append(un);
      }
      cree.append(choix);
    } else {
      cree.append(pose("span", "valeur", reglage.value));
      cree.append(pose("span", "ou", reglage.livesIn === undefined ? "" : `lives in ${reglage.livesIn}`));
    }
    if (reglage.from !== undefined) cree.append(pose("span", "origine", reglage.from));
    const quand = reglage.changedAt === undefined ? "" : ` ${momentUtc(reglage.changedAt)}`;
    const qui = reglage.changedBy === undefined ? "" : ` by ${reglage.changedBy}`;
    if (quand !== "" || qui !== "") cree.append(pose("span", "change", `changed${quand}${qui}`));
    const rate = rates.get(cle);
    if (rate !== undefined) cree.append(ligneErreur(doc, rate.ligne, rate.detail, { alerte: true }));
    return cree;
  };

  // Le fil de l'agent ouvert : ses derniers gestes, les plus récents d'abord, une ligne chacun avec sa raison et son issue.
  /** @param {Agent} agent */
  const fil = (agent) => {
    const cree = doc.createElement("section");
    cree.className = "fil";
    cree.ariaLabel = `${agent.agent}'s thread`;
    cree.append(pose("h3", "titre", "Its last gestures"));
    if (agent.gestures.length === 0) {
      cree.append(ligneVide(doc, SANS_GESTE));
      return cree;
    }
    const recents = [...agent.gestures].sort((a, b) => b.at.localeCompare(a.at));
    const liste = doc.createElement("ul");
    liste.className = "derniers-gestes";
    for (const geste of recents.slice(0, GESTES_MONTRES)) {
      const ligne = doc.createElement("li");
      const raison = geste.reason === "" ? "" : ` (${geste.reason})`;
      const issue = geste.outcome === "" ? "" : `: ${geste.outcome}`;
      ligne.textContent = `${heureUtc(geste.at)} · ${geste.line}${raison}${issue}`;
      liste.append(ligne);
    }
    cree.append(liste);
    if (recents.length > GESTES_MONTRES) cree.append(pose("p", "reste", `${recents.length - GESTES_MONTRES} older gestures are not shown.`));
    return cree;
  };

  // Change un réglage : le geste part une fois, rien ne bouge à l'écran tant qu'il n'a pas répondu ; réussi, tout se relit —
  // le réglage, quand et par qui —, et ce que le runtime dit de lui est ce qui se montre.
  /** @param {Agent} agent @param {Reglage} reglage @param {string} valeur */
  const regler = (agent, reglage, valeur) => {
    const cle = `${agent.agent} ${reglage.key}`;
    if (valeur === reglage.value || partis.has(cle)) return;
    partis.add(cle);
    rates.delete(cle);
    rendre();
    const pour = projet ?? "";
    void Promise.resolve()
      .then(() => source.regler(agent.agent, reglage.key, valeur, pour))
      .then(
        () => lire(pour),
        (/** @type {unknown} */ erreur) => void rates.set(cle, { ligne: `${agent.agent}'s ${reglage.label.toLowerCase()} was not changed: ${phraseDe(erreur)}`, detail: detailDe(erreur) }),
      )
      .then(() => {
        partis.delete(cle);
        rendre();
      });
  };

  /** @param {string} balise @param {string} classe @param {string} dit */
  const pose = (balise, classe, dit) => {
    const cree = doc.createElement(balise);
    cree.className = classe;
    cree.textContent = dit;
    return cree;
  };

  return { element, lire, montrer, ouvrir };
}
