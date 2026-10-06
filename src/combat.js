const WEAPONS=EarthGuardRules.WEAPONS;
let selectedWeapon='ar',reserve=120,projectiles=[],hazards=[],blasts=[],aiming=false,aimPitch=0;
function weapon(){return WEAPONS[selectedWeapon]}
function cameraFocal(){return W*.72*(aiming?(selectedWeapon==='sniper'?2.8:1.35):1)}
function cameraHorizon(){return H*.5+aimPitch*cameraFocal()}
function pickWeapon(id){
  if(!WEAPONS[id])return;selectedWeapon=id;
  for(const key of Object.keys(WEAPONS)){
    const card=$('weapon-'+key);card.classList[key===id?'add':'remove']('selected');card.setAttribute('aria-pressed',String(key===id));
  }
  const w=weapon();$('loadout-summary').textContent=w.name+' / 初期弾薬 '+w.mag+' + '+w.reserve+' 発';
}
function openLoadout(){
  $('loadout').classList.remove('hidden');pickWeapon(selectedWeapon);$('weapon-'+selectedWeapon).focus();
}
function closeLoadout(){$('loadout').classList.add('hidden');$('start').focus()}
function setupLoadout(){
  for(const id of Object.keys(WEAPONS))$('weapon-'+id).onclick=()=>pickWeapon(id);
  $('loadout-start').onclick=()=>{$('loadout').classList.add('hidden');start()};
  $('loadout-back').onclick=closeLoadout;
}
// Earliest entry into an axis-aligned volume, also used for cover and swept
// projectile collision so fast projectiles cannot skip through walls.
function segmentBox(a,b,min,max){
  let enter=0,exit=1;
  for(const axis of ['x','y','z']){
    const delta=b[axis]-a[axis];
    if(Math.abs(delta)<1e-8){if(a[axis]<min[axis]||a[axis]>max[axis])return null;continue}
    let t0=(min[axis]-a[axis])/delta,t1=(max[axis]-a[axis])/delta;
    if(t0>t1)[t0,t1]=[t1,t0];enter=Math.max(enter,t0);exit=Math.min(exit,t1);
    if(enter>exit)return null;
  }
  return enter;
}
function wallHit(a,b){
  let first=null;
  for(const building of buildings){
    const t=segmentBox(a,b,{x:building.x-building.w/2,y:0,z:building.z-building.d/2},{x:building.x+building.w/2,y:building.h+.5,z:building.z+building.d/2});
    if(t!==null&&(first===null||t<first))first=t;
  }
  return first;
}
function segmentSphere(a,b,center,radius){
  const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,ox=a.x-center.x,oy=a.y-center.y,oz=a.z-center.z;
  const aa=dx*dx+dy*dy+dz*dz,bb=2*(ox*dx+oy*dy+oz*dz),cc=ox*ox+oy*oy+oz*oz-radius*radius;
  if(cc<=0)return 0;if(aa<1e-10)return null;
  const disc=bb*bb-4*aa*cc;if(disc<0)return null;
  const t=(-bb-Math.sqrt(disc))/(2*aa);return t>=0&&t<=1?t:null;
}
function enemyCenter(e){return {x:e.x,y:e.size*.7,z:e.z}}
function damagePlayer(amount){
  if(mode!=='play'||paused)return;
  player.hp=Math.max(0,player.hp-amount);hurt=.3;sound(50,.12,'sawtooth');updateHUD();
  if(player.hp<=0)finish(false);
}
function damageEnemy(e,amount,weaponId=selectedWeapon){
  if(!enemies.includes(e))return;
  const result=applyWeaponDamage(e,amount,weaponId);e.hp=Math.max(0,e.hp-result.damage);e.hit=.16;showHitFeedback(e,result);
  for(let i=0;i<7;i++)particles.push({x:e.x,y:e.size,z:e.z,vx:(Math.random()-.5)*8,vy:Math.random()*6,vz:(Math.random()-.5)*8,life:.6});
  if(e.hp===0){
    enemies.splice(enemies.indexOf(e),1);kills++;destroyEnemy(e);
    const w=weapon(),gain=Math.min(w.maxReserve-reserve,w.supply*(e.boss?4:1));reserve+=gain;
    sound(60,.2,'triangle');
    if(e.boss){player.hp=Math.min(100,player.hp+25);notice('ボス撃破 / 弾薬 +'+gain+' / 装甲 +25')}
    else if(kills%6===0){player.hp=Math.min(100,player.hp+12);notice('補給 / 弾薬 +'+gain+' / 装甲 +12')}
    $('supply-notice').textContent='撃破補給 +'+gain+' 発';supplyTime=2;
  }
  updateHUD();
}
let supplyTime=0;
function fireWeapon(){
  const w=weapon();
  if(mode!=='play'||paused||reloading||clock-lastShot<w.interval)return;
  if(!ammo){if(reserve)reload();else notice('弾薬切れ — 再出撃で装備を選択');return}
  ammo--;lastShot=clock;flash=w.interval>.5?.12:.055;
  const spread=aiming?w.aimSpread:w.spread,angle=player.a+(Math.random()-.5)*spread*2,pitch=aimPitch+(Math.random()-.5)*spread*2;
  const norm=Math.sqrt(1+pitch*pitch),dir={x:Math.sin(angle)/norm,y:pitch/norm,z:Math.cos(angle)/norm},origin={x:player.x,y:player.y,z:player.z};
  sound(selectedWeapon==='sniper'?65:selectedWeapon==='rocket'?40:110,.12,'sawtooth',.055);
  if(selectedWeapon==='rocket'){
    projectiles.push({...origin,vx:dir.x*45,vy:dir.y*45,vz:dir.z*45,life:w.range/45,radius:.25,owner:'player',damage:w.damage,splash:w.radius,color:'#ffcb85'});
  }else{
    const end={x:origin.x+dir.x*w.range,y:origin.y+dir.y*w.range,z:origin.z+dir.z*w.range};
    let first=wallHit(origin,end)??1,target=null;
    for(const e of enemies){const t=segmentSphere(origin,end,enemyCenter(e),e.size*.8);if(t!==null&&t<first){first=t;target=e}}
    if(target){const distance=first*w.range,falloff=distance>w.falloff?Math.max(.4,1-(distance-w.falloff)/(w.range-w.falloff)*.6):1;damageEnemy(target,Math.max(1,Math.round(w.damage*falloff)))}
    const point={x:origin.x+(end.x-origin.x)*first,y:origin.y+(end.y-origin.y)*first,z:origin.z+(end.z-origin.z)*first};
    blasts.push({...point,radius:.22,life:.12,maxLife:.12,color:w.color});
  }
  updateHUD();
}
function spit(e){
  const origin=enemyCenter(e),dx=player.x-origin.x,dy=player.y-origin.y,dz=player.z-origin.z;
  const len=Math.hypot(dx,dy,dz)||1,speed=e.boss?17:enemyType(e).shotSpeed||12;
  for(const angle of e.boss?[-.12,0,.12]:[0]){
    const c=Math.cos(angle),s=Math.sin(angle);
    projectiles.push({...origin,vx:(dx*c-dz*s)/len*speed,vy:dy/len*speed,vz:(dz*c+dx*s)/len*speed,life:5,radius:e.boss?.55:.32,owner:'enemy',damage:e.boss?14:enemyType(e).damage||7,color:enemyType(e).color});
  }
  e.hit=.12;
}
function warnArea(e){
  const radius=e.boss?6:3.5;
  hazards.push({x:player.x,z:player.z,radius,windup:e.boss?1.6:1.9,remaining:e.boss?1.6:1.9,life:0,damage:e.boss?22:10,boss:!!e.boss});
  e.areaWindup=e.boss?1.6:1.9;
}
function updateEnemyRanged(e,dt,dist){
  e.areaWindup=Math.max(0,(e.areaWindup||0)-dt);
  e.rangedCooldown=(e.rangedCooldown??3)-dt;e.areaCooldown=(e.areaCooldown??8)-dt;
  const busy=e.chargeTime>0||e.chargeWindup>0;
  if(e.shotWindup>0){e.shotWindup=Math.max(0,e.shotWindup-dt);if(e.shotWindup===0){spit(e);e.rangedCooldown=e.boss?3.3:(enemyType(e).cooldown||5)+Math.random()*1.5}}
  else if(!busy&&dist>6&&dist<(e.type==='marksman'?100:65)&&e.rangedCooldown<=0){
    e.shotWindup=e.type==='marksman'?.9:.6;
  }
  if(!busy&&dist<60&&e.areaCooldown<=0&&(e.boss||e.role==='artillery')){warnArea(e);e.areaCooldown=e.boss?8:11}
}
function explode(p,directTarget=null){
  blasts.push({x:p.x,y:Math.max(.2,p.y),z:p.z,radius:p.splash,life:.5,maxLife:.5,color:'#ffb56a'});
  sound(35,.3,'sawtooth',.06);
  for(const e of [...enemies]){
    const center=enemyCenter(e),dist=Math.max(0,Math.hypot(e.x-p.x,center.y-p.y,e.z-p.z)-e.size*.6);
    if((e===directTarget||dist<p.splash)&&wallHit(p,center)===null)damageEnemy(e,e===directTarget?p.damage:Math.round(p.damage*(dist<=p.splash*.8?1:.75)),'rocket');
  }
  const dist=Math.hypot(player.x-p.x,player.y-p.y,player.z-p.z);
  if(dist<p.splash*.65&&wallHit(p,player)===null)damagePlayer(Math.round(30*(1-dist/(p.splash*.65))));
}
function updateCombat(dt){
  supplyTime-=dt;if(supplyTime<=0)$('supply-notice').textContent='';
  for(const p of projectiles){
    const old={x:p.x,y:p.y,z:p.z},next={x:p.x+p.vx*dt,y:p.y+p.vy*dt,z:p.z+p.vz*dt};
    let first=wallHit(old,next)??2,target=null;
    if(next.y<=0&&old.y>0)first=Math.min(first,old.y/(old.y-next.y));
    if(p.owner==='player'){
      for(const e of enemies){const t=segmentSphere(old,next,enemyCenter(e),e.size*.8+p.radius);if(t!==null&&t<first){first=t;target=e}}
    }else{
      const t=segmentSphere(old,next,{x:player.x,y:player.y-1,z:player.z},1.3+p.radius);if(t!==null&&t<first){first=t;target=player}
    }
    p.x=old.x+(next.x-old.x)*Math.min(1,first);p.y=old.y+(next.y-old.y)*Math.min(1,first);p.z=old.z+(next.z-old.z)*Math.min(1,first);p.life-=dt;
    if(first<=1){
      p.life=0;
      if(p.owner==='player'){
        // Keep a wall impact just outside the wall so its blast can reach
        // enemies on this side while cover still protects the other side.
        const speed=Math.hypot(p.vx,p.vy,p.vz)||1;
        p.x-=p.vx/speed*.035;p.y-=p.vy/speed*.035;p.z-=p.vz/speed*.035;
        explode(p,target);
      }else if(target===player)damagePlayer(p.damage);
      else blasts.push({x:p.x,y:p.y,z:p.z,radius:.5,life:.2,maxLife:.2,color:p.color});
    }
    if(mode!=='play')return;
  }
  projectiles=projectiles.filter(p=>p.life>0);
  for(const h of hazards){
    if(h.remaining>0){h.remaining-=dt;if(h.remaining<=0){h.life=.65;blasts.push({x:h.x,y:.2,z:h.z,radius:h.radius,life:.65,maxLife:.65,color:'#ff7852'});if(Math.hypot(player.x-h.x,player.z-h.z)<h.radius)damagePlayer(h.damage)}}else h.life-=dt;
    if(mode!=='play')return;
  }
  hazards=hazards.filter(h=>h.remaining>0||h.life>0);
  updateDangerHUD();updateEnemyEffects(dt);updateEnemyIntel();
  for(const b of blasts)b.life-=dt;blasts=blasts.filter(b=>b.life>0);
}
function updateDangerHUD(){
  $('danger-warning').textContent='';$('danger-warning').classList.remove('active');
}
function drawHazards(){
  for(const h of hazards){
    const points=[],inner=[],pulse=.65+Math.sin(clock*12)*.2;
    for(let i=0;i<40;i++){const a=i/40*Math.PI*2;points.push([h.x+Math.cos(a)*h.radius,.045,h.z+Math.sin(a)*h.radius]);inner.push([h.x+Math.cos(a)*h.radius*.91,.05,h.z+Math.sin(a)*h.radius*.91])}
    poly(points,`rgba(255,89,53,${h.remaining>0?.28*pulse:.65})`);
    for(let i=0;i<40;i++)poly([points[i],points[(i+1)%40],inner[(i+1)%40],inner[i]],'#ff9c71');
    // The filling inner disk shows the time to impact without a text overlay.
    if(h.remaining>0){const progress=1-Math.max(0,h.remaining)/h.windup,fill=[];for(let i=0;i<40;i++){const a=i/40*Math.PI*2;fill.push([h.x+Math.cos(a)*h.radius*progress,.055,h.z+Math.sin(a)*h.radius*progress])}poly(fill,'rgba(255,122,68,.35)')}
  }
}
function drawCombatObject(p,blast=false){
  const point=project(p.x,p.y,p.z);if(!point)return;
  const radius=Math.min(W*.6,Math.max(3,point.s*p.radius*(blast?1-p.life/p.maxLife+.3:1)));
  ctx.save();ctx.globalAlpha=blast?Math.max(0,p.life/p.maxLife):1;
  ctx.fillStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=blast?12:18;
  ctx.beginPath();ctx.arc(point.x,point.y,radius,0,Math.PI*2);if(p.ring){ctx.strokeStyle=p.color;ctx.lineWidth=Math.max(2,point.s*.07);ctx.stroke()}else ctx.fill();ctx.restore();
}
