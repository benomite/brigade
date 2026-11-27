// Le départ d'un projet (#3268) : les issues ouvertes lues sur GitHub, le triage du second — la section de son rôle donnée à
// `claude -p` —, et la mise sur le rail des lignes que le chef garde. Aucune lecture qui échoue ne devient une liste ou une
// priorité par défaut.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { DELAY_OF_TRIAGE_MS, launchTheTriage, readTheAnswer, putOnTheRail, proposeTheDeparture, triageOfSecond, type LaunchTheTriage } from "../src/departure-of-project.ts";
import { ROLE_OF_SECOND } from "../src/second/launch.ts";
import type { CallGitHub, AnswerGitHub } from "../src/board/client.ts";
import type { ClientOfThePriority } from "../src/priority.ts";

const issue = (number: number, extra: Record<string, unknown> = {}) => ({ number, title: `Issue ${number}`, body: `body ${number}`, labels: [], ...extra });
const GitHub = (pages: unknown[][], status = 200): CallGitHub => async (path) => {
  const page = Number(/[?&]page=(\d+)/.exec(path)?.[1] ?? 1);
  return { status: status, data: pages[page - 1] ?? [] };
};
const answers = (prios: Record<number, [number, string]>): LaunchTheTriage => async () => ({
  code: 0,
  sortie: JSON.stringify(Object.entries(prios).map(([number, [prio, reason]]) => ({ number: Number(number), prio, reason }))),
  erreur: "",
});
const base = { depot: "chef/cantine", dossier: "/tmp/cantine", claude: "claude" };

describe("le triage du second", () => {
  test("la consigne est la section de son rôle, mot pour mot, avec les issues sans `fire` — et le compte compte toutes les issues, pas les pull requests", async () => {
    let instruction = "";
    const launch: LaunchTheTriage = async (_c, args, entry) => {
      instruction = entry;
      assert.deepEqual(args, ["-p"]);
      return { code: 0, sortie: JSON.stringify([{ number: 1, prio: 2, reason: "important" }]), erreur: "" };
    };
    const read = GitHub([[issue(1), issue(2, { labels: [{ name: "fire" }] }), { ...issue(3), pull_request: {} }]]);
    const rendered = await proposeTheDeparture({ ...base, lire: read, lancer: launch });
    assert.deepEqual(rendered, { ouvertes: 2, lignes: [{ ticket: 1, titre: "Issue 1", priorite: 2, raison: "important" }] });
    const section = triageOfSecond(readFileSync(ROLE_OF_SECOND, "utf8"));
    assert.ok(section?.includes("`prio:1`, `prio:2` or `prio:3`"));
    assert.ok(instruction.includes(section ?? assert.fail("pas de section")));
    assert.ok(instruction.includes("Issue 1"));
    assert.equal(instruction.includes("Issue 2"), false);
  });

  test("aucune issue ouverte : pas d'écran, et le triage n'est pas appelé", async () => {
    const launch: LaunchTheTriage = async () => assert.fail("le triage ne se lance pas sans issue");
    assert.deepEqual(await proposeTheDeparture({ ...base, lire: GitHub([[{ ...issue(5), pull_request: {} }]]), lancer: launch }), { aucune: true });
  });

  test("toutes les pages sont lues : 101 issues, la 101e sur la seconde page, comptée et triée", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => issue(i + 1));
    let instruction = "";
    const launch: LaunchTheTriage = async (_c, _a, entry) => {
      instruction = entry;
      return { code: 0, sortie: JSON.stringify([{ number: 101, prio: 3, reason: "last" }]), erreur: "" };
    };
    const rendered = await proposeTheDeparture({ ...base, lire: GitHub([page1, [issue(101)]]), lancer: launch });
    assert.ok("ouvertes" in rendered && rendered.ouvertes === 101);
    assert.ok(instruction.includes("Issue 101"));
  });

  test("GitHub qui refuse la lecture : rien n'est inventé, la cause est dite", async () => {
    const rendered = await proposeTheDeparture({ ...base, lire: GitHub([[]], 403), lancer: answers({}) });
    assert.ok("sans" in rendered && rendered.sans.includes("were not read") && rendered.detail?.includes("403"));
  });

  test("un triage qui échoue, ou répond ce qui ne se lit pas, est dit — jamais une liste ni une priorité par défaut", async () => {
    const read = GitHub([[issue(1)]]);
    const failure = await proposeTheDeparture({ ...base, lire: read, lancer: async () => ({ code: 1, sortie: "", erreur: "boom" }) });
    assert.ok("sans" in failure && failure.detail === "boom");
    for (const output of ["no list here", JSON.stringify([{ number: 1, prio: 9, reason: "x" }]), JSON.stringify([{ number: 1, prio: 1, reason: "" }]), JSON.stringify([{ number: 99, prio: 1, reason: "x" }])]) {
      const rendered = await proposeTheDeparture({ ...base, lire: read, lancer: async () => ({ code: 0, sortie: output, erreur: "" }) });
      assert.ok("sans" in rendered, output);
    }
  });

  test("une issue que le triage ne nomme pas n'est pas proposée ; l'ordre est celui des issues", () => {
    const lines = readTheAnswer(JSON.stringify([{ number: 2, prio: 3, reason: "later" }, { number: 1, prio: 1, reason: "first" }]), [{ number: 1, title: "a", body: "", labels: [] }, { number: 2, title: "b", body: "", labels: [] }, { number: 3, title: "c", body: "", labels: [] }]);
    assert.deepEqual(lines.map(({ ticket }) => ticket), [1, 2]);
  });

  test("un vrai processus lancé : la consigne arrive sur son entrée, sa sortie revient, et un délai dépassé le tue", async () => {
    const eco = await launchTheTriage(process.execPath, ["-e", "process.stdin.pipe(process.stdout)"], "bonjour", process.cwd(), 5_000);
    assert.deepEqual(eco, { code: 0, sortie: "bonjour", erreur: "" });
    const slow = await launchTheTriage(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], "", process.cwd(), 200);
    assert.notEqual(slow.code, 0);
    assert.ok(slow.erreur.includes("no answer within"));
    const absent = await launchTheTriage("/nulle/part/claude", ["-p"], "", process.cwd(), 1_000);
    assert.equal(absent.code, null);
  });
});

describe("la borne du triage", () => {
  test("un triage plus lent que la borne : le processus est tué et l'écran rend la cause — jamais une attente sans fin ; la borne tient sous les deux minutes du critère", async () => {
    assert.ok(DELAY_OF_TRIAGE_MS < 120_000);
    const issues = Array.from({ length: 100 }, (_, i) => issue(i + 1));
    // Le vrai lanceur, un processus qui dort bien au-delà de la borne (ramenée à 300 ms) : la même voie que la borne de 100 s.
    const launch: LaunchTheTriage = (_command, _args, entry, _folder, delayMs) => launchTheTriage(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], entry, process.cwd(), delayMs);
    const start = performance.now();
    const rendered = await proposeTheDeparture({ ...base, lire: GitHub([issues]), lancer: launch, delaiMs: 300 });
    assert.ok(performance.now() - start < 5_000);
    assert.ok("sans" in rendered && rendered.detail?.includes("no answer within"), JSON.stringify(rendered));
  });
});

describe("la mise sur le rail", () => {
  const client = (labels: Record<number, string[]> = {}, refuse?: (path: string) => boolean) => {
    const writtenOnes: { methode: string; chemin: string; corps?: unknown }[] = [];
    const answer = (status: number, data: unknown = {}): AnswerGitHub => ({ status, data });
    const c: ClientOfThePriority = {
      lire: async (path) => answer(200, { labels: (labels[Number(/issues\/(\d+)/.exec(path)?.[1])] ?? []).map((name) => ({ name })) }),
      ecrire: async (methode, path, body) => {
        writtenOnes.push({ methode, chemin: path, corps: body });
        return refuse?.(path) === true ? answer(403, { message: "no" }) : answer(200);
      },
    };
    return { c, ecrits: writtenOnes };
  };

  test("chaque ligne reçoit sa priorité, `product` et `fire` — l'ancienne priorité est retirée", async () => {
    const { c, ecrits: writtenOnes } = client({ 12: ["prio:3"] });
    const mise = await putOnTheRail({ depot: "chef/cantine", lignes: [{ ticket: 12, priorite: 1 }, { ticket: 31, priorite: 2 }], client: c });
    assert.deepEqual(mise, { fait: [12, 31], refus: [] });
    assert.deepEqual(writtenOnes.map(({ methode, chemin: path, corps: body }) => [methode, path, body]), [
      ["POST", "/repos/chef/cantine/issues/12/labels", { labels: ["prio:1"] }],
      ["DELETE", "/repos/chef/cantine/issues/12/labels/prio%3A3", undefined],
      ["POST", "/repos/chef/cantine/issues/12/labels", { labels: ["product", "fire"] }],
      ["POST", "/repos/chef/cantine/issues/31/labels", { labels: ["prio:2"] }],
      ["POST", "/repos/chef/cantine/issues/31/labels", { labels: ["product", "fire"] }],
    ]);
  });

  test("une ligne refusée par GitHub est dite avec sa cause et n'est pas comptée ; les autres continuent", async () => {
    const { c } = client({}, (path) => path.includes("/12/"));
    const mise = await putOnTheRail({ depot: "chef/cantine", lignes: [{ ticket: 12, priorite: 1 }, { ticket: 31, priorite: 2 }], client: c });
    assert.deepEqual(mise.fait, [31]);
    assert.equal(mise.refus[0]?.ticket, 12);
  });

  test("une liste qui n'en est pas, ou une priorité hors échelle : rien n'est posé", async () => {
    const { c, ecrits: writtenOnes } = client();
    assert.equal((await putOnTheRail({ depot: "chef/cantine", lignes: "x", client: c })).fait.length, 0);
    const mise = await putOnTheRail({ depot: "chef/cantine", lignes: [{ ticket: 12, priorite: "high" }], client: c });
    assert.equal(mise.refus.length, 1);
    assert.equal(writtenOnes.length, 0);
  });
});
