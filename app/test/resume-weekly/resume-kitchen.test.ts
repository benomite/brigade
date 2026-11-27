// Ce que le process principal lit et fait pour la page des résumés hebdomadaires (#3263) : le jour du résumé lu dans
// `projet.json` et changé par une pull request, devant un faux GitHub ; les résumés lus par `report --week` et publiés
// par `release-notes`, devant une fausse commande du runtime qui rend ce que le vrai écrit.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { resumeDeLaSemaine } from "../../../runtime/src/resume-hebdomadaire/resume.ts";
import { words, type Read, type Rendered } from "../../src/box.ts";
import type { ClientOfThePriority } from "../../src/priority.ts";
import { changeTheDay, readTheDay, readTheResumes, publishTheResume, weeksARead } from "../../src/vue/resume-weekly/resume-kitchen.ts";

const READ: Read = { nom: "parade", cuisine: { locale: { node: "node", runtime: "/runtime", racine: "/station", env: {} } } };
const RESUME = resumeDeLaSemaine({
  project: "parade",
  weekStart: "2026-11-02",
  weekEnd: "2026-11-08",
  servis: [{ number: 12, title: "Show the rail age on the tile", url: "https://github.com/chef/parade/issues/12", labels: [], epic: null }],
  attentes: [],
});
const rendered = (output: string, error: { code: number } | null = null, errors = ""): Rendered => ({ lance: "$ node geste.ts parade …", erreur: error as Rendered["erreur"], sortie: output, erreurs: errors });
const base64 = (object: unknown) => Buffer.from(JSON.stringify(object), "utf8").toString("base64");

// Un faux GitHub : `projet.json` tel que `fichier` le dit (null : absent), et chaque écriture retenue.
function github(file: unknown, { lecture: reading = 200 }: { lecture?: number } = {}) {
  const writtenOnes: { methode: string; chemin: string; corps: unknown }[] = [];
  const client: ClientOfThePriority = {
    lire: async (path) => {
      if (path.includes("/contents/")) return file === null ? { status: 404, data: {} } : reading !== 200 ? { status: reading, data: { message: "Server Error" } } : { status: 200, data: { content: base64(file), sha: "abc" } };
      if (path.includes("/git/ref/heads/")) return { status: 200, data: { object: { sha: "tete" } } };
      return { status: 404, data: {} };
    },
    ecrire: async (method, path, body) => {
      writtenOnes.push({ methode: method, chemin: path, corps: body });
      if (path.endsWith("/git/refs")) return { status: 201, data: {} };
      if (path.includes("/contents/")) return { status: 200, data: {} };
      if (path.endsWith("/pulls")) return { status: 201, data: { number: 40, html_url: "https://github.com/chef/parade/pull/40" } };
      return { status: 204, data: {} };
    },
  };
  return { client, ecrits: writtenOnes };
}

describe("le jour du résumé (#3263)", () => {
  test("les semaines lues commencent au jour réglé, la plus récente d'abord, dont le résumé a pu s'écrire", () => {
    // Le mercredi 11 novembre 2026 : le résumé du lundi 9 couvre la semaine du 2.
    assert.deepEqual(weeksARead("monday", new Date("2026-11-11T12:00:00Z"), 3), ["2026-11-02", "2026-10-26", "2026-10-19"]);
    // Le jeudi 12, jour réglé : celui du jour couvre la semaine du jeudi 5.
    assert.deepEqual(weeksARead("thursday", new Date("2026-11-12T00:30:00Z"), 2), ["2026-11-05", "2026-10-29"]);
  });

  test("absent du fichier, ou sans fichier : lundi, dit non réglé ; réglé : le sien", async () => {
    assert.deepEqual(await readTheDay({ depot: "chef/parade", branche: "main", client: github({ version: 1 }).client }), { jour: "monday", pose: false });
    assert.deepEqual(await readTheDay({ depot: "chef/parade", branche: "main", client: github(null).client }), { jour: "monday", pose: false });
    assert.deepEqual(await readTheDay({ depot: "chef/parade", branche: "main", client: github({ version: 1, weeklySummaryDay: "friday" }).client }), { jour: "friday", pose: true });
  });

  test("un jour qui n'en est pas un, ou un fichier illisible, ne vaut pas lundi : il ne se lit pas", async () => {
    const fake = await readTheDay({ depot: "chef/parade", branche: "main", client: github({ version: 1, weeklySummaryDay: "someday" }).client });
    assert.ok("sans" in fake);
    assert.match(fake.detail ?? "", /not a day of the week/);
    const refuses = await readTheDay({ depot: "chef/parade", branche: "main", client: github({}, { lecture: 500 }).client });
    assert.ok("sans" in refuses);
    assert.match(refuses.detail ?? "", /HTTP 500/);
  });

  test("jeudi choisi : weeklySummaryDay = thursday s'écrit dans projet.json, le reste gardé, proposé par une PR", async () => {
    const { client, ecrits: writtenOnes } = github({ version: 1, integrationBranch: "main", chef: "benomite" });
    const rendered = await changeTheDay({ depot: "chef/parade", branche: "main", jour: "thursday", client });
    assert.deepEqual(rendered, { pr: "https://github.com/chef/parade/pull/40", numero: 40, jour: "thursday" });
    const file = writtenOnes.find(({ methode: method, chemin: path }) => method === "PUT" && path.endsWith(".claude/brigade/projet.json"));
    const body = file?.corps as { content: string; sha: string };
    assert.deepEqual(JSON.parse(Buffer.from(body.content, "base64").toString("utf8")), { version: 1, integrationBranch: "main", chef: "benomite", weeklySummaryDay: "thursday" });
    assert.equal(body.sha, "abc");
  });

  test("le jour déjà là ne propose rien ; un mot qui n'est pas un jour n'écrit rien", async () => {
    const already = github({ version: 1, weeklySummaryDay: "thursday" });
    assert.ok("fait" in (await changeTheDay({ depot: "chef/parade", branche: "main", jour: "thursday", client: already.client })));
    assert.equal(already.ecrits.length, 0);
    const fake = github({ version: 1 });
    assert.ok("refus" in (await changeTheDay({ depot: "chef/parade", branche: "main", jour: "someday", client: fake.client })));
    assert.equal(fake.ecrits.length, 0);
  });
});

describe("les résumés, lus là où la cuisine tourne (#3263)", () => {
  const NOW = new Date("2026-11-11T12:00:00Z");

  test("une lecture par semaine ; une semaine sans résumé n'est pas une erreur, un résumé illisible est nommé", async () => {
    const commands: string[] = [];
    const readOne = await readTheResumes({
      projet: "parade",
      lu: READ,
      jour: "monday",
      maintenant: NOW,
      lancer: async (_, command) => {
        commands.push(command);
        if (command === "report --week 2026-11-02") return rendered(JSON.stringify(RESUME, null, 2));
        if (command === "report --week 2026-10-26") return rendered("", { code: 1 }, "brigade: the weekly summary of 2026-10-26 does not read: Unexpected token");
        return rendered("", { code: 1 }, "brigade: no weekly summary of parade for the week starting 2026-10-19");
      },
    });
    assert.deepEqual(commands.slice(0, 2), ["report --week 2026-11-02", "report --week 2026-10-26"]);
    assert.equal(commands.length, 6);
    assert.ok("resumes" in readOne);
    assert.deepEqual(readOne.resumes, [RESUME]);
    assert.deepEqual(
      readOne.illisibles.map(({ weekStart }) => weekStart),
      ["2026-10-26"],
    );
  });

  test("un runtime sans `report --week` le dit, et demande sa mise à jour ; un projet qui ne cuit pas ici le dit", async () => {
    const old = await readTheResumes({ projet: "parade", lu: READ, jour: "monday", maintenant: NOW, lancer: async () => rendered("", { code: 2 }, "brigade: usage: … npm --prefix runtime run report") });
    assert.ok("sans" in old);
    assert.match(old.sans, /update it/);
    const elsewhere = await readTheResumes({ projet: "parade", lu: undefined, jour: "monday", maintenant: NOW, lancer: async () => assert.fail("rien ne se lance") });
    assert.ok("sans" in elsewhere);
  });

  test("une sortie qui n'a pas la forme d'un résumé est illisible, rien n'y est complété", async () => {
    const readOne = await readTheResumes({ projet: "parade", lu: READ, jour: "monday", maintenant: NOW, lancer: async () => rendered(JSON.stringify({ ...RESUME, waiting: "none" })) });
    assert.ok("resumes" in readOne);
    assert.equal(readOne.resumes.length, 0);
    assert.equal(readOne.illisibles.length, 6);
  });
});

describe("la publication comme notes de version (#3263)", () => {
  // La commande lancée, et le markdown du fichier qu'elle reçoit, lu pendant l'appel.
  async function publish(answer: Rendered, tag: unknown = "v1.4.0") {
    const calls: { commande: string; markdown: unknown }[] = [];
    const rendered = await publishTheResume({
      projet: "parade",
      lu: READ,
      resume: RESUME,
      tag,
      lancer: async (_, command) => {
        const file = words(command)[2] as string;
        calls.push({ commande: command, markdown: (JSON.parse(readFileSync(file, "utf8")) as { markdown: unknown }).markdown });
        return answer;
      },
    });
    return { rendu: rendered, appels: calls };
  }

  test("une seule commande, `release-notes <tag> <fichier>`, le fichier portant le markdown du résumé ; publiée, la release se dit", async () => {
    const { rendu: published, appels: calls } = await publish(rendered("release v1.4.0 published: https://github.com/chef/parade/releases/tag/v1.4.0\n"));
    assert.equal(calls.length, 1);
    const [command, tag, file, ...remains] = words(calls[0]?.commande ?? "");
    assert.deepEqual([command, tag, remains], ["release-notes", "v1.4.0", []]);
    assert.match(file ?? "", /2026-11-02\.json$/);
    assert.throws(() => readFileSync(file as string), /ENOENT/, "le fichier provisoire est retiré après l'appel");
    assert.equal(calls[0]?.markdown, RESUME.markdown);
    assert.deepEqual(published, { publiee: "published as the release notes of v1.4.0", url: "https://github.com/chef/parade/releases/tag/v1.4.0" });
  });

  test("déjà publiée : la phrase le dit ; refusée : la ligne du runtime ; sans la commande : la mise à jour", async () => {
    const already = (await publish(rendered("release v1.4.0 already published: https://github.com/chef/parade/releases/tag/v1.4.0 — nothing was changed\n"))).rendu;
    assert.ok("dejaPubliee" in already);
    const refusal = (await publish(rendered("", { code: 1 }, "brigade : The tag v1.4.0 does not exist on the repository: nothing was published.\n"))).rendu;
    assert.deepEqual("refus" in refusal && refusal.refus, "The tag v1.4.0 does not exist on the repository: nothing was published.");
    const old = (await publish(rendered("", { code: 66 }, "brigade : « release-notes » n'est pas une commande du runtime"))).rendu;
    assert.match("refus" in old ? old.refus : "", /update it/);
  });

  test("un tag qui ne s'écrit pas en un mot ne lance rien", async () => {
    for (const tag of ["", "  ", "v1 2", "v1';rm", 12]) {
      const { rendu: refuses, appels: calls } = await publish(rendered(""), tag);
      assert.ok("refus" in refuses);
      assert.equal(calls.length, 0);
    }
  });
});
