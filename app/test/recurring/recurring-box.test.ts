// Les tickets récurrents du projet, côté process principal (#3231) : lus et changés par la commande du runtime `recurring`
// (#3230) là où la cuisine du projet tourne, sur la forme {id, title, body, rhythm, paused, nextDate}. Un geste rend le
// ticket changé, son retrait ou la ligne du refus ; une sortie illisible, un runtime trop vieux ou un projet sans station
// ne se devinent pas : ils se disent. Le préchargement porte les deux canaux, que le process principal tient.
import assert from "node:assert/strict";
import type { ExecFileException } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { runInThisContext } from "node:vm";
import type { Read, Rendered } from "../../src/box.ts";
import { writeOneRecurring, readTheRecurring, recurringRead, type Recurring } from "../../src/vue/recurring/recurring-box.ts";
import type { Bridge } from "../../src/vue/bridge.d.ts";
import { RECURRING } from "./fixture.ts";

const APP = join(import.meta.dirname, "..", "..");
const BOX: Read = { nom: "parade", cuisine: { locale: { node: "node", runtime: "/runtime", racine: "/station", env: {} } } };
const rendered = (output: string, code: number | null = null, errors = ""): Rendered => ({
  lance: "$ node geste.ts parade recurring",
  erreur: code === null ? null : (Object.assign(new Error(`exit ${code}`), { code }) as ExecFileException),
  sortie: output,
  erreurs: errors,
});
// Un lanceur qui retient les commandes et rend ce qu'on lui donne.
function launcher(render: Rendered) {
  const launched: string[] = [];
  return { lancees: launched, lancer: async (_: Read, command: string) => (launched.push(command), render) };
}
const [QUOTIDIEN, HEBDO] = RECURRING as [Recurring, Recurring, ...Recurring[]];

describe("les tickets récurrents du projet, par la commande `recurring`", () => {
  test("la lecture rend chaque ticket récurrent de la forme du runtime, tel quel", async () => {
    const { lancees: launched, lancer: launch } = launcher(rendered(`${JSON.stringify({ recurring: RECURRING })}\n`));
    assert.deepEqual(await readTheRecurring("parade", BOX, launch), RECURRING);
    assert.deepEqual(launched, ["recurring"]);
    assert.deepEqual(await readTheRecurring("parade", BOX, launcher(rendered('{"recurring":[]}')).lancer), []);
  });

  test("une lecture qui échoue, illisible, d'un runtime trop vieux ou sans station se dit, sans liste inventée", async () => {
    const failure = await readTheRecurring("parade", BOX, launcher(rendered("", 1, "brigade: the recurring tickets are not read — recurring.json is not valid JSON")).lancer);
    assert.ok(!Array.isArray(failure) && failure.sans === "recurring tickets unavailable" && failure.detail?.includes("not valid JSON"));
    const unreadable = await readTheRecurring("parade", BOX, launcher(rendered("pas du json")).lancer);
    assert.ok(!Array.isArray(unreadable) && unreadable.sans === "recurring tickets unavailable");
    // Un seul ticket qui ne se lit pas : la liste n'en montre pas une partie comme si c'était tout.
    const lame = await readTheRecurring("parade", BOX, launcher(rendered(JSON.stringify({ recurring: [QUOTIDIEN, { ...HEBDO, rhythm: { kind: "weekly", weekday: 9 } }] }))).lancer);
    assert.ok(!Array.isArray(lame) && lame.sans === "recurring tickets unavailable");
    const old = await readTheRecurring("parade", BOX, launcher(rendered("", 66, "recurring is not a runtime command")).lancer);
    assert.ok(!Array.isArray(old) && /update it/.test(old.sans));
    const { lancees: launched, lancer: launch } = launcher(rendered("{}"));
    const withoutStation = await readTheRecurring("parade", undefined, launch);
    assert.ok(!Array.isArray(withoutStation) && /has no station/.test(withoutStation.sans));
    assert.deepEqual(launched, []);
  });

  test("un ticket récurrent se lit sur la forme du runtime, et rien d'autre", () => {
    assert.deepEqual(recurringRead(HEBDO), HEBDO);
    assert.deepEqual(recurringRead({ ...QUOTIDIEN, body: undefined }), { ...QUOTIDIEN, body: "" });
    for (const lame of [null, [], { ...QUOTIDIEN, id: "a b" }, { ...QUOTIDIEN, title: " " }, { ...QUOTIDIEN, paused: "no" }, { ...QUOTIDIEN, nextDate: "Oct 13" }, { ...QUOTIDIEN, rhythm: { kind: "yearly" } }, { ...QUOTIDIEN, rhythm: { kind: "monthly", dayOfMonth: 32 } }]) {
      assert.equal(recurringRead(lame), null, JSON.stringify(lame));
    }
  });

  test("suspendre et reprendre rendent le ticket changé ; retirer rend son retrait", async () => {
    const suspended = { ...QUOTIDIEN, paused: true };
    const pause = launcher(rendered(`${JSON.stringify({ ok: true, recurring: suspended })}\n`));
    assert.deepEqual(await writeOneRecurring("parade", BOX, "pause", QUOTIDIEN.id, pause.lancer), { recurrent: suspended });
    assert.deepEqual(pause.lancees, [`recurring pause ${QUOTIDIEN.id}`]);
    const resumption = launcher(rendered(JSON.stringify({ ok: true, recurring: QUOTIDIEN })));
    assert.deepEqual(await writeOneRecurring("parade", BOX, "resume", QUOTIDIEN.id, resumption.lancer), { recurrent: QUOTIDIEN });
    assert.deepEqual(resumption.lancees, [`recurring resume ${QUOTIDIEN.id}`]);
    const removal = launcher(rendered('{"ok":true}\n'));
    assert.deepEqual(await writeOneRecurring("parade", BOX, "remove", HEBDO.id, removal.lancer), { retire: true });
    assert.deepEqual(removal.lancees, [`recurring remove ${HEBDO.id}`]);
  });

  test("un refus du runtime se dit en sa ligne ; une réponse illisible ou un runtime trop vieux se disent, sans changement deviné", async () => {
    const refusal = await writeOneRecurring("parade", BOX, "pause", "zz", launcher(rendered('{"ok":false,"message":"no recurring ticket zz"}', 1)).lancer);
    assert.ok("refus" in refusal && refusal.refus === "no recurring ticket zz");
    const unreadable = await writeOneRecurring("parade", BOX, "resume", QUOTIDIEN.id, launcher(rendered('{"ok":true,"recurring":{"id":"x"}}')).lancer);
    assert.ok("refus" in unreadable && /could not be read/.test(unreadable.refus));
    const old = await writeOneRecurring("parade", BOX, "remove", QUOTIDIEN.id, launcher(rendered("", 66, "recurring is not a runtime command")).lancer);
    assert.ok("refus" in old && /update it/.test(old.refus));
  });

  test("rien ne part pour un geste inconnu, un identifiant qui n'en est pas un, ou un projet sans station", async () => {
    const { lancees: launched, lancer: launch } = launcher(rendered('{"ok":true}'));
    for (const [action, id] of [["delete", QUOTIDIEN.id], ["pause", "a1; rm -rf /"], ["pause", ""], ["remove", 3]] as const) {
      assert.ok("refus" in (await writeOneRecurring("parade", BOX, action, id, launch)), `${action} ${id}`);
    }
    assert.ok("refus" in (await writeOneRecurring("parade", undefined, "pause", QUOTIDIEN.id, launch)));
    assert.deepEqual(launched, []);
  });
});

// Le préchargement tel que l'app le charge, son `electron` feint : `invoke` va aux canaux du process principal.
function bridgeOf(channels: Record<string, (...args: unknown[]) => unknown>): Bridge {
  let expose: Bridge | undefined;
  const electron = {
    contextBridge: { exposeInMainWorld: (_: string, bridge: Bridge) => void (expose = bridge) },
    ipcRenderer: { invoke: (channel: string, ...args: unknown[]) => channels[channel]!(...args), on: () => {} },
  };
  const source = readFileSync(join(APP, "src", "preload.cjs"), "utf8");
  (runInThisContext(`(function (require) {${source}\n})`) as (require: (name: string) => unknown) => void)(() => electron);
  return expose!;
}

describe("le câblage des tickets récurrents", () => {
  test("le préchargement porte la lecture et le geste, avec le projet, le geste et l'identifiant", async () => {
    const receivedOnes: unknown[][] = [];
    const bridge = bridgeOf({ listerLesRecurrents: (...args) => (receivedOnes.push(["listerLesRecurrents", ...args]), RECURRING), changerUnRecurrent: (...args) => (receivedOnes.push(["changerUnRecurrent", ...args]), { retire: true }) });
    assert.deepEqual(await bridge.listerLesRecurrents?.("parade"), RECURRING);
    assert.deepEqual(await bridge.changerUnRecurrent?.("parade", "remove", HEBDO.id), { retire: true });
    assert.deepEqual(receivedOnes, [
      ["listerLesRecurrents", "parade"],
      ["changerUnRecurrent", "parade", "remove", HEBDO.id],
    ]);
  });

  test("le process principal tient les deux canaux, et les passe au runtime du projet par `recurring`", () => {
    const main = readFileSync(join(APP, "src", "main.ts"), "utf8");
    assert.match(main, /import \{ ecrireUnRecurrent, lireLesRecurrents \} from "\.\/vue\/recurrents\/recurrents-box\.ts";/);
    assert.match(main, /ipcMain\.handle\("listerLesRecurrents", [\s\S]*?lireLesRecurrents\(vise\.nom, lu, lancerSurLaCuisine\)/);
    assert.match(main, /ipcMain\.handle\("changerUnRecurrent", [\s\S]*?ecrireUnRecurrent\(vise\.nom, lu, geste, id, lancerSurLaCuisine\)/);
  });
});
