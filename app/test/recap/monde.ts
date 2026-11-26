// Ce que partagent les tests du récapitulatif dans l'app (#3581) : un faux GitHub, le même pour la lecture du rail et de
// TODO par l'app (`AppelGitHub`, tableau/client.ts) et pour la commande `recap` du runtime, derrière son vrai client
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
import type { Lu, Rendu } from "../../src/box.ts";
import type { CallGitHub, AnswerGitHub } from "../../src/tableau/client.ts";

// Les issues ouvertes du dépôt, les commentaires de chacune, ses PR fermées.
export type Monde = { issues: Record<string, unknown>[]; commentaires: Record<number, Record<string, unknown>[]>; fermees: Record<string, unknown>[] };

export const issue = (repository: string, number: number, labels: string[]) => ({ number, title: `Ticket ${number}`, html_url: `https://github.com/${repository}/issues/${number}`, created_at: "2026-11-03T21:00:00Z", labels: labels.map((name) => ({ name })) });
// Une PR fermée : mergée à `mergeLe`, ou pas (null) ; elle sert le ticket que sa branche nomme.
export const fermee = (repository: string, ticket: number, numero: number, mergeLe: string | null) => ({
  number: numero,
  title: `#${ticket} — Ticket ${ticket}`,
  html_url: `https://github.com/${repository}/pull/${numero}`,
  created_at: "2026-11-04T10:00:00Z",
  updated_at: mergeLe ?? "2026-11-04T12:00:00Z",
  merged_at: mergeLe,
  state: "closed",
  head: { ref: `cook/${ticket}-github`, sha: "a".repeat(40) },
  base: { ref: "main" },
  body: `Closes #${ticket}\n\nCooked by station \`box/claude\`.`,
});

const ok = (data: unknown): AnswerGitHub => ({ status: 200, data });

// Ce que l'app lit du dépôt (vue/rail/github.ts, tableau/wait-du-chef.ts), sur ce monde.
export function callDeLApp(repository: string, monde: () => Monde): CallGitHub {
  return async (chemin) => {
    const { issues, commentaires, fermees } = monde();
    if (chemin.startsWith(`/repos/${repository}/issues?`)) {
      const label = /[?&]labels=([^&]+)/.exec(chemin)?.[1];
      return ok(label === undefined ? issues : issues.filter(({ labels }) => (labels as { name: string }[]).some(({ name }) => name === decodeURIComponent(label))));
    }
    if (chemin.startsWith(`/repos/${repository}/pulls?state=closed`)) return ok(fermees);
    if (chemin.startsWith(`/repos/${repository}/pulls?`)) return ok([]);
    if (chemin === `/repos/${repository}`) return ok({ default_branch: "main", permissions: { push: true } });
    if (chemin.includes("/check-runs")) return ok({ check_runs: [{ conclusion: "success" }] });
    const commentees = /\/issues\/(\d+)\/comments/.exec(chemin)?.[1];
    if (commentees !== undefined) return ok(commentaires[Number(commentees)] ?? []);
    if (/\/issues\/\d+\/(events|timeline)/.test(chemin)) return ok([]);
    return { status: 404, data: { message: "Not Found" } };
  };
}

// Ce que le runtime lit du dépôt pour le récapitulatif, sur le même monde : les PR fermées, et les commentaires du dépôt
// depuis un instant, chacun avec l'adresse de son issue.
export function transportDuRuntime(repository: string, monde: () => Monde): Transport {
  return async (args) => {
    const chemin = (args.at(-1) ?? "").replace("https://api.github.com/", "");
    const { commentaires, fermees } = monde();
    let data: unknown = { message: "Not Found" };
    let status = 404;
    if (chemin.startsWith(`repos/${repository}/pulls?state=closed`)) [status, data] = [200, fermees];
    else if (chemin.startsWith(`repos/${repository}/issues/comments?`)) {
      const depuis = Date.parse(decodeURIComponent(/since=([^&]+)/.exec(chemin)?.[1] ?? ""));
      const tous = Object.entries(commentaires).flatMap(([numero, siens]) => siens.map((comment): Record<string, unknown> => ({ ...comment, issue_url: `https://api.github.com/repos/${repository}/issues/${numero}` })));
      [status, data] = [200, tous.filter((comment) => Date.parse(String(comment.created_at)) >= depuis)];
    }
    return { erreur: status >= 400 ? new Error(`HTTP ${status}`) : null, stdout: `HTTP/2.0 ${status} X\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data)}`, stderr: "" };
  };
}

// La station d'un ou de plusieurs projets : leur répertoire d'état (son journal y est), leur dépôt et leur monde. `lancer`
// joue une commande comme le geste de box la lancerait, et rend ce qu'elle a dit.
export function stationDuRecap(t: TestContext, projects: Record<string, { depot: string; monde: () => Monde }>, maintenant: () => string) {
  const states: Record<string, string> = {};
  for (const name of Object.keys(projects)) {
    const state = mkdtempSync(join(tmpdir(), `recap-${name}-`));
    t.after(() => rmSync(state, { recursive: true, force: true }));
    ouvrirJournal(state).fermer();
    states[name] = state;
  }
  const lancer = async (lu: Lu, command: string): Promise<Rendu> => {
    const project = projects[lu.nom];
    const state = states[lu.nom];
    if (project === undefined || state === undefined) throw new Error(`no station for ${lu.nom}`);
    const [name, ...args] = command.split(" ");
    const sortie: string[] = [];
    const erreurs: string[] = [];
    let code = 0;
    if (name !== "recap") throw new Error(`unexpected command: ${command}`);
    try {
      await principal(
        { args, env: { BRIGADE_STATE_DIR: state }, dire: (line) => sortie.push(line), redire: (line) => erreurs.push(line) },
        () => new Date(maintenant()),
        (repository) => ouvrirGitHub({ depot: repository, bin: "gh", transport: transportDuRuntime(repository, project.monde) }),
      );
    } catch (e) {
      if (!(e instanceof Sortie)) throw e;
      code = e.code;
    }
    return { lance: `$ node geste.ts ${lu.nom} ${command}`, erreur: code === 0 ? null : (Object.assign(new Error(`exit ${code}`), { code }) as ExecFileException), sortie: sortie.join("\n"), erreurs: erreurs.join("\n") };
  };
  // Un fait de garde-fou que le runtime du projet écrit au journal, à son instant.
  const journaliser = (name: string, at: string, ticket: number | null, type: string, payload: object) => {
    const log = ouvrirJournal(states[name] ?? "", { maintenant: () => new Date(at) });
    log.ajouter({ project: name, ticket, type, author: "runtime", payload } as Parameters<typeof log.ajouter>[0]);
    log.fermer();
  };
  return { etats: states, lancer, journaliser };
}

export const boxDe = (name: string): Lu => ({ nom: name, cuisine: { locale: { node: "node", runtime: "/runtime", racine: "/station", env: {} } } });
