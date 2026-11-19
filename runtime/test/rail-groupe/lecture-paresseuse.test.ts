// Les lectures que le rail ne paie plus ticket par ticket (#3834) : les
// commentaires lus avec l'instantané, et les retraits de labels que l'on ne
// relit que s'ils peuvent changer la réponse.
import assert from "node:assert/strict";
import { test } from "node:test";
import { corpsDePrise, lireTenant } from "../../src/github-etat/prise.ts";
import { lireInstantane } from "../../src/github-etat/instantane.ts";
import { incapablesLus } from "../../src/routage-station/routage-station.ts";

const comm = (body: string, createdAt = "2026-11-18T10:00:00Z") => ({ body, association: "OWNER", author: "benomite", createdAt, id: 1 });
const fauxGitHub = (commentaires: ReturnType<typeof comm>[], retraits: { label: string; createdAt: string }[] = []) => {
  const lus = { retraits: 0 };
  return {
    lus,
    github: {
      commentaires: async () => commentaires,
      retraitsDeLabels: async () => {
        lus.retraits += 1;
        return retraits;
      },
    } as unknown as Parameters<typeof lireTenant>[1],
  };
};

test("the snapshot carries the comments and the body of a ticket, and leaves out a ticket whose comments it did not read in full", () => {
  const noeud = (number: number, nodes: unknown[], totalCount: number) => ({ number, title: "t", body: `body ${number}`, labels: { nodes: [{ name: "fire" }] }, comments: { totalCount, nodes } });
  const instantane = lireInstantane({
    repository: {
      issues: { pageInfo: { hasNextPage: false }, nodes: [noeud(1, [{ body: "a", authorAssociation: "OWNER", createdAt: "2026-11-18T10:00:00Z", author: { login: "benomite" } }], 1), noeud(2, [{ body: "b" }], 3)] },
      pullRequests: { pageInfo: { hasNextPage: false }, nodes: [] },
      ref: null,
    },
  });
  assert.deepEqual(instantane.commentaires.get(1), [{ body: "a", author: "benomite", association: "OWNER", createdAt: "2026-11-18T10:00:00Z" }]);
  assert.equal(instantane.commentaires.has(2), false);
  assert.equal(instantane.corps.get(2), "body 2");
});

test("who holds a ticket is read without its label removals when they cannot change it", async () => {
  const sansPrise = fauxGitHub([comm("a question")]);
  assert.equal(await lireTenant(1, sansPrise.github), null);
  assert.equal(sansPrise.lus.retraits, 0);

  const tenu = fauxGitHub([comm(corpsDePrise("mac"))]);
  assert.equal((await lireTenant(1, tenu.github, ["fire", "taken"]))?.station, "mac");
  assert.equal(tenu.lus.retraits, 0);

  // Sans les labels `fire` et `taken` ensemble, un retrait de `fire` après la prise la lâche.
  const lache = fauxGitHub([comm(corpsDePrise("mac"))], [{ label: "fire", createdAt: "2026-11-18T11:00:00Z" }]);
  assert.equal(await lireTenant(1, lache.github, ["fire"]), null);
  assert.equal(lache.lus.retraits, 1);
});

test("the stations unable to run the gates are read without the label removals when no comment marks one", async () => {
  let lus = 0;
  const retraits = async () => {
    lus += 1;
    return [{ label: "fire", createdAt: "2026-11-18T11:00:00Z" }];
  };
  assert.deepEqual([...(await incapablesLus([comm("hello")], retraits))], []);
  assert.equal(lus, 0);
  const marque = comm("<!-- brigade:station-incapable station=box/claude -->\nno gates here");
  assert.deepEqual([...(await incapablesLus([marque], async () => []))], ["box/claude"]);
  // Le `fire` remis après la marque l'efface ; des retraits illisibles gardent la marque.
  assert.deepEqual([...(await incapablesLus([marque], retraits))], []);
  assert.deepEqual([...(await incapablesLus([marque], async () => Promise.reject(new Error("down"))))], ["box/claude"]);
  assert.equal(lus, 1);
});
