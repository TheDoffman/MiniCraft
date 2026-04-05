/** Procedural sound system using Web Audio API — master gain for settings volume. */

let ctx = null;
/** @type {GainNode | null} */
let masterGain = null;

function getCtx() {
  if (!ctx) {
    const Win = window as unknown as { webkitAudioContext?: typeof AudioContext };
    const AC = window.AudioContext ?? Win.webkitAudioContext;
    if (!AC) throw new Error('Web Audio API not available');
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function outGain(ac) {
  getCtx();
  return masterGain ?? ac.destination;
}

/**
 * @param {number} vol 0–1
 */
export function setMasterVolume(vol) {
  try {
    const ac = getCtx();
    const g = masterGain?.gain;
    if (g) g.setTargetAtTime(Math.max(0, Math.min(1, vol)), ac.currentTime, 0.05);
  } catch {
    /* ignore */
  }
}

/**
 * Play a short noise burst — used for block break / place.
 * @param {'break' | 'place' | 'hurt' | 'eat' | 'pop' | 'footstep' | 'splash' | 'mobGrowl' | 'zombieHurt' | 'squidHurt' | 'mobBaa' | 'mobCluck' | 'mobOink' | 'mobMoo' | 'mobMelee'} type
 */
export function playSound(type) {
  try {
    const ac = getCtx();
    const dest = outGain(ac);
    switch (type) {
      case 'break':
        noiseBurst(ac, dest, 0.12, 320, 0.18);
        break;
      case 'mobMelee':
        noiseBurst(ac, dest, 0.07, 220, 0.14);
        break;
      case 'place':
        noiseBurst(ac, dest, 0.08, 480, 0.14);
        break;
      case 'hurt':
        toneDown(ac, dest, 440, 260, 0.16, 0.22);
        break;
      case 'eat':
        crunchSound(ac, dest);
        break;
      case 'pop':
        tonePop(ac, dest, 620, 0.06, 0.1);
        break;
      case 'footstep':
        noiseBurst(ac, dest, 0.04, 900, 0.07);
        break;
      case 'splash':
        noiseBurst(ac, dest, 0.07, 400, 0.09);
        break;
      case 'mobGrowl':
        toneDown(ac, dest, 120, 70, 0.12, 0.2);
        break;
      case 'zombieHurt':
        toneDown(ac, dest, 200, 110, 0.1, 0.18);
        break;
      case 'squidHurt':
        noiseBurst(ac, dest, 0.06, 600, 0.08);
        break;
      case 'mobBaa':
        mobBaa(ac, dest);
        break;
      case 'mobCluck':
        mobCluck(ac, dest);
        break;
      case 'mobOink':
        noiseBurst(ac, dest, 0.09, 520, 0.11);
        break;
      case 'mobMoo':
        toneDown(ac, dest, 180, 95, 0.14, 0.24);
        break;
      default:
        break;
    }
  } catch {
    // Audio not available — silent fallback
  }
}

/**
 * @param {AudioContext} ac
 * @param {AudioNode} dest
 */
function noiseBurst(ac, dest, duration, filterFreq, volume) {
  const buf = ac.createBuffer(1, ac.sampleRate * duration, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * volume;
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filt = ac.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = filterFreq;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(volume, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  src.connect(filt).connect(gain).connect(dest);
  src.start();
  src.stop(ac.currentTime + duration);
}

function toneDown(ac, dest, startFreq, endFreq, volume, duration) {
  const osc = ac.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(startFreq, ac.currentTime);
  osc.frequency.linearRampToValueAtTime(endFreq, ac.currentTime + duration);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(volume, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  osc.connect(gain).connect(dest);
  osc.start();
  osc.stop(ac.currentTime + duration);
}

function crunchSound(ac, dest) {
  for (let i = 0; i < 3; i++) {
    const delay = i * 0.06;
    const dur = 0.05;
    const buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let j = 0; j < data.length; j++) {
      data[j] = (Math.random() * 2 - 1) * 0.12;
    }
    const src = ac.createBufferSource();
    src.buffer = buf;
    const filt = ac.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 600 + i * 200;
    filt.Q.value = 2;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.14, ac.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + dur);
    src.connect(filt).connect(gain).connect(dest);
    src.start(ac.currentTime + delay);
    src.stop(ac.currentTime + delay + dur);
  }
}

/**
 * @param {AudioContext} ac
 * @param {AudioNode} dest
 */
function mobBaa(ac, dest) {
  const osc = ac.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(320, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(165, ac.currentTime + 0.14);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.11, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.16);
  osc.connect(gain).connect(dest);
  osc.start();
  osc.stop(ac.currentTime + 0.17);
}

/**
 * @param {AudioContext} ac
 * @param {AudioNode} dest
 */
function mobCluck(ac, dest) {
  const osc = ac.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(780, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(520, ac.currentTime + 0.045);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.06, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.07);
  const filt = ac.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = 2400;
  osc.connect(filt).connect(gain).connect(dest);
  osc.start();
  osc.stop(ac.currentTime + 0.08);
}

function tonePop(ac, dest, freq, duration, volume) {
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(freq * 1.5, ac.currentTime + duration);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(volume, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  osc.connect(gain).connect(dest);
  osc.start();
  osc.stop(ac.currentTime + duration);
}

/* ── Ambient sound system ── */

let windGain = null;
let windSource = null;
let underwaterGain = null;
let underwaterSource = null;
/** @type {GainNode | null} */
let weatherRainGain = null;
/** Extra lowpass after bandpass — dulls rain under roofs (muffled). */
/** @type {BiquadFilterNode | null} */
let weatherRainShelterLp = null;
/** @type {GainNode | null} */
let weatherSnowGain = null;
/** @type {GainNode | null} */
let weatherDustGain = null;
/** @type {GainNode | null} */
let musicBedGain = null;
let ambientStarted = false;

function makeNoiseLoopBuffer(/** @type {AudioContext} */ ac, durationSec, amp) {
  const n = Math.max(256, Math.floor(ac.sampleRate * durationSec));
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    d[i] = (Math.random() * 2 - 1) * amp;
  }
  return buf;
}

/**
 * Start ambient layers. Call once after first user interaction (pointer lock).
 */
export function startAmbient() {
  if (ambientStarted) return;
  try {
    const ac = getCtx();
    const dest = outGain(ac);
    const windBuf = ac.createBuffer(1, ac.sampleRate * 4, ac.sampleRate);
    const wd = windBuf.getChannelData(0);
    for (let i = 0; i < wd.length; i++) {
      wd[i] = (Math.random() * 2 - 1) * 0.08;
    }
    windSource = ac.createBufferSource();
    windSource.buffer = windBuf;
    windSource.loop = true;
    const windFilt = ac.createBiquadFilter();
    windFilt.type = 'lowpass';
    windFilt.frequency.value = 280;
    windFilt.Q.value = 0.5;
    windGain = ac.createGain();
    windGain.gain.value = 0.06;
    windSource.connect(windFilt).connect(windGain).connect(dest);

    const uwBuf = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate);
    const ud = uwBuf.getChannelData(0);
    for (let i = 0; i < ud.length; i++) {
      ud[i] = (Math.random() * 2 - 1) * 0.1;
    }
    underwaterSource = ac.createBufferSource();
    underwaterSource.buffer = uwBuf;
    underwaterSource.loop = true;
    const uwFilt = ac.createBiquadFilter();
    uwFilt.type = 'lowpass';
    uwFilt.frequency.value = 160;
    uwFilt.Q.value = 1;
    underwaterGain = ac.createGain();
    underwaterGain.gain.value = 0;
    underwaterSource.connect(uwFilt).connect(underwaterGain).connect(dest);

    windSource.start();
    underwaterSource.start();

    const rainBuf = makeNoiseLoopBuffer(ac, 1.8, 0.12);
    const rs = ac.createBufferSource();
    rs.buffer = rainBuf;
    rs.loop = true;
    const rainBp = ac.createBiquadFilter();
    rainBp.type = 'bandpass';
    rainBp.frequency.value = 820;
    rainBp.Q.value = 0.85;
    const rainSh = ac.createBiquadFilter();
    rainSh.type = 'highpass';
    rainSh.frequency.value = 380;
    rainSh.Q.value = 0.7;
    weatherRainShelterLp = ac.createBiquadFilter();
    weatherRainShelterLp.type = 'lowpass';
    weatherRainShelterLp.frequency.value = 18000;
    weatherRainShelterLp.Q.value = 0.65;
    weatherRainGain = ac.createGain();
    weatherRainGain.gain.value = 0;
    rs.connect(rainSh).connect(rainBp).connect(weatherRainShelterLp).connect(weatherRainGain).connect(dest);
    rs.start();

    const snowBuf = makeNoiseLoopBuffer(ac, 2.4, 0.1);
    const ss = ac.createBufferSource();
    ss.buffer = snowBuf;
    ss.loop = true;
    const snowLp = ac.createBiquadFilter();
    snowLp.type = 'lowpass';
    snowLp.frequency.value = 1400;
    snowLp.Q.value = 0.6;
    weatherSnowGain = ac.createGain();
    weatherSnowGain.gain.value = 0;
    ss.connect(snowLp).connect(weatherSnowGain).connect(dest);
    ss.start();

    const dustBuf = makeNoiseLoopBuffer(ac, 2.0, 0.14);
    const ds = ac.createBufferSource();
    ds.buffer = dustBuf;
    ds.loop = true;
    const dustBp = ac.createBiquadFilter();
    dustBp.type = 'bandpass';
    dustBp.frequency.value = 220;
    dustBp.Q.value = 0.55;
    const dustLp = ac.createBiquadFilter();
    dustLp.type = 'lowpass';
    dustLp.frequency.value = 900;
    dustLp.Q.value = 0.5;
    weatherDustGain = ac.createGain();
    weatherDustGain.gain.value = 0;
    ds.connect(dustBp).connect(dustLp).connect(weatherDustGain).connect(dest);
    ds.start();

    const m1 = ac.createOscillator();
    m1.type = 'sine';
    m1.frequency.value = 55;
    const m2 = ac.createOscillator();
    m2.type = 'sine';
    m2.frequency.value = 82.4;
    musicBedGain = ac.createGain();
    musicBedGain.gain.value = 0;
    const mLp = ac.createBiquadFilter();
    mLp.type = 'lowpass';
    mLp.frequency.value = 420;
    m1.connect(musicBedGain);
    m2.connect(musicBedGain);
    musicBedGain.connect(mLp).connect(dest);
    m1.start();
    m2.start();

    ambientStarted = true;
  } catch {
    // Silent fallback
  }
}

/**
 * Update ambient volumes based on game state.
 * @param {{
 *   underwater: boolean,
 *   nightFactor: number,
 *   weather?: { kind: string, strength: number } | null,
 *   rainShelter?: { gainMul: number, muffle: number } | null,
 *   ambientMusicBed?: boolean,
 * }} state
 */
export function updateAmbient(state) {
  if (!ambientStarted) return;
  try {
    const ac = getCtx();
    const t = ac.currentTime;
    if (windGain) {
      let target = 0.03 + state.nightFactor * 0.06;
      const w = state.weather;
      if (w && w.strength > 0.02) {
        const s = Math.max(0, Math.min(1, w.strength));
        if (w.kind === 'mist') target += s * 0.045;
        if (w.kind === 'snow') target += s * 0.035;
        if (w.kind === 'dust') target += s * 0.055;
        if (w.kind === 'rain') target += s * 0.025;
      }
      windGain.gain.setTargetAtTime(Math.min(0.14, target), t, 0.5);
    }
    if (underwaterGain) {
      const target = state.underwater ? 0.12 : 0;
      underwaterGain.gain.setTargetAtTime(target, t, 0.15);
    }
    let rainT = 0;
    let snowT = 0;
    let dustT = 0;
    const w = state.weather;
    if (w && weatherRainGain && weatherSnowGain && weatherDustGain) {
      const s = Math.max(0, Math.min(1, w.strength));
      switch (w.kind) {
        case 'rain':
          rainT = s * 0.19;
          break;
        case 'snow':
          snowT = s * 0.13;
          break;
        case 'dust':
          dustT = s * 0.16;
          break;
        case 'mist':
          rainT = s * 0.028;
          snowT = s * 0.018;
          break;
        default:
          break;
      }
      if (state.underwater) {
        rainT *= 0.1;
        snowT *= 0.1;
        dustT *= 0.1;
      }
      const shelter = state.rainShelter;
      if (shelter && Number.isFinite(shelter.gainMul)) {
        rainT *= Math.max(0, Math.min(1, shelter.gainMul));
      }
      if (weatherRainShelterLp && shelter && Number.isFinite(shelter.muffle)) {
        const m = Math.max(0, Math.min(1, shelter.muffle));
        const freq = 380 + (1 - m * m) * 17600;
        weatherRainShelterLp.frequency.setTargetAtTime(freq, t, 0.28);
      } else if (weatherRainShelterLp) {
        weatherRainShelterLp.frequency.setTargetAtTime(18000, t, 0.28);
      }
      weatherRainGain.gain.setTargetAtTime(rainT, t, 0.4);
      weatherSnowGain.gain.setTargetAtTime(snowT, t, 0.4);
      weatherDustGain.gain.setTargetAtTime(dustT, t, 0.4);
    } else {
      if (weatherRainGain) weatherRainGain.gain.setTargetAtTime(0, t, 0.35);
      if (weatherSnowGain) weatherSnowGain.gain.setTargetAtTime(0, t, 0.35);
      if (weatherDustGain) weatherDustGain.gain.setTargetAtTime(0, t, 0.35);
      if (weatherRainShelterLp) weatherRainShelterLp.frequency.setTargetAtTime(18000, t, 0.2);
    }
    if (musicBedGain) {
      const on = state.ambientMusicBed !== false;
      let bed = on ? 0.01 + state.nightFactor * 0.016 : 0;
      if (state.underwater) bed *= 0.22;
      musicBedGain.gain.setTargetAtTime(Math.min(0.045, bed), t, 0.55);
    }
  } catch {
    // ignore
  }
}
