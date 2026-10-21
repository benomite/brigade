// Ce qui mesure, dans chaque fichier de tests, le code que chaque test fait
// tourner. Chargé par `--import` dans les process du lanceur (`node --test`),
// c'est `mesurer-cli.ts` qui l'y met, par `NODE_OPTIONS` ; il n'agit que dans
// un process qui joue un fichier de tests (`NODE_TEST_CONTEXT`) et quand
// `BRIGADE_COUVERTURE_DIR` dit où écrire — partout ailleurs, il ne fait rien.
//
// Il relève la couverture précise de V8 à chaque frontière de test — avant
// chacun, après chacun — et met ce qui a tourné depuis le relevé précédent au
// compte du test le plus intérieur en cours ; un test parent (`t.test`) n'a que
// ce qui tourne hors de ses sous-tests. Ce qui tourne hors de tout test — le
// chargement des modules, le corps des `describe`, les crochets `before` et
// `after` de fichier — n'est au compte de personne. Deux tests d'un même
// fichier qui tournent en même temps (`concurrency`) se mêlent leurs comptes.
//
// Le code que fait tourner un process lancé par un test compte aussi : chaque
// lancement reçoit `NODE_V8_COVERAGE`, et le relevé qu'un process Node écrit en
// finissant est au compte du test en cours quand il est lu. Un process tué sans
// pouvoir finir (SIGKILL) n'écrit rien ; un process qui survit à son test est
// au compte de celui pendant lequel il finit. Un test qui compare à la lettre
// l'environnement d'un process qu'il lance y trouve donc `NODE_V8_COVERAGE` et
// échoue sous la mesure — sa couverture est relevée tout de même.
//
// Le crochet et `lignes.ts` ne sont jamais du code couvert : ils tournent à
// chaque relevé, au compte de tous les tests.
//
// Chaque test donne une ligne de `mesures-<pid>.jsonl` dans le répertoire :
// son fichier et son nom complet, puis, pour chaque fichier de code
// (`cheminDuCode`), les lignes qu'il a fait tourner.
import { appendFileSync, mkdirSync, readdirSync, readFileSync, realpathSync, unlinkSync } from "node:fs";
import { Session } from "node:inspector";
import { syncBuiltinESMExports } from "node:module";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach } from "node:test";
import { cheminDuCode, decouper, lignesExecutees, reunir, sourceCompile, type Intervalles, type Lignes, type ScriptV8 } from "./lignes.ts";

export type Mesure = {
  // Le fichier de tests, relatif à la racine, en `/`.
  file: string;
  // Le nom complet du test : ses suites puis lui, séparés par ` > `.
  name: string;
  // Pour chaque fichier de code, relatif à la racine, les lignes couvertes.
  lines: Record<string, Intervalles>;
};

type ContexteDeTest = { name: string; fullName: string; filePath?: string | undefined };

type EnCours = { contexte: ContexteDeTest; lignes: Map<string, Intervalles> };

function installer(dossier: string, racine: string): void {
  const session = new Session();
  session.connect();
  // Une session du process lui-même : la réponse arrive avant que `post` rende.
  const demander = <T>(methode: string, parametres?: object): T => {
    let reponse: { erreur: Error | null; resultat?: T } | undefined;
    session.post(methode, parametres, (erreur: Error | null, resultat?: object) => void (reponse = { erreur, resultat: resultat as T }));
    if (reponse === undefined) throw new Error(`${methode}: the inspector did not answer at once`);
    if (reponse.erreur) throw reponse.erreur;
    return reponse.resultat as T;
  };
  demander("Profiler.enable");
  demander("Profiler.startPreciseCoverage", { callCount: true, detailed: true });

  const enfants = join(dossier, `enfants-${process.pid}`);
  mkdirSync(enfants, { recursive: true });
  ajouterAuxLancements(enfants);

  const mesures = join(dossier, `mesures-${process.pid}.jsonl`);
  // La mesure ne se mesure pas : son code tourne entre deux relevés, au compte
  // de chaque test.
  const mesureuses = new Set([import.meta.url, new URL("./lignes.ts", import.meta.url).href]);
  const sources = new Map<string, { chemin: string; lignes: Lignes } | null>();
  // Le fichier de code d'une URL de script, découpé une fois par process —
  // null pour ce qui n'en est pas.
  const sourceDe = (url: string) => {
    let source = sources.get(url);
    if (source !== undefined) return source;
    source = null;
    if (url.startsWith("file:") && !mesureuses.has(url)) {
      try {
        const fichier = fileURLToPath(url);
        const chemin = cheminDuCode(fichier, racine);
        if (chemin !== null) source = { chemin, lignes: decouper(sourceCompile(fichier)) };
      } catch {
        // Un script disparu ou illisible ne compte pas.
      }
    }
    sources.set(url, source);
    return source;
  };

  const pile: EnCours[] = [];
  const compter = (scripts: ScriptV8[]) => {
    const courant = pile.at(-1);
    if (courant === undefined) return;
    for (const script of scripts) {
      if (!script.functions.some((f) => f.ranges.some((p) => p.count > 0))) continue;
      const source = sourceDe(script.url);
      if (source === null) continue;
      const lignes = lignesExecutees(script.functions, source.lignes);
      if (lignes.length > 0) courant.lignes.set(source.chemin, reunir(courant.lignes.get(source.chemin) ?? [], lignes));
    }
  };
  // Ce qui a tourné depuis le relevé précédent, ici et dans les process finis
  // entre-temps, au compte du test en cours.
  const relever = () => {
    compter(demander<{ result: ScriptV8[] }>("Profiler.takePreciseCoverage").result);
    for (const nom of readdirSync(enfants)) {
      const chemin = join(enfants, nom);
      let scripts: ScriptV8[];
      try {
        scripts = (JSON.parse(readFileSync(chemin, "utf8")) as { result: ScriptV8[] }).result;
      } catch {
        // Un relevé en cours d'écriture se relira au suivant.
        continue;
      }
      compter(scripts);
      unlinkSync(chemin);
    }
  };
  const cheminDuTest = (contexte: ContexteDeTest) => {
    const fichier = contexte.filePath ?? "";
    const chemin = relative(racine, fichier);
    return (chemin.startsWith("..") ? fichier : chemin).replaceAll("\\", "/");
  };
  // La mesure ne doit jamais faire échouer un test : ce qui y casse se dit sur
  // la sortie d'erreur du fichier, et le test continue.
  const sansEchec = (quoi: string, geste: () => void) => {
    try {
      geste();
    } catch (erreur) {
      process.stderr.write(`brigade coverage: ${quoi}: ${erreur instanceof Error ? erreur.message : String(erreur)}\n`);
    }
  };

  beforeEach((t: ContexteDeTest) => {
    sansEchec("before a test", relever);
    pile.push({ contexte: t, lignes: new Map() });
  });
  afterEach((t: ContexteDeTest) => {
    sansEchec("after a test", relever);
    const rang = pile.findLastIndex((e) => e.contexte === t || (e.contexte.fullName === t.fullName && e.contexte.filePath === t.filePath));
    const [fini] = rang < 0 ? [] : pile.splice(rang, 1);
    if (fini === undefined) return;
    sansEchec("writing a measure", () => {
      const mesure: Mesure = { file: cheminDuTest(t), name: t.fullName, lines: Object.fromEntries(fini.lignes) };
      appendFileSync(mesures, `${JSON.stringify(mesure)}\n`);
    });
  });
}

// Pose `NODE_V8_COVERAGE` dans l'environnement de chaque process que ce process
// lance : les tests lancent les leurs avec un environnement choisi, où la
// variable du process ne passerait pas. Rien n'est lancé ici — c'est le
// lancement de chaque test qui reçoit, en plus, où écrire son relevé.
function ajouterAuxLancements(enfants: string): void {
  // `node:child_process`, pris par son nom de module : le seul module de
  // `src` qui lance, `sans-invite.ts`, passe lui aussi par ce qui est posé ici.
  const lancements = process.getBuiltinModule("child_process");
  const variable = `NODE_V8_COVERAGE=${enfants}`;
  // Les lancements qui rendent la main tout de suite passent tous par là, avec
  // l'environnement déjà mis en paires.
  // `spawn` du prototype n'est pas dans les types de Node.
  const prototype = lancements.ChildProcess.prototype as unknown as { spawn: (this: unknown, options: { envPairs?: string[] }) => unknown };
  const lancer = prototype.spawn;
  prototype.spawn = function (options) {
    if (Array.isArray(options?.envPairs)) options.envPairs = [...options.envPairs.filter((paire) => !paire.startsWith("NODE_V8_COVERAGE=")), variable];
    return lancer.call(this, options);
  };
  // Ceux qui attendent la fin du process : (programme, [args], [options]), ou
  // (commande, [options]) pour `execSync`.
  const estOptions = (valeur: unknown): valeur is { env?: NodeJS.ProcessEnv } => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
  for (const nom of ["spawnSync", "execFileSync", "execSync"] as const) {
    const original = lancements[nom] as (...args: unknown[]) => unknown;
    const avecCouverture = (...args: unknown[]) => {
      const rang = args.findIndex((argument, i) => i > 0 && estOptions(argument));
      const options = rang < 0 ? {} : (args[rang] as { env?: NodeJS.ProcessEnv });
      const posees = { ...options, env: { ...(options.env ?? process.env), NODE_V8_COVERAGE: enfants } };
      if (rang >= 0) return original(...args.map((argument, i) => (i === rang ? posees : argument)));
      if (nom !== "execSync" && args.length === 1) return original(args[0], [], posees);
      return original(...args, posees);
    };
    (lancements as unknown as Record<string, unknown>)[nom] = avecCouverture;
  }
  // Les `import { … } from "node:child_process"` déjà faits voient les
  // nouvelles fonctions.
  syncBuiltinESMExports();
}

const dossier = process.env.BRIGADE_COUVERTURE_DIR;
const racine = process.env.BRIGADE_COUVERTURE_RACINE;
if (dossier && racine && process.env.NODE_TEST_CONTEXT) {
  // Un `node --test` qu'un test lance garde son propre répertoire, s'il en a
  // un : il ne doit pas écrire ses tests parmi ceux de la suite mesurée.
  delete process.env.BRIGADE_COUVERTURE_DIR;
  delete process.env.BRIGADE_COUVERTURE_RACINE;
  installer(dossier, realpathSync.native(racine));
}
