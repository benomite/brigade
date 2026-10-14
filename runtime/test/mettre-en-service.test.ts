// La mise en service côté runtime : le chef la demande, le runtime tient la
// demande et lance le geste de box — une doublure de `sudo`, ici — le rail
// calme, ou sans attendre sur demande explicite.
//
// Deux cuisines. La première n'a que le journal et le runtime : un cook « en
// vol » y est un fait qu'un test écrit et clôt à la main, à l'instant qu'il
// choisit. La seconde est la cuisine entière, avec de vrais lancements : c'est
// là que se prouve qu'aucun cook n'est interrompu ni lancé sous une demande.
//
// Et une box basculée, pour ce que le geste donne : le runtime y tourne sur
// une version posée, s'arrête et repart sur le même répertoire d'état — c'est
// celui qui repart qui dit ce que le geste a donné.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { decrireEtat, lireEtat } from "../src/etat.ts";
import type { Fait } from "../src/evenements.ts";
import { SENS_DES_CODES } from "../src/dire-mise-en-service.ts";
import { GESTE_DE_BOX } from "../src/evenements/mise-en-service.ts";
import { ouvrirJournal, type Journal } from "../src/journal.ts";
import { brancherMiseEnService, JOURNAL_DU_GESTE } from "../src/mettre-en-service.ts";
import { principal as commande } from "../src/mettre-en-service-cli.ts";
import { PROJECTIONS } from "../src/projections.ts";
import { demandeDeMiseEnService, dernierGeste } from "../src/projections/mise-en-service.ts";
import { demarrer, type Runtime } from "../src/runtime.ts";
import { cuisine, issue, montre, PLAFONDS, STATION } from "./aides/cuisine.ts";
import { fauxSudo } from "./aides/faux-sudo.ts";
import { aArreter, appeler, BASE, DEPOT, ENV_GIT, FAUX_CLAUDE, fauxGh, git, jusqua, lancer, photographier, repertoireTemporaire, vivant } from "./outils.ts";

const FAUX_SUDO_LISTE = join(import.meta.dirname, "aides/faux-sudo-liste.sh");
// Le contrôle du compte du service, avant toute demande : une doublure de
// `sudo -n -l` qui accorde, sauf si `sudo-refuse` est posé à côté du lien.
const DROIT = { BRIGADE_SUDO_BIN: FAUX_SUDO_LISTE, BRIGADE_MISE_EN_SERVICE_LIEN: join(import.meta.dirname, "aides/geste-pose") };
const PROJET = "brigade";
// Ce que le runtime lance, argument par argument — et rien d'autre.
const ARGUMENTS = ["-n", "--", "/usr/local/bin/brigade-mise-en-service", PROJET];
const [SERVIE, TETE] = ["a".repeat(40), "b".repeat(40)];
const EN_ATTENTE: Fait = { type: "version.compared", payload: { outcome: "waiting", served: SERVIE, branch: "origin/v2", head: TETE, since: "2026-10-08T08:21:07.000Z", deliveries: 26 } };
const nombre = (valeur: number) => valeur.toLocaleString("fr-FR");
// L'heure d'un instant à la minute, à l'heure de la machine, comme la file la dit.
const hhmm = (instant: string) => new Date(instant).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

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

// Le bloc `attend` de `status`, de sa ligne de tête à sa ligne de fin. Son
// bord tient : une seule ligne commence par `attend`, une seule vaut `fin
// attend`, et tout ce qu'il porte entre les deux est en retrait.
function blocAttend(journal: Journal, maintenant: Date): string[] {
  const lignes = decrireEtat(lireEtat(journal, maintenant), maintenant);
  assert.equal(lignes.filter((ligne) => ligne.startsWith("attend")).length, 1);
  assert.equal(lignes.filter((ligne) => ligne === "fin attend").length, 1);
  const bloc = lignes.slice(lignes.findIndex((ligne) => ligne.startsWith("attend")), lignes.indexOf("fin attend") + 1);
  for (const ligne of bloc.slice(1, -1)) assert.match(ligne, /^(?: {2}| {6})\S/, ligne);
  return bloc;
}

// Un runtime qui ne tient que le journal et la mise en service.
function service(t: TestContext, scenario?: string, tenue = true) {
  const repertoire = repertoireTemporaire(t);
  const sudo = fauxSudo(t, scenario);
  const heure = montre();
  const socle = demarrer({ repertoireEtat: repertoire, projet: PROJET, intervalleVeilleMs: 5, intervalleTickMs: 20, maintenant: heure.maintenant });
  // `tenue` faux : personne ne regarde la demande — elle reste écrite, le temps
  // de la lire ou de l'annuler.
  const runtime = tenue ? brancherMiseEnService(socle, { repertoireEtat: repertoire, env: sudo.env }) : socle;
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
    chef: (...args: string[]) => appeler(commande, args, { BRIGADE_STATE_DIR: repertoire, ...DROIT }),
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

test("aucun cook en vol : la commande le dit, et le runtime lance le geste de box — `sudo -n /usr/local/bin/brigade-mise-en-service <projet>`, sans shell, sans rien de son environnement —, une seule fois", async (t) => {
  const { repertoire, sudo, journal, noter, chef, file } = service(t, "attend");
  noter(EN_ATTENTE);
  // Avant toute demande, la file ne dit rien d'une version qui attend : le runtime l'essaie seul.
  assert.equal(file(), "");

  const demande = chef();
  assert.equal(await demande.fin, 0);
  assert.deepEqual(demande.sortie().split("\n").slice(0, 3), [
    `version    origin/v2 (${"b".repeat(12)}) attend — en service : ${"a".repeat(12)}, 26 livraisons non en service depuis le 2026-10-08T08:21:07.000Z`,
    "en vol     aucun cook — le rail est calme",
    `brigade : mise en service demandée : le runtime lance le geste de box (\`sudo -n -- /usr/local/bin/brigade-mise-en-service brigade\`) à son prochain réveil, dans la seconde, et il sera redémarré sur ${"b".repeat(12)}`,
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
    { type: "deploy.launched", author: "runtime", payload: { command: ["sudo", ...ARGUMENTS], flying: [], log: JOURNAL_DU_GESTE, served: SERVIE, target: TETE } },
  ]);
  // En cours, rien ne se lit dans la file : seul un essai raté s'y lit.
  assert.equal(file(), "");
  const vue0 = chef("voir");
  assert.equal(await vue0.fin, 0);
  assert.match(vue0.sortie(), /^demande    mise en service lancée le 2026-10-08T10:00:00\.000Z : le geste de box tourne .*aucun cook n'est retenu/m);

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

test("des cooks en vol : la commande dit d'abord lesquels — ticket, projet, station — et ce que chacun a déjà dépensé, et en tout ; le geste part sans les attendre, une fois, et aucun n'est retenu", async (t) => {
  const { sudo, journal, noter, decoller, atterrir, chef, file } = service(t, "attend");
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
  // La liste précède tout ce que la commande dit de la demande : le rail
  // calme n'est pas attendu, et rien ne propose de couper.
  assert.deepEqual(lignes.slice(5, 7), [
    "brigade : mise en service demandée : le runtime lance le geste de box (`sudo -n -- /usr/local/bin/brigade-mise-en-service brigade`) à son prochain réveil, dans la seconde — aucun cook n'est retenu",
    `          3 cooks en vol (#12, #14, manager — ${nombre(450_775)} tokens déjà dépensés, 1 sans relevé encore) : un cook de station survit au redémarrage, le suivant le reprend ; pour y renoncer : \`brigade <projet> mise-en-service annuler\``,
  ]);
  assert.doesNotMatch(demande.sortie(), /couper|rail calme/);

  // Le geste part sans attendre qu'aucun cook ne soit en vol ; le journal garde ceux qui y étaient.
  await jusqua(() => sudo.lancements().length === 1);
  assert.deepEqual(sudo.lancements()[0]?.args, ARGUMENTS);
  assert.deepEqual(typesDeGestes(journal), ["deploy.requested", "deploy.launched"]);
  assert.deepEqual(gestes(journal)[0]?.payload, { cut: false });
  assert.deepEqual(
    (gestes(journal)[1]?.payload as { flying: Array<{ run: string }> }).flying.map(({ run }) => run).sort(),
    ["12-aaaa", "14-bbbb", "sans-ticket-cccc"],
  );
  // Les cooks n'ont pas été touchés, et la file ne dit rien d'une mise en service en cours.
  assert.deepEqual(journal.tout().filter(({ type }) => type === "cook.interrupted" || type === "cook.exited"), []);
  assert.equal(file(), "");
  await ticks(journal);
  assert.equal(sudo.lancements().length, 1);
  atterrir(12, "12-aaaa");
  atterrir(14, "14-bbbb");
  atterrir(null, "sans-ticket-cccc");
});

test("`--couper` n'est plus nécessaire : accepté pour qui l'écrit encore, il ne change rien — la demande part sans attendre, comme sans lui, et rien ne le propose", async (t) => {
  const { sudo, journal, noter, decoller, chef } = service(t, "attend");
  noter(EN_ATTENTE);
  decoller(12, "12-aaaa", 230_000);

  const coupe = chef("--couper");
  assert.equal(await coupe.fin, 0);
  assert.doesNotMatch(coupe.sortie(), /rail calme|ne plus attendre|interrompu/);
  await jusqua(() => sudo.lancements().length === 1);
  assert.deepEqual(gestes(journal).map(({ type, payload }) => ({ type, payload })), [
    { type: "deploy.requested", payload: { cut: false } },
    { type: "deploy.launched", payload: { command: ["sudo", ...ARGUMENTS], flying: [{ run: "12-aaaa", ticket: 12, tokens: 230_000 }], log: JOURNAL_DU_GESTE, served: SERVIE, target: TETE } },
  ]);
  await ticks(journal);
  assert.equal(sudo.lancements().length, 1);
});

test("annuler retire une demande qui attend encore son réveil : rien n'est lancé", async (t) => {
  const { sudo, journal, noter, decoller, chef } = service(t, undefined, false);
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

test("le geste de box rend la main sans rien redémarrer — `sudo` le refuse : la file dit que la mise en service a échoué, avec ses mots et ce qui reste en service, il n'est pas relancé, et une demande de plus le relance une fois", async (t) => {
  const { sudo, journal, noter, chef, file } = service(t, "rend 1 sudo: a password is required");
  noter(EN_ATTENTE);
  assert.equal(await chef().fin, 0);
  await jusqua(() => typesDeGestes(journal).includes("deploy.exited"));
  assert.deepEqual(gestes(journal).at(-1)?.payload, { code: 1, signal: null, tail: "faux sudo : une première ligne\nsudo: a password is required" });
  assert.equal(demandeDeMiseEnService(journal.base), null);
  assert.ok(
    file().endsWith(
      "— MISE EN SERVICE ÉCHOUÉE, lancée le 2026-10-08T10:00:00.000Z : le geste de box a rendu 1 le 2026-10-08T10:00:00.000Z, sans rien redémarrer — « sudo: a password is required » ; aaaaaaaaaaaa reste en service — une fois levé ce qu'il dit, à redemander : `brigade <projet> mise-en-service` ; ou à la main : `sudo brigade-mise-en-service brigade`",
    ),
    file(),
  );
  const vue = chef("voir");
  assert.equal(await vue.fin, 0);
  assert.match(vue.sortie(), /^demande    aucune — `brigade <projet> mise-en-service` la pose\ndernière   MISE EN SERVICE ÉCHOUÉE, lancée le .* : le geste de box a rendu 1 /m);

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
  assert.equal(await appeler(commande, [], { BRIGADE_STATE_DIR: repertoire, ...DROIT }).fin, 0);
  await jusqua(() => typesDeGestes(journal).includes("deploy.exited"));
  const rendu = gestes(journal).at(-1)?.payload as { code: number | null; error?: string };
  assert.equal(rendu.code, null);
  assert.match(rendu.error ?? "", /ENOENT/);
  assert.equal(demandeDeMiseEnService(journal.base), null);
  assert.match(file(journal, new Date()), /MISE EN SERVICE ÉCHOUÉE, lancée le .* : le geste de box n'a pas pu être lancé \(.*ENOENT.*\) ; a{12} reste en service — à redemander : /);
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

// --- Ce que le geste a donné --------------------------------------------------

// Ce que la bascule écrit quand la version ne démarre pas, jusqu'à l'instant où
// elle relance la précédente : le runtime qui repart ne lit rien d'autre.
const BASCULE_REVENUE = [
  `brigade-mise-en-service : le clone (/opt/brigade) passe de ${"a".repeat(12)} à ${"b".repeat(12)} — 3 commit(s) reçu(s) de son origine`,
  `brigade-bascule : ${"b".repeat(12)} n'a pas démarré pour brigade@brigade.service — le runtime est sorti en code 1, et systemd ne le relance pas (\`failed\`)`,
  "                  ce que l'essai a écrit : /opt/brigade-versions/brigade/essai.journal ; `brigade brigade installation` le redit",
];
const MOTIF = "le runtime est sorti en code 1, et systemd ne le relance pas (`failed`)";
// Ce qu'elle écrit quand la version change une unité posée : elle sort en 72
// sans avoir rien arrêté.
const UNITE_CHANGEE = [
  `brigade-mise-en-service : le clone (/opt/brigade) n'a rien reçu de son origine : il reste sur ${"b".repeat(12)}`,
  `brigade-bascule : ${"b".repeat(12)} change des unités posées sous /etc/systemd/system : brigade@.service — rien n'a été arrêté`,
  "                  → les unités valent pour toute la box, et aucun retour ne les couvre : `sudo cp /opt/brigade/runtime/deploy/*.service /opt/brigade/runtime/deploy/*.timer /etc/systemd/system/`, `sudo systemctl daemon-reload`, puis cette bascule ; `cloison.conf` se recopie en y reportant tes réglages — docs/installer.md, « Mettre brigade à jour »",
];
const REPRENDRE = "à redemander : `brigade <projet> mise-en-service` ; ou à la main : `sudo brigade-mise-en-service brigade`";
// La tête de l'entrée `version` : la version attend toujours. `depuis` : la
// durée que la file dit, à l'heure du test.
const attendToujours = (depuis: string) => `  version  depuis ${depuis}  une version attend : origin/v2 (${"b".repeat(12)}) porte un runtime qui n'est pas en service — en service : ${"a".repeat(12)}, en retard depuis le 2026-10-08T08:21:07.000Z ; 26 livraisons non en service — `;

// Une box basculée : le runtime y tourne sur une version posée par la bascule
// (`<clone>-versions/<projet>/<commit>/runtime/src`), s'arrête et repart sur le
// même répertoire d'état, et la bascule laisse son compte rendu à côté des
// versions. L'horloge est celle du test, compte rendu compris.
function boxBasculee(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const versions = join(repertoireTemporaire(t), "brigade-versions", PROJET);
  const sudo = fauxSudo(t);
  const heure = montre();
  let runtime: Runtime | null = null;
  const arreter = () => {
    runtime?.arreter("SIGTERM");
    runtime = null;
  };
  aArreter(t, () => {
    arreter();
    sudo.finir();
  });
  const enMarche = (): Runtime => {
    if (runtime === null) throw new Error("aucun runtime en marche");
    return runtime;
  };
  const journal = () => enMarche().journal;
  const noter = (fait: Fait) => journal().ajouter({ project: PROJET, ticket: null, author: "runtime", ...fait });
  const conclusions = () => gestes(journal()).flatMap(({ type, payload }) => (type === "deploy.concluded" ? [payload] : []));
  return {
    repertoire,
    sudo,
    heure,
    journal,
    noter,
    conclusions,
    arreter,
    // Le runtime démarre sur une version posée, et la compare d'emblée à la
    // tête de sa branche, comme `brancherVersion` le fait sur la box. Rend ce
    // que le journal porte alors de conclusions.
    demarrerSur(commit: string, tete = TETE) {
      const sources = join(versions, commit, "runtime/src");
      mkdirSync(sources, { recursive: true });
      const socle = demarrer({ repertoireEtat: repertoire, projet: PROJET, intervalleVeilleMs: 5, intervalleTickMs: 20, maintenant: heure.maintenant });
      // Ce qui se prouve ici est le geste demandé par le chef : le runtime
      // n'essaie rien de lui-même (`mise-a-jour-seule.test.ts`).
      runtime = brancherMiseEnService(socle, { repertoireEtat: repertoire, env: sudo.env, sources, seul: false });
      const conclues = conclusions();
      noter(
        commit === tete
          ? { type: "version.compared", payload: { outcome: "current", served: commit, branch: "origin/v2" } }
          : { type: "version.compared", payload: { outcome: "waiting", served: commit, branch: "origin/v2", head: tete, since: "2026-10-08T08:21:07.000Z", deliveries: 26 } },
      );
      return conclues;
    },
    // Ce que la bascule note à côté des versions, à l'heure du test. `refus` :
    // la version qu'elle a refusée, et pourquoi.
    compteRendu(enService: string, refus?: { refusee: string; motif: string }, quand = heure.maintenant()) {
      const lignes = ["clone=/opt/brigade", `en-service=${enService}`, ...(refus ? [`refusee=${refus.refusee}`, `motif=${refus.motif}`] : [])];
      writeFileSync(join(versions, "bascule"), `${lignes.join("\n")}\n`);
      utimesSync(join(versions, "bascule"), quand, quand);
    },
    // Le chef demande, le runtime lance le geste, qui écrit ses lignes.
    async lancer(fin: number | "attend", lignes: string[]) {
      sudo.dire(fin, lignes);
      const deja = sudo.lancements().length;
      assert.equal(await appeler(commande, [], { BRIGADE_STATE_DIR: repertoire, ...DROIT }).fin, 0);
      await jusqua(() => sudo.lancements().length === deja + 1);
      const derniere = lignes.at(-1) ?? "";
      await jusqua(() => existsSync(join(repertoire, JOURNAL_DU_GESTE)) && readFileSync(join(repertoire, JOURNAL_DU_GESTE), "utf8").includes(derniere));
    },
    voir: () => appeler(commande, ["voir"], { BRIGADE_STATE_DIR: repertoire, ...DROIT }),
    bloc: () => blocAttend(journal(), heure.maintenant()),
  };
}

test("échec avec retour : la version ne démarre pas, la bascule remet la précédente — le runtime qui repart le dit, et `status` montre que la mise en service a échoué, que la version précédente est revenue, la raison en une ligne et les dernières lignes du geste ; la version attend toujours, et se redemande", async (t) => {
  const { sudo, heure, journal, conclusions, arreter, demarrerSur, compteRendu, lancer, voir, bloc } = boxBasculee(t);
  assert.deepEqual(demarrerSur(SERVIE), []);
  await lancer("attend", BASCULE_REVENUE);
  assert.equal(gestes(journal()).at(-1)?.type, "deploy.launched");

  // La bascule a arrêté le runtime, essayé la version, noté son refus, et
  // relance la précédente : elle n'a pas encore rendu la main.
  heure.avancer(40_000);
  arreter();
  compteRendu(SERVIE, { refusee: TETE, motif: MOTIF });
  heure.avancer(20_000);
  demarrerSur(SERVIE);

  assert.deepEqual(conclusions(), [{ outcome: "returned", served: SERVIE, refused: TETE, reason: MOTIF, tail: BASCULE_REVENUE.join("\n") }]);
  assert.deepEqual(bloc(), [
    "attend     1 décision attend le chef depuis 1 h 39",
    `${attendToujours("1 h 39")}MISE EN SERVICE ÉCHOUÉE, lancée le 2026-10-08T10:00:00.000Z : ${"b".repeat(12)} n'a pas démarré — « ${MOTIF} » ; la version précédente (${"a".repeat(12)}) est revenue en service, le runtime est reparti sur elle le 2026-10-08T10:01:00.000Z — une version corrigée livrée, ${REPRENDRE}`,
    "      les dernières lignes du geste de box :",
    ...BASCULE_REVENUE.map((ligne) => `      │ ${ligne}`),
    "fin attend",
  ]);
  // Rien n'est retenu : la demande s'est éteinte avec le runtime qui la tenait.
  assert.equal(demandeDeMiseEnService(journal().base), null);
  const vue = voir();
  assert.equal(await vue.fin, 0);
  assert.match(vue.sortie(), /^demande    aucune — `brigade <projet> mise-en-service` la pose\ndernière   MISE EN SERVICE ÉCHOUÉE, lancée le 2026-10-08T10:00:00\.000Z : b{12} n'a pas démarré — .* la version précédente \(a{12}\) est revenue en service/m);
  assert.match(vue.sortie(), /^ {11}│ brigade-bascule : b{12} n'a pas démarré pour brigade@brigade\.service/m);

  // Le runtime redémarre pour une autre raison : l'échec se lit encore, et ne
  // se conclut pas une seconde fois.
  arreter();
  demarrerSur(SERVIE);
  assert.equal(conclusions().length, 1);
  assert.match(bloc()[1] ?? "", /MISE EN SERVICE ÉCHOUÉE, lancée le 2026-10-08T10:00:00\.000Z : b{12} n'a pas démarré/);

  // Le chef redemande : le geste repart, une fois, et l'échec d'avant ne se dit plus.
  await lancer("attend", ["brigade-mise-en-service : le clone (/opt/brigade) n'a rien reçu de son origine"]);
  assert.equal(sudo.lancements().length, 2);
  // En cours, la file ne dit plus rien : l'échec d'avant ne se lit plus, et la mise en service qui tourne n'est pas à la charge du chef.
  assert.deepEqual(bloc(), ["attend     rien n'attend le chef", "fin attend"]);
});

test("échec pour unité changée refusée : la bascule sort sans avoir rien arrêté — `status` dit que la mise en service a échoué, pourquoi, ce qui reste en service, et ce que la bascule demande de faire ; l'échec se lit encore après un redémarrage", async (t) => {
  const { journal, conclusions, arreter, demarrerSur, lancer, bloc } = boxBasculee(t);
  demarrerSur(SERVIE);
  await lancer(72, UNITE_CHANGEE);
  await jusqua(() => typesDeGestes(journal()).includes("deploy.exited"));
  assert.deepEqual(gestes(journal()).at(-1)?.payload, { code: 72, signal: null, tail: UNITE_CHANGEE.join("\n") });

  const attendu = [
    "attend     1 décision attend le chef depuis 1 h 38",
    `${attendToujours("1 h 38")}MISE EN SERVICE ÉCHOUÉE, lancée le 2026-10-08T10:00:00.000Z : le geste de box a rendu 72 le 2026-10-08T10:00:00.000Z (la version change une unité posée), sans rien redémarrer — « ${UNITE_CHANGEE[1]} » ; ${"a".repeat(12)} reste en service — une fois levé ce qu'il dit, ${REPRENDRE}`,
    "      les dernières lignes du geste de box :",
    ...UNITE_CHANGEE.map((ligne) => `      │ ${ligne}`),
    "fin attend",
  ];
  assert.deepEqual(bloc(), attendu);
  // Plus rien n'est retenu : la cuisine reprend ses tickets.
  assert.equal(demandeDeMiseEnService(journal().base), null);

  // Redémarré — une panne, un `systemctl restart` —, le runtime ne conclut rien
  // de plus : le geste avait rendu la main, et la file dit toujours l'échec.
  arreter();
  assert.deepEqual(demarrerSur(SERVIE), []);
  assert.deepEqual(bloc(), attendu);
  assert.deepEqual(conclusions(), []);
});

test("réussite qui efface l'échec : après une mise en service échouée, la suivante redémarre le runtime sur la version attendue — il le dit, la file ne montre plus l'échec et ne dit plus qu'une version attend", async (t) => {
  const { heure, journal, conclusions, arreter, demarrerSur, compteRendu, lancer, voir, bloc } = boxBasculee(t);
  demarrerSur(SERVIE);
  await lancer(72, UNITE_CHANGEE);
  await jusqua(() => typesDeGestes(journal()).includes("deploy.exited"));
  assert.match(bloc()[1] ?? "", /MISE EN SERVICE ÉCHOUÉE/);

  // Les unités recopiées, le chef redemande : la bascule arrête le runtime, et
  // la version démarre.
  heure.avancer(600_000);
  await lancer("attend", [`brigade-mise-en-service : le clone (/opt/brigade) n'a rien reçu de son origine : il reste sur ${"b".repeat(12)}`]);
  heure.avancer(30_000);
  arreter();
  // Elle n'a encore rien noté : elle ne confirme qu'une fois le runtime démarré.
  assert.deepEqual(demarrerSur(TETE), [{ outcome: "served", served: TETE }]);
  compteRendu(TETE);

  // Plus rien n'attend : le bloc dit seulement, le jour même, la version passée en service.
  assert.deepEqual(bloc(), ["attend     rien n'attend le chef", `  passé en \`${TETE.slice(0, 7)}\` à ${hhmm("2026-10-08T10:10:30.000Z")}`, "fin attend"]);
  assert.deepEqual(dernierGeste(journal().base), { lanceLe: "2026-10-08T10:10:00.000Z", avant: SERVIE, cible: TETE, seul: false, essais: 1, issue: { quoi: "served", le: "2026-10-08T10:10:30.000Z", servie: TETE } });
  const vue = voir();
  assert.equal(await vue.fin, 0);
  assert.match(vue.sortie(), new RegExp(`^dernière   mise en service lancée le 2026-10-08T10:10:00\\.000Z : réussie — ${"b".repeat(12)} est en service, le runtime est reparti sur elle le 2026-10-08T10:10:30\\.000Z$`, "m"));

  // Une livraison de plus sur la branche : une version attend de nouveau, et
  // rien ne redit l'échec d'avant la réussite — la réussite, elle, se lit encore.
  const [SUIVANTE] = ["c".repeat(40)];
  arreter();
  demarrerSur(TETE, SUIVANTE);
  assert.equal(bloc().length, 3);
  assert.equal(bloc()[1], `  passé en \`${TETE.slice(0, 7)}\` à ${hhmm("2026-10-08T10:10:30.000Z")}`);
  assert.equal(conclusions().length, 1);
});

test("une version qui démarre puis ne tient pas : son runtime s'est dit en service, la bascule la refuse et remet la précédente — c'est le runtime revenu qui a le dernier mot, et la file dit l'échec", async (t) => {
  const { heure, conclusions, arreter, demarrerSur, compteRendu, lancer, bloc } = boxBasculee(t);
  demarrerSur(SERVIE);
  await lancer("attend", BASCULE_REVENUE);
  heure.avancer(10_000);
  arreter();
  // La version démarre, écrit au journal — puis tombe avant que la bascule l'ait confirmée.
  demarrerSur(TETE);
  assert.deepEqual(conclusions(), [{ outcome: "served", served: TETE }]);
  heure.avancer(10_000);
  arreter();
  compteRendu(SERVIE, { refusee: TETE, motif: "le runtime est tombé avant d'avoir démarré, systemd le relançait (2 relance(s))" });
  heure.avancer(10_000);
  demarrerSur(SERVIE);

  assert.deepEqual(conclusions().at(-1), { outcome: "returned", served: SERVIE, refused: TETE, reason: "le runtime est tombé avant d'avoir démarré, systemd le relançait (2 relance(s))", tail: BASCULE_REVENUE.join("\n") });
  assert.match(bloc()[1] ?? "", /MISE EN SERVICE ÉCHOUÉE, lancée le 2026-10-08T10:00:00\.000Z : b{12} n'a pas démarré — « le runtime est tombé avant d'avoir démarré, systemd le relançait \(2 relance\(s\)\) » ; la version précédente \(a{12}\) est revenue en service, le runtime est reparti sur elle le 2026-10-08T10:00:30\.000Z/);
});

test("le runtime repart sur la version d'avant sans que la bascule ait rien noté — le geste a été tué, ou le redémarrage n'est pas le sien : la file le dit tel quel, avec le dernier mot du geste, et un refus d'avant le lancement ne lui est pas prêté", async (t) => {
  const { heure, conclusions, arreter, demarrerSur, compteRendu, lancer, bloc } = boxBasculee(t);
  demarrerSur(SERVIE);
  // Un refus d'il y a une heure, d'une bascule lancée à la main : pas celui de ce geste.
  compteRendu(SERVIE, { refusee: "c".repeat(40), motif: "un vieux refus" }, new Date(heure.maintenant().getTime() - 3_600_000));
  const dit = `brigade-mise-en-service : le clone (/opt/brigade) passe de ${"a".repeat(12)} à ${"b".repeat(12)} — 3 commit(s) reçu(s) de son origine`;
  await lancer("attend", [dit]);
  heure.avancer(15_000);
  arreter();
  demarrerSur(SERVIE);

  assert.deepEqual(conclusions(), [{ outcome: "returned", served: SERVIE, refused: null, reason: null, tail: dit }]);
  assert.deepEqual(bloc().slice(1), [
    `${attendToujours("1 h 39")}MISE EN SERVICE ÉCHOUÉE, lancée le 2026-10-08T10:00:00.000Z : le runtime est reparti le 2026-10-08T10:00:15.000Z sur la version d'avant (${"a".repeat(12)}), sans que la bascule ait noté de refus — « ${dit} » — ${REPRENDRE}`,
    "fin attend",
  ]);
});

test("un échec ne se lit que tant que la version qu'il a laissée est en service : mise en service à la main sur une autre version, ou dite à jour, il sort de la file — et revenir à la main, plus tard, sur la version d'avant une réussite n'est pas un échec", async (t) => {
  const { heure, journal, noter, conclusions, arreter, demarrerSur, compteRendu, lancer, bloc } = boxBasculee(t);
  demarrerSur(SERVIE);
  await lancer(72, UNITE_CHANGEE);
  await jusqua(() => typesDeGestes(journal()).includes("deploy.exited"));
  assert.match(bloc()[1] ?? "", /MISE EN SERVICE ÉCHOUÉE/);

  // `sudo brigade-mise-en-service` à la main, sur une version intermédiaire :
  // aucun geste n'est parti du runtime, celui qui repart ne conclut rien — mais
  // ce n'est plus la version que l'échec avait laissée.
  const [INTERMEDIAIRE] = ["c".repeat(40)];
  arreter();
  compteRendu(INTERMEDIAIRE);
  assert.deepEqual(demarrerSur(INTERMEDIAIRE), []);
  assert.equal(dernierGeste(journal().base), null);
  assert.deepEqual(bloc(), ["attend     rien n'attend le chef", "fin attend"]);

  // Un échec de plus, puis l'origine revient à ce qui est servi : plus rien n'attend, plus rien n'a échoué.
  await lancer(72, UNITE_CHANGEE);
  await jusqua(() => typesDeGestes(journal()).filter((type) => type === "deploy.exited").length === 2);
  noter({ type: "version.compared", payload: { outcome: "current", served: INTERMEDIAIRE, branch: "origin/v2" } });
  assert.equal(dernierGeste(journal().base), null);

  // Une réussite, puis — bien après — un retour à la main sur la version
  // d'avant (`brigade-bascule <projet> <commit>`) : la bascule n'a refusé
  // personne, le runtime qui repart ne dit pas la mise en service échouée.
  noter({ type: "version.compared", payload: { outcome: "waiting", served: INTERMEDIAIRE, branch: "origin/v2", head: TETE, since: "2026-10-08T08:21:07.000Z", deliveries: 2 } });
  await lancer("attend", ["brigade-mise-en-service : le clone (/opt/brigade) n'a rien reçu de son origine"]);
  arreter();
  assert.deepEqual(demarrerSur(TETE), [{ outcome: "served", served: TETE }]);
  compteRendu(TETE);
  heure.avancer(7 * 86_400_000);
  arreter();
  demarrerSur(INTERMEDIAIRE);
  assert.equal(conclusions().length, 1);
  assert.equal(dernierGeste(journal().base)?.issue?.quoi, "served");
  assert.deepEqual(bloc(), ["attend     rien n'attend le chef", "fin attend"]);
});

test("hors d'une version posée, le runtime qui repart ne conclut rien : rien ne lui dit ce qui est en service", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const sudo = fauxSudo(t, "attend");
  const ouvrir = () => brancherMiseEnService(demarrer({ repertoireEtat: repertoire, projet: PROJET, intervalleVeilleMs: 5, intervalleTickMs: 20 }), { repertoireEtat: repertoire, env: sudo.env });
  let runtime = ouvrir();
  aArreter(t, () => {
    runtime.arreter("test");
    sudo.finir();
  });
  runtime.journal.ajouter({ project: PROJET, ticket: null, author: "runtime", ...EN_ATTENTE });
  assert.equal(await appeler(commande, [], { BRIGADE_STATE_DIR: repertoire, ...DROIT }).fin, 0);
  await jusqua(() => sudo.lancements().length === 1);
  runtime.arreter("SIGTERM");
  runtime = ouvrir();
  assert.deepEqual(typesDeGestes(runtime.journal), ["deploy.requested", "deploy.launched"]);
  assert.deepEqual(dernierGeste(runtime.journal.base), { lanceLe: gestes(runtime.journal)[1]?.at, avant: SERVIE, cible: TETE, seul: false, essais: 1, issue: null });
});

test("ce que le runtime lit de la box tient à ce que ses scripts écrivent : leurs lignes signées de leur nom, le refus noté à côté des versions, et les codes qu'il sait dire", () => {
  const deploy = (fichier: string) => readFileSync(join(import.meta.dirname, "../deploy", fichier), "utf8");
  const [bascule, geste] = [deploy("brigade-bascule"), deploy("brigade-mise-en-service")];
  // La ligne que la file cite est la dernière qu'un script signe de son nom.
  assert.match(bascule, /^dire\(\) \{ echo "brigade-bascule : \$\*"; \}$/m);
  assert.match(geste, /^dire\(\) \{ echo "brigade-mise-en-service : \$\*"; \}$/m);
  // Le refus, noté avant que la version précédente soit relancée.
  assert.match(bascule, /\[ \$# -gt 0 \] && echo "refusee=\$1" && echo "motif=\$2"\n {2}\} >"\$versions\/bascule"/);
  assert.ok(bascule.indexOf('rendre_compte "$commit" "$refus"') < bascule.indexOf("  if demarrer; then\n    if [ $rejeu = 1 ]; then"));
  // Les codes que les deux scripts déclarent, hors usage et échec sans nom, et
  // hors des deux qui arrêtent le runtime — il ne les lit jamais.
  const codes = (script: string) => [...script.matchAll(/^[A-Z_]+=(\d+)$/gm)].map(([, code]) => Number(code));
  const declares = [...new Set([...codes(bascule), ...codes(geste)])].sort((a, b) => a - b);
  assert.deepEqual(declares, [64, 65, 67, 69, 71, 72, 73, 74, 75, 76, 77]);
  assert.deepEqual(Object.keys(SENS_DES_CODES).map(Number), declares.filter((code) => code !== 73 && code !== 74));
});

test("la commande refuse ce qui n'est pas un de ses gestes, et ne demande rien à un runtime qui ne tourne pas", async (t) => {
  const repertoire = repertoireTemporaire(t);
  for (const args of [["--force"], ["couper"], ["--couper", "annuler"], ["brigade"]]) {
    const refusee = appeler(commande, args, { BRIGADE_STATE_DIR: repertoire, ...DROIT });
    assert.equal(await refusee.fin, 2, args.join(" "));
    assert.match(refusee.sortie(), /^brigade : usage : /m);
  }
  assert.equal(await appeler(commande, [], {}).fin, 2);
  const sansJournal = appeler(commande, [], { BRIGADE_STATE_DIR: repertoire, ...DROIT });
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
  const arrete = appeler(commande, [], { BRIGADE_STATE_DIR: repertoire, ...DROIT });
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
  assert.equal(lignes[3], "demande    aucune — `brigade <projet> mise-en-service` la pose");
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

test("en cuisine : les cooks partent pendant une mise en service — celui qui vole n'est pas attendu ni interrompu, le geste part aussitôt, et la place libérée est reprise pendant qu'il tourne", async (t) => {
  const lieu = cuisine(t, { scenario: "commite-puis-attend", issues: [issue(16), issue(17)] });
  const { journal, repertoire, types, etat, cooks, conclure, heure } = lieu;
  const sudo = avecMiseEnService(t, lieu, "attend");
  // Un cook en vol sur #16 ; #17 attend la place.
  await jusqua(() => cooks().length === 1 && types(16).includes("cook.launched"));

  const demande = appeler(commande, [], { BRIGADE_STATE_DIR: repertoire, ...DROIT });
  assert.equal(await demande.fin, 0);
  assert.match(demande.sortie(), /^en vol     1 cook — /m);
  assert.match(demande.sortie(), /^  #16  brigade  box\/claude  .*  Ticket 16$/m);

  // Le geste part sans attendre que le cook finisse, et ne l'interrompt pas.
  await jusqua(() => sudo.lancements().length === 1);
  assert.deepEqual(sudo.lancements()[0]?.args, ARGUMENTS);
  assert.deepEqual(types(16).filter((type) => ["cook.exited", "cook.interrupted", "guard.tripped"].includes(type)), []);
  // En cours, la file ne dit rien d'une mise en service.
  assert.equal(file(journal, heure.maintenant()), "");

  // Le cook conclut : #17 prend la place pendant que le geste tourne encore.
  conclure();
  await jusqua(() => etat(17) === "taken" && types(17).includes("cook.launched"));
  assert.equal(sudo.lancements().length, 1);
  assert.equal(journal.tout().some(({ type, payload }) => type === "station.held" && (payload as { reason?: string }).reason === "deploy"), false);

  // Le geste rend la main sans avoir rien redémarré : la cuisine n'a rien eu à reprendre.
  sudo.liberer();
  await jusqua(() => typesDeGestes(journal).includes("deploy.exited"));
  assert.equal(sudo.lancements().length, 1);
});

test("en cuisine : un cook dont le lancement tombe pendant une mise en service est lancé — rien n'est refusé ni rendu au rail", async (t) => {
  const lieu = cuisine(t, { setup: "attend", issues: [issue(16)] });
  const { journal, repertoire, cooks, setup, types } = lieu;
  const sudo = avecMiseEnService(t, lieu, "attend");
  // #16 est pris, son setup tourne : aucun cook n'est encore en vol.
  await jusqua(() => setup.appels().length === 1);
  assert.equal(await appeler(commande, [], { BRIGADE_STATE_DIR: repertoire, ...DROIT }).fin, 0);
  await jusqua(() => sudo.lancements().length === 1);

  // Le setup fini, le cook part : le geste de box tourne, personne ne le retient.
  setup.liberer();
  await jusqua(() => cooks().length === 1);
  assert.equal(types(16).filter((type) => type === "cook.launched").length, 1);
  assert.equal(types(16).includes("ticket.released"), false);
  assert.equal(sudo.lancements().length, 1);
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
  const demande = lancer(t, join(SRC, "mettre-en-service-cli.ts"), [], { BRIGADE_STATE_DIR: repertoire, ...DROIT });
  assert.equal(await demande.fin, 0, demande.sortie());
  assert.match(demande.sortie(), /^brigade : mise en service demandée : le runtime lance le geste de box \(`sudo -n -- \/usr\/local\/bin\/brigade-mise-en-service calculus`\)/m);

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

test("sudo n'accorde pas le geste au compte du service : la demande est refusée tout de suite, citant la mise à niveau — aucune demande écrite, aucun geste lancé", async (t) => {
  const { repertoire, journal, sudo, decoller, runtime } = service(t);
  // Un cook en vol : une demande acceptée l'aurait mise en attente du rail calme.
  decoller(7, "run-7", 100);
  journal.ajouter({ project: PROJET, ticket: null, author: "runtime", ...EN_ATTENTE });
  const lien = join(repertoireTemporaire(t), "mise-en-service");
  writeFileSync(join(lien, "..", "sudo-refuse"), "");
  const refusee = appeler(commande, [], { BRIGADE_STATE_DIR: repertoire, BRIGADE_SUDO_BIN: FAUX_SUDO_LISTE, BRIGADE_MISE_EN_SERVICE_LIEN: lien });
  assert.equal(await refusee.fin, 1, refusee.sortie());
  assert.match(refusee.sortie(), /a password is required/);
  assert.match(refusee.sortie(), /sudo install -m 440 \S+brigade-mise-en-service\.sudoers \S+ && sudo visudo -cf/);
  assert.match(refusee.sortie(), /rien n'est demandé, rien n'est redémarré/);
  // Ni la liste de ce qui est en vol, ni la version : rien n'a commencé.
  assert.doesNotMatch(refusee.sortie(), /version {4}/);
  assert.equal(demandeDeMiseEnService(journal.base), null);
  assert.deepEqual(typesDeGestes(journal), []);
  assert.equal(sudo.lancements().length, 0);
  assert.equal(runtime.journal.base.lire<{ n: number }>("SELECT count(*) AS n FROM events WHERE type = 'cook.launched'")[0]?.n, 1);
});

test("sudo accorde le geste : la demande se déroule — le geste part, la version en service est mise à jour", async (t) => {
  // Le geste tient tant que le test lit la demande : sorti, il l'efface.
  const { repertoire, journal, sudo } = service(t, "attend");
  journal.ajouter({ project: PROJET, ticket: null, author: "runtime", ...EN_ATTENTE });
  const demande = appeler(commande, [], { BRIGADE_STATE_DIR: repertoire, ...DROIT });
  assert.equal(await demande.fin, 0, demande.sortie());
  assert.match(demande.sortie(), /mise en service demandée : le runtime lance/);
  await jusqua(() => sudo.lancements().length === 1);
  assert.deepEqual(sudo.lancements()[0]?.args, ARGUMENTS);
  await jusqua(() => demandeDeMiseEnService(journal.base)?.etat === "launched");
});
