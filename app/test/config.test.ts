// Dire où sont les projets : le fichier de configuration de l'app, lu depuis de
// vrais fichiers écrits par le test.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { cheminConfiguration, EXEMPLE, lireConfiguration } from "../src/config.ts";

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

    assert.deepEqual(lireConfiguration(chemin), { chemin, projets: [], refus: "ce fichier n'existe pas encore" });
  });

  const REFUSES: [string, unknown, RegExp][] = [
    ["un JSON illisible", "{ projets: ", /^JSON illisible : /],
    ["autre chose qu'une liste de projets", { projets: "brigade" }, /^« projets » doit être une liste$/],
    ["une liste vide", { projets: [] }, /^la liste « projets » est vide$/],
    ["un projet sans nom", { projets: [{ dossier: "/tmp" }] }, /^projet n° 1 : « nom » manque$/],
    ["un projet au nom vide", { projets: [{ nom: " ", dossier: "/tmp" }] }, /^projet n° 1 : « nom » manque$/],
    ["un projet sans dossier", { projets: [{ nom: "a", dossier: "/tmp" }, { nom: "b" }] }, /^projet n° 2 \(b\) : « dossier » manque$/],
    ["un dossier relatif", { projets: [{ nom: "a", dossier: "Dev/a" }] }, /^projet n° 1 \(a\) : « dossier » doit être un chemin absolu, ou commencer par ~\/$/],
    ["un hôte qui n'est pas un texte", { projets: [{ nom: "a", dossier: "/tmp", hote: 22 }] }, /^projet n° 1 \(a\) : « hote » doit être un texte non vide$/],
    ["un hôte vide", { projets: [{ nom: "a", dossier: "/tmp", hote: " " }] }, /^projet n° 1 \(a\) : « hote » doit être un texte non vide$/],
    // Le fichier d'avant : il n'est ni lu comme avant, ni ignoré.
    ["un projet qui porte encore « commande »", { projets: [{ nom: "a", dossier: "/tmp" }, { nom: "b", dossier: "/tmp", hote: "box", commande: "sudo -u brigade npm" }] }, /^projet n° 2 \(b\) : « commande » n'est plus lu — retire-le : l'app lance le geste de la box \(`brigade b <commande>`\), « hote » lui suffit$/],
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
});
