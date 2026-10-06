const ENEMY_TYPES=EarthGuardRules.ENEMY_TYPES;
let debris=[],hitFeedbackTime=0;
function enemyType(e){return ENEMY_TYPES[e.type]||ENEMY_TYPES[e.boss?'boss':e.role]||ENEMY_TYPES.spitter}
function makeEnemy(type,x,z,round,index=0){
  const t=ENEMY_TYPES[type],hp=Math.round(t.hp*(1+(round-1)*.12));
  return {type,role:type,x,z,hp,maxHp:hp,shield:t.shield||0,maxShield:t.shield||0,size:t.size,speed:t.speed+round*.15,phase:Math.random()*10,hit:0,attack:0,rangedCooldown:2+index*.45,areaCooldown:7+index*.5};
}
function applyWeaponDamage(e,amount,weaponId){
  const t=enemyType(e),multiplier=t.mods[weaponId]??1;
  let hullDamage=amount,shieldDamage=0;
  if(e.shield>0){
    const shieldMultiplier=t.shieldMods?.[weaponId]??1;
    shieldDamage=Math.min(e.shield,Math.round(amount*shieldMultiplier));
    hullDamage=Math.max(0,amount-e.shield/shieldMultiplier);
    e.shield-=shieldDamage;
    if(e.shield===0){
      blasts.push({x:e.x,y:e.size*.7,z:e.z,radius:e.size*1.25,life:.4,maxLife:.4,color:'#b8a2ff',ring:true});
      sound(650,.18,'triangle');
    }
  }
  return {damage:hullDamage>0?Math.max(1,Math.round(hullDamage*multiplier)):0,shieldDamage,multiplier};
}
function showHitFeedback(e,result){
  const shieldOnly=result.shieldDamage>0&&result.damage===0;
  $('hit-feedback').textContent=shieldOnly?'SHIELD −'+result.shieldDamage:result.multiplier>1.15?'有効！ −'+result.damage:result.multiplier<.9?'装甲耐性 −'+result.damage:'HIT −'+result.damage;
  $('hit-feedback').style.color=shieldOnly?'#b8a2ff':result.multiplier<.9?'#b3bfba':'#d7fb68';hitFeedbackTime=.65;
}
function destroyEnemy(e){
  const color=enemyType(e).color,center=enemyCenter(e),power=e.boss?2:1;
  blasts.push({...center,radius:e.size*1.2,life:e.boss?1.05:.6,maxLife:e.boss?1.05:.6,color,ring:true});
  blasts.push({...center,radius:e.size*.48,life:.25,maxLife:.25,color:'#fff3cb'});
  for(let i=0;i<(e.boss?28:12);i++){
    const a=Math.random()*Math.PI*2,speed=(2+Math.random()*5)*power,life=1+Math.random()*.6;
    debris.push({...center,vx:Math.cos(a)*speed,vy:2+Math.random()*6,vz:Math.sin(a)*speed,life,maxLife:life,size:(.1+Math.random()*.22)*power,spin:Math.random()*6,angle:Math.random()*6,color:i%3===0?color:'#8eaaa9'});
  }
  if(debris.length>200)debris.splice(0,debris.length-200);
  sound(e.boss?40:85,e.boss?.6:.25,'sawtooth',e.boss?.065:.035);
  $('hit-feedback').textContent=e.boss?'BOSS DESTROYED':'DESTROYED / '+enemyType(e).name;hitFeedbackTime=1;
}
function updateEnemyEffects(dt){
  hitFeedbackTime-=dt;if(hitFeedbackTime<=0)$('hit-feedback').textContent='';
  for(const d of debris){
    d.life-=dt;d.x+=d.vx*dt;d.z+=d.vz*dt;d.y+=d.vy*dt;d.vy-=12*dt;d.angle+=d.spin*dt;
    if(d.y<.12){d.y=.12;d.vy=Math.abs(d.vy)*.3;d.vx*=.7;d.vz*=.7}
  }
  debris=debris.filter(d=>d.life>0);
}
function drawDebris(d){
  const p=project(d.x,d.y,d.z);if(!p)return;const size=Math.min(70,Math.max(2,p.s*d.size));
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(d.angle);ctx.globalAlpha=Math.min(1,d.life/.5);ctx.fillStyle=d.color;
  ctx.beginPath();ctx.moveTo(-size,-size*.4);ctx.lineTo(size*.6,-size*.7);ctx.lineTo(size,size*.4);ctx.lineTo(-size*.3,size*.7);ctx.closePath();ctx.fill();ctx.restore();
}
function updateEnemyIntel(){
  let target=null,best=Infinity;
  for(const e of enemies){const p=project(e.x,e.size*.7,e.z);if(!p)continue;const error=Math.hypot(p.x-W/2,p.y-H/2);if(error<Math.max(90,p.s*e.size*.85)&&error<best){target=e;best=error}}
  $('enemy-intel').textContent=target?enemyType(target).name+' / 有効: '+enemyType(target).weak+(target.shield>0?' / シールド '+target.shield:''):'';
}
