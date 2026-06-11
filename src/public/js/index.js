import Antlion from './antlion/Antlion.js';
import Scene from './antlion/Scene.js';
import ThousandApp from './core/ThousandApp.js';
import I18n from './i18n/I18n.js';
import { LanguagePreferenceStore } from './i18n/LanguagePreferenceStore.js';

const antlion = new Antlion();
// i18n must exist before any screen renders so the first paint already uses
// the stored/detected language (FR-007/FR-008).
const i18n = new I18n({
  antlion,
  preferenceStore: new LanguagePreferenceStore(),
  navigatorLanguages: navigator.languages,
});
const scene = new Scene(antlion, document.getElementById('app'));
new ThousandApp(antlion, scene, i18n).init();
scene.start();
antlion.start();
