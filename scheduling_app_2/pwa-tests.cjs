// Real service-worker/offline checks using Node's built-in WebSocket and a fresh Chrome profile.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname,'manifest.webmanifest'),'utf8'));
assert.equal(manifest.display,'standalone');
assert.equal(manifest.scope,'./');
for (const icon of manifest.icons) {
    const file=fs.readFileSync(path.join(__dirname,icon.src));
    assert.equal(file.subarray(1,4).toString(),'PNG');
    assert.equal(`${file.readUInt32BE(16)}x${file.readUInt32BE(20)}`,icon.sizes);
}
console.log('PASS Manifest and icon dimensions');
const server=http.createServer((req,res)=>{
    // Exercise hosting from a subdirectory as well as scoped offline caches.
    const relative=new URL(req.url,'http://localhost').pathname.replace(/^\/my-day\//,'');
    if(relative.includes('..')||relative.startsWith('/')){res.writeHead(404).end();return;}
    const file=path.join(__dirname,relative||'index.html');
    try {
        const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webmanifest':'application/manifest+json','.png':'image/png'};
        res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
        res.setHeader('Cache-Control','no-store');res.end(fs.readFileSync(file));
    }catch{res.writeHead(404).end();}
});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let browser,ws;
(async()=>{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const url=`http://127.0.0.1:${server.address().port}/my-day/index.html`;
    const profile=fs.mkdtempSync(path.join(os.tmpdir(),'my-day-pwa-'));
    browser=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',[
        '--headless','--disable-gpu','--in-process-gpu','--no-sandbox','--no-first-run',
        '--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'
    ],{windowsHide:true,stdio:['ignore','ignore','pipe']});
    browser.stderr.on('data',()=>{});
    const active=path.join(profile,'DevToolsActivePort');
    let activeText;
    for(let i=0;i<100;i++) {
        try {activeText=fs.readFileSync(active,'utf8').trim();if(activeText.split('\n').length>=2)break;}catch(error){if(!['ENOENT','EBUSY'].includes(error.code))throw error;}
        await delay(100);
    }
    if(!activeText)throw Error('Chrome debugging endpoint unavailable');
    const [port,endpoint]=activeText.split('\n');
    ws=new WebSocket(`ws://127.0.0.1:${port}${endpoint.trim()}`);
    await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
    let nextId=0;const pending=new Map();
    ws.addEventListener('message',event=>{
        const message=JSON.parse(event.data);const task=pending.get(message.id);
        if(task){pending.delete(message.id);message.error?task.reject(Error(message.error.message)):task.resolve(message.result);}
    });
    function send(method,params={},sessionId){return new Promise((resolve,reject)=>{
        const id=++nextId;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
    });}
    const {targetId}=await send('Target.createTarget',{url:'about:blank'});
    const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
    const command=(method,params)=>send(method,params,sessionId);
    const evaluate=async expression=>{
        const result=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,replMode:true});
        if(result.exceptionDetails)throw Error(result.exceptionDetails.text+': '+JSON.stringify(result.exceptionDetails.exception));
        return result.result.value;
    };
    const until=async expression=>{
        for(let i=0;i<150;i++){if(await evaluate(expression))return;await delay(100);}
        throw Error('Timed out waiting for '+expression);
    };
    await command('Network.enable');await command('Page.enable');
    await command('Page.navigate',{url});
    await until("document.readyState==='complete' && !!navigator.serviceWorker.controller && document.getElementById('pwaStatus')?.textContent.includes('Ready')");
    assert.equal(await evaluate("navigator.serviceWorker.controller.scriptURL.endsWith('/my-day/sw.js')"),true);
    assert.equal(await evaluate("(await caches.keys()).some(key=>key.startsWith('my-day:/my-day/:'))"),true);
    console.log('PASS Service worker installation and subdirectory scope');
    await evaluate("tasks=[{id:'offline-test',name:'Offline test',date:formatDate(new Date()),time:'09:00',duration:60,icon:'⭐',color:'purple',notes:'',repeat:'none',inbox:false}]; settings.theme='ocean'; saveAll(); refreshEverything();");
    await command('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
    await command('Page.reload',{ignoreCache:true});
    await until("document.readyState==='complete' && document.querySelector('.task-card')?.textContent.includes('Offline test')");
    assert.equal(await evaluate("document.documentElement.dataset.theme"),'ocean');
    assert.equal(await evaluate("getComputedStyle(document.body).backgroundColor"),'rgb(235, 235, 235)');
    console.log('PASS Offline reload retains schedule, JavaScript, CSS, and theme');
    await evaluate("openTaskEditor();document.getElementById('taskName').value='Created offline';document.getElementById('taskForm').dispatchEvent(new Event('submit',{cancelable:true}));");
    assert.equal(await evaluate("tasks.some(task=>task.name==='Created offline')"),true);
    await command('Page.reload',{ignoreCache:true});
    await until("document.readyState==='complete' && document.querySelector('#taskCount')?.textContent.includes('2 tasks')");
    assert.equal(await evaluate("tasks.some(task=>task.name==='Created offline')"),true);
    console.log('PASS Offline task creation persists across reload');
    assert.equal(await evaluate("(await fetch('./icons/icon-192.png')).ok"),true);
    assert.equal(await evaluate("(await (await fetch('./manifest.webmanifest')).json()).name"),'My Day');
    console.log('PASS App icons and manifest available offline');
    // Cross-app caches on the same origin must survive our worker cleanup.
    await evaluate("await caches.open('other-app-cache');await caches.open('my-day:/my-day/:old');const registration=await navigator.serviceWorker.getRegistration();const text=await (await caches.open('my-day:/my-day/:v14')).match(new URL('./index.html',location.href));if(!text)throw Error('Missing shell');");
    assert.equal(await evaluate("(await caches.keys()).includes('other-app-cache')"),true);
    console.log('PASS Cache storage uses app-specific names');
    await send('Browser.close');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{
    ws?.close();browser?.kill();server.close();
});
