// Les refus de démarrer du runtime, joués tous dans ce seul process : main.ts
// est réévalué une fois par cas (`?cas=<rang>`), sur l'environnement du cas,
// et ses modules ne se chargent qu'une fois — un Node par refus coûtait
// ses modules à chaque fois. Ce que le cas dit (sortie et erreur mêlées, comme
// `lancer` les relève) et le code qu'il rend à `process.exit` sont relevés ;
// un cas qui démarre arrête le relevé là : ce process n'est pas un runtime.
// Usage : node refus-de-main.ts <fichier JSON des environnements>.
// Rend sur sa sortie un tableau JSON de `{ code, sortie }`, un par cas joué.
import { readFileSync } from "node:fs";
import { format } from "node:util";

const MAIN = new URL("../../src/main.ts", import.meta.url).href;

// Ce que `process.exit` aurait rendu : le cas s'arrête là, sans le process.
class Sortie {
  code: number;
  constructor(code: number) {
    this.code = code;
  }
}

const cas = JSON.parse(readFileSync(process.argv[2] ?? "", "utf8")) as Array<Record<string, string>>;
const sortir = process.exit.bind(process);
const ecrire = process.stdout.write.bind(process.stdout);
const consoleInitiale = { log: console.log, info: console.info, warn: console.warn, error: console.error };
const releves: Array<{ code: number | null; sortie: string }> = [];
for (const [rang, env] of cas.entries()) {
  for (const nom of Object.keys(process.env)) delete process.env[nom];
  Object.assign(process.env, env);
  let sortie = "";
  const noter = (...valeurs: unknown[]) => void (sortie += `${format(...valeurs)}\n`);
  Object.assign(console, { log: noter, info: noter, warn: noter, error: noter });
  process.exit = ((code?: number) => {
    throw new Sortie(code ?? 0);
  }) as typeof process.exit;
  let code: number | null = null;
  try {
    await import(`${MAIN}?cas=${rang}`);
  } catch (erreur) {
    // Une erreur que main.ts ne prend pas pour un refus : le process en mourrait, code 1.
    if (erreur instanceof Sortie) code = erreur.code;
    else {
      code = 1;
      sortie += `${(erreur as Error).stack ?? String(erreur)}\n`;
    }
  }
  Object.assign(console, consoleInitiale);
  process.exit = sortir;
  releves.push({ code, sortie });
  if (code === null) break;
}
ecrire(JSON.stringify(releves), () => sortir(0));
