// La relecture et le merge d'une PR sous le seul état de GitHub : n'importe
// quelle station relit, n'importe quelle station merge, et une branche en
// retard sur sa base ne se merge pas — GitHub est prié de la mettre à jour.
//
// Un faux GitHub, en mémoire, que partagent toutes les stations ; chacune y
// agit par son propre port. Il tient la règle « à jour avant le merge » comme
// le dépôt la déclare : il refuse lui-même le merge d'une branche en retard.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Commentaire } from "../../src/github.ts";
import { approuvee, commentaireDeVerdict, dernierVerdict, fusionnable, fusionner, relire, type GitHubDeLaFusion } from "../../src/github-etat/fusion.ts";

type PRDuDepot = { number: number; cuisinee: string; sha: string; surLaBase: string; state: "open" | "closed"; merged: boolean; commentaires: Commentaire[]; etatForce?: string };
type Appel = { station: string; appel: "commenter" | "mettreAJour" | "merger"; numero: number };

// Le compte sous lequel les stations tournent : celui du chef, qui a ouvert
// les PR.
const CHEF = "chef";

function depot() {
  let base = "b0";
  let commits = 0;
  let horloge = Date.parse("2026-11-02T10:00:00Z");
  const prs = new Map<number, PRDuDepot>();
  const appels: Appel[] = [];
  const trouver = (numero: number) => {
    const pr = prs.get(numero);
    if (!pr) throw new Error(`gh api repos/o/r/pulls/${numero} : HTTP 404`);
    return pr;
  };
  const etat = (pr: PRDuDepot) => pr.etatForce ?? (pr.surLaBase === base ? "clean" : "behind");
  const poster = (numero: number, corps: string, auteur = CHEF, association = "OWNER") => {
    horloge += 1000;
    trouver(numero).commentaires.push({ body: corps, author: auteur, association, createdAt: new Date(horloge).toISOString() });
  };

  // Le port de la fusion qu'a la station `nom`. `identite` n'est pas du port :
  // la poser et la faire lever prouve que la fusion ne la demande jamais.
  const station = (nom: string): GitHubDeLaFusion & { identite(): Promise<string> } => ({
    identite: async () => {
      throw new Error("la fusion n'a pas à savoir quelle station l'appelle");
    },
    pr: async (numero) => {
      const pr = trouver(numero);
      return { number: pr.number, sha: pr.sha, state: pr.state, merged: pr.merged, etatDeFusion: etat(pr) };
    },
    commentaires: async (numero) => [...trouver(numero).commentaires],
    commenter: async (numero, corps) => {
      appels.push({ station: nom, appel: "commenter", numero });
      poster(numero, corps);
    },
    mettreAJour: async (numero, sha) => {
      appels.push({ station: nom, appel: "mettreAJour", numero });
      const pr = trouver(numero);
      if (pr.sha !== sha) throw new Error(`gh api repos/o/r/pulls/${numero}/update-branch : HTTP 422`);
      pr.sha = `m${++commits}`;
      pr.surLaBase = base;
    },
    merger: async (numero, sha) => {
      appels.push({ station: nom, appel: "merger", numero });
      const pr = trouver(numero);
      if (pr.sha !== sha) return { fait: false, motif: "HTTP 409 — Head branch was modified" };
      if (etat(pr) === "behind") return { fait: false, motif: "HTTP 405 — Head branch is out of date" };
      pr.merged = true;
      pr.state = "closed";
      base = `b${++commits}`;
      return { fait: true };
    },
  });

  return {
    station,
    appels,
    poster,
    // La station `cuisinee` livre : sa PR part de la base du moment.
    livrer: (numero: number, cuisinee: string) => {
      const pr: PRDuDepot = { number: numero, cuisinee, sha: `t${numero}`, surLaBase: base, state: "open", merged: false, commentaires: [] };
      prs.set(numero, pr);
      return pr;
    },
    // Un autre merge passe sur la base : les PR ouvertes sont en retard.
    avancerLaBase: () => void (base = `b${++commits}`),
  };
}

const APPROUVE = { verdict: "approuve" as const, corps: "Critères tenus." };
const A_REPRENDRE = { verdict: "a-reprendre" as const, corps: "Le critère 2 n'est pas tenu." };

test("le verdict d'une station autre que celle qui a cuisiné rend la PR approuvée", async () => {
  const github = depot();
  const pr = github.livrer(12, "station-a");
  const relectrice = github.station("station-b");
  assert.equal(await fusionnable(pr, github.station("station-a")), false, "sans verdict, la PR n'est pas approuvée");

  await relire(pr, APPROUVE, relectrice);

  assert.deepEqual(github.appels, [{ station: "station-b", appel: "commenter", numero: 12 }]);
  assert.ok(approuvee(pr.commentaires));
  assert.deepEqual(dernierVerdict(pr.commentaires), { verdict: "approuve", sha: "t12" });
  // Toute station le lit approuvée, celle qui a cuisiné comme une troisième.
  assert.equal(await fusionnable(pr, github.station("station-a")), true);
  assert.equal(await fusionnable(pr, github.station("station-c")), true);
});

test("la station qui a cuisiné peut relire elle aussi", async () => {
  const github = depot();
  const pr = github.livrer(13, "station-a");
  await relire(pr, APPROUVE, github.station("station-a"));
  assert.equal(await fusionnable(pr, github.station("station-b")), true);
});

test("le dernier verdict tranche : une reprise demandée retire l'approbation, une nouvelle approbation la rend", async () => {
  const github = depot();
  const pr = github.livrer(14, "station-a");
  await relire(pr, APPROUVE, github.station("station-b"));
  await relire(pr, A_REPRENDRE, github.station("station-c"));
  assert.equal(approuvee(pr.commentaires), false);
  assert.equal(await fusionnable(pr, github.station("station-a")), false);
  assert.deepEqual(await fusionner(pr, github.station("station-a")), { issue: "refusee", motif: "PR non approuvée" });

  await relire(pr, APPROUVE, github.station("station-b"));
  assert.equal(await fusionnable(pr, github.station("station-a")), true);
});

test("un verdict ne fait foi que d'un compte du dépôt, et seulement en tête du commentaire", async () => {
  const github = depot();
  const pr = github.livrer(15, "station-a");
  github.poster(15, commentaireDeVerdict("t15", APPROUVE), "passant", "NONE");
  github.poster(15, `Je cite : ${commentaireDeVerdict("t15", APPROUVE)}`);
  assert.equal(dernierVerdict(pr.commentaires), null);
  assert.equal(await fusionnable(pr, github.station("station-a")), false);

  github.poster(15, commentaireDeVerdict("t15", APPROUVE), "collegue", "COLLABORATOR");
  assert.equal(await fusionnable(pr, github.station("station-a")), true);
});

test("fusionnable est faux tant que la branche est en retard sur sa base, vrai une fois à jour et approuvée", async () => {
  const github = depot();
  const pr = github.livrer(20, "station-a");
  const station = github.station("station-b");
  await relire(pr, APPROUVE, station);
  github.avancerLaBase();
  assert.equal(await fusionnable(pr, station), false, "approuvée mais en retard");

  assert.deepEqual(await fusionner(pr, station), { issue: "mise-a-jour-demandee" });
  assert.equal(pr.sha, "m2", "GitHub a mis la branche à jour : sa tête a changé");
  // L'approbation tient sur la nouvelle tête : la mise à jour n'a rien changé
  // à ce qui a été relu.
  assert.equal(await fusionnable(pr, station), true, "à jour et approuvée");
});

test("à jour mais pas approuvée, la PR n'est pas fusionnable", async () => {
  const github = depot();
  const pr = github.livrer(21, "station-a");
  assert.equal(await fusionnable(pr, github.station("station-a")), false);
  assert.deepEqual(await fusionner(pr, github.station("station-a")), { issue: "refusee", motif: "PR non approuvée" });
  assert.equal(github.appels.some((appel) => appel.appel === "merger"), false);
});

test("une branche en retard déclenche une demande de mise à jour, jamais un merge", async () => {
  const github = depot();
  const pr = github.livrer(30, "station-a");
  await relire(pr, APPROUVE, github.station("station-b"));
  github.avancerLaBase();

  const fusion = await fusionner(pr, github.station("station-c"));

  assert.deepEqual(fusion, { issue: "mise-a-jour-demandee" });
  assert.deepEqual(
    github.appels.filter((appel) => appel.appel !== "commenter"),
    [{ station: "station-c", appel: "mettreAJour", numero: 30 }],
  );
  assert.equal(pr.merged, false);
});

test("deux PR approuvées : la première mergée met la seconde en retard, qui est mise à jour avant d'être mergée", async () => {
  const github = depot();
  const premiere = github.livrer(31, "station-a");
  const seconde = github.livrer(32, "station-b");
  await relire(premiere, APPROUVE, github.station("station-c"));
  await relire(seconde, APPROUVE, github.station("station-c"));

  assert.deepEqual(await fusionner(premiere, github.station("station-a")), { issue: "mergee" });
  assert.equal(await fusionnable(seconde, github.station("station-b")), false);
  assert.deepEqual(await fusionner(seconde, github.station("station-b")), { issue: "mise-a-jour-demandee" });
  assert.deepEqual(await fusionner(seconde, github.station("station-b")), { issue: "mergee" });
  assert.deepEqual(
    github.appels.filter((appel) => appel.appel !== "commenter"),
    [
      { station: "station-a", appel: "merger", numero: 31 },
      { station: "station-b", appel: "mettreAJour", numero: 32 },
      { station: "station-b", appel: "merger", numero: 32 },
    ],
  );
});

test("le merge est tenté par la station qui l'appelle, quelle qu'elle soit, sans qu'aucune identité de station principale soit lue", async () => {
  const github = depot();
  const stations = ["station-a", "station-b", "station-c"];
  for (const [i, nom] of stations.entries()) {
    const pr = github.livrer(40 + i, stations[(i + 1) % stations.length] as string);
    await relire(pr, APPROUVE, github.station(stations[(i + 2) % stations.length] as string));
    // Chaque station merge la PR d'une autre : la base n'avance qu'après.
    assert.deepEqual(await fusionner(pr, github.station(nom)), { issue: "mergee" }, `${nom} merge #${pr.number}`);
  }
  assert.deepEqual(
    github.appels.filter((appel) => appel.appel === "merger"),
    stations.map((station, i) => ({ station, appel: "merger", numero: 40 + i })),
  );
});

test("une PR déjà mergée par une autre station est mergée : la seconde ne merge pas une deuxième fois", async () => {
  const github = depot();
  const pr = github.livrer(50, "station-a");
  await relire(pr, APPROUVE, github.station("station-b"));
  assert.deepEqual(await fusionner(pr, github.station("station-a")), { issue: "mergee" });
  assert.deepEqual(await fusionner(pr, github.station("station-b")), { issue: "mergee" });
  assert.equal(github.appels.filter((appel) => appel.appel === "merger").length, 1);
  assert.equal(await fusionnable(pr, github.station("station-b")), false, "une PR mergée n'est plus à merger");
});

test("en conflit, bloquée ou pas encore calculée par GitHub, la PR n'est pas fusionnable et rien n'est tenté", async () => {
  for (const etat of ["dirty", "blocked", "unknown", "draft"]) {
    const github = depot();
    const pr = github.livrer(60, "station-a");
    await relire(pr, APPROUVE, github.station("station-b"));
    pr.etatForce = etat;
    assert.equal(await fusionnable(pr, github.station("station-a")), false, etat);
    assert.deepEqual(await fusionner(pr, github.station("station-a")), { issue: "refusee", motif: `GitHub ne dit pas la branche prête à merger (${etat})` }, etat);
    assert.deepEqual(github.appels.filter((appel) => appel.appel !== "commenter"), [], etat);
  }
});

test("une PR fermée sans merge n'est ni fusionnable ni mergée", async () => {
  const github = depot();
  const pr = github.livrer(70, "station-a");
  await relire(pr, APPROUVE, github.station("station-b"));
  pr.state = "closed";
  assert.equal(await fusionnable(pr, github.station("station-a")), false);
  assert.deepEqual(await fusionner(pr, github.station("station-a")), { issue: "refusee", motif: "PR fermée sans merge" });
});

test("un refus de GitHub au merge est rendu tel quel : rien n'est mergé", async () => {
  const github = depot();
  const pr = github.livrer(80, "station-a");
  await relire(pr, APPROUVE, github.station("station-b"));
  const station = github.station("station-a");
  // La tête bouge entre la lecture et le merge : GitHub refuse le merge sous l'ancienne.
  const port: GitHubDeLaFusion = { ...station, pr: async (numero) => ({ ...(await station.pr(numero)), sha: "ancienne" }) };
  assert.deepEqual(await fusionner(pr, port), { issue: "refusee", motif: "HTTP 409 — Head branch was modified" });
  assert.equal(pr.merged, false);
});
