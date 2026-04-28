import Antlion from './antlion/Antlion.js';
import Scene from './antlion/Scene.js';
import ThousandApp from './ThousandApp.js';

const antlion = new Antlion();
const scene = new Scene(antlion, document.getElementById('app'));
new ThousandApp(antlion, scene).init();
scene.start();
antlion.start();
