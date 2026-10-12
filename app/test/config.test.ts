// Dire où sont les projets : le fichier de configuration de l'app, lu depuis de
// vrais fichiers écrits par le test.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ajouterHote, ajouterProjet, boxes, cheminConfiguration, creerConfiguration, EXEMPLE, lireConfiguration, refusDAjout } from "../src/config.ts";

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

  describe("les box, déclarées une fois", () => {
    test("une liste d'hôtes, chacun le nom par lequel ssh joint la box — dans l'ordre du fichier, et rien d'autre", (t) => {
      const { racine, chemin } = configuration(t, { hotes: ["box", "chef@autre-box"], projets: [{ nom: "servi", dossier: "~", hote: "box" }] });

      assert.deepEqual(lireConfiguration(chemin, racine), { chemin, projets: [{ nom: "servi", dossier: racine, box: { hote: "box" } }], hotes: ["box", "chef@autre-box"] });
    });

    test("avec deux hôtes déclarés, l'écran d'ajout propose les deux — sans qu'aucun projet les nomme", (t) => {
      const { chemin } = configuration(t, { hotes: ["box", "chef@autre-box"], projets: [] });

      assert.deepEqual(boxes(lireConfiguration(chemin)), ["box", "chef@autre-box"]);
    });

    test("un fichier d'avant la liste n'a rien à récrire : la box que ses projets nomment se propose aussi, une fois", (t) => {
      const { racine, chemin } = configuration(t, {
        projets: [
          { nom: "a", dossier: "~", hote: "box" },
          { nom: "b", dossier: "~", hote: "box" },
          { nom: "c", dossier: "~" },
        ],
      });
      const lue = lireConfiguration(chemin, racine);

      assert.equal(lue.hotes, undefined);
      assert.deepEqual(boxes(lue), ["box"]);
      // Les déclarées d'abord, dans leur ordre ; puis celles qu'un projet seul nomme.
      assert.deepEqual(boxes({ ...lue, hotes: ["neuve", "box"] }), ["neuve", "box"]);
      assert.deepEqual(boxes({ ...lue, hotes: ["neuve"] }), ["neuve", "box"]);
    });

    test("un hôte écrit deux fois n'en fait qu'un, et une liste vide n'est pas un refus", (t) => {
      assert.deepEqual(lireConfiguration(configuration(t, { hotes: ["box", "box"], projets: [] }).chemin).hotes, ["box"]);
      assert.deepEqual(lireConfiguration(configuration(t, { hotes: [], projets: [] }).chemin).hotes, []);
    });

    test("déclarer une box depuis l'app : son nom s'écrit à la suite des autres, et ce que le fichier porte d'autre y reste", (t) => {
      const { chemin } = configuration(t, { note: "à moi", projets: [{ nom: "a", dossier: "/", hote: "box" }] });

      assert.equal(ajouterHote(chemin, " box "), undefined);
      assert.equal(ajouterHote(chemin, "chef@autre-box"), undefined);

      assert.deepEqual(JSON.parse(readFileSync(chemin, "utf8")), { note: "à moi", projets: [{ nom: "a", dossier: "/", hote: "box" }], hotes: ["box", "chef@autre-box"] });
      assert.deepEqual(boxes(lireConfiguration(chemin)), ["box", "chef@autre-box"]);
    });

    test("sans fichier, déclarer une box le crée", (t) => {
      const chemin = join(repertoire(t), "config/app.json");

      assert.equal(ajouterHote(chemin, "box"), undefined);

      assert.deepEqual(lireConfiguration(chemin), { chemin, projets: [], hotes: ["box"] });
    });

    const BOX_REFUSEES: [string, string, RegExp][] = [
      ["sans nom", "  ", /^il manque le nom de la box/],
      ["au nom en deux mots", "ma box", /^« ma box » contient un blanc/],
      ["dont le nom serait une option de ssh", "-oProxyCommand=id", /commence par un tiret : `ssh` le lirait comme une option$/],
      ["déjà déclarée", "box", /^la box « box » est déjà déclarée$/],
    ];
    for (const [quoi, hote, refus] of BOX_REFUSEES) {
      test(`une box ${quoi} n'est pas déclarée : le fichier reste tel quel, et la raison est dite`, (t) => {
        const { chemin } = configuration(t, { hotes: ["box"], projets: [] });
        const avant = readFileSync(chemin, "utf8");

        assert.match(ajouterHote(chemin, hote) ?? "", refus);

        assert.equal(readFileSync(chemin, "utf8"), avant);
      });
    }

    test("une box n'est pas déclarée dans un fichier que l'app n'a pas compris", (t) => {
      const { chemin } = configuration(t, "{ projets: ");

      assert.match(ajouterHote(chemin, "box") ?? "", /^l'app n'écrit pas dans un fichier qu'elle n'a pas compris — JSON illisible : /);
      assert.equal(readFileSync(chemin, "utf8"), "{ projets: ");
    });
  });

  test("l'exemple ne porte rien à recopier tel quel : chaque valeur à remplacer se voit, et aucune commande n'y est dictée", () => {
    const [projet] = (JSON.parse(EXEMPLE) as { projets: Record<string, string>[] }).projets;

    assert.deepEqual(Object.keys(projet ?? {}), ["nom", "dossier", "hote"]);
    for (const valeur of Object.values(projet ?? {})) assert.match(valeur, /^<.+>$/);
    assert.match(projet?.hote ?? "", /ton ssh joint ta box/);
    // Les box aussi : une liste de noms, et celui de l'exemple est à remplacer.
    const { hotes } = JSON.parse(EXEMPLE) as { hotes: string[] };
    assert.equal(hotes.length, 1);
    assert.match(hotes[0] ?? "", /^<.*ton ssh joint ta box.*>$/);
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
    ["autre chose qu'une liste d'hôtes", { hotes: "box", projets: [] }, /^« hotes » doit être une liste$/],
    ["un hôte qui n'est pas un texte", { hotes: ["box", { hote: "autre" }], projets: [] }, /^hôte n° 2 : doit être un texte non vide — le nom par lequel ton ssh joint la box$/],
    ["un hôte vide", { hotes: [" "], projets: [] }, /^hôte n° 1 : doit être un texte non vide/],
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

    test("ce qui refuserait un projet se sait sans rien écrire : la même raison que l'ajout, et le fichier tel quel", (t) => {
      const racine = repertoire(t);
      const { chemin } = configuration(t, { projets: [{ nom: "a", dossier: "/" }] });
      const avant = readFileSync(chemin, "utf8");

      assert.equal(refusDAjout(chemin, { nom: "b", dossier: racine, hote: "box" }), undefined);
      assert.match(refusDAjout(chemin, { nom: "a", dossier: racine }) ?? "", /^deux projets s'appellent « a »$/);
      assert.match(refusDAjout(chemin, { nom: "b", dossier: "/nulle/part" }) ?? "", /^dossier introuvable : \/nulle\/part$/);

      assert.equal(readFileSync(chemin, "utf8"), avant);
    });

    test("un ajout refusé sans fichier ne laisse pas un projet à moitié écrit", (t) => {
      const chemin = join(repertoire(t), "app.json");

      assert.match(ajouterProjet(chemin, { nom: "", dossier: "/" }) ?? "", /« nom » manque/);

      assert.ok(existsSync(chemin));
      assert.deepEqual(lireConfiguration(chemin), { chemin, projets: [] });
    });
  });
});
