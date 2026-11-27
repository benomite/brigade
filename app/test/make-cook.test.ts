// "Make this computer cook" (#4744): the offer on a computer with no station, its command, the move of the embedded
// station's projects without their CLONE= paths.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { installCommand, offerToMakeCook, projectsToMove } from "../src/make-cook.ts";
import { readProjects } from "../../runtime/src/kitchen/projects.ts";

const EMBEDDED = "# the embedded station\nbrigade benomite/brigade main PLACES=2 CLONE=/Users/chef/code/brigade\nsite benomite/site develop CLONE=/Users/chef/My Site\nplain acme/plain main\n";

describe("make this computer cook", () => {
  test("with no station, the offer carries the darwin-arm64 archive and install.sh", () => {
    const offer = offerToMakeCook({ isStation: () => false, embeddedProjects: () => undefined, keepMoved: () => "/tmp/x" });
    assert.ok(offer.offered);
    assert.match(offer.command, /darwin-arm64\[\.\]tar\[\.\]gz/);
    // One archive only: the release holds them all, `tar -xzf` takes the single name picked.
    assert.match(offer.command, /\| sort \| last'/);
    assert.match(offer.command, /tar -xzf "\$archive"/);
    assert.match(offer.command, /sudo (BRIGADE_PROJECTS_FILE='[^']*' )?\.\/install\.sh/);
  });

  test("with a station installed, no offer", () => {
    assert.deepEqual(offerToMakeCook({ isStation: () => true, embeddedProjects: () => EMBEDDED, keepMoved: () => "/tmp/x" }), { offered: false });
  });

  test("the moved lines keep names, repositories, bases and places, and lose CLONE=", () => {
    const moved = projectsToMove(EMBEDDED);
    assert.ok(!moved.includes("CLONE="));
    const before = readProjects(EMBEDDED, "/s");
    const after = readProjects(moved, "/s");
    assert.deepEqual(after.map(({ name, repo, base, places }) => ({ name, repo, base, places })), before.map(({ name, repo, base, places }) => ({ name, repo, base, places })));
    assert.equal(after.length, 3);
  });

  test("the embedded projects reach the install through a file named in the command", () => {
    let kept = "";
    const offer = offerToMakeCook({ isStation: () => false, embeddedProjects: () => EMBEDDED, keepMoved: (text) => ((kept = text), "/tmp/p/projects") });
    assert.ok(offer.offered && offer.command.includes("BRIGADE_PROJECTS_FILE='/tmp/p/projects'"));
    assert.ok(!kept.includes("CLONE="));
    assert.ok(!installCommand().includes("BRIGADE_PROJECTS_FILE"));
  });
});
