// L'admission à la charge (#4210, épique #4110) : avant de lancer un cook ou
// une gate, la station mesure la machine et ne l'admet que s'il lui reste de
// la place. Le 2026-11-23, une trentaine de tickets déposés en quelques heures
// ont fait partir leurs cooks l'un derrière l'autre, leurs gates en parallèle :
// la box a tenu une charge de 27 sur 8 cœurs, et les gates sont passées au
// rouge. Le premier cook partait toujours, quelle que soit la charge
// (`machineAcourt`, `garde-fous.ts`) : ici, une machine chargée ne l'admet pas.
//
// Deux bornes, toutes deux tirées de la machine mesurée, jamais du rail :
// - le plafond d'unités concurrentes, celui des cœurs (`plafondDesCoeurs`) ;
// - la charge tolérée par cœur, celle des seuils de la machine (`machine.ts`,
//   `BRIGADE_MAX_LOAD_PER_CORE`).
// Ce qui n'est pas admis reste sur le rail : l'appelant le redemande au tour
// suivant, et il part quand la capacité revient.
import { configMachine, type Machine } from "../machine.ts";
import { plafondDesCoeurs } from "../projections/stations.ts";

type Unite = "cook" | "gate";

type DemandeDAdmission = {
  genre: Unite;
  // Les unités qui tournent déjà.
  enCours: number;
  // La charge et les cœurs de la machine, lus à chaque demande : injectable,
  // que les tests la simulent.
  lireMachine: () => Pick<Machine, "charge" | "coeurs">;
  // Où se dit un report.
  avertir: (ligne: string) => void;
  // La charge tolérée par cœur ; par défaut, celle de la machine (`configMachine`).
  chargeParCoeur?: number;
};

// `raison` : ce qui fait attendre l'unité, null quand elle est admise.
type Admission = { admis: boolean; raison: string | null };

// Combien d'unités tournent à la fois au plus, sur une machine de `coeurs` cœurs.
export const plafondAdmis = (coeurs: number): number => plafondDesCoeurs(coeurs);

const nombre = (valeur: number) => valeur.toLocaleString("en-US", { maximumFractionDigits: 1 });

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Admet une unité de plus, ou dit pourquoi elle attend. Une machine qui ne se
// lit pas n'admet rien : rien ne dit qu'elle ait la place.
export function admettre({ genre, enCours, lireMachine, avertir, chargeParCoeur = configMachine({}).chargeParCoeur }: DemandeDAdmission): Admission {
  const refuser = (raison: string): Admission => {
    avertir(`brigade : admission deferred — a new ${genre} waits on the rail: ${raison}`);
    return { admis: false, raison };
  };
  let machine: Pick<Machine, "charge" | "coeurs">;
  try {
    machine = lireMachine();
  } catch (erreur) {
    return refuser(`the machine's load could not be read (${message(erreur)})`);
  }
  const { charge, coeurs } = machine;
  const limite = chargeParCoeur * coeurs;
  if (charge > limite) return refuser(`load of ${nombre(charge)} on ${coeurs} cores, for at most ${nombre(limite)}`);
  const plafond = plafondAdmis(coeurs);
  if (enCours >= plafond) return refuser(`${enCours} running, for at most ${plafond} on ${coeurs} cores`);
  return { admis: true, raison: null };
}
