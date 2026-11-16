// Le moteur de repli d'une station (`repli/moteur-actif.ts`, #3745) : le
// quota du moteur principal épuisé, les cooks suivants partent sur
// `fallbackEngine`, ceux qui tournent continuent, et le principal revient
// de lui-même à son heure de retour.
//
// Les gardes du tour sont les vraies (`gardesDuTour`), sur un vrai runtime et
// ses garde-fous : seul le moteur est faux — la doublure de `claude` —, et le
// moteur que chaque cook reçoit se lit dans son environnement.
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { brancherGardeFous } from "../../src/garde-fous.ts";
import { gardesDuTour } from "../../src/github-seul/garde-fous/garde-fous.ts";
import { etatStation } from "../../src/projections/stations.ts";
import { activeEngine, direLeStatut, moteursDeLaStation, VARIABLE_DU_MOTEUR, VARIABLE_DU_REPLI } from "../../src/repli/moteur-actif.ts";
import { demarrer } from "../../src/runtime.ts";
import { ENV_ENFANT, FAUX_CLAUDE, repertoireTemporaire } from "../outils.ts";

const STATION = "box/claude";

function cuisine(t: TestContext, options: { repli?: string; maintenant?: () => Date } = {}) {
  const repertoire = repertoireTemporaire(t);
  const runtime = brancherGardeFous({ plafonds: { durationMs: 3_600_000, tokens: 1_000_000, idleMs: 60_000 }, seuilDisjoncteur: 3, graceMs: 2000 }, demarrer({ repertoireEtat: repertoire, projet: "brigade", intervalleVeilleMs: 5 }));
  t.after(() => runtime.arreter("test"));
  // Le moteur que chaque lancement a reçu, dans l'ordre.
  const moteurs: Array<string | undefined> = [];
  const garde = { journal: runtime.journal, projet: runtime.projet, lancer: (demande: Parameters<typeof runtime.lancer>[0]) => {
    moteurs.push(demande.env?.[VARIABLE_DU_MOTEUR]);
    return runtime.lancer(demande);
  } };
  const avertis: string[] = [];
  const gardes = gardesDuTour({ garde, station: STATION, repertoireEtat: repertoire, arbitre: null, avertir: (texte) => avertis.push(texte), env: options.repli === undefined ? {} : { [VARIABLE_DU_REPLI]: options.repli }, ...(options.maintenant === undefined ? {} : { maintenant: options.maintenant }) });
  let rang = 0;
  // Un cook du tour, s'il n'est pas retenu : la doublure de `claude` joue `scenario`.
  const cook = async (scenario: string, enVol: number, env: Record<string, string> = {}) => {
    const retenue = await gardes.retenue(enVol);
    if (retenue !== null) return { retenue };
    rang += 1;
    return { lance: gardes.lancer({ commande: FAUX_CLAUDE, args: [], cwd: repertoire, env: { ...ENV_ENFANT, FAUX_CLAUDE: scenario, ...env }, flux: join(repertoire, `${rang}-github.flux.jsonl`), ticket: rang }) };
  };
  // Un cook qui part : sa retenue est un échec du test.
  const partir = async (scenario: string, enVol: number, env: Record<string, string> = {}) => {
    const fait = await cook(scenario, enVol, env);
    if ("retenue" in fait) return assert.fail(`the station is held: ${fait.retenue}`);
    return fait.lance;
  };
  return { repertoire, runtime, moteurs, avertis, cook, partir };
}

test("the main engine reports its quota exhausted: the next cook runs on fallbackEngine, and the cook already running is not stopped", async (t) => {
  const { repertoire, runtime, moteurs, avertis, partir } = cuisine(t, { repli: "api" });
  const feu = join(repertoire, "feu");

  // A tourne sur le principal, et attend le feu pour finir.
  const a = await partir("triage-au-feu", 0, { FAUX_CLAUDE_FEU: feu });
  let aFini = false;
  const finA = a.fin.then((fin) => ((aFini = true), fin));

  // B, sur le principal lui aussi, bute sur le quota.
  const b = await partir("quota", 1);
  await b.fin;
  assert.ok((etatStation(runtime.journal.base, STATION)?.quotaUntil ?? "") > new Date().toISOString());

  // Le cook suivant n'est pas retenu : il part sur le repli.
  const c = await partir("fini", 1);
  await c.fin;
  assert.deepEqual(moteurs, ["claude", "claude", "api"]);
  assert.ok(avertis.some((texte) => /station box\/claude cooks on api: the quota of claude is reached until \d{4}-/.test(texte)), avertis.join("\n"));

  // A tourne encore : rien ne l'a arrêté, et il finit normalement.
  assert.equal(aFini, false);
  assert.ok(!existsSync(feu));
  writeFileSync(feu, "");
  const fin = await finA;
  assert.equal(fin.arret, null);
  assert.equal(fin.code, 0);
});

test("once the main engine's reset date has passed, the next cook is back on it, with no manual step", async (t) => {
  let horloge = new Date("2026-11-16T10:00:00Z");
  const { moteurs, avertis, partir } = cuisine(t, { repli: "api", maintenant: () => horloge });

  const quota = await partir("quota", 0);
  await quota.fin;
  const surLeRepli = await partir("fini", 0);
  await surLeRepli.fin;

  // L'heure de retour passée (une heure, le flux n'en dit pas de plus tardive).
  horloge = new Date("2026-11-16T11:00:01Z");
  const deRetour = await partir("fini", 0);
  await deRetour.fin;
  assert.deepEqual(moteurs, ["claude", "api", "claude"]);
  assert.equal(avertis.at(-1), "brigade : station box/claude cooks on claude");
});

test("with no fallbackEngine, an exhausted quota holds the station as before, and the status says so", async (t) => {
  const { moteurs, avertis, cook, partir } = cuisine(t);
  const quota = await partir("quota", 0);
  await quota.fin;

  assert.deepEqual(await cook("fini", 0), { retenue: "quota" });
  assert.deepEqual(moteurs, ["claude"]);
  assert.ok(avertis.some((texte) => /station box\/claude cooks nothing: the quota of claude is reached until \d{4}-.*, and the station has no fallback engine/.test(texte)), avertis.join("\n"));

  const statut = activeEngine({ name: STATION, engine: "claude", fallbackEngine: null, engineBlockedUntil: "2026-11-20T08:00:00.000Z", fallbackBlockedUntil: null }, new Date("2026-11-16T10:00:00Z"));
  assert.deepEqual(statut, { engine: null, fallback: false, blocked: true, blockedUntil: "2026-11-20T08:00:00.000Z" });
});

test("the status exposes the active engine, the fallback flag and the date until which the main engine is blocked", () => {
  const station = { name: STATION, engine: "claude", fallbackEngine: "api", engineBlockedUntil: "2026-11-20T08:00:00.000Z", fallbackBlockedUntil: null };
  const maintenant = new Date("2026-11-16T10:00:00Z");

  const statut = activeEngine(station, maintenant);
  assert.deepEqual(statut, { engine: "api", fallback: true, blocked: false, blockedUntil: "2026-11-20T08:00:00.000Z" });
  assert.equal(direLeStatut(station, statut), "station box/claude cooks on api: the quota of claude is reached until 2026-11-20T08:00:00.000Z");

  // Le principal libre : ni repli, ni date.
  assert.deepEqual(activeEngine({ ...station, engineBlockedUntil: null }, maintenant), { engine: "claude", fallback: false, blocked: false, blockedUntil: null });
  // Le repli épuisé lui aussi : retenue jusqu'au premier des deux retours.
  assert.deepEqual(activeEngine({ ...station, fallbackBlockedUntil: "2026-11-17T08:00:00.000Z" }, maintenant), { engine: null, fallback: false, blocked: true, blockedUntil: "2026-11-17T08:00:00.000Z" });
});

test("a fallbackEngine that is not an engine name, or is the main engine itself, is set aside and said: the station runs with no fallback", () => {
  assert.deepEqual(moteursDeLaStation(STATION, {}), { engine: "claude", fallbackEngine: null, refus: null });
  assert.deepEqual(moteursDeLaStation(STATION, { [VARIABLE_DU_REPLI]: "codex" }), { engine: "claude", fallbackEngine: "codex", refus: null });
  const meme = moteursDeLaStation(STATION, { [VARIABLE_DU_REPLI]: "claude" });
  assert.equal(meme.fallbackEngine, null);
  assert.match(meme.refus ?? "", /is the main engine of station box\/claude itself/);
  const illisible = moteursDeLaStation(STATION, { [VARIABLE_DU_REPLI]: "API Key" });
  assert.equal(illisible.fallbackEngine, null);
  assert.match(illisible.refus ?? "", /is not an engine name/);
});
