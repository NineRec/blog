/* The two puzzle games (connect the friends, match two of a kind), their synthesized sound effects,
 * and the full-screen multi-wave confetti. Chromium uses native touch events; WebKit uses native taps and mouse drags.
 * BASE_URL targets a deployed copy; BROWSER=webkit selects Safari's engine. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'../static'),output=fs.mkdtempSync(path.join(os.tmpdir(),'zoey-puzzle-'));
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.m4a':'audio/mp4'};
const server=http.createServer((req,res)=>{let file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
const name=process.env.BROWSER||'chromium';
async function gesture(page,points){if(name==='chromium'){const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...points[0],id:1}]});for(const p of points.slice(1)){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...p,id:1}]});await page.waitForTimeout(17);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}else{await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();for(const p of points.slice(1))await page.mouse.move(p.x,p.y);await page.mouse.up();}}
const centre=async(page,selector)=>{const r=await page.locator(selector).boundingBox();return{x:r.x+r.width/2,y:r.y+r.height/2};};
async function dragTo(page,from,to){const a=await centre(page,from),b=to.x===undefined?await centre(page,to):to;await gesture(page,Array.from({length:14},(_,i)=>({x:a.x+(b.x-a.x)*i/13,y:a.y+(b.y-a.y)*i/13})));}
const data=(page,key)=>page.locator('#new-game').getAttribute('data-'+key);
const phase=(page,value,timeout=20000)=>page.waitForFunction(v=>document.getElementById('new-game').dataset.phase===v,value,{timeout});
const requested=page=>page.evaluate(()=>SoundFX.stats.requested.slice());
const tile=(pair,side)=>`.pz-tile[data-pair="${pair}"][data-side="${side}"]`;

(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=process.env.BASE_URL||`http://127.0.0.1:${server.address().port}/butterfly-adventure/`,origin=new URL(base).origin;
 const browser=await(name==='webkit'?webkit:chromium).launch(),errors=[],failed=[],external=[];
 try{
 const context=await browser.newContext({viewport:{width:1194,height:834},hasTouch:true,isMobile:true});
 const page=await context.newPage();
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin)return route.continue();if(u.hostname==='static.cloudflareinsights.com')return route.abort();external.push(u.href);return route.abort();});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/SVG|path.*attribute|NaN|undefined|TypeError/i.test(m.text()))errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
 const open=async(game,extra='')=>{await page.goto(base+`play.html?game=${game}${extra}`);await page.locator(`body[data-game=${game}]`).waitFor();await page.locator('#sound-toggle').tap();await page.waitForFunction(()=>!document.getElementById('sound-start'));};

 /* ---------- the hub ---------- */
 await page.goto(base);assert.equal(await page.locator('.game-door').count(),12);
 const hrefs=await page.locator('.game-door').evaluateAll(es=>es.map(e=>e.getAttribute('href').replace('play.html?game=','')));
 assert.deepEqual(hrefs.slice(0,6),['garden','zoo','sea','seedling','connect','match'],'the two new games follow 挖呀种花园');
 for(const art of['connect','match','icecream','letters'])assert.ok(await page.locator(`[data-art=${art}]>svg`).count()===1&&await page.locator(`[data-art=${art}]`).evaluate(e=>e.getBoundingClientRect().width>80));
 await page.screenshot({path:path.join(output,`${name}-hub.png`)});
 console.log('PASS twelve doors, connect and match come right after 挖呀种花园, each with its own picture');

 /* ---------- every sound effect renders, is audible, and never clips ---------- */
 await open('connect');
 const sounds=await page.evaluate(async()=>{const out=[];for(const n of SoundFX.names)out.push(await SoundFX.render(n));return out;});
 const expected=['tap','pick','drop','link','boing','pop','match','shuffle','star','chomp','siren','sizzle','splash','twinkle','flutter','bounce','moo','party','fanfare','scoop','bell','sprinkle','crunch'];
 for(const n of expected)assert.ok(sounds.some(s=>s.name===n),`sound ${n} exists`);
 for(const s of sounds){assert.ok(s.peak>.04,`${s.name} is audible (peak ${s.peak.toFixed(3)})`);assert.ok(s.peak<=1,`${s.name} does not clip (${s.peak})`);assert.ok(s.rms>.003,`${s.name} has body`);assert.ok(s.seconds>.04&&s.seconds<(s.name==='fanfare'?2.9:1.6),`${s.name} is short (${s.seconds.toFixed(2)}s)`);}
 console.log(`PASS ${sounds.length} synthesized sound effects render offline: audible, unclipped, short`);

 /* ---------- connect: shadows, colours, numbers and halves; drag or tap; themed sounds ---------- */
 assert.equal(await page.locator('.pz-tile').count(),6);assert.equal(await page.locator('.pz-tile[data-side=a]').count(),3);
 const sets=[];
 const readPairs=async()=>(await data(page,'pairs')).split(',');
 const partner=(pair,side)=>tile(pair,side);
 async function solve(pairs,style){
  // style cycles: left-to-right drag, tap-tap, right-to-left drag
  for(const [i,pair] of pairs.entries()){
   const mode=(style+i)%3;
   if(mode===0)await dragTo(page,partner(pair,'a'),partner(pair,'b'));
   else if(mode===1){await page.locator(partner(pair,'b')).tap();assert.ok(await page.locator(partner(pair,'b')).evaluate(e=>e.classList.contains('is-selected')));await page.locator(partner(pair,'a')).tap();}
   else await dragTo(page,partner(pair,'b'),partner(pair,'a'));
   await page.waitForFunction(n=>Number(document.getElementById('new-game').dataset.connected)===n,i+1,{timeout:5000});
  }
 }
 // first round: refusals before the real thing
 let pairs=await readPairs();sets.push(pairs.join(','));assert.equal(pairs.length,3);assert.equal(new Set(pairs).size,3);
 const [p0,p1,p2]=pairs;
 const before=(await requested(page)).length;
 await page.locator(partner(p0,'a')).tap();await page.locator(partner(p1,'b')).tap();       // wrong partner by tapping
 assert.equal(await data(page,'connected'),'0');assert.equal(await page.locator('.pz-tile.wrong').count(),2);
 await dragTo(page,partner(p0,'a'),partner(p2,'b'));await page.waitForTimeout(80);              // wrong partner by dragging
 assert.equal(await data(page,'connected'),'0');assert.equal(await page.locator('#pz-lines .pz-line').count(),0,'no line is left behind by a wrong drag');
 const empty=await centre(page,'.pz-gap');await dragTo(page,partner(p0,'a'),{x:empty.x,y:empty.y});await page.waitForTimeout(60);  // let go over nothing
 assert.equal(await data(page,'connected'),'0');assert.equal(await page.locator('#pz-lines .pz-line.live').count(),0);
 const sfxWrong=(await requested(page)).slice(before);assert.ok(sfxWrong.filter(n=>n==='boing').length>=2,`wrong attempts boing: ${sfxWrong}`);assert.ok(sfxWrong.includes('pick'),'picking a friend makes a sound');
 // watch a line follow the finger, then close it
 const a=await centre(page,partner(p0,'a')),b=await centre(page,partner(p0,'b'));
 if(name==='chromium'){const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:a.x,y:a.y,id:1}]});for(let i=1;i<=7;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+(b.x-a.x)*i/12,y:a.y+(b.y-a.y)*i/12,id:1}]});await page.waitForTimeout(20);}
  assert.equal(await page.locator('#pz-lines .pz-line.live').count(),1,'a rubber line follows the finger');assert.ok(await page.locator(partner(p0,'a')).evaluate(e=>e.classList.contains('is-dragging')));await page.screenshot({path:path.join(output,`${name}-connect-dragging.png`)});
  for(let i=8;i<=12;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+(b.x-a.x)*i/12,y:a.y+(b.y-a.y)*i/12,id:1}]});await page.waitForTimeout(20);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();await page.waitForFunction(()=>document.getElementById('new-game').dataset.connected==='1');
  await page.waitForTimeout(550);await page.screenshot({path:path.join(output,`${name}-connect-one.png`)});
  for(const [i,pair] of [p1,p2].entries()){if(i===0)await dragTo(page,partner(pair,'a'),partner(pair,'b'));else{await page.locator(partner(pair,'b')).tap();await page.locator(partner(pair,'a')).tap();}await page.waitForFunction(n=>Number(document.getElementById('new-game').dataset.connected)===n,i+2);}
 }else await solve(pairs,0);
 assert.equal(await page.locator('#pz-lines .pz-line').count(),3);assert.equal(await page.locator('.pz-tile[data-done]').count(),6);
 await phase(page,'done');
 const fx=await requested(page),kindNow=await data(page,'kinds');assert.ok(fx.includes('link'),'a successful link rings');assert.ok(fx.includes(kindNow==='shadow'?'pop':'splash'),`each kind of match has its own sound (${kindNow}: ${fx.slice(-8)})`);
 assert.ok(fx.includes('fanfare')||await page.evaluate(()=>LittleCelebration.stats.bursts>0));
 console.log('PASS connect: wrong tap/drag refused with a boing, nothing left behind, rubber line follows the finger, three links, themed sounds, success');

 /* ---------- full-screen, multi-wave confetti ---------- */
 await page.waitForFunction(()=>document.querySelector('.paper-party canvas'));
 const geo=await page.evaluate(()=>{const layer=document.querySelector('.paper-party'),c=layer.querySelector('canvas'),s=getComputedStyle(layer),r=layer.getBoundingClientRect();const hit=document.elementFromPoint(innerWidth/2,innerHeight/2);return{pos:s.position,events:s.pointerEvents,z:Number(s.zIndex),w:r.width,h:r.height,iw:innerWidth,ih:innerHeight,cw:c.width,ch:c.height,blocks:!!hit?.closest('.paper-party'),dpr:devicePixelRatio};});
 assert.equal(geo.pos,'fixed');assert.equal(geo.events,'none');assert.ok(geo.z>=900);assert.equal(geo.w,geo.iw);assert.equal(geo.h,geo.ih);assert.ok(Math.abs(geo.cw-geo.iw*Math.min(2,geo.dpr))<=2&&Math.abs(geo.ch-geo.ih*Math.min(2,geo.dpr))<=2,'the canvas is the whole screen');assert.equal(geo.blocks,false,'confetti never catches a touch');
 await page.waitForFunction(()=>LittleCelebration.stats.ms>2000,null,{timeout:6000});await page.screenshot({path:path.join(output,`${name}-confetti-wave3.png`)});
 const wave=await page.waitForFunction(()=>LittleCelebration.stats.waves>=5&&{...LittleCelebration.stats},null,{timeout:8000}).then(h=>h.jsonValue());
 assert.equal(wave.waves,5,'five separate waves');assert.ok(wave.peak>=180,`a lot of paper (${wave.peak})`);assert.ok(wave.cells>=21,`paper reached ${wave.cells} of 24 screen areas`);
 await page.waitForFunction(()=>LittleCelebration.stats.ms>4200,null,{timeout:8000});await page.screenshot({path:path.join(output,`${name}-confetti-wave5.png`)});
 await page.waitForFunction(()=>!document.querySelector('.paper-party'),null,{timeout:14000});
 const ended=await page.evaluate(()=>({...LittleCelebration.stats}));assert.ok(ended.ms>=5000&&ended.ms<=9600,`the party lasts ${ended.ms}ms`);assert.equal(ended.running,false);
 console.log(`PASS confetti: fixed full-screen canvas, ${wave.waves} waves, up to ${wave.peak} pieces, covered ${wave.cells}/24 areas, ${(ended.ms/1000).toFixed(1)}s, touch-through, auto-removed`);

 // next rounds are random and never repeat the last set
 await phase(page,'play');
 for(let r=0;r<3;r++){pairs=await readPairs();sets.push(pairs.join(','));await solve(pairs,r+1);await phase(page,'done');await phase(page,'play');}
 pairs=await readPairs();sets.push(pairs.join(','));
 for(let i=1;i<sets.length;i++)assert.notEqual(sets[i],sets[i-1],'a new set of pairs every round');
 assert.ok(new Set(sets).size>=4,`random sets: ${sets.join(' | ')}`);
 const seenPairs=new Set(sets.flatMap(s=>s.split(',')));
 console.log(`PASS connect: three more rounds solved by drag/tap/reverse-drag, every round a different random set (${seenPairs.size} different pairs seen)`);
 // levels
 for(const [level,count] of [[2,4],[3,5],[1,3]]){await page.locator(`.pz-levels [data-level="${level}"]`).tap();await page.waitForFunction(n=>document.getElementById('new-game').dataset.total==n&&document.querySelectorAll('.pz-tile[data-side=a]').length===n,count);assert.equal(await page.locator('.pz-tile[data-side=a]').count(),count);assert.equal(await page.locator(`.pz-levels [data-level="${level}"]`).getAttribute('aria-pressed'),'true');}
 // gentle hint, and keyboard operation
 await open('connect','&hint=700');await page.waitForFunction(()=>document.querySelectorAll('.pz-tile.hint').length===2,null,{timeout:4000});
 const hinted=await page.locator('.pz-tile.hint').evaluateAll(es=>es.map(e=>e.dataset.pair));assert.equal(new Set(hinted).size,1,'a hint highlights the two halves of one friendship');
 const kp=(await readPairs())[0];await page.locator(partner(kp,'a')).focus();await page.keyboard.press('Enter');await page.locator(partner(kp,'b')).focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.getElementById('new-game').dataset.connected==='1');
 console.log('PASS connect: three levels (3/4/5 pairs), idle hint, keyboard Enter works');

 /* ---------- every kind of match is built correctly, at every level ---------- */
 await open('connect','&pace=250');
 const catalog=await page.evaluate(()=>({colourItems:PuzzleGames.colourItems,words:Object.keys(WordBank.words)}));
 async function inspect(){
  const tiles=await page.locator('.pz-tile').evaluateAll(es=>es.map(e=>({pair:e.dataset.pair,side:e.dataset.side,kind:e.dataset.kind,piece:e.dataset.piece,label:e.getAttribute('aria-label'),shadow:!!e.querySelector('.pz-shadow'),filter:e.querySelector('.pz-shadow svg')?getComputedStyle(e.querySelector('.pz-shadow svg')).filter:'',swatch:!!e.querySelector('.pz-swatch'),dots:e.querySelectorAll('.pz-count i').length,numeral:!!e.querySelector('.pz-num'),half:e.querySelector('.pz-half-a')?'a':e.querySelector('.pz-half-b')?'b':''})));
  const pairs=[...new Set(tiles.map(t=>t.pair))];
  for(const id of pairs){
   const a=tiles.find(t=>t.pair===id&&t.side==='a'),b=tiles.find(t=>t.pair===id&&t.side==='b');assert.ok(a&&b,`${id} has both sides`);assert.equal(a.kind,b.kind);
   if(a.kind==='shadow'){assert.equal(a.piece,b.piece);assert.ok(b.shadow&&/brightness\(0\)/.test(b.filter),`${id}: the right tile is a black shadow`);assert.ok(!a.shadow);}
   if(a.kind==='colour'){assert.ok(b.swatch);assert.ok(catalog.colourItems[b.piece].includes(a.piece),`${a.piece} really is ${b.piece}`);}
   if(a.kind==='count'){const n=Number(id.split('-')[1]);assert.equal(a.dots,n,`${id}: ${n} pictures`);assert.ok(b.numeral);assert.equal(b.label,String(n));}
   if(a.kind==='half'){assert.equal(a.piece,b.piece);assert.equal(a.half,'a');assert.equal(b.half,'b');}
  }
  const pieces=tiles.filter(t=>t.side==='a'&&t.kind!=='count').map(t=>t.piece);assert.equal(new Set(pieces).size,pieces.length,'no picture appears twice on one board');
  for(const t of tiles)if(t.kind!=='colour'&&t.kind!=='count')assert.ok(catalog.words.includes(t.piece),`${t.piece} has a spoken name`);
  return {kinds:(await data(page,'kinds')).split(','),pairs};
 }
 const seenKinds=new Set();let mixed=0;
 for(const [level,count,minKinds,maxKinds] of [[1,3,1,1],[2,4,2,2],[3,5,3,3]]){
  await page.locator(`.pz-levels [data-level="${level}"]`).tap();await page.waitForFunction(n=>document.getElementById('new-game').dataset.total==n,count);
  for(let r=0;r<(level===1?3:5);r++){
   const info=await inspect();assert.ok(info.kinds.length>=minKinds&&info.kinds.length<=maxKinds,`level ${level} uses ${info.kinds}`);info.kinds.forEach(k=>seenKinds.add(k));if(level===1)assert.ok(['shadow','colour'].includes(info.kinds[0]),'level one is the gentlest kind');
   if(level===3&&info.kinds.includes('count'))assert.ok(info.pairs.filter(p=>p.startsWith('count-')).every(p=>Number(p.split('-')[1])>=2));
   if(info.kinds.length>1)mixed++;await solve(info.pairs,r);await phase(page,'done');await phase(page,'play');
  }
 }
 assert.deepEqual([...seenKinds].sort(),['colour','count','half','shadow'],'all four kinds of match appear');assert.ok(mixed>=6,'levels two and three mix kinds on one board');
 console.log(`PASS connect: shadow/colour/number/half matches are built correctly (right partner, black shadow, exact dot count, real colours, matching halves); ${mixed} mixed boards solved by drag and tap`);

 /* ---------- match: tap two of a kind and they pop ---------- */
 await open('match');
 const themes=await page.evaluate(()=>Object.fromEntries(Object.entries(PuzzleGames.themes).map(([k,v])=>[k,v.pool])));
 assert.deepEqual(Object.keys(themes).sort(),['animals','fruit','sea','veg','vehicle']);
 const boardInfo=()=>page.evaluate(()=>[...document.querySelectorAll('#pz-grid .pz-tile')].map(e=>({piece:e.dataset.piece,gone:!!e.dataset.gone})));
 const pieceCounts=list=>list.reduce((m,t)=>(m[t.piece]=(m[t.piece]||0)+1,m),{});
 async function checkBoard(expectTiles){
  const list=await boardInfo(),theme=await data(page,'theme');assert.equal(list.length,expectTiles);
  const counts=pieceCounts(list);assert.ok(Object.values(counts).every(n=>n===2),'every picture appears exactly twice');assert.ok(Object.keys(counts).every(id=>themes[theme].includes(id)),`all pictures belong to ${theme}`);
  for(const id of Object.keys(counts))assert.ok(await page.evaluate(i=>Boolean(AdventureArt.animals[i]||AdventureArt.playthings[i]||AdventureArt.food[i]||AdventureArt.vehicles[i]),id),`${id} has art`);
  return {theme,counts};
 }
 let info=await checkBoard(8);assert.equal(await data(page,'remaining'),'8');
 // a wrong pair first
 const live=await boardInfo(),distinct=[...new Set(live.map(t=>t.piece))];
 const idx=id=>live.findIndex(t=>t.piece===id);
 const nth=i=>page.locator('#pz-grid .pz-tile').nth(i);
 const m0=(await requested(page)).length;
 await nth(idx(distinct[0])).tap();assert.ok(await nth(idx(distinct[0])).evaluate(e=>e.classList.contains('is-selected')));await nth(idx(distinct[1])).tap();
 assert.equal(await page.locator('#pz-grid .pz-tile.wrong').count(),2);assert.equal(await data(page,'remaining'),'8');await page.waitForFunction(()=>!document.querySelector('#pz-grid .pz-tile.wrong,#pz-grid .pz-tile.is-selected'));
 // the first pair really pops
 const firstTwo=live.map((t,i)=>t.piece===distinct[0]?i:-1).filter(i=>i>=0);
 await nth(firstTwo[0]).tap();await nth(firstTwo[1]).tap();await page.waitForFunction(()=>document.getElementById('new-game').dataset.remaining==='6');
 await page.waitForTimeout(120);assert.equal(await page.locator('#pz-grid .pz-spark').count()>0,true,'sparkles fly out');await page.screenshot({path:path.join(output,`${name}-match-pop.png`)});
 await page.waitForFunction(()=>document.querySelectorAll('#pz-grid .pz-tile[data-gone]').length===2);
 const sfxMatch=(await requested(page)).slice(m0);assert.ok(sfxMatch.includes('boing')&&sfxMatch.includes('match')&&sfxMatch.includes('pick'),`match sounds: ${sfxMatch}`);
 // clear the rest with rising combos
 async function clearBoard(){
  for(;;){const list=await boardInfo(),open=list.map((t,i)=>({...t,i})).filter(t=>!t.gone);if(!open.length)return;const first=open[0],second=open.find(t=>t.piece===first.piece&&t.i!==first.i);await nth(first.i).tap();await nth(second.i).tap();await page.waitForFunction(n=>document.querySelectorAll('#pz-grid .pz-tile[data-gone]').length>=n,list.filter(t=>t.gone).length+2);}
 }
 await clearBoard();await phase(page,'done');assert.equal(await data(page,'remaining'),'0');
 const matchSounds=(await requested(page)).filter(n=>n==='match').length;assert.ok(matchSounds>=4,`one pop per pair (${matchSounds})`);
 await page.waitForFunction(()=>LittleCelebration.stats.waves>=1);console.log('PASS match: wrong pair shakes, right pair sparkles and pops, rising combo sounds, board cleared, confetti');
 const firstTheme=info.theme;await page.waitForFunction(()=>document.getElementById('new-game').dataset.phase==='play'&&document.getElementById('new-game').dataset.round==='2',null,{timeout:12000});
 info=await checkBoard(8);assert.notEqual(info.theme,firstTheme,'the next board changes theme');
 // every theme, every level
 for(const theme of Object.keys(themes)){await page.locator(`.pz-themes [data-theme=${theme}]`).tap();await page.waitForFunction(t=>document.getElementById('new-game').dataset.theme===t,theme);assert.equal((await checkBoard(8)).theme,theme);assert.equal(await page.locator(`.pz-themes [data-theme=${theme}]`).getAttribute('aria-pressed'),'true');if(theme==='vehicle')await page.screenshot({path:path.join(output,`${name}-match-vehicle.png`)});}
 for(const [level,tiles] of [[2,12],[3,16],[1,8]]){await page.locator(`.pz-levels [data-level="${level}"]`).tap();await page.waitForFunction(n=>document.querySelectorAll('#pz-grid .pz-tile').length===n,tiles);await checkBoard(tiles);}
 await open('match','&hint=700');await page.waitForFunction(()=>document.querySelectorAll('#pz-grid .pz-tile.hint').length===2,null,{timeout:4000});
 const hintPieces=await page.locator('#pz-grid .pz-tile.hint').evaluateAll(es=>es.map(e=>e.dataset.piece));assert.equal(hintPieces[0],hintPieces[1],'the hint shows a matching pair');
 // five themes cover plenty of different pictures
 const allPieces=new Set(Object.values(themes).flat());assert.ok(allPieces.size>=45,`${allPieces.size} pictures`);
 console.log(`PASS match: five themes, three levels (8/12/16 tiles), every picture twice, next board switches theme, idle hint, ${allPieces.size} different pictures`);

 /* ---------- reduced motion: one calm scatter instead of waves ---------- */
 await page.emulateMedia({reducedMotion:'reduce'});await open('match');await page.locator('.pz-levels [data-level="1"]').tap();await clearBoard();await phase(page,'done');
 const still=await page.evaluate(()=>({reduced:LittleCelebration.stats.reduced,star:document.querySelectorAll('.paper-party .party-star').length,canvas:document.querySelectorAll('.paper-party canvas').length,cells:LittleCelebration.stats.cells}));
 assert.equal(still.reduced,true);assert.equal(still.star,1);assert.equal(still.canvas,1);assert.ok(still.cells>=18,`the still scatter covers the screen (${still.cells}/24)`);
 await page.waitForFunction(()=>!document.querySelector('.paper-party'),null,{timeout:4000});await page.emulateMedia({reducedMotion:'no-preference'});
 console.log('PASS reduced motion: a still full-screen scatter, no animation, gone in a moment');

 /* ---------- layout on every iPad and phone size ---------- */
 for(const size of[{width:834,height:1194},{width:1194,height:834},{width:390,height:844},{width:1024,height:768},{width:390,height:667}]){
  await page.setViewportSize(size);
  for(const game of['connect','match']){
   await open(game);
   for(const level of[1,3]){
    await page.locator(`.pz-levels [data-level="${level}"]`).tap();await page.waitForTimeout(160);
    const layout=await page.evaluate(()=>{const board=document.querySelector('.pz-board').getBoundingClientRect(),bad=[],sizes=[];for(const t of document.querySelectorAll('.pz-tile')){const r=t.getBoundingClientRect();sizes.push(Math.min(r.width,r.height));if(r.left<board.left-1||r.right>board.right+1||r.top<board.top-1||r.bottom>board.bottom+1)bad.push(t.dataset.piece);}
     const chrome=[...document.querySelectorAll('.topbar,.toy-heading,.pz-levels,.pz-bar,.toy-footer,.pz-board')].filter(e=>e.checkVisibility()).map(e=>e.getBoundingClientRect()).filter(r=>r.bottom>innerHeight+1||r.right>innerWidth+1||r.left<-1||r.top<-1).length;
     const overlap=(()=>{const rects=[...document.querySelectorAll('.pz-tile')].map(e=>e.getBoundingClientRect());for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],b=rects[j];if(a.left<b.right-2&&b.left<a.right-2&&a.top<b.bottom-2&&b.top<a.bottom-2)return true;}return false;})();
     return{bad,min:Math.min(...sizes),chrome,overlap,scrollX:document.documentElement.scrollWidth>innerWidth,fixed:getComputedStyle(document.body).position,count:sizes.length};});
    assert.equal(layout.fixed,'fixed');assert.equal(layout.scrollX,false);assert.deepEqual(layout.bad,[],`${game} L${level} tiles stay inside the board at ${size.width}x${size.height}`);assert.equal(layout.chrome,0,`${game} controls fit ${size.width}x${size.height}`);assert.equal(layout.overlap,false,`${game} L${level} tiles do not overlap`);assert.ok(layout.min>=(game==='connect'?44:48),`${game} L${level} tiles are touchable (${layout.min.toFixed(0)}px) at ${size.width}x${size.height}`);
    if(level===3&&(size.width===390||size.width===1194))await page.screenshot({path:path.join(output,`${name}-${game}-L3-${size.width}x${size.height}.png`)});
   }
  }
 }
 console.log('PASS both games fit five iPad/phone sizes at easy and hardest level: tiles inside the board, no overlap, large touch targets, fixed viewport');

 /* ---------- real, unmuted playback ---------- */
 const loud=await context.newPage();loud.on('pageerror',e=>errors.push(e.message));await loud.goto(base+'play.html?game=match');await loud.locator('body[data-game=match]').waitFor();
 if(await loud.locator('#sound-start').count())await loud.locator('#sound-start').tap();
 const played0=await loud.evaluate(()=>SoundFX.stats.played);await loud.locator('#pz-grid .pz-tile').first().tap();
 const played1=await loud.evaluate(()=>({played:SoundFX.stats.played,state:SoundFX.state}));assert.ok(played1.played>played0,'a tap makes a real sound');if(name==='chromium')assert.equal(played1.state,'running');
 await loud.locator('#sound-toggle').tap();const mutedFrom=await loud.evaluate(()=>SoundFX.stats.played);await loud.locator('#pz-grid .pz-tile').nth(1).tap();assert.equal(await loud.evaluate(()=>SoundFX.stats.played),mutedFrom,'mute silences the effects too');
 await loud.close();
 console.log('PASS effects play after a tap and obey the mute button');

 /* ---------- Zoey's voice in the connect game: intro, each pair's words, then the finish ---------- */
 const voice=await context.newPage();voice.on('pageerror',e=>errors.push(e.message));
 await voice.addInitScript(()=>{window.voiceEvents=[];const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){if(!this.dataset.tracked){this.dataset.tracked='true';this.addEventListener('playing',()=>voiceEvents.push({file:this.src.split('/').pop().split('?')[0],at:performance.now()}));}return play.call(this);};});
 await voice.goto(base+'play.html?game=connect');await voice.locator('body[data-game=connect]').waitFor();if(await voice.locator('#sound-start').count())await voice.locator('#sound-start').tap();
 await voice.waitForFunction(()=>voiceEvents.some(e=>/^cn-intro-(shadow|colour)\.m4a$/.test(e.file)),null,{timeout:8000});
 const vpairs=(await voice.locator('#new-game').getAttribute('data-pairs')).split(','),lastPiece=await voice.locator(tile(vpairs.at(-1),'a')).getAttribute('data-piece');
 for(const [i,pair] of vpairs.entries()){
  const piece=await voice.locator(tile(pair,'a')).getAttribute('data-piece'),colour=pair.startsWith('colour-')?pair.slice(7):'';
  await voice.locator(tile(pair,'a')).tap();await voice.locator(tile(pair,'b')).tap();await voice.waitForFunction(f=>voiceEvents.some(e=>e.file===f),`wd-${piece}.m4a`,{timeout:6000});
  if(colour)await voice.waitForFunction(f=>voiceEvents.some(e=>e.file===f),`col-${colour}.m4a`,{timeout:6000});
  if(i<vpairs.length-1)await voice.waitForFunction(n=>Number(document.getElementById('new-game').dataset.connected)===n,i+1);
 }
 await voice.waitForFunction(()=>voiceEvents.some(e=>e.file==='cn-done.m4a'),null,{timeout:12000});
 const spoken=await voice.evaluate(()=>voiceEvents.map(e=>e.file)),lastWord=spoken.lastIndexOf(`wd-${lastPiece}.m4a`),done=spoken.indexOf('cn-done.m4a');
 assert.ok(lastWord>=0&&done>lastWord,`the finishing line follows the last pair's word: ${spoken}`);
 await voice.close();
 console.log('PASS Zoey says the intro, every matched picture, its colour, and then the finish, in order');

 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({browser:name,errors,failed,external,sounds:sounds.map(s=>({name:s.name,peak:+s.peak.toFixed(3),seconds:+s.seconds.toFixed(2)}))},null,2));
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.deepEqual(external,[]);
 console.log('Screenshots and report:',output);
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
