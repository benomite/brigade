// La trace du téléphone connecté (#3303, phone-connected.ts) : le téléphone la pose une fois dans un gist du compte,
// le desktop la lit pour ne pas offrir d'installer un téléphone déjà connecté.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { openTheReadGitHub } from "../src/read-github-phone.ts";
import type { SendGitHub, MethodOfWriting } from "../src/priority.ts";
import { API_GITHUB, type CallGitHub, type Send, type AnswerGitHub } from "../src/board/client.ts";
import { DESCRIPTION_OF_PHONE, documentOfPhone, FILE_PHONE, setTheTrace, doorTheTrace, traceRead } from "../src/phone-connected.ts";

const INSTANT = new Date("2026-11-11T10:00:00.000Z");
const gistOf = (id: string, ...files: string[]) => ({ id, files: Object.fromEntries(files.map((filename) => [filename, { filename }])) });
// La liste des gists du compte, par pages de cent.
const listing =
  (gists: unknown[], refusal?: AnswerGitHub): CallGitHub =>
  async (path) => {
    if (refusal !== undefined) return refusal;
    const page = Number(/[?&]page=(\d+)/.exec(path)?.[1] ?? "1");
    return { status: 200, data: gists.slice((page - 1) * 100, page * 100) };
  };

describe("la trace lue", () => {
  test("un gist qui porte le fichier : connecté ; aucun : pas connecté", async () => {
    assert.equal(await traceRead(listing([gistOf("a", "brigade-station.json"), gistOf("b", FILE_PHONE)])), true);
    assert.equal(await traceRead(listing([gistOf("a", "brigade-station.json")])), false);
    assert.equal(await traceRead(listing([])), false);
  });

  test("lue sur toutes les pages", async () => {
    const gists = [...Array.from({ length: 100 }, (_, i) => gistOf(`g${i}`, "notes.md")), gistOf("t", FILE_PHONE)];
    assert.equal(await traceRead(listing(gists)), true);
  });

  test("un refus de GitHub, ou autre chose qu'une liste : lève, rien n'est décidé", async () => {
    await assert.rejects(traceRead(listing([], { status: 401, data: { message: "Bad credentials" } })));
    await assert.rejects(traceRead(async () => ({ status: 200, data: { message: "?" } })));
  });

  test("porteLaTrace ne lit que la forme de la liste", () => {
    assert.equal(doorTheTrace(gistOf("t", FILE_PHONE)), true);
    for (const other of [null, 42, {}, { files: null }, gistOf("a", "brigade-station.json")]) assert.equal(doorTheTrace(other), false);
  });
});

describe("la trace posée", () => {
  const client = (gists: unknown[], rendered: AnswerGitHub = { status: 201, data: {} }) => {
    const writtenOnes: { methode: MethodOfWriting; chemin: string; corps?: unknown }[] = [];
    return { ecrits: writtenOnes, client: { lire: listing(gists), ecrire: async (method: MethodOfWriting, path: string, body?: unknown) => (writtenOnes.push({ methode: method, chemin: path, corps: body }), rendered) } };
  };

  test("aucune trace : un gist secret neuf, qui la porte", async () => {
    const { ecrits: writtenOnes, client: c } = client([gistOf("a", "brigade-station.json")]);
    await setTheTrace({ client: c, maintenant: () => INSTANT });
    assert.deepEqual(writtenOnes, [{ methode: "POST", chemin: "/gists", corps: { description: DESCRIPTION_OF_PHONE, public: false, files: { [FILE_PHONE]: { content: documentOfPhone(INSTANT) } } } }]);
    assert.deepEqual(JSON.parse(documentOfPhone(INSTANT)), { brigade: "telephone", format: 1, connecteLe: INSTANT.toISOString() });
  });

  test("déjà posée : rien n'est écrit", async () => {
    const { ecrits: writtenOnes, client: c } = client([gistOf("t", FILE_PHONE)]);
    await setTheTrace({ client: c, maintenant: () => INSTANT });
    assert.deepEqual(writtenOnes, []);
  });

  test("une écriture refusée lève", async () => {
    const { client: c } = client([], { status: 403, data: { message: "Resource not accessible" } });
    await assert.rejects(setTheTrace({ client: c, maintenant: () => INSTANT }));
  });
});

describe("sur le téléphone connecté", () => {
  // GitHub, faux : la liste des gists du compte — celle de la station, puis la trace une fois postée. Chaque écriture notée.
  function github({ refuserLaCreation: refuseTheCreation = false } = {}) {
    const gists: unknown[] = [gistOf("s", "brigade-projets.json")];
    const posts: string[] = [];
    let refuse = refuseTheCreation;
    const send: Send = async (address) => {
      const path = address.slice(API_GITHUB.length);
      if (path.startsWith("/gists?")) return { status: 200, data: /[?&]page=1(&|$)/.test(path) ? gists : [] };
      if (path === "/gists/s") return { status: 200, data: { id: "s", files: { "brigade-projets.json": { content: "{}" } } } };
      return { status: 404, data: { message: "Not Found" } };
    };
    const write: SendGitHub = async (method, address, _headers, body) => {
      posts.push(`${method} ${address.slice(API_GITHUB.length)}`);
      if (refuse) return { status: 502, data: { message: "Bad gateway" } };
      gists.push({ id: "t", files: (body as { files: Record<string, unknown> }).files });
      return { status: 201, data: {} };
    };
    return { envoyer: send, ecrire: write, posts, accepter: () => void (refuse = false) };
  }
  const reading = (gh: ReturnType<typeof github>, withWriting = true) =>
    openTheReadGitHub({ jeton: async () => "jeton", envoyer: gh.envoyer, ...(withWriting ? { ecrire: gh.ecrire } : {}), dire: () => undefined, maintenant: () => INSTANT, planifier: () => () => undefined });

  test("sa première lecture pose la trace, une fois", async () => {
    const gh = github();
    const readEntry = reading(gh);
    await readEntry.relire();
    await readEntry.relire();
    assert.deepEqual(gh.posts, ["POST /gists"]);
  });

  test("une pose refusée se refait à la lecture suivante", async () => {
    const gh = github({ refuserLaCreation: true });
    const readEntry = reading(gh);
    await readEntry.relire();
    gh.accepter();
    await readEntry.relire();
    await readEntry.relire();
    assert.deepEqual(gh.posts, ["POST /gists", "POST /gists"]);
  });

  test("sans écriture, rien ne part", async () => {
    const gh = github();
    await reading(gh, false).relire();
    assert.deepEqual(gh.posts, []);
  });
});
