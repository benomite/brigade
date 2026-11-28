// Le client GitHub de l'app : la lecture et l'écriture des issues, par l'API REST et le jeton du `gh` de ce poste.
//
// Ce module compose les demandes ; ce qui les porte est donné par la plateforme — le `fetch` du desktop (`envoyerParFetch`).
import { clientGitHub, bodyRead, DELAY_MS, type CallGitHub, type AnswerGitHub } from "./board/client.ts";

// Un `POST` ou un `DELETE` à cette adresse — ou un `PUT`, un `PATCH`, pour la réponse à une carte du chef (#2434,
// board-actions/answer-github.ts) —, avec ces en-têtes et ce corps — un objet, que la plateforme écrit en JSON.
// Lève quand rien n'a répondu.
export type MethodOfWriting = "POST" | "DELETE" | "PUT" | "PATCH";
export type SendGitHub = (method: MethodOfWriting, address: string, headers: Record<string, string>, body?: unknown) => Promise<AnswerGitHub>;
export type ClientOfThePriority = { lire: CallGitHub; ecrire: (method: MethodOfWriting, path: string, body?: unknown) => Promise<AnswerGitHub> };

// Le client : la lecture de l'issue par le `GET` du rail (client.ts), l'écriture de ses labels avec le même jeton.
export function clientOfThePriority({ jeton: token, appeler: call, envoyer: send }: { jeton: () => Promise<string | null>; appeler: CallGitHub; envoyer: SendGitHub }): ClientOfThePriority {
  return {
    lire: call,
    ecrire: (method, path, body) =>
      clientGitHub({ jeton: token, envoyer: (address, headers) => send(method, address, body === undefined ? headers : { ...headers, "Content-Type": "application/json" }, body) })(path),
  };
}

// Une demande par `fetch` — celui de Node sur le desktop. Abandonnée passé `delaiMs`.
export function sendByFetch(options: { fetch?: typeof fetch; delaiMs?: number } = {}): SendGitHub {
  const call = options.fetch ?? fetch;
  const delay = options.delaiMs ?? DELAY_MS;
  return async (method, address, headers, body) => {
    const abandon = new AbortController();
    const guard = setTimeout(() => abandon.abort(new Error(`GitHub gave no answer within ${Math.round(delay / 1000)} s`)), delay);
    try {
      const answer = await call(address, { method: method, headers: headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: abandon.signal });
      return { status: answer.status, data: bodyRead(await answer.text()) };
    } catch (error) {
      throw abandon.signal.aborted && abandon.signal.reason instanceof Error ? abandon.signal.reason : error;
    } finally {
      clearTimeout(guard);
    }
  };
}
