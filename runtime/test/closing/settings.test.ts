// Ce que la passe qui écrit décide sans rien lancer : ses réglages, ce qu'elle
// propose à son closer, et ce qu'elle relit de lui.
import assert from "node:assert/strict";
import { test } from "node:test";
import { candidats, proposer, restants } from "../../src/closing/candidates.ts";
import { consigneDuCloser, laisses, motifsDuCloser } from "../../src/closing/brief.ts";
import { configFermeture } from "../../src/closing/settings.ts";
import { ConfigInvalide } from "../../src/runtime.ts";
import { PROJET } from "./kitchen.ts";

const textes = (fichiers: Record<string, string | null>) => ({ textes: Object.entries(fichiers).flatMap(([chemin, texte]) => (texte === null ? [] : [{ chemin, texte }])) });

test("sans calibrage, le projet n'a pas de closer : aucun défaut ne lui en donne un — ses seuils et ses plafonds, eux, en ont", () => {
  assert.deepEqual(configFermeture({}), { calibration: null, cooksBelow: 1, tokens: 500_000, removedLines: 500 });
  assert.deepEqual(configFermeture({ BRIGADE_CLOSING_MODEL: "opus", BRIGADE_CLOSING_EFFORT: "high", BRIGADE_CLOSING_COOKS: "3", BRIGADE_CLOSING_MAX_TOKENS: "200000", BRIGADE_CLOSING_MAX_REMOVED_LINES: "120" }), {
    calibration: { model: "opus", effort: "high" },
    cooksBelow: 3,
    tokens: 200_000,
    removedLines: 120,
  });
});

test("un closer à moitié réglé, ou un plafond illisible, est un refus de démarrer — jamais un repli silencieux", () => {
  assert.throws(() => configFermeture({ BRIGADE_CLOSING_MODEL: "opus" }), (erreur) => erreur instanceof ConfigInvalide && /BRIGADE_CLOSING_EFFORT is not set/.test(erreur.message));
  assert.throws(() => configFermeture({ BRIGADE_CLOSING_EFFORT: "high" }), (erreur) => erreur instanceof ConfigInvalide && /BRIGADE_CLOSING_MODEL is not set/.test(erreur.message));
  assert.throws(() => configFermeture({ BRIGADE_CLOSING_MODEL: "gpt", BRIGADE_CLOSING_EFFORT: "high" }), /BRIGADE_CLOSING_MODEL invalid: “gpt” — expected opus, sonnet or haiku/);
  for (const variable of ["BRIGADE_CLOSING_COOKS", "BRIGADE_CLOSING_MAX_TOKENS", "BRIGADE_CLOSING_MAX_REMOVED_LINES"]) {
    for (const valeur of ["0", "-1", "1.5", "beaucoup"]) assert.throws(() => configFermeture({ [variable]: valeur }), ConfigInvalide, `${variable}=${valeur}`);
  }
});

test("la passe propose ce que l'observation repère, sous un nom court, et tient les fichiers qu'il faut écrire pour le retirer — tests et doc qui le nomment compris", () => {
  const tous = candidats(textes({ ...PROJET, "test/outils.test.ts": 'import { oublie } from "../src/tenu/outils.ts";\noublie();\n', "docs/outils.md": "`inutile` rend deux.\n" }));
  assert.deepEqual(
    tous.map(({ id, fichiers }) => [id, fichiers]),
    [
      ["D1", ["src/libre/a.ts", "src/libre/b.ts"]],
      ["M1", ["src/libre/outils.ts", "docs/outils.md"]],
      ["M2", ["src/tenu/outils.ts", "test/outils.test.ts"]],
    ],
  );
  const { proposes, ecartes, zone } = proposer(tous, []);
  assert.deepEqual([proposes.length, ecartes], [3, []]);
  assert.deepEqual(zone, ["docs/outils.md", "src/libre/a.ts", "src/libre/b.ts", "src/libre/outils.ts", "src/tenu/outils.ts", "test/outils.test.ts"]);
});

test("un candidat dont un seul fichier est tenu par un cook n'est pas proposé, et dit par qui ; au-delà du plafond de candidats, le reste est écarté en le disant", () => {
  const tous = candidats(textes({ ...PROJET, "test/outils.test.ts": 'import { inutile } from "../src/libre/outils.ts";\ninutile();\n' }));
  // Le test qui nomme `inutile` est dans la zone du ticket #4 ; le cook du #5 n'en déclare aucune.
  const tenu = proposer(tous, [{ ticket: 4, zone: ["test"] }]);
  assert.deepEqual(tenu.proposes.map(({ id }) => id), ["D1", "M2"]);
  assert.deepEqual(tenu.ecartes.map(({ id, reason, before }) => [id, reason, before]), [["M1", "`test/outils.test.ts` is held by ticket #4 (zone `test`)", true]]);
  const tout = proposer(tous, [{ ticket: 5, zone: null }]);
  assert.deepEqual([tout.proposes, tout.zone], [[], []]);
  assert.equal(tout.ecartes[0]?.reason, "`src/libre/a.ts` is held by ticket #5");

  const borne = proposer(tous, [], 1);
  assert.deepEqual(borne.proposes.map(({ id }) => id), ["D1"]);
  assert.deepEqual(borne.ecartes.map(({ id, reason }) => [id, reason]), [["M1", "beyond the 1 candidates of one pass"], ["M2", "beyond the 1 candidates of one pass"]]);
});

test("ce qui reste se lit sur la branche de la passe, pas sur la parole du closer : un doublon déplacé de trois lignes est toujours là", () => {
  const tous = candidats(textes(PROJET));
  const suite = PROJET["src/libre/a.ts"] ?? "";
  // M1 retiré ; le doublon a glissé dans son fichier ; M2 intact.
  const apres = textes({ ...PROJET, "src/libre/outils.ts": "export function vivant() { return 1; }\n", "src/libre/a.ts": `// en tête\n\n\n${suite}` });
  const restes = restants(tous, apres);
  assert.deepEqual(restes.map(({ id }) => id), ["D1", "M2"]);
  // Le closer dit avoir laissé D1 — et M1, qu'il a pourtant retiré : dit laissé, il le reste.
  const motifs = motifsDuCloser("Voilà.\n- LAISSÉ D1 : deux modules qui évoluent à part\nLAISSE `M1`: finalement non\n> laissé d2 : brouillon\nLAISSÉ D2 : n'existe pas\n");
  assert.deepEqual([...motifs], [["D1", "deux modules qui évoluent à part"], ["M1", "finalement non"], ["D2", "n'existe pas"]]);
  assert.deepEqual(
    laisses(tous, restes, motifs).map(({ id, reason, before }) => [id, reason, before]),
    [
      ["D1", "deux modules qui évoluent à part", false],
      ["M1", "finalement non", false],
      ["M2", null, false],
    ],
  );
});

test("la consigne du closer nomme ses candidats, les seuls fichiers qu'il peut écrire, son plafond de retraits, et la ligne par laquelle il dit ce qu'il laisse", () => {
  const { proposes, zone } = proposer(candidats(textes(PROJET)), []);
  const consigne = consigneDuCloser({ depot: "acme/brigade", base: "v2", candidats: proposes, zone, retraits: 120 });
  assert.match(consigne, /^Tu es le closer de la brigade : tu ranges le dépôt acme\/brigade, hors de tout ticket\./);
  assert.match(consigne, /\n {3}- D1 — 8 identical lines of code: `src\/libre\/a\.ts:1-8` = `src\/libre\/b\.ts:1-8`\n {3}- M1 — export `inutile` of `src\/libre\/outils\.ts:2` — referenced nowhere\n/);
  assert.match(consigne, /\n {3}- `src\/libre\/a\.ts`\n {3}- `src\/libre\/b\.ts`\n {3}- `src\/libre\/outils\.ts`\n {3}- `src\/tenu\/outils\.ts`\n5\. Tu ne retires pas plus de 120 lignes en tout/);
  assert.match(consigne, /`LAISSÉ <nom du candidat> : <pourquoi tu n'es pas sûr>`/);
  assert.match(consigne, /Tu ne pousses rien, tu n'ouvres pas de PR et tu ne merges jamais/);
});
