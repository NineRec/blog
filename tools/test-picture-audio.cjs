/* Actual audible AAC sequencing, including Safari's gesture unlock.
 * BASE_URL checks production; BROWSER limits the engine when needed. */
const {chromium,webkit}=require('playwright');const assert=require('node:assert/strict');(async()=>{for(const engine of(process.env.BROWSER?[process.env.BROWSER==='webkit'?webkit:chromium]:[chromium,webkit])){const b=await engine.launch(),p=await b.newPage({hasTouch:true,isMobile:true,viewport:{width:834,height:1194}});const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>{window.voiceEvents=[];const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){if(!this.dataset.tracked){this.dataset.tracked='true';this.addEventListener('playing',()=>voiceEvents.push({file:this.src.split('/').pop().split('?')[0],at:performance.now()}));}return play.call(this);};});await p.goto((process.env.BASE_URL||'http://localhost:8080/butterfly-adventure/').replace(/\/?$/,'/')+'play.html?game=icecream');await p.waitForTimeout(300);if(await p.locator('#sound-start').count())await p.locator('#sound-start').tap();await p.waitForFunction(()=>AdventureBook.audioPlaying);
 const ice=n=>p.locator('#new-game').getAttribute('data-'+n),heard=f=>p.waitForFunction(x=>voiceEvents.some(e=>e.file===x),f,{timeout:15000}),firstOf=async f=>(await p.evaluate(()=>voiceEvents)).find(e=>e.file===f);
 /* intro, then the customer's order as one spoken sentence, in order */
 await heard('ic-please.m4a');const first=await p.evaluate(()=>voiceEvents.map(e=>e.file)),flavour=(await ice('scoops')).split(',')[0],holder=await ice('holder');
 assert.deepEqual(first.slice(0,4),['ic-intro.m4a',`ic-hi-${holder}.m4a`,`fl-${flavour}.m4a`,'ic-please.m4a'],'the customer speaks after the welcome, one clip after another');
 const times=(await p.evaluate(()=>voiceEvents)).slice(0,4).map(e=>e.at);assert.ok(times.every((t,i)=>!i||t-times[i-1]>350),'each phrase waits for the one before');
 /* scoop it, the shop says it is ready, the bell brings the thanks and the next customer */
 const next=await ice('next');await p.locator(`#ic-tray [data-pick=${next}]`).tap();await p.waitForFunction(()=>!document.querySelector('.drop-ghost'));await heard('ic-ready.m4a');assert.equal(await ice('phase'),'ready');
 await p.locator('#ic-bell').tap();await p.waitForFunction(()=>voiceEvents.some(e=>/^ic-thanks-[123]\.m4a$/.test(e.file)),null,{timeout:10000});
 const events=await p.evaluate(()=>voiceEvents),ready=events.find(e=>e.file==='ic-ready.m4a'),thanks=events.find(e=>/^ic-thanks/.test(e.file));assert.ok(thanks.at-ready.at>700,'the ready line finishes before the thank-you');
 await p.waitForFunction(()=>{const d=document.getElementById('new-game').dataset;return d.served==='1'&&d.phase==='order';},null,{timeout:16000});
 await p.waitForFunction(()=>voiceEvents.filter(e=>/^ic-hi-/.test(e.file)).length>=2,null,{timeout:12000});
 /* Letter Balloons after a tap-to-unlock: welcome, the picture's word once, then the question */
 await p.goto((process.env.BASE_URL||'http://localhost:8080/butterfly-adventure/').replace(/\/?$/,'/')+'play.html?game=letters');await p.waitForTimeout(300);if(await p.locator('#sound-start').count())await p.locator('#sound-start').tap();
 await heard('lb-ask.m4a');const item=await p.locator('#new-game').getAttribute('data-item'),said=await p.evaluate(()=>voiceEvents.map(e=>e.file));
 assert.deepEqual(said.slice(0,3),['lb-intro.m4a',`wd-${item}.m4a`,'lb-ask.m4a'],'welcome, the word once, then "which letter?"');
 assert.deepEqual(errors,[]);console.log('PASS',engine.name(),'real queued AAC: welcome, spoken order, ready line, thanks, an automatic next customer, and the balloon question');await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
