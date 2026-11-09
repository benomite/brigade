// La notification d'une carte de TODO (#2747) : joué sur un faux GitHub qui tient les issues, leurs labels et leurs
// commentaires de deux projets, une mémoire qui survit au « redémarrage », et un faux système de notifications.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { carteRepondue, identifiantDe, sonder, type Memoire, type Notifiees, type Notification, type Notifieur } from "../src/notifications-todo.ts";
import type { AppelGitHub, ReponseGitHub } from "../src/tableau/client.ts";

type Issue = { labels: string[]; commentaires: string[] };
const PROJETS = [
  { nom: "parade", depot: "chef/parade" },
  { nom: "atelier", depot: "chef/atelier" },
];
const carte = (question: string) => `<!-- brigade:todo kind=product-question -->\n${question}\n- [resume] Yes\n- [drop] No`;
const toDo = (question: string): Issue => ({ labels: ["chef-todo"], commentaires: ["chatter", carte(question)] });

let monde: Record<string, Record<number, Issue>>;
let injoignable: Set<string>;
let notifications: Map<number, Notification>;
let montrees: Notification[];
let retirees: number[];
let enregistre: Notifiees;

// Un faux GitHub : les issues ouvertes au label demandé, leurs commentaires, leurs événements.
const github: AppelGitHub = async (chemin) => {
  const ok = (data: unknown): ReponseGitHub => ({ status: 200, data });
  const depot = /\/repos\/([^/]+\/[^/]+)\//.exec(chemin)?.[1] ?? "";
  if (injoignable.has(depot)) return { status: 502, data: {} };
  const issues = monde[depot] ?? {};
  const label = /\/issues\?.*\blabels=([^&]+)/.exec(chemin)?.[1];
  if (label !== undefined) {
    return ok(Object.entries(issues).filter(([, i]) => i.labels.includes(label)).map(([n, i]) => ({ number: Number(n), title: `Ticket ${n}`, html_url: `https://github.com/${depot}/issues/${n}`, created_at: "2026-11-01T00:00:00Z", labels: i.labels.map((name) => ({ name })) })));
  }
  const [, numero, quoi] = /\/issues\/(\d+)\/(comments|events)/.exec(chemin) ?? [];
  if (numero !== undefined && quoi === "comments") return ok((issues[Number(numero)]?.commentaires ?? []).map((body, i) => ({ body, created_at: `2026-11-05T0${i}:00:00Z`, author_association: "OWNER" })));
  if (numero !== undefined) return ok([]);
  return { status: 404, data: {} };
};
const memoire: Memoire = { lire: () => structuredClone(enregistre), ecrire: (n) => void (enregistre = structuredClone(n)) };
const notifier: Notifieur = {
  montrer: (n) => void (montrees.push(n), notifications.set(n.id, n)),
  retirer: (id) => void (retirees.push(id), notifications.delete(id)),
};
const sonde = () => sonder({ appeler: github, memoire, notifier, projets: async () => PROJETS });

beforeEach(() => {
  monde = { "chef/parade": { 1: { labels: ["fire"], commentaires: [] } }, "chef/atelier": {} };
  injoignable = new Set();
  notifications = new Map();
  montrees = [];
  retirees = [];
  enregistre = {};
});

describe("la notification d'une carte de TODO", () => {
  test("une nouvelle carte notifie une fois, avec le nom du projet et sa question", async () => {
    monde["chef/parade"]![40] = toDo("Keep the old export?");
    assert.deepEqual(await sonde(), { lu: true, notifiees: 1, retirees: 0 });
    assert.equal(montrees.length, 1);
    assert.ok(montrees[0]!.texte.includes("parade") && montrees[0]!.texte.includes("Keep the old export?"), montrees[0]!.texte);
    assert.deepEqual([montrees[0]!.projet, montrees[0]!.ticket], ["parade", 40]);
  });

  test("une carte sur un autre projet du chef notifie aussi", async () => {
    monde["chef/atelier"]![7] = toDo("Which token?");
    await sonde();
    assert.ok(montrees[0]!.texte.includes("atelier") && montrees[0]!.texte.includes("Which token?"));
  });

  test("le trafic de la cuisine reste silencieux : issues, commentaires, labels, statuts", async () => {
    await sonde();
    const parade = monde["chef/parade"]!;
    parade[2] = { labels: ["fire", "in-pass"], commentaires: ["Station `box/claude`: taken"] };
    parade[1]!.commentaires.push("a comment");
    parade[1]!.labels.push("prio:1", "waiting");
    parade[3] = { labels: ["fire", "served-elsewhere"], commentaires: ["<!-- brigade:renvoi n=1 -->\nnothing to ask"] };
    parade[4] = { labels: ["chef-todo"], commentaires: ["a label without a marked question"] };
    delete parade[2];
    assert.deepEqual(await sonde(), { lu: true, notifiees: 0, retirees: 0 });
    assert.deepEqual(montrees, []);
  });

  test("jamais deux fois : sondages successifs, puis redémarrage de l'app", async () => {
    monde["chef/parade"]![40] = toDo("Keep the old export?");
    await sonde();
    await sonde();
    assert.equal(montrees.length, 1);
    // Le redémarrage perd tout sauf la mémoire.
    notifications = new Map();
    await sonde();
    assert.equal(montrees.length, 1);
  });

  test("une carte qui pose une autre question notifie de nouveau, et remplace l'ancienne", async () => {
    monde["chef/parade"]![40] = toDo("Keep the old export?");
    await sonde();
    monde["chef/parade"]![40] = toDo("Drop the export instead?");
    await sonde();
    assert.equal(montrees.length, 2);
    assert.equal(notifications.size, 1);
    assert.ok([...notifications.values()][0]!.texte.includes("Drop the export instead?"));
  });

  test("la réponse donnée dans l'app retire la notification, tout de suite", async () => {
    monde["chef/parade"]![40] = toDo("Keep the old export?");
    monde["chef/parade"]![41] = toDo("Another one?");
    await sonde();
    assert.equal(await carteRepondue({ memoire, notifier }, "parade", 40), 1);
    assert.deepEqual([...notifications.values()].map((n) => n.ticket), [41]);
    assert.equal(await carteRepondue({ memoire, notifier }, "parade", 40), 0);
  });

  test("la réponse donnée sur GitHub retire la notification au sondage suivant", async () => {
    monde["chef/parade"]![40] = toDo("Keep the old export?");
    monde["chef/atelier"]![7] = toDo("Which token?");
    await sonde();
    delete monde["chef/parade"]![40];
    assert.equal(notifications.size, 2, "rien ne change avant le sondage");
    assert.deepEqual(await sonde(), { lu: true, notifiees: 0, retirees: 1 });
    assert.deepEqual([...notifications.values()].map((n) => n.projet), ["atelier"]);
    assert.deepEqual(retirees, [identifiantDe("parade#40")]);
  });

  test("un projet que GitHub ne lit pas ne retire rien : l'absence de lecture n'est pas une réponse", async () => {
    monde["chef/parade"]![40] = toDo("Keep the old export?");
    await sonde();
    injoignable.add("chef/parade");
    const fait = await sonde();
    assert.equal(fait.lu, false);
    assert.equal(notifications.size, 1);
    assert.deepEqual(retirees, []);
  });

  test("une liste de projets qui ne se lit pas ne notifie ni ne retire rien", async () => {
    monde["chef/parade"]![40] = toDo("Keep the old export?");
    await sonde();
    const fait = await sonder({ appeler: github, memoire, notifier, projets: async () => Promise.reject(new Error("offline")) });
    assert.equal(fait.lu, false);
    assert.equal(notifications.size, 1);
  });
});
