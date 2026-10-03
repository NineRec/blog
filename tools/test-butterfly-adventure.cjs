/* Integration tests for the independent Hugo static storybook.
 * NODE_PATH may point to an external Playwright installation.
 * BROWSER=webkit selects Safari's engine. Chromium exercises native touch drags.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { chromium, webkit } = require('playwright');
const root = path.resolve(__dirname, '../static');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'little-wonders-check-'));
const mime = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.m4a':'audio/mp4','.mp3':'audio/mpeg','.wav':'audio/wav'};
const server = http.createServer((req,res) => {
  let file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) {res.writeHead(403).end();return;}
  try {
    if (fs.statSync(file).isDirectory()) file=path.join(file,'index.html');
    res.setHeader('Content-Type',mime[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  } catch {res.writeHead(404).end();}
});
async function waitIdle(page) {await page.waitForFunction(() => document.getElementById('book').getAttribute('aria-busy') === 'false',null,{timeout:15000});}
async function advance(page) {await page.locator('#action').tap();await waitIdle(page);}
async function pointerDrag(page, browserName, {dx=-200,dy=0,selector='#viewport'}={}) {
  const box=await page.locator(selector).boundingBox();
  const x=box.x+box.width*(selector==='#viewport'?.7:.5),y=box.y+box.height*.47;
  if(browserName==='chromium'){
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
    for(let i=1;i<=8;i++){
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/8,y:y+dy*i/8,id:1}]});
      await page.waitForTimeout(25);
    }
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  }else{
    // WebKit exposes native touchscreen taps; use its pointer input for a drag.
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:8});await page.mouse.up();
  }
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}/butterfly-adventure/`;
  const browserName=process.env.BROWSER||'chromium';
  const browser=await (browserName==='webkit'?webkit:chromium).launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
  const errors=[],failed=[],external=[];
  try {
    const context=await browser.newContext({viewport:{width:834,height:1194},hasTouch:true,isMobile:true,deviceScaleFactor:2});
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    page.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
    page.on('request',r=>{if(!r.url().startsWith(url.slice(0,url.indexOf('/butterfly-adventure/'))))external.push(r.url());});
    await page.goto(url);await page.locator('.life-stop').first().waitFor();
    await page.screenshot({path:path.join(output,`${browserName}-ipad-garden.png`),fullPage:true});
    assert.equal(await page.locator('html').getAttribute('lang'),'en');
    await page.locator('#garden-guide').tap();assert.equal(await page.locator('#garden-guide').evaluate(e=>e.classList.contains('wave')),true,'Zoey responds to a touch greeting');
    assert.equal(await page.locator('#garden-guide').getAttribute('aria-label'),'Say hello to Zoey');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal page overflow');
    // Actual touch taps, with the real transition timeline enabled.
    await advance(page);await advance(page);
    await page.locator('#specimen').tap();
    assert.equal(await page.locator('#book').getAttribute('aria-busy'),'true');
    await page.locator('#action').evaluate(b=>{b.click();b.click();});
    await page.waitForTimeout(1100);
    assert.equal(await page.locator('#progress-count').textContent(),'2 / 3','Repeated taps must not advance during hatching');
    assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('egg-actor')).opacity),'1','Shell stays visible while the baby emerges');
    assert.notEqual(await page.evaluate(()=>getComputedStyle(document.getElementById('egg-top')).transform),'none','Shell opens before stage replacement');
    await page.screenshot({path:path.join(output,`${browserName}-hatching.png`)});
    await waitIdle(page);
    assert.equal(await page.locator('#progress-count').textContent(),'3 / 3');
    assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('worm-actor')).opacity),'1');
    await advance(page); // same baby crawls and grows into chapter 2
    for(let i=0;i<3;i++)await advance(page);
    await page.locator('#action').tap();await page.waitForTimeout(2400);
    assert.match(await page.locator('#garden-caption').textContent(),/curl|skin|chrysalis/);
    await page.screenshot({path:path.join(output,`${browserName}-forming-chrysalis.png`)});
    await waitIdle(page);
    assert.match(await page.locator('#chapter-number').textContent(),/CHAPTER 03/);
    for(let i=0;i<3;i++)await advance(page);
    assert.equal(await page.evaluate(()=>getComputedStyle(document.getElementById('butterfly-actor')).opacity),'1');
    await advance(page);
    for(let i=0;i<3;i++)await advance(page);
    assert.equal(await page.locator('#garden').evaluate(e=>e.classList.contains('flying')),true);
    await page.locator('[data-flower=left]').tap();await page.waitForTimeout(1400);
    assert.match(await page.locator('#story-main').textContent(),/nectar/);
    await advance(page);assert.equal(await page.locator('#game').isVisible(),true);
    await page.locator('[data-choice="2"]').tap();assert.equal(await page.locator('.game-slot.filled').count(),0);
    for(let i=0;i<4;i++)await page.locator(`[data-choice="${i}"]`).tap();
    assert.equal(await page.locator('.game-slot.filled').count(),4);assert.match(await page.locator('#game-feedback').textContent(),/You did it/);
    console.log('PASS continuous life cycle, rapid-tap lock, flowers, ordering game');
    for(const world of ['zoo','sea']){
      await page.locator(`[data-world="${world}"]`).tap();
      assert.equal(await page.locator('#explore-panel').isVisible(),true);
      const before=await page.locator('#viewport').evaluate(e=>e.scrollLeft);
      await pointerDrag(page,browserName);await page.waitForTimeout(550);
      assert.ok(await page.locator('#viewport').evaluate(e=>e.scrollLeft)>before+80,'Drag moves panorama');
      assert.equal(await page.locator('#discovery-count').textContent(),'0 of 10 friends discovered','Drag must not activate an animal');
      const forward=await page.locator('#viewport').evaluate(e=>e.scrollLeft);
      await pointerDrag(page,browserName,{dx:160,dy:22});await page.waitForTimeout(550);
      assert.ok(await page.locator('#viewport').evaluate(e=>e.scrollLeft)<forward-60,'Reverse diagonal swipe moves scene left');
      const touchAction=await page.locator('.animal').first().evaluate(e=>getComputedStyle(e).touchAction);
      assert.ok(touchAction==='manipulation'||touchAction.includes('pan-x'),'Animals permit native horizontal touch scrolling');
      await page.locator('#viewport').evaluate(e=>e.scrollLeft=0);await page.waitForTimeout(150);
      const startAnimal=world==='zoo'?'elephant':'clownfish';
      await pointerDrag(page,browserName,{dx:-170,dy:26,selector:`[data-animal="${startAnimal}"]`});await page.waitForTimeout(550);
      assert.ok(await page.locator('#viewport').evaluate(e=>e.scrollLeft)>70,'Swipe starting on an animal scrolls');
      assert.equal(await page.locator('.animal.discovered').count(),0,'Animal-started swipe never becomes a tap');
      await page.locator('#pan-position').focus();await page.keyboard.press('End');
      assert.equal(await page.locator('#pan-position').inputValue(),'100');
      assert.ok(await page.locator('#viewport').evaluate(e=>Math.abs(e.scrollLeft-(e.scrollWidth-e.clientWidth)))<2,'Slider reaches scene end');
      await page.keyboard.press('Home');assert.equal(await page.locator('#viewport').evaluate(e=>e.scrollLeft),0);
      const sliderBox=await page.locator('#pan-position').boundingBox();
      await page.touchscreen.tap(sliderBox.x+sliderBox.width*.7,sliderBox.y+sliderBox.height/2);
      assert.ok(await page.locator('#viewport').evaluate(e=>e.scrollLeft)>100,'Slider can be positioned by touch');
      assert.ok(sliderBox.height>=44,'Slider has a full-height touch area');
      const ids=await page.locator('.animal').evaluateAll(items=>items.map(e=>e.dataset.animal));
      assert.equal(ids.length,10,'Ten friends in each panorama');
      for(const id of ids){
        await page.locator(`[data-animal="${id}"]`).evaluate(e=>e.scrollIntoView({block:'nearest',inline:'center'}));
        await page.waitForTimeout(370);
        await page.locator(`[data-animal="${id}"]`).tap();
        assert.equal(await page.locator(`[data-animal="${id}"]`).getAttribute('aria-pressed'),'true');
        assert.match(await page.locator('#animal-bubble').textContent(),/Hello/);
        await page.waitForFunction(()=>document.getElementById('listen').classList.contains('playing')||!document.getElementById('audio-status').hidden);
        assert.equal(await page.locator('#audio-status').isVisible(),false,`Audio plays for ${id}`);
        if(world==='sea'){
          await page.waitForTimeout(1500);
          const moved=await page.locator(`[data-animal="${id}"] .animal-art`).evaluate(e=>getComputedStyle(e).transform);
          assert.notEqual(moved,'none','Sea friend swims away');
          await page.waitForFunction(animal=>!document.querySelector(`[data-animal="${animal}"]`).classList.contains('acting'),id,{timeout:5000});
          assert.equal(await page.locator(`[data-animal="${id}"] .animal-art`).evaluate(e=>e.style.animation),'','Ambient movement resumes after returning');
        }
      }
      assert.equal(await page.locator('#discovery-count').textContent(),'10 of 10 friends discovered');
      assert.equal(await page.locator('.animal-index .found').count(),10);
      await page.locator('#sound-toggle').tap();assert.equal(await page.locator('#sound-label').textContent(),'Sound off');assert.equal(await page.locator('#listen').evaluate(e=>e.classList.contains('playing')),false);
      await page.locator('#listen').tap();assert.equal(await page.locator('#sound-label').textContent(),'Sound on');
      await page.screenshot({path:path.join(output,`${browserName}-ipad-${world}.png`),fullPage:true});
      console.log(`PASS ${world}: ten touch interactions, sound, drag/tap separation, discoveries`);
    }
    // Switching worlds cancels a swim. Saved discovery state survives revisiting.
    await page.locator('[data-find=turtle]').tap();await page.locator('[data-world=zoo]').tap();
    assert.equal(await page.locator('#discovery-count').textContent(),'10 of 10 friends discovered');
    await page.locator('[data-world=sea]').tap();assert.equal(await page.locator('.animal.acting').count(),0);
    await page.locator('#viewport').focus();const scrollBefore=await page.locator('#viewport').evaluate(e=>e.scrollLeft);await page.keyboard.press('ArrowRight');await page.waitForTimeout(700);assert.ok(await page.locator('#viewport').evaluate(e=>e.scrollLeft)>=scrollBefore);
    await page.locator('#restart').tap();assert.equal(await page.locator('#progress-count').textContent(),'0 / 3');
    await page.locator('#action').tap();await page.waitForTimeout(200);await page.locator('[data-world=zoo]').tap();
    await page.waitForTimeout(1700);await page.locator('[data-world=garden]').tap();assert.equal(await page.locator('#progress-count').textContent(),'0 / 3','Interrupted transition does not commit progress');
    await page.emulateMedia({reducedMotion:'reduce'});for(let i=0;i<3;i++)await advance(page);assert.equal(await page.locator('#progress-count').textContent(),'3 / 3');
    await advance(page);for(let i=0;i<3;i++)await advance(page);await advance(page);
    assert.equal(await page.locator('#hanging-worm').evaluate(e=>getComputedStyle(e).transform),'none','A replay clears the peeled skin transform');
    for(let i=0;i<3;i++)await advance(page);await advance(page);for(let i=0;i<3;i++)await advance(page);
    assert.match(await page.locator('#chapter-number').textContent(),/CHAPTER 04/);
    console.log('PASS interruption, restore, reset, replay, keyboard controls, reduced motion');
    const audioCheck=await page.evaluate(async()=>{
      const lines=await (await fetch('audio/narration.json')).json();const ctx=new (window.AudioContext||window.webkitAudioContext)();const decoded=[];
      for(const id of Object.keys(lines)){const response=await fetch(`audio/${id}.m4a`);if(!response.ok)throw new Error(`Missing audio ${id}`);const buffer=await ctx.decodeAudioData(await response.arrayBuffer());if(buffer.duration<.2)throw new Error(`Empty audio ${id}`);decoded.push(id);}
      await ctx.close();return decoded;
    });assert.equal(audioCheck.length,41);
    const recording=await page.evaluate(async()=>await (await fetch('audio/recording-info.json')).json());
    assert.equal(recording.voice,'Samantha');assert.equal(recording.guide,'Zoey');console.log(`PASS ${audioCheck.length} bundled clips load and decode in ${browserName}`);
    for(const size of [{width:1194,height:834},{width:390,height:844},{width:1440,height:1100}]){
      await page.setViewportSize(size);await page.locator('[data-world=garden]').tap();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`No overflow at ${size.width}`);
      await page.screenshot({path:path.join(output,`${browserName}-${size.width}-garden.png`),fullPage:true});
      await page.locator('[data-world=sea]').tap();assert.equal(await page.locator('#pan-right').boundingBox().then(b=>b.width>=44&&b.height>=44),true);
      await page.locator('[data-find=turtle]').tap();assert.match(await page.locator('#animal-bubble').textContent(),/sea turtle/,'Touch interaction works after a viewport change');
      await page.screenshot({path:path.join(output,`${browserName}-${size.width}-sea.png`),fullPage:true});
    }
    if(browserName==='chromium'){
      await page.setViewportSize({width:834,height:834});
      await page.locator('#viewport').evaluate(e=>{e.scrollLeft=700;e.scrollIntoView({block:'center'});});
      await page.waitForTimeout(200);
      const pageBefore=await page.evaluate(()=>scrollY), sceneBefore=await page.locator('#viewport').evaluate(e=>e.scrollLeft);
      await pointerDrag(page,browserName,{dx:10,dy:-160});await page.waitForTimeout(550);
      assert.ok(await page.evaluate(()=>scrollY)>pageBefore+60,'Vertical swipe scrolls the page');
      assert.ok(Math.abs(await page.locator('#viewport').evaluate(e=>e.scrollLeft)-sceneBefore)<30,'Vertical swipe does not move the scene');
      console.log('PASS native touch scrolling in both directions, diagonal/animal starts, vertical page scrolling and scene slider');
    }
    assert.deepEqual(errors,[],'No browser JS errors');assert.deepEqual(failed,[],'No missing assets');assert.deepEqual(external,[],'No runtime external dependencies');
    console.log('PASS portrait, landscape, phone and desktop layouts; no missing assets or external requests');
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({browser:browserName,errors,failed,external,audioClips:audioCheck.length},null,2));
    console.log(`Screenshots and report: ${output}`);
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
