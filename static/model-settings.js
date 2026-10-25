// Preferences live in Settings (or below the standalone preview), never over the canvas.
export function modelSettings(id,palette,actions){
  const section=document.getElementById('model-settings');if(!section)return;
  const key='model.preferences.'+(window.PanelContext?.deviceId||'single')+'.'+id;
  let saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}')||{};}catch{}
  section.innerHTML='<div class="set-head"><div><h2>3D-модель</h2><p>Только изображение в браузере</p></div></div><div class="set-item"><label for="model-color">Цвет корпуса</label><select id="model-color" aria-label="Цвет 3D-корпуса"></select></div><label class="set-item"><span>Автовращение</span><input id="model-spin" type="checkbox" class="switch" aria-label="Автовращение 3D"></label><div class="set-item"><button class="btn sm" id="model-home" type="button">Исходный ракурс 3D</button></div>';
  const color=section.querySelector('#model-color'),spin=section.querySelector('#model-spin');
  color.add(new Option('Как у колонки','auto'));
  for(const[name,[label]]of Object.entries(palette))color.add(new Option(label,name));
  color.value=Object.prototype.hasOwnProperty.call(palette,saved.color)?saved.color:'auto';
  spin.checked=saved.spin===true;
  function apply(){
    const colorKey=color.value==='auto'?null:color.value;
    try{localStorage.setItem(key,JSON.stringify({color:colorKey,spin:spin.checked}));}catch{}
    actions.color(colorKey);actions.spin(spin.checked);
  }
  color.addEventListener('change',apply);spin.addEventListener('change',apply);
  section.querySelector('#model-home').addEventListener('click',actions.home);
  section.hidden=false;apply();
}
