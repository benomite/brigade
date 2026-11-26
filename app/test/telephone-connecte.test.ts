// La trace du téléphone connecté (#3303, telephone-connecte.ts) : le téléphone la pose une fois dans un gist du compte,
// le desktop la lit pour ne pas offrir d'installer un téléphone déjà connecté.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ouvrirLaLectureGitHub } from "../src/lecture-github-telephone.ts";
import type { EnvoiGitHub, MethodeDEcriture } from "../src/priorite.ts";
import { API_GITHUB, type AppelGitHub, type Envoi, type ReponseGitHub } from "../src/tableau/client.ts";
import { DESCRIPTION_DU_TELEPHONE, documentDuTelephone, FICHIER_TELEPHONE, poserLaTrace, porteLaTrace, traceLue } from "../src/telephone-connecte.ts";

const INSTANT = new Date("2026-11-11T10:00:00.000Z");
const gistDe = (id: string, ...fichiers: string[]) => ({ id, files: Object.fromEntries(fichiers.map((filename) => [filename, { filename }])) });
// La liste des gists du compte, par pages de cent.
const listant =
  (gists: unknown[], refus?: ReponseGitHub): AppelGitHub =>
  async (chemin) => {
    if (refus !== undefined) return refus;
    const page = Number(/[?&]page=(\d+)/.exec(chemin)?.[1] ?? "1");
    return { status: 200, data: gists.slice((page - 1) * 100, page * 100) };
  };

describe("la trace lue", () => {
  test("un gist qui porte le fichier : connecté ; aucun : pas connecté", async () => {
    assert.equal(await traceLue(listant([gistDe("a", "brigade-station.json"), gistDe("b", FICHIER_TELEPHONE)])), true);
    assert.equal(await traceLue(listant([gistDe("a", "brigade-station.json")])), false);
    assert.equal(await traceLue(listant([])), false);
  });

  test("lue sur toutes les pages", async () => {
    const gists = [...Array.from({ length: 100 }, (_, i) => gistDe(`g${i}`, "notes.md")), gistDe("t", FICHIER_TELEPHONE)];
    assert.equal(await traceLue(listant(gists)), true);
  });

  test("un refus de GitHub, ou autre chose qu'une liste : lève, rien n'est décidé", async () => {
    await assert.rejects(traceLue(listant([], { status: 401, data: { message: "Bad credentials" } })));
    await assert.rejects(traceLue(async () => ({ status: 200, data: { message: "?" } })));
  });

  test("porteLaTrace ne lit que la forme de la liste", () => {
    assert.equal(porteLaTrace(gistDe("t", FICHIER_TELEPHONE)), true);
    for (const autre of [null, 42, {}, { files: null }, gistDe("a", "brigade-station.json")]) assert.equal(porteLaTrace(autre), false);
  });
});

describe("la trace posée", () => {
  const client = (gists: unknown[], rendu: ReponseGitHub = { status: 201, data: {} }) => {
    const ecrits: { methode: MethodeDEcriture; chemin: string; corps?: unknown }[] = [];
    return { ecrits, client: { lire: listant(gists), ecrire: async (methode: MethodeDEcriture, chemin: string, corps?: unknown) => (ecrits.push({ methode, chemin, corps }), rendu) } };
  };

  test("aucune trace : un gist secret neuf, qui la porte", async () => {
    const { ecrits, client: c } = client([gistDe("a", "brigade-station.json")]);
    await poserLaTrace({ client: c, maintenant: () => INSTANT });
    assert.deepEqual(ecrits, [{ methode: "POST", chemin: "/gists", corps: { description: DESCRIPTION_DU_TELEPHONE, public: false, files: { [FICHIER_TELEPHONE]: { content: documentDuTelephone(INSTANT) } } } }]);
    assert.deepEqual(JSON.parse(documentDuTelephone(INSTANT)), { brigade: "telephone", format: 1, connecteLe: INSTANT.toISOString() });
  });

  test("déjà posée : rien n'est écrit", async () => {
    const { ecrits, client: c } = client([gistDe("t", FICHIER_TELEPHONE)]);
    await poserLaTrace({ client: c, maintenant: () => INSTANT });
    assert.deepEqual(ecrits, []);
  });

  test("une écriture refusée lève", async () => {
    const { client: c } = client([], { status: 403, data: { message: "Resource not accessible" } });
    await assert.rejects(poserLaTrace({ client: c, maintenant: () => INSTANT }));
  });
});

describe("sur le téléphone connecté", () => {
  // GitHub, faux : la liste des gists du compte — celle de la station, puis la trace une fois postée. Chaque écriture notée.
  function github({ refuserLaCreation = false } = {}) {
    const gists: unknown[] = [gistDe("s", "brigade-projets.json")];
    const posts: string[] = [];
    let refuser = refuserLaCreation;
    const envoyer: Envoi = async (adresse) => {
      const chemin = adresse.slice(API_GITHUB.length);
      if (chemin.startsWith("/gists?")) return { status: 200, data: /[?&]page=1(&|$)/.test(chemin) ? gists : [] };
      if (chemin === "/gists/s") return { status: 200, data: { id: "s", files: { "brigade-projets.json": { content: "{}" } } } };
      return { status: 404, data: { message: "Not Found" } };
    };
    const ecrire: EnvoiGitHub = async (methode, adresse, _entetes, corps) => {
      posts.push(`${methode} ${adresse.slice(API_GITHUB.length)}`);
      if (refuser) return { status: 502, data: { message: "Bad gateway" } };
      gists.push({ id: "t", files: (corps as { files: Record<string, unknown> }).files });
      return { status: 201, data: {} };
    };
    return { envoyer, ecrire, posts, accepter: () => void (refuser = false) };
  }
  const lecture = (gh: ReturnType<typeof github>, avecEcriture = true) =>
    ouvrirLaLectureGitHub({ jeton: async () => "jeton", envoyer: gh.envoyer, ...(avecEcriture ? { ecrire: gh.ecrire } : {}), dire: () => undefined, maintenant: () => INSTANT, planifier: () => () => undefined });

  test("sa première lecture pose la trace, une fois", async () => {
    const gh = github();
    const lue = lecture(gh);
    await lue.relire();
    await lue.relire();
    assert.deepEqual(gh.posts, ["POST /gists"]);
  });

  test("une pose refusée se refait à la lecture suivante", async () => {
    const gh = github({ refuserLaCreation: true });
    const lue = lecture(gh);
    await lue.relire();
    gh.accepter();
    await lue.relire();
    await lue.relire();
    assert.deepEqual(gh.posts, ["POST /gists", "POST /gists"]);
  });

  test("sans écriture, rien ne part", async () => {
    const gh = github();
    await lecture(gh, false).relire();
    assert.deepEqual(gh.posts, []);
  });
});
