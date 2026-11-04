import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { corpsDeLacher, corpsDePrise, lacher, lireTenant, prendre, PRIS, purger, tenant, type CommentaireDePrise, type GitHubDeLaPrise, type RetraitDeLabel } from "../../src/github-etat/prise.ts";

const NUMERO = 42;

// Une issue sur GitHub, que plusieurs stations lisent et écrivent : chaque
// commentaire reçoit l'id suivant et l'instant de l'horloge, que le test
// avance — et que le commentaire d'une station avance d'une seconde. `ordre`
// dit dans quel ordre l'issue rend ses commentaires.
function issueSurGitHub() {
  let horloge = Date.parse("2026-11-02T10:00:00Z");
  let id = 1000;
  const commentaires: CommentaireDePrise[] = [];
  const retraits: RetraitDeLabel[] = [];
  const labels = new Set(["fire"]);
  const ecrits: string[] = [];
  let ordre = (liste: CommentaireDePrise[]) => liste;
  const github: GitHubDeLaPrise = {
    async commentaires() {
      await Promise.resolve();
      return ordre([...commentaires]);
    },
    async retraitsDeLabels() {
      await Promise.resolve();
      return [...retraits];
    },
    async commenter(_numero, corps) {
      await Promise.resolve();
      ecrits.push(`comment ${corps.split("\n")[0]}`);
      commentaires.push({ id: ++id, body: corps, association: "OWNER", createdAt: new Date(horloge).toISOString() });
      // Une station ne poste pas deux fois dans la même seconde.
      horloge += 1_000;
    },
    async labelliser(_numero, ajouts) {
      ecrits.push(`label ${ajouts.join(",")}`);
      for (const label of ajouts) labels.add(label);
    },
    async delabelliser(_numero, label) {
      ecrits.push(`unlabel ${label}`);
      labels.delete(label);
    },
  };
  return {
    github,
    commentaires,
    ecrits,
    // L'issue telle qu'une station l'a lue au sondage.
    lue: () => ({ number: NUMERO, labels: [...labels] }),
    avancer: (ms: number) => (horloge += ms),
    rendreDansLOrdre: (tri: (liste: CommentaireDePrise[]) => CommentaireDePrise[]) => (ordre = tri),
    // Ce que fait le chef sur l'issue, depuis GitHub.
    commenterCommeChef: (corps: string, association = "OWNER") => commentaires.push({ id: ++id, body: corps, association, createdAt: new Date(horloge).toISOString() }),
    retirerLabel: (label: string) => {
      labels.delete(label);
      retraits.push({ label, createdAt: new Date(horloge).toISOString() });
    },
  };
}

const moitie = (liste: CommentaireDePrise[]) => [...liste.slice(Math.ceil(liste.length / 2)), ...liste.slice(0, Math.ceil(liste.length / 2))];

test("deux stations prennent le même ticket en même temps : les deux lisent le même gagnant, la prise la plus ancienne", async () => {
  const issue = issueSurGitHub();
  const lue = issue.lue();
  // Les deux lisent l'issue libre, puis postent : mac dans la seconde, box la suivante.
  const [mac, box] = await Promise.all([
    prendre(lue, { github: issue.github, station: "mac" }),
    (async () => {
      await Promise.resolve();
      return prendre(lue, { github: issue.github, station: "box" });
    })(),
  ]);
  assert.equal(issue.commentaires.filter((commentaire) => commentaire.body.startsWith("<!-- brigade:prise")).length, 2, "les deux ont posté leur prise");
  assert.equal(mac.prise, true);
  assert.equal(box.prise, false);
  assert.deepEqual(box.tenant, mac.tenant);
  assert.equal(mac.tenant?.station, "mac");
  assert.equal(mac.tenant?.commentaire, issue.commentaires[0]?.id);
  // Seule la gagnante pose `taken` ; la perdante n'écrit rien de plus que sa prise.
  assert.deepEqual(issue.ecrits, ["comment <!-- brigade:prise station=mac -->", "comment <!-- brigade:prise station=box -->", `label ${PRIS}`]);
});

test("deux prises dans la même seconde : l'id du commentaire départage, et toutes les stations lisent la même", async () => {
  const issue = issueSurGitHub();
  issue.commenterCommeChef(corpsDePrise("box"));
  issue.commenterCommeChef(corpsDePrise("mac"));
  assert.equal(issue.commentaires[0]?.createdAt, issue.commentaires[1]?.createdAt);
  for (const station of ["mac", "box", "pi"]) {
    const vu = await prendre(issue.lue(), { github: issue.github, station });
    assert.equal(vu.tenant?.station, "box", station);
    assert.equal(vu.prise, station === "box", station);
  }
});

test("une prise postée plus tard par une autre station ne compte pas, et le gagnant ne change pas quand l'issue rend ses commentaires dans un autre ordre", async () => {
  const issue = issueSurGitHub();
  assert.equal((await prendre(issue.lue(), { github: issue.github, station: "mac" })).prise, true);
  issue.avancer(60_000);
  // Une prise tardive de box, postée sans lire l'issue — une station en retard d'un sondage.
  await issue.github.commenter(NUMERO, corpsDePrise("box"));
  issue.avancer(1_000);
  issue.commenterCommeChef("Looks good, go ahead.");
  const attendu = await lireTenant(NUMERO, issue.github);
  assert.equal(attendu?.station, "mac");
  for (const tri of [(liste: CommentaireDePrise[]) => [...liste].reverse(), moitie, (liste: CommentaireDePrise[]) => [...liste].sort((a, b) => a.body.localeCompare(b.body))]) {
    issue.rendreDansLOrdre(tri);
    assert.deepEqual(await lireTenant(NUMERO, issue.github), attendu);
    const box = await prendre(issue.lue(), { github: issue.github, station: "box" });
    assert.deepEqual(box, { prise: false, tenant: attendu });
  }
  // Ni la tardive ni les relectures n'ont rien écrit de plus.
  assert.equal(issue.commentaires.length, 3);
});

test("une station qui prend puis s'arrête garde le ticket, jusqu'à un lâcher par commentaire sur l'issue", async () => {
  const issue = issueSurGitHub();
  const mac = await prendre(issue.lue(), { github: issue.github, station: "mac" });
  assert.equal(mac.prise, true);
  // mac s'arrête : plus rien d'elle. box revient, une heure durant.
  for (let fois = 0; fois < 6; fois++) {
    issue.avancer(10 * 60_000);
    const box = await prendre(issue.lue(), { github: issue.github, station: "box" });
    assert.deepEqual(box, { prise: false, tenant: mac.tenant });
  }
  // box ne peut pas lâcher ce qu'elle ne tient pas.
  assert.equal(await lacher(issue.lue(), { github: issue.github, station: "box" }), false);
  assert.equal(issue.commentaires.length, 1);
  // Le chef lâche par un commentaire sur l'issue.
  issue.avancer(1_000);
  issue.commenterCommeChef(corpsDeLacher("chef"));
  assert.equal(await lireTenant(NUMERO, issue.github), null);
  issue.avancer(1_000);
  const box = await prendre(issue.lue(), { github: issue.github, station: "box" });
  assert.equal(box.prise, true);
  assert.equal(box.tenant?.station, "box");
});

test("une prise tient jusqu'au retrait du label `taken`, ou de `fire`, sur l'issue", async () => {
  for (const label of [PRIS, "fire"]) {
    const issue = issueSurGitHub();
    assert.equal((await prendre(issue.lue(), { github: issue.github, station: "mac" })).prise, true);
    issue.avancer(1_000);
    assert.equal((await prendre(issue.lue(), { github: issue.github, station: "box" })).prise, false);
    issue.avancer(1_000);
    issue.retirerLabel(label);
    assert.equal(await lireTenant(NUMERO, issue.github), null, label);
    issue.avancer(1_000);
    const box = await prendre(issue.lue(), { github: issue.github, station: "box" });
    assert.equal(box.tenant?.station, "box", label);
  }
});

test("un lâcher annule aussi les prises perdantes d'avant lui : seule une prise postée après peut l'emporter", async () => {
  const issue = issueSurGitHub();
  await prendre(issue.lue(), { github: issue.github, station: "mac" });
  issue.avancer(1_000);
  await issue.github.commenter(NUMERO, corpsDePrise("box"));
  issue.avancer(1_000);
  assert.equal(await lacher(issue.lue(), { github: issue.github, station: "mac" }), true);
  assert.deepEqual(issue.ecrits.slice(-2), ["comment <!-- brigade:lache station=mac -->", `unlabel ${PRIS}`]);
  // La prise de box, perdante, ne remonte pas.
  assert.equal(await lireTenant(NUMERO, issue.github), null);
  issue.avancer(1_000);
  assert.equal((await prendre(issue.lue(), { github: issue.github, station: "pi" })).tenant?.station, "pi");
});

test("un retrait de label dans la seconde d'une prise passe après elle : dans le doute, le lâcher l'emporte", () => {
  const instant = "2026-11-02T10:00:00Z";
  const commentaires = [{ id: 1, body: corpsDePrise("mac"), association: "OWNER", createdAt: instant }];
  assert.equal(tenant(commentaires, [{ label: PRIS, createdAt: instant }]), null);
  assert.equal(tenant(commentaires, [{ label: "prio:high", createdAt: instant }])?.station, "mac");
});

test("une prise ou un lâcher postés par un compte étranger au dépôt ne comptent pas", async () => {
  const issue = issueSurGitHub();
  issue.commenterCommeChef(corpsDePrise("intrus"), "NONE");
  issue.avancer(1_000);
  assert.equal((await prendre(issue.lue(), { github: issue.github, station: "mac" })).prise, true);
  issue.avancer(1_000);
  issue.commenterCommeChef(corpsDeLacher("intrus"), "CONTRIBUTOR");
  assert.equal((await lireTenant(NUMERO, issue.github))?.station, "mac");
});

test("la station qui tient déjà le ticket ne reposte pas sa prise ; elle repose `taken` s'il manque", async () => {
  const issue = issueSurGitHub();
  await prendre(issue.lue(), { github: issue.github, station: "mac" });
  issue.avancer(1_000);
  const encore = await prendre(issue.lue(), { github: issue.github, station: "mac" });
  assert.equal(encore.prise, true);
  assert.equal(issue.commentaires.length, 1);
  assert.deepEqual(issue.ecrits, ["comment <!-- brigade:prise station=mac -->", `label ${PRIS}`]);
  // Arrêtée entre sa prise et son label, elle le pose au tour suivant.
  const sansLabel = await prendre({ number: NUMERO, labels: ["fire"] }, { github: issue.github, station: "mac" });
  assert.equal(sansLabel.prise, true);
  assert.deepEqual(issue.ecrits.slice(-1), [`label ${PRIS}`]);
});

test("un nom de station qui casserait le marqueur est refusé, sans rien écrire", async () => {
  const issue = issueSurGitHub();
  await assert.rejects(prendre(issue.lue(), { github: issue.github, station: "mac -->" }));
  assert.deepEqual(issue.ecrits, []);
});

test("les noms déclarés `<machine>/<moteur>` signent une prise, que l'autre station relit telle quelle", async () => {
  const issue = issueSurGitHub();
  const mac = await prendre(issue.lue(), { github: issue.github, station: "macbook-air-de-benoit/claude" });
  assert.equal(mac.prise, true);
  assert.equal(issue.commentaires[0]?.body, "<!-- brigade:prise station=macbook-air-de-benoit/claude -->\nTaken by station `macbook-air-de-benoit/claude`.");
  const box = await prendre(issue.lue(), { github: issue.github, station: "box/claude" });
  assert.equal(box.prise, false);
  assert.equal(box.tenant?.station, "macbook-air-de-benoit/claude");
  // Lâché par la tenante, le ticket est repris par l'autre.
  await lacher(issue.lue(), { github: issue.github, station: "macbook-air-de-benoit/claude" });
  issue.avancer(1_000);
  assert.equal((await prendre(issue.lue(), { github: issue.github, station: "box/claude" })).tenant?.station, "box/claude");
});

test("`prise.ts` ne lit et n'écrit que par le client de GitHub : il n'importe ni le relais, ni la boîte, ni le journal", () => {
  const source = readFileSync(join(import.meta.dirname, "../../src/github-etat/prise.ts"), "utf8");
  const imports = [...source.matchAll(/^import .* from "(.+)";$/gm)].map((ligne) => ligne[1]);
  // `alimenter.ts` ne lui donne que la liste de ceux dont un commentaire fait foi.
  assert.deepEqual(imports, ["../alimenter.ts", "../github.ts"]);
  for (const module of imports) assert.doesNotMatch(module, /relais|boite|journal/);
  assert.doesNotMatch(source, /from "node:/);
});

test("un lâcher dont le retrait de `taken` échoue laisse un label orphelin, que `purger` retire avant que le ticket ne soit repris (#2206)", async () => {
  const issue = issueSurGitHub();
  assert.equal((await prendre(issue.lue(), { github: issue.github, station: "mac" })).prise, true);
  issue.avancer(1_000);
  // Le commentaire de lâcher part, puis GitHub abandonne le retrait.
  const retrait = issue.github.delabelliser;
  issue.github.delabelliser = () => Promise.reject(new Error("The operation was aborted"));
  await assert.rejects(lacher(issue.lue(), { github: issue.github, station: "mac" }), /aborted/);
  issue.github.delabelliser = retrait;
  assert.equal(await lireTenant(NUMERO, issue.github), null);
  assert.ok(issue.lue().labels.includes(PRIS));
  assert.equal(await purger(issue.lue(), { github: issue.github }), true);
  assert.ok(!issue.lue().labels.includes(PRIS));
  // Le ticket est libre : une station le prend de nouveau.
  issue.avancer(1_000);
  assert.equal((await prendre(issue.lue(), { github: issue.github, station: "box" })).prise, true);
  assert.ok(issue.lue().labels.includes(PRIS));
});

test("purger removes a taken label nobody holds, leaves a held one, and survives a label already gone (#2206)", async () => {
  const libre = issueSurGitHub();
  await libre.github.labelliser(NUMERO, [PRIS]);
  assert.equal(await purger(libre.lue(), { github: libre.github }), true);
  assert.ok(!libre.lue().labels.includes(PRIS));
  const tenu = issueSurGitHub();
  await prendre(tenu.lue(), { github: tenu.github, station: "box" });
  assert.ok(tenu.lue().labels.includes(PRIS));
  assert.equal(await purger(tenu.lue(), { github: tenu.github }), false);
  assert.ok(tenu.lue().labels.includes(PRIS));
  const parti = issueSurGitHub();
  await parti.github.labelliser(NUMERO, [PRIS]);
  const github = { ...parti.github, delabelliser: async () => { throw new Error("HTTP 404 — Label does not exist"); } };
  assert.equal(await purger(parti.lue(), { github }), true);
});
