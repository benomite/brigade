// Ce qu'un workflow GitHub dit de ses déclencheurs (`on:`) : se lance-t-il sur
// une PR qui vise la base, avec ces fichiers modifiés ? Le runtime n'a aucune
// dépendance : c'est une lecture du sous-ensemble de YAML qu'un `on:` utilise.
// Dans le doute — forme inattendue, ligne qu'on ne sait pas lire — la réponse
// est oui : la pass attend alors la CI, comme avant, plutôt que de juger sans.

const EVENEMENTS_DE_PR = ["pull_request", "pull_request_target"];

type Filtres = Record<string, string[]>;

const decommenter = (ligne: string) => ligne.replace(/(^|\s)#.*$/, "").trimEnd();
const retrait = (ligne: string) => ligne.length - ligne.trimStart().length;
const sansGuillemets = (texte: string) => texte.trim().replace(/^(["'])(.*)\1$/, "$2");
const liste = (texte: string) =>
  texte
    .trim()
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map(sansGuillemets)
    .filter(Boolean);

// Un motif de GitHub (`*` sans `/`, `**` avec, `?`) en expression régulière.
const motif = (glob: string) =>
  new RegExp(
    `^${glob
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*\/?/g, "\u0000")
      .replace(/\*/g, "[^/]*")
      .replace(/\?/g, "[^/]")
      .replace(/\u0000/g, "(?:.*/)?.*")}$`,
  );

// Un filtre en positif, et les motifs précédés de `!` qui retirent — dans
// l'ordre, le dernier qui correspond décide.
const retenu = (motifs: string[], valeur: string) => {
  let retenue = false;
  for (const m of motifs) {
    const exclu = m.startsWith("!");
    if (motif(exclu ? m.slice(1) : m).test(valeur)) retenue = !exclu;
  }
  return retenue;
};

// Les événements du bloc `on:` et leurs filtres, ou null si la forme échappe.
const evenements = (lignes: string[]): Map<string, Filtres> | null => {
  const index = lignes.findIndex((ligne) => /^["']?on["']?\s*:/.test(ligne));
  if (index < 0) return null;
  const [, ouverture = ""] = /^["']?on["']?\s*:(.*)$/.exec(lignes[index] ?? "") ?? [];
  const evenementsDe = (noms: string[]) => new Map(noms.map((nom) => [nom, {} as Filtres]));
  if (ouverture.trim() !== "") {
    if (ouverture.trim().startsWith("{")) return null;
    return evenementsDe(liste(ouverture));
  }
  const bloc: string[] = [];
  for (const ligne of lignes.slice(index + 1)) {
    if (ligne.trim() === "") continue;
    if (retrait(ligne) === 0) break;
    bloc.push(ligne);
  }
  if (bloc.length === 0) return null;
  if (bloc[0]?.trim().startsWith("-")) return evenementsDe(bloc.map((ligne) => sansGuillemets(ligne.trim().replace(/^-\s*/, ""))));
  const niveau = Math.min(...bloc.map(retrait));
  const trouves = new Map<string, Filtres>();
  let courant: Filtres | null = null;
  let filtre: string | null = null;
  for (const ligne of bloc) {
    const texte = ligne.trim();
    if (retrait(ligne) === niveau) {
      const [, nom = "", reste = ""] = /^["']?([\w-]+)["']?\s*:(.*)$/.exec(texte) ?? [];
      if (nom === "") return null;
      courant = {};
      trouves.set(nom, courant);
      filtre = null;
      // `pull_request: { branches: [main] }` ou une valeur en ligne : illisible ici.
      if (reste.trim() !== "" && reste.trim() !== "~" && reste.trim() !== "null") return null;
    } else if (courant !== null && texte.startsWith("-")) {
      // Sans filtre en cours, c'est la liste de l'événement lui-même
      // (`schedule:` et ses `- cron:`) : aucun filtre de PR à y lire.
      if (filtre !== null) (courant[filtre] ??= []).push(sansGuillemets(texte.replace(/^-\s*/, "")));
    } else if (courant !== null) {
      const [, cle = "", reste = ""] = /^([\w-]+)\s*:(.*)$/.exec(texte) ?? [];
      if (cle === "") return null;
      filtre = cle;
      courant[cle] = reste.trim() === "" ? [] : liste(reste);
    } else return null;
  }
  return trouves;
};

// Le workflow se lance-t-il sur une PR vers `base` qui modifie `fichiers` ?
export function declencheSurPr(contenu: string, base: string, fichiers: string[]): boolean {
  let declencheurs: Map<string, Filtres> | null;
  try {
    declencheurs = evenements(contenu.split("\n").map(decommenter));
  } catch {
    return true;
  }
  if (declencheurs === null) return true;
  for (const nom of EVENEMENTS_DE_PR) {
    const filtres = declencheurs.get(nom);
    if (filtres === undefined) continue;
    if (filtres["branches"]?.length && !retenu(filtres["branches"], base)) continue;
    if (filtres["branches-ignore"]?.length && retenu(filtres["branches-ignore"], base)) continue;
    if (filtres["paths"]?.length && !fichiers.some((fichier) => retenu(filtres["paths"] ?? [], fichier))) continue;
    if (filtres["paths-ignore"]?.length && fichiers.length > 0 && fichiers.every((fichier) => retenu(filtres["paths-ignore"] ?? [], fichier))) continue;
    return true;
  }
  return false;
}
