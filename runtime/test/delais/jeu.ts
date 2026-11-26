// Le jeu fixe des tests de #4299 : le ticket 1 mergé 8 minutes après sa prise ; le ticket 2, 25 minutes après,
// avec un renvoi. Les mêmes, en événements et en enregistrements de `temps-tickets.json`, tels que la station les écrit.
export const MAINTENANT = "2026-11-25T12:00:00.000Z";
export const t = (min: number, s = 0) => new Date(Date.UTC(2026, 10, 25, 10, min, s)).toISOString();

export const EVENEMENTS = [
  { ticket: 1, pris: t(0), fusionne: t(8), phases: [{ type: "cook", debut: t(0), fin: t(5) }, { type: "gates", debut: t(5), fin: t(6) }, { type: "review", debut: t(6), fin: t(8) }] },
  {
    ticket: 2,
    pris: t(0),
    fusionne: t(25),
    phases: [
      { type: "cook", debut: t(0), fin: t(10) },
      { type: "gates", debut: t(10), fin: t(15) },
      { type: "review", debut: t(15), fin: t(19) },
      { type: "send-back", debut: t(19), fin: t(22) },
      { type: "wait", debut: t(22), fin: t(25) },
    ],
  },
] as const;

// Un enregistrement de la mesure : déposé 4 minutes avant sa prise, que l'issue porte (`priseAt`).
export const enregistrement = (ticket: number, phases: { nom: string; minutes: number }[]) => {
  const total = phases.reduce((somme, p) => somme + p.minutes, 0);
  return { ticket, depuis: t(0), claimedAt: t(5), priseAt: t(4), mergedAt: t(total), cuisson: 0, cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0, phases };
};

export const ENREGISTREMENTS = [
  enregistrement(1, [{ nom: "claim wait", minutes: 4 }, { nom: "cooking", minutes: 5 }, { nom: "gates", minutes: 1 }, { nom: "review", minutes: 2 }]),
  enregistrement(2, [{ nom: "qualification wait", minutes: 1 }, { nom: "claim wait", minutes: 3 }, { nom: "cooking", minutes: 10 }, { nom: "CI", minutes: 5 }, { nom: "review", minutes: 4 }, { nom: "send-back", minutes: 3 }, { nom: "pass wait", minutes: 2 }, { nom: "merge", minutes: 1 }]),
];
