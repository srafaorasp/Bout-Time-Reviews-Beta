import { state, dom, createNewFighter, updateFighterInUniverse, saveUniverseToLocalStorage, GENRE_SYMBOLS, PAST_TITLE_SYMBOLS, GRAND_SLAM_SYMBOL, HALL_OF_FAME_SYMBOL, addFighterToUniverse, loadRoster, updateTimestamp, setSelectedTitle } from './state.js';
import { calculateRawScore, applyBonuses, getWeightClass } from './fight.js';
import { downloadJSON } from './utils.js';
import { fetchWithProxyRotation, STEAMSPY_API_URL } from './api.js';

// --- UI & DISPLAY FUNCTIONS ---

// This function determines the text and color for the stamina state.
// It's duplicated here from fight.js to avoid circular module dependencies.
function getStaminaModifiers(stamina) {
    if (stamina >= 75) return { state: 'ENERGIZED', color: 'text-green-400' };
    if (stamina >= 30) return { state: 'WINDED', color: 'text-yellow-400' };
    return { state: 'EXHAUSTED', color: 'text-red-500' };
}


export function showToast(message, duration = 5000) {
    const toast = dom.toast;
    if (!toast || !toast.container || !toast.message) return;
    toast.message.textContent = message;
    toast.container.classList.remove('hidden');
    toast.container.classList.add('opacity-100');
    
    setTimeout(() => {
        toast.container.classList.remove('opacity-100');
        setTimeout(() => toast.container.classList.add('hidden'), 300);
    }, duration);
}

export function showConfirmationModal(title, message) {
    return new Promise((resolve) => {
        const modal = dom.confirmationModal;
        modal.title.textContent = title;
        modal.message.textContent = message;

        const confirmHandler = () => {
            modal.modal.classList.add('hidden');
            cleanup();
            resolve(true);
        };

        const cancelHandler = () => {
            modal.modal.classList.add('hidden');
            cleanup();
            resolve(false);
        };
        
        const cleanup = () => {
            modal.confirmBtn.removeEventListener('click', confirmHandler);
            modal.cancelBtn.removeEventListener('click', cancelHandler);
        };

        modal.confirmBtn.addEventListener('click', confirmHandler, { once: true });
        modal.cancelBtn.addEventListener('click', cancelHandler, { once: true });

        modal.modal.classList.remove('hidden');
    });
}

export function updateUIAfterFetch(cardPrefix) {
    const card = (cardPrefix === 'item1') ? dom.cards[cardPrefix] : dom.cards[cardPrefix];
    const fighter = (cardPrefix === 'item1') ? state.fighter1 : state.fighter2;

    const percent = (fighter.steamData.total_reviews > 0) ? (fighter.steamData.total_positive / fighter.steamData.total_reviews * 100).toFixed(1) : 0;
    card.steamScoreDisplay.innerHTML = `${fighter.steamData.review_score_desc} <span class="text-sm text-gray-400">(${percent}%)</span>`;

    card.fetchSteamBtn.textContent = 'Reset';
    card.fetchSteamBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
    card.fetchSteamBtn.classList.add('bg-red-600', 'hover:bg-red-700');
    card.updateScoresBtn.classList.remove('hidden');
}

export function updateScoresAndDisplay() {
    const rawScore1 = calculateRawScore(state.fighter1);
    const rawScore2 = calculateRawScore(state.fighter2);
    state.score1 = applyBonuses(rawScore1, state.fighter1);
    state.score2 = applyBonuses(rawScore2, state.fighter2);

    dom.cards.item1.weightClass.textContent = getWeightClass(rawScore1);
    dom.cards.item2.weightClass.textContent = getWeightClass(rawScore2);

    dom.center.finalLabel1.textContent = state.fighter1.name || 'Item 1';
    dom.center.finalLabel2.textContent = state.fighter2.name || 'Item 2';
    
    updateChampionSymbols(); 
    updateVsTitles(); 
    updateTitleAvailability();
    updateTitleMatchAnnouncement(); 
    updateRecordDisplays(); 
    calculateAndDisplayOdds();
    updateRoundsDisplay();
    updateCommonGenresDisplay();

    dom.center.finalScore1.textContent = state.score1.toFixed(2);
    dom.center.finalScore2.textContent = state.score2.toFixed(2);
    dom.center.rawScoreDisplay1.textContent = `(Raw: ${rawScore1.toFixed(2)})`;
    dom.center.rawScoreDisplay2.textContent = `(Raw: ${rawScore2.toFixed(2)})`;
}

export function clearCard(prefix) {
    const fighterObject = (prefix === 'item1') ? state.fighter1 : state.fighter2;
    const defaultFighter = createNewFighter();
    Object.assign(fighterObject, defaultFighter);

    const cardElements = (prefix === 'item1') ? dom.cards.item1 : dom.cards.item2;
    cardElements.name.textContent = prefix === 'item1' ? 'Fighter 1' : 'Fighter 2';
    cardElements.devHouse.textContent = '';
    cardElements.publisher.textContent = '';
    cardElements.metacritic.textContent = '';
    cardElements.steamId.value = '';
    cardElements.steamError.textContent = '';
    cardElements.metacriticError.classList.add('hidden');
    cardElements.universeSelect.value = '';
    cardElements.steamScoreDisplay.innerHTML = '';
    
    cardElements.fetchSteamBtn.textContent = 'Fetch';
    cardElements.fetchSteamBtn.classList.remove('bg-red-600', 'hover:bg-red-700');
    cardElements.fetchSteamBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
    cardElements.updateScoresBtn.classList.add('hidden');
}

export function loadCardFromData(prefix, data) {
    const fighterObject = (prefix === 'item1') ? state.fighter1 : state.fighter2;
    const cardElements = (prefix === 'item1') ? dom.cards.item1 : dom.cards.item2;
    
    const newFighter = createNewFighter();
    Object.assign(newFighter, JSON.parse(JSON.stringify(data)));
    Object.assign(fighterObject, newFighter);

    if (!fighterObject.lastModified) {
        updateTimestamp(fighterObject);
    }
    
    cardElements.name.textContent = fighterObject.name;
    cardElements.devHouse.textContent = fighterObject.devHouse;
    cardElements.publisher.textContent = fighterObject.publisher;
    cardElements.metacritic.textContent = fighterObject.scores.metacritic;
    cardElements.steamId.value = fighterObject.appId || '';
    cardElements.universeSelect.value = fighterObject.appId || '';

    if (fighterObject.steamData) {
        updateUIAfterFetch(prefix);
    }
    
    if (fighterObject.scores.metacritic === '404') {
        cardElements.metacriticError.classList.remove('hidden');
    } else {
        cardElements.metacriticError.classList.add('hidden');
    }
}

export async function displayFightWinner(fightWinnerName, winType, finalRound) {
    try {
        state.boutWinnerData = null;
        let bellCount = 2;

        dom.cards.item1.card.classList.remove('winner-glow');
        dom.cards.item2.card.classList.remove('winner-glow');

        let winnerName, winnerFighter, loserFighter, winnerIsFighter1;

        if (fightWinnerName === state.fighter1.name) {
            [winnerName, winnerFighter, loserFighter, winnerIsFighter1] = [state.fighter1.name, state.fighter1, state.fighter2, true];
        } else if (fightWinnerName === state.fighter2.name) {
            [winnerName, winnerFighter, loserFighter, winnerIsFighter1] = [state.fighter2.name, state.fighter2, state.fighter1, false];
        } else {
            dom.center.winnerBox.title.textContent = "It's a Draw?!";
            dom.center.winnerBox.text.textContent = `The judges have scored it even after ${finalRound} rounds.`;
            import('./sound.js').then(sound => sound.playBellSequence(3));
            return; // Exit early for a draw
        }

        if (winnerFighter) {
            if (winType === 'KO') winnerFighter.record.ko++; else winnerFighter.record.tko++;
            loserFighter.record.losses++;

            if (winnerFighter.appId && loserFighter.appId) {
                winnerFighter.record.vs = winnerFighter.record.vs || {};
                winnerFighter.record.vs[loserFighter.appId] = winnerFighter.record.vs[loserFighter.appId] || { wins: 0, losses: 0 };
                winnerFighter.record.vs[loserFighter.appId].wins++;
                loserFighter.record.vs = loserFighter.record.vs || {};
                loserFighter.record.vs[winnerFighter.appId] = loserFighter.record.vs[winnerFighter.appId] || { wins: 0, losses: 0 };
                loserFighter.record.vs[winnerFighter.appId].losses++;
            }

            updateTimestamp(winnerFighter);
            updateTimestamp(loserFighter);
            updateFighterInUniverse(winnerFighter);
            updateFighterInUniverse(loserFighter);
            state.boutWinnerData = JSON.parse(JSON.stringify(winnerFighter));
            dom.center.winnerBox.title.textContent = `${winnerName} Wins!`;
            if (winnerIsFighter1) dom.cards.item1.card.classList.add('winner-glow');
            else dom.cards.item2.card.classList.add('winner-glow');
        }

        dom.center.winnerBox.text.textContent = `Won by ${winType} in Round ${finalRound}`;

        if (state.selectedTitleForFight !== 'none' && winnerName && winnerName !== 'draw') {
            const winnerStatusBefore = getChampionStatus(winnerName);
            const loserStatus = getChampionStatus(loserFighter.name);
            
            winnerFighter.record.pastTitles = winnerFighter.record.pastTitles || {};
            winnerFighter.record.pastTitles[state.selectedTitleForFight] = (winnerFighter.record.pastTitles[state.selectedTitleForFight] || 0) + 1;
            
            if (winnerStatusBefore.status !== 'contender' && winnerStatusBefore.status !== state.selectedTitleForFight) {
                const previousTitleKey = winnerStatusBefore.status === 'local' ? winnerStatusBefore.key : winnerStatusBefore.status;
                winnerFighter.record.pastTitles[previousTitleKey] = (winnerFighter.record.pastTitles[previousTitleKey] || 0) + 1;
            }
            updateTimestamp(winnerFighter);

            const winnerData = JSON.parse(JSON.stringify(winnerFighter));
            const selectedTitle = state.selectedTitleForFight;
            
            if (selectedTitle === 'undisputed') {
                bellCount = 6;
                if (winnerStatusBefore.status !== 'contender' && winnerStatusBefore.status !== 'undisputed' && winnerStatusBefore.status !== 'local') state.roster.major[winnerStatusBefore.status].name = 'Vacant'; state.roster.major[winnerStatusBefore.status].data = null;
                if (loserStatus.status !== 'contender' && loserStatus.status !== 'undisputed' && loserStatus.status !== 'local') state.roster.major[loserStatus.status].name = 'Vacant'; state.roster.major[loserStatus.status].data = null;
                if (loserStatus.status === 'local' && state.roster.major[selectedTitle]?.name === 'Vacant') state.roster.local[loserStatus.key].name = 'Vacant'; state.roster.local[loserStatus.key].data = null;
                state.roster.major.undisputed = { ...state.roster.major.undisputed, name: winnerName, data: winnerData };
            } else if (state.roster.major[selectedTitle]) {
                bellCount = 4;
                if(winnerStatusBefore.status === 'local') state.roster.local[winnerStatusBefore.key].name = 'Vacant'; state.roster.local[winnerStatusBefore.key].data = null;
                if (loserStatus.status === 'local' && state.roster.major[selectedTitle]?.name === 'Vacant') state.roster.local[loserStatus.key].name = 'Vacant'; state.roster.local[loserStatus.key].data = null;
                state.roster.major[selectedTitle] = { ...state.roster.major[selectedTitle], name: winnerName, data: winnerData };
            } else if (state.roster.local[selectedTitle]) {
                bellCount = 3;
                state.roster.local[selectedTitle] = { ...state.roster.local[selectedTitle], name: winnerName, data: winnerData };
            }
            
            const titleObject = state.roster.major[selectedTitle] || state.roster.local[selectedTitle];
            const titleName = selectedTitle.replace('interGenre','INTER-GENRE').toUpperCase();
            const modalAnnouncement = `A New ${titleName} CHAMPION!`;
            const mainScreenAnnouncement = `${titleObject.symbol} A New ${titleName.charAt(0) + titleName.slice(1).toLowerCase()} Champion! ${titleObject.symbol}`;
            
            import('./sound.js').then(s => s.speak(`${winnerName} wins by ${winType}! ` + modalAnnouncement.replace(/<[^>]*>?/gm, ''), true));
            const titleWinEl = dom.fightModal.titleWinAnnouncement;
            titleWinEl.textContent = modalAnnouncement;
            const animationClass = winnerIsFighter1 ? 'animate-title-to-winner-left' : 'animate-title-to-winner-right';
            titleWinEl.className = ''; void titleWinEl.offsetWidth; titleWinEl.classList.add(animationClass);
            await import('./utils.js').then(u => u.delay(1500)); 
            dom.center.titleMatchAnnouncement.innerHTML = mainScreenAnnouncement;
        }

        import('./sound.js').then(s => s.playBellSequence(bellCount));
        
        const finalWinnerTitleInfo = getFighterTitleInfo(winnerFighter.name);
        const finalLoserTitleInfo = getFighterTitleInfo(loserFighter.name);
        const winnerTitleEl = winnerIsFighter1 ? dom.fightModal.fighter1.title : dom.fightModal.fighter2.title;
        const loserTitleEl = winnerIsFighter1 ? dom.fightModal.fighter2.title : dom.fightModal.fighter1.title;
        
        winnerTitleEl.classList.remove('animate-title-from-left', 'animate-title-from-right');
        winnerTitleEl.innerHTML = finalWinnerTitleInfo ? `<span title="${finalWinnerTitleInfo.title}">${finalWinnerTitleInfo.symbol} ${finalWinnerTitleInfo.title} ${finalWinnerTitleInfo.symbol}</span>` : '';
        winnerTitleEl.style.opacity = 1;
        
        loserTitleEl.classList.remove('animate-title-from-left', 'animate-title-from-right');
        loserTitleEl.innerHTML = finalLoserTitleInfo ? `<span title="${finalLoserTitleInfo.title}">${finalLoserTitleInfo.symbol} ${finalLoserTitleInfo.title} ${finalLoserTitleInfo.symbol}</span>` : '';
        loserTitleEl.style.opacity = 1;


        updateChampionsDisplay(); 
        updateScoresAndDisplay();
        populateUniverseSelectors();
        saveUniverseToLocalStorage();
    } catch (error) {
        console.error("Error during displayFightWinner:", error);
        showToast("An error occurred ending the fight. Please check console.", 5000);
    } finally {
        // This code will run regardless of whether an error occurred.
        dom.fightModal.returnBtn.classList.remove('hidden');
        dom.center.fightBtn.classList.add('hidden'); 
        dom.center.swapBtn.classList.add('hidden');
        dom.center.nextRoundBtn.classList.remove('hidden'); 
        dom.center.nextRoundClearBtn.classList.remove('hidden');
    }
}


export function logFightMessage(html) {
    dom.fightModal.log.insertAdjacentHTML('beforeend', html);
    dom.fightModal.log.scrollTop = dom.fightModal.log.scrollHeight;
}


// --- HELPER & ADDITIONAL UI FUNCTIONS ---
function getFighterTitleInfo(name) {
    if (!name || name === '' || name === 'Vacant') return null;
    
    const majorChampInfo = getMajorChampionInfo(name);
    if (majorChampInfo) {
        let titleText = '';
        switch(majorChampInfo.type) {
            case 'undisputed': titleText = 'Undisputed Champ'; break;
            case 'interGenre': titleText = 'Inter-Genre Champ'; break;
            case 'heavyweight': titleText = 'Heavyweight Champ'; break;
            case 'cruiserweight': titleText = 'Cruiserweight Champ'; break;
            case 'featherweight': titleText = 'Featherweight Champ'; break;
            default: titleText = 'Major Champion';
        }
        return { symbol: state.roster.major[majorChampInfo.type].symbol, title: titleText };
    }

    const localChampInfo = getLocalChampionInfo(name);
    if (localChampInfo) {
        const titleText = `${localChampInfo.key.charAt(0).toUpperCase() + localChampInfo.key.slice(1)} Champ`;
        return { symbol: localChampInfo.symbol, title: titleText };
    }
    
    return null;
}

function getPastTitleSymbol(fighter) {
    const pastTitles = fighter.record.pastTitles || {};
    if (pastTitles.undisputed) {
        return PAST_TITLE_SYMBOLS.undisputed;
    }
    const majorKeys = ['heavyweight', 'cruiserweight', 'featherweight', 'interGenre'];
    if (majorKeys.some(key => pastTitles[key])) {
        return PAST_TITLE_SYMBOLS.major;
    }
    if (Object.keys(pastTitles).some(key => state.roster.local[key])) {
         return PAST_TITLE_SYMBOLS.local;
    }
    return '';
}

export function getChampionStatus(fighterName) {
    if (!fighterName || fighterName === 'Vacant') return { status: 'contender' };
    if (state.roster.major.undisputed.name === fighterName) return { status: 'undisputed' };
    for (const key in state.roster.major) {
        if (state.roster.major[key].name === fighterName) return { status: key };
    }
    for (const key in state.roster.local) {
        if (state.roster.local[key].name === fighterName) return { status: 'local', key: key };
    }
    return { status: 'contender' };
}

export function updateFightUI(health1, stamina1, health2, stamina2) {
    // Update health and stamina bars
    dom.fightModal.fighter1.healthBar.style.width = `${health1}%`;
    dom.fightModal.fighter1.healthText.textContent = `${health1.toFixed(1)} / 100`;
    dom.fightModal.fighter1.staminaBar.style.width = `${stamina1}%`;
    dom.fightModal.fighter1.staminaText.textContent = `Stamina: ${stamina1.toFixed(1)}%`;
    dom.fightModal.fighter2.healthBar.style.width = `${health2}%`;
    dom.fightModal.fighter2.healthText.textContent = `${health2.toFixed(1)} / 100`;
    dom.fightModal.fighter2.staminaBar.style.width = `${stamina2}%`;
    dom.fightModal.fighter2.staminaText.textContent = `Stamina: ${stamina2.toFixed(1)}%`;

    // Update stamina state text and color
    const staminaMods1 = getStaminaModifiers(stamina1);
    dom.fightModal.fighter1.staminaState.textContent = staminaMods1.state;
    dom.fightModal.fighter1.staminaState.className = `text-xs font-bold h-4 ${staminaMods1.color}`;
    
    const staminaMods2 = getStaminaModifiers(stamina2);
    dom.fightModal.fighter2.staminaState.textContent = staminaMods2.state;
    dom.fightModal.fighter2.staminaState.className = `text-xs font-bold h-4 ${staminaMods2.color}`;

    // Clear hit flash effect
    setTimeout(() => {
        dom.fightModal.fighter1.svg.classList.remove('hit-flash');
        dom.fightModal.fighter2.svg.classList.remove('hit-flash');
    }, 300);
}


export function displayInitialFighterTitles() {
    const titleInfo1 = getFighterTitleInfo(state.fighter1.name);
    const titleInfo2 = getFighterTitleInfo(state.fighter2.name);
    
    dom.fightModal.fighter1.title.innerHTML = titleInfo1 ? `<span title="${titleInfo1.title}">${titleInfo1.symbol} ${titleInfo1.title} ${titleInfo1.symbol}</span>` : '';
    dom.fightModal.fighter2.title.innerHTML = titleInfo2 ? `<span title="${titleInfo2.title}">${titleInfo2.symbol} ${titleInfo2.title} ${titleInfo2.symbol}</span>` : '';
    
    // Reset animation classes
    dom.fightModal.fighter1.title.className = 'fighter-title-display h-6 text-sm font-semibold text-amber-400';
    dom.fightModal.fighter2.title.className = 'fighter-title-display h-6 text-sm font-semibold text-amber-400';
    dom.fightModal.titleBoutDisplay.innerHTML = '';
}


export async function animateTitleBout() {
    if (!state.selectedTitleForFight || state.selectedTitleForFight === 'none' || state.fightCancellationToken.cancelled) return;

    const titleKey = state.selectedTitleForFight;
    const status1 = getChampionStatus(state.fighter1.name);
    const status2 = getChampionStatus(state.fighter2.name);

    if (status1.status !== 'contender') {
        dom.fightModal.fighter1.title.classList.add('animate-title-from-left');
    }
    if (status2.status !== 'contender') {
        dom.fightModal.fighter2.title.classList.add('animate-title-from-right');
    }

    await import('./utils.js').then(u => u.delay(750));
    if (state.fightCancellationToken.cancelled) return;

    const titleObject = state.roster.major[titleKey] || state.roster.local[titleKey];
    if (titleObject) {
        const titleName = titleKey.toUpperCase().replace("-", " ");
        let announcement = `FOR THE ${titleName} TITLE!`;
        if(titleKey === 'undisputed') announcement = 'FOR THE UNDISPUTED CHAMPIONSHIP!';
        dom.fightModal.titleBoutDisplay.innerHTML = `<span class="title-fanfare">${announcement}</span>`;
    }
}

export function updateHitBonusDisplay(bonus1, bonus2) {
    dom.fightModal.fighter1.hitBonus.textContent = bonus1 > 0 ? `+${bonus1.toFixed(1)} Underdog Bonus` : '';
    dom.fightModal.fighter2.hitBonus.textContent = bonus2 > 0 ? `+${bonus2.toFixed(1)} Underdog Bonus` : '';
}

export function getMajorChampionInfo(fighterName) {
    if (!fighterName || fighterName === 'Vacant') return null;
    if (state.roster.major.undisputed.name === fighterName) {
        return { type: 'undisputed', speech: 'The Undisputed Champion of the world!' };
    }
    for (const key of ['heavyweight', 'interGenre', 'cruiserweight', 'featherweight']) {
        if (state.roster.major[key].name === fighterName) {
            return { type: key, speech: `The reigning and defending world ${key.replace('interGenre','inter-genre')} champion!` };
        }
    }
    return null;
}

export function getLocalChampionInfo(fighterName) {
    if (!fighterName || fighterName === 'Vacant') return null;
    for (const key in state.roster.local) {
        if (state.roster.local[key].name === fighterName) {
            return { key: key , symbol: state.roster.local[key].symbol };
        }
    }
    return null;
}

export function hasAchievedGrandSlam(fighter) {
    const pastTitles = fighter.record.pastTitles || {};
    const majorTitlesHeld = ['heavyweight', 'cruiserweight', 'featherweight', 'interGenre'].filter(title => pastTitles[title]);
    return majorTitlesHeld.length >= 3;
}

export function updateRecordDisplays() {
    const { fighter1, fighter2 } = state;
    if (!fighter1 || !fighter1.record) return;
    const rec1 = fighter1.record;
    dom.cards.item1.record.textContent = `${rec1.tko}-${rec1.ko}-${rec1.losses}`;
    if (!fighter2 || !fighter2.record) return;
    const rec2 = fighter2.record;
    dom.cards.item2.record.textContent = `${rec2.tko}-${rec2.ko}-${rec2.losses}`;
}

function updateCommonGenresDisplay() {
    if (state.fighter1 && state.fighter1.genres && state.fighter2 && state.fighter2.genres && state.fighter1.genres.length > 0 && state.fighter2.genres.length > 0) {
        const common = state.fighter1.genres.filter(g => state.fighter2.genres.includes(g));
        if (common.length > 0) {
            dom.center.commonGenresDisplay.innerHTML = common.map(g => `<span class="bg-gray-700 text-xs font-semibold px-2 py-1 rounded-full">${g}</span>`).join('');
            dom.center.commonGenresContainer.classList.remove('hidden');
        } else {
            dom.center.commonGenresContainer.classList.add('hidden');
        }
    } else {
        dom.center.commonGenresContainer.classList.add('hidden');
    }
}

function updateChampionSymbols() {
    if (!state.fighter1 || !state.fighter2) return;
    const f1Status = getChampionStatus(state.fighter1.name);
    const f2Status = getChampionStatus(state.fighter2.name);
    let f1Symbol = '', f2Symbol = '';

    if (f1Status.status !== 'contender') {
        const titleKey = f1Status.status === 'local' ? f1Status.key : f1Status.status;
        const titleObj = state.roster.major[titleKey] || state.roster.local[titleKey];
        if (titleObj) f1Symbol = titleObj.symbol;
    }
    if (f2Status.status !== 'contender') {
        const titleKey = f2Status.status === 'local' ? f2Status.key : f2Status.status;
        const titleObj = state.roster.major[titleKey] || state.roster.local[titleKey];
        if (titleObj) f2Symbol = titleObj.symbol;
    }
    dom.cards.item1.symbol.textContent = f1Symbol;
    dom.cards.item2.symbol.textContent = f2Symbol;
}

function updateRoundsDisplay() {
    const isLowCard = dom.center.lowCardCheckbox.checked;
    const isTitleMatch = state.selectedTitleForFight !== 'none';
    let rounds = 6;
    if (isTitleMatch && !isLowCard) {
        if (state.selectedTitleForFight === 'undisputed') rounds = 12;
        else if (state.roster.major[state.selectedTitleForFight]) rounds = 10;
        else if (state.roster.local[state.selectedTitleForFight]) rounds = 8;
    }
    dom.center.roundsDisplay.textContent = `${rounds} Round Bout`;
}

function calculateAndDisplayOdds() {
    if (state.score1 > 0 && state.score2 > 0) {
        const diff = Math.abs(state.score1 - state.score2);
        const odds = 100 + (diff * 25);
        if (state.score1 > state.score2) {
            dom.center.oddsText.textContent = `-${odds.toFixed(0)} Favorite`;
            dom.center.oddsArrowLeft.classList.remove('hidden');
            dom.center.oddsArrowRight.classList.add('hidden');
        } else if (state.score2 > state.score1) {
            dom.center.oddsText.textContent = `-${odds.toFixed(0)} Favorite`;
            dom.center.oddsArrowRight.classList.remove('hidden');
            dom.center.oddsArrowLeft.classList.add('hidden');
        } else {
            dom.center.oddsText.textContent = 'Even Match';
            dom.center.oddsArrowLeft.classList.add('hidden');
            dom.center.oddsArrowRight.classList.add('hidden');
        }
    } else {
        dom.center.oddsText.textContent = '';
        dom.center.oddsArrowLeft.classList.add('hidden');
        dom.center.oddsArrowRight.classList.add('hidden');
    }
}

function updateTitleAvailability() {
    const availableFights = getAvailableTitleFights(state.fighter1, state.fighter2);
    if (availableFights.length > 0) {
        dom.center.titleSelectBtn.classList.remove('hidden');
    } else {
        dom.center.titleSelectBtn.classList.add('hidden');
        if (state.selectedTitleForFight !== 'none') {
            setSelectedTitle('none'); // Reset if matchup invalidates title
        }
    }
}

export function updateTitleMatchAnnouncement() {
     if (state.selectedTitleForFight !== 'none') {
        const titleKey = state.selectedTitleForFight;
        const titleObject = state.roster.major[titleKey] || state.roster.local[titleKey];
        if(titleObject) {
            const titleName = titleKey.charAt(0).toUpperCase() + titleKey.slice(1).replace('interGenre', 'Inter-Genre');
            dom.center.titleMatchAnnouncement.innerHTML = `<span class="title-fanfare">${titleObject.symbol} ${titleName} Title Bout ${titleObject.symbol}</span>`;
        }
    } else {
        dom.center.titleMatchAnnouncement.innerHTML = '';
    }
}

function updateVsTitles() {
    let vsText1 = '', vsText2 = '';
    if (state.fighter1 && state.fighter1.appId && state.fighter2 && state.fighter2.appId) {
        const f1vsf2Losses = state.fighter1.record.vs?.[state.fighter2.appId]?.losses || 0;
        const f1vsf2Wins = state.fighter1.record.vs?.[state.fighter2.appId]?.wins || 0;
        vsText1 = `${f1vsf2Wins}-${f1vsf2Losses} vs this opponent`;

        const f2vsf1Losses = state.fighter2.record.vs?.[state.fighter1.appId]?.losses || 0;
        const f2vsf1Wins = state.fighter2.record.vs?.[state.fighter1.appId]?.wins || 0;
        vsText2 = `${f2vsf1Wins}-${f2vsf1Losses} vs this opponent`;
    }
    dom.center.vsRecord1.textContent = vsText1;
    dom.center.vsRecord2.textContent = vsText2;
}

export function populateUniverseSelectors() {
    const fighters = [...state.universeFighters].sort((a, b) => a.name.localeCompare(b.name));
    const select1 = dom.cards.item1.universeSelect;
    const select2 = dom.cards.item2.universeSelect;

    const currentVal1 = select1.value;
    const currentVal2 = select2.value;

    select1.innerHTML = '<option value="">Select from Universe</option>';
    select2.innerHTML = '<option value="">Select from Universe</option>';

    fighters.forEach(fighter => {
        if (!fighter.isRetired) {
            let prefix = '';
            if (fighter.isHallOfFamer) {
                prefix += `${HALL_OF_FAME_SYMBOL} `;
            }
            if(hasAchievedGrandSlam(fighter)) {
                prefix += `${GRAND_SLAM_SYMBOL} `;
            }
            const currentTitleInfo = getFighterTitleInfo(fighter.name);
            if (currentTitleInfo) {
                prefix = `${currentTitleInfo.symbol} ` + prefix;
            } else {
                const pastTitleSymbol = getPastTitleSymbol(fighter);
                if (pastTitleSymbol) {
                    prefix = `${pastTitleSymbol} ` + prefix;
                }
            }
            const optionHTML = `<option value="${fighter.appId}">${prefix}${fighter.name}</option>`;
            select1.insertAdjacentHTML('beforeend', optionHTML);
            select2.insertAdjacentHTML('beforeend', optionHTML);
        }
    });

    select1.value = currentVal1;
    select2.value = currentVal2;
}

export function updateChampionsDisplay() {
    const { major } = state.roster;
    dom.center.featherweightChamp.textContent = major.featherweight.name;
    dom.center.featherweightChamp.title = major.featherweight.name;
    dom.center.cruiserweightChamp.textContent = major.cruiserweight.name;
    dom.center.cruiserweightChamp.title = major.cruiserweight.name;
    dom.center.heavyweightChamp.textContent = major.heavyweight.name;
    dom.center.heavyweightChamp.title = major.heavyweight.name;
    dom.center.interGenreChamp.textContent = major.interGenre.name;
    dom.center.interGenreChamp.title = major.interGenre.name;
    dom.center.undisputedChamp.textContent = major.undisputed.name;
    dom.center.undisputedChamp.title = major.undisputed.name;
}

export function populateSetupPanel() {
    const { potentialMatchupsList, potentialTitlesList, ...panel } = dom.setupPanel;
    
    // Clear and populate static parts of the panel
    panel.championList.innerHTML = '';
    panel.localChampionList.innerHTML = '';
    panel.universeFighterList.innerHTML = '';
    panel.retirementSelect.innerHTML = '<option value="">Select Fighter to Retire</option>';
    panel.hallOfFameList.innerHTML = '';
    panel.untappedGenresList.innerHTML = '';
    panel.tappedGenresList.innerHTML = '';

    const sortedFighters = [...state.universeFighters].sort((a, b) => a.name.localeCompare(b.name));

    Object.entries(state.roster.major).forEach(([key, title]) => {
        const titleName = key.charAt(0).toUpperCase() + key.slice(1).replace('interGenre', 'Inter-Genre');
        panel.championList.innerHTML += `<div class="flex items-center justify-between bg-gray-900 p-1 rounded"><span class="font-semibold">${title.symbol} ${titleName}:</span><span class="truncate" title="${title.name}">${title.name}</span></div>`;
    });

    if (Object.keys(state.roster.local).length > 0) {
        Object.entries(state.roster.local).forEach(([key, title]) => {
            const titleName = key.charAt(0).toUpperCase() + key.slice(1);
            panel.localChampionList.innerHTML += `<div class="flex items-center justify-between bg-gray-900 p-1 rounded"><span class="font-semibold">${title.symbol} ${titleName}:</span><span class="truncate" title="${title.name}">${title.name}</span></div>`;
        });
    } else {
        panel.localChampionList.innerHTML = `<p class="text-center text-gray-500 text-xs">No local titles exist yet.</p>`;
    }

    const activeFighters = sortedFighters.filter(f => !f.isRetired);
    activeFighters.forEach(fighter => {
        panel.universeFighterList.innerHTML += `<div class="universe-fighter-entry cursor-pointer hover:bg-gray-700 p-1 rounded" data-appid="${fighter.appId}">${fighter.name}</div>`;
        panel.retirementSelect.innerHTML += `<option value="${fighter.appId}">${fighter.name}</option>`;
    });

    const hallOfFamers = sortedFighters.filter(f => f.isHallOfFamer);
    if (hallOfFamers.length > 0) {
        hallOfFamers.forEach(fighter => {
            panel.hallOfFameList.innerHTML += `<div class="bg-gray-900 p-1 rounded truncate text-amber-400 flex justify-between items-center">${HALL_OF_FAME_SYMBOL} ${fighter.name} <button data-appid="${fighter.appId}" class="reactivate-btn bg-green-700 hover:bg-green-600 px-2 py-0.5 rounded text-white text-xs">Reactivate</button></div>`;
        });
    } else {
        panel.hallOfFameList.innerHTML = `<p class="text-center text-gray-500 text-xs">The Hall of Fame awaits its first inductee.</p>`;
    }

    const allGenres = new Set(state.universeFighters.flatMap(f => f.genres || []));
    const tappedGenres = new Set(Object.keys(state.roster.local));
    allGenres.forEach(genre => {
        if (!genre) return;
        const list = tappedGenres.has(genre) ? panel.tappedGenresList : panel.untappedGenresList;
        const formattedGenre = genre.charAt(0).toUpperCase() + genre.slice(1);
        list.innerHTML += `<button class="bg-gray-900 hover:bg-gray-700 p-1 rounded w-full text-left genre-expand-btn" data-genre="${genre}">${formattedGenre}</button>`;
    });
    if (panel.untappedGenresList.innerHTML === '') panel.untappedGenresList.innerHTML = `<p class="text-xs text-gray-500 text-center">No untapped genres.</p>`;
    if (panel.tappedGenresList.innerHTML === '') panel.tappedGenresList.innerHTML = `<p class="text-xs text-gray-500 text-center">No existing titles to expand.</p>`;

    // --- NEW LOGIC FOR POTENTIAL FIGHTS ---
    
    // 1. Calculate all potential matchups and title fights
    const allPotentialMatchups = [];
    const allPotentialTitles = [];
    for (let i = 0; i < activeFighters.length; i++) {
        for (let j = i + 1; j < activeFighters.length; j++) {
            const f1 = activeFighters[i];
            const f2 = activeFighters[j];
            const score1 = applyBonuses(calculateRawScore(f1), f1);
            const score2 = applyBonuses(calculateRawScore(f2), f2);
            const scoreDiff = Math.abs(score1 - score2);
            allPotentialMatchups.push({ f1, f2, scoreDiff });

            const titles = getAvailableTitleFights(f1, f2);
            if (titles.length > 0) {
                titles.forEach(title => {
                    allPotentialTitles.push({ f1, f2, scoreDiff, title });
                });
            }
        }
    }

    // 2. Populate Close Matchups (unchanged)
    allPotentialMatchups.sort((a, b) => a.scoreDiff - b.scoreDiff);
    potentialMatchupsList.innerHTML = '';
    allPotentialMatchups.slice(0, 10).forEach(match => {
        potentialMatchupsList.innerHTML += `<div class="bg-gray-900 p-1 rounded text-xs flex justify-between items-center"><span>${match.f1.name} vs ${match.f2.name}</span><button class="load-match-btn bg-blue-600 hover:bg-blue-700 text-white px-2 py-0.5 rounded" data-f1-id="${match.f1.appId}" data-f2-id="${match.f2.appId}" data-titles="[]">Load</button></div>`;
    });
    if (potentialMatchupsList.innerHTML === '') potentialMatchupsList.innerHTML = `<p class="text-center text-gray-500 text-xs">No close matchups found.</p>`;

    // 3. Find the single best matchup for each title
    const bestMatchForTitle = new Map();
    allPotentialTitles.forEach(match => {
        const titleKey = match.title.key;
        if (!bestMatchForTitle.has(titleKey) || match.scoreDiff < bestMatchForTitle.get(titleKey).scoreDiff) {
            bestMatchForTitle.set(titleKey, match);
        }
    });

    // 4. Build the final display list according to the new priority
    const displayList = [];
    const addedMatches = new Set();
    const titleOrder = ['undisputed', 'interGenre', 'heavyweight', 'cruiserweight', 'featherweight', ...Object.keys(state.roster.local).sort()];
    
    // Add the "best" matches first
    titleOrder.forEach(titleKey => {
        if (bestMatchForTitle.has(titleKey)) {
            const bestMatch = bestMatchForTitle.get(titleKey);
            const matchId = `${[bestMatch.f1.appId, bestMatch.f2.appId].sort().join('-')}-${bestMatch.title.key}`;
            if (!addedMatches.has(matchId)) {
                displayList.push(bestMatch);
                addedMatches.add(matchId);
            }
        }
    });

    // 5. Fill remaining slots with other good title fights
    if (displayList.length < 10) {
        const titlePriority = { undisputed: 0, interGenre: 1, heavyweight: 1, cruiserweight: 1, featherweight: 1 };
        allPotentialTitles.sort((a, b) => {
            const priorityA = titlePriority[a.title.key] ?? 2;
            const priorityB = titlePriority[b.title.key] ?? 2;
            if (priorityA !== priorityB) return priorityA - priorityB;
            return a.scoreDiff - b.scoreDiff;
        });

        for (const match of allPotentialTitles) {
            if (displayList.length >= 10) break;
            const matchId = `${[match.f1.appId, match.f2.appId].sort().join('-')}-${match.title.key}`;
            if (!addedMatches.has(matchId)) {
                displayList.push(match);
                addedMatches.add(matchId);
            }
        }
    }
    
    // 6. Render the final list
    potentialTitlesList.innerHTML = '';
    displayList.slice(0, 10).forEach(match => {
        potentialTitlesList.innerHTML += `<div class="bg-gray-900 p-1 rounded text-xs flex justify-between items-center"><span class="truncate pr-2" title="${match.f1.name} vs ${match.f2.name} for ${match.title.name}">${match.title.name}</span><button class="load-match-btn bg-amber-600 hover:bg-amber-700 text-white px-2 py-0.5 rounded" data-f1-id="${match.f1.appId}" data-f2-id="${match.f2.appId}" data-titles='${JSON.stringify([match.title])}'>Load</button></div>`;
    });

    if (potentialTitlesList.innerHTML === '') {
        potentialTitlesList.innerHTML = `<p class="text-center text-gray-500 text-xs">No title fights available.</p>`;
    }
}

export function masterReset() {
    showConfirmationModal("Reset Universe?", "This will delete all fighters, champions, and history. This action cannot be undone.")
        .then(confirmed => {
            if (confirmed) {
                localStorage.removeItem('boutTimeUniverseData');
                location.reload();
            }
        });
}

export function swapCards() {
    if (!state.fighter1 && !state.fighter2) return;
    const tempFighter = JSON.parse(JSON.stringify(state.fighter1));
    loadCardFromData('item1', JSON.parse(JSON.stringify(state.fighter2)));
    loadCardFromData('item2', tempFighter);
    updateScoresAndDisplay();
}

function getAvailableTitleFights(fighter1, fighter2) {
    // This logic is ported from the original single-file version for correctness.
    if (!fighter1 || !fighter1.name || !fighter2 || !fighter2.name || fighter1.isRetired || fighter2.isRetired) return [];

    const status1 = getChampionStatus(fighter1.name);
    const status2 = getChampionStatus(fighter2.name);
    const rawScore1 = calculateRawScore(fighter1);
    const rawScore2 = calculateRawScore(fighter2);
    const weightClass1 = getWeightClass(rawScore1);
    const weightClass2 = getWeightClass(rawScore2);
    const fighter1Genres = fighter1.genres || [];
    const fighter2Genres = fighter2.genres || [];

    const available = [];
    const majorChampKeys = ['featherweight', 'cruiserweight', 'heavyweight', 'interGenre'];
    const f1IsMajorChamp = majorChampKeys.includes(status1.status);
    const f2IsMajorChamp = majorChampKeys.includes(status2.status);
    const f1IsLocalChamp = status1.status === 'local';
    const f2IsLocalChamp = status2.status === 'local';

    // Helper to format the return object for consistency in the new modular structure.
    const formatTitle = (key, name, symbol) => ({ key, name, symbol });

    // 1. Undisputed Title Unification/Defense - This now correctly returns immediately.
    if (state.roster.major.undisputed.name === 'Vacant') {
        if (f1IsMajorChamp && f2IsMajorChamp && status1.status !== status2.status) {
            const symbol = state.roster.major.undisputed.symbol;
            return [formatTitle('undisputed', `💎 For the UNDISPUTED Title! 💎`, symbol)];
        }
    } else {
        const symbol = state.roster.major.undisputed.symbol;
        if (status1.status === 'undisputed' && f2IsMajorChamp) {
            return [formatTitle('undisputed', `💎 Defend the UNDISPUTED Title! 💎`, symbol)];
        }
        if (status2.status === 'undisputed' && f1IsMajorChamp) {
            return [formatTitle('undisputed', `💎 Challenge for the UNDISPUTED Title! 💎`, symbol)];
        }
    }

    // 2. Inter-Genre Title
    if (state.roster.major.interGenre.name === 'Vacant') {
        if (f1IsLocalChamp && f2IsLocalChamp) {
            const symbol = state.roster.major.interGenre.symbol;
            available.push(formatTitle('interGenre', `⭐ For the vacant Inter-Genre Championship ⭐`, symbol));
        }
    } else {
        const symbol = state.roster.major.interGenre.symbol;
        if (status1.status === 'interGenre' && f2IsLocalChamp) {
            available.push(formatTitle('interGenre', `⭐ Defend Inter-Genre Title ⭐`, symbol));
        }
        if (status2.status === 'interGenre' && f1IsLocalChamp) {
            available.push(formatTitle('interGenre', `⭐ Challenge for Inter-Genre Title ⭐`, symbol));
        }
    }

    // 3. Weight Class Titles
    if (weightClass1 === weightClass2 && weightClass1 !== 'Unranked') {
        const wcKey = weightClass1.toLowerCase();
        if (state.roster.major[wcKey]) {
            const champName = state.roster.major[wcKey].name;
            const symbol = state.roster.major[wcKey].symbol;
            const titleText = `${symbol} ${weightClass1} Championship ${symbol}`;

            if (champName === 'Vacant' && f1IsLocalChamp && f2IsLocalChamp) {
                 available.push(formatTitle(wcKey, `For the vacant ${titleText}`, symbol));
            } else if (champName === fighter1.name && f2IsLocalChamp) {
                available.push(formatTitle(wcKey, `Defend ${titleText}`, symbol));
            } else if (champName === fighter2.name && f1IsLocalChamp) {
                available.push(formatTitle(wcKey, `Challenge for ${titleText}`, symbol));
            }
        }
    }

    // 4. Local Titles
    if (status1.status === 'contender' && status2.status === 'contender') {
        Object.keys(state.roster.local)
            .filter(key => state.roster.local[key].name === 'Vacant')
            .forEach(key => {
                if (fighter1Genres.includes(key) && fighter2Genres.includes(key)) {
                    const symbol = state.roster.local[key].symbol;
                    const text = `${symbol} ${key.charAt(0).toUpperCase() + key.slice(1)} Championship ${symbol}`;
                    available.push(formatTitle(key, text, symbol));
                }
            });
    }
    if (status1.status === 'local' && status2.status === 'contender') {
        const titleGenre = status1.key;
        if (fighter2Genres.includes(titleGenre)) {
            const localInfo = state.roster.local[titleGenre];
            const text = `Defend ${localInfo.symbol} ${titleGenre.charAt(0).toUpperCase() + titleGenre.slice(1)} Championship ${localInfo.symbol}`;
            available.push(formatTitle(titleGenre, text, localInfo.symbol));
        }
    }
    if (status2.status === 'local' && status1.status === 'contender') {
        const titleGenre = status2.key;
        if (fighter1Genres.includes(titleGenre)) {
            const localInfo = state.roster.local[titleGenre];
            const text = `Challenge for ${localInfo.symbol} ${titleGenre.charAt(0).toUpperCase() + titleGenre.slice(1)} Championship ${localInfo.symbol}`;
            available.push(formatTitle(titleGenre, text, localInfo.symbol));
        }
    }

    // Remove duplicates that might arise from different logic paths
    const uniqueKeys = new Set();
    return available.filter(el => {
        const isDuplicate = uniqueKeys.has(el.key);
        uniqueKeys.add(el.key);
        return !isDuplicate;
    });
}


export function openTitleSelectionModal(specificTitles = null) {
    const container = dom.titleSelectModal.optionsContainer;
    container.innerHTML = ''; // Clear previous options

    const availableTitles = specificTitles || getAvailableTitleFights(state.fighter1, state.fighter2);

    if (availableTitles.length > 0) {
        availableTitles.forEach(titleInfo => {
            container.innerHTML += `
                <label class="flex items-center space-x-3 p-2 bg-gray-700 rounded-lg hover:bg-gray-600 cursor-pointer">
                    <input type="radio" name="title-option" value="${titleInfo.key}" class="form-radio h-5 w-5 text-amber-500 bg-gray-900 border-gray-600 focus:ring-amber-400">
                    <span class="font-semibold">${titleInfo.symbol} ${titleInfo.name}</span>
                </label>`;
        });
        container.innerHTML += `
             <label class="flex items-center space-x-3 p-2 bg-gray-700 rounded-lg hover:bg-gray-600 cursor-pointer">
                <input type="radio" name="title-option" value="none" class="form-radio h-5 w-5 text-amber-500 bg-gray-900 border-gray-600 focus:ring-amber-400" checked>
                <span class="font-semibold text-gray-400">None (Non-Title Bout)</span>
            </label>`;
    } else {
        container.innerHTML = '<p class="text-center text-gray-400">No title fights are possible for this matchup.</p>';
    }
    
    dom.titleSelectModal.modal.classList.remove('hidden');
}

export function applyRosterChanges() {
    showToast("Roster changes applied!");
    saveUniverseToLocalStorage();
    updateChampionsDisplay();
    updateScoresAndDisplay();
    populateSetupPanel(); // Re-populate to reflect changes
    dom.setupPanel.panel.classList.add('hidden');
}

export async function handleLoadMatchClick(f1Id, f2Id, titlesJSON) {
    const fighter1Data = state.universeFighters.find(f => f.appId === f1Id);
    const fighter2Data = state.universeFighters.find(f => f.appId === f2Id);

    if (fighter1Data && fighter2Data) {
        await loadCardFromData('item1', fighter1Data);
        await loadCardFromData('item2', fighter2Data);
        
        dom.setupPanel.panel.classList.add('hidden');
        showToast("Match loaded!", 3000);

        let titles = null;
        if(titlesJSON) {
            try {
                titles = JSON.parse(titlesJSON);
            } catch (e) {
                console.error("Could not parse titles from button data", e);
                titles = [];
            }
        }

        if (!titles || titles.length === 0) {
            setSelectedTitle('none');
        } else if (titles.length === 1) {
            setSelectedTitle(titles[0].key || titles[0].value);
        } else {
            setSelectedTitle('none');
            updateScoresAndDisplay();
            openTitleSelectionModal(titles);
            return;
        }

        updateScoresAndDisplay();
    } else {
        showToast("Error: Could not load fighters for the match.", 5000);
    }
}

export function displayFighterInfoModal(fighterData) {
    dom.fighterInfoModal.modal.classList.remove('hidden');
    dom.fighterInfoModal.name.textContent = fighterData.name;
    const { record, scores, devHouse, publisher, genres } = fighterData;
    dom.fighterInfoModal.record.textContent = `${record.tko}-${record.ko}-${record.losses}`;
    dom.fighterInfoModal.weightClass.textContent = getWeightClass(calculateRawScore(fighterData));
    dom.fighterInfoModal.dev.textContent = devHouse || 'N/A';
    dom.fighterInfoModal.publisher.textContent = publisher || 'N/A';
    dom.fighterInfoModal.genres.innerHTML = (genres || []).map(g => `<span class="bg-gray-700 text-xs font-semibold px-2 py-1 rounded-full">${g}</span>`).join('') || 'None listed';

    let historyHtml = '';
    const currentStatus = getChampionStatus(fighterData.name);
    if (currentStatus.status !== 'contender') {
        const titleKey = currentStatus.status === 'local' ? currentStatus.key : currentStatus.status;
        const titleObj = state.roster.major[titleKey] || state.roster.local[titleKey];
        historyHtml += `<p class="text-green-400">${titleObj.symbol} Current ${titleKey.charAt(0).toUpperCase() + titleKey.slice(1)} Champion</p>`;
    }

    if (fighterData.record.pastTitles) {
        Object.entries(fighterData.record.pastTitles).forEach(([key, count]) => {
            const titleObject = state.roster.major[key] || state.roster.local[key] || {};
            const symbol = titleObject.symbol || PAST_TITLE_SYMBOLS.local;
            historyHtml += `<p>${symbol} Former ${key.charAt(0).toUpperCase() + key.slice(1)} Champion (${count}x)</p>`;
        });
    }

    if (hasAchievedGrandSlam(fighterData)) {
        historyHtml += `<p class="text-amber-400">${GRAND_SLAM_SYMBOL} Grand Slam Winner</p>`;
    }
    
    if (fighterData.isHallOfFamer) {
        historyHtml += `<p class="text-amber-400">${HALL_OF_FAME_SYMBOL} Hall of Famer</p>`;
    }

    dom.fighterInfoModal.titleHistory.innerHTML = historyHtml || '<p class="text-gray-500">No title history.</p>';
}

export function retireFighter(fighterId, makeHof) {
    const fighter = state.universeFighters.find(f => f.appId === fighterId);
    if (fighter) {
        const action = makeHof ? "retire to the Hall of Fame" : "retire as forgotten";
        showConfirmationModal(`Confirm Retirement`, `Are you sure you want to ${action} ${fighter.name}?`)
            .then(confirmed => {
                if (confirmed) {
                    fighter.isRetired = true;
                    fighter.isHallOfFamer = makeHof;
                    updateTimestamp(fighter);
                    // If they are a current champion, vacate the title
                    Object.keys(state.roster.major).forEach(key => {
                        if (state.roster.major[key].name === fighter.name) {
                            state.roster.major[key] = { ...state.roster.major[key], name: 'Vacant', data: null };
                        }
                    });
                    Object.keys(state.roster.local).forEach(key => {
                        if (state.roster.local[key].name === fighter.name) {
                            state.roster.local[key] = { ...state.roster.local[key], name: 'Vacant', data: null };
                        }
                    });
                    saveUniverseToLocalStorage();
                    populateSetupPanel();
                    updateChampionsDisplay();
                    showToast(`${fighter.name} has been retired.`);
                }
            });
    }
}


export async function openGenreExpansionModal(genre) {
    const modal = dom.genreExpansionModal;
    modal.title.textContent = `Find New ${genre.charAt(0).toUpperCase() + genre.slice(1)} Fighters`;
    modal.list.innerHTML = `<p class="text-center text-gray-400">Searching...</p>`;
    modal.modal.classList.remove('hidden');

    const data = await fetchWithProxyRotation(`${STEAMSPY_API_URL}?request=tag&tag=${encodeURIComponent(genre)}`);

    if (data) {
        modal.list.innerHTML = '';
        const existingIds = new Set(state.universeFighters.map(f => f.appId));
        const games = Object.values(data).filter(game => !existingIds.has(game.appid.toString()));
        
        if (games.length === 0) {
            modal.list.innerHTML = `<p class="text-center text-gray-400">No new fighters found for this genre.</p>`;
            return;
        }

        games.slice(0, 50).forEach(game => { // Limit to 50 results
            modal.list.innerHTML += `
                <div class="flex items-center p-2 bg-gray-900 rounded-lg">
                    <input type="checkbox" data-appid="${game.appid}" class="h-4 w-4 rounded bg-gray-700 border-gray-600 text-amber-500 focus:ring-amber-400">
                    <label class="ml-3 text-white">${game.name}</label>
                </div>`;
        });
    } else {
        modal.list.innerHTML = `<p class="text-center text-red-500">Failed to fetch genre data.</p>`;
    }
}

export async function openTop100Selection() {
    const modal = dom.top100Modal;
    modal.list.innerHTML = `<p class="text-center text-gray-400">Fetching Top 100...</p>`;
    modal.modal.classList.remove('hidden');

    const data = await fetchWithProxyRotation(`${STEAMSPY_API_URL}?request=top100in2weeks`);
    
    if (data) {
        modal.list.innerHTML = '';
        Object.values(data).forEach(game => {
            modal.list.innerHTML += `
                 <div class="flex items-center p-2 bg-gray-900 rounded-lg">
                    <input type="checkbox" data-appid="${game.appid}" data-name="${game.name.toLowerCase()}" class="h-4 w-4 rounded bg-gray-700 border-gray-600 text-amber-500 focus:ring-amber-400">
                    <label class="ml-3 text-white">${game.name}</label>
                </div>`;
        });
    } else {
        modal.list.innerHTML = `<p class="text-center text-red-500">Failed to fetch Top 100 data.</p>`;
    }
}

export function showOriginLockoutModal(newFighterName, existingFighterName, origin) {
     return new Promise(resolve => {
        dom.originLockoutModal.newFighter.textContent = newFighterName;
        dom.originLockoutModal.existingFighter.textContent = existingFighterName;
        dom.originLockoutModal.origin.textContent = origin;
        dom.originLockoutModal.modal.classList.remove('hidden');

        dom.originLockoutModal.skipBtn.onclick = () => {
            dom.originLockoutModal.modal.classList.add('hidden');
            resolve('skip');
        };
        dom.originLockoutModal.keepBtn.onclick = () => {
            dom.originLockoutModal.modal.classList.add('hidden');
            resolve('keep');
        };
    });
}

export function clearBothCards() {
    clearCard('item1');
    clearCard('item2');
    clearForNextRound();
}

export function clearForNextRound() {
    dom.center.fightBtn.classList.remove('hidden');
    dom.center.swapBtn.classList.remove('hidden');
    dom.center.nextRoundBtn.classList.add('hidden');
    dom.center.nextRoundClearBtn.classList.add('hidden');
    dom.center.winnerBox.title.textContent = '';
    dom.center.winnerBox.text.textContent = '';
    dom.cards.item1.card.classList.remove('winner-glow');
    dom.cards.item2.card.classList.remove('winner-glow');
    state.selectedTitleForFight = 'none';
    state.boutWinnerData = null;
    updateScoresAndDisplay();
}

export function populateAndShowEditModal(fighter) {
    if (!fighter) return;
    state.currentRecordEditTarget = fighter.appId; // Use appId to be safe
    dom.editRecordModal.tko.value = fighter.record.tko || 0;
    dom.editRecordModal.ko.value = fighter.record.ko || 0;
    dom.editRecordModal.losses.value = fighter.record.losses || 0;
    
    const editor = dom.editRecordModal.pastTitlesEditor;
    editor.innerHTML = '';
    const allTitles = {...state.roster.major, ...state.roster.local };
    
    Object.keys(allTitles).sort().forEach(key => {
        const count = fighter.record.pastTitles?.[key] || 0;
        const formattedName = key.charAt(0).toUpperCase() + key.slice(1).replace('interGenre', 'Inter-Genre');
        editor.innerHTML += `
            <div class="flex items-center justify-between">
                <label class="text-gray-300">${formattedName}</label>
                <input type="number" value="${count}" data-title-key="${key}" class="form-input w-20 text-center bg-gray-700 border-gray-600 rounded-md py-1 px-1 text-white">
            </div>
        `;
    });


    dom.editRecordModal.modal.classList.remove('hidden');
}


