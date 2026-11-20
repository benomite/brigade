// Le disjoncteur de la station qui sert le projet (#3658) : « the kitchen is
// resumed » ne se dit que de l'issue de cette station, quand son disjoncteur est
// fermé.
import assert from "node:assert/strict";
import { test } from "node:test";
import { corpsDeLIssue, LABEL_DU_DISJONCTEUR, marque, publierLeDisjoncteur, type ClientDuDisjoncteur, type Disjoncteur } from "../../src/breaker-issue.ts";

const PROJET = "brigade";
const BOX = "box/claude";
const MAC = "mac/claude";
const OUVERTURE = "2026-11-15T19:10:00.000Z";
const A = (hhmmss: string) => `2026-11-15T${hhmmss}.000Z`;

const OUVERT: Extract<Disjoncteur, { ouvert: true }> = { ouvert: true, depuis: OUVERTURE, ticket: 3644, code: 1, erreur: null, echecs: [], seuil: 3 };
const FERME: Disjoncteur = { ouvert: false, reprisLe: null };

// GitHub tel que le disjoncteur le voit : une issue ouverte par la box, et ce qu'on y écrit.
function githubAvecUneIssueDe(station: string | null) {
  const gestes: string[] = [];
  let ouverte = true;
  const corps = corpsDeLIssue(PROJET, OUVERT, station);
  const client: ClientDuDisjoncteur = {
    async ouvertesAuLabel(label) {
      return ouverte && label === LABEL_DU_DISJONCTEUR ? [{ numero: 3644, corps }] : [];
    },
    async assurerLabel() {},
    async creer() {
      gestes.push("creer");
      return 1;
    },
    async commenter(numero, texte) {
      gestes.push(`commenter #${numero}: ${texte}`);
    },
    async fermer(numero) {
      gestes.push(`fermer #${numero}`);
      ouverte = false;
    },
  };
  return { client, gestes, corps };
}

test("le disjoncteur d'ici est fermé, celui de la station qui sert le projet est ouvert : aucun commentaire « resumed », l'issue reste ouverte", async () => {
  const github = githubAvecUneIssueDe(BOX);
  assert.match(github.corps, new RegExp(`brigade:breaker-station name=${BOX}`));
  assert.ok(github.corps.includes(marque(PROJET)));

  const numero = await publierLeDisjoncteur(github.client, PROJET, FERME, { station: MAC });
  assert.equal(numero, null);
  assert.deepEqual(github.gestes, []);
});

test("le disjoncteur de la station qui sert le projet est fermé : le commentaire « resumed » est écrit, puis l'issue se ferme", async () => {
  const github = githubAvecUneIssueDe(BOX);
  assert.match(github.corps, /^<!-- brigade:breaker-station name=box\/claude -->$/m);
  await publierLeDisjoncteur(github.client, PROJET, { ouvert: false, reprisLe: A("20:21:00") }, { station: BOX });
  assert.equal(github.gestes.length, 2);
  assert.match(github.gestes[0] ?? "", /^commenter #3644: The `brigade` kitchen is resumed \(2026-11-15T20:21:00.000Z\): its breaker is closed/);
  assert.equal(github.gestes[1], "fermer #3644");

  // Une issue d'avant le repère de station est reprise par toute station, comme avant.
  const ancienne = githubAvecUneIssueDe(null);
  assert.doesNotMatch(ancienne.corps, /brigade:breaker-station/);
  await publierLeDisjoncteur(ancienne.client, PROJET, FERME, { station: MAC });
  assert.equal(ancienne.gestes.length, 2);
});
