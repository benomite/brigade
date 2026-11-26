// Un projet qui cuit sur cet ordinateur (#1122) : la station de ce poste le sert — il a sa ligne
// dans sa configuration —, et l'app le lit ici, par le geste de cette station, à la cadence de la
// veille. Le lieu vivant est celui de la station, jamais `app.json` : une cuisine qui arrive sur
// cet ordinateur est lue dès la lecture suivante. Aucun test n'attend une durée — il attend une lecture.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { pourLaBar } from "../src/bar.ts";
import { ACTION, mots, ouvrirStandby, type Read, type Locale } from "../src/box.ts";
import { COUTS, projectsLus } from "../src/onglets.ts";
import { servedPar, holdKitchensIci } from "../src/workstation/kitchen-ici.ts";
import { CACHE_DE_COMPILATION } from "./aides/cache-de-compilation.ts";
import { SANS_POSIX } from "./aides/posix.ts";

const RUNTIME = join(import.meta.dirname, "../../runtime");

// Un poste d'essai : le répertoire de sa station, un faux `node` qui joue son geste — il note ce
// qu'il a reçu et répond comme le runtime —, ce qu'il rend est ce que le vrai geste rendrait.
function trial(t: TestContext, { intervalleMs = 3_600_000 } = {}) {
  const racine = mkdtempSync(join(tmpdir(), "brigade-app-ici-"));
  const station = join(racine, "station");
  const node = join(racine, "node");
  writeFileSync(
    node,
    `#!/bin/sh\nprintf '%s|%s|%s\\n' "$PWD" "$BRIGADE_STATION_DIR" "$*" >> '${racine}/node-lance'\nshift\nprintf 'projet     %s\\nici        %s\\n' "$1" "$2"\n`,
  );
  chmodSync(node, 0o755);
  const locale: Locale = { node, runtime: join(racine, "runtime"), racine: station, env: { PATH: process.env.PATH } };
  // Le geste se lance depuis le dossier du runtime.
  mkdirSync(locale.runtime);
  // Les lignes de la configuration de la station, telles qu'elle les écrit : aucune, sans fichier.
  const servir = (...lines: string[]) => {
    rmSync(station, { recursive: true, force: true });
    if (lines.length === 0) return;
    mkdirSync(station, { recursive: true });
    writeFileSync(join(station, "projets"), `${lines.join("\n")}\n`);
  };
  const changes: (readonly string[])[] = [];
  const kitchens = holdKitchensIci({ locale, surChangement: (servedOnes) => changes.push(servedOnes) });

  const lectures: Read[] = [];
  let attendue: (() => void) | undefined;
  const standby = ouvrirStandby({
    intervalleMs,
    delaiMs: 60_000,
    cuisine: kitchens.cuisineDe,
    surLecture(read) {
      lectures.push(read);
      attendue?.();
    },
  });
  t.after(() => {
    standby.fermer();
    rmSync(racine, { recursive: true, force: true });
  });
  async function jusqua(vraie: (read: Read) => boolean): Promise<Read> {
    let rang = 0;
    for (;;) {
      for (; rang < lectures.length; rang++) {
        const read = lectures[rang] as Read;
        if (vraie(read)) return read;
      }
      await new Promise<void>((resoudre) => (attendue = resoudre));
    }
  }
  const lu = (name: string) => (existsSync(join(racine, name)) ? readFileSync(join(racine, name), "utf8") : "");
  return { veille: standby, lectures, jusqua, lu, servir, cuisines: kitchens, changes, locale, station };
}

const texte = (read: Read) => ("erreur" in read ? read.erreur : read.sorties.map((sortie) => sortie.texte).join(""));

describe("où cuit un projet : la configuration de la station de cet ordinateur", () => {
  test("ses projets sont le premier champ de chaque ligne entière — ni blanc, ni commentaire, ni ligne à moitié", (t) => {
    const racine = mkdtempSync(join(tmpdir(), "brigade-app-servis-"));
    t.after(() => rmSync(racine, { recursive: true, force: true }));
    assert.deepEqual(servedPar(racine), []);
    writeFileSync(
      join(racine, "projets"),
      ["# projet  dépôt  branche", "", "mirrorlab  BOBL-tech/mirrorlab  main", "  espace benomite/espace main BRIGADE_SECRETS_FILE=/srv/x.env", "orphelin benomite/orphelin", "# brigade:debut", "mirrorlab autre/x main"].join("\n"),
    );
    assert.deepEqual(servedPar(racine), ["mirrorlab", "espace"]);
  });

  test("le lieu vivant est celui de la station : servi ici, un projet se lit ici ; sinon, nulle part", (t) => {
    const { servir, cuisines: kitchens, locale } = trial(t);
    const space = { nom: "espace" };
    const mirrorlab = { nom: "mirrorlab" };
    assert.equal(kitchens.cuisineDe(space), undefined);
    assert.equal(kitchens.cuisineDe(mirrorlab), undefined);
    servir("mirrorlab BOBL-tech/mirrorlab main", "espace benomite/espace main");
    assert.deepEqual(kitchens.cuisineDe(space), { locale });
    assert.deepEqual(kitchens.cuisineDe(mirrorlab), { locale });
    assert.equal(kitchens.ici("mirrorlab"), true);
    assert.equal(kitchens.ici("cantine"), false);
  });

  test("une app qui n'est pas une station ne lit rien ici : aucun projet n'y est lu", (t) => {
    const { servir } = trial(t);
    servir("espace benomite/espace main");
    const workstation = holdKitchensIci({ locale: undefined });
    assert.equal(workstation.cuisineDe({ nom: "espace" }), undefined);
    assert.equal(workstation.ici("espace"), false);
  });

  test("quand les projets servis ici changent, il le dit une fois — la vue et les alertes suivent", async (t) => {
    const { servir, cuisines: kitchens, changes } = trial(t);
    kitchens.cuisineDe({ nom: "mirrorlab" });
    await Promise.resolve();
    assert.deepEqual(changes, []);
    servir("mirrorlab BOBL-tech/mirrorlab main");
    kitchens.cuisineDe({ nom: "mirrorlab" });
    kitchens.ici("mirrorlab");
    await Promise.resolve();
    assert.deepEqual(changes, [["mirrorlab"]]);
    servir();
    assert.equal(kitchens.ici("mirrorlab"), false);
    await Promise.resolve();
    assert.deepEqual(changes, [["mirrorlab"], []]);
  });
});

describe("un projet qui cuit ici se lit par le geste de la station de ce poste", () => {
  test("sa lecture part par le geste de la station de ce poste — dans le dossier du runtime, avec son répertoire", { skip: SANS_POSIX }, async (t) => {
    const { veille: standby, jusqua, lu, servir, locale } = trial(t);
    servir("mirrorlab BOBL-tech/mirrorlab main");
    standby.regarder([{ nom: "mirrorlab", dossier: "/projets/mirrorlab" }], ["status", "station"], 3);

    const read = await jusqua(() => true);
    assert.equal(read.projet, "mirrorlab");
    assert.equal(read.demande, 3);
    assert.ok("sorties" in read, texte(read));
    assert.deepEqual(
      read.sorties.map(({ commande: command }) => command),
      ["status", "station"],
    );
    assert.equal(texte(read), "projet     mirrorlab\nici        status\nprojet     mirrorlab\nici        station\n");
    assert.equal(lu("node-lance"), [`${locale.runtime}|${locale.racine}|${join(locale.runtime, ACTION)} mirrorlab status`, `${locale.runtime}|${locale.racine}|${join(locale.runtime, ACTION)} mirrorlab station`, ""].join("\n"));
  });

  test("il se relit au rythme de la veille", { skip: SANS_POSIX }, async (t) => {
    const { veille: standby, jusqua, servir, lectures } = trial(t, { intervalleMs: 5 });
    servir("mirrorlab BOBL-tech/mirrorlab main");
    standby.regarder([{ nom: "mirrorlab", dossier: "/projets/mirrorlab" }], ["status"], 1);
    await jusqua(() => lectures.length >= 3);
    assert.ok(lectures.every((read) => "sorties" in read));
  });

  test("sa cuisine arrive sur cet ordinateur : rien n'est lu d'elle avant, la lecture suivante la lit ici", { skip: SANS_POSIX }, async (t) => {
    const { veille: standby, jusqua, lu, servir } = trial(t, { intervalleMs: 5 });
    standby.regarder([{ nom: "espace", dossier: "/projets/espace" }], ["status"], 1);
    assert.equal(lu("node-lance"), "");

    servir("espace benomite/espace main");
    const ici = await jusqua((read) => texte(read).startsWith("projet     espace\n"));
    assert.equal(ici.projet, "espace");
    assert.match(lu("node-lance"), /espace status/);
  });

  test("le vrai geste de la station : lancé ici, un projet qu'elle ne sert pas est refusé par son code — atteinte, et le cas dit", async (t) => {
    const racine = mkdtempSync(join(tmpdir(), "brigade-app-geste-"));
    t.after(() => rmSync(racine, { recursive: true, force: true }));
    writeFileSync(join(racine, "projets"), "autre benomite/autre main\n");
    const locale: Locale = { node: process.execPath, runtime: RUNTIME, racine, env: { PATH: process.env.PATH, HOME: racine, ...CACHE_DE_COMPILATION } };
    let recue: ((read: Read) => void) | undefined;
    const lue = new Promise<Read>((resoudre) => (recue = resoudre));
    // Ce que la station sert est lu en vrai : ici, elle croit servir « mirrorlab », sa configuration dit le contraire.
    const standby = ouvrirStandby({ intervalleMs: 3_600_000, delaiMs: 60_000, cuisine: () => ({ locale }), surLecture: (read) => recue?.(read) });
    t.after(() => standby.fermer());
    standby.regarder([{ nom: "mirrorlab", dossier: "/projets/mirrorlab" }], ["status"], 1);

    const read = await lue;
    assert.ok("erreur" in read);
    assert.equal(read.atteinte, true);
    assert.equal(read.cas, "projet-inconnu");
    assert.match(read.erreur, /« mirrorlab » n'a pas de ligne dans sa configuration/);
    assert.match(read.erreur, /→ exit code 65$/);
  });

  test("les mots d'une commande sont ceux qu'un shell donnerait au geste", () => {
    assert.deepEqual(mots("measures --last 7d --by 1"), ["measures", "--last", "7d", "--by", "1"]);
    assert.deepEqual(mots("  log  --last 200 "), ["log", "--last", "200"]);
    assert.deepEqual(mots(`pass 14 comment 'l'\\''export, enfin'`), ["pass", "14", "comment", "l'export, enfin"]);
  });
});

describe("ce que la vue en reçoit", () => {
  test("la barre marque `ici` le projet qui cuit sur cet ordinateur, et seul celui-là est lu par les pages de l'app", () => {
    const configuration = {
      chemin: "/tmp/app.json",
      projets: [
        { nom: "mirrorlab", dossier: "/p/m" },
        { nom: "espace", dossier: "/p/e" },
      ],
    };
    const ici = (name: string) => name !== "espace";
    const vus = pourLaBar(configuration, undefined, ici).projets;
    assert.deepEqual(
      vus.map(({ nom: name, ici: marque }) => [name, marque]),
      [
        ["mirrorlab", true],
        ["espace", undefined],
      ],
    );
    assert.deepEqual(
      projectsLus(COUTS, undefined, vus).map(({ nom: name }) => name),
      ["mirrorlab"],
    );
  });
});
