// @ts-check
// La vue : elle montre, elle ne tient rien. Les pty vivent dans le process
// principal ; ici, un xterm par terminal, gardé tant que l'app est ouverte —
// changer d'espace ou d'onglet ne fait que cacher l'un et montrer l'autre.
// Au centre de l'espace, le rail : c'est la vue principale, en cinq colonnes. Chaque carte y
// porte ce que la file dit du ticket — qui le tient, depuis quand, son bail, ce qu'il brûle, ce
// qui le bloque — et écrit ce qu'elle ne dit pas. En haut, les onglets de pages — Rail, Cooks,
// Manager, Grants, Log : chacune la sortie d'une commande, lue tant qu'elle est affichée — ; une
// page s'ouvre par-dessus le rail, et fermée, le rend tel qu'il était. À droite, en permanence,
// les terminaux : le second, et à côté de lui les shells. Un shell montré ne remplace pas le
// second — son onglet le rend, avec sa conversation. Ce qu'un clic écrit dans le second s'y lit,
// sans que le centre change. Et dans
// le panneau, ce que `status` dit du projet, telle quelle. Ce qui est un tableau à
// états est dessiné — une pastille par projet dans la barre, la carte de projet,
// le rail, la bannière d'arrêt — depuis les faits que la box rend comme des
// faits, et que le process principal a déjà mis en forme (faits.ts) : la vue
// pose un mot, un nombre, une couleur nommée, elle n'en calcule aucun. Sur ce qui se lit, les
// gestes du chef, chacun collé à l'état qu'il change, sous l'une de trois formes :
//   - direct : sa commande part dans le second au clic, s'il est libre, et sa sortie s'y lit ;
//   - confirmé : le clic ouvre, sous le bouton, une confirmation qui dit son prix — ce qu'il
//     interrompt, les cooks en vol et leurs tokens —, et rien ne part avant le « oui » du chef
//     (confirmation.ts) ; « non » la referme, sans rien faire partir ;
//   - avec jugement : une demande en prose s'écrit dans le second, et rien ne l'envoie — c'est
//     l'Entrée du chef qui la fait partir, jamais un clic.
// Ce qui part, et ce qu'une confirmation dit, se décident dans le process principal (gestes.ts,
// confirmation.ts, demande.ts) : la vue nomme un geste, jamais une commande. Restent deux boutons,
// dans leur onglet, qui écrivent dans le second une commande à compléter — une durée, un nombre —
// sans l'envoyer (boutons.ts). La vue n'y lit rien —
// elle ne sait pas ce qu'est un ticket. Ce qui attend le chef lui arrive déjà
// mis à part (attend.ts) : elle le pose en tête, quel que soit l'onglet.
// Dans l'onglet Manager, l'état du manager se pose au-dessus du texte — allumé ou éteint,
// depuis quand et par qui, ses dernières décisions, ce qu'il a écarté et pourquoi —, déjà lu
// par le process principal (manager.ts). À côté, ses deux gestes : éteindre, direct ; allumer,
// confirmé — sa confirmation dit l'avertissement de la doc et deux nombres, les issues ouvertes et
// celles qui portent `blocked-on-human`, demandés à la box dès qu'elle s'ouvre (allumage.ts).
// Dans l'onglet Grants, de même, l'état des grants : lequel est actif, son échéance — la durée
// restante en tête, l'heure ensuite —, ses derniers usages, et ce qu'aucun grant n'autorise,
// déjà lus par le process principal (grants.ts). À côté de chaque grant, ses deux gestes,
// accorder et révoquer, confirmés : chacun dit ce que le grant change avant de partir.
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
// Et, sur la carte de chaque ticket dont `status` montre un serveur, sa page : un geste direct,
// qui l'ouvre dans le navigateur du poste — ou ce qui se lit à sa place. Sous l'état, ce qui
// empêche les pages d'être servies. La vue ne montre aucune page et ne recueille aucun avis ;
// quel port, quelle adresse, et pourquoi pas, se décident dans page.ts.
// En tête de l'espace, la bande d'alertes : est-ce que ça peut tourner ? Le manager, la version
// en service, la cuisine, le grant — une ligne par chose à faire, avec son geste et son prix, et
// une ligne « non vérifié » pour chaque état que la box ne dit pas. Vide, elle ne prend aucune
// place. Ce qui s'y dit et ce que son bouton appelle se décident dans alertes.ts : la vue pose. Le
// geste d'une ligne y est collé : confirmé — mettre en service, couper, reprendre, réaccorder,
// allumer —, direct — renoncer à une mise en service —, ou une demande au second quand il faut
// lire, juger ou agir sur la box ; une ligne « non vérifié » mène à l'onglet qui lit l'état.
// Arrêter la cuisine est sur le rail, qu'il arrête ; vérifier l'installation, en tête de l'espace,
// à côté du nom du projet.
// Juste au-dessus de ce qui attend le chef, la version du runtime : à jour, en attente — depuis
// quand, combien de livraisons ne sont pas en service —, ou pas comparée, et les cooks en vol.
// Une mise en service qui a échoué s'y lit aussi. Son geste n'y est pas : il est sur la ligne de
// la bande qui dit que la version attend. Ce qui se dit se décide dans version.ts : la vue pose.
// En tête de « Tous les projets », le code de l'app lui-même : à jour, ou en retard sur
// l'origine de son clone — et de combien de commits —, avec l'heure de sa lecture ; de même
// pour le clone d'un projet qui est celui de brigade. En retard, un bouton écrit `git pull`
// dans un shell, et n'envoie rien : l'app ne met rien à jour. Ce qui se lit, ce qui s'en dit
// et ce qui s'écrit se décident dans retard.ts.
// Chaque projet a ses deux couleurs, tirées à son ajout et écrites avec lui dans le fichier des
// projets (couleurs.ts) : celle de son onglet teint sa case dans la barre, celle de son accent
// remplace l'accent de la peau tant que son espace est affiché. Elles se changent sous Paramètres,
// parmi la palette que le process principal donne ; ce qui s'écrit se décide là-bas. Les couleurs
// d'état — vert, jaune, rouge, bleu, gris — n'en dépendent jamais.
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
/** @typedef {import("../alertes.ts").Alerte} Alerte */
/** @typedef {import("../page.ts").Pages} Pages */
/** @typedef {import("../manager.ts").Vu} VuDuManager */
/** @typedef {import("../grants.ts").Vu} VuDesGrants */
// Ce que `onglets.ts` nomme : le journal, et l'onglet Paramètres, qui n'a pas de commande à lui.
const JOURNAL = "log";
const PARAMETRES = "parametres";
/** @typedef {import("../allumage.ts").Compte} Compte */
/** @typedef {import("../confirmation.ts").Confirmation} Confirmation */
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
const bande = element("alertes");
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
const gestesProjet = element("gestes-projet");
const pages = element("pages");
const version = element("version");
const note = element("note");
const ongletsTerminaux = element("terminaux");
const colonneSecond = element("second");
const noteSecond = element("note-second");
const fil = element("fil");
const message = element("message");
const etat = element("etat");
const parametresOnglets = element("parametres-onglets");
const journal = element("journal");
const service = /** @type {HTMLDetailsElement} */ (element("service"));
const serviceTitre = element("service-titre");
const serviceEtapes = element("service-etapes");
const retrait = /** @type {HTMLDetailsElement} */ (element("retrait"));
const retraitTitre = element("retrait-titre");
const retraitGestes = element("retrait-gestes");
const couleurs = element("couleurs");
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
// La page où chaque projet a été laissé : on y revient. Aucune : le rail a le centre.
/** @type {Map<string, string>} */
const laisse = new Map();
// Le shell que chaque projet montre à droite, à la place du second. Aucun : c'est le second.
/** @type {Map<string, number>} */
const aDroite = new Map();
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
// Les couleurs qu'un projet peut prendre, dites de même (couleurs.ts) : un nom, une valeur.
/** @type {readonly { nom: string, valeur: string }[]} */
let PALETTE = [];
// Les deux onglets de l'écran principal et les lectures qu'ils rangent, dits de même.
/** @type {readonly import("../onglets.ts").Rubrique[]} */
let RUBRIQUES = [];
// L'onglet qui range ce qui est affiché : une lecture, ou Paramètres lui-même. Le journal n'en a pas.
/** @param {number | string | undefined} id */
const rubriqueDe = (id) => RUBRIQUES.find(({ lectures }) => lectures.includes(/** @type {string} */ (id)));
// Les boutons d'action, dits de même (boutons.ts) : la vue les pose, elle ne sait pas ce qu'ils écrivent.
/** @type {readonly import("../boutons.ts").Bouton[]} */
let BOUTONS = [];
// Les deux gestes du manager, dits de même (manager.ts) : la vue les nomme, elle ne sait pas ce qu'ils écrivent.
/** @type {readonly { id: string, libelle: string }[]} */
let GESTES_DU_MANAGER = [];
// Ce qu'engage l'allumage du manager, dit de même (allumage.ts) : la lecture qui le chiffre, et ce qui se pose avant elle.
/** @type {typeof import("../allumage.ts").ALLUMAGE | undefined} */
let ALLUMAGE;
// La confirmation ouverte : celle d'un geste, pour un projet, à un endroit — la même ne s'ouvre
// qu'une fois, sous le bouton cliqué. `rendu` : ce qu'elle dit, ou pourquoi le geste ne s'offre
// pas — absent, la demande est en route. `compte` : ce que la box a compté pour « allumer » —
// absent, en cours ; nul, pas demandé. Indéfinie : aucune n'est ouverte, et rien ne part.
/** @type {{ projet: string, cle: string, rendu?: Confirmation | { refus: string }, compte?: Compte | null } | undefined} */
let aConfirmer;
// Ce que la dernière lecture de l'onglet Manager donne à poser. Indéfini : pas encore lu depuis
// que l'onglet est affiché — rien ne reste de ce qui s'y lisait avant.
/** @type {VuDuManager | undefined} */
let managerVu;
// Les trois gestes de la cuisine et de l'installation, dits de même (cuisine.ts) : leurs libellés.
// Arrêter se pose sur le rail ; reprendre, sur ce qui dit la cuisine à l'arrêt ; vérifier l'installation, en tête de l'espace.
/** @type {readonly { id: string, libelle: string }[]} */
let GESTES_DE_LA_CUISINE = [];
// Les deux gestes d'un grant, dits de même (grants.ts), et les grants que la doc nomme (gestes.ts) :
// sans état lu, c'est pour ceux-là que les gestes restent offerts.
/** @type {readonly { id: string, libelle: string }[]} */
let GESTES_DES_GRANTS = [];
/** @type {readonly string[]} */
let GRANTS_NOMMES = [];
// Les gestes directs, et les confirmés, dits de même (gestes.ts) : le clic d'un direct fait partir
// sa commande dans le second — ou dit pourquoi elle ne part pas ; celui d'un confirmé ouvre sa
// confirmation, et rien ne part avant son « oui ». La vue ne le décide pas.
/** @type {readonly string[]} */
let DIRECTS = [];
/** @type {readonly string[]} */
let CONFIRMES = [];
// Ce que la dernière lecture de l'onglet Grants donne à poser. Indéfini : pas encore lu depuis
// que l'onglet est affiché — rien ne reste de ce qui s'y lisait avant, ni la durée qui restait.
/** @type {VuDesGrants | undefined} */
let grantsVus;
// Pourquoi le dernier bouton cliqué n'a rien fait : dit sous les onglets de pages, jusqu'au prochain geste —
// ou, quand c'est le second qui n'a rien reçu, à droite, sous les onglets des terminaux.
let nonEcrit = "";
let nonEcritSecond = "";
// Le terminal qui prend le clavier au prochain affichage : celui qu'un geste du chef vient de
// montrer ou d'écrire. Sans geste, personne ne le prend — le second ne perd pas sa frappe.
/** @type {number | undefined} */
let aFocaliser;
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
// La dernière bande d'alertes de chaque projet, telle que le process principal l'a dite (alertes.ts).
/** @type {Map<string, Alerte[]>} */
const bandes = new Map();
// Ce que chaque bande dit de son projet sur sa case de la barre (alertes.ts, `signalDe`), et les
// signaux posés : un seul par case.
/** @type {Map<string, {etat: string, dit: string} | undefined>} */
const signaux = new Map();
/** @type {Map<string, HTMLElement>} */
const signalees = new Map();
// Dans la barre, la pastille de chaque projet qui a une box.
/** @type {Map<string, HTMLElement>} */
const pastilles = new Map();
// Les pages servies de chaque projet, telles que sa dernière lecture de `status` les rend (page.ts) :
// chacune se pose sur la carte de son ticket.
/** @type {Map<string, Pages>} */
const pagesServies = new Map();
// Le projet dont la mise en service est posée dans le panneau : la reposer ne la replie ni ne la déplie.
let misEnService = "";
// Celui dont les deux gestes de retrait sont posés : les reposer ne les replie pas, et ne
// perd ni le nom que le chef est en train d'écrire pour confirmer, ni pourquoi il n'a pas été retiré de l'app.
let retraitPose = "";
// Pourquoi la dernière couleur choisie n'a pas été écrite, et pour quel projet — rien, si elle l'a été.
let couleurRefusee = { projet: "", refus: "" };
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
    fil.append(cadre);
    xterm.loadAddon(ajuste);
    xterm.open(cadre);
    xterm.onData((donnees) => brigade.ecrire(id, donnees));
    // Shift+Entrée : xterm l'envoie comme Entrée (`\r`) et le shell comme `claude` l'exécutent ou
    // l'envoient. Un retour à la ligne, lui, ne part pas : `ESC` + `\r` pour `claude` (son Alt+Entrée),
    // un saut de ligne cité (`^V` `^J`) pour le shell.
    xterm.attachCustomKeyEventHandler((touche) => {
      if (touche.key !== "Enter" || !touche.shiftKey) return true;
      if (touche.type === "keydown") brigade.ecrire(id, vue(id).terminal.genre === "second" ? "\x1b\r" : "\x16\n");
      return false;
    });
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
const secondDuCourant = () => duCourant().find(({ terminal }) => terminal.genre === "second");
// Le terminal montré à droite : le shell que le chef y a laissé, sinon le second.
const montreADroite = () => {
  const shell = courant === undefined ? undefined : aDroite.get(courant.nom);
  return (shell === undefined ? undefined : vues.get(shell)) ?? secondDuCourant();
};

function montrer() {
  const visible = actif();
  const relaye = ONGLETS.find(({ id }) => id === visible);
  const droite = montreADroite();
  // Le second et les shells, à droite : chaque cadre y est posé une fois, et y reste. Un seul est
  // montré — celui que le chef a choisi ; caché, aucun ne perd ce qu'il avait reçu.
  for (const { terminal, cadre } of vues.values()) cadre.hidden = terminal.id !== droite?.terminal.id;

  const ouvrable = courant !== undefined && courant.refus === undefined;
  const terminaux = duCourant().map(({ terminal }) => terminal);
  // En haut, les deux onglets de pages, Coût et Paramètres. Les terminaux n'en sont pas : ils sont à droite.
  espace.textContent = courant?.nom ?? "";
  onglets.replaceChildren(
    ...(courant === undefined
      ? []
      : RUBRIQUES.map(({ titre, id }) => {
          const cree = bouton(titre, () => activerRubrique(id));
          cree.role = "tab";
          cree.ariaSelected = String(rubriqueDe(visible)?.id === id);
          return cree;
        })),
  );
  // À droite, au même niveau : le second, ses shells, et de quoi en ouvrir un. Le second a toujours son onglet.
  const second = secondDuCourant()?.terminal;
  /** @param {string} titre @param {number | undefined} id */
  const terminal = (titre, id) => {
    const cree = bouton(titre, () => montrerADroite(id));
    cree.role = "tab";
    cree.ariaSelected = String(courant !== undefined && (id === undefined ? droite === undefined || droite.terminal.genre === "second" : id === droite?.terminal.id));
    return cree;
  };
  ongletsTerminaux.replaceChildren(
    ...(courant === undefined
      ? []
      : [
          terminal(second?.titre ?? "Second", undefined),
          ...terminaux.filter(({ genre }) => genre !== "second").map(({ titre, id }) => terminal(titre, id)),
          ...(ouvrable ? [bouton("+ shell", ouvrirShell)] : []),
        ]),
  );

  note.textContent =
    nonEcrit !== "" ? nonEcrit : relaye === undefined ? "" : courant?.desinstalle !== undefined ? "rien n'est lu pour cet onglet : ce projet est désinstallé de sa box" : `${relaye.id === "manager" ? "l'état du manager, puis " : relaye.id === "grants" ? "l'état des grants, puis " : ""}la sortie de \`${courant === undefined ? "" : geste(courant, relaye.commande)}\`, telle que la box la rend${relaye.precision === undefined ? "" : ` (${relaye.precision})`} — relue seule toutes les trente secondes, tant que cet onglet est affiché`;
  note.hidden = note.textContent === "";
  const parametres = rubriqueDe(visible)?.id === PARAMETRES;
  // Une page se pose par-dessus le rail : il reste dessous, tel quel, et rien de lui ne se clique au travers.
  contenu.hidden = relaye === undefined && visible !== PARAMETRES;
  rail.inert = !contenu.hidden;
  // Paramètres pose d'abord l'état du projet, puis, au choix, la lecture du manager, des grants, du rail.
  etat.hidden = courant === undefined || visible !== PARAMETRES;
  luOnglet.hidden = relaye === undefined;
  parametresOnglets.hidden = !parametres;
  if (parametres) {
    parametresOnglets.replaceChildren(
      ...[[PARAMETRES, "Réglages"], ...ONGLETS.filter(({ id }) => rubriqueDe(id)?.id === PARAMETRES).map(({ id, titre }) => [id, titre])].map(([id, titre]) => {
        const cree = bouton(/** @type {string} */ (titre), () => void (laisse.set(/** @type {Projet} */ (courant).nom, /** @type {string} */ (id)), nonEcrit = "", montrer()));
        cree.ariaPressed = String(id === visible);
        return cree;
      }),
    );
  }
  // Le journal : un geste, pas un onglet. Le recliquer le referme.
  journal.hidden = courant === undefined || courant.box === undefined;
  journal.ariaPressed = String(visible === JOURNAL);
  // Au centre, seul un fichier des projets illisible a sa raison à la place de l'espace.
  message.hidden = courant !== undefined;
  poserSecond(ouvrable, droite?.terminal);
  poserGestes(gestesOnglet, relaye?.id);
  dessiner();
  lireOnglet();
  droite?.ajuste.fit();
  const focalise = aFocaliser === undefined ? undefined : vues.get(aFocaliser);
  aFocaliser = undefined;
  if (focalise !== undefined && !focalise.cadre.hidden) focalise.xterm.focus();
}

// La colonne des terminaux : ses onglets, sa note — ce qu'un geste a écrit dans le terminal
// montré, ou pourquoi rien ne l'a été —, et ce terminal. Un projet qui ne s'ouvre pas n'a pas de
// second : la colonne dit pourquoi, à sa place — sa box, elle, se lit au centre et dans le panneau.
/** @param {boolean} ouvrable @param {Terminal | undefined} montre */
function poserSecond(ouvrable, montre) {
  colonneSecond.hidden = courant === undefined;
  noteSecond.textContent =
    courant !== undefined && courant.refus !== undefined
      ? `« ${courant.nom} » ne s'ouvre pas : ${courant.refus} — il n'a pas de second`
      : nonEcritSecond !== ""
        ? nonEcritSecond
        : (montre?.note ?? (ouvrable ? "le second s'ouvre…" : ""));
  fil.hidden = !ouvrable;
}

// Un terminal qu'un geste a rendu se montre à droite, et prend le clavier : un shell, à côté du
// second ; le second, si un shell le cachait. Le centre ne change pas : rien n'y est masqué ni remplacé.
/** @param {string} projet @param {Terminal} terminal */
function garder(projet, terminal) {
  recevoir(terminal);
  if (terminal.genre === "second") aDroite.delete(projet);
  else aDroite.set(projet, terminal.id);
  if (projet === courant?.nom) aFocaliser = terminal.id;
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

// Les boutons de l'onglet de contenu affiché : une commande à compléter, écrite dans le second. Un
// projet sans box n'en a pas : il n'y a pas de commande à écrire.
/** @param {HTMLElement} ou @param {string | undefined} endroit */
function poserGestes(ou, endroit) {
  const poses = courant?.box === undefined ? [] : BOUTONS.filter((pose) => pose.ou === endroit);
  ou.hidden = poses.length === 0;
  ou.replaceChildren(
    ...(poses.length === 0 ? [] : [bloc("span", "écrire dans le second, sans envoyer — à compléter :")]),
    // Une commande qui attend sa suite le montre : le chef la tape avant Entrée.
    ...poses.map(({ id, commande }) => boutonDeCommande(commande.endsWith(" ") ? `${commande}…` : commande, () => void inscrire(id))),
  );
}

// Un bouton n'agit pas : sa commande s'écrit dans le second, à droite, pour que le chef la
// complète — c'est sa note qui dit ce qui a été écrit, et que rien n'est parti ; le centre ne change pas.
// Un projet qui ne s'ouvre pas n'a pas de second : sa colonne dit déjà pourquoi.
/** @param {string} id */
async function inscrire(id) {
  const projet = courant;
  if (projet === undefined) return;
  nonEcrit = nonEcritSecond = "";
  if (projet.refus !== undefined) return montrer();
  try {
    const rendu = await brigade.inscrire(projet.nom, id);
    if (rendu === undefined) return;
    // Le chef a pu changer d'espace entre-temps : le second de ce projet le garde.
    if ("refus" in rendu) nonEcritSecond = rendu.refus;
    else garder(projet.nom, rendu);
  } catch (erreur) {
    // Le projet a pu quitter le fichier entre l'affichage du bouton et le clic.
    nonEcritSecond = `rien n'est écrit : ${erreur instanceof Error ? erreur.message : String(erreur)}`;
  }
  montrer();
}

// Une carte de T'attend n'agit pas non plus : elle écrit une demande en prose dans le second, à
// droite, et rien ne l'envoie — c'est le second qui lit l'issue, explique et répond (demande.ts).
// Le rail reste où il est, et la page ouverte par-dessus aussi.
/** @param {number} ticket */
async function demander(ticket) {
  const projet = courant;
  if (projet === undefined) return;
  nonEcrit = nonEcritSecond = "";
  if (projet.refus !== undefined) return montrer();
  try {
    const rendu = await brigade.demander(projet.nom, ticket);
    if (rendu === undefined) nonEcritSecond = `rien n'est écrit : le bloc \`attend\` ne nomme plus #${ticket}`;
    else if ("refus" in rendu) nonEcritSecond = rendu.refus;
    else garder(projet.nom, rendu);
  } catch (erreur) {
    nonEcritSecond = `rien n'est écrit : ${erreur instanceof Error ? erreur.message : String(erreur)}`;
  }
  montrer();
}

// Une ligne de la bande d'alertes dont le geste demande du jugement : une demande en prose
// s'écrit dans le second, à droite, et rien ne l'envoie — le second lit, explique, et c'est ton
// Entrée qui la fait partir (demande.ts). La vue nomme la ligne ; la phrase vient de ce que la
// bande en dit, dans le process principal. Le centre ne change pas.
/** @param {Alerte} alerte */
async function demanderAlerte({ sujet, dit }) {
  const projet = courant;
  if (projet === undefined) return;
  nonEcrit = nonEcritSecond = "";
  if (projet.refus !== undefined) return montrer();
  try {
    const rendu = await brigade.demanderAlerte(projet.nom, sujet, dit);
    if (rendu === undefined) nonEcritSecond = `rien n'est écrit : la bande ne dit plus « ${dit} »`;
    else if ("refus" in rendu) nonEcritSecond = rendu.refus;
    else garder(projet.nom, rendu);
  } catch (erreur) {
    nonEcritSecond = `rien n'est écrit : ${erreur instanceof Error ? erreur.message : String(erreur)}`;
  }
  montrer();
}

// Un geste du socle, collé à l'état qu'il change : son bouton, et — confirmé et ouvert — sa
// confirmation, dessous. Direct, il part au clic. Confirmé, le clic ouvre ce qu'il coûte, et rien
// ne part ; recliqué, la confirmation se referme. `ou` : l'endroit où il est posé — la même
// confirmation ne s'ouvre que sous le bouton cliqué. `grant` : celui sur lequel il porte.
/** @param {Projet} projet @param {{ id: string, libelle: string, ou: string, grant?: string }} geste */
function poserGeste(projet, { id, libelle, ou, grant }) {
  if (!CONFIRMES.includes(id)) {
    const direct = bouton(libelle, () => void ecrireGeste(id, grant));
    direct.dataset.geste = "direct";
    direct.title = "part aussitôt dans le second, s'il est libre — sa sortie s'y lit";
    return [direct];
  }
  const cle = JSON.stringify([id, grant ?? "", ou]);
  const ouverte = aConfirmer?.projet === projet.nom && aConfirmer.cle === cle ? aConfirmer : undefined;
  const confirme = bouton(`${libelle}…`, () => void ouvrirConfirmation(projet, cle, id, grant));
  confirme.dataset.geste = "confirme";
  confirme.ariaExpanded = String(ouverte !== undefined);
  confirme.title = "dit d'abord ce qu'il coûte : rien ne part avant ton « oui »";
  return ouverte === undefined ? [confirme] : [confirme, poserConfirmation(projet, ouverte, grant)];
}

// Le clic d'un geste confirmé : sa confirmation s'ouvre — ce qu'elle dit vient du process
// principal (confirmation.ts) —, et celle qui était ouverte se referme. Rien ne part. Recliqué,
// il la referme. « Allumer » se chiffre aussi : `manager backlog` est demandée à la box, et ses
// nombres rejoignent la confirmation quand elle répond — le « oui » ne les attend pas.
/** @param {Projet} projet @param {string} cle @param {string} id @param {string} [grant] */
async function ouvrirConfirmation(projet, cle, id, grant) {
  nonEcrit = nonEcritSecond = "";
  if (aConfirmer?.projet === projet.nom && aConfirmer.cle === cle) {
    aConfirmer = undefined;
    return montrer();
  }
  const ouverte = { projet: projet.nom, cle };
  aConfirmer = ouverte;
  montrer();
  /** @type {Confirmation | { refus: string } | undefined} */
  let rendu;
  try {
    rendu = await brigade.confirmer(projet.nom, id, grant);
  } catch (erreur) {
    rendu = { refus: `rien n'est offert : ${erreur instanceof Error ? erreur.message : String(erreur)}` };
  }
  // Refermée, ou une autre ouverte entre-temps : ce qu'elle dit n'a plus où se poser.
  if (aConfirmer !== ouverte) return;
  aConfirmer = { ...ouverte, rendu: rendu ?? { refus: "rien n'est offert : ce geste ne se confirme pas" } };
  montrer();
  if (rendu === undefined || "refus" in rendu || rendu.chiffrer !== true) return;
  const compte = await brigade.compter(projet.nom).catch(() => undefined);
  if (aConfirmer?.projet !== projet.nom || aConfirmer.cle !== cle) return;
  aConfirmer = { ...aConfirmer, compte: compte ?? null };
  montrer();
}

// Ce que coûte un geste confirmé, sous son bouton : ce qu'il fait, son prix en clair, les cooks
// en vol et ce qu'ils ont dépensé, d'où c'est tiré — puis un bouton par « oui », chacun avec ce
// qu'il engage, et le « non ». Un « oui » fait partir son geste, dans le second ; « non » referme.
// Rien n'y est calculé : tout est dit par le process principal (confirmation.ts, allumage.ts).
/** @param {Projet} projet @param {NonNullable<typeof aConfirmer>} ouverte @param {string} [grant] */
function poserConfirmation(projet, { rendu, compte }, grant) {
  const confirmation = document.createElement("div");
  confirmation.className = "confirmation";
  confirmation.role = "group";
  const fermer = () => {
    aConfirmer = undefined;
    montrer();
  };
  if (rendu === undefined) {
    confirmation.append(bloc("p", "ce qu'il coûte : lecture en cours…"));
    return confirmation;
  }
  if ("refus" in rendu) {
    const refus = bloc("p", rendu.refus);
    refus.className = "refus";
    confirmation.append(refus, bouton("fermer", fermer));
    return confirmation;
  }
  confirmation.ariaLabel = rendu.titre;
  confirmation.append(bloc("strong", `⚠️ ${rendu.titre}`), ...rendu.prix.map((ligne) => bloc("p", ligne)), ...(rendu.enVol === undefined ? [] : poserEnVol(rendu.enVol)));
  if (rendu.chiffrer === true && ALLUMAGE !== undefined) {
    const nombres = bloc("p", compte === undefined ? ALLUMAGE.enCours : compte === null ? ALLUMAGE.parti : "sans" in compte ? compte.sans : compte.dit);
    nombres.className = "nombres";
    confirmation.append(
      nombres,
      ...(compte === undefined || compte === null ? [] : [bloc("small", `d'après \`${geste(projet, ALLUMAGE.commande)}\`, lancée à ta place à l'ouverture — lu à ${new Date(compte.a).toLocaleTimeString("fr-FR")}`)]),
      ...(compte === undefined || compte === null || !("sans" in compte) || compte.obtenu === "" ? [] : [bloc("pre", compte.obtenu)]),
    );
  }
  if (rendu.lu !== undefined) confirmation.append(bloc("small", `d'après \`${geste(projet, "faits")}\`, lu à ${new Date(rendu.lu).toLocaleTimeString("fr-FR")}`));
  confirmation.append(
    ...rendu.choix.map(({ id, libelle, dit }) => {
      const choix = document.createElement("p");
      choix.className = "gestes";
      const oui = bouton(libelle, () => {
        aConfirmer = undefined;
        void ecrireGeste(id, grant, true);
      });
      oui.dataset.oui = "";
      choix.append(oui, bloc("span", dit));
      return choix;
    }),
  );
  const non = document.createElement("p");
  non.className = "gestes";
  non.append(bouton(rendu.renoncer, fermer), bloc("span", "rien ne part"));
  confirmation.append(non);
  return confirmation;
}

// Un geste part dans le second, à droite : sa sortie s'y lit, sa note dit ce qui est parti, et le
// centre ne change pas. Le second n'est pas libre : rien n'y est écrit, et la raison se lit sous
// son titre — occupé, la commande n'est pas partie. `oui` : le « oui » d'une confirmation — un geste
// confirmé ne part qu'avec lui. `grant` : celui sur lequel porte un geste de grant.
/** @param {string} id @param {string} [grant] @param {true} [oui] */
async function ecrireGeste(id, grant, oui) {
  const projet = courant;
  if (projet === undefined) return;
  nonEcrit = nonEcritSecond = "";
  try {
    const rendu = await brigade.geste(projet.nom, id, grant, oui);
    if (rendu === undefined) return montrer();
    // Le chef a pu changer d'espace entre-temps : le second de ce projet le garde.
    if ("refus" in rendu) nonEcritSecond = rendu.refus;
    else garder(projet.nom, rendu);
  } catch (erreur) {
    nonEcritSecond = `rien n'est parti : ${erreur instanceof Error ? erreur.message : String(erreur)}`;
  }
  montrer();
}

// La page cliquée s'ouvre par-dessus le rail ; recliquée, elle se referme, et le rail revient tel qu'il était.
/** @param {string} id */
function activer(id) {
  nonEcrit = "";
  if (courant === undefined) return montrer();
  if (laisse.get(courant.nom) === id) laisse.delete(courant.nom);
  else laisse.set(courant.nom, id);
  montrer();
}

// À droite, l'onglet d'un shell le montre à la place du second ; celui du second le rend. Ni l'un
// ni l'autre ne se ferme : caché, un terminal garde ce qu'il avait reçu. Celui montré prend le clavier.
/** @param {number | undefined} id */
function montrerADroite(id) {
  if (courant === undefined) return montrer();
  if (id === undefined) aDroite.delete(courant.nom);
  else aDroite.set(courant.nom, id);
  aFocaliser = id ?? secondDuCourant()?.terminal.id;
  montrer();
}

// Coût ouvre sa lecture ; Paramètres, l'état du projet — par-dessus le rail. Recliqué, l'onglet ouvert se referme.
/** @param {string} id */
function activerRubrique(id) {
  const rubrique = RUBRIQUES.find((candidate) => candidate.id === id);
  if (rubrique === undefined) return;
  nonEcrit = "";
  if (courant === undefined) return montrer();
  if (rubriqueDe(laisse.get(courant.nom))?.id === id) laisse.delete(courant.nom);
  else laisse.set(courant.nom, rubrique.defaut);
  montrer();
}

journal.addEventListener("click", () => {
  if (courant !== undefined) activer(JOURNAL);
});

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
  // Le chef a pu changer d'espace pendant que le shell s'ouvrait : il attend dans le sien.
  garder(projet.nom, shell);
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
// Le terminal est montré, à droite : c'est sa note qui dit ce qui a été lancé, ou écrit. La raison
// se lit là où il se serait montré : à droite, sous les onglets des terminaux.
/** @param {Projet} projet @param {Terminal | { refus: string }} rendu */
function suivreGeste(projet, rendu) {
  nonEcrit = nonEcritSecond = "";
  if (!("refus" in rendu)) garder(projet.nom, rendu);
  else nonEcritSecond = rendu.refus;
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

// L'accent de l'espace affiché : celui de son projet, à la place de celui de la peau — posé sur la
// racine, il vaut pour tout ce que la peau dit choisi ou au clavier. Ailleurs, la peau reprend le sien.
function teindre() {
  const accent = ajoute ? undefined : courant?.couleurs?.accent;
  if (accent === undefined) document.documentElement.style.removeProperty("--accent");
  else document.documentElement.style.setProperty("--accent", accent);
}

// Les couleurs du projet, sous Paramètres : une rangée par rôle, une pastille par couleur de la
// palette — celle qu'il porte est pressée. Une couleur écrite à la main hors de la palette se
// montre aussi, pressée, sans geste : la palette est ce que l'app propose, pas ce qu'elle exige.
/** @param {Projet} projet */
function poserCouleurs(projet) {
  if (couleurRefusee.projet !== projet.nom) couleurRefusee = { projet: "", refus: "" };
  couleurs.hidden = false;
  /** @param {"onglet" | "accent"} role @param {string} libelle */
  const rangee = (role, libelle) => {
    const portee = projet.couleurs?.[role];
    const pastilles = PALETTE.map(({ nom, valeur }) => {
      const cree = bouton("", () => void colorer(projet, role, nom));
      cree.className = "teinte";
      cree.style.setProperty("--teinte", valeur);
      cree.title = cree.ariaLabel = `${libelle} : ${nom}`;
      cree.ariaPressed = String(valeur === portee);
      return cree;
    });
    if (portee !== undefined && !PALETTE.some(({ valeur }) => valeur === portee)) {
      const tienne = bouton("", () => {});
      tienne.className = "teinte";
      tienne.style.setProperty("--teinte", portee);
      tienne.title = tienne.ariaLabel = `${libelle} : ${portee}, écrite dans le fichier des projets`;
      tienne.ariaPressed = "true";
      tienne.disabled = true;
      pastilles.push(tienne);
    }
    const ligne = document.createElement("div");
    ligne.className = "rangee";
    ligne.append(bloc("span", libelle), ...pastilles);
    return ligne;
  };
  const refus = bloc("p", couleurRefusee.refus);
  refus.className = "refus";
  couleurs.replaceChildren(
    bloc("h3", "Couleurs"),
    rangee("onglet", "Onglet, dans la barre"),
    rangee("accent", "Accent, dans l'espace"),
    ...(projet.couleurs === undefined ? [bloc("p", "Pas encore de couleurs : l'app les tire et les écrit dans le fichier des projets.")] : []),
    ...(couleurRefusee.refus === "" ? [] : [refus]),
  );
}

// Une couleur choisie : le process principal l'écrit dans le fichier des projets, et elle revient
// par `surConfiguration` — la barre et l'espace la prennent alors. Refusée, la raison se lit dessous.
/** @param {Projet} projet @param {"onglet" | "accent"} role @param {string} nom */
async function colorer(projet, role, nom) {
  const refus = await brigade.colorer(projet.nom, role, nom);
  couleurRefusee = { projet: projet.nom, refus: refus ?? "" };
  if (courant?.nom === projet.nom) poserCouleurs(courant);
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

// Le signal d'un projet sur sa case : une alerte, ou « non vérifié » — jamais rien de plus sain
// que ce que la bande a dit. Le projet affiché n'en porte pas : sa bande est sous ses yeux.
// Cliquer le signal ouvre l'espace du projet : sa bande y est en tête, chaque alerte avec son geste
// et son prix, la plus grave d'abord (alertes.ts) — rien à chercher, un clic de plus lance le geste.
/** @param {string} nom */
function marquerSignal(nom) {
  const entree = pastilles.get(nom)?.parentElement;
  if (entree === null || entree === undefined) return;
  const signal = courant?.nom === nom ? undefined : signaux.get(nom);
  const pose = signalees.get(nom);
  if (signal === undefined) {
    pose?.remove();
    signalees.delete(nom);
    return;
  }
  const marque = pose ?? document.createElement("span");
  marque.className = "signal";
  marque.dataset.etat = signal.etat;
  marque.textContent = signal.etat === "alerte" ? "!" : "?";
  marque.title =
    signal.etat === "alerte"
      ? `${nom} : ${signal.dit} — alerte : quelque chose est à faire. Cliquer ouvre ${nom}, avec l'alerte, son geste et son prix`
      : `${nom} : ${signal.dit} — non vérifié : l'app n'a pas pu lire cet état, ce n'est pas une panne. Cliquer ouvre ${nom}, avec ce qui n'a pas pu être lu`;
  marque.ariaLabel = marque.title;
  if (pose === undefined) {
    marque.addEventListener("click", (evenement) => {
      evenement.stopPropagation();
      const projet = configuration.projets.find((candidat) => candidat.nom === nom);
      if (projet !== undefined) void ouvrir(projet);
    });
    entree.append(marque);
    signalees.set(nom, marque);
  }
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

// Une carte du rail : son numéro, son état, son titre, puis ce que la file dit du ticket —
// qui le tient, depuis quand, son bail, ce qu'il brûle, ce qui le bloque — et, nommément, ce
// qu'elle n'en dit pas : rien n'est omis, rien n'est mis à la place. Dans T'attend, ce que le
// bloc `attend` dit du ticket, mot pour mot, lignes comprises, et son geste — une demande au
// second. Dans Livré, sa PR mergée, qui s'ouvre comme son issue. Et la page du ticket, quand
// `status` en montre une servie, avec son geste direct.
// Tout est déjà rangé par le process principal (faits.ts, bon.ts, page.ts) : la vue pose. Le
// numéro s'ouvre sur l'issue : l'adresse reste au process principal, la vue nomme le ticket.
/** @param {Projet} projet @param {import("../faits.ts").Carte} carte @param {string | undefined} [tonAttend] le ton de T'attend, quand le bon y est posé */
function poserBon(projet, { ticket, etat, ton, titre, ouvrable, attendu, attend, pr, dit, sans, relais }, tonAttend) {
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
  if (attendu) {
    const pilule = bloc("span", "t'attend");
    pilule.className = "etat-ticket attendu";
    if (tonAttend !== undefined) pilule.dataset.ton = tonAttend;
    const forme = formeDe(tonAttend);
    if (forme !== undefined) pilule.dataset.forme = forme;
    tete.append(pilule);
  }
  bon.append(tete);
  if (titre !== undefined) bon.append(bloc("strong", titre));
  if (dit.length > 0) {
    const porte = document.createElement("ul");
    porte.className = "porte";
    porte.append(
      ...dit.map(({ libelle, valeur, exact: recopie }) => {
        const fait = document.createElement("li");
        fait.append(bloc("span", libelle), recopie ? exact("strong", valeur) : bloc("strong", valeur));
        return fait;
      }),
    );
    bon.append(porte);
  }
  // Ce que la file ne dit pas : écrit, chose par chose — ce sont les mots de l'app.
  if (sans !== undefined) bon.append(bloc("small", sans));
  // Livré : la PR mergée s'ouvre d'un clic. Son adresse reste au process principal, comme celle de l'issue.
  if (pr === true) {
    const ouvre = bouton("ouvrir la PR mergée", () => void ouvrirPr(projet, ticket));
    ouvre.className = "pr";
    ouvre.title = `ouvrir dans le navigateur la PR mergée de #${ticket}`;
    bon.append(ouvre);
  }
  if (pr === false) bon.append(bloc("small", "PR mergée : l'adresse que la box a rendue n'est pas en https, l'app ne l'ouvre pas"));
  // Sa ligne de `status`, quand l'app n'a pas su la découper : telle quelle, comme le reste de ce que la box rend.
  if (relais !== undefined) {
    const ligne = bloc("p", relais);
    ligne.className = "ligne";
    ligne.title = `ce que \`${geste(projet, "status")}\` écrit de #${ticket} sous sa ligne \`rail\`, mot pour mot`;
    bon.append(ligne);
  }
  bon.append(...attend.map((entree) => bloc("p", entree)));
  if (attend.length > 0) {
    const demande = bouton("demander au second", () => void demander(ticket));
    demande.className = "demander";
    demande.title = `écrire dans le second une demande sur #${ticket}, d'après ce que le bloc \`attend\` en dit — rien n'est envoyé : c'est toi qui fais Entrée`;
    demande.dataset.geste = "demande";
    bon.append(demande);
  }
  bon.append(...(pagesServies.get(projet.nom)?.pages ?? []).filter((page) => page.ticket === ticket).map((page) => poserServie(projet, page)));
  return bon;
}

// Le rail en cinq colonnes — Sur le rail, Au travail, Pass, T'attend, Livré —,
// tel que le process principal l'a rangé (faits.ts) : la vue pose, colonne par
// colonne. C'est la vue principale de l'espace : il est posé au centre, quel que soit
// l'onglet affiché dessous. Un projet sans box n'en a pas : rien n'est lu de lui. Sans
// faits, il dit pourquoi il n'est pas dessiné : la carte du panneau dit ce qui a été obtenu.
/** @param {Projet} projet */
function poserRail(projet) {
  const tenu = tenus.get(projet.nom);
  rail.hidden = projet.box === undefined || projet.desinstalle !== undefined;
  if (rail.hidden) return rail.replaceChildren();
  if (tenu === undefined) return rail.replaceChildren(bloc("h3", `le rail : première lecture de \`${geste(projet, "faits")}\` en cours…`));
  const heure = new Date(tenu.a).toLocaleTimeString("fr-FR");
  if (!("tableau" in tenu)) return rail.replaceChildren(bloc("h3", `le rail n'est pas dessiné : ${tenu.titre} — essai de ${heure}. Ce que l'app a obtenu est dans le panneau, à droite`));
  const { colonnes, hors, attendLu, railLu } = tenu.tableau.rail;
  /** @param {import("../faits.ts").Carte[]} cartes @param {string} [ton] */
  const bons = (cartes, ton) => {
    const liste = document.createElement("ol");
    liste.append(...cartes.map((carte) => poserBon(projet, carte, ton)));
    return liste;
  };
  const grille = document.createElement("div");
  grille.className = "colonnes";
  grille.append(
    ...colonnes.map(({ nom, ton, compte, cartes, vide, defile }) => {
      const colonne = document.createElement("section");
      colonne.className = "colonne";
      colonne.dataset.ton = ton;
      // Livré s'allonge tout le jour : ses cartes défilent dans leur hauteur, les autres colonnes restent en vue.
      if (defile) colonne.dataset.defile = "";
      const forme = formeDe(ton);
      if (forme !== undefined) colonne.dataset.forme = forme;
      const tete = document.createElement("h4");
      tete.append(bloc("span", nom), bloc("span", compte));
      colonne.append(tete, cartes.length === 0 ? bloc("p", surMesure(projet, vide)) : bons(cartes, ton));
      return colonne;
    }),
  );
  // D'où vient ce qui se lit : `faits` range les colonnes ; `status`, lu à part, dit en mots ce
  // qui t'attend (son bloc `attend`) et ce que chaque carte porte de plus (sa ligne `rail`).
  const status = `\`${geste(projet, "status")}\``;
  const lu = attendLu ?? railLu;
  const dOu =
    lu === undefined
      ? ` ; ${status} n'a pas été lu : chaque carte porte ce que \`faits\` dit seul`
      : ` — et ${status}, lu à ${new Date(lu).toLocaleTimeString("fr-FR")} : ${attendLu === undefined ? "son bloc `attend` n'a pas été pris" : "son bloc `attend` dit ce qui t'attend"}, ${railLu === undefined ? "sa ligne `rail` n'a pas été lue — chaque carte porte ce que `faits` dit seul" : "sa ligne `rail` ce que chaque carte porte de plus"}`;
  // Arrêter la cuisine arrête le rail : son geste est là, tant qu'elle n'est pas déjà à l'arrêt —
  // la reprendre est sur ce qui le dit, la bannière et la bande.
  const gestes = document.createElement("div");
  gestes.className = "gestes";
  const arreter = GESTES_DE_LA_CUISINE.find(({ id }) => id === "stop");
  if (!tenu.tableau.arretee && arreter !== undefined) gestes.append(...poserGeste(projet, { ...arreter, ou: "rail" }));
  // Une page servie dont le ticket n'a pas de carte se pose à part, sous le rail : son geste n'est pas perdu.
  const cartes = new Set([...colonnes.flatMap(({ cartes: siennes }) => siennes), ...hors].map(({ ticket }) => ticket));
  const sansCarte = (pagesServies.get(projet.nom)?.pages ?? []).filter(({ ticket }) => !cartes.has(ticket));
  /** @param {import("../page.ts").Page[]} poses */
  const servis = (poses) => {
    const liste = document.createElement("ol");
    liste.append(
      ...poses.map((page) => {
        const bon = document.createElement("li");
        bon.className = "bon";
        bon.append(poserServie(projet, page, true));
        return bon;
      }),
    );
    return liste;
  };
  rail.replaceChildren(
    bloc("h3", `le rail, d'après \`${geste(projet, "faits")}\` — lu à ${heure}, dans l'ordre de service${dOu} ; un numéro ouvre l'issue`),
    ...(gestes.childElementCount === 0 ? [] : [gestes]),
    grille,
    ...(hors.length === 0 ? [] : [bloc("h3", `hors des cinq colonnes — leur état n'est celui d'aucune, et rien ne dit qu'ils t'attendent : la lecture Rail, dans Paramètres, relaie ce que \`${geste(projet, "rail")}\` en dit`), bons(hors)]),
    ...(sansCarte.length === 0 ? [] : [bloc("h3", `servies, sans carte sur le rail — \`${geste(projet, "status")}\` en montre le serveur`), servis(sansCarte)]),
  );
}

// Une page servie : le worktree, son port, l'état de son serveur, et son geste — un seul, direct,
// qui ouvre la page dans le navigateur du poste. Un geste qui n'est pas posé dit pourquoi, dessous.
// Elle se pose sur la carte de son ticket ; `ticket` : sans carte, elle le nomme elle-même. Tout est
// déjà décidé dans le process principal (page.ts) : la vue pose.
/** @param {Projet} projet @param {import("../page.ts").Page} page @param {boolean} [ticket] */
function poserServie(projet, { ticket: numero, worktree, port, etat, raison, enCours, dit }, ticket = false) {
  const page = document.createElement("div");
  page.className = "servie";
  const ouvre = bouton(enCours ? "ouverture en cours…" : "ouvrir sa page dans mon navigateur", () => {
    ouvre.disabled = true;
    ouvre.textContent = "ouverture en cours…";
    void ouvrirPage(projet, worktree);
  });
  ouvre.disabled = raison !== undefined || enCours;
  ouvre.dataset.geste = "direct";
  const tete = document.createElement("div");
  // Le worktree et son port se recopient : eux seuls sont en monospace, la phrase reste la même.
  const servi = document.createElement("span");
  servi.append(exact("span", worktree), " · port ", exact("span", String(port)), ` · ${etat}`);
  tete.append(...(ticket ? [exact("strong", `#${numero}`)] : []), servi, ouvre);
  page.append(tete);
  if (raison !== undefined) page.append(bloc("p", surMesure(projet, raison)));
  if (dit !== undefined) {
    const rendu = propos(dit.texte);
    rendu.dataset.ouverte = String(dit.ouverte);
    page.append(rendu);
  }
  return page;
}

// Les pages servies du projet affiché, sous l'état : ce que `status` montre de ses serveurs — ou
// ce qui se lit à sa place. Le geste de chaque page n'est pas ici : il est sur la carte de son
// ticket, sur le rail. Tout est déjà décidé dans le process principal (page.ts) : la vue pose.
/** @param {Projet} projet @param {Pages | undefined} servies */
function poserPages(projet, servies) {
  pages.hidden = servies === undefined;
  if (servies === undefined) return pages.replaceChildren();
  /** @param {string} texte */
  const alerte = (texte) => {
    const dite = bloc("p", surMesure(projet, texte));
    dite.className = "refus";
    return dite;
  };
  const n = servies.pages.length;
  pages.replaceChildren(
    bloc("h3", `regarder une livraison dans ton navigateur — les serveurs que \`${geste(projet, "status")}\` montre`),
    ...(servies.refus === undefined ? [] : [alerte(servies.refus)]),
    ...(n === 0 ? [] : [bloc("p", `${n} page${n > 1 ? "s" : ""} servie${n > 1 ? "s" : ""} : chacune s'ouvre depuis la carte de son ticket, sur le rail (${servies.pages.map(({ ticket }) => `#${ticket}`).join(", ")})`)]),
    ...(servies.vide === undefined ? [] : [bloc("p", surMesure(projet, servies.vide))]),
    ...(n > 0 && servies.illisibles.length > 0 ? [bloc("p", "sous `serveurs`, ce que l'app n'a pas su lire — sans geste :")] : []),
    ...servies.illisibles.map((ligne) => bloc("pre", ligne)),
    ...(n > 0 && servies.empeche.length > 0 ? [bloc("p", "ce qui empêche ce projet d'être servi, d'après la même lecture :")] : []),
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
// — jamais « éteint » — et les gestes restent : ils n'attendent rien de la lecture. Éteindre part
// au clic ; allumer ouvre sa confirmation, qui dit ce qu'il engage.
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
  const gestes = document.createElement("div");
  gestes.className = "gestes";
  gestes.append(...GESTES_DU_MANAGER.flatMap(({ id, libelle }) => poserGeste(projet, { id, libelle, ou: "manager" })));

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
// lecture. Chacun ouvre sa confirmation, qui dit ce que le grant change : rien ne part avant son « oui ».
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
    const poses = document.createElement("div");
    poses.className = "gestes";
    poses.append(...GESTES_DES_GRANTS.flatMap(({ id, libelle }) => poserGeste(projet, { id, libelle: `${libelle} ${action}`, ou: "grants", grant: action })));
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
  if (rendues !== undefined) servir(projet, rendues);
}

// Les pages d'un projet, telles qu'elles viennent d'être rendues : sous l'état, et sur les cartes
// du rail — si c'est le projet affiché. Rien : celles d'avant ne valent plus.
/** @param {Projet} projet @param {Pages | undefined} rendues */
function servir(projet, rendues) {
  if (rendues === undefined) pagesServies.delete(projet.nom);
  else pagesServies.set(projet.nom, rendues);
  if (courant?.nom !== projet.nom) return;
  poserPages(projet, rendues);
  poserRail(projet);
}

/** @param {Projet} projet @param {number} ticket */
async function ouvrirIssue(projet, ticket) {
  nonEcrit = (await brigade.ouvrirIssue(projet.nom, ticket)) ? "" : `l'issue #${ticket} n'est pas ouverte : elle n'est plus dans les derniers faits lus, son adresse n'est pas en https, ou le poste n'a pas pu l'ouvrir`;
  montrer();
}

/** @param {Projet} projet @param {number} ticket */
async function ouvrirPr(projet, ticket) {
  nonEcrit = (await brigade.ouvrirPr(projet.nom, ticket)) ? "" : `la PR de #${ticket} n'est pas ouverte : il n'est plus dans les livrés des derniers faits lus, son adresse n'est pas en https, ou le poste n'a pas pu l'ouvrir`;
  montrer();
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
// état d'un mot, ce que la box en dit, la demande qui vit, les cooks en vol et ce qu'ils ont
// dépensé, ce que le dernier geste de box a donné. Tout est déjà dit par le process principal
// (version.ts) : la vue pose. Aucun geste ici : « mettre en service », couper ou y renoncer sont
// sur la ligne de la bande qui dit que la version attend, avec leur confirmation.
// Sans faits, rien n'est posé : la carte dit déjà ce que l'app a obtenu à leur place.
/** @param {Projet} projet */
function poserVersion(projet) {
  const tenu = tenus.get(projet.nom);
  version.hidden = projet.box === undefined || tenu === undefined || !("tableau" in tenu);
  if (projet.box === undefined || tenu === undefined || !("tableau" in tenu)) return version.replaceChildren();
  const vu = tenu.tableau.version;
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
  version.replaceChildren(
    bloc("h3", `la version du runtime, d'après \`${geste(projet, "faits")}\` — lu à ${new Date(tenu.a).toLocaleTimeString("fr-FR")}`),
    tete,
    ...(vu.faits.length === 0 ? [] : [faits]),
    ...vu.lignes.map((ligne) => bloc("p", ligne)),
    ...echec,
    ...demande,
    ...(vu.enVol === undefined ? [] : poserEnVol(vu.enVol)),
  );
}

// Le geste du projet lui-même, en tête de son espace, à côté de son nom : vérifier son
// installation — direct, il ne fait que lire, et sa sortie se lit dans le second. Un projet sans
// box n'a pas de commande à envoyer.
function poserProjet() {
  const projet = courant;
  const verifier = GESTES_DE_LA_CUISINE.find(({ id }) => id === "installation");
  gestesProjet.hidden = projet?.box === undefined || verifier === undefined;
  if (projet?.box === undefined || verifier === undefined) return gestesProjet.replaceChildren();
  gestesProjet.replaceChildren(...poserGeste(projet, { ...verifier, ou: "projet" }));
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
      garder(rendu.projet, rendu);
      const projet = projetDe(rendu.projet);
      if (projet !== undefined) return void ouvrir(projet);
    }
  } catch (erreur) {
    nonMisAJour = `rien n'est écrit : ${erreur instanceof Error ? erreur.message : String(erreur)}`;
  }
  poserCode();
}

// La bande d'alertes du projet affiché, en tête de l'espace : une ligne par chose à faire — ce
// qui ne va pas, ce que la box en a écrit, mot pour mot, puis le geste et son prix. Le geste y est
// collé, sous sa forme : un geste du socle, direct ou confirmé — sa confirmation s'ouvre sous la
// ligne ; une demande au second, quand il faut lire, juger ou agir hors de l'app ; l'onglet qui lit
// l'état que la file ne dit pas. Une ligne « non vérifié » dit un état que la box ne dit pas. Vide,
// la bande est cachée : elle ne prend aucune place. Un projet sans box n'en a pas — rien n'en est
// lu, et l'espace le dit.
/** @param {Projet} projet */
function poserAlertes(projet) {
  const alertes = projet.box === undefined ? [] : (bandes.get(projet.nom) ?? []);
  bande.hidden = alertes.length === 0;
  /** @param {string} leve @param {Alerte["appel"]} appel @param {string} prix @param {Alerte} alerte */
  const leGeste = (leve, appel, prix, alerte) => {
    const gestes = document.createElement("div");
    gestes.className = "gestes";
    /** @type {Node[]} */
    let pose = [bloc("span", leve)];
    // L'endroit est la ligne par son sujet, pas par ce qu'elle dit : « depuis 5 h 00 » change à chaque
    // lecture, et la confirmation ouverte ne doit pas se refermer sous les yeux du chef.
    if (appel !== undefined && "geste" in appel) pose = poserGeste(projet, { id: appel.geste, libelle: leve, ou: `alerte:${alerte.sujet}`, ...(appel.grant === undefined ? {} : { grant: appel.grant }) });
    else if (appel !== undefined && "demande" in appel) {
      const demande = bouton(`${leve} — demander au second`, () => void demanderAlerte(alerte));
      demande.dataset.geste = "demande";
      demande.title = "écrire dans le second une demande sur cette ligne — rien n'est envoyé : c'est toi qui fais Entrée";
      pose = [demande];
    } else if (appel !== undefined) {
      const { onglet } = appel;
      pose = [bouton(leve, () => (laisse.get(projet.nom) === onglet ? undefined : activer(onglet)))];
    }
    // Le prix suit le bouton ; une confirmation ouverte passe dessous, sur toute la largeur.
    const [premier, ...ouverte] = pose;
    gestes.append(...(premier === undefined ? [] : [premier]), bloc("span", `— prix : ${prix}`), ...ouverte);
    return gestes;
  };
  bande.replaceChildren(
    ...alertes.map((alerte) => {
      const { sujet, verifie, ton, dit, pourquoi, releve, geste: leve, appel, prix, aussi } = alerte;
      const ligne = document.createElement("div");
      ligne.className = "alerte";
      ligne.dataset.sujet = sujet;
      ligne.dataset.ton = ton;
      if (!verifie) ligne.dataset.verifie = "non";
      const tete = document.createElement("p");
      tete.append(pastille(dit, ton), bloc("strong", dit));
      ligne.append(tete, ...(pourquoi === undefined ? [] : [bloc("p", pourquoi)]), ...(releve === undefined ? [] : [bloc("pre", releve)]), leGeste(leve, appel, prix, alerte), ...(aussi === undefined ? [] : [leGeste(aussi.geste, aussi.appel, aussi.prix, alerte)]));
      return ligne;
    }),
  );
}

// La bannière d'arrêt : la cuisine est à l'arrêt quand la box le dit, d'un mot.
// Son geste la reprend : confirmé, il dit d'abord ce qu'il relance.
/** @param {Projet} projet */
function poserArret(projet) {
  const tenu = tenus.get(projet.nom);
  const banniere = BANNIERE;
  arret.hidden = banniere === undefined || tenu === undefined || !("tableau" in tenu) || !tenu.tableau.arretee;
  if (arret.hidden || banniere === undefined) return arret.replaceChildren();
  const [titre, ...suite] = banniere.texte;
  const relance = GESTES_DE_LA_CUISINE.find(({ id }) => id === banniere.bouton);
  const geste = document.createElement("div");
  geste.className = "gestes";
  if (relance !== undefined) geste.append(...poserGeste(projet, { ...relance, ou: "arret" }));
  arret.replaceChildren(bloc("strong", titre), ...suite.map((ligne) => bloc("p", ligne)), geste);
}

// Tout ce qui se dessine du projet affiché, d'après ses derniers faits. Le rail en est : il est
// au centre de l'espace, quel que soit l'onglet affiché.
function dessiner() {
  bande.hidden = true;
  arret.hidden = true;
  rail.hidden = true;
  poserManager();
  poserGrants();
  poserProjet();
  if (courant === undefined) return;
  poserAlertes(courant);
  poserCarte(carte, courant);
  poserVersion(courant);
  poserArret(courant);
  poserRail(courant);
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
  // L'espace affiché ne porte pas de signal : il le reprend en le quittant.
  for (const projet of configuration.projets) marquerSignal(projet.nom);
  tous.hidden = refuse || ajoute || courant !== undefined;
  ajout.hidden = !ajoute;
  teindre();
  principal.hidden = !refuse && courant === undefined;
  colonneSecond.hidden = courant === undefined;
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
    garder(nom, rendu);
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
  nonEcrit = nonEcritSecond = "";
  // Une confirmation ouverte sur un autre projet ne reste pas ouverte : rien n'en part.
  if (aConfirmer?.projet !== projet.nom) aConfirmer = undefined;
  ajoute = false;
  // Comme le panneau : l'onglet de contenu laissé là est relu tout de suite.
  suivi = undefined;
  marquer();
  // Dès maintenant : la carte et la bannière du projet quitté ne restent pas sur celui-ci
  // pendant que son espace s'ouvre.
  dessiner();
  attendre(projet, lu, lecture);
  // Ni ses pages servies : celles de ce projet viennent avec sa première lecture.
  servir(projet, undefined);
  // La mise en service du projet quitté ne reste pas non plus : celle-ci arrive.
  if (misEnService !== projet.nom) service.hidden = true;
  void lireService(projet);
  // Ni ses deux gestes de retrait : ils nomment leur projet.
  if (retraitPose !== projet.nom) retrait.hidden = true;
  void lireRetrait(projet);
  poserCouleurs(projet);
  brigade.regarder(projet.nom, ++demande);
  // Un projet qui ne s'ouvre pas n'a pas de second : sa colonne dit pourquoi.
  if (projet.refus !== undefined) return montrer();
  const terminaux = await brigade.espace(projet.nom);
  terminaux.forEach(recevoir);
  // Le chef a pu cliquer ailleurs pendant que l'espace s'ouvrait. Sinon, le terminal montré à
  // droite prend le clavier : le second, ou le shell où le chef l'avait laissé.
  if (courant !== projet) return;
  aFocaliser = aDroite.get(projet.nom) ?? terminaux.find(({ genre }) => genre === "second")?.id;
  montrer();
}

// Un terminal fermé : sa vue s'en va, et ce qu'il écrit encore n'est plus montré.
/** @param {number} id */
function oublier(id) {
  const fermee = vues.get(id);
  fermee?.xterm.dispose();
  fermee?.cadre.remove();
  vues.delete(id);
  fermes.add(id);
}

// Une sortie peut précéder l'annonce de son terminal : sa vue est alors créée ici.
brigade.surSortie((id, donnees) => {
  if (!fermes.has(id)) vue(id).xterm.write(donnees);
});
brigade.surEtat((terminal) => {
  if (terminal.genre === "shell" && terminal.arrete) {
    // Un shell qui sort ferme son onglet ; s'il était montré, le second reprend sa place à droite.
    oublier(terminal.id);
    if (aDroite.get(terminal.projet) === terminal.id) aDroite.delete(terminal.projet);
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
    servir(courant, servies);
  }
});
// Les faits d'un projet : ils remplacent ceux d'avant, partout où ils se dessinent —
// sa pastille dans la barre, sa carte dans « Tous les projets », et son espace s'il est affiché.
// La bande d'alertes d'un projet : posée tout de suite si c'est celui qui est affiché.
brigade.surAlertes(({ projet, alertes, signal }) => {
  bandes.set(projet, alertes);
  signaux.set(projet, signal);
  marquerSignal(projet);
  if (courant?.nom === projet) poserAlertes(courant);
});
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
// La colonne des terminaux change de taille avec la fenêtre : le terminal montré suit.
new ResizeObserver(() => {
  if (!fil.hidden) montreADroite()?.ajuste.fit();
}).observe(fil);

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
  signalees.clear();
  barre.replaceChildren(
    ...configuration.projets.map((projet) => {
      const entree = icone(projet.monogramme, projet.nom, () => void ouvrir(projet));
      entree.classList.toggle("refuse", projet.refus !== undefined);
      // Sa couleur d'onglet : la case la porte, qu'elle soit choisie ou non.
      const onglet = projet.couleurs?.onglet;
      entree.classList.toggle("teinte", onglet !== undefined);
      if (onglet !== undefined) entree.style.setProperty("--teinte", onglet);
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
        marquerSignal(projet.nom);
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
PALETTE = demarrage.palette;
ONGLETS = demarrage.onglets;
RUBRIQUES = demarrage.rubriques;
BOUTONS = demarrage.boutons;
GESTES_DU_MANAGER = demarrage.gestes.manager;
ALLUMAGE = demarrage.gestes.allumage;
GESTES_DE_LA_CUISINE = demarrage.gestes.cuisine;
CONFIRMES = demarrage.gestes.confirmes;
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
    for (const [projet, shell] of aDroite) if (shell === id) aDroite.delete(projet);
  }
  configuration = recue;
  afficher();
});
