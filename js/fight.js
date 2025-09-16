import { state, dom, punchTypes } from './state.js';
import { updateFightUI, displayFightWinner, logFightMessage } from './ui.js';
import { playBellSequence, playSound, speak } from './sound.js';
import { delay } from './utils.js';

// --- CORE CALCULATION LOGIC ---

export function getWeightClass(rawScore) {
    if (rawScore === 0) return 'Unranked';
    if (rawScore < 4.0) return 'Featherweight';
    if (rawScore < 7.0) return 'Cruiserweight';
    if (rawScore >= 7.0) return 'Heavyweight';
    return 'Unranked';
}

export function getChampionshipBonus(fighterObject) {
    const potentialBonuses = [0];
    const name = fighterObject.name;
    if (!name || name === 'Vacant' || (fighterObject.isRetired && !fighterObject.isHallOfFamer)) return 0;

    if (name === state.roster.major.undisputed.name) potentialBonuses.push(0.03);
    if (['heavyweight', 'interGenre', 'cruiserweight', 'featherweight'].some(key => name === state.roster.major[key].name)) potentialBonuses.push(0.02);
    if (Object.keys(state.roster.local).some(key => state.roster.local[key].name === name)) potentialBonuses.push(0.01);
    
    const pastTitles = fighterObject.record.pastTitles || {};
    if (pastTitles.undisputed) potentialBonuses.push(0.02);
    if (Object.keys(pastTitles).some(title => ['heavyweight', 'interGenre', 'cruiserweight', 'featherweight'].includes(title))) {
        potentialBonuses.push(0.01);
    }
    return Math.max(...potentialBonuses);
}

export function calculateRawScore(fighterObject) {
    const metacriticInput = fighterObject.scores.metacritic;
    const metacriticScore = (metacriticInput !== '404' && metacriticInput) ? parseFloat(metacriticInput) / 10.0 : 0;
    let totalScore = 0, weightCount = 0;

    if (fighterObject.steamData) {
        const steamReviewData = fighterObject.steamData;
        const communityScore = (steamReviewData.total_reviews > 0) ? (steamReviewData.total_positive / steamReviewData.total_reviews) * 10 : 0;
        
        if (communityScore > 0) {
            totalScore += communityScore * 0.70;
            weightCount += 0.70;
        }
        if (metacriticScore > 0) {
            totalScore += metacriticScore * 0.30;
            weightCount += 0.30;
        }
    }
    return weightCount > 0 ? totalScore / weightCount : 0;
}

export function applyBonuses(rawScore, fighterObject) {
    return rawScore * (1 + getChampionshipBonus(fighterObject));
}

// --- FIGHT SEQUENCE ---
export async function startFight() {
    // ... (The entire startFight function and its helpers will be moved here)
    // This is a large function, so it's kept in its own section.
}

