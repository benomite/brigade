// @ts-check
// La vue : elle montre, elle ne tient rien. Les pty vivent dans le process
// principal ; ici, un xterm par terminal, gardé tant que l'app est ouverte —
// changer d'espace ou d'onglet ne fait que cacher l'un et montrer l'autre.
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as Xterm } from "@xterm/xterm";

/** @typedef {import("../terminaux.ts").Terminal} Terminal */
/** @typedef {import("../config.ts").Projet} Projet */

const brigade = window.brigade;

/** @template {HTMLElement} T @param {string} id @returns {T} */
const element = (id) => /** @type {T} */ (document.getElementById(id));
const barre = element("projets");
const onglets = element("onglets");
const note = element("note");
const zone = element("terminaux");
const message = element("message");

/** @type {Map<number, { terminal: Terminal, xterm: Xterm, ajuste: FitAddon, cadre: HTMLDivElement }>} */
const vues = new Map();
// L'onglet où chaque projet a été laissé : on y revient.
/** @type {Map<string, number>} */
const laisse = new Map();
/** @type {Projet | undefined} */
let courant;

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
  if (courant === undefined) return;
  const shell = await brigade.shell(courant.nom);
  recevoir(shell);
  activer(shell.id);
}

/** @param {Projet} projet */
async function ouvrir(projet) {
  courant = projet;
  for (const entree of barre.children) entree.ariaCurrent = String(entree.textContent === projet.nom);
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

brigade.surSortie((id, donnees) => vue(id).xterm.write(donnees));
brigade.surEtat((terminal) => {
  if (terminal.genre === "shell" && terminal.arrete) {
    // Un shell qui sort ferme son onglet ; on revient au second.
    const fermee = vues.get(terminal.id);
    fermee?.xterm.dispose();
    fermee?.cadre.remove();
    vues.delete(terminal.id);
    const second = [...vues.values()].find((tenue) => tenue.terminal.projet === terminal.projet && tenue.terminal.genre === "second");
    if (laisse.get(terminal.projet) === terminal.id && second !== undefined) laisse.set(terminal.projet, second.terminal.id);
  } else {
    recevoir(terminal);
  }
  montrer();
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
  message.textContent = "Choisis un projet dans la barre.";
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
