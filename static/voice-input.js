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
export function bindVoiceInput(root, { httpsPort = () => null, send = form => form.requestSubmit(), pauseMs = () => 1500, ready = () => true, getGlagol = () => null, store = null } = {}) {
  const win = root.defaultView, Recognition = win.SpeechRecognition || win.webkitSpeechRecognition;
  let active = null, loop = null, available = ready();
  const forms = Array.from(root.querySelectorAll('.mu-ask-form'));
  const voiceForms = forms.filter(form => form.querySelector('.voice-mic'));
  const load = key => { try { return (store ? store.get(key) : win.localStorage?.getItem(key)) === '1'; } catch { return false; } };
  const save = (key, value) => { try { if (store) store.set(key, value ? '1' : '0'); else win.localStorage?.setItem(key, value ? '1' : '0'); } catch {} };
  // blocked — браузер отказал в распознавании; dismissed — заметку об этом закрыли и больше не показываем
  let blocked = load('ui.voice.unavailable'), dismissed = load('ui.voice.notice-hidden');
  function support() {
    voiceForms.forEach(form => {
      form.querySelector('.voice-mic').hidden = form.querySelector('.voice-auto').hidden = !Recognition || blocked;
      form.querySelector('.voice-support').hidden = (!!Recognition && !blocked) || dismissed;
      form.querySelector('.voice-retry').hidden = !Recognition;
    });
  }
  function remember(value) {
    blocked = value;
    save('ui.voice.unavailable', value);
    support();
  }
  function update(connected = ready()) {
    available = connected;
    forms.forEach(form => {
      form.elements.text.disabled = !available;
      form.querySelector('button[type=submit], button:not([type])').disabled = !available;
    });
    showMode();
    if (!available) { cancel('Подключитесь к Яндексу и дождитесь связи с колонкой.'); return; }
    if (!loop) return;
    const g = getGlagol(), idle = g?.state?.aliceState === 'IDLE';
    loop.lastPoll = Date.now();
    if (!idle) {
      win.clearTimeout(loop.timer);loop.timer = null;
      if (active?.source === 'auto') close(active, 'Жду, пока Алиса закончит отвечать…', true);
    }
    if (active || loop.sending || loop.timer || !idle || !(g.updated > (loop.after ?? -Infinity))) return;
    const mode = loop;
    mode.timer = win.setTimeout(() => {
      mode.timer = null;
      if (loop === mode && ready() && Date.now() - mode.lastPoll < 2500 && getGlagol()?.state?.aliceState === 'IDLE')
        start(mode.form.querySelector('.voice-mic'), mode.form, 'auto');
    }, 1500);
  }
  function showMode() {
    voiceForms.forEach(form => {
      const button = form.querySelector('.voice-auto');
      button.setAttribute('aria-pressed', String(!!loop));
      button.textContent = loop ? 'Стоп' : 'Авто';
      // в «Авто» фразы уходят сами: вместо «Отправить» — выбор паузы
      const pause = form.querySelector('.voice-pause');
      if (pause) pause.hidden = !loop;
      form.querySelector('button[type=submit], button:not([type])').hidden = !!loop;
      form.querySelector('.voice-mic').disabled = !available || !!loop;
      button.disabled = !available;
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
      if (loop === mode) { mode.timer = null; if (ready() && getGlagol()?.state?.aliceState === 'IDLE') start(mode.form.querySelector('.voice-mic'), mode.form, 'auto'); else update(); }
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
    if (mode) { mode.sending = true; mode.after = getGlagol()?.updated ?? Infinity; s.status.textContent = 'Отправляю команду…'; }
    const failed = () => { if (mode && loop === mode) cancel('Ошибка отправки. Автопрослушивание выключено; текст сохранён.'); };
    try {
      Promise.resolve(send(s.form)).then(ok => {
        if (mode && loop === mode) {
          if (ok === false) cancel('Команда не отправлена. Автопрослушивание выключено; текст сохранён.');
          else { mode.sending = false; s.status.textContent = 'Команда отправлена. Жду, пока Алиса закончит отвечать…'; update(); }
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
    if (active || !available || !ready() || blocked) return;
    const status = form.querySelector('.voice-status');
    if (!win.isSecureContext) {
      status.textContent = 'Микрофону нужен HTTPS. ';
      if (httpsPort()) {
        const url = new URL(win.location.href); url.protocol = 'https:'; url.port = httpsPort();
        const link = root.createElement('a'); link.href = url.href; link.textContent = 'Открыть безопасную панель'; status.append(link);
      } else status.append('Откройте HTTPS-адрес из настроек панели.');
      return;
    }
    if (!Recognition) { support(); return; }
    if (source === 'auto' && getGlagol()?.state?.aliceState !== 'IDLE') { status.textContent = 'Жду, пока Алиса закончит отвечать…'; return; }
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
      if (['network', 'service-not-allowed'].includes(event.error)) {
        // объяснение — в заметке под полем, в строке состояния его не дублируем
        if (loop) cancel('');
        else close(s, '', true);
        remember(true); return;
      }
      const messages = { 'not-allowed': 'Разрешите браузеру доступ к микрофону и распознаванию речи.', 'audio-capture': 'Микрофон недоступен.', 'no-speech': 'Речь не услышана. Попробуйте ещё раз.' };
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
    if (!button) return;
    form.querySelector('.voice-retry').addEventListener('click', () => { remember(false); form.querySelector('.voice-status').textContent = ''; });
    form.querySelector('.voice-dismiss').addEventListener('click', () => { dismissed = true; save('ui.voice.notice-hidden', true); support(); });
    form.querySelector('.voice-auto').addEventListener('click', () => {
      if (loop || active) { cancel('Микрофон выключен.'); return; }
      loop = { form }; showMode(); start(button, form, 'auto');
      if (!active && loop) { if (!Recognition || blocked || !ready() || !win.isSecureContext) { loop = null; showMode(); } else update(); }
    });
    button.addEventListener('pointerdown', e => {
      if (e.button !== 0 || loop) return;
      e.preventDefault(); button.focus({preventScroll:true}); start(button, form, e.pointerId);
      if (active?.button === button) { try { button.setPointerCapture(e.pointerId); } catch {} }
    });
    button.addEventListener('lostpointercapture', () => { if (active?.button === button && !active.released) release(true); });
    button.addEventListener('contextmenu', e => e.preventDefault());

  });
  support();
  update();
  root.addEventListener('pointerup', e => { if (active?.source === e.pointerId) release(); });
  root.addEventListener('pointercancel', e => { if (active?.source === e.pointerId) release(true); });
  const voiceKey = e => e.code === 'Space' || [' ', 'Spacebar'].includes(e.key) ? 'Space' : e.key === 'Enter' ? 'Enter' : null;
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape') { cancel(); return; }
    const key = voiceKey(e), target = e.target;
    if (!key || e.defaultPrevented || e.isComposing || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey ||
        target?.isContentEditable || target?.closest?.('input,textarea,select,[role="textbox"],[role="combobox"],[role="slider"],[role="spinbutton"],dialog,[role="dialog"]') ||
        loop || !available || !ready() || !Recognition || blocked) return;
    const form = voiceForms[0];
    if (!form) return;
    e.preventDefault(); e.stopPropagation();
    if (!e.repeat) start(form.querySelector('.voice-mic'), form, key);
  }, true);
  root.addEventListener('keyup', e => {
    if (active && active.source === voiceKey(e)) {
      e.preventDefault(); e.stopPropagation(); release();
    }
  }, true);
  win.addEventListener('resize', () => forms.forEach(refreshCommand));
  win.addEventListener('blur', () => cancel());
  win.addEventListener('pagehide', () => cancel());
  win.addEventListener('hashchange', () => cancel());
  root.addEventListener('visibilitychange', () => { if (root.hidden) cancel(); });
  return { update };
}
