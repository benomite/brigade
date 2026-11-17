// La pass juge une livraison de la même façon quel que soit le moteur qui l'a cuisinée (#3748). Elle lit le flux du
// cook avec `lireFlux`, qui ne parle que le format de `claude` : le flux d'un cook `codex` (`exec --json`) y est
// illisible — pas de message, pas de `result` —, et sa livraison passerait pour un cook mort. Ce module ramène le
// flux d'un cook `codex` au format de `claude`, avant la lecture ; un flux qui n'est pas de `codex` passe tel quel. Sans E/S.

type Evenement = Record<string, unknown>;

const lire = (ligne: string): Evenement | null => {
  try {
    const evenement: unknown = JSON.parse(ligne);
    return evenement !== null && typeof evenement === "object" ? (evenement as Evenement) : null;
  } catch {
    return null;
  }
};

const EVENEMENTS_CODEX = new Set(["thread.started", "turn.started", "item.started", "item.updated", "item.completed", "turn.completed", "turn.failed"]);

// Un flux de `codex` : un de ses événements, et aucun de `claude` (`system`, `assistant`, `result`).
export function estUnFluxCodex(contenu: string): boolean {
  const types = contenu.split("\n").flatMap((ligne) => {
    const type = lire(ligne)?.type;
    return typeof type === "string" ? [type] : [];
  });
  return types.some((type) => EVENEMENTS_CODEX.has(type)) && !types.some((type) => type === "system" || type === "assistant" || type === "result");
}

// Le flux d'un cook `codex`, tel que `claude` l'aurait écrit : son dernier message d'agent devient le message du
// cook, et la fin du tour son `result` — en erreur si le tour a échoué ou ne s'est pas fini.
export function enFluxClaude(contenu: string): string {
  if (!estUnFluxCodex(contenu)) return contenu;
  let message: string | null = null;
  let fin: boolean | null = null;
  for (const ligne of contenu.split("\n")) {
    const evenement = lire(ligne);
    if (evenement === null) continue;
    const item = evenement.item as Evenement | undefined;
    if (evenement.type === "item.completed" && item?.type === "agent_message" && typeof item.text === "string") message = item.text;
    else if (evenement.type === "turn.completed") fin = false;
    else if (evenement.type === "turn.failed") fin = true;
  }
  const lignes = [{ type: "system", subtype: "init" }];
  if (message !== null) lignes.push({ type: "assistant", message: { content: [{ type: "text", text: message }] } } as never);
  if (fin !== null) lignes.push({ type: "result", is_error: fin, ...(message === null ? {} : { result: message }) } as never);
  return `${lignes.map((l) => JSON.stringify(l)).join("\n")}\n`;
}
