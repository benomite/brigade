// Accorder le gist et le fichier de l'app : les deux fonctions pures, sans GitHub ni disque.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { same, set, replay } from "../../src/settings-personal/merge.ts";

const names = (preferences: { projets?: unknown }) => (preferences.projets as { nom: string }[]).map(({ nom: name }) => name);

describe("rejouer : ce que le gist porte après un changement fait ici", () => {
  test("au premier accord, le gist l'emporte, et le fichier ne lui donne que ce qui lui manque", () => {
    const gist = { affichage: { densite: "serree" }, projets: [{ nom: "cuisine", couleurs: { onglet: "#f2994a" } }] };
    const here = { affichage: { densite: "aeree" }, theme: "sombre", projets: [{ nom: "cuisine", couleurs: { onglet: "#000000" }, depot: "chef/cuisine" }, { nom: "cave" }] };
    assert.deepEqual(replay(gist, undefined, here), {
      affichage: { densite: "serree" },
      theme: "sombre",
      projets: [{ nom: "cuisine", couleurs: { onglet: "#f2994a" }, depot: "chef/cuisine" }, { nom: "cave" }],
    });
  });

  test("seul ce qui a changé ici depuis le dernier accord recouvre le gist", () => {
    const before = { affichage: { densite: "serree" }, projets: [{ nom: "cuisine", couleurs: { onglet: "#f2994a", accent: "#ad7142" } }, { nom: "salle" }] };
    const after = { affichage: { densite: "serree" }, projets: [{ nom: "cuisine", couleurs: { onglet: "#e85d75", accent: "#ad7142" } }, { nom: "salle" }] };
    // Un autre appareil a changé l'affichage et la salle entre-temps : ils restent.
    const gist = { affichage: { densite: "aeree" }, projets: [{ nom: "cuisine", couleurs: { onglet: "#f2994a", accent: "#ad7142" } }, { nom: "salle", couleurs: { onglet: "#4caf50" } }] };
    assert.deepEqual(replay(gist, before, after), {
      affichage: { densite: "aeree" },
      projets: [{ nom: "cuisine", couleurs: { onglet: "#e85d75", accent: "#ad7142" } }, { nom: "salle", couleurs: { onglet: "#4caf50" } }],
    });
  });

  test("une préférence retirée ici est retirée du gist ; un projet retiré ici y reste", () => {
    const before = { affichage: {}, projets: [{ nom: "cuisine" }, { nom: "salle" }] };
    const after = { projets: [{ nom: "cuisine" }] };
    assert.deepEqual(replay(before, before, after), { projets: [{ nom: "cuisine" }, { nom: "salle" }] });
  });

  test("rangés ici : l'ordre d'ici, et un projet que seul le gist connaît reste derrière celui qu'il suivait", () => {
    const gist = { projets: [{ nom: "grenier" }, { nom: "a" }, { nom: "b" }, { nom: "cave" }, { nom: "c" }] };
    const before = { projets: [{ nom: "a" }, { nom: "b" }, { nom: "c" }] };
    const after = { projets: [{ nom: "c" }, { nom: "a" }, { nom: "b" }] };
    assert.deepEqual(names(replay(gist, before, after)), ["grenier", "c", "a", "b", "cave"]);
  });

  test("sans rangement ici, l'ordre du gist, et un projet arrivé ici à sa suite", () => {
    const gist = { projets: [{ nom: "b" }, { nom: "a" }] };
    const before = { projets: [{ nom: "a" }, { nom: "b" }] };
    const after = { projets: [{ nom: "a" }, { nom: "b" }, { nom: "neuf" }] };
    assert.deepEqual(names(replay(gist, before, after)), ["b", "a", "neuf"]);
  });

  test("aucune clé de l'appareil ne sort, même d'un fichier qui en porte", () => {
    const here = { projets: [{ nom: "cuisine", dossier: "/Users/chef/cuisine", ordinaires: true, limiteCooks: 2, couleurs: { onglet: "#f2994a" } }] };
    assert.deepEqual(replay({}, undefined, here), { projets: [{ nom: "cuisine", couleurs: { onglet: "#f2994a" } }] });
    assert.deepEqual(replay({}, { projets: [] }, here), { projets: [{ nom: "cuisine", couleurs: { onglet: "#f2994a" } }] });
  });
});

describe("poser : le fichier de l'app avec les préférences du gist", () => {
  const FILE = {
    affichage: { densite: "aeree" },
    projets: [
      { nom: "cuisine", dossier: "/Users/chef/cuisine", couleurs: { onglet: "#000000" }, ordinaires: true },
      { nom: "ici-seulement", dossier: "/Users/chef/ici", couleurs: { onglet: "#111111" } },
      { nom: "salle", dossier: "/Users/chef/salle" },
    ],
  };

  test("les préférences du gist, les clés de l'appareil du fichier, chaque clé à sa place", () => {
    const pose = set(FILE, { affichage: { densite: "serree" }, projets: [{ nom: "salle", couleurs: { onglet: "#4caf50" } }, { nom: "cuisine", couleurs: { onglet: "#f2994a" } }, { nom: "ailleurs" }] });
    assert.deepEqual(pose, {
      affichage: { densite: "serree" },
      projets: [
        { nom: "salle", dossier: "/Users/chef/salle", couleurs: { onglet: "#4caf50" } },
        { nom: "ici-seulement", dossier: "/Users/chef/ici", couleurs: { onglet: "#111111" } },
        { nom: "cuisine", dossier: "/Users/chef/cuisine", couleurs: { onglet: "#f2994a" }, ordinaires: true },
      ],
    });
    assert.deepEqual(Object.keys((pose.projets as object[])[2]!), ["nom", "dossier", "couleurs", "ordinaires"]);
    // Le fichier lu n'est pas touché.
    assert.deepEqual(FILE.projets[0]!.couleurs, { onglet: "#000000" });
  });

  test("une préférence que le gist n'a plus quitte le fichier ; les clés de l'appareil restent", () => {
    // Un gist sans projets ne dit rien des projets : ils restent tels quels.
    assert.deepEqual(set(FILE, {}), { projets: FILE.projets });
    const pose = set(FILE, { projets: [{ nom: "cuisine" }] });
    assert.equal("affichage" in pose, false);
    assert.deepEqual((pose.projets as object[])[0], { nom: "cuisine", dossier: "/Users/chef/cuisine", ordinaires: true });
  });

  test("le dossier écrit dans le gist ne remplace pas celui du fichier", () => {
    const pose = set(FILE, { projets: [{ nom: "cuisine", dossier: "/ailleurs" }] } as never);
    assert.deepEqual((pose.projets as object[])[0], { nom: "cuisine", dossier: "/Users/chef/cuisine", ordinaires: true });
  });
});

test("memes : la même valeur, quel que soit l'ordre de ses clés — mais pas celui d'une liste", () => {
  assert.ok(same({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 }));
  assert.ok(!same([1, 2], [2, 1]));
  assert.ok(!same({ a: undefined }, { a: null }));
});
