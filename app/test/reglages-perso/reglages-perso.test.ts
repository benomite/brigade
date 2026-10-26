// Les préférences personnelles du chef dans un gist secret de son compte, contre la doublure de
// `gh` qui tient les gists dans un répertoire (../stations/faux-gh-gists.ts) : ni réseau, ni GitHub.
// Chaque entrée envoyée à `gh` est gardée : c'est là qu'on regarde ce qui quitte l'appareil.
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { DESCRIPTION, FICHIER_PREFERENCES, gistDesPreferences } from "../../src/reglages-perso/gist.ts";
import { CLES_DE_L_APPAREIL, CLES_DU_PROJET_SUR_L_APPAREIL, personnelles } from "../../src/reglages-perso/partage.ts";
import { reglagesPerso } from "../../src/reglages-perso/reglages-perso.ts";
import { ghDuRepertoire } from "../aides/gh-du-repertoire.ts";
import { SANS_POSIX } from "../aides/posix.ts";
import { repondre } from "../stations/faux-gh-gists.ts";

type Gist = { id: string; description: string; public: boolean; files: Record<string, { filename: string; content: string }> };

const SOURCES = join(import.meta.dirname, "../../src/reglages-perso");
const DOSSIER = "/Users/chef/code/cuisine-secrete";
const HOTE = "box-du-sous-sol.lan";

// Un fichier de l'app tel que le chef l'a sur son Mac : un projet avec ses couleurs, son dossier et sa box.
const APP_JSON = {
  hotes: [HOTE],
  projets: [
    { nom: "cuisine", dossier: DOSSIER, hote: HOTE, depot: "chef/cuisine", base: "v2", couleurs: { onglet: "#f2994a", accent: "#ad7142" }, stations: ["mac/claude"], ordinaires: true, limiteCooks: 2 },
    { nom: "salle", dossier: "/Users/chef/code/salle", couleurs: { onglet: "#7f9cf5", accent: "#7f9cf5" } },
  ],
};

// GitHub : les gists du compte dans un répertoire, et chaque entrée envoyée à `gh`.
function unGitHub(t: TestContext) {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-app-preferences-"));
  writeFileSync(join(repertoire, "appels"), "");
  const envoyes: string[] = [];
  const gh = ghDuRepertoire(repertoire, (dossier, args, entree) => {
    const lue = entree();
    if (lue !== "") envoyes.push(lue);
    return repondre(dossier, args, () => lue);
  });
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const gists = (): Gist[] => readdirSync(repertoire).filter((nom) => nom.endsWith(".gist.json")).map((nom) => JSON.parse(readFileSync(join(repertoire, nom), "utf8")) as Gist);
  const preferences = (gist: Gist) => (JSON.parse(gist.files[FICHIER_PREFERENCES]!.content) as { preferences: Record<string, unknown> }).preferences;
  // Ce qu'un autre appareil du chef écrit dans le gist.
  const ailleurs = (gist: Gist, contenu: unknown) => writeFileSync(join(repertoire, `${gist.id}.gist.json`), JSON.stringify({ ...gist, files: { ...gist.files, [FICHIER_PREFERENCES]: { filename: FICHIER_PREFERENCES, content: JSON.stringify(contenu) } } }));
  const appels = () => readFileSync(join(repertoire, "appels"), "utf8").split("\n").filter(Boolean);
  return { repertoire, gh, envoyes, gists, preferences, ailleurs, appels, panne: (oui: boolean) => (oui ? writeFileSync(join(repertoire, "panne"), "") : rmSync(join(repertoire, "panne"), { force: true })) };
}

function unAppJson(t: TestContext, contenu: unknown = APP_JSON): string {
  const dossier = mkdtempSync(join(tmpdir(), "brigade-app-json-"));
  t.after(() => rmSync(dossier, { recursive: true, force: true }));
  const chemin = join(dossier, "app.json");
  writeFileSync(chemin, `${JSON.stringify(contenu, null, 2)}\n`);
  return chemin;
}

const desPreferences = (github: { gh: string }, appJson: string) => reglagesPerso({ gist: gistDesPreferences({ gh: github.gh, delaiMs: 30_000 }), appJson });

describe("la frontière entre le personnel et l'appareil", () => {
  test("une liste explicite : le dossier d'un projet et son hôte ssh en sont, ses couleurs non", () => {
    for (const cle of ["dossier", "hote"]) assert.ok(CLES_DU_PROJET_SUR_L_APPAREIL.includes(cle), cle);
    assert.ok(CLES_DE_L_APPAREIL.includes("hotes"));
    assert.ok(!CLES_DU_PROJET_SUR_L_APPAREIL.includes("couleurs"));
  });

  test("tout le reste est personnel, une préférence de demain comprise, et les projets gardent leur ordre", () => {
    const lues = personnelles({ ...APP_JSON, affichage: { densite: "serree" }, demain: 42 });
    assert.deepEqual(lues, {
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
  test("la première écriture crée un gist secret, les suivantes réécrivent le même", { skip: SANS_POSIX }, async (t) => {
    const github = unGitHub(t);
    const preferences = desPreferences(github, unAppJson(t));

    assert.equal(await preferences.ecrire({ projets: [{ nom: "cuisine", couleurs: { onglet: "#f2994a" } }] }), undefined);
    const [cree, ...autres] = github.gists();
    assert.equal(autres.length, 0);
    assert.equal(cree!.public, false, "a secret gist, never a public one");
    assert.equal(cree!.description, DESCRIPTION);
    assert.ok(github.appels().some((appel) => appel.startsWith("api -X POST /gists")));

    assert.equal(await preferences.ecrire({ projets: [{ nom: "cuisine", couleurs: { onglet: "#7f9cf5" } }] }), undefined);
    assert.equal(await preferences.ecrire({ projets: [{ nom: "salle" }, { nom: "cuisine" }] }), undefined);
    assert.deepEqual(github.gists().map(({ id }) => id), [cree!.id]);
    assert.equal(github.appels().filter((appel) => appel.startsWith("api -X POST")).length, 1);
    assert.equal(github.appels().filter((appel) => appel === `api -X PATCH /gists/${cree!.id} --input -`).length, 2);
    assert.deepEqual(github.preferences(github.gists()[0]!), { projets: [{ nom: "salle" }, { nom: "cuisine" }] });
  });

  test("un autre appareil retrouve le gist par la liste du compte, et le réécrit au lieu d'en créer un", { skip: SANS_POSIX }, async (t) => {
    const github = unGitHub(t);
    await desPreferences(github, unAppJson(t)).ecrire({ affichage: { densite: "serree" } });
    assert.equal(await desPreferences(github, unAppJson(t)).ecrire({ affichage: { densite: "aeree" } }), undefined);
    assert.equal(github.gists().length, 1);
    assert.deepEqual(github.preferences(github.gists()[0]!), { affichage: { densite: "aeree" } });
  });

  test("une clé personnelle part dans le gist ; une clé de l'appareil n'apparaît dans aucune charge envoyée", { skip: SANS_POSIX }, async (t) => {
    const github = unGitHub(t);
    const preferences = desPreferences(github, unAppJson(t));
    const ecrites = { ...APP_JSON, affichage: { densite: "serree" } };

    assert.equal(await preferences.ecrire(ecrites), undefined);
    assert.equal(await preferences.ecrire({ ...ecrites, projets: [...ecrites.projets].reverse() }), undefined);

    // La couleur d'un projet, l'ordre des projets, une préférence d'affichage : dans le gist.
    assert.deepEqual(github.preferences(github.gists()[0]!), {
      projets: [
        { nom: "salle", couleurs: { onglet: "#7f9cf5", accent: "#7f9cf5" } },
        { nom: "cuisine", depot: "chef/cuisine", base: "v2", couleurs: { onglet: "#f2994a", accent: "#ad7142" } },
      ],
      affichage: { densite: "serree" },
    });
    // Le dossier d'un projet, son hôte ssh : ni la clé, ni la valeur, dans aucune entrée de `gh`.
    assert.equal(github.envoyes.length, 2);
    for (const envoye of github.envoyes) {
      for (const interdit of [DOSSIER, "/Users/chef/code/salle", HOTE]) assert.ok(!envoye.includes(interdit), `${interdit} left the device: ${envoye}`);
      assert.doesNotMatch(envoye, /\b(dossier|hotes?|stations|ordinaires|limiteCooks)\b/, "no device-bound key in the payload");
    }
  });

  test("une lecture rend les préférences du gist, et ce qu'un autre appareil y a ajouté se lit à la suivante", { skip: SANS_POSIX }, async (t) => {
    const github = unGitHub(t);
    const preferences = desPreferences(github, unAppJson(t, { projets: [] }));
    await preferences.ecrire({ projets: [{ nom: "cuisine", couleurs: { onglet: "#f2994a" } }] });

    assert.deepEqual(await preferences.lire(), { preferences: { projets: [{ nom: "cuisine", couleurs: { onglet: "#f2994a" } }] }, source: "gist" });

    // Un autre appareil ajoute une préférence — et y glisse un dossier, qui ne se lit pas ici.
    github.ailleurs(github.gists()[0]!, { version: 1, preferences: { projets: [{ nom: "cuisine", dossier: "/ailleurs", couleurs: { onglet: "#f2994a" } }], affichage: { densite: "serree" } } });
    assert.deepEqual(await preferences.lire(), { preferences: { projets: [{ nom: "cuisine", couleurs: { onglet: "#f2994a" } }], affichage: { densite: "serree" } }, source: "gist" });
  });

  test("sans préférence dans le gist, la première lecture l'amorce avec celles du fichier de l'app, et laisse le fichier tel qu'il est", { skip: SANS_POSIX }, async (t) => {
    const github = unGitHub(t);
    const appJson = unAppJson(t);
    const avant = readFileSync(appJson, "utf8");
    const attendues = personnelles(APP_JSON);

    assert.deepEqual(await desPreferences(github, appJson).lire(), { preferences: attendues, source: "app.json" });
    const [amorce, ...autres] = github.gists();
    assert.equal(autres.length, 0);
    assert.equal(amorce!.public, false);
    assert.deepEqual(github.preferences(amorce!), attendues);
    for (const envoye of github.envoyes) for (const interdit of [DOSSIER, HOTE]) assert.ok(!envoye.includes(interdit), `${interdit} left the device`);

    // Les clés de l'appareil sont toujours dans le fichier de l'app : il n'a pas bougé.
    assert.equal(readFileSync(appJson, "utf8"), avant);
    assert.deepEqual((JSON.parse(readFileSync(appJson, "utf8")) as typeof APP_JSON).projets.map(({ dossier, hote }) => ({ dossier, hote })), [{ dossier: DOSSIER, hote: HOTE }, { dossier: "/Users/chef/code/salle", hote: undefined }]);

    // Le gist amorcé, la lecture suivante le lit lui, sans le réécrire.
    const appelsAvant = github.appels().length;
    assert.deepEqual(await desPreferences(github, appJson).lire(), { preferences: attendues, source: "gist" });
    assert.ok(github.appels().slice(appelsAvant).every((appel) => !appel.includes("-X")));
  });

  test("un gist qui existe mais ne porte aucune préférence est amorcé lui aussi, sans en créer un autre", { skip: SANS_POSIX }, async (t) => {
    const github = unGitHub(t);
    await desPreferences(github, unAppJson(t, { projets: [] })).ecrire({});
    assert.equal(github.gists().length, 1);

    assert.deepEqual(await desPreferences(github, unAppJson(t)).lire(), { preferences: personnelles(APP_JSON), source: "app.json" });
    assert.equal(github.gists().length, 1);
    assert.deepEqual(github.preferences(github.gists()[0]!), personnelles(APP_JSON));
  });

  test("GitHub en panne : la lecture rend les valeurs locales, sans lever, et l'écriture dit pourquoi", { skip: SANS_POSIX }, async (t) => {
    const github = unGitHub(t);
    const preferences = desPreferences(github, unAppJson(t));
    github.panne(true);

    const lues = await preferences.lire();
    assert.equal(lues.source, "locales");
    assert.deepEqual(lues.preferences, personnelles(APP_JSON));
    assert.match(lues.panne ?? "", /error connecting to api\.github\.com/);
    assert.match((await preferences.ecrire({ affichage: {} })) ?? "", /^your preferences were not written to GitHub: error connecting/);

    // Le réseau revenu, le gist est amorcé à la lecture suivante.
    github.panne(false);
    assert.equal((await preferences.lire()).source, "app.json");
    assert.equal(github.gists().length, 1);
  });

  test("un gist illisible : les valeurs locales, sans lever, et rien n'est écrit par-dessus", { skip: SANS_POSIX }, async (t) => {
    const github = unGitHub(t);
    const preferences = desPreferences(github, unAppJson(t));
    await preferences.ecrire({ affichage: { densite: "serree" } });
    const gist = github.gists()[0]!;

    for (const [contenu, raison] of [
      ["{ pas du json", /not readable JSON/],
      [{ version: 2, preferences: {} }, /newer brigade \(version 2\)/],
    ] as const) {
      writeFileSync(join(github.repertoire, `${gist.id}.gist.json`), JSON.stringify({ ...gist, files: { [FICHIER_PREFERENCES]: { filename: FICHIER_PREFERENCES, content: typeof contenu === "string" ? contenu : JSON.stringify(contenu) } } }));
      const appelsAvant = github.appels().length;
      const lues = await preferences.lire();
      assert.equal(lues.source, "locales");
      assert.deepEqual(lues.preferences, personnelles(APP_JSON));
      assert.match(lues.panne ?? "", raison);
      assert.ok(github.appels().slice(appelsAvant).every((appel) => !appel.includes("-X")), "nothing written over a gist it did not understand");
    }
  });

  test("un gist effacé sur GitHub est recréé à l'écriture suivante", { skip: SANS_POSIX }, async (t) => {
    const github = unGitHub(t);
    const preferences = desPreferences(github, unAppJson(t));
    await preferences.ecrire({ affichage: { densite: "serree" } });
    rmSync(join(github.repertoire, `${github.gists()[0]!.id}.gist.json`));

    assert.equal(await preferences.ecrire({ affichage: { densite: "aeree" } }), undefined);
    assert.equal(github.gists().length, 1);
    assert.deepEqual(github.preferences(github.gists()[0]!), { affichage: { densite: "aeree" } });
  });
});

test("le module ne lit ni n'écrit aucun projet.json : les réglages partagés du projet ne sont pas de ce niveau", () => {
  for (const nom of readdirSync(SOURCES)) assert.ok(!readFileSync(join(SOURCES, nom), "utf8").includes("projet.json"), nom);
});
