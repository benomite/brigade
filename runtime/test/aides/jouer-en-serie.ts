// Process d'essai : joue l'un après l'autre, dans ce seul process, les lancements
// du fichier d'une commande qui n'a pas de fonction à appeler (`principal`,
// appel.ts) — chacun avec ses arguments et son environnement, comme s'il était
// lancé seul : ses lignes, et le code de sortie que son process aurait rendu.
// Le Node qui démarre n'est payé qu'une fois (`enSerie`, serie.ts).
// Arguments : le fichier, les lancements en JSON ([{ args, env, precharger }]),
// et le fichier où écrire leurs résultats en JSON ([{ code, sortie }]).
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { format } from "node:util";

const [fichier = "", brut = "[]", resultat = ""] = process.argv.slice(2);
const lancements = JSON.parse(brut) as Array<{ args: string[]; env: Record<string, string>; precharger?: string }>;
const base = { ...process.env };
const node = process.argv[0] ?? process.execPath;

// Ce que `process.exit` lève à la place de finir le process : le lancement
// s'arrête là, avec ce code.
class Fin {
  readonly code: number;

  constructor(code: number) {
    this.code = code;
  }
}

let sortie = "";
const noter = (...valeurs: unknown[]) => void (sortie += `${format(...valeurs)}\n`);
console.log = noter;
console.info = noter;
console.error = noter;
console.warn = noter;
process.exit = ((code?: number | string | null) => {
  throw new Fin(Number(code ?? process.exitCode ?? 0));
}) as typeof process.exit;

const resultats: Array<{ code: number; sortie: string }> = [];
for (const [rang, { args, env, precharger }] of lancements.entries()) {
  // Ce que son process aurait préchargé (`--import`) : chargé pour de bon, il
  // vaut aussi pour les lancements qui suivent.
  if (precharger !== undefined) await import(precharger);
  sortie = "";
  process.exitCode = undefined;
  for (const cle of Object.keys(process.env)) delete process.env[cle];
  Object.assign(process.env, base, env);
  process.argv = [node, fichier, ...args];
  let code: number;
  try {
    // Une adresse neuve à chaque lancement : le fichier se rejoue en entier.
    await import(`${pathToFileURL(fichier).href}?lancement=${rang}`);
    code = Number(process.exitCode ?? 0);
  } catch (erreur) {
    if (erreur instanceof Fin) code = erreur.code;
    else {
      // Ce qu'un process aurait fait d'une erreur que la commande laisse passer.
      noter(erreur instanceof Error ? erreur.stack : String(erreur));
      code = 1;
    }
  }
  resultats.push({ code, sortie });
}
process.exitCode = 0;
writeFileSync(resultat, JSON.stringify(resultats));
