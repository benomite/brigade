// Les réponses du chef aux cartes de TODO, lues des commentaires du tableau de la cuisine (app/src/tableau/envois.ts,
// #1841) : une réponse postée que la box n'a ni jouée ni répondue est envoyée et en attente de la cuisine ; sa réponse
// lue — dans le bloc machine, ou dans le commentaire qu'elle poste sous le geste quand elle ne réécrit pas le bloc —, elle
// est jouée, ou refusée avec sa raison. Rien n'en est tenu en mémoire : une lecture neuve, celle d'une app redémarrée,
// rend la même chose. Rien ne passe par le réseau : l'appel à GitHub est une doublure.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { GesteDuTableau, LigneDeLaFile } from "../../../runtime/src/tableau/rendu/bloc.ts";
import type { AppelGitHub } from "../../src/tableau/client.ts";
import { avecLesEnvois, envoisDuTableau, sansMarkdown, type CommentaireDuTableau } from "../../src/tableau/envois.ts";
import { lireLeTableauDuDepot, type TableauLu } from "../../src/tableau/lecture.ts";
import { lectureDuTableau } from "../../src/tableau/rail.ts";
import { ISSUE, TABLEAU } from "./fixture.ts";

const DEPOT = "chef/parade";
const URL_DU_GESTE = (id: number) => `https://github.com/chef/parade/issues/7#issuecomment-${id}`;
// La carte de #21 attend le chef depuis 9 h 30 (fixture.ts) ; #18 attend un merge, sans carte.
const FILE = TABLEAU.file as LigneDeLaFile[];
const geste = (id: number, corps: string, le = "2026-10-23T09:40:00Z"): CommentaireDuTableau => ({ id, url: URL_DU_GESTE(id), corps, le });
const reponse = (id: number, corps: string): CommentaireDuTableau => ({ id, url: null, corps, le: "2026-10-23T09:41:00Z" });
const dansLeBloc = (commentaire: number, etat: "pris" | "refuse", ligne: string): GesteDuTableau => ({ commentaire, url: URL_DU_GESTE(commentaire), le: "", geste: "choose", ticket: 21, etat, traiteLe: "", reponse: ligne });

test("une réponse postée, sans rien de la box : envoyée, en attente de la cuisine — le choix ou le texte qu'elle porte", () => {
  assert.deepEqual(envoisDuTableau(FILE, [], [geste(101, "/brigade choose #21 2")]), [{ ticket: 21, commentaire: 101, url: URL_DU_GESTE(101), le: "2026-10-23T09:40:00Z", choix: 2, etat: "attente" }]);
  const [ecrite] = envoisDuTableau(FILE, [], [geste(102, "/brigade answer #21 Neither:\na dark green.")]);
  assert.equal(ecrite?.etat, "attente");
  assert.equal(ecrite !== undefined && "texte" in ecrite ? ecrite.texte : undefined, "Neither:\na dark green.");
});

test("la box a répondu sous le geste, sans réécrire le bloc (elle retient ses appels, #1840) : joué, ou pas joué et pourquoi", () => {
  const joue = envoisDuTableau(FILE, [], [geste(101, "/brigade choose #21 2"), reponse(102, `**Done** — [choose #21 2](${URL_DU_GESTE(101)}) — cost: the kitchen takes #21 up again`)]);
  assert.deepEqual(joue.map(({ etat }) => etat), ["joue"]);
  assert.equal(joue[0]?.etat === "joue" ? joue[0].dit : "", "Done — choose #21 2 — cost: the kitchen takes #21 up again");
  const refuse = envoisDuTableau(FILE, [], [geste(101, "/brigade choose #21 2"), reponse(102, `**Not done** — [choose #21 2](${URL_DU_GESTE(101)}): GitHub calls are below the reserve — retry after 17:21`)]);
  assert.equal(refuse[0]?.etat, "refuse");
  assert.equal(refuse[0]?.etat === "refuse" ? refuse[0].raison : "", "GitHub calls are below the reserve — retry after 17:21");
});

test("le bloc machine dit l'état du geste, et prime sur un commentaire", () => {
  const [lu] = envoisDuTableau(FILE, [dansLeBloc(101, "refuse", `**Not done** — [choose #21 2](${URL_DU_GESTE(101)}): a cook is working on #21`)], [geste(101, "/brigade choose #21 2")]);
  assert.equal(lu?.etat, "refuse");
  assert.equal(lu?.etat === "refuse" ? lu.raison : "", "a cook is working on #21");
  const [pris] = envoisDuTableau(FILE, [dansLeBloc(101, "pris", `**Done** — [choose #21 2](${URL_DU_GESTE(101)}) — cost: none`)], [geste(101, "/brigade choose #21 2")]);
  assert.equal(pris?.etat, "joue");
});

test("la dernière réponse compte : refusée, puis postée de nouveau, la carte attend la cuisine", () => {
  const envois = envoisDuTableau(FILE, [dansLeBloc(101, "refuse", "**Not done** — x: busy")], [geste(101, "/brigade choose #21 2"), geste(103, "/brigade choose #21 1", "2026-10-23T09:50:00Z")]);
  assert.deepEqual(envois.map(({ commentaire, etat }) => [commentaire, etat]), [[103, "attente"]]);
});

test("ce qui n'est pas une réponse à une carte qui attend n'en dit rien", () => {
  // Une conversation, un autre geste, une carte que la file ne porte pas, un ticket sans carte, une réponse d'avant que
  // la carte attende : rien.
  const commentaires = [
    geste(101, "the green looks fine to me"),
    geste(102, "/brigade merge #18"),
    geste(103, "/brigade choose #99 1"),
    geste(104, "/brigade answer #18 merge it"),
    geste(105, "/brigade choose #21 1", "2026-10-23T09:00:00Z"),
  ];
  assert.deepEqual(envoisDuTableau(FILE, [], commentaires), []);
});

test("un geste que la box a laissé — elle a répondu à un plus récent, il n'est pas du compte du chef — n'attend rien", () => {
  const envois = envoisDuTableau(FILE, [], [geste(101, "/brigade choose #21 2"), geste(102, "/brigade merge #18"), reponse(103, `**Done** — [merge #18](${URL_DU_GESTE(102)}) — cost: none`)]);
  assert.deepEqual(envois, []);
});

test("une réponse de la box se lit en texte, sans gras ni lien", () => {
  assert.equal(sansMarkdown("**Not done** — [choose \\#21 2](https://x/y#issuecomment-1): no card"), "Not done — choose #21 2: no card");
});

// Un GitHub qui rend l'issue du tableau, puis ces commentaires — et retient les chemins demandés.
function github(commentaires: unknown[] | Error | number): { appeler: AppelGitHub; chemins: string[] } {
  const chemins: string[] = [];
  return {
    chemins,
    appeler: async (chemin) => {
      chemins.push(chemin);
      if (chemin.startsWith(`/repos/${DEPOT}/issues?`)) return { status: 200, data: [ISSUE] };
      if (commentaires instanceof Error) throw commentaires;
      if (typeof commentaires === "number") return { status: commentaires, data: { message: "Server Error" } };
      return { status: 200, data: commentaires };
    },
  };
}
const brut = (id: number, body: string, created_at = "2026-10-23T09:40:00Z") => ({ id, html_url: URL_DU_GESTE(id), body, created_at, user: { login: "chef" } });

async function lu(appeler: AppelGitHub): Promise<TableauLu> {
  const lecture = await lireLeTableauDuDepot({ depot: DEPOT, appeler, maintenant: () => new Date("2026-10-23T10:06:00Z") });
  assert.ok(lecture.lu, lecture.lu ? "" : lecture.raison);
  return lecture;
}

test("le tableau lu de GitHub porte ses réponses : les commentaires d'après la plus ancienne carte qui attend, lus de l'issue du tableau", async () => {
  const { appeler, chemins } = github([brut(101, "/brigade choose #21 2")]);
  const avec = await avecLesEnvois(await lu(appeler), appeler);
  assert.deepEqual(avec.envois?.map(({ ticket, etat }) => [ticket, etat]), [[21, "attente"]]);
  const demande = new URL(`https://api.github.com${chemins[1]}`);
  assert.equal(demande.pathname, `/repos/${DEPOT}/issues/7/comments`);
  assert.equal(demande.searchParams.get("since"), "2026-10-23T09:30:00.000Z");
  // Et la lecture du rail les rend avec ses sorties : c'est elle que les faits reçoivent.
  const rail = lectureDuTableau(avec, "parade", 1, ["status"]);
  assert.ok("sorties" in rail);
  assert.deepEqual("sorties" in rail ? rail.envois?.map(({ commentaire }) => commentaire) : undefined, [101]);
});

test("des commentaires qui ne se lisent pas laissent le tableau sans réponses — rien n'en est dit, rien n'échoue", async () => {
  for (const panne of [new Error("fetch failed"), 502]) {
    const { appeler } = github(panne);
    const tableau = await lu(appeler);
    const avec = await avecLesEnvois(tableau, appeler);
    assert.equal(avec.envois, undefined);
    assert.equal(avec, tableau);
  }
});

test("sans carte qui attend, aucun commentaire n'est demandé à GitHub", async () => {
  const { appeler, chemins } = github([]);
  const tableau = await lu(appeler);
  const avec = await avecLesEnvois({ ...tableau, file: tableau.file.filter(({ carte }) => carte === null) }, appeler);
  assert.deepEqual(avec.envois, []);
  assert.equal(chemins.length, 1);
});
