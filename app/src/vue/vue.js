// @ts-check
// La vue : elle montre, elle ne tient rien. Les pty vivent dans le process
// principal ; ici, un xterm par terminal, gardé tant que l'app est ouverte —
// changer d'espace ou d'onglet ne fait que cacher l'un et montrer l'autre.
// À côté du terminal du second, les onglets de contenu — Rail, Cooks, Grants,
// Log : chacun la sortie d'une commande, lue tant qu'il est affiché. Et dans le
// panneau, ce que `status` dit du projet, telle quelle. Ce qui est un tableau à
// états est dessiné — une pastille par projet dans la barre, la carte de projet,
// le rail, la bannière d'arrêt — depuis les faits que la box rend comme des
// faits, et que le process principal a déjà mis en forme (faits.ts) : la vue
// pose un mot, un nombre, une couleur nommée, elle n'en calcule aucun. Près de ce qui se lit,
// des boutons : chacun écrit sa commande dans le second, et n'envoie rien —
// aucun n'agit par lui-même. La vue n'y lit rien —
// elle ne sait pas ce qu'est un ticket. Ce qui attend le chef lui arrive déjà
// mis à part (attend.ts) : elle le pose en tête, quel que soit l'onglet.
// La barre est faite d'icônes : « Tous les projets » en tête — la même lecture pour tous
// les projets d'un coup, et rien qui s'y clique —, un monogramme par projet, et
// en pied le « + » : ce qui s'ajoute au fichier des projets se décide dans le
// process principal, la vue le demande.
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as Xterm } from "@xterm/xterm";

/** @typedef {import("../terminaux.ts").Terminal} Terminal */
/** @typedef {import("../barre.ts").Affichee} Configuration */
/** @typedef {Configuration["projets"][number]} Projet */
/** @typedef {import("../attend.ts").Montree} Montree */
/** @typedef {import("../box.ts").Lecture} Lecture */
/** @typedef {import("../faits.ts").Dessinable} Dessinable */

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
const luOnglet = element("lu-onglet");
const lectureOnglet = element("lecture-onglet");
const gestesOnglet = element("gestes-onglet");
const gestesEtat = element("gestes-etat");
const note = element("note");
const zone = element("terminaux");
const message = element("message");
const etat = element("etat");
const carte = element("carte");
const lu = element("lu");
const lecture = element("lecture");
const ajout = element("ajout");
const formulaire = /** @type {HTMLFormElement} */ (element("formulaire"));
const ou = element("ou");
const choisi = element("choisi");
const nom = /** @type {HTMLInputElement} */ (element("nom"));
const hote = /** @type {HTMLInputElement} */ (element("hote"));
const refusAjout = element("refus-ajout");
const relecture = element("relecture");

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
// Le dossier choisi pour le projet à ajouter.
let dossier = "";
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

/** @param {number} id */
function vue(id) {
  let tenue = vues.get(id);
  if (tenue === undefined) {
    const xterm = new Xterm({ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13, theme: { background: "#16181d" } });
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
  // Le second, les quatre onglets de contenu, puis les shells. Un projet qui ne
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
    nonEcrit !== "" ? nonEcrit : relaye === undefined ? (montree?.terminal.note ?? "") : `${relaye.id === "rail" ? "le rail dessiné, puis " : ""}la sortie de \`${courant === undefined ? "" : geste(courant, relaye.commande)}\`, telle que la box la rend${relaye.precision === undefined ? "" : ` (${relaye.precision})`} — relue seule toutes les trente secondes, tant que cet onglet est affiché`;
  zone.hidden = !ouvrable || relaye !== undefined;
  contenu.hidden = relaye === undefined;
  message.hidden = ouvrable || relaye !== undefined;
  poserGestes(gestesEtat, "etat");
  poserGestes(gestesOnglet, relaye?.id);
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
    ...poses.map(({ id, commande }) => bouton(commande.endsWith(" ") ? `${commande}…` : commande, () => void inscrire(id))),
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
  cree.append(bloc("h3", `ce qui t'attend — le bloc \`attend\` de \`${geste(projet, "status")}\``), bloc("pre", attend ?? sansBord(projet)));
  return cree;
}

// Ce que l'app a obtenu d'une lecture en échec, et dessous ce qu'elle en dit :
// le code de sortie choisit le renvoi, le texte n'est jamais traduit. Sans
// message de `ssh` — pas lancé, ou arrêté au délai — il n'y a rien à aller lire.
/** @param {Projet} projet @param {Extract<Lecture, { erreur: string }>} recue @param {string} plusPilotable ce qui se dit d'une box jointe dont le code ne dit aucun cas */
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
  return [bloc("pre", recue.erreur), ...(suite === undefined ? [] : [bloc("pre", suite)])];
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
  if ("erreur" in recue) corps.replaceChildren(...obtenu(projet, recue, GESTE));
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

// Un mot d'état et sa pastille. La couleur est celle que le mot a dans la liste
// fermée ; un mot qui n'y est pas s'affiche tel quel, pastille vide.
/** @param {string} mot @param {string | undefined} ton */
function pastille(mot, ton) {
  const cree = document.createElement("span");
  cree.className = "pastille";
  if (ton !== undefined) cree.dataset.ton = ton;
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
  posee.dataset.lu = tenu === undefined ? "en-cours" : "tableau" in tenu ? "oui" : "non";
  if (tenu !== undefined && "tableau" in tenu && tenu.tableau.ton !== undefined) posee.dataset.ton = tenu.tableau.ton;
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
    if ("informe" in tenu) return ou.replaceChildren(titre, bloc("pre", tenu.rendu), bloc("pre", `Ce n'est pas la forme que l'app dessine : ${tenu.informe}.\n${sansForme(projet)}`));
    // Le même cas que sous `status`, avec son renvoi : un refus du geste n'est pas un runtime à mettre à jour.
    return ou.replaceChildren(titre, ...obtenu(projet, tenu, SANS_REPONSE), bloc("pre", sansDessin(projet)));
  }
  const { tableau } = tenu;
  const tete = document.createElement("p");
  tete.className = "etat-projet";
  tete.append(pastille(tableau.etat, tableau.ton), bloc("strong", tableau.etat), bloc("small", `lu à ${heure} · ${tableau.tick}`));
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
      cook.append(bloc("strong", `#${ticket}`), nom, bloc("small", station));
      return cook;
    }),
  );
  ou.replaceChildren(tete, compteurs, tableau.cooks.enCours.length === 0 ? bloc("p", surMesure(projet, tableau.cooks.vide)) : cooks, bloc("p", `dernier événement — ${tableau.evenement}`));
}

// Une carte du rail : son numéro, son état, son titre — et, dans T'attend, ce que
// le bloc `attend` dit du ticket, mot pour mot. Le numéro s'ouvre sur l'issue :
// l'adresse reste au process principal, la vue nomme le ticket.
/** @param {Projet} projet @param {import("../faits.ts").Carte} carte */
function poserBon(projet, { ticket, etat, ton, titre, ouvrable, attend }) {
  const bon = document.createElement("li");
  bon.className = "bon";
  const numero = ouvrable ? bouton(`#${ticket}`, () => void ouvrirIssue(projet, ticket)) : bloc("span", `#${ticket}`);
  numero.className = "ticket";
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
    tete.append(mot);
  }
  bon.append(tete);
  if (titre !== undefined) bon.append(bloc("strong", titre));
  bon.append(...attend.map((ligne) => bloc("p", ligne)));
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
  /** @param {import("../faits.ts").Carte[]} cartes */
  const bons = (cartes) => {
    const liste = document.createElement("ol");
    liste.append(...cartes.map((carte) => poserBon(projet, carte)));
    return liste;
  };
  const grille = document.createElement("div");
  grille.className = "colonnes";
  grille.append(
    ...colonnes.map(({ nom, ton, compte, cartes, vide }) => {
      const colonne = document.createElement("section");
      colonne.className = "colonne";
      colonne.dataset.ton = ton;
      const tete = document.createElement("h4");
      tete.append(bloc("span", nom), bloc("span", compte));
      colonne.append(tete, cartes.length === 0 ? bloc("p", surMesure(projet, vide)) : bons(cartes));
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

/** @param {Projet} projet @param {number} ticket */
async function ouvrirIssue(projet, ticket) {
  nonEcrit = (await brigade.ouvrirIssue(projet.nom, ticket)) ? "" : `l'issue #${ticket} n'est pas ouverte : elle n'est plus dans les derniers faits lus, son adresse n'est pas en https, ou le poste n'a pas pu l'ouvrir`;
  montrer();
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
  if (relance !== undefined) geste.append(bloc("span", "écrire la relance dans le second, sans envoyer :"), bouton(relance.commande, () => void inscrire(relance.id)));
  arret.replaceChildren(bloc("strong", titre), ...suite.map((ligne) => bloc("p", ligne)), geste);
}

// Tout ce qui se dessine du projet affiché, d'après ses derniers faits.
function dessiner() {
  arret.hidden = true;
  rail.hidden = true;
  if (courant === undefined) return;
  poserCarte(carte, courant);
  poserArret(courant);
  if (actif() === "rail") poserRail(courant);
}

// Rien ne reste de ce qui était affiché — ni d'un autre projet, ni de celui-ci :
// jusqu'à la première lecture, il n'y a rien à lire.
/** @param {Projet} projet @param {HTMLElement} tete @param {HTMLElement} corps */
function attendre(projet, tete, corps) {
  if (projet.box === undefined) {
    tete.dataset.etat = "sans-box";
    tete.textContent = "aucune lecture";
    corps.replaceChildren(
      bloc(
        "pre",
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
  tous.replaceChildren(
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

// Ajouter un projet sans écrire de JSON : son dossier se choisit, son nom en
// vient, sa box est facultative. Ce qui a été saisi reste, d'un passage à l'autre.
function ouvrirAjout() {
  courant = undefined;
  ajoute = true;
  marquer();
  ou.textContent = `${configuration.projets.length === 0 ? "Aucun projet encore. " : ""}Il s'écrit dans ${configuration.chemin} — que tu peux aussi modifier à la main : l'app le relit dès qu'il change.`;
  choisi.textContent = dossier === "" ? "aucun dossier choisi" : dossier;
}

element("choisir").addEventListener("click", async () => {
  const pris = await brigade.choisirDossier();
  if (pris === undefined) return;
  dossier = pris;
  choisi.textContent = pris;
  // Le nom du dossier, tant que le chef n'en a pas tapé un autre.
  if (nom.value === "") nom.value = pris.split("/").filter(Boolean).at(-1) ?? "";
});
formulaire.addEventListener("submit", async (soumission) => {
  soumission.preventDefault();
  const refus = await brigade.ajouter({ nom: nom.value, dossier, hote: hote.value });
  refusAjout.textContent = refus === undefined ? "" : `Pas ajouté — ${refus}`;
  if (refus !== undefined) return;
  // Ajouté : la liste est déjà arrivée par `surConfiguration`, « Tous les projets » le montre.
  formulaire.reset();
  dossier = "";
  ouvrirTous();
});

/** @param {Projet} projet */
async function ouvrir(projet) {
  courant = projet;
  nonEcrit = "";
  ajoute = false;
  // Comme le panneau : l'onglet de contenu laissé là est relu tout de suite.
  suivi = undefined;
  marquer();
  // Dès maintenant : la carte et la bannière du projet quitté ne restent pas sur celui-ci
  // pendant que son espace s'ouvre.
  dessiner();
  attendre(projet, lu, lecture);
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
brigade.surLecture((recue) => {
  // Demandée par un écran quitté depuis, elle était déjà en route : elle n'est pas pour celui-ci.
  if (recue.demande !== demande) return;
  if (courant === undefined) {
    const tenu = blocs.get(recue.projet);
    if (tenu !== undefined) rendre(recue, tenu.tete, tenu.corps);
  } else if (recue.projet === courant.nom) {
    rendre(recue, lu, lecture);
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
// dans le panneau, et n'en retire rien.
brigade.surContenu((recue) => {
  if (recue.demande === demandeOnglet && recue.projet === courant?.nom) rendre(recue, luOnglet, lectureOnglet);
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
BANNIERE = demarrage.banniere;
let configuration = demarrage.configuration;
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
