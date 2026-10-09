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

// Ce que la ligne `durée des gates :` dit de compté (le temps utilisateur) et de
// non compté (le temps système, l'horloge), en secondes.
const NON_COMPTES = String.raw`non comptés : \d+,\d s de système, \d+ s d'horloge`;
function releve(ligne: string): { utilisateur: number; systeme: number; horloge: number } {
  const lu = /durée des gates : (\d+),(\d) s de processeur utilisateur.* — non comptés : (\d+),(\d) s de système, (\d+) s d'horloge$/.exec(ligne);
  assert.ok(lu, ligne);
  return { utilisateur: Number(`${lu[1]}.${lu[2]}`), systeme: Number(`${lu[3]}.${lu[4]}`), horloge: Number(lu[5]) };
}

// Une suite qui calcule : deux secondes de temps utilisateur, sans rien demander
// au système.
const CALCULE = `node -e "while (process.cpuUsage().user < 2e6) for (let i = 0; i < 1e7; i++);"`;
// Une suite qui ne fait qu'appeler le système, octet par octet : c'est à cela
// que ressemble, pour le compte, une suite inchangée sur un poste encombré.
const APPELLE_LE_SYSTEME = "dd if=/dev/zero of=/dev/null bs=1 count=3000000";

// Chaque test a son projet : ils se jouent de front.
describe("le plafond de durée des gates", { concurrency: 8 }, () => {
  test("sans plafond déclaré, les gates disent ce qu'elles ont coûté et ne jugent pas", async (t) => {
    const { lignes } = await jouer(projet(t, {}));

    assert.equal(duPlafond(lignes).length, 1);
    assert.match(duPlafond(lignes)[0] ?? "", new RegExp(String.raw`^ok {4}durée des gates : \d+,\d s de processeur utilisateur \(aucun plafond déclaré\) — ${NON_COMPTES}$`));
  });

  test("sous le plafond déclaré, la durée est verte, rappelle le plafond, et dit ce qui n'est pas compté", async (t) => {
    const { lignes } = await jouer(projet(t, { binding: "- **Plafond des gates** : `600 s` de processeur utilisateur" }));

    assert.equal(duPlafond(lignes).length, 1);
    assert.match(duPlafond(lignes)[0] ?? "", new RegExp(String.raw`^ok {4}durée des gates : \d+,\d s de processeur utilisateur \(plafond : 600 s\) — ${NON_COMPTES}$`));
  });

  test("le plafond franchi rougit, et dit de combien", async (t) => {
    // Aucun passage de gates ne tient en un centième de seconde de processeur.
    const { lignes } = await jouer(projet(t, { binding: "- **Plafond des gates** : `0,01 s` de processeur utilisateur" }));

    // La ligne FAIL ne porte aucune mesure : le hook d'arrêt en tire l'empreinte
    // de l'échec, qui doit rester la même d'un passage au suivant.
    assert.ok(lignes.includes("FAIL  plafond des gates franchi : plus de 0,01 s de processeur utilisateur"), lignes.join("\n"));
    const detail = lignes.find((ligne) => ligne.startsWith("durée des gates : "));
    assert.match(detail ?? "", new RegExp(String.raw`^durée des gates : \d+,\d s de processeur utilisateur pour un plafond de 0,01 s — \d+,\d s de trop \(\+\d+ %\) — ${NON_COMPTES}$`));
    assert.equal(lignes.at(-2), "gates : ROUGE");
  });

  test("une suite qui grossit franchit le plafond : ce qu'elle calcule est compté", async (t) => {
    const { lignes } = await jouer(projet(t, { binding: "- **Plafond des gates** : `1,5 s` de processeur utilisateur", suite: CALCULE }));

    assert.ok(lignes.includes("FAIL  plafond des gates franchi : plus de 1,5 s de processeur utilisateur"), lignes.join("\n"));
    assert.ok(releve(lignes.find((ligne) => ligne.startsWith("durée des gates : ")) ?? "").utilisateur >= 2);
  });

  test("le temps système n'est pas compté : il gonfle sur un poste chargé sans que la suite ait grossi", async (t) => {
    // Un premier passage, sans plafond, dit ce que cette suite coûte ici ; le
    // second est jugé par un plafond posé entre son temps utilisateur et ce que
    // donnerait le système ajouté.
    const mesure = releve(duPlafond((await jouer(projet(t, { suite: APPELLE_LE_SYSTEME }))).lignes)[0] ?? "");
    assert.ok(mesure.systeme > mesure.utilisateur, `la suite d'essai devait surtout appeler le système : ${JSON.stringify(mesure)}`);
    const plafond = (mesure.utilisateur + mesure.systeme / 2).toFixed(1);

    const { lignes } = await jouer(projet(t, { binding: `- **Plafond des gates** : \`${plafond} s\` de processeur utilisateur`, suite: APPELLE_LE_SYSTEME }));

    const ligne = duPlafond(lignes)[0] ?? "";
    assert.match(ligne, /^ok {4}durée des gates : /);
    const { utilisateur, systeme } = releve(ligne);
    assert.ok(utilisateur + systeme > Number(plafond), `le système compté, ce passage aurait rougi : ${ligne}`);
  });

  test("l'horloge n'est pas comptée : une suite qui attend ne franchit pas le plafond", async (t) => {
    // Quatre secondes d'horloge pour un plafond de trois : c'est ce que fait une
    // machine chargée à une suite qui, elle, n'a pas grossi.
    const { lignes } = await jouer(projet(t, { binding: "- **Plafond des gates** : `3 s` de processeur utilisateur", suite: "sleep 4" }));

    const ligne = duPlafond(lignes)[0] ?? "";
    assert.match(ligne, /^ok {4}durée des gates : .*\(plafond : 3 s\)/);
    assert.ok(releve(ligne).horloge >= 4, ligne);
  });

  test("un plafond déclaré mais illisible rougit, au lieu de passer pour absent", async (t) => {
    const { lignes } = await jouer(projet(t, { binding: "- **Plafond des gates** : une dizaine de secondes" }));

    assert.ok(lignes.some((ligne) => ligne.startsWith("FAIL  plafond des gates illisible dans CLAUDE.md")), lignes.join("\n"));
  });
});
