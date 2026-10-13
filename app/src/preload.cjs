// Le pont entre la vue et le process principal : rien que ces trente-six gestes. La
// vue n'a ni Node ni accès aux fichiers.
const { contextBridge, ipcRenderer } = require("electron");

/** @type {import("./vue/pont.d.ts").Pont} */
const pont = {
  demarrage: () => ipcRenderer.invoke("demarrage"),
  choisirDossier: () => ipcRenderer.invoke("choisirDossier"),
  lireDepot: (dossier) => ipcRenderer.invoke("lireDepot", dossier),
  declarerBox: (hote) => ipcRenderer.invoke("declarerBox", hote),
  installer: (saisie) => ipcRenderer.invoke("installer", saisie),
  ajouter: (projet) => ipcRenderer.invoke("ajouter", projet),
  proposerCalibrage: () => ipcRenderer.invoke("proposerCalibrage"),
  proposerRacine: (hote) => ipcRenderer.invoke("proposerRacine", hote),
  formeDuNom: (nom) => ipcRenderer.invoke("formeDuNom", nom),
  service: (projet) => ipcRenderer.invoke("service", projet),
  amorcer: (projet) => ipcRenderer.invoke("amorcer", projet),
  direMerge: (projet, merge) => ipcRenderer.invoke("direMerge", projet, merge),
  verifier: (projet) => ipcRenderer.invoke("verifier", projet),
  demarrer: (projet) => ipcRenderer.invoke("demarrer", projet),
  retrait: (projet) => ipcRenderer.invoke("retrait", projet),
  retirerDeLApp: (projet) => ipcRenderer.invoke("retirerDeLApp", projet),
  direJournal: (projet, coche) => ipcRenderer.invoke("direJournal", projet, coche),
  planifier: (projet) => ipcRenderer.invoke("planifier", projet),
  desinstaller: (projet, confirmation) => ipcRenderer.invoke("desinstaller", projet, confirmation),
  espace: (projet) => ipcRenderer.invoke("espace", projet),
  shell: (projet) => ipcRenderer.invoke("shell", projet),
  inscrire: (projet, bouton) => ipcRenderer.invoke("inscrire", projet, bouton),
  regarder: (projet, demande) => ipcRenderer.send("regarder", projet, demande),
  tous: (demande) => ipcRenderer.send("tous", demande),
  onglet: (projet, id, demande) => ipcRenderer.send("onglet", projet, id, demande),
  faits: (demande) => ipcRenderer.send("faits", demande),
  ouvrirIssue: (projet, ticket) => ipcRenderer.invoke("ouvrirIssue", projet, ticket),
  ouvrirPage: (projet, worktree) => ipcRenderer.invoke("ouvrirPage", projet, worktree),
  ecrire: (id, donnees) => ipcRenderer.send("ecrire", id, donnees),
  redimensionner: (id, colonnes, lignes) => ipcRenderer.send("redimensionner", id, colonnes, lignes),
  surSortie: (recevoir) => void ipcRenderer.on("sortie", (_, id, donnees) => recevoir(id, donnees)),
  surEtat: (recevoir) => void ipcRenderer.on("etat", (_, terminal) => recevoir(terminal)),
  surLecture: (recevoir) => void ipcRenderer.on("lecture", (_, lecture, servies) => recevoir(lecture, servies)),
  surContenu: (recevoir) => void ipcRenderer.on("contenu", (_, lecture) => recevoir(lecture)),
  surFaits: (recevoir) => void ipcRenderer.on("faits", (_, recue) => recevoir(recue)),
  surConfiguration: (recevoir) => void ipcRenderer.on("configuration", (_, configuration, fermes) => recevoir(configuration, fermes)),
};
contextBridge.exposeInMainWorld("brigade", pont);
