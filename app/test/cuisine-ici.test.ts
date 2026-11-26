// Un projet qui cuit sur cet ordinateur (#1122) : la station de ce poste le sert — il a sa ligne
// dans sa configuration —, et l'app le lit ici, par le geste de cette station, à la cadence de la
// veille. Le lieu vivant est celui de la station, jamais `app.json` : une cuisine qui arrive sur
// cet ordinateur est lue dès la lecture suivante. Aucun test n'attend une durée — il attend une lecture.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { pourLaBarre } from "../src/barre.ts";
import { GESTE, mots, ouvrirVeille, type Lecture, type Locale } from "../src/box.ts";
import { COUTS, projetsLus } from "../src/onglets.ts";
import { servisPar, tenirCuisinesIci } from "../src/poste/cuisine-ici.ts";
import { CACHE_DE_COMPILATION } from "./aides/cache-de-compilation.ts";
import { SANS_POSIX } from "./aides/posix.ts";

const RUNTIME = join(import.meta.dirname, "../../runtime");

// Un poste d'essai : le répertoire de sa station, un faux `node` qui joue son geste — il note ce
// qu'il a reçu et répond comme le runtime —, ce qu'il rend est ce que le vrai geste rendrait.
function essai(t: TestContext, { intervalleMs = 3_600_000 } = {}) {
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
  const servir = (...lignes: string[]) => {
    rmSync(station, { recursive: true, force: true });
    if (lignes.length === 0) return;
    mkdirSync(station, { recursive: true });
    writeFileSync(join(station, "projets"), `${lignes.join("\n")}\n`);
  };
  const changes: (readonly string[])[] = [];
  const cuisines = tenirCuisinesIci({ locale, surChangement: (servis) => changes.push(servis) });

  const lectures: Lecture[] = [];
  let attendue: (() => void) | undefined;
  const veille = ouvrirVeille({
    intervalleMs,
    delaiMs: 60_000,
    cuisine: cuisines.cuisineDe,
    surLecture(lecture) {
      lectures.push(lecture);
      attendue?.();
    },
  });
  t.after(() => {
    veille.fermer();
    rmSync(racine, { recursive: true, force: true });
  });
  async function jusqua(vraie: (lecture: Lecture) => boolean): Promise<Lecture> {
    let rang = 0;
    for (;;) {
      for (; rang < lectures.length; rang++) {
        const lecture = lectures[rang] as Lecture;
        if (vraie(lecture)) return lecture;
      }
      await new Promise<void>((resoudre) => (attendue = resoudre));
    }
  }
  const lu = (nom: string) => (existsSync(join(racine, nom)) ? readFileSync(join(racine, nom), "utf8") : "");
  return { veille, lectures, jusqua, lu, servir, cuisines, changes, locale, station };
}

const texte = (lecture: Lecture) => ("erreur" in lecture ? lecture.erreur : lecture.sorties.map((sortie) => sortie.texte).join(""));

describe("où cuit un projet : la configuration de la station de cet ordinateur", () => {
  test("ses projets sont le premier champ de chaque ligne entière — ni blanc, ni commentaire, ni ligne à moitié", (t) => {
    const racine = mkdtempSync(join(tmpdir(), "brigade-app-servis-"));
    t.after(() => rmSync(racine, { recursive: true, force: true }));
    assert.deepEqual(servisPar(racine), []);
    writeFileSync(
      join(racine, "projets"),
      ["# projet  dépôt  branche", "", "mirrorlab  BOBL-tech/mirrorlab  main", "  espace benomite/espace main BRIGADE_SECRETS_FILE=/srv/x.env", "orphelin benomite/orphelin", "# brigade:debut", "mirrorlab autre/x main"].join("\n"),
    );
    assert.deepEqual(servisPar(racine), ["mirrorlab", "espace"]);
  });

  test("le lieu vivant est celui de la station : servi ici, un projet se lit ici ; sinon, nulle part", (t) => {
    const { servir, cuisines, locale } = essai(t);
    const espace = { nom: "espace" };
    const mirrorlab = { nom: "mirrorlab" };
    assert.equal(cuisines.cuisineDe(espace), undefined);
    assert.equal(cuisines.cuisineDe(mirrorlab), undefined);
    servir("mirrorlab BOBL-tech/mirrorlab main", "espace benomite/espace main");
    assert.deepEqual(cuisines.cuisineDe(espace), { locale });
    assert.deepEqual(cuisines.cuisineDe(mirrorlab), { locale });
    assert.equal(cuisines.ici("mirrorlab"), true);
    assert.equal(cuisines.ici("cantine"), false);
  });

  test("une app qui n'est pas une station ne lit rien ici : aucun projet n'y est lu", (t) => {
    const { servir } = essai(t);
    servir("espace benomite/espace main");
    const poste = tenirCuisinesIci({ locale: undefined });
    assert.equal(poste.cuisineDe({ nom: "espace" }), undefined);
    assert.equal(poste.ici("espace"), false);
  });

  test("quand les projets servis ici changent, il le dit une fois — la vue et les alertes suivent", async (t) => {
    const { servir, cuisines, changes } = essai(t);
    cuisines.cuisineDe({ nom: "mirrorlab" });
    await Promise.resolve();
    assert.deepEqual(changes, []);
    servir("mirrorlab BOBL-tech/mirrorlab main");
    cuisines.cuisineDe({ nom: "mirrorlab" });
    cuisines.ici("mirrorlab");
    await Promise.resolve();
    assert.deepEqual(changes, [["mirrorlab"]]);
    servir();
    assert.equal(cuisines.ici("mirrorlab"), false);
    await Promise.resolve();
    assert.deepEqual(changes, [["mirrorlab"], []]);
  });
});

describe("un projet qui cuit ici se lit par le geste de la station de ce poste", () => {
  test("sa lecture part par le geste de la station de ce poste — dans le dossier du runtime, avec son répertoire", { skip: SANS_POSIX }, async (t) => {
    const { veille, jusqua, lu, servir, locale } = essai(t);
    servir("mirrorlab BOBL-tech/mirrorlab main");
    veille.regarder([{ nom: "mirrorlab", dossier: "/projets/mirrorlab" }], ["status", "station"], 3);

    const lecture = await jusqua(() => true);
    assert.equal(lecture.projet, "mirrorlab");
    assert.equal(lecture.demande, 3);
    assert.ok("sorties" in lecture, texte(lecture));
    assert.deepEqual(
      lecture.sorties.map(({ commande }) => commande),
      ["status", "station"],
    );
    assert.equal(texte(lecture), "projet     mirrorlab\nici        status\nprojet     mirrorlab\nici        station\n");
    assert.equal(lu("node-lance"), [`${locale.runtime}|${locale.racine}|${join(locale.runtime, GESTE)} mirrorlab status`, `${locale.runtime}|${locale.racine}|${join(locale.runtime, GESTE)} mirrorlab station`, ""].join("\n"));
  });

  test("il se relit au rythme de la veille", { skip: SANS_POSIX }, async (t) => {
    const { veille, jusqua, servir, lectures } = essai(t, { intervalleMs: 5 });
    servir("mirrorlab BOBL-tech/mirrorlab main");
    veille.regarder([{ nom: "mirrorlab", dossier: "/projets/mirrorlab" }], ["status"], 1);
    await jusqua(() => lectures.length >= 3);
    assert.ok(lectures.every((lecture) => "sorties" in lecture));
  });

  test("sa cuisine arrive sur cet ordinateur : rien n'est lu d'elle avant, la lecture suivante la lit ici", { skip: SANS_POSIX }, async (t) => {
    const { veille, jusqua, lu, servir } = essai(t, { intervalleMs: 5 });
    veille.regarder([{ nom: "espace", dossier: "/projets/espace" }], ["status"], 1);
    assert.equal(lu("node-lance"), "");

    servir("espace benomite/espace main");
    const ici = await jusqua((lecture) => texte(lecture).startsWith("projet     espace\n"));
    assert.equal(ici.projet, "espace");
    assert.match(lu("node-lance"), /espace status/);
  });

  test("le vrai geste de la station : lancé ici, un projet qu'elle ne sert pas est refusé par son code — atteinte, et le cas dit", async (t) => {
    const racine = mkdtempSync(join(tmpdir(), "brigade-app-geste-"));
    t.after(() => rmSync(racine, { recursive: true, force: true }));
    writeFileSync(join(racine, "projets"), "autre benomite/autre main\n");
    const locale: Locale = { node: process.execPath, runtime: RUNTIME, racine, env: { PATH: process.env.PATH, HOME: racine, ...CACHE_DE_COMPILATION } };
    let recue: ((lecture: Lecture) => void) | undefined;
    const lue = new Promise<Lecture>((resoudre) => (recue = resoudre));
    // Ce que la station sert est lu en vrai : ici, elle croit servir « mirrorlab », sa configuration dit le contraire.
    const veille = ouvrirVeille({ intervalleMs: 3_600_000, delaiMs: 60_000, cuisine: () => ({ locale }), surLecture: (lecture) => recue?.(lecture) });
    t.after(() => veille.fermer());
    veille.regarder([{ nom: "mirrorlab", dossier: "/projets/mirrorlab" }], ["status"], 1);

    const lecture = await lue;
    assert.ok("erreur" in lecture);
    assert.equal(lecture.atteinte, true);
    assert.equal(lecture.cas, "projet-inconnu");
    assert.match(lecture.erreur, /« mirrorlab » n'a pas de ligne dans sa configuration/);
    assert.match(lecture.erreur, /→ exit code 65$/);
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
    const ici = (nom: string) => nom !== "espace";
    const vus = pourLaBarre(configuration, undefined, ici).projets;
    assert.deepEqual(
      vus.map(({ nom, ici: marque }) => [nom, marque]),
      [
        ["mirrorlab", true],
        ["espace", undefined],
      ],
    );
    assert.deepEqual(
      projetsLus(COUTS, undefined, vus).map(({ nom }) => nom),
      ["mirrorlab"],
    );
  });
});
