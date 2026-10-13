// @ts-check
// La vue : elle montre, elle ne tient rien. Les pty vivent dans le process
// principal ; ici, un xterm par terminal, gardé tant que l'app est ouverte —
// changer d'espace ou d'onglet ne fait que cacher l'un et montrer l'autre.
// À côté du terminal du second, les onglets de contenu — Rail, Cooks, Manager,
// Grants, Log : chacun la sortie d'une commande, lue tant qu'il est affiché. Et dans le
// panneau, ce que `status` dit du projet, telle quelle. Ce qui est un tableau à
// états est dessiné — une pastille par projet dans la barre, la carte de projet,
// le rail, la bannière d'arrêt — depuis les faits que la box rend comme des
// faits, et que le process principal a déjà mis en forme (faits.ts) : la vue
// pose un mot, un nombre, une couleur nommée, elle n'en calcule aucun. Près de ce qui se lit,
// des boutons : chacun écrit sa commande dans le second, et n'envoie rien —
// aucun n'agit par lui-même. La vue n'y lit rien —
// elle ne sait pas ce qu'est un ticket. Ce qui attend le chef lui arrive déjà
// mis à part (attend.ts) : elle le pose en tête, quel que soit l'onglet.
// Dans l'onglet Manager, l'état du manager se pose au-dessus du texte — allumé ou éteint,
// depuis quand et par qui, ses dernières décisions, ce qu'il a écarté et pourquoi —, déjà lu
// par le process principal (manager.ts). À côté, ses deux gestes, allumer et éteindre : allumer
// écrit sa commande dans un shell de l'espace, ouvert pour elle, et n'envoie rien ; éteindre est
// direct — sa commande part dans le second, s'il est libre, et sa sortie s'y lit (gestes.ts).
// « Allumer » engage : avec sa commande, au-dessus du shell où elle attend, se posent
// l'avertissement de la doc et deux nombres — les issues ouvertes, et celles qui portent
// `blocked-on-human` —, demandés à la box une fois le geste écrit (allumage.ts). Rien ne s'y confirme.
// Dans l'onglet Grants, de même, l'état des grants : lequel est actif, son échéance — la durée
// restante en tête, l'heure ensuite —, ses derniers usages, et ce qu'aucun grant n'autorise,
// déjà lus par le process principal (grants.ts). À côté de chaque grant, ses deux gestes,
// accorder et révoquer, écrits dans un shell comme ceux du manager : aucun ne demande rien de plus.
// La barre est faite d'icônes : « Tous les projets » en tête — la même lecture pour tous
// les projets d'un coup, et rien qui s'y clique —, un monogramme par projet, et
// en pied le « + » : l'écran d'ajout, où un projet s'installe sur sa box et se déclare
// dans l'app d'un seul geste. Ce qui manque à un champ, ce qui part vers la box et ce
// qu'elle en a rendu se décident dans le process principal (installation.ts) : la vue
// recueille, signale le champ qu'on lui nomme, et pose ce qu'on lui rend.
// Après l'ajout, la mise en service — amorcer le dépôt, merger, vérifier, démarrer — se
// suit dans l'espace du projet, en tête du panneau : ce qui s'y dit, ce qui s'y refuse et
// ce qui part vers la box se décident de même hors d'ici (service.ts).
// Dessous, « Retirer ce projet » : deux gestes, chacun sous son libellé — le retirer de
// l'app, qui n'envoie rien à sa box ; le désinstaller de sa box, qui montre d'abord le
// plan qu'elle rend, et ne part qu'une fois son nom écrit. Là encore la vue pose : ce qui
// se refuse, ce qui part et ce qui s'en dit se décident dans retrait.ts.
// Et, sous l'état, les pages servies : un geste par serveur que `status` montre, qui ouvre
// sa page dans le navigateur du poste — ou ce qui se lit à sa place. La vue ne montre aucune
// page et ne recueille aucun avis ; quel port, quelle adresse, et pourquoi pas, se décident
// dans page.ts.
// Juste au-dessus de ce qui attend le chef, la version du runtime : à jour, en attente — depuis
// quand, combien de livraisons ne sont pas en service —, ou pas comparée. En attente, le geste
// « mettre en service » s'offre là : il ne fait que montrer les cooks en vol, ce qu'ils ont déjà
// dépensé, et deux choix — attendre le rail calme, ou couper. Chaque choix écrit sa commande dans
// un shell, et n'envoie rien (gestes.ts). Une mise en service qui a échoué s'y lit aussi. Ce qui
// se dit, ce qui s'offre et ce qui s'écrit se décident dans version.ts : la vue pose.
// En tête de « Tous les projets », le code de l'app lui-même : à jour, ou en retard sur
// l'origine de son clone — et de combien de commits —, avec l'heure de sa lecture ; de même
// pour le clone d'un projet qui est celui de brigade. En retard, un bouton écrit `git pull`
// dans un shell, et n'envoie rien : l'app ne met rien à jour. Ce qui se lit, ce qui s'en dit
// et ce qui s'écrit se décident dans retard.ts.
// La peau, enfin : la vue n'écrit ni couleur ni police — elles sont dans jetons.css, et le terminal
// y lit les siennes. Elle dit seulement ce qu'un texte est : ce qui se recopie tel quel (`exact`),
// ce que l'app dit elle-même (`propos`), et — tout le reste d'un `pre` — ce que la box a rendu,
// posé mot pour mot.
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as Xterm } from "@xterm/xterm";

/** @typedef {import("../terminaux.ts").Terminal} Terminal */
/** @typedef {import("../barre.ts").Affichee} Configuration */
/** @typedef {Configuration["projets"][number]} Projet */
/** @typedef {import("../attend.ts").Montree} Montree */
/** @typedef {import("../box.ts").Lecture} Lecture */
/** @typedef {import("../faits.ts").Dessinable} Dessinable */
/** @typedef {import("../page.ts").Pages} Pages */
/** @typedef {import("../manager.ts").Vu} VuDuManager */
/** @typedef {import("../grants.ts").Vu} VuDesGrants */
/** @typedef {import("../allumage.ts").Compte} Compte */
/** @typedef {import("../service.ts").Parcours} Parcours */
/** @typedef {import("../retrait.ts").Retrait} Retrait */
/** @typedef {import("../retard.ts").Vu} VuDuCode */

const brigade = window.brigade;

// Le geste de poste d'un projet, tel que les boutons l'écrivent (boutons.ts) :
// `ssh <hote> brigade <nom> <commande>`, avec son hôte et son nom — ce qui
// s'affiche se recopie. Le renderer ne charge pas boutons.ts : les deux citations
// y sont reprises, au mot près. Un projet sans box n'a pas d'hôte : le geste
// générique reste, c'est ce que son panneau dit qu'il manque.
/** @param {string} texte */
const mot = (texte) => (/^[A-Za-z0-9@._:-]+$/.test(texte) ? texte : `'${texte.replaceAll("'", `'\\''`)}'`);
/** @param {string} nom */
const cite = (nom) => (/^[a-z0-9-]+$/.test(nom) ? nom : `'${nom.replaceAll("'", `'\\''`)}'`);
/** @param {Projet} projet @param {string} commande */
const geste = (projet, commande) => `ssh ${projet.box === undefined ? "<hote>" : mot(projet.box.hote)} brigade ${mot(cite(projet.nom))} ${commande}`;
// Le geste que faits.ts écrit, n'ayant pas le projet : la vue le pose sur le sien.
/** @param {Projet} projet @param {string} texte */
const surMesure = (projet, texte) => texte.replaceAll("ssh <hote> brigade <nom> ", `${geste(projet, "")}`);
/** @param {string} nom */
const projetDe = (nom) => configuration.projets.find((projet) => projet.nom === nom);

/** @template {HTMLElement} T @param {string} id @returns {T} */
const element = (id) => /** @type {T} */ (document.getElementById(id));
const barre = element("projets");
const tous = element("tous");
const principal = /** @type {HTMLElement} */ (document.querySelector("main"));
const arret = element("arret");
const espace = element("espace");
const onglets = element("onglets");
const contenu = element("contenu");
const rail = element("rail");
const manager = element("manager");
const grants = element("grants");
const luOnglet = element("lu-onglet");
const lectureOnglet = element("lecture-onglet");
const gestesOnglet = element("gestes-onglet");
const gestesEtat = element("gestes-etat");
const gestesCuisine = element("gestes-cuisine");
const pages = element("pages");
const version = element("version");
const note = element("note");
const engage = element("engage");
const zone = element("terminaux");
const message = element("message");
const etat = element("etat");
const service = /** @type {HTMLDetailsElement} */ (element("service"));
const serviceTitre = element("service-titre");
const serviceEtapes = element("service-etapes");
const retrait = /** @type {HTMLDetailsElement} */ (element("retrait"));
const retraitTitre = element("retrait-titre");
const retraitGestes = element("retrait-gestes");
const avis = element("avis");
const carte = element("carte");
const lu = element("lu");
const lecture = element("lecture");
const ajout = element("ajout");
const formulaire = /** @type {HTMLFormElement} */ (element("formulaire"));
const ou = element("ou");
const choisi = element("choisi");
const nom = /** @type {HTMLInputElement} */ (element("nom"));
const depot = /** @type {HTMLInputElement} */ (element("depot"));
const hote = /** @type {HTMLSelectElement} */ (element("hote"));
const box = /** @type {HTMLInputElement} */ (element("box"));
const sauvegardes = /** @type {HTMLInputElement} */ (element("sauvegardes"));
const envoi = /** @type {HTMLButtonElement} */ (element("installer"));
const issueAjout = element("issue-ajout");
// Les quatre listes du calibrage, par le nom de leur champ.
const CALIBRAGE = /** @type {const} */ (["manager-modele", "manager-effort", "reviewer-modele", "reviewer-effort"]);
/** @param {typeof CALIBRAGE[number]} champ */
const calibre = (champ) => /** @type {HTMLSelectElement} */ (element(champ));
const relecture = element("relecture");
// En tête de « Tous les projets » : le retard du code de l'app, et des clones de brigade.
const code = document.createElement("section");
code.id = "code";
code.ariaLive = "polite";

/** @type {Map<number, { terminal: Terminal, xterm: Xterm, ajuste: FitAddon, cadre: HTMLDivElement }>} */
const vues = new Map();
// L'onglet où chaque projet a été laissé — un terminal, ou un onglet de contenu : on y revient.
/** @type {Map<string, number | string>} */
const laisse = new Map();
// Les shells fermés : ce qu'ils écrivent encore en mourant n'a plus d'onglet.
/** @type {Set<number>} */
const fermes = new Set();
// Aucun : c'est « Tous les projets » qui est affiché — ou l'écran d'ajout.
/** @type {Projet | undefined} */
let courant;
let ajoute = false;
// Le dossier choisi pour le projet à ajouter, et le dépôt que l'app y a lu.
let dossier = "";
let depotLu = "";
// La dernière demande de lecture : une par écran affiché, et seules ses lectures s'affichent.
let demande = 0;
// L'onglet de contenu dont la commande est lue, et sa demande. Indéfini : à relire.
/** @type {string | undefined} */
let suivi = "";
let demandeOnglet = 0;
// Les onglets de contenu, dits par le process principal au démarrage (onglets.ts).
/** @type {readonly import("../onglets.ts").Onglet[]} */
let ONGLETS = [];
// Les boutons d'action, dits de même (boutons.ts) : la vue les pose, elle ne sait pas ce qu'ils écrivent.
/** @type {readonly import("../boutons.ts").Bouton[]} */
let BOUTONS = [];
// Les deux gestes du manager, dits de même (manager.ts) : la vue les nomme, elle ne sait pas ce qu'ils écrivent.
/** @type {readonly { id: string, libelle: string }[]} */
let GESTES_DU_MANAGER = [];
// Ce qu'engage l'allumage du manager, dit de même (allumage.ts) : le geste qui engage, et ce qui se pose avec lui.
/** @type {typeof import("../allumage.ts").ALLUMAGE | undefined} */
let ALLUMAGE;
// Les shells où « allumer » a écrit sa commande, et ce que la box a compté pour chacun.
// Sans `compte` : la lecture est en cours. Nul : elle n'a pas pu être demandée.
/** @type {Map<number, { projet: string, compte?: Compte | null }>} */
const engages = new Map();
// Ce que la dernière lecture de l'onglet Manager donne à poser. Indéfini : pas encore lu depuis
// que l'onglet est affiché — rien ne reste de ce qui s'y lisait avant.
/** @type {VuDuManager | undefined} */
let managerVu;
// Les trois gestes de la cuisine et de l'installation, dits de même (cuisine.ts) : à côté de l'état que `status` rend.
/** @type {readonly { id: string, libelle: string }[]} */
let GESTES_DE_LA_CUISINE = [];
// Les deux gestes d'un grant, dits de même (grants.ts), et les grants que la doc nomme (gestes.ts) :
// sans état lu, c'est pour ceux-là que les gestes restent offerts.
/** @type {readonly { id: string, libelle: string }[]} */
let GESTES_DES_GRANTS = [];
/** @type {readonly string[]} */
let GRANTS_NOMMES = [];
// Les gestes directs, dits de même (gestes.ts) : leur clic n'écrit pas dans un shell, il fait
// partir la commande dans le second — ou dit pourquoi elle ne part pas. La vue ne le décide pas.
/** @type {readonly string[]} */
let DIRECTS = [];
// Ce que la dernière lecture de l'onglet Grants donne à poser. Indéfini : pas encore lu depuis
// que l'onglet est affiché — rien ne reste de ce qui s'y lisait avant, ni la durée qui restait.
/** @type {VuDesGrants | undefined} */
let grantsVus;
// Pourquoi le dernier bouton cliqué n'a rien écrit : dit sous les onglets, jusqu'au prochain geste.
let nonEcrit = "";
// La bannière d'arrêt, dite de même (faits.ts) : ce qu'elle dit, et le bouton qui écrit la relance.
/** @type {typeof import("../faits.ts").BANNIERE | undefined} */
let BANNIERE;
// Dans « Tous les projets », la carte, l'en-tête et le corps de chaque projet.
/** @type {Map<string, { carte: HTMLElement, tete: HTMLElement, corps: HTMLElement }>} */
const blocs = new Map();
// Ce que `faits` a rendu en dernier pour chaque projet, et la demande à laquelle il répond :
// une par barre posée. Sans entrée, le projet n'a pas encore été lu.
/** @type {Map<string, Dessinable>} */
const tenus = new Map();
let demandeFaits = 0;
// Dans la barre, la pastille de chaque projet qui a une box.
/** @type {Map<string, HTMLElement>} */
const pastilles = new Map();
// Le projet dont le geste « mettre en service » est ouvert sur ses deux choix : rien n'est écrit
// tant que le chef n'a pas pris l'un des deux. Vide : il est refermé.
let aMettre = "";
// Le projet dont la mise en service est posée dans le panneau : la reposer ne la replie ni ne la déplie.
let misEnService = "";
// Celui dont les deux gestes de retrait sont posés : les reposer ne les replie pas, et ne
// perd ni le nom que le chef est en train d'écrire pour confirmer, ni pourquoi il n'a pas été retiré de l'app.
let retraitPose = "";
let confirmation = "";
// Le plan sous lequel ce nom a été écrit, par l'instant où la box l'a rendu : un nom écrit
// devant un plan ne confirme pas le suivant.
let planConfirme = "";
let nonRetire = "";
// Ce que la dernière lecture des clones donne à poser (retard.ts). Indéfini : pas encore lus.
/** @type {VuDuCode | undefined} */
let codeVu;
// Pourquoi la dernière mise à jour demandée n'a pas été écrite : dit sous les clones, jusqu'à la prochaine.
let nonMisAJour = "";

// La peau du terminal vient des jetons, comme le reste (jetons.css) : ni couleur ni police ne s'écrit ici.
/** @param {string} nom */
const jeton = (nom) => getComputedStyle(document.documentElement).getPropertyValue(nom).trim();

/** @param {number} id */
function vue(id) {
  let tenue = vues.get(id);
  if (tenue === undefined) {
    const xterm = new Xterm({ fontFamily: jeton("--police-mono"), fontSize: 13, theme: { background: jeton("--terminal"), foreground: jeton("--texte-terminal"), cursor: jeton("--texte") } });
    const ajuste = new FitAddon();
    const cadre = document.createElement("div");
    cadre.hidden = true;
    zone.append(cadre);
    xterm.loadAddon(ajuste);
    xterm.open(cadre);
    xterm.onData((donnees) => brigade.ecrire(id, donnees));
    xterm.onResize(({ cols, rows }) => brigade.redimensionner(id, cols, rows));
    /** @type {Terminal} */
    const terminal = { id, projet: "", genre: "shell", titre: "", note: "", arrete: false };
    tenue = { terminal, xterm, ajuste, cadre };
    vues.set(id, tenue);
  }
  return tenue;
}

const duCourant = () => [...vues.values()].filter(({ terminal }) => terminal.projet === courant?.nom);
const actif = () => (courant === undefined ? undefined : laisse.get(courant.nom));

function montrer() {
  const visible = actif();
  const relaye = ONGLETS.find(({ id }) => id === visible);
  for (const { terminal, cadre } of vues.values()) cadre.hidden = terminal.id !== visible;

  /** @param {string} titre @param {number | string | undefined} id */
  const onglet = (titre, id) => {
    const cree = bouton(titre, () => activer(id));
    cree.role = "tab";
    cree.ariaSelected = String(id === visible);
    return cree;
  };
  const ouvrable = courant !== undefined && courant.refus === undefined;
  const terminaux = duCourant().map(({ terminal }) => terminal);
  // Le second, les cinq onglets de contenu, puis les shells. Un projet qui ne
  // s'ouvre pas n'a pas de second : son onglet dit pourquoi — sa box, elle, se lit.
  espace.textContent = courant?.nom ?? "";
  onglets.replaceChildren(
    ...(courant === undefined
      ? []
      : [
          ...(ouvrable ? terminaux.filter(({ genre }) => genre === "second").map(({ titre, id }) => onglet(titre, id)) : [onglet("Second", undefined)]),
          ...ONGLETS.map(({ titre, id }) => onglet(titre, id)),
          ...terminaux.filter(({ genre }) => genre !== "second").map(({ titre, id }) => onglet(titre, id)),
          ...(ouvrable ? [bouton("+ shell", ouvrirShell)] : []),
        ]),
  );

  const montree = typeof visible === "number" ? vues.get(visible) : undefined;
  note.textContent =
    nonEcrit !== "" ? nonEcrit : relaye === undefined ? (montree?.terminal.note ?? "") : courant?.desinstalle !== undefined ? "rien n'est lu pour cet onglet : ce projet est désinstallé de sa box" : `${relaye.id === "rail" ? "le rail dessiné, puis " : relaye.id === "manager" ? "l'état du manager, puis " : relaye.id === "grants" ? "l'état des grants, puis " : ""}la sortie de \`${courant === undefined ? "" : geste(courant, relaye.commande)}\`, telle que la box la rend${relaye.precision === undefined ? "" : ` (${relaye.precision})`} — relue seule toutes les trente secondes, tant que cet onglet est affiché`;
  zone.hidden = !ouvrable || relaye !== undefined;
  contenu.hidden = relaye === undefined;
  message.hidden = ouvrable || relaye !== undefined;
  poserGestes(gestesEtat, "etat");
  poserGestes(gestesOnglet, relaye?.id);
  // Avant d'ajuster le terminal : ce qui se pose au-dessus de lui lui prend des lignes.
  poserEngagement(montree?.terminal.id);
  dessiner();
  lireOnglet();
  if (montree !== undefined) {
    montree.ajuste.fit();
    montree.xterm.focus();
  }
}

/** @param {string} texte @param {() => void} geste */
function bouton(texte, geste) {
  const cree = document.createElement("button");
  cree.textContent = texte;
  cree.addEventListener("click", geste);
  return cree;
}

// Un bouton qui porte sa commande : elle se lit telle qu'elle sera écrite, au caractère près.
/** @param {string} texte @param {() => void} geste */
function boutonDeCommande(texte, geste) {
  const cree = bouton(texte, geste);
  cree.className = "mono";
  return cree;
}

// Une entrée de la barre : deux caractères, et ce qu'ils désignent dit en entier
// au survol et à qui ne voit pas l'écran.
/** @param {string} signe @param {string} nom @param {() => void} geste */
function icone(signe, nom, geste) {
  const cree = bouton(signe, geste);
  cree.title = nom;
  cree.ariaLabel = nom;
  return cree;
}

// Les boutons d'un endroit — le panneau, ou l'onglet de contenu affiché. Un
// projet sans box n'en a pas : il n'y a pas de commande à écrire.
/** @param {HTMLElement} ou @param {string | undefined} endroit */
function poserGestes(ou, endroit) {
  const poses = courant?.box === undefined ? [] : BOUTONS.filter((pose) => pose.ou === endroit);
  ou.hidden = poses.length === 0;
  ou.replaceChildren(
    ...(poses.length === 0 ? [] : [bloc("span", "écrire dans le second, sans envoyer :")]),
    // Une commande qui attend sa suite le montre : le chef la tape avant Entrée.
    ...poses.map(({ id, commande }) => boutonDeCommande(commande.endsWith(" ") ? `${commande}…` : commande, () => void inscrire(id))),
  );
}

// Un bouton n'agit pas : sa commande s'écrit dans le second, que l'on montre —
// c'est sa note qui dit ce qui a été écrit, et que rien n'est parti. Un projet
// qui ne s'ouvre pas n'a pas de second : c'est sa raison qui est montrée.
/** @param {string} id */
async function inscrire(id) {
  const projet = courant;
  if (projet === undefined) return;
  if (projet.refus !== undefined) return activer(undefined);
  nonEcrit = "";
  try {
    const rendu = await brigade.inscrire(projet.nom, id);
    if (rendu === undefined) return;
    if ("refus" in rendu) {
      nonEcrit = rendu.refus;
    } else {
      recevoir(rendu);
      // Comme pour un shell : le chef a pu changer d'espace entre-temps.
      laisse.set(projet.nom, rendu.id);
    }
  } catch (erreur) {
    // Le projet a pu quitter le fichier entre l'affichage du bouton et le clic.
    nonEcrit = `rien n'est écrit : ${erreur instanceof Error ? erreur.message : String(erreur)}`;
  }
  montrer();
}

// Une carte de T'attend n'agit pas non plus : elle écrit une demande en prose dans le second, que
// l'on montre, et rien ne l'envoie — c'est le second qui lit l'issue, explique et répond (demande.ts).
/** @param {number} ticket */
async function demander(ticket) {
  const projet = courant;
  if (projet === undefined) return;
  if (projet.refus !== undefined) return activer(undefined);
  nonEcrit = "";
  try {
    const rendu = await brigade.demander(projet.nom, ticket);
    if (rendu === undefined) nonEcrit = `rien n'est écrit : le bloc \`attend\` ne nomme plus #${ticket}`;
    else if ("refus" in rendu) nonEcrit = rendu.refus;
    else {
      recevoir(rendu);
      laisse.set(projet.nom, rendu.id);
    }
  } catch (erreur) {
    nonEcrit = `rien n'est écrit : ${erreur instanceof Error ? erreur.message : String(erreur)}`;
  }
  montrer();
}

// Les gestes d'un endroit, chacun sous ce que son clic fait : ceux qui s'écrivent dans un shell
// et n'envoient rien, puis les directs, qui partent dans le second (gestes.ts).
/** @param {readonly { id: string, libelle: string }[]} gestes */
function boutonsDesGestes(gestes) {
  const ecrits = gestes.filter(({ id }) => !DIRECTS.includes(id));
  const directs = gestes.filter(({ id }) => DIRECTS.includes(id));
  /** @param {readonly { id: string, libelle: string }[]} poses */
  const boutons = (poses) => poses.map(({ id, libelle }) => bouton(libelle, () => void ecrireGeste(id)));
  return [
    ...(ecrits.length === 0 ? [] : [bloc("span", "écrire dans un shell de l'espace, sans envoyer :"), ...boutons(ecrits)]),
    ...(directs.length === 0 ? [] : [bloc("span", "envoyer dans le second — part aussitôt, s'il est libre :"), ...boutons(directs)]),
  ];
}

// Un geste n'agit pas non plus : sa commande s'écrit dans un shell de l'espace, ouvert pour
// elle, que l'on montre — c'est sa note qui dit ce qui a été écrit, et que rien n'est parti.
// Un projet qui ne s'ouvre pas n'a pas de shell : la raison se lit sous les onglets, là où l'on est.
// Un geste direct, lui, part : sa commande est envoyée dans le second, que l'on montre — sa
// sortie s'y lit, et sa note dit ce qui est parti. Le second n'est pas libre : rien n'y est
// écrit, et la raison se lit de même sous les onglets — occupé, la commande n'est pas partie.
// `grant` : celui sur lequel porte un geste de grant.
/** @param {string} id @param {string} [grant] */
async function ecrireGeste(id, grant) {
  const projet = courant;
  if (projet === undefined) return;
  nonEcrit = "";
  try {
    const rendu = await brigade.geste(projet.nom, id, grant);
    if (rendu === undefined) return;
    if ("refus" in rendu) {
      nonEcrit = rendu.refus;
    } else {
      recevoir(rendu);
      // Comme pour un shell : le chef a pu changer d'espace entre-temps.
      laisse.set(projet.nom, rendu.id);
      // La commande est écrite : ce qu'elle engage se chiffre à côté, sans la retenir.
      if (id === ALLUMAGE?.geste) void chiffrer(projet.nom, rendu.id);
    }
  } catch (erreur) {
    nonEcrit = `rien n'est écrit : ${erreur instanceof Error ? erreur.message : String(erreur)}`;
  }
  montrer();
}

// « Allumer » vient d'écrire sa commande dans ce shell : l'avertissement s'y pose aussitôt, et
// les deux nombres sont demandés à la box — ils le rejoignent quand elle répond. Rien n'attend
// cette lecture : le chef peut déjà lire sa commande, la corriger, faire Entrée ou l'effacer.
/** @param {string} projet @param {number} terminal */
async function chiffrer(projet, terminal) {
  engages.set(terminal, { projet });
  const compte = await brigade.compter(projet).catch(() => undefined);
  // Le shell a pu se fermer entre-temps : il n'y a plus où le dire.
  if (!engages.has(terminal)) return;
  engages.set(terminal, { projet, compte: compte ?? null });
  // Affiché ailleurs, il se posera quand le chef reviendra sur ce shell.
  if (actif() === terminal) montrer();
}

// Ce qu'engage l'allumage, au-dessus du shell affiché quand c'est celui où « allumer » a écrit :
// l'avertissement de la doc, puis les deux nombres — ou, tant qu'ils ne sont pas là, pourquoi.
// Tout est déjà dit par le process principal (allumage.ts) : la vue pose, et rien ne s'y clique.
/** @param {number | undefined} terminal */
function poserEngagement(terminal) {
  const tenu = terminal === undefined ? undefined : engages.get(terminal);
  const projet = courant;
  engage.hidden = tenu === undefined || ALLUMAGE === undefined || projet === undefined;
  if (tenu === undefined || ALLUMAGE === undefined || projet === undefined) return engage.replaceChildren();
  const { compte } = tenu;
  const nombres = bloc("p", compte === undefined ? ALLUMAGE.enCours : compte === null ? ALLUMAGE.parti : "sans" in compte ? compte.sans : compte.dit);
  nombres.className = "nombres";
  engage.replaceChildren(
    bloc("strong", `⚠️ ${ALLUMAGE.titre}`),
    bloc("p", ALLUMAGE.avertissement),
    nombres,
    ...(compte === undefined || compte === null ? [] : [bloc("small", `d'après \`${geste(projet, ALLUMAGE.commande)}\`, lancée à ta place après le geste — lu à ${new Date(compte.a).toLocaleTimeString("fr-FR")}`)]),
    ...(compte === undefined || compte === null || !("sans" in compte) || compte.obtenu === "" ? [] : [bloc("pre", compte.obtenu)]),
    bloc("small", ALLUMAGE.suite),
  );
}

// Sans onglet à garder — celui d'un projet qui ne s'ouvre pas —, c'est sa raison qui revient.
/** @param {number | string | undefined} id */
function activer(id) {
  nonEcrit = "";
  if (courant !== undefined && id !== undefined) laisse.set(courant.nom, id);
  else if (courant !== undefined) laisse.delete(courant.nom);
  montrer();
}

// Seul l'onglet de contenu affiché est lu sur la box : en changer, passer à un
// terminal ou quitter l'espace arrête sa lecture. Rien ne reste de l'onglet d'avant.
function lireOnglet() {
  const relaye = ONGLETS.find(({ id }) => id === actif());
  const voulu = courant === undefined || relaye === undefined ? "" : JSON.stringify([courant.nom, relaye.id]);
  if (voulu === suivi) return;
  suivi = voulu;
  // L'état du manager lu avant n'est plus celui de cette lecture : il revient avec elle.
  managerVu = undefined;
  poserManager();
  // Celui des grants non plus.
  grantsVus = undefined;
  poserGrants();
  if (courant !== undefined && relaye !== undefined) attendre(courant, luOnglet, lectureOnglet);
  brigade.onglet(courant?.nom, relaye?.id, ++demandeOnglet);
}

/** @param {Terminal} terminal */
function recevoir(terminal) {
  vue(terminal.id).terminal = terminal;
}

async function ouvrirShell() {
  const projet = courant;
  if (projet === undefined) return;
  const shell = await brigade.shell(projet.nom);
  recevoir(shell);
  // Le chef a pu changer d'espace pendant que le shell s'ouvrait : il attend dans le sien.
  laisse.set(projet.nom, shell.id);
  montrer();
}

/** @param {string} balise @param {string} texte */
function bloc(balise, texte) {
  const cree = document.createElement(balise);
  cree.textContent = texte;
  return cree;
}

// Ce qui se recopie tel quel — un numéro de ticket, un identifiant de run, un port : en monospace,
// et c'est une information, pas un style. Rien d'autre ne l'est que ce que la box a rendu.
/** @param {string} balise @param {string} texte */
function exact(balise, texte) {
  const cree = bloc(balise, texte);
  cree.className = "mono";
  return cree;
}

// Ce que l'app dit elle-même, sur plusieurs lignes : ses mots, dans la police de l'interface et
// sans cadre — le cadre et le monospace d'un `pre` restent à ce que la box a rendu.
/** @param {string} texte */
function propos(texte) {
  const cree = bloc("pre", texte);
  cree.className = "propos";
  return cree;
}

// Le geste que l'app nomme quand une box jointe ne lui répond pas comme elle
// l'attend. Elle ne sait pas pourquoi : ce qu'elle a obtenu est affiché au-dessus.
const GESTE = [
  "La box a été jointe, et cette commande n'y a pas répondu comme l'app l'attend : d'ici, ce projet ne se pilote plus.",
  "Ce que l'app a obtenu est ci-dessus ; elle n'en sait pas plus.",
  "",
  "Le geste qui remet un runtime à niveau, sur sa box :",
  "  sudo git -C <clone de brigade> pull",
  "  sudo systemctl restart brigade@<projet>",
  "(docs/runtime.md, « Piloter », ligne « Mettre à jour »)",
].join("\n");

// Ce que l'app dit quand le geste de la box a refusé le projet : le nom qu'elle
// lui a donné, et d'où il vient. Le refus lui-même est au-dessus, mot pour mot.
/** @param {string} nom */
const inconnu = (nom) =>
  [
    "La box a été jointe, et son geste ne connaît pas ce projet : ce qu'il en a dit est ci-dessus.",
    `L'app lui a donné « ${nom} » — le « nom » du projet dans ${configuration.chemin}. C'est sous ce nom que la box doit le servir.`,
    "S'il a été désinstallé de cette box, c'est ce qui est attendu : il ne s'y pilote plus. « Retirer ce projet », dans le panneau de son espace, le retire de l'app.",
  ].join("\n");

// Ce que l'app dit quand le geste a refusé celui qui le lance. Elle nomme où
// est écrit le geste qui donne ce droit, et ne le rejoue pas : il se joue sur la box.
const SANS_DROIT = [
  "La box a été jointe, et son geste a refusé le compte par lequel ton `ssh` la joint : ce qu'il en a dit est ci-dessus.",
  "Ce n'est ni une panne ni un runtime à mettre à jour : c'est un droit qui manque à ce compte.",
  "",
  "Il se donne sur la box, par quelqu'un qui y a `sudo` — l'app ne le fait pas à ta place :",
  "(docs/installer.md, « Ajouter un humain »)",
].join("\n");

// Ce que l'app dit quand le code de la box est celui d'une commande absente.
// Elle ne sait pas laquelle : c'est la box qui la nomme, au-dessus.
/** @param {Projet} projet */
const commandeManque = (projet) => [
  "La box a été jointe, et une commande y manque : ce qu'elle en a dit est ci-dessus. L'app ne sait pas laquelle.",
  "Si c'est `brigade` qu'elle nomme, le geste n'y est pas posé ; si c'est `sudo`, il manque au geste pour passer sous le compte du service.",
  "",
  "L'un et l'autre se posent sur la box, en la préparant :",
  "(docs/installer.md, « Préparer la box »)",
  "",
  `Sur ton poste, \`brigade\` seul n'existe pas, et n'a pas à exister : le geste s'y tape ainsi, comme l'app l'écrit — \`${geste(projet, "status")}\`, par exemple.`,
].join("\n");

// Ce que l'app dit quand le geste a refusé le `node` de la box (code 70).
const NODE_INAPTE = [
  "La box a été jointe, et son geste a refusé de lancer le runtime : le `node` de la box ne lui convient pas. Ce qu'il en a dit est ci-dessus.",
  "",
  "Ce n'est pas le runtime qu'il faut mettre à jour : la phrase du geste dit le remède, et il se pose sur la box :",
  "(docs/installer.md, « Préparer la box »)",
].join("\n");

// Ce que l'app dit sous le message de `ssh`, quel qu'il soit : elle ne le lit
// pas, elle nomme où chacune de ses phrases est expliquée.
const SSH_EN_ECHEC = [
  "`ssh` n'a pas ouvert de session sur la box, et il a dit pourquoi : son message est ci-dessus. L'app ne le lit pas.",
  "Ce que chacune de ses phrases veut dire, et le geste qui y répond :",
  "(docs/installer.md, « Joindre la box »)",
  "",
  "S'il dit ta clé refusée (`Permission denied`), la box répond et c'est l'accès qui te manque. Il se donne sur la box :",
  "(docs/installer.md, « Ajouter un humain »)",
].join("\n");

// Ce que l'app dit quand `status` a répondu sans le bord qu'elle sait prendre.
// Elle ne sait pas si quelque chose attend : elle ne dit donc pas que rien n'attend.
/** @param {Projet} projet */
const sansBord = (projet) => [
  `Rien n'a pu être mis à part : la sortie de \`${geste(projet, "status")}\` n'a pas le bloc que l'app sait prendre — une seule ligne qui commence par \`attend\`, une seule ligne \`fin attend\`.`,
  "Ce n'est pas « rien ne t'attend » : ce qui t'attend, s'il y a quelque chose, est dans la sortie ci-dessous, entière.",
].join("\n");

// Ce qui attend le chef, en tête et à part : le bloc de `status`, tel qu'il l'a
// écrit — c'est lui qui dit quand rien n'attend. Sans bloc, l'app dit qu'elle n'a rien pris.
/** @param {Projet} projet @param {string | undefined} attend */
function aPart(projet, attend) {
  const cree = document.createElement("section");
  cree.className = "attend";
  cree.dataset.pris = String(attend !== undefined);
  cree.append(bloc("h3", `ce qui t'attend — le bloc \`attend\` de \`${geste(projet, "status")}\``), attend === undefined ? propos(sansBord(projet)) : bloc("pre", attend));
  return cree;
}

// Ce que l'app a obtenu d'une lecture en échec, et dessous ce qu'elle en dit :
// le code de sortie choisit le renvoi, le texte n'est jamais traduit. Sans
// message de `ssh` — pas lancé, ou arrêté au délai — il n'y a rien à aller lire.
/** @param {Projet} projet @param {import("../box.ts").Echec & { projet: string }} recue @param {string} plusPilotable ce qui se dit d'une box jointe dont le code ne dit aucun cas */
function obtenu(projet, recue, plusPilotable) {
  const suite =
    recue.cas === "projet-inconnu"
      ? inconnu(recue.projet)
      : recue.cas === "sans-droit"
        ? SANS_DROIT
        : recue.cas === "commande-manque"
          ? commandeManque(projet)
          : recue.cas === "node-inapte"
            ? NODE_INAPTE
            : recue.atteinte
              ? plusPilotable
              : recue.cas === "ssh-en-echec"
                ? SSH_EN_ECHEC
                : undefined;
  return [bloc("pre", recue.erreur), ...(suite === undefined ? [] : [propos(suite)])];
}

// Ce qu'une lecture donne à voir, dans « Tous les projets », à côté du terminal et dans
// un onglet de contenu : un des sept états, dit en toutes lettres, et dessous ce
// que l'app a obtenu. Celle d'un onglet n'a rien de mis à part : ce n'est pas `status`.
/** @param {Montree | Lecture} recue @param {HTMLElement} tete @param {HTMLElement} corps */
function rendre(recue, tete, corps) {
  // Le projet a pu quitter le fichier depuis la demande : il n'y a plus rien à lui écrire.
  const projet = projetDe(recue.projet);
  if (projet === undefined) return;
  const heure = new Date(recue.a).toLocaleTimeString("fr-FR");
  if ("sorties" in recue) {
    const mise = "attend" in recue;
    tete.dataset.etat = "pilotable";
    tete.textContent = `${mise ? "pilotable — " : ""}lu à ${heure}`;
    const sans = !mise || recue.attend === undefined ? "" : " — sans son bloc `attend`, mis à part ci-dessus";
    corps.replaceChildren(...(mise ? [aPart(projet, recue.attend)] : []), ...recue.sorties.flatMap(({ commande, texte }) => [bloc("h3", `${geste(projet, commande)}${commande === "status" ? sans : ""}`), bloc("pre", texte)]));
  } else if (recue.cas === "projet-inconnu") {
    tete.dataset.etat = "inconnu";
    tete.textContent = `JOINT, MAIS INCONNU DE LA BOX — essai de ${heure}, le prochain suit seul`;
  } else if (recue.cas === "sans-droit") {
    tete.dataset.etat = "sans-droit";
    tete.textContent = `JOINT, MAIS SANS LE DROIT DU GESTE — essai de ${heure}, le prochain suit seul`;
  } else if (recue.cas === "commande-manque") {
    tete.dataset.etat = "commande-manque";
    tete.textContent = `JOINT, MAIS UNE COMMANDE MANQUE SUR LA BOX — essai de ${heure}, le prochain suit seul`;
  } else if (recue.cas === "node-inapte") {
    tete.dataset.etat = "node-inapte";
    tete.textContent = `JOINT, MAIS LE NODE DE LA BOX NE CONVIENT PAS AU RUNTIME — essai de ${heure}, le prochain suit seul`;
  } else if (recue.atteinte) {
    tete.dataset.etat = "plus-pilotable";
    tete.textContent = `JOINT, MAIS PLUS PILOTABLE — essai de ${heure}, le prochain suit seul`;
  } else {
    tete.dataset.etat = "pas-joint";
    tete.textContent = `PAS JOINT — essai de ${heure}, le prochain suit seul`;
  }
  // Chaque état de pilotage a son ton, et sa forme : en niveaux de gris, ils ne se confondent pas.
  const ton = TONS_DE_PILOTAGE[tete.dataset.etat ?? ""];
  delete tete.dataset.ton;
  delete tete.dataset.forme;
  if (ton !== undefined) {
    tete.dataset.ton = ton;
    const forme = formeDe(ton);
    if (forme !== undefined) tete.dataset.forme = forme;
  }
  if ("erreur" in recue) corps.replaceChildren(...obtenu(projet, recue, GESTE));
}

// Ce qu'une vérification a donné : son verdict, l'heure, ce que l'app a obtenu — la sortie
// d'`installation` en entier, chaque manque avec sa flèche — et ce qu'elle en dit. Sans
// verdict, le même cas et le même renvoi que sous `status`.
/** @param {Projet} projet @param {Parcours["verification"]} verification */
function poserVerdict(projet, verification) {
  if (verification === undefined) return [];
  const tete = bloc("p", verification.etat === "en-cours" ? verification.titre : `${verification.titre} — vérifié à ${new Date(verification.a).toLocaleTimeString("fr-FR")}`);
  tete.className = "verdict";
  tete.dataset.verdict = verification.etat;
  if (verification.etat === "en-cours") return [tete];
  if (verification.etat === "sans-verdict") return [tete, ...obtenu(projet, { ...verification.echec, projet: projet.nom }, GESTE)];
  return [tete, bloc("pre", verification.obtenu), ...verification.suite.map((ligne) => bloc("p", ligne))];
}

// La mise en service du projet affiché, en tête du panneau : quatre gestes dans l'ordre,
// et un bouton inactif dit pourquoi il l'est. Rien, pour un projet sans box.
/** @param {Projet} projet @param {Parcours | undefined} parcours */
function poserService(projet, parcours) {
  // Le chef a pu changer d'espace pendant que la box répondait.
  if (courant?.nom !== projet.nom) return;
  service.hidden = parcours === undefined;
  if (parcours === undefined) return serviceEtapes.replaceChildren();
  // Entamée, elle s'ouvre d'elle-même ; ensuite, c'est le chef qui la replie.
  if (misEnService !== projet.nom) service.open = parcours.suivi;
  misEnService = projet.nom;
  serviceTitre.textContent = parcours.titre;

  /** @param {string} titre @param {(Node | string)[]} contenu */
  const etape = (titre, ...contenu) => {
    const cree = document.createElement("li");
    cree.append(bloc("strong", titre), ...contenu);
    return cree;
  };
  /** @param {string[]} textes */
  const lignes = (textes) => textes.map((texte) => bloc("p", texte));
  /** @param {string | undefined} raison */
  const refus = (raison) => {
    const cree = bloc("p", raison ?? "");
    cree.className = "refus";
    return raison === undefined ? [] : [cree];
  };

  const coche = document.createElement("input");
  coche.type = "checkbox";
  coche.checked = parcours.merge;
  coche.addEventListener("change", async () => poserService(projet, await brigade.direMerge(projet.nom, coche.checked)));
  const dit = document.createElement("label");
  dit.append(coche, `Le résultat de ${parcours.init} est mergé sur la branche d'intégration`);
  const verifier = bouton("Vérifier", () => void verifierService(projet));
  verifier.disabled = parcours.verifierRefuse !== undefined;
  const demarrer = bouton("Démarrer", () => void demarrerService(projet));
  demarrer.disabled = parcours.demarrerRefuse !== undefined;

  serviceEtapes.replaceChildren(
    etape("Amorcer le dépôt", ...lignes(parcours.amorce), bouton(`Lancer ${parcours.init} dans le second`, () => void amorcerService(projet))),
    etape("Merger", ...lignes(parcours.consigne), dit),
    etape("Vérifier", ...lignes(parcours.verifie), verifier, ...refus(parcours.verifierRefuse), ...poserVerdict(projet, parcours.verification)),
    etape("Démarrer", ...lignes(parcours.demarre), demarrer, ...refus(parcours.demarrerRefuse)),
  );
}

/** @param {Projet} projet */
async function lireService(projet) {
  poserService(projet, await brigade.service(projet.nom));
}

// Un geste de la mise en service a rendu un terminal — le second, pour la session
// d'init ; un shell, pour le démarrage — ou la raison pour laquelle rien n'est fait.
// Le terminal est montré : c'est sa note qui dit ce qui a été lancé, ou écrit.
/** @param {Projet} projet @param {Terminal | { refus: string }} rendu */
function suivreGeste(projet, rendu) {
  nonEcrit = "refus" in rendu ? rendu.refus : "";
  if (!("refus" in rendu)) {
    recevoir(rendu);
    laisse.set(projet.nom, rendu.id);
  }
  void lireService(projet);
  if (courant?.nom === projet.nom) montrer();
}

/** @param {Projet} projet */
async function amorcerService(projet) {
  suivreGeste(projet, await brigade.amorcer(projet.nom));
}

/** @param {Projet} projet */
async function demarrerService(projet) {
  suivreGeste(projet, await brigade.demarrer(projet.nom));
}

// La vérification part, et se dit en cours ; son verdict remplace ce qui était affiché.
/** @param {Projet} projet */
async function verifierService(projet) {
  const verifiee = brigade.verifier(projet.nom);
  await lireService(projet);
  poserService(projet, await verifiee);
}

// Ce qu'une demande faite à la box pour désinstaller a donné : son titre, l'heure, ce que
// l'app a obtenu — les phrases de la box, telles quelles — et ce que l'app en dit.
/** @param {import("../retrait.ts").Montre | undefined} montre */
function poserMontre(montre) {
  if (montre === undefined) return [];
  const tete = bloc("p", "a" in montre ? `${montre.titre} — à ${new Date(montre.a).toLocaleTimeString("fr-FR")}` : montre.titre);
  tete.className = "verdict";
  tete.dataset.verdict = montre.etat;
  return [tete, ...("obtenu" in montre ? [bloc("pre", montre.obtenu)] : []), ...("suite" in montre ? montre.suite.map((ligne) => bloc("p", ligne)) : [])];
}

// Retirer le projet affiché, sous la mise en service : deux gestes, chacun dans son bloc
// et sous son libellé. Le premier ne touche qu'à l'app. Le second, sur la box : la case
// du journal, le plan, le nom à écrire, puis le bouton — inactif tant que la box n'a pas
// rendu son plan, et il dit pourquoi.
/** @param {Projet} projet @param {Retrait | undefined} pose */
function poserRetrait(projet, pose) {
  // Le chef a pu changer d'espace pendant que la box répondait.
  if (courant?.nom !== projet.nom) return;
  retrait.hidden = pose === undefined;
  if (pose === undefined) return retraitGestes.replaceChildren();
  // Replié d'office : un projet ne se retire pas d'un clic perdu. Ensuite, c'est le chef qui le déplie.
  if (retraitPose !== projet.nom) {
    retrait.open = false;
    confirmation = "";
    planConfirme = "";
    nonRetire = "";
  }
  retraitPose = projet.nom;
  // Le plan affiché n'est plus celui devant lequel le nom a été écrit — redemandé, ou lâché
  // par la case du journal : ce nom ne vaut plus, il se récrit devant ce que la box dit maintenant.
  const plan = pose.desinstaller.geste?.plan;
  const rendu = plan?.etat === "plan" ? plan.a : "";
  if (rendu !== planConfirme) confirmation = "";
  planConfirme = rendu;
  retraitTitre.textContent = pose.titre;

  /** @param {string} titre @param {(Node | string)[]} contenu */
  const partie = (titre, ...contenu) => {
    const cree = document.createElement("section");
    cree.append(bloc("strong", titre), ...contenu);
    return cree;
  };
  /** @param {string[]} textes */
  const lignes = (textes) => textes.map((texte) => bloc("p", texte));
  /** @param {string | undefined} raison */
  const refus = (raison) => {
    const cree = bloc("p", raison ?? "");
    cree.className = "refus";
    return raison === undefined || raison === "" ? [] : [cree];
  };

  const retirer = bouton(pose.retirer.libelle, () => void retirerDeLApp(projet));
  const box = pose.desinstaller.geste;
  /** @type {(Node | string)[]} */
  let surLaBox = [];
  if (box !== undefined) {
    const coche = document.createElement("input");
    coche.type = "checkbox";
    coche.checked = box.journal.coche;
    coche.disabled = box.journal.refus !== undefined;
    coche.addEventListener("change", async () => poserRetrait(projet, await brigade.direJournal(projet.nom, coche.checked)));
    const option = document.createElement("label");
    option.append(coche, box.journal.libelle);
    const avertissement = lignes(box.journal.avertissement);
    for (const ligne of avertissement) ligne.className = "avertissement";
    const planifier = bouton(box.planifier, () => void planifierRetrait(projet));
    planifier.disabled = box.planifierRefuse !== undefined;
    const saisie = document.createElement("input");
    saisie.autocomplete = "off";
    saisie.spellcheck = false;
    saisie.value = confirmation;
    saisie.disabled = box.desinstallerRefuse !== undefined;
    saisie.addEventListener("input", () => (confirmation = saisie.value));
    const consigne = document.createElement("label");
    consigne.append(box.consigne, saisie);
    const desinstaller = bouton(pose.desinstaller.libelle, () => void desinstallerRetrait(projet));
    desinstaller.className = "sans-retour";
    desinstaller.disabled = box.desinstallerRefuse !== undefined;
    surLaBox = [option, ...avertissement, ...refus(box.journal.refus), planifier, ...refus(box.planifierRefuse), ...poserMontre(box.plan), consigne, desinstaller, ...refus(box.desinstallerRefuse), ...poserMontre(box.issue)];
  }
  retraitGestes.replaceChildren(partie(pose.retirer.libelle, ...lignes(pose.retirer.lignes), retirer, ...refus(nonRetire)), partie(pose.desinstaller.libelle, ...lignes(pose.desinstaller.lignes), ...surLaBox));
}

/** @param {Projet} projet */
async function lireRetrait(projet) {
  poserRetrait(projet, await brigade.retrait(projet.nom));
}

// Ce que l'app dit d'un projet qu'elle vient de retirer de sa liste : il n'a plus d'espace
// où le dire, c'est donc dit par-dessus l'écran, jusqu'à ce que le chef l'ait lu.
/** @param {import("../retrait.ts").Avis} dit */
function poserAvis(dit) {
  avis.replaceChildren(bloc("strong", dit.titre), ...dit.lignes.map((ligne) => bloc("p", ligne)), bouton("Compris", () => (avis.hidden = true)));
  avis.hidden = false;
}

// Le premier geste : le projet quitte l'app, et rien ne part vers sa box. Retiré, il a déjà
// quitté la barre par `surConfiguration` ; refusé, la raison se lit sous le bouton.
/** @param {Projet} projet */
async function retirerDeLApp(projet) {
  const rendu = await brigade.retirerDeLApp(projet.nom);
  if ("avis" in rendu) {
    // Revenu sous le même nom, ce serait un autre projet : ses gestes se reposeront repliés.
    retraitPose = "";
    return poserAvis(rendu.avis);
  }
  nonRetire = rendu.refus;
  await lireRetrait(projet);
}

// Le plan part, et se dit en cours ; ce que la box rend remplace ce qui était affiché.
/** @param {Projet} projet */
async function planifierRetrait(projet) {
  const planifie = brigade.planifier(projet.nom);
  await lireRetrait(projet);
  poserRetrait(projet, await planifie);
}

// Le second geste : la désinstallation part avec le nom que le chef a écrit — c'est hors
// d'ici qu'il est comparé à celui du projet, et que rien ne part s'il diffère.
/** @param {Projet} projet */
async function desinstallerRetrait(projet) {
  const desinstalle = brigade.desinstaller(projet.nom, confirmation);
  await lireRetrait(projet);
  const pose = await desinstalle;
  // Partie vers la box, la confirmation a servi : une autre désinstallation se confirme de
  // nouveau. Si le chef est passé à un autre projet entre-temps, ce qu'il y écrit est à l'autre.
  if (courant?.nom === projet.nom && pose?.desinstaller.geste?.issue?.etat !== "pas-parti") confirmation = "";
  poserRetrait(projet, pose);
}

// Ce que l'app dit sous ce que la box a rendu à la place des faits.
/** @param {Projet} projet */
const sansForme = (projet) => [
  "L'app ne dessine rien de ce projet : ni pastille de couleur, ni compteurs, ni rail. Un nombre qu'elle n'a pas lu n'est pas un zéro.",
  `Ce que la box a rendu est ci-dessus, tel quel. Ce que \`${geste(projet, "status")}\` dit du projet se lit toujours, dessous.`,
].join("\n");
// Quand la box, jointe, n'a pas répondu à `faits` sans que son code dise pourquoi :
// un runtime d'avant cette commande est le cas attendu.
const SANS_REPONSE = [
  "La box a été jointe, et `faits` n'y a pas répondu : ce qu'elle a rendu est ci-dessus, tel quel.",
  "Un runtime d'avant `faits` est le cas attendu — il se met à jour sur sa box (docs/runtime.md, « Piloter », ligne « Mettre à jour »).",
].join("\n");
// Sous toute lecture de `faits` en échec.
/** @param {Projet} projet */
const sansDessin = (projet) => `L'app ne dessine rien de ce projet : ni pastille de couleur, ni compteurs, ni rail. Ce que \`${geste(projet, "status")}\` en a obtenu se lit dessous.`;

// La forme d'un ton : la couleur ne porte jamais seule l'information. Un disque plein, un
// losange, un carré, un anneau creux, un triangle — distincts en niveaux de gris. C'est le ton
// que l'app a déjà (faits.ts, grants.ts, manager.ts) qui choisit la forme : rien n'est déduit ici.
/** @type {Record<string, string>} */
const FORMES = { vert: "disque", jaune: "losange", rouge: "carre", bleu: "triangle", gris: "anneau" };
/** @param {string | undefined} ton */
const formeDe = (ton) => (ton === undefined ? undefined : FORMES[ton]);

// Le ton de chaque état de pilotage : pilotable, vert ; joint sans l'être plus — plus pilotable,
// inconnu de la box, sans le droit, une commande ou le bon node qui manque —, jaune ; pas joint,
// rouge. Ce sont les mots que `rendre` pose déjà : rien n'est déduit de plus.
/** @type {Record<string, string>} */
const TONS_DE_PILOTAGE = { pilotable: "vert", "plus-pilotable": "jaune", inconnu: "jaune", "sans-droit": "jaune", "commande-manque": "jaune", "node-inapte": "jaune", "pas-joint": "rouge" };

// Un mot d'état et sa pastille. La couleur est celle que le mot a dans la liste
// fermée, et sa forme celle de son ton ; un mot qui n'y est pas s'affiche tel quel,
// pastille vide. Le mot reste dit par le texte voisin — et ici par le titre.
/** @param {string} mot @param {string | undefined} ton */
function pastille(mot, ton) {
  const cree = document.createElement("span");
  cree.className = "pastille";
  if (ton !== undefined) cree.dataset.ton = ton;
  const forme = formeDe(ton);
  if (forme !== undefined) cree.dataset.forme = forme;
  cree.title = mot;
  return cree;
}

// La pastille d'un projet dans la barre : son état, lu. Sans faits, elle ne
// prend aucune couleur — elle dit, au survol, ce que l'app a obtenu à la place.
/** @param {string} nom */
function marquerPastille(nom) {
  const posee = pastilles.get(nom);
  if (posee === undefined) return;
  const tenu = tenus.get(nom);
  delete posee.dataset.ton;
  delete posee.dataset.forme;
  posee.dataset.lu = tenu === undefined ? "en-cours" : "tableau" in tenu ? "oui" : "non";
  if (tenu !== undefined && "tableau" in tenu && tenu.tableau.ton !== undefined) {
    posee.dataset.ton = tenu.tableau.ton;
    const forme = formeDe(tenu.tableau.ton);
    if (forme !== undefined) posee.dataset.forme = forme;
  }
  const dit = tenu === undefined ? "première lecture en cours…" : "tableau" in tenu ? tenu.tableau.etat : `aucun fait lu — ${tenu.titre}`;
  posee.textContent = tenu !== undefined && !("tableau" in tenu) ? "!" : "";
  const entree = /** @type {HTMLElement} */ (posee.parentElement);
  entree.title = `${nom} — ${dit}`;
  entree.ariaLabel = entree.title;
}

// La carte de projet : l'état en un mot, les cinq compteurs comme nombres, les
// cooks en cours — le ticket, son titre, la station de chacun, ou ce qui se lit
// à leur place —, le dernier événement. Sans faits : ce que l'app a obtenu, à leur place.
/** @param {HTMLElement} ou @param {Projet} projet */
function poserCarte(ou, projet) {
  const tenu = tenus.get(projet.nom);
  // Sans box, rien n'est lu : le panneau le dit déjà.
  ou.hidden = projet.box === undefined;
  if (projet.box === undefined) return ou.replaceChildren();
  if (tenu === undefined) return ou.replaceChildren(bloc("p", "faits : première lecture en cours…"));
  const heure = new Date(tenu.a).toLocaleTimeString("fr-FR");
  if (!("tableau" in tenu)) {
    const titre = bloc("p", `${tenu.titre} — essai de ${heure}, le prochain suit seul`);
    titre.className = "sans-faits";
    if ("informe" in tenu) return ou.replaceChildren(titre, bloc("pre", tenu.rendu), propos(`Ce n'est pas la forme que l'app dessine : ${tenu.informe}.\n${sansForme(projet)}`));
    // Le même cas que sous `status`, avec son renvoi : un refus du geste n'est pas un runtime à mettre à jour.
    return ou.replaceChildren(titre, ...obtenu(projet, tenu, SANS_REPONSE), propos(sansDessin(projet)));
  }
  const { tableau } = tenu;
  const tete = document.createElement("p");
  tete.className = "etat-projet";
  // Le mot est la pilule : le texte de l'état, avec la pastille de son ton à gauche.
  const pilule = document.createElement("span");
  pilule.className = "pilule";
  if (tableau.ton !== undefined) pilule.dataset.ton = tableau.ton;
  pilule.append(pastille(tableau.etat, tableau.ton), bloc("strong", tableau.etat));
  tete.append(pilule, bloc("small", `lu à ${heure} · ${tableau.tick}`));
  const compteurs = document.createElement("dl");
  for (const { libelle, nombre } of tableau.compteurs) {
    const compteur = document.createElement("div");
    compteur.append(bloc("dd", String(nombre)), bloc("dt", libelle));
    compteurs.append(compteur);
  }
  const cooks = document.createElement("ul");
  cooks.className = "cooks";
  cooks.append(
    ...tableau.cooks.enCours.map(({ ticket, titre, station }) => {
      const cook = document.createElement("li");
      const nom = bloc("span", titre);
      nom.title = titre;
      cook.append(exact("strong", `#${ticket}`), nom, exact("small", station));
      return cook;
    }),
  );
  ou.replaceChildren(tete, compteurs, tableau.cooks.enCours.length === 0 ? bloc("p", surMesure(projet, tableau.cooks.vide)) : cooks, bloc("p", `dernier événement — ${tableau.evenement}`));
}

// Une carte du rail : son numéro, son état, son titre — et, dans T'attend, ce que
// le bloc `attend` dit du ticket, mot pour mot. Le numéro s'ouvre sur l'issue :
// l'adresse reste au process principal, la vue nomme le ticket.
/** @param {Projet} projet @param {import("../faits.ts").Carte} carte @param {string | undefined} [tonAttend] le ton de T'attend, quand le bon y est posé */
function poserBon(projet, { ticket, etat, ton, titre, ouvrable, attend }, tonAttend) {
  const bon = document.createElement("li");
  bon.className = "bon";
  const numero = ouvrable ? bouton(`#${ticket}`, () => void ouvrirIssue(projet, ticket)) : bloc("span", `#${ticket}`);
  numero.className = "ticket mono";
  numero.title = ouvrable
    ? `ouvrir l'issue #${ticket} dans le navigateur`
    : etat === undefined
      ? `ce ticket n'est pas sur le rail que \`${geste(projet, "faits")}\` rend : l'app n'a pas son adresse`
      : "l'adresse que la box a rendue pour ce ticket n'est pas en https : l'app ne l'ouvre pas";
  const tete = document.createElement("div");
  tete.append(numero);
  if (etat !== undefined) {
    const mot = bloc("span", etat);
    mot.className = "etat-ticket";
    if (ton !== undefined) mot.dataset.ton = ton;
    const forme = formeDe(ton);
    if (forme !== undefined) mot.dataset.forme = forme;
    tete.append(mot);
  }
  // Dans T'attend : la pilule le dit en mots, pour qui ne lit pas la couleur de la colonne.
  if (attend.length > 0) {
    const attendu = bloc("span", "t'attend");
    attendu.className = "etat-ticket attendu";
    if (tonAttend !== undefined) attendu.dataset.ton = tonAttend;
    const forme = formeDe(tonAttend);
    if (forme !== undefined) attendu.dataset.forme = forme;
    tete.append(attendu);
  }
  bon.append(tete);
  if (titre !== undefined) bon.append(bloc("strong", titre));
  bon.append(...attend.map((ligne) => bloc("p", ligne)));
  if (attend.length > 0) {
    const demande = bouton("demander au second", () => void demander(ticket));
    demande.className = "demander";
    demande.title = `écrire dans le second une demande sur #${ticket}, d'après ce que le bloc \`attend\` en dit — rien n'est envoyé : c'est toi qui fais Entrée`;
    bon.append(demande);
  }
  return bon;
}

// Le rail en cinq colonnes — Sur le rail, Au travail, Pass, T'attend, Livré —,
// tel que le process principal l'a rangé (faits.ts) : la vue pose, colonne par
// colonne. Sans faits, rien n'est dessiné ici : la carte du panneau dit ce qui a
// été obtenu, et le geste `rail` se lit dessous.
/** @param {Projet} projet */
function poserRail(projet) {
  const tenu = tenus.get(projet.nom);
  rail.hidden = tenu === undefined;
  if (tenu === undefined) return rail.replaceChildren();
  const heure = new Date(tenu.a).toLocaleTimeString("fr-FR");
  if (!("tableau" in tenu)) return rail.replaceChildren(bloc("h3", `le rail n'est pas dessiné : ${tenu.titre} — essai de ${heure}. Ce que l'app a obtenu est dans le panneau, à droite`));
  const { colonnes, hors, attendLu } = tenu.tableau.rail;
  /** @param {import("../faits.ts").Carte[]} cartes @param {string} [ton] */
  const bons = (cartes, ton) => {
    const liste = document.createElement("ol");
    liste.append(...cartes.map((carte) => poserBon(projet, carte, ton)));
    return liste;
  };
  const grille = document.createElement("div");
  grille.className = "colonnes";
  grille.append(
    ...colonnes.map(({ nom, ton, compte, cartes, vide }) => {
      const colonne = document.createElement("section");
      colonne.className = "colonne";
      colonne.dataset.ton = ton;
      const forme = formeDe(ton);
      if (forme !== undefined) colonne.dataset.forme = forme;
      const tete = document.createElement("h4");
      tete.append(bloc("span", nom), bloc("span", compte));
      colonne.append(tete, cartes.length === 0 ? bloc("p", surMesure(projet, vide)) : bons(cartes, ton));
      return colonne;
    }),
  );
  const dOu = attendLu === undefined ? "" : ` ; T'attend, d'après le bloc \`attend\` de \`${geste(projet, "status")}\` — lu à ${new Date(attendLu).toLocaleTimeString("fr-FR")}`;
  rail.replaceChildren(
    bloc("h3", `le rail, dessiné d'après \`${geste(projet, "faits")}\` — lu à ${heure}, dans l'ordre de service${dOu} ; un numéro ouvre l'issue`),
    grille,
    ...(hors.length === 0 ? [] : [bloc("h3", `hors des cinq colonnes — leur état n'est celui d'aucune, et le bloc \`attend\` ne les nomme pas : \`${geste(projet, "rail")}\`, dessous, dit ce qu'il en est`), bons(hors)]),
  );
}

// Les pages servies du projet affiché : chaque serveur que `status` montre, et son geste —
// un seul, qui ouvre sa page dans le navigateur du poste. Un geste qui n'est pas posé dit
// pourquoi, dessous ; sans serveur, c'est la raison qui se lit à la place. Tout est déjà
// décidé dans le process principal (page.ts) : la vue pose.
/** @param {Projet} projet @param {Pages | undefined} servies */
function poserPages(projet, servies) {
  pages.hidden = servies === undefined;
  if (servies === undefined) return pages.replaceChildren();
  const liste = document.createElement("ul");
  liste.append(
    ...servies.pages.map(({ ticket, worktree, port, etat, raison, enCours, dit }) => {
      const page = document.createElement("li");
      const ouvre = bouton(enCours ? "ouverture en cours…" : "ouvrir sa page dans mon navigateur", () => {
        ouvre.disabled = true;
        ouvre.textContent = "ouverture en cours…";
        void ouvrirPage(projet, worktree);
      });
      ouvre.disabled = raison !== undefined || enCours;
      const tete = document.createElement("div");
      // Le worktree et son port se recopient : eux seuls sont en monospace, la phrase reste la même.
      const servi = document.createElement("span");
      servi.append(exact("span", worktree), " · port ", exact("span", String(port)), ` · ${etat}`);
      tete.append(exact("strong", `#${ticket}`), servi, ouvre);
      page.append(tete);
      if (raison !== undefined) page.append(bloc("p", surMesure(projet, raison)));
      if (dit !== undefined) {
        const rendu = propos(dit.texte);
        rendu.dataset.ouverte = String(dit.ouverte);
        page.append(rendu);
      }
      return page;
    }),
  );
  /** @param {string} texte */
  const alerte = (texte) => {
    const dite = bloc("p", surMesure(projet, texte));
    dite.className = "refus";
    return dite;
  };
  pages.replaceChildren(
    bloc("h3", `regarder une livraison dans ton navigateur — les serveurs que \`${geste(projet, "status")}\` montre`),
    ...(servies.refus === undefined ? [] : [alerte(servies.refus)]),
    ...(servies.pages.length === 0 ? [] : [liste]),
    ...(servies.vide === undefined ? [] : [bloc("p", surMesure(projet, servies.vide))]),
    ...(servies.pages.length > 0 && servies.illisibles.length > 0 ? [bloc("p", "sous `serveurs`, ce que l'app n'a pas su lire — sans geste :")] : []),
    ...servies.illisibles.map((ligne) => bloc("pre", ligne)),
    ...(servies.pages.length > 0 && servies.empeche.length > 0 ? [bloc("p", "ce qui empêche ce projet d'être servi, d'après la même lecture :")] : []),
    ...servies.empeche.map((ligne) => bloc("pre", ligne)),
    ...(servies.rappel === undefined ? [] : [bloc("small", servies.rappel)]),
  );
}

// Un instant que la box a écrit, à l'heure de ce poste — tel quel, s'il n'en est pas un.
/** @param {string} instant */
const quand = (instant) => (Number.isNaN(Date.parse(instant)) ? instant : new Date(instant).toLocaleString("fr-FR"));

// Une liste lue dans la sortie d'un onglet, sous son titre : ses lignes, ce qui se lit à leur
// place quand elle n'en a pas, et ce que l'app n'a pas su y lire, tel quel.
/** @template L @param {string} titre @param {import("../manager.ts").Liste<L>} liste @param {(ligne: L) => (Node | string)[]} poser */
function listeLue(titre, { lignes, illisibles, vide }, poser) {
  const posees = document.createElement("ol");
  posees.append(
    ...lignes.map((ligne) => {
      const posee = document.createElement("li");
      posee.append(...poser(ligne));
      return posee;
    }),
  );
  return [
    bloc("h4", titre),
    ...(vide === undefined ? [] : [bloc("p", vide)]),
    ...(lignes.length === 0 ? [] : [posees]),
    ...(illisibles.length === 0 ? [] : [bloc("p", "sous ce titre, ce que l'app n'a pas su lire — tel quel :"), bloc("pre", illisibles.join("\n"))]),
  ];
}
// La tête d'une de ces lignes : l'issue, et l'instant.
/** @param {{ a: string, ticket: number }} ligne */
function teteDIssue({ a, ticket }) {
  const posee = document.createElement("div");
  posee.append(exact("strong", `#${ticket}`), bloc("small", quand(a)));
  return posee;
}

// Ce qu'un usage de grant laisse derrière lui : sa PR et son commit se recopient, son verdict se lit.
/** @param {import("../grants.ts").Usage} usage */
function tracesDUsage({ pr, commit, verdict }) {
  const posees = document.createElement("small");
  posees.append(exact("span", pr), " · ", exact("span", commit), ` · ${verdict}`);
  return posees;
}

// L'état du manager du projet affiché, au-dessus du texte de l'onglet Manager : l'interrupteur
// — allumé ou éteint, depuis quand et par qui —, ses deux gestes, puis ses dernières décisions
// et ce qu'il a écarté, chaque écart avec son motif. Tout est déjà lu par le process principal
// (manager.ts), dans la sortie qui se lit dessous : la vue pose. Sans état lu, elle dit pourquoi
// — jamais « éteint » — et les gestes restent : ils n'attendent rien de la lecture.
function poserManager() {
  const projet = courant;
  // Sans box, rien n'est lu et rien ne s'écrit : l'onglet le dit déjà.
  manager.hidden = projet === undefined || projet.box === undefined || actif() !== "manager";
  if (projet === undefined || manager.hidden) return manager.replaceChildren();
  const vu = managerVu?.projet === projet.nom ? managerVu : undefined;

  /** @param {string} texte */
  const alerte = (texte) => {
    const dite = bloc("p", texte);
    dite.className = "refus";
    return dite;
  };
  const gestes = document.createElement("p");
  gestes.className = "gestes";
  gestes.append(...boutonsDesGestes(GESTES_DU_MANAGER));

  // L'heure n'est dite que d'un état lu : celle d'un essai raté se lit dessous, avec ce qu'il a rendu.
  const titre = bloc("h3", `le manager, d'après \`${geste(projet, "manager")}\`${vu === undefined || "sans" in vu ? "" : ` — lu à ${new Date(vu.a).toLocaleTimeString("fr-FR")}`}`);
  if (vu === undefined) return manager.replaceChildren(titre, bloc("p", "première lecture en cours…"), gestes);
  if ("sans" in vu) return manager.replaceChildren(titre, alerte(vu.sans), gestes);

  const { mot, ton, depuis, par, dit } = vu.interrupteur;
  const interrupteur = document.createElement("p");
  interrupteur.className = "interrupteur";
  interrupteur.append(pastille(mot, ton), bloc("strong", mot), ...(depuis === undefined || par === undefined ? [] : [bloc("span", `depuis le ${quand(depuis)} · par ${par}`)]));
  manager.replaceChildren(
    titre,
    interrupteur,
    bloc("p", dit),
    gestes,
    ...listeLue("dernières décisions — les plus récentes d'abord", vu.decisions, (decision) => [teteDIssue(decision), bloc("p", decision.dit)]),
    ...listeLue("écartées — chacune avec son motif", vu.ecartees, (ecart) => [teteDIssue(ecart), bloc("p", ecart.motif), ...(ecart.rend === undefined ? [] : [bloc("small", ecart.rend)])]),
  );
}

// L'état des grants du projet affiché, au-dessus du texte de l'onglet Grants : un bloc par grant
// — actif ou non, depuis quand et par qui, son échéance, ses deux gestes, ses derniers usages —,
// puis ce qu'aucun grant n'autorise. De l'échéance, la durée restante se pose en tête, l'heure
// ensuite : c'est la box qui l'a comptée, à l'heure de la lecture. Tout est déjà lu par le process
// principal (grants.ts), dans la sortie qui se lit dessous : la vue pose. Sans état lu, elle dit
// pourquoi — jamais « aucun grant actif » — et les gestes restent : ils n'attendent rien de la
// lecture. Un geste écrit sa commande dans un shell, `merge` compris, et ne demande rien de plus.
function poserGrants() {
  const projet = courant;
  // Sans box, rien n'est lu et rien ne s'écrit : l'onglet le dit déjà.
  grants.hidden = projet === undefined || projet.box === undefined || actif() !== "grants";
  if (projet === undefined || grants.hidden) return grants.replaceChildren();
  const vu = grantsVus?.projet === projet.nom ? grantsVus : undefined;

  /** @param {string} texte */
  const alerte = (texte) => {
    const dite = bloc("p", texte);
    dite.className = "refus";
    return dite;
  };
  // Les deux gestes d'un grant : chacun le nomme, sur son bouton comme dans ce qu'il écrit.
  /** @param {string} action */
  const gestes = (action) => {
    const poses = document.createElement("p");
    poses.className = "gestes";
    poses.append(bloc("span", "écrire dans un shell de l'espace, sans envoyer :"), ...GESTES_DES_GRANTS.map(({ id, libelle }) => bouton(`${libelle} ${action}`, () => void ecrireGeste(id, action))));
    return poses;
  };

  // L'heure n'est dite que d'un état lu : celle d'un essai raté se lit dessous, avec ce qu'il a rendu.
  const titre = bloc("h3", `les grants, d'après \`${geste(projet, "grant")}\`${vu === undefined || "sans" in vu ? "" : ` — lu à ${new Date(vu.a).toLocaleTimeString("fr-FR")}`}`);
  if (vu === undefined) return grants.replaceChildren(titre, bloc("p", "première lecture en cours…"), ...GRANTS_NOMMES.map(gestes));
  if ("sans" in vu) return grants.replaceChildren(titre, alerte(vu.sans), ...GRANTS_NOMMES.map(gestes));

  /** @param {import("../grants.ts").GrantVu} grant */
  const poser = (grant) => {
    const pose = document.createElement("article");
    const nomme = document.createElement("p");
    nomme.className = "interrupteur";
    if ("sans" in grant) {
      nomme.append(pastille("", undefined), bloc("strong", `grant ${grant.action}`));
      pose.append(nomme, alerte(grant.sans));
    } else {
      const { mot, ton, depuis, par, bientot, echeance, limites, dit } = grant;
      nomme.append(
        pastille(mot, ton),
        bloc("strong", `grant ${grant.action}`),
        bloc("strong", mot),
        ...(bientot === undefined ? [] : [bloc("em", bientot)]),
        ...(depuis === undefined ? [] : [bloc("span", `depuis le ${quand(depuis)}${par === undefined ? "" : ` · par ${par}`}`)]),
      );
      // Ce qu'il en reste : la durée d'abord, l'heure ensuite, puis ce que la ligne en dit d'autre.
      const reste = document.createElement("p");
      reste.className = "echeance";
      reste.append(...(echeance === undefined ? [] : [bloc("strong", echeance.reste), bloc("span", echeance.jusqua)]), ...limites.map((limite) => bloc("span", limite)));
      pose.append(nomme, ...(reste.childElementCount === 0 ? [] : [reste]), ...(dit === "" ? [] : [bloc("p", dit)]));
    }
    pose.append(
      grant.commandable ? gestes(grant.action) : bloc("small", "aucun geste ici pour ce grant : l'app n'écrit que les commandes que la doc cite"),
      ...listeLue(`derniers usages du grant ${grant.action} — les plus récents d'abord`, grant.usages, (usage) => [teteDIssue(usage), bloc("p", `${usage.suite} — sur ${usage.base}`), tracesDUsage(usage)]),
    );
    return pose;
  };

  grants.replaceChildren(
    titre,
    ...vu.grants.map(poser),
    ...(vu.illisibles.length === 0 ? [] : [bloc("p", "sous `derniers usages`, ce que l'app n'a pas su lire, ou rattacher à un grant — tel quel :"), bloc("pre", vu.illisibles.join("\n"))]),
    ...listeLue("ce qu'aucun grant n'autorise — pas même demandé par toi", vu.interdits, (interdit) => [bloc("strong", interdit.action), bloc("p", interdit.dit)]),
    ...(vu.bilan === undefined ? [] : [bloc("h4", "les livraisons arrêtées faute de grant"), bloc("p", vu.bilan)]),
  );
}

// Le geste : le process principal amène le port du worktree sur ce poste et ouvre le
// navigateur. Ce qu'il en advient revient posé — le chef a pu changer d'espace entre-temps.
/** @param {Projet} projet @param {string} worktree */
async function ouvrirPage(projet, worktree) {
  const rendues = await brigade.ouvrirPage(projet.nom, worktree);
  if (rendues !== undefined && courant?.nom === projet.nom) poserPages(projet, rendues);
}

/** @param {Projet} projet @param {number} ticket */
async function ouvrirIssue(projet, ticket) {
  nonEcrit = (await brigade.ouvrirIssue(projet.nom, ticket)) ? "" : `l'issue #${ticket} n'est pas ouverte : elle n'est plus dans les derniers faits lus, son adresse n'est pas en https, ou le poste n'a pas pu l'ouvrir`;
  montrer();
}

// Un geste offert et ce qu'il engage, sur une ligne : son bouton l'écrit dans un shell de l'espace,
// et n'envoie rien. Le geste « mettre en service » est refermé : un choix est pris.
/** @param {import("../version.ts").Offert} offert */
function poserOffert({ id, libelle, dit }) {
  const pose = document.createElement("p");
  pose.className = "gestes";
  pose.append(
    bouton(libelle, () => {
      aMettre = "";
      void ecrireGeste(id);
    }),
    bloc("span", dit),
  );
  return pose;
}

// Les cooks en vol, sous leur total : le ticket de chacun, son titre, sa station, ce qu'il a
// déjà dépensé. Sans ticket : un jugement du manager.
/** @param {NonNullable<import("../version.ts").Vu["enVol"]>} enVol */
function poserEnVol({ titre, cooks }) {
  const liste = document.createElement("ul");
  liste.className = "cooks";
  liste.append(
    ...cooks.map(({ ticket, titre, station, tokens }) => {
      const cook = document.createElement("li");
      cook.append(...(ticket === undefined ? [] : [exact("strong", ticket)]), bloc("span", titre), exact("small", station), bloc("small", tokens));
      return cook;
    }),
  );
  return [bloc("p", titre), ...(cooks.length === 0 ? [] : [liste])];
}

// La version du runtime et sa mise en service, juste au-dessus de ce qui attend le chef : son
// état d'un mot, ce que la box en dit, la demande qui vit et ses gestes, ce que le dernier geste
// de box a donné. Tout est déjà dit par le process principal (version.ts) : la vue pose.
// « Mettre en service » n'écrit rien : il montre l'avertissement, les cooks en vol et ce qu'ils
// ont dépensé, puis deux choix — et c'est un choix qui écrit, dans un shell, sans envoyer.
// Sans faits, rien n'est posé : la carte dit déjà ce que l'app a obtenu à leur place.
/** @param {Projet} projet */
function poserVersion(projet) {
  const tenu = tenus.get(projet.nom);
  version.hidden = projet.box === undefined || tenu === undefined || !("tableau" in tenu);
  if (projet.box === undefined || tenu === undefined || !("tableau" in tenu)) return version.replaceChildren();
  const vu = tenu.tableau.version;
  // L'offre a disparu — demandée entre-temps, ou la version n'attend plus : le geste se referme.
  if (vu.mettre === undefined && aMettre === projet.nom) aMettre = "";
  const tete = document.createElement("p");
  tete.className = "etat-projet";
  const pilule = document.createElement("span");
  pilule.className = "pilule";
  if (vu.ton !== undefined) pilule.dataset.ton = vu.ton;
  pilule.append(pastille(vu.etat, vu.ton), bloc("strong", vu.etat));
  tete.append(pilule);
  const faits = document.createElement("ul");
  faits.className = "faits";
  faits.append(
    ...vu.faits.map(({ libelle, valeur, exact: recopie }) => {
      const fait = document.createElement("li");
      fait.append(bloc("span", libelle), recopie ? exact("strong", valeur) : bloc("strong", valeur));
      return fait;
    }),
  );
  /** @type {HTMLElement[]} */
  const demande = [];
  if (vu.demande !== undefined) {
    const ligne = document.createElement("p");
    ligne.className = "etat-projet";
    const mot = document.createElement("span");
    mot.className = "pilule";
    if (vu.demande.ton !== undefined) mot.dataset.ton = vu.demande.ton;
    mot.append(pastille(vu.demande.etat, vu.demande.ton), bloc("strong", `mise en service ${vu.demande.etat}`));
    ligne.append(mot, bloc("small", vu.demande.dit));
    demande.push(ligne);
  }
  /** @type {HTMLElement[]} */
  const echec = [];
  if (vu.echec !== undefined) {
    const dit = bloc("p", vu.echec.dit);
    dit.className = "echec";
    echec.push(
      dit,
      ...(vu.echec.fin.length === 0 ? [] : [bloc("pre", vu.echec.fin.join("\n"))]),
      ...(vu.echec.suite === undefined ? [] : [bloc("p", vu.echec.suite)]),
      bloc("small", `d'après l'entrée \`version\` du bloc \`attend\` de \`${geste(projet, "status")}\` — lu à ${new Date(vu.echec.a).toLocaleTimeString("fr-FR")}`),
    );
  }
  /** @type {HTMLElement[]} */
  const mise = [];
  const { mettre } = vu;
  if (mettre !== undefined && aMettre !== projet.nom) {
    const offre = document.createElement("p");
    offre.className = "gestes";
    offre.append(
      bouton(mettre.libelle, () => {
        aMettre = projet.nom;
        poserVersion(projet);
      }),
      bloc("span", "montre d'abord les cooks en vol et ce qu'ils ont déjà dépensé : rien n'est écrit, rien n'est demandé"),
    );
    mise.push(offre);
  } else if (mettre !== undefined) {
    const avant = document.createElement("div");
    avant.className = "avant";
    const renoncer = document.createElement("p");
    renoncer.className = "gestes";
    renoncer.append(
      bouton(mettre.renoncer, () => {
        aMettre = "";
        poserVersion(projet);
      }),
    );
    avant.append(
      bloc("strong", `⚠️ ${mettre.avertissement}`),
      ...(vu.enVol === undefined ? [] : poserEnVol(vu.enVol)),
      bloc("p", "Deux manières de la demander, et rien ne part sans que tu en prennes une — chacune écrit sa commande dans un shell de l'espace, sans l'envoyer : c'est ton Entrée qui demande."),
      ...mettre.choix.map(poserOffert),
      renoncer,
    );
    mise.push(avant);
  } else if (vu.enVol !== undefined) {
    mise.push(...poserEnVol(vu.enVol));
  }
  version.replaceChildren(
    bloc("h3", `la version du runtime, d'après \`${geste(projet, "faits")}\` — lu à ${new Date(tenu.a).toLocaleTimeString("fr-FR")}`),
    tete,
    ...(vu.faits.length === 0 ? [] : [faits]),
    ...vu.lignes.map((ligne) => bloc("p", ligne)),
    ...echec,
    ...demande,
    ...mise,
    ...(vu.gestes.length === 0 ? [] : [bloc("p", "Chaque geste écrit sa commande dans un shell de l'espace, sans l'envoyer : c'est ton Entrée qui demande.")]),
    ...vu.gestes.map(poserOffert),
  );
}

// Les gestes de la cuisine, sous son état : reprendre et arrêter écrivent leur commande dans un
// shell de l'espace, et n'envoient rien. Aucune confirmation, pour l'arrêt non plus : la commande
// se lit avant Entrée. Vérifier l'installation est direct : sa commande part dans le second.
// Offerts quel que soit l'état lu — un projet sans box n'a pas de commande à écrire.
function poserCuisine() {
  const sansBox = courant?.box === undefined;
  gestesCuisine.hidden = sansBox;
  if (sansBox) return gestesCuisine.replaceChildren();
  gestesCuisine.replaceChildren(...boutonsDesGestes(GESTES_DE_LA_CUISINE));
}

// Le code de l'app, et les clones de brigade parmi les projets : l'état de chacun en une
// ligne, avec l'heure de sa lecture ; dessous, ce que le process principal en dit (retard.ts).
// En retard, la commande qui le met à jour est un bouton : elle s'écrit dans un shell, et rien
// ne l'envoie. La case « T » de la barre le dit aussi, quel que soit l'écran.
function poserCode() {
  const entree = document.getElementById("entree-tous");
  if (entree !== null) {
    entree.classList.toggle("perime", codeVu?.alerte !== undefined);
    entree.title = codeVu?.alerte === undefined ? "Tous les projets" : `Tous les projets — ${codeVu.alerte}`;
    entree.ariaLabel = entree.title;
  }
  if (codeVu === undefined) {
    const tete = bloc("p", "le code de cette app : première lecture de son retard sur l'origine en cours…");
    tete.dataset.etat = "en-cours";
    return code.replaceChildren(tete);
  }
  const heure = new Date(codeVu.a).toLocaleTimeString("fr-FR");
  code.replaceChildren(
    ...codeVu.clones.flatMap(({ id, etat, tete, lignes, commande }) => {
      const pose = bloc("p", `${tete} — ${etat === "pas-lu" ? "essai de" : "lu à"} ${heure}, relu quand tu reviens à la fenêtre`);
      pose.dataset.etat = etat;
      const gestes = document.createElement("p");
      gestes.className = "gestes";
      if (commande !== undefined) gestes.append(bloc("span", "écrire dans un shell, sans envoyer :"), boutonDeCommande(commande, () => void mettreAJour(id)));
      return [pose, ...(lignes.length === 0 ? [] : [propos(lignes.join("\n"))]), ...(commande === undefined ? [] : [gestes])];
    }),
    ...(nonMisAJour === "" ? [] : [propos(nonMisAJour)]),
  );
}

// La mise à jour d'un clone n'est pas lancée : sa commande s'écrit dans un shell, dans
// l'espace d'un projet, que l'on montre — c'est sa note qui dit ce qui a été écrit, et que
// rien n'est parti. Sans projet qui s'ouvre, la raison se lit sous les clones.
/** @param {string} clone */
async function mettreAJour(clone) {
  nonMisAJour = "";
  try {
    const rendu = await brigade.ecrireMiseAJour(clone);
    if (rendu !== undefined && "refus" in rendu) nonMisAJour = rendu.refus;
    else if (rendu !== undefined) {
      recevoir(rendu);
      laisse.set(rendu.projet, rendu.id);
      const projet = projetDe(rendu.projet);
      if (projet !== undefined) return void ouvrir(projet);
    }
  } catch (erreur) {
    nonMisAJour = `rien n'est écrit : ${erreur instanceof Error ? erreur.message : String(erreur)}`;
  }
  poserCode();
}

// La bannière d'arrêt : la cuisine est à l'arrêt quand la box le dit, d'un mot.
// Son bouton écrit la relance dans le second, comme les autres, et n'envoie rien.
/** @param {Projet} projet */
function poserArret(projet) {
  const tenu = tenus.get(projet.nom);
  const banniere = BANNIERE;
  arret.hidden = banniere === undefined || tenu === undefined || !("tableau" in tenu) || !tenu.tableau.arretee;
  if (arret.hidden || banniere === undefined) return arret.replaceChildren();
  const [titre, ...suite] = banniere.texte;
  const relance = BOUTONS.find(({ id }) => id === banniere.bouton);
  const geste = document.createElement("p");
  geste.className = "gestes";
  if (relance !== undefined) geste.append(bloc("span", "écrire la relance dans le second, sans envoyer :"), boutonDeCommande(relance.commande, () => void inscrire(relance.id)));
  arret.replaceChildren(bloc("strong", titre), ...suite.map((ligne) => bloc("p", ligne)), geste);
}

// Tout ce qui se dessine du projet affiché, d'après ses derniers faits.
function dessiner() {
  arret.hidden = true;
  rail.hidden = true;
  poserManager();
  poserGrants();
  poserCuisine();
  if (courant === undefined) return;
  poserCarte(carte, courant);
  poserVersion(courant);
  poserArret(courant);
  if (actif() === "rail") poserRail(courant);
}

// Rien ne reste de ce qui était affiché — ni d'un autre projet, ni de celui-ci :
// jusqu'à la première lecture, il n'y a rien à lire.
/** @param {Projet} projet @param {HTMLElement} tete @param {HTMLElement} corps */
function attendre(projet, tete, corps) {
  if (projet.desinstalle !== undefined) {
    // L'app l'a désinstallé de sa box : elle n'en lit plus rien, et le dit à la place.
    tete.dataset.etat = "desinstalle";
    tete.textContent = `${projet.desinstalle.titre} — depuis ${new Date(projet.desinstalle.a).toLocaleTimeString("fr-FR")}`;
    corps.replaceChildren(propos(projet.desinstalle.lignes.join("\n")));
  } else if (projet.box === undefined) {
    tete.dataset.etat = "sans-box";
    tete.textContent = "aucune lecture";
    corps.replaceChildren(
      propos(
        [
          `« ${projet.nom} » ne dit pas où est sa box : l'app ne lit rien de ce projet.`,
          "",
          `Il lui manque « hote », dans ${configuration.chemin} : le nom par lequel ton \`ssh\` joint ta box.`,
          `L'app y lancera le geste de la box sous le nom du projet (\`ssh <hote> brigade ${mot(cite(projet.nom))} status\`, avec l'« hote » à écrire).`,
          "",
          "L'app relit ce fichier dès qu'il change.",
        ].join("\n"),
      ),
    );
  } else {
    tete.dataset.etat = "en-cours";
    tete.textContent = "première lecture en cours…";
    corps.replaceChildren();
  }
}

// L'entrée de la barre qui est affichée : celle du projet courant, la première —
// « Tous les projets » — ou la dernière, l'ajout. Un fichier refusé n'a ni l'une ni l'autre :
// sa raison prend la place du terminal.
function marquer() {
  const refuse = configuration.refus !== undefined;
  const affichee = ajoute ? barre.children.length - 1 : courant === undefined ? 0 : configuration.projets.indexOf(courant) + 1;
  [...barre.children].forEach((entree, rang) => (entree.ariaCurrent = String(rang === affichee)));
  tous.hidden = refuse || ajoute || courant !== undefined;
  ajout.hidden = !ajoute;
  principal.hidden = !refuse && courant === undefined;
  etat.hidden = courant === undefined;
  lireOnglet();
}

// Tous les projets, dans l'ordre du fichier. L'écran se regarde : ce qui
// s'y voit se traite dans l'espace du projet, par la barre.
function ouvrirTous() {
  courant = undefined;
  ajoute = false;
  marquer();
  blocs.clear();
  poserCode();
  tous.replaceChildren(
    code,
    ...configuration.projets.map((projet) => {
      const tete = bloc("p", "");
      const corps = document.createElement("div");
      const faits = document.createElement("section");
      faits.className = "carte";
      attendre(projet, tete, corps);
      poserCarte(faits, projet);
      blocs.set(projet.nom, { carte: faits, tete, corps });
      const article = document.createElement("article");
      article.append(bloc("h2", projet.nom), faits, tete, corps);
      return article;
    }),
  );
  brigade.tous(++demande);
}

// Les choix d'une liste, précédés de celui qui n'en est pas un : rien n'est choisi d'avance.
/** @param {HTMLSelectElement} liste @param {readonly string[]} choix @param {string} aucun */
function proposer(liste, choix, aucun) {
  const garde = liste.value;
  const vide = new Option(aucun, "");
  liste.replaceChildren(vide, ...choix.map((valeur) => new Option(valeur, valeur)));
  liste.value = choix.includes(garde) ? garde : "";
}

// Ce qu'un champ a de refusé, dit sous lui — ou rien.
/** @param {string} champ @param {string} [raison] */
function signaler(champ, raison = "") {
  element(`refus-${champ}`).textContent = raison;
  element(champ).ariaInvalid = String(raison !== "");
}

// Ce que l'écran a proposé et que le chef n'a pas touché : le champ, et d'où vient sa valeur.
// Un champ y entre quand l'app y pose une valeur, et en sort dès que le chef y met la main —
// ce qui part vers la box est alors ce qu'il a choisi, plus ce qu'on lui a proposé.
/** @type {Map<string, string>} */
const proposes = new Map();
// La racine des sauvegardes lue sur la box choisie — ou ce qui l'a empêché.
let racine = "";
let racineOrigine = "";
let racineRaison = "";

// Ce que la ligne d'un champ dit de sa valeur : proposée, avec sa provenance, tant que personne n'a choisi.
function direPropose() {
  /** @param {string[]} champs @param {Record<string, string>} nommes */
  const ligne = (champs, nommes) => {
    const restants = champs.filter((champ) => proposes.has(champ));
    for (const champ of champs) element(champ).toggleAttribute("data-propose", proposes.has(champ));
    const [premier] = restants;
    if (premier === undefined) return "";
    const quoi = restants.length === champs.length ? "Proposé, pas choisi" : `${restants.map((champ) => nommes[champ]).join(" et ")} : proposé, pas choisi`;
    return `${quoi} — ${proposes.get(premier)}. Modifie-le pour le choisir ; il part tel quel sinon.`;
  };
  const nommes = { "manager-modele": "le modèle", "manager-effort": "l'effort", "reviewer-modele": "le modèle", "reviewer-effort": "l'effort" };
  element("propose-manager").textContent = ligne(["manager-modele", "manager-effort"], nommes);
  element("propose-reviewer").textContent = ligne(["reviewer-modele", "reviewer-effort"], nommes);
  const dite = ligne(["sauvegardes"], {});
  element("propose-sauvegardes").textContent = dite !== "" ? dite : sauvegardes.value === "" ? racineRaison : "";
}

/** @param {string} champ @param {string} valeur @param {string} origine */
function poserPropose(champ, valeur, origine) {
  const cible = /** @type {HTMLInputElement | HTMLSelectElement} */ (element(champ));
  cible.value = valeur;
  // Une valeur que la liste ne connaît pas ne se propose pas.
  if (cible.value !== valeur) return;
  proposes.set(champ, origine);
}

// Le calibrage proposé : celui de tes autres projets, sinon la valeur mesurée. Un champ que
// le chef a choisi n'est pas repris.
async function proposerCalibrage() {
  const { calibrage, origine } = await brigade.proposerCalibrage();
  for (const [role, valeurs] of Object.entries(calibrage)) {
    for (const dimension of /** @type {const} */ (["modele", "effort"])) {
      const champ = /** @type {typeof CALIBRAGE[number]} */ (`${role}-${dimension}`);
      if (calibre(champ).value !== "" && !proposes.has(champ)) continue;
      poserPropose(champ, valeurs[dimension], origine);
    }
  }
  direPropose();
}

// La destination proposée : la racine que la box accepte, puis le nom du projet.
function proposerDestination() {
  if (sauvegardes.value !== "" && !proposes.has("sauvegardes")) return;
  const saisi = nom.value.trim();
  if (racine === "" || saisi === "") {
    if (proposes.delete("sauvegardes")) sauvegardes.value = "";
  } else {
    poserPropose("sauvegardes", `${racine}/${saisi}`, racineOrigine);
  }
  direPropose();
}

// La racine, lue sur la box choisie : une réponse qui arrive après un autre choix est jetée.
async function proposerRacine() {
  const choisie = hote.value;
  racine = "";
  racineRaison = "";
  if (choisie !== "") {
    const lue = await brigade.proposerRacine(choisie);
    if (hote.value !== choisie) return;
    if (lue !== undefined && "racine" in lue) [racine, racineOrigine] = [lue.racine, lue.origine];
    else racineRaison = lue?.raison ?? "";
  }
  proposerDestination();
}

// Ce que le chef touche cesse d'être une proposition.
for (const champ of /** @type {string[]} */ ([...CALIBRAGE, "sauvegardes"])) {
  element(champ).addEventListener("input", () => {
    proposes.delete(champ);
    direPropose();
  });
}
hote.addEventListener("change", () => void proposerRacine());

// Ajouter un projet sans écrire de JSON ni coller de commande : son dossier se choisit,
// son nom et son dépôt en viennent, sa box se prend parmi celles du fichier. Ce qui a
// été saisi reste, d'un passage à l'autre.
function ouvrirAjout() {
  courant = undefined;
  ajoute = true;
  marquer();
  ou.textContent = `${configuration.projets.length === 0 ? "Aucun projet encore. " : ""}Il s'installe sur sa box, puis s'écrit dans ${configuration.chemin} — que tu peux aussi modifier à la main : l'app le relit dès qu'il change.`;
  choisi.textContent = dossier === "" ? "aucun dossier choisi" : dossier;
  proposer(hote, configuration.boxes, configuration.boxes.length === 0 ? "aucune box déclarée — déclares-en une, dessous" : "— choisir —");
  // Une seule box : il n'y a rien à choisir.
  if (hote.value === "" && configuration.boxes.length === 1) hote.value = configuration.boxes[0] ?? "";
  void proposerCalibrage();
  void proposerRacine();
}

element("dossier").addEventListener("click", async () => {
  const pris = await brigade.choisirDossier();
  if (pris === undefined) return;
  dossier = pris;
  choisi.textContent = pris;
  signaler("dossier");
  // Le nom du dossier, tant que le chef n'en a pas tapé un autre.
  if (nom.value === "") {
    nom.value = pris.split("/").filter(Boolean).at(-1) ?? "";
    void direForme();
    proposerDestination();
  }
  // Son dépôt, lu dans son origine — tant que le chef n'en a pas écrit un autre.
  const lu = await brigade.lireDepot(pris);
  if (lu === undefined || dossier !== pris || (depot.value !== "" && depot.value !== depotLu)) return;
  depotLu = "depot" in lu ? lu.depot : "";
  depot.value = depotLu;
  signaler("depot", "raison" in lu ? lu.raison : "");
});
// La forme du nom, dite à la saisie : ce que la box refuserait est refusé ici, avant elle.
async function direForme() {
  const saisi = nom.value;
  const raison = await brigade.formeDuNom(saisi);
  if (nom.value === saisi) signaler("nom", raison);
}
nom.addEventListener("input", () => {
  void direForme();
  proposerDestination();
});
// Une box de plus : son nom s'écrit dans le fichier, et elle se propose aussitôt.
element("declarer").addEventListener("click", async () => {
  const declaree = box.value.trim();
  const refus = await brigade.declarerBox(declaree);
  signaler("box", refus === undefined ? "" : `Pas déclarée — ${refus}`);
  if (refus !== undefined) return;
  box.value = "";
  // La liste est déjà arrivée par `surConfiguration`.
  hote.value = declaree;
  signaler("hote");
  void proposerRacine();
});

// Entrée, dans le nom d'une box, la déclare : elle n'envoie pas l'ajout.
box.addEventListener("keydown", (frappe) => {
  if (frappe.key !== "Enter") return;
  frappe.preventDefault();
  element("declarer").click();
});

// Ce qu'il est advenu de l'ajout, sous le formulaire : ce que la box a rendu, tel quel, puis ce que l'app en dit.
/** @param {import("../installation.ts").Issue | { etat: "en-cours", titre: string }} issue */
function poserIssue(issue) {
  issueAjout.dataset.etat = issue.etat;
  if (issue.etat === "champs") return issueAjout.replaceChildren(bloc("strong", "Rien n'est parti vers la box : ce qui manque est signalé sous son champ."));
  issueAjout.replaceChildren(bloc("strong", issue.titre), ...("obtenu" in issue && issue.obtenu !== undefined ? [bloc("pre", issue.obtenu)] : []), ...("lignes" in issue ? issue.lignes.map((ligne) => bloc("p", ligne)) : []));
}

formulaire.addEventListener("submit", async (soumission) => {
  soumission.preventDefault();
  const saisie = {
    dossier,
    nom: nom.value,
    depot: depot.value,
    hote: hote.value,
    manager: { modele: calibre("manager-modele").value, effort: calibre("manager-effort").value },
    reviewer: { modele: calibre("reviewer-modele").value, effort: calibre("reviewer-effort").value },
    sauvegardes: sauvegardes.value,
  };
  envoi.disabled = true;
  poserIssue({ etat: "en-cours", titre: "Demande en cours — si elle part, la box clone le dépôt : cela peut prendre quelques minutes." });
  const issue = await brigade.installer(saisie).finally(() => (envoi.disabled = false));
  for (const champ of /** @type {const} */ (["dossier", "nom", "depot", "hote", ...CALIBRAGE, "sauvegardes"])) signaler(champ, issue.etat === "champs" ? issue.champs[champ] : "");
  poserIssue(issue);
  if (issue.etat === "pas-ajoute" && issue.declarable) {
    // Le projet est sur la box, pas dans l'app : c'est le chef qui demande de l'y déclarer.
    const declarer = bouton("Le déclarer dans l'app, tel qu'il est sur la box", async () => {
      const refus = await brigade.ajouter({ nom: saisie.nom, dossier: saisie.dossier, hote: saisie.hote });
      if (refus !== undefined) return void declarer.after(bloc("p", `Pas déclaré — ${refus}`));
      vider();
      poserIssue({ etat: "en-cours", titre: `« ${saisie.nom.trim()} » est déclaré dans l'app, tel qu'il est sur la box « ${saisie.hote} » : rien n'y a été écrit.` });
    });
    declarer.type = "button";
    issueAjout.append(declarer);
  }
  // Ajouté : la liste est déjà arrivée par `surConfiguration`, et l'écran reste, pour ses ports
  // — et pour ce qui reste à faire du projet.
  if (issue.etat === "ajoute") {
    vider();
    await poserSuite(issue.nom);
  }
});

// Sous un ajout réussi : ce qui reste avant que le projet soit servi, et le geste qui
// ouvre son espace sur la session d'init. La suite se lit là, sous « Mise en service ».
/** @param {string} nom */
async function poserSuite(nom) {
  const ajoute = issueAjout.firstChild;
  const parcours = await brigade.service(nom);
  // Rien, si l'écran dit déjà autre chose — ou si le projet a déjà quitté le fichier.
  if (parcours === undefined || issueAjout.firstChild !== ajoute) return;
  const lancer = bouton(`Ouvrir l'espace de « ${nom} » et y lancer ${parcours.init}`, async () => {
    const projet = projetDe(nom);
    const rendu = projet === undefined ? { refus: `« ${nom} » n'est plus dans ${configuration.chemin}` } : await brigade.amorcer(nom);
    if (projet === undefined || "refus" in rendu) return void lancer.after(bloc("p", `Pas lancé — ${"refus" in rendu ? rendu.refus : ""}`));
    recevoir(rendu);
    laisse.set(nom, rendu.id);
    void ouvrir(projet);
  });
  lancer.type = "button";
  issueAjout.append(
    bloc("strong", "Il n'est pas encore servi : reste à amorcer son dépôt, merger, vérifier, démarrer."),
    ...[...parcours.amorce, ...parcours.consigne].map((ligne) => bloc("p", ligne)),
    lancer,
    bloc("p", "La suite — dire le merge fait, « Vérifier », « Démarrer » — est dans son espace, en tête du panneau, sous « Mise en service ». Un dépôt déjà amorcé et mergé n'a pas à rejouer la session : ouvre son espace par la barre, et dis-le là."),
  );
}

// L'écran d'ajout, rendu vide : ce qui vient d'être ajouté n'y reste pas. La box choisie, si.
function vider() {
  const gardee = hote.value;
  formulaire.reset();
  hote.value = gardee;
  dossier = "";
  depotLu = "";
  choisi.textContent = "aucun dossier choisi";
  // Le calibrage du projet qui vient d'être ajouté se propose pour le suivant.
  proposes.clear();
  direPropose();
  void proposerCalibrage();
  void proposerRacine();
}

/** @param {Projet} projet */
async function ouvrir(projet) {
  courant = projet;
  nonEcrit = "";
  // Le geste « mettre en service » ouvert sur un autre projet ne reste pas ouvert.
  if (aMettre !== projet.nom) aMettre = "";
  ajoute = false;
  // Comme le panneau : l'onglet de contenu laissé là est relu tout de suite.
  suivi = undefined;
  marquer();
  // Dès maintenant : la carte et la bannière du projet quitté ne restent pas sur celui-ci
  // pendant que son espace s'ouvre.
  dessiner();
  attendre(projet, lu, lecture);
  // Ni ses pages servies : celles de ce projet viennent avec sa première lecture.
  poserPages(projet, undefined);
  // La mise en service du projet quitté ne reste pas non plus : celle-ci arrive.
  if (misEnService !== projet.nom) service.hidden = true;
  void lireService(projet);
  // Ni ses deux gestes de retrait : ils nomment leur projet.
  if (retraitPose !== projet.nom) retrait.hidden = true;
  void lireRetrait(projet);
  brigade.regarder(projet.nom, ++demande);
  if (projet.refus !== undefined) {
    message.textContent = `« ${projet.nom} » ne s'ouvre pas : ${projet.refus}`;
    return montrer();
  }
  const terminaux = await brigade.espace(projet.nom);
  terminaux.forEach(recevoir);
  const second = terminaux[0];
  if (second !== undefined && !laisse.has(projet.nom)) laisse.set(projet.nom, second.id);
  // Le chef a pu cliquer ailleurs pendant que l'espace s'ouvrait.
  if (courant === projet) montrer();
}

// Un terminal fermé : sa vue s'en va, et ce qu'il écrit encore n'est plus montré.
/** @param {number} id */
function oublier(id) {
  const fermee = vues.get(id);
  fermee?.xterm.dispose();
  fermee?.cadre.remove();
  vues.delete(id);
  engages.delete(id);
  fermes.add(id);
}

// Une sortie peut précéder l'annonce de son terminal : sa vue est alors créée ici.
brigade.surSortie((id, donnees) => {
  if (!fermes.has(id)) vue(id).xterm.write(donnees);
});
brigade.surEtat((terminal) => {
  if (terminal.genre === "shell" && terminal.arrete) {
    // Un shell qui sort ferme son onglet ; on revient au second.
    oublier(terminal.id);
    const second = [...vues.values()].find((tenue) => tenue.terminal.projet === terminal.projet && tenue.terminal.genre === "second");
    if (laisse.get(terminal.projet) === terminal.id && second !== undefined) laisse.set(terminal.projet, second.terminal.id);
  } else {
    recevoir(terminal);
  }
  montrer();
});
// Une lecture remplace tout ce qui était affiché du projet. Ratée, elle n'a pas
// d'état à montrer : ce que `ssh` a rendu prend sa place.
// Dans l'espace du projet, les serveurs que ce `status` montre viennent avec elle, et leur geste.
brigade.surLecture((recue, servies) => {
  // Demandée par un écran quitté depuis, elle était déjà en route : elle n'est pas pour celui-ci.
  if (recue.demande !== demande) return;
  if (courant === undefined) {
    const tenu = blocs.get(recue.projet);
    if (tenu !== undefined) rendre(recue, tenu.tete, tenu.corps);
  } else if (recue.projet === courant.nom) {
    rendre(recue, lu, lecture);
    poserPages(courant, servies);
  }
});
// Les faits d'un projet : ils remplacent ceux d'avant, partout où ils se dessinent —
// sa pastille dans la barre, sa carte dans « Tous les projets », et son espace s'il est affiché.
brigade.surFaits((recue) => {
  if (recue.demande !== demandeFaits) return;
  tenus.set(recue.projet, recue);
  marquerPastille(recue.projet);
  const projet = configuration.projets.find(({ nom }) => nom === recue.projet);
  const tenu = blocs.get(recue.projet);
  if (projet === undefined) return;
  if (courant === undefined && tenu !== undefined) poserCarte(tenu.carte, projet);
  else if (courant?.nom === recue.projet) dessiner();
});
// Ce que l'onglet de contenu affiché a rendu : une lecture ratée s'y lit comme
// dans le panneau, et n'en retire rien. Celle de l'onglet Manager vient avec l'état du
// manager, lu dans sa sortie : il remplace celui d'avant, au-dessus du texte. Celle de
// l'onglet Grants, de même, avec l'état des grants.
brigade.surContenu((recue, vu, desGrants) => {
  if (recue.demande !== demandeOnglet || recue.projet !== courant?.nom) return;
  rendre(recue, luOnglet, lectureOnglet);
  managerVu = vu;
  poserManager();
  grantsVus = desGrants;
  poserGrants();
});
// Les clones relus : leur état remplace celui d'avant, en tête de « Tous les projets » et sur sa case.
brigade.surCode((vu) => {
  codeVu = vu;
  poserCode();
});
new ResizeObserver(() => {
  const visible = actif();
  if (typeof visible === "number" && !zone.hidden) vues.get(visible)?.ajuste.fit();
}).observe(zone);

// Ce que le fichier des projets donne à voir : la barre, puis l'écran d'avant
// s'il existe encore — sinon « Tous les projets », ou l'ajout tant qu'il n'y a aucun projet.
function afficher() {
  relecture.hidden = configuration.nonRelu === undefined;
  relecture.textContent = [
    `${configuration.chemin} a changé, et n'a pas pu être relu :`,
    `  → ${configuration.nonRelu}`,
    "Tes projets sont ceux d'avant, et rien n'est fermé. L'app le relit dès qu'il change.",
  ].join("\n");
  // La barre est reposée : les faits d'avant répondaient à une autre liste, ils sont relus.
  tenus.clear();
  pastilles.clear();
  barre.replaceChildren(
    ...configuration.projets.map((projet) => {
      const entree = icone(projet.monogramme, projet.nom, () => void ouvrir(projet));
      entree.classList.toggle("refuse", projet.refus !== undefined);
      // Désinstallé de sa box par l'app : son entrée le dit, et n'a pas de pastille — rien n'est lu de lui.
      entree.classList.toggle("desinstalle", projet.desinstalle !== undefined);
      if (projet.desinstalle !== undefined) entree.ariaLabel = entree.title = `${projet.nom} — ${projet.desinstalle.titre}`;
      // Un projet sans box n'a pas de pastille : rien n'est lu de lui.
      if (projet.box !== undefined) {
        const posee = document.createElement("span");
        posee.className = "pastille";
        entree.append(posee);
        pastilles.set(projet.nom, posee);
        marquerPastille(projet.nom);
      }
      return entree;
    }),
  );
  brigade.faits(++demandeFaits);
  if (configuration.refus !== undefined) {
    // Ce fichier-là ne se répare pas d'ici : l'app n'écrit pas dans ce qu'elle n'a pas compris.
    courant = undefined;
    ajoute = false;
    marquer();
    message.textContent = [
      "L'app n'a pas pu lire le fichier de tes projets, et n'y touche pas.",
      "",
      configuration.chemin,
      `  → ${configuration.refus}`,
      "",
      "Sa forme — rien ne s'y recopie tel quel, chaque valeur entre < > est à remplacer :",
      "",
      exemple,
      "",
      "L'app relit ce fichier dès qu'il change : répare-le, elle suit.",
    ].join("\n");
    return montrer();
  }
  const entree = icone("T", "Tous les projets", ouvrirTous);
  entree.id = "entree-tous";
  const pied = icone("+", "Ajouter un projet", ouvrirAjout);
  pied.id = "entree-ajout";
  barre.prepend(entree);
  barre.append(pied);
  // La case « T » est neuve : ce que la dernière lecture des clones en dit y est reposé.
  poserCode();

  const meme = configuration.projets.find((projet) => projet.nom === courant?.nom);
  if (meme !== undefined) void ouvrir(meme);
  else if (ajoute || configuration.projets.length === 0) ouvrirAjout();
  // L'app s'ouvre sur « Tous les projets », en tête de la barre.
  else ouvrirTous();
  montrer();
}

const demarrage = await brigade.demarrage();
const exemple = demarrage.exemple;
ONGLETS = demarrage.onglets;
BOUTONS = demarrage.boutons;
GESTES_DU_MANAGER = demarrage.gestes.manager;
ALLUMAGE = demarrage.gestes.allumage;
GESTES_DE_LA_CUISINE = demarrage.gestes.cuisine;
GESTES_DES_GRANTS = demarrage.gestes.grants.gestes;
GRANTS_NOMMES = demarrage.gestes.grants.nommes;
DIRECTS = demarrage.gestes.directs;
BANNIERE = demarrage.banniere;
for (const champ of CALIBRAGE) proposer(calibre(champ), champ.endsWith("modele") ? demarrage.calibrage.modeles : demarrage.calibrage.efforts, champ.endsWith("modele") ? "— modèle —" : "— effort —");
// Une lecture arrivée pendant le démarrage est plus récente que celle qu'il rend.
codeVu ??= demarrage.code;
let configuration = demarrage.configuration;
// Le terminal mesure ses cases à l'ouverture : sa police, embarquée, est chargée avant qu'aucun
// ne s'ouvre. Si elle ne se charge pas, l'app s'ouvre quand même, sur la police de repli.
await Promise.all(["13px", "bold 13px"].map((corps) => document.fonts.load(`${corps} ${jeton("--police-mono")}`))).catch(() => undefined);
afficher();
// Posée une fois la première liste rendue : ce qui change ensuite la remplace.
brigade.surConfiguration((recue, partis) => {
  // Un projet qui a quitté la liste, ou changé de dossier, a perdu ses terminaux.
  for (const id of partis) {
    oublier(id);
    for (const [projet, onglet] of laisse) if (onglet === id) laisse.delete(projet);
  }
  configuration = recue;
  afficher();
});
