const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
const $=id=>document.getElementById(id);
const touchControls={enabled:typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches,forward:0,side:0,reset:null};
function clearTouch(){touchControls.forward=0;touchControls.side=0;touchControls.reset?.()}
function captureMouse(){if(!touchControls.enabled)canvas.requestPointerLock?.()}
function movementInput(){return {forward:Math.max(-1,Math.min(1,(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0)+touchControls.forward)),side:Math.max(-1,Math.min(1,(keys.KeyD?1:0)-(keys.KeyA?1:0)+touchControls.side))}}
let W,H,dpr;function resize(){dpr=Math.min(devicePixelRatio,2);W=innerWidth;H=innerHeight;canvas.width=W*dpr;canvas.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0)}addEventListener('resize',resize);resize();
const buildings=EarthGuardRules.createBuildings().map(makeBuilding);
let mode='menu',player={x:0,z:-35,y:2.4,a:0,hp:100},enemies=[],particles=[],keys={},wave=1,kills=0,ammo=30,reloading=0,lastShot=0,flash=0,hurt=0,clock=0,waveDelay=0,noticeTime=0,dodge=0,paused=false;
let soloBossPending=false,soloSpawnTimer=0;
const totalWaves=5;let audio;function sound(freq,len,type='square',vol=.03){try{audio ||= new (window.AudioContext||window.webkitAudioContext)();const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(freq*.35,audio.currentTime+len);g.gain.setValueAtTime(vol,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+len);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+len)}catch{}}
function project(x,y,z){let dx=x-player.x,dz=z-player.z,c=Math.cos(player.a),s=Math.sin(player.a),depth=dz*c+dx*s,side=dx*c-dz*s;if(depth<.3)return null;const f=cameraFocal();return {x:W/2+side*f/depth,y:cameraHorizon()+(player.y-y)*f/depth,s:f/depth,d:depth}}
function poly(points,color){
  // Clip polygons against the camera plane rather than making whole walls
  // disappear when one corner passes behind the player.
  const c=Math.cos(player.a),s=Math.sin(player.a),near=.3;
  let verts=points.map(([x,y,z])=>({x:(x-player.x)*c-(z-player.z)*s,y:y-player.y,z:(z-player.z)*c+(x-player.x)*s}));
  const clipped=[];
  for(let i=0;i<verts.length;i++){
    const a=verts[i],b=verts[(i+1)%verts.length],inside=a.z>=near,next=b.z>=near;
    if(inside)clipped.push(a);
    if(inside!==next){const t=(near-a.z)/(b.z-a.z);clipped.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:near})}
  }
  if(clipped.length<3)return;
  const f=cameraFocal();ctx.beginPath();clipped.forEach((v,i)=>{const x=W/2+v.x*f/v.z,y=cameraHorizon()-v.y*f/v.z;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.closePath();ctx.fillStyle=color;ctx.fill();
}
function drawDrone(e){
  const p=project(e.x,e.size*.9,e.z);if(!p)return;
  const scale=p.s*e.size;if(scale<1)return;
  const type=enemyType(e),artillery=e.role==='artillery',accent=type.color;
  const shot=e.shotWindup>0,area=e.areaWindup>0,charge=e.chargeWindup>0,melee=e.meleeWindup>0;
  const shotProgress=shot?1-e.shotWindup/(e.type==='marksman'?.9:.6):0;
  const areaProgress=area?1-e.areaWindup/(e.boss?1.6:1.9):0;
  const chargeProgress=charge?1-e.chargeWindup/1.25:0;
  const hover=Math.sin(clock*3+e.phase)*.045+(area?-areaProgress*.16:0)+(charge?chargeProgress*.12:0);
  ctx.save();ctx.translate(p.x,p.y);ctx.scale(scale,scale);
  function plate(points,color){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=color;ctx.fill();ctx.strokeStyle='#152b35';ctx.lineWidth=.025;ctx.stroke()}
  // Broad geometric armor, a single light strip and compact propulsion pods.
  // No insect legs, mandibles or organic body segments.
  ctx.fillStyle='#11232355';ctx.beginPath();ctx.ellipse(0,.88,1.05,.17,0,0,Math.PI*2);ctx.fill();
  ctx.translate(0,hover);
  if(charge)ctx.rotate(Math.sin(clock*35)*.018*chargeProgress);
  if(melee)ctx.rotate(-.12*Math.sin((1-e.meleeWindup/.45)*Math.PI));
  if(e.type==='scout'){
    for(const side of [-1,1])plate([[side*.4,-.48],[side*1.65,-.3],[side*1.35,.16],[side*.5,.07]],'#4c7a71');
  }
  if(e.type==='heavy'){
    plate([[-.88,-.7],[.88,-.7],[1.05,.52],[-1.05,.52]],'#666f7b');
    for(const side of [-1,1])plate([[side*.65,-.55],[side*.94,-.4],[side*.87,.5],[side*.59,.4]],'#ad9985');
  }

  for(const side of [-1,1]){
    ctx.save();ctx.scale(side,1);
    plate([[.55,-.38],[1.02,-.2],[1.12,.15],[.95,.53],[.68,.4]],'#526d7b');
    plate([[.73,-.25],[.98,-.13],[1.03,.18],[.8,.22]],'#90a6ae');
    ctx.fillStyle='#213f50';ctx.fillRect(.78,.3,.2,.16);
    const flame=.12+Math.sin(clock*12+e.phase)*.035;
    plate([[.79,.48],[.97,.48],[.92,.48+flame],[.85,.48+flame]],accent);
    if(e.boss){
      plate([[.55,-.55],[1.05,-.55],[1.22,-.32],[.72,-.27]],'#bac0b7');
      ctx.fillStyle=accent;ctx.fillRect(.72,-.47,.24,.04);
    }
    ctx.restore();
  }
  plate([[-.67,-.38],[-.4,-.74],[.4,-.74],[.67,-.38],[.56,.47],[0,.72],[-.56,.47]],e.hit>0?'#edf4de':'#7f97a3');
  plate([[-.4,-.74],[.4,-.74],[.57,-.43],[-.57,-.43]],'#bac6c5');
  plate([[-.54,-.25],[.54,-.25],[.45,.21],[-.45,.21]],'#1d3545');
  ctx.fillStyle=charge?'#ff6855':shot?'#d5f4ff':melee?'#ffc97b':accent;ctx.fillRect(-.36,-.1,.72,.07);
  plate([[-.36,.32],[.36,.32],[0,.56]],'#435f70');
  ctx.fillStyle='#b5c6c7';for(let i=0;i<3;i++)ctx.fillRect(-.14+i*.11,.35,.05,.12);
  if(artillery||e.boss){
    for(const x of e.boss?[-.25,.25]:[0]){
      const lift=area?areaProgress*.3:0;
      plate([[x-.13,-.65],[x-.13,-1.03-lift],[x+.13,-1.03-lift],[x+.13,-.65]],'#445b6d');
      ctx.fillStyle=area?'#ffc36a':accent;ctx.fillRect(x-.08,-.98-lift,.16,.08);
    }
  }
  if(e.type==='marksman'){
    plate([[-.12,-.3],[-.1,-1.2],[.1,-1.2],[.12,-.3]],'#617992');ctx.fillStyle=accent;ctx.fillRect(-.06,-1.15,.12,.09);
    if(e.shotWindup>0){ctx.strokeStyle='#a7c9ff';ctx.lineWidth=.025;ctx.beginPath();ctx.moveTo(0,-.1);ctx.lineTo(0,1.1);ctx.stroke()}
  }
  if(e.shield>0){
    ctx.strokeStyle='#b8a2ff';ctx.fillStyle='#b8a2ff16';ctx.lineWidth=.035;
    ctx.beginPath();for(let i=0;i<6;i++){const a=i/6*Math.PI*2-Math.PI/2,x=Math.cos(a)*1.22,y=Math.sin(a)*1.22; i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.closePath();ctx.fill();ctx.stroke();
  }
  // Distinct shapes and motion supplement the attack colors.
  if(shot){
    ctx.fillStyle=`rgba(173,229,255,${.4+shotProgress*.5})`;ctx.beginPath();ctx.arc(0,-.1,.08+shotProgress*.2,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#b8eaff';ctx.lineWidth=.025;ctx.beginPath();ctx.arc(0,-.1,.4-shotProgress*.22,0,Math.PI*2);ctx.stroke();
  }
  if(area){
    ctx.strokeStyle='#ffc36a';ctx.lineWidth=.03;ctx.beginPath();ctx.ellipse(0,-1.15-areaProgress*.3,.25+areaProgress*.2,.12,0,0,Math.PI*2);ctx.stroke();
  }
  if(charge){
    ctx.strokeStyle='#ff6855';ctx.lineWidth=.045;ctx.beginPath();
    for(const side of [-1,1]){ctx.moveTo(side*.7,.4);ctx.lineTo(side*(1.1+chargeProgress*.25),.9);ctx.lineTo(side*.75,.75)}ctx.stroke();
  }
  if(melee){ctx.strokeStyle='#ffc97b';ctx.lineWidth=.04;ctx.beginPath();ctx.arc(0,.1,.9,-.8,.8);ctx.stroke()}
  ctx.restore();if(mode==='play')drawEnemyHealth(e,p,scale);
}
function drawEnemyHealth(e,p,scale){
  const width=Math.min(e.boss?180:85,Math.max(e.boss?90:38,scale*1.4)),y=Math.max(100,p.y-scale*1.25-22);
  if(p.x+width/2<0||p.x-width/2>W||p.y-scale>H)return;
  ctx.save();ctx.fillStyle='#10221ce6';ctx.fillRect(p.x-width/2-3,y-3,width+6,12);
  ctx.fillStyle='#ffffff25';ctx.fillRect(p.x-width/2,y,width,6);
  ctx.fillStyle=e.boss?'#ff9475':'#d7fb68';ctx.fillRect(p.x-width/2,y,width*Math.max(0,e.hp/e.maxHp),6);
  if(e.shield>0){ctx.fillStyle='#b8a2ff';ctx.fillRect(p.x-width/2,y+9,width*(e.shield/e.maxShield),3)}
  ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillStyle=enemyType(e).color;
  ctx.fillText((e.boss?'BOSS · ':enemyType(e).name+' · ')+Math.ceil(e.hp)+' / '+e.maxHp,p.x,y-7);ctx.restore();
}
function spawnWave(){
  const roster=['scout','spitter','artillery','heavy','shield','marksman'];
  for(let i=0;i<5+wave*3;i++){
    const angle=(Math.random()-.5)*2.4;
    enemies.push(makeEnemy(roster[i%roster.length],player.x+Math.sin(player.a+angle)*(35+Math.random()*35),player.z+Math.cos(player.a+angle)*(35+Math.random()*35),wave,i));
  }
  for(const e of enemies)EarthGuardRules.moveEnemy(e,0,0,buildings);
  soloBossPending=true;soloSpawnTimer=8;
  notice('WAVE '+String(wave).padStart(2,'0')+' — 敵部隊接近 / ボスは後続増援');updateHUD();
}
function releaseSoloBoss(){
  if(!soloBossPending)return;soloBossPending=false;
  const hp=(18+wave*8)*30;
  enemies.push({x:player.x+Math.sin(player.a)*75,z:player.z+Math.cos(player.a)*75,hp,maxHp:hp,size:4.5+wave*.35,speed:2.1+wave*.25,phase:0,hit:0,attack:0,boss:true,type:'boss',name:['タイラント','アーマード','クリムゾン','デヴァステイター','クイーン'][wave-1],rangedCooldown:3,areaCooldown:9,chargeCooldown:5,chargeWindup:0,chargeTime:0,chargeX:0,chargeZ:0});
  EarthGuardRules.moveEnemy(enemies[enemies.length-1],0,0,buildings);
  notice('最終増援 — ラウンドボス出現');updateHUD();
}
function updateBossHUD(){
  const boss=enemies.find(e=>e.boss);
  $('boss-hud').classList[boss?'remove':'add']('hidden');
  if(!boss)return;
  $('boss-name').textContent='ROUND '+String(wave).padStart(2,'0')+' / '+boss.name;
  $('boss-hp').textContent=boss.hp+' / '+boss.maxHp;
  $('boss-hpbar').style.width=Math.max(0,boss.hp/boss.maxHp)*100+'%';
  $('boss-state').textContent='';
}
function notice(t){$('notice').textContent=t;noticeTime=3}
function updateHUD(){
  $('hp').innerHTML=Math.ceil(player.hp)+' <em>/ 100</em>';$('hpbar').style.width=player.hp+'%';
  $('ammo').innerHTML=ammo+' <em>/ '+reserve+'</em>';$('weapon-name').textContent=weapon().name;
  $('wave').textContent='WAVE '+String(wave).padStart(2,'0')+' / 05';$('remaining').textContent='残存敵機 '+enemies.length+' 体'+(net.active&&net.state?.pendingEnemies?' / 増援待ち '+net.state.pendingEnemies+'機':!net.active&&soloBossPending?' / ボス増援待ち':'');$('kills').textContent=String(kills).padStart(2,'0');
  $('reload').classList[reloading?'add':'remove']('is-reloading');
  $('reload').classList[ammo===0&&reserve===0?'add':'remove']('is-empty');
  $('reload').textContent=reloading?'RELOADING… '+reloading.toFixed(1)+'s':ammo===0&&reserve===0?'弾薬切れ / 設定から再出撃':'R リロード / 残弾 '+(ammo+reserve)+' 発';updateBossHUD();
}
function start(){
  clearTouch();mode='play';player={x:0,z:-35,y:2.4,a:0,hp:100};enemies=[];particles=[];projectiles=[];hazards=[];blasts=[];debris=[];hitFeedbackTime=0;
  wave=1;kills=0;ammo=weapon().mag;reserve=weapon().reserve;reloading=0;waveDelay=0;paused=false;keys={};firing=false;aiming=false;aimPitch=0;dodge=0;flash=0;hurt=0;lastShot=-10;supplyTime=0;
  $('supply-notice').textContent='';
  $('danger-warning').textContent='';$('hit-feedback').textContent='';$('enemy-intel').textContent='';
  for(const id of ['menu','operation','footer','result','loadout'])$(id).classList.add('hidden');
  $('hud').classList.remove('hidden');document.body.classList.add('playing');spawnWave();captureMouse();sound(220,.2,'sine');
}
function finish(win){clearTouch();firing=false;aiming=false;mode='end';document.exitPointerLock?.();$('hud').classList.add('hidden');$('result').classList.remove('hidden');$('result-title').textContent=win?'作戦完了':'防衛線、崩壊';$('result-text').textContent=win?'全5ウェーブ制圧。街は守られた。 撃破数：'+kills:'到達ウェーブ：'+wave+' / 5　撃破数：'+kills}
function reload(){
  if(net.active){netSend({type:'input',seq:++net.seq,a:player.a,pitch:aimPitch,reload:true});return}
  if(mode!=='play'||paused||reloading||ammo>=weapon().mag||reserve<=0)return;
  reloading=weapon().reload;sound(500,.15,'triangle');updateHUD();
}
function shoot(){if(net.active){if(mode==='play'&&!paused&&player.hp>0)netSend({type:'fire',seq:++net.seq,a:player.a,pitch:aimPitch,aim:aiming});return}fireWeapon()}
let firing=false,sensitivity=1,settingsOpen=false,ignoreMouseUntil=0,skipNextMouseMove=false;
try{const saved=Number(localStorage.getItem('earth-guard-sensitivity'));if(Number.isFinite(saved)&&saved>=.2&&saved<=3)sensitivity=saved}catch{}
function setSensitivity(value){
  sensitivity=Math.max(.2,Math.min(3,Number(value)||1));
  $('sensitivity').value=sensitivity;$('sensitivity-value').textContent=sensitivity.toFixed(2)+'×';
  try{localStorage.setItem('earth-guard-sensitivity',String(sensitivity))}catch{}
}
setSensitivity(sensitivity);
function openSettings(){
  clearTouch();settingsOpen=true;firing=false;aiming=false;keys={};if(mode==='play')paused=true;
  $('settings-redeploy').classList[mode==='play'&&!net.active?'remove':'add']('hidden');
  $('settings-leave').classList[net.active?'remove':'add']('hidden');
  $('settings-help').textContent=net.active?'感度は保存されます。オンラインでは設定中も戦闘は続きます。':'感度は保存されます。設定中は一時停止します。';
  if(net.active)sendOnlineInput();
  document.exitPointerLock?.();$('settings').classList.remove('hidden');
  $('settings-open').setAttribute('aria-expanded','true');$('settings-close').textContent=mode==='play'?'作戦を再開 →':'閉じる';$('sensitivity').focus();
}
function closeSettings(){
  settingsOpen=false;$('settings').classList.add('hidden');$('settings-open').setAttribute('aria-expanded','false');
  if(mode==='play'){paused=false;notice('防衛作戦を再開');captureMouse()}else $('settings-open').focus();
}
$('settings-open').onclick=openSettings;$('settings-close').onclick=closeSettings;
$('settings-redeploy').onclick=()=>{settingsOpen=false;$('settings').classList.add('hidden');$('settings-open').setAttribute('aria-expanded','false');finish(false);openLoadout()};
$('settings-reset').onclick=()=>setSensitivity(1);$('sensitivity').addEventListener('input',e=>setSensitivity(e.target.value));
addEventListener('keydown',e=>{
  if(!$('loadout').classList.contains('hidden')){
    if(e.code==='Escape')closeLoadout();
    if(e.code==='Tab'){
      const focusable=[...Object.keys(WEAPONS).map(id=>$('weapon-'+id)),$('loadout-back'),$('loadout-start')],index=focusable.indexOf(document.activeElement);
      e.preventDefault();focusable[(index+(e.shiftKey?-1:1)+focusable.length)%focusable.length].focus();
    }
    return;
  }
  if(e.code==='Escape'||(e.code==='KeyP'&&!e.repeat)){if(settingsOpen){if(e.code==='Escape')closeSettings()}else if(mode==='play')openSettings();return}
  if(settingsOpen){
    if(e.code==='Tab'){const focusable=[$('sensitivity'),$('settings-reset'),...(net.active?[$('settings-leave')]:mode==='play'?[$('settings-redeploy')]:[]),$('settings-close')],index=focusable.indexOf(document.activeElement);e.preventDefault();focusable[(index+(e.shiftKey?-1:1)+focusable.length)%focusable.length].focus()}
    return;
  }
  if(['Space','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault();keys[e.code]=true;
  if(e.code==='KeyR'&&mode==='play')reload();if(e.code==='Space'&&dodge<=0&&mode==='play')dodge=.3;
});
addEventListener('keyup',e=>keys[e.code]=false);
addEventListener('blur',()=>{keys={};firing=false;if(mode==='play'&&!settingsOpen)openSettings()});
addEventListener('mousemove',e=>{
  if(document.pointerLockElement===canvas&&skipNextMouseMove){skipNextMouseMove=false;return}
  if(mode==='play'&&!paused&&performance.now()>=ignoreMouseUntil&&(document.pointerLockElement===canvas||(!canvas.requestPointerLock&&(firing||aiming)))){const scale=.0025*sensitivity*(aiming?.45:1);player.a+=(e.movementX||0)*scale;aimPitch=Math.max(-.85,Math.min(.85,aimPitch-(e.movementY||0)*scale))}
});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('mousedown',e=>{
  if(touchControls.enabled||mode!=='play'||settingsOpen)return;
  if(paused){paused=false;notice('防衛作戦を再開')}captureMouse();
  if(e.button===2){aiming=true;return}if(e.button===0){firing=true;shoot()}
});
addEventListener('mouseup',e=>{if(e.button===2)aiming=false;else firing=false;if(net.active)sendOnlineInput()});
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement===canvas){ignoreMouseUntil=performance.now()+50;skipNextMouseMove=true}else if(!touchControls.enabled&&mode==='play'&&!settingsOpen)openSettings()});
setupLoadout();setupOnlineUI();$('start').onclick=openLoadout;$('restart').onclick=()=>{if(net.active)showOnline();else openLoadout()};
function update(dt){
  if(net.active){updateOnline(dt);return}
  clock+=dt;if(mode!=='play'||paused)return;
  noticeTime-=dt;if(noticeTime<=0)$('notice').textContent='';flash-=dt;hurt-=dt;
  if(soloBossPending){soloSpawnTimer-=dt;if(!enemies.length)soloSpawnTimer=Math.min(soloSpawnTimer,1);if(soloSpawnTimer<=0)releaseSoloBoss();}
  if(reloading){
    reloading-=dt;if(reloading<=0){reloading=0;const loaded=Math.min(weapon().mag-ammo,reserve);ammo+=loaded;reserve-=loaded;sound(350,.1,'triangle')}updateHUD();
  }
  if(firing)shoot();
  const {forward,side}=movementInput();
  if(keys.ArrowLeft)player.a-=dt*1.8;if(keys.ArrowRight)player.a+=dt*1.8;
  const len=Math.hypot(forward,side)||1,speed=(dodge>0?22:8)*weapon().speed*(aiming?.65:1);dodge-=dt;
  const nx=player.x+(Math.sin(player.a)*forward+Math.cos(player.a)*side)/len*speed*dt,nz=player.z+(Math.cos(player.a)*forward-Math.sin(player.a)*side)/len*speed*dt;
  if(!buildings.some(b=>Math.abs(nx-b.x)<b.w/2+.7&&Math.abs(nz-b.z)<b.d/2+.7)){player.x=Math.max(-110,Math.min(110,nx));player.z=Math.max(-90,Math.min(190,nz))}
  player.y=2.4+(forward||side?Math.sin(clock*12)*.07:0);
  for(const e of enemies){
    e.hit-=dt;e.attack-=dt;const dx=player.x-e.x,dz=player.z-e.z,dist=Math.hypot(dx,dz);
    let speed=e.speed,canMove=true;
    if(e.boss){
      const enraged=e.hp<=e.maxHp/2;speed*=enraged?1.5:1;
      if(e.chargeTime>0){
        e.chargeTime=Math.max(0,e.chargeTime-dt);EarthGuardRules.moveEnemy(e,e.chargeX*18*dt,e.chargeZ*18*dt,buildings);canMove=false;
      }else if(e.chargeWindup>0){
        e.chargeWindup=Math.max(0,e.chargeWindup-dt);canMove=false;
        if(!e.chargeWindup){e.chargeX=dx/(dist||1);e.chargeZ=dz/(dist||1);e.chargeTime=1.1;e.chargeCooldown=enraged?4:7;sound(75,.25,'sawtooth')}
      }else{
        e.chargeCooldown-=dt;
        if(e.chargeCooldown<=0&&dist>7&&dist<55&&!e.areaWindup&&!e.meleeWindup){e.chargeWindup=1.25;canMove=false;e.shotWindup=0}
      }
    }
    updateEnemyRanged(e,dt,dist);
    const reach=e.boss?e.size*.85:2.5;
    // Spitters close in, artillery stays back to bombard the player.
    const preferred=e.boss?reach:enemyType(e).preferred||reach;
    if(e.shotWindup>0||e.areaWindup>0||e.meleeWindup>0)canMove=false;
    if(canMove&&dist>preferred){EarthGuardRules.moveEnemy(e,dx/(dist||1)*speed*dt,dz/(dist||1)*speed*dt,buildings)}
    else if(canMove&&(e.type==='marksman'||e.type==='artillery')&&dist<preferred*.65){EarthGuardRules.moveEnemy(e,-dx/(dist||1)*speed*.6*dt,-dz/(dist||1)*speed*.6*dt,buildings)}
    if(canMove&&e.type==='scout'&&dist>4){const strafe=Math.sin(clock*2+e.phase)*2.1*dt;EarthGuardRules.moveEnemy(e,dz/(dist||1)*strafe,-dx/(dist||1)*strafe,buildings)}
    const contact=Math.hypot(player.x-e.x,player.z-e.z);
    if(e.meleeWindup>0){
      e.meleeWindup=Math.max(0,e.meleeWindup-dt);
      if(!e.meleeWindup){e.attack=e.boss?1.25:1;if(contact<=reach&&wallHit(enemyCenter(e),player)===null){damagePlayer(e.boss?16:8);if(mode!=='play')return}}
    }else if(contact<=reach&&e.attack<=0&&wallHit(enemyCenter(e),player)===null){
      if(e.chargeTime>0){e.attack=1.25;damagePlayer(24);if(mode!=='play')return}
      else if(!e.shotWindup&&!e.areaWindup&&!e.chargeWindup)e.meleeWindup=.45;
    }
  }
  updateCombat(dt);if(mode!=='play')return;updateBossHUD();
  for(const p of particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy-=15*dt;p.z+=p.vz*dt}particles=particles.filter(p=>p.life>0);
  if(!enemies.length&&!soloBossPending){
    waveDelay+=dt;if(waveDelay>3){waveDelay=0;if(wave===totalWaves)finish(true);else{wave++;player.hp=Math.min(100,player.hp+20);projectiles=projectiles.filter(p=>p.owner==='player');hazards=[];spawnWave()}}
  }
}
function render(){let sky=ctx.createLinearGradient(0,0,0,H*.55);sky.addColorStop(0,'#344b4b');sky.addColorStop(.7,'#9da99a');sky.addColorStop(1,'#d3cdb0');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);ctx.fillStyle='#e9e5bf';ctx.beginPath();ctx.arc(W*.77,H*.24,37,0,Math.PI*2);ctx.fill();ctx.fillStyle='#7c8e82';for(let i=0;i<28;i++){let x=((i*73-player.a*W*.3)%(W+120)+W+120)%(W+120)-60;ctx.fillRect(x,H*.42-(i%5)*14,40,H*.13+(i%5)*14)}let ground=ctx.createLinearGradient(0,H*.49,0,H);ground.addColorStop(0,'#7b8471');ground.addColorStop(1,'#293936');ctx.fillStyle=ground;const horizon=Math.max(0,Math.min(H,cameraHorizon()));ctx.fillRect(0,horizon,W,H-horizon);poly([[-13,0,-100],[13,0,-100],[13,0,250],[-13,0,250]],'#43514a');for(let z=-90;z<230;z+=9)poly([[-.14,.01,z],[.14,.01,z],[.14,.01,z+4],[-.14,.01,z+4]],'#a7ab82');for(let x of [-11,11])poly([[x,.02,-90],[x+.15,.02,-90],[x+.15,.02,230],[x,.02,230]],'#8b9577');drawHazards();const objects=[...buildings.map(b=>({type:0,data:b,dist:Math.hypot(b.x-player.x,b.z-player.z)})),...enemies.map(e=>({type:1,data:e,dist:Math.hypot(e.x-player.x,e.z-player.z)})),...projectiles.map(p=>({type:2,data:p,dist:Math.hypot(p.x-player.x,p.z-player.z)})),...blasts.map(p=>({type:3,data:p,dist:Math.hypot(p.x-player.x,p.z-player.z)})),...debris.map(d=>({type:4,data:d,dist:Math.hypot(d.x-player.x,d.z-player.z)})),...net.allies.map(p=>({type:5,data:p,dist:Math.hypot(p.x-player.x,p.z-player.z)}))].sort((a,b)=>b.dist-a.dist);for(const o of objects){if(o.type===1)drawDrone(o.data);else if(o.type===5)drawAlly(o.data);else if(o.type===4)drawDebris(o.data);else if(o.type>=2)drawCombatObject(o.data,o.type===3);else drawBuilding(o.data)}for(const p of particles){const pp=project(p.x,p.y,p.z);if(pp){ctx.fillStyle='#d4ee83';ctx.fillRect(pp.x,pp.y,Math.min(7,pp.s*.1),Math.min(7,pp.s*.1))}}if(mode==='menu'){ctx.fillStyle='#d7fb68';ctx.font='10px monospace';ctx.fillText('TARGET LOCKED / DRONE α',W*.69,H*.57);let p=project(9,2,22);if(p){ctx.strokeStyle='#d7fb6860';ctx.strokeRect(p.x-90,p.y-80,180,145)}}if(mode==='play'){drawGun();drawRadar();if(hurt>0){ctx.fillStyle=`rgba(186,53,29,${hurt*1.5})`;ctx.fillRect(0,0,W,H)}}ctx.fillStyle='#d0e3c003';for(let y=0;y<H;y+=4)ctx.fillRect(0,y,W,1)}
function drawGun(){if(aiming&&selectedWeapon==='sniper'){drawScope();return}let bob=Math.sin(clock*10)*(keys.KeyW||keys.KeyS?4:0),recoil=flash>0?15:0;ctx.save();ctx.translate(W*.65,H+recoil+bob+(reloading?Math.sin(reloading/weapon().reload*Math.PI)*180:0));if(selectedWeapon==='rocket'){ctx.fillStyle='#263c32';ctx.beginPath();ctx.moveTo(-70,0);ctx.lineTo(-45,-230);ctx.lineTo(25,-230);ctx.lineTo(90,0);ctx.fill();ctx.fillStyle='#647865';ctx.fillRect(-45,-220,70,28);ctx.fillStyle='#101e19';ctx.fillRect(-31,-213,43,18);ctx.strokeStyle=weapon().color;ctx.lineWidth=3;ctx.strokeRect(-47,-225,74,35);ctx.fillStyle=weapon().color;ctx.fillRect(-15,-150,20,5);ctx.restore();return}if(selectedWeapon==='smg')ctx.scale(.8,.85);ctx.fillStyle='#162620';ctx.beginPath();ctx.moveTo(-90,0);ctx.lineTo(-60,-125);ctx.lineTo(-25,-175);ctx.lineTo(-10,-210);ctx.lineTo(10,-210);ctx.lineTo(25,-170);ctx.lineTo(85,-125);ctx.lineTo(145,0);ctx.fill();ctx.fillStyle='#475447';ctx.beginPath();ctx.moveTo(-25,-175);ctx.lineTo(-15,-210);ctx.lineTo(10,-210);ctx.lineTo(30,-130);ctx.lineTo(0,-85);ctx.lineTo(-55,-110);ctx.fill();ctx.fillStyle='#283b2f';ctx.fillRect(-12,selectedWeapon==='sniper'?-265:-224,selectedWeapon==='sniper'?13:20,selectedWeapon==='sniper'?96:55);if(selectedWeapon==='sniper'){ctx.fillStyle='#87978a';ctx.fillRect(-20,-185,40,20);ctx.fillStyle='#18342c';ctx.fillRect(-15,-189,30,15)}ctx.fillStyle='#0b1712';ctx.fillRect(-7,-229,11,13);ctx.strokeStyle='#a0b476';ctx.lineWidth=2;ctx.strokeRect(-10,-167,26,20);ctx.fillStyle='#d7fb68';ctx.fillRect(-3,-160,12,3);ctx.fillStyle='#65705a';for(let i=0;i<5;i++)ctx.fillRect(30+i*7,-111+i*3,3,24);if(flash>0){ctx.fillStyle='#ffeca0';ctx.beginPath();ctx.moveTo(0,-220);ctx.lineTo(-30,-270);ctx.lineTo(-8,-253);ctx.lineTo(2,-303);ctx.lineTo(13,-253);ctx.lineTo(37,-272);ctx.lineTo(13,-218);ctx.fill()}ctx.restore()}
function drawScope(){
  const r=Math.min(W,H)*.38;ctx.save();ctx.fillStyle='#03100ce6';ctx.beginPath();ctx.rect(0,0,W,H);ctx.arc(W/2,H/2,r,0,Math.PI*2,true);ctx.fill('evenodd');
  ctx.strokeStyle='#9dc9ff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(W/2,H/2,r,0,Math.PI*2);ctx.stroke();ctx.strokeStyle='#14271a';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(W/2-r,H/2);ctx.lineTo(W/2+r,H/2);ctx.moveTo(W/2,H/2-r);ctx.lineTo(W/2,H/2+r);ctx.stroke();
  for(let i=-4;i<=4;i++){ctx.fillRect(W/2+i*r/8,H/2-3,1,6);ctx.fillRect(W/2-3,H/2+i*r/8,6,1)}ctx.restore();
}
function drawRadar(){const x=touchControls.enabled?(W>H?W-175:W-62):W-94,y=touchControls.enabled?(W>H?70:115):205,r=touchControls.enabled?35:49;ctx.save();ctx.translate(x,y);ctx.fillStyle='#10241ec0';ctx.beginPath();ctx.arc(0,0,r,0,7);ctx.fill();ctx.strokeStyle='#b5d79555';for(let rr of [r,r/2]){ctx.beginPath();ctx.arc(0,0,rr,0,7);ctx.stroke()}ctx.strokeStyle='#b5d79525';ctx.beginPath();ctx.moveTo(-r,0);ctx.lineTo(r,0);ctx.moveTo(0,-r);ctx.lineTo(0,r);ctx.stroke();ctx.fillStyle='#d7fb68';ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(-4,4);ctx.lineTo(4,4);ctx.fill();ctx.fillStyle='#f7a67b';for(const e of enemies){let dx=e.x-player.x,dz=e.z-player.z,c=Math.cos(player.a),s=Math.sin(player.a),xx=(dx*c-dz*s)*.65,yy=-(dz*c+dx*s)*.65;if(Math.hypot(xx,yy)<r-3){ctx.beginPath();ctx.arc(xx,yy,2,0,7);ctx.fill()}}ctx.restore()}
enemies=[{x:9,z:22,size:6.5,phase:0,hp:99,hit:0},{x:-8,z:65,size:4,phase:3,hp:99,hit:0},{x:17,z:95,size:5,phase:7,hp:99,hit:0}];player.a=.08;
let prev=performance.now();function loop(t){let dt=Math.min((t-prev)/1000,.05);prev=t;update(dt);render();requestAnimationFrame(loop)}requestAnimationFrame(loop);
