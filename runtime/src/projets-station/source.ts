// D'où la station tient les projets qu'elle sert (#1707) : de la sélection que
// l'app écrit dans le gist de son enregistrement (`enregistrement-station/`).
// `projets/tenir.ts` la relit à chaque cadence (30 s) et la sert : un dépôt
// coché y est préparé puis servi, un dépôt décoché quitte sa configuration.
//
// Tant que l'app n'a écrit aucune sélection, une station appairée par code
// sert encore ce que l'app lui demande par son appairage (`projets/demande.ts`).
// Une station qui n'a ni l'une ni l'autre ne sert aucun projet de l'app, et le
// dit au journal de service — de nouveau chaque heure tant que cela dure, pour
// que le statut de son service le montre toujours.
import type { Canal } from "../appairage/canal.ts";
import { FICHIER_SELECTION, selectionLue } from "../enregistrement-station/contrat.ts";
import { demandeDeLAppairage, type DemandeLue } from "../projets/tenir.ts";
import { lieuxDuProjet } from "../station/configuration.ts";
import { baseDuClone, cooksDeLaMachine, demandeDeLaSelection } from "./selection.ts";

// Entre deux rappels d'une station qui ne sert aucun projet choisi.
export const RAPPEL_MS = 3_600_000;

export type OptionsSource = {
  // Le répertoire de la station (`BRIGADE_STATION_DIR`).
  racine: string;
  canal: Canal;
  // Le gist de son enregistrement, null tant qu'il n'est pas créé (`enregistrer.ts`).
  gist: () => string | null;
  env: Record<string, string | undefined>;
  dire: (ligne: string) => void;
  // Les cœurs de la machine, d'où son plafond de cooks — par défaut, les siens.
  coeurs?: number;
  maintenant?: () => number;
  // Ce que l'app demande par l'appairage, à défaut de sélection — par défaut,
  // `brigade-projets.json` du gist de l'appairage.
  appairage?: () => Promise<DemandeLue | null>;
};

// Ce que la station sert, au regard de l'app : les dépôts choisis pour elle ;
// ce que demande son appairage ; ou rien.
type Etat = { choisis: string[] } | "appairage" | "aucun";

export const AUCUN_PROJET =
  "brigade : station — aucun projet n'est choisi pour elle dans l'app : elle n'en sert aucun. Coche ceux qu'elle doit servir dans l'app, connectée au même compte GitHub que cette machine";

export function sourceDesProjets(options: OptionsSource): () => Promise<DemandeLue | null> {
  const { racine, canal, env, dire } = options;
  const maintenant = options.maintenant ?? Date.now;
  const appairage = options.appairage ?? (() => demandeDeLAppairage(racine, canal));
  const cooks = cooksDeLaMachine(options.coeurs);
  const base = (nom: string) => baseDuClone(lieuxDuProjet(racine, nom, env.HOME).clone, { ...process.env, ...env });
  let dit: string | null = null;
  let rappeleLe = 0;

  // Ce qu'elle sert se dit quand cela change ; « rien » se redit chaque heure.
  const signaler = (etat: Etat) => {
    const choisis = etat === "aucun" ? [] : etat === "appairage" ? null : etat.choisis;
    const cle = choisis === null ? "appairage" : choisis.join(" ");
    const instant = maintenant();
    if (cle === dit && !(choisis?.length === 0 && instant - rappeleLe >= RAPPEL_MS)) return;
    dit = cle;
    if (choisis === null) return dire("brigade : station — aucun projet n'est choisi pour elle dans l'app : elle sert ce que l'app lui demande par son appairage");
    if (choisis.length === 0) {
      rappeleLe = instant;
      return dire(AUCUN_PROJET);
    }
    dire(`brigade : station — ${choisis.length === 1 ? "projet choisi" : `${choisis.length} projets choisis`} pour elle dans l'app : ${choisis.join(", ")} — elle les prépare et les sert`);
  };

  return async () => {
    const gist = options.gist();
    const lus = gist === null ? null : await canal.lire(gist);
    const brut = lus?.[FICHIER_SELECTION];
    if (gist !== null && lus !== null && brut !== undefined) {
      const selection = selectionLue(brut);
      // Illisible : `projets/tenir.ts` le dit, et n'en change rien.
      if (selection === null) return { gist, lus, fichier: FICHIER_SELECTION, brut, demande: null };
      signaler({ choisis: selection.repositories });
      return { gist, lus, fichier: FICHIER_SELECTION, brut, demande: demandeDeLaSelection(selection, { cooks, base }) };
    }
    const appairee = await appairage();
    if (appairee !== null) {
      signaler("appairage");
      return appairee;
    }
    // Pas encore enregistrée, ou son gist vient de disparaître : rien ne
    // change avant que l'enregistrement ne soit là (`enregistrer.ts` le dit).
    if (gist === null || lus === null) return null;
    signaler("aucun");
    return { gist, lus, fichier: FICHIER_SELECTION, brut: "", demande: { projets: [], problemes: [] } };
  };
}
