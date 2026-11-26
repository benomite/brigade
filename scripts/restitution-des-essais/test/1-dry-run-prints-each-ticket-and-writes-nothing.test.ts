// The tool played against a stubbed GitHub client: a repo in memory (#4321, epic #4319).
// Tries of a ticket = its `brigade:echec` comments; the tool restores them by deleting the ones the v2 fetch error caused.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { passer } from "../restituer.ts";

type Commentaire = { id: number; body: string; created_at: string; user: { login: string } };
type Issue = { number: number; state: "open" | "closed"; labels: string[]; comments: Commentaire[] };
type Ecriture = { methode: string; chemin: string; champs: Record<string, string | string[]> };

const STATION = "macbook-air-de-benoit/claude";
const V2 = "its worktree could not be prepared: fatal: couldn't find remote ref refs/heads/v2";
let suivant = 1;
const echec = (n: number, motif: string, quand: string, station = STATION): Commentaire => ({
  id: suivant++,
  body: `<!-- brigade:echec n=${n} -->\nStation \`${station}\`: the cook stopped without a delivery — ${motif}`,
  created_at: quand,
  user: { login: "brigade-bot" },
});
const DANS_LA_FENETRE = ["2026-11-25T17:05:00Z", "2026-11-25T17:40:00Z", "2026-11-25T18:30:00Z", "2026-11-25T19:10:00Z"];
const AVANT = "2026-11-24T10:00:00Z";

// A ticket set aside by its failures: no `fire`, `set-aside:failures` on it.
const ticket = (numero: number, comments: Commentaire[]): Issue => ({ number: numero, state: "open", labels: ["set-aside:failures"], comments });
const essais = (issue: Issue) => issue.comments.filter((c) => c.body.startsWith("<!-- brigade:echec")).length;

function fauxGithub(issues: Issue[]) {
  const ecritures: Ecriture[] = [];
  const trouve = (n: string) => {
    const issue = issues.find((i) => i.number === Number(n));
    if (issue === undefined) throw new Error(`unknown issue ${n}`);
    return issue;
  };
  const github = {
    lire: (chemin: string): unknown[] => {
      let m = /issues\/(\d+)\/comments/.exec(chemin);
      if (m) return trouve(m[1]!).comments.map((c) => structuredClone(c));
      m = /issues\/(\d+)\/labels/.exec(chemin);
      if (m) return trouve(m[1]!).labels.map((name) => ({ name }));
      m = /issues\/(\d+)(?:$|\?)/.exec(chemin);
      if (m) return [{ number: trouve(m[1]!).number, state: trouve(m[1]!).state, labels: trouve(m[1]!).labels.map((name) => ({ name })) }];
      if (/\/issues(?:$|\?)/.test(chemin)) return issues.map((i) => ({ number: i.number, state: i.state, labels: i.labels.map((name) => ({ name })) }));
      throw new Error(`unexpected read ${chemin}`);
    },
    ecrire: (methode: string, chemin: string, champs: Record<string, string | string[]> = {}): void => {
      ecritures.push({ methode, chemin, champs });
      let m = /issues\/comments\/(\d+)$/.exec(chemin);
      if (m && methode === "DELETE") {
        for (const i of issues) i.comments = i.comments.filter((c) => c.id !== Number(m![1]));
        return;
      }
      m = /issues\/(\d+)\/comments\/(\d+)$/.exec(chemin);
      if (m && methode === "DELETE") {
        trouve(m[1]!).comments = trouve(m[1]!).comments.filter((c) => c.id !== Number(m![2]));
        return;
      }
      m = /issues\/(\d+)\/labels\/([^/]+)$/.exec(chemin);
      if (m && methode === "DELETE") {
        const issue = trouve(m[1]!);
        issue.labels = issue.labels.filter((l) => l !== decodeURIComponent(m![2]!));
        return;
      }
      m = /issues\/(\d+)\/labels$/.exec(chemin);
      if (m && (methode === "POST" || methode === "PUT")) {
        const issue = trouve(m[1]!);
        const noms = ([] as string[]).concat((champs.labels ?? champs["labels[]"] ?? []) as string | string[]);
        issue.labels = methode === "PUT" ? noms : [...new Set([...issue.labels, ...noms])];
        return;
      }
      m = /issues\/(\d+)$/.exec(chemin);
      if (m && methode === "PATCH") {
        const issue = trouve(m[1]!);
        if (champs.state !== undefined) issue.state = champs.state as "open" | "closed";
        if (champs.labels !== undefined) issue.labels = ([] as string[]).concat(champs.labels);
        return;
      }
      if (/\/comments$/.test(chemin) && methode === "POST") return; // a note left on the ticket: no effect on its tries
      throw new Error(`unexpected write ${methode} ${chemin}`);
    },
  };
  return { github, ecritures, issues };
}
const sans = { appliquer: false, numeros: [] as number[] };
const avec = { appliquer: true, numeros: [] as number[] };

// The five criteria of #4321 share this stubbed client: each `describe` below is one criterion.
describe("criterion 1: the dry run", () => {
  test("prints number, current tries, tries after the restore and the change, and writes nothing", () => {
    const { github, ecritures, issues } = fauxGithub([
      ticket(4226, [echec(1, V2, DANS_LA_FENETRE[0]!), echec(2, V2, DANS_LA_FENETRE[1]!), echec(3, V2, DANS_LA_FENETRE[2]!)]),
      ticket(4227, [echec(1, "claude ended in error", AVANT), echec(2, V2, DANS_LA_FENETRE[0]!), echec(3, V2, DANS_LA_FENETRE[1]!)]),
    ]);
    const { sortie, code } = passer("benomite/brigade", sans, github);
    const texte = sortie.join("\n");
    assert.equal(code, 0);
    const ligne4226 = sortie.find((l) => l.includes("4226"));
    const ligne4227 = sortie.find((l) => l.includes("4227"));
    assert.ok(ligne4226 !== undefined && ligne4227 !== undefined, texte);
    assert.match(ligne4226, /\b3\b.*\b0\b/, "current tries, then tries after the restore");
    assert.match(ligne4227, /\b3\b.*\b1\b/);
    assert.match(ligne4226, /fire/, "the label change");
    assert.match(ligne4226, /set-aside:failures/);
    assert.deepEqual(ecritures, []);
    assert.equal(essais(issues[0]!), 3);
    assert.deepEqual(issues[0]!.labels, ["set-aside:failures"]);
  });
});

describe("criterion 2: --apply", () => {
  test("a ticket failed only by the v2 fetch error gets its tries back and returns to the rail", () => {
    const { github, ecritures, issues } = fauxGithub([
      ticket(4226, [echec(1, V2, DANS_LA_FENETRE[0]!), echec(2, V2, DANS_LA_FENETRE[1]!), echec(3, V2, DANS_LA_FENETRE[2]!)]),
    ]);
    const { code } = passer("benomite/brigade", avec, github);
    assert.equal(code, 0);
    assert.equal(essais(issues[0]!), 0, "its tries are back to their value before the failures");
    assert.ok(issues[0]!.labels.includes("fire"), "back on the rail");
    assert.ok(!issues[0]!.labels.includes("set-aside:failures"));
    assert.ok(ecritures.length > 0);
  });

  test("the numbers given are added to the search", () => {
    const { github, issues } = fauxGithub([
      ticket(4280, [echec(1, V2, "2026-11-25T19:35:00Z")]),
      ticket(4281, [echec(1, V2, DANS_LA_FENETRE[0]!)]),
    ]);
    passer("benomite/brigade", { appliquer: true, numeros: [4280] }, github);
    assert.equal(essais(issues[0]!), 0);
    assert.equal(essais(issues[1]!), 0);
  });
});

describe("criterion 3: another cause", () => {
  test("a ticket with a failure of another cause keeps the tries lost to that cause", () => {
    const { github, issues } = fauxGithub([
      ticket(4228, [echec(1, "claude ended in error (exit code 1)", AVANT), echec(2, V2, DANS_LA_FENETRE[0]!), echec(3, V2, DANS_LA_FENETRE[1]!)]),
      ticket(4229, [echec(1, V2, DANS_LA_FENETRE[0]!), echec(2, "the cook added nothing since its last delivery", DANS_LA_FENETRE[1]!), echec(3, V2, DANS_LA_FENETRE[2]!)]),
      ticket(4230, [echec(1, V2, DANS_LA_FENETRE[0]!), echec(2, V2, DANS_LA_FENETRE[1]!), echec(3, V2, DANS_LA_FENETRE[2]!, "another-station/claude")]),
    ]);
    const { code } = passer("benomite/brigade", avec, github);
    assert.equal(code, 0);
    assert.equal(essais(issues[0]!), 1, "the earlier failure of another cause stays");
    assert.equal(essais(issues[1]!), 1, "the failure of another cause, inside the window, stays");
    assert.equal(essais(issues[2]!), 1, "a v2 failure of another station is not this tool's");
  });
});

describe("criterion 4: idempotence", () => {
  const depart = () => [
    ticket(4226, [echec(1, V2, DANS_LA_FENETRE[0]!), echec(2, V2, DANS_LA_FENETRE[1]!), echec(3, V2, DANS_LA_FENETRE[2]!)]),
    ticket(4228, [echec(1, "claude ended in error", AVANT), echec(2, V2, DANS_LA_FENETRE[0]!)]),
  ];
  const etat = (issues: Issue[]) => JSON.stringify(issues.map((i) => ({ n: i.number, s: i.state, l: [...i.labels].sort(), c: i.comments.map((c) => c.body) })));

  test("a second --apply gives the same result as the first and writes nothing", () => {
    const une = fauxGithub(depart());
    passer("benomite/brigade", avec, une.github);
    const deux = fauxGithub(depart());
    passer("benomite/brigade", avec, deux.github);
    const avant = deux.ecritures.length;
    const { sortie, code } = passer("benomite/brigade", avec, deux.github);
    assert.equal(code, 0);
    assert.equal(etat(deux.issues), etat(une.issues));
    assert.equal(deux.ecritures.length, avant, "the second run made no write");
    assert.match(sortie.join("\n"), /\b0 (?:GitHub )?writes?\b/i);
  });
});

describe("criterion 5: the write count", () => {
  const depart = () => [
    ticket(4226, [echec(1, V2, DANS_LA_FENETRE[0]!), echec(2, V2, DANS_LA_FENETRE[1]!)]),
    ticket(4228, [echec(1, V2, DANS_LA_FENETRE[2]!)]),
  ];
  const compte = (sortie: string[]) => Number(/(\d+) GitHub writes?/i.exec(sortie.join("\n"))?.[1] ?? NaN);

  test("--apply prints the number of writes it made, which is the writes the client received", () => {
    const { github, ecritures } = fauxGithub(depart());
    const { sortie } = passer("benomite/brigade", avec, github);
    assert.ok(ecritures.length > 0);
    assert.equal(compte(sortie), ecritures.length);
  });

  test("the dry run prints the number of writes it would make, and makes none", () => {
    const seche = fauxGithub(depart());
    const { sortie } = passer("benomite/brigade", sans, seche.github);
    assert.deepEqual(seche.ecritures, []);
    const reelle = fauxGithub(depart());
    passer("benomite/brigade", avec, reelle.github);
    assert.equal(compte(sortie), reelle.ecritures.length);
  });
});
