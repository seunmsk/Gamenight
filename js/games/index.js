import jollof from './jollof.js';
import actam from './actam.js';
import naija from './naija.js';
import whogo from './whogo.js';
import nalie from './nalie.js';
import whot from './whot.js';
import ludo from './ludo.js';
import draw from './draw.js';
import pikin from './pikin.js';
import ayo from './ayo.js';

export const ORDER = [jollof, actam, naija, whogo, nalie, whot, ludo, draw, pikin, ayo];
export const GAMES = Object.fromEntries(ORDER.map(g => [g.id, g]));
