// Ce que partagent les tests du récapitulatif dans l'app (#3581) : un faux GitHub, le même pour la lecture du rail et de
// TODO par l'app (`AppelGitHub`, board/client.ts) et pour la commande `recap` du runtime, derrière son vrai client
// (runtime/src/github.ts, son transport) ; et la station du projet, où la commande `recap` est jouée telle quelle sur un
// répertoire d'état à elle — chaque appel est un runtime neuf, qui ne garde que ce que son répertoire garde.
import type { ExecFileException } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { Sortie } from "../../../runtime/src/appel.ts";
import { ouvrirGitHub, type Transport } from "../../../runtime/src/github.ts";
import { ouvrirJournal } from "../../../runtime/src/journal.ts";
import { principal } from "../../../runtime/src/recap/commande.ts";
import type { Read, Rendered } from "../../src/box.ts";
import type { CallGitHub, AnswerGitHub } from "../../src/board/client.ts";

// Les issues ouvertes du dépôt, les commentaires de chacune, ses PR fermées.
export type World = { issues: Record<string, unknown>[]; commentaires: Record<number, Record<string, unknown>[]>; fermees: Record<string, unknown>[] };

export const issue = (repository: string, number: number, labels: string[]) => ({ number, title: `Ticket ${number}`, html_url: `https://github.com/${repository}/issues/${number}`, created_at: "2026-11-03T21:00:00Z", labels: labels.map((name) => ({ name })) });
// Une PR fermée : mergée à `mergeLe`, ou pas (null) ; elle sert le ticket que sa branche nomme.
export const closedOne = (repository: string, ticket: number, number: number, mergeThe: string | null) => ({
  number: number,
  title: `#${ticket} — Ticket ${ticket}`,
  html_url: `https://github.com/${repository}/pull/${number}`,
  created_at: "2026-11-04T10:00:00Z",
  updated_at: mergeThe ?? "2026-11-04T12:00:00Z",
  merged_at: mergeThe,
  state: "closed",
  head: { ref: `cook/${ticket}-github`, sha: "a".repeat(40) },
  base: { ref: "main" },
  body: `Closes #${ticket}\n\nCooked by station \`box/claude\`.`,
});

const ok = (data: unknown): AnswerGitHub => ({ status: 200, data });

// Ce que l'app lit du dépôt (vue/rail/github.ts, board/wait-of-chef.ts), sur ce monde.
export function callOfTheApp(repository: string, world: () => World): CallGitHub {
  return async (path) => {
    const { issues, commentaires: comments, fermees: closedEntries } = world();
    if (path.startsWith(`/repos/${repository}/issues?`)) {
      const label = /[?&]labels=([^&]+)/.exec(path)?.[1];
      return ok(label === undefined ? issues : issues.filter(({ labels }) => (labels as { name: string }[]).some(({ name }) => name === decodeURIComponent(label))));
    }
    if (path.startsWith(`/repos/${repository}/pulls?state=closed`)) return ok(closedEntries);
    if (path.startsWith(`/repos/${repository}/pulls?`)) return ok([]);
    if (path === `/repos/${repository}`) return ok({ default_branch: "main", permissions: { push: true } });
    if (path.includes("/check-runs")) return ok({ check_runs: [{ conclusion: "success" }] });
    const commented = /\/issues\/(\d+)\/comments/.exec(path)?.[1];
    if (commented !== undefined) return ok(comments[Number(commented)] ?? []);
    if (/\/issues\/\d+\/(events|timeline)/.test(path)) return ok([]);
    return { status: 404, data: { message: "Not Found" } };
  };
}

// Ce que le runtime lit du dépôt pour le récapitulatif, sur le même monde : les PR fermées, et les commentaires du dépôt
// depuis un instant, chacun avec l'adresse de son issue.
export function transportOfRuntime(repository: string, world: () => World): Transport {
  return async (args) => {
    const path = (args.at(-1) ?? "").replace("https://api.github.com/", "");
    const { commentaires: comments, fermees: closedEntries } = world();
    let data: unknown = { message: "Not Found" };
    let status = 404;
    if (path.startsWith(`repos/${repository}/pulls?state=closed`)) [status, data] = [200, closedEntries];
    else if (path.startsWith(`repos/${repository}/issues/comments?`)) {
      const since = Date.parse(decodeURIComponent(/since=([^&]+)/.exec(path)?.[1] ?? ""));
      const all = Object.entries(comments).flatMap(([number, itsOwn]) => itsOwn.map((comment): Record<string, unknown> => ({ ...comment, issue_url: `https://api.github.com/repos/${repository}/issues/${number}` })));
      [status, data] = [200, all.filter((comment) => Date.parse(String(comment.created_at)) >= since)];
    }
    return { erreur: status >= 400 ? new Error(`HTTP ${status}`) : null, stdout: `HTTP/2.0 ${status} X\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data)}`, stderr: "" };
  };
}

// La station d'un ou de plusieurs projets : leur répertoire d'état (son journal y est), leur dépôt et leur monde. `lancer`
// joue une commande comme le geste de box la lancerait, et rend ce qu'elle a dit.
export function stationOfRecap(t: TestContext, projects: Record<string, { depot: string; monde: () => World }>, now: () => string) {
  const states: Record<string, string> = {};
  for (const name of Object.keys(projects)) {
    const state = mkdtempSync(join(tmpdir(), `recap-${name}-`));
    t.after(() => rmSync(state, { recursive: true, force: true }));
    ouvrirJournal(state).fermer();
    states[name] = state;
  }
  const launch = async (readOne: Read, command: string): Promise<Rendered> => {
    const project = projects[readOne.nom];
    const state = states[readOne.nom];
    if (project === undefined || state === undefined) throw new Error(`no station for ${readOne.nom}`);
    const [name, ...args] = command.split(" ");
    const output: string[] = [];
    const errors: string[] = [];
    let code = 0;
    if (name !== "recap") throw new Error(`unexpected command: ${command}`);
    try {
      await principal(
        { args, env: { BRIGADE_STATE_DIR: state }, dire: (line) => output.push(line), redire: (line) => errors.push(line) },
        () => new Date(now()),
        (repository) => ouvrirGitHub({ depot: repository, bin: "gh", transport: transportOfRuntime(repository, project.monde) }),
      );
    } catch (e) {
      if (!(e instanceof Sortie)) throw e;
      code = e.code;
    }
    return { lance: `$ node geste.ts ${readOne.nom} ${command}`, erreur: code === 0 ? null : (Object.assign(new Error(`exit ${code}`), { code }) as ExecFileException), sortie: output.join("\n"), erreurs: errors.join("\n") };
  };
  // Un fait de garde-fou que le runtime du projet écrit au journal, à son instant.
  const log = (name: string, at: string, ticket: number | null, type: string, payload: object) => {
    const logFile = ouvrirJournal(states[name] ?? "", { maintenant: () => new Date(at) });
    logFile.ajouter({ project: name, ticket, type, author: "runtime", payload } as Parameters<typeof logFile.ajouter>[0]);
    logFile.fermer();
  };
  return { etats: states, lancer: launch, journaliser: log };
}

export const boxOf = (name: string): Read => ({ nom: name, cuisine: { locale: { node: "node", runtime: "/runtime", racine: "/station", env: {} } } });
