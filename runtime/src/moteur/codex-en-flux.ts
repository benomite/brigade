// Le cook Codex, vu par la station comme un cook Claude (#3744) : lance
// `codex exec --json` (`node codex-en-flux.ts <codex> <arguments…>`), lui
// passe sa consigne sur l'entrée, et réécrit chaque événement de son flux en
// celui que `claude --output-format stream-json` aurait écrit. Le superviseur y
// compte les tours, la garde d'inactivité y lit l'activité, et la station le
// dernier message et la fin du cook, comme pour tout cook (`claude.ts`).
//
// Le flux de `codex exec --json` : `thread.started`, `turn.started`, des
// `item.started` / `item.completed` (`agent_message`, `command_execution`,
// `file_change`, …), puis `turn.completed` (avec son `usage`) ou `turn.failed`
// — et des `error` en cours de route.
import { spawn } from "../sans-invite.ts";

type EtatDeLaTraduction = { dernierTexte: string | null; termine: boolean; echec: string | null; tours: number };

const etatInitial = (): EtatDeLaTraduction => ({ dernierTexte: null, termine: false, echec: null, tours: 0 });

type Element = { id?: unknown; type?: unknown; text?: unknown; command?: unknown; changes?: unknown; exit_code?: unknown; status?: unknown };

const assistant = (id: string, content: unknown[], usage = { input_tokens: 0, output_tokens: 0 }) => ({ type: "assistant", message: { id, role: "assistant", content, usage }, parent_tool_use_id: null });

// L'outil de Claude qui dit le même geste, pour l'activité du cook.
function outil(element: Element): { name: string; input: Record<string, unknown> } | null {
  if (element.type === "command_execution") return { name: "Bash", input: { command: typeof element.command === "string" ? element.command : "" } };
  if (element.type === "file_change") {
    const premier = Array.isArray(element.changes) ? (element.changes[0] as { path?: unknown } | undefined) : undefined;
    return { name: "Edit", input: { file_path: typeof premier?.path === "string" ? premier.path : "" } };
  }
  if (element.type === "mcp_tool_call" || element.type === "web_search") return { name: String(element.type), input: {} };
  return null;
}

// Les lignes du flux de `claude` pour une ligne du flux de `codex`. Une ligne
// illisible n'en donne aucune : le flux d'un process tué s'arrête n'importe où.
function traduire(ligne: string, etat: EtatDeLaTraduction): unknown[] {
  let evenement;
  try {
    evenement = JSON.parse(ligne);
  } catch {
    return [];
  }
  if (evenement === null || typeof evenement !== "object") return [];
  const element: Element = evenement.item ?? {};
  const id = `codex-${typeof element.id === "string" ? element.id : etat.tours}`;
  switch (evenement.type) {
    case "thread.started":
      return [{ type: "system", subtype: "init", session_id: typeof evenement.thread_id === "string" ? evenement.thread_id : null, engine: "codex" }];
    case "item.started": {
      const geste = outil(element);
      return geste === null ? [] : [assistant(id, [{ type: "tool_use", id, ...geste }])];
    }
    case "item.completed": {
      if (element.type === "agent_message" && typeof element.text === "string") {
        etat.dernierTexte = element.text;
        return [assistant(id, [{ type: "text", text: element.text }])];
      }
      if (outil(element) === null) return [];
      const enErreur = element.status === "failed" || (typeof element.exit_code === "number" && element.exit_code !== 0);
      return [{ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, is_error: enErreur }] }, parent_tool_use_id: null }];
    }
    case "turn.completed": {
      etat.termine = true;
      etat.echec = null;
      etat.tours += 1;
      const usage = evenement.usage ?? {};
      const nombre = (valeur: unknown) => (typeof valeur === "number" ? valeur : 0);
      // Les lectures de cache ne comptent pas, comme pour `claude`.
      return [assistant(`codex-tour-${etat.tours}`, [], { input_tokens: Math.max(0, nombre(usage.input_tokens) - nombre(usage.cached_input_tokens)), output_tokens: nombre(usage.output_tokens) })];
    }
    case "turn.failed":
      etat.termine = false;
      etat.echec = typeof evenement.error?.message === "string" ? evenement.error.message : "the codex turn failed";
      return [];
    case "error":
      // Une reconnexion en cours de route en est une aussi : seule la fin tranche.
      if (!etat.termine) etat.echec = typeof evenement.message === "string" ? evenement.message : "codex reported an error";
      return [];
    default:
      return [];
  }
}

const CONNEXION = /\b401\b|unauthori[sz]ed|not logged in|log ?in|authenticat/i;
const QUOTA = /usage limit|rate limit|\b429\b|quota/i;

// La fin du flux, telle que `claude` l'écrit : son résultat — en erreur si le
// tour n'a pas abouti, ou si `codex` est sorti en échec —, précédé de l'erreur
// que la station reconnaît (connexion, quota).
function conclure(etat: EtatDeLaTraduction, code: number | null): unknown[] {
  const reussi = etat.termine && etat.echec === null && code === 0;
  if (reussi) return [{ type: "result", subtype: "success", is_error: false, num_turns: etat.tours, result: etat.dernierTexte ?? "" }];
  const motif = etat.echec ?? `codex exited with code ${code ?? "none"}`;
  const erreur = CONNEXION.test(motif) ? "authentication_failed" : QUOTA.test(motif) ? "rate_limit" : null;
  return [...(erreur === null ? [] : [{ ...assistant("codex-erreur", [{ type: "text", text: motif }]), error: erreur }]), { type: "result", subtype: "error_during_execution", is_error: true, num_turns: etat.tours, result: motif }];
}

if (process.argv[1] !== undefined && import.meta.filename === process.argv[1]) {
  const [codex, ...args] = process.argv.slice(2);
  const etat = etatInitial();
  const ecrire = (evenements: unknown[]) => {
    for (const evenement of evenements) process.stdout.write(`${JSON.stringify(evenement)}\n`);
  };
  const enfant = spawn(codex ?? "codex", args, { stdio: ["pipe", "pipe", "inherit"] });
  process.stdin.pipe(enfant.stdin!);
  enfant.stdin!.on("error", () => {});
  let reste = "";
  enfant.stdout!.setEncoding("utf8");
  enfant.stdout!.on("data", (morceau: string) => {
    const lignes = (reste + morceau).split("\n");
    reste = lignes.pop() ?? "";
    for (const ligne of lignes) ecrire(traduire(ligne, etat));
  });
  let fini = false;
  const finir = (code: number | null, motif?: string) => {
    if (fini) return;
    fini = true;
    if (reste !== "") ecrire(traduire(reste, etat));
    if (motif !== undefined) etat.echec = motif;
    ecrire(conclure(etat, code));
    process.exitCode = etat.termine && etat.echec === null && code === 0 ? 0 : (code || 1);
    process.stdin.destroy();
  };
  enfant.on("error", (erreur) => finir(null, `codex could not be launched (${codex}): ${erreur.message}`));
  enfant.on("close", (code) => finir(code));
}
