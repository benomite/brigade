// @ts-check
// La vue : elle montre, elle ne tient rien. Les pty vivent dans le process
// principal ; ici, un xterm par terminal, gardé tant que l'app est ouverte —
// changer d'espace ou d'onglet ne fait que cacher l'un et montrer l'autre.
// À côté du terminal du second, les onglets de contenu — Rail, Cooks, Grants,
// Log : chacun la sortie d'une commande, lue tant qu'il est affiché. Et dans le
// panneau, ce que `status` dit du projet, telle quelle. La vue n'y lit rien —
// elle ne sait pas ce qu'est un ticket. Ce qui attend le chef lui arrive déjà
// mis à part (attend.ts) : elle le pose en tête, quel que soit l'onglet.
// La barre est faite d'icônes : la kitchen en tête — la même lecture pour tous
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

const brigade = window.brigade;

/** @template {HTMLElement} T @param {string} id @returns {T} */
const element = (id) => /** @type {T} */ (document.getElementById(id));
const barre = element("projets");
const kitchen = element("kitchen");
const principal = /** @type {HTMLElement} */ (document.querySelector("main"));
const espace = element("espace");
const onglets = element("onglets");
const contenu = element("contenu");
const luOnglet = element("lu-onglet");
const lectureOnglet = element("lecture-onglet");
const note = element("note");
const zone = element("terminaux");
const message = element("message");
const etat = element("etat");
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
// Aucun : c'est la kitchen qui est affichée — ou l'écran d'ajout.
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
// Dans la kitchen, l'en-tête et le corps de chaque projet.
/** @type {Map<string, { tete: HTMLElement, corps: HTMLElement }>} */
const blocs = new Map();

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
    relaye === undefined ? (montree?.terminal.note ?? "") : `la sortie de \`run ${relaye.commande}\`, telle que la box la rend — relue seule toutes les trente secondes, tant que cet onglet est affiché`;
  zone.hidden = !ouvrable || relaye !== undefined;
  contenu.hidden = relaye === undefined;
  message.hidden = ouvrable || relaye !== undefined;
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

// Sans onglet à garder — celui d'un projet qui ne s'ouvre pas —, c'est sa raison qui revient.
/** @param {number | string | undefined} id */
function activer(id) {
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
const COMMANDE_MANQUE = [
  "La box a été jointe, et une commande y manque : ce qu'elle en a dit est ci-dessus. L'app ne sait pas laquelle.",
  "Si c'est `brigade` qu'elle nomme, le geste n'y est pas posé ; si c'est `sudo`, il manque au geste pour passer sous le compte du service.",
  "",
  "L'un et l'autre se posent sur la box, en la préparant :",
  "(docs/installer.md, « Préparer la box »)",
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
const SANS_BORD = [
  "Rien n'a pu être mis à part : la sortie de `run status` n'a pas le bloc que l'app sait prendre — une seule ligne qui commence par `attend`, une seule ligne `fin attend`.",
  "Ce n'est pas « rien ne t'attend » : ce qui t'attend, s'il y a quelque chose, est dans la sortie ci-dessous, entière.",
].join("\n");

// Ce qui attend le chef, en tête et à part : le bloc de `status`, tel qu'il l'a
// écrit — c'est lui qui dit quand rien n'attend. Sans bloc, l'app dit qu'elle n'a rien pris.
/** @param {string | undefined} attend */
function aPart(attend) {
  const cree = document.createElement("section");
  cree.className = "attend";
  cree.dataset.pris = String(attend !== undefined);
  cree.append(bloc("h3", "ce qui t'attend — le bloc `attend` de `run status`"), bloc("pre", attend ?? SANS_BORD));
  return cree;
}

// Ce qu'une lecture donne à voir, dans la kitchen, à côté du terminal et dans
// un onglet de contenu : un des sept états, dit en toutes lettres, et dessous ce
// que l'app a obtenu. Celle d'un onglet n'a rien de mis à part : ce n'est pas `status`.
/** @param {Montree | Lecture} recue @param {HTMLElement} tete @param {HTMLElement} corps */
function rendre(recue, tete, corps) {
  const heure = new Date(recue.a).toLocaleTimeString("fr-FR");
  if ("sorties" in recue) {
    const mise = "attend" in recue;
    tete.dataset.etat = "pilotable";
    tete.textContent = `${mise ? "pilotable — " : ""}lu à ${heure}`;
    const sans = !mise || recue.attend === undefined ? "" : " — sans son bloc `attend`, mis à part ci-dessus";
    corps.replaceChildren(...(mise ? [aPart(recue.attend)] : []), ...recue.sorties.flatMap(({ commande, texte }) => [bloc("h3", `run ${commande}${commande === "status" ? sans : ""}`), bloc("pre", texte)]));
  } else if (recue.cas === "projet-inconnu") {
    tete.dataset.etat = "inconnu";
    tete.textContent = `JOINT, MAIS INCONNU DE LA BOX — essai de ${heure}, le prochain suit seul`;
    corps.replaceChildren(bloc("pre", recue.erreur), bloc("pre", inconnu(recue.projet)));
  } else if (recue.cas === "sans-droit") {
    tete.dataset.etat = "sans-droit";
    tete.textContent = `JOINT, MAIS SANS LE DROIT DU GESTE — essai de ${heure}, le prochain suit seul`;
    corps.replaceChildren(bloc("pre", recue.erreur), bloc("pre", SANS_DROIT));
  } else if (recue.cas === "commande-manque") {
    tete.dataset.etat = "commande-manque";
    tete.textContent = `JOINT, MAIS UNE COMMANDE MANQUE SUR LA BOX — essai de ${heure}, le prochain suit seul`;
    corps.replaceChildren(bloc("pre", recue.erreur), bloc("pre", COMMANDE_MANQUE));
  } else if (recue.cas === "node-inapte") {
    tete.dataset.etat = "node-inapte";
    tete.textContent = `JOINT, MAIS LE NODE DE LA BOX NE CONVIENT PAS AU RUNTIME — essai de ${heure}, le prochain suit seul`;
    corps.replaceChildren(bloc("pre", recue.erreur), bloc("pre", NODE_INAPTE));
  } else if (recue.atteinte) {
    tete.dataset.etat = "plus-pilotable";
    tete.textContent = `JOINT, MAIS PLUS PILOTABLE — essai de ${heure}, le prochain suit seul`;
    corps.replaceChildren(bloc("pre", recue.erreur), bloc("pre", GESTE));
  } else {
    tete.dataset.etat = "pas-joint";
    tete.textContent = `PAS JOINT — essai de ${heure}, le prochain suit seul`;
    // Sans message de `ssh` — pas lancé, ou arrêté au délai — il n'y a rien à aller lire.
    corps.replaceChildren(bloc("pre", recue.erreur), ...(recue.cas === "ssh-en-echec" ? [bloc("pre", SSH_EN_ECHEC)] : []));
  }
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
          `L'app y lancera le geste de la box sous le nom du projet (\`brigade ${projet.nom} status\`).`,
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
// la kitchen — ou la dernière, l'ajout. Un fichier refusé n'a ni l'une ni l'autre :
// sa raison prend la place du terminal.
function marquer() {
  const refuse = configuration.refus !== undefined;
  const affichee = ajoute ? barre.children.length - 1 : courant === undefined ? 0 : configuration.projets.indexOf(courant) + 1;
  [...barre.children].forEach((entree, rang) => (entree.ariaCurrent = String(rang === affichee)));
  kitchen.hidden = refuse || ajoute || courant !== undefined;
  ajout.hidden = !ajoute;
  principal.hidden = !refuse && courant === undefined;
  etat.hidden = courant === undefined;
  lireOnglet();
}

// Tous les projets, dans l'ordre du fichier. La kitchen se regarde : ce qui
// s'y voit se traite dans l'espace du projet, par la barre.
function ouvrirKitchen() {
  courant = undefined;
  ajoute = false;
  marquer();
  blocs.clear();
  kitchen.replaceChildren(
    ...configuration.projets.map((projet) => {
      const tete = bloc("p", "");
      const corps = document.createElement("div");
      attendre(projet, tete, corps);
      blocs.set(projet.nom, { tete, corps });
      const article = document.createElement("article");
      article.append(bloc("h2", projet.nom), tete, corps);
      return article;
    }),
  );
  brigade.kitchen(++demande);
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
  // Ajouté : la liste est déjà arrivée par `surConfiguration`, la kitchen le montre.
  formulaire.reset();
  dossier = "";
  ouvrirKitchen();
});

/** @param {Projet} projet */
async function ouvrir(projet) {
  courant = projet;
  ajoute = false;
  // Comme le panneau : l'onglet de contenu laissé là est relu tout de suite.
  suivi = undefined;
  marquer();
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
// s'il existe encore — sinon la kitchen, ou l'ajout tant qu'il n'y a aucun projet.
function afficher() {
  relecture.hidden = configuration.nonRelu === undefined;
  relecture.textContent = [
    `${configuration.chemin} a changé, et n'a pas pu être relu :`,
    `  → ${configuration.nonRelu}`,
    "Tes projets sont ceux d'avant, et rien n'est fermé. L'app le relit dès qu'il change.",
  ].join("\n");
  barre.replaceChildren(
    ...configuration.projets.map((projet) => {
      const entree = icone(projet.monogramme, projet.nom, () => void ouvrir(projet));
      entree.classList.toggle("refuse", projet.refus !== undefined);
      return entree;
    }),
  );
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
  const entree = icone("K", "Kitchen", ouvrirKitchen);
  entree.id = "entree-kitchen";
  const pied = icone("+", "Ajouter un projet", ouvrirAjout);
  pied.id = "entree-ajout";
  barre.prepend(entree);
  barre.append(pied);

  const meme = configuration.projets.find((projet) => projet.nom === courant?.nom);
  if (meme !== undefined) void ouvrir(meme);
  else if (ajoute || configuration.projets.length === 0) ouvrirAjout();
  // L'app s'ouvre sur la kitchen, en tête de la barre.
  else ouvrirKitchen();
  montrer();
}

const demarrage = await brigade.demarrage();
const exemple = demarrage.exemple;
ONGLETS = demarrage.onglets;
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
