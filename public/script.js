/* =========================================================
   FORMAT — interactions
   ========================================================= */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ---------- nav style on scroll ---------- */
const nav = document.getElementById('nav');
const setNav = () => nav.classList.toggle('scrolled', window.scrollY > window.innerHeight * 0.6);
setNav();

/* =========================================================
   Scroll-scrubbed hero video
   Reliable pattern: coalesced seeking — never let more than one
   seek run at a time, and always chase the latest scroll target.
   ========================================================= */
const hero      = document.getElementById('top');
const video     = document.getElementById('heroVideo');
const meterFill = document.getElementById('meterFill');
const meterPct  = document.getElementById('meterPct');
const meterStat = document.getElementById('meterStatus');

let duration = 0;     // video length (s)
let wantTime = 0;     // where scroll says the frame should be
let seeking  = false; // is a seek currently in flight?
let primed   = false; // have we kicked the decoder once?
const EPS = 1 / 48;   // ignore sub-frame differences

function heroProgress(){
  const total = hero.offsetHeight - window.innerHeight;
  return total > 0 ? clamp(window.scrollY / total, 0, 1) : 0;
}

/* changing hero phrases — crossfade + vertical drift, synced to scroll */
const phrases = Array.from(document.querySelectorAll('#heroPhrases .phrase'));
function updatePhrases(p){
  const n = phrases.length;
  if (!n) return;
  const span = 1 / n;                 // each phrase "owns" a third of the scroll
  phrases.forEach((el, i) => {
    const center = (i + 0.5) / n;      // where this phrase is fully shown
    const d = p - center;              // signed distance from its moment
    let t = clamp(1 - Math.abs(d) / span, 0, 1);
    if (i === 0 && d < 0) t = 1;        // hold the first phrase at the very top
    if (i === n - 1 && d > 0) t = 1;    // hold the last phrase at the very bottom
    el.style.opacity = t.toFixed(3);
    el.style.transform = 'translateY(' + (-d * 150).toFixed(1) + 'px)';
  });
}

function doSeek(t){
  seeking = true;
  try { video.currentTime = t; }
  catch (e) { seeking = false; }
}

// only seek when idle and the gap is at least ~a frame
function maybeSeek(){
  if (seeking || !duration) return;
  if (Math.abs(video.currentTime - wantTime) < EPS) return;
  doSeek(wantTime);
}

// when a seek finishes, the displayed frame has updated — chase again if scroll moved
video.addEventListener('seeked', () => {
  seeking = false;
  if (Math.abs(video.currentTime - wantTime) >= EPS) doSeek(wantTime);
});
video.addEventListener('error', () => { seeking = false; });

// muted videos can decode without a gesture; one play()→pause() forces the first frame
function prime(){
  if (primed) return;
  primed = true;
  const p = video.play();
  if (p && p.then) p.then(() => { video.pause(); maybeSeek(); }).catch(() => { maybeSeek(); });
  else maybeSeek();
}

function onMeta(){
  duration = video.duration || 0;
  updateScrub();
  prime();
}
if (video.readyState >= 1) onMeta();
video.addEventListener('loadedmetadata', onMeta);
video.addEventListener('loadeddata', prime);

function updateScrub(){
  const p = heroProgress();
  wantTime = clamp(p * duration, 0, Math.max(0, duration - 0.04));

  updatePhrases(p);

  const pct = Math.round(p * 100);
  meterFill.style.width = pct + '%';
  meterPct.textContent  = pct + '%';
  meterStat.textContent = pct === 0 ? 'גוללו להדפסה' : pct >= 99 ? 'הודפס ✓' : 'מדפיס…';

  maybeSeek();
}

/* floating image cubes — smoothed continuous parallax.
   Scroll only updates each cube's TARGET; a persistent rAF loop eases the
   current value toward it (lerp), giving flowing motion with gentle inertia. */
const fstate = Array.from(document.querySelectorAll('.floater')).map(el => ({
  el, range: parseFloat(el.dataset.range) || 120, cur: 0, target: 0,
  curScale: 1, targetScale: 1
}));

// hover → smooth grow (eased inside the same loop so it won't fight the parallax transform)
const HOVER_SCALE = 1.06;
fstate.forEach(s => {
  s.el.addEventListener('mouseenter', () => { s.targetScale = HOVER_SCALE; kickFloat(); });
  s.el.addEventListener('mouseleave', () => { s.targetScale = 1; kickFloat(); });
});

function computeFloaterTargets(){
  const vh = window.innerHeight;
  fstate.forEach((s, i) => {
    const r = s.el.getBoundingClientRect();
    const rawTop = r.top - s.cur;                 // layout top without current offset
    const hide = r.height + 70;                    // distance to tuck fully under the orange band
    const delay = i * 70;                          // stagger → cubes emerge one after another
    let e = clamp((vh * 0.90 - rawTop - delay) / (vh * 0.42), 0, 1); // 0 hidden → 1 risen
    e = 1 - Math.pow(1 - e, 3);                    // easeOutCubic
    s.target = (1 - e) * hide;                     // starts pushed down (clipped), rises to rest
  });
}

const EASE = 0.085;                               // lower = smoother/slower catch-up
let floatRAF = null;
function floatLoop(){
  let moving = false;
  for (const s of fstate){
    s.cur += (s.target - s.cur) * EASE;
    s.curScale += (s.targetScale - s.curScale) * 0.14;          // eased hover grow
    if (Math.abs(s.target - s.cur) > 0.08) moving = true;
    if (Math.abs(s.targetScale - s.curScale) > 0.001) moving = true;
    s.el.style.transform =
      'translate3d(0,' + s.cur.toFixed(2) + 'px,0) scale(' + s.curScale.toFixed(4) + ')'; // GPU-composited
  }
  floatRAF = moving ? requestAnimationFrame(floatLoop) : null;
}
function kickFloat(){ if (floatRAF === null) floatRAF = requestAnimationFrame(floatLoop); }
function updateFloaters(){ computeFloaterTargets(); kickFloat(); }

/* ---------- single rAF-throttled scroll handler ---------- */
let ticking = false;
window.addEventListener('scroll', () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => { setNav(); updateScrub(); computeFloaterTargets(); kickFloat(); ticking = false; });
}, { passive: true });
window.addEventListener('resize', () => { updateScrub(); updateFloaters(); });

// set the opening phrase + cube positions immediately
updatePhrases(heroProgress());
updateFloaters();

/* ---------- reveal on scroll ---------- */
const revealEls = document.querySelectorAll(
  '.srv, .work__item, .step, .quote, .stat, .head, .manifesto__text, .spec-table, .cta__text, .cta__form'
);
revealEls.forEach((el, i) => {
  el.classList.add('reveal');
  el.style.transitionDelay = (i % 4) * 60 + 'ms';
});
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
}, { threshold: 0.12 });
revealEls.forEach(el => io.observe(el));
fstate.forEach(s => s.el && io.observe(s.el));
document.querySelectorAll('.orangeband__media').forEach(el => io.observe(el));

/* ---------- count-up stats ---------- */
const counters = document.querySelectorAll('.stat__num');
const cio = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    const el = e.target, target = +el.dataset.count, suffix = el.dataset.suffix || '';
    const dur = 1500, start = performance.now();
    const tick = (now) => {
      const t = clamp((now - start) / dur, 0, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(target * eased).toLocaleString('he-IL') + suffix;
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    cio.unobserve(el);
  });
}, { threshold: 0.6 });
counters.forEach(c => cio.observe(c));

/* =========================================================
   Background video that scrubs with the page scroll
   (maps the section's travel through the viewport → frame).
   ========================================================= */
function setupScrubVideo(video, section){
  let duration = 0, want = 0, seeking = false, primed = false;
  const EPS = 1 / 48;
  const progress = () => {
    const vh = window.innerHeight;
    const r = section.getBoundingClientRect();
    const early = vh * 0.35;                         // start scrubbing a bit before the section enters
    const total = vh + early + r.height;
    return total > 0 ? clamp((vh + early - r.top) / total, 0, 1) : 0;
  };
  const doSeek = (t) => { seeking = true; try { video.currentTime = t; } catch (e) { seeking = false; } };
  const maybeSeek = () => {
    if (seeking || !duration) return;
    if (Math.abs(video.currentTime - want) < EPS) return;
    doSeek(want);
  };
  video.addEventListener('seeked', () => { seeking = false; if (Math.abs(video.currentTime - want) >= EPS) doSeek(want); });
  video.addEventListener('error', () => { seeking = false; });
  const prime = () => {
    if (primed) return; primed = true;
    const p = video.play();
    if (p && p.then) p.then(() => { video.pause(); maybeSeek(); }).catch(() => maybeSeek());
    else maybeSeek();
  };
  const update = () => { want = clamp(progress() * duration, 0, Math.max(0, duration - 0.04)); maybeSeek(); };
  const onMeta = () => { duration = video.duration || 0; update(); prime(); };
  if (video.readyState >= 1) onMeta();
  video.addEventListener('loadedmetadata', onMeta);
  video.addEventListener('loadeddata', prime);

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => { update(); ticking = false; });
  }, { passive: true });
  window.addEventListener('resize', update);
  update();
}
var _svc = document.getElementById('servicesVideo'), _svcSec = document.getElementById('services');
if (_svc && _svcSec) setupScrubVideo(_svc, _svcSec);

