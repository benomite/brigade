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
