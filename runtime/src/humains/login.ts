// Un compte GitHub tel que GitHub en accepte : lettres, chiffres et tirets
// isolés, 39 caractères au plus, sans tiret au bord. Les réglages du projet
// s'en servent pour le chef et pour ses humains (`humains.ts`).
export const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
