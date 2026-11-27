// La barre d'icônes : le sigle de chaque projet (acronym.ts), son nom entier au survol.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { forTheBar } from "../src/bar.ts";

describe("la barre d'icônes", () => {
  test("deux noms proches ont deux sigles : la barre ne les ramène pas à un signe commun, et garde leurs noms entiers", () => {
    const configuration = { chemin: "/chef/app.json", projets: [{ nom: "mirrorscreen", dossier: "/p/a" }, { nom: "mirrorlab", dossier: "/p/b" }] };

    assert.deepEqual(forTheBar(configuration).projets.map(({ nom: name, etiquette: label }) => [name, label]), [
      ["mirrorscreen", "MS"],
      ["mirrorlab", "ML"],
    ]);
  });

  test("la case écrit le sigle, sans élargir la barre, et le survol dit le nom en entier", () => {
    const css = readFileSync(new URL("../src/vue/vue.css", import.meta.url), "utf8");
    const vue = readFileSync(new URL("../src/vue/vue.js", import.meta.url), "utf8");

    assert.match(css, /#projets \{\s*flex: 0 0 64px;/);
    assert.match(vue, /etiquette\.textContent = projet\.etiquette;/);
    assert.match(vue, /cree\.title = nom;/);
  });

  test("chaque projet du fichier garde son nom, et reçoit son sigle — le reste de ce que le fichier dit passe tel quel", () => {
    const configuration = {
      chemin: "/chef/app.json",
      nonRelu: "JSON illisible",
      projets: [
        { nom: "brigade", dossier: "/projets/brigade" },
        { nom: "brigade-site", dossier: "/absent", refus: "dossier introuvable : /absent" },
      ],
    };

    assert.deepEqual(forTheBar(configuration), {
      chemin: "/chef/app.json",
      nonRelu: "JSON illisible",
      projets: [
        { nom: "brigade", dossier: "/projets/brigade", etiquette: "BR" },
        { nom: "brigade-site", dossier: "/absent", refus: "dossier introuvable : /absent", etiquette: "BS" },
      ],
    });
    assert.deepEqual(forTheBar({ chemin: "/chef/app.json", projets: [], refus: "ce fichier n'existe pas" }), { chemin: "/chef/app.json", projets: [], refus: "ce fichier n'existe pas" });
  });

  test("un projet que l'app montre sans sa station garde son nom", () => {
    const configuration = { chemin: "/chef/app.json", projets: [{ nom: "brigade", dossier: "/projets/brigade" }, { nom: "parade", dossier: "/projets/parade" }] };

    const shownEntry = forTheBar(configuration, (project) => project.nom === "brigade");

    assert.deepEqual(shownEntry.projets, [
      { nom: "brigade", dossier: "/projets/brigade", etiquette: "BR", servi: true },
      { nom: "parade", dossier: "/projets/parade", etiquette: "PA" },
    ]);
  });

  test("pendant que la mise à jour de la station de cet ordinateur la redémarre, ses projets portent la version et pas « sans station » (#3637)", () => {
    const configuration = { chemin: "/chef/app.json", projets: [{ nom: "parade", dossier: "/p/a" }, { nom: "autre", dossier: "/p/b" }] };
    const here = (name: string) => name === "parade";
    const [parade, other] = forTheBar(configuration, () => true, here, () => false, () => "2.5.0").projets;
    assert.equal(parade?.redemarre, "2.5.0");
    assert.equal(parade?.sansStation, undefined);
    assert.equal(other?.redemarre, undefined);
    // Sans redémarrage, une station qui ne tourne pas reste « sans station ».
    const [stopped] = forTheBar(configuration, () => true, here, () => false).projets;
    assert.equal(stopped?.sansStation, true);
    assert.equal(stopped?.redemarre, undefined);
  });
});
