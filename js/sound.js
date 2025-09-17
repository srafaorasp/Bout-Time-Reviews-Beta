import { dom } from './state.js';
import { delay } from './utils.js';

let audioCtx;

export function initAudio() {
    if (!audioCtx) {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch(e) {
            console.error("Web Audio API is not supported in this browser");
        }
    }
}

export async function playBellSequence(count) {
    for(let i=0; i < count; i++) {
        playSound('bell');
        await delay(300);
    }
}

export function playSound(type, options = {}) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    
    if (type === 'bell') {
        const gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(0.3, now);
        const freqs = [587.33, 880, 1174.66, 1479.98 * 1.05, 1760 * 0.95]; 
        freqs.forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;
            const individualGain = audioCtx.createGain();
            individualGain.gain.setValueAtTime(1 / (i*1.5 + 1), now);
            osc.connect(individualGain).connect(gainNode);
            osc.start(now);
            osc.stop(now + 2.5);
        });
        gainNode.gain.linearRampToValueAtTime(0.4, now + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 2.5);
        gainNode.connect(audioCtx.destination);
    } else if (type === 'punch') {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.1);
        gainNode.gain.setValueAtTime(0.2, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gainNode).connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
    } else if (type === 'count_tick') {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(100, now);
        gainNode.gain.setValueAtTime(0.2, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gainNode).connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.08);
    } else if (type === 'crowd_roar') {
        const intensity = options.intensity || 0.5;
        const bufferSize = audioCtx.sampleRate * 2; // 2 seconds
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const output = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }

        const whiteNoise = audioCtx.createBufferSource();
        whiteNoise.buffer = buffer;

        const lowpass = audioCtx.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.frequency.setValueAtTime(200 * intensity, now);
        lowpass.frequency.linearRampToValueAtTime(800 * intensity, now + 1);

        const gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.15 * intensity, now + 0.5);
        gainNode.gain.linearRampToValueAtTime(0, now + 2);

        whiteNoise.connect(lowpass).connect(gainNode).connect(audioCtx.destination);
        whiteNoise.start();
    }
}

export function speak(text, isTitleAnnouncement = false) {
    if (dom.center.enableAnnouncerCheckbox.checked && 'speechSynthesis' in window) {
        speechSynthesis.cancel();
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = text;
        const cleanText = tempDiv.textContent || tempDiv.innerText || "";
        const utterance = new SpeechSynthesisUtterance(cleanText);
        if (isTitleAnnouncement) {
            utterance.pitch = 1.4;
            utterance.rate = 0.9;
            utterance.volume = 1.0;
        }
        speechSynthesis.speak(utterance);
    }
}
