// Un geste du chef posté sous le tableau se joue même quand la box retient ses
// propres appels à GitHub (#1840) : la pause de la limite, ou le quota à la
// réserve, retient la cuisine — son rafraîchissement du tableau —, jamais la
// lecture des gestes ni la réponse sous chacun. Les vrais clients GitHub du
// tableau et des gestes, contre un faux `gh`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { entrerDansTodo, cartesEnTodo, type Proposition } from "../../../src/carte-todo.ts";
import { ouvrirLimite } from "../../../src/limite-github.ts";
import { demarrer } from "../../../src/runtime.ts";
import { clientGitHubDesGestes } from "../../../src/tableau/gestes/client.ts";
import { gestesDuTableau } from "../../../src/tableau/gestes/gestes.ts";
import { clientGitHubDuTableau } from "../../../src/tableau/publication/client.ts";
import { brancherLeTableau } from "../../../src/tableau/publication/publier.ts";
import { OUVERTURE_DU_BLOC } from "../../../src/tableau/rendu/bloc.ts";
import { fauxGitHub, issue } from "../../aides/cuisine.ts";
import { aArreter, DEPOT, fauxGh, jusqua, repertoireTemporaire } from "../../outils.ts";

const SANS_BASH = process.platform === "win32" && "le faux `gh` est un script bash";
const PROJET = "brigade";
const TABLEAU = 4;
const CARTE: Proposition = { type: "product", resume: "The ticket adds an export.", enonce: "Export CSV ou export JSON ?", choix: [{ texte: "L'export CSV." }, { texte: "L'export JSON." }] };

test("la box retient ses appels (pause, quota au-dessus de la réserve) : `choose` posté sous le tableau se joue quand même, et la box répond dessous", { skip: SANS_BASH }, async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let instant = Date.parse("2026-10-08T10:00:00.000Z");
  const maintenant = () => new Date(instant);
  const runtime = demarrer({ repertoireEtat: repertoireTemporaire(t), projet: PROJET, maintenant });
  aArreter(t, () => runtime.arreter("SIGTERM"));
  const { journal } = runtime;
  journal.ajouter({ project: PROJET, ticket: 30, author: "github", type: "ticket.arrived", payload: { title: "Ticket 30", priority: 1, createdAt: "2026-10-01T00:00:30Z", url: `https://github.com/${DEPOT}/issues/30`, card: null } });
  entrerDansTodo(journal, PROJET, 30, CARTE, "manager");
  assert.equal(cartesEnTodo(journal.base).length, 1);

  // La limite de GitHub atteinte : la cuisine est retenue, alors que le compte a des appels de reste.
  const limite = ouvrirLimite();
  limite.suspendre(Date.now() + 3_600_000);
  limite.noter("gh", { restant: 3454, plafond: 5000, reset: Date.now() + 3_600_000 });
  assert.throws(() => limite.prendre("cuisine"), /limite/);

  const gh = fauxGh(t);
  gh.repondre(`repos/${DEPOT}/issues?labels=kitchen-board&state=all&per_page=100`, {
    corps: [{ number: TABLEAU, title: "Kitchen board", body: `${OUVERTURE_DU_BLOC}\n{}\n-->`, state: "open", labels: [{ name: "kitchen-board" }], repository_url: `https://api.github.com/repos/${DEPOT}` }],
  });
  gh.repondre(`repos/${DEPOT}/issues/${TABLEAU}/comments?per_page=100`, { corps: [{ id: 7001, body: "/brigade choose #30 2", created_at: "2026-10-08T10:00:30Z", html_url: `https://github.com/${DEPOT}/issues/${TABLEAU}#issuecomment-7001`, user: { login: "acme" } }] });
  gh.repondre("user", { corps: { login: "acme" } });
  gh.repondre(`repos/${DEPOT}/issues/${TABLEAU}/comments`, { statut: 201, corps: { id: 7002 } });

  const avertis: string[] = [];
  const gestes = gestesDuTableau({ client: clientGitHubDesGestes({ depot: DEPOT, bin: gh.bin, limite }), journal, projet: PROJET, github: fauxGitHub(issue(30)).github, avertir: (ligne) => avertis.push(ligne) });
  brancherLeTableau(runtime, { client: clientGitHubDuTableau({ depot: DEPOT, bin: gh.bin, limite }), depot: DEPOT, maintenant, dire: () => {}, avertir: (ligne) => avertis.push(ligne), gestes });

  const reponduSous = () => gh.appels().some((args) => args.includes("POST") && args.at(-1) === `repos/${DEPOT}/issues/${TABLEAU}/comments`);
  await jusqua(() => reponduSous() && cartesEnTodo(journal.base).length === 0 && avertis.some((ligne) => /non rafraîchi/.test(ligne)));
  assert.ok(journal.tout().some((fait) => fait.type === "board.gesture" && fait.payload.comment === 7001 && fait.payload.done === true));
  assert.equal(gh.appels().some((args) => args.includes("PATCH")), false, "la cuisine, elle, reste retenue : le corps du tableau n'est pas réécrit");
  assert.ok(avertis.some((ligne) => /non rafraîchi/.test(ligne)), "le rafraîchissement retenu se dit toujours");
});
