// Les réglages d'un cook sans bac à sable (#4391) : mêmes refus que le bac à sable, sans le noyau.
import assert from "node:assert/strict";
import { test } from "node:test";
import { LECTURES_INTERDITES, enPosix, reglagesSansBacASable } from "../../src/bac-a-sable/configuration.ts";
import { dansLeModeRestreint } from "../../src/bac-a-sable/local.ts";
import { reglesDuProjet } from "../../src/reseau.ts";

const cook = { worktree: "/Users/chef/wt/12", caches: ["/Users/chef/.cache/x"], hotes: reglesDuProjet(["registry.npmjs.org"]), home: "/Users/chef" };

test("chaque lecture interdite est refusée en lecture et en écriture, sous le compte du chef", () => {
  const { deny } = reglagesSansBacASable(cook).permissions;
  for (const relatif of LECTURES_INTERDITES) {
    assert.ok(deny.includes(`Read(//Users/chef/${relatif})`), relatif);
    assert.ok(deny.includes(`Edit(//Users/chef/${relatif}/**)`), relatif);
  }
});

test("WebFetch n'est permis que pour les hôtes de la liste, Edit que dans le worktree et les caches", () => {
  const { allow } = reglagesSansBacASable(cook).permissions;
  assert.ok(allow.includes("WebFetch(domain:registry.npmjs.org)"));
  assert.ok(!allow.some((regle) => regle.includes("evil.example.com")));
  assert.ok(!allow.includes("WebFetch") && !allow.includes("WebSearch"));
  assert.ok(allow.includes("Edit(//Users/chef/wt/12/**)") && allow.includes("Edit(//Users/chef/.cache/x/**)"));
  assert.ok(allow.includes("Bash"));
});

test("un hôte borné à un port n'ouvre pas WebFetch, qui ouvre tous les ports", () => {
  const { allow } = reglagesSansBacASable({ ...cook, hotes: [{ hote: "db.example.com", sousDomaines: false, port: 5432, origine: "project" }] }).permissions;
  assert.ok(!allow.some((regle) => regle.includes("db.example.com")));
});

test("un chemin de Windows se pose en POSIX absolu", () => {
  assert.equal(enPosix("C:\\Users\\chef"), "/C:/Users/chef");
  assert.equal(enPosix("/Users/chef"), "/Users/chef");
  const { deny } = reglagesSansBacASable({ ...cook, home: "C:\\Users\\chef", worktree: "C:\\Users\\chef\\wt\\12", caches: [] }).permissions;
  assert.ok(deny.includes("Read(//C:/Users/chef/.ssh)"));
});

test("le mode restreint remplace bypassPermissions par dontAsk et pose --settings", () => {
  const args = dansLeModeRestreint(["-p", "x", "--permission-mode", "bypassPermissions", "--disallowedTools", "y"], cook);
  assert.deepEqual(args.slice(0, 5), ["-p", "x", "--permission-mode", "dontAsk", "--settings"]);
  assert.deepEqual(args.slice(6), ["--disallowedTools", "y"]);
  assert.throws(() => dansLeModeRestreint(["-p", "x"], cook));
});
