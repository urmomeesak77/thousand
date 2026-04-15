import Antlion from './antlion/Antlion.js';
import ThousandApp from './ThousandApp.js';

const antlion = new Antlion();
new ThousandApp(antlion).init();
antlion.start();
