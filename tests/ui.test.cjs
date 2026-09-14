const {chromium}=require('playwright');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../app/src/main/assets');
(async()=>{
 const server=http.createServer((req,res)=>{
   const name=req.url==='/'?'index.html':req.url.slice(1);
   if(!/^[\w.-]+$/.test(name)){res.writeHead(404);return res.end();}
   try{res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(path.join(root,name)));}catch(e){res.writeHead(404);res.end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
   window.testPlayer={permission:true,connected:true,valid:true,title:'測試歌曲',artist:'測試歌手',duration:180000,position:10500,playing:true,trackKey:'test-1',canSeek:true,canPause:true,canPlay:true};
   window.Android={loadDraft:()=>'',saveDraft:d=>{window.savedDraft=d;return true;},snapshot:()=>JSON.stringify(window.testPlayer),exportFile:(n,t)=>window.exported={n,t},permission:()=>{},openMusic:()=>{},transport:(a,t)=>window.command={a,t},importFile:()=>{}};
 });
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.evaluate(()=>window.onPlayer(window.testPlayer));
 await page.click('#paste');await page.fill('#pasteText','第一句測試歌詞\n第二句測試歌詞\n第三句測試歌詞');await page.click('#dialogApply');
 assert.equal(await page.locator('.lyric').count(),3);
 assert.equal(await page.locator('#stamp').isDisabled(),true,'cannot stamp unbound');
 await page.click('#bind');await page.click('#dialogApply');
 await page.evaluate(()=>window.onPlayer(window.testPlayer));
 await page.click('#stamp');
 assert.equal((await page.evaluate(()=>JSON.parse(window.savedDraft))).rows[0].ms,10500);
 assert.equal((await page.evaluate(()=>JSON.parse(window.savedDraft))).selected,1);
 await page.evaluate(()=>{window.testPlayer.position=20000;window.onPlayer(window.testPlayer);});
 await page.click('#stamp');
 await page.click('#undo');
 assert.equal((await page.evaluate(()=>JSON.parse(window.savedDraft))).rows[1].ms,null,'undo restores time and selected');
 await page.click('#stamp');
 await page.evaluate(()=>{window.testPlayer.trackKey='test-2';window.onPlayer(window.testPlayer);});
 assert.equal(await page.locator('#stamp').isDisabled(),true,'switching tracks prevents stamp');
 await page.evaluate(()=>{window.testPlayer.trackKey='test-1';window.testPlayer.position=30000;window.onPlayer(window.testPlayer);});
 await page.click('#stamp');await page.click('#minus');
 assert.equal((await page.evaluate(()=>JSON.parse(window.savedDraft))).rows[2].ms,29950);
 await page.click('#export');assert.match(await page.evaluate(()=>window.exported.t),/\[00:29.95\]第三句/);
 // Editing text must remain inert even if it contains HTML.
 await page.click('#edit');await page.fill('#lineText','<img src=x onerror=alert(1)>');await page.click('#dialogApply');
 assert.equal(await page.locator('#rows img').count(),0);
 await page.click('#undo');
 await page.click('#more');await page.getByRole('button',{name:'分句',exact:true}).click();
 await page.fill('#splitText','第三句\n第四句');await page.click('#dialogApply');
 assert.equal(await page.locator('.lyric').count(),4);
 assert.equal((await page.evaluate(()=>JSON.parse(window.savedDraft))).rows[3].ms,null);
 await page.click('#undo');
 await page.evaluate(()=>window.onPlayer(window.testPlayer));
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 assert.equal(overflow,false,'phone no horizontal overflow');
 const footer=await page.locator('footer').boundingBox();assert.ok(footer.y+footer.height<=853,'stamp footer visible');
 const screenshots=path.resolve(__dirname,'../preview');fs.mkdirSync(screenshots,{recursive:true});
 await page.screenshot({path:path.join(screenshots,'phone.png')});
 await page.setViewportSize({width:360,height:640});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.ok((await page.locator('#rows').boundingBox()).height>60,'small phone retains lyrics');
 await page.setViewportSize({width:800,height:1100});
 await page.screenshot({path:path.join(screenshots,'tablet.png')});
 assert.deepEqual(errors,[]);
 console.log('PASS: import, binding, native snapshot stamp, undo, song change guard, nudge, export, safe text, split, mobile/tablet layout');
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
