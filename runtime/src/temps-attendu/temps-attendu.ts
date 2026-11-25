// Le temps attendu d'un ticket (#4307) : la troisième valeur du calibrage, à
// côté du modèle et de l'effort — les minutes dans lesquelles le chef veut le
// voir mergé, au prix de ce qu'il change. Le manager la pose à chaque ticket de
// son découpage (`temps_attendu`) ; elle part sur l'issue en label
// `attendu:<minutes>` et se montre avec le modèle et l'effort. Sans E/S.

// Un entier de minutes, de 1 à 120.
const MINUTES_MIN = 1;
const MINUTES_MAX = 120;
// La plupart des tickets tiennent en 10 minutes ou moins : au-delà, le
// `calibrage` dit pourquoi.
const MINUTES_SANS_RAISON = 10;

// Ce qui, dans un `calibrage`, donne une raison : un mot de cause, en anglais
// (la langue du texte GitHub) ou en français.
const RAISON = /\b(because|since|given|so|car|donc)\b|\b(parce qu|puisqu|vu qu)/i;

// La ligne de la consigne de découpage qui fait poser `temps_attendu`. Courte :
// la consigne part en un seul argument, et sous Windows le faux `claude` des
// tests, lancé par le bash de Git, en a perdu la fin — la réponse du chef —
// passé 8 192 caractères environ (CI de #4307).
export const CONSIGNE_TEMPS_ATTENDU = `\`temps_attendu\` : minutes (entier, ${MINUTES_MIN} à ${MINUTES_MAX}) pour merger le ticket : ~2 pour un texte ou un titre, ~10 pour une feature contenue, ~60 au plus pour reprendre un système central ; la plupart ≤ ${MINUTES_SANS_RAISON}. Au-delà, ton \`calibrage\` dit pourquoi.`;

// Les minutes lues de `temps_attendu`, ou ce qui les fait refuser.
// `calibrage` : le texte qui doit dire pourquoi un ticket dépasse 10 minutes.
export function lireTempsAttendu(brut: unknown, calibrage: string): { minutes: number } | { refus: string } {
  if (!Number.isInteger(brut) || (brut as number) < MINUTES_MIN || (brut as number) > MINUTES_MAX) {
    return { refus: `temps_attendu ${JSON.stringify(brut) ?? "missing"} — expected a whole number of minutes from ${MINUTES_MIN} to ${MINUTES_MAX}` };
  }
  const minutes = brut as number;
  if (minutes > MINUTES_SANS_RAISON && !RAISON.test(calibrage)) {
    return { refus: `temps_attendu ${minutes} is above ${MINUTES_SANS_RAISON} minutes, and \`calibrage\` gives no reason for it — say why (“because …”)` };
  }
  return { minutes };
}

export function labelAttendu(minutes: number): string {
  return `attendu:${minutes}`;
}

// Le calibrage tel qu'il se montre : `sonnet` / `medium` / `10 min`. Un
// ticket né avant #4307 n'a pas de temps attendu : il n'en montre aucun.
export function texteDuCalibrage(model: string, effort: string, minutes?: number): string {
  return [model, effort, ...(minutes === undefined ? [] : [`${minutes} min`])].map((valeur) => `\`${valeur}\``).join(" / ");
}

// Le temps attendu de tickets joints en un seul : la somme des leurs, bornée
// à 120. Inconnu dès que l'un ne le porte pas.
export function tempsJoint(minutes: (number | undefined)[]): number | undefined {
  if (minutes.some((valeur) => valeur === undefined)) return undefined;
  return Math.min(MINUTES_MAX, (minutes as number[]).reduce((somme, valeur) => somme + valeur, 0));
}
