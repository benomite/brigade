// La station contributrice (#2935) : sans l'écriture sur le dépôt, la station
// prend un ticket par un commentaire, le cuisine dans sa fourche, et ouvre la
// PR de la fourche vers le projet. Par `aiguillerLaStation`, ce que la cuisine
// ouvre (`station/cuisine.ts`, `main.ts`) ; sur un vrai dépôt git — une origine
// nue, une fourche nue, le clone de chaque station —, seuls GitHub et le
// lancement de `claude` sont faux.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Lancer, StationGitHub } from "../../src/brigade-github.ts";
import { ouvrirDepot } from "../../src/depot.ts";
import type { Commentaire, GitHub } from "../../src/github.ts";
import { aiguillerLaStation } from "../../src/station-contributrice/aiguillage.ts";
import { BAIL_DE_PRISE_MS, corpsDeReclamation, corpsDeRendu } from "../../src/station-contributrice/reclamation.ts";
import { BASE, commiter, depotGit, ENV_GIT, git, repertoireTemporaire } from "../outils.ts";

const PROJET = "acme/shop";
const CALIBRE = ["fire", "model:sonnet", "effort:medium"];

type PROuverte = { head: string; base: string; titre: string; corps: string };

// Le projet sur GitHub, que les stations lisent et commentent. Chaque
// commentaire est daté de l'horloge du faux, qu'il avance d'une seconde.
class Projet {
  horloge = Date.parse("2026-11-08T10:00:00Z");
  tickets = new Map<number, { labels: string[]; body: string; state: "open" | "closed" }>();
  commentaires = new Map<number, Commentaire[]>();
  prs: PROuverte[] = [];
  // La course de deux comptes sur un ticket libre : le second ne poste sa prise
  // qu'une fois celle du premier postée, et le premier ne poste la sienne qu'une
  // fois le second venu poster — il a donc lu le ticket libre.
  private course: { premier: string; second: string; venu: Promise<void>; venir: () => void; posee: Promise<void>; poser: () => void } | null = null;

  ajouter(numero: number, labels = CALIBRE, body = "") {
    this.tickets.set(numero, { labels, body, state: "open" });
    this.commentaires.set(numero, []);
  }

  retenir(second: string, premier: string) {
    let venir = () => {};
    let poser = () => {};
    const venu = new Promise<void>((resoudre) => (venir = resoudre));
    const posee = new Promise<void>((resoudre) => (poser = resoudre));
    this.course = { premier, second, venu, venir, posee, poser };
  }

  poster(numero: number, author: string, body: string) {
    this.commentaires.get(numero)?.push({ body, author, association: "NONE", createdAt: new Date(this.horloge).toISOString() });
    this.horloge += 1_000;
  }

  premieresLignes(numero: number) {
    return (this.commentaires.get(numero) ?? []).map(({ author, body }) => `${author}: ${body.split("\n")[0]}`);
  }

  // Le client GitHub d'un compte : `ecriture` dit s'il a l'écriture sur le dépôt.
  client(login: string, fourche: string, options: { ecriture?: boolean; droits?: () => Promise<never> } = {}): GitHub {
    const issue = (numero: number) => {
      const lu = this.tickets.get(numero);
      return lu === undefined ? null : { number: numero, title: `ticket ${numero}`, labels: lu.labels, state: lu.state, createdAt: "", updatedAt: "", url: "", body: lu.body };
    };
    const client: Partial<GitHub> = {
      droits: options.droits ?? (async () => ({ login, ecriture: options.ecriture ?? false })),
      fourcher: async () => ({ proprietaire: login, url: fourche }),
      tickets: async () => ({
        inchange: false,
        issues: [...this.tickets.keys()].map((numero) => issue(numero)).filter((lu) => lu !== null && lu.state === "open" && lu.labels.includes("fire")) as never,
        confirmer: () => {},
      }),
      issue: async (numero) => issue(numero),
      commentaires: async (numero) => [...(this.commentaires.get(numero) ?? [])],
      commenter: async (numero, body) => {
        const prise = body.startsWith("<!-- brigade:reclame");
        const course = this.course;
        if (prise && course?.second === login) {
          course.venir();
          await course.posee;
        }
        if (prise && course?.premier === login) await course.venu;
        this.poster(numero, login, body);
        if (prise && course?.premier === login) course.poser();
      },
      prsOuvertes: async () => this.prs.map(({ head }) => ({ number: 0, branche: head.split(":")[1] as string, fichiers: [] })),
      ouvrirPR: async ({ branche, base, titre, corps }) => {
        this.prs.push({ head: branche, base, titre, corps });
        return `https://github.com/${PROJET}/pull/${100 + this.prs.length}`;
      },
    };
    return client as GitHub;
  }
}

// La station GitHub seul, que l'aiguillage ne doit pas faire tourner sans l'écriture.
function ecrivaine(tours: string[], login: string): StationGitHub {
  return { tour: async () => void tours.push(login), enCuisine: () => [], calme: async () => {}, relu: async () => {} };
}

// Le cook : il commite dans son worktree (`livrer`) ou n'y fait rien, et conclut.
function lanceur(cooks: string[], login: string, livrer = true): Lancer {
  return ({ cwd, flux }) => {
    cooks.push(`${login}:${/cook\/(\d+)-github|(\d+)-github/.exec(cwd)?.[0] ?? cwd}`);
    if (livrer) commiter(cwd, `livraison-${login}.txt`);
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: "done" })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
}

// Une station contributrice sur sa machine : son clone du projet, sa fourche nue.
function station(t: TestContext, projet: Projet, login: string, origine: string, options: { livrer?: boolean; fourche?: string; ecriture?: boolean; droits?: () => Promise<never>; maintenant?: () => Date } = {}) {
  const racine = repertoireTemporaire(t);
  const clone = join(racine, "clone");
  git(racine, "clone", "-q", origine, clone);
  const fourche = options.fourche ?? join(racine, "fourche.git");
  if (options.fourche === undefined) git(racine, "clone", "-q", "--bare", origine, fourche);
  const cooks: string[] = [];
  const dits: string[] = [];
  const tours: string[] = [];
  const ouverte = aiguillerLaStation(projet.client(login, fourche, options), ecrivaine(tours, login), {
    nom: `${login}-pc/claude`,
    places: 1,
    base: BASE,
    depotGitHub: PROJET,
    depot: ouvrirDepot({ clone, base: BASE, worktrees: join(racine, "worktrees"), env: ENV_GIT }),
    clone,
    claude: "claude-absent",
    env: ENV_GIT,
    cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1,
    flux: join(racine, "flux"),
    lancer: lanceur(cooks, login, options.livrer),
    avertir: (ligne) => void dits.push(ligne),
    // L'heure de la station est celle du faux GitHub, qui date les prises.
    maintenant: options.maintenant ?? (() => new Date(projet.horloge)),
  });
  if ("refus" in ouverte) assert.fail(ouverte.refus);
  t.after(() => ouverte.calme());
  const servir = async () => {
    await ouverte.tour();
    await ouverte.calme();
  };
  return { servir, station: ouverte, cooks, dits, tours, fourche, clone };
}

test("a station with no write access cooks a ticket in its fork and opens a PR from the fork to the project", async (t) => {
  const projet = new Projet();
  projet.ajouter(7);
  const { origine } = depotGit(t);
  const outsider = station(t, projet, "outsider", origine);
  await outsider.servir();

  assert.deepEqual(outsider.tours, [], "the GitHub-only station, which labels and merges, never runs");
  assert.deepEqual(outsider.cooks, ["outsider:7-github"], outsider.dits.join("\n"));
  // Le travail du cook est sur la fourche, pas sur l'origine.
  assert.match(git(outsider.fourche, "log", "--format=%s", "-1", "cook/7-github"), /livraison-outsider/);
  assert.equal(git(origine, "branch", "--list", "cook/7-github"), "");
  assert.deepEqual(projet.prs, [{ head: "outsider:cook/7-github", base: BASE, titre: "#7 — ticket 7", corps: "Closes #7\n\nCooked by contributor station `outsider-pc/claude` (@outsider), from the fork `outsider`." }]);
  // Une seule écriture sur l'issue : sa prise, signée de son compte ; elle tient encore.
  assert.deepEqual(projet.premieresLignes(7), ["outsider: <!-- brigade:reclame station=outsider-pc/claude login=outsider -->"]);
  assert.ok(outsider.dits.some((dit) => dit.includes("has no write access")), outsider.dits.join("\n"));
  assert.ok(outsider.dits.some((dit) => dit.includes(`delivered from the fork: https://github.com/${PROJET}/pull/101`)), outsider.dits.join("\n"));

  // Sa PR ouverte, le ticket ne se recuisine pas au tour suivant.
  await outsider.servir();
  assert.equal(outsider.cooks.length, 1);
  assert.equal(projet.prs.length, 1);
});

test("a station with write access keeps the GitHub-only station: no fork, no claim comment", async (t) => {
  const projet = new Projet();
  projet.ajouter(7);
  const { origine } = depotGit(t);
  const chef = station(t, projet, "chef", origine, { ecriture: true });
  await chef.servir();
  await chef.servir();
  assert.deepEqual(chef.tours, ["chef", "chef"]);
  assert.deepEqual(chef.cooks, []);
  assert.deepEqual(projet.premieresLignes(7), []);
});

for (const tickets of [[7, 8], [7]]) {
  test(`two contributor stations race on the same ticket: only one claims and cooks it, the other takes ${tickets.length === 1 ? "none" : "a different ticket"}`, async (t) => {
    const projet = new Projet();
    for (const numero of tickets) projet.ajouter(numero);
    const { origine } = depotGit(t);
    const alice = station(t, projet, "alice", origine);
    const bob = station(t, projet, "bob", origine);
    // Bob lit #7 libre, mais ne poste sa prise qu'après celle d'alice.
    projet.retenir("bob", "alice");
    await Promise.all([alice.servir(), bob.servir()]);

    assert.deepEqual(alice.cooks, ["alice:7-github"]);
    assert.deepEqual(projet.premieresLignes(7), [
      "alice: <!-- brigade:reclame station=alice-pc/claude login=alice -->",
      "bob: <!-- brigade:reclame station=bob-pc/claude login=bob -->",
      "bob: <!-- brigade:rend station=bob-pc/claude login=bob -->",
    ]);
    if (tickets.length === 1) {
      assert.deepEqual(bob.cooks, []);
      assert.deepEqual(projet.prs.map(({ head }) => head), ["alice:cook/7-github"]);
    } else {
      assert.deepEqual(bob.cooks, ["bob:8-github"]);
      assert.deepEqual(projet.prs.map(({ head }) => head).sort(), ["alice:cook/7-github", "bob:cook/8-github"]);
      assert.deepEqual(projet.premieresLignes(8), ["bob: <!-- brigade:reclame station=bob-pc/claude login=bob -->"]);
    }
  });
}

test("a ticket another station claimed is not offered until the claim is released or expires", async (t) => {
  const projet = new Projet();
  projet.ajouter(7);
  projet.poster(7, "alice", corpsDeReclamation("alice-pc/claude", "alice"));
  const { origine } = depotGit(t);
  let maintenant = projet.horloge;
  const bob = station(t, projet, "bob", origine, { maintenant: () => new Date(maintenant) });

  await bob.servir();
  assert.deepEqual(bob.cooks, [], "claimed by alice");
  assert.equal(projet.premieresLignes(7).length, 1, "bob writes nothing on it");

  // Alice le lâche : bob le prend au tour suivant.
  projet.poster(7, "alice", corpsDeRendu("alice-pc/claude", "alice"));
  maintenant = projet.horloge;
  await bob.servir();
  assert.deepEqual(bob.cooks, ["bob:7-github"]);

  // Une prise échue ne retient plus : un autre ticket, pris par alice il y a plus d'un bail.
  projet.ajouter(9);
  const posee = projet.horloge;
  projet.poster(9, "alice", corpsDeReclamation("alice-pc/claude", "alice"));
  maintenant = posee + BAIL_DE_PRISE_MS - 1_000;
  await bob.servir();
  assert.deepEqual(bob.cooks, ["bob:7-github"], "still within alice's lease");
  maintenant = posee + BAIL_DE_PRISE_MS;
  await bob.servir();
  assert.deepEqual(bob.cooks, ["bob:7-github", "bob:9-github"]);
});

test("a ticket the repository's stations hold, an epic or an uncalibrated ticket is not taken", async (t) => {
  const projet = new Projet();
  projet.ajouter(7, [...CALIBRE, "taken"]);
  projet.ajouter(8, [...CALIBRE, "blocked-on-human"]);
  projet.ajouter(9, ["fire"]);
  projet.ajouter(10, CALIBRE, "Depends on #11");
  projet.ajouter(11, ["bug"]);
  const { origine } = depotGit(t);
  const bob = station(t, projet, "bob", origine);
  await bob.servir();
  assert.deepEqual(bob.cooks, []);
  for (const numero of [7, 8, 9, 10]) assert.deepEqual(projet.premieresLignes(numero), []);
});

test("a cook that commits nothing releases its claim, and no PR opens", async (t) => {
  const projet = new Projet();
  projet.ajouter(7);
  const { origine } = depotGit(t);
  const bob = station(t, projet, "bob", origine, { livrer: false });
  await bob.servir();
  assert.deepEqual(bob.cooks, ["bob:7-github"]);
  assert.deepEqual(projet.prs, []);
  assert.deepEqual(projet.premieresLignes(7), ["bob: <!-- brigade:reclame station=bob-pc/claude login=bob -->", "bob: <!-- brigade:rend station=bob-pc/claude login=bob -->"]);
  assert.ok(bob.dits.some((dit) => dit.includes("the cook committed nothing; the ticket is released")), bob.dits.join("\n"));
  // Lâché, il se reprend au tour suivant, depuis la base.
  await bob.servir();
  assert.deepEqual(bob.cooks, ["bob:7-github", "bob:7-github"]);
});

test("a fork the push cannot reach releases the claim, says why, and opens no PR", async (t) => {
  const projet = new Projet();
  projet.ajouter(7);
  const { origine } = depotGit(t);
  const bob = station(t, projet, "bob", origine, { fourche: join(repertoireTemporaire(t), "absente.git") });
  await bob.servir();
  assert.deepEqual(projet.prs, []);
  assert.equal(projet.premieresLignes(7).at(-1), "bob: <!-- brigade:rend station=bob-pc/claude login=bob -->");
  assert.ok(bob.dits.some((dit) => dit.includes("could not be pushed to the fork")), bob.dits.join("\n"));
});

test("rights that cannot be read fail the turn and nothing is cooked; the next turn reads them again", async (t) => {
  const projet = new Projet();
  projet.ajouter(7);
  const { origine } = depotGit(t);
  let lectures = 0;
  const bob = station(t, projet, "bob", origine, {
    droits: async () => {
      lectures += 1;
      throw new Error("gh api user : HTTP 502");
    },
  });
  await assert.rejects(bob.station.tour(), /HTTP 502/);
  await assert.rejects(bob.station.tour(), /HTTP 502/);
  assert.equal(lectures, 2);
  assert.deepEqual(bob.cooks, []);
  assert.deepEqual(bob.tours, []);
  assert.deepEqual(projet.premieresLignes(7), []);
});

test("a cook branch an earlier cook left in the clone does not hold the ticket: the new cook starts from the base", async (t) => {
  const projet = new Projet();
  projet.ajouter(7);
  const { origine } = depotGit(t);
  const bob = station(t, projet, "bob", origine);
  // Une branche d'un cook d'avant, restée dans le clone.
  git(bob.clone, "branch", "cook/7-github", `origin/${BASE}`);
  await bob.servir();
  assert.deepEqual(bob.cooks, ["bob:7-github"], bob.dits.join("\n"));
  assert.equal(projet.prs.length, 1);
});
