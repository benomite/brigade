// Les tokens d'un ticket au relevé : la somme de ses lancements, la médiane par
// calibrage et le plus cher de la tranche. Le journal est écrit à la main.
import assert from "node:assert/strict";
import { test } from "node:test";
import { decrireReleve, trancher } from "../src/mesures.ts";
import type { CookMesure, Livraison } from "../src/projections/mesures.ts";
import { JOUR_HORLOGE } from "./outils.ts";

const cook = (calibration: string | null, tokens: number | null): CookMesure => ({ calibration, turns: 5, durationMs: 1000, tokens });
const livraison = (ticket: number | null, cooks: CookMesure[]): Livraison => ({ ticket, at: `${JOUR_HORLOGE}T10:00:00.000Z`, measures: {}, state: {}, gatesS: null, cooks });

test("les tokens d'un ticket sont la somme de ses lancements, comptés une fois, sous son dernier calibrage", () => {
  const [tranche] = trancher([livraison(7, [cook("sonnet/low", 100), cook("sonnet/low", 250), cook("opus/high", 400)])]);

  assert.deepEqual([...(tranche?.tokens ?? [])], [["opus/high", { mediane: 750, tickets: 1, plusCher: { ticket: 7, tokens: 750 } }]]);
});

test("la médiane et le plus cher de la tranche se disent par calibrage, avec le numéro du ticket", () => {
  const [tranche] = trancher([
    livraison(1, [cook("sonnet/medium", 1000)]),
    livraison(2, [cook("sonnet/medium", 500), cook("sonnet/medium", 4500)]),
    livraison(3, [cook("sonnet/medium", 3000)]),
    livraison(4, [cook("opus/high", 20_000)]),
    livraison(5, [cook("sonnet/medium", null)]),
    livraison(null, [cook(null, 99_999)]),
  ]);

  assert.deepEqual(
    [...(tranche?.tokens ?? [])].sort(),
    [
      ["opus/high", { mediane: 20_000, tickets: 1, plusCher: { ticket: 4, tokens: 20_000 } }],
      ["sonnet/medium", { mediane: 3000, tickets: 3, plusCher: { ticket: 2, tokens: 5000 } }],
    ],
  );
});

test("le relevé affiche les tokens à côté des tours, et dit qu'il n'y a rien à mesurer sans cook exité", () => {
  const lignes = decrireReleve({ projet: "brigade", livraisons: [livraison(2, [cook("sonnet/medium", 500), cook("sonnet/medium", 4500)]), livraison(3, [cook("sonnet/medium", 3000)])], seuils: null }, 2);
  const i = lignes.findIndex((ligne) => ligne.startsWith("tokens"));

  assert.deepEqual(lignes.slice(i, i + 3), [
    "tokens     d'un ticket, médiane par calibrage (entre parenthèses : sur combien de tickets), et le plus cher de la tranche",
    "merges  sonnet/medium",
    "1-2     4\u202f000 (2) · max #2 5\u202f000",
  ]);

  const vide = decrireReleve({ projet: "brigade", livraisons: [livraison(1, [])], seuils: null });
  assert.ok(vide.includes("tokens     rien à mesurer : aucun cook calibré, ou sans tokens connus, derrière ces merges"));
});
