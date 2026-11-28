// Ranger les projets dans la barre : une case se glisse et se lâche ailleurs — elle prend cette
// place, et les autres se décalent. Un trait dit où elle atterrira ; l'ordre est celui du fichier
// des projets, que « Tous les projets » suit aussi ; un simple clic ouvre toujours son projet.
// La vue est jouée devant un faux document (helpers/false-vue.ts) : le glisser du navigateur y est
// rejoué événement par événement, sur la case puis sur la barre, comme ils remontent.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { forTheBar } from "../src/bar.ts";
import { EXAMPLE, type Project } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";

import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { HEADINGS } from "../src/tabs.ts";
import { type Fake, FakeTransfer, playTheVue, type Played, repos } from "./helpers/false-vue.ts";

const project = (name: string): Project => ({ nom: name, dossier: `/tmp/${name}` });
const [A, B, C, D] = ["alpha", "bravo", "charlie", "delta"].map(project) as [Project, Project, Project, Project];
const shownEntry = (projects: Project[]) => forTheBar({ chemin: "/tmp/app.json", projets: projects });

const play = (projects: Project[], tidy: (name: string, rank: number) => string | undefined = () => undefined) =>
  playTheVue({
    demarrage: () => ({
      configuration: shownEntry(projects),
      palette: PALETTE,
      exemple: EXAMPLE,
      rubriques: HEADINGS,
      gestes: {},
      calibrage: { modeles: MODELS, efforts: EFFORTS },
      }),
    espace: () => [],
    ranger: tidy,
  });

// La barre : « T », les projets dans l'ordre du fichier, puis « + ».
const bar = (vue: Played) => vue.element("projets");
const caseOf = (vue: Played, name: string): Fake => bar(vue).children.find(({ title }) => title === name) ?? assert.fail(`pas de case « ${name} »`);
const order = (vue: Played) => bar(vue).children.map(({ title }) => title);
const strokes = (vue: Played) =>
  bar(vue).children.flatMap(({ title, classList }) => [...(classList.contains("depot-avant") ? [`avant ${title}`] : []), ...(classList.contains("depot-apres") ? [`après ${title}`] : [])]);
const cleanups = (vue: Played) => vue.appels.filter(({ geste: action }) => action === "ranger").map(({ args }) => args);

// Un événement de glisser, tel qu'il remonte : de la case survolée jusqu'à la barre, à moins
// qu'une écoute ne l'arrête. Rend s'il a été accepté — `preventDefault`, ce qui permet de lâcher.
function raise(vue: Played, type: string, or: Fake | undefined, transfer: FakeTransfer, relatedTarget: Fake | null = null): boolean {
  let accepts = false;
  let stops = false;
  const event = { dataTransfer: transfer, relatedTarget, preventDefault: () => void (accepts = true), stopPropagation: () => void (stops = true) };
  for (const element of [...(or === undefined ? [] : [or]), bar(vue)]) {
    if (stops) break;
    element.declencher(type, event);
  }
  return accepts;
}

// Le chef prend une case : rend ce qu'elle porte, pour la suite du geste.
function take(vue: Played, name: string): FakeTransfer {
  const transfer = new FakeTransfer();
  caseOf(vue, name).declencher("dragstart", { dataTransfer: transfer });
  return transfer;
}

describe("ranger les projets en les glissant dans la barre", () => {
  test("chaque case de projet se glisse — « Tous les projets » et l'ajout ne bougent pas", async () => {
    const vue = await play([A, B, C]);

    assert.deepEqual(
      bar(vue).children.map(({ title, draggable }) => [title, draggable === true]),
      [
        ["All projects", false],
        ["alpha", true],
        ["bravo", true],
        ["charlie", true],
        ["Add a project", false],
      ],
    );
  });

  test("une case glissée vers le haut : un trait avant la case survolée — lâchée, elle prend sa place", async () => {
    const vue = await play([A, B, C, D]);
    const transfer = take(vue, "charlie");

    assert.equal(caseOf(vue, "charlie").classList.contains("glissee"), true, "la case glissée s'efface à demi");
    assert.equal(raise(vue, "dragover", caseOf(vue, "bravo"), transfer), true, "la barre accepte la case");
    assert.deepEqual(strokes(vue), ["avant bravo"]);
    assert.equal(raise(vue, "dragover", caseOf(vue, "alpha"), transfer), true);
    assert.deepEqual(strokes(vue), ["avant alpha"], "un seul trait à la fois");

    raise(vue, "drop", caseOf(vue, "alpha"), transfer);
    caseOf(vue, "charlie").declencher("dragend");
    await repos();

    assert.deepEqual(cleanups(vue), [["charlie", 0]]);
    assert.deepEqual(strokes(vue), []);
    assert.equal(caseOf(vue, "charlie").classList.contains("glissee"), false);
  });

  test("une case glissée vers le bas : le trait est après la case survolée", async () => {
    const vue = await play([A, B, C, D]);
    const transfer = take(vue, "alpha");

    raise(vue, "dragover", caseOf(vue, "charlie"), transfer);
    assert.deepEqual(strokes(vue), ["après charlie"]);
    raise(vue, "drop", caseOf(vue, "charlie"), transfer);
    await repos();

    assert.deepEqual(cleanups(vue), [["alpha", 2]]);
  });

  test("lâchée entre deux cases, ou sur « T », elle va où le trait le disait", async () => {
    const vue = await play([A, B, C]);
    const transfer = take(vue, "charlie");

    raise(vue, "dragover", caseOf(vue, "alpha"), transfer);
    // Au-dessus de la première case : « T », puis l'espace qui les sépare — c'est la barre qui reçoit.
    raise(vue, "dragover", caseOf(vue, "All projects"), transfer);
    assert.deepEqual(strokes(vue), ["avant alpha"]);
    raise(vue, "drop", undefined, transfer);
    await repos();

    assert.deepEqual(cleanups(vue), [["charlie", 0]]);
  });

  test("le nouvel ordre est celui du fichier : la barre et « Tous les projets » le prennent dès qu'il revient", async () => {
    const vue = await play([A, B, C]);
    const titles = () => vue.element("accueil-projets").dessous("strong").map(({ textContent }) => textContent);
    assert.deepEqual(titles(), ["alpha", "bravo", "charlie"]);

    vue.dire("surConfiguration", shownEntry([C, A, B]), []);
    await repos();

    assert.deepEqual(order(vue), ["All projects", "charlie", "alpha", "bravo", "Add a project"]);
    assert.deepEqual(titles(), ["charlie", "alpha", "bravo"]);
    // Les cases reposées se rangent encore.
    const transfer = take(vue, "bravo");
    raise(vue, "dragover", caseOf(vue, "charlie"), transfer);
    raise(vue, "drop", caseOf(vue, "charlie"), transfer);
    await repos();
    assert.deepEqual(cleanups(vue), [["bravo", 0]]);
  });

  test("un simple clic ouvre toujours son projet, et ne range rien", async () => {
    const vue = await play([A, B, C]);

    caseOf(vue, "bravo").click();
    await repos();

    assert.equal(caseOf(vue, "bravo").ariaCurrent, "true");
    assert.deepEqual(cleanups(vue), []);
  });

  test("une case lâchée sur elle-même ne range rien : elle s'ouvre, comme sous un clic", async () => {
    const vue = await play([A, B, C]);
    const transfer = take(vue, "bravo");

    raise(vue, "dragover", caseOf(vue, "alpha"), transfer);
    raise(vue, "dragover", caseOf(vue, "bravo"), transfer);
    assert.deepEqual(strokes(vue), [], "aucun trait sur sa propre case");
    raise(vue, "drop", caseOf(vue, "bravo"), transfer);
    await repos();

    assert.deepEqual(cleanups(vue), []);
    assert.equal(caseOf(vue, "bravo").ariaCurrent, "true");
  });

  test("sortie de la barre, le trait s'efface : lâchée dehors, la case reprend sa place", async () => {
    const vue = await play([A, B, C]);
    const transfer = take(vue, "charlie");

    raise(vue, "dragover", caseOf(vue, "alpha"), transfer);
    // D'une case à l'autre, le trait reste ; hors de la barre, il part.
    raise(vue, "dragleave", caseOf(vue, "alpha"), transfer, caseOf(vue, "bravo"));
    assert.deepEqual(strokes(vue), ["avant alpha"]);
    raise(vue, "dragleave", caseOf(vue, "alpha"), transfer, null);
    assert.deepEqual(strokes(vue), []);
    caseOf(vue, "charlie").declencher("dragend");
    await repos();

    assert.deepEqual(cleanups(vue), []);
    assert.equal(caseOf(vue, "charlie").classList.contains("glissee"), false);
    assert.equal(caseOf(vue, "charlie").ariaCurrent, "false");
  });

  test("ce qui est glissé d'ailleurs — un fichier, un texte — n'est pas reçu par la barre", async () => {
    const vue = await play([A, B, C]);
    const file = new FakeTransfer();
    file.setData("Files", "");

    assert.equal(raise(vue, "dragover", caseOf(vue, "alpha"), file), false);
    assert.deepEqual(strokes(vue), []);
    raise(vue, "drop", caseOf(vue, "alpha"), file);
    await repos();

    assert.deepEqual(cleanups(vue), []);
  });

  test("un rangement refusé le dit par-dessus l'écran, et la barre garde l'ordre du fichier", async () => {
    const vue = await play([A, B, C], () => "the app does not write to a file it could not re-read — unreadable JSON");
    const transfer = take(vue, "charlie");

    raise(vue, "dragover", caseOf(vue, "alpha"), transfer);
    raise(vue, "drop", caseOf(vue, "alpha"), transfer);
    await repos();

    const opinion = vue.element("avis");
    assert.equal(opinion.hidden, false);
    assert.match(opinion.textContent, /“charlie” was not moved in the bar/);
    assert.match(opinion.textContent, /unreadable JSON/);
    assert.deepEqual(order(vue), ["All projects", "alpha", "bravo", "charlie", "Add a project"]);
  });
});
