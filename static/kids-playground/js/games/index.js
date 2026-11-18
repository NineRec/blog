// Every game on the home screen, in groups and in order.
import hair from './hair.js';
import nails from './nails.js';
import facial from './facial.js';
import makeup from './makeup.js';
import dressup from './dressup.js';
import spa from './spa.js';
import cake from './cake.js';
import coloring from './coloring.js';
import logic from './logic.js';
import icecream from './icecream.js';
import feed from './feed.js';
import puzzle from './puzzle.js';
import memory from './memory.js';
import seek from './seek.js';
import maze from './maze.js';
import catcher from './catch.js';

export const GROUPS = [
  { name: '美美沙龙', games: [hair, nails, facial, makeup, dressup, spa] },
  { name: '游乐园', games: [cake, coloring, logic, icecream, feed, puzzle, memory, seek, maze, catcher] },
];
export const GAMES = GROUPS.flatMap((g) => g.games);
