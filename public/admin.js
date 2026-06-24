/* =========================================================
   FORMAT CMS — inline content editor (backend-backed)
   Login (top-left) → edit any text inline → saved to the SQLite
   database via the API, so edits persist for every visitor.
   ========================================================= */
(function () {
  'use strict';

  var TOKEN_KEY = 'format_cms_token';

  var EDITABLE = [
    '.hero__eyebrow', '.phrase', '.hero__cta .btn',
    '.manifesto__text',
    '.kicker', '.head__title', '.head__sub',
    '.srv h3', '.srv p',
    '.stat__label',
    '.work__item figcaption b', '.work__item figcaption span',
    '.spec-table thead th', '.spec-table tbody td',
    '.step h3', '.step p',
    '.cta__text h2', '.cta__text p', '.cta__list li',
    '.floater__tag', '.floater figcaption b', '.floater figcaption span',
    '.orangeband__text h3', '.orangeband__text p',
    '.footer__brand p', '.footer__nav h4', '.footer__nav a'
  ];

  var editables = [];
  var defaults = {};
  var cubes = [];           // [{key, el}] — floating cubes whose background image is editable
  var cubeDefaults = {};    // key → original --img value
  var media = [];           // [{key, el}] — generic uploadable background-image boxes (.cms-image)
  var mediaDefaults = {};   // key → original --img value
  var brands = [];          // .brand elements (nav + footer)
  var brandDefaults = [];   // original innerHTML per brand
  var appliedLogo = null;   // current logo image URL (null = default text logo)
  var LOGO_KEY = 'logo:img';
  var fileInput;            // shared hidden <input type=file>

  function token(){ return sessionStorage.getItem(TOKEN_KEY); }
  function setToken(t){ if (t) sessionStorage.setItem(TOKEN_KEY, t); else sessionStorage.removeItem(TOKEN_KEY); }

  /* ---------- API ---------- */
  function api(method, url, body, withAuth){
    var opts = { method: method, headers: {} };
    if (body != null){ opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    if (withAuth) opts.headers['Authorization'] = 'Bearer ' + (token() || '');
    return fetch(url, opts).then(function (r){
      if (r.status === 401){ setToken(null); throw new Error('unauthorized'); }
      if (!r.ok) return r.json().catch(function(){ return {}; }).then(function (j){ throw new Error(j.error || ('HTTP ' + r.status)); });
      return r.json();
    });
  }

  /* ---------- editable collection ---------- */
  function collect(){
    editables = [];
    EDITABLE.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el, i) {
        var key = sel + '::' + i;
        el.setAttribute('data-cms-key', key);
        editables.push({ key: key, el: el });
        if (!(key in defaults)) defaults[key] = el.innerHTML;
      });
    });
    // floating cubes — background image is editable (key prefixed "img:")
    cubes = [];
    document.querySelectorAll('.floater').forEach(function (c, i) {
      var key = 'img:floater::' + i;
      cubes.push({ key: key, el: c });
      if (!(key in cubeDefaults)) cubeDefaults[key] = (c.style.getPropertyValue('--img') || '').trim();
    });
    // generic uploadable image boxes (.cms-image with a data-img-key)
    media = [];
    document.querySelectorAll('.cms-image').forEach(function (el) {
      var key = 'img:' + (el.getAttribute('data-img-key') || '');
      media.push({ key: key, el: el });
      if (!(key in mediaDefaults)) mediaDefaults[key] = (el.style.getPropertyValue('--img') || '').trim();
    });
    // brand logo(s) — nav + footer
    if (!brands.length) {
      brands = Array.prototype.slice.call(document.querySelectorAll('.brand'));
      brandDefaults = brands.map(function (b) { return b.innerHTML; });
    }
  }

  function applyBrandLogo(url){
    brands.forEach(function (b) {
      b.innerHTML = '<img class="brand__logo-img" src="' + url + '" alt="logo">';
    });
  }
  function restoreBrands(){
    brands.forEach(function (b, i) { b.innerHTML = brandDefaults[i]; });
  }

  function applyOverrides(map){
    if (!map) return;
    editables.forEach(function (o) {
      if (Object.prototype.hasOwnProperty.call(map, o.key)) o.el.innerHTML = map[o.key];
    });
    cubes.forEach(function (o) {
      if (Object.prototype.hasOwnProperty.call(map, o.key)) o.el.style.setProperty('--img', map[o.key]);
    });
    media.forEach(function (o) {
      if (Object.prototype.hasOwnProperty.call(map, o.key)) o.el.style.setProperty('--img', map[o.key]);
    });
    if (Object.prototype.hasOwnProperty.call(map, LOGO_KEY)) { appliedLogo = map[LOGO_KEY]; applyBrandLogo(appliedLogo); }
    if (Object.prototype.hasOwnProperty.call(map, 'testimonials')){
      try { var arr = JSON.parse(map.testimonials); if (Array.isArray(arr)) testimonials = arr.length ? arr : DEFAULT_TESTI.slice(); } catch (e) {}
    }
    testiIndex = 0; renderTestimonials(); startTestiRotation();
  }

  /* ---------- UI helpers ---------- */
  function el(tag, cls, html){ var n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
  function toast(msg, isErr){
    var t = el('div', 'cms-toast' + (isErr ? ' err' : ''), msg);
    document.body.appendChild(t);
    requestAnimationFrame(function(){ t.classList.add('show'); });
    setTimeout(function(){ t.classList.remove('show'); setTimeout(function(){ t.remove(); }, 350); }, 2000);
  }

  /* ---------- login ---------- */
  function buildLoginButton(){
    if (document.querySelector('.cms-login-btn')) return;
    var b = el('button', 'cms-login-btn',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>כניסת אדמין');
    b.addEventListener('click', openLogin);
    document.body.appendChild(b);
  }

  function openLogin(){
    var modal = el('div', 'cms-modal');
    var card = el('div', 'cms-modal__card',
      '<h3>כניסת מנהל</h3><p>התחברו כדי לערוך את תוכן האתר.</p>' +
      '<label class="cms-field"><span>שם משתמש</span><input type="text" id="cmsU" autocomplete="username"></label>' +
      '<label class="cms-field"><span>סיסמה</span><input type="password" id="cmsP" autocomplete="current-password"></label>' +
      '<div class="cms-error" id="cmsErr"></div>' +
      '<div class="cms-modal__actions"><button class="cms-btn cms-btn--primary" id="cmsGo">התחברות</button>' +
      '<button class="cms-btn cms-btn--ghost" id="cmsX">ביטול</button></div>');
    modal.appendChild(card);
    document.body.appendChild(modal);

    var u = card.querySelector('#cmsU'), p = card.querySelector('#cmsP'), err = card.querySelector('#cmsErr');
    var go = card.querySelector('#cmsGo');
    u.focus();
    function close(){ modal.remove(); }
    function submit(){
      err.textContent = '';
      go.disabled = true; go.textContent = 'מתחבר…';
      api('POST', '/api/login', { username: u.value.trim(), password: p.value })
        .then(function (res){ setToken(res.token); close(); enterEditMode(); toast('שלום ' + u.value.trim() + ' 👋'); })
        .catch(function (e){ err.textContent = e.message === 'unauthorized' ? 'שם משתמש או סיסמה שגויים' : e.message; p.value = ''; p.focus(); go.disabled = false; go.textContent = 'התחברות'; });
    }
    go.addEventListener('click', submit);
    card.querySelector('#cmsX').addEventListener('click', close);
    modal.addEventListener('click', function (e){ if (e.target === modal) close(); });
    [u, p].forEach(function (i){ i.addEventListener('keydown', function (e){ if (e.key === 'Enter') submit(); }); });
  }

  /* ---------- edit mode ---------- */
  var preventNav;
  function enterEditMode(){
    document.body.classList.add('cms-edit');
    var btn = document.querySelector('.cms-login-btn'); if (btn) btn.style.display = 'none';
    editables.forEach(function (o){ o.el.setAttribute('contenteditable', 'true'); o.el.spellcheck = false; });
    preventNav = function (e){
      var a = e.target.closest && e.target.closest('a');
      if (a && document.body.classList.contains('cms-edit')) e.preventDefault();
    };
    document.addEventListener('click', preventNav, true);
    addCubeUploaders();
    addTestiButton();
    buildBar();
  }

  /* ---------- cube image upload ---------- */
  function ensureFileInput(){
    if (fileInput) return fileInput;
    fileInput = el('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    return fileInput;
  }

  // does this browser actually encode WebP? (gives alpha + good compression)
  var WEBP_OK = (function (){ try { return document.createElement('canvas').toDataURL('image/webp').indexOf('data:image/webp') === 0; } catch (e) { return false; } })();

  // JPEG has no transparency → it bakes a black background. For PNG/WebP/AVIF/GIF
  // sources (which may be transparent) keep an alpha-capable format.
  function chooseFormat(file){
    if (file.type === 'image/jpeg' || file.type === 'image/jpg') return { mime: 'image/jpeg', quality: 0.85 };
    return WEBP_OK ? { mime: 'image/webp', quality: 0.9 } : { mime: 'image/png' };
  }

  // resize + compress the picked file into a self-contained data URI (stored IN the database)
  function fileToDataURI(file, opts, cb){
    opts = opts || {};
    var maxDim = opts.maxDim || 1600, mime = opts.mime || 'image/jpeg', quality = opts.quality || 0.85;
    var reader = new FileReader();
    reader.onload = function (){
      var img = new Image();
      img.onload = function (){
        var w = img.naturalWidth, h = img.naturalHeight;
        var s = Math.min(1, maxDim / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
        var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
        cv.getContext('2d').drawImage(img, 0, 0, cw, ch);   // alpha preserved unless mime is JPEG
        var uri; try { uri = cv.toDataURL(mime, quality); } catch (e) { uri = reader.result; }
        cb(uri);
      };
      img.onerror = function (){ cb(reader.result); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function pickAndUpload(cb, opts){
    opts = opts || {};
    var input = ensureFileInput();
    input.onchange = function (){
      var f = input.files && input.files[0];
      input.value = '';
      if (!f) return;
      if (!/^image\//.test(f.type)) { toast('יש לבחור קובץ תמונה', true); return; }
      toast('מעבד תמונה…');
      var fmt = (opts.mime && opts.mime !== 'auto') ? opts : chooseFormat(f);
      if (opts.maxDim) fmt.maxDim = opts.maxDim;
      fileToDataURI(f, fmt, cb);
    };
    input.click();
  }

  function uploadForCube(cube){
    pickAndUpload(function (uri){
      cube.el.style.setProperty('--img', 'url("' + uri + '")');
      toast('התמונה הוחלפה ✓ (אל תשכח לשמור)');
    }, { mime: 'auto', maxDim: 1600 });   // keeps transparency for PNG/WebP sources
  }

  function uploadLogo(){
    pickAndUpload(function (uri){
      appliedLogo = uri;
      applyBrandLogo(uri);
      toast('הלוגו הוחלף ✓ (אל תשכח לשמור)');
    }, { mime: 'auto', maxDim: 700 });    // logos are usually transparent → alpha kept
  }

  function addCubeUploaders(){
    cubes.concat(media).forEach(function (o){
      if (o.el.querySelector('.cms-upload')) return;
      var btn = el('button', 'cms-upload',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>העלאת תמונה');
      btn.type = 'button';
      btn.addEventListener('click', function (e){ e.preventDefault(); e.stopPropagation(); uploadForCube(o); });
      o.el.appendChild(btn);
    });
  }

  function removeCubeUploaders(){
    document.querySelectorAll('.cms-upload').forEach(function (b){ b.remove(); });
  }

  function exitEditMode(){
    document.body.classList.remove('cms-edit');
    editables.forEach(function (o){ o.el.removeAttribute('contenteditable'); });
    removeCubeUploaders();
    removeTestiButton();
    hideRichBar();
    if (preventNav) document.removeEventListener('click', preventNav, true);
    var bar = document.querySelector('.cms-bar'); if (bar) bar.remove();
    var btn = document.querySelector('.cms-login-btn'); if (btn) btn.style.display = '';
  }
  function logout(){
    api('POST', '/api/logout', null, true).catch(function(){});
    setToken(null);
    exitEditMode();
  }

  function buildBar(){
    if (document.querySelector('.cms-bar')) return;
    var bar = el('div', 'cms-bar', '<span class="cms-bar__label"><span class="cms-bar__dot"></span>מצב עריכה · מסד נתונים</span>');
    var save = el('button', 'save', 'שמירה');
    var logo = el('button', 'ghost', 'החלפת לוגו');
    var reset = el('button', 'ghost', 'איפוס');
    var out = el('button', 'ghost', 'יציאה');
    save.addEventListener('click', function(){ doSave(save); });
    logo.addEventListener('click', uploadLogo);
    reset.addEventListener('click', doReset);
    out.addEventListener('click', logout);
    [save, logo, reset, out].forEach(function (b){ bar.appendChild(b); });
    document.body.appendChild(bar);
  }

  function doSave(btn){
    var obj = {};
    editables.forEach(function (o){ if (o.el.innerHTML !== defaults[o.key]) obj[o.key] = o.el.innerHTML; });
    cubes.forEach(function (o){
      var cur = (o.el.style.getPropertyValue('--img') || '').trim();
      if (cur !== cubeDefaults[o.key]) obj[o.key] = cur;
    });
    media.forEach(function (o){
      var cur = (o.el.style.getPropertyValue('--img') || '').trim();
      if (cur !== mediaDefaults[o.key]) obj[o.key] = cur;
    });
    if (appliedLogo) obj[LOGO_KEY] = appliedLogo;
    if (btn){ btn.disabled = true; btn.textContent = 'שומר…'; }
    api('PUT', '/api/content', obj, true)
      .then(function (res){ toast('נשמר במסד הנתונים ✓ (' + res.count + ' שדות)'); })
      .catch(function (e){ toast(e.message === 'unauthorized' ? 'פג תוקף ההתחברות' : 'שמירה נכשלה', true); if (e.message === 'unauthorized') exitEditMode(); })
      .finally(function (){ if (btn){ btn.disabled = false; btn.textContent = 'שמירה'; } });
  }

  function doReset(){
    if (!confirm('לאפס את כל התוכן לברירת המחדל? פעולה זו תמחק את השינויים השמורים במסד הנתונים.')) return;
    api('POST', '/api/reset', null, true)
      .then(function (){
        editables.forEach(function (o){ o.el.innerHTML = defaults[o.key]; });
        cubes.forEach(function (o){ o.el.style.setProperty('--img', cubeDefaults[o.key]); });
        media.forEach(function (o){ o.el.style.setProperty('--img', mediaDefaults[o.key]); });
        appliedLogo = null; restoreBrands();
        toast('אופס לברירת מחדל');
      })
      .catch(function (e){ toast(e.message === 'unauthorized' ? 'פג תוקף ההתחברות' : 'איפוס נכשל', true); });
  }

  /* ========== Testimonials — rotate every 3s + manage via modal ========== */
  var DEFAULT_TESTI = [
    { quote: '"באנר של 6 מטר היה תלוי תוך יומיים, צבע מושלם. הפכו אותנו ללקוח קבוע."', name: 'רותם בן-דוד', role: 'מנהל אירועים, גלובוס' },
    { quote: '"עטיפת הצי שלנו נראית כמו מהמפעל. הדיוק והגימור פשוט אחרים."', name: 'שירה כספי', role: 'מנהלת לוגיסטיקה, פרש-קו' },
    { quote: '"הדפסות ה-Fine-Art לתערוכה קיבלו מחמאות מכל מבקר. רמת גלריה אמיתית."', name: 'יונתן אדרי', role: 'אוצר, מוזיאון העיר' }
  ];
  var testimonials = DEFAULT_TESTI.slice();
  var testiIndex = 0, testiTimer = null;
  function esc(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(s){ return esc(s).replace(/"/g, '&quot;'); }

  function renderTestimonials(){
    var box = document.getElementById('quotesBox');
    if (!box) return;
    var n = Math.min(3, testimonials.length);
    var html = '';
    for (var k = 0; k < n; k++){
      var t = testimonials[(testiIndex + k) % testimonials.length];
      html += '<blockquote class="quote"><p>' + esc(t.quote) + '</p><footer><b>' + esc(t.name) + '</b> · ' + esc(t.role) + '</footer></blockquote>';
    }
    box.style.opacity = '0';
    setTimeout(function (){ box.innerHTML = html; box.style.opacity = '1'; }, 180);
  }
  function startTestiRotation(){
    if (testiTimer) clearInterval(testiTimer);
    if (testimonials.length > 3){
      testiTimer = setInterval(function (){ testiIndex = (testiIndex + 1) % testimonials.length; renderTestimonials(); }, 3000);
    }
  }
  function setTestimonials(arr){
    testimonials = (arr && arr.length) ? arr : DEFAULT_TESTI.slice();
    testiIndex = 0;
    renderTestimonials();
    startTestiRotation();
  }

  function addTestiButton(){
    var sec = document.getElementById('testimonials');
    if (!sec || sec.querySelector('.cms-testi-btn')) return;
    var head = sec.querySelector('.head') || sec.querySelector('.container');
    var btn = el('button', 'cms-testi-btn',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>עריכת המלצות');
    btn.type = 'button';
    btn.addEventListener('click', openTestiModal);
    head.appendChild(btn);
  }
  function removeTestiButton(){ var b = document.querySelector('.cms-testi-btn'); if (b) b.remove(); }

  function openTestiModal(){
    var modal = el('div', 'cms-modal');
    var card = el('div', 'cms-modal__card cms-testi-modal',
      '<h3>ניהול המלצות</h3><p>ערוך, הוסף או הסר. ההמלצות מתחלפות אוטומטית כל 3 שניות.</p>' +
      '<div class="cms-testi-list"></div>' +
      '<button type="button" class="cms-btn cms-btn--ghost cms-testi-add">+ הוסף המלצה</button>' +
      '<div class="cms-modal__actions"><button type="button" class="cms-btn cms-btn--primary cms-testi-save">שמירה</button>' +
      '<button type="button" class="cms-btn cms-btn--ghost cms-testi-cancel">ביטול</button></div>');
    modal.appendChild(card);
    document.body.appendChild(modal);

    var list = card.querySelector('.cms-testi-list');
    var work = testimonials.map(function (t){ return { quote: t.quote, name: t.name, role: t.role }; });
    function draw(){
      list.innerHTML = '';
      work.forEach(function (t, i){
        var row = el('div', 'cms-testi-row',
          '<textarea class="tq" rows="2" placeholder="ציטוט ההמלצה">' + esc(t.quote) + '</textarea>' +
          '<div class="cms-testi-row2"><input class="tn" placeholder="שם" value="' + escAttr(t.name) + '">' +
          '<input class="tr" placeholder="תפקיד / חברה" value="' + escAttr(t.role) + '">' +
          '<button type="button" class="cms-testi-del" title="הסר">✕</button></div>');
        row.querySelector('.tq').addEventListener('input', function (e){ work[i].quote = e.target.value; });
        row.querySelector('.tn').addEventListener('input', function (e){ work[i].name = e.target.value; });
        row.querySelector('.tr').addEventListener('input', function (e){ work[i].role = e.target.value; });
        row.querySelector('.cms-testi-del').addEventListener('click', function (){ work.splice(i, 1); draw(); });
        list.appendChild(row);
      });
    }
    draw();
    function close(){ modal.remove(); }
    card.querySelector('.cms-testi-add').addEventListener('click', function (){ work.push({ quote: '"כתבו כאן המלצה"', name: 'שם הלקוח', role: 'תפקיד, חברה' }); draw(); });
    card.querySelector('.cms-testi-cancel').addEventListener('click', close);
    modal.addEventListener('click', function (e){ if (e.target === modal) close(); });
    card.querySelector('.cms-testi-save').addEventListener('click', function (){
      var clean = work.filter(function (t){ return (t.quote || t.name || t.role); });
      api('PUT', '/api/content', { 'testimonials': JSON.stringify(clean) }, true)
        .then(function (){ setTestimonials(clean); close(); toast('ההמלצות נשמרו ✓'); })
        .catch(function (e){ toast(e.message === 'unauthorized' ? 'פג תוקף ההתחברות' : 'שמירה נכשלה', true); });
    });
  }

  /* ========== Rich-text toolbar for inline editing (color, size, B/I/U…) ========== */
  var rtBar = null, rtTarget = null, savedRange = null;
  function saveSel(){
    var s = window.getSelection();
    if (s && s.rangeCount){
      var n = s.anchorNode, e = n && (n.nodeType === 1 ? n : n.parentElement);
      if (e && e.closest('[data-cms-key]')) savedRange = s.getRangeAt(0).cloneRange();
    }
  }
  function restoreSel(){ if (savedRange){ var s = window.getSelection(); s.removeAllRanges(); s.addRange(savedRange); } }
  function exec(cmd, val){ restoreSel(); try { document.execCommand(cmd, false, val == null ? null : val); } catch (e) {} }

  function buildRichBar(){
    if (rtBar) return rtBar;
    try { document.execCommand('styleWithCSS', false, true); } catch (e) {}
    rtBar = el('div', 'cms-rtbar');
    rtBar.innerHTML =
      '<button type="button" data-cmd="bold" title="מודגש"><b>B</b></button>' +
      '<button type="button" data-cmd="italic" title="נטוי"><i>I</i></button>' +
      '<button type="button" data-cmd="underline" title="קו תחתון"><u>U</u></button>' +
      '<span class="cms-rt-sep"></span>' +
      '<select class="cms-rt-size" title="גודל פונט"><option value="">גודל</option><option value="2">קטן</option><option value="3">רגיל</option><option value="4">גדול</option><option value="5">גדול מאוד</option><option value="6">ענק</option><option value="7">עצום</option></select>' +
      '<label class="cms-rt-color" title="צבע טקסט">A<input type="color" value="#e8502e"></label>' +
      '<span class="cms-rt-sep"></span>' +
      '<button type="button" data-cmd="justifyRight" title="יישור ימין">⇥</button>' +
      '<button type="button" data-cmd="justifyCenter" title="מרכז">≡</button>' +
      '<button type="button" data-cmd="justifyLeft" title="יישור שמאל">⇤</button>' +
      '<span class="cms-rt-sep"></span>' +
      '<button type="button" data-cmd="removeFormat" title="נקה עיצוב">⌫</button>';
    document.body.appendChild(rtBar);
    rtBar.addEventListener('mousedown', function (e){
      var t = e.target.tagName;
      if (t !== 'INPUT' && t !== 'SELECT' && t !== 'OPTION') e.preventDefault();   // keep the text selection
    });
    rtBar.querySelectorAll('button[data-cmd]').forEach(function (b){
      b.addEventListener('click', function (e){ e.preventDefault(); exec(b.getAttribute('data-cmd')); });
    });
    rtBar.querySelector('.cms-rt-size').addEventListener('change', function (e){
      if (e.target.value) exec('fontSize', e.target.value);
      e.target.value = '';
    });
    rtBar.querySelector('.cms-rt-color input').addEventListener('input', function (e){ exec('foreColor', e.target.value); });
    return rtBar;
  }
  function positionRichBar(target){
    if (!rtBar || !target) return;
    var r = target.getBoundingClientRect();
    var top = r.top - rtBar.offsetHeight - 8;
    if (top < 8) top = r.bottom + 8;
    rtBar.style.top = Math.round(Math.max(8, top)) + 'px';
    rtBar.style.left = Math.round(Math.min(Math.max(8, r.left), window.innerWidth - rtBar.offsetWidth - 12)) + 'px';
  }
  function showRichBar(target){ buildRichBar(); rtBar.style.display = 'flex'; rtTarget = target; positionRichBar(target); }
  function hideRichBar(){ if (rtBar) rtBar.style.display = 'none'; rtTarget = null; }
  function setupRichText(){
    if (setupRichText._done) return; setupRichText._done = true;
    document.addEventListener('selectionchange', function (){ if (document.body.classList.contains('cms-edit')) saveSel(); });
    document.addEventListener('focusin', function (e){
      if (!document.body.classList.contains('cms-edit')) return;
      var ed = e.target.closest && e.target.closest('[data-cms-key]');
      if (ed) showRichBar(ed);
    });
    document.addEventListener('mousedown', function (e){
      if (!document.body.classList.contains('cms-edit')) return;
      if (rtBar && rtBar.contains(e.target)) return;
      if (e.target.closest && e.target.closest('[data-cms-key]')) return;
      hideRichBar();
    }, true);
    window.addEventListener('scroll', function (){ if (rtTarget && rtBar && rtBar.style.display !== 'none') positionRichBar(rtTarget); }, { passive: true });
  }

  /* ---------- init ---------- */
  function init(){
    collect();
    setupRichText();
    api('GET', '/api/content').then(applyOverrides).catch(function(){});   // everyone sees saved content
    buildLoginButton();
    if (token()){
      api('GET', '/api/me', null, true).then(function(){ enterEditMode(); }).catch(function(){ setToken(null); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
