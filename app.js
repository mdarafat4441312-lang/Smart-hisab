(function () {
  'use strict';
  const C = window.SH_CONFIG;
  const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY);
  const SH = (window.SH = { sb, views: [], state: { session: null, profile: null, view: 'home', authTab: 'login', recovery: false } });
  const $ = (s, r) => (r || document).querySelector(s);
  const lang = () => localStorage.getItem('sh_lang') || 'bn';
  const theme = () => localStorage.getItem('sh_theme') || 'light';
  SH.lang = lang;
  SH.$ = $;

  SH.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  SH.toast = (msg, bad) => {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'show' + (bad ? ' bad' : '');
    clearTimeout(SH._tt);
    SH._tt = setTimeout(() => (el.className = ''), 3200);
  };
  SH.registerView = v => { SH.views.push(v); SH.views.sort((a, b) => a.order - b.order); };

  function applyTheme() {
    document.documentElement.dataset.theme = theme();
    document.documentElement.lang = lang();
  }

  async function loadProfile() {
    const uid = SH.state.session.user.id;
    const { data } = await sb.from('profiles').select('*').eq('id', uid).maybeSingle();
    SH.state.profile = data;
    if (data) {
      if (data.language) localStorage.setItem('sh_lang', data.language);
      if (data.theme) localStorage.setItem('sh_theme', data.theme);
    }
  }

  function render() {
    applyTheme();
    if (SH.state.recovery) return renderRecovery();
    if (!SH.state.session) return renderAuth();
    renderShell();
  }
  SH.render = render;

  function toggles() {
    return `<div class="row center"><button class="chip" id="langBtn">${lang() === 'bn' ? 'English' : 'বাংলা'}</button><button class="chip" id="themeBtn">${theme() === 'dark' ? '☀️' : '🌙'}</button></div>`;
  }
  function bindToggles() {
    $('#langBtn').onclick = () => { localStorage.setItem('sh_lang', lang() === 'bn' ? 'en' : 'bn'); render(); };
    $('#themeBtn').onclick = () => { localStorage.setItem('sh_theme', theme() === 'dark' ? 'light' : 'dark'); render(); };
  }

  function renderAuth() {
    const tab = SH.state.authTab;
    const reg = tab === 'register';
    $('#app').innerHTML = `
    <div class="auth">
      <div class="logo">৳</div>
      <h1>${t('app_name')}</h1>
      <p class="muted">${t('tagline')}</p>
      <div class="tabs">
        <button data-tab="login" class="${!reg ? 'on' : ''}">${t('login')}</button>
        <button data-tab="register" class="${reg ? 'on' : ''}">${t('register')}</button>
      </div>
      <form id="authForm" class="card">
        ${reg ? `<label>${t('name')}<input id="fName" autocomplete="name"></label>` : ''}
        <label>${t('email')}<input id="fEmail" type="email" inputmode="email" autocomplete="email"></label>
        <label>${t('password')}<input id="fPass" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}"></label>
        <button class="btn" id="authBtn" type="submit">${reg ? t('register') : t('login')}</button>
        ${!reg ? `<a href="#" id="forgot" class="link">${t('forgot')}</a>` : ''}
      </form>
      ${toggles()}
    </div>`;
    document.querySelectorAll('[data-tab]').forEach(b => (b.onclick = () => { SH.state.authTab = b.dataset.tab; renderAuth(); }));
    bindToggles();
    $('#authForm').onsubmit = async e => {
      e.preventDefault();
      const email = $('#fEmail').value.trim();
      const password = $('#fPass').value;
      const btn = $('#authBtn');
      if (!email || !password) return SH.toast(t('fill_all'), true);
      btn.disabled = true;
      try {
        if (!reg) {
          const { error } = await sb.auth.signInWithPassword({ email, password });
          if (error) throw error;
        } else {
          const full_name = $('#fName').value.trim();
          if (!full_name) throw new Error(t('fill_all'));
          if (password.length < 6) throw new Error(t('pw_min'));
          const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name } } });
          if (error) throw error;
          if (!data.session) SH.toast(t('check_email'));
        }
      } catch (err) {
        SH.toast(err.message, true);
      } finally {
        btn.disabled = false;
      }
    };
    const f = $('#forgot');
    if (f) f.onclick = async e => {
      e.preventDefault();
      const email = $('#fEmail').value.trim();
      if (!email) return SH.toast(t('enter_email'), true);
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      error ? SH.toast(error.message, true) : SH.toast(t('reset_sent'));
    };
  }
    function renderRecovery() {
    $('#app').innerHTML = `
    <div class="auth">
      <div class="logo">৳</div>
      <h1>${t('set_new_password')}</h1>
      <form id="recForm" class="card">
        <label>${t('new_password')}<input id="rP1" type="password" autocomplete="new-password"></label>
        <label>${t('confirm_password')}<input id="rP2" type="password" autocomplete="new-password"></label>
        <button class="btn" type="submit">${t('save')}</button>
      </form>
    </div>`;
    $('#recForm').onsubmit = async e => {
      e.preventDefault();
      const p1 = $('#rP1').value, p2 = $('#rP2').value;
      if (p1.length < 6) return SH.toast(t('pw_min'), true);
      if (p1 !== p2) return SH.toast(t('pw_mismatch'), true);
      const { error } = await sb.auth.updateUser({ password: p1 });
      if (error) return SH.toast(error.message, true);
      SH.state.recovery = false;
      SH.toast(t('pw_changed'));
      render();
    };
  }

  function renderShell() {
    const v = SH.views.find(x => x.id === SH.state.view) || SH.views[0];
    const name = (SH.state.profile && SH.state.profile.full_name) || SH.state.session.user.email;
    $('#app').innerHTML = `
    <header class="top"><b>${t('app_name')}</b><span class="muted">${SH.esc(name)}</span></header>
    <main id="view"></main>
    <nav class="bottom">${SH.views.map(x => `<button data-v="${x.id}" class="${x.id === v.id ? 'on' : ''}"><span>${x.icon}</span><small>${t(x.label)}</small></button>`).join('')}</nav>`;
    document.querySelectorAll('[data-v]').forEach(b => (b.onclick = () => { SH.state.view = b.dataset.v; renderShell(); }));
    v.render($('#view'));
  }
  /* ---------- Settings ---------- */
  SH.registerView({
    id: 'settings', order: 90, icon: '⚙️', label: 'settings',
    render(el) {
      const p = SH.state.profile || {};
      el.innerHTML = `
      <div class="card"><h3>${t('profile')}</h3>
        <label>${t('name')}<input id="sName" value="${SH.esc(p.full_name || '')}"></label>
        <label>${t('language')}<select id="sLang"><option value="bn">বাংলা</option><option value="en">English</option></select></label>
        <label>${t('theme')}<select id="sTheme"><option value="light">${t('light')}</option><option value="dark">${t('dark')}</option></select></label>
        <button class="btn" id="sSave">${t('save')}</button>
      </div>
      <div class="card"><h3>${t('change_password')}</h3>
        <label>${t('new_password')}<input id="sP1" type="password" autocomplete="new-password"></label>
        <label>${t('confirm_password')}<input id="sP2" type="password" autocomplete="new-password"></label>
        <button class="btn" id="sPass">${t('change_password')}</button>
      </div>
      <button class="btn danger" id="sOut">${t('logout')}</button>`;
      $('#sLang', el).value = lang();
      $('#sTheme', el).value = theme();
      $('#sSave', el).onclick = async () => {
        const full_name = $('#sName', el).value.trim();
        const l = $('#sLang', el).value, th = $('#sTheme', el).value;
        localStorage.setItem('sh_lang', l);
        localStorage.setItem('sh_theme', th);
        const { error } = await sb.from('profiles').update({ full_name, language: l, theme: th }).eq('id', SH.state.session.user.id);
        if (error) return SH.toast(error.message, true);
        SH.state.profile = Object.assign({}, SH.state.profile, { full_name, language: l, theme: th });
        SH.toast(t('saved'));
        render();
      };
      $('#sPass', el).onclick = async () => {
        const p1 = $('#sP1', el).value, p2 = $('#sP2', el).value;
        if (p1.length < 6) return SH.toast(t('pw_min'), true);
        if (p1 !== p2) return SH.toast(t('pw_mismatch'), true);
        const { error } = await sb.auth.updateUser({ password: p1 });
        if (error) return SH.toast(error.message, true);
        $('#sP1', el).value = '';
        $('#sP2', el).value = '';
        SH.toast(t('pw_changed'));
      };
      $('#sOut', el).onclick = () => sb.auth.signOut();
    }
  });

  /* ---------- Start ---------- */
  applyTheme();
  $('#app').innerHTML = `<div class="auth"><p class="muted center">${t('loading')}</p></div>`;
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED') { SH.state.session = session; return; }
    if (event === 'SIGNED_IN' && session && SH.state.session && SH.state.session.user.id === session.user.id && SH.state.profile) {
      SH.state.session = session;
      return;
    }
    if (event === 'PASSWORD_RECOVERY') SH.state.recovery = true;
    SH.state.session = session;
    setTimeout(async () => {
      if (session) await loadProfile(); else SH.state.profile = null;
      render();
    }, 0);
  });
})();
  /* ---------- Home ---------- */
  SH.registerView({
    id: 'home', order: 10, icon: '🏠', label: 'home',
    render(el) {
      const name = (SH.state.profile && SH.state.profile.full_name) || '';
      el.innerHTML = `<div class="card"><h2>${t('hello')}, ${SH.esc(name)} 👋</h2><p class="muted">${t('welcome_note')}</p></div>`;
    }
  });
  
