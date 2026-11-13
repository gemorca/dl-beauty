// Suara dan musik latar untuk halaman publik.
//
// - "Suara" = efek bunyi pendek (misalnya saat produk masuk keranjang). Pilihan disimpan di
//   localStorage (dlbeauty_sound_v1). Bawaan: mati.
// - "Musik" = musik latar. Bawaan: NYALA. Saat halaman dibuka, musik dicoba diputar langsung;
//   bila browser menolak (aturan autoplay), musik dimulai pada interaksi pertama pengunjung
//   (klik, ketuk, atau tombol keyboard). Bila pengunjung mematikannya, pilihan itu disimpan
//   (dlbeauty_music_v1 = 0) dan musik tidak menyala otomatis lagi di kunjungan berikutnya.
//
// Sumber musik:
//   1. Bila CONFIG.MUSIK_URL berisi alamat file audio (mp3/ogg/m4a, mis. 'assets/musik.mp3'),
//      file itu diputar berulang. Pastikan kamu punya hak memakai lagunya.
//   2. Bila kosong, dipakai musik ambien buatan sendiri (disintesis di browser, tanpa file,
//      tanpa hak cipta pihak lain).
//
// Semua suara berhenti saat tab disembunyikan dan lanjut saat tab dibuka lagi.
import { CONFIG } from './config.js';

const SOUND_KEY = 'dlbeauty_sound_v1';
const MUSIC_KEY = 'dlbeauty_music_v1';
const MUSIK_URL = String((CONFIG && CONFIG.MUSIK_URL) || '').trim();

let ac = null;          // AudioContext (dibuat saat klik pertama)
let sfxGain = null;
let musicGain = null;
let soundOn = readSound();
let musicOn = false;
let padTimer = 0;
let bellTimer = 0;
let fileAudio = null;   // elemen <audio> bila MUSIK_URL dipakai
let notify = () => {};
let btnSound = null;
let btnMusic = null;

function readSound() {
  try { return localStorage.getItem(SOUND_KEY) === '1'; } catch (e) { return false; }
}
function writeSound(v) {
  try { localStorage.setItem(SOUND_KEY, v ? '1' : '0'); } catch (e) { /* abaikan */ }
}
// Musik nyala kecuali pengunjung pernah mematikannya sendiri.
function readMusicPref() {
  try { return localStorage.getItem(MUSIC_KEY) !== '0'; } catch (e) { return true; }
}
function writeMusicPref(v) {
  try { localStorage.setItem(MUSIC_KEY, v ? '1' : '0'); } catch (e) { /* abaikan */ }
}

// Dipanggil hanya dari dalam penangan klik/sentuh (butuh interaksi pengguna).
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

/* ---------- Efek bunyi ---------- */

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
  // Dua nada naik, lembut: produk masuk keranjang.
  tambah(t) { tone(659.25, t, 0.16, 0.22); tone(880, t + 0.09, 0.22, 0.2); },
  // Satu nada: contoh tombol dinyalakan.
  nyala(t) { tone(783.99, t, 0.2, 0.2); }
};

export function playSfx(name) {
  if (!soundOn) return;
  if (!ensureContext() || !SFX[name]) return;
  if (ac.state !== 'running') return;
  SFX[name](ac.currentTime + 0.01);
}

/* ---------- Musik ambien buatan ---------- */

// Cmaj7 - Am7 - Fmaj7 - G6, oktaf rendah-menengah. Pelan, tanpa ketukan.
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

/* ---------- Musik dari file ---------- */

function startFile(auto) {
  if (!fileAudio) {
    fileAudio = new Audio(MUSIK_URL);
    fileAudio.loop = true;
    fileAudio.volume = 0.35;
    fileAudio.preload = 'none';
  }
  const p = fileAudio.play();
  if (p && p.catch) {
    p.catch(() => {
      musicOn = false;
      paint();
      // Autoplay ditolak browser: tunggu interaksi pertama, tanpa pesan galat.
      if (auto) armGesture(); else notify('Musik tidak bisa diputar');
    });
  }
}

function stopFile() {
  if (fileAudio) fileAudio.pause();
}

/* ---------- Tombol ---------- */

function paint() {
  if (btnSound) btnSound.setAttribute('aria-pressed', String(soundOn));
  if (btnMusic) btnMusic.setAttribute('aria-pressed', String(musicOn));
}

function toggleSound() {
  soundOn = !soundOn;
  writeSound(soundOn);
  paint();
  notify(soundOn ? 'Suara nyala' : 'Suara mati');
  if (soundOn) playSfx('nyala');
}

// Mulai musik. auto=true: dipicu otomatis (bukan klik tombol Musik).
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
  if (MUSIK_URL) stopFile(); else stopGenerated();
}

function toggleMusic() {
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

// Menunggu interaksi pertama, lalu memutar musik. Klik pada tombol Musik sendiri diabaikan
// (tombol itu yang mengatur nyala/mati).
const GESTURES = ['pointerup', 'click', 'keydown', 'touchend'];
let armed = false;

function onGesture(ev) {
  if (ev && ev.target && ev.target.closest && ev.target.closest('#musicBtn')) { disarm(); return; }
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

// Dipanggil sekali saat halaman dibuka.
function autoStart() {
  if (!readMusicPref()) return;
  if (MUSIK_URL) startMusic(true);   // coba langsung; bila ditolak, startFile memasang armGesture
  else armGesture();                 // musik buatan butuh AudioContext dari interaksi pengguna
  paint();
}

// Hemat baterai dan sopan: berhenti saat tab tidak terlihat.
function onVisibility() {
  if (document.hidden) {
    if (fileAudio && musicOn) fileAudio.pause();
    if (ac && ac.state === 'running') ac.suspend();
  } else {
    if (fileAudio && musicOn) fileAudio.play().catch(() => {});
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