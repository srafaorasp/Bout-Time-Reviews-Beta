import { state, dom, punchTypes } from './state.js';
import { displayFightWinner, getTitleInfo } from './ui.js';
import * as threeScene from './three-fight-scene.js';
import { playBellSequence, playSound, speak } from './sound.js';
import { delay, calculateRawScore } from './utils.js';

// --- CORE CALCULATION LOGIC ---

export function getWeightClass(rawScore) {
    if (rawScore < 4.0) return 'Unranked';       // Scores below 4.0 are now Unranked
    if (rawScore < 6.0) return 'Featherweight';  // Range: 4.0 to 5.99
    if (rawScore < 8.0) return 'Cruiserweight';  // Range: 6.0 to 7.99
    if (rawScore >= 8.0) return 'Heavyweight';   // Range: 8.0 and above
    return 'Unranked'; // Fallback for any edge cases
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
    threeScene.logFightMessage(breakdownHTML); 
}

async function runTickerIntro(maxRounds, f1, f2) {
    // This intro sequence is very tied to the old modal and would require a
    // significant redesign for the 3D overlay. For now, we will skip it
    // in the 3D version to focus on the core fight animation.
    // A simpler text-based intro could be implemented here using threeScene.logFightMessage.
    console.log("Skipping ticker intro for 3D fight.");
    return;
}


export async function startFight() {
    state.fightCancellationToken.cancelled = false;
    dom.fightModal.returnBtn.classList.add('hidden');
    threeScene.init(dom.fightModal.canvasContainer, dom.fightModal);
    threeScene.clearLog();
    threeScene.resetFighters();
    
    let health1 = 100, health2 = 100;
    let stamina1 = 100, stamina2 = 100;
    let totalPoints1 = 0, totalPoints2 = 0;
    let lastStaminaState1 = '', lastStaminaState2 = '';
    
    dom.fightModal.modal.classList.remove('hidden');

    threeScene.updateUI({
        name1: state.fighter1.name || 'Fighter 1',
        name2: state.fighter2.name || 'Fighter 2',
        health1, stamina1, health2, stamina2
    });
    
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


    async function handleKnockdown(fighterId) {
        const isFighter1 = fighterId === 1;
        
        playSound('crowd_roar', { intensity: 1.0 });
        await threeScene.playKnockdownAnimation(fighterId);

        const fighterName = isFighter1 ? state.fighter1.name || "Fighter 1" : state.fighter2.name || "Fighter 2";
        threeScene.logFightMessage(`<p class="text-red-500 font-bold">${fighterName} is DOWN!</p>`);
        
        for (let count = 1; count <= 10; count++) {
            playSound('count_tick');
            await delay(dom.fightModal.disableDelayCheckbox.checked ? 100 : 1000);
            threeScene.logFightMessage(`<p class="text-yellow-400 font-bold">...${count}...</p>`);

            const stamina = isFighter1 ? stamina1 : stamina2;
            const staminaMods = getStaminaModifiers(stamina);
            let getUpChance = 0.1 + (stamina / 200); 
            if (staminaMods.state === 'EXHAUSTED') getUpChance *= 0.5;

            if (Math.random() < getUpChance) {
                const baseHeal = 5, maxHeal = 25;
                const recoveredHealth = baseHeal + (maxHeal - baseHeal) * (stamina / 100);
                
                if (isFighter1) health1 = Math.max(health1, recoveredHealth);
                else health2 = Math.max(health2, recoveredHealth);
               
                threeScene.logFightMessage(`<p class="text-green-400 font-bold">${fighterName} beats the count and recovers to ${recoveredHealth.toFixed(1)} health!</p>`);
                threeScene.resetFighters();
                await delay(dom.fightModal.disableDelayCheckbox.checked ? 500 : 2000);
                
                const standingHeal = 2.5 + ((isFighter1 ? stamina2 : stamina1) / 100) * 5;
                if(isFighter1) {
                    health2 = Math.min(100, health2 + standingHeal);
                    stamina2 = Math.min(100, stamina2 + standingHeal * 2);
                } else {
                    health1 = Math.min(100, health1 + standingHeal);
                    stamina1 = Math.min(100, stamina1 + standingHeal * 2);
                }
                threeScene.logFightMessage(`<p class="text-cyan-400 text-xs">${isFighter1 ? state.fighter2.name : state.fighter1.name} recovers while the opponent is down!</p>`);
                
                threeScene.updateUI({ health1, stamina1, health2, stamina2, name1: state.fighter1.name, name2: state.fighter2.name });
                return { fightOver: false };
            }
        }
        threeScene.logFightMessage(`<p class="text-red-500 font-bold">${fighterName} is OUT! It's a knockout!</p>`);
        await delay(1000);
        return { fightOver: true };
    }

    if (dom.center.skipTickerCheckbox.checked) { 
       console.log("Skipping intro");
    } else { 
        await runTickerIntro(maxRounds, state.fighter1, state.fighter2); 
    }
    
    threeScene.setRoundDisplay("FIGHT!");
    
    if (state.fightCancellationToken.cancelled) {
        dom.fightModal.modal.classList.add('hidden');
        return;
    }
    
    await playBellSequence(2);

    threeScene.logFightMessage('<p class="text-amber-400 font-bold underline text-center pb-2">TALE OF THE TAPE</p>'); 
    logBonusBreakdown(state.fighter1.name, 'blue', rawScore1, state.score1, underdogBonus1, champBonusVal1, goliathDefenseBonus1); 
    logBonusBreakdown(state.fighter2.name, 'purple', rawScore2, state.score2, underdogBonus2, champBonusVal2, goliathDefenseBonus2); 
    
    let topRankBonus = (state.score1 >= 7 && state.score2 >= 7) ? 3 : 0; 
    if(topRankBonus > 0) threeScene.logFightMessage(`<p class="text-cyan-400 font-bold text-center py-2 border-y border-gray-700">Top Rank Pacing Active!</p>`); 
    await delay(dom.fightModal.disableDelayCheckbox.checked ? 1000 : 5000);
    
    fightLoop: for(let round = 1; round <= maxRounds; round++){
        finalRound = round; 
        let pointsThisRound1 = 0, pointsThisRound2 = 0;
        let knockdownsThisRound1 = 0, knockdownsThisRound2 = 0;
        let totalKnockdowns1 = 0, totalKnockdowns2 = 0;
        let damageThisRound1 = 0, damageThisRound2 = 0;
        
        threeScene.setRoundDisplay(`Round ${round}/${maxRounds}`);
        if(round > 1) await playBellSequence(1);

        for(let turn = 0; turn < 20; turn++){
            if(state.fightCancellationToken.cancelled) break fightLoop;
            
            const attackerIndex = turn % 2 === 0 ? 1 : 2;
            const defenderIndex = turn % 2 === 0 ? 2 : 1;
            
            const attackerStamina = attackerIndex === 1 ? stamina1 : stamina2;
            const defenderStamina = attackerIndex === 1 ? stamina2 : stamina1;
            const attackerMods = getStaminaModifiers(attackerStamina);

            const finalToHit = Math.ceil(Math.random() * 10) + (attackerIndex === 1 ? underdogBonus1 : underdogBonus2) + topRankBonus + attackerMods.hitPenalty; 
            
            const punchName = attackerIndex === 1 ? state.fighter1.name : state.fighter2.name; 
            const punchColor = attackerIndex === 1 ? 'text-blue-400' : 'text-purple-400'; 
            const didHit = attackerIndex === 1 ? finalToHit >= (state.score2 + goliathDefenseBonus2) : finalToHit >= (state.score1 + goliathDefenseBonus1);
            
            if(attackerIndex === 1) stamina1 = Math.max(0, stamina1 - (didHit ? 2.0 : 3.0));
            else stamina2 = Math.max(0, stamina2 - (didHit ? 2.0 : 3.0));

            await threeScene.playPunchAnimation(attackerIndex);

            if (didHit) { 
                playSound('punch');
                await threeScene.playHitAnimation(defenderIndex);

                if (attackerIndex === 1) pointsThisRound1++; else pointsThisRound2++; 
                const isCritical = Math.random() <= 0.15;
                const damageResult = calculateFinalDamage(attackerIndex === 1 ? rawScore1 : rawScore2, attackerStamina, isCritical); 
                
                const damageReduction = (defenderStamina / 100) * 0.3 * getStaminaModifiers(defenderStamina).defenseMultiplier;
                let finalDamage = damageResult.baseDamage * (1 - damageReduction);

                if (isCritical) {
                    playSound('crowd_roar', {intensity: 0.7});
                    threeScene.logFightMessage(`<p class="text-amber-300 font-bold">CRITICAL HIT!</p>`);
                    if(attackerIndex === 1) stamina1 = Math.max(0, stamina1 - 2.5);
                    else stamina2 = Math.max(0, stamina2 - 2.5);
                }
                if (attackerIndex === 1) {
                    health2 -= finalDamage;
                    stamina2 = Math.max(0, stamina2 - (finalDamage / 10));
                    damageThisRound2 += finalDamage;
                } else {
                    health1 -= finalDamage;
                    stamina1 = Math.max(0, stamina1 - (finalDamage / 10));
                    damageThisRound1 += finalDamage;
                }
                const punchType = punchTypes[Math.floor(Math.random() * punchTypes.length)];
                threeScene.logFightMessage(`<p class="${punchColor}">${punchName} lands a ${punchType} for ${finalDamage.toFixed(1)} damage! (Roll: ${finalToHit.toFixed(1)})</p>`); 
            } 
            else { threeScene.logFightMessage(`<p>${punchName} misses! (Roll: ${finalToHit.toFixed(1)})</p>`); }

            health1 = Math.max(0, health1); health2 = Math.max(0, health2); 
            
            const currentStaminaState1 = getStaminaModifiers(stamina1).state;
            if (currentStaminaState1 !== lastStaminaState1 && currentStaminaState1 !== 'ENERGIZED') {
                threeScene.logFightMessage(`<p class="${getStaminaModifiers(stamina1).color} font-semibold">${state.fighter1.name} is ${currentStaminaState1}!</p>`);
                lastStaminaState1 = currentStaminaState1;
            }
            const currentStaminaState2 = getStaminaModifiers(stamina2).state;
            if (currentStaminaState2 !== lastStaminaState2 && currentStaminaState2 !== 'ENERGIZED') {
                threeScene.logFightMessage(`<p class="${getStaminaModifiers(stamina2).color} font-semibold">${state.fighter2.name} is ${currentStaminaState2}!</p>`);
                lastStaminaState2 = currentStaminaState2;
            }

            threeScene.updateUI({ health1, stamina1, health2, stamina2, name1: state.fighter1.name, name2: state.fighter2.name }); 
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
        
        await playBellSequence(1);
        threeScene.logFightMessage(`<p class="text-green-400 mt-2">End of Round ${round}. Recovery phase!</p>`);
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

            threeScene.logFightMessage(`<p class="text-green-400">${state.fighter1.name} recovers ${finalHeal1.toFixed(1)} health!</p>`);
            threeScene.logFightMessage(`<p class="text-green-400">${state.fighter2.name} recovers ${finalHeal2.toFixed(1)} health!</p>`);

            threeScene.updateUI({ health1, stamina1, health2, stamina2, name1: state.fighter1.name, name2: state.fighter2.name });
            await delay(dom.fightModal.disableDelayCheckbox.checked ? 2000 : 10000);
        }
    }

    if (!fightWinnerName) { 
        threeScene.logFightMessage(`<p class="text-yellow-400 font-bold text-center py-2 border-y border-gray-700">WE GO TO THE JUDGES' SCORECARDS!</p><p class="text-blue-400">${state.fighter1.name}: ${totalPoints1} points</p><p class="text-purple-400">${state.fighter2.name}: ${totalPoints2} points</p>`); 
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
      if (fightWinnerName === state.fighter1.name) threeScene.showWinner(1);
      if (fightWinnerName === state.fighter2.name) threeScene.showWinner(2);
      await displayFightWinner(fightWinnerName, winType, finalRound);
    }
}

