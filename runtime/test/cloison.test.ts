// La cloison : ce que le runtime met autour de ce qu'il lance. Aucun `bwrap`
// ne tourne ici — la doublure note ce qu'on lui demande et cède la place.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { annoncerCloison, configCloison, envelopper } from "../src/cloison.ts";
import { jouerSetup } from "../src/gates.ts";
import { ConfigInvalide, demarrer } from "../src/runtime.ts";
import { issue, cuisine } from "./aides/cuisine.ts";
import { depotGit, ENV_ENFANT, FAUX_BWRAP, git, horloge, jusqua, lancementsDuFauxBwrap, repertoireTemporaire } from "./outils.ts";

// Une machine d'essai : l'état et le clone d'un projet sous une racine que la
// cloison masque, et le compte du service à côté.
function machine(t: TestContext) {
  const racine = repertoireTemporaire(t);
  const lieux = { repertoireEtat: join(racine, "etats/brigade"), clone: join(racine, "etats/brigade/depot") };
  mkdirSync(join(lieux.clone, ".git"), { recursive: true });
  const env = { BRIGADE_SANDBOX_BIN: FAUX_BWRAP, BRIGADE_SANDBOX_HIDDEN: `${join(racine, "etats")}:${join(racine, "secrets")}`, HOME: join(racine, "compte") };
  return { racine, lieux, env, masques: [join(racine, "etats"), join(racine, "secrets")] };
}

const refus = (fn: () => unknown) => {
  try {
    fn();
  } catch (erreur) {
    assert.ok(erreur instanceof ConfigInvalide, String(erreur));
    return erreur.message;
  }
  return assert.fail("aucun refus");
};

// Ce que `bwrap` reçoit, sans le shell qui le rend sourd à SIGTERM.
const demande = (args: string[]) => args.slice(args.indexOf("brigade") + 1);
const paires = (args: string[], option: string) => args.flatMap((arg, i) => (arg === option ? [`${args[i + 1]} → ${args[i + 2]}`] : []));

describe("la cloison", { concurrency: 8 }, () => {
  test("sans binaire, rien n'est cloisonné : le lancement part tel quel", (t) => {
    const { lieux } = machine(t);
    assert.equal(configCloison({ HOME: "/home/brigade" }, lieux), null);
    const lancement = { commande: "claude", args: ["-p", "consigne"] };
    assert.deepEqual(envelopper(null, lancement, { cwd: "/w", depot: "ecriture" }), lancement);
  });

  test("une cloison à moitié posée est un refus de démarrer", (t) => {
    const { lieux, env, racine } = machine(t);
    assert.match(refus(() => configCloison({ ...env, BRIGADE_SANDBOX_BIN: undefined }, lieux)), /BRIGADE_SANDBOX_HIDDEN est défini sans BRIGADE_SANDBOX_BIN/);
    assert.match(refus(() => configCloison({ ...env, BRIGADE_SANDBOX_HIDDEN: "" }, lieux)), /ne masquerait rien/);
    assert.match(refus(() => configCloison({ ...env, BRIGADE_SANDBOX_BIN: "bwrap" }, lieux)), /chemin absolu de `bwrap`/);
    assert.match(refus(() => configCloison({ ...env, BRIGADE_SANDBOX_BIN: join(racine, "absent") }, lieux)), /il doit exister/);
    assert.match(refus(() => configCloison({ ...env, HOME: undefined }, lieux)), /pas HOME/);
    assert.match(refus(() => configCloison({ ...env, BRIGADE_SANDBOX_HIDDEN: "etats" }, lieux)), /n'est pas un chemin absolu/);
  });

  test("une cloison qui masquerait le compte, /tmp ou le système est refusée", (t) => {
    const { lieux, env, racine } = machine(t);
    assert.match(refus(() => configCloison({ ...env, BRIGADE_SANDBOX_HIDDEN: racine }, lieux)), /masquerait le répertoire du compte/);
    assert.match(refus(() => configCloison({ ...env, BRIGADE_SANDBOX_HIDDEN: "/" }, lieux)), /masquerait/);
    assert.match(refus(() => configCloison({ ...env, BRIGADE_SANDBOX_HIDDEN: `${env.BRIGADE_SANDBOX_HIDDEN}:/tmp` }, lieux)), /masquerait \/tmp/);
  });

  test("ce que la cloison doit cacher et qu'elle laisserait dehors est nommé", (t) => {
    const { lieux, env, racine, masques } = machine(t);
    const ailleurs = join(racine, "ailleurs");
    assert.match(refus(() => configCloison(env, { ...lieux, repertoireEtat: ailleurs })), /^BRIGADE_STATE_DIR \(.*ailleurs\) n'est sous aucun répertoire de BRIGADE_SANDBOX_HIDDEN/);
    assert.match(refus(() => configCloison(env, { ...lieux, clone: ailleurs })), /^BRIGADE_REPO_DIR/);
    assert.match(refus(() => configCloison({ ...env, BRIGADE_SECRETS_FILE: join(ailleurs, "secrets.env") }, lieux)), /^BRIGADE_SECRETS_FILE .* un cook le lirait malgré la cloison/);
    assert.match(refus(() => configCloison({ ...env, BRIGADE_GITHUB_APPS_DIR: ailleurs }, lieux)), /^BRIGADE_GITHUB_APPS_DIR/);
    const cloison = configCloison({ ...env, BRIGADE_SECRETS_FILE: join(racine, "secrets/brigade/secrets.env"), BRIGADE_GITHUB_APPS_DIR: join(racine, "secrets/brigade/apps") }, lieux);
    assert.deepEqual(cloison?.masques, masques);
    assert.equal(cloison?.identifiants, join(racine, "compte/.claude/.credentials.json"));
  });

  test("un masque qui est un fichier est refusé au démarrage, pas à chaque lancement", (t) => {
    const { lieux, env, racine } = machine(t);
    writeFileSync(join(racine, "netrc"), "machine exemple.test");
    assert.match(refus(() => configCloison({ ...env, BRIGADE_SANDBOX_HIDDEN: `${env.BRIGADE_SANDBOX_HIDDEN}:${join(racine, "netrc")}` }, lieux)), /netrc » n'est pas un répertoire — masquer celui qui le contient/);
  });

  test("un cook ne retrouve de ce qui est masqué que son worktree, sa vue du `.git` et son ticket", (t) => {
    const { lieux, env, masques } = machine(t);
    const cloison = configCloison(env, lieux);
    const worktree = join(lieux.repertoireEtat, "worktrees/17-abc");
    mkdirSync(worktree, { recursive: true });
    const ticket = join(lieux.repertoireEtat, "runs/17-abc.ticket.md");
    const { commande, args } = envelopper(cloison, { commande: "claude", args: ["-p", "consigne\nsur deux lignes"] }, { cwd: worktree, depot: "ecriture", lit: [ticket] });

    // `bwrap` part sourd à SIGTERM, et la commande retrouve le sien : l'arrêt
    // d'un cook lui laisse sa grâce.
    assert.equal(commande, "/bin/sh");
    assert.deepEqual(args.slice(0, 4), ["-c", 'trap "" TERM; exec "$@"', "brigade", FAUX_BWRAP]);
    const recu = demande(args);
    assert.deepEqual(recu.slice(recu.indexOf("--")), ["--", "env", "--default-signal=TERM", "claude", "-p", "consigne\nsur deux lignes"]);

    assert.ok(recu.includes("--unshare-pid") && recu.includes("--die-with-parent"));
    assert.ok(paires(recu, "--ro-bind").includes("/ → /"));
    assert.ok(paires(recu, "--ro-bind").includes(`${ticket} → ${ticket}`));
    // `secrets` n'existe pas sur cette machine : rien à masquer, et `bwrap` échouerait à le créer.
    assert.deepEqual(recu.flatMap((arg, i) => (arg === "--tmpfs" ? [recu[i + 1]] : [])), [masques[0]]);
    mkdirSync(masques[1] ?? "");
    const plusTard = demande(envelopper(cloison, { commande: "claude", args: [] }, { cwd: worktree, depot: "ecriture" }).args);
    assert.deepEqual(plusTard.flatMap((arg, i) => (arg === "--tmpfs" ? [plusTard[i + 1]] : [])), masques);
    assert.ok(paires(recu, "--bind").includes(`${worktree} → ${worktree}`));
    assert.equal(recu[recu.indexOf("--chdir") + 1], worktree);
    // Un montage recouvre ceux qui le précèdent : ce qui est rendu vient après ce qui est masqué.
    assert.ok(recu.lastIndexOf("--tmpfs") < recu.lastIndexOf(worktree));
  });

  test("le compte est rendu en lecture seule : ce qu'un cook écrit sous ~ va au projet, jamais dans le ~/.gitconfig que lit le runtime", (t) => {
    const { lieux, env, racine } = machine(t);
    const home = join(racine, "compte");
    mkdirSync(join(home, ".claude"), { recursive: true });
    mkdirSync(join(home, ".local/bin"), { recursive: true });
    mkdirSync(join(home, ".npm"));
    writeFileSync(join(home, ".gitconfig"), "[user]\n\tname = brigade\n");
    writeFileSync(join(home, ".claude.json"), '{"numStartups":3}');
    symlinkSync(join(home, "nulle-part"), join(home, "lien-pendant"));
    const cloison = configCloison({ ...env, BRIGADE_SANDBOX_PRIVATE: ".cargo" }, lieux);

    const recu = demande(envelopper(cloison, { commande: "git", args: ["config", "--global", "core.fsmonitor", "/tmp/pirate"] }, { cwd: "/tmp", depot: null }).args);

    const compte = join(lieux.repertoireEtat, "compte");
    // Le seul montage inscriptible à la place du compte est celui du projet…
    assert.deepEqual(paires(recu, "--bind").filter((paire) => paire.endsWith(` → ${home}`) || paire.includes(`${home}/`)), [`${compte} → ${home}`, `${join(lieux.repertoireEtat, "claude")} → ${join(home, ".claude")}`]);
    // … et le vrai lui est rendu entrée par entrée, en lecture seule : sa configuration de git, ses binaires.
    // Sans exiger qu'elle existe encore : un lien pendant, une entrée partie depuis ne font pas mourir `bwrap`.
    assert.equal(paires(recu, "--ro-bind").some((paire) => paire.startsWith(`${home}/`)), false);
    const rendues = paires(recu, "--ro-bind-try").filter((paire) => !paire.includes(".credentials.json"));
    assert.deepEqual(rendues.sort(), [".gitconfig", ".local", "lien-pendant"].map((nom) => `${join(home, nom)} → ${join(home, nom)}`));
    assert.ok(recu.indexOf(compte) < recu.indexOf(join(home, ".gitconfig")));
    // Ses caches et l'état de `claude` sont ceux du projet : ni rendus, ni partagés.
    assert.equal(readFileSync(join(compte, ".claude.json"), "utf8"), '{"numStartups":3}');
    assert.ok(existsSync(join(compte, ".npm")));
    // Les identifiants, eux, restent ceux du compte, en lecture seule.
    assert.ok(paires(recu, "--ro-bind-try").includes(`${join(home, ".claude/.credentials.json")} → ${join(home, ".claude/.credentials.json")}`));
    assert.ok(recu.lastIndexOf(join(home, ".claude/.credentials.json")) > recu.lastIndexOf(join(home, ".gitconfig")));
    assert.equal(readFileSync(join(home, ".gitconfig"), "utf8"), "[user]\n\tname = brigade\n");

    assert.match(refus(() => configCloison({ ...env, BRIGADE_SANDBOX_PRIVATE: ".config/gh" }, lieux)), /BRIGADE_SANDBOX_PRIVATE invalide/);
  });

  test("un lien laissé par un cook à la place d'un fichier du projet ne fait pas écrire le runtime ailleurs", (t) => {
    const { lieux, env, racine } = machine(t);
    const home = join(racine, "compte");
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, ".claude.json"), "{}");
    const cloison = configCloison(env, lieux);
    const compte = join(lieux.repertoireEtat, "compte");
    mkdirSync(compte, { recursive: true });
    const ailleurs = join(racine, "secrets-d-un-autre");
    symlinkSync(ailleurs, join(compte, ".claude.json"));

    envelopper(cloison, { commande: "true", args: [] }, { cwd: "/tmp", depot: null });

    assert.equal(existsSync(ailleurs), false);
  });

  test("`git config` écrit dans la vue du worktree, pas dans la config que lit le `git` du runtime", (t) => {
    const { lieux, env } = machine(t);
    const git = join(lieux.clone, ".git");
    mkdirSync(join(git, "objects"));
    mkdirSync(join(git, "hooks"));
    mkdirSync(join(git, "worktrees"));
    writeFileSync(join(git, "config"), "[core]\n\tbare = false\n");
    writeFileSync(join(git, "HEAD"), "ref: refs/heads/v2\n");
    writeFileSync(join(git, "hooks/pre-commit"), "#!/bin/sh\n");
    const cloison = configCloison(env, lieux);
    const worktree = join(lieux.repertoireEtat, "worktrees/17-abc");
    mkdirSync(worktree, { recursive: true });
    const vue = join(lieux.repertoireEtat, "vues-git", encodeURIComponent(worktree));

    const recu = demande(envelopper(cloison, { commande: "git", args: ["config", "core.hooksPath", ".husky"] }, { cwd: worktree, depot: "ecriture" }).args);

    // À la place du `.git` : la vue, en écriture — `config` y est un vrai fichier, que `git` remplace à sa guise.
    assert.ok(paires(recu, "--bind").includes(`${vue} → ${git}`));
    assert.equal(readFileSync(join(vue, "config"), "utf8"), "[core]\n\tbare = false\n[gc]\n\tauto = 0\n[maintenance]\n\tauto = false\n");
    assert.deepEqual(readdirSync(vue).sort(), ["config", "hooks"]);
    assert.deepEqual(readdirSync(join(vue, "hooks")), []);
    // Ni la vraie config ni les vrais hooks ne sont montés, sous aucune forme.
    assert.equal(recu.includes(join(git, "config")) || recu.includes(join(git, "hooks")), false);
    // Les objets et les worktrees sont les vrais ; un fichier du vrai `.git` est rendu en lecture seule.
    for (const nom of ["objects", "worktrees"]) assert.ok(paires(recu, "--bind").includes(`${join(git, nom)} → ${join(git, nom)}`));
    assert.ok(paires(recu, "--ro-bind").includes(`${join(git, "HEAD")} → ${join(git, "HEAD")}`));
    // `packed-refs` existe avant le lancement, donc monté lui aussi : né dans la vue, il emporterait la branche du cook.
    assert.ok(paires(recu, "--ro-bind").includes(`${join(git, "packed-refs")} → ${join(git, "packed-refs")}`));
    assert.ok(recu.indexOf(vue) < recu.indexOf(join(git, "objects")));

    // Ce que le cook y a écrit tient d'un lancement à l'autre du même worktree — du setup au cook…
    writeFileSync(join(vue, "config"), "[core]\n\thooksPath = .husky\n");
    // … mais pas ce qu'il y aurait laissé d'autre : un lien à la place d'un point de montage.
    symlinkSync("/etc", join(vue, "objects"));
    symlinkSync("/etc", join(vue, "lfs"));
    // Ce que `git` y a posé pour ce worktree, lui, reste.
    writeFileSync(join(vue, "gc.log"), "");
    envelopper(cloison, { commande: "git", args: ["status"] }, { cwd: worktree, depot: "ecriture" });
    assert.equal(readFileSync(join(vue, "config"), "utf8"), "[core]\n\thooksPath = .husky\n");
    assert.deepEqual(readdirSync(vue).sort(), ["config", "gc.log", "hooks"]);
    assert.equal(readFileSync(join(git, "config"), "utf8"), "[core]\n\tbare = false\n[gc]\n\tauto = 0\n[maintenance]\n\tauto = false\n");

    // Le worktree parti, sa vue part au lancement suivant.
    rmSync(worktree, { recursive: true });
    const autre = join(lieux.repertoireEtat, "worktrees/18-def");
    mkdirSync(autre);
    envelopper(cloison, { commande: "git", args: ["status"] }, { cwd: autre, depot: "ecriture" });
    assert.deepEqual(readdirSync(join(lieux.repertoireEtat, "vues-git")), [encodeURIComponent(autre)]);
  });

  test("réenveloppé sur un worktree occupé, le lancement vivant garde ses points de montage", (t) => {
    const { lieux, env } = machine(t);
    const git = join(lieux.clone, ".git");
    for (const nom of ["objects", "refs", "worktrees"]) mkdirSync(join(git, nom));
    writeFileSync(join(git, "HEAD"), "ref: refs/heads/v2\n");
    const cloison = configCloison(env, lieux);
    const worktree = join(lieux.repertoireEtat, "worktrees/17-abc");
    mkdirSync(worktree, { recursive: true });
    const vue = join(lieux.repertoireEtat, "vues-git", encodeURIComponent(worktree));
    const lancer = () => {
      const { commande, args } = envelopper(cloison, { commande: "true", args: [] }, { cwd: worktree, depot: "ecriture" });
      execFileSync(commande, args, { env: { ...ENV_ENFANT, FAUX_BWRAP_MONTE: "1" } });
    };

    // Un premier lancement : `bwrap` pose dans la vue le point de montage de chaque entrée du vrai `.git`.
    lancer();
    const points = ["HEAD", "objects", "packed-refs", "refs", "worktrees"];
    assert.deepEqual(readdirSync(vue).sort(), ["hooks", ...points].sort());
    // Tant qu'il vit, chacun porte son montage : retiré d'ici, il s'en détacherait là-bas.
    const tenus = () => points.map((nom) => lstatSync(join(vue, nom), { throwIfNoEntry: false })?.ino);
    const avant = tenus();

    envelopper(cloison, { commande: "claude", args: [] }, { cwd: worktree, depot: "lecture" });
    lancer();

    assert.deepEqual(tenus(), avant);

    // Ce qui ne peut pas porter le montage n'est celui d'aucun lancement vivant, et part toujours.
    rmSync(join(vue, "objects"), { recursive: true });
    writeFileSync(join(vue, "objects"), "");
    rmSync(join(vue, "HEAD"));
    mkdirSync(join(vue, "HEAD"));
    envelopper(cloison, { commande: "git", args: ["status"] }, { cwd: worktree, depot: "ecriture" });
    assert.deepEqual(readdirSync(vue).sort(), ["hooks", "packed-refs", "refs", "worktrees"]);
  });

  test("le clone servi ne range jamais ses références seul : ni le `git` du runtime, ni celui du cook ne déplacent la branche d'un cook vivant", (t) => {
    const { clone } = depotGit(t);
    const racine = repertoireTemporaire(t);
    const etat = join(racine, "etat");
    const cloison = configCloison({ BRIGADE_SANDBOX_BIN: FAUX_BWRAP, BRIGADE_SANDBOX_HIDDEN: `${etat}:${clone}`, HOME: join(racine, "compte") }, { repertoireEtat: etat, clone });
    const worktree = join(etat, "worktrees/17-abc");
    mkdirSync(worktree, { recursive: true });
    const regle = (fichier: string, cle: string) => execFileSync("git", ["config", "--file", fichier, "--get", cle], { encoding: "utf8" }).trim();
    assert.throws(() => regle(join(clone, ".git/config"), "gc.auto"));

    envelopper(cloison, { commande: "git", args: ["status"] }, { cwd: worktree, depot: "ecriture" });

    // Dans la vraie config : c'est elle que lit le `git fetch` du runtime, qui lancerait sinon `gc --auto` — donc `pack-refs`.
    assert.equal(regle(join(clone, ".git/config"), "gc.auto"), "0");
    assert.equal(regle(join(clone, ".git/config"), "maintenance.auto"), "false");
    // Et dans la vue, copiée d'elle : le cook non plus.
    assert.equal(regle(join(etat, "vues-git", encodeURIComponent(worktree), "config"), "gc.auto"), "0");
    // Un vrai `git` en convient : même au-delà de tout seuil, il ne range rien.
    for (let i = 0; i < 3; i++) git(clone, "update-ref", `refs/heads/cook/${i}`, "HEAD");
    git(clone, "gc", "--auto");
    assert.equal(readFileSync(join(clone, ".git/packed-refs"), "utf8"), "");
    assert.ok(existsSync(join(clone, ".git/refs/heads/cook/0")));
  });

  test("le reviewer relit en lecture seule, et un juge ne retrouve rien du dépôt", (t) => {
    const { lieux, env } = machine(t);
    const cloison = configCloison(env, lieux);
    const worktree = join(lieux.repertoireEtat, "worktrees/.essais/pass");
    mkdirSync(worktree, { recursive: true });
    const git = join(lieux.clone, ".git");
    mkdirSync(join(git, "objects"));

    const relecture = demande(envelopper(cloison, { commande: "claude", args: [] }, { cwd: worktree, depot: "lecture" }).args);
    for (const chemin of [join(git, "objects"), worktree]) assert.ok(paires(relecture, "--ro-bind").includes(`${chemin} → ${chemin}`));
    // Sa vue du `.git` repasse en lecture seule une fois ses points de montage posés.
    assert.equal(relecture[relecture.indexOf("--remount-ro") + 1], git);
    assert.ok(relecture.indexOf("--remount-ro") > relecture.lastIndexOf(join(git, "objects")));
    assert.deepEqual(paires(relecture, "--bind").filter((paire) => paire.includes("worktrees") || paire.includes("depot")), [`${join(lieux.repertoireEtat, "vues-git", encodeURIComponent(worktree))} → ${git}`]);

    const jugement = demande(envelopper(cloison, { commande: "claude", args: [] }, { cwd: "/tmp", depot: null }).args);
    assert.equal(jugement.some((arg) => arg.startsWith(git) || arg.includes("vues-git")), false);
  });

  test("le setup d'un worktree part dans la cloison, et ses exports reviennent par le canal", async (t) => {
    const { lieux, env } = machine(t);
    const temoin = repertoireTemporaire(t);
    const worktree = join(lieux.repertoireEtat, "worktrees/17-abc");
    mkdirSync(join(worktree, ".claude/brigade"), { recursive: true });
    writeFileSync(join(worktree, ".claude/brigade/worktree-setup.sh"), '#!/usr/bin/env bash\necho "export BASE_DE_TEST=ticket_$1"\n');
    chmodSync(join(worktree, ".claude/brigade/worktree-setup.sh"), 0o755);

    const setup = await jouerSetup({ worktree, ticket: 17, env: { ...ENV_ENFANT, FAUX_BWRAP_TEMOIN: temoin }, delaiMs: 60_000, cloison: configCloison(env, lieux) });

    assert.equal(setup.pret && setup.env.BASE_DE_TEST, "ticket_17");
    const [recu = []] = lancementsDuFauxBwrap(temoin);
    assert.ok(paires(recu, "--bind").includes(`${worktree} → ${worktree}`));
    assert.equal(recu[recu.indexOf("--") + 3], "bash");
  });

  test("dans une cuisine, le setup, le cook, les gates et le reviewer partent chacun dans la cloison", async (t) => {
    const { cloisonnes, lancements, relectures, repertoire } = cuisine(t, { cloison: true, setup: "exporte", pass: true, issues: [issue(15)] });
    await jusqua(() => relectures().length === 1);

    // Ni le cook ni le reviewer ne savent qu'ils sont cloisonnés : même commande, mêmes arguments.
    assert.equal(lancements()[0]?.args[0], "-p");
    const commandes = cloisonnes().map((recu) => ({ commande: recu[recu.indexOf("--") + 3]?.split("/").at(-1), ecrit: paires(recu, "--bind").some((paire) => paire.includes("/worktrees/") && paire.split(" → ")[0] === paire.split(" → ")[1]) }));
    const combien = (commande: string, ecrit: boolean) => commandes.filter((lance) => lance.commande === commande && lance.ecrit === ecrit).length;
    // Le setup du cook, puis celui des gates et les gates : trois scripts, tous en écriture.
    assert.equal(combien("bash", true), 3);
    assert.equal(combien("faux-claude.sh", true), 1);
    assert.equal(combien("faux-claude.sh", false), 1);
    for (const recu of cloisonnes()) assert.ok(recu.includes(repertoire) && recu[recu.indexOf(repertoire) - 1] === "--tmpfs");
  });

  test("l'état de la cloison entre au journal quand il change, et pas à chaque démarrage", (t) => {
    const repertoireEtat = repertoireTemporaire(t);
    const runtime = demarrer({ repertoireEtat, projet: "brigade", maintenant: horloge() });
    t.after(() => runtime.arreter("test"));
    const ouverte = { sandbox: null, proxy: null };
    const posee = { sandbox: { bin: "/usr/bin/bwrap", hidden: ["/var/lib/brigade"], credentials: "/home/brigade/.claude/.credentials.json" }, proxy: { port: 18443, enforced: true } };

    annoncerCloison(runtime, ouverte);
    annoncerCloison(runtime, ouverte);
    annoncerCloison(runtime, posee);
    annoncerCloison(runtime, posee);

    assert.deepEqual(runtime.journal.duType("isolation.configured", 10).map((evenement) => evenement.payload), [ouverte, posee]);
  });
});
