// Test d'acceptation gelé (#4152). Critère 2 : app-v1.0.365 est publiée, et sa release porte la construction du Mac.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const DEPOT = "benomite/brigade";

test("the app-v1.0.365 release is published and carries the mac build", () => {
  const sortie = execFileSync("gh", ["release", "view", "app-v1.0.365", "--repo", DEPOT, "--json", "isDraft,assets"], { encoding: "utf8" });
  const release = JSON.parse(sortie) as { isDraft: boolean; assets: { name: string }[] };
  const noms = release.assets.map((asset) => asset.name);
  assert.equal(release.isDraft, false, "the release is still a draft");
  assert.ok(noms.includes("Brigade-1.0.365-arm64.dmg"), `no .dmg in ${noms.join(", ")}`);
  assert.ok(noms.includes("latest-mac.yml"), `no latest-mac.yml in ${noms.join(", ")}`);
});
