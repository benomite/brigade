// Ce qu'on attend du chef, en tête de la fiche d'une carte qui l'attend : une phrase dans les mots
// de l'app — jamais la ligne de la file, qui dit la même chose en mots du runtime, commandes
// comprises —, et les gestes qui tranchent, le recommandé en premier. Les deux se lisent de la
// décision que `faits` donne pour ce ticket (runtime/src/attend.ts, `Decision`) : sa sorte, son
// motif, ce qui le précise, sa PR. Une box d'avant ce champ, ou une sorte que l'app ne connaît
// pas : une phrase qui ne devine rien, et aucun geste de plus que ceux de tous.
// Ce module ne lance rien : il dit.

// La décision, telle que le runtime la donne : ses mots sont les siens (`merge`, `review-required`…).
export type Decision = { quoi: string; motif: string | null; cause: string | null; pr: string | null };

// Les gestes qui tranchent une décision : la sortir du rail, ouvrir l'issue
// — là où le chef répond, recalibre ou corrige —, la renvoyer en cuisine.
export type ActionExpected = "retirer" | "issue" | "cuisine";
// `phrase` : la question, en une phrase. `sansQuestion` : aucune question n'a été trouvée, la phrase le dit.
export type Expected = { phrase: string; gestes: ActionExpected[]; sansQuestion?: true };

// Le texte d'une carte dont on ne trouve pas la question : il dit le fait, il n'envoie pas le chef à l'issue.
export const withoutQuestion = (ticket: number): string => `no question found on #${ticket}`;

// Une livraison verte que la pass ne merge pas elle-même : elle se merge sur sa PR, sur GitHub — aucun geste de l'app.
const GREEN: Readonly<Record<string, string>> = {
  "review-required": "Green, but it touches what judges it or what the project opens: review it, then merge it.",
  "merge-refused": "Green, but GitHub refused the merge: clear what it refuses, then merge it.",
};

// Les 86 que la station pose sans heure de retour.
const OF_STATION: Readonly<Record<string, Expected>> = {
  "no-calibration": { phrase: "It has no calibration: put its model and effort labels on its issue — it starts again on its own.", gestes: ["issue"] },
  "unreadable-card": { phrase: "Its card cannot be read: fix the card on its issue — it starts again on its own.", gestes: ["issue"] },
  refused: { phrase: "The model refused it three times: reword or recalibrate its issue, or take it off the rail.", gestes: ["issue", "retirer"] },
};

// Les issues que le manager a parquées pour le chef (`chef-todo`, #4129), comme la box le dit (runtime/src/attend.ts,
// `GESTES_D_ECART_EN`) : sa carte porte la question ou la décision, et sa réponse la fait reprendre.
const ECARTEES: Readonly<Record<string, Expected>> = {
  question: { phrase: "The manager parked it for you with a question: answer its card, the manager judges it again.", gestes: ["issue"] },
  decision: { phrase: "The manager parked it for you, for your decision: answer its card, the manager judges it again.", gestes: ["issue"] },
};

// Ce qui sort une remontée : le retrait du rail ; la phrase dit en plus que la PR, s'il y en a une, se merge sur GitHub.
const EXIT = (pr: string | null): Pick<Expected, "gestes"> & { suite: string } => ({
  suite: pr === null ? "take it off the rail, or close its issue." : "merge it anyway, or take it off the rail.",
  gestes: ["retirer"],
});

function raised({ motif: motive, cause, pr }: Decision): Expected {
  const { suite, gestes: actions } = EXIT(pr);
  if (motive === "still-red") return { phrase: `${cause === "manager-escalated" ? "The manager gave up after repeated reds" : "Still red after its returns, the pass gave up"}: ${suite}`, gestes: actions };
  if (motive === "unjudged") return { phrase: `The pass could not judge it: ${suite}`, gestes: actions };
  return { phrase: `Sent back to you: ${suite}`, gestes: actions };
}

// `question` : celle que la carte de TODO lue de l'issue porte (`CarteLue.question`), quand la `faits` la donne.
export function expectedOf(decision: Decision | undefined, ticket: number, question?: string | null): Expected {
  const without = (actions: ActionExpected[]): Expected => ({ phrase: withoutQuestion(ticket), gestes: actions, sansQuestion: true });
  // Une question que l'issue porte dit ce qu'on attend mieux que toute phrase de sorte : la première, en une phrase.
  // Une décision de carte la porte aussi dans sa `cause` (runtime, `decisionDe`).
  const saidOne = question ?? (decision?.quoi === "carte" ? decision.cause : null);
  const request = typeof saidOne === "string" ? firstSentence(saidOne) : "";
  if (decision === undefined) return request === "" ? without([]) : { phrase: request, gestes: [] };
  const expected = expectedOfKind(decision, without);
  return request === "" ? expected : { phrase: request, gestes: expected.gestes };
}

function expectedOfKind(decision: Decision, without: (actions: ActionExpected[]) => Expected): Expected {
  const { quoi: what, motif: motive } = decision;
  switch (what) {
    case "merge":
      return { phrase: (motive === null ? undefined : GREEN[motive]) ?? "Green, but not merged: merge it yourself.", gestes: [] };
    case "remontee":
      return raised(decision);
    case "fermee":
      return { phrase: "Its PR was closed without a merge: take it off the rail, or close its issue.", gestes: ["retirer"] };
    case "86":
      return (motive === null ? undefined : OF_STATION[motive]) ?? without(["issue"]);
    case "capacite":
      return { phrase: "No declared station provides what it needs: provide it, and it starts again on its own.", gestes: [] };
    case "absente":
      return { phrase: "Only a station that is away can cook it: bring that station back.", gestes: [] };
    case "bloque":
      return { phrase: "It waits for a ticket that left the rail unserved: put that ticket back on the rail, or drop it from this ticket's card.", gestes: ["issue"] };
    case "ecartee":
      return (motive === null ? undefined : ECARTEES[motive]) ?? without(["issue"]);
    case "illisible":
      return motive === "epic"
        ? { phrase: "The manager could not read its split: edit the epic and it splits it again, or close the issue.", gestes: ["issue"] }
        : { phrase: "The manager's judgement of it cannot be read: edit the issue and it judges it again, or close the issue.", gestes: ["issue"] };
    case "question":
      return { phrase: "The manager asks a question before splitting this epic: answer it on the issue.", gestes: ["issue"] };
    case "carte":
      // Une carte entrée par la porte de TODO : sa question est dite plus haut ; arrivé ici, elle n'en porte aucune.
      return without([]);
    case "repris":
      return { phrase: "Back from parked, it waits for you: send it back to the kitchen, or take it off the rail.", gestes: ["cuisine", "retirer"] };
    case "abandon":
      // Sorti du rail par la cuisine sans être servi (#2118) : ses trois gestes sont les choix de sa carte.
      return { phrase: "The kitchen took it off the rail without serving it: put it back, take it in a dev session, or close it — its card says why.", gestes: [] };
    default:
      return without([]);
  }
}

const text = (value: unknown): value is string => typeof value === "string";
const textOrNothing = (value: unknown): value is string | null => value === null || text(value);

// La même, venue d'ailleurs — la vue, une sortie de box : ce qui n'a pas la forme d'une décision n'en est pas une.
export function decisionRead(raw: unknown): Decision | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const { quoi: what, motif: motive, cause, pr } = raw as Record<string, unknown>;
  return text(what) && textOrNothing(motive) && textOrNothing(cause) && textOrNothing(pr) ? { quoi: what, motif: motive, cause, pr } : undefined;
}

// Ce que la pass a consigné de la livraison qui attend (runtime/src/attend.ts, `Livraison`) : le
// résumé de sa relecture, son premier constat bloquant, les fichiers de ses juges qu'elle change.
export type Judge = { fichier: string; ajoutees: number; retirees: number };
export type Delivery = { resume?: string; constat?: string; juges?: Judge[] };

// La tête de la fiche d'une livraison qui attend un merge, en deux lignes : `fait`, ce qu'elle
// fait — la première phrase du résumé de sa relecture, absente quand la relecture n'en donne pas —,
// et `pourquoi`, pourquoi elle t'attend. `juges` : les fichiers de ses juges qu'elle change, un par
// ligne, avec les lignes ajoutées et retirées — rien de rédigé.
export type Head = { fait?: string; pourquoi: string; juges: Judge[] };

// La première phrase d'un texte : jusqu'au premier point suivi d'un blanc, sinon tout, sur une ligne.
export function firstSentence(text: string): string {
  const one = text.trim().replace(/\s+/g, " ");
  const end = one.search(/[.!?](\s|$)/);
  return end === -1 ? one : one.slice(0, end + 1);
}

const still = (suite: string | undefined) => (suite === undefined ? "" : `: ${firstSentence(suite)}`);

// Rien pour une décision qui n'est pas une livraison, pour une livraison dont la pass n'a rien
// consigné, ni pour une livraison dont le motif n'est pas l'un des trois : la phrase d'`attenduDe` suffit.
export function headOf(decision: Decision | undefined, delivery: Delivery | undefined): Head | undefined {
  if (decision === undefined || delivery === undefined || Object.keys(delivery).length === 0) return undefined;
  const { quoi: what, motif: motive, cause } = decision;
  const judges = delivery.juges ?? [];
  const why =
    what === "merge" && motive === "review-required" && judges.length > 0
      ? "Green, but it touches the judges: review it."
      : what === "remontee" && motive === "still-red"
        ? cause === "manager-escalated"
          ? `Red, the manager gave up${still(delivery.constat)}`
          : `Red after 2 returns${still(delivery.constat)}`
        : what === "remontee" && motive === "unjudged" && cause === "ci-silent"
          ? "Green, the CI did not conclude."
          : undefined;
  if (why === undefined) return undefined;
  const done = delivery.resume === undefined || delivery.resume.trim() === "" ? undefined : firstSentence(delivery.resume);
  return { ...(done === undefined ? {} : { fait: done }), pourquoi: why, juges: judges };
}

const count = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

// La même, venue de la box : ce qui n'a pas sa forme n'est pas lu.
export function readDelivery(raw: unknown): Delivery | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const { resume, constat: finding, juges: judges } = raw as Record<string, unknown>;
  const readOnes = (Array.isArray(judges) ? judges : []).flatMap((judge: unknown): Judge[] => {
    const { fichier: file, ajoutees: added, retirees: removed } = (typeof judge === "object" && judge !== null ? judge : {}) as Record<string, unknown>;
    return text(file) && count(added) && count(removed) ? [{ fichier: file, ajoutees: added, retirees: removed }] : [];
  });
  return { ...(text(resume) ? { resume } : {}), ...(text(finding) ? { constat: finding } : {}), ...(readOnes.length > 0 ? { juges: readOnes } : {}) };
}
