// @ts-check
// La vue : elle montre, elle ne tient rien. Les pty vivent dans le process
// principal ; ici, un xterm par terminal, gardé tant que l'app est ouverte —
// changer d'espace ou d'onglet ne fait que cacher l'un et montrer l'autre.
// À côté, ce que la box dit du projet affiché : la sortie des commandes, telle
// quelle. La vue n'y lit rien — elle ne sait pas ce qu'est un ticket.
// En tête de la barre, la kitchen : la même chose pour tous les projets d'un
// coup, et rien qui s'y clique.
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as Xterm } from "@xterm/xterm";

/** @typedef {import("../terminaux.ts").Terminal} Terminal */
/** @typedef {import("../config.ts").Projet} Projet */
/** @typedef {import("../box.ts").Lecture} Lecture */

const brigade = window.brigade;

/** @template {HTMLElement} T @param {string} id @returns {T} */
const element = (id) => /** @type {T} */ (document.getElementById(id));
const barre = element("projets");
const kitchen = element("kitchen");
const principal = /** @type {HTMLElement} */ (document.querySelector("main"));
const onglets = element("onglets");
const note = element("note");
const zone = element("terminaux");
const message = element("message");
const etat = element("etat");
const lu = element("lu");
const lecture = element("lecture");

/** @type {Map<number, { terminal: Terminal, xterm: Xterm, ajuste: FitAddon, cadre: HTMLDivElement }>} */
const vues = new Map();
// L'onglet où chaque projet a été laissé : on y revient.
/** @type {Map<string, number>} */
const laisse = new Map();
// Les shells fermés : ce qu'ils écrivent encore en mourant n'a plus d'onglet.
/** @type {Set<number>} */
const fermes = new Set();
// Aucun : c'est la kitchen qui est affichée.
/** @type {Projet | undefined} */
let courant;
// La dernière demande de lecture : une par écran affiché, et seules ses lectures s'affichent.
let demande = 0;
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
  for (const { terminal, cadre } of vues.values()) cadre.hidden = terminal.id !== visible;

  onglets.replaceChildren(
    ...duCourant().map(({ terminal }) => {
      const onglet = bouton(terminal.titre, () => activer(terminal.id));
      onglet.role = "tab";
      onglet.ariaSelected = String(terminal.id === visible);
      return onglet;
    }),
  );
  const ouvrable = courant !== undefined && courant.refus === undefined;
  if (ouvrable) onglets.append(bouton("+ shell", ouvrirShell));

  const montree = visible === undefined ? undefined : vues.get(visible);
  note.textContent = montree?.terminal.note ?? "";
  zone.hidden = !ouvrable;
  message.hidden = ouvrable;
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

/** @param {number} id */
function activer(id) {
  if (courant !== undefined) laisse.set(courant.nom, id);
  montrer();
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

// Ce qu'une lecture donne à voir, dans la kitchen comme à côté du terminal :
// un des trois états, dit en toutes lettres, et dessous ce que l'app a obtenu.
/** @param {Lecture} recue @param {HTMLElement} tete @param {HTMLElement} corps */
function rendre(recue, tete, corps) {
  const heure = new Date(recue.a).toLocaleTimeString("fr-FR");
  if ("sorties" in recue) {
    tete.dataset.etat = "pilotable";
    tete.textContent = `pilotable — lu à ${heure}`;
    corps.replaceChildren(...recue.sorties.flatMap(({ commande, texte }) => [bloc("h3", `run ${commande}`), bloc("pre", texte)]));
  } else if (recue.atteinte) {
    tete.dataset.etat = "plus-pilotable";
    tete.textContent = `JOINT, MAIS PLUS PILOTABLE — essai de ${heure}, le prochain suit seul`;
    corps.replaceChildren(bloc("pre", recue.erreur), bloc("pre", GESTE));
  } else {
    tete.dataset.etat = "pas-joint";
    tete.textContent = `PAS JOINT — essai de ${heure}, le prochain suit seul`;
    corps.replaceChildren(bloc("pre", recue.erreur));
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
          `Ajoute-lui « hote » et « commande » dans ${configuration.chemin}, comme ici :`,
          "",
          exemple,
          "",
          "Puis relance l'app.",
        ].join("\n"),
      ),
    );
  } else {
    tete.dataset.etat = "en-cours";
    tete.textContent = "première lecture en cours…";
    corps.replaceChildren();
  }
}

// L'entrée de la barre qui est affichée : celle du projet courant, ou la première — la kitchen.
function marquer() {
  const affichee = courant === undefined ? 0 : configuration.projets.indexOf(courant) + 1;
  [...barre.children].forEach((entree, rang) => (entree.ariaCurrent = String(rang === affichee)));
  kitchen.hidden = courant !== undefined;
  principal.hidden = courant === undefined;
  etat.hidden = courant === undefined;
}

// Tous les projets, dans l'ordre du fichier. La kitchen se regarde : ce qui
// s'y voit se traite dans l'espace du projet, par la barre.
function ouvrirKitchen() {
  courant = undefined;
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

/** @param {Projet} projet */
async function ouvrir(projet) {
  courant = projet;
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

// Une sortie peut précéder l'annonce de son terminal : sa vue est alors créée ici.
brigade.surSortie((id, donnees) => {
  if (!fermes.has(id)) vue(id).xterm.write(donnees);
});
brigade.surEtat((terminal) => {
  if (terminal.genre === "shell" && terminal.arrete) {
    // Un shell qui sort ferme son onglet ; on revient au second.
    const fermee = vues.get(terminal.id);
    fermee?.xterm.dispose();
    fermee?.cadre.remove();
    vues.delete(terminal.id);
    fermes.add(terminal.id);
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
new ResizeObserver(() => {
  const visible = actif();
  if (visible !== undefined && !zone.hidden) vues.get(visible)?.ajuste.fit();
}).observe(zone);

const { configuration, exemple } = await brigade.demarrage();
barre.replaceChildren(
  ...configuration.projets.map((projet) => {
    const entree = bouton(projet.nom, () => void ouvrir(projet));
    entree.classList.toggle("refuse", projet.refus !== undefined);
    return entree;
  }),
);
if (configuration.refus === undefined) {
  // L'app s'ouvre sur la kitchen, en tête de la barre.
  const entree = bouton("Kitchen", ouvrirKitchen);
  entree.id = "entree-kitchen";
  barre.prepend(entree);
  ouvrirKitchen();
} else {
  message.textContent = [
    "Dis-moi où sont tes projets : un nom et un dossier par projet, dans ce fichier.",
    "",
    configuration.chemin,
    `  → ${configuration.refus}`,
    "",
    "Par exemple :",
    "",
    exemple,
    "",
    "Puis relance l'app : elle lit ce fichier au démarrage.",
  ].join("\n");
}
montrer();
