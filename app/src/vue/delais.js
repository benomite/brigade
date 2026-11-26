// @ts-check
// Les délais des dernières 24 heures (ticket 4309) : leur vue est dans app/src/vue-delais/ ; vue.js la prend ici, car il
// n'importe que de son dossier (`./`) : la fausse vue des tests (test/aides/fausse-vue.ts) ne remplace que ces imports.
export { tenirLesDelais } from "../vue-delais/delais.js";
