// Ce que l'app et la station se disent d'un remède, par le gist de la station —
// le seul canal entre elles (`appairage/canal.ts`), que la station soit
// l'ordinateur du chef ou une station distante. Deux fichiers de plus :
//   - `brigade-remedes.json`, écrit par l'app seule — les remèdes que le chef
//     demande :
//       { "brigade": "remedies", "format": 1, "requests": [
//         { "id": "<unique>", "askedAt": "<ISO>",
//           "project": "shop", "refusal": "<code du refus>", "remedy": "<id du remède>" } ] }
//   - `brigade-remedes-suivi.json`, écrit par la station seule — ce qu'il en
//     est, pour chaque demande encore posée :
//       { "brigade": "remedies-answers", "format": 1, "a": "<ISO>", "answers": [
//         { "id": "<celui de la demande>", "answeredAt": "<ISO>",
//           "outcome": "lifted" | "holds" | "error", "reason"?, "refusal"?, "error"? } ] }
//     (`executer.ts`, `IssueDuRemede`).
//
// La station joue chaque demande une seule fois, par le point d'entrée
// (`executerRemede`) : une demande déjà répondue — par elle, ou dans le gist
// avant qu'elle ne redémarre — ne se rejoue pas. Une demande trop vieille
// (`PEREMPTION_MS`) n'est pas jouée : le chef qui l'a faite n'attend plus, et
// un geste ne part pas des heures après le clic. Une réponse quitte le gist
// quand sa demande le quitte : l'app retire la sienne une fois lue.
import { randomUUID } from "node:crypto";
import type { Canal, Fichiers } from "../appairage/canal.ts";
import type { DemandeDeRemede, IssueDuRemede } from "./executer.ts";

export const FICHIER_REMEDES = "brigade-remedes.json";
export const FICHIER_REMEDES_SUIVI = "brigade-remedes-suivi.json";
export const FORMAT = 1;
// Au-delà, une demande n'est plus jouée.
export const PEREMPTION_MS = 10 * 60_000;

export type DemandeEnvoyee = DemandeDeRemede & { id: string; askedAt: string };
export type Reponse = IssueDuRemede & { id: string; answeredAt: string };

const texte = (valeur: unknown): valeur is string => typeof valeur === "string" && valeur.trim() !== "";
const date = (valeur: unknown): valeur is string => texte(valeur) && !Number.isNaN(Date.parse(valeur));

// Les demandes de l'app ; une demande illisible est ignorée, un fichier
// illisible n'en porte aucune.
export function lireDemandes(brut: string | undefined): DemandeEnvoyee[] {
  const lu = lireJson(brut) as { brigade?: unknown; requests?: unknown } | null;
  if (lu?.brigade !== "remedies" || !Array.isArray(lu.requests)) return [];
  return (lu.requests as unknown[]).flatMap((une) => {
    const { id, askedAt, project, refusal, remedy } = (une ?? {}) as Record<string, unknown>;
    return texte(id) && date(askedAt) && texte(project) && texte(refusal) && texte(remedy) ? [{ id, askedAt, project, refusal, remedy }] : [];
  });
}

export function documentDesDemandes(demandes: readonly DemandeEnvoyee[]): string {
  return `${JSON.stringify({ brigade: "remedies", format: FORMAT, requests: demandes }, null, 2)}\n`;
}

// Les réponses de la station ; une réponse illisible est ignorée.
export function lireReponses(brut: string | undefined): Reponse[] {
  const lu = lireJson(brut) as { brigade?: unknown; answers?: unknown } | null;
  if (lu?.brigade !== "remedies-answers" || !Array.isArray(lu.answers)) return [];
  return (lu.answers as unknown[]).flatMap((une): Reponse[] => {
    const reponse = (une ?? {}) as Record<string, unknown>;
    const { id, answeredAt, outcome } = reponse;
    if (!texte(id) || !date(answeredAt)) return [];
    if (outcome === "lifted") return [{ id, answeredAt, outcome }];
    if (outcome === "error" && texte(reponse.error)) return [{ id, answeredAt, outcome, error: reponse.error }];
    const refusal = reponse.refusal as Record<string, unknown> | null | undefined;
    if (outcome === "holds" && texte(reponse.reason) && refusal !== null && typeof refusal === "object" && refusal.status === "refused" && texte(refusal.code)) {
      return [{ id, answeredAt, outcome, reason: reponse.reason, refusal: refusal as unknown as Extract<IssueDuRemede, { outcome: "holds" }>["refusal"] }];
    }
    return [];
  });
}

export function documentDesReponses(reponses: readonly Reponse[], instant: number): string {
  return `${JSON.stringify({ brigade: "remedies-answers", format: FORMAT, a: new Date(instant).toISOString(), answers: reponses }, null, 2)}\n`;
}

function lireJson(brut: string | undefined): unknown {
  if (brut === undefined) return null;
  try {
    return JSON.parse(brut) as unknown;
  } catch {
    return null;
  }
}

export type Repondeur = {
  // Joue les demandes de ce gist pas encore répondues, l'une après l'autre ;
  // rend les fichiers à y écrire, ou null si ses réponses n'ont pas changé.
  repondre(lus: Fichiers): Promise<Fichiers | null>;
};

// Côté station : ce qu'elle répond aux demandes de remède de l'app.
export function repondeurDeRemedes(options: { executer: (demande: DemandeDeRemede) => Promise<IssueDuRemede>; maintenant?: () => number }): Repondeur {
  const maintenant = options.maintenant ?? Date.now;
  // Les réponses déjà faites, par l'identifiant de leur demande.
  const repondues = new Map<string, Reponse>();
  return {
    async repondre(lus) {
      const demandes = lireDemandes(lus[FICHIER_REMEDES]);
      const publiees = lireReponses(lus[FICHIER_REMEDES_SUIVI]);
      for (const { id, askedAt, project, refusal, remedy } of demandes) {
        if (repondues.has(id)) continue;
        const dejaPubliee = publiees.find((reponse) => reponse.id === id);
        if (dejaPubliee !== undefined) {
          repondues.set(id, dejaPubliee);
          continue;
        }
        const issue: IssueDuRemede =
          maintenant() - Date.parse(askedAt) > PEREMPTION_MS
            ? { outcome: "error", error: `this request was made more than ${PEREMPTION_MS / 60_000} minutes ago: nothing was done` }
            : await options.executer({ project, refusal, remedy });
        repondues.set(id, { id, answeredAt: new Date(maintenant()).toISOString(), ...issue });
      }
      // Une réponse ne survit pas à sa demande.
      const encore = new Set(demandes.map(({ id }) => id));
      for (const id of [...repondues.keys()]) if (!encore.has(id)) repondues.delete(id);
      const reponses = demandes.flatMap(({ id }) => repondues.get(id) ?? []);
      if (JSON.stringify(reponses) === JSON.stringify(publiees)) return null;
      return { [FICHIER_REMEDES_SUIVI]: documentDesReponses(reponses, maintenant()) };
    },
  };
}

export type OptionsDeLaDemande = {
  canal: Canal;
  // Le gist de la station.
  gist: string;
  demande: DemandeDeRemede;
  // Combien de temps l'app attend la réponse, et entre deux lectures du gist.
  delaiMs?: number;
  intervalleMs?: number;
  maintenant?: () => number;
  attendre?: (ms: number) => Promise<void>;
  id?: string;
};

// Côté app : demande le remède à la station par son gist, attend sa réponse,
// puis retire la demande. Rend l'issue — la même que le point d'entrée,
// joué par la station.
export async function demanderLeRemede(options: OptionsDeLaDemande): Promise<IssueDuRemede> {
  const { canal, gist, demande } = options;
  const maintenant = options.maintenant ?? Date.now;
  const attendre = options.attendre ?? ((ms: number) => new Promise<void>((resoudre) => setTimeout(resoudre, ms)));
  const delaiMs = options.delaiMs ?? PEREMPTION_MS;
  const intervalleMs = options.intervalleMs ?? 5_000;
  const id = options.id ?? randomUUID();
  const lus = await canal.lire(gist);
  if (lus === null) return { outcome: "error", error: "the station's gist no longer exists: nothing was done" };
  const envoyee: DemandeEnvoyee = { id, askedAt: new Date(maintenant()).toISOString(), ...demande };
  if ((await canal.ecrire(gist, { [FICHIER_REMEDES]: documentDesDemandes([...lireDemandes(lus[FICHIER_REMEDES]).filter((une) => une.id !== id), envoyee]) })) === "absent") {
    return { outcome: "error", error: "the station's gist no longer exists: nothing was done" };
  }
  const retirer = async () => {
    const encore = await canal.lire(gist);
    if (encore === null) return;
    await canal.ecrire(gist, { [FICHIER_REMEDES]: documentDesDemandes(lireDemandes(encore[FICHIER_REMEDES]).filter((une) => une.id !== id)) });
  };
  const debut = maintenant();
  for (;;) {
    const relus = await canal.lire(gist);
    const reponse = relus === null ? undefined : lireReponses(relus[FICHIER_REMEDES_SUIVI]).find((une) => une.id === id);
    if (reponse !== undefined) {
      await retirer();
      const { id: _id, answeredAt: _le, ...issue } = reponse;
      return issue;
    }
    if (relus === null) return { outcome: "error", error: "the station's gist no longer exists: nothing was done" };
    if (maintenant() - debut >= delaiMs) {
      await retirer();
      return { outcome: "error", error: `the station did not answer within ${Math.round(delaiMs / 1000)} s: the request is withdrawn, and nothing is known to have been done` };
    }
    await attendre(intervalleMs);
  }
}
