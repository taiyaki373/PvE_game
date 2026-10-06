const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');

(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const errors=[];const base=process.argv[2]||'http://127.0.0.1:5173';
  const hostContext=await browser.newContext({viewport:{width:1440,height:1000}}),allyContext=await browser.newContext({viewport:{width:1280,height:900}});
  const host=await hostContext.newPage(),ally=await allyContext.newPage();
  for(const page of [host,ally])page.on('pageerror',e=>errors.push(e.message));
  try{
    await host.goto(base,{waitUntil:'domcontentloaded'});await host.locator('#online-open').click();
    await host.locator('#online-name').fill('隊長');await host.locator('#online-create').click();
    await host.waitForFunction(()=>net.active&&net.state?.players.length===1);const code=await host.locator('#online-room-code').textContent();
    await ally.goto(base+'/?room='+code,{waitUntil:'domcontentloaded'});await ally.locator('#online-name').fill('隊員');await ally.locator('#online-weapon').selectOption('smg');await ally.locator('#online-join').click();
    await host.waitForFunction(()=>net.state?.players.length===2);await ally.waitForFunction(()=>net.active&&net.state?.players.length===2);
    await host.screenshot({path:'/tmp/pve-online-lobby.png'});
    await ally.locator('#online-ready').click();await host.locator('#online-ready').click();await host.locator('#online-start').click();
    await Promise.all([host.waitForFunction(()=>net.state?.status==='playing'&&mode==='play'),ally.waitForFunction(()=>net.state?.status==='playing'&&mode==='play')]);
    assert.equal(await host.evaluate(()=>net.state.players.length),2);assert.equal(await ally.evaluate(()=>selectedWeapon),'smg');
    assert.equal(await host.evaluate(()=>net.state.enemies.length),8);assert.equal(await ally.evaluate(()=>net.allies.length),1);
    assert.equal(await host.evaluate(()=>net.state.enemies[0].id),await ally.evaluate(()=>net.state.enemies[0].id));
    await ally.locator('#game').click({position:{x:640,y:450}});await ally.waitForFunction(()=>ammo<40);
    await ally.evaluate(()=>{player.a=0;aimPitch=0;firing=false});
    const initial=await ally.evaluate(()=>({x:player.x,z:player.z}));
    await ally.keyboard.down('w');await ally.waitForFunction(initial=>{const p=net.state.players.find(p=>p.id===net.id);return Math.hypot(p.x-initial.x,p.z-initial.z)>.5},initial,{timeout:5000});await ally.keyboard.up('w');
    await ally.keyboard.press('Escape');await ally.locator('#sensitivity').fill('0.75');await ally.locator('#settings-close').click();
    await ally.screenshot({path:'/tmp/pve-online-game.png'});
    const self=await ally.evaluate(()=>({hp:player.hp,ammo,reserve,room:net.state.code}));assert.equal(self.room,code);assert.ok(self.ammo>=0&&self.reserve>=0);
    assert.deepEqual(errors,[]);console.log('PASS: two browsers, room invitation, ready/start, shared enemies, teammate rendering, firing, authoritative movement, settings; no browser errors');
  }catch(error){
    console.error('Browser state:',await ally.evaluate(()=>({mode,paused,settingsOpen,keys,hp:player.hp,position:{x:player.x,z:player.z},state:net.state?.status,self:net.state?.players.find(p=>p.id===net.id),locked:!!document.pointerLockElement})).catch(()=>null));
    await ally.screenshot({path:'/tmp/pve-online-failure.png'}).catch(()=>{});throw error;
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
