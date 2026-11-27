// Qui a dépensé le jeton du chef cette heure (#4620) : ce que GitHub dit dépensé (`x-ratelimit`), ce que l'app a compté elle-même,
// et, quand une station le dit, ce qu'a dépensé le runtime du Mac. Le reste est le `gh` des agents, et le runtime d'une station qui
// ne dit rien : l'app ne peut pas les distinguer, et le rapport le dit au lieu d'inventer une part.
// Pur : aucun import, aucun appel.

// Au-dessus de cette part de ce que GitHub dit dépensé, un dépensé a pris plus que sa part : un seul ne doit pas user plus de la
// moitié du budget d'une heure que trois se partagent.
export const SHARE_OF_A_SPENDER = 0.5;

export type Spender = { who: "the app" | "the Mac station's runtime" | "the agents' `gh`" | "the Mac station's runtime and the agents' `gh`"; count: number };
export type SpendersOfToken = { spent: number; spenders: Spender[]; biggest: { who: "the app" | "the Mac station's runtime"; count: number } | null; over: boolean; sentence: string };

// `spent` : ce que GitHub dit dépensé ; `app` : les demandes que GitHub a comptées pour l'app ; `station` : ce que le runtime du Mac
// a compté, ou rien s'il ne le dit pas.
export function spendersOfToken({ spent, app, station }: { spent: number; app: number; station?: number }): SpendersOfToken {
  const others = Math.max(0, spent - app - (station ?? 0));
  const spenders: Spender[] = [{ who: "the app", count: app }];
  if (station !== undefined) spenders.push({ who: "the Mac station's runtime", count: station }, { who: "the agents' `gh`", count: others });
  else spenders.push({ who: "the Mac station's runtime and the agents' `gh`", count: others });
  // Seuls l'app et le runtime nomment un plus gros dépensier dont un ticket peut s'occuper : le `gh` des agents n'est qu'un reste.
  const nameable = spenders.flatMap((one) => (one.who === "the app" || one.who === "the Mac station's runtime" ? [{ who: one.who, count: one.count }] : []));
  const top = nameable.reduce<{ who: "the app" | "the Mac station's runtime"; count: number } | null>((best, one) => (best === null || one.count > best.count ? one : best), null);
  const over = spent > 0 && top !== null && top.count > SHARE_OF_A_SPENDER * spent;
  const told = spenders.map(({ who, count }) => `${who} ${count}`).join(", ");
  return { spent, spenders, biggest: over ? top : null, over, sentence: `Who spent the token this hour, of ${spent} requests GitHub counts: ${told}.` };
}

// Le ticket que le plus gros dépensier appelle, quand il a pris plus que sa part.
export function ticketOfTheBiggest(report: SpendersOfToken): { title: string; body: string } | null {
  if (report.biggest === null) return null;
  const { who, count } = report.biggest;
  return {
    title: `${who[0]!.toUpperCase()}${who.slice(1)} spends more than its share of the chef's GitHub token`,
    body: `${report.sentence}\n\n${who[0]!.toUpperCase()}${who.slice(1)} spent ${count} of ${report.spent} (over ${Math.round(SHARE_OF_A_SPENDER * 100)}%): bring it back under its share, so the hourly quota (5,000) is not used up before the hour ends.`,
  };
}
