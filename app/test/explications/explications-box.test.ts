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
import { ecrireLesExplications, lireLesExplications } from "../../src/vue/explications/explications-box.ts";
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
  return { lancees, lancer: async (_: Lu, commande: string) => (lancees.push(commande), rendre) };
}
const ALICE = async () => "alice";

describe("le registre des explications, par la commande `explanations`", () => {
  test("la lecture passe le compte GitHub de cet ordinateur, et rend les mots vus", async () => {
    const { lancees, lancer } = lanceur(rendu('{"seen":["rail","WAITING"]}\n'));
    assert.deepEqual(await lireLesExplications("parade", BOX, ALICE, lancer), { vus: ["rail", "WAITING"] });
    assert.deepEqual(lancees, ["explanations --chef alice"]);
    assert.deepEqual(await lireLesExplications("parade", BOX, ALICE, lanceur(rendu('{"seen":[]}')).lancer), { vus: [] });
  });

  test("un mot vu, et tout effacé : chacun sous le compte, et ce que le runtime rend", async () => {
    const vu = lanceur(rendu('{"ok":true,"seen":["pass"]}'));
    assert.deepEqual(await ecrireLesExplications("parade", BOX, ALICE, { vu: "pass" }, vu.lancer), { vus: ["pass"] });
    assert.deepEqual(vu.lancees, ["explanations seen pass --chef alice"]);
    const efface = lanceur(rendu('{"ok":true,"seen":[]}'));
    assert.deepEqual(await ecrireLesExplications("parade", BOX, ALICE, { effacer: true }, efface.lancer), { vus: [] });
    assert.deepEqual(efface.lancees, ["explanations reset --chef alice"]);
  });

  test("une lecture qui échoue, illisible, d'un runtime trop vieux, sans station ou sans compte se dit — jamais un registre vide", async () => {
    const echec = await lireLesExplications("parade", BOX, ALICE, lanceur(rendu("", 1, "brigade: the explanations are not read — explanations.json is not JSON")).lancer);
    assert.ok("sans" in echec && echec.sans === "explanations unavailable" && echec.detail?.includes("is not JSON"));
    for (const sortie of ["pas du json", '{"seen":["kitchen"]}', '{"seen":"rail"}']) {
      const illisible = await lireLesExplications("parade", BOX, ALICE, lanceur(rendu(sortie)).lancer);
      assert.ok("sans" in illisible && illisible.sans === "explanations unavailable", sortie);
    }
    const vieux = await lireLesExplications("parade", BOX, ALICE, lanceur(rendu("", 66, "explanations is not a runtime command")).lancer);
    assert.ok("sans" in vieux && /update it/.test(vieux.sans));
    const { lancees, lancer } = lanceur(rendu("{}"));
    const sansStation = await lireLesExplications("parade", undefined, ALICE, lancer);
    assert.ok("sans" in sansStation && /has no station/.test(sansStation.sans));
    for (const compte of [async () => null, async () => "../x", async () => Promise.reject(new Error("gh absent"))]) {
      const sansCompte = await lireLesExplications("parade", BOX, compte, lancer);
      assert.ok("sans" in sansCompte && /no GitHub account is signed in/.test(sansCompte.sans));
    }
    assert.deepEqual(lancees, []);
  });

  test("une écriture refusée par le runtime dit sa ligne ; illisible, trop vieille, sans station, sans compte ou d'un autre mot, elle n'est pas un succès", async () => {
    const refus = await ecrireLesExplications("parade", BOX, ALICE, { vu: "rail" }, lanceur(rendu('{"ok":false,"message":"explanations.json is not JSON"}', 1)).lancer);
    assert.ok("refus" in refus && refus.refus === "explanations.json is not JSON");
    const illisible = await ecrireLesExplications("parade", BOX, ALICE, { effacer: true }, lanceur(rendu("rien")).lancer);
    assert.ok("refus" in illisible && /could not be read/.test(illisible.refus));
    const vieux = await ecrireLesExplications("parade", BOX, ALICE, { effacer: true }, lanceur(rendu("", 66)).lancer);
    assert.ok("refus" in vieux && /update it/.test(vieux.refus));
    const { lancees, lancer } = lanceur(rendu('{"ok":true,"seen":[]}'));
    assert.ok("refus" in (await ecrireLesExplications("parade", BOX, ALICE, { vu: "kitchen" }, lancer)));
    assert.ok("refus" in (await ecrireLesExplications("parade", BOX, ALICE, { vu: "rail; rm -rf /" }, lancer)));
    assert.ok("refus" in (await ecrireLesExplications("parade", undefined, ALICE, { effacer: true }, lancer)));
    assert.ok("refus" in (await ecrireLesExplications("parade", BOX, async () => null, { vu: "rail" }, lancer)));
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

describe("le câblage des explications", () => {
  test("le préchargement porte la lecture, le mot vu et le geste de Settings, avec le projet et le mot", async () => {
    const recus: unknown[][] = [];
    const canal = (nom: string, rendu: unknown) => (...args: unknown[]) => (recus.push([nom, ...args]), rendu);
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
