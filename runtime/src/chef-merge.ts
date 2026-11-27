// What the comments of a ticket say about the chef's merge of its pull
// request. Kept out of runtime/src/kitchen/, which stays under 1,000 lines.

// A PR the pass approves in a risk zone waits for the chef. The chef's merge answer holds for
// that PR until a pass refuses the ticket: a branch only brought up to date keeps it (#4489).
export const riskZoneComment = (pr: number) => `The pass approves PR #${pr}, but it touches a risk zone`;
const answerText = (body: string) => body.replace(/^\s*<!--\s*brigade:reponse\b[^>]*-->/, "").trim();
export function chefSaidMerge(comments: readonly string[], pr: number): boolean {
  let asked = false, granted = false;
  for (const body of comments) {
    if (body.startsWith(riskZoneComment(pr))) asked = true;
    else if (body.startsWith("Sent back to a cook (try ") || body.startsWith("Parked for the chef: refused")) asked = granted = false;
    else if (asked && /^merge\b/i.test(answerText(body))) granted = true;
  }
  return granted;
}

// The ticket's last move is the pass's approval of this PR in a risk zone: it waits for the
// chef's merge, even when it lost its `approved` label (#4558).
export function waitsForChefMerge(comments: readonly string[], pr: number): boolean {
  let waits = false;
  for (const body of comments) {
    if (body.startsWith(riskZoneComment(pr))) waits = true;
    else if (/^(Sent back to a cook|Parked for the chef|Back on the rail)\b/.test(body)) waits = false;
  }
  return waits;
}
