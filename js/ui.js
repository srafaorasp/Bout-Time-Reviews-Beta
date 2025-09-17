import { state, dom, createNewFighter, updateFighterInUniverse, saveUniverseToLocalStorage, GENRE_SYMBOLS, PAST_TITLE_SYMBOLS, GRAND_SLAM_SYMBOL, HALL_OF_FAME_SYMBOL, addFighterToUniverse, loadRoster, updateTimestamp } from './state.js';
import { calculateRawScore, applyBonuses, getWeightClass } from './fight.js';
import { downloadJSON } from './utils.js';
import { fetchWithProxyRotation } from './api.js';

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
