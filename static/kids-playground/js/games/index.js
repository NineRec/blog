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
  { id: 'salon', name: '美美沙龙', collection: true, games: [facial, hair, makeup, nails, dressup] },
  { name: '游乐园', games: [spa, cake, coloring, logic, icecream, feed, puzzle, memory, seek, maze, catcher] },
];
for (const g of GROUPS[0].games) g.salon = true;     // these go back to the salon lobby, not the home screen
export const SALON = GROUPS[0].games;
export const GAMES = GROUPS.flatMap((g) => g.games);
