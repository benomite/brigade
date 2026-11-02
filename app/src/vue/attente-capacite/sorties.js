// @ts-check
// Les deux sorties d'une carte en WAITING faute de capacité (ticket 1958, épique 1950) — celle qui attend « a station that
// provides `macos` » —, et la tâche qu'elle devient dans TODO quand le chef la confie à un humain.
//
// Sur la carte de WAITING, deux boutons, et seulement sur celle-là (`requiert`, que `facts` ne donne qu'à elle) :
//   - « Give it to a station », le recommandé : sous la carte, les stations du projet, la première choisie ; un clic
//     en choisit une autre, et la confirmation dit ce qu'elle fournira. Confirmé, ce que la carte demande s'ajoute à
//     ce que la station fournit, par le geste qui change une station seule (`changerUneStation`, comme « Save » de son
//     formulaire sur Cooks) : rouvert, son formulaire montre la capacité cochée. Le runtime ramène le ticket sur le
//     rail et l'envoie chez elle (runtime/src/sortie-attente-capacite/) ;
//   - « It's a human's job » : la confirmation dit que le ticket quitte le rail pour TODO ; confirmé, `rail human`
//     part là où la cuisine tourne (geste.ts).
// Un choix au plus, puis une confirmation : chaque sortie est un geste.
//
// Sur la carte de TODO d'un ticket confié à un humain (`tache`) : à qui la tâche revient — un champ, le chef par
// défaut, et « reassign » pour la donner à quelqu'un d'autre —, puis le titre, le contexte et les critères
// d'acceptation de sa carte, et la capacité qu'aucune station ne fournit.
//
// `poserSorties` et `poserTache` ne touchent pas `document` : ils reçoivent de quoi créer un élément (briques.js), et
// rendent des éléments. `tenirLesSorties` tient ce que le chef a ouvert, choisi et envoyé, carte par carte, et parle au
// pont : la vue le crée une fois, et pose ce qu'il rend sur chaque carte.

import { boutonAction, confirmationDeGeste, lectureIndisponible } from "../briques.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../service.ts").StationDeclaree} StationDeclaree */
/** @typedef {import("../../service.ts").StationsLues} StationsLues */
/** @typedef {import("./lecture.ts").TacheHumaine} TacheHumaine */
/** @typedef {{ fait: string, detail?: string } | { refus: string, detail?: string }} Rendu */
/**
 * Ce que le chef a fait d'une carte en WAITING : la sortie ouverte, la station choisie, un envoi en route, et ce que
 * le dernier a rendu.
 * @typedef {{ ouverte: "station" | "humain" | null, station?: string, envoi: boolean, rendu?: Rendu }} Sortie
 */
/** @typedef {{ ouvrir(quelle: "station" | "humain"): void, fermer(): void, choisir(station: string): void, donner(): void, confier(): void }} GestesDeSortie */
/** Ce que le chef a tapé dans le champ de la tâche, un envoi en route, et ce que le dernier a rendu.
 * @typedef {{ qui?: string, envoi: boolean, rendu?: Rendu }} Reassignation */
/** @typedef {{ taper(qui: string): void, reassigner(): void }} GestesDeTache */

export const DONNER = "Give it to a station";
export const HUMAIN = "It's a human's job";
export const PAS_LUES = "the project's stations are not read yet: the next check of the installation reads them";
export const AUCUNE = "no station declared: declare one on Cooks first";
export const REASSIGNER = "reassign";
// Le chef, tel que la tâche le nomme.
export const CHEF = "chef";

const pour = (/** @type {string} */ qui) => (qui === CHEF ? "the chef" : qui);
const dites = (/** @type {readonly string[]} */ capacites) => capacites.join(" and ");

// Ce que la station choisie doit fournir de plus : ce que la carte demande et qu'elle ne fournit pas encore.
/** @param {readonly string[]} requiert @param {StationDeclaree} station */
export const aAjouter = (requiert, station) => requiert.filter((capacite) => !station.fournit.includes(capacite));

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue pose (peau.test.ts).
/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Un formulaire de la carte : un clic dedans n'ouvre pas sa fiche (vue.js, `poserBon`), et rien ne s'y soumet.
/** @param {Fabrique} doc */
function formulaire(doc) {
  const forme = cree(doc, "form");
  forme.addEventListener("submit", (/** @type {{ preventDefault(): void }} */ evenement) => evenement.preventDefault());
  return forme;
}

/** @param {Fabrique} doc @param {Rendu} rendu */
function renduDit(doc, rendu) {
  if ("refus" in rendu) return lectureIndisponible(doc, rendu.refus, rendu.detail ?? "");
  const fait = cree(doc, "p", rendu.fait);
  fait.className = "fait";
  fait.ariaLive = "polite";
  return fait;
}

// Un envoi en route : rien ne repart de la confirmation avant qu'il ait répondu.
/** @param {any} confirmation @param {boolean} envoi */
function enRoute(confirmation, envoi) {
  for (const pose of confirmation.children) if (pose.type === "button") pose.disabled = envoi;
}

// Les stations entre lesquelles le chef choisit : une ligne chacune — son nom, ce qu'elle fournit.
/** @param {Fabrique} doc @param {number} ticket @param {readonly StationDeclaree[]} stations @param {string} choisie @param {GestesDeSortie} gestes @param {boolean} envoi */
function choixDeStation(doc, ticket, stations, choisie, gestes, envoi) {
  const liste = cree(doc, "fieldset");
  liste.className = "stations-a-choisir";
  liste.append(cree(doc, "legend", `Which station gets #${ticket}?`));
  for (const station of stations) {
    const ligne = cree(doc, "label");
    ligne.className = "station-a-choisir";
    const radio = cree(doc, "input");
    radio.type = "radio";
    radio.name = `station-de-${ticket}`;
    radio.value = station.nom;
    radio.checked = station.nom === choisie;
    radio.disabled = envoi;
    radio.dataset.station = station.nom;
    radio.addEventListener("change", () => gestes.choisir(station.nom));
    const nom = cree(doc, "span", station.nom);
    nom.className = "mono";
    const fournit = cree(doc, "small", station.fournit.length === 0 ? "provides nothing yet" : `provides ${station.fournit.join(", ")}`);
    fournit.className = "fournit";
    ligne.append(radio, nom, fournit);
    liste.append(ligne);
  }
  return liste;
}

// Les sorties d'une carte en WAITING faute de capacité. `stations` : celles que le projet déclare, absentes tant
// qu'elles ne sont pas lues.
/**
 * @param {Fabrique} doc
 * @param {{ ticket: number, requiert: readonly string[], stations: readonly StationDeclaree[] | undefined, etat: Sortie }} quoi
 * @param {GestesDeSortie} gestes
 */
export function poserSorties(doc, { ticket, requiert, stations, etat }, gestes) {
  const racine = cree(doc, "div");
  racine.className = "sorties-capacite";
  racine.ariaLabel = `ways out of WAITING for #${ticket}`;
  const rangee = cree(doc, "p");
  rangee.className = "gestes sorties";
  const donner = boutonAction(doc, DONNER, () => (etat.ouverte === "station" ? gestes.fermer() : gestes.ouvrir("station")), { recommande: true });
  const humain = boutonAction(doc, HUMAIN, () => (etat.ouverte === "humain" ? gestes.fermer() : gestes.ouvrir("humain")));
  for (const [groupe, quelle, survole] of /** @type {const} */ ([
    [donner, "station", `pick a station of the project: it will provide ${dites(requiert)}, and #${ticket} leaves for it`],
    [humain, "humain", `no station will provide ${dites(requiert)}: #${ticket} leaves the rail and waits in TODO as a task`],
  ])) {
    const bouton = groupe.firstChild;
    bouton.dataset.sortie = quelle;
    bouton.title = survole;
    bouton.ariaExpanded = etat.ouverte === quelle ? "true" : "false";
    bouton.disabled = etat.envoi;
  }
  rangee.append(donner, humain);
  racine.append(rangee);

  if (etat.ouverte === "station") {
    if (stations === undefined || stations.length === 0) {
      const vide = cree(doc, "p", stations === undefined ? PAS_LUES : AUCUNE);
      vide.className = "vide";
      racine.append(vide);
    } else {
      const choisie = stations.find(({ nom }) => nom === etat.station) ?? stations[0];
      if (choisie !== undefined) {
        const forme = formulaire(doc);
        forme.className = "sortie station";
        const ajout = aAjouter(requiert, choisie);
        const confirmation = confirmationDeGeste(
          doc,
          {
            titre: `Give #${ticket} to ${choisie.nom}? ${ajout.length === 0 ? `It already provides ${dites(requiert)}.` : `It will provide ${dites(ajout)} from now on.`}`,
            prix: "the ticket goes back on the rail: a cook takes it on that station and spends what a cook spends",
            oui: etat.envoi ? `giving it to ${choisie.nom}…` : `Give it to ${choisie.nom}`,
            non: "Cancel",
          },
          { oui: () => gestes.donner(), non: () => gestes.fermer() },
        );
        enRoute(confirmation, etat.envoi);
        forme.append(choixDeStation(doc, ticket, stations, choisie.nom, gestes, etat.envoi), confirmation);
        racine.append(forme);
      }
    }
  }
  if (etat.ouverte === "humain") {
    const forme = formulaire(doc);
    forme.className = "sortie humain";
    const confirmation = confirmationDeGeste(
      doc,
      { titre: `Make #${ticket} a human's job? It leaves the rail and waits in TODO as a task for the chef — no station will cook it.`, oui: etat.envoi ? "sending it to TODO…" : "Send it to TODO", non: "Cancel" },
      { oui: () => gestes.confier(), non: () => gestes.fermer() },
    );
    enRoute(confirmation, etat.envoi);
    forme.append(confirmation);
    racine.append(forme);
  }
  if (etat.rendu !== undefined) racine.append(renduDit(doc, etat.rendu));
  return racine;
}

// La tâche d'un ticket confié à un humain, sur sa carte de TODO : à qui elle revient, et ce que sa carte disait.
/**
 * @param {Fabrique} doc
 * @param {{ ticket: number, tache: TacheHumaine, etat: Reassignation }} quoi
 * @param {GestesDeTache} gestes
 */
export function poserTache(doc, { ticket, tache, etat }, gestes) {
  const racine = cree(doc, "section");
  racine.className = "tache-humaine";
  racine.ariaLabel = `the task of #${ticket}`;

  const forme = formulaire(doc);
  forme.className = "assignee";
  const champ = cree(doc, "input");
  champ.value = etat.qui ?? tache.assignee;
  champ.ariaLabel = `who does the task of #${ticket}`;
  champ.placeholder = CHEF;
  // Le rail redessiné rend le clavier au champ où le chef tapait (vue.js, `reprise`).
  champ.dataset.cle = `tache:${ticket}`;
  champ.dataset.champ = "assignee";
  champ.disabled = etat.envoi;
  const etiquette = cree(doc, "label");
  etiquette.className = "champ";
  etiquette.append(cree(doc, "span", "Assignee"), champ);
  const voulu = () => (champ.value.trim() === "" ? CHEF : champ.value.trim().replace(/^@/, ""));
  const reassigner = boutonAction(doc, etat.envoi ? "reassigning…" : REASSIGNER, () => gestes.reassigner());
  const bouton = reassigner.firstChild;
  bouton.title = `hand the task of #${ticket} to someone else — the issue says so`;
  bouton.disabled = etat.envoi || voulu() === tache.assignee;
  champ.addEventListener("input", () => {
    gestes.taper(champ.value);
    bouton.disabled = etat.envoi || voulu() === tache.assignee;
  });
  forme.append(etiquette, reassigner);
  racine.append(forme);
  if (etat.rendu !== undefined) racine.append(renduDit(doc, etat.rendu));

  const titre = cree(doc, "strong", tache.title);
  titre.className = "titre-tache";
  const manque = cree(doc, "p", "No station provides ");
  manque.className = "manque-tache";
  for (const [rang, capacite] of tache.missing.entries()) {
    if (rang > 0) manque.append(" or ");
    const nom = cree(doc, "span", capacite);
    nom.className = "mono";
    manque.append(nom);
  }
  manque.append(`: this is ${pour(tache.assignee)}'s task.`);
  racine.append(titre, manque);
  if (tache.context !== "") {
    racine.append(cree(doc, "h5", "Context"));
    const contexte = cree(doc, "p", tache.context);
    contexte.className = "contexte-tache";
    racine.append(contexte);
  }
  if (tache.criteria.length > 0) {
    racine.append(cree(doc, "h5", "Acceptance criteria"));
    const criteres = cree(doc, "ul");
    criteres.className = "criteres-tache";
    criteres.append(...tache.criteria.map((critere) => cree(doc, "li", critere)));
    racine.append(criteres);
  }
  return racine;
}

/**
 * Ce que la vue donne : son `document`, son pont, les stations déclarées d'un projet (`declarees`), de quoi reposer le
 * rail d'un projet et relire ses faits.
 * @typedef {{
 *   doc: Fabrique,
 *   pont: {
 *     changerUneStation(projet: string, station: string, voulu: { cooks: number, fournit: string[] }): Promise<Rendu>,
 *     confierAUnHumain(projet: string, ticket: number, qui?: string): Promise<Rendu>,
 *   },
 *   stations(projet: string): StationsLues | undefined,
 *   reposer(projet: string): void,
 *   relire(): void,
 * }} Branchement
 */
/** @typedef {{ nom: string }} ProjetVu */
/** @typedef {{ ticket: number, attendu?: boolean, requiert?: string[], tache?: TacheHumaine }} CarteVue */

const SANS_PONT = "the app did not answer";
const message = (/** @type {unknown} */ erreur) => (erreur instanceof Error ? erreur.message : String(erreur));

/** @param {Branchement} branchement */
export function tenirLesSorties({ doc, pont, stations, reposer, relire }) {
  /** @type {Map<string, Sortie>} */
  const sorties = new Map();
  /** @type {Map<string, Reassignation>} */
  const reassignations = new Map();

  /** @param {() => Promise<Rendu>} appel @returns {Promise<Rendu>} */
  const jouer = async (appel) => {
    try {
      return (await appel()) ?? { refus: "nothing was sent", detail: SANS_PONT };
    } catch (erreur) {
      return { refus: "nothing was sent", detail: message(erreur) };
    }
  };

  /** @param {ProjetVu} projet @param {CarteVue & { requiert: string[] }} carte */
  function sortiesDe(projet, carte) {
    const cle = `${projet.nom}#${carte.ticket}`;
    const etat = sorties.get(cle) ?? { ouverte: null, envoi: false };
    sorties.set(cle, etat);
    const declarees = stations(projet.nom)?.declarees;
    const choisie = () => declarees?.find(({ nom }) => nom === etat.station) ?? declarees?.[0];
    /** @type {GestesDeSortie} */
    const gestes = {
      ouvrir(quelle) {
        Object.assign(etat, { ouverte: quelle, rendu: undefined });
        reposer(projet.nom);
      },
      fermer() {
        etat.ouverte = null;
        reposer(projet.nom);
      },
      choisir(station) {
        etat.station = station;
        reposer(projet.nom);
      },
      async donner() {
        const station = choisie();
        if (station === undefined || etat.envoi) return;
        etat.envoi = true;
        reposer(projet.nom);
        const ajout = aAjouter(carte.requiert, station);
        const rendu = await jouer(() => pont.changerUneStation(projet.nom, station.nom, { cooks: station.cooks, fournit: [...station.fournit, ...ajout] }));
        Object.assign(etat, { envoi: false, rendu: "fait" in rendu ? { fait: `${station.nom} provides ${dites(carte.requiert)}: #${carte.ticket} goes back on the rail and leaves for it` } : rendu });
        if ("fait" in rendu) {
          etat.ouverte = null;
          relire();
        }
        reposer(projet.nom);
      },
      async confier() {
        if (etat.envoi) return;
        etat.envoi = true;
        reposer(projet.nom);
        const rendu = await jouer(() => pont.confierAUnHumain(projet.nom, carte.ticket));
        Object.assign(etat, { envoi: false, rendu });
        if ("fait" in rendu) {
          etat.ouverte = null;
          relire();
        }
        reposer(projet.nom);
      },
    };
    return poserSorties(doc, { ticket: carte.ticket, requiert: carte.requiert, stations: declarees, etat }, gestes);
  }

  /** @param {ProjetVu} projet @param {CarteVue & { tache: TacheHumaine }} carte */
  function tacheDe(projet, carte) {
    const cle = `${projet.nom}#${carte.ticket}`;
    const etat = reassignations.get(cle) ?? { envoi: false };
    reassignations.set(cle, etat);
    /** @type {GestesDeTache} */
    const gestes = {
      taper(qui) {
        etat.qui = qui;
      },
      async reassigner() {
        if (etat.envoi) return;
        etat.envoi = true;
        reposer(projet.nom);
        const qui = (etat.qui ?? "").trim();
        const rendu = await jouer(() => pont.confierAUnHumain(projet.nom, carte.ticket, qui === "" ? CHEF : qui));
        Object.assign(etat, { envoi: false, rendu });
        if ("fait" in rendu) {
          etat.qui = undefined;
          relire();
        }
        reposer(projet.nom);
      },
    };
    return poserTache(doc, { ticket: carte.ticket, tache: carte.tache, etat }, gestes);
  }

  return {
    // Ce que la carte porte de plus : ses sorties, si elle attend une capacité ; sa tâche, si elle en est une. Une carte
    // qui n'est plus ni l'une ni l'autre oublie ce que le chef en avait fait.
    /** @param {ProjetVu} projet @param {CarteVue} carte */
    poser(projet, carte) {
      const cle = `${projet.nom}#${carte.ticket}`;
      const { requiert, tache } = carte;
      if (requiert === undefined) sorties.delete(cle);
      if (tache === undefined || carte.attendu !== true) reassignations.delete(cle);
      if (requiert !== undefined) return [sortiesDe(projet, { ...carte, requiert })];
      if (tache !== undefined && carte.attendu === true) return [tacheDe(projet, { ...carte, tache })];
      return [];
    },
  };
}
