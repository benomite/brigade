// La porte de confiance (#4421) sur le vrai client GitHub, contre un faux `gh` :
// le droit se lit par l'API des collaborateurs, une fois par auteur ; une
// lecture qui échoue ne rend jamais un auteur de confiance, et se repose.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ouvrirGitHub } from "../../src/github.ts";
import { creerConfiance } from "../../src/trust/trust.ts";
import { DEPOT, fauxGh } from "../outils.ts";

const PERMISSION = (login: string) => `repos/${DEPOT}/collaborators/${login}/permission`;

test("the collaborator permission read from GitHub decides, and a non-collaborator is not trusted", async (t) => {
  const gh = fauxGh(t);
  gh.repondre(`repos/${DEPOT}/collaborators/*`, { statut: 404, corps: { message: "Not Found" } });
  gh.repondre(PERMISSION("alice"), { corps: { permission: "write" } });
  gh.repondre(PERMISSION("bob"), { corps: { permission: "read" } });
  const github = ouvrirGitHub({ depot: DEPOT, bin: gh.bin });
  t.after(() => github.fermer());
  const c = creerConfiance({ chef: async () => "Benoit", permission: (login) => github.permissionSurLeDepot(login) });
  assert.equal(await c.isTrusted("alice"), true);
  assert.equal(await c.isTrusted("bob"), false);
  assert.equal(await c.isTrusted("stranger"), false);
  assert.equal(await c.isTrusted("benoit"), true, "the chef, whatever the case of the login");
  assert.equal(await c.isTrusted("GitHub-Actions[bot]"), true, "the project's robot, as `auteur-interne.ts` reads it");
  const lus = gh.appels().filter((args) => args.some((arg) => arg.includes("/collaborators/")));
  assert.equal(lus.length, 3, "alice, bob and stranger, each once: neither the chef nor the robot is looked up");
  assert.equal(await github.permissionSurLeDepot("stranger"), "none", "GitHub's 404 for a non-collaborator reads as no permission");
});

test("a permission that cannot be read makes the author untrusted, says so, and is asked again", async () => {
  const avertis: string[] = [];
  let appels = 0;
  const c = creerConfiance({
    chef: null,
    permission: async () => {
      appels++;
      if (appels === 1) throw new Error("HTTP 502");
      return "write";
    },
    avertir: (ligne) => avertis.push(ligne),
  });
  assert.equal(await c.isTrusted("alice"), false);
  assert.match(avertis.join("\n"), /alice.*HTTP 502/);
  assert.equal(await c.isTrusted("alice"), true, "the failure is not kept: the next question reads again");
  assert.equal(await c.isTrusted("alice"), true);
  assert.equal(appels, 2);
});

test("an empty login is never trusted, and a chef that cannot be resolved trusts no one by name", async () => {
  const c = creerConfiance({ chef: async () => null, permission: async () => "none" });
  assert.equal(await c.isTrusted(""), false);
  assert.equal(await c.isTrusted("benoit"), false);
});
