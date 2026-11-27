// The defects that escape the pass (#3515), counted on a known sample of closed
// tickets (sample-defects.json, GitHub's shapes): the escaped bugs and the
// reverts compute.ts finds must be the ones counted by hand below, with the
// same tickets and the same shas.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { chiffresDAutonomie, commitsRevertes, type Defauts, type DonneesDuDepot } from "../../../../runtime/src/autonomie/compute.ts";

const ECHANTILLON = JSON.parse(readFileSync(new URL("./sample-defects.json", import.meta.url), "utf8")) as DonneesDuDepot;
const MAINTENANT = new Date("2026-11-11T12:00:00.000Z");
const sha = (signe: string) => signe.repeat(40);
const dits = (chiffres: ReturnType<typeof chiffresDAutonomie>) => ({
  bugs: chiffres.bugsEchappes?.map(({ bug, tickets }) => ({ bug, tickets })),
  reverts: chiffres.reverts?.map(({ sha, tickets }) => ({ sha, tickets })),
});

describe("the defects that escape the pass (#3515)", () => {
  test("over the last 7 days, the sample's hand count: 3 escaped bugs on #101, #102, #103, #104, and 2 reverts", () => {
    // Served in the 7 days with `fire`: #101, #102, #103, #104 (#105 has no `fire`, #90 is older).
    // Escaped: #201 cites #101 after its merge; #203 cites #102 and #103; #207 cites #104 by its address.
    // Not counted: #202 (before #101's merge), #204 (#90, out of the period), #205 (no served ticket), #206 (no `bug`
    // label), #208 (a pull request), #209 (#105, no `fire`), #210 (after the period).
    // Reverts: aaaa… reverts #101's commit; eeee… reverts #103's and a commit of no ticket. Not counted: bbbb… (no ticket),
    // cccc… (#90), dddd… (#105), the second aaaa… (the same commit), ffff… (after the period), 9999… (no trailer).
    const chiffres = chiffresDAutonomie([ECHANTILLON], 7, MAINTENANT);
    assert.equal(chiffres.tickets, 4);
    assert.equal(chiffres.bugsEchappes?.length, 3);
    assert.equal(chiffres.reverts?.length, 2);
    assert.deepEqual(dits(chiffres), {
      bugs: [
        { bug: 201, tickets: [101] },
        { bug: 203, tickets: [102, 103] },
        { bug: 207, tickets: [104] },
      ],
      reverts: [
        { sha: sha("a"), tickets: [101] },
        { sha: sha("e"), tickets: [103] },
      ],
    });
    assert.deepEqual(chiffres.reverts?.[1]?.revertes, [sha("5"), sha("6")]);
    assert.deepEqual(chiffres.bugsEchappes?.[0], { depot: "chef/parade", bug: 201, titre: "Rail is blank", url: "https://github.com/chef/parade/issues/201", tickets: [101] });
    assert.deepEqual(chiffres.defautsNonLus, []);
  });

  test("over the last 30 days, #90 is served in the period: its bug #204 and its revert cccc… count too", () => {
    const chiffres = chiffresDAutonomie([ECHANTILLON], 30, MAINTENANT);
    assert.equal(chiffres.tickets, 5);
    assert.deepEqual(dits(chiffres), {
      bugs: [
        { bug: 201, tickets: [101] },
        { bug: 203, tickets: [102, 103] },
        { bug: 204, tickets: [90] },
        { bug: 207, tickets: [104] },
      ],
      reverts: [
        { sha: sha("a"), tickets: [101] },
        { sha: sha("c"), tickets: [90] },
        { sha: sha("e"), tickets: [103] },
      ],
    });
  });

  test("defects not read, or unreadable, in one repository: no count at all, and which repository and why", () => {
    const { defauts: _defauts, ...sansDefauts } = ECHANTILLON;
    const autre: DonneesDuDepot = { depot: "chef/cantine", servis: [], issues: {}, defauts: { illisible: "GitHub answered HTTP 403 on /search/commits" } };
    const chiffres = chiffresDAutonomie([ECHANTILLON, autre], 7, MAINTENANT);
    assert.equal(chiffres.bugsEchappes, null);
    assert.equal(chiffres.reverts, null);
    assert.deepEqual(chiffres.defautsNonLus, [{ depot: "chef/cantine", raison: "GitHub answered HTTP 403 on /search/commits" }]);
    // The other figures still count.
    assert.equal(chiffres.tickets, 4);
    const nonLus = chiffresDAutonomie([sansDefauts], 7, MAINTENANT);
    assert.equal(nonLus.bugsEchappes, null);
    assert.deepEqual(nonLus.defautsNonLus, [{ depot: "chef/parade", raison: "not read" }]);
  });

  test("the escaped bugs are listed by bug number, and a revert's tickets by number, whatever order GitHub gives them in", () => {
    const defauts = ECHANTILLON.defauts as Defauts;
    const melange: DonneesDuDepot = {
      ...ECHANTILLON,
      defauts: {
        ...defauts,
        bugs: [...defauts.bugs].reverse(),
        reverts: [{ sha: sha("7"), commit: { message: `Revert two tickets\n\nThis reverts commit ${sha("5")}.\nThis reverts commit ${sha("1")}.`, committer: { date: "2026-11-10T09:00:00Z" } } }],
      },
    };
    const chiffres = chiffresDAutonomie([melange], 7, MAINTENANT);
    assert.deepEqual(chiffres.bugsEchappes?.map(({ bug }) => bug), [201, 203, 207]);
    assert.deepEqual(dits(chiffres).reverts, [{ sha: sha("7"), tickets: [101, 103] }]);
  });

  test("the reverts are listed by sha, whatever order GitHub's commit search gives them in", () => {
    const defauts = ECHANTILLON.defauts as Defauts;
    // The first aaaa… moved last: eeee… comes before both aaaa… in the search's order.
    const [premier, ...autres] = defauts.reverts;
    const chiffres = chiffresDAutonomie([{ ...ECHANTILLON, defauts: { ...defauts, reverts: [...autres, premier] } }], 7, MAINTENANT);
    assert.deepEqual(chiffres.reverts?.map(({ sha }) => sha), [sha("a"), sha("e")]);
  });

  test("a bug cites a served ticket by its own repository's address, never by another repository's, nor by an HTML entity", () => {
    const bug = (number: number, body: string) => ({ number, title: "Crash", body, created_at: "2026-11-10T00:00:00Z", labels: [{ name: "bug" }], html_url: `https://github.com/chef/parade/issues/${number}` });
    const defauts = ECHANTILLON.defauts as Defauts;
    const lus = (bugs: object[]) => dits(chiffresDAutonomie([{ ...ECHANTILLON, defauts: { ...defauts, bugs } }], 7, MAINTENANT)).bugs;
    assert.deepEqual(lus([bug(301, "Since https://github.com/Chef/Parade/issues/102.")]), [{ bug: 301, tickets: [102] }]);
    assert.deepEqual(lus([bug(302, "Since https://github.com/chef/cantine/issues/102."), bug(303, "A brace: &#102; in the log."), bug(304, "Since chef/parade#1023.")]), []);
  });

  test("a bug cites a served ticket as its own repository's `owner/repo#12`, never as another repository's", () => {
    const bug = (number: number, body: string) => ({ number, title: "Crash", body, created_at: "2026-11-10T00:00:00Z", labels: [{ name: "bug" }], html_url: `https://github.com/chef/parade/issues/${number}` });
    const defauts = ECHANTILLON.defauts as Defauts;
    const lus = (bugs: object[]) => dits(chiffresDAutonomie([{ ...ECHANTILLON, defauts: { ...defauts, bugs } }], 7, MAINTENANT)).bugs;
    assert.deepEqual(lus([bug(321, "Since chef/parade#102."), bug(322, "Since Chef/Parade#103 and chef/parade#104")]), [
      { bug: 321, tickets: [102] },
      { bug: 322, tickets: [103, 104] },
    ]);
    assert.deepEqual(lus([bug(323, "Since chef/cantine#102."), bug(324, "Since otherchef/parade#102."), bug(325, "Since chef/parade.old#102.")]), []);
  });

  test("a bug's label is read whatever its case and its shape, a name or an object; another label is not a bug", () => {
    const bug = (number: number, labels: unknown[]) => ({ number, title: `Since #101`, body: null, created_at: "2026-11-10T00:00:00Z", labels, html_url: `https://github.com/chef/parade/issues/${number}` });
    const defauts = ECHANTILLON.defauts as Defauts;
    const bugs = [bug(311, ["Bug"]), bug(312, [{ name: "BUG" }]), bug(313, ["bugfix", { name: "debug" }]), bug(314, [null, 7, { name: "bug" }])];
    const chiffres = chiffresDAutonomie([{ ...ECHANTILLON, defauts: { ...defauts, bugs } }], 7, MAINTENANT);
    assert.deepEqual(dits(chiffres).bugs, [
      { bug: 311, tickets: [101] },
      { bug: 312, tickets: [101] },
      { bug: 314, tickets: [101] },
    ]);
  });

  test("a commit message gives each commit its trailer reverts, once", () => {
    assert.deepEqual(commitsRevertes(`This reverts commit ${sha("1")}.\n\nThis reverts commit ${sha("2")}.\nThis reverts commit ${sha("1")}.`), [sha("1"), sha("2")]);
    assert.deepEqual(commitsRevertes("Revert the wording: this reverts nothing"), []);
  });

  test("a trailer that writes its sha in capitals reverts the same commit, named in lower case", () => {
    assert.deepEqual(commitsRevertes(`This reverts commit ${sha("A")}.`), [sha("a")]);
    assert.deepEqual(commitsRevertes(`This reverts commit ${sha("A")}.\nThis reverts commit ${sha("a")}.`), [sha("a")]);
  });
});
