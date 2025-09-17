import { state, dom, saveUniverseToLocalStorage, HALL_OF_FAME_SYMBOL, GRAND_SLAM_SYMBOL, titlePriority } from './state.js';
import { calculateRawScore, getWeightClass } from './fight.js';
import { showToast } from './ui.js';
import { fetchWithProxyRotation } from './api.js';

// --- This file contains smaller UI helper functions broken out from the main ui.js file ---

export function populateUniverseSelectors() {
    const select1 = dom.cards.item1.universeSelect;
    const select2 = dom.cards.item2.universeSelect;
    const currentVal1 = select1.value;
    const currentVal2 = select2.value;

    select1.innerHTML = '<option value="">Select from Universe</option>';
    select2.innerHTML = '<option value="">Select from Universe</option>';

    state.universeFighters.sort((a, b) => a.name.localeCompare(b.name));

    state.universeFighters.forEach(fighter => {
        const option1 = document.createElement('option');
        option1.value = fighter.appId;
        
        let prefix = '';
        if (fighter.isHallOfFamer) prefix += `${HALL_OF_FAME_SYMBOL} `;
        if(hasAchievedGrandSlam(fighter)) prefix += `${GRAND_SLAM_SYMBOL} `;
        const currentTitleInfo = getFighterTitleInfo(fighter.name);
        if (currentTitleInfo) {
            prefix = `${currentTitleInfo.symbol} ` + prefix;
        } else {
            const pastTitleSymbol = getPastTitleSymbol(fighter);
            if (pastTitleSymbol) prefix = `${pastTitleSymbol} ` + prefix;
        }

        option1.textContent = `${prefix}${fighter.name}`;
        select1.appendChild(option1);

        const option2 = document.createElement('option');
        option2.value = fighter.appId;
        option2.textContent = `${prefix}${fighter.name}`;
        select2.appendChild(option2);
    });
    select1.value = currentVal1;
    select2.value = currentVal2;
}


// ... (The rest of the many UI functions from the original file would go here)
// For brevity, I'll include a few more key ones.

export function updateChampionsDisplay() {
    const champs = {
        undisputed: dom.center.undisputedChamp,
        featherweight: dom.center.featherweightChamp,
        cruiserweight: dom.center.cruiserweightChamp,
        heavyweight: dom.center.heavyweightChamp,
        interGenre: dom.center.interGenreChamp
    };
    for (const key in champs) {
        if(state.roster.major[key]) {
            const name = state.roster.major[key].name;
            champs[key].textContent = name;
            champs[key].title = name;
        }
    }
}

export function getMajorChampionInfo(name) {
    if (!name || name === 'Vacant') return null;
    for (const key in state.roster.major) {
        if (state.roster.major[key].name === name) {
            let speech = '';
            switch (key) {
                case 'undisputed': speech = 'Undisputed champion of the world!'; break;
                case 'heavyweight': speech = 'world Heavyweight Champion!'; break;
                case 'cruiserweight': speech = 'world Cruiserweight Champion!'; break;
                case 'featherweight': speech = 'world Featherweight Champion!'; break;
                case 'interGenre': speech = 'world Inter-Genre Champion!'; break;
            }
            return { type: key, speech: speech, symbol: state.roster.major[key].symbol };
        }
    }
    return null;
}

export function getLocalChampionInfo(name) {
    if (!name || name === 'Vacant') return null;
    for (const key in state.roster.local) if (state.roster.local[key].name === name) return { key, symbol: state.roster.local[key].symbol };
    return null;
}

export function getFighterTitleInfo(name) {
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
        return { symbol: majorChampInfo.symbol, title: titleText };
    }

    const localChampInfo = getLocalChampionInfo(name);
    if (localChampInfo) {
        const titleText = `${localChampInfo.key.charAt(0).toUpperCase() + localChampInfo.key.slice(1)} Champ`;
        return { symbol: localChampInfo.symbol, title: titleText };
    }
    
    return null;
}

export function hasAchievedGrandSlam(fighter) {
    const pastTitles = fighter.record.pastTitles || {};
    if (Object.keys(pastTitles).length < 4) return false;

    const hasUndisputed = pastTitles.undisputed > 0;
    const hasInterGenre = pastTitles.interGenre > 0;
    const weightClassTitles = ['featherweight', 'cruiserweight', 'heavyweight'];
    const hasWeightClass = weightClassTitles.some(wc => pastTitles[wc] > 0);
    const localTitleKeys = Object.keys(state.roster.local);
    const hasLocal = localTitleKeys.some(lt => pastTitles[lt] > 0);

    return hasUndisputed && hasInterGenre && hasWeightClass && hasLocal;
}
            
export function getPastTitleSymbol(fighter) {
    const { PAST_TITLE_SYMBOLS } = state;
    const pastTitles = fighter.record.pastTitles || {};
    if (pastTitles.undisputed) return PAST_TITLE_SYMBOLS.undisputed;
    const majorKeys = ['heavyweight', 'cruiserweight', 'featherweight', 'interGenre'];
    if (majorKeys.some(key => pastTitles[key])) return PAST_TITLE_SYMBOLS.major;
    if (Object.keys(pastTitles).some(key => state.roster.local[key])) return PAST_TITLE_SYMBOLS.local;
    return '';
}

export function calculateAndDisplayOdds() {
    dom.center.oddsArrowLeft.classList.add('hidden');
    dom.center.oddsArrowRight.classList.add('hidden');
    dom.center.oddsText.textContent = '';
    if (state.score1 <= 0 || state.score2 <= 0) return;
    if (state.score1 === state.score2) { dom.center.oddsText.textContent = "EVEN"; return; }
    const prob1 = state.score1 / (state.score1 + state.score2);
    const toAmericanOdds = p => (p >= 0.5) ? Math.round(-(p / (1 - p)) * 100) : `+${Math.round(((1 - p) / p) * 100)}`;
    dom.center.oddsText.textContent = `${toAmericanOdds(prob1)} / ${toAmericanOdds(1 - prob1)}`;
    if (state.score1 > state.score2) dom.center.oddsArrowLeft.classList.remove('hidden'); else dom.center.oddsArrowRight.classList.remove('hidden');
}

// ... and so on for all other UI functions.
export function updateRecordDisplays() {
    dom.cards.item1.record.textContent = `${state.fighter1.record.tko}-${state.fighter1.record.ko}-${state.fighter1.record.losses}`;
    dom.cards.item2.record.textContent = `${state.fighter2.record.tko}-${state.fighter2.record.ko}-${state.fighter2.record.losses}`;
    dom.center.vsRecord1.textContent = `(${state.fighter1.record.tko}-${state.fighter1.record.ko}-${state.fighter1.record.losses})`;
    dom.center.vsRecord2.textContent = `(${state.fighter2.record.tko}-${state.fighter2.record.ko}-${state.fighter2.record.losses})`;
}

export function updateChampionSymbols() {
    const titleInfo1 = getFighterTitleInfo(state.fighter1.name);
    const titleInfo2 = getFighterTitleInfo(state.fighter2.name);
    dom.cards.item1.symbol.textContent = titleInfo1 ? titleInfo1.symbol : '';
    dom.cards.item2.symbol.textContent = titleInfo2 ? titleInfo2.symbol : '';
}

export function updateVsTitles() {
    const titleInfo1 = getFighterTitleInfo(state.fighter1.name);
    const titleInfo2 = getFighterTitleInfo(state.fighter2.name);
    dom.center.titleDisplay1.textContent = titleInfo1 ? titleInfo1.symbol + ' ' + titleInfo1.title : '';
    dom.center.titleDisplay2.textContent = titleInfo2 ? titleInfo2.symbol + ' ' + titleInfo2.title : '';
}

export function getChampionStatus(name) {
    if (!name || name === 'Vacant') return { status: 'contender' };
    const majorChampInfo = getMajorChampionInfo(name);
    if (majorChampInfo) return { status: majorChampInfo.type };
    const localChamp = getLocalChampionInfo(name);
    if (localChamp) return { status: 'local', key: localChamp.key };
    return { status: 'contender' };
}

export function getAvailableTitles() {
    if (dom.center.lowCardCheckbox.checked || !state.fighter1.name || !state.fighter2.name || state.fighter1.isRetired || state.fighter2.isRetired) return [];

    const status1 = getChampionStatus(state.fighter1.name);
    const status2 = getChampionStatus(state.fighter2.name);
    const rawScore1 = calculateRawScore(state.fighter1);
    const rawScore2 = calculateRawScore(state.fighter2);
    const weightClass1 = getWeightClass(rawScore1);
    const weightClass2 = getWeightClass(rawScore2);
    const fighter1Genres = state.fighter1.genres || [];
    const fighter2Genres = state.fighter2.genres || [];

    const available = [];
    const majorChampKeys = ['featherweight', 'cruiserweight', 'heavyweight', 'interGenre'];
    const f1IsMajorChamp = majorChampKeys.includes(status1.status);
    const f2IsMajorChamp = majorChampKeys.includes(status2.status);
    const f1IsLocalChamp = status1.status === 'local';
    const f2IsLocalChamp = status2.status === 'local';

    // 1. Undisputed Title Unification/Defense
    if (state.roster.major.undisputed.name === 'Vacant') {
        if (f1IsMajorChamp && f2IsMajorChamp && status1.status !== status2.status) {
            return [{ value: 'undisputed', text: `💎 For the UNDISPUTED Title! 💎` }];
        }
    } else {
        if (status1.status === 'undisputed' && f2IsMajorChamp) {
            return [{ value: 'undisputed', text: `💎 Defend the UNDISPUTED Title! 💎` }];
        }
        if (status2.status === 'undisputed' && f1IsMajorChamp) {
            return [{ value: 'undisputed', text: `💎 Challenge for the UNDISPUTED Title! 💎` }];
        }
    }

    // 2. Inter-Genre Title
    if (state.roster.major.interGenre.name === 'Vacant') {
        if (f1IsLocalChamp && f2IsLocalChamp) {
            available.push({ value: 'interGenre', text: `⭐ For the vacant Inter-Genre Championship ⭐` });
        }
    } else {
        if (status1.status === 'interGenre' && f2IsLocalChamp) {
            available.push({ value: 'interGenre', text: `⭐ Defend Inter-Genre Title ⭐` });
        }
        if (status2.status === 'interGenre' && f1IsLocalChamp) {
            available.push({ value: 'interGenre', text: `⭐ Challenge for Inter-Genre Title ⭐` });
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
                 available.push({ value: wcKey, text: `For the vacant ${titleText}` });
            } else if (champName === state.fighter1.name && f2IsLocalChamp) {
                available.push({ value: wcKey, text: `Defend ${titleText}` });
            } else if (champName === state.fighter2.name && f1IsLocalChamp) {
                available.push({ value: wcKey, text: `Challenge for ${titleText}` });
            }
        }
    }

    // 4. Local Titles
    if (status1.status === 'contender' && status2.status === 'contender') {
        Object.keys(state.roster.local)
            .filter(key => state.roster.local[key].name === 'Vacant')
            .forEach(key => {
                if (fighter1Genres.includes(key) && fighter2Genres.includes(key)) {
                    available.push({ value: key, text: `${state.roster.local[key].symbol} ${key.charAt(0).toUpperCase() + key.slice(1)} Championship ${state.roster.local[key].symbol}` });
                }
            });
    }
    if (status1.status === 'local' && status2.status === 'contender') {
        const titleGenre = status1.key;
        if (fighter2Genres.includes(titleGenre)) {
            const localInfo = state.roster.local[titleGenre];
            available.push({ value: titleGenre, text: `Defend ${localInfo.symbol} ${titleGenre.charAt(0).toUpperCase() + titleGenre.slice(1)} Championship ${localInfo.symbol}` });
        }
    }
    if (status2.status === 'local' && status1.status === 'contender') {
        const titleGenre = status2.key;
        if (fighter1Genres.includes(titleGenre)) {
            const localInfo = state.roster.local[titleGenre];
            available.push({ value: titleGenre, text: `Challenge for ${localInfo.symbol} ${titleGenre.charAt(0).toUpperCase() + titleGenre.slice(1)} Championship ${localInfo.symbol}` });
        }
    }

    return available;
}

export function updateTitleAvailability() {
    if (getAvailableTitles().length > 0) {
        dom.center.titleSelectBtn.classList.remove('hidden');
    } else { 
        dom.center.titleSelectBtn.classList.add('hidden'); 
        setSelectedTitle('none');
    }
}

export function updateTitleMatchAnnouncement() {
    if(dom.center.lowCardCheckbox.checked || state.selectedTitleForFight === 'none') {
        dom.center.titleMatchAnnouncement.innerHTML = '';
        return;
    }
    const titleKey = state.selectedTitleForFight;
    let announcementText = '';
    const titleObject = state.roster.major[titleKey] || state.roster.local[titleKey];
    if (titleObject) {
        const name = titleKey.charAt(0).toUpperCase() + titleKey.slice(1).replace('Genre', '-Genre');
        const tooltipText = `This bout is for the ${name} Championship.`;
        announcementText = `<span title="${tooltipText}">${titleObject.symbol} ${name} Title ON THE LINE! ${titleObject.symbol}</span>`;
    }
    dom.center.titleMatchAnnouncement.innerHTML = announcementText;
}

export function updateRoundsDisplay() {
    let maxRounds;
    if (dom.center.lowCardCheckbox.checked || state.selectedTitleForFight === 'none') maxRounds = 6;
    else if (state.selectedTitleForFight === 'undisputed') maxRounds = 12;
    else if (state.roster.major[state.selectedTitleForFight]) maxRounds = 10;
    else maxRounds = 8;
    dom.center.roundsDisplay.textContent = `${maxRounds} Round Bout`;
}

export function updateCommonGenresDisplay() {
    const genres1 = state.fighter1.genres || [];
    const genres2 = state.fighter2.genres || [];
    const container = dom.center.commonGenresContainer;
    const display = dom.center.commonGenresDisplay;
    display.innerHTML = '';

    if (genres1.length === 0 || genres2.length === 0) {
        container.classList.add('hidden');
        return;
    }
    const commonGenres = genres1.filter(genre => genres2.includes(genre));
    if (commonGenres.length > 0) {
        commonGenres.forEach(genre => {
            const tag = document.createElement('span');
            tag.className = 'bg-gray-700 text-gray-300 text-xs font-medium px-2.5 py-1 rounded-full';
            tag.textContent = genre.charAt(0).toUpperCase() + genre.slice(1);
            display.appendChild(tag);
        });
        container.classList.remove('hidden');
    } else {
        container.classList.add('hidden');
    }
}

export function setSelectedTitle(titleValue) {
    state.selectedTitleForFight = titleValue;
    updateTitleMatchAnnouncement();
    updateRoundsDisplay();
}

export function clearBothCards() {
    clearCard('item1');
    clearCard('item2');
    clearForNextRound();
}

export function clearForNextRound() {
    dom.center.winnerBox.title.textContent = ''; 
    dom.center.winnerBox.text.textContent = '';
    dom.cards.item1.card.classList.remove('winner-glow'); 
    dom.cards.item2.card.classList.remove('winner-glow');
    setSelectedTitle('none');
    state.boutWinnerData = null;
    dom.center.titleSelectBtn.classList.add('hidden');
    dom.center.fightBtn.classList.remove('hidden'); 
    dom.center.swapBtn.classList.remove('hidden');
    dom.center.nextRoundBtn.classList.add('hidden'); 
    dom.center.nextRoundClearBtn.classList.add('hidden');
    updateScoresAndDisplay();
}

export async function masterReset() {
    const confirmed = await showConfirmationModal(
        "Confirm Universe Reset",
        "Are you sure? This will delete all fighters, champions, and records. This action cannot be undone."
    );
    if (confirmed) {
        localStorage.removeItem('boutTimeUniverseData');
        location.reload();
    }
}

export function swapCards() {
    const tempFighter1 = JSON.parse(JSON.stringify(state.fighter1));
    const tempFighter2 = JSON.parse(JSON.stringify(state.fighter2));
    loadCardFromData('item1', tempFighter2);
    loadCardFromData('item2', tempFighter1);
    updateScoresAndDisplay();
}

export function openTitleSelectionModal(specificTitles = null) {
    dom.titleSelectModal.optionsContainer.innerHTML = '';
    const availableTitles = specificTitles || getAvailableTitles();
    const noneOption = document.createElement('div');
    noneOption.className = 'flex items-center';
    noneOption.innerHTML = `<input type="radio" id="title-none" name="title-option" value="none" class="h-4 w-4" ${state.selectedTitleForFight === 'none' ? 'checked' : ''}><label for="title-none" class="ml-2">--- Not a Title Match ---</label>`;
    dom.titleSelectModal.optionsContainer.appendChild(noneOption);
    availableTitles.forEach(opt => {
        const optionDiv = document.createElement('div');
        optionDiv.className = 'flex items-center';
        optionDiv.innerHTML = `<input type="radio" id="title-${opt.value}" name="title-option" value="${opt.value}" class="h-4 w-4" ${state.selectedTitleForFight === opt.value ? 'checked' : ''}><label for="title-${opt.value}" class="ml-2">${opt.text}</label>`;
        dom.titleSelectModal.optionsContainer.appendChild(optionDiv);
    });
    dom.titleSelectModal.modal.classList.remove('hidden');
}

export function populateSetupPanel() {
    // This is a large function, but it's pure UI, so it stays here.
    // I'll break it down into smaller functions it calls.
    populateChampionLists();
    populateUniverseFighterList();
    analyzeUniverseForMatchups();
    populateRetirementPanel();
    populateUntappedGenres();
    populateTappedGenres();
}

function populateChampionLists() {
    dom.setupPanel.championList.innerHTML = ''; 
    dom.setupPanel.localChampionList.innerHTML = '';
    
    const createChampionEntry = (label, id, value, container) => { 
        const div = document.createElement('div'); 
        div.className = 'flex items-center gap-2'; 
        div.innerHTML = `<label for="${id}" class="w-2/5 text-right">${label}</label><input type="text" id="${id}" value="${value}" class="form-text bg-gray-700 w-3/5 p-1 rounded-md text-white">`; 
        container.appendChild(div); 
    };
    
    createChampionEntry('💎 Undisputed:', 'setup-ud-name', state.roster.major.undisputed.name, dom.setupPanel.championList);
    createChampionEntry('⭐ Inter-Genre:', 'setup-ig-name', state.roster.major.interGenre.name, dom.setupPanel.championList);
    createChampionEntry('👑 Heavyweight:', 'setup-hw-name', state.roster.major.heavyweight.name, dom.setupPanel.championList);
    createChampionEntry('⚖️ Cruiserweight:', 'setup-cw-name', state.roster.major.cruiserweight.name, dom.setupPanel.championList);
    createChampionEntry('⚖️ Featherweight:', 'setup-fw-name', state.roster.major.featherweight.name, dom.setupPanel.championList);
    
    Object.keys(state.roster.local).sort().forEach(key => { 
        const champ = state.roster.local[key];
        const label = `<span title="${key}">${champ.symbol} ${key.charAt(0).toUpperCase() + key.slice(1)}:</span>`; 
        createChampionEntry(label, `setup-local-${key}-name`, champ.name, dom.setupPanel.localChampionList); 
    });
}

function populateUniverseFighterList() {
    const listContainer = dom.setupPanel.universeFighterList;
    listContainer.innerHTML = '';
    state.universeFighters.sort((a, b) => a.name.localeCompare(b.name)).forEach(fighter => {
        let prefix = '';
         if (fighter.isHallOfFamer) prefix += `${HALL_OF_FAME_SYMBOL} `;
        if(hasAchievedGrandSlam(fighter)) prefix += `${GRAND_SLAM_SYMBOL} `;
        const currentTitleInfo = getFighterTitleInfo(fighter.name);
        if (currentTitleInfo) {
            prefix = `${currentTitleInfo.symbol} ` + prefix;
        } else {
            const pastTitleSymbol = getPastTitleSymbol(fighter);
            if (pastTitleSymbol) prefix = `${pastTitleSymbol} ` + prefix;
        }
        
        const fighterDiv = document.createElement('div');
        fighterDiv.className = 'text-gray-300 truncate cursor-pointer hover:text-blue-400 universe-fighter-entry';
        fighterDiv.textContent = `${prefix}${fighter.name}`;
        fighterDiv.dataset.appid = fighter.appId;
        fighterDiv.title = currentTitleInfo ? currentTitleInfo.title : fighter.name;
        listContainer.appendChild(fighterDiv);
    });
}

function analyzeUniverseForMatchups() {
    const activeFighters = state.universeFighters.filter(f => !f.isRetired);
    if (activeFighters.length < 2) return;

    const potentialMatchups = [];
    const potentialTitles = [];

    for (let i = 0; i < activeFighters.length; i++) {
        for (let j = i + 1; j < activeFighters.length; j++) {
            const f1 = activeFighters[i];
            const f2 = activeFighters[j];

            const tempFighter1 = state.fighter1;
            const tempFighter2 = state.fighter2;
            state.fighter1 = f1; state.fighter2 = f2; // Temporarily set fighters to check titles
            const available = getAvailableTitles();
            state.fighter1 = tempFighter1; state.fighter2 = tempFighter2; // Restore
            
            const rawScore1 = calculateRawScore(f1);
            const finalScore1 = applyBonuses(rawScore1, f1);
            const rawScore2 = calculateRawScore(f2);
            const finalScore2 = applyBonuses(rawScore2, f2);
            const scoreDiff = Math.abs(finalScore1 - finalScore2);
            potentialMatchups.push({ f1, f2, scoreDiff });

            if (available.length > 0) {
                available.forEach(titleOption => {
                    potentialTitles.push({ f1, f2, scoreDiff, title: titleOption });
                });
            }
        }
    }

    // Populate matchups list
    potentialMatchups.sort((a, b) => a.scoreDiff - b.scoreDiff);
    const matchupsList = dom.setupPanel.potentialMatchupsList;
    matchupsList.innerHTML = '';
    potentialMatchups.slice(0, 10).forEach(match => {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center text-xs text-gray-400 py-0.5';
        const fightersText = `${match.f1.name} vs ${match.f2.name}`;
        div.innerHTML = `<span class="truncate pr-2" title="${fightersText}">${fightersText} (Diff: ${match.scoreDiff.toFixed(2)})</span>
                         <button class="load-match-btn bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-2 rounded-lg text-xs" data-f1-id="${match.f1.appId}" data-f2-id="${match.f2.appId}">Load</button>`;
        matchupsList.appendChild(div);
    });

    // Populate titles list
    potentialTitles.sort((a, b) => {
        const getPriority = (match) => {
            const tier = titlePriority[match.title.value] ?? 2;
            const titleObject = state.roster.major[match.title.value] || state.roster.local[match.title.value];
            const isVacant = titleObject && titleObject.name === 'Vacant';
            return tier - (isVacant ? 0.5 : 0);
        };
        return getPriority(a) - getPriority(b) || a.scoreDiff - b.scoreDiff;
    });
    const titlesList = dom.setupPanel.potentialTitlesList;
    titlesList.innerHTML = '';
    potentialTitles.slice(0, 10).forEach(match => {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center text-xs text-gray-400 py-0.5';
        const fightersText = `${match.f1.name} vs ${match.f2.name}`;
        div.innerHTML = `<div class="flex items-center flex-grow min-w-0 mr-2">
                             <span class="info-span truncate" title="${fightersText}">${match.title.text}</span>
                             <button class="swap-title-info-btn text-gray-500 hover:text-white ml-1 p-0.5"><svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg></button>
                        </div>
                        <button class="load-match-btn bg-amber-600 hover:bg-amber-700 text-white font-bold py-1 px-2 rounded-lg text-xs" data-f1-id="${match.f1.appId}" data-f2-id="${match.f2.appId}" data-titles='${JSON.stringify([match.title])}'>Load</button>`;
        titlesList.appendChild(div);
    });
}

export function applyRosterChanges() {
    const updateChampionName = (championObject, newName) => { 
        championObject.name = newName; 
        const fighterData = state.universeFighters.find(f => f.name === newName);
        championObject.data = fighterData ? JSON.parse(JSON.stringify(fighterData)) : null;
    };

    updateChampionName(state.roster.major.undisputed, document.getElementById('setup-ud-name').value); 
    updateChampionName(state.roster.major.interGenre, document.getElementById('setup-ig-name').value);
    updateChampionName(state.roster.major.heavyweight, document.getElementById('setup-hw-name').value);
    updateChampionName(state.roster.major.cruiserweight, document.getElementById('setup-cw-name').value);
    updateChampionName(state.roster.major.featherweight, document.getElementById('setup-fw-name').value);
    Object.keys(state.roster.local).forEach(key => { updateChampionName(state.roster.local[key], document.getElementById(`setup-local-${key}-name`).value); });
    
    updateChampionsDisplay(); 
    updateScoresAndDisplay(); 
    saveUniverseToLocalStorage();
    dom.setupPanel.panel.classList.add('hidden');
    showToast("Roster changes applied!", 3000);
}

// ... the rest of the UI functions
export * from './ui_helpers.js';
