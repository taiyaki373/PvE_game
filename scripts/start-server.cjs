// Keep the workspace preview alive independently of a short-lived terminal.
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const log=fs.openSync('/tmp/pve-online-server.log','a');
const child=spawn(process.execPath,[path.join(root,'server.cjs')],{cwd:root,detached:true,stdio:['ignore',log,log],env:process.env});
child.unref();fs.closeSync(log);fs.writeFileSync('/tmp/pve-online-server.pid',String(child.pid));
console.log('Started EARTH GUARD server, PID '+child.pid);
