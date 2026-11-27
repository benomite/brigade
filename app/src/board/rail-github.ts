// Ce que les lectures de GitHub partagent (board/read.ts, vue/autonomy/) : le ticket qu'une PR livre, et les lectures
// conditionnelles (`If-None-Match`) — un 304 ne coûte rien au quota, la réponse gardée est reprise.
import type { CallGitHub } from "./client.ts";

// Le ticket qu'une PR livre : sa branche de cook `cook/<n>-…`, sinon le `Closes #n` de son corps — ce que la nouvelle
// cuisine écrit en ouvrant sa PR (runtime/src/kitchen/github.ts, `branchOf`, `openPr`). Null s'il n'en nomme aucun.
export function ticketOfThePR(head: string, body: string): number | null {
  const branch = /^cook\/(\d+)(?:-|$)/.exec(head)?.[1];
  const closes = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/i.exec(body)?.[1];
  const number = Number(branch ?? closes);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

// Ce que GitHub a rendu à chaque chemin, avec son ETag : une relecture le redemande (`If-None-Match`), et un 304 ne
// coûte rien au quota — la réponse gardée est reprise.
export type MemoryOfReads = Map<string, { etag: string; data: unknown }>;

export function readConditional(call: CallGitHub, memory: MemoryOfReads): CallGitHub {
  return async (path) => {
    const keptOne = memory.get(path);
    const answer = await call(path, keptOne === undefined ? undefined : { "If-None-Match": keptOne.etag });
    if (answer.status === 304 && keptOne !== undefined) return { status: 200, data: keptOne.data, etag: keptOne.etag };
    if (answer.status === 200 && answer.etag !== undefined) memory.set(path, { etag: answer.etag, data: answer.data });
    else if (answer.status !== 200) memory.delete(path);
    return answer;
  };
}
