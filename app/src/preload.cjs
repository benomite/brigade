// Le pont entre la vue et le process principal : rien que ces sept gestes. La
// vue n'a ni Node ni accès aux fichiers.
const { contextBridge, ipcRenderer } = require("electron");

/** @type {import("./vue/pont.d.ts").Pont} */
const pont = {
  demarrage: () => ipcRenderer.invoke("demarrage"),
  espace: (projet) => ipcRenderer.invoke("espace", projet),
  shell: (projet) => ipcRenderer.invoke("shell", projet),
  ecrire: (id, donnees) => ipcRenderer.send("ecrire", id, donnees),
  redimensionner: (id, colonnes, lignes) => ipcRenderer.send("redimensionner", id, colonnes, lignes),
  surSortie: (recevoir) => void ipcRenderer.on("sortie", (_, id, donnees) => recevoir(id, donnees)),
  surEtat: (recevoir) => void ipcRenderer.on("etat", (_, terminal) => recevoir(terminal)),
};
contextBridge.exposeInMainWorld("brigade", pont);
