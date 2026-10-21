// Le cook design est un profil comme les autres : son domaine est la vue de
// l'app, il est bâti de `agents/cook-design.md`, il passe par la préférence au
// dispatch, le carnet et le journal, et la liste des profils le montre dans la
// même forme que les autres. Le dépôt qui n'a pas ce fichier n'a pas ce profil.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { apprentissageDuProjet } from "../../src/apprentissage/projet.ts";
import { PROFIL_COOK_DESIGN } from "../../src/calibrage.ts";
import { MARQUEUR } from "../../src/fiche.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { saveDefinition, type DefinitionDeProfil } from "../../src/profils/definition.ts";
import { blocDuCarnet, carnetDuProfil, lireLesProfils, profilPrefere } from "../../src/profils/preference.ts";
import { cuisine, issue } from "../aides/cuisine.ts";
import { jusqua, repertoireTemporaire } from "../outils.ts";

function depot(t: TestContext, { design = true } = {}): string {
  const repoDir = repertoireTemporaire(t);
  if (design) {
    mkdirSync(dirname(join(repoDir, PROFIL_COOK_DESIGN)), { recursive: true });
    writeFileSync(join(repoDir, PROFIL_COOK_DESIGN), "---\nname: cook-design\n---\n");
  }
  return repoDir;
}

describe("le cook design est un profil", () => {
  test("le dépôt qui définit agents/cook-design.md a le profil « design » : domaine app/src/vue, skill et périmètre, carnet vide", (t) => {
    const profils = lireLesProfils(depot(t));
    assert.deepEqual(profils.map(({ name, zone, perimeter, skills, tickets, notebook }) => ({ name, zone, perimeter, skills, tickets, notebook })), [
      { name: "design", zone: "app/src/vue", perimeter: ["app/src/vue"], skills: [PROFIL_COOK_DESIGN], tickets: [], notebook: { lessons: [] } },
    ]);
    // Un dépôt sans ce fichier n'a pas ce profil.
    assert.deepEqual(lireLesProfils(depot(t, { design: false })), []);
  });

  test("un ticket dont la zone touche la vue part sous lui ; occupé, le généraliste ne l'attend pas", (t) => {
    const [design] = lireLesProfils(depot(t));
    assert.ok(design !== undefined);
    assert.equal(profilPrefere([design], ["app/src/vue/rail.ts"], new Set())?.name, "design");
    assert.equal(profilPrefere([design], ["runtime/src"], new Set()), null);
    assert.equal(profilPrefere([design], ["app/src/vue/rail.ts"], new Set(["design"])), null);
  });

  test("son carnet dit son fichier, et une définition « design » du dépôt l'emporte et porte son carnet", (t) => {
    const repoDir = depot(t);
    assert.match(blocDuCarnet(carnetDuProfil(lireLesProfils(repoDir)[0]!)).join("\n"), /sous le profil de cook « design », que le projet définit dans `agents\/cook-design\.md`/);
    const ecrit: DefinitionDeProfil = { name: "design", zone: "app/src/vue", perimeter: ["app/src/vue"], skills: [PROFIL_COOK_DESIGN], accepted: "2026-10-20", tickets: [1], notebook: { lessons: [{ id: "L-1", text: "Capturer avant et après.", state: "promoted", entered: "2026-10-20", retros: ["#1"], origin: { kind: "retro" } }] } };
    saveDefinition(repoDir, ecrit);
    const profils = lireLesProfils(repoDir);
    assert.equal(profils.length, 1);
    assert.deepEqual(carnetDuProfil(profils[0]!).lecons, [{ id: "L-1", texte: "Capturer avant et après." }]);
  });

  test("la cuisine lance le ticket de la vue sous le profil design, et le journal le nomme comme tout profil ; le cook du profil occupé, le suivant part en généraliste", async (t) => {
    const repoDir = depot(t);
    const { gh, journal, cooks } = cuisine(t, { scenario: "muet", cooks: 3, profils: () => lireLesProfils(repoDir) });
    for (const [numero, fichier] of [[14, "rail"], [15, "pass"]] as const) {
      gh.ficher(numero, "2026-10-08T09:00:00Z", [MARQUEUR, `- zone : app/src/vue/${fichier}.ts`].join("\n"));
      gh.poser(issue(numero));
    }
    await jusqua(() => cooks().length === 2);
    const donnes = [14, 15].flatMap((ticket) => journal.duTicket(ticket).filter((e) => e.type === "profile.notebook-given"));
    assert.equal(donnes.length, 1);
    assert.deepEqual({ name: donnes[0]?.payload.name, zone: donnes[0]?.payload.zone, file: donnes[0]?.payload.file }, { name: "design", zone: "app/src/vue", file: PROFIL_COOK_DESIGN });
  });

  test("la liste des profils le montre dans la même forme que les autres, à côté d'un profil écrit", (t) => {
    const repoDir = depot(t);
    saveDefinition(repoDir, { name: "runtime-src", zone: "runtime/src", perimeter: ["runtime/src"], skills: [], accepted: "2026-10-19", tickets: [2], notebook: { lessons: [] } });
    const journal = ouvrirJournal(repertoireTemporaire(t));
    t.after(() => journal.fermer());
    const { profils } = apprentissageDuProjet({ journal, projet: "p", repoDir });
    assert.deepEqual(profils.map(({ nom, domaine, skills, perimetre, carnet, tickets, progres }) => ({ nom, domaine, skills, perimetre, carnet, tickets, progres })), [
      { nom: "runtime-src", domaine: "runtime/src", skills: [], perimetre: ["runtime/src"], carnet: [], tickets: [2], progres: { avant: null, apres: null } },
      { nom: "design", domaine: "app/src/vue", skills: [PROFIL_COOK_DESIGN], perimetre: ["app/src/vue"], carnet: [], tickets: [], progres: { avant: null, apres: null } },
    ]);
  });
});
