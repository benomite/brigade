// La station s'enregistre sous le compte GitHub de sa machine (#1705) : dès
// son démarrage, elle crée un gist secret de ce compte qui porte son
// enregistrement (`contrat.ts`), puis le réécrit à chaque `ECRITURE_MS` — son
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
//
// Quand la limite de GitHub arrête ses appels, son signe de vie se fige : l'app
// la dirait tue, et ses projets sans station (#2443). Dès que la pause commence,
// elle écrit donc une fois son enregistrement hors de la pause, avec la limite
// et sa fin (`heldBy`) ; l'écriture suivante, la limite levée, l'efface. Une
// pause d'une autre sorte d'appel que le gist ne retient pas son signe de vie :
// elle n'en dit rien (#3481).
//
// Un signe de vie que GitHub refuse n'arrête rien d'autre : la pause ne retient
// que les appels du gist (`limite-github.ts`), la cuisine continue, et lui se
// retente en reculant — une minute, puis le double à chaque refus, quinze au
// plus —, jamais avant la fin de la pause (#3481).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Canal } from "../appairage/canal.ts";
import { sorteDeLaLimite } from "../github-limite.ts";
import { LimiteGitHubAtteinte, RECUL_MAX_MS, surLaPauseDeGitHub, type PauseDeGitHub } from "../limite-github.ts";
import { description, ECRITURE_MS, FICHIER_ENREGISTREMENT, FORMAT, NOUVEL_ESSAI_MS, plateformeDe, PREMIER_RECUL_MS, RAFRAICHI_MS, type Enregistrement, type RetenueParGitHub } from "./contrat.ts";

export const FICHIER_LOCAL = "enregistrement.json";

// Les essais de l'écriture qui dit la limite : GitHub, qui vient de la dire,
// peut la refuser elle aussi. Elle se retente hors de la pause, trois fois au
// plus, en reculant comme le signe de vie (#3481) : une minute, puis deux.
export const ESSAIS_DE_LA_RETENUE = 3;

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
  // Qui lui dit qu'une pause de GitHub commence ; par défaut, le compteur du
  // process (`surLaPauseDeGitHub`). Rend de quoi ne plus l'écouter.
  pauses?: (ecouteur: (pause: PauseDeGitHub) => void) => () => void;
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
  // La limite qui la retient, tant que son enregistrement doit la dire.
  let retenue: RetenueParGitHub | null = null;
  // Les essais qui restent à l'écriture qui la dit.
  let essaisDeLaRetenue = 0;
  // Le recul du dernier signe de vie refusé par la limite de GitHub ; 0 après un succès.
  let recul = 0;

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
      ...(arret || retenue === null ? {} : { heldBy: retenue }),
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

  // Rend le délai avant l'écriture suivante. `horsPause` : celle qui dit la
  // limite, que la pause de la box ne retient pas.
  const ecrire = async (arret: boolean, horsPause: boolean): Promise<number> => {
    const instant = maintenant();
    // La limite levée, l'écriture qui part le dit en n'en disant plus rien.
    if (retenue !== null && instant >= Date.parse(retenue.until)) retenue = null;
    if (etat.gist === null) {
      // Arrêtée avant d'avoir jamais été enregistrée : rien à dire.
      if (arret) return ECRITURE_MS;
      await creer(instant);
    } else if ((await canal.ecrire(etat.gist, fichiers(document(instant, arret)), horsPause ? { horsPause } : undefined)) === "absent") {
      etat = { ...VIERGE };
      sauver();
      dire("brigade : station — son enregistrement a disparu de GitHub : elle s'enregistre de nouveau");
      if (arret) return ECRITURE_MS;
      await creer(instant);
    }
    if (panne !== null) dire("brigade : station — GitHub répond de nouveau : son enregistrement y est à jour");
    panne = null;
    recul = 0;
    if (horsPause) essaisDeLaRetenue = 0;
    // La limite dite, rien ne s'écrit plus avant sa fin.
    return horsPause && retenue !== null ? Math.max(ECRITURE_MS, Date.parse(retenue.until) - instant) : ECRITURE_MS;
  };

  const essayer = async (arret: boolean, horsPause = false): Promise<number> => {
    try {
      return await ecrire(arret, horsPause);
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
      if (horsPause) essaisDeLaRetenue -= 1;
      if (!(erreur instanceof LimiteGitHubAtteinte)) return NOUVEL_ESSAI_MS;
      // Refusé par la limite : il recule, et n'essaie jamais avant la fin de la pause.
      recul = recul === 0 ? PREMIER_RECUL_MS : Math.min(recul * 2, RECUL_MAX_MS);
      return Math.max(recul, erreur.jusqua - maintenant());
    }
  };

  let fil: Promise<void> = Promise.resolve();
  const enchainer = (arret: boolean, horsPause = false) => {
    fil = fil.then(async () => {
      const delai = await essayer(arret, horsPause);
      // Refusée, celle qui dit la limite se retente, hors de la pause, tant qu'il lui reste un essai.
      const redire = horsPause && retenue !== null && essaisDeLaRetenue > 0;
      // Une seule écriture à venir, même quand celle de la pause a croisé une écriture en vol.
      prochain?.();
      prochain = arretee ? null : redire ? apres(() => void enchainer(false, true), recul || NOUVEL_ESSAI_MS) : apres(() => void enchainer(false), delai);
    });
    return fil;
  };
  void enchainer(false);

  // Une pause commence : la limite s'écrit hors de la pause — tout de suite,
  // ou après son recul quand c'est le gist qui vient d'être refusé —, et
  // l'écriture d'après attend sa fin. Pas encore de gist : rien à y dire.
  const neplusEcouter = (options.pauses ?? surLaPauseDeGitHub)(({ depuis, jusqua, reponse, lecture }) => {
    // Une pause d'une autre sorte que le gist laisse partir son signe de vie (#3481).
    if (arretee || (lecture != null && lecture !== "gist")) return;
    // Pendant que l'écriture qui dit la limite se retente, une pause de plus
    // — celle que pose son propre refus — n'en dit que la nouvelle fin.
    if (retenue !== null && essaisDeLaRetenue > 0) {
      if (jusqua > Date.parse(retenue.until)) retenue = { ...retenue, until: new Date(jusqua).toISOString() };
      return;
    }
    retenue = { limit: sorteDeLaLimite(reponse), since: new Date(depuis).toISOString(), until: new Date(jusqua).toISOString() };
    if (etat.gist === null) return;
    essaisDeLaRetenue = ESSAIS_DE_LA_RETENUE;
    if (lecture === "gist") {
      // Le gist vient d'être refusé : l'écriture qui dit la limite attend son
      // recul, une fois fini l'essai en cours, au lieu de partir aussitôt (#3481).
      fil = fil.then(() => {
        if (arretee) return;
        prochain?.();
        prochain = apres(() => void enchainer(false, true), recul || PREMIER_RECUL_MS);
      });
      return;
    }
    prochain?.();
    prochain = null;
    void enchainer(false, true);
  });

  return {
    gist: () => etat.gist,
    arreter() {
      if (arretee) return fil;
      arretee = true;
      neplusEcouter();
      prochain?.();
      prochain = null;
      return enchainer(true);
    },
  };
}
