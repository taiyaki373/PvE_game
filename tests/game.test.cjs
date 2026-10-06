const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function game(saved='1.5'){
  const elements=new Map(),events={},storage=new Map([['earth-guard-sensitivity',saved]]);
  const gradient={addColorStop(){}};
  const context=new Proxy({createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(o,k)=>k in o?o[k]:()=>{}});
  const document={pointerLockElement:null,activeElement:null,body:{classList:{add(){}}},addEventListener(name,fn){events[name]=fn},exitPointerLock(){this.pointerLockElement=null}};
  document.getElementById=id=>{
    if(!elements.has(id)){
      const classes=new Set(id==='loadout'?['hidden']:[]),listeners={};
      const el={style:{},value:'',textContent:'',innerHTML:'',classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)},setAttribute(){},focus(){document.activeElement=el},addEventListener:(n,f)=>listeners[n]=f,listeners,getContext:()=>context,requestPointerLock(){document.pointerLockElement=el}};
      elements.set(id,el);
    }
    return elements.get(id);
  };
  const env={console,Math:Object.create(Math),innerWidth:1280,innerHeight:800,devicePixelRatio:1,document,window:{},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},addEventListener:(n,f)=>events[n]=f,performance:{now:()=>0},requestAnimationFrame(){},setInterval(){},URLSearchParams,location:{search:''}};
  vm.createContext(env);
  for(const file of ['src/rules.js','src/city.js','src/enemies.js','src/combat.js','src/network.js','src/game.js'])vm.runInContext(fs.readFileSync(file,'utf8'),env);
  return {read:code=>vm.runInContext(code,env),events,elements,storage,document};
}

test('saved sensitivity changes mouse rotation and survives a new session',()=>{
  const g=game();g.read('start()');
  g.events.mousemove({movementX:100});assert.equal(g.read('player.a'),.375);
  g.elements.get('sensitivity').listeners.input({target:{value:'0.2'}});
  g.events.mousemove({movementX:100});assert.ok(Math.abs(g.read('player.a')-.425)<1e-10);
  assert.equal(g.storage.get('earth-guard-sensitivity'),'0.2');
  assert.equal(game('0.2').read('sensitivity'),.2);
});

test('settings stop combat and clear held movement and shooting',()=>{
  const g=game();g.read('start();keys.KeyW=true;firing=true;openSettings()');
  const z=g.read('player.z'),hp=g.read('player.hp'),ammo=g.read('ammo');
  g.read('update(1)');assert.equal(g.read('player.z'),z);assert.equal(g.read('player.hp'),hp);assert.equal(g.read('ammo'),ammo);
  assert.equal(g.read('firing'),false);assert.equal(g.read('Object.keys(keys).length'),0);
  g.read('closeSettings()');assert.equal(g.read('paused'),false);assert.equal(g.document.pointerLockElement,g.elements.get('game'));
});

test('invalid preferences fall back to default; reset restores standard sensitivity',()=>{
  const g=game('not-a-number');assert.equal(g.read('sensitivity'),1);
  g.read('setSensitivity(2.5)');g.elements.get('settings-reset').onclick();assert.equal(g.read('sensitivity'),1);
});

test('city renders from every direction and near walls without runtime errors',()=>{
  const g=game();assert.ok(g.read('buildings.every(b=>b.mesh.length>100)'));
  for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5])g.read(`player.a=${angle};render()`);
  g.read('player.x=buildings[0].x;player.z=buildings[0].z-buildings[0].d/2-.8;render();start();render();');
});

test('every round has one boss with increasing health and a synced health display',()=>{
  const g=game();g.read('start()');let previous=0;
  for(let round=1;round<=5;round++){
    g.read(`wave=${round};enemies=[];spawnWave();releaseSoloBoss()`);
    assert.equal(g.read('enemies.filter(e=>e.boss).length'),1);
    assert.ok(g.read('enemies.every(e=>e.hp===e.maxHp)'));
    const hp=g.read('enemies.find(e=>e.boss).hp');assert.ok(hp>previous);previous=hp;
    assert.equal(g.elements.get('boss-hp').textContent,`${hp} / ${hp}`);
    assert.equal(g.elements.get('boss-hpbar').style.width,'100%');
  }
});

test('boss takes damage, blocks round completion and grants armor on defeat',()=>{
  const g=game();g.read('start();releaseSoloBoss();enemies=enemies.filter(e=>e.boss);const boss=enemies[0];boss.x=player.x;boss.z=player.z+20;clock=10;shoot()');
  assert.equal(g.read('enemies[0].hp'),g.read('enemies[0].maxHp-30'));
  assert.equal(g.elements.get('boss-hp').textContent,'750 / 780');
  g.read('update(3.1)');assert.equal(g.read('wave'),1);
  g.read('enemies[0].hp=1;enemies[0].x=player.x;enemies[0].z=player.z+20;player.hp=50;clock+=1;shoot()');
  assert.equal(g.read('enemies.length'),0);assert.equal(g.read('player.hp'),75);
  assert.equal(g.elements.get('boss-hud').classList.contains('hidden'),true);
  g.read('update(3.1)');assert.equal(g.read('wave'),2);
});

test('boss warns before charging and pauses its attack while settings are open',()=>{
  const g=game();g.read('start();releaseSoloBoss();enemies=enemies.filter(e=>e.boss);enemies[0].x=player.x;enemies[0].z=player.z+20;enemies[0].chargeCooldown=0;update(.1)');
  assert.ok(g.read('enemies[0].chargeWindup>0'));assert.equal(g.elements.get('boss-state').textContent,'');
  const z=g.read('enemies[0].z');g.read('openSettings();update(2)');assert.equal(g.read('enemies[0].z'),z);
  g.read('closeSettings();update(1.3);update(.1)');assert.ok(g.read('enemies[0].chargeTime>0'));assert.ok(g.read('enemies[0].z')<z);
});

test('all four loadout choices start with their own finite ammo and reload budgets',()=>{
  const g=game();
  for(const id of ['smg','ar','sniper','rocket']){
    g.read(`pickWeapon('${id}');start();enemies=[];ammo=0;reserve=2;reload();update(weapon().reload+.01)`);
    const capacity=g.read('weapon().mag');
    assert.equal(g.read('ammo'),Math.min(2,capacity));assert.equal(g.read('ammo+reserve'),2);
    g.read('ammo=0;reserve=0;reload();shoot()');assert.equal(g.read('reloading'),0);assert.equal(g.read('ammo+reserve'),0);
    assert.ok(!g.elements.get('ammo').innerHTML.includes('∞'));
    g.read('update(3.1)');assert.equal(g.read('ammo+reserve'),0,'round transitions must not refill ammo');
  }
});

test('killing enemies supplies only the equipped weapon, once per kill and up to its limit',()=>{
  const g=game();
  for(const id of ['smg','ar','sniper','rocket']){
    g.read(`pickWeapon('${id}');start();reserve=0;const target${id}=enemies[0];damageEnemy(target${id},999)`);
    assert.equal(g.read('reserve'),g.read('weapon().supply'));
    g.read(`damageEnemy(target${id},999)`);assert.equal(g.read('reserve'),g.read('weapon().supply'));
    g.read('reserve=weapon().maxReserve-1;damageEnemy(enemies[0],999)');assert.equal(g.read('reserve'),g.read('weapon().maxReserve'));
  }
});

test('SMG fires faster and sniper hits harder; ADS gives the sniper precise zoom',()=>{
  const g=game();g.read('Math.random=()=>.5;buildings.length=0');
  for(const id of ['smg','ar','sniper']){
    g.read(`pickWeapon('${id}');start();enemies=[{x:0,z:-20,size:2,hp:300,maxHp:300,hit:0,phase:0}];shoot()`);
    assert.equal(g.read('enemies[0].hp'),300-g.read('Math.round(weapon().damage*ENEMY_TYPES.spitter.mods[selectedWeapon])'));
    const ammo=g.read('ammo');g.read('clock+=weapon().interval*.5;shoot()');assert.equal(g.read('ammo'),ammo);
    g.read('clock+=weapon().interval;shoot()');assert.equal(g.read('ammo'),ammo-1);
  }
  g.read("pickWeapon('sniper');aiming=true");assert.equal(g.read('weapon().aimSpread'),0);assert.equal(g.read('cameraFocal()'),1280*.72*2.8);
});

test('rocket flies before impact and its splash can defeat multiple enemies',()=>{
  const g=game();g.read("buildings.length=0;pickWeapon('rocket');start();enemies=[{x:0,z:-15,size:2,hp:60,maxHp:60,hit:0,phase:0},{x:1,z:-15,size:2,hp:30,maxHp:30,hit:0,phase:0}];shoot()");
  assert.equal(g.read('enemies.length'),2);assert.equal(g.read('projectiles.length'),1);assert.equal(g.read('ammo'),0);
  g.read('updateCombat(.5)');assert.equal(g.read('enemies.length'),0);assert.equal(g.read('kills'),2);assert.equal(g.read('reserve'),10);
});

test('ordinary enemies spit dodgeable projectiles and walls stop their shots',()=>{
  const g=game();g.read('start();buildings.length=0;enemies=enemies.filter(e=>e.type==="spitter");const spitter=enemies[0];spitter.x=0;spitter.z=-15;spitter.rangedCooldown=0;updateEnemyRanged(spitter,.1,20)');
  assert.equal(g.read('projectiles.length'),0);assert.ok(g.read('spitter.shotWindup>0'));g.read('updateEnemyRanged(spitter,.6,20);updateCombat(2)');assert.equal(g.read('player.hp'),93);
  g.read('player.hp=100;spit(spitter);player.x=10;updateCombat(2)');assert.equal(g.read('player.hp'),100);
  g.read('projectiles=[];player.x=0;buildings.push({x:0,z:-25,w:8,d:2,h:10});spit(spitter);updateCombat(2)');assert.equal(g.read('player.hp'),100);assert.equal(g.read('projectiles.length'),0);
});

test('area attacks are telegraphed, can be escaped, and damage only once',()=>{
  const g=game();g.read('start();const artillery=enemies.find(e=>e.role===\'artillery\');warnArea(artillery);updateCombat(.5)');
  assert.equal(g.read('player.hp'),100);assert.ok(g.read('hazards[0].remaining>0'));
  g.read('updateCombat(1.5)');assert.equal(g.read('player.hp'),90);g.read('updateCombat(.2)');assert.equal(g.read('player.hp'),90);
  g.read('warnArea(artillery);player.x+=10;updateCombat(2)');assert.equal(g.read('player.hp'),90);
});

test('boss has ranged spread and area attacks in addition to its charge',()=>{
  const g=game();g.read('start();releaseSoloBoss();const boss=enemies.find(e=>e.boss);boss.x=0;boss.z=-15;boss.rangedCooldown=0;boss.areaCooldown=0;updateEnemyRanged(boss,.1,20)');
  assert.equal(g.read('projectiles.length'),0);assert.ok(g.read('boss.shotWindup>0'));g.read('updateEnemyRanged(boss,.6,20)');assert.equal(g.read('projectiles.filter(p=>p.owner===\'enemy\').length'),3);
  assert.equal(g.read('hazards.length'),1);assert.equal(g.read('hazards[0].boss'),true);
  g.read('openSettings();const before=hazards[0].remaining;update(3)');assert.equal(g.read('hazards[0].remaining'),g.read('before'));
});

test('restart clears every projectile and pending attack and draws each weapon',()=>{
  const g=game();
  for(const id of ['smg','ar','sniper','rocket']){
    g.read(`pickWeapon('${id}');start();spit(enemies[0]);warnArea(enemies[0]);drawGun();aiming=true;drawGun();start()`);
    assert.equal(g.read('projectiles.length+hazards.length+blasts.length'),0);
    assert.equal(g.read('aiming'),false);assert.equal(g.read('ammo'),g.read('weapon().mag'));
  }
});

test('rounds contain six distinct enemy types and draw their different silhouettes',()=>{
  const g=game();g.read('start()');assert.equal(g.read('new Set(enemies.filter(e=>!e.boss).map(e=>e.type)).size'),6);
  g.read('for(const e of enemies){e.x=0;e.z=player.z+15;drawDrone(e)}');
  assert.ok(g.read('enemies.find(e=>e.type===\'heavy\').hp>enemies.find(e=>e.type===\'scout\').hp'));
  assert.ok(g.read('enemies.find(e=>e.type===\'scout\').speed>enemies.find(e=>e.type===\'heavy\').speed'));
});

test('weapon matchups affect actual damage, with no immune enemy and weapon pairing',()=>{
  const g=game();g.read('start()');
  g.read("const heavy1=makeEnemy('heavy',0,0,1),heavy2=makeEnemy('heavy',0,0,1);enemies=[heavy1,heavy2];damageEnemy(heavy1,30,'smg');damageEnemy(heavy2,30,'rocket')");
  assert.equal(g.read('heavy1.hp'),135);assert.equal(g.read('heavy2.hp'),100);
  g.read("const scout1=makeEnemy('scout',0,0,1),scout2=makeEnemy('scout',0,0,1);enemies=[scout1,scout2];damageEnemy(scout1,20,'smg');damageEnemy(scout2,20,'sniper')");
  assert.equal(g.read('scout1.hp'),13);assert.equal(g.read('scout2.hp'),30);
  assert.ok(g.read('Object.values(ENEMY_TYPES).every(t=>Object.values(t.mods).every(m=>m>0))'));
});

test('SMG breaks shields efficiently, overflow reaches hull and rewards only a real kill',()=>{
  const g=game();g.read("pickWeapon('smg');start();const shieldEnemy=makeEnemy('shield',0,0,1);enemies=[shieldEnemy];reserve=0;damageEnemy(shieldEnemy,20,'smg')");
  assert.equal(g.read('shieldEnemy.shield'),40);assert.equal(g.read('shieldEnemy.hp'),65);assert.equal(g.read('kills'),0);assert.equal(g.read('reserve'),0);
  g.read("damageEnemy(shieldEnemy,30,'smg')");assert.equal(g.read('shieldEnemy.shield'),0);assert.equal(g.read('shieldEnemy.hp'),55);
  g.read("damageEnemy(shieldEnemy,100,'smg')");assert.equal(g.read('kills'),1);assert.equal(g.read('reserve'),14);
  g.read("const sniperShield=makeEnemy('shield',0,0,1);enemies=[sniperShield];damageEnemy(sniperShield,100,'sniper')");
  assert.equal(g.read('sniperShield.shield'),40);assert.equal(g.read('sniperShield.hp'),65);
});

test('marksman telegraphs its shot before firing a faster projectile',()=>{
  const g=game();g.read("start();const marksman=makeEnemy('marksman',0,player.z+30,1);enemies=[marksman];marksman.rangedCooldown=0;updateEnemyRanged(marksman,.1,30)");
  assert.equal(g.read('projectiles.length'),0);assert.ok(g.read('marksman.shotWindup>0'));
  g.read('updateEnemyRanged(marksman,1,30)');assert.equal(g.read('projectiles.length'),1);assert.ok(g.read('Math.hypot(projectiles[0].vx,projectiles[0].vy,projectiles[0].vz)>20'));
});

test('death effects are cosmetic, pause with combat, expire and reset on restart',()=>{
  const g=game();g.read('start();const defeated=enemies[0];damageEnemy(defeated,9999)');
  assert.equal(g.read('debris.length'),12);assert.ok(g.read('blasts.some(b=>b.ring)'));const kills=g.read('kills'),ammo=g.read('reserve');
  g.read('damageEnemy(defeated,9999)');assert.equal(g.read('debris.length'),12);assert.equal(g.read('kills'),kills);assert.equal(g.read('reserve'),ammo);
  g.read('openSettings();const remaining=debris[0].life;update(2)');assert.equal(g.read('debris[0].life'),g.read('remaining'));
  g.read('closeSettings();for(const d of debris)drawDebris(d);updateEnemyEffects(2)');assert.equal(g.read('debris.length'),0);
  g.read('damageEnemy(enemies[0],9999);start()');assert.equal(g.read('debris.length'),0);
});

test('solo boss charge stops at buildings instead of passing through',()=>{
  const g=game();g.read(`start();releaseSoloBoss();
    const b=buildings[0],boss=enemies.find(e=>e.boss);
    enemies=[boss];soloBossPending=false;
    boss.x=b.x-b.w/2-boss.size*.6-1;boss.z=b.z;
    boss.chargeTime=1;boss.chargeX=1;boss.chargeZ=0;
    update(.5);`);
  assert.ok(g.read('enemies[0].x<buildings[0].x-buildings[0].w/2-enemies[0].size*.6'));
});


test('solo rocket splash uses full inner damage and 75 percent outer damage',()=>{
  const g=game();g.read(`start();buildings.length=0;
    enemies=[0,3.19,3.2,3.21,3.99,4.01].map(dist=>({type:'spitter',x:dist+.6,z:0,size:1,hp:1000,maxHp:1000}));
    explode({x:0,y:.7,z:0,splash:EarthGuardRules.WEAPONS.rocket.radius,damage:EarthGuardRules.WEAPONS.rocket.damage});`);
  assert.deepEqual(Array.from(g.read('enemies.map(e=>1000-e.hp)')),[260,260,260,195,195,0]);
});


test('attack tells render without text warnings and melee can be dodged during windup',()=>{
  const g=game();g.read(`start();buildings.length=0;enemies=[makeEnemy('spitter',0,-33,1)];
    enemies[0].rangedCooldown=100;enemies[0].areaCooldown=100;update(.05)`);
  assert.equal(g.read('player.hp'),100);assert.ok(g.read('enemies[0].meleeWindup>0'));
  g.read('player.z=-45;update(.5)');assert.equal(g.read('player.hp'),100);
  for(const state of ['shotWindup=.6','areaWindup=1.9','chargeWindup=1.25','meleeWindup=.45'])g.read(`enemies[0].${state};drawDrone(enemies[0])`);
  g.read('warnArea(enemies[0]);updateDangerHUD();drawHazards()');
  assert.equal(g.elements.get('danger-warning').textContent,'');
});
