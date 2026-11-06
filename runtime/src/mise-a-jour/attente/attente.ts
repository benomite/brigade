// Une mise à jour qui attend ne vide plus la station (#2586). Jusqu'ici, sa
// demande vue, la station ne prenait plus de ticket jusqu'à ce que ses cooks en
// vol aient fini (#2547) : la cuisine se vidait, puis se remplissait. Elle
// prend désormais ses tickets jusqu'à ses places, et sa relance vient au
// premier moment sans cook en vol — ou, s'il ne vient pas, à l'échéance qu'on
// lui donne (celle du lot, que la logique de lot calcule, pas ce module).
//
// À l'échéance, le travail de chaque cook en vol est sauvé sur sa branche,
// commité et poussé (`SUJET_DE_SAUVEGARDE`), avant la relance : le cook qui
// reprend le ticket repart de cette branche, et non de la base.
//
// La station n'est retenue — plus aucun ticket pris — que du moment où elle
// sauve jusqu'à sa relance : un cook parti entre les deux serait coupé sans
// que rien ne le sauve.

// Le sujet du commit qui sauve le travail d'un cook avant la relance. Une
// branche dont la tête le porte n'est pas une livraison (#2577) : c'est un
// travail coupé, qu'un cook reprend.
export const SUJET_DE_SAUVEGARDE = "brigade: work in progress saved before the station restarts (#2586)";

export const estUneSauvegarde = (sujet: string | null | undefined): boolean => sujet === SUJET_DE_SAUVEGARDE;

// Ce que la station fait, à un instant, de la mise à jour qui attend.
export type Moment = "attendre" | "relancer" | "sauver";

export function momentDeLaRelance(enVol: readonly number[], echeance: number, maintenant: number): Moment {
  if (enVol.length === 0) return "relancer";
  return maintenant >= echeance ? "sauver" : "attendre";
}

export type Attente = {
  // Une veille. `echeance` : celle de la mise à jour qui attend (ms), nulle
  // sans elle. Rend vrai quand la station est prête pour sa relance.
  veiller(echeance: number | null): boolean;
  // Vrai de la sauvegarde à la relance : la station ne prend plus de ticket.
  retenue(): boolean;
};

export function attendreLaRelance(options: {
  enVol: () => number[];
  // Sauve le travail des cooks en vol sur leur branche ; rend leurs tickets.
  sauver: () => Promise<number[]>;
  // Appelé quand la sauvegarde a fini : la station est prête.
  prete?: () => void;
  maintenant?: () => number;
  dire?: (ligne: string) => void;
}): Attente {
  const maintenant = options.maintenant ?? (() => Date.now());
  let etat: "libre" | "sauvegarde" | "prete" = "libre";
  return {
    veiller(echeance) {
      if (echeance === null) {
        etat = "libre";
        return false;
      }
      if (etat !== "libre") return etat === "prete";
      const enVol = options.enVol();
      const moment = momentDeLaRelance(enVol, echeance, maintenant());
      if (moment === "relancer") {
        etat = "prete";
        return true;
      }
      if (moment === "attendre") return false;
      etat = "sauvegarde";
      const liste = enVol.map((n) => `#${n}`).join(", ");
      options.dire?.(`brigade : station — l'échéance de sa mise à jour est passée, ses cooks sont encore en vol (${liste}) : leur travail est sauvé sur leur branche avant la relance`);
      void options
        .sauver()
        .then(
          (sauves) => options.dire?.(`brigade : station — ${sauves.length} cook(s) sauvé(s) sur leur branche${sauves.length === 0 ? "" : ` (${sauves.map((n) => `#${n}`).join(", ")})`} : elle est prête pour sa relance`),
          (erreur: unknown) => options.dire?.(`brigade : station — la sauvegarde de ses cooks en vol a échoué (${erreur instanceof Error ? erreur.message : String(erreur)}) : la relance les coupera`),
        )
        .finally(() => {
          if (etat !== "sauvegarde") return;
          etat = "prete";
          options.prete?.();
        });
      return false;
    },
    retenue: () => etat !== "libre",
  };
}
