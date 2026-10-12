// Les boutons d'action : chacun écrit dans le second une commande de la doc,
// mot pour mot, et n'envoie rien. Ce qui s'écrit se compare ici à
// docs/runtime.md, « Piloter » ; que rien ne parte se prouve sur le registre
// (terminaux.test.ts) et sur un vrai pty (pty.test.ts).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { BOUTONS, ecritPar } from "../src/boutons.ts";
import type { Projet } from "../src/config.ts";
import { ONGLETS } from "../src/onglets.ts";

const RACINE = join(import.meta.dirname, "../..");
const doc = readFileSync(join(RACINE, "docs/runtime.md"), "utf8");
const PILOTER = doc.slice(doc.indexOf("### Piloter"), doc.indexOf("### Recette du chef"));
const PARADE = { nom: "parade", dossier: "/projets/parade", box: { hote: "box" } };

// La commande écrite : le test échoue net si le bouton a refusé d'écrire.
function commande(id: string, projet: Projet): string {
  const ecrit = ecritPar(id, projet);
  assert.ok(ecrit !== undefined && "commande" in ecrit, `rien n'est écrit par « ${id} »`);
  return ecrit.commande;
}

describe("les boutons d'action", () => {
  test("ils sont six, chacun là où son fait se lit : le panneau d'état, ou l'onglet de contenu de sa commande", () => {
    assert.deepEqual(BOUTONS.map(({ ou, commande }) => [ou, commande]), [
      ["etat", "garde-fous stop"],
      ["etat", "garde-fous reprendre"],
      ["grants", "grant activer merge"],
      ["grants", "grant prolonger merge "],
      ["grants", "grant revoquer merge"],
      ["cooks", "station cooks "],
    ]);
    for (const { ou } of BOUTONS) assert.ok(ou === "etat" || ONGLETS.some(({ id }) => id === ou), `« ${ou} » n'est ni le panneau ni un onglet`);
    assert.equal(new Set(BOUTONS.map(({ id }) => id)).size, BOUTONS.length);
  });

  test("ce qui s'écrit est la forme de « Piloter », mot pour mot, préfixée du `!` qui la lance depuis le second", () => {
    const DU_POSTE = "ssh <box> brigade <projet> status";
    assert.ok(PILOTER.includes(`\`${DU_POSTE}\``), "« Piloter » ne donne plus cette forme depuis le poste");

    for (const { id, commande } of BOUTONS) {
      const attendu = `!${DU_POSTE.replace("<box>", "box").replace("<projet>", "parade").replace("status", commande)}`;
      assert.deepEqual(ecritPar(id, PARADE), { commande: attendu });
    }
    assert.deepEqual(ecritPar("stop", PARADE), { commande: "!ssh box brigade parade garde-fous stop" });
  });

  test("chaque commande existe dans la doc aujourd'hui : un script du runtime, et ses mots sur sa ligne de « Piloter »", () => {
    const { scripts } = JSON.parse(readFileSync(join(RACINE, "runtime/package.json"), "utf8")) as { scripts: Record<string, string> };

    for (const { commande } of BOUTONS) {
      const [script = "", ...mots] = commande.trim().split(" ");
      assert.ok(script in scripts, `« ${script} » n'est pas un script du runtime`);
      const ligne = PILOTER.split("\n").find((candidate) => candidate.includes(`\`brigade <projet> ${script}`) && mots.every((mot) => candidate.includes(mot)));
      assert.ok(ligne, `« Piloter » ne donne pas \`brigade <projet> ${commande.trim()}\``);
    }
  });

  test("rien de ce qui s'écrit ne porte de quoi l'envoyer : ni retour chariot, ni saut de ligne", () => {
    for (const { id } of BOUTONS) assert.doesNotMatch(commande(id, PARADE), /[\r\n]/);
  });

  test("la vue nomme un bouton, jamais une commande ; et un projet sans box n'a rien à écrire", () => {
    for (const autre of ["garde-fous stop", "rm -rf /", "", undefined, 3, null]) assert.equal(ecritPar(autre, PARADE), undefined);
    for (const { id } of BOUTONS) assert.equal(ecritPar(id, { nom: "parade", dossier: "/projets/parade" }), undefined);
  });

  test("un nom ou un hôte que le shell du Mac découperait s'écrit cité : il arrive entier, et rien n'en est exécuté", () => {
    assert.equal(commande("stop", { nom: "parade", dossier: "/p", box: { hote: "chef@box.exemple:22" } }), "!ssh chef@box.exemple:22 brigade parade garde-fous stop");
    assert.equal(commande("stop", { nom: "parade", dossier: "/p", box: { hote: "box; rm -rf ~" } }), "!ssh 'box; rm -rf ~' brigade parade garde-fous stop");
    // Le nom passe deux shells — celui du Mac, puis celui de la box : il est cité pour chacun.
    assert.equal(commande("stop", { nom: "mon projet", dossier: "/p", box: { hote: "box" } }), `!ssh box brigade ''\\''mon projet'\\''' garde-fous stop`);
  });

  test("un hôte qui commence par un tiret serait une option de `ssh` dans la forme de la doc : rien n'est écrit, et le bouton dit pourquoi", () => {
    for (const hote of ["-oProxyCommand=sh", "-box", "--"]) {
      for (const { id } of BOUTONS) {
        assert.deepEqual(ecritPar(id, { nom: "parade", dossier: "/p", box: { hote } }), {
          refus: `rien n'est écrit : « hote » commence par un tiret (${hote}), et \`ssh\` le lirait comme une option dans la commande — corrige-le dans le fichier des projets`,
        });
      }
    }
    // Un tiret ailleurs est un nom d'hôte comme un autre.
    assert.equal(commande("stop", { nom: "parade", dossier: "/p", box: { hote: "ma-box" } }), "!ssh ma-box brigade parade garde-fous stop");
  });
});
