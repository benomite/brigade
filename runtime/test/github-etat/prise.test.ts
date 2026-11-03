import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { DE_CONFIANCE as DE_CONFIANCE_DU_RAIL } from "../../src/alimenter.ts";
import { stationGitHub, type GitHubDuTour, type Prise } from "../../src/brigade-github.ts";
import { LABEL_IN_PASS, LABEL_TAKEN } from "../../src/github-etat/etats.ts";
import { corpsDeLacher, corpsDePrise, DE_CONFIANCE, priseDeLaStation, tenant, type CommentaireDePrise, type GitHubDeLaPrise, type RetraitDeLabel } from "../../src/github-etat/prise.ts";

const NUMERO = 42;
const CALIBRE = ["fire", "model:sonnet", "effort:medium"];

// Une issue sur GitHub, que plusieurs stations lisent et écrivent. Chaque
// commentaire reçoit l'id suivant et l'instant de l'horloge, qu'il avance
// d'une seconde ; `passer` l'avance sans rien écrire. Chaque appel rend la
// main avant de répondre, pour que deux stations s'entrelacent comme sur le
// vrai. `ordre` choisit l'ordre où l'issue rend ses commentaires.
class IssueSurGitHub {
  horloge = Date.parse("2026-11-02T10:00:00Z");
  private id = 9000;
  labels = new Set(CALIBRE);
  commentaires: CommentaireDePrise[] = [];
  retraits: RetraitDeLabel[] = [];
  ecritures: Array<{ station: string; quoi: string }> = [];
  ordre: (commentaires: CommentaireDePrise[]) => CommentaireDePrise[] = (liste) => liste;

  // Un commentaire posté sur l'issue, par une station ou par le chef.
  poster(corps: string, association = "OWNER"): CommentaireDePrise {
    const commentaire = { id: ++this.id, body: corps, association, createdAt: new Date(this.horloge).toISOString() };
    this.commentaires.push(commentaire);
    this.horloge += 1_000;
    return commentaire;
  }

  // Un label retiré de l'issue, par une station ou par le chef.
  retirer(label: string): void {
    this.labels.delete(label);
    this.retraits.push({ label, createdAt: new Date(this.horloge).toISOString() });
    this.horloge += 1_000;
  }

  passer(ms: number): void {
    this.horloge += ms;
  }

  ecrituresDe(station: string): string[] {
    return this.ecritures.filter((ecriture) => ecriture.station === station).map((ecriture) => ecriture.quoi);
  }

  pour(station: string): GitHubDeLaPrise {
    const tour = () => new Promise((suite) => setImmediate(suite));
    return {
      commentaires: async () => {
        await tour();
        return this.ordre([...this.commentaires]);
      },
      retraitsDeLabels: async () => {
        await tour();
        return [...this.retraits];
      },
      commenter: async (_numero, corps) => {
        await tour();
        this.ecritures.push({ station, quoi: `comment ${corps.split("\n")[0]}` });
        this.poster(corps);
      },
      labelliser: async (_numero, labels) => {
        await tour();
        this.ecritures.push({ station, quoi: `label ${labels.join(",")}` });
        for (const label of labels) this.labels.add(label);
      },
      delabelliser: async (_numero, label) => {
        await tour();
        this.ecritures.push({ station, quoi: `unlabel ${label}` });
        this.retirer(label);
      },
    };
  }

  // L'issue telle que la station la lit avant de la prendre.
  lue() {
    return { number: NUMERO, labels: [...this.labels] };
  }
}

const prisesPostees = (issue: IssueSurGitHub) => issue.commentaires.filter((commentaire) => commentaire.body.startsWith("<!-- brigade:prise"));

for (const [premiere, seconde] of [
  ["A", "B"],
  ["B", "A"],
] as const) {
  test(`two stations post claim comments on the same issue at once (${premiere} first): both compute the same winner, the earlier comment`, async () => {
    const issue = new IssueSurGitHub();
    const prises = { [premiere]: priseDeLaStation(issue.pour(premiere), premiere), [seconde]: priseDeLaStation(issue.pour(seconde), seconde) };
    const lue = issue.lue();
    const [r1, r2] = await Promise.all([prises[premiere]?.prendre(lue), prises[seconde]?.prendre(lue)]);

    // Les deux ont lu l'issue libre et posté leur prise.
    const postees = prisesPostees(issue);
    assert.equal(postees.length, 2);
    const plusAncienne = postees.reduce((a, b) => (Date.parse(a.createdAt) < Date.parse(b.createdAt) ? a : b));
    const gagnante = /station=(\w+)/.exec(plusAncienne.body)?.[1];
    // Les deux lisent le même gagnant : la prise la plus ancienne.
    assert.deepEqual(r1?.tenant, r2?.tenant);
    assert.deepEqual(r1?.tenant, { station: gagnante, commentaire: plusAncienne.id, createdAt: plusAncienne.createdAt });
    assert.deepEqual([r1?.prise, r2?.prise], [gagnante === premiere, gagnante === seconde]);
    // Seule la gagnante pose `taken`, une fois.
    assert.deepEqual(
      issue.ecritures.filter((ecriture) => ecriture.quoi.startsWith("label")),
      [{ station: gagnante, quoi: `label ${LABEL_TAKEN}` }],
    );
  });
}

test("two claims in the same second: the lower comment id wins, for every station that reads them", () => {
  const instant = "2026-11-02T10:00:00Z";
  const commentaires = [
    { id: 12, body: corpsDePrise("B"), association: "OWNER", createdAt: instant },
    { id: 11, body: corpsDePrise("A"), association: "MEMBER", createdAt: instant },
  ];
  assert.equal(tenant(commentaires, [])?.station, "A");
  assert.equal(tenant([...commentaires].reverse(), [])?.station, "A");
});

test("a later claim from another station is ignored, and the winner does not change whatever order the comments are re-read in", async () => {
  const issue = new IssueSurGitHub();
  const a = priseDeLaStation(issue.pour("A"), "A");
  const b = priseDeLaStation(issue.pour("B"), "B");
  const prise = await a.prendre(issue.lue());
  assert.equal(prise.prise, true);

  // B relit l'issue après : elle voit A, et n'écrit rien.
  assert.deepEqual(await b.prendre(issue.lue()), { prise: false, tenant: prise.tenant });
  assert.deepEqual(issue.ecrituresDe("B"), []);

  // Une prise de B postée plus tard sur l'issue, et d'autres commentaires.
  issue.poster("Looks good to me.");
  issue.poster(corpsDePrise("B"));
  issue.poster(corpsDePrise("C"), "COLLABORATOR");

  // Dans tous les ordres de lecture, le gagnant reste A.
  const permutations = <T>(liste: T[]): T[][] => (liste.length <= 1 ? [liste] : liste.flatMap((tete, i) => permutations([...liste.slice(0, i), ...liste.slice(i + 1)]).map((reste) => [tete, ...reste])));
  const lectures = permutations(issue.commentaires);
  assert.equal(lectures.length, 24);
  for (const lecture of lectures) assert.deepEqual(tenant(lecture, issue.retraits), prise.tenant);

  // Et B, relisant l'issue rendue à l'envers ou triée par texte, ne la prend pas.
  for (const ordre of [(liste: CommentaireDePrise[]) => liste.reverse(), (liste: CommentaireDePrise[]) => liste.sort((x, y) => x.body.localeCompare(y.body))]) {
    issue.ordre = ordre;
    assert.deepEqual(await b.prendre(issue.lue()), { prise: false, tenant: prise.tenant });
    assert.deepEqual(await a.prendre({ number: NUMERO, labels: [...CALIBRE, LABEL_TAKEN] }), { prise: true, tenant: prise.tenant });
  }
  assert.deepEqual(issue.ecrituresDe("B"), []);
});

test("a claim from a station that then stops stays the winner until a release comment naming it is posted on the issue", async () => {
  const issue = new IssueSurGitHub();
  const a = priseDeLaStation(issue.pour("A"), "A");
  const b = priseDeLaStation(issue.pour("B"), "B");
  const prise = await a.prendre(issue.lue());
  assert.equal(prise.prise, true);
  const ecrituresDeA = issue.ecrituresDe("A");
  // A s'arrête : elle ne lit ni n'écrit plus rien. Une journée de tours de B.
  for (let heure = 0; heure < 24; heure += 1) {
    issue.passer(3_600_000);
    assert.deepEqual(await b.prendre({ number: NUMERO, labels: CALIBRE }), { prise: false, tenant: prise.tenant });
  }
  assert.deepEqual(issue.ecrituresDe("B"), []);
  assert.deepEqual(issue.ecrituresDe("A"), ecrituresDeA);

  // Une prise perdue, postée avant le lâcher, et un lâcher qui nomme une autre station.
  issue.poster(corpsDePrise("C"));
  issue.poster(corpsDeLacher("C"));
  assert.deepEqual(tenant(issue.commentaires, issue.retraits), prise.tenant);

  // Le lâcher qui nomme A, posté par le chef : le ticket est libre, et la
  // prise perdue de C ne revient pas.
  issue.poster(corpsDeLacher("A"));
  assert.equal(tenant(issue.commentaires, issue.retraits), null);
  const reprise = await b.prendre({ number: NUMERO, labels: CALIBRE });
  assert.equal(reprise.prise, true);
  assert.equal(reprise.tenant?.station, "B");
});

for (const label of [LABEL_TAKEN, "fire"]) {
  test(`a claim from a station that then stops stays the winner until \`${label}\` is removed from the issue`, async () => {
    const issue = new IssueSurGitHub();
    const a = priseDeLaStation(issue.pour("A"), "A");
    const b = priseDeLaStation(issue.pour("B"), "B");
    assert.equal((await a.prendre(issue.lue())).prise, true);
    issue.poster(corpsDePrise("B"));
    issue.passer(86_400_000);
    // Le retrait d'un autre label ne lâche rien.
    issue.retirer("model:sonnet");
    assert.equal((await b.prendre({ number: NUMERO, labels: CALIBRE })).tenant?.station, "A");

    issue.retirer(label);
    assert.equal(tenant(issue.commentaires, issue.retraits), null, "ni A, ni la prise de B postée avant le retrait");
    const reprise = await b.prendre({ number: NUMERO, labels: CALIBRE });
    assert.deepEqual([reprise.prise, reprise.tenant?.station], [true, "B"]);
  });
}

test("a label removed in the same second as a claim releases it: in doubt, the release wins, and the station claims again", () => {
  const instant = "2026-11-02T10:00:00Z";
  const prise = { id: 1, body: corpsDePrise("A"), association: "OWNER", createdAt: instant };
  assert.equal(tenant([prise], [{ label: LABEL_TAKEN, createdAt: instant }]), null);
  assert.equal(tenant([prise, { ...prise, id: 2, body: corpsDePrise("B"), createdAt: "2026-11-02T10:00:01Z" }], [{ label: LABEL_TAKEN, createdAt: instant }])?.station, "B");
});

test("the holding station releases the ticket by a comment and the removal of `taken`; another station releases nothing", async () => {
  const issue = new IssueSurGitHub();
  const a = priseDeLaStation(issue.pour("A"), "A");
  const b = priseDeLaStation(issue.pour("B"), "B");
  await a.prendre(issue.lue());
  assert.equal(await b.lacher(issue.lue()), false);
  assert.deepEqual(issue.ecrituresDe("B"), []);
  assert.equal(await a.lacher(issue.lue()), true);
  assert.deepEqual(issue.ecrituresDe("A"), ["comment <!-- brigade:prise station=A -->", `label ${LABEL_TAKEN}`, "comment <!-- brigade:lache station=A -->", `unlabel ${LABEL_TAKEN}`]);
  assert.equal(tenant(issue.commentaires, issue.retraits), null);
  assert.equal((await b.prendre(issue.lue())).prise, true);
});

test("a station that already holds the ticket posts no second claim, and only puts `taken` back if it is missing", async () => {
  const issue = new IssueSurGitHub();
  const a = priseDeLaStation(issue.pour("A"), "A");
  await a.prendre(issue.lue());
  assert.equal((await a.prendre(issue.lue())).prise, true);
  assert.equal(prisesPostees(issue).length, 1);
  assert.deepEqual(issue.ecrituresDe("A"), ["comment <!-- brigade:prise station=A -->", `label ${LABEL_TAKEN}`]);
});

test("only the repository's comments count: an earlier claim or release from an outsider changes nothing", () => {
  const commentaires = [
    { id: 1, body: corpsDePrise("intrus"), association: "NONE", createdAt: "2026-11-02T10:00:00Z" },
    { id: 2, body: corpsDePrise("A"), association: "OWNER", createdAt: "2026-11-02T10:00:01Z" },
    { id: 3, body: corpsDeLacher("A"), association: "CONTRIBUTOR", createdAt: "2026-11-02T10:00:02Z" },
    { id: 4, body: `Quoted:\n${corpsDeLacher("A")}`, association: "OWNER", createdAt: "2026-11-02T10:00:03Z" },
  ];
  assert.equal(tenant(commentaires, [])?.station, "A");
  // La liste est celle du reste du dépôt.
  assert.deepEqual(DE_CONFIANCE, DE_CONFIANCE_DU_RAIL);
});

test("a station name that would break the claim marker is refused before anything is written", () => {
  const issue = new IssueSurGitHub();
  for (const nom of ["", "box -->", "a b"]) assert.throws(() => priseDeLaStation(issue.pour(nom), nom), /station name not usable/);
  assert.deepEqual(issue.ecritures, []);
});

test("prendre reads and writes only through the GitHub client: prise.ts imports no relay, mailbox or log module", () => {
  const imports = (fichier: string) => [...readFileSync(join(import.meta.dirname, "../../src/github-etat", fichier), "utf8").matchAll(/^import (type )?.* from "([^"]+)";$/gm)].map(([, type, module]) => ({ type: type !== undefined, module }));
  assert.deepEqual(imports("prise.ts"), [
    { type: false, module: "../github.ts" },
    { type: false, module: "./etats.ts" },
  ]);
  // `etats.ts` n'importe que des types : rien d'autre ne se charge avec la prise.
  assert.ok(imports("etats.ts").every(({ type }) => type));
  const source = readFileSync(join(import.meta.dirname, "../../src/github-etat/prise.ts"), "utf8");
  assert.doesNotMatch(source, /from "[^"]*(relais|tirer-par-github|tableau|boite|distantes|journal|porte-journal|alimenter|rail|runtime)[^"]*"/);
  assert.doesNotMatch(source, /from "node:/);
});

// La station GitHub seul (`brigade-github.ts`, #2060) sur la prise de ce
// module : deux stations égales, un ticket.
function cuisine(issue: IssueSurGitHub) {
  const cuissons: string[] = [];
  const station = (nom: string, cuisiner: () => Promise<{ branche: string } | { echec: string }>) => {
    const bas = issue.pour(nom);
    const github: GitHubDuTour = {
      ...bas,
      fires: async () => (issue.labels.has("fire") ? [{ number: NUMERO, title: "the ticket", labels: [...issue.labels], state: "open" }] : []),
      prDuTicket: async () => null,
      checksDeLaBase: async () => [{ outcome: "green" }],
      ouvrirPR: async () => {
        issue.ecritures.push({ station: nom, quoi: "open PR" });
        return "https://github.com/faux/depot/pull/1";
      },
      mettreAJour: async () => assert.fail("nothing to update"),
      merger: async () => assert.fail("nothing to merge"),
    };
    // Le client du tour, plus la lecture des retraits de labels.
    const prise: Prise = priseDeLaStation({ ...github, retraitsDeLabels: bas.retraitsDeLabels }, nom);
    return stationGitHub({
      nom,
      places: 1,
      base: "main",
      github,
      prise,
      cuisiner: async () => {
        cuissons.push(nom);
        return cuisiner();
      },
      juger: async () => assert.fail("nothing to review"),
      avertir: (texte) => assert.fail(texte),
    });
  };
  return { station, cuissons };
}

test("on the GitHub-only station: two stations take the same ticket at once, the earliest claim cooks it and delivers it in pass", async () => {
  const issue = new IssueSurGitHub();
  const { station, cuissons } = cuisine(issue);
  const livrer = async () => ({ branche: `cook/${NUMERO}-github` });
  const [a, b] = [station("A", livrer), station("B", livrer)];
  await Promise.all([a.tour(), b.tour()]);
  await Promise.all([a.calme(), b.calme()]);
  const gagnante = tenant(prisesPostees(issue), [])?.station;
  assert.ok(gagnante !== undefined);
  assert.deepEqual(cuissons, [gagnante]);
  assert.deepEqual([...issue.labels].sort(), [...CALIBRE, LABEL_IN_PASS].sort());
  // Livré en pass, `taken` retiré : la prise est lâchée.
  assert.equal(tenant(issue.commentaires, issue.retraits), null);
});

test("on the GitHub-only station: a cook that delivers nothing releases its claim, and the other station takes the ticket", async () => {
  const issue = new IssueSurGitHub();
  const { station, cuissons } = cuisine(issue);
  const a = station("A", async () => ({ echec: "gates red" }));
  await a.tour();
  await a.calme();
  assert.deepEqual([...issue.labels].sort(), [...CALIBRE].sort());
  const b = station("B", async () => ({ branche: `cook/${NUMERO}-github` }));
  await b.tour();
  await b.calme();
  assert.deepEqual(cuissons, ["A", "B"]);
  assert.match(issue.commentaires.map((commentaire) => commentaire.body).join("\n"), /brigade:prise station=A[\s\S]*brigade:lache station=A[\s\S]*brigade:prise station=B/);
});
