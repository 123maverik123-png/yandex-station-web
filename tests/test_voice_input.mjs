import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const code=readFileSync(new URL('../static/voice-input.js',import.meta.url),'utf8');
const {bindVoiceInput,refreshCommand}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
class Target {
  events={}; attrs={}; textContent=''; children=[];
  addEventListener(type,fn){(this.events[type]||=[]).push(fn);}
  emit(type,extra={}){for(const fn of this.events[type]||[])fn({preventDefault(){},...extra});}
  setAttribute(k,v){this.attrs[k]=v;}
  append(v){this.children.push(v);}
  setPointerCapture(){}
  focus(){this.focused=true;}
}
function setup({secure=true,supported=true,sendResult,pause=1500,storage=new Map(),textOnly=false,connected=true}={}){
 const instances=[],sent=[],timers=new Map();let sequence=0;
 class Recognition {
  constructor(){instances.push(this);}
  start(){this.started=true;}
  stop(){this.stopped=true;}
  abort(){this.aborted=true;}
  result(parts){this.onresult({results:parts.map(([text,final=true])=>Object.assign([{transcript:text}],{isFinal:final}))});}
 }
 const win=Object.assign(new Target(),{isSecureContext:secure,location:{href:'http://panel.local:8765/speaker/mini3pro/#player'},setTimeout:(fn,delay)=>{fn.delay=delay;timers.set(++sequence,fn);return sequence;},clearTimeout:id=>timers.delete(id)});
 if(supported)win.SpeechRecognition=Recognition;
 const glagol={connected,state:{aliceState:'IDLE'},updated:1};let available=connected;
 const forms=[0,1].map(index=>{const button=new Target(),auto=new Target(),status=new Target(),support=new Target(),retry=new Target(),submit=new Target(),counter=Object.assign(new Target(),{classList:{toggle(){}}}),input=Object.assign(new Target(),{value:'старый текст',readOnly:false,style:{},scrollHeight:40,setCustomValidity(v){this.validityMessage=v;}});return {button,auto,status,support,retry,submit,elements:{text:input},querySelector:s=>s==='.voice-mic'?(textOnly&&index===1?null:button):s==='.voice-auto'?auto:s==='.voice-count'?counter:s==='.voice-status'?status:s==='.voice-support'?support:s==='.voice-retry'?retry:submit,requestSubmit(){sent.push([index,input.value]);return sendResult;}};});
 const root=Object.assign(new Target(),{defaultView:win,querySelectorAll:()=>forms,createElement:()=>new Target()});
 const controller=bindVoiceInput(root,{httpsPort:()=>8766,pauseMs:()=>pause,ready:()=>available,getGlagol:()=>glagol,store:{get:k=>storage.get(k),set:(k,v)=>storage.set(k,v)}});
 const state=(aliceState,advance=true)=>{glagol.state={aliceState};if(advance)glagol.updated++;controller.update();};
 const connect=value=>{available=glagol.connected=value;controller.update();};
 const down=(i=0,id=7)=>forms[i].button.emit('pointerdown',{button:0,pointerId:id});
 const up=(id=7)=>root.emit('pointerup',{pointerId:id});
 const fire=delay=>{const entry=[...timers].find(([,fn])=>fn.delay===delay);assert(entry,`Missing timer ${delay}`);timers.delete(entry[0]);entry[1]();};
 return {forms,root,win,instances,sent,timers,down,up,fire,state,connect,controller,storage};
}
{
 const h=setup();h.down();const r=h.instances[0];r.onstart();r.result([['включи джаз',false]]);assert.equal(h.sent.length,0);h.up();assert(r.stopped);assert.equal(h.sent.length,0);r.result([['включи джаз']]);r.onend();r.onend();assert.deepEqual(h.sent,[[0,'включи джаз']]);assert.equal(h.forms[0].elements.text.readOnly,false);
}
{
 const h=setup();h.down(1);h.instances[0].onstart();h.instances[0].result([['которая погода']]);h.instances[0].onend();assert.equal(h.sent.length,0);h.up();assert.deepEqual(h.sent,[[1,'которая погода']]);
}
for(const cancel of [h=>h.root.emit('pointercancel',{pointerId:7}),h=>h.root.emit('keydown',{key:'Escape'}),h=>h.win.emit('blur'),h=>h.win.emit('hashchange')]){
 const h=setup();h.down();h.instances[0].result([['не отправлять']]);cancel(h);h.instances[0].onend();assert.deepEqual(h.sent,[]);assert(h.instances[0].aborted);assert.equal(h.forms[0].elements.text.value,'старый текст');
}
{
 const h=setup();h.down();h.up();h.instances[0].onstart();assert(h.instances[0].aborted);assert.deepEqual(h.sent,[]);assert.equal(h.timers.size,0);
}
for(const error of ['not-allowed','network','no-speech']){
 const h=setup();h.down();h.instances[0].onerror({error});h.up();h.instances[0].onend();assert.deepEqual(h.sent,[]);assert(h.forms[0].status.textContent);
}
{
 const h=setup();h.down();h.instances[0].result([['включи',true],['не завершено',false]]);h.up();h.instances[0].onend();assert.deepEqual(h.sent,[]);assert.equal(h.forms[0].elements.text.value,'включи не завершено');
}
{
 const h=setup();h.down();h.down(1,9);assert.equal(h.instances.length,1);h.up();for(const fn of h.timers.values())fn();assert(h.instances[0].aborted);assert.deepEqual(h.sent,[]);
}
{
 const h=setup();const b=h.forms[0].button;b.emit('keydown',{key:' ',repeat:false});b.emit('keydown',{key:' ',repeat:true});assert.equal(h.instances.length,1);h.instances[0].onstart();h.instances[0].result([['тише']]);b.emit('keyup',{key:' '});h.instances[0].onend();assert.deepEqual(h.sent,[[0,'тише']]);
}
{
 const h=setup({secure:false});h.down();assert.equal(h.instances.length,0);assert.match(h.forms[0].status.children[0].href,/^https:\/\/panel.local:8766\/speaker\/mini3pro\//);
 const no=setup({supported:false});no.down();assert.equal(no.instances.length,0);assert(no.forms[0].button.hidden);assert(no.forms[0].auto.hidden);assert(!no.forms[0].support.hidden);assert(no.forms[0].retry.hidden);
}
console.log('Push-to-talk: release/final-only send, both forms, cancellation, permissions, timeout, HTTPS and keyboard passed');

const tick=async()=>{await Promise.resolve();await Promise.resolve();};
{
 const h=setup();h.forms[1].auto.emit('click');const r=h.instances[0];r.onstart();
 assert.equal(h.forms[0].auto.attrs['aria-pressed'],'true');assert(h.forms[0].button.disabled);
 r.result([['включи джаз',false]]);r.onspeechstart();assert.equal(h.timers.size,0);
 r.result([['включи джаз']]);assert.equal(h.sent.length,0);h.fire(1500);assert(r.stopped);assert.equal(h.sent.length,0);
 r.onend();r.onend();assert.deepEqual(h.sent,[[1,'включи джаз']]);await tick();assert.equal(h.timers.size,0);h.state('SPEAKING');assert.equal(h.timers.size,0);h.state('IDLE');h.fire(1500);
 const second=h.instances[1];second.onstart();r.onerror({error:'network'});assert.equal(h.forms[0].auto.attrs['aria-pressed'],'true');second.result([['сделай тише']]);h.fire(1500);second.onend();await tick();assert.deepEqual(h.sent,[[1,'включи джаз'],[1,'сделай тише']]);
 h.forms[0].auto.emit('click');assert.equal(h.timers.size,0);assert.equal(h.forms[1].auto.attrs['aria-pressed'],'false');assert.equal(h.forms[0].button.disabled,false);
}
for(const cancel of [h=>h.forms[0].auto.emit('click'),h=>h.root.emit('keydown',{key:'Escape'}),h=>h.win.emit('blur'),h=>h.win.emit('hashchange'),h=>{h.root.hidden=true;h.root.emit('visibilitychange');}]){
 const h=setup();h.forms[0].auto.emit('click');const r=h.instances[0];r.onstart();r.result([['не отправлять']]);cancel(h);r.onend();assert.deepEqual(h.sent,[]);assert.equal(h.timers.size,0);assert(r.aborted);assert.equal(h.forms[0].auto.attrs['aria-pressed'],'false');
}
{
 const h=setup();h.forms[0].auto.emit('click');h.instances[0].onerror({error:'no-speech'});h.instances[0].onend();h.fire(500);assert.equal(h.instances.length,2);assert.deepEqual(h.sent,[]);
 h.instances[1].onend();h.root.emit('keydown',{key:'Escape'});assert.equal(h.timers.size,0);
}
for(const error of ['network','not-allowed','audio-capture']){
 const h=setup();h.forms[0].auto.emit('click');h.instances[0].onerror({error});h.instances[0].onend();assert.equal(h.forms[0].auto.attrs['aria-pressed'],'false');assert.equal(h.timers.size,0);
}
{
 const h=setup({sendResult:false});h.forms[0].auto.emit('click');h.instances[0].result([['сохранить при ошибке']]);h.fire(1500);h.instances[0].onend();await tick();assert.equal(h.forms[0].auto.attrs['aria-pressed'],'false');assert.equal(h.forms[0].elements.text.value,'сохранить при ошибке');assert.equal(h.timers.size,0);
}
{
 let resolve;const h=setup({sendResult:new Promise(r=>resolve=r)});h.forms[0].auto.emit('click');h.instances[0].result([['проверка']]);h.fire(1500);h.instances[0].onend();await tick();assert.equal(h.timers.size,0);
 h.root.emit('keydown',{key:'Escape'});resolve(true);await tick();assert.equal(h.timers.size,0);assert.equal(h.instances.length,1);
}
{
 const h=setup();h.forms[0].auto.emit('click');h.instances[0].result([['проверка']]);h.fire(1500);h.fire(5000);h.instances[0].onend();assert.equal(h.forms[0].auto.attrs['aria-pressed'],'false');assert.equal(h.timers.size,0);assert.deepEqual(h.sent,[]);
 const no=setup({secure:false});no.forms[0].auto.emit('click');assert.equal(no.forms[0].auto.attrs['aria-pressed'],'false');assert.equal(no.instances.length,0);
}
console.log('Continuous mode: 1.5s pause, sequential commands, acknowledgement, stop/hidden/Escape, idle restart and terminal failures passed');
{
 const h=setup({pause:2700});h.forms[0].auto.emit('click');h.instances[0].result([['проверка настройки паузы']]);assert(![...h.timers.values()].some(fn=>fn.delay===1500));h.fire(2700);h.instances[0].onend();assert.deepEqual(h.sent,[[0,'проверка настройки паузы']]);h.root.emit('keydown',{key:'Escape'});
}

{
 const h=setup(),form=h.forms[0],input=form.elements.text;
 input.scrollHeight=160;input.value='длинная фраза '.repeat(30);input.emit('input');assert.equal(input.style.height,'162px');
 input.scrollHeight=40;input.value='';input.emit('input');assert.equal(input.style.height,'42px');
 input.value='😀'.repeat(1024);refreshCommand(form);assert.equal(input.validityMessage,'');
 input.value+='😀';refreshCommand(form);assert.match(input.validityMessage,/1025/);
 h.down();const r=h.instances[0];r.result([['я'.repeat(1025)]]);h.up();r.onend();assert.equal(h.sent.length,0);assert.equal(input.value.length,1025);
}
{
 const h=setup();h.forms[0].auto.emit('click');const r=h.instances[0];r.result([['я'.repeat(1025)]]);h.fire(1500);r.onend();assert.equal(h.sent.length,0);assert.equal(h.forms[0].auto.attrs['aria-pressed'],'false');assert.equal(h.forms[0].elements.text.value.length,1025);
}
console.log('Command fields: grow/shrink, Unicode limit and oversized dictation retained without sending passed');

// An acknowledgement or stale IDLE must never reopen the microphone over Alice's reply.
{
 const h=setup();h.forms[0].auto.emit('click');const r=h.instances[0];r.result([['проверка']]);h.fire(1500);r.onend();await tick();
 h.state('IDLE',false);assert.equal(h.timers.size,0);
 h.state('SPEAKING');h.state('IDLE');assert.equal(h.timers.size,1);
 h.state('SPEAKING');assert.equal(h.timers.size,0);h.state(undefined);assert.equal(h.timers.size,0);
 h.state('IDLE');h.fire(1500);assert.equal(h.instances.length,2);
 const next=h.instances[1];next.result([['ответ из динамика']]);h.state('SPEAKING');assert(next.aborted);next.onend();assert.equal(h.sent.length,1);assert.equal(h.timers.size,0);
 h.state('IDLE');h.connect(false);assert.equal(h.timers.size,0);assert(h.forms[0].auto.disabled);assert(h.forms[0].elements.text.disabled);
 h.connect(true);assert.equal(h.forms[0].auto.attrs['aria-pressed'],'false');assert.equal(h.instances.length,2);
}
for(const error of ['network','service-not-allowed']){
 const h=setup();h.down();h.instances[0].onerror({error});
 for(const form of h.forms){assert(form.button.hidden);assert(form.auto.hidden);assert(!form.support.hidden);assert(!form.retry.hidden);assert(!form.elements.text.disabled);}
 assert.equal(h.storage.get('ui.voice.unavailable'),'1');
 const remembered=setup({storage:h.storage});assert(remembered.forms[0].button.hidden);
 remembered.forms[0].retry.emit('click');assert(!remembered.forms[0].button.hidden);assert(remembered.forms[0].support.hidden);assert.equal(remembered.instances.length,0);
 remembered.down();assert.equal(remembered.instances.length,1);
}
{
 const h=setup({textOnly:true,connected:false});h.down();assert.equal(h.instances.length,0);assert(h.forms[1].submit.disabled);
 h.connect(true);const input=h.forms[1].elements.text;input.value='команда в плеере';input.emit('input');input.emit('keydown',{key:'Enter'});assert.deepEqual(h.sent,[[1,'команда в плеере']]);
 for(const key of ['Enter',' ']){const b=h.forms[0].button;b.emit('keydown',{key});const r=h.instances.at(-1);r.onstart();r.result([['клавиатура']]);b.emit('keyup',{key});r.onend();}
 assert.equal(h.sent.length,3);h.down();assert(h.forms[0].button.focused);h.root.emit('keydown',{key:'Escape'});
}
console.log('Review regressions: fresh Glagol IDLE, speaker echo cancellation, disconnect, persisted unsupported browser/retry, text-only Player, login and both keyboard keys passed');
