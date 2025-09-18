// Developer mode is turned ON.
// To enable, rename this file to "dev.js" and overwrite the existing one.

import { state, saveUniverseToLocalStorage } from './state.js';
import { updateScoresAndDisplay, updateChampionsDisplay, populateSetupPanel, populateUniverseSelectors } from './ui.js';
import { showToast } from './utils.js';

/**
 * Flag indicating if developer mode is active. This file sets it to true.
 * @type {boolean}
 */
export const isDevMode = true;

/**
 * Initializes the developer tools panel and adds it to the page.
 */
export function initializeDevTools() {
    const devPanelHTML = `
        <div id="dev-panel" class="fixed bottom-4 left-4 bg-gray-900 bg-opacity-80 border-2 border-red-500 text-white p-3 rounded-lg shadow-lg z-[200] text-xs w-64">
            <div class="flex justify-between items-center mb-2 pb-1 border-b border-red-700">
                <h4 class="font-bold text-red-400">DEV TOOLS</h4>
                <div class="flex items-center gap-2">
                     <button id="dev-refresh-btn" class="p-1 text-gray-400 hover:text-white" title="Refresh Lists">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h5M20 20v-5h-5M4 4l1.5 1.5A9 9 0 0120.5 12M20 20l-1.5-1.5A9 9 0 003.5 12" /></svg>
                    </button>
                    <button id="dev-log-state-btn" class="p-1 text-gray-400 hover:text-white" title="Log State to Console">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                    </button>
                    <button id="dev-open-roster-btn" class="p-1 text-gray-400 hover:text-white" title="Open Roster Editor">
                       <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" /><path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd" /></svg>
                    </button>
                </div>
            </div>
            <div class="space-y-2">
                <p class="font-semibold text-center">Title Management</p>
                <select id="dev-fighter-select" class="form-select w-full bg-gray-800 border-gray-600 rounded-md py-1 px-2 text-white text-xs"></select>
                <select id="dev-title-select" class="form-select w-full bg-gray-800 border-gray-600 rounded-md py-1 px-2 text-white text-xs"></select>
                <button id="dev-appoint-champ-btn" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-2 rounded-lg">Appoint Champion</button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', devPanelHTML);
    attachDevListeners();
    populateDevDropdowns();
}

function populateDevDropdowns() {
    const fighterSelect = document.getElementById('dev-fighter-select');
    const titleSelect = document.getElementById('dev-title-select');
    if (!fighterSelect || !titleSelect) return;

    fighterSelect.innerHTML = '<option value="">-- Select Fighter --</option>';
    titleSelect.innerHTML = '<option value="">-- Select Title --</option>';

    // Combine universe fighters and any potential visitors
    const allFighters = [...state.universeFighters.filter(f => !f.isRetired)];
    const loadedFighterIds = new Set(allFighters.map(f => f.appId));

    if (state.fighter1 && state.fighter1.isVisitor && !loadedFighterIds.has(state.fighter1.appId)) {
        allFighters.push(state.fighter1);
    }
    if (state.fighter2 && state.fighter2.isVisitor && !loadedFighterIds.has(state.fighter2.appId)) {
        allFighters.push(state.fighter2);
    }

    allFighters.sort((a, b) => a.name.localeCompare(b.name));

    allFighters.forEach(f => {
        fighterSelect.innerHTML += `<option value="${f.appId}">${f.name}</option>`;
    });

    // Add "Vacant" option to fighters
    fighterSelect.innerHTML += `<option value="Vacant">-- Vacant --</option>`;

    // Populate titles
    const allTitles = {
        ...state.roster.major,
        ...state.roster.local,
        interUniverseChampion: state.roster.interUniverseChampion
    };

    Object.keys(allTitles).forEach(key => {
        const titleName = key.charAt(0).toUpperCase() + key.slice(1).replace('interGenre', 'Inter-Genre');
        titleSelect.innerHTML += `<option value="${key}">${titleName}</option>`;
    });
}

function attachDevListeners() {
    document.getElementById('dev-log-state-btn').addEventListener('click', () => {
        console.log("--- DEV LOG: CURRENT GAME STATE ---");
        console.log(JSON.parse(JSON.stringify(state)));
        showToast("State logged to console.", 2000);
    });
    
    document.getElementById('dev-open-roster-btn').addEventListener('click', () => {
        populateSetupPanel();
        document.getElementById('setup-panel').classList.remove('hidden');
    });

    document.getElementById('dev-refresh-btn').addEventListener('click', () => {
        populateDevDropdowns();
        showToast("Dev lists refreshed.", 2000);
    });

    document.getElementById('dev-appoint-champ-btn').addEventListener('click', () => {
        const fighterId = document.getElementById('dev-fighter-select').value;
        const titleKey = document.getElementById('dev-title-select').value;

        if (!titleKey) {
            showToast("Please select a title.", 3000);
            return;
        }

        const fighter = state.universeFighters.find(f => f.appId === fighterId);
        
        if (fighterId === "Vacant") {
             if (state.roster.major[titleKey]) {
                state.roster.major[titleKey].name = 'Vacant';
                state.roster.major[titleKey].data = null;
            } else if (state.roster.local[titleKey]) {
                state.roster.local[titleKey].name = 'Vacant';
                state.roster.local[titleKey].data = null;
            } else if (titleKey === 'interUniverseChampion') {
                state.roster.interUniverseChampion.name = 'Vacant';
                state.roster.interUniverseChampion.data = null;
            }
             showToast(`${titleKey} title vacated.`, 3000);
        } else if (fighter) {
             if (state.roster.major[titleKey]) {
                state.roster.major[titleKey].name = fighter.name;
                state.roster.major[titleKey].data = JSON.parse(JSON.stringify(fighter));
            } else if (state.roster.local[titleKey]) {
                state.roster.local[titleKey].name = fighter.name;
                state.roster.local[titleKey].data = JSON.parse(JSON.stringify(fighter));
            } else if (titleKey === 'interUniverseChampion') {
                state.roster.interUniverseChampion.name = fighter.name;
                state.roster.interUniverseChampion.data = JSON.parse(JSON.stringify(fighter));
            }
            showToast(`${fighter.name} is the new ${titleKey} champion!`, 3000);
        } else {
            showToast("Please select a fighter.", 3000);
            return;
        }

        saveUniverseToLocalStorage();
        updateChampionsDisplay();
        updateScoresAndDisplay();
        populateUniverseSelectors();
        populateSetupPanel();
    });
}
