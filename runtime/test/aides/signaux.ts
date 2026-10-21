// Sous Windows, aucun signal ne se donne à un process : `kill` y tue sur-le-champ,
// sans qu'il entende rien. Un process que `lancer` démarre sous Windows charge ce
// module avant son fichier (`--import`) : chaque ligne écrite sur son entrée est
// le nom d'un signal, émis dans le process comme le système l'y aurait remis —
// le geste de l'app de l'ordinateur, qui arrête sa station par son entrée
// (`app/src/poste/enveloppe.ts`). Un signal que le process n'écoute pas le tue,
// comme il l'aurait tué. Son entrée ne le garde pas en vie.
let lu = "";
process.stdin.on("error", () => {});
process.stdin.on("data", (morceau: Buffer) => {
  lu += morceau.toString();
  const lignes = lu.split("\n");
  lu = lignes.pop() ?? "";
  for (const ligne of lignes) {
    const nom = ligne.trim();
    if (nom === "") continue;
    const signal = nom as NodeJS.Signals;
    if (process.listenerCount(signal) === 0) process.exit(1);
    process.emit(signal, signal);
  }
});
process.stdin.unref();
