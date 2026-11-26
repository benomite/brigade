// L'accès des apps à l'API REST de GitHub, pour lire le rail d'un projet (read.ts) : un `GET`, avec le jeton GitHub
// de l'app quand elle en a un ; et un `POST` (`posterParFetch`), pour ce que l'app écrit sur une issue. Ce module ne fait que composer la demande ; ce qui la porte est donné par
// la plateforme — le `fetch` du desktop (`parFetch`), le HTTP natif du téléphone (app/android/web/lecture.ts) — et le
// jeton aussi : celui du `gh` de l'ordinateur sur le desktop (jeton-gh.ts), celui du coffre du téléphone sur Android.
// Il ne parle qu'à GitHub : aucune box, aucune station n'est jointe.

export const API_GITHUB = "https://api.github.com";
// La version de l'API REST que ces lectures supposent.
const VERSION_DE_L_API = "2022-11-28";
// Au-delà, la demande est abandonnée : GitHub ne répond pas.
export const DELAY_MS = 30_000;

// Ce que GitHub a rendu : son code, et son corps — lu en JSON quand il en est, sinon le texte tel quel.
// `etag` : celui que GitHub donne, pour relire sans coût tant que rien n'a changé (`If-None-Match`, réponse 304).
// `limite` : ce que GitHub dit du budget horaire du jeton (`x-ratelimit-*`) — ce qu'il en reste, sur combien, et l'heure
// (en ms) où il se remplit ; `reessayerApresMs` : son `retry-after`. Absents quand GitHub ne les donne pas
// (budget-github.ts les lit).
export type AnswerGitHub = { status: number; data: unknown; etag?: string; limite?: LimitGitHub; reessayerApresMs?: number };
export type LimitGitHub = { restant: number; total: number; repriseLe: number };
// Un `GET` à l'API de GitHub, sur ce chemin (`/repos/…`). Lève quand rien n'a répondu.
// `entetes` : ceux que la demande ajoute (`If-None-Match`).
export type CallGitHub = (chemin: string, entetes?: Record<string, string>) => Promise<AnswerGitHub>;
// Ce que la plateforme fait de la demande composée : l'envoyer, et rendre la réponse. Lève quand rien n'a répondu.
export type Envoi = (adresse: string, entetes: Record<string, string>) => Promise<AnswerGitHub>;

export type OptionsClient = {
  // Le jeton GitHub de l'app ; nul sans lui — la demande part alors sans, et ne lit que ce qui est public.
  jeton: () => Promise<string | null>;
  envoyer: Envoi;
};

export function clientGitHub({ jeton, envoyer }: OptionsClient): CallGitHub {
  return async (chemin, ajoutes) => {
    // Un jeton qui ne se lit pas n'empêche pas la lecture : elle part sans, et GitHub dit ce qu'il en refuse.
    const lu = await jeton().catch(() => null);
    const entetes: Record<string, string> = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": VERSION_DE_L_API, ...ajoutes };
    if (lu !== null && lu !== "") entetes.Authorization = `Bearer ${lu}`;
    return envoyer(`${API_GITHUB}${chemin}`, entetes);
  };
}

// Un corps lu en JSON quand il en est un.
export function corpsLu(texte: string): unknown {
  try {
    return JSON.parse(texte);
  } catch {
    return texte;
  }
}

// Un en-tête qui est un entier positif ou nul ; nul sinon — absent ou illisible, il ne dit rien.
const entier = (valeur: string | null | undefined): number | null => (valeur != null && /^\d+$/.test(valeur.trim()) ? Number(valeur.trim()) : null);
// Le budget horaire que les en-têtes `x-ratelimit-*` disent ; nul s'il en manque un, ou qu'un ne se lit pas.
function limitDe(entetes: { get(name: string): string | null } | undefined): LimitGitHub | null {
  const restant = entier(entetes?.get("x-ratelimit-remaining"));
  const total = entier(entetes?.get("x-ratelimit-limit"));
  const resumption = entier(entetes?.get("x-ratelimit-reset"));
  return restant === null || total === null || total === 0 || resumption === null ? null : { restant, total, repriseLe: resumption * 1000 };
}

// L'envoi par `fetch` — celui de Node sur le desktop. Abandonné passé `delaiMs`.
export function parFetch(options: { fetch?: typeof fetch; delaiMs?: number } = {}): Envoi {
  const appeler = options.fetch ?? fetch;
  return async (adresse, entetes) => {
    const abandon = new AbortController();
    const guard = setTimeout(() => abandon.abort(new Error(`GitHub gave no answer within ${Math.round((options.delaiMs ?? DELAY_MS) / 1000)} s`)), options.delaiMs ?? DELAY_MS);
    try {
      const answer = await appeler(adresse, { headers: entetes, signal: abandon.signal });
      const etag = answer.headers?.get("etag");
      const limit = limitDe(answer.headers);
      const apres = entier(answer.headers?.get("retry-after"));
      return { status: answer.status, data: corpsLu(await answer.text()), ...(etag == null ? {} : { etag }), ...(limit === null ? {} : { limite: limit }), ...(apres === null ? {} : { reessayerApresMs: apres * 1000 }) };
    } catch (error) {
      throw abandon.signal.aborted && abandon.signal.reason instanceof Error ? abandon.signal.reason : error;
    } finally {
      clearTimeout(guard);
    }
  };
}

// Un `POST` à cette adresse, avec ces en-têtes et ce corps — un objet, que la plateforme écrit en JSON. Lève quand rien
// n'a répondu.
export type Workstation = (adresse: string, entetes: Record<string, string>, corps: unknown) => Promise<AnswerGitHub>;

// La première phrase de ce que GitHub dit d'un refus, sans son point.
function messageDe(data: unknown): string | null {
  const message = typeof data === "object" && data !== null && "message" in data ? data.message : null;
  if (typeof message !== "string") return null;
  const phrase = (message.trim().split(/(?<=[.!?])\s/)[0] ?? "").replace(/[.\s]+$/, "");
  return phrase === "" || phrase.length > 200 ? null : phrase;
}

// L'erreur d'une demande que GitHub refuse, en une phrase : `quoi` nomme ce qui était demandé.
export function refusalDe(quoi: string, { status, data }: AnswerGitHub): Error {
  const message = messageDe(data);
  if (status === 401) return new Error(`GitHub refused the app's GitHub sign-in (HTTP 401)${message === null ? "" : `: ${message}`} — sign in to GitHub again`);
  return new Error(`GitHub refused ${quoi} (HTTP ${status})${message === null ? "" : `: ${message}`}`);
}

// Le `POST` par `fetch` — celui de Node sur le desktop. Abandonné passé `delaiMs`.
export function posterParFetch(options: { fetch?: typeof fetch; delaiMs?: number } = {}): Workstation {
  const appeler = options.fetch ?? fetch;
  const delay = options.delaiMs ?? DELAY_MS;
  return async (adresse, entetes, corps) => {
    const abandon = new AbortController();
    const guard = setTimeout(() => abandon.abort(new Error(`GitHub gave no answer within ${Math.round(delay / 1000)} s`)), delay);
    try {
      const answer = await appeler(adresse, { method: "POST", headers: entetes, body: JSON.stringify(corps), signal: abandon.signal });
      return { status: answer.status, data: corpsLu(await answer.text()) };
    } catch (error) {
      throw abandon.signal.aborted && abandon.signal.reason instanceof Error ? abandon.signal.reason : error;
    } finally {
      clearTimeout(guard);
    }
  };
}
