import { showToast, populateSetupPanel, updateChampionsDisplay, updateScoresAndDisplay, populateUniverseSelectors, masterReset, swapCards, openTitleSelectionModal, applyRosterChanges, handleLoadMatchClick, displayFighterInfoModal, retireFighter, openGenreExpansionModal, openTop100Selection, populateAndShowEditModal, clearForNextRound, loadCardFromData, clearCard, clearBothCards } from './ui.js';
import { fetchSteamData, updateScoresOnly, fetchAndAddSingleFighter, populateUniverseFromSteamIds } from './api.js';
import { startFight } from './fight.js';
import { downloadJSON, triggerFileUpload } from './utils.js';

// --- STATE MANAGEMENT ---
export let state = {
    fighter1: null,
    fighter2: null,
    universeFighters: [],
    score1: 0,
    score2: 0,
    selectedTitleForFight: 'none',
    boutWinnerData: null,
    fightCancellationToken: { cancelled: false },
    roster: {
        major: {
            featherweight: { name: 'Vacant', data: null, symbol: '⚖️' },
            cruiserweight: { name: 'Vacant', data: null, symbol: '⚖️' },
            heavyweight: { name: 'Vacant', data: null, symbol: '👑' },
            interGenre: { name: 'Vacant', data: null, symbol: '⭐' },
            undisputed: { name: 'Vacant', data: null, symbol: '💎' }
        },
        local: {}
    },
    currentRecordEditTarget: null,
};

// --- DOM ELEMENT SELECTION (centralized) ---
export const dom = {};

// --- CONSTANTS & CONFIG ---
const UNIVERSE_STORAGE_KEY = 'boutTimeUniverseData';
export const GENRE_SYMBOLS = ['💥', '✨', '🔥', '💧', '🌱', '⚡️', '💨', '☀️', '🌙', '🌟', '🎲', '♟️', '🗺️', '🧭', '⚙️', '🏆', '🧩', '🎯', '🏁', '🥊', '🎶', '🎨', '📚', '🔬'];
export const PAST_TITLE_SYMBOLS = { undisputed: '💠', major: '⚓', local: '🏵️' };
export const GRAND_SLAM_SYMBOL = '⚜️';
export const HALL_OF_FAME_SYMBOL = '🏛️';
export const titlePriority = { undisputed: 0, interGenre: 1, heavyweight: 1, cruiserweight: 1, featherweight: 1 };
export const punchTypes = [ "jab", "cross", "hook", "uppercut", "overhand right", "body shot", "check hook", "bolo punch", "haymaker" ];


// --- INITIALIZATION ---
export function initializeApp() {
    selectDOMElements();
    state.fighter1 = createNewFighter();
    state.fighter2 = createNewFighter();
    const isLoaded = loadUniverseFromLocalStorage();
    if (!isLoaded) {
        dom.universeSetupModal.modal.classList.remove('hidden');
    }
    updateScoresAndDisplay();
}

// --- STATE FUNCTIONS ---
export function createNewFighter() {
    return {
        name: '', devHouse: '', publisher: '',
        record: { tko: 0, ko: 0, losses: 0, pastTitles: {} },
        scores: { metacritic: '' },
        steamData: null,
        genres: [],
        appId: null,
        isHallOfFamer: false,
        isRetired: false,
        lastModified: new Date().toISOString()
    };
}

export const updateTimestamp = (fighter) => {
    if (fighter) {
        fighter.lastModified = new Date().toISOString();
    }
};

export function updateFighterInUniverse(fighterData) {
    if (!fighterData || !fighterData.appId) return;
    const index = state.universeFighters.findIndex(f => f.appId === fighterData.appId);
    if (index !== -1) {
        // Deep merge to avoid losing properties
        state.universeFighters[index] = { ...state.universeFighters[index], ...JSON.parse(JSON.stringify(fighterData)) };
    }
    saveUniverseToLocalStorage();
}

// --- SAVE & LOAD ---
export function saveUniverseToLocalStorage() {
    try {
        const universeData = {
            universeFighters: state.universeFighters,
            roster: state.roster
        };
        localStorage.setItem(UNIVERSE_STORAGE_KEY, JSON.stringify(universeData));
    } catch (e) {
        console.error("Failed to save universe to local storage:", e);
        showToast("Error: Could not save universe. Storage might be full.", 5000);
    }
}

function loadUniverseFromLocalStorage() {
    try {
        const savedData = localStorage.getItem(UNIVERSE_STORAGE_KEY);
        if (savedData) {
            const parsedData = JSON.parse(savedData);
            if (parsedData.universeFighters && parsedData.roster) {
                state.universeFighters = parsedData.universeFighters;
                loadRoster(parsedData.roster);
                populateUniverseSelectors();
                showToast("Universe loaded from previous session!", 3000);
                return true;
            }
        }
    } catch (e) {
        console.error("Failed to load universe from local storage:", e);
        localStorage.removeItem(UNIVERSE_STORAGE_KEY);
    }
    return false;
}

export function loadRoster(data) {
    const defaultMajor = {
        featherweight: { name: 'Vacant', data: null, symbol: '⚖️' },
        cruiserweight: { name: 'Vacant', data: null, symbol: '⚖️' },
        heavyweight: { name: 'Vacant', data: null, symbol: '👑' },
        interGenre: { name: 'Vacant', data: null, symbol: '⭐' },
        undisputed: { name: 'Vacant', data: null, symbol: '💎' }
    };
    state.roster.major = Object.assign({}, defaultMajor, data.major);
    state.roster.local = data.local || {};

    populateSetupPanel();
    updateChampionsDisplay();
    updateScoresAndDisplay();
}

// --- Universe and Title Generation ---
export function processUniverseForNewTitles() {
    const genreCounts = {};
    state.universeFighters.forEach(fighter => {
        (fighter.genres || []).forEach(genre => {
            const g = genre.toLowerCase();
            genreCounts[g] = (genreCounts[g] || 0) + 1;
        });
    });

    const newTitles = [];
    let symbolsUsed = Object.values(state.roster.local).map(t => t.symbol);

    Object.entries(genreCounts).forEach(([genre, count]) => {
        if (count >= 2 && !state.roster.local[genre]) {
            const availableSymbols = GENRE_SYMBOLS.filter(s => !symbolsUsed.includes(s));
            const symbol = availableSymbols.length > 0 ? availableSymbols[0] : '🎖️';
            symbolsUsed.push(symbol);

            const titleName = genre.charAt(0).toUpperCase() + genre.slice(1);
            state.roster.local[genre] = { name: 'Vacant', data: null, symbol: symbol };
            newTitles.push(titleName);
        }
    });

    if (newTitles.length > 0) {
        showToast(`New Titles Created: ${newTitles.join(', ')}`);
        populateSetupPanel();
    }
    return newTitles.length > 0;
}

export function addFighterToUniverse(fighterData) {
    if (!fighterData.appId) return;
    const exists = state.universeFighters.some(f => f.appId === fighterData.appId);
    if (!exists) {
        state.universeFighters.push(JSON.parse(JSON.stringify(fighterData)));
        populateUniverseSelectors();
        const titlesCreated = processUniverseForNewTitles();
        if (!titlesCreated) {
            showToast(`${fighterData.name} added to the universe!`);
        }
        saveUniverseToLocalStorage();
    }
}


// --- DOM Selection and Event Listeners ---
function selectDOMElements() {
    // This function populates the dom object.
    Object.assign(dom, {
        triggers: { reset: document.getElementById('reset-trigger'), setup: document.getElementById('setup-trigger'), help: document.getElementById('help-btn'), refresh: document.getElementById('refresh-btn') },
        cards: {
            item1: { card: document.getElementById('item1-card'), name: document.getElementById('item1-name'), symbol: document.getElementById('item1-symbol'), record: document.getElementById('item1-record'), weightClass: document.getElementById('item1-weight-class'), steamId: document.getElementById('item1-steam-id'), fetchSteamBtn: document.getElementById('item1-fetch-steam-btn'), steamError: document.getElementById('item1-steam-error'), steamScoreDisplay: document.getElementById('item1-steam-score-display'), metacritic: document.getElementById('item1-metacritic'), metacriticError: document.getElementById('item1-metacritic-error'), devHouse: document.getElementById('item1-dev-house'), publisher: document.getElementById('item1-publisher'), editRecordBtn: document.getElementById('item1-edit-record-btn'), importBtn: document.getElementById('item1-import-btn'), exportBtn: document.getElementById('item1-export-btn'), updateScoresBtn: document.getElementById('item1-update-scores-btn'), statusMessage: document.getElementById('item1-status-message'), universeSelect: document.getElementById('item1-universe-select') },
            item2: { card: document.getElementById('item2-card'), name: document.getElementById('item2-name'), symbol: document.getElementById('item2-symbol'), record: document.getElementById('item2-record'), weightClass: document.getElementById('item2-weight-class'), steamId: document.getElementById('item2-steam-id'), fetchSteamBtn: document.getElementById('item2-fetch-steam-btn'), steamError: document.getElementById('item2-steam-error'), steamScoreDisplay: document.getElementById('item2-steam-score-display'), metacritic: document.getElementById('item2-metacritic'), metacriticError: document.getElementById('item2-metacritic-error'), devHouse: document.getElementById('item2-dev-house'), publisher: document.getElementById('item2-publisher'), editRecordBtn: document.getElementById('item2-edit-record-btn'), importBtn: document.getElementById('item2-import-btn'), exportBtn: document.getElementById('item2-export-btn'), updateScoresBtn: document.getElementById('item2-update-scores-btn'), statusMessage: document.getElementById('item2-status-message'), universeSelect: document.getElementById('item2-universe-select') }
        },
        center: { openRosterBtn: document.getElementById('open-roster-btn'), featherweightChamp: document.getElementById('featherweight-champ'), cruiserweightChamp: document.getElementById('cruiserweight-champ'), heavyweightChamp: document.getElementById('heavyweight-champ'), interGenreChamp: document.getElementById('intergenre-champ'), undisputedChamp: document.getElementById('undisputed-champ'), finalLabel1: document.getElementById('item1-final-label'), titleDisplay1: document.getElementById('item1-title-display'), finalScore1: document.getElementById('item1-final-score'), rawScoreDisplay1: document.getElementById('item1-raw-score-display'), vsRecord1: document.getElementById('item1-vs-record'), finalLabel2: document.getElementById('item2-final-label'), titleDisplay2: document.getElementById('item2-title-display'), finalScore2: document.getElementById('item2-final-score'), rawScoreDisplay2: document.getElementById('item2-raw-score-display'), vsRecord2: document.getElementById('item2-vs-record'), roundsDisplay: document.getElementById('rounds-display'), oddsArrowLeft: document.getElementById('odds-arrow-left'), oddsText: document.getElementById('odds-text'), oddsArrowRight: document.getElementById('odds-arrow-right'), titleSelectBtn: document.getElementById('title-select-btn'), titleMatchAnnouncement: document.getElementById('title-match-announcement'), commonGenresContainer: document.getElementById('common-genres-container'), commonGenresDisplay: document.getElementById('common-genres-display'), winnerBox: { indicator: document.getElementById('test-indicator'), title: document.getElementById('winner-title'), text: document.getElementById('winnerText'), }, fightBtn: document.getElementById('fight-btn'), swapBtn: document.getElementById('swap-btn'), lowCardCheckbox: document.getElementById('low-card-checkbox'), skipTickerCheckbox: document.getElementById('skip-ticker-checkbox'), enableAnnouncerCheckbox: document.getElementById('enable-announcer-checkbox'), nextRoundBtn: document.getElementById('next-round-btn'), nextRoundClearBtn: document.getElementById('next-round-clear-btn'), },
        fightModal: { modal: document.getElementById('fight-modal'), skipIntroBtn: document.getElementById('skip-intro-live-btn'), ticker: document.getElementById('fight-ticker'), tickerText: document.getElementById('ticker-text'), roundCounter: document.getElementById('fight-round-counter'), turnCounter: document.getElementById('fight-turn-counter'), titleBoutDisplay: document.getElementById('fight-title-bout-display'), titleWinAnnouncement: document.getElementById('fight-title-win-announcement'),
            fighter1: { title: document.getElementById('fighter1-title-display'), name: document.getElementById('fighter1-name-modal'), hitBonus: document.getElementById('fighter1-hit-bonus'), svg: document.getElementById('fighter1-svg'), healthBar: document.getElementById('health-bar-1'), healthText: document.getElementById('health-text-1'), staminaBar: document.getElementById('stamina-bar-1'), staminaText: document.getElementById('stamina-text-1'), staminaState: document.getElementById('stamina-state-1') },
            fighter2: { title: document.getElementById('fighter2-title-display'), name: document.getElementById('fighter2-name-modal'), hitBonus: document.getElementById('fighter2-hit-bonus'), svg: document.getElementById('fighter2-svg'), healthBar: document.getElementById('health-bar-2'), healthText: document.getElementById('health-text-2'), staminaBar: document.getElementById('stamina-bar-2'), staminaText: document.getElementById('stamina-text-2'), staminaState: document.getElementById('stamina-state-2') },
            referee: document.getElementById('referee-svg'),
            boxScoreContainer: document.getElementById('box-score-container'),
            log: document.getElementById('fight-log'), disableDelayCheckbox: document.getElementById('disable-delay-checkbox'), returnBtn: document.getElementById('return-to-main-btn'), },
        setupPanel: { panel: document.getElementById('setup-panel'), rosterStatus: document.getElementById('roster-status'), closeBtn: document.getElementById('close-setup-btn'), championList: document.getElementById('champion-list'), localChampionList: document.getElementById('local-champion-list'), universeFighterList: document.getElementById('universe-fighter-list'), applyBtn: document.getElementById('apply-roster-changes-btn'), addFighterIdInput: document.getElementById('add-fighter-steam-id'), addFighterBtn: document.getElementById('add-fighter-btn'), exportBtn: document.getElementById('export-roster-btn'), potentialMatchupsList: document.getElementById('potential-matchups-list'), potentialTitlesList: document.getElementById('potential-titles-list'), retirementSelect: document.getElementById('retirement-fighter-select'), retireForgottenBtn: document.getElementById('retire-forgotten-btn'), retireHofBtn: document.getElementById('retire-hof-btn'), hallOfFameList: document.getElementById('hall-of-fame-list'), untappedGenresList: document.getElementById('untapped-genres-list'), tappedGenresList: document.getElementById('tapped-genres-list') },
        editRecordModal: { modal: document.getElementById('edit-record-modal'), tko: document.getElementById('record-tko'), ko: document.getElementById('record-ko'), losses: document.getElementById('record-losses'), pastTitlesEditor: document.getElementById('past-titles-editor'), saveBtn: document.getElementById('save-record-btn'), cancelBtn: document.getElementById('cancel-record-btn') },
        titleSelectModal: { modal: document.getElementById('title-select-modal'), optionsContainer: document.getElementById('title-options-container'), confirmBtn: document.getElementById('confirm-title-select-btn'), cancelBtn: document.getElementById('cancel-title-select-btn'), },
        helpModal: { modal: document.getElementById('help-modal'), closeBtn: document.getElementById('close-help-btn'), closeBtnBottom: document.getElementById('close-help-btn-bottom') },
        universeSetupModal: { modal: document.getElementById('universe-setup-modal'), idsInput: document.getElementById('steam-ids-input'), singleIdInput: document.getElementById('single-steam-id-input'), addSingleIdBtn: document.getElementById('add-single-steam-id-btn'), error: document.getElementById('universe-setup-error'), startBtn: document.getElementById('start-universe-btn'), importBtn: document.getElementById('import-universe-btn'), loadPresetBtn: document.getElementById('load-preset-universe-btn'), selectTop100Btn: document.getElementById('select-top-100-btn') },
        top100Modal: { modal: document.getElementById('top-100-modal'), list: document.getElementById('top-100-list'), search: document.getElementById('top-100-search'), clearBtn: document.getElementById('top-100-clear-selection-btn'), status: document.getElementById('top-100-status'), cancelBtn: document.getElementById('cancel-top-100-btn'), confirmBtn: document.getElementById('confirm-top-100-btn') },
        originLockoutModal: { modal: document.getElementById('origin-lockout-modal'), newFighter: document.getElementById('lockout-new-fighter'), origin: document.getElementById('lockout-origin'), existingFighter: document.getElementById('lockout-existing-fighter'), skipBtn: document.getElementById('skip-origin-btn'), keepBtn: document.getElementById('keep-origin-btn') },
        genreExpansionModal: { modal: document.getElementById('genre-expansion-modal'), title: document.getElementById('genre-expansion-title'), list: document.getElementById('genre-expansion-list'), status: document.getElementById('genre-expansion-status'), cancelBtn: document.getElementById('cancel-genre-expansion-btn'), confirmBtn: document.getElementById('confirm-genre-expansion-btn') },
        toast: { container: document.getElementById('toast-notification'), message: document.getElementById('toast-message') },
        confirmationModal: { modal: document.getElementById('confirmation-modal'), title: document.getElementById('confirmation-title'), message: document.getElementById('confirmation-message'), confirmBtn: document.getElementById('confirm-action-btn'), cancelBtn: document.getElementById('confirm-cancel-btn') },
        fighterInfoModal: { modal: document.getElementById('fighter-info-modal'), name: document.getElementById('info-modal-name'), record: document.getElementById('info-modal-record'), weightClass: document.getElementById('info-modal-weight-class'), dev: document.getElementById('info-modal-dev'), publisher: document.getElementById('info-modal-publisher'), genres: document.getElementById('info-modal-genres'), titleHistory: document.getElementById('info-modal-title-history'), closeBtn: document.getElementById('close-info-modal-btn') }
    });
}

export function attachEventListeners() {
    dom.cards.item1.fetchSteamBtn.addEventListener('click', () => fetchSteamData(dom.cards.item1.steamId.value, 'item1'));
    dom.cards.item2.fetchSteamBtn.addEventListener('click', () => fetchSteamData(dom.cards.item2.steamId.value, 'item2'));
    dom.cards.item1.updateScoresBtn.addEventListener('click', () => updateScoresOnly(dom.cards.item1.steamId.value, 'item1'));
    dom.cards.item2.updateScoresBtn.addEventListener('click', () => updateScoresOnly(dom.cards.item2.steamId.value, 'item2'));
    
    dom.center.fightBtn.addEventListener('click', startFight); 
    dom.center.nextRoundBtn.addEventListener('click', () => {
        if (state.boutWinnerData) {
            const winnerDataCopy = JSON.parse(JSON.stringify(state.boutWinnerData));
            clearCard('item1');
            loadCardFromData('item2', winnerDataCopy);
            clearForNextRound();
        } else {
            clearBothCards();
        }
    }); 
    dom.center.nextRoundClearBtn.addEventListener('click', clearBothCards); 
    dom.center.swapBtn.addEventListener('click', swapCards); 
    dom.triggers.reset.addEventListener('click', masterReset);
    dom.triggers.refresh.addEventListener('click', () => {
        if (state.fighter1 && state.fighter1.appId) {
            const freshFighter1 = state.universeFighters.find(f => f.appId === state.fighter1.appId);
            if (freshFighter1) loadCardFromData('item1', freshFighter1);
        }
        if (state.fighter2 && state.fighter2.appId) {
            const freshFighter2 = state.universeFighters.find(f => f.appId === state.fighter2.appId);
            if (freshFighter2) loadCardFromData('item2', freshFighter2);
        }
        updateScoresAndDisplay();
        showToast("UI Data Refreshed!", 3000);
    });
    dom.center.lowCardCheckbox.addEventListener('change', updateScoresAndDisplay);
    dom.center.titleSelectBtn.addEventListener('click', openTitleSelectionModal);
    
    dom.titleSelectModal.confirmBtn.addEventListener('click', () => { 
        const selectedOption = document.querySelector('input[name="title-option"]:checked'); 
        if (selectedOption) import('./ui.js').then(ui => ui.setSelectedTitle(selectedOption.value));
        updateScoresAndDisplay(); 
        dom.titleSelectModal.modal.classList.add('hidden'); 
    });

    dom.fightModal.returnBtn.addEventListener('click', () => dom.fightModal.modal.classList.add('hidden')); 
    dom.fightModal.skipIntroBtn.addEventListener('click', () => { state.fightCancellationToken.cancelled = true; if('speechSynthesis' in window) speechSynthesis.cancel(); });
    dom.titleSelectModal.cancelBtn.addEventListener('click', () => dom.titleSelectModal.modal.classList.add('hidden'));
    
    dom.triggers.setup.addEventListener('click', () => { populateSetupPanel(); dom.setupPanel.panel.classList.remove('hidden') });
    dom.center.openRosterBtn.addEventListener('click', () => { populateSetupPanel(); dom.setupPanel.panel.classList.remove('hidden'); });
    dom.setupPanel.closeBtn.addEventListener('click', () => dom.setupPanel.panel.classList.add('hidden'));
    dom.setupPanel.applyBtn.addEventListener('click', applyRosterChanges);
    dom.setupPanel.addFighterBtn.addEventListener('click', () => fetchAndAddSingleFighter(dom.setupPanel.addFighterIdInput.value));
    document.getElementById('reset-universe-btn').addEventListener('click', masterReset);
    
    dom.cards.item1.exportBtn.addEventListener('click', () => { if(state.fighter1.appId) downloadJSON(state.fighter1, `${state.fighter1.name || 'fighter_1'}.btr`) });
    dom.cards.item2.exportBtn.addEventListener('click', () => { if(state.fighter2.appId) downloadJSON(state.fighter2, `${state.fighter2.name || 'fighter_2'}.btr`) });
    dom.setupPanel.exportBtn.addEventListener('click', () => downloadJSON({ roster: state.roster, universeFighters: state.universeFighters }, 'bout_time_universe.btr'));
    
    dom.cards.item1.importBtn.addEventListener('click', () => triggerFileUpload((data) => { loadCardFromData('item1', data); updateScoresAndDisplay(); }, '.btr'));
    dom.cards.item2.importBtn.addEventListener('click', () => triggerFileUpload((data) => { loadCardFromData('item2', data); updateScoresAndDisplay(); }, '.btr'));

    dom.cards.item1.editRecordBtn.addEventListener('click', () => { if(state.fighter1.appId) populateAndShowEditModal(state.fighter1) });
    dom.cards.item2.editRecordBtn.addEventListener('click', () => { if(state.fighter2.appId) populateAndShowEditModal(state.fighter2) });
    
    dom.editRecordModal.saveBtn.addEventListener('click', () => { 
        const fighter = state.universeFighters.find(f => f.appId === state.currentRecordEditTarget);
        if (!fighter) return;

        fighter.record.tko = parseInt(dom.editRecordModal.tko.value, 10) || 0; 
        fighter.record.ko = parseInt(dom.editRecordModal.ko.value, 10) || 0; 
        fighter.record.losses = parseInt(dom.editRecordModal.losses.value, 10) || 0; 
        
        const pastTitles = {}; 
        dom.editRecordModal.pastTitlesEditor.querySelectorAll('input[data-title-key]').forEach(input => { 
            const count = parseInt(input.value, 10) || 0; 
            if (count > 0) pastTitles[input.dataset.titleKey] = count; 
        }); 
        fighter.record.pastTitles = pastTitles; 
        
        updateTimestamp(fighter);
        updateFighterInUniverse(fighter); 

        // Also update the fighter if it's currently loaded in a card
        if (state.fighter1.appId === fighter.appId) loadCardFromData('item1', fighter);
        if (state.fighter2.appId === fighter.appId) loadCardFromData('item2', fighter);
        
        import('./ui.js').then(ui => ui.updateRecordDisplays()); 
        updateScoresAndDisplay(); 
        dom.editRecordModal.modal.classList.add('hidden'); 
    });
    dom.editRecordModal.cancelBtn.addEventListener('click', () => dom.editRecordModal.modal.classList.add('hidden'));
    
    dom.triggers.help.addEventListener('click', () => dom.helpModal.modal.classList.remove('hidden'));
    dom.helpModal.closeBtn.addEventListener('click', () => dom.helpModal.modal.classList.add('hidden'));
    dom.helpModal.closeBtnBottom.addEventListener('click', () => dom.helpModal.modal.classList.add('hidden'));

    dom.cards.item1.universeSelect.addEventListener('change', (e) => {
        const appId = e.target.value;
        if (state.fighter2 && state.fighter2.appId && appId === state.fighter2.appId) {
            showToast("This fighter is already in the other corner!", 4000);
            e.target.value = state.fighter1.appId || '';
            return;
        }
        if (appId) {
            const selectedFighter = state.universeFighters.find(f => f.appId === appId);
            if (selectedFighter) {
                loadCardFromData('item1', selectedFighter);
                updateScoresAndDisplay();
            }
        } else {
            clearCard('item1');
            updateScoresAndDisplay();
        }
    });

    dom.cards.item2.universeSelect.addEventListener('change', (e) => {
        const appId = e.target.value;
        if (state.fighter1 && state.fighter1.appId && appId === state.fighter1.appId) {
            showToast("This fighter is already in the other corner!", 4000);
            e.target.value = state.fighter2.appId || '';
            return;
        }
        if (appId) {
            const selectedFighter = state.universeFighters.find(f => f.appId === appId);
            if (selectedFighter) {
                loadCardFromData('item2', selectedFighter);
                updateScoresAndDisplay();
            }
        } else {
            clearCard('item2');
            updateScoresAndDisplay();
        }
    });

    dom.universeSetupModal.importBtn.addEventListener('click', () => {
        triggerFileUpload((data) => {
            if (data.roster && data.universeFighters) {
                state.universeFighters = data.universeFighters;
                loadRoster(data.roster);
                populateUniverseSelectors();
                dom.universeSetupModal.modal.classList.add('hidden');
                saveUniverseToLocalStorage();
                showToast('Universe successfully imported!', 5000);
            } else {
                showToast('Error: Invalid universe file format.', 5000);
            }
        }, '.btr');
    });

    dom.universeSetupModal.loadPresetBtn.addEventListener('click', () => {
        const presetIds = ["294100","427520","457140","105600","108600","975370","892970","526870","219740","1328670"];
        dom.universeSetupModal.idsInput.value = presetIds.join(', ');
        showToast("Preset fighter IDs loaded!", 3000);
    });

    dom.universeSetupModal.selectTop100Btn.addEventListener('click', openTop100Selection);

    dom.universeSetupModal.startBtn.addEventListener('click', () => {
        const idsText = dom.universeSetupModal.idsInput.value;
        const ids = idsText.split(',').map(id => id.trim()).filter(id => /^\d+$/.test(id));
        if (ids.length < 6) {
            dom.universeSetupModal.error.textContent = 'Please enter at least 6 valid, comma-separated Steam App IDs.';
        } else {
            dom.universeSetupModal.error.textContent = '';
            populateUniverseFromSteamIds(ids);
        }
    });

    dom.universeSetupModal.addSingleIdBtn.addEventListener('click', () => {
        const singleId = dom.universeSetupModal.singleIdInput.value.trim();
        if (/^\d+$/.test(singleId)) {
            const currentIds = dom.universeSetupModal.idsInput.value.trim();
            dom.universeSetupModal.idsInput.value = currentIds ? `${currentIds}, ${singleId}` : singleId;
            dom.universeSetupModal.singleIdInput.value = '';
            dom.universeSetupModal.error.textContent = '';
        } else {
            dom.universeSetupModal.error.textContent = 'Please enter a valid App ID.';
        }
        dom.universeSetupModal.singleIdInput.focus();
    });
    
    dom.top100Modal.confirmBtn.addEventListener('click', () => {
        const selectedIds = Array.from(dom.top100Modal.list.querySelectorAll('input:checked')).map(cb => cb.dataset.appid);
        dom.top100Modal.modal.classList.add('hidden');
        populateUniverseFromSteamIds(selectedIds);
    });

    dom.top100Modal.cancelBtn.addEventListener('click', () => dom.top100Modal.modal.classList.add('hidden'));
    dom.top100Modal.list.addEventListener('change', () => {
        const selectedCount = dom.top100Modal.list.querySelectorAll('input:checked').length;
        const canProceed = selectedCount >= 6;
        dom.top100Modal.status.textContent = `${selectedCount} selected. ${canProceed ? '' : ' (Need at least 6)'}`;
        dom.top100Modal.confirmBtn.disabled = !canProceed;
    });
    
    dom.top100Modal.search.addEventListener('input', () => {
        const searchTerm = dom.top100Modal.search.value.toLowerCase();
        dom.top100Modal.list.querySelectorAll('div').forEach(div => {
            const name = div.querySelector('input')?.dataset.name || '';
            div.style.display = name.includes(searchTerm) ? 'flex' : 'none';
        });
    });

    dom.top100Modal.clearBtn.addEventListener('click', () => {
        dom.top100Modal.list.querySelectorAll('input:checked').forEach(cb => cb.checked = false);
        dom.top100Modal.list.dispatchEvent(new Event('change'));
    });

    dom.genreExpansionModal.cancelBtn.addEventListener('click', () => dom.genreExpansionModal.modal.classList.add('hidden'));
    dom.genreExpansionModal.confirmBtn.addEventListener('click', () => {
        const selectedIds = Array.from(dom.genreExpansionModal.list.querySelectorAll('input:checked')).map(cb => cb.dataset.appid);
        if (selectedIds.length > 0) {
            dom.genreExpansionModal.modal.classList.add('hidden');
            dom.setupPanel.panel.classList.add('hidden');
            populateUniverseFromSteamIds(selectedIds);
        }
    });

    dom.genreExpansionModal.list.addEventListener('change', () => {
        const selectedCount = dom.genreExpansionModal.list.querySelectorAll('input:checked').length;
        dom.genreExpansionModal.status.textContent = `${selectedCount} selected`;
        dom.genreExpansionModal.confirmBtn.disabled = selectedCount === 0;
        dom.genreExpansionModal.confirmBtn.textContent = selectedCount > 0 ? `Add ${selectedCount} Fighters` : 'Add Fighters';
    });

    dom.setupPanel.retireForgottenBtn.addEventListener('click', () => {
        const selectedId = dom.setupPanel.retirementSelect.value;
        if(selectedId) retireFighter(selectedId, false);
    });
    dom.setupPanel.retireHofBtn.addEventListener('click', () => {
        const selectedId = dom.setupPanel.retirementSelect.value;
        if(selectedId) retireFighter(selectedId, true);
    });

    dom.fighterInfoModal.closeBtn.addEventListener('click', () => dom.fighterInfoModal.modal.classList.add('hidden'));

    // Global click listener for dynamically added buttons
    document.addEventListener('click', function(event) {
        if (event.target.closest('.load-match-btn')) {
            const loadBtn = event.target.closest('.load-match-btn');
            const f1Id = loadBtn.dataset.f1Id;
            const f2Id = loadBtn.dataset.f2Id;
            const titles = loadBtn.dataset.titles;
            handleLoadMatchClick(f1Id, f2Id, titles);
        } else if (event.target.closest('.swap-title-info-btn')) {
            const swapBtn = event.target.closest('.swap-title-info-btn');
            const infoSpan = swapBtn.closest('.flex-grow').querySelector('.info-span');
            const currentTitle = infoSpan.title;
            const currentText = infoSpan.textContent;
            infoSpan.title = currentText;
            infoSpan.textContent = currentTitle;
        } else if (event.target.closest('.universe-fighter-entry')) {
            const fighterEntry = event.target.closest('.universe-fighter-entry');
            if (event.target.closest('button')) return; // Ignore clicks on buttons inside the entry
            const appId = fighterEntry.dataset.appid;
            const fighterData = state.universeFighters.find(f => f.appId === appId);
            if (fighterData) {
                displayFighterInfoModal(fighterData);
            }
        }
    });
}
