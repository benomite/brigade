import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

// #3795: run 44098849686 of publier-app did not publish app-v1.0.282 (its `windows` job failed).
// The fix's run must publish it: the release exists on the repository's releases page.
const depot = process.env.GITHUB_REPOSITORY ?? "benomite/brigade";
const tag = "app-v1.0.282";

test(`the release ${tag} is published on the repository's releases page (#3795)`, () => {
  const r = spawnSync("gh", ["api", `repos/${depot}/releases/tags/${tag}`, "--jq", "{draft: .draft, assets: [.assets[].name]}"], { encoding: "utf8" });
  assert.equal(r.status, 0, `${tag} has no release on ${depot}: ${r.stderr || r.error}`);
  const release = JSON.parse(r.stdout) as { draft: boolean; assets: string[] };
  assert.equal(release.draft, false, `${tag} is still a draft`);
  assert.ok(release.assets.some((a) => /windows-x64-setup\.exe$/.test(a)), `${tag} has no Windows installer: ${release.assets}`);
  assert.ok(release.assets.some((a) => /mac-arm64\.dmg$/.test(a)), `${tag} has no Mac package: ${release.assets}`);
});
