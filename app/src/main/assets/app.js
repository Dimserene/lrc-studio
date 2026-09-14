'use strict';
const $ = id => document.getElementById(id);
const native = window.Android;
let doc={rows:[],meta:{},trackKey:'',selected:0,compensation:0,precision:2};
let history=[], redo=[], player={}, toastTimer, importPending='', seeking=false;
let lastPlayerAt=0;
function notify(message) { $('toast').textContent=message; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3500); }
window.notify=notify;
function save() {
  if (!native) { $('saveStatus').textContent='瀏覽器預覽 · 不保存'; return; }
  try { if (native.saveDraft(JSON.stringify(doc)) === false) throw new Error(); $('saveStatus').textContent='草稿已保存'; }
  catch(e) { $('saveStatus').textContent='保存失敗，請匯出備份'; }
}
function checkpoint() { history.push(JSON.stringify(doc)); if(history.length>60) history.shift(); redo=[]; }
function change(fn) {
  const before=JSON.stringify(doc);
  try { fn(); if(!Lrc.validateDraft(doc)) throw new Error('內容格式無效'); }
  catch(e) { doc=JSON.parse(before); notify(e.message); return false; }
  history.push(before); if(history.length>60) history.shift(); redo=[]; save(); render(); return true;
}
function setSelected(i, scroll=false) { doc.selected=Math.max(0,Math.min(doc.rows.length-1,i)); render(); save(); if(scroll) $('row-'+doc.selected)?.scrollIntoView({block:'nearest',behavior:'smooth'}); }
function render() {
  const list=$('rows'), oldScroll=list.scrollTop;
  if(doc.rows.length) {
    list.replaceChildren();
    doc.rows.forEach((row,i)=>{
      const div=document.createElement('div'); div.id='row-'+i; div.className='lyric'+(i===doc.selected?' selected':''); div.role='option'; div.tabIndex=0; div.setAttribute('aria-selected',i===doc.selected?'true':'false');
      const n=document.createElement('span'); n.className='number'; n.textContent=String(i+1).padStart(2,'0');
      const body=document.createElement('span'); body.className='linecontent'; body.textContent=row.text || '（空白／間奏）';
      const t=document.createElement('span'); t.className='timestamp'+(row.ms===null?' unset':''); t.textContent=row.ms===null?'--:--.--':Lrc.time(row.ms,doc.precision);
      div.append(n,body,t); div.onclick=()=>setSelected(i); div.ondblclick=()=>editLine();
      div.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();setSelected(i);}};
      list.append(div);
    });
  } else list.innerHTML='<div class="empty"><div>♪</div><h3>把歌詞放進來</h3><p>貼上純文字，或匯入現有 LRC。<br>聽到每句開頭時，按下方「打點」。</p></div>';
  list.scrollTop=oldScroll;
  const problems=Lrc.issues(doc.rows);
  $('docTitle').textContent=doc.meta.ti || '歌詞工作區';
  $('progress').textContent=(doc.rows.length-problems.missing)+' / '+doc.rows.length+' 句已打點'+(problems.backwards?' · '+problems.backwards+' 處倒序':'');
  $('undo').disabled=!history.length;
  const current=doc.rows[doc.selected];
  $('edit').disabled=!current;
  $('minus').disabled=$('plus').disabled=!current || current.ms===null;
  $('previous').disabled=!current || doc.selected===0;
  $('next').disabled=!current || doc.selected===doc.rows.length-1;
  $('selectedLabel').textContent=current?'第 '+(doc.selected+1)+' 句 · '+(current.ms===null?'準備打點':Lrc.time(current.ms,doc.precision)):'選取一句，準備打點';
  updatePlayerUI();
}
function usable(p) { return !!(p.permission && p.connected && p.valid && p.title && p.trackKey && p.trackKey===doc.trackKey && Number.isFinite(p.position)); }
function updatePlayerUI() {
  const p=player;
  const playerName=p.playerName || 'YouTube Music ReVanced';
  $('song').textContent=p.title || '先在 '+playerName+' 播放歌曲';
  $('artist').textContent=p.artist || '回到這裡，就能開始對時';
  $('clock').textContent=p.connected&&p.valid?Lrc.time(p.position||0,doc.precision):'--:--.--';
  $('duration').textContent=p.duration?'／ '+Lrc.time(p.duration).split('.')[0]:'／ --:--';
  $('status').textContent=!native?'介面預覽 · 請在 Android App 使用':!p.permission?'尚未開啟通知存取權':!p.connected?'請在 '+playerName+' 開始播放':p.remote?'遠端播放不支援精確打點':'已連接 '+playerName;
  $('statusDot').classList.toggle('on',!!p.connected&&!!p.valid);
  $('connect').textContent=p.permission?'權限':'連接';
  $('live').textContent=p.valid?(p.playing?'同步播放中':'已暫停'):'等待有效進度';
  $('play').textContent=p.playing?'暫停':'播放';
  $('play').disabled=!p.connected || !(p.playing?p.canPause:p.canPlay);
  $('back5').disabled=$('next5').disabled=!p.canSeek || !p.valid;
  $('seekbar').disabled=!p.canSeek || !(p.duration>0);
  $('seekbar').max=p.duration || 1;
  if(!seeking) $('seekbar').value=p.position || 0;
  $('bind').disabled=!p.connected || !p.title || !doc.rows.length;
  $('bind').textContent=doc.trackKey && doc.trackKey===p.trackKey?'已連結目前歌曲 ✓':'將目前歌曲連結到這份歌詞';
  const mismatch=doc.trackKey && p.connected && p.trackKey && p.trackKey!==doc.trackKey;
  $('mismatch').hidden=!mismatch;
  $('mismatch').textContent='偵測到切歌，已暫停打點。請切回原曲，或確認後重新連結。';
  $('stamp').disabled=!doc.rows.length || !usable(p) || seeking;
  let active=-1;
  if(usable(p)) doc.rows.forEach((r,i)=>{if(r.ms!==null && r.ms<=p.position && (active<0 || r.ms>=doc.rows[active].ms))active=i;});
  document.querySelectorAll('.lyric.heard').forEach(el=>el.classList.remove('heard'));
  if(active>=0)$('row-'+active)?.classList.add('heard');
}
window.onPlayer=p=>{player=p;lastPlayerAt=performance.now();updatePlayerUI();};
function transport(action,target=0) {
  if(!native)return notify('請在 Android App 中連接 YouTube Music');
  native.transport(action,Math.round(Math.max(0,Math.min(player.duration||Number.MAX_SAFE_INTEGER,target))));
}
function showDialog(title,html,apply,label='套用') {
  if($('dialog').open)$('dialog').close();
  $('dialogTitle').textContent=title; $('dialogBody').innerHTML=html; $('dialogError').hidden=true;
  $('dialogApply').textContent=label; $('dialogApply').hidden=!apply;
  $('dialogApply').onclick=()=>{try{if(apply()!==false)$('dialog').close();}catch(e){$('dialogError').textContent=e.message;$('dialogError').hidden=false;}};
  $('dialog').showModal();
}
function confirmAction(title,message,fn) {
  showDialog(title,'<p id="confirmText" class="dialoghint"></p>',()=>{fn();},'確認');
  $('confirmText').textContent=message;
}
function replaceLyrics(text) {
  const parsed=Lrc.parse(text);
  if(!parsed.rows.length)throw new Error('沒有可匯入的歌詞');
  change(()=>{doc.rows=parsed.rows;doc.meta=parsed.meta;doc.trackKey='';doc.selected=0;});
  notify(parsed.warnings.join('；') || '已匯入 '+parsed.rows.length+' 句，請連結歌曲後打點');
}
window.receiveImport=text=>{
  importPending=text;
  if(doc.rows.length)confirmAction('取代目前歌詞？','目前草稿將被取代；可按撤銷復原。建議先匯出專案備份。',()=>replaceLyrics(importPending));
  else {try{replaceLyrics(text);}catch(e){notify(e.message);}}
};
function paste() {
  showDialog('貼上歌詞','<p class="dialoghint">每行一句。支援純文字與 LRC；匯入會取代目前草稿，可撤銷。</p><textarea id="pasteText" placeholder="在此貼上歌詞…" aria-label="歌詞文字"></textarea>',()=>replaceLyrics($('pasteText').value),'匯入');
}
function editLine() {
  const r=doc.rows[doc.selected]; if(!r)return;
  showDialog('編輯第 '+(doc.selected+1)+' 句','<label for="lineText">歌詞</label><textarea id="lineText"></textarea><label for="lineTime">時間（留白＝未打點）</label><input id="lineTime" placeholder="01:23.45" inputmode="decimal">',()=>{
    if(/[\r\n]/.test($('lineText').value))throw new Error('單句不能包含換行，請使用「分句」');
    const t=$('lineTime').value.trim(),ms=t?Lrc.parseTime(t):null;
    change(()=>{r.text=$('lineText').value;r.ms=ms;});
  });
  $('lineText').value=r.text; $('lineTime').value=r.ms===null?'':Lrc.time(r.ms,3);
}
function stamp() {
  if(!native || !doc.rows.length)return;
  let snap;
  try{snap=JSON.parse(native.snapshot());}catch(e){return notify('無法取得播放器進度');}
  window.onPlayer(snap);
  if(!usable(snap))return notify('請確認歌曲連結與播放進度');
  const ms=Math.round(snap.position+doc.compensation);
  if(ms<0)return notify('補償後的時間小於 0，請調整補償值');
  const i=doc.selected;
  change(()=>{doc.rows[i].ms=ms;doc.selected=Math.min(i+1,doc.rows.length-1);});
  $('row-'+doc.selected)?.scrollIntoView({block:'nearest',behavior:'smooth'});
  if(i===doc.rows.length-1)notify('最後一句已打點，可檢查並匯出');
}
function nudge(delta) { if(doc.rows[doc.selected]?.ms!==null)change(()=>Lrc.shift(doc.rows,doc.selected,doc.selected,delta)); }
function exportLrc() {
  try {
    const text=Lrc.exportLrc(doc,doc.precision);
    if(!native)return notify('請在 Android App 匯出檔案');
    native.exportFile((doc.meta.ti||'lyrics').replace(/[\\/:*?"<>|]/g,'_')+'.lrc',text);
  }catch(e){notify(e.message);}
}
function shiftDialog() {
  if(!doc.rows.length)return notify('請先匯入歌詞');
  showDialog('時間位移','<p class="dialoghint">正值往後、負值提前。只調整已打點句子；未打點句子保持空白。</p><label for="shiftAmount">位移毫秒（例如 −200）</label><input id="shiftAmount" type="number" step="1" value="0"><div class="fields"><div><label for="fromLine">起始句</label><input id="fromLine" type="number" min="1"></div><div><label for="toLine">結束句</label><input id="toLine" type="number" min="1"></div></div>',()=>{
    const a=Number($('fromLine').value)-1,b=Number($('toLine').value)-1,d=Number($('shiftAmount').value);
    if(!Number.isInteger(a)||!Number.isInteger(b)||a<0||b>=doc.rows.length||a>b)throw new Error('請確認起訖句數');
    if(!$('shiftAmount').value.trim())throw new Error('請輸入位移毫秒');
    if(!change(()=>Lrc.shift(doc.rows,a,b,d)))return false;
  });
  $('fromLine').value=1;$('toLine').value=doc.rows.length;
}
function splitLine() {
  const r=doc.rows[doc.selected];if(!r)return notify('請先選取一句');
  showDialog('分句','<p class="dialoghint">在要分開的位置換行。第一句保留原時間，後續句子重新打點。</p><textarea id="splitText" aria-label="以換行分句"></textarea>',()=>{
    const parts=$('splitText').value.split(/\r?\n/).filter(x=>x.trim());
    if(parts.length<2)throw new Error('請以換行分成至少兩句');
    change(()=>doc.rows.splice(doc.selected,1,...parts.map((text,i)=>({text,ms:i===0?r.ms:null}))));
  });$('splitText').value=r.text;
}
function metaDialog() {
  showDialog('歌曲資料','<label for="metaTitle">歌名</label><input id="metaTitle"><label for="metaArtist">歌手</label><input id="metaArtist"><label for="metaAlbum">專輯</label><input id="metaAlbum"><label for="metaBy">LRC 製作者</label><input id="metaBy">',()=>change(()=>{doc.meta.ti=$('metaTitle').value;doc.meta.ar=$('metaArtist').value;doc.meta.al=$('metaAlbum').value;doc.meta.by=$('metaBy').value;}));
  $('metaTitle').value=doc.meta.ti||'';$('metaArtist').value=doc.meta.ar||'';$('metaAlbum').value=doc.meta.al||'';$('metaBy').value=doc.meta.by||'';
}
function settings() {
  showDialog('打點設定','<label for="compensation">打點補償（毫秒）</label><input id="compensation" type="number" min="-5000" max="5000" step="10"><p class="dialoghint">若你按下時總是慢 0.2 秒，填 −200。只影響之後的打點，不移動既有時間。藍牙耳機延遲請自行校準。</p><label for="precision">LRC 時間精度</label><select id="precision"><option value="2">百分之一秒 · 00:00.00</option><option value="3">毫秒 · 00:00.000</option></select>',()=>{
    const n=Number($('compensation').value);if(!Number.isInteger(n)||Math.abs(n)>5000)throw new Error('補償範圍為 −5000 到 5000 毫秒');
    change(()=>{doc.compensation=n;doc.precision=Number($('precision').value);});
  });$('compensation').value=doc.compensation;$('precision').value=doc.precision;
}
function toolMenu() {
  const actions=[
    ['音樂播放器',()=>native?.choosePlayer ? native.choosePlayer() : notify('請在新版 Android App 選擇播放器')],
    ['歌曲資料',metaDialog],['整體／區段位移',shiftDialog],['分句',splitLine],['與下一句合併',()=>{
      if(doc.selected>=doc.rows.length-1)return notify('目前已是最後一句');
      confirmAction('合併兩句？','保留目前這句的時間，下一句文字併入同一行。',()=>change(()=>{doc.rows[doc.selected].text+=' '+doc.rows[doc.selected+1].text;doc.rows.splice(doc.selected+1,1);}));
    }],['新增一句',()=>{if(!change(()=>{doc.rows.splice(doc.rows.length?doc.selected+1:0,0,{text:'',ms:null});if(doc.rows.length>1)doc.selected++;}))return;editLine();}],
    ['刪除此句',()=>{if(!doc.rows.length)return;confirmAction('刪除此句？',doc.rows[doc.selected].text,()=>change(()=>{doc.rows.splice(doc.selected,1);doc.selected=Math.max(0,Math.min(doc.selected,doc.rows.length-1));}));}],
    ['從此句試聽',()=>{const r=doc.rows[doc.selected];if(!r||r.ms===null)return notify('此句尚未打點');if(!usable(player)||!player.canSeek)return notify('請連接同一首歌曲，並確認播放器支援跳轉');transport('seek',Math.max(0,r.ms-1500));notify('已要求跳到此句前 1.5 秒；按播放開始');}],
    ['依時間排序',()=>confirmAction('依時間排序？','已打點句子將按時間排列，未打點句子移到最後。相同時間維持原本順序。',()=>change(()=>{doc.rows.sort((a,b)=>(a.ms??Infinity)-(b.ms??Infinity));doc.selected=0;}))],
    ['重做',()=>{if(!redo.length)return notify('沒有可重做操作');history.push(JSON.stringify(doc));doc=JSON.parse(redo.pop());save();render();}],
    ['打點設定',settings],['匯出專案備份',()=>{if(!native)return notify('請在 Android App 匯出');native.exportFile('lrc-project.json',JSON.stringify({format:'lrc-studio-v1',doc},null,2));}],
    ['匯入專案備份',()=>{if(!native)return;importMode='project';native.importFile();}],
    ['清空時間',()=>confirmAction('清空所有時間？','歌詞文字會保留，全部句子將變成未打點。',()=>change(()=>doc.rows.forEach(r=>r.ms=null)))],
    ['使用說明',()=>showDialog('開始製作 LRC','<p class="dialoghint">① 開啟通知存取權。<br>② 在 YouTube Music 播放歌曲，再回到此 App。<br>③ 匯入或貼上歌詞，按「連結目前歌曲」。<br>④ 聽到句首時按「打點」，自動選取下一句。<br>⑤ 點選歌詞，微調時間或編輯文字。<br>⑥ 每句打點完成後匯出 LRC。</p><p class="dialoghint">草稿只保留目前一份，換專案前請匯出專案備份。支援 UTF-8 LRC、TXT、多時間標記及一般中繼資料。未實作逐字 Enhanced LRC。背景播放取決於 YouTube Music 帳號與功能；若切回時停止播放，可使用系統分割畫面。投放到其他裝置時暫停打點。毫秒顯示不代表音訊實際同步精度。</p>',null)]
  ];
  showDialog('更多工具','<div class="tools" id="toolList"></div>',null);
  for(const [label,fn]of actions){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>{$('dialog').close();fn();};$('toolList').append(b);}
}
let importMode='lyrics';
const receiveLyrics=window.receiveImport;
window.receiveImport=text=>{
  if(importMode==='project') {
    importMode='lyrics';
    try {
      const data=JSON.parse(text);
      if(data.format!=='lrc-studio-v1'||!Lrc.validateDraft(data.doc))throw new Error('不是有效的拍點 LRC 專案');
      const restored=normalize(data.doc);
      confirmAction('載入備份專案？','目前草稿將被取代，可撤銷復原。',()=>change(()=>doc=restored));
    }catch(e){notify(e.message);}
  }else receiveLyrics(text);
};
function normalize(d){d.selected=Math.max(0,Math.min(Number.isInteger(d.selected)?d.selected:0,Math.max(0,d.rows.length-1)));d.compensation=Number.isInteger(d.compensation)&&Math.abs(d.compensation)<=5000?d.compensation:0;d.precision=d.precision===3?3:2;d.trackKey=typeof d.trackKey==='string'?d.trackKey:'';return d;}
$('connect').onclick=()=>native?native.permission():notify('通知權限僅在 Android App 內提供');
$('openMusic').onclick=()=>native?native.openMusic():notify('請在 Android App 開啟 YouTube Music');
$('import').onclick=()=>{if(native){importMode='lyrics';native.importFile();}else notify('預覽模式請使用「貼上歌詞」');};
$('paste').onclick=paste;$('export').onclick=exportLrc;$('edit').onclick=editLine;
$('stamp').onpointerdown=e=>{if(e.button===0&&!$('stamp').disabled){e.preventDefault();stamp();}};
$('stamp').onclick=e=>{if(e.detail===0&&!$('stamp').disabled)stamp();};
$('minus').onclick=()=>nudge(-50);$('plus').onclick=()=>nudge(50);
$('previous').onclick=()=>setSelected(doc.selected-1,true);$('next').onclick=()=>setSelected(doc.selected+1,true);
$('undo').onclick=()=>{if(!history.length)return;redo.push(JSON.stringify(doc));doc=JSON.parse(history.pop());save();render();};
$('more').onclick=toolMenu;
$('play').onclick=()=>transport(player.playing?'pause':'play');
$('back5').onclick=()=>transport('seek',(player.position||0)-5000);$('next5').onclick=()=>transport('seek',(player.position||0)+5000);
$('seekbar').oninput=()=>{seeking=true;updatePlayerUI();};
$('seekbar').onchange=()=>{const target=Number($('seekbar').value);seeking=false;transport('seek',target);};
$('bind').onclick=()=>{
  const target={...player};
  if(!target.trackKey||!target.title)return;
  confirmAction('連結目前歌曲',target.title+' — '+(target.artist||'未知歌手')+'。連結後使用這首歌的播放進度打點，既有時間不會改動。',()=>change(()=>{doc.trackKey=target.trackKey;doc.meta.ti=target.title;doc.meta.ar=target.artist||'';}));
};
document.addEventListener('keydown',e=>{
  if($('dialog').open||/INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName))return;
  if(e.code==='Space'){e.preventDefault();if(!$('stamp').disabled)stamp();}
});
try{const raw=native?.loadDraft();if(raw){const loaded=JSON.parse(raw);if(!Lrc.validateDraft(loaded))throw new Error();doc=normalize(loaded);}}catch(e){notify('原草稿無法讀取，請匯入備份');}
render();
setInterval(()=>{if(native&&lastPlayerAt&&performance.now()-lastPlayerAt>2000){player.valid=false;updatePlayerUI();}},1000);
