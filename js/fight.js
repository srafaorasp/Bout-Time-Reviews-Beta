import { state, dom, punchTypes } from './state.js';
import { displayFightWinner, logFightMessage, updateFightUI, displayInitialFighterTitles, animateTitleBout, updateHitBonusDisplay, getMajorChampionInfo, getLocalChampionInfo, hasAchievedGrandSlam, getTitleInfo } from './ui.js';
import { playBellSequence, playSound, speak } from './sound.js';
import { delay, calculateRawScore } from './utils.js';

// --- CORE CALCULATION LOGIC ---

export function getWeightClass(rawScore) {
    if (rawScore === 0) return 'Unranked';
    if (rawScore < 4.0) return 'Featherweight';
    if (rawScore < 7.0) return 'Cruiserweight';
    if (rawScore >= 7.0) return 'Heavyweight';
    return 'Unranked';
}

export function getChampionshipBonus(fighterObject) {
    if (!fighterObject || !fighterObject.name) return 0;
    const potentialBonuses = [0];
    const name = fighterObject.name;
    if (name === 'Vacant' || (fighterObject.isRetired && !fighterObject.isHallOfFamer)) return 0;

    // Check new Inter-Universe Titles structure
    if (Object.values(state.roster.interUniverseTitles).some(title => title.name === name)) {
        potentialBonuses.push(0.04);
    }
    
    if (name === state.roster.major.undisputed.name) potentialBonuses.push(0.03);
    if (['heavyweight', 'interGenre', 'cruiserweight', 'featherweight'].some(key => state.roster.major[key].name === name)) potentialBonuses.push(0.02);
    if (Object.keys(state.roster.local).some(key => state.roster.local[key].name === name)) potentialBonuses.push(0.01);
    
    const pastTitles = fighterObject.record.pastTitles || {};
    if (Object.keys(pastTitles).some(key => key.startsWith('Inter-Universe Champion'))) {
        potentialBonuses.push(0.03);
    }
    if (pastTitles.undisputed) potentialBonuses.push(0.02);
    if (Object.keys(pastTitles).some(title => ['heavyweight', 'interGenre', 'cruiserweight', 'featherweight'].includes(title))) {
        potentialBonuses.push(0.01);
    }
    return Math.max(...potentialBonuses);
}

export function applyBonuses(rawScore, fighterObject) {
    if (!fighterObject) return 0;
    return rawScore * (1 + getChampionshipBonus(fighterObject));
}

// --- FIGHT SEQUENCE ---

function getStaminaModifiers(stamina) {
    if (stamina >= 75) return { state: 'ENERGIZED', color: 'text-green-400', damageMultiplier: 1.0, hitPenalty: 0, defenseMultiplier: 1.0 };
    if (stamina >= 30) return { state: 'WINDED', color: 'text-yellow-400', damageMultiplier: 0.8, hitPenalty: -1, defenseMultiplier: 0.5 };
    return { state: 'EXHAUSTED', color: 'text-red-500', damageMultiplier: 0.6, hitPenalty: -3, defenseMultiplier: 0 };
}

function calculateFinalDamage(rawScore, attackerStamina, isCritical) { 
    let baseDamage = (rawScore || 1) * (0.75 + (Math.random() * 0.5)); 
    const attackerMods = getStaminaModifiers(attackerStamina);
    baseDamage *= attackerMods.damageMultiplier;
    if (isCritical) { baseDamage *= 2; } 
    return { baseDamage: Math.max(1, baseDamage) }; 
}

function numberToOrdinal(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function logBonusBreakdown(fighterName, fighterColor, rawScore, finalScore, underdogBonus, champBonusValue, goliathDefenseBonus) { 
    let breakdownHTML = `<div class="text-left py-2 border-b border-gray-700"><h4 class="font-bold text-center text-${fighterColor}-400">--- ${fighterName} ---</h4><p>Base Score: <span class="font-semibold">${rawScore.toFixed(2)}</span></p>`; 
    if (champBonusValue > 0) breakdownHTML += `<p class="text-green-400">+${(champBonusValue * 100).toFixed(0)}% Championship Score Bonus</p>`; 
    if (underdogBonus > 0) breakdownHTML += `<p class="text-green-400">+${underdogBonus.toFixed(1)} Underdog Bonus (to hit)</p>`; 
    if (goliathDefenseBonus > 0) breakdownHTML += `<p class="text-blue-300">+${goliathDefenseBonus.toFixed(2)} Goliath Defense Bonus</p>`;
    breakdownHTML += `<p>Final Score: <span class="font-bold text-lg">${finalScore.toFixed(2)}</span></p></div>`; 
    logFightMessage(breakdownHTML); 
}

function buildBoutAnnouncement(maxRounds) { 
    let introText = `Ladies and Gentleman may I have your attention please! This bout is scheduled for ${maxRounds} rounds`; 
    if (state.selectedTitleForFight !== 'none') { 
        let titleName = ''; 
        const titleKey = state.selectedTitleForFight;
        if (state.roster.local[titleKey]) titleName = `the ${titleKey} championship!`; 
        else if (state.roster.major[titleKey]) titleName = `the world ${titleKey.replace('interGenre','inter-genre')} championship!`; 
        else if (titleKey.startsWith('interUniverse--')) titleName = 'the Inter-Universe Championship!';
        introText += ` and is for <span class="title-fanfare">${titleName}</span>`; 
    } 
    return [{text: introText, speech: introText, isEntranceTrigger: false}]; 
}

async function performIntroPunchCombo(fighterIndex) {
    const svg = fighterIndex === 1 ? dom.fightModal.fighter1.svg : dom.fightModal.fighter2.svg;
    const punchClass = fighterIndex === 1 ? 'punching-left' : 'punching-right';
    for (let i = 0; i < 3; i++) {
        playSound('punch');
        const useLeftArm = Math.random() < 0.5;
        svg.classList.add(punchClass, useLeftArm ? 'use-left-arm' : 'use-right-arm');
        await delay(300);
        svg.classList.remove(punchClass, 'use-left-arm', 'use-right-arm');
        await delay(150);
    }
}

async function runSingleTickerSegment(segment, boxerId, fighterIndex) {
     if (state.fightCancellationToken.cancelled) return;
     const boxerSvg = document.getElementById(boxerId);
     if (segment.isEntranceTrigger && boxerSvg) boxerSvg.classList.remove('boxer-offscreen-left', 'boxer-offscreen-right');
     
     if (segment.isNameOfChamp) {
        playSound('crowd_roar', { intensity: segment.champType === 'undisputed' ? 1.0 : ['heavyweight', 'interGenre', 'cruiserweight', 'featherweight'].includes(segment.champType) ? 0.7 : 0.4 });
        performIntroPunchCombo(fighterIndex);
     }

     speak(segment.speech, segment.text.includes('title-fanfare') || segment.isNameOfChamp);
     dom.fightModal.tickerText.classList.remove('scrolling', 'ticker-blink');
     dom.fightModal.tickerText.innerHTML = segment.text;
     
     await delay(50);
     if (state.fightCancellationToken.cancelled) return;

     if (segment.isFlashing) {
         dom.fightModal.tickerText.classList.add('ticker-blink');
         await delay(5000);
         if (state.fightCancellationToken.cancelled) return;
         dom.fightModal.tickerText.classList.remove('ticker-blink');
     } else {
         const scrollSpeed = 160;
         const duration = (dom.fightModal.tickerText.scrollWidth + dom.fightModal.ticker.offsetWidth) / scrollSpeed;
         dom.fightModal.tickerText.style.animationDuration = `${duration}s`;
         dom.fightModal.tickerText.classList.add('scrolling');
         await delay(duration * 1000);
     }
}

async function runTickerIntro(maxRounds, f1, f2) {
    function buildFighterAnnouncement(fighterNum, currentFighter1, currentFighter2) {
        const fighterObject = fighterNum === 1 ? currentFighter1 : currentFighter2;
        const { name, record, devHouse, publisher } = fighterObject;
        const cornerColor = fighterNum === 1 ? 'blue' : 'purple';
        const { tko, ko, losses } = record;
        const rawScore = calculateRawScore(fighterObject);
        const finalScore = applyBonuses(rawScore, fighterObject);
        const recordSpeech = `${tko} wins by TKO, ${ko} knockouts, and ${losses} losses`;
        const recordText = `${tko}-${ko}-${losses}`;
        const segments = [];
        
        const isUnification = state.selectedTitleForFight === 'undisputed';
        const majorChampInfo = getMajorChampionInfo(name, !isUnification); // Pass isDefense flag
        const localChampInfo = getLocalChampionInfo(name);
        
        let scoreText = rawScore.toFixed(2) !== finalScore.toFixed(2) ? `weighing in at ${rawScore.toFixed(2)} score and weighted ${finalScore.toFixed(2)}` : `weighing in at ${rawScore.toFixed(2)} score.`;
        let originString = (devHouse && publisher && devHouse !== publisher) ? `From ${devHouse}, by way of ${publisher}!` : (devHouse ? `From ${devHouse}!` : (publisher ? `From ${publisher}!` : ''));
        const introText = `Introducing, fighting out of the ${cornerColor} corner! ${originString} With a record of ${recordText}, ${scoreText}`;
        const introSpeech = `Introducing, fighting out of the ${cornerColor} corner! ${originString} With a record of ${recordSpeech}, ${scoreText}`;
        
        segments.push({ text: introText, speech: introSpeech });
        
        let champTypeForSound = '';
        let hasAnyTitle = false;

        if (fighterObject.isHallOfFamer) {
            const prefix = hasAnyTitle ? 'And ' : '';
            const announcement = `${prefix}Hall of Famer!`;
            segments.push({text: `<span class="title-fanfare">${announcement}</span>`, speech: announcement, isEntranceTrigger: !hasAnyTitle, isFlashing: true});
            hasAnyTitle = true;
        }

        if (hasAchievedGrandSlam(fighterObject)) {
            const prefix = hasAnyTitle ? 'And ' : '';
            const announcement = `${prefix}Grand Slam Title Winner!`;
            segments.push({text: `<span class="title-fanfare">${announcement}</span>`, speech: announcement, isEntranceTrigger: !hasAnyTitle, isFlashing: true});
            hasAnyTitle = true;
        }

        const pastTitles = fighterObject.record.pastTitles || {};
        const titleRanking = ['undisputed', 'heavyweight', 'interGenre', 'cruiserweight', 'featherweight', ...Object.keys(state.roster.local)];
        let highestPastTitle = null;

        for (const title of titleRanking) {
            if (pastTitles[title]) {
                highestPastTitle = title;
                break;
            }
        }

        if (highestPastTitle) {
            const isFirstAccolade = !hasAnyTitle;
            hasAnyTitle = true;
            const times = pastTitles[highestPastTitle];
            const timeText = times > 1 ? `${numberToOrdinal(times)} time former` : 'former';
            const titleName = highestPastTitle.charAt(0).toUpperCase() + highestPastTitle.slice(1).replace('Genre', '-Genre');
            let announcement = `The ${timeText} ${titleName} Champion!`;
            if (highestPastTitle === 'undisputed') {
                announcement = `The ${timeText} Undisputed Champion of the World!`;
            }
            segments.push({text: `<span class="title-fanfare">${announcement}</span>`, speech: announcement, isEntranceTrigger: isFirstAccolade, isFlashing: true});
        }
        
        if (majorChampInfo) {
            // Don't announce the title if they are defending it (it's already been announced)
            if (state.selectedTitleForFight !== majorChampInfo.type || isUnification) {
                champTypeForSound = majorChampInfo.type;
                const prefix = hasAnyTitle ? 'And the' : 'The';
                const speech = `${prefix} ${majorChampInfo.speech}`;
                segments.push({text: `<span class="title-fanfare">${speech}</span>`, speech: speech, isEntranceTrigger: !hasAnyTitle, champType: majorChampInfo.type, isFlashing: true });
                hasAnyTitle = true;
            }
        } else if (localChampInfo) {
             if (state.selectedTitleForFight !== localChampInfo.key) {
                champTypeForSound = 'local';
                const prefix = hasAnyTitle ? 'And the' : 'The';
                const announcement = `${prefix} ${localChampInfo.key.charAt(0).toUpperCase() + localChampInfo.key.slice(1)} Champion!`;
                segments.push({text: `<span class="title-fanfare">${announcement}</span>`, speech: announcement, isEntranceTrigger: !hasAnyTitle, champType: 'local', isFlashing: true});
                hasAnyTitle = true;
             }
        }

        segments[0].isEntranceTrigger = !hasAnyTitle;
        
        segments.push({text: `<span class="title-fanfare">${name || `Item ${fighterNum}`}</span>`, speech: name || `Item ${fighterNum}`, isNameOfChamp: !!majorChampInfo || !!localChampInfo || !!highestPastTitle, champType: champTypeForSound, isFlashing: true});
        
        return segments;
    }

    dom.fightModal.skipIntroBtn.classList.remove('hidden');
    dom.fightModal.ticker.classList.remove('hidden');
    await playBellSequence(3);
    if (state.fightCancellationToken.cancelled) return;
    for (const segment of buildBoutAnnouncement(maxRounds)) { if (state.fightCancellationToken.cancelled) break; await runSingleTickerSegment(segment, null, 0); }
    if (!state.fightCancellationToken.cancelled) for (const segment of buildFighterAnnouncement(1, f1, f2)) { if (state.fightCancellationToken.cancelled) break; await runSingleTickerSegment(segment, 'fighter1-svg', 1); }
    if (!state.fightCancellationToken.cancelled) for (const segment of buildFighterAnnouncement(2, f1, f2)) { if (state.fightCancellationToken.cancelled) break; await runSingleTickerSegment(segment, 'fighter2-svg', 2); }
    dom.fightModal.skipIntroBtn.classList.add('hidden'); dom.fightModal.ticker.classList.add('hidden');
}


export async function startFight() {
    state.fightCancellationToken.cancelled = false;
    dom.fightModal.returnBtn.classList.add('hidden');
    dom.fightModal.referee.classList.remove('ref-visible', 'ref-counting', 'ref-start-fight');
    dom.fightModal.log.innerHTML = ''; 
    dom.fightModal.roundCounter.textContent = ''; 
    dom.fightModal.turnCounter.textContent = '';
    dom.fightModal.titleBoutDisplay.innerHTML = '';
    dom.fightModal.titleWinAnnouncement.className = '';
    dom.fightModal.titleWinAnnouncement.textContent = '';

    const refIcon = document.getElementById('ref-title-icon');
    refIcon.style.display = 'none'; 
    
    if (state.selectedTitleForFight !== 'none') {
        const titleKey = state.selectedTitleForFight;
        const titleObject = getTitleInfo(titleKey); // Use the new centralized function

        if (titleObject && titleObject.symbol) {
            refIcon.textContent = titleObject.symbol;
            refIcon.style.display = 'block';
        }
    }

    dom.fightModal.boxScoreContainer.innerHTML = `
        <table class="box-score-table">
            <thead><tr id="box-score-header"><th class="w-1/3">Fighter</th><th class="box-score-total">Total</th></tr></thead>
            <tbody>
                <tr id="box-score-fighter1"><td class="font-bold text-blue-400 truncate">${state.fighter1.name || 'Fighter 1'}</td><td id="total-score-1" class="box-score-total">0</td></tr>
                <tr id="box-score-fighter2"><td class="font-bold text-purple-400 truncate">${state.fighter2.name || 'Fighter 2'}</td><td id="total-score-2" class="box-score-total">0</td></tr>
            </tbody>
        </table>`;

    dom.fightModal.fighter1.svg.classList.remove('knocked-down-left');
    dom.fightModal.fighter2.svg.classList.remove('knocked-down-right');
    
    let health1 = 100, health2 = 100;
    let stamina1 = 100, stamina2 = 100;
    let totalPoints1 = 0, totalPoints2 = 0;
    let lastStaminaState1 = '', lastStaminaState2 = '';

    updateFightUI(health1, stamina1, health2, stamina2);
    dom.fightModal.modal.classList.remove('hidden');
    dom.fightModal.fighter1.name.textContent = state.fighter1.name || 'Item 1';
    dom.fightModal.fighter2.name.textContent = state.fighter2.name || 'Item 2';
    displayInitialFighterTitles();
    dom.fightModal.fighter1.svg.classList.add('boxer-offscreen-left'); dom.fightModal.fighter2.svg.classList.add('boxer-offscreen-right');
    dom.fightModal.fighter1.svg.style.visibility = 'visible'; dom.fightModal.fighter2.svg.style.visibility = 'visible';
    
    // Correctly calculate maxRounds using the robust logic.
    const isTitleMatch = state.selectedTitleForFight !== 'none';
    let maxRounds = 6;
    if (isTitleMatch && !dom.center.lowCardCheckbox.checked) {
        if (state.selectedTitleForFight.startsWith('interUniverse--')) {
            maxRounds = 15;
        } else if (state.selectedTitleForFight === 'undisputed') {
            maxRounds = 12;
        } else if (state.roster.major[state.selectedTitleForFight]) {
            maxRounds = 10;
        } else if (state.roster.local[state.selectedTitleForFight]) {
            maxRounds = 8;
        }
    }
    
    const rawScore1 = calculateRawScore(state.fighter1), rawScore2 = calculateRawScore(state.fighter2); 
    let finalRound = 0, fightWinnerName = null, winType = null;
    const champBonusVal1 = getChampionshipBonus(state.fighter1), champBonusVal2 = getChampionshipBonus(state.fighter2); 
    
    let underdogBonus1 = 0, underdogBonus2 = 0;
    let goliathDefenseBonus1 = 0, goliathDefenseBonus2 = 0;
    const goliathThreshold = 4.0;
    const scoreDifference = rawScore2 - rawScore1;
    const absScoreDifference = Math.abs(scoreDifference);

    if (scoreDifference > 1) underdogBonus1 = Math.sqrt(Math.min(scoreDifference, goliathThreshold)); 
    else if (scoreDifference < -1) underdogBonus2 = Math.sqrt(Math.min(absScoreDifference, goliathThreshold)); 

    if (absScoreDifference >= goliathThreshold) {
        const scalingFactor = absScoreDifference - goliathThreshold;
        if (rawScore1 < rawScore2) goliathDefenseBonus1 = scalingFactor; 
        else goliathDefenseBonus2 = scalingFactor;
    }

    updateHitBonusDisplay(underdogBonus1, underdogBonus2);

    async function handleKnockdown(fighterId) {
        const isFighter1 = fighterId === 1;
        const downedFighterSvg = isFighter1 ? dom.fightModal.fighter1.svg : dom.fightModal.fighter2.svg;
        const knockdownClass = isFighter1 ? 'knocked-down-left' : 'knocked-down-right';
        const standingFighterSvg = isFighter1 ? dom.fightModal.fighter2.svg : dom.fightModal.fighter1.svg;
        const standingFighterStamina = isFighter1 ? stamina2 : stamina1;
        
        dom.fightModal.referee.classList.add('ref-visible', 'ref-counting');
        standingFighterSvg.style.opacity = '0.3';
        playSound('crowd_roar', { intensity: 1.0 });

        const fighterName = isFighter1 ? state.fighter1.name || "Fighter 1" : state.fighter2.name || "Fighter 2";
        downedFighterSvg.classList.add(knockdownClass);
        logFightMessage(`<p class="text-red-500 font-bold">${fighterName} is DOWN!</p>`);
        
        for (let count = 1; count <= 10; count++) {
            playSound('count_tick');
            await delay(dom.fightModal.disableDelayCheckbox.checked ? 100 : 1000);
            logFightMessage(`<p class="text-yellow-400 font-bold">...${count}...</p>`);

            const stamina = isFighter1 ? stamina1 : stamina2;
            const staminaMods = getStaminaModifiers(stamina);
            let getUpChance = 0.1 + (stamina / 200); 
            if (staminaMods.state === 'EXHAUSTED') getUpChance *= 0.5;

            if (Math.random() < getUpChance) {
                const baseHeal = 5, maxHeal = 25;
                const recoveredHealth = baseHeal + (maxHeal - baseHeal) * (stamina / 100);
                
                if (isFighter1) health1 = Math.max(health1, recoveredHealth);
                else health2 = Math.max(health2, recoveredHealth);
               
                logFightMessage(`<p class="text-green-400 font-bold">${fighterName} beats the count and recovers to ${recoveredHealth.toFixed(1)} health!</p>`);
                downedFighterSvg.classList.remove(knockdownClass);
                dom.fightModal.referee.classList.remove('ref-counting', 'ref-visible');
                await delay(dom.fightModal.disableDelayCheckbox.checked ? 500 : 5000);
                
                const standingHeal = 2.5 + (standingFighterStamina / 100) * 5;
                if(isFighter1) {
                    health2 = Math.min(100, health2 + standingHeal);
                    stamina2 = Math.min(100, stamina2 + standingHeal * 2);
                } else {
                    health1 = Math.min(100, health1 + standingHeal);
                    stamina1 = Math.min(100, stamina1 + standingHeal * 2);
                }
                logFightMessage(`<p class="text-cyan-400 text-xs">${isFighter1 ? state.fighter2.name : state.fighter1.name} recovers while the opponent is down!</p>`);

                standingFighterSvg.style.opacity = '1';
                updateFightUI(health1, stamina1, health2, stamina2);
                return { fightOver: false };
            }
        }
        logFightMessage(`<p class="text-red-500 font-bold">${fighterName} is OUT! It's a knockout!</p>`);
        standingFighterSvg.style.opacity = '1';
        await delay(1000);
        return { fightOver: true };
    }

    if (dom.center.skipTickerCheckbox.checked) { 
        dom.fightModal.fighter1.svg.classList.remove('boxer-offscreen-left'); 
        dom.fightModal.fighter2.svg.classList.remove('boxer-offscreen-right'); 
    } else { 
        await runTickerIntro(maxRounds, state.fighter1, state.fighter2); 
        if (!state.fightCancellationToken.cancelled) await animateTitleBout(); 
    }
    
    dom.fightModal.referee.classList.add('ref-visible', 'ref-start-fight');
    dom.fightModal.roundCounter.textContent = "FIGHT!";
    
    if (state.selectedTitleForFight !== 'none' && !dom.fightModal.disableDelayCheckbox.checked) {
        await delay(7000);
    }

    if (state.fightCancellationToken.cancelled) {
        dom.fightModal.modal.classList.add('hidden');
        return;
    }
    
    await playBellSequence(2);
    dom.fightModal.referee.classList.remove('ref-start-fight');
    refIcon.style.display = 'none';

    logFightMessage('<p class="text-amber-400 font-bold underline text-center pb-2">TALE OF THE TAPE</p>'); 
    logBonusBreakdown(dom.fightModal.fighter1.name.textContent, 'blue', rawScore1, state.score1, underdogBonus1, champBonusVal1, goliathDefenseBonus1); 
    logBonusBreakdown(dom.fightModal.fighter2.name.textContent, 'purple', rawScore2, state.score2, underdogBonus2, champBonusVal2, goliathDefenseBonus2); 
    
    let topRankBonus = (state.score1 >= 7 && state.score2 >= 7) ? 3 : 0; 
    if(topRankBonus > 0) logFightMessage(`<p class="text-cyan-400 font-bold text-center py-2 border-y border-gray-700">Top Rank Pacing Active!</p>`); 
    await delay(dom.fightModal.disableDelayCheckbox.checked ? 1000 : 5000);
    
    fightLoop: for(let round = 1; round <= maxRounds; round++){
        finalRound = round; 
        let pointsThisRound1 = 0, pointsThisRound2 = 0;
        let knockdownsThisRound1 = 0, knockdownsThisRound2 = 0;
        let totalKnockdowns1 = 0, totalKnockdowns2 = 0;
        let damageThisRound1 = 0, damageThisRound2 = 0;
        
        dom.fightModal.roundCounter.textContent = `Round ${round}/${maxRounds}`;
        dom.fightModal.referee.classList.remove('ref-visible');
        if(round > 1) await playBellSequence(1);

        for(let turn = 0; turn < 20; turn++){
            if(state.fightCancellationToken.cancelled) break fightLoop;
            dom.fightModal.turnCounter.textContent = `${20-turn} turns left`; 
            const isF1Turn = turn % 2 === 0; 
            
            const attackerStamina = isF1Turn ? stamina1 : stamina2;
            const defenderStamina = isF1Turn ? stamina2 : stamina1;
            const attackerMods = getStaminaModifiers(attackerStamina);
            const defenderMods = getStaminaModifiers(defenderStamina);

            const finalToHit = Math.ceil(Math.random() * 10) + (isF1Turn ? underdogBonus1 : underdogBonus2) + topRankBonus + attackerMods.hitPenalty; 
            
            const puncherSvg = isF1Turn ? dom.fightModal.fighter1.svg : dom.fightModal.fighter2.svg; 
            const targetSvg = isF1Turn ? dom.fightModal.fighter2.svg : dom.fightModal.fighter1.svg; 
            const punchClass = isF1Turn ? 'punching-left' : 'punching-right'; 
            const punchName = isF1Turn ? dom.fightModal.fighter1.name.textContent : dom.fightModal.fighter2.name.textContent; 
            const punchColor = isF1Turn ? 'text-blue-400' : 'text-purple-400'; 
            const didHit = isF1Turn ? finalToHit >= (state.score2 + goliathDefenseBonus2) : finalToHit >= (state.score1 + goliathDefenseBonus1);
            
            if(isF1Turn) stamina1 = Math.max(0, stamina1 - (didHit ? 2.0 : 3.0));
            else stamina2 = Math.max(0, stamina2 - (didHit ? 2.0 : 3.0));

            const useLeftArm = Math.random() < 0.5;
            puncherSvg.classList.add(punchClass, useLeftArm ? 'use-left-arm' : 'use-right-arm');
            setTimeout(()=> puncherSvg.classList.remove(punchClass, 'use-left-arm', 'use-right-arm'), 300);

            if (didHit) { 
                playSound('punch');
                if (isF1Turn) pointsThisRound1++; else pointsThisRound2++; 
                const isCritical = Math.random() <= 0.15;
                const damageResult = calculateFinalDamage(isF1Turn ? rawScore1 : rawScore2, attackerStamina, isCritical); 
                
                const damageReduction = (defenderStamina / 100) * 0.3 * defenderMods.defenseMultiplier;
                let finalDamage = damageResult.baseDamage * (1 - damageReduction);

                if (isCritical) {
                    playSound('crowd_roar', {intensity: 0.7});
                    logFightMessage(`<p class="text-amber-300 font-bold">CRITICAL HIT!</p>`);
                    if(isF1Turn) stamina1 = Math.max(0, stamina1 - 2.5);
                    else stamina2 = Math.max(0, stamina2 - 2.5);
                }
                if (isF1Turn) {
                    health2 -= finalDamage;
                    stamina2 = Math.max(0, stamina2 - (finalDamage / 10));
                    damageThisRound2 += finalDamage;
                } else {
                    health1 -= finalDamage;
                    stamina1 = Math.max(0, stamina1 - (finalDamage / 10));
                    damageThisRound1 += finalDamage;
                }
                const punchType = punchTypes[Math.floor(Math.random() * punchTypes.length)];
                logFightMessage(`<p class="${punchColor}">${punchName} lands a ${punchType} for ${finalDamage.toFixed(1)} damage! (Roll: ${finalToHit.toFixed(1)})</p>`); 
                targetSvg.classList.add('hit-flash'); 
            } 
            else { logFightMessage(`<p>${punchName} misses! (Roll: ${finalToHit.toFixed(1)})</p>`); }

            health1 = Math.max(0, health1); health2 = Math.max(0, health2); 
            
            const currentStaminaState1 = getStaminaModifiers(stamina1).state;
            if (currentStaminaState1 !== lastStaminaState1 && currentStaminaState1 !== 'ENERGIZED') {
                logFightMessage(`<p class="${getStaminaModifiers(stamina1).color} font-semibold">${state.fighter1.name} is ${currentStaminaState1}!</p>`);
                lastStaminaState1 = currentStaminaState1;
            }
            const currentStaminaState2 = getStaminaModifiers(stamina2).state;
            if (currentStaminaState2 !== lastStaminaState2 && currentStaminaState2 !== 'ENERGIZED') {
                logFightMessage(`<p class="${getStaminaModifiers(stamina2).color} font-semibold">${state.fighter2.name} is ${currentStaminaState2}!</p>`);
                lastStaminaState2 = currentStaminaState2;
            }

            updateFightUI(health1, stamina1, health2, stamina2); 
            await delay(dom.fightModal.disableDelayCheckbox.checked ? 10 : 500);
            
            if (health1 <= 0) { 
                knockdownsThisRound1++; totalKnockdowns1++;
                const res = await handleKnockdown(1); 
                if (res.fightOver || totalKnockdowns1 >= 3) { 
                    fightWinnerName = state.fighter2.name; winType = 'KO'; break fightLoop; 
                } 
            } else if (health2 <= 0) { 
                knockdownsThisRound2++; totalKnockdowns2++;
                const res = await handleKnockdown(2); 
                if (res.fightOver || totalKnockdowns2 >= 3) { 
                    fightWinnerName = state.fighter1.name; winType = 'KO'; break fightLoop; 
                } 
            }
        }

        if (fightWinnerName) break;

        let roundScore1 = (pointsThisRound1 > pointsThisRound2) ? 10 : (pointsThisRound2 > pointsThisRound1) ? 9 : 10;
        let roundScore2 = (pointsThisRound2 > pointsThisRound1) ? 10 : (pointsThisRound1 > pointsThisRound2) ? 9 : 10;
        roundScore1 -= knockdownsThisRound1;
        roundScore2 -= knockdownsThisRound2;
        totalPoints1 += roundScore1;
        totalPoints2 += roundScore2;
        
        document.getElementById('box-score-header').lastElementChild.insertAdjacentHTML('beforebegin', `<th>R${round}</th>`);
        document.getElementById('box-score-fighter1').lastElementChild.insertAdjacentHTML('beforebegin', `<td>${roundScore1}</td>`);
        document.getElementById('box-score-fighter2').lastElementChild.insertAdjacentHTML('beforebegin', `<td>${roundScore2}</td>`);
        document.getElementById('total-score-1').textContent = totalPoints1;
        document.getElementById('total-score-2').textContent = totalPoints2;
        
        await playBellSequence(1);
        logFightMessage(`<p class="text-green-400 mt-2">End of Round ${round}. Recovery phase!</p>`);
        if(round < maxRounds) {
            const healPercentage1 = 0.10 + (stamina1 / 100) * 0.65;
            const healPercentage2 = 0.10 + (stamina2 / 100) * 0.65;
            
            const potentialHeal1 = damageThisRound1 * healPercentage1;
            const potentialHeal2 = damageThisRound2 * healPercentage2;

            const finalHeal1 = Math.min(potentialHeal1, damageThisRound1 * 0.9);
            const finalHeal2 = Math.min(potentialHeal2, damageThisRound2 * 0.9);

            health1 = Math.min(100, health1 + finalHeal1);
            health2 = Math.min(100, health2 + finalHeal2);
            
            const roundFatigueFactor = round * 2.5;
            const baseStaminaRecovery = 40;
            stamina1 = Math.min(100, stamina1 + Math.max(5, baseStaminaRecovery - roundFatigueFactor));
            stamina2 = Math.min(100, stamina2 + Math.max(5, baseStaminaRecovery - roundFatigueFactor));

            logFightMessage(`<p class="text-green-400">${dom.fightModal.fighter1.name.textContent} recovers ${finalHeal1.toFixed(1)} health!</p>`);
            logFightMessage(`<p class="text-green-400">${dom.fightModal.fighter2.name.textContent} recovers ${finalHeal2.toFixed(1)} health!</p>`);

            updateFightUI(health1, stamina1, health2, stamina2);
            await delay(dom.fightModal.disableDelayCheckbox.checked ? 2000 : 10000);
        }
    }

    if (!fightWinnerName) { 
        logFightMessage(`<p class="text-yellow-400 font-bold text-center py-2 border-y border-gray-700">WE GO TO THE JUDGES' SCORECARDS!</p><p class="text-blue-400">${dom.fightModal.fighter1.name.textContent}: ${totalPoints1} points</p><p class="text-purple-400">${dom.fightModal.fighter2.name.textContent}: ${totalPoints2} points</p>`); 
        await delay(2000); 
        if (totalPoints1 > totalPoints2) { 
            fightWinnerName = state.fighter1.name; winType = 'TKO'; 
        } else if (totalPoints2 > totalPoints1) { 
            fightWinnerName = state.fighter2.name; winType = 'TKO'; 
        } else { 
            fightWinnerName = 'draw'; winType = 'Draw'; 
        } 
    }
    
    if (!state.fightCancellationToken.cancelled) {
      await displayFightWinner(fightWinnerName, winType, finalRound);
    }
}

