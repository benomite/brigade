// La station s'enregistre sous le compte GitHub de sa machine (#1705) : dès
// son démarrage, elle crée un gist secret de ce compte qui porte son
// enregistrement (`contrat.ts`), puis le réécrit à chaque `RAFRAICHI_MS` — son
// signe de vie. Arrêtée proprement, elle y écrit tout de suite l'heure de son
// arrêt ; éteinte d'un coup, c'est son signe de vie qui vieillit. Redémarrée,
// elle reprend le même gist : la même station, de nouveau disponible.
//
// Aucun code, aucun geste : le `gh` de la machine, connecté à l'installation,
// suffit. Tant qu'il ne l'est pas — l'installeur démarre la station avant de
// connecter GitHub —, l'écriture échoue, la station le dit une fois et
// réessaie chaque minute : elle s'enregistre dès la connexion faite.
//
// Ce qu'elle garde d'une fois sur l'autre — son gist, l'heure de son premier
// enregistrement — est dans `<BRIGADE_STATION_DIR>/enregistrement.json`. Un
// gist supprimé sur GitHub, elle en crée un autre à l'écriture suivante.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Canal } from "../appairage/canal.ts";
import { LimiteGitHubAtteinte } from "../limite-github.ts";
import { description, FICHIER_ENREGISTREMENT, FORMAT, NOUVEL_ESSAI_MS, plateformeDe, RAFRAICHI_MS, type Enregistrement } from "./contrat.ts";

export const FICHIER_LOCAL = "enregistrement.json";

export type OptionsEnregistrement = {
  // Le répertoire de la station (`BRIGADE_STATION_DIR`).
  racine: string;
  // Le gist du compte de la machine, par son `gh` — celui de la présence.
  canal: Canal;
  identite: { nom: string; machine: string; version: string };
  // `process.platform`, à défaut.
  plateforme?: string;
  // Une ligne du journal de service.
  dire: (ligne: string) => void;
  // Un minuteur : appelle `tache` dans `ms`, rend de quoi l'annuler. Les tests
  // y mettent une horloge simulée.
  apres?: (tache: () => void, ms: number) => () => void;
  maintenant?: () => number;
};

export type TenueEnregistrement = {
  // Le gist de l'enregistrement, null tant qu'il n'est pas créé.
  gist(): string | null;
  // L'heure de l'arrêt, écrite tout de suite ; plus aucun signe de vie ensuite.
  arreter(): Promise<void>;
};

type EtatLocal = { gist: string | null; registeredAt: string | null };

const VIERGE: EtatLocal = { gist: null, registeredAt: null };

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Illisible, la station repart de zéro : un enregistrement neuf.
function lireEtat(fichier: string): EtatLocal {
  try {
    const lu = JSON.parse(readFileSync(fichier, "utf8")) as Partial<EtatLocal>;
    return {
      gist: typeof lu.gist === "string" && lu.gist !== "" ? lu.gist : null,
      registeredAt: typeof lu.registeredAt === "string" && !Number.isNaN(Date.parse(lu.registeredAt)) ? lu.registeredAt : null,
    };
  } catch {
    return { ...VIERGE };
  }
}

export function tenirEnregistrement(options: OptionsEnregistrement): TenueEnregistrement {
  const { canal, identite, dire } = options;
  const apres = options.apres ?? ((tache: () => void, ms: number) => {
    const minuteur = setTimeout(tache, ms);
    return () => clearTimeout(minuteur);
  });
  const maintenant = options.maintenant ?? Date.now;
  const plateforme = plateformeDe(options.plateforme ?? process.platform);
  const fichier = join(options.racine, FICHIER_LOCAL);
  let etat = lireEtat(fichier);
  // La dernière panne dite : la même ne se répète pas à chaque essai.
  let panne: string | null = null;
  let arretee = false;
  let prochain: (() => void) | null = null;

  const sauver = () => writeFileSync(fichier, `${JSON.stringify(etat, null, 2)}\n`);

  const document = (instant: number, arret: boolean): Enregistrement => {
    const le = new Date(instant).toISOString();
    return {
      brigade: "station-registration",
      format: FORMAT,
      name: identite.nom,
      platform: plateforme,
      machine: identite.machine,
      version: identite.version,
      registeredAt: etat.registeredAt ?? le,
      lastSeen: le,
      refreshMs: RAFRAICHI_MS,
      stoppedAt: arret ? le : null,
    };
  };
  const fichiers = (doc: Enregistrement) => ({ [FICHIER_ENREGISTREMENT]: `${JSON.stringify(doc, null, 2)}\n` });

  const creer = async (instant: number) => {
    const doc = document(instant, false);
    const gist = await canal.creer(description(identite.nom), fichiers(doc));
    etat = { gist, registeredAt: doc.registeredAt };
    sauver();
    dire(`brigade : station enregistrée sous le compte GitHub de sa machine — l'app connectée au même compte la voit (gist ${gist})`);
  };

  // Rend le délai avant l'écriture suivante.
  const ecrire = async (arret: boolean): Promise<number> => {
    const instant = maintenant();
    if (etat.gist === null) {
      // Arrêtée avant d'avoir jamais été enregistrée : rien à dire.
      if (arret) return RAFRAICHI_MS;
      await creer(instant);
    } else if ((await canal.ecrire(etat.gist, fichiers(document(instant, arret)))) === "absent") {
      etat = { ...VIERGE };
      sauver();
      dire("brigade : station — son enregistrement a disparu de GitHub : elle s'enregistre de nouveau");
      if (arret) return RAFRAICHI_MS;
      await creer(instant);
    }
    if (panne !== null) dire("brigade : station — GitHub répond de nouveau : son enregistrement y est à jour");
    panne = null;
    return RAFRAICHI_MS;
  };

  const essayer = async (arret: boolean): Promise<number> => {
    try {
      return await ecrire(arret);
    } catch (erreur) {
      const dit = message(erreur);
      if (dit !== panne) {
        dire(
          erreur instanceof LimiteGitHubAtteinte
            ? `brigade : station — ${dit}`
            : etat.gist === null
              ? `brigade : station — pas encore enregistrée sous un compte GitHub, elle réessaie à chaque minute : ${dit}`
              : `brigade : station — son enregistrement n'est pas rafraîchi sur GitHub, elle réessaie à chaque minute : ${dit}`,
        );
      }
      panne = dit;
      return erreur instanceof LimiteGitHubAtteinte ? Math.max(NOUVEL_ESSAI_MS, erreur.jusqua - maintenant()) : NOUVEL_ESSAI_MS;
    }
  };

  let fil: Promise<void> = Promise.resolve();
  const enchainer = (arret: boolean) => {
    fil = fil.then(async () => {
      const delai = await essayer(arret);
      if (!arretee) prochain = apres(() => void enchainer(false), delai);
    });
    return fil;
  };
  void enchainer(false);

  return {
    gist: () => etat.gist,
    arreter() {
      if (arretee) return fil;
      arretee = true;
      prochain?.();
      prochain = null;
      return enchainer(true);
    },
  };
}
