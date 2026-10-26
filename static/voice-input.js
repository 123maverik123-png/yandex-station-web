export const COMMAND_LIMIT = 1024;

export function refreshCommand(form) {
  const input = form.elements.text, count = Array.from(input.value.trim()).length;
  input.style.height = '0px';
  input.style.height = (input.value ? Math.max(42, Math.min(input.scrollHeight + 2, 222)) : 42) + 'px';
  input.style.overflowY = input.scrollHeight > 220 ? 'auto' : 'hidden';
  input.setCustomValidity(count > COMMAND_LIMIT ? `Команда слишком длинная: ${count} из ${COMMAND_LIMIT} символов. Сократите текст.` : '');
  input.setAttribute('aria-invalid', String(count > COMMAND_LIMIT));
  const counter = form.querySelector('.voice-count');
  counter.textContent = `${count} / ${COMMAND_LIMIT}`;
  counter.classList.toggle('over', count > COMMAND_LIMIT);
}

// Browser transcription reuses the existing text command form; no audio is stored by the panel.
export function bindVoiceInput(root, { httpsPort = () => null, send = form => form.requestSubmit(), pauseMs = () => 1500 } = {}) {
  const win = root.defaultView, Recognition = win.SpeechRecognition || win.webkitSpeechRecognition;
  let active = null, loop = null;
  const forms = Array.from(root.querySelectorAll('.mu-ask-form'));
  function showMode() {
    forms.forEach(form => {
      const button = form.querySelector('.voice-auto');
      button.setAttribute('aria-pressed', String(!!loop));
      button.textContent = loop ? 'Стоп' : 'Авто';
      form.querySelector('.voice-mic').disabled = !!loop;
    });
  }
  function cancel(message = 'Голосовая команда отменена.') {
    const mode = loop; loop = null;
    win.clearTimeout(mode?.timer); showMode();
    if (active) close(active, message, true);
    else if (mode) mode.form.querySelector('.voice-status').textContent = message;
  }
  function again(mode, delay = 500) {
    if (loop !== mode) return;
    mode.timer = win.setTimeout(() => {
      if (loop === mode) start(mode.form.querySelector('.voice-mic'), mode.form, 'auto');
    }, delay);
  }

  function close(s, message, cancel = false) {
    if (active !== s) return;
    active = null;
    win.clearTimeout(s.timer);
    win.clearTimeout(s.silence);
    s.button.setAttribute('aria-pressed', 'false');
    s.input.readOnly = s.readOnly;
    if (cancel) { s.input.value = s.previous; try { s.recognition.abort(); } catch {} }
    refreshCommand(s.form);
    s.status.textContent = message;
  }
  function commit(s) {
    if (active !== s) return;
    const text = s.interim ? '' : s.final.trim();
    close(s, text ? '' : 'Речь не распознана. Попробуйте ещё раз или отправьте текст вручную.');
    const mode = loop;
    if (!text) { if (mode) again(mode); return; }
    s.input.value = text;
    refreshCommand(s.form);
    if (Array.from(text).length > COMMAND_LIMIT) {
      if (mode) cancel('Команда длиннее 1024 символов. Автопрослушивание выключено; сократите сохранённый текст.');
      else s.status.textContent = 'Команда длиннее 1024 символов. Сократите текст и отправьте вручную.';
      return;
    }
    if (mode) s.status.textContent = 'Отправляю команду…';
    const failed = () => { if (mode && loop === mode) cancel('Ошибка отправки. Автопрослушивание выключено; текст сохранён.'); };
    try {
      Promise.resolve(send(s.form)).then(ok => {
        if (mode && loop === mode) {
          if (ok === false) cancel('Команда не отправлена. Автопрослушивание выключено; текст сохранён.');
          else { s.status.textContent = 'Команда отправлена. Продолжаю слушать…'; again(mode, 1000); }
        }
      }, failed);
    } catch { failed(); }
  }
  function release(abort = false) {
    const s = active;
    if (!s || s.released) return;
    if (abort) return close(s, 'Голосовая команда отменена.', true);
    s.released = true;
    win.clearTimeout(s.silence);
    s.button.setAttribute('aria-pressed', 'false');
    s.status.textContent = 'Завершаю распознавание…';
    if (s.ended) return commit(s);
    s.timer = win.setTimeout(() => {
      if (s.source === 'auto' && loop) cancel('Распознавание не завершилось. Автопрослушивание выключено.');
      else close(s, 'Распознавание не завершилось. Попробуйте ещё раз.', true);
    }, 5000);
    try { s.recognition.stop(); } catch {}
  }
  function start(button, form, source) {
    if (active) return;
    const status = form.querySelector('.voice-status');
    if (!win.isSecureContext) {
      status.textContent = 'Микрофону нужен HTTPS. ';
      if (httpsPort()) {
        const url = new URL(win.location.href); url.protocol = 'https:'; url.port = httpsPort();
        const link = root.createElement('a'); link.href = url.href; link.textContent = 'Открыть безопасную панель'; status.append(link);
      } else status.append('Откройте HTTPS-адрес из настроек панели.');
      return;
    }
    if (!Recognition) { status.textContent = 'Браузер не поддерживает диктовку. Попробуйте Chrome или Safari; текст можно отправить вручную.'; return; }
    const recognition = new Recognition(), input = form.elements.text;
    const s = active = { button, form, status, input, recognition, source, previous: input.value, readOnly: input.readOnly, final: '', released: false, ended: false };
    recognition.lang = 'ru-RU'; recognition.continuous = true; recognition.interimResults = true;
    input.readOnly = true;
    button.setAttribute('aria-pressed', 'true');
    status.textContent = source === 'auto' ? `Слушаю постоянно. Пауза ${pauseMs() / 1000} с — отправить. Стоп / Escape — выключить.` : 'Говорите. Отпустите — отправить; Escape — отменить.';
    const pause = () => {
      win.clearTimeout(s.silence);
      if (source === 'auto' && !s.released && input.value.trim() && (s.final || s.interim))
        s.silence = win.setTimeout(() => { if (active === s) release(); }, pauseMs());
    };
    recognition.onspeechstart = () => win.clearTimeout(s.silence);
    recognition.onspeechend = pause;
    recognition.onstart = () => {
      if (active !== s) { recognition.abort(); return; }
      if (s.released) close(s, 'Запись не началась до отпускания. Нажмите и удерживайте ещё раз.', true);
    };
    recognition.onresult = event => {
      if (active !== s) return;
      const results = Array.from(event.results);
      s.interim = results.some(r => !r.isFinal && r[0].transcript.trim());
      input.value = results.map(r => r[0].transcript).join(' ').trim();
      s.final = results.filter(r => r.isFinal).map(r => r[0].transcript).join(' ');
      refreshCommand(form);
      pause();
    };
    recognition.onerror = event => {
      if (active !== s) return;
      if (source === 'auto' && event.error === 'no-speech') return;
      const messages = { 'not-allowed': 'Разрешите браузеру доступ к микрофону и распознаванию речи.', 'service-not-allowed': 'Распознавание речи недоступно в настройках браузера.', 'audio-capture': 'Микрофон недоступен.', 'network': 'Сервис распознавания недоступен. Проверьте интернет.', 'no-speech': 'Речь не услышана. Попробуйте ещё раз.' };
      const message = messages[event.error] || 'Не удалось распознать речь. Попробуйте ещё раз.';
      if (source === 'auto' && loop) cancel(message + ' Автопрослушивание выключено.');
      else close(s, message, true);
    };
    recognition.onend = () => {
      if (active !== s) return;
      s.ended = true;
      if (s.released) commit(s);
      else if (source === 'auto') {
        if (s.final || s.interim) pause();
        else { const mode = loop; close(s, 'Слушаю постоянно. Жду речь…'); if (mode) again(mode); }
      } else status.textContent = 'Распознавание завершено. Отпустите, чтобы отправить.';
    };
    try { recognition.start(); } catch {
      if (source === 'auto') cancel('Не удалось включить микрофон. Автопрослушивание выключено.');
      else close(s, 'Не удалось включить микрофон. Попробуйте ещё раз.', true);
    }
  }

  forms.forEach(form => {
    const input = form.elements.text;
    input.addEventListener('input', () => refreshCommand(form));
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !input.readOnly) {
        e.preventDefault(); form.requestSubmit();
      }
    });
    refreshCommand(form);
    const button = form.querySelector('.voice-mic');
    form.querySelector('.voice-auto').addEventListener('click', () => {
      if (loop || active) { cancel('Микрофон выключен.'); return; }
      loop = { form }; showMode(); start(button, form, 'auto');
      if (!active && loop) { loop = null; showMode(); }
    });
    button.addEventListener('pointerdown', e => {
      if (e.button !== 0 || loop) return;
      e.preventDefault(); start(button, form, e.pointerId);
      if (active?.button === button) { try { button.setPointerCapture(e.pointerId); } catch {} }
    });
    button.addEventListener('lostpointercapture', () => { if (active?.button === button && !active.released) release(true); });
    button.addEventListener('contextmenu', e => e.preventDefault());
    button.addEventListener('keydown', e => {
      if (![' ', 'Enter'].includes(e.key) || loop) return;
      e.preventDefault(); if (!e.repeat) start(button, form, e.key);
    });
    button.addEventListener('keyup', e => { if (active?.button === button && active.source === e.key) { e.preventDefault(); release(); } });
    button.addEventListener('blur', () => { if (active?.button === button && [' ', 'Enter'].includes(active.source)) release(true); });
  });
  root.addEventListener('pointerup', e => { if (active?.source === e.pointerId) release(); });
  root.addEventListener('pointercancel', e => { if (active?.source === e.pointerId) release(true); });
  root.addEventListener('keydown', e => { if (e.key === 'Escape') cancel(); });
  win.addEventListener('resize', () => forms.forEach(refreshCommand));
  win.addEventListener('blur', () => cancel());
  win.addEventListener('pagehide', () => cancel());
  win.addEventListener('hashchange', () => cancel());
  root.addEventListener('visibilitychange', () => { if (root.hidden) cancel(); });
}
