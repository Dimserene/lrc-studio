const {test}=require('node:test');
const assert=require('node:assert/strict');
const L=require('../app/src/main/assets/core.js');
test('pure text, BOM and CRLF import',()=>{
  assert.deepEqual(L.parse('\uFEFF第一句\r\n第二句\r\n').rows,[{ms:null,text:'第一句'},{ms:null,text:'第二句'}]);
});
test('multi stamps, blank timed line, metadata and precision',()=>{
  const d=L.parse('[ti:測試]\n[00:01.2][00:04.567]重複句\n[00:08.00]');
  assert.equal(d.meta.ti,'測試');
  assert.deepEqual(d.rows,[{ms:1200,text:'重複句'},{ms:4567,text:'重複句'},{ms:8000,text:''}]);
});
test('rounding carries into minute and hours represented as minutes',()=>{
  assert.equal(L.time(59999), '01:00.00');
  assert.equal(L.time(3600123,3),'60:00.123');
  assert.equal(L.parseTime('100:23.45'),6023450);
});
test('positive offset earlier, normalized only once on export',()=>{
  const d=L.parse('[offset:200]\n[00:01.00]a\n[00:02.00]b');
  assert.equal(d.rows[0].ms,800);
  const output=L.exportLrc(d,3);
  assert.ok(!output.includes('offset'));
  assert.deepEqual(L.parse(output).rows,d.rows);
});
test('negative offset later, negative resulting positions clamp with warning',()=>{
  assert.equal(L.parse('[offset:-200]\n[00:01.00]a').rows[0].ms,1200);
  const d=L.parse('[offset:200]\n[00:00.10]a');
  assert.equal(d.rows[0].ms,0);assert.equal(d.warnings.length,2);
});
test('malformed timestamps and offset rejected',()=>{
  assert.throws(()=>L.parse('[00:99.00]a'));
  assert.throws(()=>L.parse('[offset:hello]\n[00:01.00]a'));
  assert.throws(()=>L.parseTime('01:99.00'));
});
test('export rejects untimed or backwards rows, keeps equal times for translations',()=>{
  assert.throws(()=>L.exportLrc({rows:[{ms:null,text:'a'}]}),/未打點/);
  assert.throws(()=>L.exportLrc({rows:[{ms:2000,text:'a'},{ms:1000,text:'b'}]}),/倒序/);
  assert.match(L.exportLrc({rows:[{ms:1000,text:'hello'},{ms:1000,text:'你好'}]}),/hello\n\[00:01.00\]你好/);
});
test('range shift excludes untimed rows; negative crossing rejects atomically',()=>{
  const rows=[{ms:1000,text:'a'},{ms:null,text:'b'},{ms:3000,text:'c'}];
  L.shift(rows,0,1,200);assert.equal(rows[0].ms,1200);assert.equal(rows[2].ms,3000);assert.equal(rows[1].ms,null);
  assert.throws(()=>L.shift(rows,0,2,-1300));assert.equal(rows[0].ms,1200);assert.equal(rows[2].ms,3000);
});
test('metadata cannot inject timestamp lines into exported file',()=>{
  const text=L.exportLrc({meta:{ti:'x]\n[00:00.00]bad'},rows:[{ms:0,text:'ok'}]});
  assert.equal(text.trim().split('\n').length,2);
});
test('draft rejects corrupt row time and keeps untimed lines',()=>{
  assert.equal(L.validateDraft({meta:{},rows:[{ms:-1,text:'a'}]}),false);
  assert.equal(L.validateDraft({meta:{},rows:[{ms:null,text:'a'}]}),true);
});
test('next untimed wraps to earlier gaps without selecting timed rows',()=>{
  const rows=[{ms:0},{ms:null},{ms:300},{ms:null}];
  assert.equal(L.nextUntimed(rows,1),3);
  assert.equal(L.nextUntimed(rows,3),1);
  assert.equal(L.nextUntimed(rows,1,true),1);
  assert.equal(L.nextUntimed([{ms:0}],0),-1);
  assert.equal(L.nextUntimed([],0),-1);
});
test('skip-timed advancement never wraps the timeline and handles completion',()=>{
  const rows=[{ms:100},{ms:200},{ms:null},{ms:400}];
  assert.equal(L.nextStampIndex(rows,0,true),2);
  assert.equal(L.nextStampIndex(rows,0,false),1);
  assert.equal(L.nextStampIndex(rows,2,true),-1);
  assert.equal(L.nextStampIndex(rows,3,false),-1);
});
test('export guidance identifies missing then backwards time, equal times accepted',()=>{
  assert.deepEqual(L.firstProblem([{ms:200},{ms:100},{ms:null}]),{index:2,kind:'missing'});
  assert.deepEqual(L.firstProblem([{ms:200},{ms:100}]),{index:1,kind:'backwards'});
  assert.equal(L.firstProblem([{ms:0},{ms:0}]),null);
});
test('active subtitles ignore untimed rows and follow exact boundaries and backwards seek',()=>{
 const rows=[{ms:null},{ms:1000},{ms:2000}];
 assert.deepEqual(L.activeLines(rows,999),[]);
 assert.deepEqual(L.activeLines(rows,1000),[1]);
 assert.deepEqual(L.activeLines(rows,2500),[2]);
 assert.deepEqual(L.activeLines(rows,1500),[1]);
});
test('active subtitles include translations with equal timestamps and tolerate unsorted editing',()=>{
 assert.deepEqual(L.activeLines([{ms:3000},{ms:1000},{ms:1000}],2000),[1,2]);
 assert.deepEqual(L.activeLines([{ms:0}],0),[0]);
 assert.deepEqual(L.activeLines([{ms:0}],NaN),[]);
});
