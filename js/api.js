import { state, dom, createNewFighter, updateTimestamp, addFighterToUniverse, updateFighterInUniverse } from './state.js';
import { updateUIAfterFetch, updateScoresAndDisplay, showToast, showOriginLockoutModal } from './ui.js';
import { delay } from './utils.js';

const initialProxies = [
    'https://cors.eu.org/',
    'https://api.allorigins.win/get?url=',
    'https://corsproxy.io/?',
    'https://proxy.cors.sh/',
    'https://cors.bridged.cc/',
    'https://worker-proxy.priver.dev/?url=',
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://cors-proxy.priver.dev/'
];

export async function fetchWithProxyRotation(appId) {
    if (initialProxies.length === 0) {
        console.error("No proxies available.");
        return null;
    }

    for (const proxyUrl of initialProxies) {
        const reviewsApiUrl = `https://store.steampowered.com/appreviews/${appId}?json=1&language=english`;
        const detailsApiUrl = `https://store.steampowered.com/api/appdetails?appids=${appId}`;
        
        const proxyUrlReviews = proxyUrl.includes('?') ? `${proxyUrl}${encodeURIComponent(reviewsApiUrl)}` : `${proxyUrl}${reviewsApiUrl}`;
        const proxyUrlDetails = proxyUrl.includes('?') ? `${proxyUrl}${encodeURIComponent(detailsApiUrl)}` : `${proxyUrl}${detailsApiUrl}`;

        try {
            const [reviewsResponse, detailsResponse] = await Promise.all([
                fetch(proxyUrlReviews),
                fetch(proxyUrlDetails)
            ]);

            if (!reviewsResponse.ok || !detailsResponse.ok) throw new Error(`Network response not ok from proxy: ${proxyUrl}, Status: ${reviewsResponse.status}/${detailsResponse.status}`);
            
            const reviewsText = await reviewsResponse.text();
            const detailsText = await detailsResponse.text();
            
            const steamReviews = reviewsText.includes('"contents":') ? JSON.parse(reviewsText).contents : reviewsText;
            const steamDetails = detailsText.includes('"contents":') ? JSON.parse(detailsText).contents : detailsText;

            const parsedReviews = JSON.parse(steamReviews);
            const parsedDetails = JSON.parse(steamDetails);

            if (parsedReviews.success && parsedDetails[appId] && parsedDetails[appId].success) {
                console.log(`SUCCESS with AppID ${appId} using proxy ${proxyUrl}`);
                return { steamReviews: parsedReviews, steamDetails: parsedDetails };
            } else {
                throw new Error(`API success flag was false for AppID ${appId}`);
            }
        } catch (error) {
            console.warn(`FAILED with AppID ${appId} using proxy ${proxyUrl}. Error:`, error.message);
        }
    }
    console.error(`All proxies failed for AppID ${appId}`);
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
        clearCard(cardPrefix);
        updateScoresAndDisplay();
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

    const data = await fetchWithProxyRotation(appId);

    if (data) {
        fighter.appId = appId;
        fighter.steamData = data.steamReviews.query_summary; 
        
        const appDetails = data.steamDetails[appId].data;
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

    const data = await fetchWithProxyRotation(appId);

    if (data) {
        fighter.steamData = data.steamReviews.query_summary; 
        const appDetails = data.steamDetails[appId].data;
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
    
    const data = await fetchWithProxyRotation(appId);
    if (data) {
        const newFighter = createNewFighter();
        const appDetails = data.steamDetails[appId].data;
        
        newFighter.appId = appId;
        newFighter.steamData = data.steamReviews.query_summary;
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

