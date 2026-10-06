const {test}=require('node:test');
const assert=require('node:assert/strict');
const {moveEnemy,createBuildings}=require('../src/rules.js');
const {Room}=require('../server/engine.cjs');
const blocks=[{x:0,z:0,w:10,d:10}];
test('enemy sweeps stop long charges from all four sides and allow wall sliding',()=>{
  for(const [x,z,dx,dz] of [[-10,0,30,0],[10,0,-30,0],[0,-10,0,30],[0,10,0,-30]]){
    const e={x,z,size:3};moveEnemy(e,dx,dz,blocks);
    assert.ok(Math.abs(e.x)>6.8||Math.abs(e.z)>6.8);
    assert.ok(Math.hypot(e.x-x,e.z-z)<4);
  }
  const e={x:-10,z:0,size:3};moveEnemy(e,10,3,blocks);
  assert.ok(e.x<-6.8);assert.equal(e.z,3);
});
test('enemy spawns are moved outside the full building footprint',()=>{
  const e={x:0,z:0,size:5};moveEnemy(e,0,0,blocks);
  assert.ok(Math.abs(e.x)>8||Math.abs(e.z)>8);
});
test('online boss charge and spawns respect building footprints',()=>{
  const room=new Room('WALL01'),p=room.addPlayer('test');room.ready(p.id,true);room.start(p.id);room.releasePack();
  const buildings=createBuildings();
  for(const e of room.enemies)assert.ok(!buildings.some(b=>Math.abs(e.x-b.x)<b.w/2+e.size*.6&&Math.abs(e.z-b.z)<b.d/2+e.size*.6));
  const b=buildings[0],boss=room.enemies.find(e=>e.boss);
  boss.x=b.x-b.w/2-boss.size*.6-1;boss.z=b.z;boss.chargeTime=1;boss.chargeX=1;boss.chargeZ=0;
  room.enemies=[boss];room.pendingPacks=0;room.bossPending=false;room.step(.5);
  assert.ok(boss.x<b.x-b.w/2-boss.size*.6);
});
