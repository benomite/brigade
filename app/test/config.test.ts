// Dire où sont les projets : le fichier de configuration de l'app, lu depuis de
// vrais fichiers écrits par le test.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ajouterProjet, cheminConfiguration, creerConfiguration, EXEMPLE, lireConfiguration } from "../src/config.ts";

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
      { nom: "parti", dossier: "/nulle/part", refus: "dossier introuvable : /nulle/part" },
      { nom: "fichier", dossier: chemin, refus: `ce n'est pas un dossier : ${chemin}` },
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

  test("l'exemple ne porte rien à recopier tel quel : chaque valeur à remplacer se voit, et aucune commande n'y est dictée", () => {
    const [projet] = (JSON.parse(EXEMPLE) as { projets: Record<string, string>[] }).projets;

    assert.deepEqual(Object.keys(projet ?? {}), ["nom", "dossier", "hote"]);
    for (const valeur of Object.values(projet ?? {})) assert.match(valeur, /^<.+>$/);
    assert.match(projet?.hote ?? "", /ton ssh joint ta box/);
  });

  test("sans fichier, aucun projet — et la raison est dite", (t) => {
    const chemin = join(repertoire(t), "app.json");

    assert.deepEqual(lireConfiguration(chemin), { chemin, projets: [], refus: "ce fichier n'existe pas" });
  });

  test("une liste vide n'est pas un refus : aucun projet encore, et rien à réparer", (t) => {
    const { chemin } = configuration(t, { projets: [] });

    assert.deepEqual(lireConfiguration(chemin), { chemin, projets: [] });
  });

  const REFUSES: [string, unknown, RegExp][] = [
    ["un JSON illisible", "{ projets: ", /^JSON illisible : /],
    ["autre chose qu'une liste de projets", { projets: "brigade" }, /^« projets » doit être une liste$/],
    ["un projet sans nom", { projets: [{ dossier: "/tmp" }] }, /^projet n° 1 : « nom » manque$/],
    ["un projet au nom vide", { projets: [{ nom: " ", dossier: "/tmp" }] }, /^projet n° 1 : « nom » manque$/],
    ["un projet sans dossier", { projets: [{ nom: "a", dossier: "/tmp" }, { nom: "b" }] }, /^projet n° 2 \(b\) : « dossier » manque$/],
    ["un dossier relatif", { projets: [{ nom: "a", dossier: "Dev/a" }] }, /^projet n° 1 \(a\) : « dossier » doit être un chemin absolu, ou commencer par ~\/$/],
    ["un hôte qui n'est pas un texte", { projets: [{ nom: "a", dossier: "/tmp", hote: 22 }] }, /^projet n° 1 \(a\) : « hote » doit être un texte non vide$/],
    ["un hôte vide", { projets: [{ nom: "a", dossier: "/tmp", hote: " " }] }, /^projet n° 1 \(a\) : « hote » doit être un texte non vide$/],
    // Le fichier d'avant : il n'est ni lu comme avant, ni ignoré.
    ["un projet qui porte encore « commande »", { projets: [{ nom: "a", dossier: "/tmp" }, { nom: "b", dossier: "/tmp", hote: "box", commande: "sudo -u brigade npm" }] }, /^projet n° 2 \(b\) : « commande » n'est plus lu — retire-le : l'app lance le geste de la box \(`ssh <hote> brigade b <commande>`\), « hote » lui suffit$/],
    ["une « commande » sans hôte", { projets: [{ nom: "a", dossier: "/tmp", commande: "" }] }, /^projet n° 1 \(a\) : « commande » n'est plus lu — retire-le/],
    ["deux projets du même nom", { projets: [{ nom: "a", dossier: "/tmp" }, { nom: "a", dossier: "/var" }] }, /^deux projets s'appellent « a »$/],
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

      assert.match(creerConfiguration(join(chemin, "app.json")) ?? "", /^ce fichier n'a pas pu être créé : /);
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

      assert.match(ajouterProjet(chemin, { nom: "b", dossier: racine }) ?? "", /^l'app n'écrit pas dans un fichier qu'elle n'a pas compris — JSON illisible : /);

      assert.equal(readFileSync(chemin, "utf8"), "{ projets: ");
    });

    const AJOUTS_REFUSES: [string, { nom: string; dossier: string; hote?: string }, RegExp][] = [
      ["sans nom", { nom: " ", dossier: "/" }, /^projet n° 2 : « nom » manque$/],
      ["sans dossier", { nom: "b", dossier: "" }, /^projet n° 2 \(b\) : « dossier » manque$/],
      ["du nom d'un autre", { nom: "a", dossier: "/" }, /^deux projets s'appellent « a »$/],
      ["dont le dossier n'est pas là", { nom: "b", dossier: "/nulle/part" }, /^dossier introuvable : \/nulle\/part$/],
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

      assert.match(ajouterProjet(chemin, { nom: "", dossier: "/" }) ?? "", /« nom » manque/);

      assert.ok(existsSync(chemin));
      assert.deepEqual(lireConfiguration(chemin), { chemin, projets: [] });
    });
  });
});
