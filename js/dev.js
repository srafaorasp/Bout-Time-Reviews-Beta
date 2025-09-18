// Developer mode is turned ON.
// To enable, rename this file to "dev.js" and overwrite the existing one.

import { state, saveUniverseToLocalStorage } from './state.js';
import { showToast, updateScoresAndDisplay, updateChampionsDisplay, populateSetupPanel, populateUniverseSelectors } from './ui.js';

/**
 * Flag indicating if developer mode is active. This file sets it to true.
 * @type {boolean}
 */
export const isDevMode = true;

/**
 * Initializes the developer tools by creating and adding the UI to the page.
 */
export function initializeDevTools() {
    console.log('%cDEV MODE ACTIVATED', 'color: #FBBF24; font-size: 20px; font-weight: bold; text-shadow: 1px 1px 0 #000;');
    addDevPanel();
}

/**
 * Creates the developer panel HTML and attaches event listeners for the buttons.
 */
function addDevPanel() {
    const container = document.createElement('div');
    container.id = 'dev-panel-container';
    container.className = 'fixed bottom-4 left-4 bg-gray-900 bg-opacity-80 p-2 rounded-lg shadow-lg z-[100] space-y-2 border border-amber-400 w-48';
    container.innerHTML = `
        <div class="flex justify-between items-center">
             <h3 class="text-amber-400 font-bold text-sm">Dev Tools</h3>
             <button id="dev-refresh-lists" class="p-1 text-gray-400 hover:text-white" title="Refresh Lists">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h5M20 20v-5h-5M4 4l1.5 1.5A9 9 0 0120.5 12M20 20l-1.5-1.5A9 9 0 003.5 12" />
                </svg>
            </button>
        </div>
        
        <div class="space-y-1 border-t border-b border-gray-700 py-2">
            <h4 class="text-white text-xs font-semibold text-center">Title Management</h4>
            <select id="dev-title-select" class="w-full bg-gray-800 border-gray-600 rounded-md py-1 px-2 text-white text-xs">
                <option value="">-- Select Title --</option>
            </select>
            <select id="dev-fighter-select" class="w-full bg-gray-800 border-gray-600 rounded-md py-1 px-2 text-white text-xs">
                <option value="">-- Select Fighter --</option>
            </select>
            <button id="dev-appoint-champ" class="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs py-1 px-2 rounded">Appoint Champion</button>
        </div>

        <button id="dev-open-roster" class="w-full bg-gray-600 hover:bg-gray-700 text-white text-xs py-1 px-2 rounded">Full Roster Editor</button>
        <button id="dev-log-state" class="w-full bg-green-600 hover:bg-green-700 text-white text-xs py-1 px-2 rounded">Log State to Console</button>
    `;
    document.body.appendChild(container);

    populateDevDropdowns();
    attachDevListeners();
}

/**
 * Populates the dropdown menus in the developer panel with all available titles and fighters.
 */
function populateDevDropdowns() {
    const titleSelect = document.getElementById('dev-title-select');
    const fighterSelect = document.getElementById('dev-fighter-select');

    if (!titleSelect || !fighterSelect) return;

    // Preserve selected values to reapply them after refreshing
    const previousTitle = titleSelect.value;
    const previousFighter = fighterSelect.value;

    // Clear existing options
    titleSelect.innerHTML = '<option value="">-- Select Title --</option>';
    fighterSelect.innerHTML = '<option value="">-- Select Fighter --</option>';
    fighterSelect.innerHTML += '<option value="vacant">-- Vacant --</option>';

    // Populate titles
    const allTitles = {
        ...state.roster.major,
        ...state.roster.local,
        interUniverseChampion: state.roster.interUniverseChampion
    };
    
    for (const key in allTitles) {
        if (key === 'universalChampion') continue; // Skip old property if it exists
        const formattedName = key.charAt(0).toUpperCase() + key.slice(1).replace('interGenre', 'Inter-Genre');
        titleSelect.innerHTML += `<option value="${key}">${formattedName}</option>`;
    }

    // Populate fighters, making sure to include any active visitors
    const allAvailableFighters = new Map();

    state.universeFighters.forEach(fighter => {
        if (!fighter.isRetired) {
            allAvailableFighters.set(fighter.appId, fighter);
        }
    });
    if (state.fighter1 && state.fighter1.appId && !allAvailableFighters.has(state.fighter1.appId)) {
         allAvailableFighters.set(state.fighter1.appId, state.fighter1);
    }
    if (state.fighter2 && state.fighter2.appId && !allAvailableFighters.has(state.fighter2.appId)) {
         allAvailableFighters.set(state.fighter2.appId, state.fighter2);
    }

    // Sort and add to the dropdown
    [...allAvailableFighters.values()]
        .sort((a,b) => a.name.localeCompare(b.name))
        .forEach(fighter => {
            const visitorTag = fighter.isVisitor ? ' (Visitor)' : '';
            fighterSelect.innerHTML += `<option value="${fighter.appId}">${fighter.name}${visitorTag}</option>`;
        });
    
    // Restore previous selections if they still exist
    titleSelect.value = previousTitle;
    fighterSelect.value = previousFighter;
}


/**
 * Attaches event listeners to the buttons in the developer panel.
 */
function attachDevListeners() {
    document.getElementById('dev-appoint-champ').addEventListener('click', () => {
        const titleKey = document.getElementById('dev-title-select').value;
        const fighterId = document.getElementById('dev-fighter-select').value;

        if (!titleKey) {
            showToast('Please select a title.', 3000);
            return;
        }

        let titleObject;
        if (state.roster.major[titleKey]) {
            titleObject = state.roster.major[titleKey];
        } else if (state.roster.local[titleKey]) {
            titleObject = state.roster.local[titleKey];
        } else if (titleKey === 'interUniverseChampion') {
            titleObject = state.roster.interUniverseChampion;
        }

        if (!titleObject) {
            showToast('Invalid title selected.', 3000);
            return;
        }

        // Handle making the title vacant
        if (fighterId === 'vacant') {
            titleObject.name = 'Vacant';
            titleObject.data = null;
        } else {
            // Find the fighter from our comprehensive list (universe + visitors)
            const allFighters = new Map();
            state.universeFighters.forEach(f => allFighters.set(f.appId, f));
            if (state.fighter1 && state.fighter1.appId) allFighters.set(state.fighter1.appId, state.fighter1);
            if (state.fighter2 && state.fighter2.appId) allFighters.set(state.fighter2.appId, state.fighter2);
            
            const fighter = allFighters.get(fighterId);

            if (!fighter) {
                showToast('Please select a fighter.', 3000);
                return;
            }
            titleObject.name = fighter.name;
            titleObject.data = JSON.parse(JSON.stringify(fighter));
        }

        // Refresh UI and save
        updateChampionsDisplay();
        updateScoresAndDisplay();
        populateUniverseSelectors();
        saveUniverseToLocalStorage();
        populateDevDropdowns(); // Refresh dropdowns in case of changes
        showToast(`'${titleKey}' title updated!`, 3000);
    });

    document.getElementById('dev-open-roster').addEventListener('click', () => {
        const setupPanel = document.getElementById('setup-panel');
        if (setupPanel) {
            populateSetupPanel();
            setupPanel.classList.remove('hidden');
        }
    });

    document.getElementById('dev-log-state').addEventListener('click', () => {
        console.log('--- CURRENT GAME STATE ---', state);
        showToast('Current state logged to console.');
    });

    document.getElementById('dev-refresh-lists').addEventListener('click', () => {
        populateDevDropdowns();
        showToast('Dev lists refreshed.', 2000);
    });
}
