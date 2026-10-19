// The station's only channel to the app: a secret gist of the machine's GitHub
// account, read and written by `gh api` — the machine's own, which
// authenticates by itself. The station opens no port and reaches no other
// machine: what it has to say, it writes there.
import { execFile } from "node:child_process";
import { decouper } from "../github.ts";
import { constaterLimite, limiteDuProcess, refusPourLimite, type Limite, type ReponseHttp } from "../limite-github.ts";

export type Files = Record<string, string>;

export type Channel = {
  // A new secret gist: returns its identifier.
  create(description: string, files: Files): Promise<string>;
  // Rewrites these files of the gist, without touching the others. `missing`:
  // the gist no longer exists — the chief deleted it.
  write(id: string, files: Files): Promise<"written" | "missing">;
  // The gist's files, or null if it no longer exists.
  read(id: string): Promise<Files | null>;
};

// `limite`: the budget of calls that each `gh api` takes — by default, the
// process's (`limite-github.ts`).
export type ChannelOptions = { gh: string; timeoutMs?: number; limite?: Limite; now?: () => number };

// `gh` exits with an error on any response that is not a success, and says so
// on its error output: « gh: Not Found (HTTP 404) ».
const MISSING = /\(HTTP 404\)/;

class Missing extends Error {}

export function gitHubChannel(options: ChannelOptions): Channel {
  const env = { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" };
  const call = (args: string[], input?: unknown): Promise<string> =>
    new Promise((resolve, reject) => {
      // Beyond the budget, the call does not go out.
      const limite = options.limite ?? limiteDuProcess();
      try {
        limite.prendre();
      } catch (error) {
        return reject(error);
      }
      const child = execFile(
        options.gh,
        // `-i`: the headers say, when a limit is hit, when the window closes.
        ["api", "-i", ...args],
        { timeout: options.timeoutMs ?? 30_000, maxBuffer: 16 * 1024 * 1024, env },
        (error, stdout, stderr) => {
          const response = decouper(stdout);
          if (error === null) return resolve(response?.corps ?? stdout);
          // Without readable headers, the status on `gh`'s error output is enough to recognize the limit.
          const status = response?.statut ?? Number(/\(HTTP (\d{3})\)/.exec(stderr)?.[1] ?? 0);
          const refusal: ReponseHttp = { statut: status, entetes: response?.entetes ?? new Map(), corps: response?.corps || stderr };
          if (refusPourLimite(refusal)) return void constaterLimite(limite, refusal, { gh: options.gh, env, maintenant: options.now }).then(reject, reject);
          if (MISSING.test(stderr)) return reject(new Missing());
          const said = stderr.trim().split("\n").at(-1) ?? "";
          reject(new Error(`gh api ${args.filter((arg) => arg.startsWith("/")).join(" ")} : ${said || error.message}`));
        },
      );
      // A missing `gh` closes its input before we write to it: the error is that of its launch.
      child.stdin?.on("error", () => {});
      child.stdin?.end(input === undefined ? "" : JSON.stringify(input));
    });
  const contents = (files: Files) => Object.fromEntries(Object.entries(files).map(([name, content]) => [name, { content }]));

  return {
    async create(description, files) {
      const created = JSON.parse(await call(["-X", "POST", "/gists", "--input", "-"], { description, public: false, files: contents(files) })) as { id?: unknown };
      if (typeof created.id !== "string" || created.id === "") throw new Error("gh api /gists : la création n'a pas rendu d'identifiant");
      return created.id;
    },
    async write(id, files) {
      try {
        await call(["-X", "PATCH", `/gists/${encodeURIComponent(id)}`, "--input", "-"], { files: contents(files) });
        return "written";
      } catch (error) {
        if (error instanceof Missing) return "missing";
        throw error;
      }
    },
    async read(id) {
      let stdout: string;
      try {
        stdout = await call([`/gists/${encodeURIComponent(id)}`]);
      } catch (error) {
        if (error instanceof Missing) return null;
        throw error;
      }
      const files = (JSON.parse(stdout) as { files?: Record<string, { content?: unknown } | null> }).files ?? {};
      return Object.fromEntries(Object.entries(files).flatMap(([name, file]) => (typeof file?.content === "string" ? [[name, file.content]] : [])));
    },
  };
}
