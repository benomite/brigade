// Le fichier des projets, suivi : créé s'il manque, relu quand il change. Chaque
// test écrit un vrai fichier, et attend ce que le suivi en dit — jamais une durée.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Configuration } from "../src/config.ts";
import { suivreConfiguration } from "../src/suivi.ts";

function suivi(t: TestContext, contenu?: unknown) {
  const racine = realpathSync(mkdtempSync(join(tmpdir(), "brigade-app-")));
  for (const nom of ["a", "b", "c"]) mkdirSync(join(racine, nom));
  const chemin = join(racine, "config/app.json");
  if (contenu !== undefined) {
    mkdirSync(join(racine, "config"));
    writeFileSync(chemin, typeof contenu === "string" ? contenu : JSON.stringify(contenu));
  }
  const dits: { configuration: Configuration; partis: string[] }[] = [];
  const suivie = suivreConfiguration({ chemin, surChangement: (configuration, partis) => void dits.push({ configuration, partis }) });
  t.after(() => {
    suivie.fermer();
    rmSync(racine, { recursive: true, force: true });
  });
  const projet = (nom: string) => ({ nom, dossier: join(racine, nom) });
  const noms = () => suivie.configuration().projets.map(({ nom }) => nom);
  return { racine, chemin, suivie, dits, projet, noms };
}

// Écrit jusqu'à ce que le suivi l'ait dit : une veille à peine posée peut manquer
// la toute première écriture (FSEvents démarre à son heure), jamais les suivantes.
// Le délai n'est qu'une garde, pour qu'un test cassé finisse par le dire.
async function ecrireJusqua(ecrire: () => void, condition: () => boolean, quoi: () => string): Promise<void> {
  const limite = Date.now() + 60_000;
  while (!condition()) {
    if (Date.now() > limite) throw new Error(`jamais arrivé — ${quoi()}`);
    ecrire();
    await new Promise((resoudre) => setTimeout(resoudre, 5));
  }
}

describe("le fichier des projets, suivi", () => {
  test("au premier lancement, le fichier qui manque est créé : aucun projet, et rien de refusé", (t) => {
    const { chemin, suivie } = suivi(t);

    assert.deepEqual(suivie.configuration(), { chemin, projets: [] });
    assert.deepEqual(JSON.parse(readFileSync(chemin, "utf8")), { projets: [] });
  });

  test("un fichier déjà là est lu tel qu'il est — refusé, il garde son chemin et sa raison", (t) => {
    const { chemin, suivie } = suivi(t, { projets: "brigade" });

    assert.deepEqual(suivie.configuration(), { chemin, projets: [], refus: "« projets » doit être une liste" });
    assert.equal(readFileSync(chemin, "utf8"), '{"projets":"brigade"}');
  });

  test("un fichier qui ne peut pas être créé est dit, avec son chemin et la raison", (t) => {
    const racine = realpathSync(mkdtempSync(join(tmpdir(), "brigade-app-")));
    t.after(() => rmSync(racine, { recursive: true, force: true }));
    writeFileSync(join(racine, "config"), "un fichier, pas un dossier");
    const chemin = join(racine, "config/app.json");

    const suivie = suivreConfiguration({ chemin, surChangement: () => assert.fail("rien n'a changé") });
    t.after(() => suivie.fermer());

    assert.equal(suivie.configuration().chemin, chemin);
    assert.match(suivie.configuration().refus ?? "", /^ce fichier n'a pas pu être créé : /);
  });

  test("le fichier est relu quand il change : la liste suit, sans que rien ne soit relancé", async (t) => {
    const { chemin, dits, projet, noms } = suivi(t, { projets: [] });

    await ecrireJusqua(() => writeFileSync(chemin, JSON.stringify({ projets: [projet("a")] })), () => noms().join() === "a", () => JSON.stringify(dits));
    await ecrireJusqua(() => writeFileSync(chemin, JSON.stringify({ projets: [projet("a"), projet("b")] })), () => noms().join() === "a,b", () => JSON.stringify(dits));

    assert.deepEqual(dits.at(-1), { configuration: { chemin, projets: [projet("a"), projet("b")] }, partis: [] });
  });

  test("un éditeur qui remplace le fichier au lieu de l'écrire est suivi pareil", async (t) => {
    const { chemin, dits, projet, noms } = suivi(t, { projets: [] });

    const remplacer = (contenu: unknown) => () => {
      writeFileSync(`${chemin}.neuf`, JSON.stringify(contenu));
      renameSync(`${chemin}.neuf`, chemin);
    };
    await ecrireJusqua(remplacer({ projets: [projet("a")] }), () => noms().join() === "a", () => JSON.stringify(dits));
    await ecrireJusqua(remplacer({ projets: [projet("b")] }), () => noms().join() === "b", () => JSON.stringify(dits));
  });

  test("un fichier atteint par un lien est suivi là où il est vraiment", async (t) => {
    const racine = realpathSync(mkdtempSync(join(tmpdir(), "brigade-app-")));
    t.after(() => rmSync(racine, { recursive: true, force: true }));
    mkdirSync(join(racine, "vrai"));
    mkdirSync(join(racine, "config"));
    writeFileSync(join(racine, "vrai/projets.json"), JSON.stringify({ projets: [] }));
    symlinkSync(join(racine, "vrai/projets.json"), join(racine, "config/app.json"));
    const suivie = suivreConfiguration({ chemin: join(racine, "config/app.json"), surChangement: () => {} });
    t.after(() => suivie.fermer());

    await ecrireJusqua(
      () => writeFileSync(join(racine, "vrai/projets.json"), JSON.stringify({ projets: [{ nom: "a", dossier: racine }] })),
      () => suivie.configuration().projets.length === 1,
      () => JSON.stringify(suivie.configuration()),
    );
  });

  test("un fichier lu à moitié ne fait rien disparaître : les projets d'avant restent, et le chemin et la raison sont dits", (t) => {
    const { chemin, suivie, dits, projet } = suivi(t, { projets: [{ nom: "a", dossier: "/" }] });
    const avant = suivie.configuration().projets;

    writeFileSync(chemin, '{ "projets": [');
    suivie.relire();

    assert.equal(dits.length, 1);
    assert.deepEqual(dits[0]?.partis, []);
    assert.deepEqual(suivie.configuration().projets, avant);
    assert.equal(suivie.configuration().refus, undefined);
    assert.match(suivie.configuration().nonRelu ?? "", /^JSON illisible : /);

    writeFileSync(chemin, JSON.stringify({ projets: [{ nom: "a", dossier: "/" }, projet("b")] }));
    suivie.relire();

    assert.deepEqual(suivie.configuration(), { chemin, projets: [{ nom: "a", dossier: "/" }, projet("b")] });
    assert.deepEqual(dits.at(-1)?.partis, []);
  });

  test("un fichier supprimé ne fait rien disparaître non plus, et n'est pas recréé dans le dos du chef", (t) => {
    const { chemin, suivie, projet } = suivi(t, { projets: [] });
    writeFileSync(chemin, JSON.stringify({ projets: [projet("a")] }));
    suivie.relire();

    rmSync(chemin);
    suivie.relire();

    assert.deepEqual(suivie.configuration(), { chemin, projets: [projet("a")], nonRelu: "ce fichier n'existe pas" });
  });

  test("un fichier refusé au lancement, puis réparé, donne ses projets sans relancer", (t) => {
    const { chemin, suivie, projet } = suivi(t, "{ projets: ");

    writeFileSync(chemin, JSON.stringify({ projets: [projet("a")] }));
    suivie.relire();

    assert.deepEqual(suivie.configuration(), { chemin, projets: [projet("a")] });
  });

  test("une relecture qui ne change rien ne dit rien", (t) => {
    const { chemin, suivie, dits, projet } = suivi(t, { projets: [] });
    writeFileSync(chemin, JSON.stringify({ projets: [projet("a")] }));
    suivie.relire();

    writeFileSync(chemin, JSON.stringify({ projets: [projet("a")] }, null, 2));
    suivie.relire();
    suivie.relire();

    assert.equal(dits.length, 1);
  });

  test("un projet retiré du fichier, ou dont le dossier a changé, est dit parti — les autres non", (t) => {
    const { racine, chemin, suivie, dits, projet } = suivi(t, { projets: [] });
    writeFileSync(chemin, JSON.stringify({ projets: [projet("a"), projet("b"), projet("c")] }));
    suivie.relire();

    writeFileSync(chemin, JSON.stringify({ projets: [{ nom: "b", dossier: join(racine, "c") }, { ...projet("c"), hote: "box" }] }));
    suivie.relire();

    assert.deepEqual(dits.at(-1)?.partis, ["a", "b"]);
  });

  test("un projet ajouté depuis l'app est dans la liste aussitôt, sans attendre la veille du fichier", (t) => {
    const { suivie, dits, projet, noms } = suivi(t);

    assert.equal(suivie.ajouter(projet("a")), undefined);

    assert.deepEqual(noms(), ["a"]);
    assert.equal(dits.length, 1);
  });

  test("un ajout refusé dit pourquoi, et ne change rien", (t) => {
    const { suivie, dits, projet } = suivi(t, { projets: [{ nom: "a", dossier: "/" }] });

    assert.equal(suivie.ajouter(projet("a")), "deux projets s'appellent « a »");

    assert.equal(dits.length, 0);
  });

  test("un fichier supprimé en cours de route n'est pas réécrit par un ajout : les autres projets ne partent pas, et la raison est dite", (t) => {
    const { chemin, suivie, dits, projet, noms } = suivi(t, { projets: [] });
    writeFileSync(chemin, JSON.stringify({ projets: [projet("a"), projet("b")] }));
    suivie.relire();

    rmSync(chemin);
    const refus = suivie.ajouter(projet("c"));

    assert.equal(refus, "l'app n'écrit pas dans un fichier qu'elle n'a pas pu relire — ce fichier n'existe pas");
    assert.equal(existsSync(chemin), false);
    assert.deepEqual(noms(), ["a", "b"]);
    assert.deepEqual(dits.flatMap(({ partis }) => partis), []);
  });

  test("un fichier devenu illisible n'est pas réécrit par un ajout non plus", (t) => {
    const { chemin, suivie, projet, noms } = suivi(t, { projets: [] });
    writeFileSync(chemin, JSON.stringify({ projets: [projet("a")] }));
    suivie.relire();

    writeFileSync(chemin, '{ "projets": [');

    assert.match(suivie.ajouter(projet("b")) ?? "", /^l'app n'écrit pas dans un fichier qu'elle n'a pas pu relire — JSON illisible : /);
    assert.equal(readFileSync(chemin, "utf8"), '{ "projets": [');
    assert.deepEqual(noms(), ["a"]);
  });

  test("une box déclarée depuis l'app arrive comme un changement du fichier — et reste proposée quand sa relecture est refusée", (t) => {
    const { chemin, suivie, dits } = suivi(t, { projets: [] });

    assert.equal(suivie.ajouterHote("box"), undefined);
    assert.equal(suivie.ajouterHote("chef@autre-box"), undefined);

    assert.deepEqual(dits.at(-1), { configuration: { chemin, projets: [], hotes: ["box", "chef@autre-box"] }, partis: [] });
    assert.deepEqual(JSON.parse(readFileSync(chemin, "utf8")), { projets: [], hotes: ["box", "chef@autre-box"] });

    writeFileSync(chemin, '{ "projets": [');
    suivie.relire();

    assert.deepEqual(suivie.configuration().hotes, ["box", "chef@autre-box"]);
    assert.match(suivie.configuration().nonRelu ?? "", /^JSON illisible : /);
    assert.match(suivie.ajouterHote("troisieme") ?? "", /^l'app n'écrit pas dans un fichier qu'elle n'a pas pu relire — JSON illisible : /);
    assert.equal(readFileSync(chemin, "utf8"), '{ "projets": [');
  });

  test("ce qui refuserait un ajout se sait sans rien écrire, depuis ce que le fichier dit maintenant", (t) => {
    const { chemin, suivie, dits, projet } = suivi(t, { projets: [] });
    // Écrit hors de l'app, et pas encore relu : le refus part du fichier, pas de ce que la veille en a vu.
    writeFileSync(chemin, JSON.stringify({ projets: [projet("a")] }));

    assert.equal(suivie.refusDAjout(projet("a")), "deux projets s'appellent « a »");
    assert.equal(suivie.refusDAjout(projet("b")), undefined);

    assert.deepEqual(JSON.parse(readFileSync(chemin, "utf8")), { projets: [projet("a")] });
    assert.deepEqual(dits.at(-1)?.configuration.projets, [projet("a")]);

    rmSync(chemin);
    assert.equal(suivie.refusDAjout(projet("b")), "l'app n'écrit pas dans un fichier qu'elle n'a pas pu relire — ce fichier n'existe pas");
  });

  test("une création en échec garde sa raison, relecture après relecture — et réparée, elle aboutit sans relancer, veille comprise", async (t) => {
    const racine = realpathSync(mkdtempSync(join(tmpdir(), "brigade-app-")));
    t.after(() => rmSync(racine, { recursive: true, force: true }));
    writeFileSync(join(racine, "config"), "un fichier, pas un dossier");
    const chemin = join(racine, "config/app.json");
    const dits: Configuration[] = [];
    const suivie = suivreConfiguration({ chemin, surChangement: (configuration) => void dits.push(configuration) });
    t.after(() => suivie.fermer());
    const raison = suivie.configuration().refus;

    suivie.relire();

    assert.match(raison ?? "", /^ce fichier n'a pas pu être créé : /);
    assert.equal(suivie.configuration().refus, raison);
    assert.deepEqual(dits, []);

    rmSync(join(racine, "config"));
    suivie.relire();

    assert.deepEqual(suivie.configuration(), { chemin, projets: [] });
    assert.deepEqual(JSON.parse(readFileSync(chemin, "utf8")), { projets: [] });
    await ecrireJusqua(
      () => writeFileSync(chemin, JSON.stringify({ projets: [{ nom: "a", dossier: racine }] })),
      () => suivie.configuration().projets.length === 1,
      () => JSON.stringify(dits),
    );
  });

  test("un lien qui ne mène nulle part est refusé avec sa raison, sans que l'app tombe — et suivi dès qu'il mène quelque part", (t) => {
    const racine = realpathSync(mkdtempSync(join(tmpdir(), "brigade-app-")));
    t.after(() => rmSync(racine, { recursive: true, force: true }));
    const chemin = join(racine, "app.json");
    symlinkSync(join(racine, "absent.json"), chemin);

    const suivie = suivreConfiguration({ chemin, surChangement: () => {} });
    t.after(() => suivie.fermer());

    assert.deepEqual(suivie.configuration(), { chemin, projets: [], refus: "ce fichier n'a pas pu être créé : c'est un lien vers un fichier qui n'existe pas" });
    assert.equal(existsSync(join(racine, "absent.json")), false);

    writeFileSync(join(racine, "absent.json"), JSON.stringify({ projets: [{ nom: "a", dossier: racine }] }));
    suivie.relire();

    assert.deepEqual(suivie.configuration(), { chemin, projets: [{ nom: "a", dossier: racine }] });
  });
});

