// Ce que les cooks partis laissent dans l'état de la cuisine se rend quand la
// machine sature sans cook en vol (#4106) : les gardes du tour, sur un vrai
// runtime, avec un disque et une machine que le test rend.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { brancherGardeFous } from "../../../src/garde-fous.ts";
import { gardesDuTour } from "../../../src/github-seul/garde-fous/garde-fous.ts";
import type { Fichiers } from "../../../src/github-seul/garde-fous/recuperation.ts";
import { configMachine, type Machine } from "../../../src/machine.ts";
import { demarrer } from "../../../src/runtime.ts";
import { repertoireTemporaire } from "../../outils.ts";

const STATION = "box/claude";
const GO = 1024 * 1024 * 1024;
const HEURE = 3_600_000;
const INSTANT = new Date("2026-11-24T12:00:00Z");

// Un disque en mémoire : chemin -> heure de dernière modification. Ce qui s'y
// trouve pèse sur la machine tant que rien n'a été retiré.
function disqueFaux(repertoire: string, contenu: Record<string, number>, options: { listeEchoue?: boolean } = {}) {
  const worktrees = join(repertoire, "worktrees");
  const runs = join(repertoire, "runs");
  const entrees = new Map(Object.entries(contenu).map(([chemin, age]) => [chemin, INSTANT.getTime() - age]));
  const retires: string[] = [];
  let listes = 0;
  const fichiers: Fichiers = {
    lister: (dossier) => {
      listes++;
      if (options.listeEchoue === true) throw Object.assign(new Error("EACCES"), { code: "EACCES" });
      const prefixe = `${dossier}/`;
      const noms = [...entrees.keys()].filter((chemin) => chemin.startsWith(prefixe)).map((chemin) => chemin.slice(prefixe.length));
      if (noms.length === 0 && dossier !== worktrees && dossier !== runs) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return noms;
    },
    modifie: (chemin) => entrees.get(chemin) ?? assert.fail(`unknown ${chemin}`),
    retirer: (chemin) => void (entrees.delete(chemin), retires.push(chemin)),
  };
  // 8 cœurs, de la mémoire à revendre : seul le disque manque tant que ces restes l'occupent.
  const machine = (): Machine => ({ charge: 0, coeurs: 8, memoireDisponible: 16 * GO, memoireTotale: 32 * GO, disqueLibre: retires.length > 0 ? 100 * GO : 4 * GO });
  return { worktrees, runs, fichiers, machine, retires, listes: () => listes, reste: (chemin: string) => entrees.has(chemin) };
}

function gardes(t: TestContext, faire: (repertoire: string) => ReturnType<typeof disqueFaux>) {
  const repertoire = repertoireTemporaire(t);
  const disque = faire(repertoire);
  const runtime = brancherGardeFous({ plafonds: { durationMs: 3_600_000, tokens: 1_000_000, idleMs: 60_000 }, seuilDisjoncteur: 3, graceMs: 2000 }, demarrer({ repertoireEtat: repertoire, projet: "brigade", intervalleVeilleMs: 5 }));
  t.after(() => runtime.arreter("test"));
  const avertis: string[] = [];
  const du = gardesDuTour({ garde: runtime, station: STATION, repertoireEtat: repertoire, arbitre: null, machine: { lire: disque.machine, seuils: configMachine({}) }, fichiers: disque.fichiers, maintenant: () => INSTANT, avertir: (texte) => avertis.push(texte) });
  const faits = (type: string) => runtime.journal.tout().filter((evenement) => evenement.type === type);
  return { du, disque, avertis, faits };
}

test("a station saturated with no cook in flight gives back the worktrees and run files of exited cooks, then takes tickets again (#4106)", async (t) => {
  const { du, disque, avertis, faits } = gardes(t, (repertoire) => {
    const d = (nom: string) => join(repertoire, nom);
    return disqueFaux(repertoire, { [d("worktrees/12-a")]: 5 * HEURE, [d("worktrees/13-b")]: 2 * HEURE, [d("worktrees/14-jeune")]: 60_000, [d("runs/12-a.jsonl")]: 3 * HEURE, [d("runs/14-jeune.jsonl")]: 1000 });
  });
  assert.equal(await du.retenue(0), null);
  assert.deepEqual(disque.retires.map((chemin) => chemin.split("/").slice(-2).join("/")).sort(), ["runs/12-a.jsonl", "worktrees/12-a", "worktrees/13-b"]);
  assert.ok(disque.reste(join(disque.worktrees, "14-jeune")), "a worktree touched a minute ago stays");
  assert.ok(disque.reste(join(disque.runs, "14-jeune.jsonl")));
  // La mesure qui compte est celle d'après : la saturation ne s'écrit pas, et la prise part.
  assert.equal(faits("station.saturated").length, 0);
  assert.equal(faits("station.relieved").length, 0);
  assert.match(avertis.join("\n"), /gave back 3 leftover/);
});

test("a station with a cook in flight leaves every worktree alone, and stays held (#4106)", async (t) => {
  const { du, disque, faits } = gardes(t, (repertoire) => disqueFaux(repertoire, { [join(repertoire, "worktrees/12-a")]: 5 * HEURE }));
  assert.equal(await du.retenue(1), "machine");
  assert.deepEqual(disque.retires, []);
  assert.equal(disque.listes(), 0);
  assert.equal(faits("station.saturated").length, 1);
});

test("the reclaim runs once per gate turn, and again at the next one (#4106)", async (t) => {
  const { du, disque, faits } = gardes(t, (repertoire) => disqueFaux(repertoire, { [join(repertoire, "worktrees/12-a")]: 60_000 }));
  // Rien n'est assez vieux : la machine reste saturée, sans cook.
  await du.retenue(0);
  const apres = disque.listes();
  assert.equal(apres, 2);
  await du.retenue(0);
  assert.equal(disque.listes(), apres);
  await du.redire(0);
  await du.retenue(0);
  assert.equal(disque.listes(), 2 * apres);
  assert.equal(faits("station.saturated").length, 1);
});

test("a disk the reclaim cannot read does not fall the turn: the saturation stands and the failure is said (#4106)", async (t) => {
  const { du, avertis, faits } = gardes(t, (repertoire) => disqueFaux(repertoire, {}, { listeEchoue: true }));
  assert.equal(await du.retenue(0), null);
  assert.equal(faits("station.saturated").length, 1);
  assert.match(avertis.join("\n"), /could not reclaim/);
});
