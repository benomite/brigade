// L'app : une fenêtre, et le process qui tient les terminaux et la veille des
// box.
import { join } from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";
import { ouvrirVeille } from "./box.ts";
import { cheminConfiguration, EXEMPLE, lireConfiguration, type Projet } from "./config.ts";
import { ouvrirPty } from "./pty.ts";
import { ouvrirTerminaux } from "./terminaux.ts";

// Lue une fois : l'app relancée relit le fichier.
const configuration = lireConfiguration(cheminConfiguration());

let fenetre: BrowserWindow | undefined;
const dire = (canal: string, ...faits: unknown[]) => {
  if (fenetre !== undefined && !fenetre.isDestroyed()) fenetre.webContents.send(canal, ...faits);
};

const terminaux = ouvrirTerminaux({
  ouvrirPty,
  // La même doublure que le runtime : jamais posée hors des essais.
  claude: process.env.BRIGADE_CLAUDE_BIN || "claude",
  shell: process.env.SHELL || "/bin/zsh",
  surSortie: (id, donnees) => dire("sortie", id, donnees),
  surEtat: (terminal) => dire("etat", terminal),
});

// Seul ce qui est affiché est lu — un projet, ou tous dans la kitchen : toutes
// les trente secondes, et un `ssh` qui n'a rien rendu au bout de trente est arrêté.
const veille = ouvrirVeille({
  // Jamais posée hors des essais, comme BRIGADE_CLAUDE_BIN.
  ssh: process.env.BRIGADE_SSH_BIN || "ssh",
  intervalleMs: 30_000,
  delaiMs: 30_000,
  connexionS: 10,
  surLecture: (lecture) => dire("lecture", lecture),
});

// La vue nomme un projet ; seul un projet du fichier, et qui s'ouvre, a un espace.
function projet(nom: unknown): Projet {
  const trouve = configuration.projets.find((candidat) => candidat.nom === nom);
  if (trouve === undefined || trouve.refus !== undefined) throw new Error(`projet sans espace : ${String(nom)}`);
  return trouve;
}

ipcMain.handle("demarrage", () => ({ configuration, exemple: EXEMPLE }));
ipcMain.handle("espace", (_, nom: unknown) => terminaux.espace(projet(nom)));
ipcMain.handle("shell", (_, nom: unknown) => terminaux.shell(projet(nom)));
// Un projet refusé n'a pas d'espace, mais sa box se lit quand même.
ipcMain.on("regarder", (_, nom: unknown) => veille.regarder(configuration.projets.filter((candidat) => candidat.nom === nom), ["status", "grant"]));
// La kitchen : tous les projets, et ce que `station` dit de la machine et du quota.
ipcMain.on("kitchen", () => veille.regarder(configuration.projets, ["status", "station"]));
ipcMain.on("ecrire", (_, id: number, donnees: string) => terminaux.ecrire(id, donnees));
ipcMain.on("redimensionner", (_, id: number, colonnes: number, lignes: number) => terminaux.redimensionner(id, colonnes, lignes));

// Les pty appartiennent à l'app, pas à la fenêtre — mais il n'y a qu'une
// fenêtre : la fermer, c'est quitter, et quitter arrête tous les terminaux.
app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => {
  terminaux.fermer();
  veille.fermer();
});

// Pas d'`await` au premier niveau : Electron n'annonce « prêt » qu'une fois ce
// module chargé en entier — l'attendre ici, c'est ne jamais démarrer.
void app.whenReady().then(() => {
  fenetre = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "brigade",
    backgroundColor: "#16181d",
    webPreferences: { preload: join(import.meta.dirname, "preload.cjs") },
  });
  return fenetre.loadFile(join(import.meta.dirname, "vue/index.html"));
});
