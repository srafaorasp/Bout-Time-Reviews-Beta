import { state, dom } from './state.js';
import * as ThreeFightScene from './three-fight-scene.js';
import { displayFightWinner } from './ui.js';
import { playBellSequence, playSound } from './sound.js';
import { announceTaleOfTheTape } from './tts.js';
import { delay, calculateRawScore, applyBonuses, getWeightClass } from './utils.js';


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

export async function startFight() {
    const fightModal = dom.fightModal.modal;
    if (!fightModal) {
        console.error("Fight modal not found in DOM!");
        return;
    }
    fightModal.classList.remove('hidden');

    await ThreeFightScene.init(state.fighter1, state.fighter2);
    
    ThreeFightScene.clearLog();
    
    let health1 = 100, health2 = 100;
    let stamina1 = 100, stamina2 = 100;

    ThreeFightScene.updateUI(health1, stamina1, health2, stamina2);
    
    const rawScore1 = calculateRawScore(state.fighter1);
    const rawScore2 = calculateRawScore(state.fighter2);
    
    await announceTaleOfTheTape(state.fighter1, state.fighter2);
    await ThreeFightScene.animateTaleOfTheTape(state.fighter1, rawScore1, applyBonuses(rawScore1, state.fighter1), state.fighter2, rawScore2, applyBonuses(rawScore2, state.fighter2));

    await ThreeFightScene.animateFightersToCenter();
    
    let totalPoints1 = 0, totalPoints2 = 0;
    
    let finalRound = 0, fightWinnerName = null, winType = null;
    
    const maxRounds = 6; // Simplified for now

    fightLoop: for(let round = 1; round <= maxRounds; round++){
        finalRound = round; 
        
        await playBellSequence(1);

        for(let turn = 0; turn < 20; turn++){
            const isF1Turn = turn % 2 === 0; 
            
            const attackerStamina = isF1Turn ? stamina1 : stamina2;
            const attackerMods = getStaminaModifiers(attackerStamina);
            const didHit = Math.random() < 0.6 + (attackerMods.hitPenalty * 0.05);

            ThreeFightScene.animatePunch(isF1Turn ? 1 : 2);
            
            if (didHit) { 
                playSound('punch');
                ThreeFightScene.animateHit(isF1Turn ? 2 : 1);
                const damageResult = calculateFinalDamage(isF1Turn ? rawScore1 : rawScore2, attackerStamina, false); 
                
                if (isF1Turn) {
                    health2 -= damageResult.baseDamage;
                } else {
                    health1 -= damageResult.baseDamage;
                }
            } 

            health1 = Math.max(0, health1); 
            health2 = Math.max(0, health2); 
            
            if (isF1Turn) {
                stamina1 = Math.max(0, stamina1 - (didHit ? 2.0 : 3.0));
            } else {
                stamina2 = Math.max(0, stamina2 - (didHit ? 2.0 : 3.0));
            }
            
            ThreeFightScene.updateUI(health1, stamina1, health2, stamina2);
            await delay(dom.center.lowCardCheckbox.checked ? 10 : 250);
            
            if (health1 <= 0) { 
                fightWinnerName = state.fighter2.name; 
                winType = 'KO'; 
                ThreeFightScene.animateKnockdown(1);
                break fightLoop; 
            } else if (health2 <= 0) { 
                fightWinnerName = state.fighter1.name; 
                winType = 'KO'; 
                ThreeFightScene.animateKnockdown(2);
                break fightLoop; 
            }
        }

        if (fightWinnerName) break;
        
        await ThreeFightScene.animateFightersToCorners();
        await delay(3000); // Rest between rounds
        await ThreeFightScene.animateFightersToCenter();
    }

    if (!fightWinnerName) { 
        if (totalPoints1 > totalPoints2) { 
            fightWinnerName = state.fighter1.name; winType = 'TKO'; 
        } else if (totalPoints2 > totalPoints1) { 
            fightWinnerName = state.fighter2.name; winType = 'TKO'; 
        } else { 
            fightWinnerName = 'draw'; winType = 'Draw'; 
        } 
    }
    
    await displayFightWinner(fightWinnerName, winType, finalRound);
}

