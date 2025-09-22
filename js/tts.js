import { state } from './state.js';
import { calculateRawScore, applyBonuses } from './utils.js';
import { getMajorChampionInfo, getLocalChampionInfo, hasAchievedGrandSlam } from './ui.js';

let synth = window.speechSynthesis;
let voices = [];

function populateVoiceList() {
    voices = synth.getVoices().filter(voice => voice.lang.startsWith('en'));
}

if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = populateVoiceList;
}

function speak(text) {
    if (synth.speaking) {
        console.error('speechSynthesis.speaking');
        return;
    }
    if (text !== '') {
        let utterThis = new SpeechSynthesisUtterance(text);
        utterThis.onend = function (event) {
            // console.log('SpeechSynthesisUtterance.onend');
        }
        utterThis.onerror = function (event) {
            console.error('SpeechSynthesisUtterance.onerror');
        }
        
        // Find a suitable voice
        const announcerVoice = voices.find(v => v.name.includes('Google US English') || v.name.includes('David') || v.name.includes('Zira'));
        if(announcerVoice) {
            utterThis.voice = announcerVoice;
        }

        utterThis.pitch = 0.8;
        utterThis.rate = 0.9;
        synth.speak(utterThis);
    }
}

function numberToOrdinal(n) {
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function buildAnnouncerSpeechForFighter(fighter, fighterNum) {
    // Safety check to prevent crash if fighter data is missing
    if (!fighter || !fighter.name) {
        return `In this corner, Fighter ${fighterNum}.`;
    }
    
    const rawScore = calculateRawScore(fighter);
    const finalScore = applyBonuses(rawScore, fighter);

    const { name, record, devHouse, publisher } = fighter;
    const cornerColor = fighterNum === 1 ? 'blue' : 'purple';
    const { tko, ko, losses } = record;
    const recordSpeech = `${tko} wins by TKO, ${ko} knockouts, and ${losses} losses`;
    
    let segments = [];
    
    // Main intro
    let originString = (devHouse && publisher && devHouse !== publisher) ? `From ${devHouse}, by way of ${publisher}!` : (devHouse ? `From ${devHouse}!` : (publisher ? `From ${publisher}!` : ''));
    let scoreText = rawScore.toFixed(2) !== finalScore.toFixed(2) ? `weighing in at ${rawScore.toFixed(2)} score and weighted ${finalScore.toFixed(2)}` : `weighing in at ${rawScore.toFixed(2)} score.`;
    segments.push(`Introducing, fighting out of the ${cornerColor} corner! ${originString} With a record of ${recordSpeech}, ${scoreText}`);
    
    let hasAnyTitle = false;

    // Accolades
    if (fighter.isHallOfFamer) {
        segments.push(`${hasAnyTitle ? 'And ' : ''}Hall of Famer!`);
        hasAnyTitle = true;
    }
    if (hasAchievedGrandSlam(fighter)) {
        segments.push(`${hasAnyTitle ? 'And ' : ''}Grand Slam Title Winner!`);
        hasAnyTitle = true;
    }

    // Past Titles
    const pastTitles = fighter.record.pastTitles || {};
    const titleRanking = ['undisputed', 'heavyweight', 'interGenre', 'cruiserweight', 'featherweight', ...Object.keys(state.roster.local)];
    let highestPastTitle = null;
    for (const title of titleRanking) {
        if (pastTitles[title]) {
            highestPastTitle = title;
            break;
        }
    }
    if (highestPastTitle) {
        const times = pastTitles[highestPastTitle];
        const timeText = times > 1 ? `${numberToOrdinal(times)} time former` : 'former';
        const titleName = highestPastTitle.charAt(0).toUpperCase() + highestPastTitle.slice(1).replace('Genre', '-Genre');
        let announcement = `The ${timeText} ${titleName} Champion!`;
        if (highestPastTitle === 'undisputed') {
            announcement = `The ${timeText} Undisputed Champion of the World!`;
        }
        segments.push(announcement);
        hasAnyTitle = true;
    }
    
    // Current Titles
    const majorChampInfo = getMajorChampionInfo(name);
    const localChampInfo = getLocalChampionInfo(name);
    if (majorChampInfo) {
        segments.push(`${hasAnyTitle ? 'And the' : 'The'} ${majorChampInfo.speech}`);
        hasAnyTitle = true;
    } else if (localChampInfo) {
        segments.push(`${hasAnyTitle ? 'And the' : 'The'} ${localChampInfo.key.charAt(0).toUpperCase() + localChampInfo.key.slice(1)} Champion!`);
        hasAnyTitle = true;
    }
    
    // Fighter Name
    segments.push(name);
    
    return segments.join('. ');
}


export function announceTaleOfTheTape(fighter1, fighter2) {
    return new Promise(resolve => {
        const fullSpeech = [
            `Ladies and Gentleman, this is the main event of the evening!`,
            buildAnnouncerSpeechForFighter(fighter1, 1),
            buildAnnouncerSpeechForFighter(fighter2, 2),
            "Let's get ready to rumble!"
        ].join('... ');

        let utterThis = new SpeechSynthesisUtterance(fullSpeech);
        
        const announcerVoice = voices.find(v => v.name.includes('Google US English') || v.name.includes('David') || v.name.includes('Zira'));
        if (announcerVoice) {
            utterThis.voice = announcerVoice;
        }
        utterThis.pitch = 0.8;
        utterThis.rate = 0.9;
        
        utterThis.onend = () => {
            resolve();
        };
        utterThis.onerror = (event) => {
            console.error('Speech synthesis error:', event.error);
            resolve(); // Resolve even if there's an error so the fight can start
        };

        // A fallback timeout in case onend never fires (a common browser bug)
        setTimeout(() => {
            resolve();
        }, 20000); // 20-second max for the announcement

        synth.speak(utterThis);
    });
}

