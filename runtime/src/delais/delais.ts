// Le temps de chaque ticket mergé dans les dernières 24 h, de sa prise par une
// station (« Taken by station ») à son merge, rapporté au temps que son label
// `attendu:<minutes>` attendait (#4308, épique #4298). Fonctions pures : la
// lecture est dans `lecture.ts`, l'écriture des lignes dans `affichage.ts`.
//
// Un ticket mergé sans ce label n'a pas de temps attendu : il est compté à
// part (`sans_temps_attendu`), jamais dans les temps ni en retard.

const FENETRE_HEURES = 24;
const PIRES_MONTRES = 5;

const LABEL_ATTENDU = /^attendu:(\d+)$/;

// Un ticket mergé, tel que le calcul le prend : ses labels, son calibrage, sa
// prise, l'ouverture de sa PR, son merge (ISO), et les minutes de gates (CI
// comprise), de relecture et de renvois de la livraison mergée.
export type TicketFusionne = {
  ticket: number;
  titre: string;
  etiquettes: readonly string[];
  modele: string;
  effort: string;
  priseAt: string;
  prOuverteAt: string;
  fusionneAt: string;
  gatesMin: number;
  revueMin: number;
  renvoisMin: number;
};

export type Repartition = { cook: number; gates: number; review: number; renvois: number; attentes: number };

export type Depassement = { ticket: number; titre: string; attendu_min: number; reel_min: number; modele: string; effort: string; repartition_min: Repartition };

// L'objet `delais` de `status --json`.
export type Delais = {
  fenetre_heures: number;
  fusionnes: number;
  dans_les_temps: number;
  part_dans_les_temps: number | null;
  sans_temps_attendu: number;
  pires_depassements: Depassement[];
};

// Les minutes attendues : un seul label `attendu:<minutes>`, entier positif ; sinon null.
function minutesAttendues(etiquettes: readonly string[]): number | null {
  const lues = new Set(etiquettes.flatMap((label) => LABEL_ATTENDU.exec(label)?.[1] ?? []).map(Number));
  const [minutes] = lues;
  return lues.size === 1 && minutes !== undefined && minutes > 0 ? minutes : null;
}

const minutesEntre = (debut: string, fin: string) => Math.round((Date.parse(fin) - Date.parse(debut)) / 60_000);

// Les cinq parts du temps réel, en minutes entières : le cook (de la prise à
// la PR ouverte), les gates, la relecture, les renvois, chacune bornée par ce
// qui reste ; les attentes sont le reste. Leur somme est le temps réel.
function repartir(t: TicketFusionne, reel: number): Repartition {
  let reste = reel;
  const prendre = (minutes: number) => {
    const part = Math.min(reste, Math.max(0, Math.round(minutes)));
    reste -= part;
    return part;
  };
  const cook = prendre(minutesEntre(t.priseAt, t.prOuverteAt));
  const gates = prendre(t.gatesMin);
  const review = prendre(t.revueMin);
  const renvois = prendre(t.renvoisMin);
  return { cook, gates, review, renvois, attentes: reste };
}

export function calculerLesDelais(tickets: readonly TicketFusionne[], maintenant: Date): Delais {
  const debut = maintenant.getTime() - FENETRE_HEURES * 3_600_000;
  const fusionnes = tickets.filter((t) => Date.parse(t.fusionneAt) >= debut);
  let dansLesTemps = 0;
  let sansTempsAttendu = 0;
  const depassements: Array<Depassement & { de: number }> = [];
  for (const t of fusionnes) {
    const attendu = minutesAttendues(t.etiquettes);
    if (attendu === null) {
      sansTempsAttendu++;
      continue;
    }
    const reel = Math.max(0, minutesEntre(t.priseAt, t.fusionneAt));
    if (reel <= attendu) dansLesTemps++;
    else depassements.push({ ticket: t.ticket, titre: t.titre, attendu_min: attendu, reel_min: reel, modele: t.modele, effort: t.effort, repartition_min: repartir(t, reel), de: reel - attendu });
  }
  const avecAttendu = fusionnes.length - sansTempsAttendu;
  return {
    fenetre_heures: FENETRE_HEURES,
    fusionnes: fusionnes.length,
    dans_les_temps: dansLesTemps,
    part_dans_les_temps: avecAttendu === 0 ? null : dansLesTemps / avecAttendu,
    sans_temps_attendu: sansTempsAttendu,
    pires_depassements: depassements
      .sort((x, y) => y.de - x.de)
      .slice(0, PIRES_MONTRES)
      .map(({ de: _de, ...depassement }) => depassement),
  };
}
