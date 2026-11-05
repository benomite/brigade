// @ts-check
// Le menu de la page d'un projet (ticket 2485, épique 2484) : Rail · Stations · Kitchen · Settings. Kitchen a deux
// sous-onglets, Health et Cooks. Rail, Stations et Kitchen sont les onglets que le projet retient ; Settings s'ouvre
// par-dessus, comme une page. Ce module ne touche pas `document` : la vue pose les boutons.

export const RAIL = "rail";
export const STATIONS = "stations";
export const KITCHEN = "kitchen";
export const SANTE = "sante";
export const COOKS = "cooks";

// Les entrées du menu qui sont des onglets, dans l'ordre ; Settings vient après, de la vue.
export const MENU = [
  { id: RAIL, titre: "Rail" },
  { id: STATIONS, titre: "Stations" },
  { id: KITCHEN, titre: "Kitchen" },
];
export const TITRE_DE_SETTINGS = "Settings";
export const SOUS_ONGLETS_DE_LA_CUISINE = [
  { id: SANTE, titre: "Health" },
  { id: COOKS, titre: "Cooks" },
];

/** @param {unknown} id */
export const dansLaCuisine = (id) => id === SANTE || id === COOKS;

// L'entrée du menu que l'onglet montré marque : Health et Cooks sont tous deux sous Kitchen.
/** @param {string} id */
export const entreeDe = (id) => (dansLaCuisine(id) ? KITCHEN : id);

// L'onglet que le clic sur une entrée ouvre : Kitchen rouvre le sous-onglet où le chef l'avait laissé, Health au début.
/** @param {string} entree @param {string} [dernierDeLaCuisine] */
export const ouvreAvec = (entree, dernierDeLaCuisine) => (entree === KITCHEN ? (dansLaCuisine(dernierDeLaCuisine) ? /** @type {string} */ (dernierDeLaCuisine) : SANTE) : entree);
