// @ts-check
// Les délais des dernières 24 heures (ticket 4309, epic 4298), sur la vue du projet : la part des tickets fusionnés dans
// leur temps attendu — « 83 % on time (20/24) » —, puis les pires dépassements, le pire d'abord, chacun avec son numéro,
// son titre, son temps attendu et son temps réel. Un clic sur un dépassement l'ouvre : où son temps est passé — cook,
// gates, review, send-backs, waits —, en minutes ; un second le referme.
//
// La vue n'y calcule rien : l'objet est `delais`, tel que `brigade <project> status --json` le rend et que la station le
// publie dans son suivi, à côté de `temps` (app/src/projets/demande.ts). Absent, illisible ou sans part (`null`) : une
// courte ligne le dit, jamais un chiffre inventé. Ce module ne touche pas `document` : il reçoit de quoi créer un élément.

/** @typedef {import("../vue/briques.js").Fabrique} Fabrique */
/** @typedef {{ cook: number, gates: number, review: number, renvois: number, attentes: number }} Repartition */
/** @typedef {{ ticket: number, titre: string, attendu: number, reel: number, repartition: Repartition | null }} Depassement */
/** @typedef {{ heures: number, fusionnes: number, dansLesTemps: number, part: number, sansTempsAttendu: number, pires: Depassement[] }} Delais */

const SANS_PART = "No ticket merged with an expected time in the last 24 hours.";
// Les cinq parts, dans l'ordre du ticket, avec ce que l'écran en dit.
const PARTS = /** @type {const} */ ([
  ["cook", "Cook"],
  ["gates", "Gates"],
  ["review", "Review"],
  ["renvois", "Send-backs"],
  ["attentes", "Waits"],
]);

/** @param {unknown} x @returns {x is number} */
const nombre = (x) => typeof x === "number" && Number.isFinite(x) && x >= 0;

/** @param {unknown} lu @returns {Repartition | null} */
function lireLaRepartition(lu) {
  const r = /** @type {Record<string, unknown>} */ (lu ?? {});
  return PARTS.every(([cle]) => nombre(r[cle])) ? /** @type {Repartition} */ (r) : null;
}

/** @param {unknown} lu @returns {Depassement[]} */
function lireUnDepassement(lu) {
  const { ticket, titre, attendu_min, reel_min, repartition_min } = /** @type {Record<string, unknown>} */ (lu ?? {});
  if (!nombre(ticket) || typeof titre !== "string" || !nombre(attendu_min) || !nombre(reel_min)) return [];
  return [{ ticket, titre, attendu: attendu_min, reel: reel_min, repartition: lireLaRepartition(repartition_min) }];
}

// L'objet publié, relu : sans part lisible, rien — la vue dit alors qu'il n'y a rien à montrer. Les dépassements
// illisibles sont écartés ; les autres, le pire d'abord (le plus de minutes au-delà de l'attendu).
/** @param {unknown} lu @returns {Delais | null} */
function lireLesDelais(lu) {
  const { fenetre_heures, fusionnes, dans_les_temps, part_dans_les_temps, sans_temps_attendu, pires_depassements } = /** @type {Record<string, unknown>} */ (lu ?? {});
  if (!nombre(part_dans_les_temps) || !nombre(fusionnes) || !nombre(dans_les_temps)) return null;
  const pires = (Array.isArray(pires_depassements) ? pires_depassements : []).flatMap(lireUnDepassement);
  return {
    heures: nombre(fenetre_heures) ? fenetre_heures : 24,
    fusionnes,
    dansLesTemps: dans_les_temps,
    part: part_dans_les_temps,
    sansTempsAttendu: nombre(sans_temps_attendu) ? sans_temps_attendu : 0,
    pires: pires.sort((a, b) => b.reel - b.attendu - (a.reel - a.attendu)),
  };
}

/** @param {Fabrique} doc @param {string} balise @param {string} classe @param {string} texte */
function noeud(doc, balise, classe, texte) {
  const pose = doc.createElement(balise);
  pose.className = classe;
  pose.textContent = texte;
  return pose;
}

/** @param {Fabrique} doc @param {Repartition | null} repartition */
function poserLaRepartition(doc, repartition) {
  if (repartition === null) return noeud(doc, "p", "repartition", "Where its time went is not readable.");
  const liste = doc.createElement("ul");
  liste.className = "repartition";
  for (const [cle, nom] of PARTS) liste.append(noeud(doc, "li", "", `${nom}: ${repartition[cle]} min`));
  return liste;
}

// Les délais tenus d'une pose à l'autre : les dépassements ouverts restent ouverts quand la vue se repose.
/** @param {Fabrique} doc */
export function tenirLesDelais(doc) {
  /** @type {Set<string>} */
  const ouverts = new Set();
  /** @param {string} projet @param {unknown} lu */
  function poser(projet, lu) {
    const bloc = doc.createElement("section");
    bloc.className = "bloc-du-projet delais";
    bloc.dataset.bloc = "delais";
    const d = lireLesDelais(lu);
    bloc.append(noeud(doc, "h3", "", `Last ${d?.heures ?? 24} hours`));
    if (d === null) {
      bloc.append(noeud(doc, "p", "sans-part", SANS_PART));
      return bloc;
    }
    const sans = d.sansTempsAttendu === 0 ? "" : ` · ${d.sansTempsAttendu} without an expected time`;
    bloc.append(noeud(doc, "p", "part", `${Math.round(d.part * 100)} % merged within their expected time (${d.dansLesTemps}/${d.fusionnes})${sans}`));
    if (d.pires.length === 0) return bloc;
    const liste = doc.createElement("ul");
    liste.className = "pires";
    for (const pire of d.pires) {
      const cle = `${projet}#${pire.ticket}`;
      const rangee = doc.createElement("li");
      const bouton = noeud(doc, "button", "depassement", `#${pire.ticket} ${pire.titre} — expected ${pire.attendu} min, took ${pire.reel} min`);
      bouton.type = "button";
      const montrer = () => {
        bouton.ariaExpanded = String(ouverts.has(cle));
        rangee.replaceChildren(bouton, ...(ouverts.has(cle) ? [poserLaRepartition(doc, pire.repartition)] : []));
      };
      bouton.addEventListener("click", () => {
        if (ouverts.has(cle)) ouverts.delete(cle);
        else ouverts.add(cle);
        montrer();
      });
      montrer();
      liste.append(rangee);
    }
    bloc.append(liste);
    return bloc;
  }
  return { poser };
}
