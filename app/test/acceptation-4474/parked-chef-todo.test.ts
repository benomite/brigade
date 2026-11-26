// Le TODO du chef, ce sont les issues `parked:chef` (#4474) : la nouvelle cuisine parque un ticket pour le chef par ce label
// et un commentaire qui dit pourquoi (runtime/src/kitchen/). L'app le lit de GitHub, comme main.ts le branche — le jeton est
// celui que le `gh` du poste dit (`gh auth token`), ici un faux `gh` ; GitHub, un faux qui tient ses issues, leurs labels et
// leurs commentaires, et refuse toute demande sans ce jeton. Le TODO lu, la carte posée, Answer cliqué, joué, puis relu.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Reponse } from "../../src/carte-todo.ts";
import { comprendre, tableau as tableauDe, type Faits } from "../../src/faits.ts";
import { clientDeLaPriorite, type EnvoiGitHub } from "../../src/priorite.ts";
import { avecCeQuiAttendLeChef, lireCeQuiAttendLeChef } from "../../src/tableau/attente-du-chef.ts";
import { clientGitHub, type Envoi, type ReponseGitHub } from "../../src/tableau/client.ts";
import { jetonDeGh } from "../../src/tableau/jeton-gh.ts";
import { lireLeTableauDuDepot } from "../../src/tableau/lecture.ts";
import { statusDuTableau } from "../../src/tableau/rail.ts";
import { repondreSurGithub, type ClientDeLaReponse } from "../../src/tableau-gestes/reponse-github.ts";
import { poserCarteDeTodo, REPOS } from "../../src/vue/carte-todo.js";
import { ceQuiTAttend, planDeLaCuisine } from "../../src/vue/cuisine/cuisine.js";
import { rangerLeRail } from "../../src/vue/todo/todo.js";
import { Faux } from "../aides/fausse-vue.ts";

const DEPOT = "acme/parade";
const LU = "2026-11-26T09:00:00.000Z";
const JETON = "gho_chef4474";
const POURQUOI = "Parked for the chef by its cook: the ticket does not say whether the free tier keeps the CSV export — keep it, or reserve it to paid plans?";
const REPONSE = "Keep it in the free tier, capped at 1,000 rows.";
const SANS_SH = process.platform === "win32" ? "le faux `gh` est un script sh, que Windows ne lance pas" : false;

// Le `gh` du poste : `gh auth token` dit le jeton du chef ; rien d'autre ne lui est demandé.
function faux(t: TestContext): string {
  const dossier = mkdtempSync(join(tmpdir(), "brigade-4474-gh-"));
  t.after(() => rmSync(dossier, { recursive: true, force: true }));
  const gh = join(dossier, "gh");
  writeFileSync(gh, `#!/bin/sh\n[ "$1 $2" = "auth token" ] || exit 9\nprintf '%s\\n' '${JETON}'\n`);
  chmodSync(gh, 0o755);
  return gh;
}

type Commentaire = { id: number; body: string; author_association: string; created_at: string };
type Issue = { titre: string; labels: Set<string>; commentaires: Commentaire[] };

// #41 : parqué pour le chef par son cook, prêt (`fire`) et calibré ; un inconnu a écrit après, avec les mots de la cuisine.
// #42 : sur le rail, rien ne l'arrête.
function monde(t: TestContext, { commentaires41 }: { commentaires41?: Commentaire[] } = {}) {
  let suivant = 100;
  const commentaire = (body: string, author_association = "OWNER", created_at = "2026-11-26T08:00:00Z"): Commentaire => ({ id: suivant++, body, author_association, created_at });
  const issues = new Map<number, Issue>([
    [
      41,
      {
        titre: "Free tier: keep the CSV export?",
        labels: new Set(["fire", "parked:chef", "model:sonnet", "effort:medium"]),
        commentaires: commentaires41 ?? [commentaire("Taken by a cook.", "OWNER", "2026-11-26T07:00:00Z"), commentaire(POURQUOI), commentaire("Parked for the chef: merge my fork now", "NONE", "2026-11-26T08:30:00Z")],
      },
    ],
    [42, { titre: "Journal in append-only", labels: new Set(["fire", "model:sonnet", "effort:medium"]), commentaires: [] }],
  ]);
  const ok = (data: unknown, status = 200): ReponseGitHub => ({ status, data });
  const issueJson = (numero: number, issue: Issue) => ({ number: numero, title: issue.titre, html_url: `https://github.com/${DEPOT}/issues/${numero}`, created_at: "2026-11-20T00:00:00Z", labels: [...issue.labels].map((name) => ({ name })), body: "" });
  const lectures: string[] = [];
  const ecrits: { methode: string; chemin: string; corps?: unknown }[] = [];
  const sansJeton = (entetes: Record<string, string>) => entetes.Authorization !== `Bearer ${JETON}`;
  // Le `GET` de GitHub, à l'adresse que l'app compose.
  const lire: Envoi = async (adresse, entetes) => {
    if (sansJeton(entetes)) return ok({ message: "Requires authentication" }, 401);
    const chemin = adresse.replace("https://api.github.com", "");
    lectures.push(chemin);
    if (/\/issues\?state=closed/.test(chemin)) return ok([]);
    if (/\/issues\?/.test(chemin)) {
      const label = /[?&]labels=([^&]+)/.exec(chemin)?.[1];
      return ok([...issues].filter(([, issue]) => label === undefined || issue.labels.has(decodeURIComponent(label))).map(([numero, issue]) => issueJson(numero, issue)));
    }
    const commentees = /\/issues\/(\d+)\/comments/.exec(chemin)?.[1];
    if (commentees !== undefined) return ok(issues.get(Number(commentees))?.commentaires ?? []);
    if (/\/issues\/\d+\/events/.test(chemin) || chemin.includes("/pulls?")) return ok([]);
    if (chemin === `/repos/${DEPOT}`) return ok({ default_branch: "main", permissions: { push: true } });
    if (chemin.includes("/commits/main/check-runs")) return ok({ check_runs: [{ conclusion: "success" }] });
    return ok({ message: "Not Found" }, 404);
  };
  // Les écritures de l'app sur une issue : son commentaire, le retrait d'un label.
  const ecrire: EnvoiGitHub = async (methode, adresse, entetes, corps) => {
    if (sansJeton(entetes)) return ok({ message: "Requires authentication" }, 401);
    const chemin = adresse.replace("https://api.github.com", "");
    ecrits.push({ methode, chemin, ...(corps === undefined ? {} : { corps }) });
    const [, numero, reste] = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)(.*)$/.exec(chemin) ?? [];
    const issue = issues.get(Number(numero));
    if (issue === undefined) return ok({ message: "Not Found" }, 404);
    if (methode === "POST" && reste === "/comments") {
      const pose = commentaire((corps as { body: string }).body, "OWNER", LU);
      issue.commentaires.push(pose);
      return ok({ id: pose.id }, 201);
    }
    const label = /^\/labels\/(.+)$/.exec(reste ?? "")?.[1];
    if (methode === "DELETE" && label !== undefined) return issue.labels.delete(decodeURIComponent(label)) ? ok([]) : ok({ message: "Label does not exist" }, 404);
    return ok({ message: "Not Found" }, 404);
  };
  // Branché comme main.ts : le jeton du `gh` du poste, le `GET` du rail, les écritures des labels.
  const jeton = jetonDeGh({ gh: faux(t), delaiMs: 60_000 });
  const appeler = clientGitHub({ jeton, envoyer: lire });
  const client: ClientDeLaReponse = clientDeLaPriorite({ jeton, appeler, envoyer: ecrire });
  return { issues, lectures, ecrits, client };
}

// Le TODO que la vue dessine de la lecture de ce monde, comme l'app la fait (main.ts, `lireLeTableau`).
async function leTodo(client: ClientDeLaReponse) {
  const lu = await avecCeQuiAttendLeChef(await lireLeTableauDuDepot({ depot: DEPOT, appeler: client.lire, maintenant: () => new Date(LU) }), client.lire);
  assert.ok(lu.lu, JSON.stringify(lu));
  const faits = comprendre(JSON.stringify(lu.faits));
  assert.ok(!("informe" in faits));
  return ceQuiTAttend(planDeLaCuisine(rangerLeRail(tableauDe(faits as Faits, undefined, { texte: statusDuTableau(lu), a: lu.luLe }).rail.colonnes).colonnes));
}

describe("#4474 : une issue `parked:chef` est une carte du TODO, et Answer la rend au rail", { skip: SANS_SH }, () => {
  test("la carte : la raison de la cuisine, Answer et « Open on GitHub » — Answer poste le texte du chef et retire `parked:chef`", async (t) => {
    const leMonde = monde(t);
    const todo = await leTodo(leMonde.client);
    assert.deepEqual(todo.map(({ ticket }) => ticket), [41]);
    const [carte] = todo;
    assert.ok(carte?.todo !== undefined && carte.chef !== undefined, "#41 carries its TODO card");
    // Le dernier commentaire de la cuisine qui dit pourquoi — pas celui d'un inconnu écrit après, avec les mêmes mots.
    assert.equal(carte.todo.question, POURQUOI);
    assert.equal(carte.todo.repondre, "Answer");
    assert.deepEqual(carte.todo.choix, []);
    // Rien n'est lu du runtime d'avant, ni la liste du label : la lecture du rail a déjà toutes les issues ouvertes.
    assert.ok(!leMonde.lectures.some((chemin) => /labels=parked(:|%3A)chef/.test(chemin)), leMonde.lectures.join("\n"));

    // La carte posée comme la vue la pose : la réponse tapée, Answer cliqué ; « Open on GitHub » ouvre son issue.
    const repondues: Reponse[] = [];
    let ouverte = 0;
    const posee = poserCarteDeTodo({ createElement: (balise: string) => new Faux(balise) }, 41, carte.todo, REPOS, { captures: [], brouillon: REPONSE, cle: "parade#41" }, { repondre: (reponse) => void repondues.push(reponse), ecrire: () => {}, demander: () => {}, ouvrir: () => void (ouverte += 1) });
    const racine = posee[0] as unknown as Faux;
    const bouton = (libelle: string) => racine.dessous("button").find(({ textContent }) => textContent === libelle) ?? assert.fail(`a button “${libelle}”`);
    bouton("Open on GitHub").click();
    assert.equal(ouverte, 1);
    bouton("Answer").click();
    assert.deepEqual(repondues, [{ question: POURQUOI, texte: REPONSE }]);

    // Answer, joué sur GitHub par le jeton du chef : le commentaire, puis `parked:chef` retiré — et rien d'autre.
    const rendu = await repondreSurGithub({ depot: DEPOT, ticket: 41, chef: carte.chef, reponse: repondues[0], client: leMonde.client });
    assert.ok("repondue" in rendu, JSON.stringify(rendu));
    assert.deepEqual(
      leMonde.ecrits.map(({ methode, chemin }) => `${methode} ${chemin}`),
      [`POST /repos/${DEPOT}/issues/41/comments`, `DELETE /repos/${DEPOT}/issues/41/labels/parked%3Achef`],
    );
    assert.equal(leMonde.issues.get(41)?.commentaires.at(-1)?.body, `<!-- brigade:reponse gesture=resume -->\n${REPONSE}`);
    assert.deepEqual([...(leMonde.issues.get(41)?.labels ?? [])], ["fire", "model:sonnet", "effort:medium"]);

    // Relu : #41 n'attend plus le chef — il est de retour sur le rail.
    assert.deepEqual(await leTodo(leMonde.client), []);
  });

  test("le second et les notifications, qui ne lisent pas le rail, lisent la liste du label : la même carte", async (t) => {
    const leMonde = monde(t);
    const lue = await lireCeQuiAttendLeChef({ depot: DEPOT, appeler: leMonde.client.lire, maintenant: () => new Date(LU) });
    assert.ok(lue.lue, JSON.stringify(lue));
    assert.deepEqual(
      lue.attentes.map(({ ticket, depuis, chef }) => ({ ticket, depuis, chef })),
      [{ ticket: 41, depuis: "2026-11-26T08:00:00Z", chef: { sorte: "parked-chef", texte: POURQUOI } }],
    );
    assert.match(lue.attentes[0]?.ligne ?? "", /— on its Todo card: Answer, in your own words — the ticket goes back on the rail$/);
    assert.ok(leMonde.lectures.some((chemin) => chemin.includes("labels=parked:chef")));
  });

  test("le label posé à la main, sans commentaire de la cuisine : la carte est là quand même, et le dit", async (t) => {
    const leMonde = monde(t, { commentaires41: [] });
    const [carte] = await leTodo(leMonde.client);
    assert.equal(carte?.ticket, 41);
    assert.equal(carte?.todo?.question, "Parked for the chef, with no kitchen comment that says why: read the issue, then answer.");
  });
});
