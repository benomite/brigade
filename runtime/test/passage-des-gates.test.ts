// Un seul passage de gates à la fois par arbre : le vrai `.claude/brigade/gates.sh`
// de ce dépôt, et son hook d'arrêt, joués sur un projet d'essai dont la suite
// tient tant que le test ne la lâche pas. Le projet n'a pas de manifest, les
// gates y sont donc rouges — c'est le verrou qui est regardé ici. Puis l'arbre
// que le hook choisit de juger, selon qui s'arrête.
import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { aArreter, ENV_ENFANT, mort, repertoireTemporaire } from "./outils.ts";

const GATES = join(import.meta.dirname, "../../.claude/brigade/gates.sh");
const HOOK = join(import.meta.dirname, "../../.claude/brigade/gates-hook.sh");

type Essai = { racine: string; dehors: string; env: Record<string, string>; lacher: () => void; jouees: () => number };

// Un dépôt git d'un commit, dont la suite note qu'elle est jouée puis attend
// d'être lâchée. Lâchée, elle tue d'un TERM les gates qui l'ont lancée si le
// fichier `tue` est posé — une fois : elle l'emporte. Elle ne survit pas au
// répertoire du test : un test en échec le retire aussitôt qu'il l'a lâchée.
function projet(t: TestContext): Essai {
  const racine = join(repertoireTemporaire(t), "projet");
  const dehors = repertoireTemporaire(t);
  mkdirSync(join(racine, "runtime"), { recursive: true });
  const suite = `echo jouee >> "$TEMOIN"; while [ ! -e "$LACHE" ] && [ -e "$TEMOIN" ]; do sleep 0.1; done; [ ! -e "$TUE" ] || { rm "$TUE"; kill -TERM $(ps -o ppid= -p $PPID); }`;
  writeFileSync(join(racine, "runtime/package.json"), JSON.stringify({ scripts: { test: suite } }));
  writeFileSync(join(racine, "CLAUDE.md"), "## Équipe multi-agents (plugin brigade)\n\n- **Branche d'intégration** : `main`\n");
  writeFileSync(join(racine, ".gitignore"), "node_modules/\n.brigade-state/\n");
  const temoin = join(dehors, "temoin");
  const lache = join(dehors, "lache");
  const env = { ...ENV_ENFANT, HOME: dehors, TEMOIN: temoin, LACHE: lache, TUE: join(dehors, "tue") };
  const git = (...args: string[]) => execFileSync("git", ["-C", racine, "-c", "user.name=essai", "-c", "user.email=essai@exemple.test", ...args], { env });
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-q", "-m", "projet d'essai");
  // Une suite que le test n'a pas lâchée ne doit pas lui survivre.
  const lacher = () => writeFileSync(lache, "");
  aArreter(t, lacher);
  return {
    racine,
    dehors,
    env,
    lacher,
    jouees: () => (existsSync(temoin) ? readFileSync(temoin, "utf8").split("\n").length - 1 : 0),
  };
}

// Ce qui manque au projet d'essai pour que ses gates passent : les manifests,
// les quatre rôles et leur miroir Codex.
function verdir(racine: string): void {
  const roles = ["po", "manager", "dev", "designer"];
  const poser = (fichier: string, contenu: string) => {
    mkdirSync(join(racine, fichier, ".."), { recursive: true });
    writeFileSync(join(racine, fichier), contenu);
  };
  poser(".claude-plugin/plugin.json", JSON.stringify({ commands: roles.map((role) => `./commands/${role}.md`) }));
  poser(".claude-plugin/marketplace.json", "{}");
  poser(".claude/settings.json", "{}");
  for (const role of roles) {
    poser(`commands/${role}.md`, "");
    poser(`codex/skills/${role}/SKILL.md`, "");
    poser(`codex/skills/${role}/agents/openai.yaml`, "");
  }
}

type Passage = { process: ChildProcess; sortie: () => string; fini: Promise<number | null> };

function lancer(commande: string, args: string[], env: Record<string, string>, entree = ""): Passage {
  const lance = spawn(commande, args, { env, stdio: ["pipe", "pipe", "pipe"] });
  let sortie = "";
  lance.stdout.on("data", (morceau: Buffer) => (sortie += morceau.toString()));
  lance.stderr.on("data", (morceau: Buffer) => (sortie += morceau.toString()));
  lance.stdin.end(entree);
  const fini = new Promise<number | null>((resoudre, rejeter) => {
    lance.on("error", rejeter);
    lance.on("close", resoudre);
  });
  return { process: lance, sortie: () => sortie, fini };
}

// Attend un fait, pas une durée : le délai n'est qu'une garde, pour qu'un test
// cassé finisse par le dire.
async function jusqua(fait: () => boolean, quoi: string): Promise<void> {
  const limite = Date.now() + 100_000;
  while (!fait()) {
    assert.ok(Date.now() < limite, `jamais arrivé : ${quoi}`);
    await new Promise((suite) => setTimeout(suite, 20));
  }
}

const ATTEND = "un autre passage joue déjà dans cet arbre";
const REPRIS = "verdict repris du passage";
const RENDU = "rendu le \\d{4}-\\d\\d-\\d\\d à \\d\\d:\\d\\d:\\d\\d — l'arbre n'a pas bougé depuis";

// Les réveils comptés par le hook d'arrêt, une ardoise par arbre jugé.
function reveils(essai: Essai, session = "session-d-essai"): number[] {
  const ardoises = join(essai.dehors, ".claude/brigade-gates", session);
  return readdirSync(ardoises).map((arbre) => Number(readFileSync(join(ardoises, arbre, "total"), "utf8")));
}

// Chaque test a son projet : ils se jouent de front.
describe("un seul passage de gates à la fois par arbre", { concurrency: 8 }, () => {
  test("deux tirs simultanés du hook d'arrêt ne jouent qu'une suite, et ne brûlent qu'un réveil", async (t) => {
    const essai = projet(t);
    // Les gates du hook, écoutées : ce qu'elles disent sur stderr pendant
    // qu'elles attendent n'arrive au hook qu'à la fin.
    const ecoute = join(essai.dehors, "ecoute");
    const ecoutees = join(essai.dehors, "gates-ecoutees.sh");
    writeFileSync(ecoutees, `#!/usr/bin/env bash\nexec bash ${JSON.stringify(GATES)} "$@" 2> >(tee -a ${JSON.stringify(ecoute)} >&2)\n`);
    chmodSync(ecoutees, 0o755);
    const env = { ...essai.env, CLAUDE_PROJECT_DIR: essai.racine, BRIGADE_GATES_CMD: ecoutees };
    const tir = (evenement: string) => lancer("bash", [HOOK], env, JSON.stringify({ session_id: "session-d-essai", hook_event_name: evenement }));

    // Le premier tient sa suite tant que le second n'est pas arrêté au verrou.
    // Deux arrêts de la session : ce sont eux qui jugent le même arbre.
    const premier = tir("Stop");
    await jusqua(() => essai.jouees() === 1, "la suite du premier tir");
    const second = tir("Stop");
    await jusqua(() => existsSync(ecoute) && readFileSync(ecoute, "utf8").includes(ATTEND), "le second tir au verrou");
    essai.lacher();
    const codes = [await premier.fini, await second.fini];

    assert.equal(essai.jouees(), 1, "les deux tirs ont joué chacun leur suite");
    // Le même verdict rouge pour les deux : l'un réveille, l'autre le sait
    // délivré et se tait — un arrêt qui n'a rien changé ne consomme pas de réveil.
    assert.deepEqual([...codes].sort(), [0, 2], `${premier.sortie()}\n${second.sortie()}`);
    const [reveil, silence] = codes[0] === 2 ? [premier, second] : [second, premier];
    assert.match(reveil.sortie(), /^FAIL {2}absent : \.claude-plugin\/plugin\.json$/m);
    assert.match(reveil.sortie(), /Gates ROUGES \(réveil 1\/2 sur cet échec, 1\/4 au total\)/);
    assert.equal(silence.sortie(), "");
    assert.deepEqual(reveils(essai), [1]);
  });

  test("un passage lancé pendant qu'un autre joue l'attend et le dit ; l'arbre ayant changé entre-temps, il joue à son tour", async (t) => {
    const essai = projet(t);

    const premier = lancer("bash", [GATES, essai.racine], essai.env);
    await jusqua(() => essai.jouees() === 1, "la suite du premier passage");
    const second = lancer("bash", [GATES, essai.racine], essai.env);
    await jusqua(() => second.sortie().includes(ATTEND), "le second passage au verrou");
    assert.equal(essai.jouees(), 1, "le second passage a joué sa suite sans attendre");
    writeFileSync(join(essai.racine, "nouveau.txt"), "ce que le premier passage n'a pas jugé\n");
    essai.lacher();

    assert.equal(await premier.fini, 1);
    assert.equal(await second.fini, 1);
    assert.equal(essai.jouees(), 2);
    assert.doesNotMatch(second.sortie(), new RegExp(REPRIS));
    assert.match(second.sortie(), /^ok {4}tests du runtime$/m);
  });

  test("le verdict gardé : qui a attendu un passage sur le même état de l'arbre le reprend, sortie et code ; qui n'attend personne rejoue — sauf à le demander, pour un vert seulement, et tant que l'arbre n'a pas bougé", async (t) => {
    const essai = projet(t);

    const premier = lancer("bash", [GATES, essai.racine], essai.env);
    await jusqua(() => essai.jouees() === 1, "la suite du premier passage");
    const second = lancer("bash", [GATES, essai.racine], essai.env);
    await jusqua(() => second.sortie().includes(ATTEND), "le second passage au verrou");
    essai.lacher();

    assert.equal(await premier.fini, 1);
    assert.equal(await second.fini, 1);
    assert.equal(essai.jouees(), 1);
    // Ce que le second ajoute se dit en `gates : ` — le hook d'arrêt écarte ces
    // lignes du détail qu'il remonte. Le reste est la sortie du premier.
    const sans = (sortie: string) => sortie.split("\n").filter((ligne) => !ligne.includes(ATTEND) && !ligne.includes(REPRIS)).sort();
    assert.deepEqual(sans(second.sortie()), sans(premier.sortie()));
    assert.match(second.sortie(), new RegExp(`^gates : ${REPRIS} \\d+, ${RENDU}$`, "m"));

    // Le même arbre, plus personne devant : les gates se rejouent pour de bon.
    const passage = async (env: Record<string, string>, code: number) => {
      const joue = lancer("bash", [GATES, essai.racine], env);
      assert.equal(await joue.fini, code, joue.sortie());
      return joue.sortie();
    };
    const troisieme = await passage(essai.env, 1);
    assert.equal(essai.jouees(), 2);
    assert.doesNotMatch(troisieme, new RegExp(`${ATTEND}|${REPRIS}`));

    // À qui demande le verdict gardé — le hook d'arrêt —, un rouge n'est pas
    // rendu : il peut ne tenir qu'au poste, et repris il ne laisserait plus
    // jamais voir de vert. L'arbre n'a pas bougé, et il est rejoué.
    const garde = { ...essai.env, BRIGADE_GATES_VERDICT_GARDE: "1" };
    assert.doesNotMatch(await passage(garde, 1), new RegExp(REPRIS));
    assert.equal(essai.jouees(), 3, "un rouge gardé a été repris au lieu d'être rejoué");

    // L'arbre réparé, rien de commité : il est rejugé, et il est vert.
    verdir(essai.racine);
    const vert = await passage(garde, 0);
    assert.equal(essai.jouees(), 4);
    assert.doesNotMatch(vert, new RegExp(REPRIS));

    // Ce vert-là est rendu sans attendre personne ni rejouer la suite, et la
    // ligne dit de quand il date.
    const repris = await passage(garde, 0);
    assert.equal(essai.jouees(), 4, "la suite a été rejouée sur un arbre vert inchangé");
    assert.match(repris, new RegExp(`^gates : ${REPRIS} \\d+, ${RENDU}$`, "m"));
    assert.doesNotMatch(repris, new RegExp(ATTEND));
    assert.deepEqual(sans(repris), sans(vert));

    // Un fichier suivi modifié, rien de commité : la tête n'a pas bougé, l'arbre
    // si — il est rejugé.
    writeFileSync(join(essai.racine, "CLAUDE.md"), "\nce que le dernier verdict n'a pas jugé\n", { flag: "a" });
    assert.doesNotMatch(await passage(garde, 0), new RegExp(REPRIS));
    assert.equal(essai.jouees(), 5);
  });

  test("un passage tué ne retient pas les suivants", async (t) => {
    const essai = projet(t);

    const tue = lancer("bash", [GATES, essai.racine], essai.env);
    await jusqua(() => essai.jouees() === 1, "la suite du passage à tuer");
    // Tué seul, il laisse derrière lui le passage qu'il tenait et ses copistes :
    // ils finissent avec leur suite, et le test ne rend pas la main avant.
    const laisses = execFileSync("pgrep", ["-P", String(tue.process.pid)]).toString().trim().split("\n").map(Number);
    aArreter(t, () => {
      for (const pid of laisses) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // Déjà mort : c'est ce qu'on attend.
        }
      }
    });
    // Sa sortie, elle, reste ouverte tant que ceux qu'il laisse vivent : c'est
    // sa mort qui est attendue, pas elle.
    const sorti = new Promise((resoudre) => tue.process.on("exit", resoudre));
    tue.process.kill("SIGKILL");
    await sorti;

    // Le suivant ne trouve personne au verrou, alors que le passage laissé joue encore.
    const suivant = lancer("bash", [GATES, essai.racine], essai.env);
    await jusqua(() => essai.jouees() === 2, "la suite du suivant");
    assert.doesNotMatch(suivant.sortie(), new RegExp(ATTEND));
    essai.lacher();
    assert.equal(await suivant.fini, 1);
    assert.match(suivant.sortie(), /^ok {4}tests du runtime$/m);
    for (const pid of laisses) await mort(pid);
  });

  test("ce qu'un passage imprime se lit au fil de l'eau, sur son canal : tué avant sa fin, il l'a déjà dit ; le verrou et le verdict gardé vivent à part des journaux de la suite", async (t) => {
    const essai = projet(t);
    const passage = spawn("bash", [GATES, essai.racine], { env: essai.env, stdio: ["ignore", "pipe", "pipe"] });
    let sortie = "";
    let erreurs = "";
    passage.stdout.on("data", (morceau: Buffer) => (sortie += morceau.toString()));
    passage.stderr.on("data", (morceau: Buffer) => (erreurs += morceau.toString()));
    const fini = new Promise((resoudre) => passage.on("close", resoudre));

    // La suite tient encore : rien de ceci n'attend la fin du passage.
    await jusqua(() => /^FAIL {2}absent : \.claude\/settings\.json$/m.test(erreurs), "les FAIL d'avant la suite, sur la sortie d'erreur");
    await jusqua(() => /^ok {4}miroir Codex à jour/m.test(sortie), "les ok d'avant la suite, sur la sortie standard");
    assert.doesNotMatch(sortie, /^FAIL/m);
    assert.doesNotMatch(sortie + erreurs, /tests du runtime/);

    essai.lacher();
    await fini;
    assert.match(sortie, /^ok {4}tests du runtime$/m);
    assert.match(erreurs, /^gates : ROUGE$/m);

    assert.deepEqual(readdirSync(join(essai.racine, ".brigade-state")).sort(), ["gates", "passage-des-gates"]);
    assert.deepEqual(readdirSync(join(essai.racine, ".brigade-state/gates")), []);
  });

  test("l'attente du verrou a une borne : passé celle-ci, le passage le dit et joue de front, au lieu d'être tué sans avoir joué", async (t) => {
    const essai = projet(t);

    const premier = lancer("bash", [GATES, essai.racine], essai.env);
    await jusqua(() => essai.jouees() === 1, "la suite du premier passage");
    const second = lancer("bash", [GATES, essai.racine], { ...essai.env, BRIGADE_GATES_ATTENTE: "1" });
    // Le premier tient toujours sa suite : le second n'a pu jouer la sienne
    // qu'en renonçant au verrou.
    await jusqua(() => essai.jouees() === 2, "la suite du second passage, de front");
    assert.match(second.sortie(), new RegExp(`^gates : ${ATTEND} \\(pid \\d+\\) — celui-ci attend son tour, 1 s au plus$`, "m"));
    assert.match(second.sortie(), /^gates : verrou toujours tenu après 1 s — ce passage joue sans l'attendre davantage, de front$/m);
    essai.lacher();

    assert.equal(await premier.fini, 1);
    assert.equal(await second.fini, 1);
    assert.doesNotMatch(second.sortie(), new RegExp(REPRIS));
    assert.match(second.sortie(), /^ok {4}tests du runtime$/m);
  });

  test("un passage mort d'un signal n'a pas de verdict à prêter : qui l'attendait joue à son tour", async (t) => {
    const essai = projet(t);
    writeFileSync(essai.env.TUE ?? "", "");

    const premier = lancer("bash", [GATES, essai.racine], essai.env);
    await jusqua(() => essai.jouees() === 1, "la suite du premier passage");
    const second = lancer("bash", [GATES, essai.racine], essai.env);
    await jusqua(() => second.sortie().includes(ATTEND), "le second passage au verrou");
    essai.lacher();

    assert.equal(await premier.fini, 130);
    assert.equal(await second.fini, 1);
    assert.equal(essai.jouees(), 2);
    assert.doesNotMatch(second.sortie(), new RegExp(REPRIS));
    assert.match(second.sortie(), /^ok {4}tests du runtime$/m);
  });

  test("des dépendances du runtime posées pendant l'attente changent l'état jugé, bien que git les ignore : pas de verdict repris", async (t) => {
    const essai = projet(t);

    const premier = lancer("bash", [GATES, essai.racine], essai.env);
    await jusqua(() => essai.jouees() === 1, "la suite du premier passage");
    const second = lancer("bash", [GATES, essai.racine], essai.env);
    await jusqua(() => second.sortie().includes(ATTEND), "le second passage au verrou");
    // Ce que fait un setup de worktree joué entre-temps.
    mkdirSync(join(essai.racine, "runtime/node_modules/.bin"), { recursive: true });
    writeFileSync(join(essai.racine, "runtime/node_modules/.bin/tsc"), "#!/bin/sh\n");
    assert.equal(execFileSync("git", ["-C", essai.racine, "status", "--porcelain"], { env: essai.env }).toString(), "");
    essai.lacher();

    assert.equal(await premier.fini, 1);
    assert.equal(await second.fini, 1);
    assert.equal(essai.jouees(), 2);
    assert.doesNotMatch(second.sortie(), new RegExp(REPRIS));
  });

  test("la purge du hook ne retire pas le verrou de la session qui tire, aussi ancien soit-il", async (t) => {
    const essai = projet(t);
    const ardoises = join(essai.dehors, ".claude/brigade-gates");
    mkdirSync(join(ardoises, "session-finie"), { recursive: true });
    const ancien = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    for (const nom of ["session-d-essai.verrou", "session-finie.verrou", "session-finie"]) {
      if (nom.endsWith(".verrou")) writeFileSync(join(ardoises, nom), "");
      utimesSync(join(ardoises, nom), ancien, ancien);
    }
    // Des gates vertes : c'est sur un vert que le hook purge.
    const env = { ...essai.env, CLAUDE_PROJECT_DIR: essai.racine, BRIGADE_GATES_CMD: "true" };

    const tir = lancer("bash", [HOOK], env, JSON.stringify({ session_id: "session-d-essai", hook_event_name: "Stop" }));

    assert.equal(await tir.fini, 0, tir.sortie());
    assert.deepEqual(readdirSync(ardoises), ["session-d-essai.verrou"]);
  });
});

// Ici les gates sont fausses : elles notent l'arbre qu'on leur fait juger, et
// rougissent s'il porte un fichier `ROUGE`. C'est le choix de l'arbre qui est
// regardé.
describe("le hook d'arrêt juge l'arbre où travaille celui qui s'arrête", { concurrency: 8 }, () => {
  type Atelier = Essai & { arbre: (nom: string) => string; juges: () => string[]; tir: (entree: Record<string, unknown>) => Passage };

  function atelier(t: TestContext): Atelier {
    const essai = projet(t);
    const juges = join(essai.dehors, "juges");
    const gates = join(essai.dehors, "fausses-gates.sh");
    writeFileSync(gates, `#!/bin/sh\necho "$1 garde=$BRIGADE_GATES_VERDICT_GARDE" >> ${JSON.stringify(juges)}\n[ ! -e "$1/ROUGE" ] || { echo "FAIL  arbre rouge" >&2; exit 1; }\n`);
    chmodSync(gates, 0o755);
    const env = { ...essai.env, CLAUDE_PROJECT_DIR: essai.racine, BRIGADE_GATES_CMD: gates };
    return {
      ...essai,
      // Un worktree du projet, rangé comme le binding Worktrees le veut : `<n>-<slug>`.
      arbre: (nom) => {
        const chemin = join(essai.dehors, "arbres", nom);
        execFileSync("git", ["-C", essai.racine, "worktree", "add", "-q", "-b", nom, chemin], { env: essai.env });
        return realpathSync(chemin);
      },
      juges: () => (existsSync(juges) ? readFileSync(juges, "utf8").trim().split("\n") : []),
      // Ce que le harness donne à un subagent : le répertoire de la session pour `cwd`.
      tir: (entree) => lancer("bash", [HOOK], env, JSON.stringify({ session_id: "session-d-essai", cwd: essai.racine, ...entree })),
    };
  }

  test("l'arrêt d'un dev juge son worktree, pas l'arbre de la session, et y demande le verdict gardé ; son rouge nomme l'arbre et le dev, sur une ardoise à lui", async (t) => {
    const lieu = atelier(t);
    const worktree = lieu.arbre("7-essai");
    writeFileSync(join(worktree, "ROUGE"), "");
    writeFileSync(join(lieu.racine, "ROUGE"), "");

    const dev = lieu.tir({ hook_event_name: "SubagentStop", agent_type: "dev-7" });
    assert.equal(await dev.fini, 2, dev.sortie());
    assert.deepEqual(lieu.juges(), [`${worktree} garde=1`]);
    assert.match(dev.sortie(), /^FAIL {2}arbre rouge$/m);
    assert.ok(dev.sortie().includes(`Arbre jugé : ${worktree} — le worktree de dev-7, qui vient de s'arrêter.`), dev.sortie());
    assert.match(dev.sortie(), /Gates ROUGES \(réveil 1\/2 sur cet échec, 1\/4 au total\)\. dev-7 corrige/);

    // Le même échec dans l'arbre de la session : ses réveils ne sont pas entamés.
    const session = lieu.tir({ hook_event_name: "Stop" });
    assert.equal(await session.fini, 2, session.sortie());
    assert.deepEqual(lieu.juges(), [`${worktree} garde=1`, `${lieu.racine} garde=1`]);
    assert.ok(session.sortie().includes(`Arbre jugé : ${lieu.racine} — celui de la session.`), session.sortie());
    assert.match(session.sortie(), /Gates ROUGES \(réveil 1\/2 sur cet échec, 1\/4 au total\)\. Corrige/);
    assert.deepEqual(reveils(lieu), [1, 1]);

    // Un subagent sans nom dans ce même worktree, vu d'une autre session — celle-ci
    // tient ce rouge pour délivré : il n'est pas attribué à la session.
    const anonyme = lieu.tir({ session_id: "autre-session", hook_event_name: "SubagentStop", cwd: worktree });
    assert.equal(await anonyme.fini, 2, anonyme.sortie());
    assert.ok(anonyme.sortie().includes(`Arbre jugé : ${worktree} — le worktree d'un subagent sans nom, qui vient de s'arrêter.`), anonyme.sortie());
    assert.doesNotMatch(anonyme.sortie(), /celui de la session/);

    // Le dev a corrigé : son ardoise part, celle de la session reste.
    rmSync(join(worktree, "ROUGE"));
    const corrige = lieu.tir({ hook_event_name: "SubagentStop", agent_type: "dev-7" });
    assert.equal(await corrige.fini, 0, corrige.sortie());
    assert.equal(corrige.sortie(), "");
    assert.deepEqual(reveils(lieu), [1]);
  });

  test("le worktree s'établit aussi par le nom gardé à côté du transcript, ou par un cwd qui s'y trouve ; s'il ne s'établit pas, rien n'est joué et le hook le dit, sans se rabattre sur l'arbre de la session", async (t) => {
    const lieu = atelier(t);
    writeFileSync(join(lieu.racine, "ROUGE"), "");
    const worktree = lieu.arbre("7-essai");
    const autre = lieu.arbre("12-autre");
    lieu.arbre("12-encore");
    writeFileSync(join(lieu.dehors, "agent-a1.meta.json"), JSON.stringify({ agentType: "dev-7", name: "dev-7" }));
    // Un dépôt qui n'est pas celui de la session.
    const ailleurs = join(lieu.dehors, "ailleurs");
    execFileSync("git", ["init", "-q", ailleurs], { env: lieu.env });
    const arret = (entree: Record<string, unknown>) => lieu.tir({ hook_event_name: "SubagentStop", ...entree });

    const parNom = arret({ agent_type: "brigade:dev-teammate-medium", agent_transcript_path: join(lieu.dehors, "agent-a1.jsonl") });
    assert.equal(await parNom.fini, 0, parNom.sortie());
    // Un cwd dans un autre arbre du dépôt que celui de la session se croit, et passe avant le nom.
    const parCwd = arret({ agent_type: "dev-7", cwd: join(autre, "runtime") });
    assert.equal(await parCwd.fini, 0, parCwd.sortie());
    assert.deepEqual(lieu.juges(), [`${worktree} garde=1`, `${autre} garde=1`]);

    const introuvables = {
      "general-purpose": arret({ agent_type: "general-purpose" }),
      // Aucun worktree pour ce numéro.
      "dev-9": arret({ agent_type: "dev-9" }),
      // Deux pour celui-ci : le nom n'en désigne aucun.
      "dev-12": arret({ agent_type: "dev-12" }),
      Explore: arret({ agent_type: "Explore", cwd: ailleurs }),
      "sans nom": arret({ cwd: join(lieu.dehors, "absent") }),
    };
    for (const [qui, tir] of Object.entries(introuvables)) {
      assert.equal(await tir.fini, 0, tir.sortie());
      assert.match(tir.sortie(), new RegExp(`^gates : rien n'est joué à l'arrêt du subagent « ${qui} » — son worktree ne s'établit pas par l'entrée du hook \\(cwd : [^)]+\\), et l'arbre de la session n'est jugé qu'à l'arrêt de la session\n$`));
    }
    assert.equal(lieu.juges().length, 2);
  });
});
