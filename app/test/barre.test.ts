// La barre d'icônes : un monogramme par projet, tiré de son nom et de lui seul.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { monogramme, pourLaBarre } from "../src/barre.ts";

describe("la barre d'icônes", () => {
  test("un nom d'un seul mot : ses deux premières lettres, en capitales", () => {
    assert.equal(monogramme("brigade"), "BR");
    assert.equal(monogramme("Parade"), "PA");
  });

  test("un nom de plusieurs mots : l'initiale des deux premiers, quel que soit ce qui les sépare", () => {
    assert.equal(monogramme("brigade-site"), "BS");
    assert.equal(monogramme("mon projet perso"), "MP");
    assert.equal(monogramme("baloo_app"), "BA");
    assert.equal(monogramme("  -tutos.sgdf"), "TS");
  });

  test("un nom d'un seul caractère, des chiffres, des accents : ce que le nom porte, rien d'inventé", () => {
    assert.equal(monogramme("x"), "X");
    assert.equal(monogramme("42"), "42");
    assert.equal(monogramme("v2-école"), "VÉ");
    assert.equal(monogramme("école"), "ÉC");
  });

  test("un nom sans lettre ni chiffre garde ses deux premiers caractères", () => {
    assert.equal(monogramme("--"), "--");
    assert.equal(monogramme("…"), "…");
  });

  test("chaque projet du fichier reçoit le sien — le reste de ce que le fichier dit passe tel quel", () => {
    const configuration = {
      chemin: "/chef/app.json",
      nonRelu: "JSON illisible",
      projets: [
        { nom: "brigade", dossier: "/projets/brigade", box: { hote: "box" } },
        { nom: "brigade-site", dossier: "/absent", refus: "dossier introuvable : /absent" },
      ],
    };

    assert.deepEqual(pourLaBarre(configuration), {
      chemin: "/chef/app.json",
      nonRelu: "JSON illisible",
      projets: [
        { nom: "brigade", dossier: "/projets/brigade", box: { hote: "box" }, monogramme: "BR" },
        { nom: "brigade-site", dossier: "/absent", refus: "dossier introuvable : /absent", monogramme: "BS" },
      ],
    });
    assert.deepEqual(pourLaBarre({ chemin: "/chef/app.json", projets: [], refus: "ce fichier n'existe pas" }), { chemin: "/chef/app.json", projets: [], refus: "ce fichier n'existe pas" });
  });

  test("un projet que l'app montre sans sa station garde son monogramme", () => {
    const desinstalle = { hote: "box", a: "2026-10-12T10:04:12.000Z", titre: "DÉSINSTALLÉ DE LA BOX « box » — plus pilotable depuis l'app", lignes: [] };
    const configuration = { chemin: "/chef/app.json", projets: [{ nom: "brigade", dossier: "/projets/brigade", box: { hote: "box" } }, { nom: "parade", dossier: "/projets/parade" }] };

    const affichee = pourLaBarre(configuration, (projet) => (projet.box === undefined ? projet : { nom: projet.nom, dossier: projet.dossier, desinstalle }));

    assert.deepEqual(affichee.projets, [
      { nom: "brigade", dossier: "/projets/brigade", desinstalle, monogramme: "BR" },
      { nom: "parade", dossier: "/projets/parade", monogramme: "PA" },
    ]);
  });
});
