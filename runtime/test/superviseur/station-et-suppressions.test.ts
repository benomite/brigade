// Le superviseur dans la station, et ce que ses détecteurs retirés laissent derrière eux (#3914) : le manager consulté
// en lecture sur le dossier, le correctif d'un check rouge que la base rouge ne retient pas, un rail qu'aucun ticket ne
// double de lui-même, ni l'issue du disjoncteur qui surveillerait une autre station pour une file disparue, ni une
// alerte d'inertie qui ne serait pas un ticket.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { alerteDeLaCuisine, horsDesTickets } from "../../src/alerte-cuisine/alerte-cuisine.ts";
import { LABEL_DU_DISJONCTEUR, publieurDuDisjoncteur, type ClientDuDisjoncteur } from "../../src/breaker-issue.ts";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { estUneReparation, shaDeBaseRouge } from "../../src/qualite-github.ts";
import type { ConsulterLeSuperviseur } from "../../src/superviseur/brancher.ts";
import { CALIBRE, depotNeuf, FauxGitHub, fauxClient, STATION_DU_DEPOT } from "../faux-github.ts";
import { repertoireTemporaire } from "../outils.ts";

// La marque de la cause qu'un correctif du superviseur porte (`superviseur/github.ts`).
const marqueDeCause = (cause: string) => `<!-- brigade:cause ${cause} -->`;
const MANAGER = { model: "opus", effort: "medium" } as const;
const fin = (code: number, arret: { reason: "tokens"; limit: number; observed: number } | null = null) => Promise.resolve({ code, signal: null, turns: 1, tokens: 1, durationMs: 1, arret, erreur: null });

// La station du dépôt, et le manager qu'elle donne au superviseur.
function station(t: TestContext, lancer: Lancer, manager: boolean) {
  const repertoire = mkdtempSync(join(tmpdir(), "superviseur-station-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  let consulter: ConsulterLeSuperviseur | null = null;
  const faite = stationDuDepot({ ...STATION_DU_DEPOT, github: fauxClient(new FauxGitHub()), depot: depotNeuf(repertoire), flux: repertoire, lancer, avertir: () => {}, ...(manager ? { manager: () => MANAGER } : {}), superviseur: (donne) => (consulter = donne) });
  if ("refus" in faite) throw new Error(faite.refus);
  t.after(() => faite.quitter?.());
  return () => consulter;
}

test("the station gives the supervisor its manager: a read-only run on the brief, whose answer comes back", async (t) => {
  const lances: string[][] = [];
  const consulter = station(t, ({ args, flux }) => {
    lances.push(args);
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: '{"vu": "fine", "gestes": []}' })}\n`);
    return { fin: fin(0) };
  }, true)();
  assert.ok(consulter !== null);
  assert.deepEqual(await consulter("<!-- brigade:superviseur -->\nthe brief"), { message: '{"vu": "fine", "gestes": []}' });
  const [args] = lances as [string[]];
  assert.equal(args[args.indexOf("--tools") + 1], "Read,Grep,Glob", "the manager reads the repo, it writes nothing");
  assert.deepEqual([args[args.indexOf("--model") + 1], args[args.indexOf("--effort") + 1]], ["opus", "medium"]);
});

test("a manager's run that stops on a guard, or fails, gives no answer to read", async (t) => {
  let tour = 0;
  const consulter = station(t, ({ flux }) => {
    tour += 1;
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: tour === 2, result: "half an answer" })}\n`);
    return { fin: tour === 1 ? fin(0, { reason: "tokens", limit: 1, observed: 2 }) : fin(1) };
  }, true)() as ConsulterLeSuperviseur;
  const arrete = await consulter("brief");
  assert.ok("illisible" in arrete && /^the manager's run did not finish: /.test(arrete.illisible), JSON.stringify(arrete));
  const echoue = await consulter("brief");
  assert.ok("illisible" in echoue, JSON.stringify(echoue));
});

test("without a manager's calibration, the station gives the supervisor none", (t) => {
  assert.equal(station(t, () => assert.fail("nothing runs"), false)(), null);
});

test("on a red main, the supervisor's fix ticket for the red check is merged, an older repair too, and any other delivery waits, a fix for a code cause included", async () => {
  const faux = new FauxGitHub();
  faux.feu(10);
  faux.feu(20, CALIBRE, `${marqueDeCause("ci:tests")}\nFix the red \`tests\` check of main.`);
  faux.feu(30, [...CALIBRE, "prio:0"], "<!-- brigade:base-rouge sha=abc1234 -->\n## What fails\n\n- `tests`\n");
  faux.feu(40, CALIBRE, `${marqueDeCause("code:parser")}\nwhy`);
  const a = faux.station("A", { places: 4, avertir: () => {} });
  await a.tour();
  await a.calme();
  faux.base = "red";
  for (let i = 0; i < 4; i += 1) {
    await a.tour();
    await a.calme();
  }
  assert.equal(faux.mergee(20)?.mergeePar, "A");
  assert.equal(faux.mergee(30)?.mergeePar, "A");
  assert.equal(faux.mergee(10), undefined);
  assert.equal(faux.mergee(40), undefined, "a code cause is no repair of the base");
});

test("no ticket jumps the rail on its own: an old `repair-main` label takes its turn by priority and age", async () => {
  const faux = new FauxGitHub();
  faux.feu(7, [...CALIBRE, "repair-main"]);
  faux.feu(5, CALIBRE);
  faux.feu(9, [...CALIBRE, "prio:0"]);
  const a = faux.station("A", { places: 1, avertir: () => {} });
  for (let i = 0; i < 3; i += 1) {
    await a.tour();
    await a.calme();
  }
  assert.deepEqual(faux.cuissons.map(({ issue }) => issue), [9, 5, 7]);
});

test("a repair of main from before the supervisor is still known to the quality figure, by its priority and its red-commit mark", () => {
  const corps = "<!-- brigade:base-rouge sha=abc1234 -->\n## What fails\n\n- `tests`\n";
  assert.equal(shaDeBaseRouge(corps), "abc1234");
  assert.equal(estUneReparation(corps, ["prio:0"]), true);
  assert.equal(estUneReparation("no mark", ["prio:0"]), false);
  assert.equal(estUneReparation(corps, ["fire"]), false);
});

test("the breaker issue no longer watches another station's breaker for the held kitchen: an unchanged state reads GitHub once", async (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  t.after(() => journal.fermer());
  let lectures = 0;
  const client: ClientDuDisjoncteur = {
    ouvertesAuLabel: async (label) => ((lectures += 1), label === LABEL_DU_DISJONCTEUR ? [] : []),
    assurerLabel: async () => {},
    creer: async () => 1,
    commenter: async () => {},
    fermer: async () => {},
  } as ClientDuDisjoncteur;
  // `autre` : ce que la retenue de la cuisine lisait, que le publieur ne tient plus.
  const publieur = publieurDuDisjoncteur(journal.base, "shop", { client, station: "box", autre: { depuis: null } } as never);
  await publieur.passer("tick");
  await publieur.passer("tick");
  await publieur.passer("tick");
  assert.equal(lectures, 1);
});

test("an issue titled as an old idle-kitchen alert is a ticket like any other; only the breaker issue is not", () => {
  const ancienne = alerteDeLaCuisine({ title: "The kitchen is idle: no merge for 90 minutes with 1 cookable ticket(s) (empty-rail)", labels: [], body: "" });
  assert.equal(ancienne, null);
  assert.equal(horsDesTickets(ancienne, "benomite/secondes"), false);
  assert.equal(horsDesTickets("disjoncteur", "benomite/secondes"), true);
});

// Les modules des détecteurs que le superviseur remplace (lignes 2, 3, 4, 4b, 10a, 10b et 10c de l'inventaire de la spec
// 2026-11-20-kitchen-spinning) : la cuisine retenue, le rail bloqué, la cuisine inerte, l'urgence, les alertes du rail, les
// tickets de boucle et la réparation de main ouverte d'elle-même.
const RETIRES = ["alerte-urgence.ts", "urgence.ts", "events/emergency.ts", "projections/emergency.ts", "attente-du-rail/alertes.ts", "base-rouge", "reparation-base", "relance-main-rouge.ts", "carte-ci-windows.ts", "cuisine-retenue-refus.ts", "guerison/cuisine-inerte.ts", "rail-bloque", "retenue"];
// Ce qui les nommerait encore : leurs chemins, leurs marques et leurs noms.
const LEURS_NOMS = /alerte-urgence|\/urgence\.ts|emergency\.ts|attente-du-rail\/alertes|base-rouge\/|reparation-base\/|relance-main-rouge|carte-ci-windows|cuisine-retenue-refus|cuisine-inerte|rail-bloque|[^-]retenue\/|signalerInertie|MARQUE_D_INERTIE|LABEL_REPARATION_DE_MAIN|alertesDuRail|brigade:boucle/;

test("the removed detectors are gone from the runtime: neither their modules nor any reference to them", () => {
  const SRC = join(import.meta.dirname, "../../src");
  assert.deepEqual(RETIRES.filter((chemin) => existsSync(join(SRC, chemin))), []);
  const fichiers = (readdirSync(SRC, { recursive: true }) as string[]).filter((fichier) => fichier.endsWith(".ts"));
  assert.ok(fichiers.length > 100, "the runtime's sources are read");
  const restes = fichiers.flatMap((fichier) => readFileSync(join(SRC, fichier), "utf8").split("\n").flatMap((ligne, rang) => (LEURS_NOMS.test(ligne) ? [`${fichier}:${rang + 1}: ${ligne.trim()}`] : [])));
  assert.deepEqual(restes, []);
});

