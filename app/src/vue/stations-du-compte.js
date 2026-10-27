// @ts-check
// Les stations enregistrées sous le compte GitHub du chef (ticket 1706, épique 1702), dans la liste des stations de
// l'accueil : une machine s'y lit une fois (ticket 1778, épique 1777). Une machine appairée s'y dit par sa présence
// (accueil.ts), à laquelle son enregistrement ajoute les projets choisis pour elle (`ligneFondue`) : il ne pose ni seconde
// ligne, ni section à part — il n'est que la façon dont la machine est arrivée (`uneLigneParMachine`), et ce qui lui est
// choisi ; ses cases s'ouvrent d'un bouton à côté de sa ligne. Une machine seulement enregistrée a sa ligne d'après son
// enregistrement — sa pastille, son nom, en ligne ou non, les projets qu'elle sert — ; un clic l'ouvre sur les projets
// du chef, à cocher : ceux qu'elle doit servir (ticket 1780). Ce sont les projets que la brigade connaît déjà — ceux de
// l'app, ceux que ses stations servent ou qui leur sont choisis — parmi les dépôts que le compte atteint ; tout autre dépôt
// ne s'ajoute que par le champ de recherche, qui ne montre que ceux dont le nom contient ce qui est tapé — jamais la liste
// entière. Ajouté, il est choisi pour la station, et rejoint les projets du chef. Une case cochée ou décochée s'écrit aussitôt dans le gist de la station
// (stations-du-compte.ts, selon le contrat de runtime/src/enregistrement-station/README.md) ; relue au lancement
// suivant, la sélection est celle qui a été écrite. Une station hors ligne se dit telle, et ses cases restent à cocher :
// elle sert ce qui est choisi à son retour.
// Sous la liste, ce que la lecture du compte a de plus à dire (`lectureDuCompte`) : sans aucune station, la commande
// d'installation, que copie un bouton ; une connexion à GitHub qui manque, le bouton du premier lancement
// (premier-lancement.js) ; une lecture qui échoue, une ligne, son détail au survol.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { boutonAction, caseACocher, lectureIndisponible, survol } from "./briques.js";
import { boutonDeLaPage, connexionDite, gestes, phraseEtDetail } from "./premier-lancement.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../stations-du-compte.ts").StationsDuCompte} StationsDuCompte */
/** @typedef {import("../stations-du-compte.ts").StationEnregistree} StationEnregistree */
/** @typedef {import("../projets/github.ts").DepotDuChef} DepotDuChef */
/** @typedef {import("./premier-lancement.js").EtatDuPremier["connexion"]} Connexion */

// Ce que la vue tient du bloc. `stations` : absentes, leur lecture est en route. `depots` : les dépôts que le compte du
// chef atteint, lus à l'ouverture de la page d'une station enregistrée. `connus` : les projets que la brigade connaît
// hors des stations du compte — ceux de l'app, ceux que ses stations appairées servent —, chacun par son dépôt
// `<owner>/<name>` ou par son nom. `ajoutes` : les dépôts que le chef a ajoutés par la recherche, ou décochés, pendant la session. `recherche` : ce qu'il
// tape dans le champ de la station ouverte. `envoi` : la station dont la sélection s'écrit — ses cases attendent.
// `refus` : pourquoi la dernière écriture n'a pas eu lieu. `copiee` : la commande d'installation que le bouton vient de
// copier. `connexion` : la connexion à GitHub lancée. `attendus` : les dépôts que le chef vient de cocher pour une station,
// dont elle n'a pas encore dit ce qu'elle fait (ticket 1790).
/**
 * @typedef {{
 *   stations?: StationsDuCompte,
 *   depots?: { depots: DepotDuChef[] } | { refus: string },
 *   connus?: readonly string[],
 *   ajoutes?: readonly string[],
 *   recherche?: { id: string, texte: string },
 *   envoi?: string,
 *   refus?: { id: string, refus: string, detail?: string },
 *   copiee?: string,
 *   connexion?: Connexion,
 *   attendus?: { id: string, depots: readonly string[] },
 * }} EtatDuCompte
 */
// `chercher` : le texte du champ de recherche a changé — la vue le retient, sans redessiner. `ajouter` : un dépôt trouvé
// est choisi pour la station — `depots`, sa sélection entière avec lui.
/**
 * @typedef {{
 *   ouvrirLaStation: (id: string) => void,
 *   choisir: (id: string, depots: string[]) => void,
 *   chercher: (id: string, texte: string) => void,
 *   ajouter: (id: string, depot: string, depots: string[]) => void,
 *   relire: () => void,
 *   seConnecter: () => void,
 *   ouvrirLaPage: (url: string) => void,
 *   copier: (commande: string) => void,
 * }} GestesDuCompte
 */

export const AUCUNE = "No station yet: install one on the machine that will cook.";
export const AUCUNE_AIDE = "The installer asks that machine to sign in to GitHub: sign it in to this same account, and the station appears here within a minute.";
export const ILLISIBLES = "your stations could not be read";
export const RELIRE = "read again";
export const COPIER = "copy";
export const COPIEE = "copied";
// Les mots de l'état d'une machine, ceux de sa ligne quand elle est appairée (stations/stations.ts, `etatDe`).
export const EN_LIGNE = "online";
export const HORS_LIGNE = "offline";
export const PROJETS = "Projects it serves";
export const LECTURE_DES_DEPOTS = "reading your repositories on GitHub…";
export const DEPOTS_ILLISIBLES = "your repositories could not be read";
export const SANS_DEPOT = "no repository on your GitHub account";
export const SANS_PROJET = "none of your projects yet: add a repository below";
export const CHERCHER = "add another repository";
export const CHERCHER_AIDE = "type part of its name";
export const AJOUTER = "add";
/** @param {string} texte */
export const RIEN_NE_CORRESPOND = (texte) => `no other repository matches “${texte}”`;
/** @param {number} combien */
export const ET_ENCORE = (combien) => `${combien} more — keep typing`;
// Ce que la recherche montre au plus : au-delà, une ligne dit combien d'autres, et le chef précise.
export const TROUVES_AU_PLUS = 8;
export const ENVOI = "saving…";
export const EN_SON_ABSENCE = "it is offline: it serves these projects once it is back";
// Ce qu'une station a fait d'un dépôt coché pour elle qu'une autre servait déjà (ticket 1790, runtime/src/projets/rejoindre.ts),
// sous sa case : elle cuit dans la cuisine qui tourne, ou elle refuse — sa phrase dessous, en entier. Tant qu'elle ne l'a pas
// lu, la case dit qu'elle va répondre.
/** @param {string} principale */
export const REJOINTE = (principale) => `cooks in ${principale}'s kitchen`;
export const REFUSEE = "refused";
export const DEMANDEE = "asked: the station answers within a minute";

// Ce qu'une station a fait d'un dépôt choisi pour elle, tel que son gist le dit (stations-du-compte.ts, `ajouts`) — rien tant
// qu'elle ne l'a pas lu.
/** @param {StationEnregistree | undefined} station @param {string} depot */
export function issueDeLAjout(station, depot) {
  return (station?.ajouts ?? []).find((ajout) => ajout.depot.toLowerCase() === depot.toLowerCase());
}

// Ce que les stations du compte ont fait d'un projet qui leur a été choisi alors qu'une autre le servait déjà (ticket
// 1790) : celles qui ont rejoint sa cuisine, avec la station qui la fait tourner ; celles qui refusent, avec leur phrase.
// Le projet se reconnaît à son dépôt ; sans dépôt connu, au nom que la station tire du dépôt choisi. Un dépôt décoché
// depuis n'en dit plus rien.
/** @param {StationsDuCompte | undefined} lues @param {{ nom: string, depot: string }} projet */
export function ajoutsDuProjet(lues, { nom, depot }) {
  /** @type {{ station: StationEnregistree, principale: string }[]} */
  const rejointes = [];
  /** @type {{ station: StationEnregistree, phrase: string }[]} */
  const refusees = [];
  if (lues?.state !== "listed") return { rejointes, refusees };
  const estLeSien = (/** @type {string} */ choisi) => (depot === "" ? (choisi.split("/")[1] ?? "").toLowerCase() === nom : choisi.toLowerCase() === depot.toLowerCase());
  for (const station of lues.stations) {
    for (const choisi of (station.selection ?? []).filter(estLeSien)) {
      const issue = issueDeLAjout(station, choisi);
      if (issue?.issue === "rejointe") rejointes.push({ station, principale: issue.principale });
      if (issue?.issue === "refusee") refusees.push({ station, phrase: issue.phrase });
    }
  }
  return { rejointes, refusees };
}

// La commande d'installation d'une station, selon le système de la machine qui cuit (docs/installation-station.md).
/** @type {readonly { systeme: string, commande: string }[]} */
export const INSTALLER = [
  { systeme: "Linux or macOS", commande: "curl -fsSL https://github.com/benomite/brigade/releases/latest/download/installer-station.sh | sh" },
  { systeme: "Windows, in PowerShell", commande: "irm https://github.com/benomite/brigade/releases/latest/download/installer-station.ps1 | iex" },
];

// La plateforme telle que le contrat la publie, dite comme on la nomme.
/** @type {Readonly<Record<string, string>>} */
const PLATEFORMES = { linux: "Linux", macos: "macOS", windows: "Windows" };
/** @param {string} plateforme */
export const plateformeDite = (plateforme) => PLATEFORMES[plateforme] ?? plateforme;

// Ce qu'une station sert, en mots : rien encore choisi, rien, ou les projets eux-mêmes — comme la ligne d'une station
// appairée les nomme.
/** @param {readonly string[] | null} selection */
export function sertDit(selection) {
  if (selection === null) return "no project chosen yet";
  if (selection.length === 0) return "no project";
  return selection.join(", ");
}

// Une ligne par machine (ticket 1778) : les stations appairées, telles que l'accueil les dit, puis celles du compte qu'aucune
// ne nomme, dans l'ordre des noms. Une machine se reconnaît à son nom — l'enregistrement porte « le même nom que sur sa
// présence » (runtime/src/enregistrement-station/README.md), sans égard à la casse, comme un nom de machine. Appairée, sa
// ligne est celle de sa présence, et son enregistrement l'accompagne (`enregistree`) : ce qui lui est choisi s'y fond
// (`ligneFondue`). Deux enregistrements d'un même nom — un dossier d'état perdu en laisse un ancien, hors ligne — n'en
// font qu'un : celui qui est en ligne, sinon le dernier vu.
/**
 * @template {{ nom: string }} A
 * @param {readonly A[]} appairees @param {readonly StationEnregistree[]} enregistrees
 * @returns {Array<{ appairee: A, enregistree?: StationEnregistree } | { enregistree: StationEnregistree }>}
 */
export function uneLigneParMachine(appairees, enregistrees) {
  const cle = (/** @type {string} */ nom) => nom.toLowerCase();
  /** @type {Map<string, StationEnregistree>} */
  const parNom = new Map();
  for (const station of enregistrees) {
    const nom = cle(station.name);
    const tenue = parNom.get(nom);
    if (tenue === undefined || (station.available && !tenue.available) || (station.available === tenue.available && station.lastSeen > tenue.lastSeen)) parNom.set(nom, station);
  }
  const prises = new Set(appairees.map(({ nom }) => cle(nom)));
  // Les appairées gardent l'ordre où l'accueil les dit (celui des noms) ; chaque autre se glisse à son nom.
  const restantes = [...parNom.values()].filter(({ name }) => !prises.has(cle(name))).sort((a, b) => a.name.localeCompare(b.name));
  /** @type {Array<{ appairee: A, enregistree?: StationEnregistree } | { enregistree: StationEnregistree }>} */
  const lignes = [];
  for (const appairee of appairees) {
    while (restantes.length > 0 && (restantes[0]?.name ?? "").localeCompare(appairee.nom) < 0) lignes.push({ enregistree: /** @type {StationEnregistree} */ (restantes.shift()) });
    const enregistree = parNom.get(cle(appairee.nom));
    lignes.push(enregistree === undefined ? { appairee } : { appairee, enregistree });
  }
  return [...lignes, ...restantes.map((enregistree) => ({ enregistree }))];
}

// Le nom d'un dépôt choisi tel qu'une station nomme le projet qu'elle en fait : celui du dépôt, en minuscules
// (runtime/src/projets-station/README.md, `nomDuDepot`).
/** @param {string} depot */
const nomDuChoisi = (depot) => (depot.split("/").pop() ?? depot).toLowerCase();

// Les projets qu'une machine appairée et enregistrée sert, calculés en un seul endroit : ceux de sa présence — la
// configuration qu'elle fait tourner —, puis ceux qui lui sont choisis dans son enregistrement et que sa présence ne nomme
// pas encore (elle les prend en main dans les 30 s). Rien de choisi, ou rien encore : ceux de sa présence.
/** @param {readonly string[]} projets @param {readonly string[] | null} selection */
export function projetsServis(projets, selection) {
  const tenus = new Set(projets.map((projet) => projet.toLowerCase()));
  return [...projets, ...(selection ?? []).filter((depot) => !tenus.has(nomDuChoisi(depot)))];
}

// La ligne d'une machine appairée, ce que son enregistrement lui choisit fondu dedans : ses projets sont `projetsServis`.
// Elle sert alors des projets : ni « runs no kitchen », ni la raison « not added to any project », ni la note qui dit
// qu'attendre sans projet est normal. Son état reste celui de sa présence. Une ligne qui ne dit pas ses projets (illisible,
// téléphone) est rendue telle quelle.
/**
 * @template {{ dit: string, raison?: { cle: string }, note?: string }} L
 * @param {L} ligne @param {readonly string[]} projets — ceux de sa présence @param {StationEnregistree | undefined} enregistree
 * @returns {L}
 */
export function ligneFondue(ligne, projets, enregistree) {
  const servis = projetsServis(projets, enregistree?.selection ?? null);
  if (servis.length === projets.length) return ligne;
  const morceaux = ligne.dit.split(" · ");
  const dits = projets.length === 0 ? ["runs no kitchen", "no project"] : [projets.join(", ")];
  if (!dits.includes(morceaux.at(-1) ?? "")) return ligne;
  const { raison, note, ...reste } = ligne;
  return /** @type {L} */ ({
    ...reste,
    dit: [...morceaux.slice(0, -1), servis.join(", ")].join(" · "),
    ...(raison === undefined || raison.cle === "sans-projet" ? {} : { raison }),
    ...(note === undefined || projets.length === 0 ? {} : { note }),
  });
}

// Les projets du chef parmi les dépôts que son compte atteint, dans l'ordre où GitHub les rend : ceux que la brigade
// connaît (`connus`) — par leur dépôt, ou, connus par leur seul nom, par celui que le dépôt donne au projet —, sans égard à
// la casse, comme GitHub.
/** @param {readonly string[]} depots @param {readonly string[]} connus */
export function projetsDuChef(depots, connus) {
  const parDepot = new Set(connus.filter((connu) => connu.includes("/")).map((connu) => connu.toLowerCase()));
  const parNom = new Set(connus.filter((connu) => !connu.includes("/")).map((connu) => connu.toLowerCase()));
  return depots.filter((depot) => parDepot.has(depot.toLowerCase()) || parNom.has(nomDuChoisi(depot)));
}

// Les cases d'une station : les projets du chef parmi les dépôts du compte, puis ceux qu'elle sert et qu'ils ne nomment
// pas — encore décochables. Les autres dépôts du compte n'en ont pas : ils se cherchent (`trouvesDe`).
/** @param {readonly string[]} depots @param {readonly string[] | null} selection @param {readonly string[]} [connus] */
export function casesDe(depots, selection, connus = []) {
  return [...new Set([...projetsDuChef(depots, [...connus, ...(selection ?? [])]), ...(selection ?? [])])];
}

// Ce que la recherche trouve : les dépôts du compte qui n'ont pas encore leur case et dont le nom contient le texte tapé,
// sans égard à la casse. Rien de tapé : rien — la liste entière ne se montre jamais.
/** @param {readonly string[]} depots @param {readonly string[]} cases @param {string} texte */
export function trouvesDe(depots, cases, texte) {
  const cherche = texte.trim().toLowerCase();
  if (cherche === "") return [];
  const prises = new Set(cases.map((une) => une.toLowerCase()));
  return depots.filter((depot) => !prises.has(depot.toLowerCase()) && depot.toLowerCase().includes(cherche));
}

// Les projets que la brigade connaît, vus du bloc : ceux que la vue lui donne, ceux que les stations du compte se sont vu
// choisir, et ceux que le chef a ajoutés par la recherche.
/** @param {EtatDuCompte} etat */
function connusDe(etat) {
  const choisis = etat.stations?.state === "listed" ? etat.stations.stations.flatMap(({ selection }) => selection ?? []) : [];
  return [...(etat.connus ?? []), ...choisis, ...(etat.ajoutes ?? [])];
}

// La sélection qu'une case changée donne : la case ajoutée ou ôtée, dans l'ordre des cases.
/** @param {readonly string[]} cases @param {readonly string[] | null} selection @param {string} depot @param {boolean} cochee */
export function selectionApres(cases, selection, depot, cochee) {
  const tenue = new Set(selection ?? []);
  if (cochee) tenue.add(depot);
  else tenue.delete(depot);
  return cases.filter((une) => tenue.has(une));
}

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Le ton et sa forme, comme partout dans la vue (vue.js, `pastille`) : un disque plein, un anneau creux.
/** @param {Fabrique} doc @param {boolean} disponible */
function pastilleDe(doc, disponible) {
  const pose = cree(doc, "span");
  pose.className = "pastille";
  pose.dataset.ton = disponible ? "vert" : "gris";
  pose.dataset.forme = disponible ? "disque" : "anneau";
  pose.title = disponible ? EN_LIGNE : HORS_LIGNE;
  return pose;
}

// Le dernier signe de vie d'une station, à la minute, en temps universel.
/** @param {string} instant */
const vueDit = (instant) => `last sign of life ${instant.slice(0, 16).replace("T", " ")} UTC`;

// Ce que la plateforme, la machine, la version et le dernier signe de vie d'une station disent d'elle, au survol.
/** @param {StationEnregistree} station */
export const detailsDe = (station) => [plateformeDite(station.platform), station.machine, `version ${station.version}`, vueDit(station.lastSeen)].filter((morceau) => morceau !== "").join(" · ");

// La ligne d'une station : toute la ligne est le bouton qui ouvre sa page, comme une ligne de l'accueil (vue.js,
// `ligneDAccueil`), avec la même flèche ; elle dit, comme elle, en ligne ou non, puis les projets qu'elle sert. Ses
// détails sont au survol ; ses cases à cocher sont sur sa page.
/** @param {Fabrique} doc @param {StationEnregistree} station @param {GestesDuCompte} geste */
function ligneDe(doc, station, geste) {
  const dit = `${station.available ? EN_LIGNE : HORS_LIGNE} · ${sertDit(station.selection)}`;
  const ligne = cree(doc, "button");
  ligne.type = "button";
  ligne.className = "ligne";
  ligne.title = detailsDe(station);
  ligne.ariaLabel = `${station.name} — ${dit}`;
  ligne.dataset.station = station.id;
  const nom = cree(doc, "strong", station.name);
  nom.className = "mono";
  const suite = cree(doc, "span", "›");
  suite.className = "ouvrir";
  suite.ariaHidden = "true";
  ligne.append(pastilleDe(doc, station.available), nom, cree(doc, "span", dit), suite);
  ligne.addEventListener("click", () => geste.ouvrirLaStation(station.id));
  return ligne;
}

// Les cases d'une station, sur sa page : un projet du chef par case, cochée s'il est dans sa sélection ; dessous, le champ
// qui cherche parmi les autres dépôts du compte, et ce qu'il trouve, un bouton chacun. Une écriture en route : les cases
// et les boutons attendent qu'elle ait répondu. Une écriture refusée le dit sous les cases, en une ligne.
/** @param {Fabrique} doc @param {StationEnregistree} station @param {EtatDuCompte} etat @param {GestesDuCompte} geste */
export function projetsDe(doc, station, etat, geste) {
  const choix = cree(doc, "fieldset");
  choix.className = "projets-de-la-station";
  choix.ariaLabel = `${PROJETS}: ${station.name}`;
  choix.append(cree(doc, "legend", PROJETS));
  if (!station.available) {
    const absente = cree(doc, "p", EN_SON_ABSENCE);
    absente.className = "note";
    choix.append(absente);
  }
  const { depots } = etat;
  if (depots === undefined) {
    const lecture = cree(doc, "p", LECTURE_DES_DEPOTS);
    lecture.className = "vide";
    choix.append(lecture);
  } else if ("refus" in depots) {
    choix.append(lectureIndisponible(doc, DEPOTS_ILLISIBLES, depots.refus));
  }
  const atteints = depots !== undefined && "depots" in depots ? depots.depots.map(({ depot }) => depot) : [];
  const cases = casesDe(atteints, station.selection, connusDe(etat));
  const enRoute = etat.envoi === station.id;
  if (cases.length === 0 && depots !== undefined && "depots" in depots) {
    const vide = cree(doc, "p", atteints.length === 0 ? SANS_DEPOT : SANS_PROJET);
    vide.className = "vide";
    choix.append(vide);
  }
  if (cases.length > 0) {
    const liste = cree(doc, "div");
    liste.className = "capacites";
    /** @type {string[]} */
    const refus = [];
    for (const depot of cases) {
      const cochee = (station.selection ?? []).includes(depot);
      // Ce que la station en a fait, tant qu'il est coché : une cuisine rejointe, un refus, ou sa réponse attendue.
      const issue = cochee ? issueDeLAjout(station, depot) : undefined;
      const attendu = cochee && issue === undefined && etat.attendus?.id === station.id && etat.attendus.depots.includes(depot);
      const dit = issue?.issue === "rejointe" ? REJOINTE(issue.principale) : issue?.issue === "refusee" ? REFUSEE : attendu ? DEMANDEE : "";
      if (issue?.issue === "refusee") refus.push(issue.phrase);
      const coche = caseACocher(doc, { nom: depot, dit, cochee, mono: true }, (voulue) => geste.choisir(station.id, selectionApres(cases, station.selection, depot, voulue)));
      coche.children[0].disabled = enRoute;
      if (issue?.issue === "refusee") coche.classList.add("refusee");
      liste.append(coche);
    }
    choix.append(liste);
    for (const phrase of refus) {
      const dit = cree(doc, "p", phrase);
      dit.className = "refus";
      dit.role = "alert";
      choix.append(dit);
    }
  }
  if (atteints.length > 0) choix.append(rechercheDe(doc, station, atteints, cases, etat, geste));
  if (enRoute) {
    const envoi = cree(doc, "p", ENVOI);
    envoi.className = "note";
    envoi.role = "status";
    choix.append(envoi);
  }
  if (etat.refus?.id === station.id) choix.append(lectureIndisponible(doc, etat.refus.refus, etat.refus.detail ?? ""));
  return choix;
}

// Le champ qui cherche parmi les autres dépôts du compte, et ce qu'il trouve : un bouton par dépôt, au plus
// `TROUVES_AU_PLUS`, puis combien d'autres ; ou la ligne qui dit que rien ne correspond. Taper redessine ce qu'il trouve, à
// sa place, sans toucher au champ : il garde le clavier. Un dépôt cliqué est choisi pour la station.
/**
 * @param {Fabrique} doc @param {StationEnregistree} station @param {readonly string[]} atteints @param {readonly string[]} cases
 * @param {EtatDuCompte} etat @param {GestesDuCompte} geste
 */
function rechercheDe(doc, station, atteints, cases, etat, geste) {
  const bloc = cree(doc, "div");
  bloc.className = "recherche";
  const champ = /** @type {HTMLInputElement} */ (cree(doc, "input"));
  champ.type = "search";
  champ.ariaLabel = CHERCHER;
  champ.placeholder = `${CHERCHER} — ${CHERCHER_AIDE}`;
  champ.autocomplete = "off";
  champ.spellcheck = false;
  champ.dataset.recherche = station.id;
  champ.value = etat.recherche?.id === station.id ? etat.recherche.texte : "";
  const trouves = cree(doc, "div");
  trouves.className = "trouves";
  const enRoute = etat.envoi === station.id;
  const poser = () => {
    const texte = champ.value.trim();
    const tous = trouvesDe(atteints, cases, texte);
    trouves.replaceChildren(
      ...tous.slice(0, TROUVES_AU_PLUS).map((depot) => {
        const bouton = /** @type {HTMLButtonElement} */ (cree(doc, "button"));
        bouton.type = "button";
        bouton.className = "trouve";
        bouton.ariaLabel = `${AJOUTER} ${depot}`;
        bouton.title = `serve it on ${station.name}`;
        bouton.disabled = enRoute;
        const nom = cree(doc, "span", depot);
        nom.className = "mono";
        const ajoute = cree(doc, "span", AJOUTER);
        ajoute.className = "ajouter";
        bouton.append(nom, ajoute);
        bouton.addEventListener("click", () => geste.ajouter(station.id, depot, selectionApres([...cases, depot], station.selection, depot, true)));
        return bouton;
      }),
      ...(tous.length > TROUVES_AU_PLUS ? [cree(doc, "p", ET_ENCORE(tous.length - TROUVES_AU_PLUS))] : []),
      ...(texte !== "" && tous.length === 0 ? [cree(doc, "p", RIEN_NE_CORRESPOND(texte))] : []),
    );
    trouves.hidden = texte === "";
  };
  champ.addEventListener("input", () => {
    geste.chercher(station.id, champ.value);
    poser();
  });
  poser();
  bloc.append(champ, trouves);
  return bloc;
}

// Sans station : la phrase, puis la commande d'installation de chaque système, chacune avec son bouton qui la copie.
/** @param {Fabrique} doc @param {EtatDuCompte} etat @param {GestesDuCompte} geste */
function commentInstaller(doc, etat, geste) {
  const tete = cree(doc, "p", AUCUNE);
  tete.className = "attendu";
  tete.append(survol(doc, AUCUNE_AIDE));
  const lignes = INSTALLER.map(({ systeme, commande }) => {
    const ligne = cree(doc, "p");
    ligne.className = "installer";
    const code = cree(doc, "code", commande);
    const copier = boutonAction(doc, etat.copiee === commande ? COPIEE : COPIER, () => geste.copier(commande));
    copier.children[0].ariaLabel = `${COPIER}: ${systeme}`;
    ligne.append(cree(doc, "span", systeme), code, copier);
    return ligne;
  });
  return [tete, ...lignes, gestes(doc, [boutonAction(doc, RELIRE, geste.relire)])];
}

// La ligne d'une station seulement enregistrée, dans la liste des stations de l'accueil : un clic ouvre sa page.
/** @param {Fabrique} doc @param {StationEnregistree} station @param {GestesDuCompte} geste */
export function ligneDeLEnregistree(doc, station, geste) {
  return ligneDe(doc, station, geste);
}

// Ce que la lecture du compte dit sous la liste des stations, d'après ce que la vue en tient : rien tant qu'elle est en
// route ou que tout est listé ; la connexion qui manque, la lecture qui échoue, les enregistrements illisibles ; et,
// `vide` — la liste n'a aucune station —, comment en installer une. Aucun titre : ce n'est pas une seconde liste.
/** @param {Fabrique} doc @param {EtatDuCompte} etat @param {GestesDuCompte} geste @param {boolean} vide */
export function lectureDuCompte(doc, etat, geste, vide) {
  const { stations } = etat;
  if (stations === undefined) return [];
  if (stations.state === "sign-in-required") {
    const tete = phraseEtDetail(doc, "p", stations.reason, undefined);
    tete.className = "attendu";
    return [tete, ...connexionDite(doc, etat.connexion, stations.action.label, geste)];
  }
  if (stations.state === "unavailable") {
    const lien = stations.link;
    return [
      lectureIndisponible(doc, ILLISIBLES, [stations.reason, stations.detail ?? ""].filter((morceau) => morceau.trim() !== "").join("\n")),
      gestes(doc, [...(lien === undefined ? [] : [boutonAction(doc, boutonDeLaPage(lien), () => geste.ouvrirLaPage(lien), { recommande: true })]), boutonAction(doc, RELIRE, geste.relire, { recommande: lien === undefined })]),
    ];
  }
  if (stations.unreadable.length > 0) {
    const combien = stations.unreadable.length;
    return [
      lectureIndisponible(doc, `${combien} more station${combien > 1 ? "s" : ""} cannot be read`, stations.unreadable.map(({ id, reason }) => `${id}: ${reason}`).join("\n")),
      gestes(doc, [boutonAction(doc, RELIRE, geste.relire)]),
    ];
  }
  return vide ? commentInstaller(doc, etat, geste) : [];
}
