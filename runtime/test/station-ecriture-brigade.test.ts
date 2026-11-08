// Le ticket de setup d'un projet, par le chemin réel de la station (#2888) :
// `ouvrirStation` ouvre la cuisine du projet sur un Mac qui a le bac à sable,
// elle prend sur GitHub un ticket dont la livraison ne touche que
// `.claude/brigade/` — une épique l'a découpé, sa zone n'est que dans sa
// fiche —, et lance son cook avec les arguments qu'un vrai cook reçoit. Le faux
// cook (`aides/faux-cook.ts`, « setup-brigade ») décide de chaque écriture
// comme `claude` 2.1.300 : ses outils Write et Edit par les règles, le mode et
// les crochets qu'il a reçus — le crochet joué pour de bon —, et ses commandes
// Bash par la liste d'écriture du bac à sable.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";
import { test } from "node:test";
import { SEATBELT, type Sondes } from "../src/bac-a-sable/detection.ts";
import { brancheDuTicket, livreSousBrigade, runDuTicket } from "../src/brigade-github.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { ouvrirCuisine } from "../src/station/cuisine.ts";
import { CLONES, CONFIGURATION, environnementDuProjet, lireConfiguration } from "../src/station/configuration.ts";
import { ouvrirStation } from "../src/station/station.ts";
import { projetSurGit } from "./aides/projet-sur-git.ts";
import { DEPOT, ENV_GIT, fauxGh, git, issueGitHub, jusqua, repertoireTemporaire, temporaireDuFichier } from "./outils.ts";
import { posixOnly } from "./support/plateforme.ts";

const rienNeReste = temporaireDuFichier();

const FAUX_COOK = join(import.meta.dirname, "aides/faux-cook.ts");
const CROCHET = join(import.meta.dirname, "../src/bac-a-sable/crochet-brigade.ts");
const MAC: Sondes = { plateforme: "darwin", existe: (chemin) => chemin === SEATBELT, versionDeClaude: () => "2.1.300 (Claude Code)\n" };
// Le corps d'un ticket né d'une épique, comme benomite/baloo#38 : il nomme un
// dépôt et des fichiers sans leur chemin ; sa zone est dans sa fiche.
const CORPS = "benomite/baloo#38 only delivers files under .claude/brigade/ (reseau, gates.sh, worktree-setup.sh).";
const FICHE = "<!-- brigade:fiche -->\n- attend : rien\n- zone : .claude/brigade/";

type Essai = { par: string; chemin: string; permis: boolean; refus: string | null };

test("un ticket de setup pris par la station : son cook écrit et édite reseau, gates.sh et worktree-setup.sh sous `.claude/brigade/`, et rien hors de sa zone (#2888)", { skip: posixOnly("the fake cook runs by its shebang and the sandbox is a Mac's") }, async (t) => {
  const racine = repertoireTemporaire(t);
  const { amont, clone } = projetSurGit(t, { reglages: { integrationBranch: "v2" }, clone: join(racine, CLONES, "brigade") });
  writeFileSync(join(racine, CONFIGURATION), `brigade ${DEPOT}\n`);
  const [projet] = lireConfiguration(`brigade ${DEPOT}`).projets;
  assert.ok(projet);
  const gh = fauxGh(t);
  // Le compte de la machine écrit sur le dépôt : la station GitHub seul sert le projet, pas la contributrice (#2935).
  gh.repondre("user", { corps: { login: "chef" } });
  gh.repondre(`repos/${DEPOT}`, { corps: { full_name: DEPOT, owner: { login: "acme", type: "Organization" }, permissions: { push: true } } });
  const ticket = { ...issueGitHub(7, { labels: ["fire", "model:sonnet", "effort:low"] }), body: CORPS };
  gh.issues([ticket]);
  // Sa fiche, et la prise de la station : le faux `gh` ne retient pas ce
  // qu'on lui poste, la station trouve donc la sienne déjà là.
  const commentaire = (id: number, body: string) => ({ id, body, created_at: "2026-11-08T10:00:00Z", author_association: "OWNER", user: { login: "chef" } });
  gh.repondre(`repos/${DEPOT}/issues/7/comments?per_page=100`, { corps: [commentaire(1, FICHE), commentaire(2, "<!-- brigade:prise station=mac/claude -->\nTaken by station `mac/claude`.")] });
  gh.repondre(`repos/${DEPOT}/issues/7/labels`, { corps: [] });
  gh.repondre(`repos/${DEPOT}/issues/7/events?per_page=100`, { corps: [] });
  gh.repondre(`repos/${DEPOT}/pulls?head=${DEPOT.split("/")[0]}:${brancheDuTicket(7)}&state=all&per_page=1`, { corps: [] });
  gh.repondre(`repos/${DEPOT}/pulls?state=open&per_page=100`, { corps: [] });
  gh.repondre(`repos/${DEPOT}/commits/v2/check-runs?per_page=100`, { corps: { check_runs: [] } });
  gh.repondre(`repos/${DEPOT}/commits/v2/status?per_page=100`, { corps: { statuses: [] } });
  const temoin = repertoireTemporaire(t);
  const dehors = repertoireTemporaire(t);
  // Le répertoire temporaire des jugements du manager, hors du compte.
  const jugements = repertoireTemporaire(t);
  // `ENV_GIT` : le faux cook commite, et le CI ne donne aucune identité à git.
  const env = { ...ENV_GIT, HOME: repertoireTemporaire(t), BRIGADE_CLAUDE_BIN: FAUX_COOK, BRIGADE_SESSION_STATE: join(racine, "session", "renouvellement"), BRIGADE_GH_BIN: gh.bin, FAUX_COOK: "setup-brigade", FAUX_COOK_TEMOIN: temoin, FAUX_COOK_DEHORS: dehors };
  const etat = environnementDuProjet(racine, projet, env).BRIGADE_STATE_DIR ?? "";
  mkdirSync(etat, { recursive: true });
  const journal = ouvrirJournal(etat);
  const decisions = { BRIGADE_STATIONS: "mac/claude:2:code", BRIGADE_MANAGER_MODEL: "sonnet", BRIGADE_MANAGER_EFFORT: "medium", BRIGADE_REVIEWER_MODEL: "sonnet", BRIGADE_REVIEWER_EFFORT: "medium" };
  for (const [name, value] of Object.entries(decisions)) journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "decision.set", payload: { name, value, previous: null } });
  journal.fermer();
  const dits: string[] = [];
  const cuisines: ReturnType<typeof ouvrirCuisine>[] = [];
  const station = ouvrirStation({
    racine,
    env,
    dire: (dit) => void dits.push(dit),
    relectureMs: 3_600_000,
    // La vraie cuisine, sur un Mac simulé : son bac à sable est celui d'un poste.
    ouvrir: (sien, options) => {
      const cuisine = ouvrirCuisine(sien, { ...options, sondes: { ...MAC, temporaire: () => jugements } });
      cuisines.push(cuisine);
      return cuisine;
    },
  });
  // Les écritures du cook du ticket : le seul `claude` lancé dans son worktree.
  const ecritures = () =>
    readdirSync(temoin)
      .filter((nom) => nom.endsWith(".ecritures.json"))
      .filter((nom) => (JSON.parse(readFileSync(join(temoin, nom.replace(".ecritures.json", ".json")), "utf8")) as { cwd: string }).cwd.endsWith(`${sep}${runDuTicket(7)}`));
  const pousse = () => git(amont, "branch", "--list", brancheDuTicket(7)) !== "";
  try {
    assert.ok(dits.some((dit) => dit.includes("bac à sable — chaque `claude` de la cuisine")), dits.join("\n"));
    // Le cook a fini : la station pousse ce qu'il a commité, ou dit qu'il
    // n'a rien livré.
    await jusqua(() => ecritures().length > 0 && (pousse() || dits.some((dit) => dit.includes("#7 sur mac/claude — the cook stopped"))));
  } finally {
    station.arreter("fin du test");
    await Promise.all(cuisines.map((cuisine) => cuisine.arretee?.()));
  }
  const [fichier] = ecritures();
  const essais = JSON.parse(readFileSync(join(temoin, fichier ?? ""), "utf8")) as Essai[];
  const lance = JSON.parse(readFileSync(join(temoin, (fichier ?? "").replace(".ecritures.json", ".json")), "utf8")) as { cwd: string };
  const worktree = lance.cwd;
  assert.notEqual(worktree, clone);
  const sous = (relatif: string) => join(worktree, ".claude/brigade", relatif);
  const verdict = (par: string, chemin: string) => {
    const essai = essais.find((e) => e.par === par && e.chemin === chemin);
    assert.ok(essai, `${par} ${chemin} n'a pas été essayé : ${JSON.stringify(essais)}`);
    return essai;
  };

  // Les outils Write et Edit, dans la zone : chacun des trois fichiers.
  for (const nom of ["reseau", "gates.sh", "worktree-setup.sh"]) {
    for (const par of ["Write", "Edit"]) assert.equal(verdict(par, sous(nom)).permis, true, `${par} ${nom} : ${verdict(par, sous(nom)).refus}`);
  }
  // Le bac à sable : la commande Bash qui rend les scripts exécutables y écrit.
  for (const nom of ["gates.sh", "worktree-setup.sh"]) assert.equal(verdict("Bash", sous(nom)).permis, true, verdict("Bash", sous(nom)).refus ?? "");

  // Hors de la zone, tout reste refusé : le reste de `.claude/`, le
  // `.claude/brigade/` d'un autre worktree, ce qui est hors du worktree — par
  // les outils de `claude` comme par Bash.
  for (const [par, chemin] of [
    ["Write", join(worktree, ".claude/settings.json")],
    ["Edit", join(worktree, ".claude/brigade/../settings.local.json")],
    ["Write", join(dehors, "autre-worktree/.claude/brigade/reseau")],
    ["Write", join(dehors, "dehors.txt")],
    ["Bash", join(dehors, "par-bash.txt")],
    ["Bash", join(worktree, ".claude/settings.json")],
  ] as const) {
    assert.equal(verdict(par, chemin).permis, false, `${par} ${chemin} est permis`);
  }
  assert.deepEqual(readdirSync(dehors), []);
  // Poussé : les trois fichiers, édités, les scripts exécutables.
  assert.ok(pousse(), dits.join("\n"));
  assert.deepEqual(git(amont, "show", "--name-only", "--format=", brancheDuTicket(7)).split("\n").sort(), [".claude/brigade/gates.sh", ".claude/brigade/reseau", ".claude/brigade/worktree-setup.sh"]);
  assert.equal(git(amont, "show", `${brancheDuTicket(7)}:.claude/brigade/reseau`), "registry.npmjs.org\ngithub.com");
  for (const script of ["gates.sh", "worktree-setup.sh"]) {
    assert.equal(git(amont, "show", `${brancheDuTicket(7)}:.claude/brigade/${script}`), "#!/bin/sh\nexit 0");
    assert.match(git(amont, "ls-tree", brancheDuTicket(7), `.claude/brigade/${script}`), /^100755 /);
  }
});

test("le crochet du cook de setup n'ouvre que Write et Edit d'un fichier sous `.claude/brigade/` de son worktree, liens résolus ; ce qu'il ne lit pas n'ouvre rien (#2888)", { skip: posixOnly("symbolic links") }, async (t) => {
  const worktree = repertoireTemporaire(t);
  const ailleurs = repertoireTemporaire(t);
  mkdirSync(join(worktree, ".claude/brigade"), { recursive: true });
  // Un autre worktree dont `.claude/brigade` mène ailleurs, par un lien.
  const piege = repertoireTemporaire(t);
  mkdirSync(join(piege, ".claude"));
  symlinkSync(ailleurs, join(piege, ".claude/brigade"));
  // Ce que le crochet répond à une demande, son argument tel que la
  // configuration l'écrit — lancés ensemble : chacun est un node.
  const repond = (entree: string, argument = encodeURIComponent(worktree)) =>
    new Promise<string>((resoudre, rejeter) => {
      const enfant = spawn(process.execPath, [CROCHET, argument], { stdio: ["pipe", "pipe", "inherit"] });
      let sortie = "";
      enfant.stdout.setEncoding("utf8").on("data", (morceau: string) => (sortie += morceau));
      enfant.on("error", rejeter).on("close", () => resoudre(sortie));
      enfant.stdin.end(entree);
    });
  const appel = (tool_name: string, file_path: string) => JSON.stringify({ hook_event_name: "PermissionRequest", tool_name, tool_input: { file_path } });
  const PERMIS = JSON.stringify({ hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow" } } });
  const permis = ["Write", "Edit"].flatMap((outil) => [join(worktree, ".claude/brigade/gates.sh"), join(worktree, ".claude/brigade/neuf/reseau")].map((fichier) => appel(outil, fichier)));
  const refuses: Array<[string, string]> = [
    [appel("Read", join(worktree, ".claude/brigade/gates.sh")), encodeURIComponent(worktree)],
    [appel("Write", join(worktree, ".claude/brigade")), encodeURIComponent(worktree)],
    [appel("Write", join(worktree, ".claude/settings.json")), encodeURIComponent(worktree)],
    [appel("Edit", join(worktree, ".claude/brigade/../settings.json")), encodeURIComponent(worktree)],
    [appel("Write", join(worktree, "src/x.ts")), encodeURIComponent(worktree)],
    [appel("Write", ".claude/brigade/gates.sh"), encodeURIComponent(worktree)],
    [appel("Write", join(piege, ".claude/brigade/gates.sh")), encodeURIComponent(piege)],
    ["{ illisible", encodeURIComponent(worktree)],
    ["null", encodeURIComponent(worktree)],
    // Un argument qui ne se décode pas, ou absent : aucun worktree, rien d'ouvert.
    [appel("Write", join(worktree, ".claude/brigade/gates.sh")), "%E0"],
    [appel("Write", join(worktree, ".claude/brigade/gates.sh")), ""],
  ];
  const [reponses, silences] = await Promise.all([Promise.all(permis.map((entree) => repond(entree))), Promise.all(refuses.map(([entree, pour]) => repond(entree, pour)))]);
  permis.forEach((entree, rang) => assert.equal(reponses[rang], PERMIS, entree));
  refuses.forEach(([entree, pour], rang) => assert.equal(silences[rang], "", `${entree} (${pour})`));
});

test("un ticket de setup se reconnaît à la zone qu'il déclare, fiche comprise ; sans zone lisible, aux chemins de son corps (#2888)", () => {
  // La zone de la fiche : tout sous `.claude/brigade/`, quoi que nomme le corps.
  assert.equal(livreSousBrigade(CORPS, [FICHE]), true);
  assert.equal(livreSousBrigade(CORPS, []), false);
  // Une zone qui déborde de `.claude/brigade/` n'en fait pas un.
  assert.equal(livreSousBrigade(CORPS, ["<!-- brigade:fiche -->\n- zone : .claude/brigade/, runtime/src/x.ts"]), false);
  assert.equal(livreSousBrigade("## Zone\n\n- `.claude/brigade/gates.sh`\n", ["<!-- brigade:fiche -->\n- zone : runtime/src/x.ts"]), false);
  // Une fiche illisible ne déclare rien : le corps décide, comme avant.
  assert.equal(livreSousBrigade("Edit `.claude/brigade/gates.sh`.", ["<!-- brigade:fiche -->\n- zone : /absolu"]), true);
  assert.equal(livreSousBrigade(CORPS, ["<!-- brigade:fiche -->\n- zone : /absolu"]), false);
});

test("station-ecriture-brigade.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
