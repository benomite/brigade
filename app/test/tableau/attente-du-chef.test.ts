// Ce qui attend le chef, lu de GitHub seul (#2460) : les issues, leurs labels, leurs commentaires — jamais le tableau de la
// cuisine. Le TODO de l'app et la file que le second relaie à son ouverture sont cette lecture : les mêmes entrées, chacune
// avec sa question et son geste, dans le même bloc `awaiting`, et « nothing awaits the chef » quand rien n'attend. Joué sur
// un faux GitHub qui tient ses issues, leurs labels, leurs commentaires et leurs événements.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mettreAPart } from "../../src/attend.ts";
import { comprendre, tableau as tableauDe, type Faits } from "../../src/faits.ts";
import { contexteDeLaFile, lireLaFile } from "../../src/second/file.ts";
import { avecCeQuiAttendLeChef, blocDuChef, ECARTS, lireCeQuiAttendLeChef, type AttenteLue } from "../../src/tableau/attente-du-chef.ts";
import type { AppelGitHub, ReponseGitHub } from "../../src/tableau/client.ts";
import { lireLeTableauDuDepot } from "../../src/tableau/lecture.ts";
import { statusDuTableau } from "../../src/tableau/rail.ts";

const DEPOT = "acme/kitchen";
const LU = "2026-11-05T12:00:00.000Z";
const maintenant = () => new Date(LU);

type Commentaire = { body: string; created_at: string; author_association?: string };
type Issue = { labels: string[]; commentaires?: Commentaire[]; evenements?: { event: string; label: { name: string }; created_at: string }[]; created_at?: string };
const dit = (body: string, created_at: string): Commentaire => ({ body, created_at, author_association: "OWNER" });

// Le projet du 2026-11-05 : #8 en pass, sa livraison touche à ce qui la juge (PR #2326) ; #12, `served-elsewhere`, pose une question
// de produit avec ses choix ; #7, `served-elsewhere` après ses renvois, ne demande rien au chef ; #20, une carte `chef-todo` ;
// #30, écarté par le manager avec `question` ; #31, `decision`, mais en WAITING ; #1683, l'issue du tableau de la cuisine.
// #1, sur le rail, calibré par le manager : rien ne le bloque (le rail bloqué, #3358 : test/rail-bloque/).
const MONDE: Record<number, Issue> = {
  1: { labels: ["fire", "model:sonnet", "effort:medium"] },
  7: { labels: ["fire", "served-elsewhere"], commentaires: [dit("<!-- brigade:renvoi n=3 sha=abc1234 -->\nStation `box/claude`: still not mergeable after 2 sends back — the PR conflicts with the base\n\nTaken off the kitchen (`served-elsewhere`): a human decides.", "2026-11-05T01:00:00Z")] },
  8: { labels: ["fire", "in-pass", "blocked-on-human"], commentaires: [dit("Station `box/claude`: this delivery changes what judges it (`.github/workflows/ci.yml`), so it is not merged on the review alone. Review it and merge it by hand: PR #2326.", "2026-11-05T09:00:00Z")] },
  12: {
    labels: ["fire", "served-elsewhere"],
    commentaires: [dit("<!-- brigade:todo kind=product-question -->\nDoes the export keep the old column order?\n- [merge] Yes, merge PR #1560 as delivered\n- [close] No, we drop the export", "2026-11-05T08:00:00Z")],
  },
  20: { labels: ["chef-todo"], commentaires: [dit("chatter", "2026-11-05T02:00:00Z"), dit("<!-- brigade:todo kind=blocked -->\nWhich token does the box use for the registry?", "2026-11-05T10:00:00Z")] },
  30: { labels: ["question"], evenements: [{ event: "labeled", label: { name: "prio:2" }, created_at: "2026-11-04T08:00:00Z" }, { event: "labeled", label: { name: "question" }, created_at: "2026-11-05T06:00:00Z" }] },
  31: { labels: ["decision", "waiting"] },
  1683: { labels: ["fire", "served-elsewhere", "kitchen-board"] },
};

// Un faux GitHub : les issues ouvertes au label demandé, leurs commentaires, leurs événements — et, pour le rail de l'app,
// ses PR. `appels` : chaque chemin demandé.
function github(monde: Record<number, Issue> = MONDE, appels: string[] = []): AppelGitHub {
  const ok = (data: unknown): ReponseGitHub => ({ status: 200, data });
  const issueJson = (numero: number, issue: Issue) => ({ number: numero, title: `Ticket ${numero}`, html_url: `https://github.com/${DEPOT}/issues/${numero}`, created_at: issue.created_at ?? "2026-11-01T00:00:00Z", labels: issue.labels.map((name) => ({ name })) });
  return async (chemin) => {
    appels.push(chemin);
    const label = /\/issues\?.*\blabels=([^&]+)/.exec(chemin)?.[1];
    if (label !== undefined) return ok(Object.entries(monde).filter(([, issue]) => issue.labels.includes(label)).map(([numero, issue]) => issueJson(Number(numero), issue)));
    if (chemin.includes("/pulls?")) return ok([]);
    const [, numero, quoi] = /\/issues\/(\d+)\/(comments|events)/.exec(chemin) ?? [];
    if (numero !== undefined) return ok(quoi === "comments" ? (monde[Number(numero)]?.commentaires ?? []) : (monde[Number(numero)]?.evenements ?? []));
    return { status: 404, data: { message: "Not Found" } };
  };
}

const lue = async (appeler: AppelGitHub = github()): Promise<Extract<AttenteLue, { lue: true }>> => {
  const lecture = await lireCeQuiAttendLeChef({ depot: DEPOT, appeler, maintenant });
  assert.ok(lecture.lue, JSON.stringify(lecture));
  return lecture;
};

describe("ce qui attend le chef, lu de GitHub", () => {
  test("une entrée par fait de GitHub qui demande quelque chose au chef, la plus ancienne d'abord, chacune avec sa question et son geste", async () => {
    const { attentes } = await lue();
    assert.deepEqual(
      attentes.map(({ ticket, quoi, depuis, ligne }) => ({ ticket, quoi, depuis, ligne })),
      [
        { ticket: 30, quoi: "ecart", depuis: "2026-11-05T06:00:00Z", ligne: ECARTS.question },
        { ticket: 12, quoi: "mise-de-cote", depuis: "2026-11-05T08:00:00Z", ligne: "Does the export keep the old column order? — answer on its Todo card: “Yes, merge PR #1560 as delivered” or “No, we drop the export” — or in your own words" },
        { ticket: 8, quoi: "mise-de-cote", depuis: "2026-11-05T09:00:00Z", ligne: "Merge PR #2326 by hand? It changes what judges it. — answer on its Todo card: “Merge PR #2326” — or in your own words" },
        { ticket: 20, quoi: "carte", depuis: "2026-11-05T10:00:00Z", ligne: "Which token does the box use for the registry? — answer on its Todo card, in your own words" },
      ],
    );
    // Ce que la carte de TODO en fait : la décision de merge, la question du chef.
    assert.deepEqual(attentes.find(({ ticket }) => ticket === 8)?.decision, { quoi: "merge", motif: "review-required", cause: null, pr: `https://github.com/${DEPOT}/pull/2326` });
    assert.equal(attentes.find(({ ticket }) => ticket === 20)?.chef?.sorte, "blocked");
  });

  test("le bloc `awaiting`, bords compris : sa tête, une ligne par entrée — son numéro, depuis quand, sa ligne, son titre", async () => {
    assert.deepEqual(blocDuChef(await lue()), [
      "awaiting   4 decisions await the chef — the oldest for 6 h 00",
      `  #30  for 6 h 00  ${ECARTS.question}  Ticket 30`,
      "  #12  for 4 h 00  Does the export keep the old column order? — answer on its Todo card: “Yes, merge PR #1560 as delivered” or “No, we drop the export” — or in your own words  Ticket 12",
      "  #8  for 3 h 00  Merge PR #2326 by hand? It changes what judges it. — answer on its Todo card: “Merge PR #2326” — or in your own words  Ticket 8",
      "  #20  for 2 h 00  Which token does the box use for the registry? — answer on its Todo card, in your own words  Ticket 20",
      "end awaiting",
      "",
    ]);
  });

  test("rien n'attend : le bloc le dit", async () => {
    const vide = await lue(github({ 1: { labels: ["fire"] }, 7: MONDE[7] as Issue }));
    assert.deepEqual(vide.attentes, []);
    assert.deepEqual(blocDuChef(vide), ["awaiting   nothing awaits the chef", "end awaiting", ""]);
  });

  test("répondue, la question de produit n'attend plus ; le label `chef-todo` retiré, la carte part", async () => {
    const reponse = dit("<!-- brigade:reponse gesture=merge -->\nYes, merge PR #1560 as delivered", "2026-11-05T11:00:00Z");
    const monde = { ...MONDE, 12: { ...(MONDE[12] as Issue), commentaires: [...((MONDE[12] as Issue).commentaires ?? []), reponse] }, 20: { ...(MONDE[20] as Issue), labels: [] } };
    assert.deepEqual((await lue(github(monde))).attentes.map(({ ticket }) => ticket), [30, 8]);
  });

  test("une issue `chef-todo` dont la question ne se lit pas n'est pas une entrée, et le second en est prévenu (#2455) ; un `blocked-on-human` sans PR se lève", async () => {
    const monde = {
      5: { labels: ["chef-todo"], created_at: "2026-11-05T05:00:00Z" },
      6: { labels: ["chef-todo"], created_at: "2026-11-05T05:30:00Z", commentaires: [dit("<!-- brigade:todo kind=blocked -->\n  ", "2026-11-05T05:40:00Z")] },
      9: { labels: ["fire", "blocked-on-human"], created_at: "2026-11-05T07:00:00Z" },
    };
    const lecture = await lue(github(monde));
    assert.deepEqual(lecture.attentes.map(({ ticket, ligne }) => [ticket, ligne]), [[9, "Lift the hold? — answer on its Todo card: “Back to the kitchen” or “Close it” — or in your own words"]]);
    assert.equal(lecture.illisibles.length, 2);
    assert.match(lecture.illisibles[0] ?? "", /^#5 carries `chef-todo` but is not shown in Todo: no comment marked/);
    assert.match(lecture.illisibles[1] ?? "", /^#6 carries `chef-todo` but is not shown in Todo: its marked card has no text/);
    // Le second le lit dans le bloc `awaiting`.
    const bloc = blocDuChef(lecture);
    assert.ok(bloc.includes(`  ${lecture.illisibles[0]}`) && bloc.includes(`  ${lecture.illisibles[1]}`), bloc.join("\n"));
    assert.ok(!bloc.some((ligne) => ligne.startsWith("  #5  for")));
  });

  test("le tableau de la cuisine n'est jamais lu, ni une entrée", async () => {
    const appels: string[] = [];
    const { attentes } = await lue(github(MONDE, appels));
    assert.ok(!attentes.some(({ ticket }) => ticket === 1683));
    assert.ok(!appels.some((chemin) => chemin.includes("kitchen-board") || chemin.includes("/issues/1683")), appels.join("\n"));
  });

  test("GitHub qui refuse, ou pas joint : dit pourquoi, jamais « rien n'attend »", async () => {
    const refus = await lireCeQuiAttendLeChef({ depot: DEPOT, appeler: async () => ({ status: 403, data: {} }), maintenant });
    assert.deepEqual(refus, { lue: false, raison: `What awaits the chef in ${DEPOT} was not read from GitHub: GitHub answered HTTP 403 on /repos/${DEPOT}/issues.` });
    const injoint = await lireCeQuiAttendLeChef({ depot: DEPOT, appeler: async () => assert.fail("getaddrinfo ENOTFOUND api.github.com"), maintenant });
    assert.equal(injoint.lue, false);
    assert.equal(!injoint.lue && injoint.horsLigne, true);
  });
});

// La lecture de l'app (main.ts, `lireLeTableau`) : le rail, puis ce qui attend le chef.
const lueParLApp = async (appeler: AppelGitHub) => avecCeQuiAttendLeChef(await lireLeTableauDuDepot({ depot: DEPOT, appeler, maintenant }), appeler);

describe("l'app et le second ne se contredisent pas : la même lecture, les mêmes entrées", () => {
  test("le Todo de l'app, son bloc `awaiting` et la file du second disent les mêmes entrées, dans le même ordre, mot pour mot", async () => {
    const lu = await lueParLApp(github());
    assert.ok(lu.lu, !lu.lu ? lu.raison : "");
    // L'app : le bloc de son `status`, et les cartes de Todo qu'elle en dessine.
    const status = statusDuTableau(lu);
    const montree = mettreAPart({ projet: "kitchen", demande: 0, a: LU, sorties: [{ commande: "status", texte: status }] });
    assert.ok(!("erreur" in montree) && montree.attend !== undefined, "status carries its awaiting block");
    const faits = comprendre(JSON.stringify(lu.faits));
    assert.ok(!("informe" in faits), `facts are in shape: ${"informe" in faits ? faits.informe : ""}`);
    const todo = tableauDe(faits as Faits, { bloc: montree.attend, a: LU }, { texte: status, a: LU }).rail.colonnes.find(({ nom }) => nom === "Awaiting you")?.cartes ?? [];
    assert.deepEqual(todo.map(({ ticket }) => ticket), [30, 12, 8, 20]);
    // Le second : la même lecture, le même bloc.
    const file = await lireLaFile(github(), DEPOT, maintenant);
    assert.ok(file.lue, JSON.stringify(file));
    assert.equal(file.texte, montree.attend);
    const contexte = contexteDeLaFile({ nom: "kitchen", depot: DEPOT }, file);
    assert.ok(contexte.includes(montree.attend.trimEnd()), contexte);
    assert.match(contexte, /from GitHub only .* not the Kitchen board/);
    assert.equal(faits.compteurs.attend, 4);
  });

  test("un Todo vide : l'app et le second disent tous deux « nothing awaits the chef »", async () => {
    const monde = { 1: { labels: ["fire", "model:sonnet", "effort:medium"] } };
    const lu = await lueParLApp(github(monde));
    assert.ok(lu.lu);
    assert.match(statusDuTableau(lu), /^awaiting {3}nothing awaits the chef\nend awaiting$/m);
    const file = await lireLaFile(github(monde), DEPOT, maintenant);
    assert.ok(file.lue);
    assert.equal(file.texte, "awaiting   nothing awaits the chef\nend awaiting\n");
  });

  test("GitHub qui ne rend pas ce qui attend le chef : une lecture ratée pour l'app — jamais un Todo vide —, dite au second", async () => {
    const refuse: AppelGitHub = async (chemin, entetes) => (chemin.includes("labels=chef-todo") ? { status: 502, data: {} } : github()(chemin, entetes));
    const lu = await lueParLApp(refuse);
    assert.equal(lu.lu, false);
    assert.match(!lu.lu ? lu.raison : "", /^What awaits the chef in acme\/kitchen was not read from GitHub: GitHub answered HTTP 502/);
    const file = await lireLaFile(refuse, DEPOT, maintenant);
    assert.match(contexteDeLaFile({ nom: "kitchen" }, file), /file non lue : GitHub n'a pas rendu ce qui attend le chef\nWhat awaits the chef/);
  });
});
