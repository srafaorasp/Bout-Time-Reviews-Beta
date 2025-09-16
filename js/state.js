import { showToast, populateSetupPanel, updateChampionsDisplay, updateScoresAndDisplay, populateUniverseSelectors } from './ui.js';
import { fetchWithProxyRotation } from './api.js';
import { delay } from './utils.js';

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
    setSelectedTitle(titleValue) {
        this.selectedTitleForFight = titleValue;
        // UI updates are handled in ui.js to avoid circular dependencies
    },
    refreshUIFromState() {
        if (this.fighter1.appId) {
            const freshFighter1 = this.universeFighters.find(f => f.appId === this.fighter1.appId);
            if (freshFighter1) this.loadCardFromData('item1', freshFighter1);
        }
        if (this.fighter2.appId) {
            const freshFighter2 = this.universeFighters.find(f => f.appId === this.fighter2.appId);
            if (freshFighter2) this.loadCardFromData('item2', freshFighter2);
        }
        updateScoresAndDisplay();
    }
};

// --- DOM ELEMENT SELECTION (centralized) ---
export const dom = {
    // ... (This object will be populated by query selectors)
};

function selectDOMElements() {
    // This function populates the dom object. It's kept separate for clarity.
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
        universeSetupModal: { modal: document.getElementById('universe-setup-modal'), idsInput: document.getElementById('steam-ids-input'), error: document.getElementById('universe-setup-error'), startBtn: document.getElementById('start-universe-btn'), importBtn: document.getElementById('import-universe-btn'), loadPresetBtn: document.getElementById('load-preset-universe-btn'), selectTop100Btn: document.getElementById('select-top-100-btn') },
        top100Modal: { modal: document.getElementById('top-100-modal'), list: document.getElementById('top-100-list'), search: document.getElementById('top-100-search'), clearBtn: document.getElementById('top-100-clear-selection-btn'), status: document.getElementById('top-100-status'), cancelBtn: document.getElementById('cancel-top-100-btn'), confirmBtn: document.getElementById('confirm-top-100-btn') },
        originLockoutModal: { modal: document.getElementById('origin-lockout-modal'), newFighter: document.getElementById('lockout-new-fighter'), origin: document.getElementById('lockout-origin'), existingFighter: document.getElementById('lockout-existing-fighter'), skipBtn: document.getElementById('skip-origin-btn'), keepBtn: document.getElementById('keep-origin-btn') },
        genreExpansionModal: { modal: document.getElementById('genre-expansion-modal'), title: document.getElementById('genre-expansion-title'), list: document.getElementById('genre-expansion-list'), status: document.getElementById('genre-expansion-status'), cancelBtn: document.getElementById('cancel-genre-expansion-btn'), confirmBtn: document.getElementById('confirm-genre-expansion-btn') },
        toast: { container: document.getElementById('toast-notification'), message: document.getElementById('toast-message') },
        confirmationModal: { modal: document.getElementById('confirmation-modal'), title: document.getElementById('confirmation-title'), message: document.getElementById('confirmation-message'), confirmBtn: document.getElementById('confirm-action-btn'), cancelBtn: document.getElementById('confirm-cancel-btn') }
    });
}


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
    const index = state.universeFighters.findIndex(f => f.appId === fighterData.appId);
    if (index !== -1) {
        state.universeFighters[index] = JSON.parse(JSON.stringify(fighterData));
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
    state.roster.major = Object.assign(defaultMajor, data.major);
    state.roster.local = data.local || {};

    populateSetupPanel();
    updateChampionsDisplay();
    updateScoresAndDisplay();
}

// --- Universe and Title Generation ---
function processUniverseForNewTitles() {
    const genreCounts = {};
    state.universeFighters.forEach(fighter => {
        fighter.genres?.forEach(genre => {
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
