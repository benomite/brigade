// The writing pass's gestures for a program — the closer section of the app's
// project page (#986) —, each a JSON object on one line:
//   npm --prefix runtime run closing -- preview [--json]        what a pass costs, what the closer will do, where the request stands, what a request made now would become — writes nothing
//   npm --prefix runtime run closing -- write --json --confirm  requests the pass, once the chef has said yes: without `--confirm`, refused, nothing is written
//   npm --prefix runtime run closing -- cancel --json           withdraws the waiting request, before it leaves
// The same decisions as `closing write` and `closing cancel`, not other ones
// (`demande.ts`): what the chef's command refuses, the app's does not request.
// A typed command is the chef's yes; a program's call is not — the button
// passes `--confirm` only after the chef's “yes”, and the preview creates
// nothing.
//
// Exit codes, as `closing write` and `closing cancel`: 0, requested, already
// waiting, withdrawn, nothing to withdraw, or the preview read; 1, refused or
// impossible — nothing is written; 2, the command is badly written. With
// `--json`, every outcome but 2 is on stdout: `outcome`, and its `text`.
import { existsSync } from "node:fs";
import { Sortie, type Appel } from "../appel.ts";
import { geste } from "../geste.ts";
import { cheminJournal, ouvrirJournal } from "../journal.ts";
import { journalPasRejoue } from "../journal-pas-rejoue.ts";
import type { Refus } from "../closing/condition.ts";
import { apercevoir, type Apercu } from "./apercu.ts";
import { annuler, demander, type Decision, type Retrait } from "./demande.ts";
import { direDecision, direRetrait } from "./dire.ts";

export const APERCU = "preview";
export const EN_JSON = "--json";
export const CONFIRMER = "--confirm";
const USAGE = `usage: BRIGADE_STATE_DIR=<state directory> npm --prefix runtime run closing -- [${APERCU} [${EN_JSON}] | write ${EN_JSON} ${CONFIRMER} | cancel ${EN_JSON}]`;
const PAS_REJOUE = "this log does not yet have the state of the rail and the guardrails: restart the runtime, which recomputes it";

// The closing's arguments that are this module's, not the typed command's.
export const estPourLApp = (args: readonly string[]) => args[0] === APERCU || args.includes(EN_JSON);

// A request, as the app reads it. `requested`: written — `waits`, what holds it
// back, null if it leaves within the second.
type Demandee =
  | { outcome: "requested"; waits: Refus | null; text: string }
  | { outcome: "already-requested"; since: string; holds: Refus | null; text: string }
  | { outcome: "refused"; reason: Refus; text: string }
  | { outcome: "impossible" | "unconfirmed"; text: string };

function enJson(decision: Decision): Demandee {
  const text = direDecision(decision);
  switch (decision.issue) {
    case "demandee":
      return { outcome: "requested", waits: decision.retenue, text };
    case "deja":
      return { outcome: "already-requested", since: decision.demande.since, holds: decision.retenue, text };
    case "refusee":
      return { outcome: "refused", reason: decision.refus, text };
    case "impossible":
      return { outcome: "impossible", text };
  }
}

// A withdrawal, as the app reads it. `refused`: the pass has left, under `run`.
type Retiree = { outcome: "cancelled"; since: string; text: string } | { outcome: "none"; text: string } | { outcome: "refused"; run: string; text: string };

function retraitEnJson(retrait: Retrait): Retiree {
  const text = direRetrait(retrait);
  switch (retrait.issue) {
    case "retiree":
      return { outcome: "cancelled", since: retrait.since, text };
    case "aucune":
      return { outcome: "none", text };
    case "partie":
      return { outcome: "refused", run: retrait.run, text };
  }
}

// The preview, in words, for the chef who types it.
function direApercu({ cost, does, request, ifRequested }: Apercu): string[] {
  return [
    cost ? `cost       ${cost.text}` : `cost       the closer is not set on this project — \`${geste("station closer-modele <model>")}\` and \`${geste("station closer-effort <effort>")}\` set it, without a restart`,
    ...does.map((phrase, rang) => `${rang === 0 ? "does       " : "           "}${phrase}`),
    `request    ${request.state === "waiting" ? request.text : request.state === "running" ? `closing run ${request.run} is tidying up` : "none"}`,
    `now        ${ifRequested.text}`,
  ];
}

export function agir({ args, env, dire, redire }: Appel): void {
  const json = args.includes(EN_JSON);
  const [quoi, ...options] = args.filter((arg) => arg !== EN_JSON);
  const confirme = options.length === 1 && options[0] === CONFIRMER;
  const bienEcrite = (quoi === APERCU && options.length === 0) || (quoi === "cancel" && json && options.length === 0) || (quoi === "write" && json && (options.length === 0 || confirme));
  if (!bienEcrite) {
    redire(`brigade : ${USAGE}`);
    throw new Sortie(2);
  }
  // An outcome, said: in JSON on stdout — or in words, on stderr when it refuses.
  const sortir = (code: number, objet: { outcome: string; text: string }): void => {
    if (json) dire(JSON.stringify(objet));
    else (code === 0 ? dire : redire)(`brigade : ${objet.text}`);
    if (code !== 0) throw new Sortie(code);
  };

  const repertoireEtat = env.BRIGADE_STATE_DIR;
  if (!repertoireEtat) {
    redire(`brigade : BRIGADE_STATE_DIR is not set\n${USAGE}`);
    throw new Sortie(2);
  }
  // Without the chef's yes, nothing is opened, nothing is written.
  if (quoi === "write" && !confirme) {
    return sortir(1, { outcome: "unconfirmed", text: `closing pass not requested, nothing is written — a program requests it only with \`${CONFIRMER}\`, once the chef has said yes; \`closing ${APERCU}\` says first what it costs and what the closer will do` });
  }
  if (!existsSync(cheminJournal(repertoireEtat))) return sortir(1, { outcome: "impossible", text: `no log in ${repertoireEtat}` });

  // The preview reads: its log is opened read-only, it cannot write a fact.
  const log = ouvrirJournal(repertoireEtat, { lectureSeule: quoi === APERCU });
  try {
    if (quoi === APERCU) {
      const apercu = apercevoir(log.base);
      if (json) dire(JSON.stringify(apercu));
      else for (const ligne of direApercu(apercu)) dire(ligne);
    } else if (quoi === "cancel") {
      const retrait = retraitEnJson(annuler(log));
      sortir(retrait.outcome === "refused" ? 1 : 0, retrait);
    } else {
      const demandee = enJson(demander(log));
      sortir(demandee.outcome === "refused" || demandee.outcome === "impossible" ? 1 : 0, demandee);
    }
  } catch (erreur) {
    if (journalPasRejoue(erreur)) return sortir(1, { outcome: "impossible", text: PAS_REJOUE });
    throw erreur;
  } finally {
    log.fermer();
  }
}
