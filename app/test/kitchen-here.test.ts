// Un projet qui cuit sur cet ordinateur (#1122) : la station de ce poste le sert — il a sa ligne
// dans sa configuration —, et l'app le lit ici, par le geste de cette station, à la cadence de la
// veille. Le lieu vivant est celui de la station, jamais `app.json` : une cuisine qui arrive sur
// cet ordinateur est lue dès la lecture suivante. Aucun test n'attend une durée — il attend une lecture.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { forTheBar } from "../src/bar.ts";
import type { Locale } from "../src/box.ts";
import { servedBy, holdKitchensHere } from "../src/workstation/kitchen-here.ts";

// Un poste d'essai : le répertoire de sa station et un `node` qui ne sera pas lancé.
function trial(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "brigade-app-ici-"));
  const station = join(root, "station");
  const node = join(root, "node");
  const locale: Locale = { node, runtime: join(root, "runtime"), racine: station, env: { PATH: process.env.PATH } };
  mkdirSync(locale.runtime);
  // Les lignes de la configuration de la station, telles qu'elle les écrit : aucune, sans fichier.
  const serve = (...lines: string[]) => {
    rmSync(station, { recursive: true, force: true });
    if (lines.length === 0) return;
    mkdirSync(station, { recursive: true });
    writeFileSync(join(station, "projets"), `${lines.join("\n")}\n`);
  };
  const changes: (readonly string[])[] = [];
  const kitchens = holdKitchensHere({ locale, surChangement: (servedOnes) => changes.push(servedOnes) });

  t.after(() => {
    rmSync(root, { recursive: true, force: true });
  });
  return { servir: serve, cuisines: kitchens, changes, locale, station };
}

describe("où cuit un projet : la configuration de la station de cet ordinateur", () => {
  test("ses projets sont le premier champ de chaque ligne entière — ni blanc, ni commentaire, ni ligne à moitié", (t) => {
    const root = mkdtempSync(join(tmpdir(), "brigade-app-servis-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    assert.deepEqual(servedBy(root), []);
    writeFileSync(
      join(root, "projets"),
      ["# projet  dépôt  branche", "", "mirrorlab  BOBL-tech/mirrorlab  main", "  espace benomite/espace main BRIGADE_SECRETS_FILE=/srv/x.env", "orphelin benomite/orphelin", "# brigade:debut", "mirrorlab autre/x main"].join("\n"),
    );
    assert.deepEqual(servedBy(root), ["mirrorlab", "espace"]);
  });

  test("le lieu vivant est celui de la station : servi ici, un projet se lit ici ; sinon, nulle part", (t) => {
    const { servir: serve, cuisines: kitchens, locale } = trial(t);
    const space = { nom: "espace" };
    const mirrorlab = { nom: "mirrorlab" };
    assert.equal(kitchens.cuisineDe(space), undefined);
    assert.equal(kitchens.cuisineDe(mirrorlab), undefined);
    serve("mirrorlab BOBL-tech/mirrorlab main", "espace benomite/espace main");
    assert.deepEqual(kitchens.cuisineDe(space), { locale });
    assert.deepEqual(kitchens.cuisineDe(mirrorlab), { locale });
    assert.equal(kitchens.ici("mirrorlab"), true);
    assert.equal(kitchens.ici("cantine"), false);
  });

  test("une app qui n'est pas une station ne lit rien ici : aucun projet n'y est lu", (t) => {
    const { servir: serve } = trial(t);
    serve("espace benomite/espace main");
    const workstation = holdKitchensHere({ locale: undefined });
    assert.equal(workstation.cuisineDe({ nom: "espace" }), undefined);
    assert.equal(workstation.ici("espace"), false);
  });

  test("quand les projets servis ici changent, il le dit une fois — la vue et les alertes suivent", async (t) => {
    const { servir: serve, cuisines: kitchens, changes } = trial(t);
    kitchens.cuisineDe({ nom: "mirrorlab" });
    await Promise.resolve();
    assert.deepEqual(changes, []);
    serve("mirrorlab BOBL-tech/mirrorlab main");
    kitchens.cuisineDe({ nom: "mirrorlab" });
    kitchens.ici("mirrorlab");
    await Promise.resolve();
    assert.deepEqual(changes, [["mirrorlab"]]);
    serve();
    assert.equal(kitchens.ici("mirrorlab"), false);
    await Promise.resolve();
    assert.deepEqual(changes, [["mirrorlab"], []]);
  });
});

describe("ce que la vue en reçoit", () => {
  test("la barre marque `ici` le projet qui cuit sur cet ordinateur", () => {
    const configuration = {
      chemin: "/tmp/app.json",
      projets: [
        { nom: "mirrorlab", dossier: "/p/m" },
        { nom: "espace", dossier: "/p/e" },
      ],
    };
    const here = (name: string) => name !== "espace";
    const seenOnes = forTheBar(configuration, undefined, here).projets;
    assert.deepEqual(
      seenOnes.map(({ nom: name, ici: brand }) => [name, brand]),
      [
        ["mirrorlab", true],
        ["espace", undefined],
      ],
    );
  });
});
