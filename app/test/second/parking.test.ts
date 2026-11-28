// #4262 — le second et l'app parquent et déparquent un ticket de la même façon : les deux mêmes fonctions, écrites sur
// l'issue, sur tout projet — ici BOBL-tech/mirrorlab, pas brigade —, sans commande ni shell de la box. Le second les joue
// par la commande de parking (second/parking.ts), que l'app lui donne à chaque début de session (hook-of-parking.ts).
// Joué sur un faux GitHub qui tient les labels et les commentaires de ses issues.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join, sep } from "node:path";
import { describe, test } from "node:test";
import type { ClientOfThePriority } from "../../src/priority.ts";
import { hooksOfParking } from "../../src/second/hook-of-parking.ts";
import { context, principal } from "../../src/second/action-of-parking.ts";
import { unpark } from "../../src/actions-github.ts";
import { openTerminals, type Launch } from "../../src/terminals.ts";
import { park } from "../../src/vue/wait/wait-github.ts";

const REPOSITORY = "BOBL-tech/mirrorlab";
const TICKET = 614;
const TODAY = new Date(2026, 10, 9, 15, 5);
const DAY = "2026-11-20";
const SCRIPT = join(import.meta.dirname, "../../src/second/parking.ts");
// Le script tel que la commande le cite : sous Windows, ses `\\` deviennent des `/`, que le `bash` de Git lit (cite1, hook-of-the-file.ts).
const SCRIPT_CITE = sep === "\\" ? SCRIPT.replaceAll("\\", "/") : SCRIPT;

type Answer = { status: number; data: unknown };
// Le GitHub d'un projet : l'issue 614, une carte de TODO. `panne` : ce qu'il rend à la place, pour une écriture.
function github(outage: (writing: string) => Answer | undefined = () => undefined) {
  const issues = new Map([[TICKET, { labels: ["fire", "chef-todo"], commentaires: [] as string[] }]]);
  const writtenEntries: string[] = [];
  const client: ClientOfThePriority = {
    lire: async () => ({ status: 404, data: { message: "Not Found" } }),
    ecrire: async (method, path, body) => {
      writtenEntries.push(`${method} ${path}`);
      const inOutage = outage(`${method} ${path}`);
      if (inOutage !== undefined) return inOutage;
      const [, repository, number, remains = ""] = /^\/repos\/([^/]+\/[^/]+)\/issues\/(\d+)(.*)$/.exec(path) ?? [];
      const issue = repository === REPOSITORY ? issues.get(Number(number)) : undefined;
      if (issue === undefined) return { status: 404, data: { message: "Not Found" } };
      if (method === "POST" && remains === "/comments") {
        issue.commentaires.push((body as { body: string }).body);
        return { status: 201, data: { html_url: `https://github.com/${REPOSITORY}/issues/${number}#issuecomment-${issue.commentaires.length}` } };
      }
      if (method === "POST" && remains === "/labels") {
        for (const label of (body as { labels: string[] }).labels) if (!issue.labels.includes(label)) issue.labels.push(label);
        return { status: 200, data: [] };
      }
      const removed = /^\/labels\/(.+)$/.exec(remains)?.[1];
      if (method === "DELETE" && removed !== undefined) {
        const rank = issue.labels.indexOf(decodeURIComponent(removed));
        if (rank < 0) return { status: 404, data: { message: "Label does not exist" } };
        issue.labels.splice(rank, 1);
        return { status: 200, data: [] };
      }
      return { status: 404, data: { message: "Not Found" } };
    },
  };
  const state = () => structuredClone(issues.get(TICKET));
  return { client, ecrites: writtenEntries, etat: state };
}

const parkByTheApp = (client: ClientOfThePriority) => park(REPOSITORY, TICKET, { quoi: "the signed quote", qui: "the client", relance: DAY }, TODAY, client);
async function byTheSecond(client: ClientOfThePriority, ...args: string[]) {
  const [said, redit]: [string[], string[]] = [[], []];
  const code = await principal(args, { client, aujourdhui: TODAY, dire: (line) => void said.push(line), redire: (line) => void redit.push(line) });
  return { code, dit: said.join("\n"), redit: redit.join("\n") };
}
// Ce que la commande dit d'une forme qui n'en est pas une.
const USAGE = "usage: parking.ts park <owner>/<repo>#<issue> --who <who it waits for> --what <what it waits for> --until <YYYY-MM-DD>\n       parking.ts unpark <owner>/<repo>#<issue>";
const PARK = ["park", `${REPOSITORY}#${TICKET}`, "--who", "the client", "--what", "the signed quote", "--until", DAY];

describe("le second et l'app parquent et déparquent un ticket dans le même état, sur un projet qui n'est pas brigade", () => {

  test("déparqué — `unpark` de l'app, `unpark` du second : le même état", async () => {
    const app = github();
    const second = github();
    for (const { client } of [app, second]) assert.equal((await byTheSecond(client, ...PARK)).code, 0);
    assert.ok("fait" in (await unpark(REPOSITORY, TICKET, app.client)));
    const launches = await byTheSecond(second.client, "unpark", `${REPOSITORY}#${TICKET}`);
    assert.deepEqual([launches.code, launches.redit], [0, ""]);
    assert.equal(launches.dit, `back to the kitchen on GitHub: #${TICKET} no longer carries \`parked\` — it resumes exactly where it was — https://github.com/${REPOSITORY}/issues/${TICKET}`);
    assert.deepEqual(second.ecrites, app.ecrites);
    assert.deepEqual(second.etat(), app.etat());
    assert.deepEqual(second.etat()?.labels, ["fire", "chef-todo"]);
  });
});

describe("déparquer un ticket que le chef attend", () => {
  test("`parked:chef` seul : `unpark` le retire et le dit", async () => {
    const { client, etat } = github();
    for (const label of ["parked:chef"]) await client.ecrire("POST", `/repos/${REPOSITORY}/issues/${TICKET}/labels`, { labels: [label] });
    const launches = await byTheSecond(client, "unpark", `${REPOSITORY}#${TICKET}`);
    assert.deepEqual([launches.code, launches.redit], [0, ""]);
    assert.equal(launches.dit, `back to the kitchen on GitHub: #${TICKET} no longer carries \`parked:chef\` — it resumes exactly where it was — https://github.com/${REPOSITORY}/issues/${TICKET}`);
    assert.deepEqual(etat()?.labels, ["fire", "chef-todo"]);
  });
});

describe("la commande de parking : ce qu'elle refuse, et ce que GitHub refuse", () => {
  test("une commande mal formée : l'usage, le code 2, et rien n'est écrit", async () => {
    const { client, ecrites: writtenEntries } = github();
    const target = `${REPOSITORY}#${TICKET}`;
    for (const args of [
      [],
      ["park"],
      ["park", "614", "--who", "a", "--what", "b", "--until", DAY],
      ["park", target, "--who", "a", "--what", "b"],
      ["park", target, "--who", "a", "--what", "b", "--until"],
      ["park", target, "--who", "a", "--who", "b", "--what", "c", "--until", DAY],
      ["park", target, "--who", "a", "--what", "b", "--until", DAY, "--from", "c"],
      ["unpark", target, "--who", "a"],
      ["unpark", "mirrorlab#614"],
      ["resume", target],
    ]) {
      assert.deepEqual(await byTheSecond(client, ...args), { code: 2, dit: "", redit: USAGE }, args.join(" "));
    }
    assert.deepEqual(writtenEntries, []);
  });

  test("une date qui n'est pas à venir, ou sans quoi : refusée par la lecture de l'app, le code 1, et rien n'est écrit", async () => {
    const { client, ecrites: writtenEntries } = github();
    assert.deepEqual(await byTheSecond(client, "park", `${REPOSITORY}#${TICKET}`, "--who", "the client", "--what", "the signed quote", "--until", "2026-11-09"), {
      code: 1,
      dit: "",
      redit: "nothing is written: the follow-up date 2026-11-09 is not after today — a follow-up is to come",
    });
    assert.equal((await byTheSecond(client, "park", `${REPOSITORY}#${TICKET}`, "--who", "the client", "--what", " ", "--until", DAY)).redit, "nothing is written: say what it waits for, in your words");
    assert.deepEqual(writtenEntries, []);
  });

  test("ce que GitHub refuse se dit, avec son détail, au code 1 : le commentaire refusé ne pose aucun label ; un retrait refusé laisse le ticket parqué", async () => {
    const refuses = github((writing) => (writing.endsWith("/comments") ? { status: 403, data: { message: "Resource not accessible by integration" } } : undefined));
    assert.deepEqual(await byTheSecond(refuses.client, ...PARK), {
      code: 1,
      dit: "",
      redit: `nothing was changed: GitHub did not take the WAITING comment on #${TICKET} — GitHub refused the comment (HTTP 403): Resource not accessible by integration`,
    });
    assert.deepEqual(refuses.etat()?.labels, ["fire", "chef-todo"]);

    const removalRefuses = github((writing) => (writing.startsWith("DELETE") ? { status: 500, data: { message: "Server Error" } } : undefined));
    assert.equal((await byTheSecond(removalRefuses.client, ...PARK)).code, 0);
    const launches = await byTheSecond(removalRefuses.client, "unpark", `${REPOSITORY}#${TICKET}`);
    assert.equal(launches.code, 1);
    assert.match(launches.redit, /^nothing was changed: GitHub did not remove `parked` from #614 — /);
    assert.ok(removalRefuses.etat()?.labels.includes("parked"));
  });
});

describe("la commande donnée au second à chaque début de session", () => {
  test("elle nomme `park` et `unpark` sur le dépôt du projet, avec le `node` et le chemin de ce poste, cités pour le shell", () => {
    const saidOne = context(REPOSITORY, "/Applications/Brigade app/node", "/Applications/Brigade app/src/second/parking.ts", "/");
    assert.ok(saidOne.includes(`  '/Applications/Brigade app/node' '/Applications/Brigade app/src/second/parking.ts' park ${REPOSITORY}#<n> --who '<who>' --what '<what>' --until <YYYY-MM-DD>\n`), saidOne);
    assert.ok(saidOne.includes(`  '/Applications/Brigade app/node' '/Applications/Brigade app/src/second/parking.ts' unpark ${REPOSITORY}#<n>\n`), saidOne);
    assert.match(saidOne, /with no box command/);
    assert.match(context("", "node", "parking.ts", "/"), / park <owner>\/<repo>#<n> /);
    // Sous Windows, le `bash` de Git lit `C:/…`.
    assert.match(context(REPOSITORY, "C:\\Brigade\\node.exe", "C:\\Brigade\\parking.ts", "\\"), /^ {2}'C:\/Brigade\/node\.exe' 'C:\/Brigade\/parking\.ts' park /m);
  });

  test("le crochet du début de session — ouverture, reprise, compaction — la donne, joué pour de bon par `node`", () => {
    const [hook] = hooksOfParking({ node: "/usr/bin/node", cible: { nom: "mirrorlab", depot: REPOSITORY } }).SessionStart ?? [];
    assert.equal(hook?.matcher, "startup|resume|compact");
    assert.equal(hook?.hooks[0]?.command, `'/usr/bin/node' '${SCRIPT_CITE}' 'context' '${REPOSITORY}'`);
    const output = JSON.parse(execFileSync(process.execPath, [SCRIPT, "context", REPOSITORY], { encoding: "utf8" })) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
    assert.equal(output.hookSpecificOutput.hookEventName, "SessionStart");
    assert.ok(output.hookSpecificOutput.additionalContext.includes(`'${SCRIPT_CITE}' park ${REPOSITORY}#<n> --who`), output.hookSpecificOutput.additionalContext);
  });

  test("le lancement du second le porte dans ses réglages", () => {
    const launched: Launch[] = [];
    const terminals = openTerminals({
      claude: "claude",
      shell: "/bin/zsh",
      node: "/usr/bin/node",
      ouvrirPty(launch) {
        launched.push(launch);
        return { ecrire: () => {}, redimensionner: () => {}, tuer: () => {} };
      },
      surSortie: () => {},
      surEtat: () => {},
    });
    terminals.espace({ nom: "mirrorlab", dossier: "/projets/mirrorlab", depot: REPOSITORY });
    const args = launched.at(0)?.args ?? assert.fail("aucun lancement");
    const settings = JSON.parse(args[args.indexOf("--settings") + 1] ?? "") as { hooks: { SessionStart: { hooks: { command: string }[] }[] } };
    const commands = settings.hooks.SessionStart.flatMap(({ hooks }) => hooks.map(({ command }) => command));
    assert.ok(commands.includes(`'/usr/bin/node' '${SCRIPT_CITE}' 'context' '${REPOSITORY}'`), commands.join("\n"));
  });
});
