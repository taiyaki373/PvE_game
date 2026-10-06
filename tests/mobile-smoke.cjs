const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const client=await context.newCDPSession(page),touches=new Map();
 async function pointer(id,type,pointerId,x,y){
  if(type==='pointerdown'&&id!=='#touch-look'&&id!=='#touch-stick'){const b=await page.locator(id).boundingBox();x=b.x+b.width/2;y=b.y+b.height/2}
  if(type==='pointerup'||type==='pointercancel')touches.clear();else touches.set(pointerId,{id:pointerId,x,y});
  await client.send('Input.dispatchTouchEvent',{type:type==='pointerdown'?'touchStart':type==='pointermove'?'touchMove':'touchEnd',touchPoints:[...touches.values()]});await page.waitForTimeout(80);
 }
 try{
  await page.goto('http://127.0.0.1:5173');await page.locator('#start').tap();await page.locator('#loadout-start').tap();
  assert.equal(await page.evaluate(()=>touchControls.enabled),true);assert.equal(await page.evaluate(()=>!!document.pointerLockElement),false);
  await page.locator('#touch-stick').waitFor({state:'visible'});
  const box=await page.locator('#touch-stick').boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
  const z=await page.evaluate(()=>player.z);
  await pointer('#touch-stick','pointerdown',11,x,y-40);
  await pointer('#touch-look','pointerdown',12,500,120);await pointer('#touch-look','pointermove',12,530,130);
  assert.ok(await page.evaluate(()=>player.a>0&&aimPitch<0));
  await pointer('#touch-fire','pointerdown',13,800,340);await page.waitForTimeout(350);
  assert.ok(await page.evaluate(initial=>player.z>initial,z));assert.ok(await page.evaluate(()=>ammo<weapon().mag));
  await pointer('#touch-fire','pointerup',13,800,340);await page.waitForFunction(()=>!firing);
  await page.locator('#settings-open').tap();touches.clear();assert.equal(await page.evaluate(()=>touchControls.forward),0);await page.locator('#settings-close').tap();
  await pointer('#touch-reload','pointerdown',14,800,280);assert.ok(await page.evaluate(()=>reloading>0));await pointer('#touch-reload','pointerup',14,800,280);
  await pointer('#touch-aim','pointerdown',15,740,280);assert.equal(await page.evaluate(()=>aiming),true);await pointer('#touch-aim','pointerup',15,740,280);
  await pointer('#touch-dodge','pointerdown',16,740,340);assert.ok(await page.evaluate(()=>dodge>0));await pointer('#touch-dodge','pointerup',16,740,340);
  await pointer('#touch-fire-left','pointerdown',17,80,160);assert.equal(await page.evaluate(()=>firing),true);
  await pointer('#touch-fire','pointerdown',18,780,230);
  const right=await page.locator('#touch-fire').boundingBox(),angle=await page.evaluate(()=>player.a);
  await pointer('#touch-fire','pointermove',18,right.x+right.width/2+20,right.y+right.height/2);
  assert.ok(await page.evaluate(a=>player.a>a,angle));
  await pointer('#touch-fire','pointerup',18,0,0);await page.waitForFunction(()=>!firing);
  await page.screenshot({path:'/tmp/pve-mobile-landscape.png'});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/pve-mobile-portrait.png'});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.evaluate(()=>{resetToMenu();showOnline()});await page.locator('#online-create').tap();await page.waitForFunction(()=>net.active&&net.state);
  await page.locator('#online-ready').tap();await page.locator('#online-start').tap();await page.waitForFunction(()=>mode==='play');
  const start=await page.evaluate(()=>net.state.players.find(p=>p.id===net.id).z),b=await page.locator('#touch-stick').boundingBox();
  await pointer('#touch-stick','pointerdown',21,b.x+b.width/2,b.y+b.height/2-40);
  await page.waitForFunction(z=>net.state.players.find(p=>p.id===net.id).z>z+.5,start);
  await pointer('#touch-fire','pointerdown',22,350,790);await page.waitForFunction(()=>ammo<weapon().mag);
  await pointer('#touch-fire','pointerup',22,350,790);await page.locator('#settings-open').tap();assert.equal(await page.evaluate(()=>firing||touchControls.forward!==0),false);
  assert.deepEqual(errors,[]);console.log('PASS: mobile solo and online movement, multi-touch aiming/firing, ADS, reload, dodge, release, pause, portrait and landscape; no browser errors');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
