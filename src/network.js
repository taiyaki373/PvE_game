let net={active:false,socket:null,id:null,state:null,seq:0,sendTime:0,correction:null,allies:[],intentional:false,connecting:false,lastStateAt:0};
function netSend(message){if(net.socket?.readyState===WebSocket.OPEN)net.socket.send(JSON.stringify(message))}
function onlineError(text){$('online-error').textContent=text;$('online-error').classList.remove('hidden')}
function showOnline(){
  $('online').classList.remove('hidden');$('online-error').textContent='';
  $('online-connect').classList[net.active?'add':'remove']('hidden');$('online-lobby').classList[net.active?'remove':'add']('hidden');
  if(!net.active)$('online-name').focus();
}
function connectOnline(code){
  if(net.connecting||net.active)return;
  if(typeof WebSocket==='undefined'){onlineError('このブラウザはオンライン通信に対応していません。');return}
  net.connecting=true;net.intentional=false;$('online-error').textContent='接続中…';$('online-create').disabled=true;$('online-join').disabled=true;
  const ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws');net.socket=ws;
  const timeout=setTimeout(()=>{if(!net.active){onlineError('接続できませんでした。再度参加してください。');ws.close()}},12000);
  ws.onopen=()=>ws.send(JSON.stringify({type:'join',code:code||'',name:$('online-name').value.trim()||'隊員',weapon:$('online-weapon').value}));
  ws.onmessage=event=>{
    if(net.socket!==ws)return;
    let msg;try{msg=JSON.parse(event.data)}catch{return}
    if(msg.type==='joined'){
      clearTimeout(timeout);net.active=true;net.connecting=false;net.id=msg.id;net.seq=0;net.state=null;
      $('online-error').textContent='';$('online-create').disabled=false;$('online-join').disabled=false;
      $('online-connect').classList.add('hidden');$('online-lobby').classList.remove('hidden');
      $('online-room-code').textContent=msg.code;$('online-code').value=msg.code;
      return;
    }
    if(msg.type==='error'){onlineError(msg.message);if(!net.active){clearTimeout(timeout);net.intentional=true;ws.close();net.connecting=false;$('online-create').disabled=false;$('online-join').disabled=false}return}
    if(msg.type==='state'&&net.active)receiveOnlineState(msg);
    if(msg.type==='pong')$('network-latency').textContent=Math.max(0,Date.now()-msg.sent)+' ms';
  };
  ws.onerror=()=>onlineError('通信に失敗しました。再度参加してください。');
  ws.onclose=()=>{
    clearTimeout(timeout);if(net.socket!==ws)return;const disconnected=net.active&&!net.intentional;net.active=false;net.connecting=false;net.state=null;net.allies=[];
    $('online-create').disabled=false;$('online-join').disabled=false;$('squad-hud').classList.add('hidden');
    if(disconnected){resetToMenu();showOnline();onlineError('接続が切れました。コードを使って再参加できます。')}
  };
}
function leaveOnline(){net.intentional=true;netSend({type:'leave'});net.socket?.close();net.active=false;net.state=null;net.allies=[];$('online').classList.add('hidden');$('squad-hud').classList.add('hidden');resetToMenu()}
function resetToMenu(){
  clearTouch();mode='menu';paused=false;settingsOpen=false;firing=false;aiming=false;keys={};document.exitPointerLock?.();
  for(const id of ['hud','result','settings','loadout'])$(id).classList.add('hidden');for(const id of ['menu','operation','footer'])$(id).classList.remove('hidden');
  document.body.classList.remove('playing');enemies=[];projectiles=[];hazards=[];blasts=[];debris=[];
}
function beginOnlineGame(self){
  clearTouch();mode='play';paused=false;settingsOpen=false;keys={};firing=false;aiming=false;aimPitch=self.pitch||0;player={x:self.x,z:self.z,y:2.4,a:self.a,hp:self.hp};
  selectedWeapon=self.weapon;particles=[];debris=[];blasts=[];hitFeedbackTime=0;net.correction=null;
  for(const id of ['menu','operation','footer','result','loadout','online','settings'])$(id).classList.add('hidden');
  $('hud').classList.remove('hidden');$('squad-hud').classList.remove('hidden');document.body.classList.add('playing');
  notice('協力作戦開始 / 味方へのダメージなし');
  // Start messages arrive asynchronously; the canvas click is the user gesture
  // that captures the mouse in every browser.
  $('network-status').textContent=touchControls.enabled?'右側をスワイプして照準':'画面クリックで照準開始';
}
function receiveOnlineState(state){
  if(net.state&&state.seq<=net.state.seq)return;
  const previous=net.state;net.state=state;net.lastStateAt=performance.now();
  const self=state.players.find(p=>p.id===net.id);if(!self)return;
  if(state.status==='playing'&&(mode!=='play'||previous?.status!=='playing'))beginOnlineGame(self);
  if(state.status==='playing'){
    const error=Math.hypot(player.x-self.x,player.z-self.z);
    if(error>4){player.x=self.x;player.z=self.z;net.correction=null}else net.correction={x:self.x,z:self.z};
    player.hp=self.hp;ammo=self.ammo;reserve=self.reserve;reloading=self.reloading;selectedWeapon=self.weapon;wave=state.wave;kills=state.kills;
    const previousEnemies=new Map(enemies.map(e=>[e.id,e]));
    enemies=state.enemies.map(e=>{const old=previousEnemies.get(e.id);return {...e,x:old?.x??e.x,z:old?.z??e.z,targetX:e.x,targetZ:e.z}});
    projectiles=state.projectiles;hazards=state.hazards;
    net.allies=state.players.filter(p=>p.id!==net.id);updateHUD();updateDangerHUD();updateEnemyIntel();
    $('network-status').textContent=self.hp>0?'CO-OP / 味方へのダメージなし':'戦闘不能 / 次ウェーブで復帰';
    $('squad-count').textContent=state.players.length+' / 10';$('network-room').textContent=state.code;
    $('squad-members').textContent=state.players.map(p=>(p.id===net.id?'自分':p.name)+': '+Math.ceil(p.hp)+'HP').join(' · ');
  }
  for(const event of state.events||[]){
    if(event.type==='death'){destroyEnemy(event.enemy);if(event.playerId!==net.id)$('hit-feedback').textContent='味方が撃破 / '+enemyType(event.enemy).name}
    else if(event.type==='hit'&&event.playerId===net.id)showHitFeedback(null,event);
    else if(event.type==='shieldBreak')blasts.push({x:event.enemy.x,y:event.enemy.size*.7,z:event.enemy.z,radius:event.enemy.size*1.25,life:.4,maxLife:.4,color:'#b8a2ff',ring:true});
    else if(event.type==='shot'&&event.playerId===net.id){flash=.07;sound(event.weapon==='rocket'?40:100,.1,'sawtooth',.045)}
    else if(event.type==='hurt'&&event.playerId===net.id){hurt=.3;sound(50,.12,'sawtooth')}
    else if(event.type==='supply'&&event.playerId===net.id){$('supply-notice').textContent='チーム補給 +'+event.amount+' 発';supplyTime=2}
    else if(event.type==='notice')notice(event.text);
    else if(event.type==='explosion')blasts.push({x:event.x,y:event.y,z:event.z,radius:event.radius,life:.5,maxLife:.5,color:'#ffb56a',ring:true});
  }
  if(state.status==='won'||state.status==='lost'){
    if(previous?.status==='playing'){finish(state.status==='won');$('restart').textContent='ルームに戻る →';$('squad-hud').classList.add('hidden')}
  }
  updateLobby(state,self);
}
function updateLobby(state,self){
  $('online-room-code').textContent=state.code;$('online-player-count').textContent=state.players.length+' / 10 人';
  $('online-scaling').textContent='敵数: ('+(5+(state.wave||1)*3)+' × '+(state.status==='playing'?state.scaledPlayers:state.players.length)+'人) + ボス1体 / 1人分ずつ約8秒間隔で増援';
  const roster=$('online-roster');roster.replaceChildren();
  for(const p of state.players){const row=document.createElement('div');row.className='lobby-player';const label=document.createElement('span'),status=document.createElement('b');label.textContent=(p.id===state.host?'★ ':'')+p.name+(p.id===net.id?'（自分）':'')+' / '+WEAPONS[p.weapon].name.split(' / ')[1];status.textContent=state.status==='playing'?p.hp>0?'戦闘中':'戦闘不能':p.ready?'準備完了':'準備中';row.append(label,status);roster.append(row)}
  $('online-ready').textContent=self.ready?'準備完了 ✓ / 解除':'準備完了にする';$('online-ready').disabled=state.status==='playing';
  $('online-start').classList[state.host===net.id?'remove':'add']('hidden');$('online-start').disabled=state.status==='playing'||!state.players.every(p=>p.ready);
  $('online-waiting').textContent=state.status==='playing'?'作戦進行中。画面クリックで参加できます。':state.host===net.id?'全員が準備完了になったら出撃できます。':'リーダーの出撃を待っています。';
}
function updateOnline(dt){
  clock+=dt;noticeTime-=dt;if(noticeTime<=0)$('notice').textContent='';flash-=dt;hurt-=dt;
  updateEnemyEffects(dt);supplyTime-=dt;if(supplyTime<=0)$('supply-notice').textContent='';
  for(const b of blasts)b.life-=dt;blasts=blasts.filter(b=>b.life>0);
  const lerp=Math.min(1,dt*14);for(const e of enemies){e.x+=(e.targetX-e.x)*lerp;e.z+=(e.targetZ-e.z)*lerp}
  if(mode!=='play')return;
  const alive=player.hp>0,canControl=!paused&&alive;
  if(canControl){
    const {forward,side}=movementInput();
    if(keys.ArrowLeft)player.a-=dt*1.8;if(keys.ArrowRight)player.a+=dt*1.8;
    const len=Math.hypot(forward,side)||1,speed=8*weapon().speed*(aiming?.65:1),x=player.x+(Math.sin(player.a)*forward+Math.cos(player.a)*side)/len*speed*dt,z=player.z+(Math.cos(player.a)*forward-Math.sin(player.a)*side)/len*speed*dt;
    if(!buildings.some(b=>Math.abs(x-b.x)<b.w/2+.7&&Math.abs(z-b.z)<b.d/2+.7)){player.x=Math.max(-110,Math.min(110,x));player.z=Math.max(-90,Math.min(190,z))}
  }
  if(net.correction){player.x+=(net.correction.x-player.x)*Math.min(1,dt*5);player.z+=(net.correction.z-player.z)*Math.min(1,dt*5)}
  net.sendTime+=dt;if(net.sendTime>=.03){net.sendTime=0;sendOnlineInput()}
  if(performance.now()-net.lastStateAt>3000)$('network-status').textContent='通信待機中…';
  updateEnemyIntel();
}
function sendOnlineInput(){
  const control=mode==='play'&&!paused&&player.hp>0,{forward,side}=movementInput();
  netSend({type:'input',seq:++net.seq,a:player.a,pitch:aimPitch,forward:control?forward:0,side:control?side:0,fire:control&&firing,aim:control&&aiming,reload:control&&!!keys.KeyR,dodge:control&&!!keys.Space});
}
function drawAlly(p){
  const point=project(p.x,1.5,p.z);if(!point)return;const s=point.s;
  ctx.save();ctx.translate(point.x,point.y);ctx.fillStyle=p.hp>0?'#91dcf4':'#748c91';
  ctx.fillRect(-s*.36,-s*.55,s*.72,s*1.15);ctx.fillStyle='#c5e7e7';ctx.fillRect(-s*.25,-s*1,s*.5,s*.4);ctx.fillStyle='#24475a';ctx.fillRect(-s*.22,-s*.88,s*.44,s*.12);
  ctx.fillStyle='#537a82';ctx.fillRect(-s*.32,s*.6,s*.25,s*.55);ctx.fillRect(s*.07,s*.6,s*.25,s*.55);ctx.fillRect(s*.27,-s*.1,s*.45,s*.17);
  ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.fillStyle='#a3edff';ctx.fillText(p.name+' / '+Math.ceil(p.hp)+'HP',0,-s*1.15-10);ctx.restore();
}
function setupOnlineUI(){
  $('online-open').onclick=showOnline;$('online-create').onclick=()=>connectOnline('');$('online-join').onclick=()=>connectOnline($('online-code').value.trim().toUpperCase());
  $('online-ready').onclick=()=>netSend({type:'ready',ready:!net.state?.players.find(p=>p.id===net.id)?.ready});$('online-start').onclick=()=>netSend({type:'start'});
  $('online-leave').onclick=leaveOnline;$('online-back').onclick=()=>{if(net.connecting){net.intentional=true;net.socket?.close();net.connecting=false}$('online').classList.add('hidden')};
  $('online-copy').onclick=async()=>{const url=new URL(location.href);url.searchParams.set('room',net.state.code);try{await navigator.clipboard.writeText(url.toString());$('online-copy').textContent='招待URLをコピーしました'}catch{onlineError('招待URL: '+url.toString())}};
  $('squad-leave').onclick=()=>{openSettings();$('settings-leave').classList.remove('hidden')};$('settings-leave').onclick=leaveOnline;
  setInterval(()=>{if(net.active)netSend({type:'ping',sent:Date.now()})},3000);
  const code=new URLSearchParams(location.search).get('room');if(code){$('online-code').value=code.toUpperCase();showOnline()}
}
