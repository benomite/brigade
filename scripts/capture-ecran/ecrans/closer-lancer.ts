// Settings → Closer de « parade », « Launch a cleanup… » cliqué (#991) : la confirmation, d'après
// l'aperçu que la box rend (`closing preview --json`, runtime/src/fermeture-action/apercu.ts) — ce
// que le nettoyage coûte, en une ligne, ce que le closer va faire, ce que deviendrait la demande, et
// le « oui », sans lequel rien ne part.
import type { Apercu } from "../../../app/src/closer-lancement.ts";
import { ecran as closer } from "./closer.ts";
import type { Ecran } from "./commun.ts";

export const APERCU: Apercu = {
  configured: true,
  cost: { model: "sonnet", effort: "medium", maxTokens: 500_000, maxRemovedLines: 500, startsBelowCooks: 1, text: "closer on `sonnet` / `medium` · starts under 1 cook in flight · 500,000 tokens at most · 500 lines removed at most" },
  does: [
    "it fetches the integration branch and replays the observation: the duplicate code blocks and dead exports it spots are its candidates, 40 at most",
    "it leaves alone what a cook in flight or a ticket in pass holds, and no cook starts on what it holds while it tidies up",
    "it removes what it is sure of, on its own branch, and says why it left each candidate it did not remove",
    "it merges nothing and never pushes onto the integration branch: it opens one PR, handed to the pass, which judges and merges it like any delivery",
    "it stops at its caps — 500,000 tokens, 500 lines removed — like any cook at idleness, duration and turns, and at the chef's “stop”: stopped, it delivers nothing",
  ],
  request: { state: "none" },
  ifRequested: { outcome: "leaves", reason: null, text: "a request would leave within the second — start condition met: 0 cooks in flight for a threshold of 1, rail empty" },
};

export const ecran: Ecran = {
  ...closer,
  dit: "Settings → Closer de « parade », « Launch a cleanup… » cliqué : la confirmation — le prix, ce que le closer va faire, et le « oui »",
  etapes: [...(closer.etapes ?? []), { cliquer: ".closer-lancement button.recommande" }],
  donnees: () => {
    const donnees = closer.donnees();
    return { ...donnees, reponses: { ...donnees.reponses, closer: { apercu: APERCU } } };
  },
};
