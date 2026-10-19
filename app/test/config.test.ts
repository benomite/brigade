// Dire où sont les projets : le fichier de configuration de l'app, lu depuis de
// vrais fichiers écrits par le test.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ajouterProjet, cheminConfiguration, creerConfiguration, EXEMPLE, lireConfiguration, rangerProjet, retirerProjet } from "../src/config.ts";

function repertoire(t: TestContext): string {
  const racine = mkdtempSync(join(tmpdir(), "brigade-app-"));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  return racine;
}

function configuration(t: TestContext, contenu: unknown): { racine: string; chemin: string } {
  const racine = repertoire(t);
  const chemin = join(racine, "app.json");
  writeFileSync(chemin, typeof contenu === "string" ? contenu : JSON.stringify(contenu));
  return { racine, chemin };
}

describe("la configuration de l'app", () => {
  test("elle vit hors du dépôt, sous le dossier personnel — ou là où BRIGADE_APP_CONFIG le dit", () => {
    assert.equal(cheminConfiguration({}, "/Users/chef"), "/Users/chef/.config/brigade/app.json");
    assert.equal(cheminConfiguration({ BRIGADE_APP_CONFIG: "/ailleurs/app.json" }, "/Users/chef"), "/ailleurs/app.json");
  });

  test("un nom et un dossier par projet, dans l'ordre du fichier", (t) => {
    const racine = repertoire(t);
    mkdirSync(join(racine, "brigade"));
    mkdirSync(join(racine, "maison/parade"), { recursive: true });
    const chemin = join(racine, "app.json");
    writeFileSync(chemin, JSON.stringify({ projets: [{ nom: "parade", dossier: "~/parade" }, { nom: "brigade", dossier: join(racine, "brigade") }] }));

    assert.deepEqual(lireConfiguration(chemin, join(racine, "maison")), {
      chemin,
      projets: [
        { nom: "parade", dossier: join(racine, "maison/parade") },
        { nom: "brigade", dossier: join(racine, "brigade") },
      ],
    });
  });

  test("un projet dont le dossier n'est pas là reste dans la barre, et dit pourquoi il ne s'ouvre pas", (t) => {
    const { racine, chemin } = configuration(t, { projets: [{ nom: "parti", dossier: "/nulle/part" }, { nom: "fichier", dossier: "~/app.json" }] });

    assert.deepEqual(lireConfiguration(chemin, racine).projets, [
      { nom: "parti", dossier: "/nulle/part", refus: "folder not found: /nulle/part" },
      { nom: "fichier", dossier: chemin, refus: `this is not a folder: ${chemin}` },
    ]);
  });

  test("un projet dit où est sa box par son seul hôte ssh — les autres n'en ont pas", (t) => {
    const { racine, chemin } = configuration(t, {
      projets: [
        { nom: "servi", dossier: "~", hote: "box" },
        { nom: "local", dossier: "~" },
      ],
    });

    assert.deepEqual(lireConfiguration(chemin, racine).projets, [
      { nom: "servi", dossier: racine, box: { hote: "box" } },
      { nom: "local", dossier: racine },
    ]);
  });

  describe("les hôtes d'un fichier d'avant #983, toujours lus", () => {
    test("une liste d'hôtes, chacun le nom par lequel ssh joint sa machine — dans l'ordre du fichier, et rien d'autre", (t) => {
      const { racine, chemin } = configuration(t, { hotes: ["box", "chef@autre-box"], projets: [{ nom: "servi", dossier: "~", hote: "box" }] });

      assert.deepEqual(lireConfiguration(chemin, racine), { chemin, projets: [{ nom: "servi", dossier: racine, box: { hote: "box" } }], hotes: ["box", "chef@autre-box"] });
    });

    test("un hôte écrit deux fois n'en fait qu'un, et une liste vide n'est pas un refus", (t) => {
      assert.deepEqual(lireConfiguration(configuration(t, { hotes: ["box", "box"], projets: [] }).chemin).hotes, ["box"]);
      assert.deepEqual(lireConfiguration(configuration(t, { hotes: [], projets: [] }).chemin).hotes, []);
    });
  });

  describe("le dépôt et la branche d'un projet (#983)", () => {
    test("ils se lisent tels qu'ils sont écrits — et un projet qui ne les porte pas n'en a pas", (t) => {
      const { racine, chemin } = configuration(t, { projets: [{ nom: "a", dossier: "~", depot: "chef/a", base: "v2" }, { nom: "b", dossier: "~" }] });

      assert.deepEqual(lireConfiguration(chemin, racine).projets, [
        { nom: "a", dossier: racine, depot: "chef/a", base: "v2" },
        { nom: "b", dossier: racine },
      ]);
    });

    test("ajoutés depuis l'app, ils s'écrivent avec le projet, sans hôte", (t) => {
      const racine = repertoire(t);
      const { chemin } = configuration(t, { projets: [] });

      assert.equal(ajouterProjet(chemin, { nom: "a", dossier: racine, depot: "chef/a", base: "main" }), undefined);

      assert.deepEqual(JSON.parse(readFileSync(chemin, "utf8")), { projets: [{ nom: "a", dossier: racine, depot: "chef/a", base: "main" }] });
    });

    for (const [quoi, declare, refus] of [
      ["un dépôt vide", { depot: " " }, /“depot” must be a non-empty string/],
      ["une branche qui n'est pas un texte", { base: 3 }, /“base” must be a non-empty string/],
    ] as const) {
      test(`${quoi} refuse le fichier, et dit pourquoi`, (t) => {
        const { chemin } = configuration(t, { projets: [{ nom: "a", dossier: "/", ...declare }] });
        assert.match(lireConfiguration(chemin).refus ?? "", refus);
      });
    }
  });

  test("l'exemple ne porte rien à recopier tel quel : chaque valeur à remplacer se voit, et aucune commande n'y est dictée", () => {
    const [projet] = (JSON.parse(EXEMPLE) as { projets: Record<string, string>[] }).projets;

    assert.deepEqual(Object.keys(projet ?? {}), ["nom", "dossier", "depot", "base"]);
    for (const valeur of Object.values(projet ?? {})) assert.match(valeur, /^<.+>$/);
    // Ni hôte ni station : un projet s'écrit sans dire qui fait sa cuisine (#983).
    assert.equal((JSON.parse(EXEMPLE) as { hotes?: unknown }).hotes, undefined);
    assert.doesNotMatch(EXEMPLE, /\bbox|ssh|\bstation/i);
  });

  test("sans fichier, aucun projet — et la raison est dite", (t) => {
    const chemin = join(repertoire(t), "app.json");

    assert.deepEqual(lireConfiguration(chemin), { chemin, projets: [], refus: "this file does not exist" });
  });

  test("une liste vide n'est pas un refus : aucun projet encore, et rien à réparer", (t) => {
    const { chemin } = configuration(t, { projets: [] });

    assert.deepEqual(lireConfiguration(chemin), { chemin, projets: [] });
  });

  const REFUSES: [string, unknown, RegExp][] = [
    ["un JSON illisible", "{ projets: ", /^unreadable JSON: /],
    ["autre chose qu'une liste de projets", { projets: "brigade" }, /^“projets” must be a list$/],
    ["un projet sans nom", { projets: [{ dossier: "/tmp" }] }, /^project #1: “nom” is missing$/],
    ["un projet au nom vide", { projets: [{ nom: " ", dossier: "/tmp" }] }, /^project #1: “nom” is missing$/],
    ["un projet sans dossier", { projets: [{ nom: "a", dossier: "/tmp" }, { nom: "b" }] }, /^project #2 \(b\): “dossier” is missing$/],
    ["un dossier relatif", { projets: [{ nom: "a", dossier: "Dev/a" }] }, /^project #1 \(a\): “dossier” must be an absolute path, or start with ~\/$/],
    ["un hôte qui n'est pas un texte", { projets: [{ nom: "a", dossier: "/tmp", hote: 22 }] }, /^project #1 \(a\): “hote” must be a non-empty string$/],
    ["un hôte vide", { projets: [{ nom: "a", dossier: "/tmp", hote: " " }] }, /^project #1 \(a\): “hote” must be a non-empty string$/],
    // Le fichier d'avant : il n'est ni lu comme avant, ni ignoré.
    ["un projet qui porte encore « commande »", { projets: [{ nom: "a", dossier: "/tmp" }, { nom: "b", dossier: "/tmp", hote: "box", commande: "sudo -u brigade npm" }] }, /^project #2 \(b\): “commande” is no longer read — remove it: the app runs the box's action \(`ssh <hote> brigade b <commande>`\), “hote” is all it needs$/],
    ["une « commande » sans hôte", { projets: [{ nom: "a", dossier: "/tmp", commande: "" }] }, /^project #1 \(a\): “commande” is no longer read — remove it/],
    ["deux projets du même nom", { projets: [{ nom: "a", dossier: "/tmp" }, { nom: "a", dossier: "/var" }] }, /^two projects are named “a”$/],
    ["autre chose qu'une liste d'hôtes", { hotes: "box", projets: [] }, /^“hotes” must be a list$/],
    ["un hôte qui n'est pas un texte", { hotes: ["box", { hote: "autre" }], projets: [] }, /^host #2: must be a non-empty string — the name your ssh uses to reach the box$/],
    ["un hôte vide", { hotes: [" "], projets: [] }, /^host #1: must be a non-empty string/],
  ];
  for (const [quoi, contenu, refus] of REFUSES) {
    test(`${quoi} : le fichier est refusé en entier, avec sa raison`, (t) => {
      const lue = lireConfiguration(configuration(t, contenu).chemin);

      assert.deepEqual(lue.projets, []);
      assert.match(lue.refus ?? "", refus);
    });
  }

  describe("créée par l'app", () => {
    test("le fichier qui manque est créé, avec son dossier : une liste vide, que l'app sait relire", (t) => {
      const chemin = join(repertoire(t), "pas/encore/app.json");

      assert.equal(creerConfiguration(chemin), undefined);

      assert.equal(readFileSync(chemin, "utf8"), '{\n  "projets": []\n}\n');
      assert.deepEqual(lireConfiguration(chemin), { chemin, projets: [] });
    });

    test("un fichier déjà là n'est jamais réécrit — même refusé", (t) => {
      const { chemin } = configuration(t, "{ projets: ");

      assert.equal(creerConfiguration(chemin), undefined);

      assert.equal(readFileSync(chemin, "utf8"), "{ projets: ");
    });

    test("un fichier qui ne peut pas être créé le dit, avec la raison", (t) => {
      const { chemin } = configuration(t, "un fichier, pas un dossier");

      assert.match(creerConfiguration(join(chemin, "app.json")) ?? "", /^this file could not be created: /);
    });
  });

  describe("un projet ajouté depuis l'app", () => {
    test("il s'écrit à la suite des autres, dans la forme que le chef écrit à la main — sans « hote » s'il n'en a pas", (t) => {
      const racine = repertoire(t);
      const chemin = join(racine, "app.json");
      creerConfiguration(chemin);

      assert.equal(ajouterProjet(chemin, { nom: " brigade ", dossier: racine, hote: " box " }), undefined);
      assert.equal(ajouterProjet(chemin, { nom: "parade", dossier: racine, hote: " " }), undefined);

      assert.deepEqual(JSON.parse(readFileSync(chemin, "utf8")), {
        projets: [
          { nom: "brigade", dossier: racine, hote: "box" },
          { nom: "parade", dossier: racine },
        ],
      });
      assert.deepEqual(lireConfiguration(chemin).projets, [
        { nom: "brigade", dossier: racine, box: { hote: "box" } },
        { nom: "parade", dossier: racine },
      ]);
    });

    test("sans fichier, l'ajout le crée", (t) => {
      const racine = repertoire(t);
      const chemin = join(racine, "config/app.json");

      assert.equal(ajouterProjet(chemin, { nom: "brigade", dossier: racine }), undefined);

      assert.deepEqual(lireConfiguration(chemin).projets, [{ nom: "brigade", dossier: racine }]);
    });

    test("ce que l'app ne lit pas dans le fichier y reste : elle n'écrit que le projet ajouté", (t) => {
      const racine = repertoire(t);
      const { chemin } = configuration(t, { note: "à moi", projets: [{ nom: "a", dossier: "~/Dev/a", couleur: "rouge" }] });

      assert.equal(ajouterProjet(chemin, { nom: "b", dossier: racine }), undefined);

      assert.deepEqual(JSON.parse(readFileSync(chemin, "utf8")), {
        note: "à moi",
        projets: [
          { nom: "a", dossier: "~/Dev/a", couleur: "rouge" },
          { nom: "b", dossier: racine },
        ],
      });
    });

    test("un fichier que l'app n'a pas compris n'est pas réécrit : l'ajout est refusé, avec la raison du fichier", (t) => {
      const racine = repertoire(t);
      const { chemin } = configuration(t, "{ projets: ");

      assert.match(ajouterProjet(chemin, { nom: "b", dossier: racine }) ?? "", /^the app does not write into a file it has not understood — unreadable JSON: /);

      assert.equal(readFileSync(chemin, "utf8"), "{ projets: ");
    });

    const AJOUTS_REFUSES: [string, { nom: string; dossier: string; hote?: string }, RegExp][] = [
      ["sans nom", { nom: " ", dossier: "/" }, /^project #2: “nom” is missing$/],
      ["sans dossier", { nom: "b", dossier: "" }, /^project #2 \(b\): “dossier” is missing$/],
      ["du nom d'un autre", { nom: "a", dossier: "/" }, /^two projects are named “a”$/],
      ["dont le dossier n'est pas là", { nom: "b", dossier: "/nulle/part" }, /^folder not found: \/nulle\/part$/],
    ];
    for (const [quoi, projet, refus] of AJOUTS_REFUSES) {
      test(`un projet ${quoi} n'est pas ajouté : le fichier reste tel quel, et la raison est dite`, (t) => {
        const { chemin } = configuration(t, { projets: [{ nom: "a", dossier: "/" }] });
        const avant = readFileSync(chemin, "utf8");

        assert.match(ajouterProjet(chemin, projet) ?? "", refus);

        assert.equal(readFileSync(chemin, "utf8"), avant);
      });
    }

    test("un ajout refusé sans fichier ne laisse pas un projet à moitié écrit", (t) => {
      const chemin = join(repertoire(t), "app.json");

      assert.match(ajouterProjet(chemin, { nom: "", dossier: "/" }) ?? "", /“nom” is missing/);

      assert.ok(existsSync(chemin));
      assert.deepEqual(lireConfiguration(chemin), { chemin, projets: [] });
    });
  });

  describe("un projet retiré depuis l'app", () => {
    test("sa ligne quitte le fichier, et elle seule : les autres projets, les box déclarées et ce que l'app n'y lit pas restent", (t) => {
      const { chemin } = configuration(t, { note: "à moi", hotes: ["box"], projets: [{ nom: "a", dossier: "~/Dev/a", hote: "box", couleur: "rouge" }, { nom: "b", dossier: "/b", hote: "box" }, { nom: "c", dossier: "/c" }] });

      assert.equal(retirerProjet(chemin, "b"), undefined);

      assert.deepEqual(JSON.parse(readFileSync(chemin, "utf8")), { note: "à moi", hotes: ["box"], projets: [{ nom: "a", dossier: "~/Dev/a", hote: "box", couleur: "rouge" }, { nom: "c", dossier: "/c" }] });
      // L'hôte reste déclaré, même si plus aucun projet ne le nomme.
      assert.equal(retirerProjet(chemin, "a"), undefined);
      assert.deepEqual(lireConfiguration(chemin).hotes, ["box"]);
    });

    test("un projet dont le dossier n'est plus là se retire comme un autre", (t) => {
      const { chemin } = configuration(t, { projets: [{ nom: "parti", dossier: "/nulle/part" }] });

      assert.equal(retirerProjet(chemin, "parti"), undefined);

      assert.deepEqual(lireConfiguration(chemin), { chemin, projets: [] });
    });

    test("un nom qui n'est pas dans le fichier le dit, et n'y change rien — au caractère près", (t) => {
      const { chemin } = configuration(t, { projets: [{ nom: "brigade", dossier: "/" }] });
      const avant = readFileSync(chemin, "utf8");

      assert.equal(retirerProjet(chemin, "Brigade"), "“Brigade” is not in this file: nothing was changed there");
      assert.equal(retirerProjet(chemin, "brigade "), "“brigade ” is not in this file: nothing was changed there");

      assert.equal(readFileSync(chemin, "utf8"), avant);
    });

    test("l'app ne retire rien d'un fichier qu'elle n'a pas compris, et ne crée pas celui qui manque", (t) => {
      const { racine, chemin } = configuration(t, '{ "projets": [');

      assert.match(retirerProjet(chemin, "a") ?? "", /^the app does not write into a file it has not understood — unreadable JSON: /);
      assert.equal(readFileSync(chemin, "utf8"), '{ "projets": [');
      assert.match(retirerProjet(join(racine, "absent.json"), "a") ?? "", /^unreadable file: /);
      assert.equal(existsSync(join(racine, "absent.json")), false);
    });
  });

  describe("un projet rangé depuis la barre", () => {
    const noms = (chemin: string) => lireConfiguration(chemin).projets.map(({ nom }) => nom);

    test("il prend la place voulue, et les autres se décalent — vers le haut comme vers le bas", (t) => {
      const { chemin } = configuration(t, { projets: [{ nom: "a", dossier: "/" }, { nom: "b", dossier: "/" }, { nom: "c", dossier: "/" }, { nom: "d", dossier: "/" }] });

      assert.equal(rangerProjet(chemin, "c", 0), undefined);
      assert.deepEqual(noms(chemin), ["c", "a", "b", "d"]);
      assert.equal(rangerProjet(chemin, "c", 3), undefined);
      assert.deepEqual(noms(chemin), ["a", "b", "d", "c"]);
      assert.equal(rangerProjet(chemin, "a", 1), undefined);
      assert.deepEqual(noms(chemin), ["b", "a", "d", "c"]);
    });

    test("chaque projet garde sa ligne entière, et le reste du fichier ne bouge pas — ce que l'app n'y lit pas compris", (t) => {
      const { chemin } = configuration(t, { note: "à moi", hotes: ["box"], projets: [{ nom: "a", dossier: "~/Dev/a", hote: "box", couleur: "rouge" }, { nom: "b", dossier: "/b", couleurs: { onglet: "#a98cf2" } }] });

      assert.equal(rangerProjet(chemin, "b", 0), undefined);

      assert.deepEqual(JSON.parse(readFileSync(chemin, "utf8")), { note: "à moi", hotes: ["box"], projets: [{ nom: "b", dossier: "/b", couleurs: { onglet: "#a98cf2" } }, { nom: "a", dossier: "~/Dev/a", hote: "box", couleur: "rouge" }] });
    });

    test("un projet lâché à sa propre place ne réécrit pas le fichier", (t) => {
      const texte = '{"projets":[{"nom":"a","dossier":"/"},{"nom":"b","dossier":"/"}]}';
      const { chemin } = configuration(t, texte);

      assert.equal(rangerProjet(chemin, "b", 1), undefined);

      assert.equal(readFileSync(chemin, "utf8"), texte);
    });

    test("un projet ajouté ensuite arrive en fin de liste, après l'ordre choisi", (t) => {
      const { racine, chemin } = configuration(t, { projets: [{ nom: "a", dossier: "/" }, { nom: "b", dossier: "/" }] });
      mkdirSync(join(racine, "c"));

      assert.equal(rangerProjet(chemin, "b", 0), undefined);
      assert.equal(ajouterProjet(chemin, { nom: "c", dossier: join(racine, "c") }), undefined);

      assert.deepEqual(noms(chemin), ["b", "a", "c"]);
    });

    test("un nom inconnu, ou une place qui n'existe pas, le dit et ne change rien", (t) => {
      const { chemin } = configuration(t, { projets: [{ nom: "a", dossier: "/" }, { nom: "b", dossier: "/" }] });
      const avant = readFileSync(chemin, "utf8");

      assert.equal(rangerProjet(chemin, "z", 0), "“z” is not in this file: nothing was changed there");
      for (const rang of [-1, 2, 0.5]) assert.equal(rangerProjet(chemin, "a", rang), `there is no place #${rang + 1} among 2 projects: nothing was changed there`);

      assert.equal(readFileSync(chemin, "utf8"), avant);
    });

    test("l'app ne range rien dans un fichier qu'elle n'a pas compris, et ne crée pas celui qui manque", (t) => {
      const { racine, chemin } = configuration(t, '{ "projets": [');

      assert.match(rangerProjet(chemin, "a", 0) ?? "", /^the app does not write into a file it has not understood — unreadable JSON: /);
      assert.equal(readFileSync(chemin, "utf8"), '{ "projets": [');
      assert.match(rangerProjet(join(racine, "absent.json"), "a", 0) ?? "", /^unreadable file: /);
      assert.equal(existsSync(join(racine, "absent.json")), false);
    });
  });
});
