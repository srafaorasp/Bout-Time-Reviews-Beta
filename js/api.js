import { state, dom, createNewFighter, updateTimestamp, addFighterToUniverse, updateFighterInUniverse } from './state.js';
import { updateUIAfterFetch, updateScoresAndDisplay, populateUniverseSelectors } from './ui.js';
import { delay, showToast } from './utils.js';

const initialProxies = [
    'https://cors.eu.org/',
    'https://api.allorigins.win/get?url=',
    'https://corsproxy.io/?',
    'https://proxy.cors.sh/',
    //'https://cors.bridged.cc/', // Often unreliable
    //'https://worker-proxy.priver.dev/?url=', // Often unreliable
    'https://api.codetabs.com/v1/proxy?quest=',
    //'https://cors-proxy.priver.dev/' // Often unreliable
];

export const STEAMSPY_API_URL = 'https://steamspy.com/api.php';

export async function fetchWithProxyRotation(apiUrl) {
    if (initialProxies.length === 0) {
        console.error("No proxies available.");
        return null;
    }

    for (const proxyUrl of initialProxies) {
        const fullUrl = proxyUrl.includes('?') ? `${proxyUrl}${encodeURIComponent(apiUrl)}` : `${proxyUrl}${apiUrl}`;
        try {
            const response = await fetch(fullUrl);
            if (!response.ok) throw new Error(`Network response not ok from proxy: ${proxyUrl}, Status: ${response.status}`);
            
            const text = await response.text();
            // Handle proxies that wrap the response in a 'contents' key
            const jsonData = text.includes('"contents":') ? JSON.parse(text).contents : text;
            return JSON.parse(jsonData); // Return the parsed JSON directly
        } catch (error) {
            console.warn(`FAILED with API URL using proxy ${proxyUrl}. Error:`, error.message);
        }
    }
    console.error(`All proxies failed for API URL`);
    return null;
}

export async function fetchSteamData(appId, cardPrefix) {
    const card = (cardPrefix === 'item1') ? dom.cards.item1 : dom.cards.item2;
    const fighter = (cardPrefix === 'item1') ? state.fighter1 : state.fighter2;
    const otherFighter = (cardPrefix === 'item1') ? state.fighter2 : state.fighter1;

    if (otherFighter.appId && appId === otherFighter.appId) {
        showToast("This fighter is already in the other corner!", 4000);
        card.steamId.value = '';
        return;
    }

    if (fighter.steamData) {
        import('./ui.js').then(ui => {
            ui.clearCard(cardPrefix);
            updateScoresAndDisplay();
        });
        return;
    }

    card.steamError.textContent = '';
    card.metacriticError.classList.add('hidden');
    if (!appId || !/^\d+$/.test(appId)) {
        card.steamError.textContent = 'Invalid App ID.';
        return;
    }
    
    card.fetchSteamBtn.textContent = 'Fetching...';
    card.fetchSteamBtn.disabled = true;

    const reviewsUrl = `https://store.steampowered.com/appreviews/${appId}?json=1&language=english`;
    const detailsUrl = `https://store.steampowered.com/api/appdetails?appids=${appId}`;
    
    const [reviewsData, detailsData] = await Promise.all([
        fetchWithProxyRotation(reviewsUrl),
        fetchWithProxyRotation(detailsUrl)
    ]);


    if (reviewsData && reviewsData.success && detailsData && detailsData[appId] && detailsData[appId].success) {
        fighter.appId = appId;
        fighter.steamData = reviewsData.query_summary; 
        
        const appDetails = detailsData[appId].data;
        fighter.name = appDetails?.name || `Game ${appId}`;
        fighter.devHouse = appDetails?.developers?.[0] || '';
        fighter.publisher = appDetails?.publishers?.[0] || '';
        fighter.genres = appDetails?.genres?.map(g => g.description.toLowerCase()) || [];
        
        if (appDetails?.metacritic?.score) {
            fighter.scores.metacritic = appDetails.metacritic.score.toString();
        } else {
            fighter.scores.metacritic = '404';
            card.metacriticError.classList.remove('hidden');
        }
        
        card.name.textContent = fighter.name;
        card.devHouse.textContent = fighter.devHouse;
        card.publisher.textContent = fighter.publisher;
        card.metacritic.textContent = fighter.scores.metacritic;

        updateTimestamp(fighter);
        addFighterToUniverse(fighter);
        updateUIAfterFetch(cardPrefix);
        updateScoresAndDisplay();
    } else {
        card.steamError.textContent = 'Could not reach Steam servers.';
        card.fetchSteamBtn.textContent = 'Fetch';
    }
    card.fetchSteamBtn.disabled = false;
}

export async function updateScoresOnly(appId, cardPrefix) {
    const card = (cardPrefix === 'item1') ? dom.cards.item1 : dom.cards.item2;
    const fighter = (cardPrefix === 'item1') ? state.fighter1 : state.fighter2;

    card.steamError.textContent = '';
    card.metacriticError.classList.add('hidden');
    card.updateScoresBtn.textContent = 'Updating...';
    card.updateScoresBtn.disabled = true;

    const reviewsUrl = `https://store.steampowered.com/appreviews/${appId}?json=1&language=english`;
    const detailsUrl = `https://store.steampowered.com/api/appdetails?appids=${appId}`;

    const [reviewsData, detailsData] = await Promise.all([
        fetchWithProxyRotation(reviewsUrl),
        fetchWithProxyRotation(detailsUrl)
    ]);


    if (reviewsData && reviewsData.success && detailsData && detailsData[appId] && detailsData[appId].success) {
        fighter.steamData = reviewsData.query_summary; 
        const appDetails = detailsData[appId].data;
        if (appDetails?.metacritic?.score) {
            fighter.scores.metacritic = appDetails.metacritic.score.toString();
        } else {
            fighter.scores.metacritic = '404';
            card.metacriticError.classList.remove('hidden');
        }
        
        card.metacritic.textContent = fighter.scores.metacritic;
        updateTimestamp(fighter);
        updateFighterInUniverse(fighter);
        updateUIAfterFetch(cardPrefix);
        updateScoresAndDisplay();
    } else {
        card.steamError.textContent = 'Failed to update scores.';
    }
    
    card.updateScoresBtn.textContent = 'Update Scores';
    card.updateScoresBtn.disabled = false;
}

/**
 * Fetches the latest data for a single fighter object and updates it in place.
 * Does not interact with the DOM, designed for background updates.
 * @param {object} fighter - The fighter object to refresh.
 * @returns {Promise<boolean>} A promise that resolves to true if successful, false otherwise.
 */
export async function refreshFighterData(fighter) {
    if (!fighter || !fighter.appId) return false;

    const reviewsUrl = `https://store.steampowered.com/appreviews/${fighter.appId}?json=1&language=english`;
    const detailsUrl = `https://store.steampowered.com/api/appdetails?appids=${fighter.appId}`;

    const [reviewsData, detailsData] = await Promise.all([
        fetchWithProxyRotation(reviewsUrl),
        fetchWithProxyRotation(detailsUrl)
    ]);

    if (reviewsData && reviewsData.success && detailsData && detailsData[fighter.appId] && detailsData[fighter.appId].success) {
        // Update the fighter object with the new data
        fighter.steamData = reviewsData.query_summary;
        const appDetails = detailsData[fighter.appId].data;
        if (appDetails?.metacritic?.score) {
            fighter.scores.metacritic = appDetails.metacritic.score.toString();
        } else {
            fighter.scores.metacritic = '404';
        }
        updateTimestamp(fighter);
        return true;
    } else {
        console.warn(`Failed to refresh data for ${fighter.name} (${fighter.appId})`);
        return false;
    }
}


export async function fetchAndAddSingleFighter(appId) {
    const btn = dom.setupPanel.addFighterBtn;
    const input = dom.setupPanel.addFighterIdInput;
    const statusEl = dom.setupPanel.rosterStatus;

    if (!appId || !/^\d+$/.test(appId)) {
        statusEl.textContent = 'Invalid App ID.';
        setTimeout(() => statusEl.textContent = '', 3000);
        return;
    }
    
    btn.disabled = true;
    btn.textContent = '...';
    statusEl.textContent = `Fetching ${appId}...`;
    
    const reviewsUrl = `https://store.steampowered.com/appreviews/${appId}?json=1&language=english`;
    const detailsUrl = `https://store.steampowered.com/api/appdetails?appids=${appId}`;
    
    const [reviewsData, detailsData] = await Promise.all([
        fetchWithProxyRotation(reviewsUrl),
        fetchWithProxyRotation(detailsUrl)
    ]);

    if (reviewsData && reviewsData.success && detailsData && detailsData[appId] && detailsData[appId].success) {
        const newFighter = createNewFighter();
        const appDetails = detailsData[appId].data;
        
        newFighter.appId = appId;
        newFighter.steamData = reviewsData.query_summary;
        newFighter.name = appDetails?.name || `Game ${appId}`;
        newFighter.devHouse = appDetails?.developers?.[0] || '';
        newFighter.publisher = appDetails?.publishers?.[0] || '';
        newFighter.genres = appDetails?.genres?.map(g => g.description.toLowerCase()) || [];
        if (appDetails?.metacritic?.score) {
            newFighter.scores.metacritic = appDetails.metacritic.score.toString();
        } else {
            newFighter.scores.metacritic = '404';
        }
        updateTimestamp(newFighter);
        
        addFighterToUniverse(newFighter);
        input.value = '';
        statusEl.textContent = '';
    } else {
        statusEl.textContent = `Failed to fetch ${appId}.`;
    }

    btn.disabled = false;
    btn.textContent = 'Add Fighter';
}

export async function populateUniverseFromSteamIds(ids) {
    const btn = dom.universeSetupModal.startBtn;
    const errorEl = dom.universeSetupModal.error;
    let currentIdIndex = 0;
    let universeCount = 0;

    btn.disabled = true;
    btn.textContent = 'Populating...';

    while (currentIdIndex < ids.length) {
        const appId = ids[currentIdIndex];
        errorEl.textContent = `Processing fighter ${currentIdIndex + 1} of ${ids.length}...`;
        currentIdIndex++;
        
        if (state.universeFighters.some(f => f.appId === appId)) {
            continue;
        }

        const reviewsUrl = `https://store.steampowered.com/appreviews/${appId}?json=1&language=english`;
        const detailsUrl = `https://store.steampowered.com/api/appdetails?appids=${appId}`;
        const [reviewsData, detailsData] = await Promise.all([
            fetchWithProxyRotation(reviewsUrl),
            fetchWithProxyRotation(detailsUrl)
        ]);

        if (reviewsData && reviewsData.success && detailsData && detailsData[appId] && detailsData[appId].success) {
            const newFighter = createNewFighter();
            const appDetails = detailsData[appId].data;
            
            newFighter.appId = appId;
            newFighter.steamData = reviewsData.query_summary;
            newFighter.name = appDetails?.name || `Game ${appId}`;
            newFighter.devHouse = appDetails?.developers?.[0] || '';
            newFighter.publisher = appDetails?.publishers?.[0] || '';
            newFighter.genres = appDetails?.genres?.map(g => g.description.toLowerCase()) || [];
            if (appDetails?.metacritic?.score) {
                newFighter.scores.metacritic = appDetails.metacritic.score.toString();
            } else {
                newFighter.scores.metacritic = '404';
            }
            updateTimestamp(newFighter);
            
            addFighterToUniverse(newFighter);
            universeCount++;
        }
        await delay(200);
    }

    populateUniverseSelectors();
    import('./state.js').then(stateModule => stateModule.processUniverseForNewTitles());
    dom.universeSetupModal.modal.classList.add('hidden');
    import('./state.js').then(stateModule => stateModule.saveUniverseToLocalStorage());
}

