const {moveEnemy,WEAPONS,ENEMY_TYPES,segmentBox,segmentSphere,createBuildings,MAX_PLAYERS}=require('../src/rules.js');
const crypto=require('node:crypto');
const buildings=createBuildings(),roster=['scout','spitter','artillery','heavy','shield','marksman'];
const finite=(n,min,max,fallback=0)=>typeof n==='number'&&Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
function wallHit(a,b){let hit=null;for(const o of buildings){const t=segmentBox(a,b,{x:o.x-o.w/2,y:0,z:o.z-o.d/2},{x:o.x+o.w/2,y:o.h+.5,z:o.z+o.d/2});if(t!==null&&(hit===null||t<hit))hit=t}return hit}
function center(e){return {x:e.x,y:e.size*.7,z:e.z}}
function enemyCount(wave,players){return (5+wave*3)*Math.max(1,Math.min(MAX_PLAYERS,players))}

class Room{
  constructor(code){this.code=code;this.players=new Map();this.host=null;this.status='lobby';this.wave=0;this.enemies=[];this.projectiles=[];this.hazards=[];this.events=[];this.kills=0;this.time=0;this.sequence=0;this.nextId=1;this.delay=0;this.scaledPlayers=0;this.pendingPacks=0;this.releasedPacks=0;this.bossPending=false;this.spawnTimer=0;this.updated=Date.now()}
  emit(type,data={}){this.events.push({type,...data});if(this.events.length>300)this.events.shift()}
  addPlayer(name,weapon='ar'){
    if(this.players.size>=MAX_PLAYERS)throw Error('満員です。最大10人まで参加できます。');
    const id=crypto.randomUUID(),slot=this.players.size;
    const p={id,name:String(name||'隊員').replace(/[\x00-\x1f]/g,'').slice(0,16),weapon:WEAPONS[weapon]?weapon:'ar',ready:false,x:(slot%5-2)*2,z:-35-Math.floor(slot/5)*3,y:2.4,a:0,pitch:0,hp:100,kills:0,ammo:0,reserve:0,reloading:0,lastShot:-10,dodge:0,dodgeCooldown:0,input:{},lastInput:this.time,seq:0};
    this.refill(p);this.players.set(id,p);this.host ||= id;this.updated=Date.now();
    if(this.status==='playing'){
      const alive=[...this.players.values()].find(o=>o.id!==id&&o.hp>0);if(alive){p.x=Math.max(-10,Math.min(10,alive.x));p.z=alive.z-4}
      const increase=Math.max(0,this.players.size-this.scaledPlayers);
      if(increase){this.pendingPacks+=increase;this.spawnTimer=Math.min(this.spawnTimer,2);const boss=this.enemies.find(e=>e.boss);if(boss){const extra=(18+this.wave*8)*30*.6*increase;boss.hp+=extra;boss.maxHp+=extra}this.scaledPlayers=this.players.size}
      this.emit('notice',{text:p.name+' が合流 / 敵部隊増援'});
    }
    return p;
  }
  removePlayer(id){this.players.delete(id);if(this.host===id)this.host=this.players.keys().next().value||null;if(this.status==='playing'&&this.players.size&&![...this.players.values()].some(p=>p.hp>0))this.end(false);this.updated=Date.now()}
  refill(p){const w=WEAPONS[p.weapon];p.ammo=w.mag;p.reserve=w.reserve;p.reloading=0;p.lastShot=-10;p.dodge=0;p.dodgeCooldown=0;p.input={};p.hp=100}
  ready(id,value){if(this.status==='lobby'||this.status==='won'||this.status==='lost'){const p=this.players.get(id);if(p)p.ready=!!value}}
  start(id){
    if(id!==this.host)throw Error('開始できるのはルームリーダーです。');
    if(this.status==='playing')throw Error('作戦は既に開始しています。');
    if(!this.players.size||![...this.players.values()].every(p=>p.ready))throw Error('全員が準備完了にしてから開始してください。');
    this.status='playing';this.wave=1;this.kills=0;this.enemies=[];this.projectiles=[];this.hazards=[];this.delay=0;
    let index=0;for(const p of this.players.values()){this.refill(p);p.kills=0;p.x=(index%5-2)*2;p.z=-35-Math.floor(index/5)*3;p.a=0;p.pitch=0;index++}this.spawnWave();
    this.emit('started');
  }
  input(id,data){
    const p=this.players.get(id);if(!p||this.status!=='playing')return;
    p.input={forward:finite(data.forward,-1,1),side:finite(data.side,-1,1),fire:data.fire===true,aim:data.aim===true,reload:data.reload===true,dodge:data.dodge===true};
    p.a=finite(data.a,-100000,100000,p.a);p.pitch=finite(data.pitch,-.85,.85,p.pitch);p.seq=finite(data.seq,0,1e12,p.seq);p.lastInput=this.time;
  }
  spawnNormals(count){
    const team=[...this.players.values()],origin=team.find(p=>p.hp>0)||team[0]||{x:0,z:-35,a:0};
    for(let i=0;i<count;i++){
      const type=roster[i%6],t=ENEMY_TYPES[type],angle=(Math.random()-.5)*2.5+origin.a,dist=35+Math.random()*40,hp=Math.round(t.hp*(1+(this.wave-1)*.12));
      let x=origin.x+Math.sin(angle)*dist,z=origin.z+Math.cos(angle)*dist;
      if(buildings.some(b=>Math.abs(x-b.x)<b.w/2+1&&Math.abs(z-b.z)<b.d/2+1)){x=(Math.random()-.5)*18}
      this.enemies.push({id:this.nextId++,type,role:type,x,z,hp,maxHp:hp,shield:t.shield||0,maxShield:t.shield||0,size:t.size,speed:t.speed+this.wave*.15,phase:Math.random()*10,hit:0,attack:0,rangedCooldown:2+i*.1,areaCooldown:7+i*.2});moveEnemy(this.enemies[this.enemies.length-1],0,0,buildings);
    }
  }
  spawnWave(){
    this.scaledPlayers=this.players.size;this.pendingPacks=this.scaledPlayers;this.releasedPacks=0;this.bossPending=true;this.spawnTimer=0;this.releasePack();
    this.emit('notice',{text:`WAVE ${this.wave} / ${this.players.size}人 — 1人分ずつ段階増援`});
  }
  releasePack(){
    if(this.pendingPacks>0){this.spawnNormals(5+this.wave*3);this.pendingPacks--;this.releasedPacks++;this.spawnTimer=8;this.emit('notice',{text:`増援 ${this.releasedPacks} / ${this.scaledPlayers} — 敵 ${5+this.wave*3}機`});return}
    if(this.bossPending){this.bossPending=false;this.spawnBoss();this.emit('notice',{text:'最終増援 — ラウンドボス出現'})}
  }
  spawnBoss(){
    const origin=[...this.players.values()].find(p=>p.hp>0)||{x:0,z:-35,a:0},hp=Math.round((18+this.wave*8)*30*(1+.6*(this.scaledPlayers-1)));
    this.enemies.push({id:this.nextId++,type:'boss',boss:true,x:origin.x+Math.sin(origin.a)*75,z:origin.z+Math.cos(origin.a)*75,hp,maxHp:hp,size:4.5+this.wave*.35,speed:2.1+this.wave*.25,phase:0,hit:0,attack:0,name:['タイラント','アーマード','クリムゾン','デヴァステイター','クイーン'][this.wave-1],rangedCooldown:3,areaCooldown:9,chargeCooldown:5,chargeWindup:0,chargeTime:0,chargeX:0,chargeZ:0});moveEnemy(this.enemies[this.enemies.length-1],0,0,buildings);
  }
  reload(p){const w=WEAPONS[p.weapon];if(!p.reloading&&p.ammo<w.mag&&p.reserve>0)p.reloading=w.reload}
  damagePlayer(p,damage){if(!p||p.hp<=0)return;p.hp=Math.max(0,p.hp-damage);this.emit('hurt',{playerId:p.id,damage});if(!p.hp){p.input={};this.emit('notice',{text:p.name+' 戦闘不能 / 次ウェーブで復帰'})}}
  damageEnemy(e,raw,attacker){
    if(!this.enemies.includes(e))return;
    const t=ENEMY_TYPES[e.type],w=attacker.weapon,multiplier=t.mods[w]||1;
    let hull=raw,shieldDamage=0;
    if(e.shield>0){const m=t.shieldMods?.[w]||1;shieldDamage=Math.min(e.shield,Math.round(raw*m));hull=Math.max(0,raw-e.shield/m);e.shield-=shieldDamage;if(!e.shield)this.emit('shieldBreak',{enemy:{...e}})}
    const damage=hull>0?Math.max(1,Math.round(hull*multiplier)):0;e.hp=Math.max(0,e.hp-damage);e.hit=.16;
    this.emit('hit',{playerId:attacker.id,enemyId:e.id,damage,shieldDamage,multiplier});
    if(!e.hp){
      this.enemies.splice(this.enemies.indexOf(e),1);this.kills++;attacker.kills++;
      // Every squad member receives ammo for their own weapon. The last hit
      // never makes the rest of the squad lose access to supplies.
      for(const p of this.players.values()){const weapon=WEAPONS[p.weapon];const gain=Math.min(weapon.maxReserve-p.reserve,weapon.supply*(e.boss?4:1));p.reserve+=gain;if(e.boss&&p.hp>0)p.hp=Math.min(100,p.hp+25);else if(this.kills%6===0&&p.hp>0)p.hp=Math.min(100,p.hp+12);this.emit('supply',{playerId:p.id,amount:gain})}
      this.emit('death',{enemy:{...e},playerId:attacker.id});
    }
  }
  fire(p){
    const w=WEAPONS[p.weapon];if(p.hp<=0||p.reloading||this.time-p.lastShot<w.interval)return;
    if(!p.ammo){this.reload(p);return}p.ammo--;p.lastShot=this.time;this.emit('shot',{playerId:p.id,weapon:p.weapon,x:p.x,z:p.z});
    const spread=p.input.aim?w.aimSpread:w.spread,a=p.a+(Math.random()-.5)*spread*2,pitch=p.pitch+(Math.random()-.5)*spread*2,norm=Math.sqrt(1+pitch*pitch),dir={x:Math.sin(a)/norm,y:pitch/norm,z:Math.cos(a)/norm},origin={x:p.x,y:2.4,z:p.z};
    if(p.weapon==='rocket'){this.projectiles.push({...origin,id:this.nextId++,vx:dir.x*45,vy:dir.y*45,vz:dir.z*45,life:w.range/45,radius:.25,owner:'player',playerId:p.id,damage:w.damage,splash:w.radius,color:w.color});return}
    const end={x:p.x+dir.x*w.range,y:2.4+dir.y*w.range,z:p.z+dir.z*w.range};let first=wallHit(origin,end)??1,target=null;
    for(const e of this.enemies){const hit=segmentSphere(origin,end,center(e),e.size*.8);if(hit!==null&&hit<first){first=hit;target=e}}
    if(target){const d=first*w.range,falloff=d>w.falloff?Math.max(.4,1-(d-w.falloff)/(w.range-w.falloff)*.6):1;this.damageEnemy(target,Math.round(w.damage*falloff),p)}
  }
  spit(e,target){
    const origin=center(e),dx=target.x-e.x,dy=2.4-origin.y,dz=target.z-e.z,len=Math.hypot(dx,dy,dz)||1,t=ENEMY_TYPES[e.type],speed=e.boss?17:t.shotSpeed;
    for(const a of e.boss?[-.12,0,.12]:[0])this.projectiles.push({...origin,id:this.nextId++,vx:(dx*Math.cos(a)-dz*Math.sin(a))/len*speed,vy:dy/len*speed,vz:(dz*Math.cos(a)+dx*Math.sin(a))/len*speed,life:5,radius:e.boss?.55:.32,owner:'enemy',damage:e.boss?14:t.damage,color:t.color});
    e.hit=.12;
  }
  area(e,target){e.areaWindup=e.boss?1.6:1.9;this.hazards.push({id:this.nextId++,x:target.x,z:target.z,radius:e.boss?6:3.5,windup:e.boss?1.6:1.9,remaining:e.boss?1.6:1.9,life:0,damage:e.boss?22:10,boss:!!e.boss})}
  explosion(p,directTarget=null){
    this.emit('explosion',{x:p.x,y:p.y,z:p.z,radius:p.splash});const attacker=this.players.get(p.playerId);
    if(attacker)for(const e of [...this.enemies]){const c=center(e),dist=Math.max(0,Math.hypot(c.x-p.x,c.y-p.y,c.z-p.z)-e.size*.6);if((e===directTarget||dist<p.splash)&&wallHit(p,c)===null)this.damageEnemy(e,e===directTarget?p.damage:Math.round(p.damage*(dist<=p.splash*.8?1:.75)),attacker)}
    // No friendly fire. Rocket self-damage still rewards careful aim.
    if(attacker){const dist=Math.hypot(attacker.x-p.x,2.4-p.y,attacker.z-p.z);if(dist<p.splash*.65&&wallHit(p,{...attacker,y:2.4})===null)this.damagePlayer(attacker,Math.round(30*(1-dist/(p.splash*.65))))}
  }
  step(dt=.05){
    this.time+=dt;if(this.status!=='playing')return;
    if(this.pendingPacks>0||this.bossPending){this.spawnTimer-=dt;if(!this.enemies.length)this.spawnTimer=Math.min(this.spawnTimer,1);if(this.spawnTimer<=0)this.releasePack()}
    for(const p of this.players.values()){
      if(!p.hp)continue;if(this.time-p.lastInput>.5)p.input={};const input=p.input,w=WEAPONS[p.weapon];
      if(p.reloading){p.reloading=Math.max(0,p.reloading-dt);if(!p.reloading){const loaded=Math.min(w.mag-p.ammo,p.reserve);p.ammo+=loaded;p.reserve-=loaded}}
      if(input.reload)this.reload(p);p.dodgeCooldown=Math.max(0,p.dodgeCooldown-dt);
      if(input.dodge&&!p.dodgeCooldown){p.dodge=.3;p.dodgeCooldown=1.2}p.dodge=Math.max(0,p.dodge-dt);
      const f=input.forward||0,s=input.side||0,n=Math.hypot(f,s)||1,speed=(p.dodge>0?22:8)*w.speed*(input.aim?.65:1);
      const x=Math.max(-110,Math.min(110,p.x+(Math.sin(p.a)*f+Math.cos(p.a)*s)/n*speed*dt)),z=Math.max(-90,Math.min(190,p.z+(Math.cos(p.a)*f-Math.sin(p.a)*s)/n*speed*dt));
      if(!buildings.some(b=>Math.abs(x-b.x)<b.w/2+.7&&Math.abs(z-b.z)<b.d/2+.7)){p.x=x;p.z=z}
      if(input.fire)this.fire(p);
    }
    const alive=[...this.players.values()].filter(p=>p.hp>0);
    if(!alive.length){this.end(false);return}
    for(const e of this.enemies){
      const target=alive.reduce((best,p)=>Math.hypot(p.x-e.x,p.z-e.z)<Math.hypot(best.x-e.x,best.z-e.z)?p:best),dx=target.x-e.x,dz=target.z-e.z,dist=Math.hypot(dx,dz),t=ENEMY_TYPES[e.type];
      e.hit=Math.max(0,e.hit-dt);e.attack-=dt;e.rangedCooldown-=dt;e.areaCooldown-=dt;e.areaWindup=Math.max(0,(e.areaWindup||0)-dt);let speed=e.speed,move=true;
      if(e.boss){
        const enraged=e.hp<=e.maxHp/2;speed*=enraged?1.5:1;
        if(e.chargeTime>0){e.chargeTime=Math.max(0,e.chargeTime-dt);moveEnemy(e,e.chargeX*18*dt,e.chargeZ*18*dt,buildings);move=false}
        else if(e.chargeWindup>0){e.chargeWindup=Math.max(0,e.chargeWindup-dt);move=false;if(!e.chargeWindup){e.chargeX=dx/(dist||1);e.chargeZ=dz/(dist||1);e.chargeTime=1.1;e.chargeCooldown=enraged?4:7}}
        else{e.chargeCooldown-=dt;if(e.chargeCooldown<=0&&dist>7&&dist<55&&!e.areaWindup&&!e.meleeWindup){e.chargeWindup=1.25;move=false;e.shotWindup=0}}
      }
      const busy=e.chargeTime>0||e.chargeWindup>0;
      if(e.shotWindup>0){e.shotWindup=Math.max(0,e.shotWindup-dt);if(!e.shotWindup){this.spit(e,target);e.rangedCooldown=e.boss?3.3:t.cooldown+Math.random()}}
      else if(!busy&&dist>6&&dist<(e.type==='marksman'?100:65)&&e.rangedCooldown<=0){e.shotWindup=e.type==='marksman'?.9:.6;}
      if(!busy&&dist<60&&e.areaCooldown<=0&&(e.boss||e.type==='artillery')){this.area(e,target);e.areaCooldown=e.boss?8:11}
      const reach=e.boss?e.size*.85:2.5,preferred=e.boss?reach:t.preferred;
      if(e.shotWindup>0||e.areaWindup>0||e.meleeWindup>0)move=false;
      if(move&&dist>preferred){moveEnemy(e,dx/(dist||1)*speed*dt,dz/(dist||1)*speed*dt,buildings)}
      else if(move&&['marksman','artillery'].includes(e.type)&&dist<preferred*.65){moveEnemy(e,-dx/(dist||1)*speed*.6*dt,-dz/(dist||1)*speed*.6*dt,buildings)}
      if(move&&e.type==='scout'&&dist>4){const strafe=Math.sin(this.time*2+e.phase)*2.1*dt;moveEnemy(e,dz/(dist||1)*strafe,-dx/(dist||1)*strafe,buildings)}
      const contact=alive.find(p=>p.hp>0&&Math.hypot(p.x-e.x,p.z-e.z)<=reach&&wallHit(center(e),p)===null);
      if(e.meleeWindup>0){e.meleeWindup=Math.max(0,e.meleeWindup-dt);if(!e.meleeWindup){e.attack=e.boss?1.25:1;if(contact)this.damagePlayer(contact,e.boss?16:8)}}
      else if(e.attack<=0&&contact){if(e.chargeTime>0){this.damagePlayer(contact,24);e.attack=1.25}else if(!e.shotWindup&&!e.areaWindup&&!e.chargeWindup)e.meleeWindup=.45}
    }
    for(const p of this.projectiles){
      const old={x:p.x,y:p.y,z:p.z},next={x:p.x+p.vx*dt,y:p.y+p.vy*dt,z:p.z+p.vz*dt};let first=wallHit(old,next)??2,target=null;
      if(next.y<=0&&old.y>0)first=Math.min(first,old.y/(old.y-next.y));
      for(const e of p.owner==='player'?this.enemies:alive.filter(a=>a.hp>0)){
        const c=p.owner==='player'?center(e):{x:e.x,y:1.4,z:e.z},r=p.owner==='player'?e.size*.8+p.radius:1.3+p.radius,hit=segmentSphere(old,next,c,r);
        if(hit!==null&&hit<first){first=hit;target=e}
      }
      p.x=old.x+(next.x-old.x)*Math.min(1,first);p.y=old.y+(next.y-old.y)*Math.min(1,first);p.z=old.z+(next.z-old.z)*Math.min(1,first);p.life-=dt;
      if(first<=1){p.life=0;if(p.owner==='player'){const speed=Math.hypot(p.vx,p.vy,p.vz)||1;p.x-=p.vx/speed*.035;p.y-=p.vy/speed*.035;p.z-=p.vz/speed*.035;this.explosion(p,target)}else if(target)this.damagePlayer(target,p.damage)}
    }
    this.projectiles=this.projectiles.filter(p=>p.life>0).slice(-500);
    for(const h of this.hazards){if(h.remaining>0){h.remaining-=dt;if(h.remaining<=0){h.life=.65;this.emit('explosion',{x:h.x,y:.2,z:h.z,radius:h.radius});for(const p of alive)if(p.hp>0&&Math.hypot(p.x-h.x,p.z-h.z)<h.radius)this.damagePlayer(p,h.damage)}}else h.life-=dt}this.hazards=this.hazards.filter(h=>h.remaining>0||h.life>0);
    if(![...this.players.values()].some(p=>p.hp>0)){this.end(false);return}
    if(!this.enemies.length&&!this.pendingPacks&&!this.bossPending){this.delay+=dt;if(this.delay>=3){this.delay=0;if(this.wave===5)this.end(true);else{this.wave++;let index=0;for(const p of this.players.values()){if(p.hp<=0){p.hp=100;p.x=(index%5-2)*2;p.z=-35;p.ammo=WEAPONS[p.weapon].mag;p.reserve=Math.max(p.reserve,WEAPONS[p.weapon].supply*2)}else p.hp=Math.min(100,p.hp+20);index++}this.projectiles=[];this.hazards=[];this.spawnWave()}}}else this.delay=0;
  }
  end(win){this.status=win?'won':'lost';for(const p of this.players.values()){p.ready=false;p.input={}}this.projectiles=[];this.hazards=[];this.emit('ended',{win})}
  snapshot(){
    return {type:'state',code:this.code,host:this.host,status:this.status,wave:this.wave,kills:this.kills,scaledPlayers:this.scaledPlayers,pendingEnemies:this.pendingPacks*(5+this.wave*3)+(this.bossPending?1:0),releasedPacks:this.releasedPacks,spawnTimer:this.spawnTimer,enemyBudget:enemyCount(this.wave||1,this.players.size)+1,maxPlayers:MAX_PLAYERS,seq:++this.sequence,time:this.time,players:[...this.players.values()].map(({input,lastInput,lastShot,...p})=>p),enemies:this.enemies,projectiles:this.projectiles,hazards:this.hazards,events:this.events.splice(0)};
  }
}
module.exports={Room,enemyCount,wallHit,MAX_PLAYERS};
