// Full navigation closes old polling and terminal sockets.
(async()=>{
  const selected=PanelContext.deviceId;if(!selected)return;
  let devices;
  for(;;){
    try{const response=await PanelContext.fetch('/api/speakers');if(response.ok){devices=(await response.json()).devices;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
  const nav=document.querySelector('nav.side');if(!nav)return;
  const wrap=document.createElement('div');wrap.className='speaker-picker';
  const label=document.createElement('label');label.htmlFor='speaker-select';label.textContent='Выбор колонки';
  const select=document.createElement('select');select.id='speaker-select';select.setAttribute('aria-label','Выбор колонки');
  for(const device of devices)select.add(new Option(device.name,device.id,device.id===selected,device.id===selected));
  wrap.append(label,select);nav.prepend(wrap);
  select.addEventListener('change',()=>{
    if(!devices.some(device=>device.id===select.value))return;
    select.disabled=true;location.assign('/speaker/'+encodeURIComponent(select.value)+'/'+(location.hash||'#overview'));
  });
  document.documentElement.dataset.speaker=selected;
})();
