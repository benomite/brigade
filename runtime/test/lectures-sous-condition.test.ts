// Les lectures répétées de la station, redemandées sous condition : tant que
// rien n'a changé sur GitHub, il répond 304 — sans le compter dans son quota,
// ni la box dans le sien —, et ce qui change se lit au tick suivant. Une heure
// de ticks sur quatre projets, contre un faux `gh` qui tient l'ETag de chaque
// ressource.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { canalGitHub } from "../src/appairage/canal.ts";
import { decrireEtat, lireEtat } from "../src/etat.ts";
import { ouvrirGitHub, type GitHub } from "../src/github.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { appelsDeLaStation, FENETRE_MS, limiteDeLaStation } from "../src/limite-github.ts";
import { aArreter, fauxGh, repertoireTemporaire, type FauxGh } from "./outils.ts";

const MINUTE = 60_000;
// Un tick du runtime ; le projet de la station relit son gist toutes les 30 s.
const TICK_MS = MINUTE;
const LECTURES_DU_GIST_PAR_TICK = 2;
const GIST = "abc123";
// Quatre projets ; brigade a un ticket de plus sur son rail que les autres.
const PROJETS: Record<string, number[]> = { brigade: [11, 12, 13], espace: [21, 22], "calculus-workspace": [31, 32], atelier: [41, 42] };

const depotDe = (projet: string) => `o/${projet}`;
const chemins = (projet: string, ticket: number) => {
  const depot = depotDe(projet);
  return {
    issue: `repos/${depot}/issues/${ticket}`,
    commentaires: `repos/${depot}/issues/${ticket}/comments?per_page=100`,
    prs: `repos/${depot}/pulls?head=o:cook/${ticket}&state=all&per_page=1`,
    pr: `repos/${depot}/pulls/${ticket + 1000}`,
  };
};

const issue = (projet: string, ticket: number, labels = ["fire"]) => ({
  number: ticket,
  title: `Ticket ${ticket}`,
  state: "open",
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-08T09:00:00Z",
  html_url: `https://github.com/${depotDe(projet)}/issues/${ticket}`,
  labels: labels.map((name) => ({ name })),
});
const pr = (projet: string, ticket: number, merged = false) => ({
  number: ticket + 1000,
  html_url: `https://github.com/${depotDe(projet)}/pull/${ticket + 1000}`,
  state: merged ? "closed" : "open",
  merged,
  mergeable_state: "clean",
  base: { ref: "v2" },
  head: { sha: `sha${ticket}` },
  merged_by: merged ? { login: "chef" } : null,
});
const commentaire = (body: string) => ({ body, author_association: "OWNER", user: { login: "chef" }, created_at: "2026-10-08T09:00:00Z" });

// L'état de GitHub, dicté au faux `gh` ; `etags` : GitHub donne un ETag à
// chaque ressource — sans, il ne peut répondre 304 à rien, et chaque lecture
// est pleine, comme toutes l'étaient pour la box avant ce ticket.
function dicterGitHub(gh: FauxGh, etags: boolean) {
  const etag = (nom: string, version = 1) => (etags ? `W/"${nom}-${version}"` : undefined);
  for (const [projet, tickets] of Object.entries(PROJETS)) {
    const depot = depotDe(projet);
    const liste = tickets.map((ticket) => issue(projet, ticket));
    gh.repondre(`repos/${depot}/issues?labels=fire&state=open&per_page=100`, { etag: etag(`${projet}-fire`), corps: liste });
    gh.repondre(`repos/${depot}/issues?state=open&per_page=100`, { etag: etag(`${projet}-ouvertes`), corps: liste });
    for (const ticket of tickets) {
      const c = chemins(projet, ticket);
      gh.repondre(c.issue, { etag: etag(`${projet}-${ticket}`), corps: issue(projet, ticket) });
      gh.repondre(c.commentaires, { etag: etag(`${projet}-${ticket}-commentaires`), corps: [] });
      gh.repondre(c.prs, { etag: etag(`${projet}-${ticket}-prs`), corps: [pr(projet, ticket)] });
      gh.repondre(c.pr, { etag: etag(`${projet}-${ticket}-pr`), corps: pr(projet, ticket) });
    }
  }
  gh.repondre(`/gists/${GIST}`, { etag: etag("gist"), corps: { id: GIST, files: { "projets.json": { content: "{}" } } } });
}

// Une station de quatre projets, sur une horloge simulée : chaque projet tient
// son GitHub, tous le même compteur, celui de la station.
function uneStation(t: TestContext, etags: boolean) {
  const gh = fauxGh(t);
  dicterGitHub(gh, etags);
  const racine = repertoireTemporaire(t);
  let instant = Date.parse("2026-10-22T08:00:00Z");
  const maintenant = () => instant;
  const limite = limiteDeLaStation(racine, { maintenant });
  aArreter(t, () => limite.fermer());
  const githubs = Object.fromEntries(Object.keys(PROJETS).map((projet) => [projet, ouvrirGitHub({ depot: depotDe(projet), bin: gh.bin, limite, projet, maintenant })])) as Record<string, GitHub>;
  aArreter(t, () => Object.values(githubs).forEach((github) => github.fermer()));
  const canal = canalGitHub({ gh: gh.bin, limite, maintenant });

  // Ce qu'un tick relit de GitHub, projet par projet : le sondage des tickets
  // et celui du manager, puis, pour chaque ticket du rail, son issue, ses
  // commentaires et sa PR ; et le gist de la station.
  const tick = async () => {
    await Promise.all(
      Object.entries(PROJETS).map(async ([projet, tickets]) => {
        const github = githubs[projet]!;
        for (const sondage of [await github.tickets(), await github.ouvertes()]) if (!sondage.inchange) sondage.confirmer();
        for (const ticket of tickets) {
          await github.issue(ticket);
          await github.commentaires(ticket);
          await github.prDeBranche(`cook/${ticket}`);
        }
      }),
    );
    for (let i = 0; i < LECTURES_DU_GIST_PAR_TICK; i++) await canal.lire(GIST);
  };
  // Les appels comptés pendant un tick, l'horloge avancée d'un tick ensuite.
  const compterUnTick = async (): Promise<number> => {
    const avant = limite.appels();
    await tick();
    const compte = limite.appels() - avant;
    instant += TICK_MS;
    return compte;
  };
  return { gh, racine, limite, githubs, maintenant, compterUnTick };
}

// Un tick lit, sur l'ensemble des projets, 2 sondages par projet et 4 appels
// par ticket (issue, commentaires, et la PR : sa liste puis sa fiche), plus le gist.
const TICKETS = Object.values(PROJETS).flat().length;
const LECTURES_PAR_TICK = 2 * Object.keys(PROJETS).length + 4 * TICKETS + LECTURES_DU_GIST_PAR_TICK;

test("avant : sans réponse 304, chaque tick de quatre projets compte toutes ses lectures, et l'heure dépasse le budget", async (t) => {
  const { gh, compterUnTick } = uneStation(t, false);
  const parTick = [await compterUnTick(), await compterUnTick(), await compterUnTick()];
  assert.deepEqual(parTick, [LECTURES_PAR_TICK, LECTURES_PAR_TICK, LECTURES_PAR_TICK]);
  assert.equal(gh.appels().length, 3 * LECTURES_PAR_TICK);
  // 46 appels par tick, soixante ticks par heure : 2 760.
  assert.ok(LECTURES_PAR_TICK * 60 > 2500, `${LECTURES_PAR_TICK * 60}`);
});

// Soixante ticks, chacun de ses lectures par la doublure de `gh` : quelques
// secondes sous Linux, mais de 70 à 120 s sur un runner Windows, où chaque
// process coûte cher — au bord des deux minutes laissées à un test. Sa garde
// est plus large : elle ne sert qu'à ce qu'un test bloqué finisse par le dire.
test("une heure de ticks sur quatre projets sans rien de changé sur GitHub : les lectures partent toujours, mais seules celles du premier tick comptent, et `status` dit l'heure réduite et qui en a fait le plus", { timeout: 600_000 }, async (t) => {
  const { gh, racine, maintenant, compterUnTick } = uneStation(t, true);
  const parTick: number[] = [];
  for (let i = 0; i < 60; i++) parTick.push(await compterUnTick());

  // Chaque tick a bien relu GitHub : rien n'est servi sans lui demander.
  assert.equal(gh.appels().length, 60 * LECTURES_PAR_TICK);
  // Le premier tick lit tout ; le second gist du premier tick est déjà un 304.
  assert.equal(parTick[0], LECTURES_PAR_TICK - 1);
  assert.deepEqual(new Set(parTick.slice(1)), new Set([0]));
  const heure = parTick.reduce((somme, n) => somme + n, 0);
  assert.ok(heure < 2500, `${heure}`);

  // `status`, lu à l'instant du soixantième tick : l'heure qu'il couvre les tient tous.
  const instant = maintenant() - TICK_MS;
  const appels = appelsDeLaStation(racine, instant);
  assert.ok(appels);
  assert.equal(appels.total, heure);
  // brigade a trois tickets : 2 sondages + 3 × 4 lectures ; la PR, lue deux
  // fois par ticket, est la lecture la plus fréquente : 2 × 9 tickets.
  assert.deepEqual(appels.parProjet[0], { nom: "brigade", appels: 14 });
  assert.deepEqual(appels.parLecture[0], { nom: "pull-requests", appels: 2 * TICKETS });
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => new Date(instant) });
  aArreter(t, () => journal.fermer());
  const lignes = decrireEtat(lireEtat(journal, new Date(instant)), new Date(instant), undefined, null, appels);
  assert.ok(lignes.some((ligne) => ligne.includes(`${heure} calls in the last hour`)), lignes.join("\n"));
  assert.ok(lignes.some((ligne) => ligne.includes(`most calls: project brigade (14), kind pull-requests (${2 * TICKETS})`)), lignes.join("\n"));
});

test("une issue, une PR ou un commentaire qui change se lit au tick suivant, et seule sa lecture compte", async (t) => {
  const { gh, githubs, limite, compterUnTick } = uneStation(t, true);
  await compterUnTick();
  assert.equal(await compterUnTick(), 0);

  const brigade = chemins("brigade", 11);
  gh.repondre(brigade.issue, { etag: 'W/"brigade-11-2"', corps: issue("brigade", 11, ["fire", "waiting"]) });
  gh.repondre(chemins("espace", 21).commentaires, { etag: 'W/"espace-21-commentaires-2"', corps: [commentaire("A question for the chef")] });
  gh.repondre(chemins("atelier", 42).pr, { etag: 'W/"atelier-42-pr-2"', corps: pr("atelier", 42, true) });

  const avant = limite.appels();
  assert.deepEqual((await githubs.brigade!.issue(11))?.labels, ["fire", "waiting"]);
  assert.deepEqual((await githubs.espace!.commentaires(21)).map((c) => c.body), ["A question for the chef"]);
  const mergee = await githubs.atelier!.prDeBranche("cook/42");
  assert.equal(mergee?.merged, true);
  assert.equal(mergee?.mergeePar, "chef");
  // Trois lectures pleines, et la liste des PR d'atelier, inchangée : un 304.
  assert.equal(limite.appels() - avant, 3);
  // Le tick suivant ne relit pleinement plus rien.
  assert.equal(await compterUnTick(), 0);
  // Ce qui n'a pas changé est rendu tel que lu.
  assert.deepEqual((await githubs.brigade!.issue(12))?.labels, ["fire"]);
});

test("deux lectures identiques en même temps n'appellent GitHub qu'une fois", async (t) => {
  const { gh, githubs } = uneStation(t, true);
  const [a, b] = await Promise.all([githubs.brigade!.commentaires(11), githubs.brigade!.commentaires(11)]);
  assert.deepEqual(a, b);
  assert.equal(gh.appels().length, 1);
});

test("une liste de commentaires dont la dernière page est pleine se relit sans condition : un commentaire de plus irait sur une page que son ETag ne dit pas", async (t) => {
  const { gh, githubs, limite } = uneStation(t, true);
  const cent = Array.from({ length: 100 }, (_, i) => commentaire(`comment ${i}`));
  const c = chemins("brigade", 11);
  gh.repondre(c.commentaires, { etag: 'W/"cent"', corps: cent });
  assert.equal((await githubs.brigade!.commentaires(11)).length, 100);
  // Le 101e arrive en page 2 ; la page 1, elle, n'a pas changé — ni son ETag.
  const page2 = "repos/o/brigade/issues/11/comments?per_page=100&page=2";
  gh.repondre(c.commentaires, { etag: 'W/"cent"', suivant: page2, corps: cent });
  gh.repondre(page2, { etag: 'W/"page2"', corps: [commentaire("the 101st")] });
  const avant = limite.appels();
  assert.equal((await githubs.brigade!.commentaires(11)).at(-1)?.body, "the 101st");
  assert.equal(limite.appels() - avant, 2);
  assert.equal(gh.appels().at(-2)?.includes("If-None-Match: W/\"cent\""), false);
});

test("l'heure passée, les lectures du premier tick sortent du compte", async (t) => {
  const { racine, maintenant, compterUnTick } = uneStation(t, true);
  await compterUnTick();
  assert.equal(appelsDeLaStation(racine, maintenant())?.total, LECTURES_PAR_TICK - 1);
  assert.equal(appelsDeLaStation(racine, maintenant() + FENETRE_MS)?.total, 0);
});
