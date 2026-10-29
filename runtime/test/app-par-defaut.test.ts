// Le fichier de l'app, créé neutre au premier lancement du runtime et complété sans rien perdre.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { APP_PAR_DEFAUT, assurerLApp, cheminDeLApp, direLApp } from "../src/app-par-defaut.ts";
import { repertoireTemporaire } from "./outils.ts";

describe("app.json par défaut", () => {
  test("sur un dossier de configuration vide, le fichier est créé, valide, et neutre", (t) => {
    const chemin = join(repertoireTemporaire(t), "config/brigade/app.json");

    const lu = assurerLApp(chemin);

    assert.deepEqual(lu, { chemin, fait: "cree" });
    const texte = readFileSync(chemin, "utf8");
    assert.deepEqual(JSON.parse(texte), APP_PAR_DEFAUT);
    // Aucun chemin absolu : rien d'une machine.
    assert.doesNotMatch(texte, /\/home\/|\/Users\/|\/var\/|[A-Z]:\\/i);
    assert.deepEqual((JSON.parse(texte) as { projets: unknown[] }).projets, []);
  });

  test("un fichier déjà complet reste identique à l'octet près", (t) => {
    const chemin = join(repertoireTemporaire(t), "app.json");
    const texte = '{"hotes":["mon-hote"],\n  "projets":[{"nom":"a","dossier":"/x"}],"autre":1}';
    writeFileSync(chemin, texte);

    assert.deepEqual(assurerLApp(chemin), { chemin, fait: "intact" });
    assert.equal(readFileSync(chemin, "utf8"), texte);
  });

  test("un fichier auquel il manque des clés les reçoit, et garde toutes les valeurs du chef", (t) => {
    const chemin = join(repertoireTemporaire(t), "app.json");
    writeFileSync(chemin, JSON.stringify({ reglage: { inconnu: true }, couleurs: ["#123456"] }));

    assert.deepEqual(assurerLApp(chemin), { chemin, fait: "complete" });
    assert.deepEqual(JSON.parse(readFileSync(chemin, "utf8")), { reglage: { inconnu: true }, couleurs: ["#123456"], projets: [] });
  });

  test("un fichier que le runtime ne comprend pas n'est jamais réécrit, et le dit", (t) => {
    const dossier = repertoireTemporaire(t);
    for (const [nom, texte] of [["casse.json", "{ pas du json"], ["liste.json", "[]"]] as const) {
      const chemin = join(dossier, nom);
      writeFileSync(chemin, texte);
      const lu = assurerLApp(chemin);
      assert.ok("refus" in lu);
      assert.equal(readFileSync(chemin, "utf8"), texte);
      assert.match(direLApp(lu) ?? "", /left as it is/);
    }
  });

  test("un dossier qui ne peut pas être créé est un refus dit, pas une exception", (t) => {
    const dossier = repertoireTemporaire(t);
    const bloc = join(dossier, "fichier");
    writeFileSync(bloc, "");

    const lu = assurerLApp(join(bloc, "sous/app.json"));

    assert.ok("refus" in lu);
  });

  test("le chemin suit BRIGADE_APP_CONFIG, puis HOME, et n'est deviné nulle part ailleurs", () => {
    assert.equal(cheminDeLApp({ BRIGADE_APP_CONFIG: "/a/b.json", HOME: "/h" }), "/a/b.json");
    assert.equal(cheminDeLApp({ HOME: "/h" }), join("/h", ".config", "brigade", "app.json"));
    assert.equal(cheminDeLApp({}), undefined);
  });
});
