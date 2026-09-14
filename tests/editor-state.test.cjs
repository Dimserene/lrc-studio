// Runs the real editor handlers with a simulated native bridge.
// DOM rendering is stubbed; these are logic checks, not device/UI validation.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const Lrc=require('../app/src/main/assets/core.js');
function editor(){
 const elements=new Map();
 const el=id=>{
  if(!elements.has(id))elements.set(id,{textContent:'',innerHTML:'',scrollTop:0,disabled:false,classList:{add(){},remove(){},toggle(){}},addEventListener(){},getBoundingClientRect(){return {top:id.startsWith("row-")?200:0};},clientHeight:100,offsetHeight:50,scrollTo(options){this.lastScroll=options;this.scrollCount=(this.scrollCount||0)+1;},setAttribute(){},replaceChildren(){},append(){},showModal(){},close(){}});
  return elements.get(id);
 };
 const p={permission:true,connected:true,valid:true,playing:true,title:'Song',trackKey:'id1',position:1000};
 const c=vm.createContext({Lrc,console,performance:{now:()=>c.now||0},setTimeout:()=>0,clearTimeout(){},setInterval(){},document:{getElementById:el,querySelectorAll:()=>[],addEventListener(){}},Android:{loadDraft:()=>'',saveDraft:d=>true,snapshot:()=>JSON.stringify(p),exportFile:(n,t)=>c.output={n,t}}});
 c.window=c;
 vm.runInContext(fs.readFileSync(require.resolve('../app/src/main/assets/app.js'),'utf8'),c);
 vm.runInContext("realUpdate=updatePlayerUI;render=()=>{};updatePlayerUI=()=>{};revealSelected=()=>{};doc=normalize({rows:[{ms:null,text:'a'},{ms:null,text:'b'}],meta:{},trackKey:'id1',selected:0});",c);
 return {run:s=>vm.runInContext(s,c),p,c,el};
}
test('stamp reads fresh native position and locks after final line',()=>{
 const e=editor();e.run('stamp()');e.p.position=2500;e.run('stamp()');
 assert.equal(e.run('doc.rows[1].ms'),2500);
 assert.equal(e.run('doc.stampFinished'),true);
 e.p.position=9000;e.run('stamp()');assert.equal(e.run('doc.rows[1].ms'),2500);
 e.run('setSelected(1);stamp()');assert.equal(e.run('doc.rows[1].ms'),9000);
});
test('undo and redo preserve completion status and last timestamp',()=>{
 const e=editor();e.run('stamp();stamp();undoChange()');
 assert.equal(e.run('doc.rows[1].ms'),null);assert.equal(e.run('doc.stampFinished'),false);
 e.run('redoChange()');assert.equal(e.run('doc.stampFinished'),true);assert.equal(e.run('doc.rows[1].ms'),1000);
});
test('gap mode preserves already timed rows and can wrap back to an earlier gap',()=>{
 const e=editor();e.run("doc.rows=[{ms:null,text:'a'},{ms:null,text:'b'},{ms:7000,text:'c'},{ms:null,text:'d'}];doc.selected=1;doc.skipTimed=true;stamp()");
 assert.equal(e.run('doc.selected'),3);e.run('stamp()');assert.equal(e.run('doc.stampFinished'),true);
 assert.equal(e.run('doc.rows[2].ms'),7000);e.run('nextMissing()');assert.equal(e.run('doc.selected'),0);assert.equal(e.run('doc.stampFinished'),false);
});
test('export jumps to missing/backwards line and produces no partial file',()=>{
 const e=editor();e.run('doc.selected=1;exportLrc()');assert.equal(e.run('doc.selected'),0);assert.equal(e.c.output,undefined);
 e.run('doc.rows[0].ms=2000;doc.rows[1].ms=1000;exportLrc()');assert.equal(e.run('doc.selected'),1);assert.equal(e.c.output,undefined);
});
test('old drafts acquire usable QoL defaults; unknown settings normalize',()=>{
 const e=editor();assert.equal(e.run('doc.nudgeStep'),50);assert.equal(e.run('doc.compact'),true);
 assert.equal(e.run("normalize({rows:[],meta:{},nudgeStep:-100,stampFinished:true}).stampFinished"),false);
 assert.equal(e.run("normalize({rows:[],meta:{},nudgeStep:-100}).nudgeStep"),50);
});
test('track mismatch, seeking and invalid state do not overwrite lyrics',()=>{
 const e=editor();e.p.trackKey='id2';e.run('stamp()');assert.equal(e.run('doc.rows[0].ms'),null);
 e.p.trackKey='id1';e.p.valid=false;e.run('stamp()');assert.equal(e.run('doc.rows[0].ms'),null);
 e.p.valid=true;e.run('seeking=true;stamp()');assert.equal(e.run('doc.rows[0].ms'),null);
});
test('subtitle follow scrolls on line changes without modifying editing selection',()=>{
 const e=editor();e.run("doc.rows[0].ms=0;doc.rows[1].ms=2000;player=JSON.parse(Android.snapshot());realUpdate()");
 assert.equal(e.el('rows').scrollCount,1);
 e.run('realUpdate()');assert.equal(e.el('rows').scrollCount,1);
 e.run('player.position=2200;realUpdate()');assert.equal(e.el('rows').scrollCount,2);
 assert.equal(e.run('doc.selected'),0);
 e.run('player.position=100;realUpdate()');assert.equal(e.el('rows').scrollCount,3);
});
test('manual interaction pauses follow, disabled mode and mismatched tracks never scroll',()=>{
 const e=editor();e.run('doc.rows[0].ms=0;player=JSON.parse(Android.snapshot());holdFollow();realUpdate()');
 assert.equal(e.el('rows').scrollCount,undefined);
 e.c.now=4001;e.run('realUpdate()');assert.equal(e.el('rows').scrollCount,1);
 e.run("doc.followPlayback=false;lastFollowKey='';realUpdate()");assert.equal(e.el('rows').scrollCount,1);
 e.run("doc.followPlayback=true;player.trackKey='other';realUpdate()");assert.equal(e.el('rows').scrollCount,1);
});
