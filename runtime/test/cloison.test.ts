// La cloison : ce que le runtime met autour de ce qu'il lance. Aucun `bwrap`
// ne tourne ici — la doublure note ce qu'on lui demande et cède la place.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { annoncerCloison, configCloison, envelopper } from "../src/cloison.ts";
import { jouerSetup } from "../src/gates.ts";
import { ConfigInvalide, demarrer } from "../src/runtime.ts";
import { issue, cuisine } from "./aides/cuisine.ts";
import { ENV_ENFANT, FAUX_BWRAP, horloge, jusqua, lancementsDuFauxBwrap, repertoireTemporaire } from "./outils.ts";

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

  test("un cook ne retrouve de ce qui est masqué que son worktree, le `.git` du clone sans sa config ni ses hooks, et son ticket", (t) => {
    const { lieux, env, racine, masques } = machine(t);
    const cloison = configCloison(env, lieux);
    const worktree = join(lieux.repertoireEtat, "worktrees/17-abc");
    const ticket = join(lieux.repertoireEtat, "runs/17-abc.ticket.md");
    const { commande, args } = envelopper(cloison, { commande: "claude", args: ["-p", "consigne\nsur deux lignes"] }, { cwd: worktree, depot: "ecriture", lit: [ticket] });

    // `bwrap` part sourd à SIGTERM, et la commande retrouve le sien : l'arrêt
    // d'un cook lui laisse sa grâce.
    assert.equal(commande, "/bin/sh");
    assert.deepEqual(args.slice(0, 4), ["-c", 'trap "" TERM; exec "$@"', "brigade", FAUX_BWRAP]);
    const recu = demande(args);
    assert.deepEqual(recu.slice(recu.indexOf("--")), ["--", "env", "--default-signal=TERM", "claude", "-p", "consigne\nsur deux lignes"]);

    const home = join(racine, "compte");
    const git = join(lieux.clone, ".git");
    assert.ok(recu.includes("--unshare-pid") && recu.includes("--die-with-parent"));
    assert.deepEqual(paires(recu, "--ro-bind"), ["/ → /", `${ticket} → ${ticket}`]);
    // `secrets` n'existe pas sur cette machine : rien à masquer, et `bwrap` échouerait à le créer.
    assert.deepEqual(recu.flatMap((arg, i) => (arg === "--tmpfs" ? [recu[i + 1]] : [])), [masques[0]]);
    mkdirSync(masques[1] ?? "");
    const plusTard = demande(envelopper(cloison, { commande: "claude", args: [] }, { cwd: worktree, depot: "ecriture" }).args);
    assert.deepEqual(plusTard.flatMap((arg, i) => (arg === "--tmpfs" ? [plusTard[i + 1]] : [])), masques);
    assert.deepEqual(paires(recu, "--bind"), ["/tmp → /tmp", `${home} → ${home}`, `${join(lieux.repertoireEtat, "claude")} → ${join(home, ".claude")}`, `${git} → ${git}`, `${worktree} → ${worktree}`]);
    assert.deepEqual(paires(recu, "--ro-bind-try"), [join(home, ".claude/.credentials.json"), join(git, "config"), join(git, "hooks")].map((chemin) => `${chemin} → ${chemin}`));
    // Un montage recouvre ceux qui le précèdent : ce qui est rendu vient après ce qui est masqué.
    assert.ok(recu.lastIndexOf("--tmpfs") < recu.indexOf(git));
    assert.equal(recu[recu.indexOf("--chdir") + 1], worktree);
    // Le `~/.claude` du projet existe avant d'être monté.
    assert.ok(existsSync(join(lieux.repertoireEtat, "claude")));
  });

  test("le reviewer relit en lecture seule, et un juge ne retrouve rien", (t) => {
    const { lieux, env } = machine(t);
    const cloison = configCloison(env, lieux);
    const worktree = join(lieux.repertoireEtat, "worktrees/.essais/pass");
    const git = join(lieux.clone, ".git");

    const relecture = demande(envelopper(cloison, { commande: "claude", args: [] }, { cwd: worktree, depot: "lecture" }).args);
    assert.deepEqual(paires(relecture, "--ro-bind"), ["/ → /", `${git} → ${git}`, `${worktree} → ${worktree}`]);
    assert.equal(paires(relecture, "--bind").some((paire) => paire.includes("worktrees") || paire.includes("depot")), false);

    const jugement = demande(envelopper(cloison, { commande: "claude", args: [] }, { cwd: "/tmp", depot: null }).args);
    assert.deepEqual(paires(jugement, "--ro-bind"), ["/ → /"]);
    assert.equal(jugement.includes(git), false);
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
    const commandes = cloisonnes().map((recu) => ({ commande: recu[recu.indexOf("--") + 3]?.split("/").at(-1), ecrit: paires(recu, "--bind").some((paire) => paire.includes("worktrees")) }));
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
