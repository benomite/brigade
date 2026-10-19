// Ce qu'on attend du chef, en tête de la fiche d'une carte qui l'attend : une phrase dans les mots
// de l'app — jamais la ligne de la file, qui dit la même chose en mots du runtime, commandes
// comprises —, et les gestes qui tranchent, le recommandé en premier. Les deux se lisent de la
// décision que `faits` donne pour ce ticket (runtime/src/awaiting.ts, `Decision`) : sa sorte, son
// motif, ce qui le précise, sa PR. Une box d'avant ce champ, ou une sorte que l'app ne connaît
// pas : une phrase qui ne devine rien, et aucun geste de plus que ceux de tous.
// Ce module ne lance rien : il dit.

// La décision, telle que le runtime la donne : ses mots sont les siens (`merge`, `no-grant`…).
export type Decision = { quoi: string; motif: string | null; cause: string | null; pr: string | null };

// Les gestes qui tranchent une décision : merger la livraison, la sortir du rail, ouvrir l'issue
// — là où le chef répond, recalibre ou corrige —, la renvoyer en cuisine.
export type GesteAttendu = "merger" | "retirer" | "issue" | "cuisine";
export type Attendu = { phrase: string; gestes: GesteAttendu[] };

export const SANS_DECISION = "This ticket waits for your decision — its issue says which.";

// Une livraison verte que la pass ne merge pas elle-même : le geste est de la merger.
const VERTE: Readonly<Record<string, string>> = {
  "no-grant": "Green, but the pass may not merge it without the merge grant: merge it yourself.",
  "review-required": "Green, but it touches what judges it or what the project opens: review it, then merge it.",
  "merge-refused": "Green, but GitHub refused the merge: clear what it refuses, then merge it.",
};

// Les 86 que la station pose sans heure de retour.
const DE_STATION: Readonly<Record<string, Attendu>> = {
  "no-calibration": { phrase: "It has no calibration: put its model and effort labels on its issue — it starts again on its own.", gestes: ["issue"] },
  "unreadable-card": { phrase: "Its card cannot be read: fix the card on its issue — it starts again on its own.", gestes: ["issue"] },
  refused: { phrase: "The model refused it three times: reword or recalibrate its issue, or take it off the rail.", gestes: ["issue", "retirer"] },
};

// Les issues que le manager a écartées parce qu'elles sont au chef. Celle qui est retenue
// (`blocked-on-human`) se lève par ses deux gestes à elle, sur la fiche.
const ECARTEES: Readonly<Record<string, Attendu>> = {
  question: { phrase: "The manager set it aside with a question: answer it on the issue, then remove the label.", gestes: ["issue"] },
  decision: { phrase: "The manager set it aside for your decision: decide on the issue, then remove the label.", gestes: ["issue"] },
  "blocked-on-human": { phrase: "Held for you: remove the label so the manager judges it again, or close the issue.", gestes: [] },
};

// Ce qui sort une remontée, selon qu'elle a une PR à merger ou non.
const SORTIR = (pr: string | null): Pick<Attendu, "gestes"> & { suite: string } =>
  pr === null ? { suite: "take it off the rail, or close its issue.", gestes: ["retirer"] } : { suite: "merge it anyway, or take it off the rail.", gestes: ["merger", "retirer"] };

function remontee({ motif, cause, pr }: Decision): Attendu {
  const { suite, gestes } = SORTIR(pr);
  if (motif === "still-red") return { phrase: `${cause === "manager-escalated" ? "The manager gave up after repeated reds" : "Still red after its returns, the pass gave up"}: ${suite}`, gestes };
  if (motif === "unjudged") return { phrase: `The pass could not judge it: see what its issue says, then ${suite}`, gestes };
  return { phrase: `Sent back to you: ${suite}`, gestes };
}

export function attenduDe(decision: Decision | undefined): Attendu {
  if (decision === undefined) return { phrase: SANS_DECISION, gestes: [] };
  const { quoi, motif, pr } = decision;
  switch (quoi) {
    case "merge":
      return { phrase: (motif === null ? undefined : VERTE[motif]) ?? "Green, but not merged: merge it yourself.", gestes: pr === null ? [] : ["merger"] };
    case "remontee":
      return remontee(decision);
    case "fermee":
      return { phrase: "Its PR was closed without a merge: take it off the rail, or close its issue.", gestes: ["retirer"] };
    case "86":
      return (motif === null ? undefined : DE_STATION[motif]) ?? { phrase: SANS_DECISION, gestes: ["issue"] };
    case "capacite":
      return { phrase: "No declared station provides what it needs: provide it, and it starts again on its own.", gestes: [] };
    case "absente":
      return { phrase: "Only a station that is away can cook it: bring that station back.", gestes: [] };
    case "bloque":
      return { phrase: "It waits for a ticket that left the rail unserved: put that ticket back on the rail, or drop it from this ticket's card.", gestes: ["issue"] };
    case "ecartee":
      return (motif === null ? undefined : ECARTEES[motif]) ?? { phrase: SANS_DECISION, gestes: ["issue"] };
    case "illisible":
      return motif === "epic"
        ? { phrase: "The manager could not read its split: edit the epic and it splits it again, or close the issue.", gestes: ["issue"] }
        : { phrase: "The manager's judgement of it cannot be read: edit the issue and it judges it again, or close the issue.", gestes: ["issue"] };
    case "question":
      return { phrase: "The manager asks a question before splitting this epic: answer it on the issue.", gestes: ["issue"] };
    case "repris":
      return { phrase: "Back from WAITING, it waits for you: send it back to the kitchen, or take it off the rail.", gestes: ["cuisine", "retirer"] };
    default:
      return { phrase: SANS_DECISION, gestes: [] };
  }
}

const texte = (valeur: unknown): valeur is string => typeof valeur === "string";
const texteOuRien = (valeur: unknown): valeur is string | null => valeur === null || texte(valeur);

// La même, venue d'ailleurs — la vue, une sortie de box : ce qui n'a pas la forme d'une décision n'en est pas une.
export function decisionLue(brute: unknown): Decision | undefined {
  if (typeof brute !== "object" || brute === null) return undefined;
  const { quoi, motif, cause, pr } = brute as Record<string, unknown>;
  return texte(quoi) && texteOuRien(motif) && texteOuRien(cause) && texteOuRien(pr) ? { quoi, motif, cause, pr } : undefined;
}

// Ce que la pass a consigné de la livraison qui attend (runtime/src/awaiting.ts, `Livraison`) : le
// résumé de sa relecture, son premier constat bloquant, les fichiers de ses juges qu'elle change.
export type Juge = { fichier: string; ajoutees: number; retirees: number };
export type Delivery = { resume?: string; constat?: string; juges?: Juge[] };

// La tête de la fiche d'une livraison qui attend un merge, en deux lignes : `fait`, ce qu'elle
// fait — la première phrase du résumé de sa relecture, absente quand la relecture n'en donne pas —,
// et `pourquoi`, pourquoi elle t'attend. `juges` : les fichiers de ses juges qu'elle change, un par
// ligne, avec les lignes ajoutées et retirées — rien de rédigé.
export type Tete = { fait?: string; pourquoi: string; juges: Juge[] };

// La première phrase d'un texte : jusqu'au premier point suivi d'un blanc, sinon tout, sur une ligne.
export function premierePhrase(texte: string): string {
  const une = texte.trim().replace(/\s+/g, " ");
  const fin = une.search(/[.!?](\s|$)/);
  return fin === -1 ? une : une.slice(0, fin + 1);
}

const encore = (suite: string | undefined) => (suite === undefined ? "" : `: ${premierePhrase(suite)}`);

// Rien pour une décision qui n'est pas une livraison, pour une livraison dont la pass n'a rien
// consigné, ni pour une livraison dont le motif n'est pas l'un des trois : la phrase d'`attenduDe` suffit.
export function teteDe(decision: Decision | undefined, delivery: Delivery | undefined): Tete | undefined {
  if (decision === undefined || delivery === undefined || Object.keys(delivery).length === 0) return undefined;
  const { quoi, motif, cause } = decision;
  const juges = delivery.juges ?? [];
  const pourquoi =
    quoi === "merge" && motif === "review-required" && juges.length > 0
      ? "Green, but it touches the judges: review it."
      : quoi === "remontee" && motif === "still-red"
        ? cause === "manager-escalated"
          ? `Red, the manager gave up${encore(delivery.constat)}`
          : `Red after 2 returns${encore(delivery.constat)}`
        : quoi === "remontee" && motif === "unjudged" && cause === "ci-silent"
          ? "Green, the CI did not conclude."
          : undefined;
  if (pourquoi === undefined) return undefined;
  const fait = delivery.resume === undefined || delivery.resume.trim() === "" ? undefined : premierePhrase(delivery.resume);
  return { ...(fait === undefined ? {} : { fait }), pourquoi, juges };
}

const nombre = (valeur: unknown): valeur is number => typeof valeur === "number" && Number.isFinite(valeur);

// La même, venue de la box : ce qui n'a pas sa forme n'est pas lu.
export function readDelivery(brute: unknown): Delivery | undefined {
  if (typeof brute !== "object" || brute === null) return undefined;
  const { resume, constat, juges } = brute as Record<string, unknown>;
  const lus = (Array.isArray(juges) ? juges : []).flatMap((juge: unknown): Juge[] => {
    const { fichier, ajoutees, retirees } = (typeof juge === "object" && juge !== null ? juge : {}) as Record<string, unknown>;
    return texte(fichier) && nombre(ajoutees) && nombre(retirees) ? [{ fichier, ajoutees, retirees }] : [];
  });
  return { ...(texte(resume) ? { resume } : {}), ...(texte(constat) ? { constat } : {}), ...(lus.length > 0 ? { juges: lus } : {}) };
}
