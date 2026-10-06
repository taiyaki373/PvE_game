// Independent pointer IDs let players move, aim and fire simultaneously.
if(touchControls.enabled){
  document.body.classList.add('touch-device');
  document.querySelector('.controls').textContent='左スティックで移動 · 左右の射撃を長押し · 右射撃はドラッグで照準（横向き推奨）';
  $('sensitivity').previousElementSibling.firstChild.textContent='照準感度 ';
  const active=new Map(),stick=$('touch-stick'),knob=$('touch-knob');
  const playable=()=>mode==='play'&&!paused&&!settingsOpen&&player.hp>0;
  function release(id){
    const entry=active.get(id);if(!entry)return;active.delete(id);
    if(entry.kind==='stick'){touchControls.forward=0;touchControls.side=0;knob.style.transform='translate(0px,0px)'}
    if(entry.kind.startsWith('fire'))firing=[...active.values()].some(p=>p.kind.startsWith('fire'));
    $(entry.element).classList.remove('pressed');
    if(entry.kind==='aim')aiming=false;
    if(entry.kind==='reload')keys.KeyR=false;
    if(entry.kind==='dodge')keys.Space=false;
    if(net.active)sendOnlineInput();
  }
  touchControls.reset=()=>{for(const id of [...active.keys()])release(id)};
  function bind(element,kind){
    element.addEventListener('pointerdown',event=>{
      if(!playable()||[...active.values()].some(p=>p.kind===kind))return;
      event.preventDefault();element.setPointerCapture(event.pointerId);
      const rect=element.getBoundingClientRect();
      active.set(event.pointerId,{kind,element:element.id,x:event.clientX,y:event.clientY,cx:rect.left+rect.width/2,cy:rect.top+rect.height/2});
      element.classList.add('pressed');
      if(kind.startsWith('fire')){firing=true;shoot()}
      if(kind==='aim')aiming=true;
      if(kind==='reload'){keys.KeyR=true;reload()}
      if(kind==='dodge'){keys.Space=true;if(!net.active&&dodge<=0)dodge=.3}
      if(kind==='stick')move(event);
      if(net.active)sendOnlineInput();
    });
    element.addEventListener('pointermove',move);
    for(const name of ['pointerup','pointercancel','lostpointercapture'])element.addEventListener(name,event=>release(event.pointerId));
    element.addEventListener('contextmenu',event=>event.preventDefault());
  }
  function move(event){
    const p=active.get(event.pointerId);if(!p||!playable())return;event.preventDefault();
    if(p.kind==='stick'){
      let x=event.clientX-p.cx,y=event.clientY-p.cy;const distance=Math.hypot(x,y),radius=40;
      if(distance>radius){x*=radius/distance;y*=radius/distance}
      touchControls.side=x/radius;touchControls.forward=-y/radius;knob.style.transform=`translate(${x}px,${y}px)`;
    }else if(p.kind==='look'||p.kind==='fire'){
      const scale=.005*sensitivity*(aiming?.45:1);player.a+=(event.clientX-p.x)*scale;
      aimPitch=Math.max(-.85,Math.min(.85,aimPitch-(event.clientY-p.y)*scale));p.x=event.clientX;p.y=event.clientY;
    }
  }
  bind(stick,'stick');bind($('touch-look'),'look');bind($('touch-fire-left'),'fire-left');
  for(const kind of ['fire','aim','reload','dodge'])bind($('touch-'+kind),kind);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTouch();firing=false;aiming=false;keys={};if(mode==='play'&&!settingsOpen)openSettings()}});
  addEventListener('resize',clearTouch);
}
