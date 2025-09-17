import { state, dom, createNewFighter, updateFighterInUniverse, saveUniverseToLocalStorage, GENRE_SYMBOLS, PAST_TITLE_SYMBOLS, GRAND_SLAM_SYMBOL, HALL_OF_FAME_SYMBOL, addFighterToUniverse, loadRoster, updateTimestamp } from './state.js';
import { calculateRawScore, applyBonuses, getWeightClass } from './fight.js';
import { downloadJSON } from './utils.js';
import { fetchWithProxyRotation, STEAMSPY_API_URL } from './api.js';

// --- UI & DISPLAY FUNCTIONS ---

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
    dom.fightModal.returnBtn.classList.remove('hidden');
    dom.fightModal.referee.classList.add('ref-visible');
    dom.fightModal.referee.classList.remove('ref-start-fight', 'ref-counting');
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
         dom.center.fightBtn.classList.add('hidden'); 
         dom.center.swapBtn.classList.add('hidden');
         dom.center.nextRoundBtn.classList.remove('hidden'); 
         dom.center.nextRoundClearBtn.classList.remove('hidden');
         import('./sound.js').then(sound => sound.playBellSequence(3));
         return;
    }
    
    if(winnerFighter) {
        if (winType === 'KO') winnerFighter.record.ko++; else winnerFighter.record.tko++;
        loserFighter.record.losses++;

        if (winnerFighter.appId && loserFighter.appId) {
            // Update winner's record vs loser
            winnerFighter.record.vs = winnerFighter.record.vs || {};
            winnerFighter.record.vs[loserFighter.appId] = winnerFighter.record.vs[loserFighter.appId] || { wins: 0, losses: 0 };
            winnerFighter.record.vs[loserFighter.appId].wins++;

            // Update loser's record vs winner
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
        if(winnerIsFighter1) dom.cards.item1.card.classList.add('winner-glow');
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
            if (winnerStatusBefore.status !== 'contender' && winnerStatusBefore.status !== 'undisputed' && winnerStatusBefore.status !== 'local') state.roster.major[winnerStatusBefore.status] = { name: 'Vacant', data: null, ...state.roster.major[winnerStatusBefore.status]};
            if (loserStatus.status !== 'contender' && loserStatus.status !== 'undisputed' && loserStatus.status !== 'local') state.roster.major[loserStatus.status] = { name: 'Vacant', data: null, ...state.roster.major[loserStatus.status]};
            if (loserStatus.status === 'local' && state.roster.major[selectedTitle]?.name === 'Vacant') state.roster.local[loserStatus.key] = { name: 'Vacant', data: null, ...state.roster.local[loserStatus.key]};
            state.roster.major.undisputed = { ...state.roster.major.undisputed, name: winnerName, data: winnerData };
        } else if (state.roster.major[selectedTitle]) {
            bellCount = 4;
            if(winnerStatusBefore.status === 'local') state.roster.local[winnerStatusBefore.key] = { name: 'Vacant', data: null, ...state.roster.local[winnerStatusBefore.key]};
            if (loserStatus.status === 'local' && state.roster.major[selectedTitle]?.name === 'Vacant') state.roster.local[loserStatus.key] = { name: 'Vacant', data: null, ...state.roster.local[loserStatus.key]};
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
    updateChampionsDisplay(); 
    updateScoresAndDisplay();
    populateUniverseSelectors();
    saveUniverseToLocalStorage();
    dom.center.fightBtn.classList.add('hidden'); 
    dom.center.swapBtn.classList.add('hidden');
    dom.center.nextRoundBtn.classList.remove('hidden'); 
    dom.center.nextRoundClearBtn.classList.remove('hidden');
}

export function logFightMessage(html) {
    dom.fightModal.log.insertAdjacentHTML('beforeend', html);
    dom.fightModal.log.scrollTop = dom.fightModal.log.scrollHeight;
}


// --- HELPER & ADDITIONAL UI FUNCTIONS ---

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
    dom.fightModal.fighter1.healthBar.style.width = `${health1}%`;
    dom.fightModal.fighter1.healthText.textContent = `${health1.toFixed(1)} / 100`;
    dom.fightModal.fighter1.staminaBar.style.width = `${stamina1}%`;
    dom.fightModal.fighter1.staminaText.textContent = `Stamina: ${stamina1.toFixed(1)}%`;

    dom.fightModal.fighter2.healthBar.style.width = `${health2}%`;
    dom.fightModal.fighter2.healthText.textContent = `${health2.toFixed(1)} / 100`;
    dom.fightModal.fighter2.staminaBar.style.width = `${stamina2}%`;
    dom.fightModal.fighter2.staminaText.textContent = `Stamina: ${stamina2.toFixed(1)}%`;

    setTimeout(() => {
        dom.fightModal.fighter1.svg.classList.remove('hit-flash');
        dom.fightModal.fighter2.svg.classList.remove('hit-flash');
    }, 300);
}

export function displayInitialFighterTitles() {
    const status1 = getChampionStatus(state.fighter1.name);
    const status2 = getChampionStatus(state.fighter2.name);
    
    let titleHtml1 = '';
    if (status1.status !== 'contender') {
        const titleKey = status1.status === 'local' ? status1.key : status1.status;
        const titleObj = state.roster.major[titleKey] || state.roster.local[titleKey];
        if (titleObj) titleHtml1 = `${titleObj.symbol} ${titleKey.charAt(0).toUpperCase() + titleKey.slice(1)} Champion`;
    }
    dom.fightModal.fighter1.title.innerHTML = titleHtml1;

    let titleHtml2 = '';
    if (status2.status !== 'contender') {
        const titleKey = status2.status === 'local' ? status2.key : status2.status;
        const titleObj = state.roster.major[titleKey] || state.roster.local[titleKey];
        if (titleObj) titleHtml2 = `${titleObj.symbol} ${titleKey.charAt(0).toUpperCase() + titleKey.slice(1)} Champion`;
    }
    dom.fightModal.fighter2.title.innerHTML = titleHtml2;
}

export async function animateTitleBout() {
    if (state.selectedTitleForFight !== 'none') {
        const titleKey = state.selectedTitleForFight;
        const titleObject = state.roster.major[titleKey] || state.roster.local[titleKey];
        if (titleObject) {
            const titleName = titleKey.replace('interGenre', 'INTER-GENRE').toUpperCase();
            const announcement = `FOR THE ${titleName} CHAMPIONSHIP!`;
            dom.fightModal.titleBoutDisplay.innerHTML = `<span class="title-fanfare">${titleObject.symbol} ${announcement} ${titleObject.symbol}</span>`;
            await import('./utils.js').then(u => u.delay(4000));
        }
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
            return { key: key };
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

function updateTitleMatchAnnouncement() {
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
            const option = `<option value="${fighter.appId}">${fighter.name}</option>`;
            select1.insertAdjacentHTML('beforeend', option);
            select2.insertAdjacentHTML('beforeend', option);
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
    const { championList, localChampionList, universeFighterList, potentialMatchupsList, potentialTitlesList, retirementSelect, hallOfFameList, untappedGenresList, tappedGenresList } = dom.setupPanel;
    
    // 1. Clear existing content
    championList.innerHTML = '';
    localChampionList.innerHTML = '';
    universeFighterList.innerHTML = '';
    potentialMatchupsList.innerHTML = '';
    potentialTitlesList.innerHTML = '';
    retirementSelect.innerHTML = '';
    hallOfFameList.innerHTML = '';
    untappedGenresList.innerHTML = '';
    tappedGenresList.innerHTML = '';

    const sortedFighters = [...state.universeFighters].sort((a, b) => a.name.localeCompare(b.name));

    // 2. Populate Major Champions
    Object.entries(state.roster.major).forEach(([key, title]) => {
        const titleName = key.charAt(0).toUpperCase() + key.slice(1).replace('interGenre', 'Inter-Genre');
        championList.innerHTML += `
            <div class="flex items-center justify-between bg-gray-900 p-1 rounded">
                <span class="font-semibold">${title.symbol} ${titleName}:</span>
                <span class="truncate" title="${title.name}">${title.name}</span>
            </div>`;
    });

    // 3. Populate Local Champions
    if (Object.keys(state.roster.local).length > 0) {
        Object.entries(state.roster.local).forEach(([key, title]) => {
            const titleName = key.charAt(0).toUpperCase() + key.slice(1);
            localChampionList.innerHTML += `
                <div class="flex items-center justify-between bg-gray-900 p-1 rounded">
                    <span class="font-semibold">${title.symbol} ${titleName}:</span>
                    <span class="truncate" title="${title.name}">${title.name}</span>
                </div>`;
        });
    } else {
        localChampionList.innerHTML = `<p class="text-center text-gray-500 text-xs">No local titles exist yet.</p>`;
    }

    // 4. Populate Universe Fighters & Retirement Select & HOF
    const activeFighters = [];
    sortedFighters.forEach(fighter => {
        if (fighter.isRetired) {
            if (fighter.isHallOfFamer) {
                hallOfFameList.innerHTML += `<div class="bg-gray-900 p-1 rounded truncate text-amber-400 flex justify-between items-center">${HALL_OF_FAME_SYMBOL} ${fighter.name} <button data-appid="${fighter.appId}" class="reactivate-btn bg-green-700 hover:bg-green-600 px-2 py-0.5 rounded text-white text-xs">Reactivate</button></div>`;
            }
        } else {
            activeFighters.push(fighter);
            universeFighterList.innerHTML += `<div class="universe-fighter-entry cursor-pointer hover:bg-gray-700 p-1 rounded" data-appid="${fighter.appId}">${fighter.name}</div>`;
            retirementSelect.innerHTML += `<option value="${fighter.appId}">${fighter.name}</option>`;
        }
    });

    if (hallOfFameList.innerHTML === '') {
        hallOfFameList.innerHTML = `<p class="text-center text-gray-500 text-xs">The Hall of Fame awaits its first inductee.</p>`;
    }


    // 5. Calculate & Display Potential Matchups
    const allPotentialMatchups = [];
    for (let i = 0; i < activeFighters.length; i++) {
        for (let j = i + 1; j < activeFighters.length; j++) {
            const f1 = activeFighters[i];
            const f2 = activeFighters[j];
            const score1 = applyBonuses(calculateRawScore(f1), f1);
            const score2 = applyBonuses(calculateRawScore(f2), f2);
            allPotentialMatchups.push({ f1, f2, scoreDiff: Math.abs(score1 - score2) });
        }
    }
    
    allPotentialMatchups.sort((a, b) => a.scoreDiff - b.scoreDiff);
    allPotentialMatchups.slice(0, 10).forEach(match => {
        potentialMatchupsList.innerHTML += `
            <div class="bg-gray-900 p-1 rounded text-xs flex justify-between items-center">
                <span>${match.f1.name} vs ${match.f2.name}</span>
                <button class="load-match-btn bg-blue-600 hover:bg-blue-700 text-white px-2 py-0.5 rounded" data-f1-id="${match.f1.appId}" data-f2-id="${match.f2.appId}" data-titles="[]">Load</button>
            </div>`;
    });

     if (potentialMatchupsList.innerHTML === '') {
        potentialMatchupsList.innerHTML = `<p class="text-center text-gray-500 text-xs">No close matchups found.</p>`;
    }
    
    // 6. Calculate and Display Potential Title Fights
    const allPotentialTitles = [];
    activeFighters.forEach(f1 => {
        activeFighters.forEach(f2 => {
            if (f1.appId === f2.appId) return;
            const titles = getAvailableTitleFights(f1, f2);
            if (titles.length > 0) {
                 allPotentialTitles.push({f1, f2, titles});
            }
        });
    });

    // Simple sort for now, can be improved
    allPotentialTitles.slice(0, 10).forEach(match => {
        const titleInfo = match.titles[0]; // Just show the first available title for simplicity
        potentialTitlesList.innerHTML += `
            <div class="bg-gray-900 p-1 rounded text-xs flex justify-between items-center">
                <span class="truncate pr-2" title="${match.f1.name} vs ${match.f2.name} for ${titleInfo.name}">${titleInfo.name}</span>
                <button class="load-match-btn bg-amber-600 hover:bg-amber-700 text-white px-2 py-0.5 rounded" data-f1-id="${match.f1.appId}" data-f2-id="${match.f2.appId}" data-titles='${JSON.stringify(match.titles)}'>Load</button>
            </div>
        `;
    });

    if (potentialTitlesList.innerHTML === '') {
        potentialTitlesList.innerHTML = `<p class="text-center text-gray-500 text-xs">No title fights available.</p>`;
    }


    // 7. Untapped and Tapped Genres
    const allGenres = new Set(state.universeFighters.flatMap(f => f.genres || []));
    const tappedGenres = new Set(Object.keys(state.roster.local));
    
    allGenres.forEach(genre => {
        if (!genre) return;
        const list = tappedGenres.has(genre) ? tappedGenresList : untappedGenresList;
        const formattedGenre = genre.charAt(0).toUpperCase() + genre.slice(1);
        list.innerHTML += `
            <button class="bg-gray-900 hover:bg-gray-700 p-1 rounded w-full text-left genre-expand-btn" data-genre="${genre}">
                ${formattedGenre}
            </button>`;
    });

    if (untappedGenresList.innerHTML === '') untappedGenresList.innerHTML = `<p class="text-xs text-gray-500 text-center">No untapped genres.</p>`;
    if (tappedGenresList.innerHTML === '') tappedGenresList.innerHTML = `<p class="text-xs text-gray-500 text-center">No existing titles to expand.</p>`;
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
    if (!fighter1 || !fighter2 || !fighter1.appId || !fighter2.appId) return [];

    const available = [];
    const status1 = getChampionStatus(fighter1.name);
    const status2 = getChampionStatus(fighter2.name);
    const weightClass1 = getWeightClass(calculateRawScore(fighter1));
    const weightClass2 = getWeightClass(calculateRawScore(fighter2));

    const isSameWeightClass = weightClass1 === weightClass2 && weightClass1 !== 'Unranked';

    // Rule 1: Challenge for current champion's title
    const checkChallenge = (challengerStatus, championStatus, f1, f2) => {
        if (championStatus.status === 'undisputed' && challengerStatus.status !== 'contender' && challengerStatus.status !== 'local') {
             available.push({ key: 'undisputed', name: 'Undisputed Title', symbol: state.roster.major.undisputed.symbol });
        } else if (['heavyweight', 'cruiserweight', 'featherweight', 'interGenre'].includes(championStatus.status)) {
            if(challengerStatus.status !== 'contender') {
                 available.push({ key: championStatus.status, name: `${championStatus.status.charAt(0).toUpperCase() + championStatus.status.slice(1)} Title`, symbol: state.roster.major[championStatus.status].symbol });
            }
        } else if (championStatus.status === 'local') {
            const commonGenres = (f1.genres || []).filter(g => (f2.genres || []).includes(g));
            if (commonGenres.includes(championStatus.key)) {
                available.push({ key: championStatus.key, name: `${championStatus.key.charAt(0).toUpperCase() + championStatus.key.slice(1)} Title`, symbol: state.roster.local[championStatus.key].symbol });
            }
        }
    };
    
    if (status2.status !== 'contender') checkChallenge(status1, status2, fighter1, fighter2);
    if (status1.status !== 'contender') checkChallenge(status2, status1, fighter2, fighter1);

    // Rule 2: Fight for vacant titles
    if (status1.status === 'contender' && status2.status === 'contender') {
        const commonGenres = (fighter1.genres || []).filter(g => (fighter2.genres || []).includes(g));
        commonGenres.forEach(genre => {
            if (state.roster.local[genre] && state.roster.local[genre].name === 'Vacant') {
                available.push({ key: genre, name: `Vacant ${genre.charAt(0).toUpperCase() + genre.slice(1)} Title`, symbol: state.roster.local[genre].symbol });
            }
        });
    }

    const bothAreLocalChamps = status1.status === 'local' && status2.status === 'local';
    if (bothAreLocalChamps) {
        if (state.roster.major.interGenre.name === 'Vacant') {
            available.push({ key: 'interGenre', name: 'Vacant Inter-Genre Title', symbol: state.roster.major.interGenre.symbol });
        }
        if (isSameWeightClass && state.roster.major[weightClass1.toLowerCase()] && state.roster.major[weightClass1.toLowerCase()].name === 'Vacant') {
             available.push({ key: weightClass1.toLowerCase(), name: `Vacant ${weightClass1} Title`, symbol: state.roster.major[weightClass1.toLowerCase()].symbol });
        }
    }

    const isMajorChamp1 = ['heavyweight', 'cruiserweight', 'featherweight', 'interGenre'].includes(status1.status);
    const isMajorChamp2 = ['heavyweight', 'cruiserweight', 'featherweight', 'interGenre'].includes(status2.status);
    if (isMajorChamp1 && isMajorChamp2 && status1.status !== status2.status) {
         if (state.roster.major.undisputed.name === 'Vacant') {
             available.push({ key: 'undisputed', name: 'Vacant Undisputed Title', symbol: state.roster.major.undisputed.symbol });
         }
    }

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
                    <input type="radio" name="title-option" value="${titleInfo.key || titleInfo.value}" class="form-radio h-5 w-5 text-amber-500 bg-gray-900 border-gray-600 focus:ring-amber-400">
                    <span class="font-semibold">${titleInfo.symbol} ${titleInfo.name || titleInfo.text}</span>
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

export function setSelectedTitle(title) {
    state.selectedTitleForFight = title;
    updateTitleMatchAnnouncement();
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

