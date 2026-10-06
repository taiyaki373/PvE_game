// Buildings are assembled once. Only camera-facing walls and suitable detail
// levels are drawn each frame, so the facades stay affordable to render.
function makeBuilding(b) {
  const palettes = [
    {wall:'#a3aaa0',side:'#858e86',glass:'#355b60',trim:'#c7c9b6',roof:'#78877e'},
    {wall:'#687b80',side:'#52666d',glass:'#2c484e',trim:'#96aaa7',roof:'#71837e'},
    {wall:'#af9981',side:'#8b806e',glass:'#344e4e',trim:'#d1c1a4',roof:'#8c8e7d'},
    {wall:'#88938b',side:'#707e75',glass:'#354b48',trim:'#b7bdb0',roof:'#76877d'}
  ];
  b.kind=Math.floor(b.t*4);b.palette=palettes[b.kind];b.mesh=[];
  const {x,z,w,d,h}=b,p=b.palette;
  function face(points,color,normal=null,detail=0){
    const center=points.reduce((sum,p)=>[sum[0]+p[0]/points.length,sum[1]+p[2]/points.length],[0,0]);
    b.mesh.push({points,color,normal,detail,cx:center[0],cz:center[1]});
  }
  function box(cx,cy,cz,bw,bh,bd,colors,detail=0){
    const l=cx-bw/2,r=cx+bw/2,n=cz-bd/2,f=cz+bd/2,t=cy+bh;
    face([[l,cy,n],[r,cy,n],[r,t,n],[l,t,n]],colors[0],[0,-1],detail);
    face([[r,cy,f],[l,cy,f],[l,t,f],[r,t,f]],colors[1],[0,1],detail);
    face([[l,cy,f],[l,cy,n],[l,t,n],[l,t,f]],colors[1],[-1,0],detail);
    face([[r,cy,n],[r,cy,f],[r,t,f],[r,t,n]],colors[0],[1,0],detail);
    face([[l,t,n],[r,t,n],[r,t,f],[l,t,f]],colors[2],[0,0],detail);
  }
  box(x,.02,z,w+2,.22,d+2,['#9b9f90','#767f71','#a3aa98']);
  box(x,.24,z,w,h,d,[p.wall,p.side,p.roof]);
  // Four complete facades: windows stay visible when the player walks around.
  for(let side=0;side<4;side++){
    const normal=[[0,-1],[1,0],[0,1],[-1,0]][side];
    const width=side%2?d:w;
    function rect(u,y,rw,rh,color,detail=1,offset=.025){
      const point=(a,yy)=>side===0?[x+a,yy,z-d/2-offset]:side===1?[x+w/2+offset,yy,z+a]:side===2?[x-a,yy,z+d/2+offset]:[x-w/2-offset,yy,z-a];
      face([point(u,y),point(u+rw,y),point(u+rw,y+rh),point(u,y+rh)],color,normal,detail);
    }
    const floors=Math.floor((h-3)/3.5),cols=Math.max(2,Math.floor(width/2.3)),cell=width/cols;
    // Concrete base, recessed storefront, entrance and a colored sign.
    rect(-width/2,.25,width,2.8,'#53615a',0);
    for(let col=0;col<cols;col++){
      const u=-width/2+col*cell+.28;
      rect(u,.45,cell-.56,2.1,'#203d40',1,.035);
      rect(u+.12,.58,.1,1.9,p.trim,2,.04);
      rect(u,2.7,cell-.5,.18,p.trim,1,.04);
    }
    rect(-.7,.3,1.4,2.2,'#1b3032',1,.055);
    rect(.35,1.1,.08,.4,'#c2c9b2',2,.06);
    rect(-width*.32,2.95,width*.64,.6,b.kind===2?'#3e6f66':'#3d555a',1,.04);
    // Letter-like slats form a shop sign without screen-facing text.
    for(let i=0;i<7;i++)rect(-width*.26+i*width*.075,3.12,width*.035,.23,'#d5dbb9',2,.05);
    for(let floor=0;floor<floors;floor++){
      const yy=4+floor*3.5;
      rect(-width/2,yy-.38,width,.13,p.trim,1,.04);
      for(let col=0;col<cols;col++){
        const u=-width/2+col*cell+.32,ww=cell-.64;
        rect(u-.1,yy-.1,ww+.2,2.25,p.trim,1);
        const lit=Math.sin((floor+1)*17.7+(col+1)*41.3+b.x*3+side*9)>.67;
        rect(u,yy,ww,2.02,lit?'#c7c59a':p.glass,1,.035);
        rect(u+.08,yy+1.7,ww-.16,.19,lit?'#e7ddb3':'#718e8a',2,.04);
        rect(u+ww*.5-.035,yy,.07,2.02,p.trim,2,.045);
        if(b.kind===2){
          // Apartment balcony rails and their shadows.
          rect(u-.2,yy-.27,ww+.4,.32,'#626e61',1,.2);
          rect(u-.2,yy+.28,ww+.4,.08,p.trim,2,.24);
          for(let k=0;k<4;k++)rect(u-.1+k*(ww+.15)/4,yy-.18,.045,.52,p.trim,2,.24);
        }
      }
    }
    for(let col=0;col<=cols;col++)rect(-width/2+col*cell-.065,3.6,.13,h-3.4,p.trim,1,.05);
    rect(-width/2,h-.08,width,.32,p.trim,0,.065);
  }
  // Raised roof, parapets and mechanical equipment.
  box(x,h+.24,z,w+.35,.24,d+.35,[p.trim,p.side,p.trim]);
  for(const sx of [-1,1])box(x+sx*(w/2-.14),h+.48,z,.22,.65,d,[p.trim,p.side,p.trim],1);
  for(const sz of [-1,1])box(x,h+.48,z+sz*(d/2-.14),w,.65,.22,[p.trim,p.side,p.trim],1);
  box(x-w*.18,h+.48,z+d*.15,w*.33,2.2,d*.28,['#7e8b7f','#65766a','#a3ad9b'],1);
  box(x+w*.22,h+.48,z-d*.19,1.6,.85,2.1,['#a1afa3','#788d83','#bcc5b2'],1);
  box(x+w*.22,h+1.33,z-d*.19,1.3,.09,1.7,['#42594f','#42594f','#42594f'],2);
  if(b.kind===1){
    box(x,h+2.7,z+d*.15,.12,4,.12,['#aab3a2','#728a7d','#cbd2bb'],1);
    box(x,h+5,z+d*.15,1.5,.1,.1,['#aab3a2','#728a7d','#cbd2bb'],2);
  }
  return b;
}

function drawBuilding(b){
  const dx=b.x-player.x,dz=b.z-player.z,c=Math.cos(player.a),s=Math.sin(player.a);
  const depth=dz*c+dx*s,side=dx*c-dz*s,radius=Math.hypot(b.w,b.d)/2+2;
  if(depth+radius<.3||Math.abs(side)>Math.max(depth,0)*.76+radius+4)return;
  const level=depth<65?2:depth<150?1:0;
  const faces=b.mesh.filter(f=>{
    if(f.detail>level)return false;
    if(!f.normal)return true;
    const [nx,nz]=f.normal,point=f.points[0];
    if(!nx&&!nz)return player.y>point[1];
    return (player.x-point[0])*nx+(player.z-point[2])*nz>0;
  });
  faces.sort((a,b)=>(b.cx-a.cx)*s+(b.cz-a.cz)*c);
  for(const f of faces)poly(f.points,f.color);
}
