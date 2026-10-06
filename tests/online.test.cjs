const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Room,enemyCount}=require('../server/engine.cjs');
const {WEAPONS}=require('../src/rules.js');
const {createGameServer}=require('../server.cjs');
const {WebSocket}=require('ws');
const {once}=require('node:events');

function squad(count){const room=new Room('TEST01');for(let i=0;i<count;i++){const p=room.addPlayer('隊員'+i,['ar','smg','sniper','rocket'][i%4]);room.ready(p.id,true)}room.start(room.host);return room}

test('rooms accept 10 teammates, reject the 11th, and scale enemies to population',()=>{
  assert.equal(enemyCount(1,1),8);assert.equal(enemyCount(1,10),80);assert.equal(enemyCount(5,10),200);
  const room=squad(10);assert.equal(room.enemies.length,8);for(let i=0;i<10;i++)room.releasePack();assert.equal(room.enemies.length,81);assert.equal(room.enemies.filter(e=>e.boss).length,1);
  assert.throws(()=>room.addPlayer('11th'),/満員/);assert.equal(room.players.size,10);
  const solo=squad(1);solo.releasePack();assert.ok(room.enemies.find(e=>e.boss).hp>solo.enemies.find(e=>e.boss).hp);
});

test('late join adds the appropriate enemy reinforcements and keeps one boss',()=>{
  const room=squad(1);room.releasePack();const oldBoss=room.enemies.find(e=>e.boss).hp;
  room.addPlayer('合流','sniper');assert.equal(room.enemies.length,9);assert.equal(room.pendingPacks,1);room.releasePack();assert.equal(room.enemies.length,17);assert.equal(room.scaledPlayers,2);
  assert.ok(room.enemies.find(e=>e.boss).hp>oldBoss);assert.equal(room.enemies.filter(e=>e.boss).length,1);
});

test('reinforcements arrive one player-sized pack at a time and the boss arrives last',()=>{
  const room=squad(2);assert.equal(room.enemies.length,8);assert.equal(room.pendingPacks,1);assert.equal(room.bossPending,true);
  room.enemies=[];room.step(.1);assert.equal(room.wave,1);room.step(1.1);
  assert.equal(room.enemies.length,8);assert.equal(room.pendingPacks,0);assert.ok(!room.enemies.some(e=>e.boss));
  room.enemies=[];room.step(.1);room.step(1.1);assert.equal(room.enemies.length,1);assert.equal(room.enemies[0].boss,true);assert.equal(room.bossPending,false);
  assert.equal(room.wave,1);assert.equal(room.snapshot().pendingEnemies,0);
});

test('leader permissions, ready checks and leader transfer survive disconnects',()=>{
  const room=new Room('TEST02'),host=room.addPlayer('host'),ally=room.addPlayer('ally');
  assert.throws(()=>room.start(ally.id),/リーダー/);assert.throws(()=>room.start(host.id),/全員/);
  room.removePlayer(host.id);assert.equal(room.host,ally.id);room.ready(ally.id,true);room.start(ally.id);assert.equal(room.status,'playing');
});

test('bullets pass through teammates without damaging them; kill rewards supply everyone',()=>{
  const room=squad(2),[shooter,ally]=room.players.values();
  shooter.x=0;shooter.z=-35;shooter.a=0;shooter.pitch=0;shooter.input={aim:true};ally.x=0;ally.z=-25;
  room.enemies=[{id:900,type:'spitter',x:0,z:-15,size:2,hp:60,maxHp:60,hit:0}];
  room.fire(shooter);assert.equal(ally.hp,100);assert.equal(room.enemies[0].hp,24);
  shooter.reserve=0;ally.reserve=0;room.time+=.2;room.fire(shooter);
  assert.equal(ally.hp,100);assert.equal(room.kills,1);assert.equal(shooter.kills,1);assert.equal(ally.kills,0);
  assert.equal(shooter.reserve,WEAPONS[shooter.weapon].supply);assert.equal(ally.reserve,WEAPONS[ally.weapon].supply);
});

test('rocket explosions never hurt teammates and server controls shot cadence and ammo',()=>{
  const room=squad(2),[shooter,ally]=room.players.values();shooter.weapon='rocket';room.refill(shooter);
  ally.x=0;ally.z=-15;shooter.x=0;shooter.z=-35;room.enemies=[];
  room.explosion({x:0,y:1,z:-15,splash:8,damage:210,playerId:shooter.id});assert.equal(ally.hp,100);
  room.fire(shooter);room.fire(shooter);assert.equal(shooter.ammo,0);assert.equal(room.projectiles.length,1);
  room.time+=10;room.fire(shooter);assert.equal(shooter.ammo,0);assert.ok(shooter.reloading>0);
});

test('expanded rocket splash keeps direct hits powerful, spares distant enemies and reloads faster',()=>{
  const room=squad(1),p=room.players.get(room.host);p.weapon='rocket';room.refill(p);p.x=0;p.z=-35;p.a=0;p.pitch=0;
  const target={id:801,type:'spitter',x:0,z:-15,size:2,hp:60,maxHp:60},near={id:802,type:'spitter',x:1,z:-15,size:2,hp:30,maxHp:30},far={id:803,type:'spitter',x:7,z:-15,size:2,hp:60,maxHp:60};
  room.enemies=[target,near,far];room.fire(p);const rocket=room.projectiles[0];assert.equal(rocket.splash,4);
  rocket.x=0;rocket.y=2.4;rocket.z=-16.9;room.explosion(rocket,target);
  assert.ok(!room.enemies.includes(target));assert.ok(!room.enemies.includes(near));assert.equal(far.hp,60);
  room.reload(p);assert.equal(p.reloading,2.3);
});

test('movement and ammo are authoritative, invalid input cannot teleport or create ammo',()=>{
  const room=squad(1),p=room.players.get(room.host),oldAmmo=p.ammo,x=p.x,z=p.z;
  room.input(p.id,{forward:999,side:999,a:NaN,pitch:Infinity,x:9999,z:9999,ammo:9999,reserve:9999});room.step(.05);
  assert.ok(Math.hypot(p.x-x,p.z-z)<1);assert.equal(p.ammo,oldAmmo);assert.ok(Number.isFinite(p.a));assert.ok(Number.isFinite(p.pitch));
  p.ammo=0;p.reserve=2;room.input(p.id,{reload:true});room.step(.05);room.input(p.id,{});
  for(let i=0;i<40;i++)room.step(.05);assert.equal(p.ammo,2);assert.equal(p.reserve,0);
});

test('all players share enemy damage, one kill, depletion and shield weapon matchups',()=>{
  const room=squad(2),[p1,p2]=room.players.values();
  p1.weapon='smg';p2.weapon='sniper';const enemy=room.enemies.find(e=>e.type==='shield');
  room.damageEnemy(enemy,20,p1);assert.equal(enemy.shield,40);assert.equal(enemy.hp,65);
  room.damageEnemy(enemy,100,p2);assert.equal(enemy.shield,0);assert.equal(enemy.hp,65);
  room.damageEnemy(enemy,165,p2);const kills=room.kills;room.damageEnemy(enemy,165,p1);assert.equal(room.kills,kills);assert.equal(p2.kills,1);
});

test('downed teammates return next wave; squad wipe ends the shared mission',()=>{
  const room=squad(2),[p1,p2]=room.players.values();room.damagePlayer(p2,100);assert.equal(p2.hp,0);room.enemies=[];room.pendingPacks=0;room.bossPending=false;
  for(let i=0;i<61;i++)room.step(.05);assert.equal(room.wave,2);assert.equal(p2.hp,100);assert.equal(room.enemies.length,11);
  room.damagePlayer(p1,100);room.damagePlayer(p2,100);room.step(.05);assert.equal(room.status,'lost');assert.equal(room.projectiles.length,0);
});

async function waitFor(client,predicate,timeout=3000){
  const found=client.messages.find(predicate);if(found)return found;
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{client.ws.off('message',onMessage);reject(Error('Timed out waiting for WebSocket message'))},timeout);function onMessage(raw){const data=JSON.parse(raw.toString());if(predicate(data)){clearTimeout(timer);client.ws.off('message',onMessage);resolve(data)}}client.ws.on('message',onMessage)});
}
async function connect(url,code,name){
  const ws=new WebSocket(url),client={ws,messages:[]};ws.on('message',raw=>{client.messages.push(JSON.parse(raw.toString()));if(client.messages.length>100)client.messages.shift()});
  await once(ws,'open');ws.send(JSON.stringify({type:'join',code,name,weapon:'ar'}));return client;
}

test('10 real WebSocket clients share one mission, cap the room and transfer leadership',async t=>{
  const game=createGameServer();game.server.listen(0,'127.0.0.1');await once(game.server,'listening');t.after(()=>game.close());
  const port=game.server.address().port,url='ws://127.0.0.1:'+port+'/ws';
  const host=await connect(url,'','host'),joined=await waitFor(host,m=>m.type==='joined'),code=joined.code,clients=[host];
  for(let i=1;i<10;i++){const client=await connect(url,code,'p'+i);await waitFor(client,m=>m.type==='joined');clients.push(client)}
  const full=await waitFor(host,m=>m.type==='state'&&m.players.length===10);assert.equal(full.code,code);
  const extra=await connect(url,code,'extra');const error=await waitFor(extra,m=>m.type==='error');assert.match(error.message,/満員/);extra.ws.close();
  for(const client of clients)client.ws.send(JSON.stringify({type:'ready',ready:true}));
  await waitFor(host,m=>m.type==='state'&&m.players.length===10&&m.players.every(p=>p.ready));host.ws.send(JSON.stringify({type:'start'}));
  const states=await Promise.all(clients.map(c=>waitFor(c,m=>m.type==='state'&&m.status==='playing')));
  assert.ok(states.every(s=>s.enemies.length===8&&s.pendingEnemies===73&&s.enemyBudget===81&&s.players.length===10));assert.deepEqual(states.map(s=>s.enemies[0].id),Array(10).fill(states[0].enemies[0].id));
  const room=game.rooms.get(code),shooter=room.players.get(joined.id);shooter.x=0;shooter.z=-35;
  room.enemies=[{id:9901,type:'spitter',x:0,z:-15,size:2,hp:60,maxHp:60,speed:0,hit:0,attack:100,rangedCooldown:100,areaCooldown:100,phase:0}];
  host.ws.send(JSON.stringify({type:'fire',a:0,pitch:0,aim:true}));host.ws.send(JSON.stringify({type:'input',fire:false}));
  const clickState=await waitFor(host,m=>m.type==='state'&&m.players.find(p=>p.id===joined.id)?.ammo===29);
  assert.equal(clickState.enemies.find(e=>e.id===9901).hp,24,'a short click must shoot even between server ticks');
  host.ws.close();const transfer=await waitFor(clients[1],m=>m.type==='state'&&m.status==='playing'&&m.players.length===9);assert.notEqual(transfer.host,joined.id);
  const health=await fetch('http://127.0.0.1:'+port+'/health');assert.equal(health.status,200);assert.equal((await health.json()).maxPlayers,10);
  assert.equal((await fetch('http://127.0.0.1:'+port+'/server.cjs')).status,404);
});


test('rocket splash deals full damage through 80 percent and 75 percent at the edge',()=>{
  const room=squad(1),p=room.players.get(room.host);p.weapon='rocket';
  // Distance is measured to the enemy hull; centers share the blast height.
  const targets=[0,3.19,3.2,3.21,3.99,4.01].map((dist,i)=>({id:900+i,type:'spitter',x:dist+.6,z:0,size:1,hp:1000,maxHp:1000}));
  room.enemies=targets;room.explosion({x:0,y:.7,z:0,splash:4,damage:260,playerId:p.id});
  assert.deepEqual(targets.map(e=>1000-e.hp),[260,260,260,195,195,0]);
});


test('online shooting and melee have visible windups before damage',()=>{
  const room=squad(1),p=room.players.get(room.host);
  const e={id:999,type:'spitter',role:'spitter',x:0,z:-15,size:2.1,hp:60,maxHp:60,speed:3,phase:0,hit:0,attack:0,rangedCooldown:0,areaCooldown:100};
  room.enemies=[e];room.pendingPacks=0;room.bossPending=false;p.x=0;p.z=-35;
  room.step(.05);assert.ok(e.shotWindup>0);assert.equal(room.projectiles.length,0);assert.equal(e.z,-15);
  room.step(.3);assert.equal(room.projectiles.length,0);room.step(.3);assert.ok(room.projectiles.length>0);
  e.x=p.x;e.z=p.z+2;e.shotWindup=0;e.rangedCooldown=100;room.projectiles=[];
  room.step(.05);assert.ok(e.meleeWindup>0);assert.equal(p.hp,100);
  p.z-=10;room.step(.5);assert.equal(p.hp,100);
  e.type='artillery';e.role='artillery';e.areaCooldown=0;room.step(.05);
  assert.ok(e.areaWindup>0);assert.ok(room.hazards[0].remaining>0);
  assert.ok(room.snapshot().enemies[0].areaWindup>0);
});
