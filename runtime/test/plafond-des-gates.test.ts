// Le plafond de durée des gates : le vrai `.claude/brigade/gates.sh` de ce
// dépôt, joué sur un projet d'essai. Le projet n'a ni manifest ni dépôt git, les
// autres étapes y sont donc rouges — seul le plafond est regardé ici.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ENV_ENFANT, repertoireTemporaire } from "./outils.ts";

const GATES = join(import.meta.dirname, "../../.claude/brigade/gates.sh");

// `suite` est la commande de test du projet d'essai : c'est elle que les gates
// mesurent.
function projet(t: TestContext, { binding, suite = "true" }: { binding?: string; suite?: string }): string {
  const racine = repertoireTemporaire(t);
  mkdirSync(join(racine, "runtime"));
  writeFileSync(join(racine, "runtime/package.json"), JSON.stringify({ scripts: { test: suite } }));
  writeFileSync(
    join(racine, "CLAUDE.md"),
    ["## Équipe multi-agents (plugin brigade)", "", "- **Branche d'intégration** : `main`", ...(binding ? [binding] : [])].join("\n") + "\n",
  );
  return racine;
}

function jouer(racine: string): Promise<{ lignes: string[]; sortie: string }> {
  return new Promise((resoudre, rejeter) => {
    const gates = spawn("bash", [GATES, racine], { env: ENV_ENFANT, stdio: ["ignore", "pipe", "pipe"] });
    let sortie = "";
    gates.stdout.on("data", (morceau: Buffer) => (sortie += morceau.toString()));
    gates.stderr.on("data", (morceau: Buffer) => (sortie += morceau.toString()));
    gates.on("error", rejeter);
    gates.on("close", () => resoudre({ lignes: sortie.split("\n"), sortie }));
  });
}

const duPlafond = (lignes: string[]) => lignes.filter((ligne) => /plafond|durée des gates/.test(ligne));

// Chaque test a son projet : ils se jouent de front.
describe("le plafond de durée des gates", { concurrency: 8 }, () => {
  test("sans plafond déclaré, les gates disent ce qu'elles ont coûté et ne jugent pas", async (t) => {
    const { lignes } = await jouer(projet(t, {}));

    assert.equal(duPlafond(lignes).length, 1);
    assert.match(duPlafond(lignes)[0] ?? "", /^ok {4}durée des gates : \d+,\d s de processeur, \d+ s d'horloge \(aucun plafond déclaré\)$/);
  });

  test("sous le plafond déclaré, la durée est verte et rappelle le plafond", async (t) => {
    const { lignes } = await jouer(projet(t, { binding: "- **Plafond des gates** : `600 s` de processeur" }));

    assert.equal(duPlafond(lignes).length, 1);
    assert.match(duPlafond(lignes)[0] ?? "", /^ok {4}durée des gates : \d+,\d s de processeur, \d+ s d'horloge \(plafond : 600 s de processeur\)$/);
  });

  test("le plafond franchi rougit, et dit de combien", async (t) => {
    // Aucun passage de gates ne tient en un centième de seconde de processeur.
    const { lignes } = await jouer(projet(t, { binding: "- **Plafond des gates** : `0,01 s` de processeur" }));

    // La ligne FAIL ne porte aucune mesure : le hook d'arrêt en tire l'empreinte
    // de l'échec, qui doit rester la même d'un passage au suivant.
    assert.ok(lignes.includes("FAIL  plafond des gates franchi : plus de 0,01 s de processeur"), lignes.join("\n"));
    const detail = lignes.find((ligne) => ligne.startsWith("durée des gates : "));
    assert.match(detail ?? "", /^durée des gates : \d+,\d s de processeur pour un plafond de 0,01 s — \d+,\d s de trop \(\+\d+ %\)$/);
    assert.equal(lignes.at(-2), "gates : ROUGE");
  });

  test("le plafond compte le processeur, pas l'horloge : une suite qui attend ne le franchit pas", async (t) => {
    // Quatre secondes d'horloge pour un plafond de trois : c'est ce que fait une
    // machine chargée à une suite qui, elle, n'a pas grossi.
    const { lignes } = await jouer(projet(t, { binding: "- **Plafond des gates** : `3 s` de processeur", suite: "sleep 4" }));

    const ligne = duPlafond(lignes)[0] ?? "";
    assert.match(ligne, /^ok {4}durée des gates : .*\(plafond : 3 s de processeur\)$/);
    assert.ok(Number(/, (\d+) s d'horloge/.exec(ligne)?.[1]) >= 4, ligne);
  });

  test("un plafond déclaré mais illisible rougit, au lieu de passer pour absent", async (t) => {
    const { lignes } = await jouer(projet(t, { binding: "- **Plafond des gates** : une dizaine de secondes" }));

    assert.ok(lignes.some((ligne) => ligne.startsWith("FAIL  plafond des gates illisible dans CLAUDE.md")), lignes.join("\n"));
  });
});
