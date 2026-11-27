// Les explications des mots de la cuisine, côté process principal (#3308) : ce que le chef de cet ordinateur en a vu se lit,
// se marque et s'efface par la commande du runtime `explanations`, là où la cuisine du projet tourne, sous son compte
// GitHub — le registre est par chef, pas par appareil. Une sortie illisible, un runtime trop vieux, un projet sans station
// ou un compte qui ne se lit pas se disent : jamais lus comme un registre vide. Le préchargement porte les trois canaux, que
// le process principal tient.
import assert from "node:assert/strict";
import type { ExecFileException } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { runInThisContext } from "node:vm";
import type { Read, Rendered } from "../../src/box.ts";
import { writeTheExplanations, readTheExplanations } from "../../src/vue/explanations/explanations-box.ts";
import type { Bridge } from "../../src/vue/bridge.d.ts";

const APP = join(import.meta.dirname, "..", "..");
const BOX: Read = { nom: "parade", cuisine: { locale: { node: "node", runtime: "/runtime", racine: "/station", env: {} } } };
const rendered = (output: string, code: number | null = null, errors = ""): Rendered => ({
  lance: "$ node geste.ts parade explanations",
  erreur: code === null ? null : (Object.assign(new Error(`exit ${code}`), { code }) as ExecFileException),
  sortie: output,
  erreurs: errors,
});
function launcher(render: Rendered) {
  const launched: string[] = [];
  return { lancees: launched, lancer: async (_: Read, command: string) => (launched.push(command), render) };
}
const ALICE = async () => "alice";

describe("le registre des explications, par la commande `explanations`", () => {
  test("la lecture passe le compte GitHub de cet ordinateur, et rend les mots vus", async () => {
    const { lancees: launched, lancer: launch } = launcher(rendered('{"seen":["rail","WAITING"]}\n'));
    assert.deepEqual(await readTheExplanations("parade", BOX, ALICE, launch), { vus: ["rail", "WAITING"] });
    assert.deepEqual(launched, ["explanations --chef alice"]);
    assert.deepEqual(await readTheExplanations("parade", BOX, ALICE, launcher(rendered('{"seen":[]}')).lancer), { vus: [] });
  });

  test("un mot vu, et tout effacé : chacun sous le compte, et ce que le runtime rend", async () => {
    const seenOne = launcher(rendered('{"ok":true,"seen":["pass"]}'));
    assert.deepEqual(await writeTheExplanations("parade", BOX, ALICE, { vu: "pass" }, seenOne.lancer), { vus: ["pass"] });
    assert.deepEqual(seenOne.lancees, ["explanations seen pass --chef alice"]);
    const erased = launcher(rendered('{"ok":true,"seen":[]}'));
    assert.deepEqual(await writeTheExplanations("parade", BOX, ALICE, { effacer: true }, erased.lancer), { vus: [] });
    assert.deepEqual(erased.lancees, ["explanations reset --chef alice"]);
  });

  test("une lecture qui échoue, illisible, d'un runtime trop vieux, sans station ou sans compte se dit — jamais un registre vide", async () => {
    const failure = await readTheExplanations("parade", BOX, ALICE, launcher(rendered("", 1, "brigade: the explanations are not read — explanations.json is not JSON")).lancer);
    assert.ok("sans" in failure && failure.sans === "explanations unavailable" && failure.detail?.includes("is not JSON"));
    for (const output of ["pas du json", '{"seen":["kitchen"]}', '{"seen":"rail"}']) {
      const unreadable = await readTheExplanations("parade", BOX, ALICE, launcher(rendered(output)).lancer);
      assert.ok("sans" in unreadable && unreadable.sans === "explanations unavailable", output);
    }
    const old = await readTheExplanations("parade", BOX, ALICE, launcher(rendered("", 66, "explanations is not a runtime command")).lancer);
    assert.ok("sans" in old && /update it/.test(old.sans));
    const { lancees: launched, lancer: launch } = launcher(rendered("{}"));
    const withoutStation = await readTheExplanations("parade", undefined, ALICE, launch);
    assert.ok("sans" in withoutStation && /has no station/.test(withoutStation.sans));
    for (const account of [async () => null, async () => "../x", async () => Promise.reject(new Error("gh absent"))]) {
      const withoutAccount = await readTheExplanations("parade", BOX, account, launch);
      assert.ok("sans" in withoutAccount && /no GitHub account is signed in/.test(withoutAccount.sans));
    }
    assert.deepEqual(launched, []);
  });

  test("une écriture refusée par le runtime dit sa ligne ; illisible, trop vieille, sans station, sans compte ou d'un autre mot, elle n'est pas un succès", async () => {
    const refusal = await writeTheExplanations("parade", BOX, ALICE, { vu: "rail" }, launcher(rendered('{"ok":false,"message":"explanations.json is not JSON"}', 1)).lancer);
    assert.ok("refus" in refusal && refusal.refus === "explanations.json is not JSON");
    const unreadable = await writeTheExplanations("parade", BOX, ALICE, { effacer: true }, launcher(rendered("rien")).lancer);
    assert.ok("refus" in unreadable && /could not be read/.test(unreadable.refus));
    const old = await writeTheExplanations("parade", BOX, ALICE, { effacer: true }, launcher(rendered("", 66)).lancer);
    assert.ok("refus" in old && /update it/.test(old.refus));
    const { lancees: launched, lancer: launch } = launcher(rendered('{"ok":true,"seen":[]}'));
    assert.ok("refus" in (await writeTheExplanations("parade", BOX, ALICE, { vu: "kitchen" }, launch)));
    assert.ok("refus" in (await writeTheExplanations("parade", BOX, ALICE, { vu: "rail; rm -rf /" }, launch)));
    assert.ok("refus" in (await writeTheExplanations("parade", undefined, ALICE, { effacer: true }, launch)));
    assert.ok("refus" in (await writeTheExplanations("parade", BOX, async () => null, { vu: "rail" }, launch)));
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

describe("le câblage des explications", () => {
  test("le préchargement porte la lecture, le mot vu et le geste de Settings, avec le projet et le mot", async () => {
    const receivedOnes: unknown[][] = [];
    const channel = (name: string, rendered: unknown) => (...args: unknown[]) => (receivedOnes.push([name, ...args]), rendered);
    const bridge = bridgeOf({ lireLesExplications: channel("lireLesExplications", { vus: [] }), marquerUneExplication: channel("marquerUneExplication", { vus: ["cook"] }), remontrerLesExplications: channel("remontrerLesExplications", { vus: [] }) });
    assert.deepEqual(await bridge.lireLesExplications?.("parade"), { vus: [] });
    assert.deepEqual(await bridge.marquerUneExplication?.("parade", "cook"), { vus: ["cook"] });
    assert.deepEqual(await bridge.remontrerLesExplications?.("parade"), { vus: [] });
    assert.deepEqual(receivedOnes, [["lireLesExplications", "parade"], ["marquerUneExplication", "parade", "cook"], ["remontrerLesExplications", "parade"]]);
  });

  test("le process principal tient les trois canaux, sous le compte GitHub connecté, et les passe au runtime du projet", () => {
    const main = readFileSync(join(APP, "src", "main.ts"), "utf8");
    assert.match(main, /import \{ writeTheExplanations, readTheExplanations \} from "\.\/vue\/explanations\/explanations-box\.ts";/);
    assert.match(main, /const accountOfExplanations = \(\) => accountConnected\.login\(\);/);
    assert.match(main, /ipcMain\.handle\("lireLesExplications", [\s\S]*?readTheExplanations\(aims\.nom, readOne, accountOfExplanations, launchOnTheKitchen\)/);
    assert.match(main, /ipcMain\.handle\("marquerUneExplication", [\s\S]*?writeTheExplanations\(aims\.nom, readOne, accountOfExplanations, \{ vu: word \}, launchOnTheKitchen\)/);
    assert.match(main, /ipcMain\.handle\("remontrerLesExplications", [\s\S]*?writeTheExplanations\(aims\.nom, readOne, accountOfExplanations, \{ effacer: true \}, launchOnTheKitchen\)/);
  });
});
