const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {WebSocketServer,WebSocket}=require('ws');
const {Room}=require('./server/engine.cjs');

function createGameServer(){
  const rooms=new Map();
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({ok:true,maxPlayers:10,rooms:rooms.size}));return}
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return}
    let pathname;try{pathname=decodeURIComponent(url.pathname)}catch{res.writeHead(400);res.end();return}
    if(pathname!=='/'&&pathname!=='/index.html'&&!/^\/src\/[a-zA-Z0-9_-]+\.(js|css)$/.test(pathname)){res.writeHead(404);res.end('Not found');return}
    const file=path.join(__dirname,pathname==='/'?'index.html':pathname.slice(1));
    fs.stat(file,(err,stat)=>{if(err||!stat.isFile()){res.writeHead(404);res.end();return}res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Content-Length':stat.size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res)});
  });
  const wss=new WebSocketServer({server,path:'/ws',maxPayload:4096,perMessageDeflate:false});
  const send=(ws,data)=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(data))};
  function broadcast(room){const snapshot=JSON.stringify(room.snapshot());for(const ws of wss.clients)if(ws.room===room&&ws.readyState===WebSocket.OPEN){if(ws.bufferedAmount>2*1024*1024){ws.close(1013,'Connection too slow');continue}ws.send(snapshot)}}
  wss.on('connection',ws=>{
    ws.alive=true;ws.messages=0;ws.window=Date.now();ws.on('pong',()=>ws.alive=true);ws.on('error',()=>{});
    const joinTimeout=setTimeout(()=>{if(!ws.room)ws.close(1008,'Join a room first')},15000);joinTimeout.unref();
    ws.on('message',(raw,binary)=>{
      if(binary){ws.close(1003,'JSON only');return}
      if(Date.now()-ws.window>1000){ws.window=Date.now();ws.messages=0}if(++ws.messages>90){ws.close(1008,'Too many messages');return}
      let msg;try{msg=JSON.parse(raw.toString());if(!msg||typeof msg!=='object'||Array.isArray(msg))throw Error('無効なメッセージです。');
        if(msg.type==='ping'){send(ws,{type:'pong',sent:msg.sent});return}
        if(msg.type==='join'){
          if(ws.room)throw Error('既にルームへ参加しています。');let room;
          if(msg.code){const code=String(msg.code).trim().toUpperCase();if(!/^[A-Z0-9]{6}$/.test(code))throw Error('ルームコードは6文字です。');room=rooms.get(code);if(!room)throw Error('ルームが見つかりません。コードを確認してください。')}
          else{if(rooms.size>=100)throw Error('サーバーが混雑しています。');let code;do{code=crypto.randomBytes(4).toString('hex').slice(0,6).toUpperCase()}while(rooms.has(code));room=new Room(code);rooms.set(code,room)}
          const player=room.addPlayer(msg.name,msg.weapon);ws.room=room;ws.playerId=player.id;clearTimeout(joinTimeout);send(ws,{type:'joined',id:player.id,code:room.code});broadcast(room);return;
        }
        if(!ws.room)throw Error('先にルームへ参加してください。');const room=ws.room;
        if(msg.type==='input')room.input(ws.playerId,msg);
        else if(msg.type==='fire'){
          const player=room.players.get(ws.playerId);
          if(player&&room.status==='playing'){room.input(ws.playerId,{...player.input,...msg,fire:true});room.fire(player)}
        }
        else if(msg.type==='ready'){room.ready(ws.playerId,msg.ready);broadcast(room)}
        else if(msg.type==='start'){room.start(ws.playerId);broadcast(room)}
        else if(msg.type==='leave')ws.close(1000,'Left room');
        else throw Error('不明な操作です。');
      }catch(err){send(ws,{type:'error',message:err.message||'操作に失敗しました。'})}
    });
    ws.on('close',()=>{clearTimeout(joinTimeout);if(ws.room){const room=ws.room;room.removePlayer(ws.playerId);if(!room.players.size)rooms.delete(room.code);else broadcast(room)}});
  });
  let previous=performance.now();
  const timer=setInterval(()=>{const now=performance.now(),dt=Math.min(.1,(now-previous)/1000);previous=now;for(const room of rooms.values()){room.step(dt);broadcast(room)}},50);timer.unref();
  const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue}ws.alive=false;ws.ping()}},15000);heartbeat.unref();
  async function close(){clearInterval(timer);clearInterval(heartbeat);for(const ws of wss.clients)ws.terminate();await new Promise(resolve=>wss.close(resolve));if(server.listening)await new Promise(resolve=>server.close(resolve))}
  return {server,wss,rooms,close};
}
if(require.main===module){const game=createGameServer(),port=Number(process.env.PORT)||5173;game.server.listen(port,'0.0.0.0',()=>console.log('EARTH GUARD online: http://0.0.0.0:'+port));for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>game.close().then(()=>process.exit(0)))}
module.exports={createGameServer};
