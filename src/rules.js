(function(root){
const WEAPONS={
  "smg": {
    "name": "SMG–9 / サブマシンガン",
    "mag": 40,
    "reserve": 160,
    "maxReserve": 240,
    "damage": 20,
    "interval": 0.065,
    "reload": 1.45,
    "range": 65,
    "falloff": 20,
    "spread": 0.017,
    "aimSpread": 0.007,
    "supply": 14,
    "speed": 1.15,
    "color": "#8de0c5"
  },
  "ar": {
    "name": "AR–27 / アサルトライフル",
    "mag": 30,
    "reserve": 120,
    "maxReserve": 180,
    "damage": 30,
    "interval": 0.115,
    "reload": 1.8,
    "range": 150,
    "falloff": 55,
    "spread": 0.006,
    "aimSpread": 0.002,
    "supply": 10,
    "speed": 1,
    "color": "#d7fb68"
  },
  "sniper": {
    "name": "SR–80 / スナイパー",
    "mag": 5,
    "reserve": 25,
    "maxReserve": 40,
    "damage": 165,
    "interval": 1.15,
    "reload": 2.8,
    "range": 260,
    "falloff": 230,
    "spread": 0.012,
    "aimSpread": 0,
    "supply": 2,
    "speed": 0.85,
    "color": "#9dc9ff"
  },
  "rocket": {
    "name": "RL–6 / ロケットランチャー",
    "mag": 1,
    "reserve": 8,
    "maxReserve": 16,
    "damage": 260,
    "interval": 0.9,
    "reload": 2.3,
    "range": 150,
    "falloff": 150,
    "spread": 0,
    "aimSpread": 0,
    "supply": 1,
    "speed": 0.8,
    "color": "#ffb184",
    "radius": 4
  }
};
const ENEMY_TYPES={
  "scout": {
    "name": "スカウト",
    "color": "#91efb8",
    "hp": 45,
    "size": 1.65,
    "speed": 5.8,
    "preferred": 3,
    "damage": 6,
    "shotSpeed": 14,
    "cooldown": 4,
    "mods": {
      "smg": 1.6,
      "ar": 1.1,
      "sniper": 0.75,
      "rocket": 0.9
    },
    "weak": "SMG",
    "shape": "wings"
  },
  "spitter": {
    "name": "アサルト",
    "color": "#83ddd8",
    "hp": 60,
    "size": 2.1,
    "speed": 3.4,
    "preferred": 3,
    "damage": 7,
    "shotSpeed": 12,
    "cooldown": 5,
    "mods": {
      "smg": 1,
      "ar": 1.2,
      "sniper": 1,
      "rocket": 1
    },
    "weak": "アサルト",
    "shape": "standard"
  },
  "artillery": {
    "name": "ボンバード",
    "color": "#f4d17a",
    "hp": 85,
    "size": 2.4,
    "speed": 2.3,
    "preferred": 20,
    "damage": 8,
    "shotSpeed": 11,
    "cooldown": 6,
    "mods": {
      "smg": 0.8,
      "ar": 1,
      "sniper": 1.5,
      "rocket": 1.3
    },
    "weak": "スナイパー / ロケラン",
    "shape": "cannons"
  },
  "heavy": {
    "name": "バスティオン",
    "color": "#ffac79",
    "hp": 150,
    "size": 3,
    "speed": 1.7,
    "preferred": 5,
    "damage": 11,
    "shotSpeed": 10,
    "cooldown": 6,
    "mods": {
      "smg": 0.5,
      "ar": 0.85,
      "sniper": 1.4,
      "rocket": 1.65
    },
    "weak": "ロケラン / スナイパー",
    "shape": "armor"
  },
  "shield": {
    "name": "イージス",
    "color": "#b8a2ff",
    "hp": 65,
    "shield": 80,
    "size": 2.3,
    "speed": 2.8,
    "preferred": 10,
    "damage": 7,
    "shotSpeed": 13,
    "cooldown": 5,
    "mods": {
      "smg": 1,
      "ar": 1,
      "sniper": 1.1,
      "rocket": 1.1
    },
    "shieldMods": {
      "smg": 2,
      "ar": 1.1,
      "sniper": 0.4,
      "rocket": 0.8
    },
    "weak": "SMGでシールド破壊",
    "shape": "shield"
  },
  "marksman": {
    "name": "ランサー",
    "color": "#a7c9ff",
    "hp": 65,
    "size": 1.9,
    "speed": 2.7,
    "preferred": 32,
    "damage": 13,
    "shotSpeed": 22,
    "cooldown": 6.5,
    "mods": {
      "smg": 0.75,
      "ar": 1.2,
      "sniper": 1.6,
      "rocket": 0.8
    },
    "weak": "スナイパー / アサルト",
    "shape": "barrel"
  },
  "boss": {
    "name": "コマンダー",
    "color": "#ff9a77",
    "mods": {
      "smg": 0.8,
      "ar": 1,
      "sniper": 1.2,
      "rocket": 1.2
    },
    "weak": "スナイパー / ロケラン",
    "shape": "boss"
  }
};
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
function segmentSphere(a,b,center,radius){
  const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,ox=a.x-center.x,oy=a.y-center.y,oz=a.z-center.z;
  const aa=dx*dx+dy*dy+dz*dz,bb=2*(ox*dx+oy*dy+oz*dz),cc=ox*ox+oy*oy+oz*oz-radius*radius;
  if(cc<=0)return 0;if(aa<1e-10)return null;
  const disc=bb*bb-4*aa*cc;if(disc<0)return null;
  const t=(-bb-Math.sqrt(disc))/(2*aa);return t>=0&&t<=1?t:null;
}

// Treat enemy footprints as expanded building boxes. Sweep each axis so even
// a long boss charge cannot tunnel through a wall, while allowing wall sliding.
function moveEnemy(e,dx,dz,buildings){
  const radius=e.size*.6,epsilon=.001;
  // Spawns (and old room states) can start inside a building: move to its
  // nearest free edge before sweeping. Repeat to handle adjacent buildings.
  for(let pass=0;pass<buildings.length;pass++){
    let overlap=false;
    for(const b of buildings){
      const left=b.x-b.w/2-radius,right=b.x+b.w/2+radius,near=b.z-b.d/2-radius,far=b.z+b.d/2+radius;
      if(e.x>left&&e.x<right&&e.z>near&&e.z<far){
        const distances=[e.x-left,right-e.x,e.z-near,far-e.z],edge=distances.indexOf(Math.min(...distances));
        if(edge===0)e.x=left-epsilon;else if(edge===1)e.x=right+epsilon;else if(edge===2)e.z=near-epsilon;else e.z=far+epsilon;
        overlap=true;
      }
    }
    if(!overlap)break;
  }
  let x=e.x+dx;
  for(const b of buildings){
    const left=b.x-b.w/2-radius,right=b.x+b.w/2+radius;
    if(Math.abs(e.z-b.z)>=b.d/2+radius)continue;
    if(dx>0&&e.x<=left&&x>=left)x=Math.min(x,left-epsilon);
    if(dx<0&&e.x>=right&&x<=right)x=Math.max(x,right+epsilon);
  }
  e.x=x;
  let z=e.z+dz;
  for(const b of buildings){
    const near=b.z-b.d/2-radius,far=b.z+b.d/2+radius;
    if(Math.abs(e.x-b.x)>=b.w/2+radius)continue;
    if(dz>0&&e.z<=near&&z>=near)z=Math.min(z,near-epsilon);
    if(dz<0&&e.z>=far&&z<=far)z=Math.max(z,far+epsilon);
  }
  e.z=z;
}

function createBuildings(){let seed=72;function rand(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}const buildings=[];for(let x=-100;x<=100;x+=15)for(let z=-70;z<=180;z+=18){if(Math.abs(x)<15||rand()<.2)continue;buildings.push({x:x+rand()*3,z:z+rand()*3,w:7+rand()*5,d:8+rand()*4,h:12+rand()*36,t:rand()})}return buildings}
const rules={moveEnemy,WEAPONS,ENEMY_TYPES,segmentBox,segmentSphere,createBuildings,MAX_PLAYERS:10};
if(typeof module==='object'&&module.exports)module.exports=rules;else root.EarthGuardRules=rules;
})(typeof globalThis==='object'?globalThis:this);
