// Le quota GitHub du compte, lu de GitHub lui-même (#4645) : `GET /rate_limit`, que GitHub ne compte pas sur le budget
// horaire du jeton. Aucun runtime ne donne plus `quotaGithub` (#3483) : c'est l'app qui le lit, hors du budget de ses
// lectures (budget-github.ts) — la pause ne le retient pas, et il ne s'y compte pas. Au plus une lecture par minute ;
// une lecture ratée garde la dernière bonne. La jauge de l'onglet Stations le dessine (vue/stations-quota/).
import type { CallGitHub } from "./board/client.ts";
import type { ReadOfBoardOfRepository } from "./board/read.ts";
import type { QuotaGithub } from "./vue/stations-quota/quota-read.ts";

// Le seul chemin que GitHub ne compte pas : https://docs.github.com/en/rest/rate-limit/rate-limit
const RATE_LIMIT = "/rate_limit";
const FRESHNESS_MS = 60_000;

const whole = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

// Le budget `core` (les appels REST du jeton) que GitHub dit : utilisé, sur combien, et l'heure où il se remplit ; nul s'il ne se lit pas.
function quotaOf(data: unknown): QuotaGithub | null {
  const core = (data as { resources?: { core?: Record<string, unknown> } } | null)?.resources?.core;
  if (core === undefined || core === null) return null;
  const { limit, remaining, used, reset } = core;
  if (!whole(limit) || !whole(remaining)) return null;
  return { limite: "core", pauseJusqua: null, utilise: whole(used) ? used : limit - remaining, maximum: limit, renouvellement: whole(reset) ? new Date(reset * 1000).toISOString() : null };
}

export function holdTheQuotaGitHub({ appeler: call, maintenant: now = Date.now }: { appeler: CallGitHub; maintenant?: () => number }) {
  let last: QuotaGithub | null = null;
  let readAt = Number.NEGATIVE_INFINITY;
  let running: Promise<QuotaGithub | null> | null = null;
  return {
    lire(): Promise<QuotaGithub | null> {
      if (now() - readAt < FRESHNESS_MS) return Promise.resolve(last);
      running ??= call(RATE_LIMIT)
        .then((answer) => {
          readAt = now();
          last = (answer.status === 200 ? quotaOf(answer.data) : null) ?? last;
          return last;
        })
        .catch(() => last)
        .finally(() => (running = null));
      return running;
    },
  };
}

// La lecture d'un rail porte le quota du compte dans ses faits : celui d'un rail gardé est remplacé par le frais.
export function withTheQuota(readOne: ReadOfBoardOfRepository, quota: QuotaGithub | null): ReadOfBoardOfRepository {
  if (!readOne.lu) return readOne;
  const facts = { ...readOne.faits };
  delete facts.quotaGithub;
  return { ...readOne, faits: quota === null ? facts : { ...facts, quotaGithub: quota } };
}
