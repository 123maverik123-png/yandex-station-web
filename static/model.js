// Choose the visual model from the device; hardware capabilities remain explicit.
import {rendererProfile} from './renderer-profile.js';
async function loadProfile(){
  for(;;){
    const auth=await PanelContext.fetch('/api/panel-auth').then(r=>r.json()).catch(()=>null);
    if(auth&&(!auth.enabled||auth.authed)){
      const response=await PanelContext.fetch('/api/profile');if(response.ok)return response.json();
    }
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
}
const profile=await loadProfile();
// Запуск и будильник проверены только на Лайт 2 — на остальных не прячем, а предупреждаем крупно в шапке.
const untested=(tab,what,text)=>{
  const head=document.querySelector('#tab-'+tab+' .page-head');if(!head)return;
  const box=document.createElement('div');box.className='untested';box.setAttribute('role','alert');
  box.innerHTML='<svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2 1 21h22L12 2zm1 15h-2v-2h2v2zm0-4h-2V9h2v4z"/></svg><div><strong></strong><p></p></div>';
  box.querySelector('strong').textContent='На '+profile.name.replace(/^Станция/,'Станции')+' '+what+' не тестировал'+(what==='будильник'?'ся':'ась')+' и может работать не так, как надо';
  box.querySelector('p').innerHTML=text+' Заработало или нет — напишите, пожалуйста, в <a href="https://github.com/dimap/yandex-station-web/issues" target="_blank" rel="noopener">Issues</a> с моделью и версией прошивки.';
  head.append(box);
};
if(!profile.boot){
  document.getElementById('boot-card')?.setAttribute('data-profile-hidden','');
  untested('boot','замена анимаций и звука запуска','Проверена только на Станции Лайт 2. Редактор часов скрыт — он рассчитан на дисплей Лайт 2. Свои анимации кольца и звук подменяются при загрузке через хук в <code>rootkeeper.sh</code>; если после перезагрузки остались стандартные, значит, на этой модели хук не срабатывает.');
}
if(!profile.alarms)
  untested('alarm','будильник','Проверен только на Станции Лайт 2: это скрипт на колонке, он будит звуками и голосом Алисы и запускается при загрузке через хук в <code>rootkeeper.sh</code>. Прежде чем полагаться на него утром, проверьте кнопкой «Проверить» и после перезагрузки колонки.');
const view=document.getElementById('model-view');
const loading=document.createElement('p');loading.className='studio-caption';loading.textContent='Ожидаю данные колонки…';view.append(loading);
let status;
for(;;){
  try{
    const response=await PanelContext.fetch('/api/status');
    if(response.ok){const value=await response.json();if(value.hostname||value.hardware_model){status=value;break;}}
  }catch{}
  await new Promise(resolve=>setTimeout(resolve,2000));
}
const visual=rendererProfile(profile,status);
loading.remove();
const gallery = document.getElementById("model-gallery");
if (gallery) gallery.href = PanelContext.url("static/model-preview.html") + "?model=" + encodeURIComponent(visual.id);
window.__deviceColor=status.color||window.__deviceColor;
document.title=visual.name+' — панель';
document.getElementById('model-name').textContent=visual.name;
view.dataset.hardwareProfile=profile.id;
if(visual.id!==profile.id){
  const note=document.createElement('p');note.className='hint';note.id='model-profile-note';
  note.textContent=visual.id==='lite'
    ? 'Станция Лайт первого поколения. Для управления пока используется профиль «'+profile.name+'»; совместимость аппаратных функций не подтверждена.'
    : '3D: '+visual.name+'. Профиль управления: '+profile.name+'. Для аппаратных функций выберите --model '+visual.id+' при запуске сервера.';
  view.after(note);
}
const hide=element=>element?.setAttribute('data-profile-hidden','');
if(!profile.clock)hide(document.querySelector('[data-widget="clock"]'));
if(!profile.light)hide(document.querySelector('[data-widget="light"]'));
if(profile.bt_volume===false)hide(document.querySelector('.vol-bt'));
if(!profile.boot)hide(document.getElementById('privacy-row'));
if(profile.id!=='lite2'){
  hide(document.getElementById('pat-play'));
  document.querySelectorAll('[data-k="clock"]').forEach(e=>{if(!profile.clock)hide(e);});
  document.querySelector('[data-widget="light"] .hint').textContent=profile.light_note;
}
// У Лайт первого поколения нет дисплея: только светящийся логотип Алисы — прячем всё про часы.
if(visual.id==='lite'){
  hide(document.querySelector('[data-widget="clock"]'));hide(document.getElementById('pat-play'));
  document.querySelectorAll('[data-k="clock"]').forEach(hide);
}
if(visual.id==='lite2')await import('./model-lite2.js');
else{const {createModel}=await import('./model-studio.js');createModel(visual);}
