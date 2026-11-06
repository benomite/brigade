// Des scripts du runtime — une commande, un point d'entrée qui refuse de
// démarrer — joués l'un après l'autre dans un seul process d'essai, au lieu
// d'un Node chacun : leurs modules ne se chargent qu'une fois, et le script
// lui-même est réévalué à chaque cas (`?cas=<rang>`), sur les arguments,
// l'environnement et le répertoire du cas. Ce qu'il écrit (sortie et erreur
// mêlées, comme `lancer` les relève) et le code qu'il rendrait à son process —
// celui de `process.exit`, ou `process.exitCode` s'il va au bout — sont rendus.
// Ce qui tient au process lui-même (un signal, un port tenu, le lancement par
// son fichier) se prouve avec `lancer`.
//
// Côté test : `casEnProcess(ENV_ENFANT)` lance ce fichier à la première
// demande — sur cet environnement, auquel celui de chaque cas s'ajoute —, lui
// passe chaque cas sur une ligne JSON et lit le rendu sur une ligne JSON ; les
// cas se jouent dans l'ordre où ils sont demandés. `fermer()` à la fin du
// fichier de tests.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

export type Cas = { module: string; args?: string[]; env?: Record<string, string>; cwd?: string };
// `fini` : le script est allé au bout sans `process.exit` — son process
// sortirait sur `code`, ou continuerait s'il tient encore quelque chose.
export type Rendu = { code: number; sortie: string; fini: boolean };

export function casEnProcess(base: Record<string, string>): { jouer: (cas: Cas) => Promise<Rendu>; fermer: () => Promise<void> } {
  let enfant: ChildProcessWithoutNullStreams | null = null;
  let fin: Promise<void> = Promise.resolve();
  const enAttente: Array<{ resoudre: (rendu: Rendu) => void; rejeter: (erreur: Error) => void }> = [];
  let erreur = "";
  const demarrer = () => {
    const lance = spawn(process.execPath, [import.meta.filename], { env: base, stdio: ["pipe", "pipe", "pipe"] });
    lance.stderr.setEncoding("utf8").on("data", (bout: string) => void (erreur += bout));
    createInterface({ input: lance.stdout }).on("line", (ligne) => {
      const attente = enAttente.shift();
      try {
        attente?.resoudre(JSON.parse(ligne) as Rendu);
      } catch {
        attente?.rejeter(new Error(`le process des cas a écrit hors de son rendu : ${ligne}`));
      }
    });
    fin = new Promise((fini) =>
      lance.on("close", (code) => {
        for (const attente of enAttente.splice(0)) attente.rejeter(new Error(`le process des cas est mort (${code}) : ${erreur}`));
        fini();
      }),
    );
    return lance;
  };
  return {
    jouer: (cas) =>
      new Promise((resoudre, rejeter) => {
        enfant ??= demarrer();
        enAttente.push({ resoudre, rejeter });
        enfant.stdin.write(`${JSON.stringify({ ...cas, env: { ...base, ...cas.env } })}\n`);
      }),
    fermer: async () => {
      enfant?.stdin.end();
      await fin;
    },
  };
}

// Ce que `process.exit` aurait rendu : le cas s'arrête là, sans le process.
class Sortie {
  code: number;
  constructor(code: number) {
    this.code = code;
  }
}

async function jouerLesCas(): Promise<void> {
  const rendre = process.stdout.write.bind(process.stdout);
  const [sortieInitiale, erreurInitiale] = [process.stdout.write, process.stderr.write];
  const sortir = process.exit.bind(process);
  const consoleInitiale = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug };
  const repertoireInitial = process.cwd();
  // Un `process.exit` appelé hors du fil du cas, plus tard : rien à rendre.
  process.on("uncaughtException", (erreur) => {
    if (erreur instanceof Sortie) return;
    process.stderr.write = erreurInitiale;
    console.error(erreur);
    sortir(70);
  });
  let rang = 0;
  for await (const ligne of createInterface({ input: process.stdin })) {
    const cas = JSON.parse(ligne) as Cas;
    for (const nom of Object.keys(process.env)) delete process.env[nom];
    Object.assign(process.env, cas.env);
    process.argv = [process.execPath, cas.module, ...(cas.args ?? [])];
    process.chdir(cas.cwd ?? repertoireInitial);
    process.exitCode = undefined;
    let sortie = "";
    const noter = (morceau: string | Uint8Array, ...suite: unknown[]) => {
      sortie += typeof morceau === "string" ? morceau : Buffer.from(morceau).toString();
      const rappel = suite.find((s) => typeof s === "function") as (() => void) | undefined;
      rappel?.();
      return true;
    };
    process.stdout.write = noter as typeof process.stdout.write;
    process.stderr.write = noter as typeof process.stderr.write;
    process.exit = ((code?: number) => {
      throw new Sortie(Number(code ?? process.exitCode ?? 0));
    }) as typeof process.exit;
    let rendu: Rendu;
    try {
      await import(`${pathToFileURL(cas.module).href}?cas=${rang++}`);
      rendu = { code: Number(process.exitCode ?? 0), sortie, fini: true };
    } catch (erreur) {
      // Une erreur que le script ne prend pas pour un refus : son process en mourrait, code 1.
      rendu = erreur instanceof Sortie ? { code: erreur.code, sortie, fini: false } : { code: 1, sortie: `${sortie}${(erreur as Error).stack ?? String(erreur)}\n`, fini: false };
    } finally {
      process.stdout.write = sortieInitiale;
      process.stderr.write = erreurInitiale;
      process.exit = sortir;
      process.exitCode = undefined;
      Object.assign(console, consoleInitiale);
    }
    rendre(`${JSON.stringify(rendu)}\n`);
  }
  sortir(0);
}

if (import.meta.main) await jouerLesCas();
