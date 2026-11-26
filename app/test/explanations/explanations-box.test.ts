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
import type { Lu, Rendu } from "../../src/box.ts";
import { ecrireLesExplanations, lireLesExplanations } from "../../src/vue/explanations/explanations-box.ts";
import type { Pont } from "../../src/vue/pont.d.ts";

const APP = join(import.meta.dirname, "..", "..");
const BOX: Lu = { nom: "parade", cuisine: { locale: { node: "node", runtime: "/runtime", racine: "/station", env: {} } } };
const rendu = (sortie: string, code: number | null = null, erreurs = ""): Rendu => ({
  lance: "$ node geste.ts parade explanations",
  erreur: code === null ? null : (Object.assign(new Error(`exit ${code}`), { code }) as ExecFileException),
  sortie,
  erreurs,
});
function lanceur(rendre: Rendu) {
  const lancees: string[] = [];
  return { lancees, lancer: async (_: Lu, command: string) => (lancees.push(command), rendre) };
}
const ALICE = async () => "alice";

describe("le registre des explications, par la commande `explanations`", () => {
  test("la lecture passe le compte GitHub de cet ordinateur, et rend les mots vus", async () => {
    const { lancees, lancer } = lanceur(rendu('{"seen":["rail","WAITING"]}\n'));
    assert.deepEqual(await lireLesExplanations("parade", BOX, ALICE, lancer), { vus: ["rail", "WAITING"] });
    assert.deepEqual(lancees, ["explanations --chef alice"]);
    assert.deepEqual(await lireLesExplanations("parade", BOX, ALICE, lanceur(rendu('{"seen":[]}')).lancer), { vus: [] });
  });

  test("un mot vu, et tout effacé : chacun sous le compte, et ce que le runtime rend", async () => {
    const vu = lanceur(rendu('{"ok":true,"seen":["pass"]}'));
    assert.deepEqual(await ecrireLesExplanations("parade", BOX, ALICE, { vu: "pass" }, vu.lancer), { vus: ["pass"] });
    assert.deepEqual(vu.lancees, ["explanations seen pass --chef alice"]);
    const efface = lanceur(rendu('{"ok":true,"seen":[]}'));
    assert.deepEqual(await ecrireLesExplanations("parade", BOX, ALICE, { effacer: true }, efface.lancer), { vus: [] });
    assert.deepEqual(efface.lancees, ["explanations reset --chef alice"]);
  });

  test("une lecture qui échoue, illisible, d'un runtime trop vieux, sans station ou sans compte se dit — jamais un registre vide", async () => {
    const failure = await lireLesExplanations("parade", BOX, ALICE, lanceur(rendu("", 1, "brigade: the explanations are not read — explanations.json is not JSON")).lancer);
    assert.ok("sans" in failure && failure.sans === "explanations unavailable" && failure.detail?.includes("is not JSON"));
    for (const sortie of ["pas du json", '{"seen":["kitchen"]}', '{"seen":"rail"}']) {
      const illisible = await lireLesExplanations("parade", BOX, ALICE, lanceur(rendu(sortie)).lancer);
      assert.ok("sans" in illisible && illisible.sans === "explanations unavailable", sortie);
    }
    const vieux = await lireLesExplanations("parade", BOX, ALICE, lanceur(rendu("", 66, "explanations is not a runtime command")).lancer);
    assert.ok("sans" in vieux && /update it/.test(vieux.sans));
    const { lancees, lancer } = lanceur(rendu("{}"));
    const sansStation = await lireLesExplanations("parade", undefined, ALICE, lancer);
    assert.ok("sans" in sansStation && /has no station/.test(sansStation.sans));
    for (const account of [async () => null, async () => "../x", async () => Promise.reject(new Error("gh absent"))]) {
      const sansAccount = await lireLesExplanations("parade", BOX, account, lancer);
      assert.ok("sans" in sansAccount && /no GitHub account is signed in/.test(sansAccount.sans));
    }
    assert.deepEqual(lancees, []);
  });

  test("une écriture refusée par le runtime dit sa ligne ; illisible, trop vieille, sans station, sans compte ou d'un autre mot, elle n'est pas un succès", async () => {
    const refusal = await ecrireLesExplanations("parade", BOX, ALICE, { vu: "rail" }, lanceur(rendu('{"ok":false,"message":"explanations.json is not JSON"}', 1)).lancer);
    assert.ok("refus" in refusal && refusal.refus === "explanations.json is not JSON");
    const illisible = await ecrireLesExplanations("parade", BOX, ALICE, { effacer: true }, lanceur(rendu("rien")).lancer);
    assert.ok("refus" in illisible && /could not be read/.test(illisible.refus));
    const vieux = await ecrireLesExplanations("parade", BOX, ALICE, { effacer: true }, lanceur(rendu("", 66)).lancer);
    assert.ok("refus" in vieux && /update it/.test(vieux.refus));
    const { lancees, lancer } = lanceur(rendu('{"ok":true,"seen":[]}'));
    assert.ok("refus" in (await ecrireLesExplanations("parade", BOX, ALICE, { vu: "kitchen" }, lancer)));
    assert.ok("refus" in (await ecrireLesExplanations("parade", BOX, ALICE, { vu: "rail; rm -rf /" }, lancer)));
    assert.ok("refus" in (await ecrireLesExplanations("parade", undefined, ALICE, { effacer: true }, lancer)));
    assert.ok("refus" in (await ecrireLesExplanations("parade", BOX, async () => null, { vu: "rail" }, lancer)));
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
  (runInThisContext(`(function (require) {${source}\n})`) as (require: (name: string) => unknown) => void)(() => electron);
  return expose!;
}

describe("le câblage des explications", () => {
  test("le préchargement porte la lecture, le mot vu et le geste de Settings, avec le projet et le mot", async () => {
    const recus: unknown[][] = [];
    const canal = (name: string, rendu: unknown) => (...args: unknown[]) => (recus.push([name, ...args]), rendu);
    const pont = pontDe({ lireLesExplications: canal("lireLesExplications", { vus: [] }), marquerUneExplication: canal("marquerUneExplication", { vus: ["cook"] }), remontrerLesExplications: canal("remontrerLesExplications", { vus: [] }) });
    assert.deepEqual(await pont.lireLesExplications?.("parade"), { vus: [] });
    assert.deepEqual(await pont.marquerUneExplication?.("parade", "cook"), { vus: ["cook"] });
    assert.deepEqual(await pont.remontrerLesExplications?.("parade"), { vus: [] });
    assert.deepEqual(recus, [["lireLesExplications", "parade"], ["marquerUneExplication", "parade", "cook"], ["remontrerLesExplications", "parade"]]);
  });

  test("le process principal tient les trois canaux, sous le compte GitHub connecté, et les passe au runtime du projet", () => {
    const main = readFileSync(join(APP, "src", "main.ts"), "utf8");
    assert.match(main, /import \{ ecrireLesExplications, lireLesExplications \} from "\.\/vue\/explications\/explications-box\.ts";/);
    assert.match(main, /const compteDesExplications = \(\) => compteConnecte\.login\(\);/);
    assert.match(main, /ipcMain\.handle\("lireLesExplications", [\s\S]*?lireLesExplications\(vise\.nom, lu, compteDesExplications, lancerSurLaCuisine\)/);
    assert.match(main, /ipcMain\.handle\("marquerUneExplication", [\s\S]*?ecrireLesExplications\(vise\.nom, lu, compteDesExplications, \{ vu: mot \}, lancerSurLaCuisine\)/);
    assert.match(main, /ipcMain\.handle\("remontrerLesExplications", [\s\S]*?ecrireLesExplications\(vise\.nom, lu, compteDesExplications, \{ effacer: true \}, lancerSurLaCuisine\)/);
  });
});
