// Le temps de chaque ticket mergé, de sa prise (« Taken by station ») à son merge (#4299, épique #4298) :
// sur les dernières 24 heures, la part des tickets mergés en 10 minutes ou moins et la médiane de ce temps ;
// pour un ticket, ce temps partagé en cook, gates, review, renvois et attentes. Fonctions pures : la lecture
// des événements est `evenements.ts`, la ligne `ligne.ts`, le commentaire des tickets lents `commenter.ts`.

export const SEUIL_MIN = 10;
const FENETRE_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60_000;

const PARTS = ["cook", "gates", "review", "send-back", "wait"] as const;
export type Part = (typeof PARTS)[number];

// Un ticket mergé : sa prise et son merge (ISO), et ses phases, qui pavent la prise au merge. Le type d'une phase
// est une des cinq parts ; un autre compte pour une attente.
export type Phase = { type: string; debut: string; fin: string };
export type Evenement = { ticket: number; pris: string; fusionne: string; phases: readonly Phase[] };

// Sur la fenêtre : combien de tickets mergés, la part (0 à 1) de ceux mergés en 10 minutes ou moins, et la
// médiane de leur temps, en minutes ; `part` et `medianeMin` sont null sans ticket mergé.
export type MesureDesDelais = { nombre: number; part: number | null; medianeMin: number | null };

const duree = (e: Evenement) => Date.parse(e.fusionne) - Date.parse(e.pris);

// Les tickets mergés dans les 24 heures qui finissent à `maintenant`, avec un temps lisible.
export function dansLaFenetre(evenements: readonly Evenement[], maintenant: string): Evenement[] {
  const fin = Date.parse(maintenant);
  return evenements.filter((e) => {
    const fusionne = Date.parse(e.fusionne);
    return fusionne <= fin && fusionne >= fin - FENETRE_MS && duree(e) >= 0;
  });
}

export const estLent = (e: Evenement) => duree(e) > SEUIL_MIN * MINUTE_MS;

export function mesurerLesDelais({ evenements, maintenant }: { evenements: readonly Evenement[]; maintenant: string }): MesureDesDelais {
  const durees = dansLaFenetre(evenements, maintenant)
    .map((e) => duree(e) / MINUTE_MS)
    .sort((a, b) => a - b);
  const nombre = durees.length;
  if (nombre === 0) return { nombre, part: null, medianeMin: null };
  const milieu = nombre >> 1;
  const medianeMin = nombre % 2 === 1 ? (durees[milieu] as number) : ((durees[milieu - 1] as number) + (durees[milieu] as number)) / 2;
  return { nombre, part: durees.filter((d) => d <= SEUIL_MIN).length / nombre, medianeMin };
}

// Le temps du ticket et chaque part, en minutes au dixième. Les phases sont coupées à la prise et au merge ;
// ce qu'aucune phase ne couvre est une attente. Les dixièmes se répartissent au plus fort reste : la somme
// des parts est le temps du ticket, au dixième.
export function decomposer(e: Evenement): { totalMin: number; parts: Record<Part, number> } {
  const pris = Date.parse(e.pris);
  const fusionne = Date.parse(e.fusionne);
  const ms = Object.fromEntries(PARTS.map((p) => [p, 0])) as Record<Part, number>;
  for (const phase of e.phases) {
    const debut = Math.max(pris, Date.parse(phase.debut));
    const fin = Math.min(fusionne, Date.parse(phase.fin));
    const part = (PARTS as readonly string[]).includes(phase.type) ? (phase.type as Part) : "wait";
    if (fin > debut) ms[part] += fin - debut;
  }
  const couvert = PARTS.reduce((somme, p) => somme + ms[p], 0);
  ms.wait += Math.max(0, fusionne - pris - couvert);
  const totalMs = PARTS.reduce((somme, p) => somme + ms[p], 0);
  const dixiemes = (v: number) => (v * 10) / MINUTE_MS;
  const total = Math.round(dixiemes(totalMs));
  const parts = Object.fromEntries(PARTS.map((p) => [p, Math.floor(dixiemes(ms[p]))])) as Record<Part, number>;
  const parReste = [...PARTS].sort((a, b) => dixiemes(ms[b]) - Math.floor(dixiemes(ms[b])) - (dixiemes(ms[a]) - Math.floor(dixiemes(ms[a]))));
  let manque = total - PARTS.reduce((somme, p) => somme + parts[p], 0);
  for (const p of parReste) {
    if (manque <= 0) break;
    parts[p] += 1;
    manque -= 1;
  }
  return { totalMin: total / 10, parts: Object.fromEntries(PARTS.map((p) => [p, parts[p] / 10])) as Record<Part, number> };
}
