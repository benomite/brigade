import assert from "node:assert/strict";
import { test } from "node:test";
import { BAIL_DU_MANAGER_MS, corpsDePriseDuManager, corpsDeTravailFait, estUnePriseDuManager, finirLeTravail, prendreLeTravail, tenantDuTravail, type GitHubDuTravail } from "../../src/github-etat/prise-du-manager.ts";

const NUMERO = 42;
const ETAT = "0123456789abcdef";
const DEPART = Date.parse("2026-11-06T10:00:00Z");

// Une issue sur GitHub, que plusieurs stations lisent et écrivent : chaque
// commentaire reçoit l'instant de l'horloge, que le test avance — et que le
// commentaire d'une station avance d'une seconde.
function issueSurGitHub() {
  let horloge = DEPART;
  const commentaires: Array<{ body: string; association: string; createdAt: string }> = [];
  const github: GitHubDuTravail = {
    async commentaires() {
      await Promise.resolve();
      return commentaires.map((commentaire) => ({ ...commentaire }));
    },
    async commenter(_numero, corps) {
      await Promise.resolve();
      commentaires.push({ body: corps, association: "OWNER", createdAt: new Date(horloge).toISOString() });
      horloge += 1_000;
    },
    async remplacerCommentaire(_numero, ancien, nouveau) {
      const lu = commentaires.find((commentaire) => commentaire.body === ancien);
      if (lu === undefined) return false;
      lu.body = nouveau;
      return true;
    },
  };
  const maintenant = () => new Date(horloge);
  return { github, commentaires, maintenant, avancer: (ms: number) => (horloge += ms), contexte: (station: string) => ({ github, station, maintenant }) };
}

const prise = (station: string, createdAt: string, etat = ETAT, association = "OWNER") => ({ body: corpsDePriseDuManager(station, etat, "a1b2c3d4"), association, createdAt });

test("la plus ancienne prise d'un état l'emporte ; deux prises de la même seconde se départagent par leur rang", () => {
  const instant = new Date(DEPART).toISOString();
  assert.equal(tenantDuTravail([prise("box/claude", "2026-11-06T10:00:01Z"), prise("mac/claude", instant)], ETAT, DEPART)?.station, "mac/claude");
  assert.equal(tenantDuTravail([prise("box/claude", instant), prise("mac/claude", instant)], ETAT, DEPART)?.station, "box/claude");
});

test("une prise ne compte que pour son état, et que d'un compte du dépôt", () => {
  const instant = new Date(DEPART).toISOString();
  assert.equal(tenantDuTravail([prise("box/claude", instant, "fedcba9876543210")], ETAT, DEPART), null);
  assert.equal(tenantDuTravail([prise("box/claude", instant, ETAT, "NONE")], ETAT, DEPART), null);
});

test("une prise dont le travail n'est pas dit fait périme ; la suivante, vive, l'emporte", () => {
  const vieille = prise("box/claude", new Date(DEPART - BAIL_DU_MANAGER_MS).toISOString());
  assert.equal(tenantDuTravail([vieille], ETAT, DEPART), null);
  assert.equal(tenantDuTravail([vieille, prise("mac/claude", new Date(DEPART - 1_000).toISOString())], ETAT, DEPART)?.station, "mac/claude");
});

test("un travail dit fait tient pour toujours", () => {
  const fait = { body: corpsDeTravailFait("box/claude", ETAT, "a1b2c3d4"), association: "OWNER", createdAt: new Date(DEPART).toISOString() };
  const tenant = tenantDuTravail([fait], ETAT, DEPART + 10 * BAIL_DU_MANAGER_MS);
  assert.deepEqual({ station: tenant?.station, fait: tenant?.fait }, { station: "box/claude", fait: true });
  assert.ok(estUnePriseDuManager(fait.body));
  assert.ok(!estUnePriseDuManager("<!-- brigade:prise station=box/claude -->\nTaken by station `box/claude`."));
});

test("deux stations prennent le même état en même temps : une seule le tient, et les deux le lisent", async () => {
  const issue = issueSurGitHub();
  const [box, mac] = await Promise.all([prendreLeTravail(NUMERO, ETAT, issue.contexte("box/claude")), prendreLeTravail(NUMERO, ETAT, issue.contexte("mac/claude"))]);

  assert.equal([box, mac].filter((resultat) => resultat.prise).length, 1);
  assert.equal(box.tenant?.station, mac.tenant?.station);
});

test("un travail tenu par une autre station n'est pas repris, et rien n'est écrit", async () => {
  const issue = issueSurGitHub();
  await prendreLeTravail(NUMERO, ETAT, issue.contexte("box/claude"));
  const mac = await prendreLeTravail(NUMERO, ETAT, issue.contexte("mac/claude"));

  assert.deepEqual({ prise: mac.prise, tenant: mac.tenant?.station }, { prise: false, tenant: "box/claude" });
  assert.equal(issue.commentaires.length, 1);
});

test("dit fait, le travail reste à sa station ; non dit, il passe à une autre une fois la prise périmée", async () => {
  const issue = issueSurGitHub();
  const box = await prendreLeTravail(NUMERO, ETAT, issue.contexte("box/claude"));
  issue.avancer(BAIL_DU_MANAGER_MS);
  const mac = await prendreLeTravail(NUMERO, ETAT, issue.contexte("mac/claude"));
  assert.deepEqual({ prise: mac.prise, tenant: mac.tenant?.station }, { prise: true, tenant: "mac/claude" });

  // Une autre issue, dont la station dit le travail fait : il ne périme plus.
  const autre = issueSurGitHub();
  const tenu = await prendreLeTravail(NUMERO, ETAT, autre.contexte("box/claude"));
  assert.ok(tenu.tenant && (await finirLeTravail(NUMERO, tenu.tenant, autre.github)));
  autre.avancer(10 * BAIL_DU_MANAGER_MS);
  const tard = await prendreLeTravail(NUMERO, ETAT, autre.contexte("mac/claude"));
  assert.deepEqual({ prise: tard.prise, tenant: tard.tenant?.station, fait: tard.tenant?.fait }, { prise: false, tenant: "box/claude", fait: true });
  assert.equal(autre.commentaires.length, 1);
  assert.ok(box.prise);
});
