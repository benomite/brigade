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
import type { Lu, Rendu } from "../../src/box.ts";
import { ecrireUnRecurrent, lireLesRecurrents, recurrentLu, type Recurrent } from "../../src/vue/recurrents/recurrents-box.ts";
import type { Pont } from "../../src/vue/pont.d.ts";
import { RECURRENTS } from "./fixture.ts";

const APP = join(import.meta.dirname, "..", "..");
const BOX: Lu = { nom: "parade", cuisine: { locale: { node: "node", runtime: "/runtime", racine: "/station", env: {} } } };
const rendu = (sortie: string, code: number | null = null, erreurs = ""): Rendu => ({
  lance: "$ node geste.ts parade recurring",
  erreur: code === null ? null : (Object.assign(new Error(`exit ${code}`), { code }) as ExecFileException),
  sortie,
  erreurs,
});
// Un lanceur qui retient les commandes et rend ce qu'on lui donne.
function lanceur(rendre: Rendu) {
  const lancees: string[] = [];
  return { lancees, lancer: async (_: Lu, commande: string) => (lancees.push(commande), rendre) };
}
const [QUOTIDIEN, HEBDO] = RECURRENTS as [Recurrent, Recurrent, ...Recurrent[]];

describe("les tickets récurrents du projet, par la commande `recurring`", () => {
  test("la lecture rend chaque ticket récurrent de la forme du runtime, tel quel", async () => {
    const { lancees, lancer } = lanceur(rendu(`${JSON.stringify({ recurring: RECURRENTS })}\n`));
    assert.deepEqual(await lireLesRecurrents("parade", BOX, lancer), RECURRENTS);
    assert.deepEqual(lancees, ["recurring"]);
    assert.deepEqual(await lireLesRecurrents("parade", BOX, lanceur(rendu('{"recurring":[]}')).lancer), []);
  });

  test("une lecture qui échoue, illisible, d'un runtime trop vieux ou sans station se dit, sans liste inventée", async () => {
    const echec = await lireLesRecurrents("parade", BOX, lanceur(rendu("", 1, "brigade: the recurring tickets are not read — recurring.json is not valid JSON")).lancer);
    assert.ok(!Array.isArray(echec) && echec.sans === "recurring tickets unavailable" && echec.detail?.includes("not valid JSON"));
    const illisible = await lireLesRecurrents("parade", BOX, lanceur(rendu("pas du json")).lancer);
    assert.ok(!Array.isArray(illisible) && illisible.sans === "recurring tickets unavailable");
    // Un seul ticket qui ne se lit pas : la liste n'en montre pas une partie comme si c'était tout.
    const boiteux = await lireLesRecurrents("parade", BOX, lanceur(rendu(JSON.stringify({ recurring: [QUOTIDIEN, { ...HEBDO, rhythm: { kind: "weekly", weekday: 9 } }] }))).lancer);
    assert.ok(!Array.isArray(boiteux) && boiteux.sans === "recurring tickets unavailable");
    const vieux = await lireLesRecurrents("parade", BOX, lanceur(rendu("", 66, "recurring is not a runtime command")).lancer);
    assert.ok(!Array.isArray(vieux) && /update it/.test(vieux.sans));
    const { lancees, lancer } = lanceur(rendu("{}"));
    const sansStation = await lireLesRecurrents("parade", undefined, lancer);
    assert.ok(!Array.isArray(sansStation) && /has no station/.test(sansStation.sans));
    assert.deepEqual(lancees, []);
  });

  test("un ticket récurrent se lit sur la forme du runtime, et rien d'autre", () => {
    assert.deepEqual(recurrentLu(HEBDO), HEBDO);
    assert.deepEqual(recurrentLu({ ...QUOTIDIEN, body: undefined }), { ...QUOTIDIEN, body: "" });
    for (const boiteux of [null, [], { ...QUOTIDIEN, id: "a b" }, { ...QUOTIDIEN, title: " " }, { ...QUOTIDIEN, paused: "no" }, { ...QUOTIDIEN, nextDate: "Oct 13" }, { ...QUOTIDIEN, rhythm: { kind: "yearly" } }, { ...QUOTIDIEN, rhythm: { kind: "monthly", dayOfMonth: 32 } }]) {
      assert.equal(recurrentLu(boiteux), null, JSON.stringify(boiteux));
    }
  });

  test("suspendre et reprendre rendent le ticket changé ; retirer rend son retrait", async () => {
    const suspendu = { ...QUOTIDIEN, paused: true };
    const pause = lanceur(rendu(`${JSON.stringify({ ok: true, recurring: suspendu })}\n`));
    assert.deepEqual(await ecrireUnRecurrent("parade", BOX, "pause", QUOTIDIEN.id, pause.lancer), { recurrent: suspendu });
    assert.deepEqual(pause.lancees, [`recurring pause ${QUOTIDIEN.id}`]);
    const reprise = lanceur(rendu(JSON.stringify({ ok: true, recurring: QUOTIDIEN })));
    assert.deepEqual(await ecrireUnRecurrent("parade", BOX, "resume", QUOTIDIEN.id, reprise.lancer), { recurrent: QUOTIDIEN });
    assert.deepEqual(reprise.lancees, [`recurring resume ${QUOTIDIEN.id}`]);
    const retrait = lanceur(rendu('{"ok":true}\n'));
    assert.deepEqual(await ecrireUnRecurrent("parade", BOX, "remove", HEBDO.id, retrait.lancer), { retire: true });
    assert.deepEqual(retrait.lancees, [`recurring remove ${HEBDO.id}`]);
  });

  test("un refus du runtime se dit en sa ligne ; une réponse illisible ou un runtime trop vieux se disent, sans changement deviné", async () => {
    const refus = await ecrireUnRecurrent("parade", BOX, "pause", "zz", lanceur(rendu('{"ok":false,"message":"no recurring ticket zz"}', 1)).lancer);
    assert.ok("refus" in refus && refus.refus === "no recurring ticket zz");
    const illisible = await ecrireUnRecurrent("parade", BOX, "resume", QUOTIDIEN.id, lanceur(rendu('{"ok":true,"recurring":{"id":"x"}}')).lancer);
    assert.ok("refus" in illisible && /could not be read/.test(illisible.refus));
    const vieux = await ecrireUnRecurrent("parade", BOX, "remove", QUOTIDIEN.id, lanceur(rendu("", 66, "recurring is not a runtime command")).lancer);
    assert.ok("refus" in vieux && /update it/.test(vieux.refus));
  });

  test("rien ne part pour un geste inconnu, un identifiant qui n'en est pas un, ou un projet sans station", async () => {
    const { lancees, lancer } = lanceur(rendu('{"ok":true}'));
    for (const [geste, id] of [["delete", QUOTIDIEN.id], ["pause", "a1; rm -rf /"], ["pause", ""], ["remove", 3]] as const) {
      assert.ok("refus" in (await ecrireUnRecurrent("parade", BOX, geste, id, lancer)), `${geste} ${id}`);
    }
    assert.ok("refus" in (await ecrireUnRecurrent("parade", undefined, "pause", QUOTIDIEN.id, lancer)));
    assert.deepEqual(lancees, []);
  });
});

// Le préchargement tel que l'app le charge, son `electron` feint : `invoke` va aux canaux du process principal.
function pontDe(canaux: Record<string, (...args: unknown[]) => unknown>): Pont {
  let expose: Pont | undefined;
  const electron = {
    contextBridge: { exposeInMainWorld: (_: string, pont: Pont) => void (expose = pont) },
    ipcRenderer: { invoke: (canal: string, ...args: unknown[]) => canaux[canal]!(...args), on: () => {} },
  };
  const source = readFileSync(join(APP, "src", "preload.cjs"), "utf8");
  (runInThisContext(`(function (require) {${source}\n})`) as (require: (nom: string) => unknown) => void)(() => electron);
  return expose!;
}

describe("le câblage des tickets récurrents", () => {
  test("le préchargement porte la lecture et le geste, avec le projet, le geste et l'identifiant", async () => {
    const recus: unknown[][] = [];
    const pont = pontDe({ listerLesRecurrents: (...args) => (recus.push(["listerLesRecurrents", ...args]), RECURRENTS), changerUnRecurrent: (...args) => (recus.push(["changerUnRecurrent", ...args]), { retire: true }) });
    assert.deepEqual(await pont.listerLesRecurrents?.("parade"), RECURRENTS);
    assert.deepEqual(await pont.changerUnRecurrent?.("parade", "remove", HEBDO.id), { retire: true });
    assert.deepEqual(recus, [
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
