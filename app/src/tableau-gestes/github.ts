// Les gestes du tableau (gestes.ts) sur l'API REST de GitHub : le client que la plateforme donne au module — poster le
// commentaire d'un geste sur l'issue du tableau, relire les gestes que son bloc machine porte. Ce module compose les
// demandes, avec les mêmes en-têtes et le même jeton que la lecture du tableau (app/src/tableau/client.ts) ; ce qui les
// porte est donné par la plateforme : le `fetch` du desktop (`posterParFetch`). Il ne parle qu'à GitHub : aucune box,
// aucune station n'est jointe.
import { clientGitHub, corpsLu, DELAI_MS, type AppelGitHub, type ReponseGitHub } from "../tableau/client.ts";
import { gestesDuCorps, type ClientDesGestes } from "./gestes.ts";

// Un `POST` à cette adresse, avec ces en-têtes et ce corps — un objet, que la plateforme écrit en JSON. Lève quand rien
// n'a répondu.
export type Poste = (adresse: string, entetes: Record<string, string>, corps: unknown) => Promise<ReponseGitHub>;

export type OptionsDuClient = {
  // Le jeton GitHub de l'app ; nul sans lui — GitHub refuse alors le commentaire, et le dit.
  jeton: () => Promise<string | null>;
  poster: Poste;
  // Le `GET` de la lecture du tableau (client.ts), pour relire son bloc machine.
  appeler: AppelGitHub;
};

// La première phrase de ce que GitHub dit d'un refus, sans son point.
function messageDe(data: unknown): string | null {
  const message = typeof data === "object" && data !== null && "message" in data ? data.message : null;
  if (typeof message !== "string") return null;
  const phrase = (message.trim().split(/(?<=[.!?])\s/)[0] ?? "").replace(/[.\s]+$/, "");
  return phrase === "" || phrase.length > 200 ? null : phrase;
}

export function refusDe(quoi: string, { status, data }: ReponseGitHub): Error {
  const message = messageDe(data);
  if (status === 401) return new Error(`GitHub refused the app's GitHub sign-in (HTTP 401)${message === null ? "" : `: ${message}`} — sign in to GitHub again`);
  return new Error(`GitHub refused ${quoi} (HTTP ${status})${message === null ? "" : `: ${message}`}`);
}

export function clientDesGestesGitHub({ jeton, poster, appeler }: OptionsDuClient): ClientDesGestes {
  return {
    async poster(depot, tableau, corps) {
      // Les en-têtes et le jeton de la lecture : le même client, porté par un `POST`.
      const envoi = clientGitHub({ jeton, envoyer: (adresse, entetes) => poster(adresse, { ...entetes, "Content-Type": "application/json" }, { body: corps }) });
      const reponse = await envoi(`/repos/${depot}/issues/${tableau}/comments`);
      if (reponse.status !== 201) throw refusDe("the comment", reponse);
      const { id, html_url } = (typeof reponse.data === "object" && reponse.data !== null ? reponse.data : {}) as Record<string, unknown>;
      if (typeof id !== "number") throw new Error("GitHub's answer does not name the comment it wrote");
      return { id, url: typeof html_url === "string" ? html_url : null };
    },
    async gestesDuTableau(depot, tableau) {
      const reponse = await appeler(`/repos/${depot}/issues/${tableau}`);
      if (reponse.status !== 200) throw refusDe("the reading of the Kitchen board", reponse);
      const { body } = (typeof reponse.data === "object" && reponse.data !== null ? reponse.data : {}) as Record<string, unknown>;
      return gestesDuCorps(typeof body === "string" ? body : "");
    },
  };
}

// Le `POST` par `fetch` — celui de Node sur le desktop. Abandonné passé `delaiMs`.
export function posterParFetch(options: { fetch?: typeof fetch; delaiMs?: number } = {}): Poste {
  const appeler = options.fetch ?? fetch;
  const delai = options.delaiMs ?? DELAI_MS;
  return async (adresse, entetes, corps) => {
    const abandon = new AbortController();
    const garde = setTimeout(() => abandon.abort(new Error(`GitHub gave no answer within ${Math.round(delai / 1000)} s`)), delai);
    try {
      const reponse = await appeler(adresse, { method: "POST", headers: entetes, body: JSON.stringify(corps), signal: abandon.signal });
      return { status: reponse.status, data: corpsLu(await reponse.text()) };
    } catch (erreur) {
      throw abandon.signal.aborted && abandon.signal.reason instanceof Error ? abandon.signal.reason : erreur;
    } finally {
      clearTimeout(garde);
    }
  };
}
