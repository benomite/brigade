// La part du temps de chaque cook passée dans ses outils — tests, gates —
// plutôt que dans `claude` (#2349, épique #2337).
//
// Chaque cook lancé s'ajoute, à sa fin, à `.claude/brigade/parts-cook.json`
// du projet (`enregistrerTempsCook`) : `{cookId, claude, outils}`, en secondes.
// Seuls les 200 derniers sont gardés. La part des outils se calcule à la
// lecture (`lirePartsCook`) : le fichier ne tient que ce qui a été mesuré.
//
// Le fichier est la seule mémoire : rien n'est tenu en mémoire, un redémarrage
// de la station ne perd rien.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const FICHIER_DES_PARTS = ".claude/brigade/parts-cook.json";
export const COOKS_GARDES = 200;

// Le temps d'un cook, en secondes : dans `claude`, et dans ses outils.
export type TempsCook = { claude: number; outils: number };
type Enregistrement = { cookId: string } & TempsCook;
// `partOutils` vaut outils / (claude + outils), dans [0, 1] ; 0 sans temps du tout.
export type PartCook = Enregistrement & { partOutils: number };

// Une durée lue ou reçue : un nombre fini, jamais négatif.
const duree = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0);

// Le temps d'un cook tel que la station le voit : `claude` a tourné `dureeMs`,
// dont `outilsMs` dans les outils qu'il a lancés (les reçus des gates du cook,
// `gates-du-cook.ts`) — le reste est à `claude`. Les outils ne dépassent pas
// la durée du cook.
export function tempsDuCook(dureeMs: number, outilsMs: number): TempsCook {
  const total = duree(dureeMs) / 1000;
  const outils = Math.min(duree(outilsMs) / 1000, total);
  return { claude: total - outils, outils };
}

const fichierDe = (projet: string) => join(projet, FICHIER_DES_PARTS);

function lireBrut(fichier: string): string | undefined {
  try {
    return readFileSync(fichier, "utf8");
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code !== "ENOENT") throw erreur;
    return undefined;
  }
}

function estUnEnregistrement(x: unknown): x is Enregistrement {
  if (typeof x !== "object" || x === null) return false;
  const e = x as Record<string, unknown>;
  return typeof e.cookId === "string" && typeof e.claude === "number" && typeof e.outils === "number";
}

// Ajoute le cook au fichier du projet dont `projet` est la racine, à la suite
// des autres — un cook relancé sous le même nom compte pour un lancement de
// plus —, et n'en garde que les 200 derniers. Un fichier illisible n'est pas
// écrasé : l'appel lève.
export function enregistrerTempsCook(projet: string, cookId: string, temps: TempsCook): void {
  const fichier = fichierDe(projet);
  const texte = lireBrut(fichier);
  const lus: unknown = texte === undefined || texte.trim() === "" ? [] : JSON.parse(texte);
  if (!Array.isArray(lus)) throw new Error(`${fichier} is not a JSON array: it is left as is`);
  const enregistrement: Enregistrement = { cookId, claude: duree(temps.claude), outils: duree(temps.outils) };
  const gardes = [...lus, enregistrement].slice(-COOKS_GARDES);
  mkdirSync(dirname(fichier), { recursive: true });
  const provisoire = `${fichier}.${process.pid}.tmp`;
  writeFileSync(provisoire, `${JSON.stringify(gardes, null, 2)}\n`);
  renameSync(provisoire, fichier);
}

// Les cooks enregistrés du projet, du plus ancien au plus récent, chacun avec
// sa part d'outils. Sans fichier, ou illisible : aucun. Les entrées qui n'ont
// pas la forme attendue sont écartées.
export function lirePartsCook(projet: string): PartCook[] {
  const texte = lireBrut(fichierDe(projet));
  if (texte === undefined) return [];
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    return [];
  }
  if (!Array.isArray(brut)) return [];
  return brut.filter(estUnEnregistrement).map((e) => {
    const claude = duree(e.claude);
    const outils = duree(e.outils);
    const total = claude + outils;
    return { cookId: e.cookId, claude, outils, partOutils: total > 0 ? outils / total : 0 };
  });
}
