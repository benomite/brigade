// Le fichier des projets, suivi : créé s'il manque, relu quand il change. Chaque
// test écrit un vrai fichier, et attend ce que le suivi en dit — jamais une durée.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Configuration } from "../src/config.ts";
import { followConfiguration } from "../src/tracking.ts";
import { LINKS } from "./helpers/posix.ts";

function tracking(t: TestContext, content?: unknown) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "brigade-app-")));
  for (const name of ["a", "b", "c"]) mkdirSync(join(root, name));
  const path = join(root, "config/app.json");
  if (content !== undefined) {
    mkdirSync(join(root, "config"));
    writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content));
  }
  const saidOnes: { configuration: Configuration; partis: string[] }[] = [];
  const tracked = followConfiguration({ chemin: path, surChangement: (configuration, gone) => void saidOnes.push({ configuration, partis: gone }) });
  t.after(() => {
    tracked.fermer();
    rmSync(root, { recursive: true, force: true });
  });
  const project = (name: string) => ({ nom: name, dossier: join(root, name) });
  const names = () => tracked.configuration().projets.map(({ nom: name }) => name);
  return { racine: root, chemin: path, suivie: tracked, dits: saidOnes, projet: project, noms: names };
}

// Écrit jusqu'à ce que le suivi l'ait dit : une veille à peine posée peut manquer
// la toute première écriture (FSEvents démarre à son heure), jamais les suivantes.
// Le délai n'est qu'une garde, pour qu'un test cassé finisse par le dire.
async function writeUntil(write: () => void, condition: () => boolean, what: () => string): Promise<void> {
  const limit = Date.now() + 60_000;
  while (!condition()) {
    if (Date.now() > limit) throw new Error(`jamais arrivé — ${what()}`);
    write();
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("le fichier des projets, suivi", () => {
  test("au premier lancement, le fichier qui manque est créé : aucun projet, et rien de refusé", (t) => {
    const { chemin: path, suivie: tracked } = tracking(t);

    assert.deepEqual(tracked.configuration(), { chemin: path, projets: [] });
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { projets: [] });
  });

  test("un fichier déjà là est lu tel qu'il est — refusé, il garde son chemin et sa raison", (t) => {
    const { chemin: path, suivie: tracked } = tracking(t, { projets: "brigade" });

    assert.deepEqual(tracked.configuration(), { chemin: path, projets: [], refus: "“projets” must be a list" });
    assert.equal(readFileSync(path, "utf8"), '{"projets":"brigade"}');
  });

  test("un fichier qui ne peut pas être créé est dit, avec son chemin et la raison", (t) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "brigade-app-")));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    writeFileSync(join(root, "config"), "un fichier, pas un dossier");
    const path = join(root, "config/app.json");

    const tracked = followConfiguration({ chemin: path, surChangement: () => assert.fail("rien n'a changé") });
    t.after(() => tracked.fermer());

    assert.equal(tracked.configuration().chemin, path);
    assert.match(tracked.configuration().refus ?? "", /^this file could not be created: /);
  });

  test("le fichier est relu quand il change : la liste suit, sans que rien ne soit relancé", async (t) => {
    const { chemin: path, dits: saidOnes, projet: project, noms: names } = tracking(t, { projets: [] });

    await writeUntil(() => writeFileSync(path, JSON.stringify({ projets: [project("a")] })), () => names().join() === "a", () => JSON.stringify(saidOnes));
    await writeUntil(() => writeFileSync(path, JSON.stringify({ projets: [project("a"), project("b")] })), () => names().join() === "a,b", () => JSON.stringify(saidOnes));

    assert.deepEqual(saidOnes.at(-1), { configuration: { chemin: path, projets: [project("a"), project("b")] }, partis: [] });
  });

  test("un éditeur qui remplace le fichier au lieu de l'écrire est suivi pareil", async (t) => {
    const { chemin: path, dits: saidOnes, projet: project, noms: names } = tracking(t, { projets: [] });

    const replace = (content: unknown) => () => {
      writeFileSync(`${path}.neuf`, JSON.stringify(content));
      renameSync(`${path}.neuf`, path);
    };
    await writeUntil(replace({ projets: [project("a")] }), () => names().join() === "a", () => JSON.stringify(saidOnes));
    await writeUntil(replace({ projets: [project("b")] }), () => names().join() === "b", () => JSON.stringify(saidOnes));
  });

  test("un fichier atteint par un lien est suivi là où il est vraiment", async (t) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "brigade-app-")));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, "vrai"));
    mkdirSync(join(root, "config"));
    writeFileSync(join(root, "vrai/projets.json"), JSON.stringify({ projets: [] }));
    symlinkSync(join(root, "vrai/projets.json"), join(root, "config/app.json"));
    const tracked = followConfiguration({ chemin: join(root, "config/app.json"), surChangement: () => {} });
    t.after(() => tracked.fermer());

    await writeUntil(
      () => writeFileSync(join(root, "vrai/projets.json"), JSON.stringify({ projets: [{ nom: "a", dossier: root }] })),
      () => tracked.configuration().projets.length === 1,
      () => JSON.stringify(tracked.configuration()),
    );
  });

  test("un fichier lu à moitié ne fait rien disparaître : les projets d'avant restent, et le chemin et la raison sont dits", (t) => {
    const { chemin: path, suivie: tracked, dits: saidOnes, projet: project } = tracking(t, { projets: [{ nom: "a", dossier: "/" }] });
    const before = tracked.configuration().projets;

    writeFileSync(path, '{ "projets": [');
    tracked.relire();

    assert.equal(saidOnes.length, 1);
    assert.deepEqual(saidOnes[0]?.partis, []);
    assert.deepEqual(tracked.configuration().projets, before);
    assert.equal(tracked.configuration().refus, undefined);
    assert.match(tracked.configuration().nonRelu ?? "", /^unreadable JSON: /);

    writeFileSync(path, JSON.stringify({ projets: [{ nom: "a", dossier: "/" }, project("b")] }));
    tracked.relire();

    assert.deepEqual(tracked.configuration(), { chemin: path, projets: [{ nom: "a", dossier: "/" }, project("b")] });
    assert.deepEqual(saidOnes.at(-1)?.partis, []);
  });

  test("un fichier supprimé ne fait rien disparaître non plus, et n'est pas recréé dans le dos du chef", (t) => {
    const { chemin: path, suivie: tracked, projet: project } = tracking(t, { projets: [] });
    writeFileSync(path, JSON.stringify({ projets: [project("a")] }));
    tracked.relire();

    rmSync(path);
    tracked.relire();

    assert.deepEqual(tracked.configuration(), { chemin: path, projets: [project("a")], nonRelu: "this file does not exist" });
  });

  test("un fichier refusé au lancement, puis réparé, donne ses projets sans relancer", (t) => {
    const { chemin: path, suivie: tracked, projet: project } = tracking(t, "{ projets: ");

    writeFileSync(path, JSON.stringify({ projets: [project("a")] }));
    tracked.relire();

    assert.deepEqual(tracked.configuration(), { chemin: path, projets: [project("a")] });
  });

  test("une relecture qui ne change rien ne dit rien", (t) => {
    const { chemin: path, suivie: tracked, dits: saidOnes, projet: project } = tracking(t, { projets: [] });
    writeFileSync(path, JSON.stringify({ projets: [project("a")] }));
    tracked.relire();

    writeFileSync(path, JSON.stringify({ projets: [project("a")] }, null, 2));
    tracked.relire();
    tracked.relire();

    assert.equal(saidOnes.length, 1);
  });

  test("un projet retiré du fichier, ou dont le dossier a changé, est dit parti — les autres non", (t) => {
    const { racine: root, chemin: path, suivie: tracked, dits: saidOnes, projet: project } = tracking(t, { projets: [] });
    writeFileSync(path, JSON.stringify({ projets: [project("a"), project("b"), project("c")] }));
    tracked.relire();

    writeFileSync(path, JSON.stringify({ projets: [{ nom: "b", dossier: join(root, "c") }, project("c")] }));
    tracked.relire();

    assert.deepEqual(saidOnes.at(-1)?.partis, ["a", "b"]);
  });

  test("un projet ajouté depuis l'app est dans la liste aussitôt, sans attendre la veille du fichier", (t) => {
    const { suivie: tracked, dits: saidOnes, projet: project, noms: names } = tracking(t);

    assert.equal(tracked.ajouter(project("a")), undefined);

    assert.deepEqual(names(), ["a"]);
    assert.equal(saidOnes.length, 1);
  });

  test("un ajout refusé dit pourquoi, et ne change rien", (t) => {
    const { suivie: tracked, dits: saidOnes, projet: project } = tracking(t, { projets: [{ nom: "a", dossier: "/" }] });

    assert.equal(tracked.ajouter(project("a")), "two projects are named “a”");

    assert.equal(saidOnes.length, 0);
  });

  test("un fichier supprimé en cours de route n'est pas réécrit par un ajout : les autres projets ne partent pas, et la raison est dite", (t) => {
    const { chemin: path, suivie: tracked, dits: saidOnes, projet: project, noms: names } = tracking(t, { projets: [] });
    writeFileSync(path, JSON.stringify({ projets: [project("a"), project("b")] }));
    tracked.relire();

    rmSync(path);
    const refusal = tracked.ajouter(project("c"));

    assert.equal(refusal, "the app does not write to a file it could not re-read — this file does not exist");
    assert.equal(existsSync(path), false);
    assert.deepEqual(names(), ["a", "b"]);
    assert.deepEqual(saidOnes.flatMap(({ partis: gone }) => gone), []);
  });

  test("un fichier devenu illisible n'est pas réécrit par un ajout non plus", (t) => {
    const { chemin: path, suivie: tracked, projet: project, noms: names } = tracking(t, { projets: [] });
    writeFileSync(path, JSON.stringify({ projets: [project("a")] }));
    tracked.relire();

    writeFileSync(path, '{ "projets": [');

    assert.match(tracked.ajouter(project("b")) ?? "", /^the app does not write to a file it could not re-read — unreadable JSON: /);
    assert.equal(readFileSync(path, "utf8"), '{ "projets": [');
    assert.deepEqual(names(), ["a"]);
  });

  test("un projet retiré depuis l'app quitte la liste aussitôt, et il est dit parti — les autres non, et le fichier n'a plus sa ligne", (t) => {
    const { chemin: path, suivie: tracked, dits: saidOnes, projet: project, noms: names } = tracking(t, { projets: [] });
    writeFileSync(path, JSON.stringify({ projets: [project("a"), project("b")] }));
    tracked.relire();

    assert.equal(tracked.retirer("a"), undefined);

    assert.deepEqual(names(), ["b"]);
    assert.deepEqual(saidOnes.at(-1)?.partis, ["a"]);
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { projets: [project("b")] });
  });

  test("un retrait refusé dit pourquoi, et ne change rien : un nom inconnu, ou un fichier que l'app n'a pas pu relire", (t) => {
    const { chemin: path, suivie: tracked, dits: saidOnes, projet: project, noms: names } = tracking(t, { projets: [] });
    writeFileSync(path, JSON.stringify({ projets: [project("a")] }));
    tracked.relire();
    const saidEntries = saidOnes.length;

    assert.equal(tracked.retirer("b"), "“b” is not in this file: nothing was changed there");
    writeFileSync(path, '{ "projets": [');
    assert.match(tracked.retirer("a") ?? "", /^the app does not write to a file it could not re-read — unreadable JSON: /);

    assert.equal(readFileSync(path, "utf8"), '{ "projets": [');
    assert.deepEqual(names(), ["a"]);
    assert.deepEqual(saidOnes.slice(saidEntries).flatMap(({ partis: gone }) => gone), []);
  });

  test("un projet rangé prend sa place dans la liste aussitôt, sans que personne ne soit dit parti", (t) => {
    const { chemin: path, suivie: tracked, dits: saidOnes, projet: project, noms: names } = tracking(t, { projets: [] });
    writeFileSync(path, JSON.stringify({ projets: [project("a"), project("b"), project("c")] }));
    tracked.relire();

    assert.equal(tracked.ranger("c", 0), undefined);

    assert.deepEqual(names(), ["c", "a", "b"]);
    assert.deepEqual(saidOnes.at(-1)?.partis, []);
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { projets: [project("c"), project("a"), project("b")] });
  });

  test("un rangement refusé dit pourquoi, et ne change rien : un fichier que l'app n'a pas pu relire", (t) => {
    const { chemin: path, suivie: tracked, projet: project, noms: names } = tracking(t, { projets: [] });
    writeFileSync(path, JSON.stringify({ projets: [project("a"), project("b")] }));
    tracked.relire();
    writeFileSync(path, '{ "projets": [');

    assert.match(tracked.ranger("b", 0) ?? "", /^the app does not write to a file it could not re-read — unreadable JSON: /);

    assert.equal(readFileSync(path, "utf8"), '{ "projets": [');
    assert.deepEqual(names(), ["a", "b"]);
  });

  test("une création en échec garde sa raison, relecture après relecture — et réparée, elle aboutit sans relancer, veille comprise", async (t) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "brigade-app-")));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    writeFileSync(join(root, "config"), "un fichier, pas un dossier");
    const path = join(root, "config/app.json");
    const saidOnes: Configuration[] = [];
    const tracked = followConfiguration({ chemin: path, surChangement: (configuration) => void saidOnes.push(configuration) });
    t.after(() => tracked.fermer());
    const reason = tracked.configuration().refus;

    tracked.relire();

    assert.match(reason ?? "", /^this file could not be created: /);
    assert.equal(tracked.configuration().refus, reason);
    assert.deepEqual(saidOnes, []);

    rmSync(join(root, "config"));
    tracked.relire();

    assert.deepEqual(tracked.configuration(), { chemin: path, projets: [] });
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { projets: [] });
    await writeUntil(
      () => writeFileSync(path, JSON.stringify({ projets: [{ nom: "a", dossier: root }] })),
      () => tracked.configuration().projets.length === 1,
      () => JSON.stringify(saidOnes),
    );
  });

  test("un lien qui ne mène nulle part est refusé avec sa raison, sans que l'app tombe — et suivi dès qu'il mène quelque part", { skip: LINKS }, (t) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "brigade-app-")));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const path = join(root, "app.json");
    symlinkSync(join(root, "absent.json"), path);

    const tracked = followConfiguration({ chemin: path, surChangement: () => {} });
    t.after(() => tracked.fermer());

    assert.deepEqual(tracked.configuration(), { chemin: path, projets: [], refus: "this file could not be created: it is a link to a file that does not exist" });
    assert.equal(existsSync(join(root, "absent.json")), false);

    writeFileSync(join(root, "absent.json"), JSON.stringify({ projets: [{ nom: "a", dossier: root }] }));
    tracked.relire();

    assert.deepEqual(tracked.configuration(), { chemin: path, projets: [{ nom: "a", dossier: root }] });
  });
});

