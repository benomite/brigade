// Le pont entre la vue et le process principal : rien que ces vingt et un gestes. La
// vue n'a ni Node ni accès aux fichiers.
const { contextBridge, ipcRenderer } = require("electron");

/** @type {import("./vue/pont.d.ts").Pont} */
const pont = {
  demarrage: () => ipcRenderer.invoke("demarrage"),
  choisirDossier: () => ipcRenderer.invoke("choisirDossier"),
  ajouter: (projet) => ipcRenderer.invoke("ajouter", projet),
  formeDuNom: (nom) => ipcRenderer.invoke("formeDuNom", nom),
  verifierNom: (nom, hote) => ipcRenderer.invoke("verifierNom", nom, hote),
  espace: (projet) => ipcRenderer.invoke("espace", projet),
  shell: (projet) => ipcRenderer.invoke("shell", projet),
  inscrire: (projet, bouton) => ipcRenderer.invoke("inscrire", projet, bouton),
  regarder: (projet, demande) => ipcRenderer.send("regarder", projet, demande),
  tous: (demande) => ipcRenderer.send("tous", demande),
  onglet: (projet, id, demande) => ipcRenderer.send("onglet", projet, id, demande),
  faits: (demande) => ipcRenderer.send("faits", demande),
  ouvrirIssue: (projet, ticket) => ipcRenderer.invoke("ouvrirIssue", projet, ticket),
  ecrire: (id, donnees) => ipcRenderer.send("ecrire", id, donnees),
  redimensionner: (id, colonnes, lignes) => ipcRenderer.send("redimensionner", id, colonnes, lignes),
  surSortie: (recevoir) => void ipcRenderer.on("sortie", (_, id, donnees) => recevoir(id, donnees)),
  surEtat: (recevoir) => void ipcRenderer.on("etat", (_, terminal) => recevoir(terminal)),
  surLecture: (recevoir) => void ipcRenderer.on("lecture", (_, lecture) => recevoir(lecture)),
  surContenu: (recevoir) => void ipcRenderer.on("contenu", (_, lecture) => recevoir(lecture)),
  surFaits: (recevoir) => void ipcRenderer.on("faits", (_, recue) => recevoir(recue)),
  surConfiguration: (recevoir) => void ipcRenderer.on("configuration", (_, configuration, fermes) => recevoir(configuration, fermes)),
};
contextBridge.exposeInMainWorld("brigade", pont);
