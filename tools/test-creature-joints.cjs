/* Joint regression: rendered silhouettes must remain connected at intermediate poses.
 * Uses the exact gallery/game assets; no runtime dependencies are added to the site.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium,webkit}=require('playwright');
const name=process.env.BROWSER||'chromium',base=process.env.BASE_URL||'http://localhost:8080/butterfly-adventure/';
const output=fs.mkdtempSync(path.join(os.tmpdir(),'zoey-joints-'));
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
    for(let variant=0;variant<3;variant++){
     const h=CreatureMotion.play(node,id,variant),motions=node.getAnimations({subtree:true}).filter(a=>a.effect.getComputedTiming().iterations!==Infinity);
     motions.forEach(a=>a.pause());
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
      // Bake computed SVG transforms into a standalone raster. Alpha connectivity
      // catches visible gaps even when individual pivot assertions pass.
      const clone=svg.cloneNode(true),originals=[svg,...svg.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];
      originals.forEach((p,i)=>{const transform=getComputedStyle(p).transform;if(i&&transform!=='none')copies[i].setAttribute('style',`transform:${transform};transform-origin:${getComputedStyle(p).transformOrigin};transform-box:${getComputedStyle(p).transformBox}`);});
      clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.setAttribute('width','520');clone.setAttribute('height','440');
      const xml=new XMLSerializer().serializeToString(clone),url=URL.createObjectURL(new Blob([xml],{type:'image/svg+xml'})),img=new Image();
      img.src=url;await img.decode();const canvas=document.createElement('canvas');canvas.width=520;canvas.height=440;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);URL.revokeObjectURL(url);
      const data=ctx.getImageData(0,0,520,440).data,visited=new Uint8Array(520*440),sizes=[];
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
      if(['mermaid','giraffe','flamingo','zebra','deer','horse'].includes(id)&&variant===(id==='flamingo'?1:0)&&[0,.45,1].includes(fraction))window.jointPoses.push({id,fraction,xml});
      results.push(`${id}/${variant}/${fraction}`);
     }
     motions.forEach(a=>a.finish());await h.finished;
     const restarted=CreatureMotion.play(node,id,variant);restarted.cancel();await restarted.finished;
     if(node.style.animation)throw Error('Canceled motion failed to restore idle state');
    }
   }
   return results;
  });
  assert.equal(results.length,630);console.log('PASS 630 rasterized poses: connected silhouettes, fixed joint pivots, replay and cancellation');
  await page.evaluate(()=>{document.body.innerHTML=`<main style="display:grid;grid-template-columns:repeat(3,300px);gap:20px;padding:24px;background:#f6f2e7">${jointPoses.map(({id,fraction,xml})=>`<article><div style="width:280px;height:240px">${xml.replace('width="520" height="440"','width="280" height="240"')}</div><p>${id} · ${fraction===0?'Rest':fraction===1?'Return':'Mid-motion'}</p></article>`).join('')}</main>`;});
  await page.screenshot({path:path.join(output,`${name}-poses.png`),fullPage:true});
  for(const [game,id] of [['sea','mermaid'],['zoo','giraffe'],['zoo','flamingo'],['zoo','zebra'],['zoo','deer'],['zoo','horse']]){
   await page.goto(base+`play.html?game=${game}`);const animal=page.locator(`[data-animal=${id}]`);await animal.waitFor();await animal.evaluate(e=>e.scrollIntoView({block:'center',inline:'center'}));await animal.tap();assert.equal(await animal.getAttribute('aria-pressed'),'true');await page.waitForTimeout(550);await page.screenshot({path:path.join(output,`${name}-${id}-ipad.png`)});
  }
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto(base+'materials.html');await page.locator('[data-material=mermaid]').waitFor();
  const reduced=await page.evaluate(async()=>{for(const id of [...CreatureCatalog.zoo,...CreatureCatalog.sea].map(a=>a.id)){const node=document.querySelector(`[data-material=${id}]`);await CreatureMotion.play(node,id,0).finished;if(node.getAnimations({subtree:true}).some(a=>a.effect.getComputedTiming().iterations!==Infinity))return false;}return true;});assert.ok(reduced);assert.deepEqual(errors,[]);
  console.log(`PASS iPad-size scene taps and reduced motion (${name}); previews: ${output}`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
