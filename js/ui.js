import { state, dom, createNewFighter, updateFighterInUniverse, saveUniverseToLocalStorage, GENRE_SYMBOLS, PAST_TITLE_SYMBOLS, GRAND_SLAM_SYMBOL, HALL_OF_FAME_SYMBOL } from './state.js';
import { calculateRawScore, applyBonuses, getWeightClass, getChampionshipBonus } from './fight-logic.js';
import { downloadJSON } from './utils.js';

// --- UI & DISPLAY FUNCTIONS ---

export function showToast(message, duration = 5000) {
    const toast = dom.toast;
    toast.message.textContent = message;
    toast.container.classList.remove('hidden');
    toast.container.classList.add('opacity-100');
    
    setTimeout(() => {
        toast.container.classList.remove('opacity-100');
        setTimeout(() => toast.container.classList.add('hidden'), 300);
    }, duration);
}

export function showConfirmationModal(title, message, onConfirm) {
    return new Promise((resolve) => {
        const modal = dom.confirmationModal;
        modal.title.textContent = title;
        modal.message.textContent = message;

        const confirmHandler = () => {
            modal.modal.classList.add('hidden');
            if (onConfirm) onConfirm();
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

// ... (All other UI functions like clearCard, loadCardFromData, updateScoresAndDisplay, etc., will be moved here)

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

    // ... (Rest of the update logic will go here)
}

// Placeholder for other UI functions that will be moved
export function clearCard(prefix) {}
export function loadCardFromData(prefix, data) {}
export function displayFightWinner() {}
export function masterReset() {}
export function swapCards() {}
export function prepareNextRound() {}
export function clearBothCards() {}
export function openTitleSelectionModal() {}
export function applyRosterChanges() {}
export function populateSetupPanel() {}
export function handleLoadMatchClick() {}
export function displayFighterInfoModal() {}
export function retireFighter() {}
export function openGenreExpansionModal() {}
export function openTop100Selection() {}
export function updateFightUI() {}
export function logFightMessage(html) {
    dom.fightModal.log.insertAdjacentHTML('beforeend', html);
    dom.fightModal.log.scrollTop = dom.fightModal.log.scrollHeight;
}
export function populateUniverseSelectors() {}
export function updateChampionsDisplay() {}

