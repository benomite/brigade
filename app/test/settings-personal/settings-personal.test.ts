// Les préférences personnelles du chef dans un gist secret de son compte, contre la doublure de
// `gh` qui tient les gists dans un répertoire (../stations/fake-gh-gists.ts) : ni réseau, ni GitHub.
// Chaque entrée envoyée à `gh` est gardée : c'est là qu'on regarde ce qui quitte l'appareil.
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { DESCRIPTION, FILE_PREFERENCES, gistOfPreferences } from "../../src/settings-personal/gist.ts";
import { KEYS_OF_PROJECT_ON_THE_DEVICE, personal } from "../../src/settings-personal/share.ts";
import { settingsPersonal } from "../../src/settings-personal/settings-personal.ts";
import { ghOfDirectory } from "../helpers/gh-of-directory.ts";
import { WITHOUT_POSIX } from "../helpers/posix.ts";
import { reply } from "../stations/fake-gh-gists.ts";

type Gist = { id: string; description: string; public: boolean; files: Record<string, { filename: string; content: string }> };

const SOURCES = join(import.meta.dirname, "../../src/settings-personal");
const FOLDER = "/Users/chef/code/cuisine-secrete";

// Un fichier de l'app tel que le chef l'a sur son Mac : un projet avec ses couleurs, son dossier et ses réglages d'appareil.
const APP_JSON = {
  projets: [
    { nom: "cuisine", dossier: FOLDER, depot: "chef/cuisine", base: "v2", couleurs: { onglet: "#f2994a", accent: "#ad7142" }, stations: ["mac/claude"], ordinaires: true, limiteCooks: 2 },
    { nom: "salle", dossier: "/Users/chef/code/salle", couleurs: { onglet: "#7f9cf5", accent: "#7f9cf5" } },
  ],
};

// GitHub : les gists du compte dans un répertoire, et chaque entrée envoyée à `gh`.
function oneGitHub(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "brigade-app-preferences-"));
  writeFileSync(join(directory, "appels"), "");
  const sent: string[] = [];
  const gh = ghOfDirectory(directory, (folder, args, entry) => {
    const readEntry = entry();
    if (readEntry !== "") sent.push(readEntry);
    return reply(folder, args, () => readEntry);
  });
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const gists = (): Gist[] => readdirSync(directory).filter((name) => name.endsWith(".gist.json")).map((name) => JSON.parse(readFileSync(join(directory, name), "utf8")) as Gist);
  const preferences = (gist: Gist) => (JSON.parse(gist.files[FILE_PREFERENCES]!.content) as { preferences: Record<string, unknown> }).preferences;
  // Ce qu'un autre appareil du chef écrit dans le gist.
  const elsewhere = (gist: Gist, content: unknown) => writeFileSync(join(directory, `${gist.id}.gist.json`), JSON.stringify({ ...gist, files: { ...gist.files, [FILE_PREFERENCES]: { filename: FILE_PREFERENCES, content: JSON.stringify(content) } } }));
  const calls = () => readFileSync(join(directory, "appels"), "utf8").split("\n").filter(Boolean);
  return { repertoire: directory, gh, envoyes: sent, gists, preferences, ailleurs: elsewhere, appels: calls, panne: (yes: boolean) => (yes ? writeFileSync(join(directory, "panne"), "") : rmSync(join(directory, "panne"), { force: true })) };
}

function oneAppJson(t: TestContext, content: unknown = APP_JSON): string {
  const folder = mkdtempSync(join(tmpdir(), "brigade-app-json-"));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const path = join(folder, "app.json");
  writeFileSync(path, `${JSON.stringify(content, null, 2)}\n`);
  return path;
}

const ofPreferences = (github: { gh: string }, appJson: string) => settingsPersonal({ gist: gistOfPreferences({ gh: github.gh, delaiMs: 30_000 }), appJson });

describe("la frontière entre le personnel et l'appareil", () => {
  test("une liste explicite : le dossier d'un projet et ses réglages d'appareil en sont, ses couleurs non", () => {
    for (const key of ["dossier", "stations", "ordinaires", "limiteCooks"]) assert.ok(KEYS_OF_PROJECT_ON_THE_DEVICE.includes(key), key);
    assert.ok(!KEYS_OF_PROJECT_ON_THE_DEVICE.includes("couleurs"));
  });

  test("tout le reste est personnel, une préférence de demain comprise, et les projets gardent leur ordre", () => {
    const readEntries = personal({ ...APP_JSON, affichage: { densite: "serree" }, demain: 42 });
    assert.deepEqual(readEntries, {
      projets: [
        { nom: "cuisine", depot: "chef/cuisine", base: "v2", couleurs: { onglet: "#f2994a", accent: "#ad7142" } },
        { nom: "salle", couleurs: { onglet: "#7f9cf5", accent: "#7f9cf5" } },
      ],
      affichage: { densite: "serree" },
      demain: 42,
    });
  });
});

describe("le gist des préférences", () => {
  test("la première écriture crée un gist secret, les suivantes réécrivent le même", { skip: WITHOUT_POSIX }, async (t) => {
    const github = oneGitHub(t);
    const preferences = ofPreferences(github, oneAppJson(t));

    assert.equal(await preferences.ecrire({ projets: [{ nom: "cuisine", couleurs: { onglet: "#f2994a" } }] }), undefined);
    const [created, ...others] = github.gists();
    assert.equal(others.length, 0);
    assert.equal(created!.public, false, "a secret gist, never a public one");
    assert.equal(created!.description, DESCRIPTION);
    assert.ok(github.appels().some((call) => call.startsWith("api -X POST /gists")));

    assert.equal(await preferences.ecrire({ projets: [{ nom: "cuisine", couleurs: { onglet: "#7f9cf5" } }] }), undefined);
    assert.equal(await preferences.ecrire({ projets: [{ nom: "salle" }, { nom: "cuisine" }] }), undefined);
    assert.deepEqual(github.gists().map(({ id }) => id), [created!.id]);
    assert.equal(github.appels().filter((call) => call.startsWith("api -X POST")).length, 1);
    assert.equal(github.appels().filter((call) => call === `api -X PATCH /gists/${created!.id} --input -`).length, 2);
    assert.deepEqual(github.preferences(github.gists()[0]!), { projets: [{ nom: "salle" }, { nom: "cuisine" }] });
  });

  test("un autre appareil retrouve le gist par la liste du compte, et le réécrit au lieu d'en créer un", { skip: WITHOUT_POSIX }, async (t) => {
    const github = oneGitHub(t);
    await ofPreferences(github, oneAppJson(t)).ecrire({ affichage: { densite: "serree" } });
    assert.equal(await ofPreferences(github, oneAppJson(t)).ecrire({ affichage: { densite: "aeree" } }), undefined);
    assert.equal(github.gists().length, 1);
    assert.deepEqual(github.preferences(github.gists()[0]!), { affichage: { densite: "aeree" } });
  });

  test("une clé personnelle part dans le gist ; une clé de l'appareil n'apparaît dans aucune charge envoyée", { skip: WITHOUT_POSIX }, async (t) => {
    const github = oneGitHub(t);
    const preferences = ofPreferences(github, oneAppJson(t));
    const writtenEntries = { ...APP_JSON, affichage: { densite: "serree" } };

    assert.equal(await preferences.ecrire(writtenEntries), undefined);
    assert.equal(await preferences.ecrire({ ...writtenEntries, projets: [...writtenEntries.projets].reverse() }), undefined);

    // La couleur d'un projet, l'ordre des projets, une préférence d'affichage : dans le gist.
    assert.deepEqual(github.preferences(github.gists()[0]!), {
      projets: [
        { nom: "salle", couleurs: { onglet: "#7f9cf5", accent: "#7f9cf5" } },
        { nom: "cuisine", depot: "chef/cuisine", base: "v2", couleurs: { onglet: "#f2994a", accent: "#ad7142" } },
      ],
      affichage: { densite: "serree" },
    });
    // Le dossier d'un projet : ni la clé, ni la valeur, dans aucune entrée de `gh`.
    assert.equal(github.envoyes.length, 2);
    for (const sent of github.envoyes) {
      for (const forbidden of [FOLDER, "/Users/chef/code/salle"]) assert.ok(!sent.includes(forbidden), `${forbidden} left the device: ${sent}`);
      assert.doesNotMatch(sent, /\b(dossier|stations|ordinaires|limiteCooks)\b/, "no device-bound key in the payload");
    }
  });

  test("une lecture rend les préférences du gist, et ce qu'un autre appareil y a ajouté se lit à la suivante", { skip: WITHOUT_POSIX }, async (t) => {
    const github = oneGitHub(t);
    const preferences = ofPreferences(github, oneAppJson(t, { projets: [] }));
    await preferences.ecrire({ projets: [{ nom: "cuisine", couleurs: { onglet: "#f2994a" } }] });

    assert.deepEqual(await preferences.lire(), { preferences: { projets: [{ nom: "cuisine", couleurs: { onglet: "#f2994a" } }] }, source: "gist" });

    // Un autre appareil ajoute une préférence — et y glisse un dossier, qui ne se lit pas ici.
    github.ailleurs(github.gists()[0]!, { version: 1, preferences: { projets: [{ nom: "cuisine", dossier: "/ailleurs", couleurs: { onglet: "#f2994a" } }], affichage: { densite: "serree" } } });
    assert.deepEqual(await preferences.lire(), { preferences: { projets: [{ nom: "cuisine", couleurs: { onglet: "#f2994a" } }], affichage: { densite: "serree" } }, source: "gist" });
  });

  test("sans préférence dans le gist, la première lecture l'amorce avec celles du fichier de l'app, et laisse le fichier tel qu'il est", { skip: WITHOUT_POSIX }, async (t) => {
    const github = oneGitHub(t);
    const appJson = oneAppJson(t);
    const before = readFileSync(appJson, "utf8");
    const expected = personal(APP_JSON);

    assert.deepEqual(await ofPreferences(github, appJson).lire(), { preferences: expected, source: "app.json" });
    const [amorce, ...others] = github.gists();
    assert.equal(others.length, 0);
    assert.equal(amorce!.public, false);
    assert.deepEqual(github.preferences(amorce!), expected);
    for (const sent of github.envoyes) for (const forbidden of [FOLDER]) assert.ok(!sent.includes(forbidden), `${forbidden} left the device`);

    // Les clés de l'appareil sont toujours dans le fichier de l'app : il n'a pas bougé.
    assert.equal(readFileSync(appJson, "utf8"), before);
    assert.deepEqual((JSON.parse(readFileSync(appJson, "utf8")) as typeof APP_JSON).projets.map(({ dossier: folder }) => folder), [FOLDER, "/Users/chef/code/salle"]);

    // Le gist amorcé, la lecture suivante le lit lui, sans le réécrire.
    const callsBefore = github.appels().length;
    assert.deepEqual(await ofPreferences(github, appJson).lire(), { preferences: expected, source: "gist" });
    assert.ok(github.appels().slice(callsBefore).every((call) => !call.includes("-X")));
  });

  test("un gist qui existe mais ne porte aucune préférence est amorcé lui aussi, sans en créer un autre", { skip: WITHOUT_POSIX }, async (t) => {
    const github = oneGitHub(t);
    await ofPreferences(github, oneAppJson(t, { projets: [] })).ecrire({});
    assert.equal(github.gists().length, 1);

    assert.deepEqual(await ofPreferences(github, oneAppJson(t)).lire(), { preferences: personal(APP_JSON), source: "app.json" });
    assert.equal(github.gists().length, 1);
    assert.deepEqual(github.preferences(github.gists()[0]!), personal(APP_JSON));
  });

  test("GitHub en panne : la lecture rend les valeurs locales, sans lever, et l'écriture dit pourquoi", { skip: WITHOUT_POSIX }, async (t) => {
    const github = oneGitHub(t);
    const preferences = ofPreferences(github, oneAppJson(t));
    github.panne(true);

    const readEntries = await preferences.lire();
    assert.equal(readEntries.source, "locales");
    assert.deepEqual(readEntries.preferences, personal(APP_JSON));
    assert.match(readEntries.panne ?? "", /error connecting to api\.github\.com/);
    assert.match((await preferences.ecrire({ affichage: {} })) ?? "", /^your preferences were not written to GitHub: error connecting/);

    // Le réseau revenu, le gist est amorcé à la lecture suivante.
    github.panne(false);
    assert.equal((await preferences.lire()).source, "app.json");
    assert.equal(github.gists().length, 1);
  });

  test("un gist illisible : les valeurs locales, sans lever, et rien n'est écrit par-dessus", { skip: WITHOUT_POSIX }, async (t) => {
    const github = oneGitHub(t);
    const preferences = ofPreferences(github, oneAppJson(t));
    await preferences.ecrire({ affichage: { densite: "serree" } });
    const gist = github.gists()[0]!;

    for (const [content, reason] of [
      ["{ pas du json", /not readable JSON/],
      [{ version: 2, preferences: {} }, /newer brigade \(version 2\)/],
    ] as const) {
      writeFileSync(join(github.repertoire, `${gist.id}.gist.json`), JSON.stringify({ ...gist, files: { [FILE_PREFERENCES]: { filename: FILE_PREFERENCES, content: typeof content === "string" ? content : JSON.stringify(content) } } }));
      const callsBefore = github.appels().length;
      const readEntries = await preferences.lire();
      assert.equal(readEntries.source, "locales");
      assert.deepEqual(readEntries.preferences, personal(APP_JSON));
      assert.match(readEntries.panne ?? "", reason);
      assert.ok(github.appels().slice(callsBefore).every((call) => !call.includes("-X")), "nothing written over a gist it did not understand");
    }
  });

  test("un gist effacé sur GitHub est recréé à l'écriture suivante", { skip: WITHOUT_POSIX }, async (t) => {
    const github = oneGitHub(t);
    const preferences = ofPreferences(github, oneAppJson(t));
    await preferences.ecrire({ affichage: { densite: "serree" } });
    rmSync(join(github.repertoire, `${github.gists()[0]!.id}.gist.json`));

    assert.equal(await preferences.ecrire({ affichage: { densite: "aeree" } }), undefined);
    assert.equal(github.gists().length, 1);
    assert.deepEqual(github.preferences(github.gists()[0]!), { affichage: { densite: "aeree" } });
  });
});

test("le module ne lit ni n'écrit aucun projet.json : les réglages partagés du projet ne sont pas de ce niveau", () => {
  for (const name of readdirSync(SOURCES)) assert.ok(!readFileSync(join(SOURCES, name), "utf8").includes("projet.json"), name);
});
