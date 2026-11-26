// @ts-check
// L'équipe d'un projet (ticket 4029, épique 4024, spec 2026-11-23-autonomy-trust-control.md, C1, C2, C4) : en tête de la
// vue du projet, un badge par agent — supervisor et closer d'abord, puis manager, pass et chaque cook, dans la même
// forme. Chaque badge tient sur une ligne (ticket 4354) : son nom, un point d'état — au travail, au repos, cassé — et
// l'état en deux ou trois mots, et combien de ses gestes attendent l'OK du chef. Un clic ouvre son fil sous la rangée :
// son dernier geste et quand, sa prochaine passe telle que le runtime la dit, ses derniers gestes, une ligne chacun avec
// sa raison et son issue, ses deux compteurs, son niveau d'autonomie — observe, propose, act — que le chef change d'un
// clic, et les gestes qui attendent son OK, un bouton chacun. Un nouveau clic sur le badge le referme.
// Les données passent par autonomy/source.js, et par lui seul : la vue n'appelle que `source.lire`, `source.regler` et
// `source.approuver`. Une lecture qui ne rend rien ne pose aucune équipe ; une lecture qui échoue, ou qui ne se lit pas,
// se dit en une ligne, son détail au survol ; un geste qui échoue aussi, et rien ne change à l'écran.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js).

import { heureUtc } from "../activity-du-cook.js";
import { button } from "../composants/button/button.js";
import { marque } from "../composants/pill/pill.js";
import { lineError } from "../composants/line-error/line-error.js";
import { lineEmpty } from "../composants/line-empty/line-empty.js";
import { NON_ATTEINT, PAS_ENCORE } from "../lexique.js";
import { source } from "./source.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("./source.js").Agent} Agent */
/** @typedef {import("./source.js").Niveau} Niveau */

// Les trois niveaux, dans l'ordre où l'agent gagne la confiance du chef, et ce que chacun veut dire (spec, C4), au survol.
/** @type {readonly Niveau[]} */
const NIVEAUX = ["observe", "propose", "act"];
const SENS = { observe: "It says what it would do.", propose: "It waits for your OK, in one click.", act: "It does it, then says so." };
// Supervisor et closer d'abord, puis manager et pass ; les cooks ensuite, dans l'ordre où le runtime les publie.
const EN_TETE = ["supervisor", "closer", "manager", "pass"];

const TITRE = "The agents";
const INDISPONIBLE = NON_ATTEINT("the agents");
const ILLISIBLE = "the agents' reading is not readable";
const NIVEAU = "autonomy";
const SANS_COMPTEUR = "—";
const EPINGLE = "level pinned";
const PAR_LUI = "fixed by itself";
const AU_CHEF = "handed to the chef";
const QUEUED = "awaits your OK";
const AUCUN_ACTION = PAS_ENCORE("gesture");
const OK = "OK";
/** @param {string} agent */
const NIVEAU_NON_CHANGE = (agent) => `${agent}'s level was not changed`;
/** @param {string} agent */
const NON_APPROUVE = (agent) => `${agent}'s gesture was not approved`;

// Ce qu'un enregistrement doit porter pour se montrer : un champ qui manque ne s'invente pas, la lecture se dit illisible.
/** @type {((un: any) => boolean)[]} */
const FORME = [
  (un) => typeof un?.agent === "string",
  (un) => typeof un.state === "string",
  (un) => typeof un.lastGesture?.line === "string",
  (un) => typeof un.lastGesture.at === "string",
  (un) => typeof un.nextRun?.text === "string",
  (un) => NIVEAUX.includes(un.autonomy),
  (un) => typeof un.counters?.fixedBySelf === "number",
  (un) => typeof un.counters.handedToChef === "number",
  (un) => Array.isArray(un.gestures),
  (un) => Array.isArray(un.pending),
];
/** @param {unknown} lus @returns {lus is Agent[]} */
const seLit = (lus) => Array.isArray(lus) && lus.every((un) => FORME.every((door) => door(un)));

/** @param {Agent[]} agents */
const dansLOrdre = (agents) => {
  const rang = (/** @type {Agent} */ un) => (EN_TETE.includes(un.agent) ? EN_TETE.indexOf(un.agent) : EN_TETE.length);
  return [...agents].sort((a, b) => rang(a) - rang(b));
};

/** @param {Error | unknown} error */
const detailDe = (error) => (error instanceof Error ? error.message : String(error));

// L'équipe posée dans `cadre`, la section en tête de la vue du projet. `lire(projet)` la relit — à l'ouverture du
// projet, à chaque lecture de son rail ; `montrer(projet)` la montre pour le projet affiché, et la cache pour tout autre.
// La bande du haut de la vue (kitchen/, ticket 4238) lit un agent de l'équipe lue (`agent`) et ouvre son fil (`ouvrirLeFil`) ;
// `apresLecture(projet)` est appelé quand une lecture change ce que l'équipe dit ; `ouvrirLesAgents()`, au clic d'un badge qui ouvre
// son fil, ouvre aussi l'onglet Agents de la vue du projet (ticket 4224).
/** @param {Fabrique} doc @param {any} cadre @param {(project: string) => void} [apresRead] @param {() => void} [ouvrirLesAgents] */
export function holdLTeam(doc, cadre, apresRead, ouvrirLesAgents) {
  const element = doc.createElement("div");
  element.className = "equipe";
  element.ariaLabel = TITRE;
  cadre.replaceChildren(element);
  cadre.hidden = true;
  /** @type {string | undefined} */
  let project;
  /** @type {string | undefined} */
  let affiche;
  /** @type {Agent[] | null} */
  let agents = null;
  /** @type {{ ligne: string, detail: string } | null} */
  let failure = null;
  /** @type {string | null} */
  let ouvert = null;
  let request = 0;
  // Les gestes partis, que le chef ne peut pas refaire tant qu'ils n'ont pas répondu ; et ceux qui ont échoué, par agent.
  /** @type {Set<string>} */
  const partis = new Set();
  /** @type {Map<string, { ligne: string, detail: string }>} */
  const rates = new Map();

  /** @param {string} name */
  const lire = (name) => {
    if (name !== project) {
      project = name;
      agents = null;
      failure = null;
      ouvert = null;
      rates.clear();
    }
    const la = ++request;
    void Promise.resolve()
      .then(() => source.lire(name))
      .then(
        (lus) => {
          if (la !== request) return;
          const avant = JSON.stringify(agents);
          if (lus === null) [agents, failure] = [null, null];
          else if (seLit(lus)) [agents, failure] = [lus, null];
          else [agents, failure] = [null, { ligne: ILLISIBLE, detail: JSON.stringify(lus).slice(0, 400) }];
          rendre();
          if (JSON.stringify(agents) !== avant) apresRead?.(name);
        },
        (/** @type {unknown} */ error) => {
          if (la !== request) return;
          [agents, failure] = [null, { ligne: INDISPONIBLE, detail: detailDe(error) }];
          rendre();
        },
      );
  };

  /** @param {string | undefined} name */
  const show = (name) => {
    affiche = name;
    rendre();
  };

  const rendre = () => {
    cadre.hidden = affiche === undefined || affiche !== project || (agents === null && failure === null);
    if (failure !== null) return void element.replaceChildren(lineError(doc, failure.ligne, failure.detail));
    if (agents === null) return void element.replaceChildren();
    const rangee = doc.createElement("div");
    rangee.className = "badges";
    rangee.role = "group";
    rangee.ariaLabel = TITRE;
    const enOrdre = dansLOrdre(agents);
    rangee.append(...enOrdre.map(badge));
    const lui = enOrdre.find((un) => un.agent === ouvert);
    element.replaceChildren(rangee, ...(lui === undefined ? [] : [fil(lui)]));
  };

  /** @param {Agent} agent */
  const badge = (agent) => {
    const cree = doc.createElement("button");
    cree.type = "button";
    cree.className = agent.agent === ouvert ? "badge ouvert" : "badge";
    cree.dataset.agent = agent.agent;
    cree.dataset.etat = agent.state.startsWith("broken") ? "casse" : "";
    cree.ariaExpanded = String(agent.agent === ouvert);
    // Son dernier geste et sa prochaine passe (ticket 4029, critère 2) : au survol, pas en texte — le badge tient sur une ligne (ticket 4354).
    cree.title = `${agent.lastGesture.line} · ${heureUtc(agent.lastGesture.at)} — ${agent.nextRun.text}`;
    // Le point : cassé en rouge, au repos en gris, au travail en bleu. L'état trop long pour le badge y est coupé : entier au survol.
    const ton = cree.dataset.etat === "casse" ? "rouge" : agent.state === "idle" ? "gris" : "bleu";
    cree.append(marque(doc, ton), texte("nom", agent.agent), Object.assign(texte("etat", agent.state), { title: agent.state }));
    if (agent.pending.length > 0) cree.append(texte("attente", `${agent.pending.length} ${QUEUED}`));
    cree.addEventListener("click", () => {
      ouvert = ouvert === agent.agent ? null : agent.agent;
      rendre();
      if (ouvert !== null) ouvrirLesAgents?.();
    });
    return cree;
  };

  /** @param {Agent} agent */
  const fil = (agent) => {
    const cadreDuFil = doc.createElement("section");
    cadreDuFil.className = "fil";
    cadreDuFil.ariaLabel = `${agent.agent}'s thread`;
    const tete = doc.createElement("div");
    tete.className = "tete";
    const titre = doc.createElement("h3");
    titre.textContent = agent.agent;
    const compteurs = doc.createElement("p");
    compteurs.className = "compteurs";
    compteurs.textContent = `${PAR_LUI} ${agent.counters.fixedBySelf} · ${AU_CHEF} ${agent.counters.handedToChef}`;
    tete.append(titre, texte("geste", `${agent.lastGesture.line} · ${heureUtc(agent.lastGesture.at)}`), texte("prochaine", agent.nextRun.text), compteurs, niveaux(agent));
    // Le compteur vers le prochain niveau, tel que le runtime le dit : `null` à act, rien tant qu'il ne le dit pas.
    if (agent.progress !== undefined) {
      const vers = agent.progress === null ? SANS_COMPTEUR : `${agent.progress.done} of ${agent.progress.of} toward ${agent.progress.toward}`;
      tete.append(texte("progression", vers));
    }
    if (agent.pinned === true) tete.append(texte("epingle", EPINGLE));
    cadreDuFil.append(tete);
    const rate = rates.get(agent.agent);
    if (rate !== undefined) cadreDuFil.append(lineError(doc, rate.ligne, rate.detail, { alerte: true }));
    if (agent.pending.length > 0) cadreDuFil.append(wait(agent));
    if (agent.gestures.length === 0) cadreDuFil.append(lineEmpty(doc, AUCUN_ACTION));
    else {
      const liste = doc.createElement("ul");
      liste.className = "derniers-gestes";
      for (const action of agent.gestures) {
        const line = doc.createElement("li");
        line.textContent = `${heureUtc(action.at)} · ${action.line} (${action.reason}): ${action.outcome}`;
        liste.append(line);
      }
      cadreDuFil.append(liste);
    }
    return cadreDuFil;
  };

  /** @param {Agent} agent */
  const niveaux = (agent) => {
    const groupe = doc.createElement("div");
    groupe.className = "niveaux";
    groupe.role = "group";
    groupe.ariaLabel = `${agent.agent}'s ${NIVEAU}`;
    groupe.append(texte("nom", NIVEAU));
    for (const niveau of NIVEAUX) {
      const choice = button(doc, niveau, () => regler(agent, niveau), { sorte: "discret" });
      choice.ariaPressed = String(niveau === agent.autonomy);
      choice.title = SENS[niveau];
      choice.disabled = partis.has(`${agent.agent} niveau`);
      groupe.append(choice);
    }
    return groupe;
  };

  /** @param {Agent} agent @param {Niveau} niveau */
  const regler = (agent, niveau) => {
    const cle = `${agent.agent} niveau`;
    if (niveau === agent.autonomy || partis.has(cle)) return;
    partis.add(cle);
    rates.delete(agent.agent);
    rendre();
    void Promise.resolve()
      .then(() => source.regler(agent.agent, niveau, project ?? ""))
      .then(
        () => void (agent.autonomy = niveau),
        (/** @type {unknown} */ error) => void rates.set(agent.agent, { ligne: NIVEAU_NON_CHANGE(agent.agent), detail: detailDe(error) }),
      )
      .then(() => {
        partis.delete(cle);
        rendre();
      });
  };

  /** @param {Agent} agent */
  const wait = (agent) => {
    const liste = doc.createElement("ul");
    liste.className = "en-attente";
    liste.ariaLabel = `${agent.agent}: ${QUEUED}`;
    for (const action of agent.pending) {
      const line = doc.createElement("li");
      const ok = button(doc, OK, () => approuver(agent, action.id), { sorte: "recommande" });
      ok.disabled = partis.has(`${agent.agent} ${action.id}`);
      line.append(texte("ligne", action.line), ok);
      liste.append(line);
    }
    return liste;
  };

  /** @param {Agent} agent @param {string} id */
  const approuver = (agent, id) => {
    const cle = `${agent.agent} ${id}`;
    if (partis.has(cle)) return;
    partis.add(cle);
    rates.delete(agent.agent);
    rendre();
    void Promise.resolve()
      .then(() => source.approuver(agent.agent, id, project ?? ""))
      .then(
        () => void (agent.pending = agent.pending.filter((action) => action.id !== id)),
        (/** @type {unknown} */ error) => void rates.set(agent.agent, { ligne: NON_APPROUVE(agent.agent), detail: detailDe(error) }),
      )
      .then(() => {
        partis.delete(cle);
        rendre();
      });
  };

  /** @param {string} classe @param {string} dit */
  const texte = (classe, dit) => {
    const pose = doc.createElement("span");
    pose.className = classe;
    pose.textContent = dit;
    return pose;
  };

  // L'agent `nom` de l'équipe lue du projet `nom de projet`, ou rien : une autre équipe, ou pas encore lue, ne répond pas.
  /** @param {string} deProject @param {string} name @returns {Agent | undefined} */
  const agent = (deProject, name) => (deProject === project ? agents?.find((un) => un.agent === name) : undefined);
  /** @param {string} name */
  const ouvrirLeFil = (name) => {
    ouvert = name;
    rendre();
  };

  return { element, lire, montrer: show, agent, ouvrirLeFil };
}
