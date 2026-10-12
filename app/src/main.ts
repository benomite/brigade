// L'app : une fenêtre, et le process qui tient les terminaux, la veille des
// box et le suivi du fichier des projets.
import { join } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { mettreAPart } from "./attend.ts";
import { pourLaBarre } from "./barre.ts";
import { BOUTONS, ecritPar } from "./boutons.ts";
import { ouvrirVeille } from "./box.ts";
import { boxes, cheminConfiguration, EXEMPLE, type Projet } from "./config.ts";
import { BANNIERE, COMMANDE, tenirFaits } from "./faits.ts";
import { ajouterSurBox, declarerTelQuel, EFFORTS, installer, lireDepot, MODELES } from "./installation.ts";
import { commandeDe, ONGLETS } from "./onglets.ts";
import { refusDeForme } from "./nom.ts";
import { ouvrirPty } from "./pty.ts";
import { tenirServices, verifier } from "./service.ts";
import { suivreConfiguration } from "./suivi.ts";
import { ouvrirTerminaux } from "./terminaux.ts";

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

// Seul ce qui est affiché est lu — un projet, ou chacun dans « Tous les projets » : toutes
// les trente secondes, et un `ssh` qui n'a rien rendu au bout de trente est arrêté.
// La veille rend les sorties mot pour mot ; ce qui attend le chef en est mis à
// part ici, avant la vue.
// Les trois veilles se partagent le passage de chaque projet : à elles toutes, un projet
// n'ouvre qu'une connexion à la fois — sshd refuse au hasard ce qui arrive de front.
const passage = new Map<string, Promise<unknown>>();
const veille = ouvrirVeille({
  // Jamais posée hors des essais, comme BRIGADE_CLAUDE_BIN.
  ssh: process.env.BRIGADE_SSH_BIN || "ssh",
  intervalleMs: 30_000,
  delaiMs: 30_000,
  connexionS: 10,
  passage,
  surLecture: (lecture) => {
    const montree = mettreAPart(lecture);
    dire("lecture", montree);
    // Le rail se dessine aussi du bloc mis à part : sa colonne T'attend en vient.
    const redessine = faits.attendre(montree);
    if (redessine !== undefined) dire("faits", redessine);
  },
});
// L'onglet de contenu affiché — Rail, Cooks, Grants ou Log — a sa propre veille,
// réglée pareil : sa commande est lue pour elle-même, et son échec se lit dans
// l'onglet sans rien retirer à ce que `status` dit à côté. Sur un terminal, elle ne lit rien.
const veilleDOnglet = ouvrirVeille({ ssh: process.env.BRIGADE_SSH_BIN || "ssh", intervalleMs: 30_000, delaiMs: 30_000, connexionS: 10, passage, surLecture: (lecture) => dire("contenu", lecture) });
// Ce qui se dessine — la pastille de chaque projet dans la barre, sa carte, son rail,
// sa bannière d'arrêt — a la sienne aussi, et elle lit tous les projets, quel que soit
// l'écran : la barre est toujours affichée. Une box qui ne rend pas `faits` (un runtime
// plus ancien) le dit là où ils se dessinent, et `status` reste lisible à côté.
const faits = tenirFaits();
const veilleDesFaits = ouvrirVeille({ ssh: process.env.BRIGADE_SSH_BIN || "ssh", intervalleMs: 30_000, delaiMs: 30_000, connexionS: 10, passage, surLecture: (lecture) => dire("faits", faits.recevoir(lecture)) });

// La veille de `status` change de projets : le bloc `attend` de ceux qu'elle ne lit plus est
// lâché, et leur rail redessiné sans lui — il ne serait plus rafraîchi, quand leurs faits le sont.
function regarder(vus: Parameters<typeof veille.regarder>[0], commandes: readonly string[], demande: number): void {
  veille.regarder(vus, commandes, demande);
  for (const redessine of faits.veiller(vus.map(({ nom }) => nom))) dire("faits", redessine);
}

// La mise en service d'un projet — amorcer, merger, vérifier, démarrer (service.ts). Sa
// vérification lance `installation` une fois, par le passage du projet comme les veilles,
// et lui laisse deux minutes : elle joint l'origine du dépôt et GitHub. Sa session
// s'ouvre dans le second, son démarrage s'écrit dans un shell.
const services = tenirServices({
  verifier: (servi) => {
    // Jamais posée hors des essais, comme pour la veille.
    const rendu = (passage.get(servi.nom) ?? Promise.resolve()).then(() => verifier({ ssh: process.env.BRIGADE_SSH_BIN || "ssh", delaiMs: 120_000, connexionS: 10 }, servi));
    passage.set(servi.nom, rendu);
    return rendu;
  },
  session: terminaux.session,
  shell: terminaux.shell,
});

// Le fichier des projets : créé s'il manque, relu dès qu'il change. Un projet
// qui a quitté la liste — ou changé de dossier — perd ses terminaux, et sa mise
// en service ; les autres n'en savent rien.
const suivi = suivreConfiguration({
  chemin: cheminConfiguration(),
  surChangement: (configuration, partis) => {
    partis.forEach(services.oublier);
    dire("configuration", pourLaBarre(configuration), partis.flatMap((nom) => terminaux.quitter(nom)));
  },
});
const projets = () => suivi.configuration().projets;
// Un projet du fichier, qu'il s'ouvre ou non : sa box se lit, et se vérifie, sans son dossier.
const connu = (nom: unknown) => projets().find((candidat) => candidat.nom === nom);

// La vue nomme un projet ; seul un projet du fichier, et qui s'ouvre, a un espace.
function projet(nom: unknown): Projet {
  const trouve = projets().find((candidat) => candidat.nom === nom);
  if (trouve === undefined || trouve.refus !== undefined) throw new Error(`projet sans espace : ${String(nom)}`);
  return trouve;
}

ipcMain.handle("demarrage", () => ({ configuration: pourLaBarre(suivi.configuration()), exemple: EXEMPLE, onglets: ONGLETS, boutons: BOUTONS, banniere: BANNIERE, calibrage: { modeles: MODELES, efforts: EFFORTS } }));
// Ajouter un projet : son dossier se choisit, il ne se tape pas. Le reste se
// décide hors de la vue — elle reçoit ce qu'il en est advenu, et pourquoi.
ipcMain.handle("choisirDossier", async () => {
  if (fenetre === undefined) return undefined;
  const { filePaths } = await dialog.showOpenDialog(fenetre, { title: "Le dossier du projet", properties: ["openDirectory", "createDirectory"] });
  return filePaths[0];
});
// Le dépôt GitHub du dossier choisi, lu dans son origine — ou pourquoi il reste à écrire.
ipcMain.handle("lireDepot", (_, dossier: unknown) => (typeof dossier === "string" && dossier !== "" ? lireDepot("git", dossier) : undefined));
// Une box de plus : son nom, dans le fichier des projets (config.ts). Rien n'est joint.
ipcMain.handle("declarerBox", (_, hote: unknown) => suivi.ajouterHote(typeof hote === "string" ? hote : ""));
// L'ajout : les champs, puis le geste d'installation sur la box choisie, puis le
// fichier des projets (installation.ts). Le clone se fait sur la box, et prend
// son temps : `ssh` n'est arrêté qu'au bout d'un quart d'heure.
ipcMain.handle("installer", async (_, saisie: unknown) => {
  const issue = await ajouterSurBox(saisie, {
    boxes: boxes(suivi.configuration()),
    refusDAjout: suivi.refusDAjout,
    ajouter: suivi.ajouter,
    // Jamais posée hors des essais, comme pour la veille.
    installer: (lue) => installer({ ssh: process.env.BRIGADE_SSH_BIN || "ssh", delaiMs: 900_000, connexionS: 10 }, lue),
  });
  // Ajouté : sa mise en service est entamée, et s'ouvrira d'elle-même dans son espace.
  const ajoute = issue.etat === "ajoute" ? connu(issue.nom) : undefined;
  if (ajoute !== undefined) services.suivre(ajoute);
  return issue;
});
// Un projet que la box sert déjà : déclaré dans l'app tel qu'il y est, sans rien lui envoyer.
ipcMain.handle("ajouter", (_, saisie: unknown) => declarerTelQuel(saisie, { boxes: boxes(suivi.configuration()), ajouter: suivi.ajouter }));
// La forme du nom, dite à la saisie : la règle de la box, au même endroit que l'ajout (nom.ts).
ipcMain.handle("formeDuNom", (_, nom: unknown) => (typeof nom === "string" ? refusDeForme(nom) : undefined));
// La mise en service : la vue nomme le projet et le geste, ce qu'il en advient se décide
// dans service.ts — la session `/brigade:init` dans le second, le merge que le chef dit
// fait, `installation` lancée sur la box, et le démarrage, écrit dans un shell et refusé
// tant qu'elle ne dit pas le projet prêt.
const parti = (nom: unknown) => ({ refus: `rien n'est fait : « ${String(nom)} » n'est plus dans le fichier des projets` });
ipcMain.handle("service", (_, nom: unknown) => {
  const vise = connu(nom);
  return vise === undefined ? undefined : services.parcours(vise);
});
ipcMain.handle("amorcer", (_, nom: unknown) => {
  const vise = connu(nom);
  return vise === undefined ? parti(nom) : services.amorcer(vise);
});
ipcMain.handle("direMerge", (_, nom: unknown, merge: unknown) => {
  const vise = connu(nom);
  return vise === undefined ? undefined : services.direMerge(vise, merge === true);
});
ipcMain.handle("verifier", (_, nom: unknown) => {
  const vise = connu(nom);
  return vise === undefined ? undefined : services.verifier(vise);
});
ipcMain.handle("demarrer", (_, nom: unknown) => {
  const vise = connu(nom);
  return vise === undefined ? parti(nom) : services.demarrer(vise);
});
ipcMain.handle("espace", (_, nom: unknown) => terminaux.espace(projet(nom)));
ipcMain.handle("shell", (_, nom: unknown) => terminaux.shell(projet(nom)));
// Un bouton : sa commande est écrite dans le second du projet, et rien ne l'envoie.
// La vue nomme le bouton ; ce qui s'écrit se décide ici (boutons.ts) — ou pourquoi rien ne l'est. Rien, pour un projet sans box.
ipcMain.handle("inscrire", (_, nom: unknown, id: unknown) => {
  const vise = projet(nom);
  const ecrit = ecritPar(id, vise);
  return ecrit === undefined || "refus" in ecrit ? ecrit : terminaux.inscrire(vise, ecrit.commande);
});
// Un projet refusé n'a pas d'espace, mais sa box se lit quand même.
ipcMain.on("regarder", (_, nom: unknown, demande: number) => regarder(projets().filter((candidat) => candidat.nom === nom), ["status"], demande));
// L'onglet de contenu affiché, et lui seul : sa commande, sur la box de son projet.
// Aucun — un terminal, « Tous les projets » — ou un nom qui n'est pas celui d'un onglet : plus rien n'est lu pour lui.
ipcMain.on("onglet", (_, nom: unknown, id: unknown, demande: number) => {
  const commande = commandeDe(id);
  veilleDOnglet.regarder(commande === undefined ? [] : projets().filter((candidat) => candidat.nom === nom), commande === undefined ? [] : [commande], demande);
});
// « Tous les projets » : le `status` de chacun, et ce que `station` dit de la machine et du quota.
ipcMain.on("tous", (_, demande: number) => regarder(projets(), ["status", "station"], demande));
// La vue a posé sa barre — au démarrage, puis à chaque changement du fichier des projets.
ipcMain.on("faits", (_, demande: number) => {
  faits.oublier();
  veilleDesFaits.regarder(projets(), [COMMANDE], demande);
});
// Un ticket du rail s'ouvre sur son issue, dans le navigateur du poste : la vue nomme le
// projet et le ticket, l'adresse est celle que la box a rendue (faits.ts). Rend si elle a été ouverte.
ipcMain.handle("ouvrirIssue", (_, nom: unknown, ticket: unknown) => {
  const adresse = faits.adresse(nom, ticket);
  return adresse === undefined ? false : shell.openExternal(adresse).then(
    () => true,
    () => false,
  );
});
ipcMain.on("ecrire", (_, id: number, donnees: string) => terminaux.ecrire(id, donnees));
ipcMain.on("redimensionner", (_, id: number, colonnes: number, lignes: number) => terminaux.redimensionner(id, colonnes, lignes));

// Les pty appartiennent à l'app, pas à la fenêtre — mais il n'y a qu'une
// fenêtre : la fermer, c'est quitter, et quitter arrête tous les terminaux.
app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => {
  suivi.fermer();
  terminaux.fermer();
  veille.fermer();
  veilleDOnglet.fermer();
  veilleDesFaits.fermer();
});
// Revenir à l'app relit le fichier : le chef revient de son éditeur, et la
// veille du fichier n'a pas à être seule à le savoir.
app.on("browser-window-focus", () => suivi.relire());

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
