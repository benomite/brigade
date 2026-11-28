// La notification d'une carte de TODO (#2747) : joué sur un faux GitHub qui tient les issues, leurs labels et leurs
// commentaires de deux projets, une mémoire qui survit au « redémarrage », et un faux système de notifications.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { cardAnswered, identifierOf, probe, type Memory, type NotifiedEntries, type Notification, type Notifier } from "../src/notifications-todo.ts";
import type { CallGitHub, AnswerGitHub } from "../src/board/client.ts";

type Issue = { labels: string[]; commentaires: string[] };
const PROJECTS = [
  { nom: "parade", depot: "chef/parade" },
  { nom: "atelier", depot: "chef/atelier" },
];
// Un ticket que la cuisine parque pour le chef : le label `parked:chef`, et son commentaire qui dit pourquoi.
const card = (question: string) => `Parked for the chef: ${question}`;
const toDo = (question: string): Issue => ({ labels: ["parked:chef"], commentaires: ["chatter", card(question)] });

let world: Record<string, Record<number, Issue>>;
let unreachable: Set<string>;
let notifications: Map<number, Notification>;
let shown: Notification[];
let removed: number[];
let records: NotifiedEntries;

// Un faux GitHub : les issues ouvertes au label demandé, leurs commentaires, leurs événements.
const github: CallGitHub = async (path) => {
  const ok = (data: unknown): AnswerGitHub => ({ status: 200, data });
  const repository = /\/repos\/([^/]+\/[^/]+)\//.exec(path)?.[1] ?? "";
  if (unreachable.has(repository)) return { status: 502, data: {} };
  const issues = world[repository] ?? {};
  const label = /\/issues\?.*\blabels=([^&]+)/.exec(path)?.[1];
  if (label !== undefined) {
    return ok(Object.entries(issues).filter(([, i]) => i.labels.includes(label)).map(([n, i]) => ({ number: Number(n), title: `Ticket ${n}`, html_url: `https://github.com/${repository}/issues/${n}`, created_at: "2026-11-01T00:00:00Z", labels: i.labels.map((name) => ({ name })) })));
  }
  const [, number, what] = /\/issues\/(\d+)\/(comments|events)/.exec(path) ?? [];
  if (number !== undefined && what === "comments") return ok((issues[Number(number)]?.commentaires ?? []).map((body, i) => ({ body, created_at: `2026-11-05T0${i}:00:00Z`, author_association: "OWNER" })));
  if (number !== undefined) return ok([]);
  return { status: 404, data: {} };
};
const memory: Memory = { lire: () => structuredClone(records), ecrire: (n) => void (records = structuredClone(n)) };
const notify: Notifier = {
  montrer: (n) => void (shown.push(n), notifications.set(n.id, n)),
  retirer: (id) => void (removed.push(id), notifications.delete(id)),
};
const prober = () => probe({ appeler: github, memoire: memory, notifier: notify, projets: async () => PROJECTS });

beforeEach(() => {
  world = { "chef/parade": { 1: { labels: ["fire"], commentaires: [] } }, "chef/atelier": {} };
  unreachable = new Set();
  notifications = new Map();
  shown = [];
  removed = [];
  records = {};
});

describe("la notification d'une carte de TODO", () => {
  test("une nouvelle carte notifie une fois, avec le nom du projet et sa question", async () => {
    world["chef/parade"]![40] = toDo("Keep the old export?");
    assert.deepEqual(await prober(), { lu: true, notifiees: 1, retirees: 0 });
    assert.equal(shown.length, 1);
    assert.ok(shown[0]!.texte.includes("parade") && shown[0]!.texte.includes("Keep the old export?"), shown[0]!.texte);
    assert.deepEqual([shown[0]!.projet, shown[0]!.ticket], ["parade", 40]);
  });

  test("une carte sur un autre projet du chef notifie aussi", async () => {
    world["chef/atelier"]![7] = toDo("Which token?");
    await prober();
    assert.ok(shown[0]!.texte.includes("atelier") && shown[0]!.texte.includes("Which token?"));
  });

  test("le trafic de la cuisine reste silencieux : issues, commentaires, labels, statuts", async () => {
    await prober();
    const parade = world["chef/parade"]!;
    parade[2] = { labels: ["fire", "in-pass"], commentaires: ["Station `box/claude`: taken"] };
    parade[1]!.commentaires.push("a comment");
    parade[1]!.labels.push("prio:1", "parked");
    parade[3] = { labels: ["fire", "served-elsewhere"], commentaires: ["<!-- brigade:renvoi n=1 -->\nnothing to ask"] };
    parade[4] = { labels: ["fire", "chef-todo"], commentaires: ["a label of the old runtime, which the kitchen no longer reads"] };
    delete parade[2];
    assert.deepEqual(await prober(), { lu: true, notifiees: 0, retirees: 0 });
    assert.deepEqual(shown, []);
  });

  test("jamais deux fois : sondages successifs, puis redémarrage de l'app", async () => {
    world["chef/parade"]![40] = toDo("Keep the old export?");
    await prober();
    await prober();
    assert.equal(shown.length, 1);
    // Le redémarrage perd tout sauf la mémoire.
    notifications = new Map();
    await prober();
    assert.equal(shown.length, 1);
  });

  test("une carte qui pose une autre question notifie de nouveau, et remplace l'ancienne", async () => {
    world["chef/parade"]![40] = toDo("Keep the old export?");
    await prober();
    world["chef/parade"]![40] = toDo("Drop the export instead?");
    await prober();
    assert.equal(shown.length, 2);
    assert.equal(notifications.size, 1);
    assert.ok([...notifications.values()][0]!.texte.includes("Drop the export instead?"));
  });

  test("la réponse donnée dans l'app retire la notification, tout de suite", async () => {
    world["chef/parade"]![40] = toDo("Keep the old export?");
    world["chef/parade"]![41] = toDo("Another one?");
    await prober();
    assert.equal(await cardAnswered({ memoire: memory, notifier: notify }, "parade", 40), 1);
    assert.deepEqual([...notifications.values()].map((n) => n.ticket), [41]);
    assert.equal(await cardAnswered({ memoire: memory, notifier: notify }, "parade", 40), 0);
  });

  test("la réponse donnée sur GitHub retire la notification au sondage suivant", async () => {
    world["chef/parade"]![40] = toDo("Keep the old export?");
    world["chef/atelier"]![7] = toDo("Which token?");
    await prober();
    delete world["chef/parade"]![40];
    assert.equal(notifications.size, 2, "rien ne change avant le sondage");
    assert.deepEqual(await prober(), { lu: true, notifiees: 0, retirees: 1 });
    assert.deepEqual([...notifications.values()].map((n) => n.projet), ["atelier"]);
    assert.deepEqual(removed, [identifierOf("parade#40")]);
  });

  test("un projet que GitHub ne lit pas ne retire rien : l'absence de lecture n'est pas une réponse", async () => {
    world["chef/parade"]![40] = toDo("Keep the old export?");
    await prober();
    unreachable.add("chef/parade");
    const done = await prober();
    assert.equal(done.lu, false);
    assert.equal(notifications.size, 1);
    assert.deepEqual(removed, []);
  });

  test("une liste de projets qui ne se lit pas ne notifie ni ne retire rien", async () => {
    world["chef/parade"]![40] = toDo("Keep the old export?");
    await prober();
    const done = await probe({ appeler: github, memoire: memory, notifier: notify, projets: async () => Promise.reject(new Error("offline")) });
    assert.equal(done.lu, false);
    assert.equal(notifications.size, 1);
  });
});
