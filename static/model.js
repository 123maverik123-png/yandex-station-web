// Choose the renderer after login. Keep the original Lite 2 mesh and hardware defaults.
async function loadProfile(){
  for(;;){
    const auth=await fetch('/api/panel-auth').then(r=>r.json()).catch(()=>null);
    if(auth&&(!auth.enabled||auth.authed)){
      const response=await fetch('/api/profile');if(response.ok)return response.json();
    }
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
}
const profile=await loadProfile();
document.title=profile.name+' — панель';
document.getElementById('model-name').textContent=profile.name;
const hide=element=>element?.setAttribute('data-profile-hidden','');
if(!profile.clock)hide(document.querySelector('[data-widget="clock"]'));
if(!profile.light)hide(document.querySelector('[data-widget="light"]'));
if(!profile.boot){hide(document.querySelector('a[href="#boot"]'));const tab=document.querySelector('#tab-boot');for(const child of tab.children)hide(child);tab.insertAdjacentHTML('afterbegin','<p class="card">Редактор запуска не поддерживается выбранным профилем.</p>');}
if(!profile.alarms){hide(document.querySelector('a[href="#alarm"]'));const tab=document.querySelector('#tab-alarm');for(const child of tab.children)hide(child);tab.insertAdjacentHTML('afterbegin','<p class="card">Автозапуск будильника этой модели ещё не поддерживается. Существующие будильники не изменяются.</p>');}
if(profile.id!=='lite2'){
  hide(document.getElementById('pat-play'));
  document.querySelectorAll('[data-k="clock"]').forEach(e=>{if(!profile.clock)hide(e);});
  document.querySelector('[data-widget="light"] .hint').textContent=profile.light_note;
  const {createModel}=await import('./model-studio.js');createModel(profile);
}else await import('./model-lite2.js');
