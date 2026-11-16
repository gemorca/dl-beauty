import { CONFIG } from './config.js';

const SOUND_KEY = 'dlbeauty_sound_v1';
const MUSIC_KEY = 'dlbeauty_music_v1';
const MUSIK_URL = String((CONFIG && CONFIG.MUSIK_URL) || '').trim();

let ac = null;
let sfxGain = null;
let musicGain = null;
let soundOn = readSound();
let musicOn = false;
let silent = false;
let padTimer = 0;
let bellTimer = 0;
let playSeq = 0;
let fileAudio = null;
let notify = () => { };
let btnSound = null;
let btnMusic = null;

function readSound() {
  try { return localStorage.getItem(SOUND_KEY) === '1'; } catch (e) { return false; }
}
function writeSound(v) {
  try { localStorage.setItem(SOUND_KEY, v ? '1' : '0'); } catch (e) { }
}
function readMusicPref() {
  try { return localStorage.getItem(MUSIC_KEY) !== '0'; } catch (e) { return true; }
}
function writeMusicPref(v) {
  try { localStorage.setItem(MUSIC_KEY, v ? '1' : '0'); } catch (e) { }
}

function ensureContext() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  if (!ac) {
    ac = new AC();
    sfxGain = ac.createGain();
    sfxGain.gain.value = 0.6;
    sfxGain.connect(ac.destination);
    musicGain = ac.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume();
  return true;
}

function tone(freq, start, dur, peak, type) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type || 'sine';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g);
  g.connect(sfxGain);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

const SFX = {
  tambah(t) { tone(659.25, t, 0.16, 0.22); tone(880, t + 0.09, 0.22, 0.2); },
  nyala(t) { tone(783.99, t, 0.2, 0.2); }
};

export function playSfx(name) {
  if (!soundOn) return;
  if (!ensureContext() || !SFX[name]) return;
  if (ac.state !== 'running') return;
  SFX[name](ac.currentTime + 0.01);
}

const CHORDS = [
  [130.81, 196.0, 246.94, 329.63],
  [110.0, 164.81, 261.63, 329.63],
  [87.31, 130.81, 220.0, 329.63],
  [98.0, 146.83, 246.94, 329.63]
];
const CHORD_SEC = 8;
let chordIndex = 0;
let lastChord = CHORDS[0];

function playChord() {
  if (!ac || !musicOn) return;
  const chord = CHORDS[chordIndex++ % CHORDS.length];
  lastChord = chord;
  const t = ac.currentTime + 0.05;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1100;
  filter.connect(musicGain);
  chord.forEach((f, i) => {
    [['sine', 0, 0.5], ['triangle', 4 + i, 0.18]].forEach(([type, detune, level]) => {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = type;
      osc.frequency.value = f;
      osc.detune.value = detune;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(level * 0.22, t + 2.6);
      g.gain.linearRampToValueAtTime(level * 0.22, t + CHORD_SEC - 2.2);
      g.gain.linearRampToValueAtTime(0.0001, t + CHORD_SEC + 1.5);
      osc.connect(g);
      g.connect(filter);
      osc.start(t);
      osc.stop(t + CHORD_SEC + 1.7);
    });
  });
}

function playBell() {
  if (!ac || !musicOn) return;
  const f = lastChord[Math.floor(Math.random() * lastChord.length)] * 4;
  const t = ac.currentTime + 0.02;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
  osc.connect(g);
  g.connect(musicGain);
  osc.start(t);
  osc.stop(t + 2.5);
  bellTimer = setTimeout(playBell, 2200 + Math.random() * 3200);
}

function startGenerated() {
  chordIndex = 0;
  musicGain.gain.cancelScheduledValues(ac.currentTime);
  musicGain.gain.setValueAtTime(musicGain.gain.value, ac.currentTime);
  musicGain.gain.linearRampToValueAtTime(0.55, ac.currentTime + 1.2);
  playChord();
  padTimer = setInterval(playChord, CHORD_SEC * 1000);
  bellTimer = setTimeout(playBell, 3000);
}

function stopGenerated() {
  clearInterval(padTimer);
  clearTimeout(bellTimer);
  padTimer = 0;
  bellTimer = 0;
  if (ac && musicGain) {
    musicGain.gain.cancelScheduledValues(ac.currentTime);
    musicGain.gain.setValueAtTime(musicGain.gain.value, ac.currentTime);
    musicGain.gain.linearRampToValueAtTime(0, ac.currentTime + 0.5);
  }
}

function giveUp(err) {
  console.warn('Musik gagal diputar:', err && err.name, err);
  musicOn = false;
  silent = false;
  paint();
}

function startFile(auto) {
  if (!fileAudio) {
    fileAudio = new Audio(MUSIK_URL);
    fileAudio.loop = true;
    fileAudio.volume = 0.35;
    fileAudio.preload = 'none';
  }
  const seq = ++playSeq;
  const stale = () => seq !== playSeq;
  silent = false;
  fileAudio.muted = false;
  const p = fileAudio.play();
  if (!p || !p.then) return;
  p.then(() => { if (!stale()) paint(); }, (err) => {
    if (stale()) return;
    if (!auto) { giveUp(err); notify('Musik tidak bisa diputar'); return; }
    fileAudio.muted = true;
    fileAudio.play().then(() => {
      if (stale()) return;
      silent = true;
      paint();
      armGesture();
      notify('Ketuk layar untuk menyalakan musik');
    }, (err2) => {
      if (stale()) return;
      giveUp(err2);
      armGesture();
    });
  });
}

function stopFile() {
  if (fileAudio) fileAudio.pause();
}

function paint() {
  if (btnSound) btnSound.setAttribute('aria-pressed', String(soundOn));
  if (btnMusic) btnMusic.setAttribute('aria-pressed', String(musicOn && !silent));
}

function toggleSound() {
  soundOn = !soundOn;
  writeSound(soundOn);
  paint();
  notify(soundOn ? 'Suara nyala' : 'Suara mati');
  if (soundOn) playSfx('nyala');
}

function startMusic(auto) {
  if (MUSIK_URL) {
    musicOn = true;
    startFile(auto);
    return true;
  }
  if (!ensureContext()) { if (!auto) notify('Browser ini tidak mendukung audio'); return false; }
  musicOn = true;
  startGenerated();
  return true;
}

function stopMusic() {
  musicOn = false;
  silent = false;
  playSeq++;
  if (MUSIK_URL) stopFile(); else stopGenerated();
}

function toggleMusic() {
  disarm();
  if (musicOn && silent && fileAudio) {
    fileAudio.muted = false;
    silent = false;
    fileAudio.play().catch(() => { });
    paint();
    notify('Musik nyala');
    return;
  }
  if (!musicOn) {
    if (!startMusic(false)) return;
    writeMusicPref(true);
    notify('Musik nyala');
  } else {
    stopMusic();
    writeMusicPref(false);
    notify('Musik mati');
  }
  paint();
}

const GESTURES = ['pointerup', 'click', 'keydown', 'touchend'];
let armed = false;

function onGesture(ev) {
  if (ev && ev.target && ev.target.closest && ev.target.closest('#musicBtn')) return;
  if (musicOn && silent && fileAudio) {
    fileAudio.muted = false;
    const done = () => { silent = false; paint(); disarm(); };
    const p = fileAudio.play();
    if (p && p.then) p.then(done, () => { fileAudio.muted = true; }); else done();
    return;
  }
  disarm();
  if (musicOn || !readMusicPref()) return;
  startMusic(false);
  paint();
}

function disarm() {
  if (!armed) return;
  armed = false;
  GESTURES.forEach((t) => document.removeEventListener(t, onGesture, true));
}

function armGesture() {
  if (armed || !readMusicPref()) return;
  armed = true;
  GESTURES.forEach((t) => document.addEventListener(t, onGesture, true));
}

function autoStart() {
  if (!readMusicPref()) return;
  if (MUSIK_URL) startMusic(true);
  else armGesture();
  paint();
}

function onVisibility() {
  if (document.hidden) {
    if (fileAudio && musicOn) fileAudio.pause();
    if (ac && ac.state === 'running') ac.suspend();
  } else {
    if (fileAudio && musicOn) fileAudio.play().catch(() => { });
    if (ac && ac.state === 'suspended' && (musicOn || soundOn)) ac.resume();
  }
}

export function initAudio(buttons, onNotify) {
  btnSound = buttons.sound;
  btnMusic = buttons.music;
  notify = onNotify || notify;
  if (btnSound) btnSound.addEventListener('click', toggleSound);
  if (btnMusic) btnMusic.addEventListener('click', toggleMusic);
  document.addEventListener('visibilitychange', onVisibility);
  paint();
  autoStart();
}
