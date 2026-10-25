// Настройки 3D-модели — строками в панели «Настроить» на «Обзоре» (в превью — под моделью), не поверх холста.
// Меняют только изображение в браузере, не подсветку колонки. Хранятся отдельно для каждой колонки и модели.
export function modelSettings(id, palette, actions) {
  const section = document.getElementById('model-settings');
  if (!section) return;
  const key = 'model.preferences.' + (window.PanelContext?.deviceId || 'single') + '.' + id;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch {}
  section.innerHTML =
    '<label class="set-item"><div class="set-label"><b>Цвет 3D-модели</b><small>Только картинка в браузере — подсветка колонки не меняется</small></div>' +
    '<div class="set-ctl"><select class="field" id="model-color" aria-label="Цвет 3D-модели" style="min-height:36px"></select></div></label>' +
    '<label class="set-item"><div class="set-label"><b>Автовращение 3D-модели</b><small>Модель медленно вращается сама</small></div>' +
    '<div class="set-ctl"><input type="checkbox" class="switch" id="model-spin" aria-label="Автовращение 3D-модели"></div></label>' +
    '<div class="set-item"><div class="set-label"><b>Ракурс 3D-модели</b><small>Если модель повернули или приблизили мышью</small></div>' +
    '<div class="set-ctl"><button class="btn sm" id="model-home" type="button">Вернуть исходный</button></div></div>';
  const color = section.querySelector('#model-color'), spin = section.querySelector('#model-spin');
  color.add(new Option('Как у колонки', 'auto'));
  for (const [name, [label]] of Object.entries(palette)) color.add(new Option(label, name));
  color.value = Object.prototype.hasOwnProperty.call(palette, saved.color) ? saved.color : 'auto';
  spin.checked = saved.spin === true;
  function apply() {
    const colorKey = color.value === 'auto' ? null : color.value;
    try { localStorage.setItem(key, JSON.stringify({ color: colorKey, spin: spin.checked })); } catch {}
    actions.color(colorKey);
    actions.spin(spin.checked);
  }
  color.addEventListener('change', apply);
  spin.addEventListener('change', apply);
  section.querySelector('#model-home').addEventListener('click', actions.home);
  section.hidden = false;
  apply();
}
