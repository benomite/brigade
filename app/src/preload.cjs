// Le pont entre la vue et le process principal : rien que ces treize gestes. La
// vue n'a ni Node ni accès aux fichiers.
const { contextBridge, ipcRenderer } = require("electron");

/** @type {import("./vue/pont.d.ts").Pont} */
const pont = {
  demarrage: () => ipcRenderer.invoke("demarrage"),
  choisirDossier: () => ipcRenderer.invoke("choisirDossier"),
  ajouter: (projet) => ipcRenderer.invoke("ajouter", projet),
  espace: (projet) => ipcRenderer.invoke("espace", projet),
  shell: (projet) => ipcRenderer.invoke("shell", projet),
  regarder: (projet, demande) => ipcRenderer.send("regarder", projet, demande),
  kitchen: (demande) => ipcRenderer.send("kitchen", demande),
  ecrire: (id, donnees) => ipcRenderer.send("ecrire", id, donnees),
  redimensionner: (id, colonnes, lignes) => ipcRenderer.send("redimensionner", id, colonnes, lignes),
  surSortie: (recevoir) => void ipcRenderer.on("sortie", (_, id, donnees) => recevoir(id, donnees)),
  surEtat: (recevoir) => void ipcRenderer.on("etat", (_, terminal) => recevoir(terminal)),
  surLecture: (recevoir) => void ipcRenderer.on("lecture", (_, lecture) => recevoir(lecture)),
  surConfiguration: (recevoir) => void ipcRenderer.on("configuration", (_, configuration, fermes) => recevoir(configuration, fermes)),
};
contextBridge.exposeInMainWorld("brigade", pont);
