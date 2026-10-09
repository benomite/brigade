// Les identifiants de Claude dans une livraison : ce que la station reconnaît
// à leur nom ou à leur forme, sans jamais ouvrir ceux du compte.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { identifiantsLivres, JETON_MASQUE, masquerIdentifiants } from "../src/identifiants.ts";

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
    ...message.split("\n").map((ligne) => ` ${ligne}`),
    "",
    `diff --git a/${chemin} b/${chemin}`,
    "new file mode 100644",
    "index 0000000..1111111",
    "--- /dev/null",
    `+++ b/${chemin}`,
    `@@ -0,0 +1,${contenu.split("\n").length} @@`,
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
    // Un blanc dans le chemin : git termine la ligne par une tabulation.
    assert.deepEqual(identifiantsLivres(ajout(".credentials.json", "{}").replace("+++ b/.credentials.json", "+++ b/my backup/.credentials.json\t")), ["name"]);
    // Un chemin que git cite, parce qu'il n'est pas ASCII.
    assert.deepEqual(identifiantsLivres(ajout(".credentials.json", "{}").replace("+++ b/.credentials.json", '+++ "b/caf\\303\\251/.credentials.json"')), ["name"]);
  });

  test("un nom voisin n'est pas celui des identifiants, ni un fichier supprimé", () => {
    assert.deepEqual(identifiantsLivres(ajout("credentials.json", "{}")), []);
    assert.deepEqual(identifiantsLivres(ajout("config/.credentials.json.md", "{}")), []);
    assert.deepEqual(identifiantsLivres(ajout("docs/installer.md", "Les identifiants vivent dans `~/.claude/.credentials.json`.")), []);
    const suppression = [" retire un fichier", "", "diff --git a/.credentials.json b/.credentials.json", "deleted file mode 100644", "--- a/.credentials.json", "+++ /dev/null", "@@ -1 +0,0 @@", "-{}", ""].join("\n");
    assert.deepEqual(identifiantsLivres(suppression), []);
  });

  test("un fichier du projet nommé comme les identifiants, et modifié, n'est pas reconnu à son nom : il existait", () => {
    const modification = [" règle le service", "", "diff --git a/.credentials.json b/.credentials.json", "index 1111111..2222222 100644", "--- a/.credentials.json", "+++ b/.credentials.json", "@@ -1 +1 @@", "-{}", '+{"port":1}', ""].join("\n");
    assert.deepEqual(identifiantsLivres(modification), []);
    // Mais ce qu'on y ajoute est lu comme partout.
    assert.deepEqual(identifiantsLivres(modification.replace('+{"port":1}', `+${ACCES}`)), ["shape"]);
  });

  test("ce que la branche retire ou laisse en place n'est pas ce qu'elle ajoute : un jeton déjà là, tronqué ou voisin d'une retouche, passe", () => {
    const patch = (...lignes: string[]) => [" retouche l'exemple", "", "diff --git a/exemple.md b/exemple.md", "index 1111111..2222222 100644", "--- a/exemple.md", "+++ b/exemple.md", ...lignes, ""].join("\n");
    // Tronqué : le remède prescrit.
    assert.deepEqual(identifiantsLivres(patch("@@ -1,3 +1,3 @@", " avant", `-un exemple : ${ACCES}`, `+un exemple : ${jeton("oat", 20)}…`, " après")), []);
    // En contexte d'une retouche voisine — et cité par l'en-tête du bloc.
    assert.deepEqual(identifiantsLivres(patch(`@@ -1,3 +1,3 @@ ${ACCES}`, "-avant", "+avant, retouché", ` un exemple : ${ACCES}`, " après")), []);
    // Sans fin de ligne, le marqueur de git ne décale pas le compte du bloc.
    assert.deepEqual(identifiantsLivres(patch("@@ -1 +1 @@", `-${ACCES}`, "\\ No newline at end of file", "+tronqué", "\\ No newline at end of file")), []);
    // Le bloc fini, ce qui suit est lu de nouveau : le message du commit suivant.
    assert.deepEqual(identifiantsLivres(patch("@@ -1 +1 @@", "-avant", "+après") + ` au cas où : ${ACCES}\n`), ["shape"]);
  });

  test("un message de commit qui se déguise en patch ne cache rien : ses lignes sont en retrait, elles n'ouvrent aucun bloc", () => {
    assert.deepEqual(identifiantsLivres(ajout("travail.txt", "le travail du cook", `le travail\n\ndiff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1,2 +0,0 @@\n-${ACCES}\n ${ACCES}`)), ["shape"]);
  });

  test("un jeton de Claude est reconnu à sa forme, sous n'importe quel nom de fichier", () => {
    assert.deepEqual(identifiantsLivres(ajout("notes.txt", `à garder : ${ACCES}`)), ["shape"]);
    assert.deepEqual(identifiantsLivres(ajout("notes.txt", RENOUVELLEMENT)), ["shape"]);
    assert.deepEqual(identifiantsLivres(ajout("config.env", `ANTHROPIC_API_KEY=${jeton("api")}`)), ["shape"]);
  });

  test("un jeton écrit dans un message de commit est reconnu aussi", () => {
    assert.deepEqual(identifiantsLivres(ajout("travail.txt", "le travail du cook", `au cas où : ${ACCES}`)), ["shape"]);
  });

  test("un jeton écrit puis retiré deux commits plus loin est encore dans ce qui serait poussé : le commit qui l'ajoute en fait partie", () => {
    const retrait = [" retire les notes", "", "diff --git a/notes.txt b/notes.txt", "deleted file mode 100644", "--- a/notes.txt", "+++ /dev/null", "@@ -1 +0,0 @@", `-${ACCES}`, ""].join("\n");
    assert.deepEqual(identifiantsLivres(retrait + ajout("notes.txt", ACCES)), ["shape"]);
    assert.deepEqual(identifiantsLivres(retrait), []);
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

describe("la forme des identifiants de Claude dans un texte gardé ou publié", () => {
  test("un texte sans jeton est rendu tel quel", () => {
    const texte = "J'ai ajouté `travail.txt`, et lu `.credentials.json` sans rien en citer.";
    assert.deepEqual(masquerIdentifiants(texte), { texte, masques: 0 });
    assert.deepEqual(masquerIdentifiants(""), { texte: "", masques: 0 });
  });

  test("chaque jeton laisse sa place, et seulement lui : le reste du texte se lit comme avant", () => {
    const texte = `Deux jetons : ${ACCES}, puis « ${RENOUVELLEMENT} » — et la suite du compte-rendu.\nUne clé d'API : ${jeton("api")}.`;
    assert.deepEqual(masquerIdentifiants(texte), {
      texte: `Deux jetons : ${JETON_MASQUE}, puis « ${JETON_MASQUE} » — et la suite du compte-rendu.\nUne clé d'API : ${JETON_MASQUE}.`,
      masques: 3,
    });
  });

  test("un exemple tronqué n'est pas un jeton : il reste lisible", () => {
    const texte = `Un exemple : ${jeton("oat", 39)}, ou sk-ant-oat01-<jeton>.`;
    assert.deepEqual(masquerIdentifiants(texte), { texte, masques: 0 });
  });

  test("la structure du fichier perd ses deux jetons, quelle que soit leur forme, et garde le reste", () => {
    const fichier = JSON.stringify({ [CLE_STRUCTURE]: { accessToken: "un-jeton-d-une-forme-inconnue", refreshToken: "un-autre-jeton-fabrique-de-toutes-pieces", expiresAt: 1 }, autre: "une-valeur-longue-qui-n-est-pas-un-jeton" });
    assert.deepEqual(masquerIdentifiants(fichier), {
      texte: JSON.stringify({ [CLE_STRUCTURE]: { accessToken: JETON_MASQUE, refreshToken: JETON_MASQUE, expiresAt: 1 }, autre: "une-valeur-longue-qui-n-est-pas-un-jeton" }),
      masques: 2,
    });
    // Un jeton `sk-ant-…` dans la structure ne se compte qu'une fois.
    assert.equal(masquerIdentifiants(structure(ACCES)).masques, 2);
    assert.equal(masquerIdentifiants(structure(ACCES)).texte.includes(ACCES), false);
  });

  test("une ligne de flux JSON reste une ligne de flux JSON, guillemets échappés compris", () => {
    const ligne = JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: JSON.stringify({ sortie: structure(ACCES) }) }] } });
    const masquee = masquerIdentifiants(ligne);
    assert.equal(masquee.masques, 2);
    const lue = JSON.parse(masquee.texte).message.content[0].content;
    assert.equal(JSON.parse(JSON.parse(lue).sortie)[CLE_STRUCTURE].refreshToken, JETON_MASQUE);
    assert.equal(masquee.texte.includes("fabrique"), false);
  });

  test("un texte déjà masqué ne l'est pas une seconde fois", () => {
    const { texte } = masquerIdentifiants(`${ACCES} et ${structure("un-jeton-d-une-forme-inconnue")}`);
    assert.deepEqual(masquerIdentifiants(texte), { texte, masques: 0 });
  });
});
