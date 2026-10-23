// L'accès des apps à l'API REST de GitHub, pour lire le tableau de la cuisine d'un projet (lecture.ts) : un `GET`, avec
// le jeton GitHub de l'app quand elle en a un. Ce module ne fait que composer la demande ; ce qui la porte est donné par
// la plateforme — le `fetch` du desktop (`parFetch`), le HTTP natif du téléphone (app/android/web/lecture.ts) — et le
// jeton aussi : celui du `gh` de l'ordinateur sur le desktop (jeton-gh.ts), celui du coffre du téléphone sur Android.
// Il ne parle qu'à GitHub : aucune box, aucune station n'est jointe.

export const API_GITHUB = "https://api.github.com";
// La version de l'API REST que ces lectures supposent.
const VERSION_DE_L_API = "2022-11-28";
// Au-delà, la demande est abandonnée : GitHub ne répond pas.
export const DELAI_MS = 30_000;

// Ce que GitHub a rendu : son code, et son corps — lu en JSON quand il en est, sinon le texte tel quel.
export type ReponseGitHub = { status: number; data: unknown };
// Un `GET` à l'API de GitHub, sur ce chemin (`/repos/…`). Lève quand rien n'a répondu.
export type AppelGitHub = (chemin: string) => Promise<ReponseGitHub>;
// Ce que la plateforme fait de la demande composée : l'envoyer, et rendre la réponse. Lève quand rien n'a répondu.
export type Envoi = (adresse: string, entetes: Record<string, string>) => Promise<ReponseGitHub>;

export type OptionsClient = {
  // Le jeton GitHub de l'app ; nul sans lui — la demande part alors sans, et ne lit que ce qui est public.
  jeton: () => Promise<string | null>;
  envoyer: Envoi;
};

export function clientGitHub({ jeton, envoyer }: OptionsClient): AppelGitHub {
  return async (chemin) => {
    // Un jeton qui ne se lit pas n'empêche pas la lecture : elle part sans, et GitHub dit ce qu'il en refuse.
    const lu = await jeton().catch(() => null);
    const entetes: Record<string, string> = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": VERSION_DE_L_API };
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

// L'envoi par `fetch` — celui de Node sur le desktop. Abandonné passé `delaiMs`.
export function parFetch(options: { fetch?: typeof fetch; delaiMs?: number } = {}): Envoi {
  const appeler = options.fetch ?? fetch;
  return async (adresse, entetes) => {
    const abandon = new AbortController();
    const garde = setTimeout(() => abandon.abort(new Error(`GitHub gave no answer within ${Math.round((options.delaiMs ?? DELAI_MS) / 1000)} s`)), options.delaiMs ?? DELAI_MS);
    try {
      const reponse = await appeler(adresse, { headers: entetes, signal: abandon.signal });
      return { status: reponse.status, data: corpsLu(await reponse.text()) };
    } catch (erreur) {
      throw abandon.signal.aborted && abandon.signal.reason instanceof Error ? abandon.signal.reason : erreur;
    } finally {
      clearTimeout(garde);
    }
  };
}
