(function(root) {
  'use strict';
  const STAMP = /\[(\d{1,6}):([0-5]\d)(?:[.:](\d{1,3}))?\]/g;
  function parseTime(s) {
    const m = /^\[?(\d{1,6}):([0-5]\d)(?:[.:](\d{1,3}))?\]?$/.exec(s.trim());
    if (!m) throw new Error('時間格式請用 mm:ss.xx，例如 01:23.45');
    return Number(m[1])*60000 + Number(m[2])*1000 + Number((m[3] || '').padEnd(3, '0'));
  }
  function time(ms, precision=2) {
    const unit = precision === 3 ? 1 : 10;
    const n = Math.max(0, Math.round(ms/unit)*unit);
    return String(Math.floor(n/60000)).padStart(2,'0') + ':' + String(Math.floor(n/1000)%60).padStart(2,'0') + '.' + String(Math.floor(n%1000/unit)).padStart(precision,'0');
  }
  function parse(text) {
    if (/<\d{1,6}:[0-5]\d(?:[.:]\d{1,3})?>/.test(text)) throw new Error('此檔案為逐字 Enhanced LRC，請先轉為逐句 LRC');
    const rows=[], meta={}; let offset=0; const warnings=[];
    for (let line of text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n')) {
      const tag = /^\[([a-zA-Z][a-zA-Z0-9_-]*):(.*)\]\s*$/.exec(line);
      if (tag) {
        if (tag[1].toLowerCase() === 'offset') {
          if (!/^[+-]?\d+$/.test(tag[2].trim())) throw new Error('offset 標籤必須是整數毫秒');
          offset = Number(tag[2]);
          if (!Number.isSafeInteger(offset)) throw new Error('offset 超出可用範圍');
        } else meta[tag[1]] = tag[2];
        continue;
      }
      const matches = [...line.matchAll(STAMP)];
      if (matches.length) {
        const lyric = line.replace(STAMP,'').trimEnd();
        for (const m of matches) rows.push({ms:parseTime(m[0]),text:lyric});
      } else if (line.trim()) {
        if (/^\[\d+:/.test(line)) throw new Error('時間標記格式錯誤：' + line.slice(0,40));
        rows.push({ms:null,text:line});
      }
    }
    if (rows.length > 3000) throw new Error('單份歌詞上限為 3,000 行');
    if (offset) {
      // Standard LRC offset: positive means show lyrics earlier.
      if (rows.some(r => r.ms !== null && r.ms-offset < 0)) warnings.push('offset 套用後早於 0 的時間已設為 0');
      rows.forEach(r => { if (r.ms !== null) r.ms = Math.max(0,r.ms-offset); });
      warnings.push('已將 offset 換算進每句時間；匯出不重複套用');
    }
    return {rows,meta,warnings};
  }
  function issues(rows) {
    let missing=0, backwards=0, last=-1;
    for (const r of rows) {
      if (r.ms === null) missing++;
      else { if (!Number.isFinite(r.ms) || r.ms < 0) throw new Error('存在無效時間'); if (r.ms < last) backwards++; last=r.ms; }
    }
    return {missing,backwards};
  }
  function exportLrc(doc, precision=2) {
    const check=issues(doc.rows);
    if (check.missing) throw new Error('尚有 '+check.missing+' 行未打點');
    if (check.backwards) throw new Error('歌詞時間有倒序，請修正或使用依時間排序');
    if (!doc.rows.length) throw new Error('請先加入歌詞');
    const clean = s => String(s).replace(/[\r\n]/g,' ');
    const header=Object.entries(doc.meta || {}).filter(([k])=>k.toLowerCase()!=='offset' && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(k)).map(([k,v])=>'['+k+':'+clean(v).replace(/\]/g,'')+']');
    return [...header,...doc.rows.map(r=>'['+time(r.ms,precision)+']'+clean(r.text))].join('\n')+'\n';
  }
  function shift(rows, start, end, delta) {
    if (!Number.isFinite(delta) || !Number.isInteger(delta)) throw new Error('請輸入整數毫秒');
    const affected = rows.slice(start,end+1).filter(r=>r.ms !== null);
    if (!affected.length) throw new Error('選取範圍沒有已打點歌詞');
    if (affected.some(r=>r.ms+delta < 0)) throw new Error('位移會產生負時間，未套用');
    affected.forEach(r=>r.ms+=delta);
  }
  function validateDraft(doc) {
    if (!doc || !Array.isArray(doc.rows) || doc.rows.length > 3000 || typeof doc.meta !== 'object' || doc.meta === null || Array.isArray(doc.meta)) return false;
    return doc.rows.every(r=>r && typeof r.text==='string' && (r.ms===null || (Number.isSafeInteger(r.ms) && r.ms>=0)));
  }
  function nextUntimed(rows, selected, includeCurrent=false) {
    if (!rows.length) return -1;
    const start = Math.max(0, Math.min(rows.length-1, selected));
    for (let step=includeCurrent?0:1; step<(includeCurrent?rows.length:rows.length+1); step++) {
      const i=(start+step)%rows.length;
      if (rows[i].ms===null) return i;
    }
    return -1;
  }
  function nextStampIndex(rows, selected, skipTimed=false) {
    for (let i=selected+1;i<rows.length;i++) if (!skipTimed || rows[i].ms===null) return i;
    return -1;
  }
  function firstProblem(rows) {
    const missing=rows.findIndex(r=>r.ms===null);
    if (missing>=0) return {index:missing,kind:'missing'};
    for (let i=1;i<rows.length;i++) if(rows[i].ms<rows[i-1].ms) return {index:i,kind:'backwards'};
    return null;
  }
  function activeLines(rows, position) {
    if (!Number.isFinite(position) || position < 0) return [];
    let latest=-1, indices=[];
    rows.forEach((row,i)=>{
      if(row.ms===null || row.ms>position)return;
      if(row.ms>latest){latest=row.ms;indices=[i];}
      else if(row.ms===latest)indices.push(i);
    });
    return indices;
  }
  const api={activeLines,parseTime,time,parse,issues,exportLrc,shift,validateDraft,nextUntimed,nextStampIndex,firstProblem};
  if (typeof module!=='undefined') module.exports=api;
  root.Lrc=api;
})(typeof globalThis!=='undefined'?globalThis:this);
