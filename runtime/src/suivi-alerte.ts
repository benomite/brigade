// Une alerte de mesure par cause, pas par occurrence (#3613). Tant que la dérive
// dure, l'issue ouverte se met à jour : la dernière valeur, les précédentes, la
// tendance et la raison de tête d'aujourd'hui. Les valeurs passées vivent dans
// des marques cachées de l'issue elle-même (une par mesure), que la station relit
// à chaque mise à jour : aucune mémoire hors de GitHub. Les règles de qualité
// (`alerte-qualite.ts`) et du temps perdu (`temps-max/correction.ts`) l'appellent.

const DEBUT = "<!-- brigade:suivi -->";
const FIN = "<!-- /brigade:suivi -->";
// Combien de valeurs passées le corps garde.
export const VALEURS_GARDEES = 10;
const MARQUE_VALEURS = /<!-- brigade:valeurs (\S+) (\S*) -->/g;

// Une mesure en dérive : sa clé stable, sa valeur du moment, son seuil, ce qui est
// bien (`hautEstBien` : le premier coup monte vers le mieux, le temps perdu descend)
// et la raison de tête aujourd'hui.
export type Mesure = { cle: string; libelle: string; valeur: number; unite: string; seuil: string; hautEstBien: boolean; raison: string | null };
type Valeur = { valeur: number; instant: string };

const SEPARATEUR = "@";
const ecrire = (valeurs: readonly Valeur[]) => valeurs.map((v) => `${v.valeur}${SEPARATEUR}${v.instant}`).join(",");
// Une valeur qui ne se lit pas est écartée : l'historique n'en invente aucune.
const lire = (texte: string): Valeur[] =>
  texte.split(",").flatMap((morceau) => {
    const [valeur, instant] = morceau.split(SEPARATEUR);
    const nombre = Number(valeur);
    return valeur !== undefined && valeur !== "" && instant !== undefined && Number.isFinite(nombre) ? [{ valeur: nombre, instant }] : [];
  });

export function valeursDuCorps(corps: string): Map<string, Valeur[]> {
  const parCle = new Map<string, Valeur[]>();
  for (const [, cle, texte] of corps.matchAll(MARQUE_VALEURS)) parCle.set(cle as string, lire(texte as string));
  return parCle;
}

const nombre = (m: Mesure, valeur: number) => `${valeur}${m.unite}`;

function tendance(m: Mesure, passees: readonly Valeur[]): string {
  const avant = passees.at(-2);
  if (avant === undefined) return "first measure";
  if (m.valeur === avant.valeur) return "unchanged";
  return (m.valeur > avant.valeur) === m.hautEstBien ? "getting better" : "getting worse";
}

function bloc(mesures: readonly Mesure[], historique: Map<string, Valeur[]>, precedente: number | null): string {
  return [
    DEBUT,
    ...mesures.map((m) => `<!-- brigade:valeurs ${m.cle} ${ecrire(historique.get(m.cle) ?? [])} -->`),
    "## Latest measure",
    "",
    ...(precedente === null ? [] : [`Previous alert on this measure: #${precedente} (closed). The drift came back.`, ""]),
    ...mesures.flatMap((m) => {
      const passees = historique.get(m.cle) ?? [];
      const avant = passees.slice(0, -1).slice(-(VALEURS_GARDEES - 1)).reverse();
      return [
        `**${m.libelle}**`,
        `- now: **${nombre(m, m.valeur)}**, against ${m.seuil}`,
        `- previous: ${avant.length === 0 ? "none yet" : avant.map((v) => `${nombre(m, v.valeur)} (${v.instant.slice(0, 16)}Z)`).join(", ")}`,
        `- trend: ${tendance(m, passees)}`,
        `- top reason now: ${m.raison ?? "none recorded"}`,
        "",
      ];
    }),
    FIN,
  ].join("\n");
}

// Le corps avec son bloc de suivi à jour : la valeur du moment s'ajoute à
// l'historique que le corps porte déjà, si elle diffère de la dernière (un tour
// qui mesure la même chose ne réécrit rien). Sans bloc, il s'ajoute à la fin.
// `precedente` : l'alerte fermée que celle-ci reprend, nommée à l'ouverture.
export function corpsSuivi(corps: string, mesures: readonly Mesure[], maintenant: Date, precedente: number | null = null): string {
  const historique = valeursDuCorps(corps);
  for (const m of mesures) {
    const passees = historique.get(m.cle) ?? [];
    if (passees.at(-1)?.valeur !== m.valeur) historique.set(m.cle, [...passees, { valeur: m.valeur, instant: maintenant.toISOString() }].slice(-VALEURS_GARDEES));
  }
  const debut = corps.indexOf(DEBUT);
  const fin = corps.indexOf(FIN);
  const ancienne = debut >= 0 && fin > debut ? /Previous alert on this measure: #(\d+)/.exec(corps.slice(debut, fin))?.[1] : undefined;
  const nouveau = bloc(mesures, historique, precedente ?? (ancienne === undefined ? null : Number(ancienne)));
  if (debut < 0 || fin < debut) return `${corps}\n\n${nouveau}`;
  return corps.slice(0, debut) + nouveau + corps.slice(fin + FIN.length);
}

// Ce que l'issue dit en se fermant : la mesure est repassée sous son seuil.
export const messageDeRetour = (mesures: readonly Mesure[]) =>
  `Back under the threshold: ${mesures.map((m) => `${m.libelle} is ${nombre(m, m.valeur)}, against ${m.seuil}`).join("; ")}. The drift is over, so this alert closes. If it comes back, a new alert opens and links this one.`;
