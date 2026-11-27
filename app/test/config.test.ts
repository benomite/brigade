// Dire où sont les projets : le fichier de configuration de l'app, lu depuis de
// vrais fichiers écrits par le test.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { addProject, pathConfiguration, createConfiguration, EXAMPLE, readConfiguration, tidyProject, removeProject } from "../src/config.ts";

function directory(t: TestContext): string {
  const root = mkdtempSync(join(tmpdir(), "brigade-app-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function configuration(t: TestContext, content: unknown): { racine: string; chemin: string } {
  const root = directory(t);
  const path = join(root, "app.json");
  writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content));
  return { racine: root, chemin: path };
}

describe("la configuration de l'app", () => {
  test("elle vit hors du dépôt, sous le dossier personnel — ou là où BRIGADE_APP_CONFIG le dit", () => {
    assert.equal(pathConfiguration({}, "/Users/chef"), join("/Users/chef", ".config", "brigade", "app.json"));
    assert.equal(pathConfiguration({ BRIGADE_APP_CONFIG: "/ailleurs/app.json" }, "/Users/chef"), "/ailleurs/app.json");
  });

  test("un nom et un dossier par projet, dans l'ordre du fichier", (t) => {
    const root = directory(t);
    mkdirSync(join(root, "brigade"));
    mkdirSync(join(root, "maison/parade"), { recursive: true });
    const path = join(root, "app.json");
    writeFileSync(path, JSON.stringify({ projets: [{ nom: "parade", dossier: "~/parade" }, { nom: "brigade", dossier: join(root, "brigade") }] }));

    assert.deepEqual(readConfiguration(path, join(root, "maison")), {
      chemin: path,
      projets: [
        { nom: "parade", dossier: join(root, "maison/parade") },
        { nom: "brigade", dossier: join(root, "brigade") },
      ],
    });
  });

  test("un projet dont le dossier n'est pas là reste dans la barre, et dit pourquoi il ne s'ouvre pas", (t) => {
    const { racine: root, chemin: path } = configuration(t, { projets: [{ nom: "parti", dossier: "/nulle/part" }, { nom: "fichier", dossier: "~/app.json" }] });

    assert.deepEqual(readConfiguration(path, root).projets, [
      { nom: "parti", dossier: "/nulle/part", refus: "folder not found: /nulle/part" },
      { nom: "fichier", dossier: path, refus: `this is not a folder: ${path}` },
    ]);
  });

  describe("les clés d'un fichier d'avant #1847, ignorées sans refus", () => {
    test("« hote » (clé héritée) sur un projet, et « hotes » (clé héritée) et « stations » (clé héritée) à côté : le fichier est lu, ces clés ne sont pas reprises", (t) => {
      const { racine: root, chemin: path } = configuration(t, {
        hotes: ["box", "chef@autre-box"],
        projets: [
          { nom: "servi", dossier: "~", hote: "box", stations: ["mac/claude"] },
          { nom: "local", dossier: "~" },
        ],
      });

      assert.deepEqual(readConfiguration(path, root), { chemin: path, projets: [{ nom: "servi", dossier: root }, { nom: "local", dossier: root }] });
    });

    test("une clé héritée de n'importe quelle forme (« hote » vide, « hotes » qui n'est pas une liste) ne refuse plus le fichier", (t) => {
      const { racine: root, chemin: path } = configuration(t, { hotes: "box", projets: [{ nom: "a", dossier: "~", hote: 22 }, { nom: "b", dossier: "~", hote: " " }] });

      const readOne = readConfiguration(path, root);
      assert.equal(readOne.refus, undefined);
      assert.deepEqual(readOne.projets, [{ nom: "a", dossier: root }, { nom: "b", dossier: root }]);
    });
  });

  describe("le dépôt et la branche d'un projet (#983)", () => {
    test("ils se lisent tels qu'ils sont écrits — et un projet qui ne les porte pas n'en a pas", (t) => {
      const { racine: root, chemin: path } = configuration(t, { projets: [{ nom: "a", dossier: "~", depot: "chef/a", base: "v2" }, { nom: "b", dossier: "~" }] });

      assert.deepEqual(readConfiguration(path, root).projets, [
        { nom: "a", dossier: root, depot: "chef/a", base: "v2" },
        { nom: "b", dossier: root },
      ]);
    });

    test("ajoutés depuis l'app, ils s'écrivent avec le projet", (t) => {
      const root = directory(t);
      const { chemin: path } = configuration(t, { projets: [] });

      assert.equal(addProject(path, { nom: "a", dossier: root, depot: "chef/a", base: "main" }), undefined);

      assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { projets: [{ nom: "a", dossier: root, depot: "chef/a", base: "main" }] });
    });

    for (const [what, declare, refusal] of [
      ["un dépôt vide", { depot: " " }, /“depot” must be a non-empty string/],
      ["une branche qui n'est pas un texte", { base: 3 }, /“base” must be a non-empty string/],
    ] as const) {
      test(`${what} refuse le fichier, et dit pourquoi`, (t) => {
        const { chemin: path } = configuration(t, { projets: [{ nom: "a", dossier: "/", ...declare }] });
        assert.match(readConfiguration(path).refus ?? "", refusal);
      });
    }
  });

  test("l'exemple ne porte rien à recopier tel quel : chaque valeur à remplacer se voit, et aucune commande n'y est dictée", () => {
    const [project] = (JSON.parse(EXAMPLE) as { projets: Record<string, string>[] }).projets;

    assert.deepEqual(Object.keys(project ?? {}), ["nom", "dossier", "depot", "base"]);
    for (const value of Object.values(project ?? {})) assert.match(value, /^<.+>$/);
    // Aucune station : un projet s'écrit sans dire qui fait sa cuisine (#983).
    assert.doesNotMatch(EXAMPLE, /\bbox|\bstation/i);
  });

  test("sans fichier, aucun projet — et la raison est dite", (t) => {
    const path = join(directory(t), "app.json");

    assert.deepEqual(readConfiguration(path), { chemin: path, projets: [], refus: "this file does not exist" });
  });

  test("une liste vide n'est pas un refus : aucun projet encore, et rien à réparer", (t) => {
    const { chemin: path } = configuration(t, { projets: [] });

    assert.deepEqual(readConfiguration(path), { chemin: path, projets: [] });
  });

  const REFUSED: [string, unknown, RegExp][] = [
    ["un JSON illisible", "{ projets: ", /^unreadable JSON: /],
    ["autre chose qu'une liste de projets", { projets: "brigade" }, /^“projets” must be a list$/],
    ["un projet sans nom", { projets: [{ dossier: "/tmp" }] }, /^project #1: “nom” is missing$/],
    ["un projet au nom vide", { projets: [{ nom: " ", dossier: "/tmp" }] }, /^project #1: “nom” is missing$/],
    ["un projet sans dossier", { projets: [{ nom: "a", dossier: "/tmp" }, { nom: "b" }] }, /^project #2 \(b\): “dossier” is missing$/],
    ["un dossier relatif", { projets: [{ nom: "a", dossier: "Dev/a" }] }, /^project #1 \(a\): “dossier” must be an absolute path, or start with ~\/$/],
    // Le fichier d'avant : il n'est ni lu comme avant, ni ignoré.
    ["un projet qui porte encore « commande »", { projets: [{ nom: "a", dossier: "/tmp" }, { nom: "b", dossier: "/tmp", commande: "sudo -u brigade npm" }] }, /^project #2 \(b\): “commande” is no longer read — remove it: the app reads the project on GitHub and sends the station's actions there$/],
    ["une « commande » seule", { projets: [{ nom: "a", dossier: "/tmp", commande: "" }] }, /^project #1 \(a\): “commande” is no longer read — remove it/],
    ["deux projets du même nom", { projets: [{ nom: "a", dossier: "/tmp" }, { nom: "a", dossier: "/var" }] }, /^two projects are named “a”$/],
  ];
  for (const [what, content, refusal] of REFUSED) {
    test(`${what} : le fichier est refusé en entier, avec sa raison`, (t) => {
      const readEntry = readConfiguration(configuration(t, content).chemin);

      assert.deepEqual(readEntry.projets, []);
      assert.match(readEntry.refus ?? "", refusal);
    });
  }

  describe("créée par l'app", () => {
    test("le fichier qui manque est créé, avec son dossier : une liste vide, que l'app sait relire", (t) => {
      const path = join(directory(t), "pas/encore/app.json");

      assert.equal(createConfiguration(path), undefined);

      assert.equal(readFileSync(path, "utf8"), '{\n  "projets": []\n}\n');
      assert.deepEqual(readConfiguration(path), { chemin: path, projets: [] });
    });

    test("un fichier déjà là n'est jamais réécrit — même refusé", (t) => {
      const { chemin: path } = configuration(t, "{ projets: ");

      assert.equal(createConfiguration(path), undefined);

      assert.equal(readFileSync(path, "utf8"), "{ projets: ");
    });

    test("un fichier qui ne peut pas être créé le dit, avec la raison", (t) => {
      const { chemin: path } = configuration(t, "un fichier, pas un dossier");

      assert.match(createConfiguration(join(path, "app.json")) ?? "", /^this file could not be created: /);
    });
  });

  describe("un projet ajouté depuis l'app", () => {
    test("il s'écrit à la suite des autres, dans la forme que le chef écrit à la main", (t) => {
      const root = directory(t);
      const path = join(root, "app.json");
      createConfiguration(path);

      assert.equal(addProject(path, { nom: " brigade ", dossier: root }), undefined);
      assert.equal(addProject(path, { nom: "parade", dossier: root }), undefined);

      assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), {
        projets: [
          { nom: "brigade", dossier: root },
          { nom: "parade", dossier: root },
        ],
      });
      assert.deepEqual(readConfiguration(path).projets, [
        { nom: "brigade", dossier: root },
        { nom: "parade", dossier: root },
      ]);
    });

    test("sans fichier, l'ajout le crée", (t) => {
      const root = directory(t);
      const path = join(root, "config/app.json");

      assert.equal(addProject(path, { nom: "brigade", dossier: root }), undefined);

      assert.deepEqual(readConfiguration(path).projets, [{ nom: "brigade", dossier: root }]);
    });

    test("ce que l'app ne lit pas dans le fichier y reste : elle n'écrit que le projet ajouté", (t) => {
      const root = directory(t);
      const { chemin: path } = configuration(t, { note: "à moi", projets: [{ nom: "a", dossier: "~/Dev/a", couleur: "rouge" }] });

      assert.equal(addProject(path, { nom: "b", dossier: root }), undefined);

      assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), {
        note: "à moi",
        projets: [
          { nom: "a", dossier: "~/Dev/a", couleur: "rouge" },
          { nom: "b", dossier: root },
        ],
      });
    });

    test("un fichier que l'app n'a pas compris n'est pas réécrit : l'ajout est refusé, avec la raison du fichier", (t) => {
      const root = directory(t);
      const { chemin: path } = configuration(t, "{ projets: ");

      assert.match(addProject(path, { nom: "b", dossier: root }) ?? "", /^the app does not write into a file it has not understood — unreadable JSON: /);

      assert.equal(readFileSync(path, "utf8"), "{ projets: ");
    });

    const ADDITIONS_REFUSED: [string, { nom: string; dossier: string }, RegExp][] = [
      ["sans nom", { nom: " ", dossier: "/" }, /^project #2: “nom” is missing$/],
      ["sans dossier", { nom: "b", dossier: "" }, /^project #2 \(b\): “dossier” is missing$/],
      ["du nom d'un autre", { nom: "a", dossier: "/" }, /^two projects are named “a”$/],
      ["dont le dossier n'est pas là", { nom: "b", dossier: "/nulle/part" }, /^folder not found: \/nulle\/part$/],
    ];
    for (const [what, project, refusal] of ADDITIONS_REFUSED) {
      test(`un projet ${what} n'est pas ajouté : le fichier reste tel quel, et la raison est dite`, (t) => {
        const { chemin: path } = configuration(t, { projets: [{ nom: "a", dossier: "/" }] });
        const before = readFileSync(path, "utf8");

        assert.match(addProject(path, project) ?? "", refusal);

        assert.equal(readFileSync(path, "utf8"), before);
      });
    }

    test("un ajout refusé sans fichier ne laisse pas un projet à moitié écrit", (t) => {
      const path = join(directory(t), "app.json");

      assert.match(addProject(path, { nom: "", dossier: "/" }) ?? "", /“nom” is missing/);

      assert.ok(existsSync(path));
      assert.deepEqual(readConfiguration(path), { chemin: path, projets: [] });
    });
  });

  describe("un projet retiré depuis l'app", () => {
    test("sa ligne quitte le fichier, et elle seule : les autres projets, ce que l'app n'y lit pas restent", (t) => {
      const { chemin: path } = configuration(t, { note: "à moi", projets: [{ nom: "a", dossier: "~/Dev/a", couleur: "rouge" }, { nom: "b", dossier: "/b" }, { nom: "c", dossier: "/c" }] });

      assert.equal(removeProject(path, "b"), undefined);

      assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { note: "à moi", projets: [{ nom: "a", dossier: "~/Dev/a", couleur: "rouge" }, { nom: "c", dossier: "/c" }] });
      assert.equal(removeProject(path, "a"), undefined);
    });

    test("un projet dont le dossier n'est plus là se retire comme un autre", (t) => {
      const { chemin: path } = configuration(t, { projets: [{ nom: "parti", dossier: "/nulle/part" }] });

      assert.equal(removeProject(path, "parti"), undefined);

      assert.deepEqual(readConfiguration(path), { chemin: path, projets: [] });
    });

    test("un nom qui n'est pas dans le fichier le dit, et n'y change rien — au caractère près", (t) => {
      const { chemin: path } = configuration(t, { projets: [{ nom: "brigade", dossier: "/" }] });
      const before = readFileSync(path, "utf8");

      assert.equal(removeProject(path, "Brigade"), "“Brigade” is not in this file: nothing was changed there");
      assert.equal(removeProject(path, "brigade "), "“brigade ” is not in this file: nothing was changed there");

      assert.equal(readFileSync(path, "utf8"), before);
    });

    test("l'app ne retire rien d'un fichier qu'elle n'a pas compris, et ne crée pas celui qui manque", (t) => {
      const { racine: root, chemin: path } = configuration(t, '{ "projets": [');

      assert.match(removeProject(path, "a") ?? "", /^the app does not write into a file it has not understood — unreadable JSON: /);
      assert.equal(readFileSync(path, "utf8"), '{ "projets": [');
      assert.match(removeProject(join(root, "absent.json"), "a") ?? "", /^unreadable file: /);
      assert.equal(existsSync(join(root, "absent.json")), false);
    });
  });

  describe("un projet rangé depuis la barre", () => {
    const names = (path: string) => readConfiguration(path).projets.map(({ nom: name }) => name);

    test("il prend la place voulue, et les autres se décalent — vers le haut comme vers le bas", (t) => {
      const { chemin: path } = configuration(t, { projets: [{ nom: "a", dossier: "/" }, { nom: "b", dossier: "/" }, { nom: "c", dossier: "/" }, { nom: "d", dossier: "/" }] });

      assert.equal(tidyProject(path, "c", 0), undefined);
      assert.deepEqual(names(path), ["c", "a", "b", "d"]);
      assert.equal(tidyProject(path, "c", 3), undefined);
      assert.deepEqual(names(path), ["a", "b", "d", "c"]);
      assert.equal(tidyProject(path, "a", 1), undefined);
      assert.deepEqual(names(path), ["b", "a", "d", "c"]);
    });

    test("chaque projet garde sa ligne entière, et le reste du fichier ne bouge pas — ce que l'app n'y lit pas compris", (t) => {
      const { chemin: path } = configuration(t, { note: "à moi", projets: [{ nom: "a", dossier: "~/Dev/a", couleur: "rouge" }, { nom: "b", dossier: "/b", couleurs: { onglet: "#a98cf2" } }] });

      assert.equal(tidyProject(path, "b", 0), undefined);

      assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { note: "à moi", projets: [{ nom: "b", dossier: "/b", couleurs: { onglet: "#a98cf2" } }, { nom: "a", dossier: "~/Dev/a", couleur: "rouge" }] });
    });

    test("un projet lâché à sa propre place ne réécrit pas le fichier", (t) => {
      const text = '{"projets":[{"nom":"a","dossier":"/"},{"nom":"b","dossier":"/"}]}';
      const { chemin: path } = configuration(t, text);

      assert.equal(tidyProject(path, "b", 1), undefined);

      assert.equal(readFileSync(path, "utf8"), text);
    });

    test("un projet ajouté ensuite arrive en fin de liste, après l'ordre choisi", (t) => {
      const { racine: root, chemin: path } = configuration(t, { projets: [{ nom: "a", dossier: "/" }, { nom: "b", dossier: "/" }] });
      mkdirSync(join(root, "c"));

      assert.equal(tidyProject(path, "b", 0), undefined);
      assert.equal(addProject(path, { nom: "c", dossier: join(root, "c") }), undefined);

      assert.deepEqual(names(path), ["b", "a", "c"]);
    });

    test("un nom inconnu, ou une place qui n'existe pas, le dit et ne change rien", (t) => {
      const { chemin: path } = configuration(t, { projets: [{ nom: "a", dossier: "/" }, { nom: "b", dossier: "/" }] });
      const before = readFileSync(path, "utf8");

      assert.equal(tidyProject(path, "z", 0), "“z” is not in this file: nothing was changed there");
      for (const rank of [-1, 2, 0.5]) assert.equal(tidyProject(path, "a", rank), `there is no place #${rank + 1} among 2 projects: nothing was changed there`);

      assert.equal(readFileSync(path, "utf8"), before);
    });

    test("l'app ne range rien dans un fichier qu'elle n'a pas compris, et ne crée pas celui qui manque", (t) => {
      const { racine: root, chemin: path } = configuration(t, '{ "projets": [');

      assert.match(tidyProject(path, "a", 0) ?? "", /^the app does not write into a file it has not understood — unreadable JSON: /);
      assert.equal(readFileSync(path, "utf8"), '{ "projets": [');
      assert.match(tidyProject(join(root, "absent.json"), "a", 0) ?? "", /^unreadable file: /);
      assert.equal(existsSync(join(root, "absent.json")), false);
    });
  });
});
