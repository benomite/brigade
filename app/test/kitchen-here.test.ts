// Un projet qui cuit sur cet ordinateur (#1122) : la station de ce poste le sert — il a sa ligne
// dans sa configuration —, et l'app le lit ici, par le geste de cette station, à la cadence de la
// veille. Le lieu vivant est celui de la station, jamais `app.json` : une cuisine qui arrive sur
// cet ordinateur est lue dès la lecture suivante. Aucun test n'attend une durée — il attend une lecture.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { forTheBar } from "../src/bar.ts";
import { ACTION, words, openStandby, type Reading, type Locale } from "../src/box.ts";
import { servedBy, holdKitchensHere } from "../src/workstation/kitchen-here.ts";
import { WITHOUT_POSIX } from "./helpers/posix.ts";


// Un poste d'essai : le répertoire de sa station, un faux `node` qui joue son geste — il note ce
// qu'il a reçu et répond comme le runtime —, ce qu'il rend est ce que le vrai geste rendrait.
function trial(t: TestContext, { intervalleMs: intervalMs = 3_600_000 } = {}) {
  const root = mkdtempSync(join(tmpdir(), "brigade-app-ici-"));
  const station = join(root, "station");
  const node = join(root, "node");
  writeFileSync(
    node,
    `#!/bin/sh\nprintf '%s|%s|%s\\n' "$PWD" "$BRIGADE_STATION_DIR" "$*" >> '${root}/node-lance'\nshift\nprintf 'projet     %s\\nici        %s\\n' "$1" "$2"\n`,
  );
  chmodSync(node, 0o755);
  const locale: Locale = { node, runtime: join(root, "runtime"), racine: station, env: { PATH: process.env.PATH } };
  // Le geste se lance depuis le dossier du runtime.
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

  const readings: Reading[] = [];
  let expected: (() => void) | undefined;
  const standby = openStandby({
    intervalleMs: intervalMs,
    delaiMs: 60_000,
    cuisine: kitchens.cuisineDe,
    surLecture(reading) {
      readings.push(reading);
      expected?.();
    },
  });
  t.after(() => {
    standby.fermer();
    rmSync(root, { recursive: true, force: true });
  });
  async function until(real: (reading: Reading) => boolean): Promise<Reading> {
    let rank = 0;
    for (;;) {
      for (; rank < readings.length; rank++) {
        const reading = readings[rank] as Reading;
        if (real(reading)) return reading;
      }
      await new Promise<void>((resolve) => (expected = resolve));
    }
  }
  const readOne = (name: string) => (existsSync(join(root, name)) ? readFileSync(join(root, name), "utf8") : "");
  return { veille: standby, lectures: readings, jusqua: until, lu: readOne, servir: serve, cuisines: kitchens, changes, locale, station };
}

const text = (reading: Reading) => ("erreur" in reading ? reading.erreur : reading.sorties.map((output) => output.texte).join(""));

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

describe("un projet qui cuit ici se lit par le geste de la station de ce poste", () => {
  test("sa lecture part par le geste de la station de ce poste — dans le dossier du runtime, avec son répertoire", { skip: WITHOUT_POSIX }, async (t) => {
    const { veille: standby, jusqua: until, lu: readOne, servir: serve, locale } = trial(t);
    serve("mirrorlab BOBL-tech/mirrorlab main");
    standby.regarder([{ nom: "mirrorlab", dossier: "/projets/mirrorlab" }], ["status", "station"], 3);

    const reading = await until(() => true);
    assert.equal(reading.projet, "mirrorlab");
    assert.equal(reading.demande, 3);
    assert.ok("sorties" in reading, text(reading));
    assert.deepEqual(
      reading.sorties.map(({ commande: command }) => command),
      ["status", "station"],
    );
    assert.equal(text(reading), "projet     mirrorlab\nici        status\nprojet     mirrorlab\nici        station\n");
    assert.equal(readOne("node-lance"), [`${locale.runtime}|${locale.racine}|${join(locale.runtime, ACTION)} mirrorlab status`, `${locale.runtime}|${locale.racine}|${join(locale.runtime, ACTION)} mirrorlab station`, ""].join("\n"));
  });

  test("il se relit au rythme de la veille", { skip: WITHOUT_POSIX }, async (t) => {
    const { veille: standby, jusqua: until, servir: serve, lectures: readings } = trial(t, { intervalleMs: 5 });
    serve("mirrorlab BOBL-tech/mirrorlab main");
    standby.regarder([{ nom: "mirrorlab", dossier: "/projets/mirrorlab" }], ["status"], 1);
    await until(() => readings.length >= 3);
    assert.ok(readings.every((reading) => "sorties" in reading));
  });

  test("sa cuisine arrive sur cet ordinateur : rien n'est lu d'elle avant, la lecture suivante la lit ici", { skip: WITHOUT_POSIX }, async (t) => {
    const { veille: standby, jusqua: until, lu: readOne, servir: serve } = trial(t, { intervalleMs: 5 });
    standby.regarder([{ nom: "espace", dossier: "/projets/espace" }], ["status"], 1);
    assert.equal(readOne("node-lance"), "");

    serve("espace benomite/espace main");
    const here = await until((reading) => text(reading).startsWith("projet     espace\n"));
    assert.equal(here.projet, "espace");
    assert.match(readOne("node-lance"), /espace status/);
  });

  test("les mots d'une commande sont ceux qu'un shell donnerait au geste", () => {
    assert.deepEqual(words("measures --last 7d --by 1"), ["measures", "--last", "7d", "--by", "1"]);
    assert.deepEqual(words("  log  --last 200 "), ["log", "--last", "200"]);
    assert.deepEqual(words(`pass 14 comment 'l'\\''export, enfin'`), ["pass", "14", "comment", "l'export, enfin"]);
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
