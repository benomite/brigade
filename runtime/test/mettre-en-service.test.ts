// La mise en service côté runtime : le chef la demande, le runtime tient la
// demande et lance le geste de box — une doublure de `sudo`, ici — le rail
// calme, ou sans attendre sur demande explicite.
//
// Deux cuisines. La première n'a que le journal et le runtime : un cook « en
// vol » y est un fait qu'un test écrit et clôt à la main, à l'instant qu'il
// choisit. La seconde est la cuisine entière, avec de vrais lancements : c'est
// là que se prouve qu'aucun cook n'est interrompu ni lancé sous une demande.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { decrireEtat, lireEtat } from "../src/etat.ts";
import type { Fait } from "../src/evenements.ts";
import { GESTE_DE_BOX } from "../src/evenements/mise-en-service.ts";
import { ouvrirJournal, type Journal } from "../src/journal.ts";
import { brancherMiseEnService, JOURNAL_DU_GESTE } from "../src/mettre-en-service.ts";
import { principal as commande } from "../src/mettre-en-service-cli.ts";
import { PROJECTIONS } from "../src/projections.ts";
import { demandeDeMiseEnService } from "../src/projections/mise-en-service.ts";
import { demarrer, type Runtime } from "../src/runtime.ts";
import { cuisine, issue, montre, PLAFONDS, STATION } from "./aides/cuisine.ts";
import { aArreter, appeler, BASE, DEPOT, ENV_GIT, FAUX_CLAUDE, fauxGh, git, jusqua, lancer, photographier, repertoireTemporaire, vivant } from "./outils.ts";

const FAUX_SUDO = join(import.meta.dirname, "aides/faux-sudo.sh");
const PROJET = "brigade";
// Ce que le runtime lance, argument par argument — et rien d'autre.
const ARGUMENTS = ["-n", "--", "/usr/local/bin/brigade-mise-en-service", PROJET];
const [SERVIE, TETE] = ["a".repeat(40), "b".repeat(40)];
const EN_ATTENTE: Fait = { type: "version.compared", payload: { outcome: "waiting", served: SERVIE, branch: "origin/v2", head: TETE, since: "2026-10-08T08:21:07.000Z", deliveries: 26 } };
const nombre = (valeur: number) => valeur.toLocaleString("fr-FR");

// La doublure de `sudo`, liée sous un `bin` que le test met en tête du `PATH`
// du runtime : ce qu'elle a reçu à chaque lancement, et le scénario qu'elle joue.
function fauxSudo(t: TestContext, scenario = "rend 0") {
  const racine = repertoireTemporaire(t);
  for (const repertoire of ["bin", "temoin"]) mkdirSync(join(racine, repertoire));
  symlinkSync(FAUX_SUDO, join(racine, "bin/sudo"));
  const regler = (joue: string) => writeFileSync(join(racine, "scenario"), `${joue}\n`);
  regler(scenario);
  const pids = () => (existsSync(join(racine, "temoin/ordre")) ? readFileSync(join(racine, "temoin/ordre"), "utf8").split("\n").slice(0, -1) : []);
  const liberer = () => writeFileSync(join(racine, "feu"), "");
  return {
    env: { PATH: `${join(racine, "bin")}:${process.env.PATH ?? ""}` },
    regler,
    // Une doublure qui attend encore ne survit pas au test. À jouer une fois le
    // runtime arrêté : il n'a plus rien à écrire de ce qu'elle rend.
    finir() {
      liberer();
      for (const pid of pids()) {
        try {
          process.kill(Number(pid), "SIGKILL");
        } catch {
          // Déjà sortie.
        }
      }
    },
    // Laisse finir une doublure qui joue « attend ».
    liberer,
    // Chaque lancement, dans l'ordre : son pid, qui l'a lancé, son groupe de
    // process, ses arguments, les noms de ce qu'il a reçu d'environnement.
    lancements: () =>
      pids().map((pid) => {
        const [parent = "", groupe = "", combien = "0", ...suite] = readFileSync(join(racine, "temoin", pid), "utf8").split("\0").slice(0, -1);
        return { pid: Number(pid), parent: Number(parent), groupe: Number(groupe), args: suite.slice(0, Number(combien)), env: suite.slice(Number(combien)).map((affectation) => affectation.split("=", 1)[0] ?? "") };
      }),
  };
}

// Ce que le journal garde de la mise en service, dans l'ordre.
const gestes = (journal: Journal) => journal.tout().flatMap((evenement) => (evenement.type.startsWith("deploy.") ? [evenement] : []));
const typesDeGestes = (journal: Journal) => gestes(journal).map(({ type }) => type);

// Laisse passer des ticks du runtime : à chacun, il regarde sa demande. Un fait
// — des battements écrits —, pas une durée.
async function ticks(journal: Journal, combien = 3): Promise<void> {
  const battements = () => journal.base.lire<{ n: number }>("SELECT count(*) AS n FROM events WHERE type = 'runtime.ticked'")[0]?.n ?? 0;
  const avant = battements();
  await jusqua(() => battements() >= avant + combien);
}

// La ligne `version` du bloc `attend` de `status`, telle que le chef la lit.
function file(journal: Journal, maintenant: Date): string {
  return decrireEtat(lireEtat(journal, maintenant), maintenant).find((ligne) => ligne.startsWith("  version  ")) ?? "";
}

// Un runtime qui ne tient que le journal et la mise en service.
function service(t: TestContext, scenario?: string) {
  const repertoire = repertoireTemporaire(t);
  const sudo = fauxSudo(t, scenario);
  const heure = montre();
  const socle = demarrer({ repertoireEtat: repertoire, projet: PROJET, intervalleVeilleMs: 5, intervalleTickMs: 20, maintenant: heure.maintenant });
  const runtime = brancherMiseEnService(socle, { repertoireEtat: repertoire, env: sudo.env });
  aArreter(t, () => {
    runtime.arreter("test");
    sudo.finir();
  });
  const { journal } = runtime;
  const noter = (fait: Fait, ticket: number | null = null) => journal.ajouter({ project: PROJET, ticket, author: "runtime", ...fait });
  return {
    repertoire,
    sudo,
    runtime,
    journal,
    noter,
    // Un cook part, et son relevé dit ce qu'il a déjà dépensé — ou rien encore.
    decoller(ticket: number | null, run: string, tokens: number | null, station = STATION) {
      noter({ type: "cook.launched", payload: { run, limits: PLAFONDS, stream: `runs/${run}.jsonl`, station } }, ticket);
      if (tokens !== null) noter({ type: "cook.progressed", payload: { run, turns: 12, tokens } }, ticket);
    },
    atterrir: (ticket: number | null, run: string) => noter({ type: "cook.exited", payload: { run, outcome: "ok", code: 0, signal: null, turns: 12, tokens: 1, durationMs: 1000 } }, ticket),
    chef: (...args: string[]) => appeler(commande, args, { BRIGADE_STATE_DIR: repertoire }),
    file: () => file(journal, heure.maintenant()),
  };
}

test("rien à mettre en service : la version en service est celle de sa branche, la commande le dit et ne demande rien — et rien ne dit qu'une version attend tant que rien n'est comparé", async (t) => {
  const { sudo, journal, noter, chef } = service(t);

  // Le runtime n'a encore rien comparé : rien n'est dit « en attente ».
  let demande = chef();
  assert.equal(await demande.fin, 1);
  assert.match(demande.sortie(), /^brigade : rien ne dit qu'une version attend : le runtime en marche n'a rien comparé à son origine — rien n'est demandé, rien n'est redémarré/m);

  noter({ type: "version.compared", payload: { outcome: "current", served: SERVIE, branch: "origin/v2" } });
  demande = chef();
  assert.equal(await demande.fin, 0);
  assert.match(demande.sortie(), new RegExp(`^version    à jour — en service : ${"a".repeat(12)}, celle de origin/v2$`, "m"));
  assert.match(demande.sortie(), new RegExp(`^brigade : rien à mettre en service : la version en service \\(${"a".repeat(12)}\\) est celle de origin/v2 — rien n'est demandé, rien n'est redémarré$`, "m"));
  // Même en demandant de couper.
  assert.equal(await chef("--couper").fin, 0);

  noter({ type: "version.compared", payload: { outcome: "unreadable", served: SERVIE, branch: "origin/v2", reason: "l'origine n'a pas rendu origin/v2" } });
  demande = chef();
  assert.equal(await demande.fin, 1);
  assert.match(demande.sortie(), /rien ne dit qu'une version attend : la version en service \(a{12}\) n'a pas pu être comparée à origin\/v2 \(l'origine n'a pas rendu origin\/v2\) — rien n'est demandé, rien n'est redémarré/);

  await ticks(journal);
  assert.deepEqual(typesDeGestes(journal), []);
  assert.deepEqual(sudo.lancements(), []);
});

test("rail calme : la commande dit qu'aucun cook n'est en vol, et le runtime lance le geste de box — `sudo -n /usr/local/bin/brigade-mise-en-service <projet>`, sans shell, sans rien de son environnement —, une seule fois", async (t) => {
  const { repertoire, sudo, journal, noter, chef, file } = service(t, "attend");
  noter(EN_ATTENTE);
  // Avant toute demande, la file nomme le geste.
  assert.match(file(), /— à mettre en service : `run mise-en-service`, qui dit d'abord ce qui est en vol et ce que ça a coûté, puis attend le rail calme sans interrompre aucun cook — ou `run mise-en-service -- --couper`, sans attendre : les cooks en vol sont interrompus/);

  const demande = chef();
  assert.equal(await demande.fin, 0);
  assert.deepEqual(demande.sortie().split("\n").slice(0, 3), [
    `version    origin/v2 (${"b".repeat(12)}) attend — en service : ${"a".repeat(12)}, 26 livraisons non en service depuis le 2026-10-08T08:21:07.000Z`,
    "en vol     aucun cook — le rail est calme",
    `brigade : mise en service demandée — le rail est calme : le runtime lance le geste de box (\`sudo -n -- /usr/local/bin/brigade-mise-en-service brigade\`) à son prochain réveil, dans la seconde, et il sera redémarré sur ${"b".repeat(12)}`,
  ]);

  await jusqua(() => sudo.lancements().length === 1);
  const [lance] = sudo.lancements();
  // La commande exacte : chaque argument tel quel, le geste par son chemin entier.
  assert.deepEqual(lance?.args, ARGUMENTS);
  assert.equal(GESTE_DE_BOX, "/usr/local/bin/brigade-mise-en-service");
  // Lancé par le runtime lui-même : aucun shell entre les deux.
  assert.equal(lance?.parent, process.pid);
  // Dans son propre groupe de process : un signal adressé à celui du runtime ne l'atteint pas.
  assert.equal(lance?.groupe, lance?.pid);
  // Rien de l'environnement du runtime ne passe : son `PATH`, et la langue de `sudo`.
  assert.deepEqual(lance?.env.filter((nom) => !["PWD", "SHLVL", "_", "OLDPWD"].includes(nom)).sort(), ["LC_ALL", "PATH"]);
  assert.deepEqual(gestes(journal).map(({ type, author, payload }) => ({ type, author, payload })), [
    { type: "deploy.requested", author: "chef", payload: { cut: false } },
    { type: "deploy.launched", author: "runtime", payload: { command: ["sudo", ...ARGUMENTS], flying: [], log: JOURNAL_DU_GESTE } },
  ]);
  assert.match(file(), /— mise en service lancée le 2026-10-08T10:00:00\.000Z : le geste de box tourne \(`sudo -n -- \/usr\/local\/bin\/brigade-mise-en-service brigade`\), le runtime va être redémarré ; aucun cook ne part d'ici là$/);

  // Une fois : ni les ticks suivants ni une demande de plus ne le relancent.
  await ticks(journal);
  for (const encore of [chef(), chef("--couper")]) {
    assert.equal(await encore.fin, 0);
    assert.match(encore.sortie(), /^brigade : déjà lancée — mise en service lancée le /m);
  }
  const refus = chef("annuler");
  assert.equal(await refus.fin, 1);
  assert.match(refus.sortie(), /le geste de box est parti le 2026-10-08T10:00:00\.000Z : il ne se rappelle pas/);
  await ticks(journal);
  assert.equal(sudo.lancements().length, 1);
  assert.deepEqual(typesDeGestes(journal), ["deploy.requested", "deploy.launched"]);

  // Ce que le geste écrit va dans un fichier de l'état, pas dans un tube qui
  // mourrait avec le runtime.
  sudo.liberer();
  await jusqua(() => typesDeGestes(journal).includes("deploy.exited"));
  assert.deepEqual(gestes(journal).at(-1)?.payload, { code: 0, signal: null, tail: "faux sudo : le geste tourne\nfaux sudo : le geste a fini" });
  assert.equal(readFileSync(join(repertoire, JOURNAL_DU_GESTE), "utf8"), "faux sudo : le geste tourne\nfaux sudo : le geste a fini\n");
});

test("des cooks en vol : la commande dit d'abord lesquels — ticket, projet, station — et ce que chacun a déjà dépensé, et en tout ; le geste attend le rail calme, la file le dit, et il part seul, une fois, quand plus aucun n'est en vol", async (t) => {
  const { sudo, journal, noter, decoller, atterrir, chef, file } = service(t);
  noter(EN_ATTENTE);
  noter({ type: "ticket.arrived", payload: { title: "Le relevé des tokens", priority: 1, createdAt: "2026-10-01T00:00:12Z", url: "https://exemple.test/12" } }, 12);
  decoller(12, "12-aaaa", 230_000);
  decoller(14, "14-bbbb", 220_775);
  // Un jugement du manager est en vol lui aussi, et n'a pas encore de relevé.
  decoller(null, "sans-ticket-cccc", null, "manager");

  const demande = chef();
  assert.equal(await demande.fin, 0);
  const lignes = demande.sortie().split("\n");
  assert.equal(lignes[1], `en vol     3 cooks — ${nombre(450_775)} tokens déjà dépensés en tout`);
  assert.match(lignes[2] ?? "", new RegExp(`^  #12  brigade  box/claude  ${nombre(230_000)} tokens déjà dépensés \\(relevé il y a .+\\)  en vol depuis .+  Le relevé des tokens$`));
  assert.match(lignes[3] ?? "", new RegExp(`^  #14  brigade  box/claude  ${nombre(220_775)} tokens déjà dépensés \\(relevé il y a .+\\)  en vol depuis [^ ]+ [^ ]+$`));
  assert.match(lignes[4] ?? "", /^  manager  brigade  manager  tokens : pas encore de relevé  en vol depuis /);
  // La liste précède tout ce que la commande dit de la demande.
  assert.deepEqual(lignes.slice(5, 7), [
    "brigade : mise en service demandée — elle attend le rail calme : aucun cook n'est interrompu, aucun autre ne part, et le runtime lance le geste de box (`sudo -n -- /usr/local/bin/brigade-mise-en-service brigade`) seul, une fois, dès que plus aucun n'est en vol",
    "          pour ne plus attendre : `run mise-en-service -- --couper` — les cooks en vol sont interrompus ; pour y renoncer : `run mise-en-service -- annuler`",
  ]);

  // Rien ne part tant qu'un cook est en vol, et la file dit ce qui est attendu.
  await ticks(journal);
  assert.deepEqual(sudo.lancements(), []);
  assert.deepEqual(typesDeGestes(journal), ["deploy.requested"]);
  // L'instant de la demande est celui du process du chef, pas de la montre du test.
  const [debut = "", suite = ""] = file().split(/ — mise en service demandée le \S+, /);
  assert.match(debut, /; 26 livraisons non en service$/);
  assert.equal(
    suite,
    `elle attend le rail calme : 3 cooks en vol (#12, #14, manager — ${nombre(450_775)} tokens déjà dépensés, 1 sans relevé encore), aucun n'est interrompu et aucun autre ne part ; le geste de box part seul, une fois, dès que plus aucun n'est en vol — pour ne plus attendre : \`run mise-en-service -- --couper\` ; pour y renoncer : \`run mise-en-service -- annuler\``,
  );
  // Redemandée, elle n'est pas écrite deux fois.
  const redite = chef();
  assert.equal(await redite.fin, 0);
  assert.match(redite.sortie(), /^brigade : déjà demandée — mise en service demandée le \S+, elle attend le rail calme/m);

  atterrir(12, "12-aaaa");
  atterrir(null, "sans-ticket-cccc");
  await ticks(journal);
  assert.deepEqual(sudo.lancements(), []);

  // Le dernier atterri, le geste part sans que le chef y revienne.
  atterrir(14, "14-bbbb");
  await jusqua(() => sudo.lancements().length === 1);
  assert.deepEqual(sudo.lancements()[0]?.args, ARGUMENTS);
  await jusqua(() => typesDeGestes(journal).includes("deploy.exited"));
  await ticks(journal);
  assert.equal(sudo.lancements().length, 1);
  assert.deepEqual(typesDeGestes(journal), ["deploy.requested", "deploy.launched", "deploy.exited"]);
  assert.deepEqual(gestes(journal)[1]?.payload, { command: ["sudo", ...ARGUMENTS], flying: [], log: JOURNAL_DU_GESTE });
});

test("couper est une demande à part : sans `--couper`, le geste attend ; avec, il part sans attendre, et le journal garde les cooks qui étaient en vol et ce qu'ils avaient dépensé", async (t) => {
  const { sudo, journal, noter, decoller, chef, file } = service(t, "attend");
  noter(EN_ATTENTE);
  decoller(12, "12-aaaa", 230_000);
  decoller(14, "14-bbbb", 220_775);

  assert.equal(await chef().fin, 0);
  await ticks(journal, 6);
  assert.deepEqual(sudo.lancements(), []);

  const coupe = chef("--couper");
  assert.equal(await coupe.fin, 0);
  assert.deepEqual(coupe.sortie().split("\n").slice(4, 6), [
    "brigade : mise en service demandée, sans attendre le rail calme (`--couper`) : le runtime lance le geste de box (`sudo -n -- /usr/local/bin/brigade-mise-en-service brigade`) à son prochain réveil, dans la seconde",
    `          2 cooks en vol (#12, #14 — ${nombre(450_775)} tokens déjà dépensés) : interrompus par le redémarrage, leurs tickets repris par des cooks neufs`,
  ]);
  await jusqua(() => sudo.lancements().length === 1);
  assert.deepEqual(sudo.lancements()[0]?.args, ARGUMENTS);
  assert.deepEqual(gestes(journal).map(({ type, payload }) => ({ type, payload })), [
    { type: "deploy.requested", payload: { cut: false } },
    { type: "deploy.requested", payload: { cut: true } },
    {
      type: "deploy.launched",
      payload: { command: ["sudo", ...ARGUMENTS], flying: [{ run: "12-aaaa", ticket: 12, tokens: 230_000 }, { run: "14-bbbb", ticket: 14, tokens: 220_775 }], log: JOURNAL_DU_GESTE },
    },
  ]);
  assert.match(file(), /— mise en service lancée le /);
  await ticks(journal);
  assert.equal(sudo.lancements().length, 1);
});

test("demandée d'emblée avec `--couper`, la mise en service part sans attendre ; la file dit ce qui sera interrompu tant que le runtime ne l'a pas lancée", async (t) => {
  const { sudo, journal, noter, decoller, chef } = service(t);
  noter(EN_ATTENTE);
  decoller(12, "12-aaaa", 230_000);
  assert.equal(await chef("--couper").fin, 0);
  await jusqua(() => sudo.lancements().length === 1);
  assert.deepEqual(gestes(journal).slice(0, 2).map(({ type, payload }) => ({ type, payload })), [
    { type: "deploy.requested", payload: { cut: true } },
    { type: "deploy.launched", payload: { command: ["sudo", ...ARGUMENTS], flying: [{ run: "12-aaaa", ticket: 12, tokens: 230_000 }], log: JOURNAL_DU_GESTE } },
  ]);
});

test("annuler retire une demande qui attend : rien n'est lancé, même le rail redevenu calme", async (t) => {
  const { sudo, journal, noter, decoller, atterrir, chef, file } = service(t);
  noter(EN_ATTENTE);
  decoller(12, "12-aaaa", 230_000);
  // Rien à annuler : la commande le dit, sans rien écrire.
  let annulee = chef("annuler");
  assert.equal(await annulee.fin, 0);
  assert.match(annulee.sortie(), /^brigade : aucune mise en service n'est demandée : rien à annuler$/m);

  assert.equal(await chef().fin, 0);
  annulee = chef("annuler");
  assert.equal(await annulee.fin, 0);
  assert.match(annulee.sortie(), /^brigade : demande de mise en service du \S+ retirée : rien n'a été lancé, aucun cook n'a été interrompu, et la cuisine reprend ses tickets$/m);
  assert.deepEqual(gestes(journal).map(({ type, author, payload }) => ({ type, author, payload })), [
    { type: "deploy.requested", author: "chef", payload: { cut: false } },
    { type: "deploy.cancelled", author: "chef", payload: { reason: "chef" } },
  ]);
  assert.equal(demandeDeMiseEnService(journal.base), null);
  assert.match(file(), /— à mettre en service : `run mise-en-service`/);

  atterrir(12, "12-aaaa");
  await ticks(journal, 6);
  assert.deepEqual(sudo.lancements(), []);
});

test("une demande qui attendait s'éteint seule si la version est dite à jour avant que le rail soit calme : rien n'est lancé", async (t) => {
  const { sudo, journal, noter, decoller, atterrir, chef } = service(t);
  noter(EN_ATTENTE);
  decoller(12, "12-aaaa", 230_000);
  assert.equal(await chef().fin, 0);
  noter({ type: "version.compared", payload: { outcome: "current", served: SERVIE, branch: "origin/v2" } });
  await jusqua(() => typesDeGestes(journal).includes("deploy.cancelled"));
  assert.deepEqual(gestes(journal).at(-1)?.payload, { reason: "current" });
  atterrir(12, "12-aaaa");
  await ticks(journal, 6);
  assert.deepEqual(sudo.lancements(), []);
});

test("le geste de box rend la main sans rien redémarrer — `sudo` le refuse : la file le dit avec ses mots, il n'est pas relancé, et une demande de plus le relance une fois", async (t) => {
  const { sudo, journal, noter, chef, file } = service(t, "rend 1 sudo: a password is required");
  noter(EN_ATTENTE);
  assert.equal(await chef().fin, 0);
  await jusqua(() => typesDeGestes(journal).includes("deploy.exited"));
  assert.deepEqual(gestes(journal).at(-1)?.payload, { code: 1, signal: null, tail: "faux sudo : une première ligne\nsudo: a password is required" });
  assert.equal(demandeDeMiseEnService(journal.base), null);
  assert.ok(
    file().endsWith(
      "— la mise en service lancée le 2026-10-08T10:00:00.000Z n'a rien redémarré : le geste de box a rendu 1 le 2026-10-08T10:00:00.000Z — « sudo: a password is required » — à redemander : `run mise-en-service` ; ou à la main : `sudo brigade-mise-en-service brigade`",
    ),
    file(),
  );
  const vue = chef("voir");
  assert.equal(await vue.fin, 0);
  assert.match(vue.sortie(), /^demande    la mise en service lancée le .* n'a rien redémarré : le geste de box a rendu 1 /m);

  await ticks(journal, 6);
  assert.equal(sudo.lancements().length, 1);

  assert.equal(await chef().fin, 0);
  await jusqua(() => sudo.lancements().length === 2);
  await jusqua(() => typesDeGestes(journal).filter((type) => type === "deploy.exited").length === 2);
  await ticks(journal);
  assert.equal(sudo.lancements().length, 2);
});

test("sans `sudo` sur la machine, le geste n'est pas lancé : c'est écrit, et la demande ne reste pas « lancée »", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const socle = demarrer({ repertoireEtat: repertoire, projet: PROJET, intervalleVeilleMs: 5, intervalleTickMs: 20 });
  const runtime = brancherMiseEnService(socle, { repertoireEtat: repertoire, env: { PATH: join(repertoire, "aucun-bin") } });
  aArreter(t, () => runtime.arreter("test"));
  const { journal } = runtime;
  journal.ajouter({ project: PROJET, ticket: null, author: "runtime", ...EN_ATTENTE });
  assert.equal(await appeler(commande, [], { BRIGADE_STATE_DIR: repertoire }).fin, 0);
  await jusqua(() => typesDeGestes(journal).includes("deploy.exited"));
  const rendu = gestes(journal).at(-1)?.payload as { code: number | null; error?: string };
  assert.equal(rendu.code, null);
  assert.match(rendu.error ?? "", /ENOENT/);
  assert.equal(demandeDeMiseEnService(journal.base), null);
  assert.match(file(journal, new Date()), /n'a rien redémarré : le geste de box n'a pas pu être lancé \(.*ENOENT.*\)/);
});

test("le runtime redémarré — par le geste, ou autrement —, la demande ne vaut plus : rien n'en reste dans la file, et rien ne part", async (t) => {
  const { sudo, journal, noter, decoller, atterrir, chef } = service(t);
  noter(EN_ATTENTE);
  decoller(12, "12-aaaa", 230_000);
  assert.equal(await chef().fin, 0);
  assert.equal(demandeDeMiseEnService(journal.base)?.etat, "waiting");
  noter({ type: "runtime.started", payload: { pid: 2, host: "box", node: "v26" } });
  assert.equal(demandeDeMiseEnService(journal.base), null);
  noter(EN_ATTENTE);
  atterrir(12, "12-aaaa");
  await ticks(journal, 6);
  assert.deepEqual(sudo.lancements(), []);
});

test("la commande refuse ce qui n'est pas un de ses gestes, et ne demande rien à un runtime qui ne tourne pas", async (t) => {
  const repertoire = repertoireTemporaire(t);
  for (const args of [["--force"], ["couper"], ["--couper", "annuler"], ["brigade"]]) {
    const refusee = appeler(commande, args, { BRIGADE_STATE_DIR: repertoire });
    assert.equal(await refusee.fin, 2, args.join(" "));
    assert.match(refusee.sortie(), /^brigade : usage : /m);
  }
  assert.equal(await appeler(commande, [], {}).fin, 2);
  const sansJournal = appeler(commande, [], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await sansJournal.fin, 1);
  assert.match(sansJournal.sortie(), /aucun journal dans /);
  assert.equal(existsSync(join(repertoire, "log.db")), false);

  // Un journal dont le runtime s'est arrêté : personne ne lancerait le geste.
  const journal = ouvrirJournal(repertoire);
  t.after(() => journal.fermer());
  const noter = (fait: Fait) => journal.ajouter({ project: PROJET, ticket: null, author: "runtime", ...fait });
  noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  noter(EN_ATTENTE);
  noter({ type: "runtime.stopped", payload: { signal: "SIGTERM" } });
  const arrete = appeler(commande, [], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await arrete.fin, 1);
  assert.match(arrete.sortie(), /le runtime de « brigade » n'est pas en marche : personne ne lancerait le geste de box — rien n'est demandé\. À la main : `sudo brigade-mise-en-service brigade`/);
  assert.deepEqual(typesDeGestes(journal), []);
});

test("`voir` montre ce qui est en vol et où en est la demande, sans rien écrire au journal ni à ses projections", async (t) => {
  const { journal, noter, decoller, chef } = service(t);
  noter(EN_ATTENTE);
  decoller(12, "12-aaaa", 230_000);
  const dernier = journal.dernierSeq();
  const avant = photographier(journal, PROJECTIONS.filter(({ nom }) => nom !== "sessions"));
  const vue = chef("voir");
  assert.equal(await vue.fin, 0);
  const lignes = vue.sortie().split("\n");
  assert.equal(lignes[1], `en vol     1 cook — ${nombre(230_000)} tokens déjà dépensés en tout`);
  assert.equal(lignes[3], "demande    aucune — `run mise-en-service` la pose");
  assert.deepEqual(typesDeGestes(journal), []);
  // Seuls les battements du runtime s'y sont ajoutés.
  assert.deepEqual(journal.depuis(dernier).filter(({ type }) => type !== "runtime.ticked"), []);
  assert.deepEqual(photographier(journal, PROJECTIONS.filter(({ nom }) => nom !== "sessions")), avant);
});

test("le runtime ne lance rien d'autre : un seul lancement dans ses sources, `sudo` par son nom, le geste de box par son chemin, jamais de shell — et un nom qui n'est pas celui d'un projet ne part pas", () => {
  const source = readFileSync(join(import.meta.dirname, "../src/mettre-en-service.ts"), "utf8");
  const code = source.split("\n").filter((ligne) => !ligne.trimStart().startsWith("//")).join("\n");
  assert.deepEqual([...code.matchAll(/\b(spawn|spawnSync|execFile|execFileSync|exec|execSync|fork)\(/g)].map((trouve) => trouve[0]), ["spawn("]);
  assert.match(code, /spawn\("sudo", args, \{/);
  assert.doesNotMatch(code, /shell\s*:/);
  // Ni la commande ni la demande n'en lancent aucun.
  for (const fichier of ["mettre-en-service-cli.ts", "dire-mise-en-service.ts", "projections/mise-en-service.ts"]) {
    assert.doesNotMatch(readFileSync(join(import.meta.dirname, "../src", fichier), "utf8"), /node:child_process/, fichier);
  }
  const faux = (projet: string) => ({ projet, journal: { base: {} }, surReveil: () => () => {}, arreter() {} }) as unknown as Runtime;
  for (const projet of ["brigade; touch /tmp/x", "$(id)", "-u", "../brigade", "brigade autre", ""]) {
    assert.throws(() => brancherMiseEnService(faux(projet), { repertoireEtat: "/nulle-part" }), /nom de projet invalide/, projet);
  }
});

// --- La cuisine entière : de vrais lancements --------------------------------

// Branche la mise en service sur une cuisine déjà montée — elle d'abord : son
// runtime s'arrête avant que les répertoires du test disparaissent.
function avecMiseEnService(t: TestContext, lieu: ReturnType<typeof cuisine>, scenario?: string) {
  const sudo = fauxSudo(t, scenario);
  const tenu = brancherMiseEnService(lieu.runtime, { repertoireEtat: lieu.repertoire, env: sudo.env });
  aArreter(t, () => {
    tenu.arreter("test");
    sudo.finir();
  });
  lieu.journal.ajouter({ project: PROJET, ticket: null, author: "runtime", ...EN_ATTENTE });
  return sudo;
}

test("en cuisine : sous une demande qui attend, le cook en vol finit sans être interrompu et aucun autre ne part ; le rail calme, le geste part une fois ; rendu sans redémarrage, la cuisine reprend", async (t) => {
  const lieu = cuisine(t, { scenario: "commite-puis-attend", issues: [issue(16), issue(17)] });
  const { journal, repertoire, types, etat, cooks, conclure, heure } = lieu;
  const sudo = avecMiseEnService(t, lieu, "attend");
  // Un cook en vol sur #16 ; #17 attend la place.
  await jusqua(() => cooks().length === 1 && types(16).includes("cook.launched"));

  const demande = appeler(commande, [], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await demande.fin, 0);
  assert.match(demande.sortie(), /^en vol     1 cook — /m);
  assert.match(demande.sortie(), /^  #16  brigade  box\/claude  .*  Ticket 16$/m);

  // Aussi longtemps que le cook tourne : ni geste, ni arrêt, ni signal.
  await ticks(journal, 10);
  assert.deepEqual(sudo.lancements(), []);
  assert.deepEqual(types(16).filter((type) => ["cook.exited", "cook.interrupted", "guard.tripped"].includes(type)), []);
  assert.match(file(journal, heure.maintenant()), /elle attend le rail calme : 1 cook en vol \(#16 — /);

  // Il conclut de lui-même : sa livraison est reçue, et le geste part.
  conclure();
  await jusqua(() => sudo.lancements().length === 1);
  assert.deepEqual(sudo.lancements()[0]?.args, ARGUMENTS);
  assert.equal((journal.duTicket(16).find(({ type }) => type === "cook.exited")?.payload as { outcome?: string } | undefined)?.outcome, "ok");
  // #17 pouvait partir dès la place libérée : la demande le retient, et c'est écrit.
  await ticks(journal, 10);
  assert.equal(etat(17), "waiting");
  assert.equal(cooks().length, 1);
  assert.deepEqual(journal.tout().findLast(({ type }) => type === "station.held")?.payload, { station: STATION, reason: "deploy" });
  assert.match(decrireEtat(lireEtat(journal, heure.maintenant()), heure.maintenant()).join("\n"), /box\/claude SE RETIENT depuis .* — mise en service demandée, la cuisine se vide avant le redémarrage : les tickets servables attendent/);

  // Le geste rend la main sans avoir rien redémarré : la cuisine reprend seule.
  sudo.liberer();
  await jusqua(() => typesDeGestes(journal).includes("deploy.exited"));
  await jusqua(() => cooks().length === 2 && etat(17) === "taken");
  assert.equal(sudo.lancements().length, 1);
});

test("en cuisine : `--couper` lance le geste pendant que le cook tourne — le runtime, lui, n'arrête aucun cook : c'est le redémarrage qui les interrompt", async (t) => {
  const lieu = cuisine(t, { scenario: "commite-puis-attend", issues: [issue(16)] });
  const { journal, repertoire, types, cooks } = lieu;
  const sudo = avecMiseEnService(t, lieu, "attend");
  await jusqua(() => cooks().length === 1 && types(16).includes("cook.launched"));

  assert.equal(await appeler(commande, ["--couper"], { BRIGADE_STATE_DIR: repertoire }).fin, 0);
  await jusqua(() => sudo.lancements().length === 1);
  const lance = gestes(journal).find(({ type }) => type === "deploy.launched")?.payload as { flying: Array<{ ticket: number | null }> };
  assert.deepEqual(lance.flying.map(({ ticket }) => ticket), [16]);
  await ticks(journal, 10);
  assert.deepEqual(types(16).filter((type) => ["cook.exited", "cook.interrupted", "guard.tripped"].includes(type)), []);
});

test("en cuisine : un cook dont le lancement tombe sous une demande n'est pas lancé — son ticket est rendu au rail, et repart la demande levée", async (t) => {
  const lieu = cuisine(t, { setup: "attend", issues: [issue(16)] });
  const { journal, repertoire, etat, cooks, setup, types } = lieu;
  const sudo = avecMiseEnService(t, lieu);
  // #16 est pris, son setup tourne : aucun cook n'est encore en vol.
  await jusqua(() => setup.appels().length === 1);
  // Un autre cook vole, que la demande attend : elle vit le temps du test.
  journal.ajouter({ project: PROJET, ticket: 99, author: "runtime", type: "cook.launched", payload: { run: "99-aaaa", limits: PLAFONDS, stream: "runs/99-aaaa.jsonl", station: STATION } });
  assert.equal(await appeler(commande, [], { BRIGADE_STATE_DIR: repertoire }).fin, 0);

  // Le setup fini, le lancement est refusé : rien ne part sous la demande.
  setup.liberer();
  await jusqua(() => types(16).includes("ticket.released") || etat(16) === "waiting");
  await ticks(journal, 6);
  assert.deepEqual(cooks(), []);
  assert.deepEqual(types(16).filter((type) => type === "cook.launched"), []);
  assert.deepEqual(sudo.lancements(), []);

  // La demande retirée, il repart.
  assert.equal(await appeler(commande, ["annuler"], { BRIGADE_STATE_DIR: repertoire }).fin, 0);
  await jusqua(() => cooks().length === 1);
});

// --- Le vrai process ----------------------------------------------------------

test("sur le vrai process : `main.ts` tient la demande que la commande — un autre process — a écrite, lance le geste de box pour son projet, et son arrêt n'emporte pas le geste ; redémarré, il ne garde rien de la demande", async (t) => {
  const SRC = join(import.meta.dirname, "../src");
  const repertoire = repertoireTemporaire(t);
  const depot = repertoireTemporaire(t);
  git(depot, "init", "-q");
  const gh = fauxGh(t);
  gh.issues([]);
  const sudo = fauxSudo(t, "attend");
  aArreter(t, () => sudo.finir());
  const env = {
    ...ENV_GIT,
    PATH: sudo.env.PATH,
    BRIGADE_STATE_DIR: repertoire,
    BRIGADE_PROJECT: "calculus",
    BRIGADE_GITHUB_REPO: DEPOT,
    BRIGADE_GH_BIN: gh.bin,
    BRIGADE_REPO_DIR: depot,
    BRIGADE_BASE_BRANCH: BASE,
    BRIGADE_CLAUDE_BIN: FAUX_CLAUDE,
    BRIGADE_STATIONS: "box/claude:30:code",
    BRIGADE_MANAGER_MODEL: "sonnet",
    BRIGADE_MANAGER_EFFORT: "medium",
    BRIGADE_REVIEWER_MODEL: "sonnet",
    BRIGADE_REVIEWER_EFFORT: "medium",
    BRIGADE_MAX_LOAD_PER_CORE: "1000000",
    BRIGADE_MIN_FREE_MEMORY_MB: "0",
    BRIGADE_MIN_FREE_DISK_MB: "0",
  };
  // Ce que le journal dit, lu d'un autre process que le runtime.
  const lire = <T>(lecture: (journal: Journal) => T): T => {
    const journal = ouvrirJournal(repertoire, { lectureSeule: true });
    try {
      return lecture(journal);
    } finally {
      journal.fermer();
    }
  };

  let runtime = lancer(t, join(SRC, "main.ts"), [], env);
  await runtime.attendre("démarré");
  // Ce runtime ne tourne pas sur une version posée : la comparaison qui dit
  // qu'une version attend est écrite ici, à sa place.
  const ecrit = ouvrirJournal(repertoire);
  ecrit.ajouter({ project: "calculus", ticket: null, author: "runtime", ...EN_ATTENTE });
  ecrit.fermer();

  // La commande, dans son propre process, comme le geste `brigade` la lance.
  const demande = lancer(t, join(SRC, "mettre-en-service-cli.ts"), [], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await demande.fin, 0, demande.sortie());
  assert.match(demande.sortie(), /^brigade : mise en service demandée — le rail est calme : le runtime lance le geste de box \(`sudo -n -- \/usr\/local\/bin\/brigade-mise-en-service calculus`\)/m);

  await jusqua(() => sudo.lancements().length === 1);
  const [geste] = sudo.lancements();
  assert.deepEqual(geste?.args, ["-n", "--", "/usr/local/bin/brigade-mise-en-service", "calculus"]);
  assert.equal(geste?.parent, runtime.process.pid);
  await jusqua(() => lire((journal) => demandeDeMiseEnService(journal.base)?.etat) === "launched");

  // Le geste arrête le runtime qui l'a lancé : il lui survit.
  runtime.process.kill("SIGTERM");
  assert.equal(await runtime.fin, 0);
  assert.equal(vivant(geste?.pid), true);
  assert.deepEqual(lire(typesDeGestes), ["deploy.requested", "deploy.launched"]);

  // Le runtime qui repart ne tient plus aucune demande : il ne relance rien.
  runtime = lancer(t, join(SRC, "main.ts"), [], env);
  await runtime.attendre("démarré");
  assert.equal(lire((journal) => demandeDeMiseEnService(journal.base)), null);
  runtime.process.kill("SIGTERM");
  assert.equal(await runtime.fin, 0);
  assert.equal(sudo.lancements().length, 1);
});
