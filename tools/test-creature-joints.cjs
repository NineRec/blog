/* Joint regression: rendered silhouettes must remain connected at intermediate poses.
 * Uses the exact gallery/game assets; no runtime dependencies are added to the site.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium,webkit}=require('playwright');
const name=process.env.BROWSER||'chromium',base=process.env.BASE_URL||'http://localhost:8080/butterfly-adventure/';
const output=fs.mkdtempSync(path.join(os.tmpdir(),'zoey-joints-'));
async function pan(page,points){
 if(name==='chromium'){
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...points[0],id:1}]});
  for(const point of points.slice(1)){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...point,id:1}]});await page.waitForTimeout(17);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
 }else{await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();for(const p of points.slice(1))await page.mouse.move(p.x,p.y);await page.mouse.up();}
 await page.waitForTimeout(450);
}
(async()=>{
 const browser=await(name==='webkit'?webkit:chromium).launch();
 try{
  const page=await browser.newPage({viewport:{width:1194,height:834},hasTouch:true,isMobile:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'materials.html');await page.locator('[data-material=mermaid]').waitFor();
  const results=await page.evaluate(async()=>{
   const results=[];window.jointPoses=[];
   for(const id of [...CreatureCatalog.zoo,...CreatureCatalog.sea].map(a=>a.id)){
    const node=document.querySelector(`[data-material=${id}]`),svg=node.querySelector('svg');
    const limbs={octopus:['.octopus-arm',8],turtle:['.animal-fin',3],tiger:['.animal-leg',4],elephant:['.animal-leg',4],rhino:['.animal-leg',4],cow:['.animal-leg',4],fox:['.animal-leg',4],giraffe:['.animal-leg',4],gorilla:['.animal-paw',2],hermitcrab:['.animal-claw',2],crab:['.animal-leg',8],lobster:['.animal-leg',8],bear:['.animal-foot',2],panda:['.animal-foot',2],crocodile:['.animal-leg',4]};
    if(limbs[id]&&svg.querySelectorAll(limbs[id][0]).length!==limbs[id][1])throw Error(`${id}: missing characteristic limbs`);
    for(let variant=0;variant<3;variant++){
     const h=CreatureMotion.play(node,id,variant),motions=node.getAnimations({subtree:true}).filter(a=>a.effect.getComputedTiming().iterations!==Infinity);
     motions.forEach(a=>a.pause());
     let planted;
     for(const fraction of [0,.25,.45,.7,1]){
      motions.forEach(a=>a.currentTime=h.duration*fraction);
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      for(const joint of svg.querySelectorAll('[data-motion-origin]')){
       const [x,y]=joint.dataset.motionOrigin.split(' ').map(Number);
       const matrix=joint.parentElement.getScreenCTM().inverse().multiply(joint.getScreenCTM());
       const point=new DOMPoint(x,y).matrixTransform(matrix);
       if(Math.hypot(point.x-x,point.y-y)>.05)throw Error(`${id}: joint drift at ${fraction}`);
      }
      if(id==='mermaid'&&getComputedStyle(svg.querySelector('.mermaid-tail-body')).transform!=='none')throw Error('Mermaid waist must stay attached');
      if(['bear','panda','gorilla'].includes(id)){
       const feet=[...svg.querySelectorAll('.animal-leg')].map(foot=>{const [x,y]=foot.dataset.motionOrigin.split(' ').map(Number);return new DOMPoint(x,y).matrixTransform(foot.getScreenCTM());});
       if(planted&&feet.some((p,i)=>Math.hypot(p.x-planted[i].x,p.y-planted[i].y)>.05))throw Error(`${id}: planted feet slide during ${h.name}`);
       planted=feet;
      }
      // Bake computed SVG transforms into a standalone raster. Alpha connectivity
      // catches visible gaps even when individual pivot assertions pass.
      const clone=svg.cloneNode(true),originals=[svg,...svg.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];
      originals.forEach((p,i)=>{const transform=getComputedStyle(p).transform;if(i&&transform!=='none')copies[i].setAttribute('style',`transform:${transform};transform-origin:${getComputedStyle(p).transformOrigin};transform-box:${getComputedStyle(p).transformBox}`);});
      clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.setAttribute('width','520');clone.setAttribute('height','440');
      const xml=new XMLSerializer().serializeToString(clone),url=URL.createObjectURL(new Blob([xml],{type:'image/svg+xml'})),img=new Image();
      img.src=url;await img.decode();const canvas=document.createElement('canvas');canvas.width=520;canvas.height=440;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);URL.revokeObjectURL(url);
      const data=ctx.getImageData(0,0,520,440).data,visited=new Uint8Array(520*440),sizes=[];
      // Connectivity alone cannot catch feet hidden behind the belly. Both
      // bear/panda heel pads must remain painted at every intermediate pose.
      if(['bear','panda'].includes(id))for(const foot of svg.querySelectorAll('.animal-foot')){
       const pad=foot.querySelector('ellipse'),color=pad.getAttribute('fill').match(/\w\w/g).map(v=>parseInt(v,16));
       const x=+pad.getAttribute('cx')*2,y=+pad.getAttribute('cy')*2;let visible=0;
       for(let py=y-14;py<y+14;py++)for(let px=x-18;px<x+18;px++){const n=(py*520+px)*4;if(data[n+3]>240&&color.every((c,i)=>Math.abs(data[n+i]-c)<5))visible++;}
       if(visible<650)throw Error(`${id}: foot pad obscured (${visible} pixels)`);
      }
      for(let pixel=0;pixel<visited.length;pixel++){
       if(visited[pixel]||data[pixel*4+3]<100)continue;
       const queue=[pixel];visited[pixel]=1;
       for(let q=0;q<queue.length;q++){
        const n=queue[q],x=n%520,y=Math.floor(n/520);
        for(const next of [x? n-1:-1,x<519?n+1:-1,y?n-520:-1,y<439?n+520:-1])if(next>=0&&!visited[next]&&data[next*4+3]>=100){visited[next]=1;queue.push(next);}
       }
       if(queue.length>12)sizes.push(queue.length);
      }
      if(sizes.length!==1)throw Error(`${id} variant ${variant} pose ${fraction}: disconnected silhouette ${sizes}`);
      if(['bear','panda','fox','rabbit','crocodile','turtle','clownfish','dolphin','octopus','whale','jellyfish','shark','stingray','manta','seahorse','mermaid','giraffe','tiger','elephant','kangaroo','flamingo','rhino','frog','gorilla','shrimp','squid','hermitcrab','peacock'].includes(id)&&variant===0&&[0,.45,1].includes(fraction))window.jointPoses.push({id,fraction,xml});
      results.push(`${id}/${variant}/${fraction}`);
     }
     motions.forEach(a=>a.finish());await h.finished;
     const restarted=CreatureMotion.play(node,id,variant);restarted.cancel();await restarted.finished;
     if(node.style.animation)throw Error('Canceled motion failed to restore idle state');
    }
   }
   return results;
  });
  assert.equal(results.length,900);console.log('PASS 900 rasterized poses: connected silhouettes, fixed pivots, characteristic limb counts, visible planted feet, replay and cancellation');
  await page.evaluate(()=>{document.body.innerHTML=`<main style="display:grid;grid-template-columns:repeat(3,300px);gap:20px;padding:24px;background:#f6f2e7">${jointPoses.map(({id,fraction,xml})=>`<article><div style="width:280px;height:240px">${xml.replace('width="520" height="440"','width="280" height="240"')}</div><p>${id} · ${fraction===0?'Rest':fraction===1?'Return':'Mid-motion'}</p></article>`).join('')}</main>`;});
  await page.screenshot({path:path.join(output,`${name}-poses.png`),fullPage:true});
  await page.setViewportSize({width:834,height:1194});
  for(const game of ['zoo','sea']){
   await page.goto(base+`play.html?game=${game}`);await page.locator('#sound-toggle').tap();await page.waitForFunction(()=>!document.getElementById('sound-start'));
   const box=await page.locator('#viewport').boundingBox(),x=box.x+box.width*.7,y=box.y+box.height*.5;
   const sign=game==='zoo'?1:-1,pos=()=>page.locator('#viewport').evaluate(e=>[e.scrollLeft,e.scrollTop]),start=await pos();
   // The zoo opens at its gate (bottom centre) and the sea at the surface (top centre); pan toward the middle, then back along each axis.
   await pan(page,Array.from({length:9},(_,i)=>({x:x+sign*160*i/8,y:y+sign*130*i/8})));
   const first=await pos();assert.ok(sign>0?first[0]<start[0]-35&&first[1]<start[1]-25:first[0]>start[0]+35&&first[1]>start[1]+25);
   await pan(page,Array.from({length:9},(_,i)=>({x:x-sign*150*i/8,y})));const across=await pos();assert.ok(sign>0?across[0]>first[0]+30:across[0]<first[0]-30);
   await pan(page,Array.from({length:9},(_,i)=>({x,y:y-sign*120*i/8})));const back=await pos();assert.ok(sign>0?back[1]>across[1]+20:back[1]<across[1]-20);assert.equal(await page.evaluate(()=>scrollY),0);
   const ids=await page.locator('[data-animal]').evaluateAll(es=>es.map(e=>e.dataset.animal));assert.equal(ids.length,game==='zoo'?34:26);
   for(const id of ids){
    const animal=page.locator(`[data-animal=${id}]`);await animal.evaluate(e=>e.scrollIntoView({block:'center',inline:'center'}));await animal.tap();const action=await animal.getAttribute('data-action');assert.equal(await animal.getAttribute('aria-pressed'),'true');
    if(['bear','panda','fox','giraffe','octopus','turtle','manta','jellyfish','shark','mermaid'].includes(id)){await page.waitForTimeout(550);await page.screenshot({path:path.join(output,`${name}-${id}-ipad.png`)});}
    await page.evaluate(()=>document.getAnimations().forEach(a=>{if(a.effect?.getComputedTiming().iterations!==Infinity)a.finish();}));
    await animal.tap();assert.notEqual(await animal.getAttribute('data-action'),action);
    await page.evaluate(()=>document.getAnimations().forEach(a=>{if(a.effect?.getComputedTiming().iterations!==Infinity)a.finish();}));
   }
   assert.equal(await page.locator('.animal.discovered').count(),ids.length);
   await page.waitForFunction(g=>document.body.dataset.game!==g,game,{timeout:18000});
  }
  for(const size of [{width:390,height:844},{width:1194,height:834}])for(const game of ['zoo','sea']){
   await page.setViewportSize(size);await page.goto(base+`play.html?game=${game}`);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight+1));
  }
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto(base+'materials.html');await page.locator('[data-material=mermaid]').waitFor();
  const reduced=await page.evaluate(async()=>{for(const id of [...CreatureCatalog.zoo,...CreatureCatalog.sea].map(a=>a.id)){const node=document.querySelector(`[data-material=${id}]`);await CreatureMotion.play(node,id,0).finished;if(node.getAnimations({subtree:true}).some(a=>a.effect.getComputedTiming().iterations!==Infinity))return false;}return true;});assert.ok(reduced);assert.deepEqual(errors,[]);
  console.log(`PASS all 60 scene taps, varied actions, two-axis pan, automatic progression, phone/iPad layout and reduced motion (${name}); previews: ${output}`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
