// A full navigation drops old polling, terminal sockets and unsaved in-memory state.
(() => {
  const match=location.pathname.match(/^\/speaker\/([a-z0-9_-]+)\//);
  if(!match)return;
  const selected=match[1],names=Object.fromEntries((window.PANEL_SPEAKERS||[]).map(s=>[s.id,s.name]));
  const nav=document.querySelector('nav.side');if(!nav)return;
  const wrap=document.createElement('div');wrap.className='speaker-picker';
  const label=document.createElement('label');label.htmlFor='speaker-select';label.textContent='Выбор колонки';
  const select=document.createElement('select');select.id='speaker-select';select.setAttribute('aria-label','Выбор колонки');
  for(const[id,name]of Object.entries(names))select.add(new Option(name,id,id===selected,id===selected));
  wrap.append(label,select);nav.prepend(wrap);
  select.addEventListener('change',()=>{
    if(!Object.prototype.hasOwnProperty.call(names,select.value))return;
    const next='/speaker/'+select.value+'/'+(location.hash||'#overview');
    select.disabled=true;location.assign(next);
  });
  document.documentElement.dataset.speaker=selected;
})();
