// L'app : une fenêtre, et le process qui tient les terminaux, la veille des
// box et le suivi du fichier des projets.
import { dirname, join } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { ALLUMAGE, compter } from "./allumage.ts";
import { mettreAPart } from "./attend.ts";
import { pourLaBarre } from "./barre.ts";
import { BOUTONS, ecritPar } from "./boutons.ts";
import { ouvrirVeille } from "./box.ts";
import { boxes, cheminConfiguration, EXEMPLE, type Projet } from "./config.ts";
import { GESTES_DE_LA_CUISINE } from "./cuisine.ts";
import { BANNIERE, COMMANDE, tenirFaits } from "./faits.ts";
import { demandeDe, noteDeLaDemande } from "./demande.ts";
import { ecrireGeste, GRANTS } from "./gestes.ts";
import { GESTES_DES_GRANTS, voir as voirGrants } from "./grants.ts";
import { ajouterSurBox, declarerTelQuel, EFFORTS, installer, lireDepot, MODELES } from "./installation.ts";
import { GESTES_DU_MANAGER, voir as voirManager } from "./manager.ts";
import { commandeDe, ONGLETS } from "./onglets.ts";
import { ouvrirTransfert, tenirPages } from "./page.ts";
import { lireRacine, proposerCalibrage } from "./proposition.ts";
import { refusDeForme } from "./nom.ts";
import { ouvrirPty } from "./pty.ts";
import { tenirRetards } from "./retard.ts";
import { DELAIS, lancerRetrait, tenirRetraits } from "./retrait.ts";
import { ouvrirRunner } from "./runner.ts";
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
    // Les serveurs que ce `status` montre : un transfert dont le serveur n'y est plus est fermé.
    dire("lecture", montree, pages.recevoir(montree));
    // Le rail se dessine aussi du bloc mis à part : sa colonne T'attend en vient.
    const redessine = faits.attendre(montree);
    if (redessine !== undefined) dire("faits", redessine);
  },
});
// L'onglet de contenu affiché — Rail, Cooks, Manager, Grants ou Log — a sa propre veille,
// réglée pareil : sa commande est lue pour elle-même, et son échec se lit dans
// l'onglet sans rien retirer à ce que `status` dit à côté. Sur un terminal, elle ne lit rien.
// La lecture de l'onglet Manager part avec ce qui s'y pose au-dessus du texte : l'état du
// manager, lu dans cette sortie (manager.ts) ; celle de l'onglet Grants, avec l'état des
// grants (grants.ts). `ongletLu` : l'onglet que la veille lit, et sa demande.
let ongletLu: { id: unknown; demande: number } | undefined;
const veilleDOnglet = ouvrirVeille({
  ssh: process.env.BRIGADE_SSH_BIN || "ssh",
  intervalleMs: 30_000,
  delaiMs: 30_000,
  connexionS: 10,
  passage,
  surLecture: (lecture) => {
    const lu = ongletLu?.demande === lecture.demande ? ongletLu.id : undefined;
    dire("contenu", lecture, lu === "manager" ? voirManager(lecture) : undefined, lu === "grants" ? voirGrants(lecture) : undefined);
  },
});
// Ce qui se dessine — la pastille de chaque projet dans la barre, sa carte, son rail,
// sa bannière d'arrêt — a la sienne aussi, et elle lit tous les projets, quel que soit
// l'écran : la barre est toujours affichée. Une box qui ne rend pas `faits` (un runtime
// plus ancien) le dit là où ils se dessinent, et `status` reste lisible à côté.
const faits = tenirFaits();
const veilleDesFaits = ouvrirVeille({ ssh: process.env.BRIGADE_SSH_BIN || "ssh", intervalleMs: 30_000, delaiMs: 30_000, connexionS: 10, passage, surLecture: (lecture) => dire("faits", faits.recevoir(lecture)) });

// La page d'un worktree servi, dans le navigateur du poste (page.ts) : le port que `status`
// montre est amené ici par un transfert de port de `ssh` — par le passage du projet, le temps
// qu'il s'ouvre, et trente secondes au plus —, puis l'adresse locale est ouverte comme une issue.
const pages = tenirPages({
  transferer: (servi, port, signal) => {
    // Jamais posée hors des essais, comme pour la veille.
    const rendu = (passage.get(servi.nom) ?? Promise.resolve()).then(() => ouvrirTransfert({ ssh: process.env.BRIGADE_SSH_BIN || "ssh", delaiMs: 30_000, connexionS: 10 }, servi, port, signal));
    passage.set(servi.nom, rendu);
    return rendu;
  },
  ouvrir: (url) => shell.openExternal(url),
});

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

// Le runner : ce poste joue les stations que ses projets lui confient (runner.ts) — celles
// que leur box déclare `distante`. Il s'annonce, réclame, renouvelle et rend par le geste
// `tirer` de la box, par le passage du projet comme les veilles ; un `ssh` a quarante-cinq
// secondes, plus que les trente que le geste laisse au runtime pour répondre. Rien n'arrive
// ici : toutes ses connexions partent du poste. Ses cooks tournent dans des worktrees du
// dossier du projet, posés à côté du fichier des projets ; ce qu'il dit de lui s'écrit dans
// le terminal qui a lancé l'app — et la box le montre, sur la ligne `présence` de `station`.
const runner = ouvrirRunner({
  // Jamais posées hors des essais, comme pour la veille.
  ssh: process.env.BRIGADE_SSH_BIN || "ssh",
  claude: process.env.BRIGADE_CLAUDE_BIN || "claude",
  git: "git",
  worktrees: join(dirname(cheminConfiguration()), "stations"),
  env: process.env,
  delaiMs: 45_000,
  connexionS: 10,
  gitMs: 120_000,
  passage,
  surEtat: ({ projet, station, dit }) => console.error(`brigade : station ${station} de « ${projet} » — ${dit}`),
});

// Retirer un projet : de l'app, ou de sa box — deux gestes (retrait.ts). Le premier
// n'écrit que le fichier des projets. Le second lance le geste de désinstallation de la
// box, par le passage du projet comme les veilles : son plan, qui ne retire rien, puis
// l'exécution, refusée tant que le chef n'a pas confirmé en nommant le projet. Désinstallé,
// le projet se montre sans sa box, et sa mise en service ne vaut plus rien.
const retraits = tenirRetraits({
  chemin: cheminConfiguration(),
  retirer: (nom) => suivi.retirer(nom),
  boxes: () => boxes(suivi.configuration()),
  lancer: (servi, demande) => {
    // Jamais posée hors des essais, comme pour la veille.
    const rendu = (passage.get(servi.nom) ?? Promise.resolve()).then(() => lancerRetrait({ ssh: process.env.BRIGADE_SSH_BIN || "ssh", delaiMs: demande.plan ? DELAIS.planMs : DELAIS.executionMs, connexionS: 10 }, servi, demande));
    passage.set(servi.nom, rendu);
    return rendu;
  },
  surDesinstalle: (nom) => {
    services.oublier(nom);
    pages.oublier(nom);
    // La veille de `status` tient encore sa box, quel que soit l'écran : elle est reposée sans lui.
    voir();
    // Et le runner ne joue plus rien pour lui : ses cooks sont arrêtés.
    runner.servir(projets());
    dire("configuration", affichee(), []);
  },
});
// Ce que la veille de `status` lit en ce moment, tel que la vue l'a demandé en dernier :
// rejoué, il se relit avec les projets tels que l'app les montre maintenant.
let voir = () => {};

// Le fichier des projets : créé s'il manque, relu dès qu'il change. Un projet
// qui a quitté la liste — ou changé de dossier — perd ses terminaux, sa mise
// en service et ses transferts de port ; les autres n'en savent rien. Celui qui a quitté la liste n'a plus
// rien de tenu de son retrait non plus.
const suivi = suivreConfiguration({
  chemin: cheminConfiguration(),
  surChangement: (configuration, partis) => {
    partis.forEach(services.oublier);
    partis.forEach(pages.oublier);
    partis.filter((nom) => !configuration.projets.some((reste) => reste.nom === nom)).forEach(retraits.oublier);
    dire("configuration", affichee(), partis.flatMap((nom) => terminaux.quitter(nom)));
    // Les stations que le poste joue sont celles du fichier tel qu'il est maintenant.
    runner.servir(projets());
    // Un clone de brigade a pu entrer dans la liste, ou en sortir.
    void retards.relire(true);
  },
});
// Les projets tels que l'app les montre, et les lit : celui qu'elle a désinstallé de sa
// box n'en a plus (retrait.ts) — ni veille, ni bouton, ni mise en service ne l'y cherchent.
const projets = () => suivi.configuration().projets.map(retraits.vu);
const affichee = () => pourLaBarre(suivi.configuration(), retraits.vu);
// Un projet du fichier, qu'il s'ouvre ou non : sa box se lit, et se vérifie, sans son dossier.
const connu = (nom: unknown) => projets().find((candidat) => candidat.nom === nom);
// Le même, tel que le fichier le déclare : c'est avec sa box qu'il se retire, et se désinstalle.
const declare = (nom: unknown) => suivi.configuration().projets.find((candidat) => candidat.nom === nom);

// Le code de l'app vient d'un clone, et rien d'autre ne le surveille : son retard sur son
// origine est lu au démarrage, puis à chaque retour à la fenêtre — et celui du clone d'un
// projet, quand ce clone est celui de brigade (retard.ts). Lire n'écrit rien dans un clone,
// et rien n'y est mis à jour : un `git` qui n'a rien rendu au bout de trente secondes est arrêté.
const retards = tenirRetards({
  reglages: { git: "git", delaiMs: 30_000 },
  // Le dossier de l'app, dans son clone.
  app: join(import.meta.dirname, ".."),
  projets,
  surLecture: (vu) => dire("code", vu),
});

// La vue nomme un projet ; seul un projet du fichier, et qui s'ouvre, a un espace.
function projet(nom: unknown): Projet {
  const trouve = projets().find((candidat) => candidat.nom === nom);
  if (trouve === undefined || trouve.refus !== undefined) throw new Error(`projet sans espace : ${String(nom)}`);
  return trouve;
}

ipcMain.handle("demarrage", () => ({ configuration: affichee(), exemple: EXEMPLE, onglets: ONGLETS, boutons: BOUTONS, gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS } }, banniere: BANNIERE, calibrage: { modeles: MODELES, efforts: EFFORTS }, code: retards.vu() }));
// Ajouter un projet : son dossier se choisit, il ne se tape pas. Le reste se
// décide hors de la vue — elle reçoit ce qu'il en est advenu, et pourquoi.
ipcMain.handle("choisirDossier", async () => {
  if (fenetre === undefined) return undefined;
  const { filePaths } = await dialog.showOpenDialog(fenetre, { title: "Le dossier du projet", properties: ["openDirectory", "createDirectory"] });
  return filePaths[0];
});
// Le dépôt GitHub du dossier choisi, lu dans son origine — ou pourquoi il reste à écrire.
ipcMain.handle("lireDepot", (_, dossier: unknown) => (typeof dossier === "string" && dossier !== "" ? lireDepot("git", dossier) : undefined));
// Ce que l'écran propose plutôt que de le demander, et d'où cela vient (proposition.ts) :
// le calibrage se lit dans le fichier ; la racine des sauvegardes, sur la box choisie.
ipcMain.handle("proposerCalibrage", () => proposerCalibrage(suivi.configuration().projets));
ipcMain.handle("proposerRacine", (_, hote: unknown) =>
  typeof hote === "string" && boxes(suivi.configuration()).includes(hote)
    ? // Jamais posée hors des essais, comme pour la veille.
      lireRacine({ ssh: process.env.BRIGADE_SSH_BIN || "ssh", delaiMs: 15_000, connexionS: 10 }, hote)
    : undefined,
);
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
// Retirer un projet : la vue nomme le projet et le geste, ce qu'il en advient se décide
// dans retrait.ts. « Retirer de l'app » n'écrit que le fichier des projets — rien ne part
// vers la box. Les trois autres sont le geste de box : la case du journal, décochée
// d'office ; le plan, qui ne retire rien ; la désinstallation, refusée sans plan et sans
// le nom du projet, écrit par le chef.
ipcMain.handle("retrait", (_, nom: unknown) => {
  const vise = declare(nom);
  return vise === undefined ? undefined : retraits.etat(vise);
});
ipcMain.handle("retirerDeLApp", (_, nom: unknown) => {
  const vise = declare(nom);
  return vise === undefined ? parti(nom) : retraits.retirerDeLApp(vise);
});
ipcMain.handle("direJournal", (_, nom: unknown, coche: unknown) => {
  const vise = declare(nom);
  return vise === undefined ? undefined : retraits.direJournal(vise, coche === true);
});
// La box met son temps à répondre, et le fichier a pu changer entre-temps : ce qui est
// rendu à la vue est le retrait du projet tel qu'il est déclaré à la réponse — rien, s'il n'y est plus.
const apres = async (nom: unknown, demande: Promise<unknown>) => {
  await demande;
  const vise = declare(nom);
  return vise === undefined ? undefined : retraits.etat(vise);
};
ipcMain.handle("planifier", (_, nom: unknown) => {
  const vise = declare(nom);
  return vise === undefined ? undefined : apres(nom, retraits.planifier(vise));
});
ipcMain.handle("desinstaller", (_, nom: unknown, confirmation: unknown) => {
  const vise = declare(nom);
  return vise === undefined ? undefined : apres(nom, retraits.desinstaller(vise, confirmation));
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
// Une carte de T'attend : une demande en prose est écrite dans le second, qui est affiché, et rien
// ne l'envoie. La vue nomme le projet et le ticket ; la phrase se compose ici (demande.ts) de ce que
// le bloc `attend` en dit — jamais d'un texte venu de la vue. Rien pour un ticket que le bloc ne nomme pas.
ipcMain.handle("demander", (_, nom: unknown, ticket: unknown) => {
  const vise = projet(nom);
  const dit = faits.attendu(vise.nom, ticket);
  if (dit === undefined || typeof ticket !== "number") return undefined;
  const ecrit = demandeDe(vise.nom, ticket, dit.lignes, dit.titre);
  return "refus" in ecrit ? ecrit : terminaux.inscrire(vise, ecrit.demande, noteDeLaDemande(ecrit.demande));
});
// Un geste : sa commande est écrite dans un shell de l'espace, ouvert pour elle, et rien ne
// l'envoie. La vue nomme le geste ; ce qui s'écrit se décide dans gestes.ts — ou pourquoi rien
// ne l'est : un projet qui ne s'ouvre pas n'a pas de shell. Rien, pour un projet sans box.
// Un geste qui porte sur un grant le reçoit nommé — `merge` s'écrit comme les autres : la
// commande se lit et se corrige dans le shell avant Entrée, et rien d'autre n'est demandé.
ipcMain.handle("geste", (_, nom: unknown, id: unknown, grant: unknown) => {
  const vise = connu(nom);
  return vise === undefined ? parti(nom) : ecrireGeste(terminaux, id, vise, grant);
});
// Un clone en retard : sa mise à jour — `git -C <clone> pull` — est écrite dans un shell, et
// rien ne l'envoie. La vue nomme le clone ; ce qui s'écrit, et dans l'espace de quel projet, se
// décide dans retard.ts — ou pourquoi rien ne l'est. Rien, pour un clone qui n'est pas en retard.
// L'espace du projet est ouvert d'abord, comme au clic sur sa case : un shell n'y vit pas sans son second.
ipcMain.handle("mettreAJour", (_, clone: unknown) =>
  retards.ecrire(
    {
      shell: (hote, ecrit) => {
        terminaux.espace(hote);
        return terminaux.shell(hote, ecrit);
      },
    },
    clone,
  ),
);
// Ce qu'engage l'allumage du manager, chiffré (allumage.ts) : `manager backlog`, lancée une fois
// sur la box, par le passage du projet comme les veilles. La vue le demande après le geste
// « allumer », dont la commande est déjà écrite : cette lecture ne le retient pas, et n'écrit rien.
ipcMain.handle("compter", (_, nom: unknown) => {
  const vise = connu(nom);
  if (vise?.box === undefined) return undefined;
  const servi = { nom: vise.nom, box: vise.box };
  // Jamais posée hors des essais, comme pour la veille.
  const rendu = (passage.get(servi.nom) ?? Promise.resolve()).then(() => compter({ ssh: process.env.BRIGADE_SSH_BIN || "ssh", delaiMs: 30_000, connexionS: 10 }, servi));
  passage.set(servi.nom, rendu);
  return rendu;
});
// Un projet refusé n'a pas d'espace, mais sa box se lit quand même.
ipcMain.on("regarder", (_, nom: unknown, demande: number) => (voir = () => regarder(projets().filter((candidat) => candidat.nom === nom), ["status"], demande))());
// L'onglet de contenu affiché, et lui seul : sa commande, sur la box de son projet.
// Aucun — un terminal, « Tous les projets » — ou un nom qui n'est pas celui d'un onglet : plus rien n'est lu pour lui.
ipcMain.on("onglet", (_, nom: unknown, id: unknown, demande: number) => {
  const commande = commandeDe(id);
  ongletLu = { id, demande };
  veilleDOnglet.regarder(commande === undefined ? [] : projets().filter((candidat) => candidat.nom === nom), commande === undefined ? [] : [commande], demande);
});
// « Tous les projets » : le `status` de chacun, et ce que `station` dit de la machine et du quota.
ipcMain.on("tous", (_, demande: number) => (voir = () => regarder(projets(), ["status", "station"], demande))());
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
// La page d'un worktree servi s'ouvre dans le navigateur du poste : la vue nomme le projet et le
// worktree, le port est celui que la box a montré (page.ts). Rien, pour un projet sans box.
ipcMain.handle("ouvrirPage", (_, nom: unknown, worktree: unknown) => {
  const vise = connu(nom);
  return vise === undefined ? undefined : pages.ouvrir(vise, worktree);
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
  pages.fermer();
  retards.fermer();
  // Les cooks du poste ne survivent pas à l'app : fermée, sa station est absente.
  void runner.fermer();
});
// Revenir à l'app relit le fichier : le chef revient de son éditeur, et la
// veille du fichier n'a pas à être seule à le savoir. Et le retard des clones : il
// revient peut-être d'un `git pull`, ou d'une heure pendant laquelle on a livré.
app.on("browser-window-focus", () => {
  suivi.relire();
  void retards.relire();
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
  // La première lecture du retard des clones : la vue la reçoit, ou la trouve à son démarrage.
  void retards.relire();
  // L'app est lancée : ses stations se manifestent.
  runner.servir(projets());
  return fenetre.loadFile(join(import.meta.dirname, "vue/index.html"));
});
