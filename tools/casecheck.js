// Read-only check of what the PUBLIC link can and cannot do (never writes). Run: node tools/casecheck.js   (reads site.config.json)
const cfg=JSON.parse(require('fs').readFileSync(require('path').join(__dirname,'..','site.config.json'),'utf8'));
const API=cfg.api, TOK=cfg.publicToken;
async function call(fn,...args){ try{ const r=await fetch(API,{method:'POST',body:JSON.stringify({fn,args}),redirect:'follow'}); const t=await r.text(); let j; try{j=JSON.parse(t)}catch(e){return {http:r.status,notjson:t.slice(0,80)}} return {http:r.status,ok:j.ok,error:j.error,result:j.result}; }catch(e){ return {neterr:String(e).slice(0,80)} } }
const rows=[]; const add=(name,expect,pass,detail)=>rows.push({name,expect,pass,detail});
const denied=r=>r.ok===false; const gotData=r=>r.ok===true&&r.result&&!r.result.error;
(async()=>{
 let r=await call('getShare',TOK); const d=r.result||{};
 add('1  Public link opens (getShare)','works',gotData(r)&&d.releases&&d.releases.length>0,`${(d.releases||[]).length} releases, ${(d.tracks||[]).length} songs`);
 add('2  Public link carries no other people\'s links','0 shares',(d.shares?Object.keys(d.shares).length:0)===0,'shares in response: '+(d.shares?Object.keys(d.shares).length:0));
 add('3  Public link cannot download files','download off',d.share&&d.share.allow_download===false,'allow_download='+(d.share&&d.share.allow_download));
 add('4  No owner key or owner token in the data','none',!/"owner"/.test(JSON.stringify(Object.assign({},d,{stream_key:undefined,releases:undefined,tracks:undefined,versions:undefined,extras:undefined}))),'checked top-level fields');
 r=await call('getShare',TOK.toUpperCase()); add('5  Link in CAPITALS','refused',!gotData(r),JSON.stringify(r.error||r.result&&r.result.error||r).slice(0,70));
 r=await call('getShare',TOK.slice(0,-1)+(TOK.slice(-1)==='0'?'1':'0')); add('6  Link with last character changed','refused',!gotData(r),JSON.stringify(r.error||r.result&&r.result.error||r).slice(0,70));
 r=await call('getShare',''); add('7  Empty link','refused',!gotData(r),JSON.stringify(r.error||r.result&&r.result.error||r).slice(0,70));
 r=await call('getShare','x'.repeat(5000)); add('8  Absurdly long link','refused, no crash',!gotData(r),JSON.stringify(r.error||r.result&&r.result.error||r).slice(0,70));
 for (const fn of ['getLibrary','getInsights','errorSummary','youtubeTitleStatus','checkYoutube']) { r=await call(fn,TOK); add(`9  Owner-only "${fn}" using the public link`,'denied',denied(r)||!!(r.result&&r.result.error),String(r.error||(r.result&&r.result.error)||JSON.stringify(r)).slice(0,70)); }
 r=await call('getLibrary',TOK.toUpperCase()); add('10 Owner-only call with a CAPITALS link','denied',denied(r),String(r.error||'').slice(0,70));
 r=await call('notARealFunction'); add('11 Unknown request name','denied',denied(r),String(r.error||'').slice(0,70));
 const w=['DeletE','deleteTrack','constructor','__proto__']; for (const fn of w){ r=await call(fn,TOK); add(`12 Odd request name "${fn}"`,'denied',denied(r),String(r.error||'').slice(0,70)); }
 r=await call('getHome',TOK); const gh=r.result||{};
 if(r.ok===false&&/Unknown action/.test(r.error||'')) { add('13 getHome (Home covers, build 67+)','not deployed yet',true,'SKIPPED: backend is older than build 67'); }
 else {
  const relIds=new Set((d.releases||[]).filter(x=>!x.locked).map(x=>x.release_id)), ids=['single','project'].map(k=>gh.picks&&gh.picks[k]&&gh.picks[k].release_id).filter(Boolean);
  add('13 getHome with the public link','only open releases',gotData(r)&&ids.length>0&&ids.every(i=>relIds.has(i)),'picks: '+ids.join(', '));
  add('13 getHome sends nothing but covers','few fields',gotData(r)&&['single','project'].every(k=>!gh.picks[k]||Object.keys(gh.picks[k]).sort().join()==='cover_file_id,release_id,thumb,title'),'fields checked');
  r=await call('getHome',TOK.toUpperCase()); add('13 getHome with a CAPITALS link','refused',!gotData(r),String(r.error||r.result&&r.result.error||'').slice(0,60));
  r=await call('getHome',''); add('13 getHome with an empty link','refused',!gotData(r),String(r.error||r.result&&r.result.error||'').slice(0,60));
 }
 const pad=(s,n)=>String(s).padEnd(n).slice(0,n);
 console.log(pad('CASE',58),pad('EXPECT',16),'RESULT');
 for (const x of rows) console.log(pad(x.name,58),pad(x.expect,16),(x.pass?'PASS':'** FAIL **'),'|',x.detail);
 const f=rows.filter(x=>!x.pass).length; console.log(`\n${rows.length-f} passed, ${f} failed of ${rows.length}`);
})();
