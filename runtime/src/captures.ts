// Les captures d'une livraison d'interface : l'écran avant et après le
// changement, que le cook design prend avec l'outil de `scripts/capture-ecran/`
// et commite sur sa branche. La station les lit dans les fichiers que la
// livraison change, les montre dans le corps de la PR et sur le ticket, et les
// range au journal (`cook.reported`) : la carte du ticket, dans l'app, les lit
// dans `facts`. Une livraison d'interface qui n'en porte pas — ou dont un
// écran n'a que l'une des deux — est incomplète, et c'est dit partout où elle
// se montre. Un ticket qui n'est pas d'interface n'a pas de captures : rien
// n'en est dit.
//
// ── Où le cook les pose ──
//
//     docs/captures/<ticket>/<écran>-avant.png
//     docs/captures/<ticket>/<écran>-apres.png
//
// - `<écran>` nomme l'écran et l'état qu'elle montre (`fiche`, `rail-vide`) ;
//   il apparie les deux captures d'un même écran. Seul, `avant.png` est celle
//   d'un écran sans nom.
// - `avant` et `apres` se lisent sans égard à la casse ni aux accents
//   (`APRÈS.png`), séparés du nom par un tiret, un point, un souligné ou une
//   espace.
// - Seuls les PNG posés directement dans le dossier du ticket comptent ; un
//   autre fichier y est ignoré.
//
// Sans E/S : la station donne les fichiers changés, le dépôt et le commit.
import { LABEL_COOK_DESIGN, toucheLaVue } from "./calibration.ts";
import type { Evenement } from "./evenements.ts";
import { possede } from "./zones.ts";

export const DOSSIER_CAPTURES = "docs/captures";

// Le dossier où le cook pose les captures d'un ticket.
export const dossierDesCaptures = (ticket: number) => `${DOSSIER_CAPTURES}/${ticket}`;

// Les deux captures d'un écran, par leur chemin dans le dépôt. Nulle : le cook
// ne l'a pas livrée.
export type ScreenCaptures = { screen: string; before: string | null; after: string | null };

// Ce que le journal garde des captures d'une livraison d'interface : le commit
// poussé qui les porte, et chaque écran. `screens` vide : aucune capture.
export type Captures = { sha: string; screens: ScreenCaptures[] };

// Un ticket d'interface touche la vue de l'app : sa zone, à la prise, la
// touche, ou le manager l'a désigné pour le cook design (`cook:design`).
export function estDInterface(ticket: { zone: string[]; labels: readonly string[] | null }): boolean {
  return toucheLaVue(ticket.zone) || (ticket.labels?.includes(LABEL_COOK_DESIGN) ?? false);
}

// La zone que le ticket portait la dernière fois qu'il a été pris, lue dans son
// histoire. C'est elle qui juge la livraison, pas celle du jour : le cook tourne
// sous le compte du service, et peut éditer la fiche de son propre ticket.
export function zoneALaPrise(histoire: readonly Evenement[]): string[] {
  let zone: string[] = [];
  let prise: string[] = [];
  for (const evenement of histoire) {
    if (evenement.type === "ticket.arrived" || evenement.type === "ticket.changed") zone = evenement.payload.card?.zone ?? [];
    else if (evenement.type === "ticket.taken") prise = zone;
  }
  return prise;
}

const sansAccents = (texte: string) => texte.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const MOMENT = /^(.*?)[-_. ]*(avant|apres)$/;

// Les captures que la livraison d'un ticket change, écran par écran, dans
// l'ordre de leur nom. Une capture livrée deux fois pour le même écran et le
// même moment (`fiche-avant.png`, `Fiche-AVANT.png`) : la première dans
// l'ordre du dépôt l'emporte.
export function capturesLivrees(ticket: number, changes: readonly string[]): ScreenCaptures[] {
  const dossier = dossierDesCaptures(ticket);
  const screens = new Map<string, ScreenCaptures>();
  for (const chemin of [...changes].sort()) {
    if (!possede(dossier, chemin)) continue;
    const nom = chemin.slice(dossier.length + 1);
    if (nom.includes("/") || !/\.png$/i.test(nom)) continue;
    const [, screen = "", moment] = MOMENT.exec(sansAccents(nom.slice(0, -".png".length))) ?? [];
    if (moment === undefined) continue;
    const brut = nom.slice(0, screen.length);
    const sien = screens.get(screen) ?? { screen: brut, before: null, after: null };
    if (moment === "avant") sien.before ??= chemin;
    else sien.after ??= chemin;
    screens.set(screen, sien);
  }
  return [...screens.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, sien]) => sien);
}

// Ce qui manque à une livraison d'interface, en clair — ou null : chaque écran
// a ses deux captures.
export function capturesManquantes(screens: readonly ScreenCaptures[]): string | null {
  if (screens.length === 0) return "aucune capture";
  const manquantes = screens.flatMap(({ screen, before, after }) => {
    const nom = screen === "" ? "de l'écran" : `de \`${screen}\``;
    return before === null ? [`la capture avant ${nom}`] : after === null ? [`la capture après ${nom}`] : [];
  });
  return manquantes.length === 0 ? null : manquantes.join(", ");
}

// L'adresse d'une capture, telle qu'une image la charge : le fichier brut, au
// commit poussé. `blob/…?raw=true` plutôt que `raw.githubusercontent.com` : la
// PR d'un dépôt privé la montre à qui y a accès.
export const adresseDeCapture = (depot: string, sha: string, chemin: string) =>
  `https://github.com/${depot}/blob/${sha}/${chemin.split("/").map(encodeURIComponent).join("/")}?raw=true`;

// Ce que la PR et le ticket disent des captures d'une livraison d'interface :
// chaque écran, son image avant et son image après côte à côte, légendées — et,
// s'il en manque, la livraison dite incomplète, avec ce qui manque et où le
// poser. En Markdown, ligne par ligne.
export function direCaptures(depot: string, ticket: number, { sha, screens }: Captures): string[] {
  const absente = capturesManquantes(screens);
  const image = (chemin: string | null, moment: string, screen: string) => {
    const legende = screen === "" ? moment : `${screen} — ${moment}`;
    return chemin === null ? `_${legende} : manquante_` : `![${legende}](${adresseDeCapture(depot, sha, chemin)})<br>${legende}`;
  };
  return [
    "### Captures",
    "",
    ...(absente === null
      ? []
      : [
          `> **Livraison incomplète : captures manquantes** — ${absente}. Un ticket d'interface montre chaque écran qu'il change avant et après : \`${dossierDesCaptures(ticket)}/<écran>-avant.png\` et \`${dossierDesCaptures(ticket)}/<écran>-apres.png\`, prises avec \`scripts/capture-ecran/\` et commitées sur la branche.`,
          "",
        ]),
    ...screens.flatMap(({ screen, before, after }) => [
      ...(screen === "" ? [] : [`**Écran \`${screen}\`**`, ""]),
      "| Avant | Après |",
      "| --- | --- |",
      `| ${image(before, "avant", screen)} | ${image(after, "après", screen)} |`,
      "",
    ]),
  ];
}

// Les captures d'une livraison, pour un programme (`facts`) : `complet`, chaque
// écran a ses deux captures ; `ecrans`, chacun avec l'adresse de sa capture
// avant et de sa capture après — nulle, le cook ne l'a pas livrée.
export type CapturesVues = { complet: boolean; ecrans: Array<{ ecran: string; avant: string | null; apres: string | null }> };

export function capturesVues(depot: string, { sha, screens }: Captures): CapturesVues {
  const adresse = (chemin: string | null) => (chemin === null ? null : adresseDeCapture(depot, sha, chemin));
  return { complet: capturesManquantes(screens) === null, ecrans: screens.map(({ screen, before, after }) => ({ ecran: screen, avant: adresse(before), apres: adresse(after) })) };
}

// Les captures telles que le journal les porte, ou null si elles ne s'y lisent
// pas : un journal se relit tel qu'il a été écrit, et rien n'y est complété.
export function lireCaptures(brut: unknown): Captures | null {
  const lu = (brut ?? {}) as { sha?: unknown; screens?: unknown };
  if (typeof lu.sha !== "string" || lu.sha === "" || !Array.isArray(lu.screens)) return null;
  const chemin = (valeur: unknown) => (typeof valeur === "string" && valeur !== "" ? valeur : null);
  const screens = lu.screens.flatMap((screen: { screen?: unknown; before?: unknown; after?: unknown } | null) =>
    typeof screen?.screen === "string" ? [{ screen: screen.screen, before: chemin(screen.before), after: chemin(screen.after) }] : [],
  );
  return screens.length === lu.screens.length ? { sha: lu.sha, screens } : null;
}
