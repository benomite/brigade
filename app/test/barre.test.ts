// La barre d'icônes : le nom de chaque projet, tel que déclaré.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { pourLaBarre } from "../src/barre.ts";

describe("la barre d'icônes", () => {
  test("deux noms proches restent deux noms entiers : la barre ne les ramène pas à un signe commun", () => {
    const configuration = { chemin: "/chef/app.json", projets: [{ nom: "mirrorscreen", dossier: "/p/a" }, { nom: "mirrorlab", dossier: "/p/b" }] };

    assert.deepEqual(pourLaBarre(configuration).projets.map(({ nom }) => nom), ["mirrorscreen", "mirrorlab"]);
  });

  test("la case coupe un nom trop long d'une ellipse, sans élargir la barre, et le survol le dit en entier", () => {
    const css = readFileSync(new URL("../src/vue/vue.css", import.meta.url), "utf8");
    const vue = readFileSync(new URL("../src/vue/vue.js", import.meta.url), "utf8");

    assert.match(css, /#projets \.nom-de-case \{[^}]*-webkit-line-clamp: 2;[^}]*overflow: hidden;/);
    assert.match(css, /#projets \{\s*flex: 0 0 64px;/);
    assert.match(vue, /cree\.title = nom;/);
  });

  test("chaque projet du fichier garde son nom — le reste de ce que le fichier dit passe tel quel", () => {
    const configuration = {
      chemin: "/chef/app.json",
      nonRelu: "JSON illisible",
      projets: [
        { nom: "brigade", dossier: "/projets/brigade" },
        { nom: "brigade-site", dossier: "/absent", refus: "dossier introuvable : /absent" },
      ],
    };

    assert.deepEqual(pourLaBarre(configuration), {
      chemin: "/chef/app.json",
      nonRelu: "JSON illisible",
      projets: [
        { nom: "brigade", dossier: "/projets/brigade" },
        { nom: "brigade-site", dossier: "/absent", refus: "dossier introuvable : /absent" },
      ],
    });
    assert.deepEqual(pourLaBarre({ chemin: "/chef/app.json", projets: [], refus: "ce fichier n'existe pas" }), { chemin: "/chef/app.json", projets: [], refus: "ce fichier n'existe pas" });
  });

  test("un projet que l'app montre sans sa station garde son nom", () => {
    const configuration = { chemin: "/chef/app.json", projets: [{ nom: "brigade", dossier: "/projets/brigade" }, { nom: "parade", dossier: "/projets/parade" }] };

    const affichee = pourLaBarre(configuration, (projet) => projet.nom === "brigade");

    assert.deepEqual(affichee.projets, [
      { nom: "brigade", dossier: "/projets/brigade", servi: true },
      { nom: "parade", dossier: "/projets/parade" },
    ]);
  });
});
