// Les identifiants de Claude dans une livraison : ce que la station reconnaît
// à leur nom ou à leur forme, sans jamais ouvrir ceux du compte.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { identifiantsLivres } from "../src/identifiants.ts";

// Un jeu d'essai fabriqué, et assemblé ici : la forme n'est écrite en clair
// nulle part dans ce dépôt, qui passe lui aussi par ce contrôle.
const jeton = (type: string, longueur = 90) => ["sk", "ant", `${type}01`, "A".repeat(longueur)].join("-");
const ACCES = jeton("oat");
const RENOUVELLEMENT = jeton("ort");
const CLE_STRUCTURE = ["claude", "Ai", "Oauth"].join("");
const structure = (acces: string) => JSON.stringify({ [CLE_STRUCTURE]: { accessToken: acces, refreshToken: "un-autre-jeton-fabrique-de-toutes-pieces", expiresAt: 1 } });

// Ce que `depot.ajouts` rend d'un commit qui ajoute un fichier.
const ajout = (chemin: string, contenu: string, message = "le travail du cook") =>
  [
    message,
    "",
    `diff --git a/${chemin} b/${chemin}`,
    "new file mode 100644",
    "index 0000000..1111111",
    "--- /dev/null",
    `+++ b/${chemin}`,
    "@@ -0,0 +1 @@",
    ...contenu.split("\n").map((ligne) => `+${ligne}`),
    "",
  ].join("\n");

describe("les identifiants de Claude dans une livraison", () => {
  test("une livraison ordinaire ne porte aucun signe", () => {
    assert.deepEqual(identifiantsLivres(ajout("travail.txt", "le travail du cook")), []);
    assert.deepEqual(identifiantsLivres(""), []);
  });

  test("un fichier nommé comme les identifiants est reconnu à son nom, où qu'il soit et quoi qu'il contienne", () => {
    assert.deepEqual(identifiantsLivres(ajout(".credentials.json", "{}")), ["name"]);
    assert.deepEqual(identifiantsLivres(ajout("sauvegarde/.claude/.credentials.json", "{}")), ["name"]);
    // Un chemin que git cite, parce qu'il n'est pas ASCII.
    assert.deepEqual(identifiantsLivres(ajout(".credentials.json", "{}").replace("+++ b/.credentials.json", '+++ "b/caf\\303\\251/.credentials.json"')), ["name"]);
  });

  test("un nom voisin n'est pas celui des identifiants, ni un fichier supprimé", () => {
    assert.deepEqual(identifiantsLivres(ajout("credentials.json", "{}")), []);
    assert.deepEqual(identifiantsLivres(ajout("config/.credentials.json.md", "{}")), []);
    assert.deepEqual(identifiantsLivres(ajout("docs/installer.md", "Les identifiants vivent dans `~/.claude/.credentials.json`.")), []);
    const suppression = ["retire un fichier", "", "diff --git a/.credentials.json b/.credentials.json", "deleted file mode 100644", "--- a/.credentials.json", "+++ /dev/null", "@@ -1 +0,0 @@", "-{}", ""].join("\n");
    assert.deepEqual(identifiantsLivres(suppression), []);
  });

  test("un jeton de Claude est reconnu à sa forme, sous n'importe quel nom de fichier", () => {
    assert.deepEqual(identifiantsLivres(ajout("notes.txt", `à garder : ${ACCES}`)), ["shape"]);
    assert.deepEqual(identifiantsLivres(ajout("notes.txt", RENOUVELLEMENT)), ["shape"]);
    assert.deepEqual(identifiantsLivres(ajout("config.env", `ANTHROPIC_API_KEY=${jeton("api")}`)), ["shape"]);
  });

  test("un jeton écrit dans un message de commit est reconnu aussi", () => {
    assert.deepEqual(identifiantsLivres(ajout("travail.txt", "le travail du cook", `au cas où : ${ACCES}`)), ["shape"]);
  });

  test("un jeton écrit puis retiré deux commits plus loin est encore dans ce qui serait poussé", () => {
    const retrait = ajout("notes.txt", "").replace(/^\+$/m, `-${ACCES}`);
    assert.deepEqual(identifiantsLivres(retrait), ["shape"]);
  });

  test("la structure du fichier d'identifiants est reconnue, même si le jeton n'a pas la forme connue", () => {
    const inconnu = "un-jeton-d-une-forme-que-personne-ne-connait-encore";
    assert.deepEqual(identifiantsLivres(ajout("sauvegarde.json", structure(inconnu))), ["shape"]);
    // Mise en page sur plusieurs lignes, chacune précédée du `+` du patch.
    assert.deepEqual(identifiantsLivres(ajout("sauvegarde.json", JSON.stringify(JSON.parse(structure(inconnu)), null, 2))), ["shape"]);
    // Citée dans une chaîne JSON : les guillemets y sont échappés.
    assert.deepEqual(identifiantsLivres(ajout("flux.jsonl", JSON.stringify({ sortie: structure(inconnu) }))), ["shape"]);
  });

  test("le nom et la forme ensemble sont dits tous les deux, une fois chacun", () => {
    const tout = ajout(".credentials.json", structure(ACCES)) + ajout("copie.txt", ACCES);
    assert.deepEqual(identifiantsLivres(tout), ["name", "shape"]);
  });

  test("parler des identifiants n'est pas les porter : un préfixe, un exemple tronqué, une structure sans valeur passent", () => {
    for (const anodin of [
      `Un jeton d'accès commence par \`${jeton("oat", 0)}\`.`,
      `Exemple : ${jeton("oat", 39)}`,
      `${jeton("oat", 0)}<le-jeton-que-claude-setup-token-imprime-une-seule-fois>`,
      `const cle = "${CLE_STRUCTURE}";`,
      `{"${CLE_STRUCTURE}":{"accessToken":"<jeton>"}}`,
      `type Identifiants = { ${CLE_STRUCTURE}: { accessToken: string; refreshToken: string } };`,
      '{"accessToken":"un-jeton-quelconque-d-un-autre-service-que-claude"}',
    ]) {
      assert.deepEqual(identifiantsLivres(ajout("docs/notes.md", anodin)), [], anodin);
    }
  });

  test("le contrôle ne lit rien : il n'importe aucun module, et ne connaît que le texte qu'on lui donne", () => {
    const source = readFileSync(join(import.meta.dirname, "../src/identifiants.ts"), "utf8");
    assert.equal(/\bimport\b|\brequire\b|process\.|\bHOME\b/.test(source.replace(/^\s*\/\/.*$/gm, "")), false);
    assert.equal(identifiantsLivres.length, 1);
  });
});
