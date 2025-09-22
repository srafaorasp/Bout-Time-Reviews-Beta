import { state } from './state.js';

/**
 * Creates a delay for a specified number of milliseconds.
 * @param {number} ms - The number of milliseconds to wait.
 * @returns {Promise<void>} A promise that resolves after the delay.
 */
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Triggers a file download in the browser.
 * @param {object} data - The JSON object to download.
 * @param {string} filename - The desired name for the downloaded file.
 */
export function downloadJSON(data, filename) {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", filename);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

/**
 * Opens a file dialog for the user to upload a file.
 * @param {function} callback - The function to call with the parsed file data.
 * @param {string} extension - The file extension to accept (e.g., '.btr').
 */
export function triggerFileUpload(callback, extension) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = extension;
    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                callback(data);
            } catch (err) {
                console.error(`Error parsing imported ${extension} file:`, err);
                showToast(`Error: Could not read the file. Please check format.`, 5000);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

/**
 * Displays a short-lived notification message on the screen.
 * @param {string} message - The message to display.
 * @param {number} [duration=5000] - How long to display the message in milliseconds.
 */
export function showToast(message, duration = 5000) {
    const toastContainer = document.getElementById('toast-notification');
    const toastMessage = document.getElementById('toast-message');
    if (!toastContainer || !toastMessage) return;

    toastMessage.textContent = message;
    toastContainer.classList.remove('hidden');
    toastContainer.classList.add('opacity-100');
    
    setTimeout(() => {
        toastContainer.classList.remove('opacity-100');
        setTimeout(() => toastContainer.classList.add('hidden'), 300);
    }, duration);
}

/**
 * Calculates the base score for a fighter based on Steam and Metacritic reviews.
 * @param {object} fighterObject - The fighter data object.
 * @returns {number} The calculated raw score.
 */
export function calculateRawScore(fighterObject) {
    if (!fighterObject || !fighterObject.scores) return 0;
    const metacriticInput = fighterObject.scores.metacritic;
    const metacriticScore = (metacriticInput !== '404' && metacriticInput) ? parseFloat(metacriticInput) / 10.0 : 0;
    let totalScore = 0, weightCount = 0;

    if (fighterObject.steamData) {
        const steamReviewData = fighterObject.steamData;
        const communityScore = (steamReviewData.total_reviews > 0) ? (steamReviewData.total_positive / steamReviewData.total_reviews) * 10 : 0;
        
        if (communityScore > 0) {
            totalScore += communityScore * 0.70;
            weightCount += 0.70;
        }
        if (metacriticScore > 0) {
            totalScore += metacriticScore * 0.30;
            weightCount += 0.30;
        }
    } else if (metacriticScore > 0) { // Fallback if no steam data
        totalScore = metacriticScore;
        weightCount = 1;
    }
    return weightCount > 0 ? totalScore / weightCount : 0;
}

export function getWeightClass(rawScore) {
    if (rawScore < 4.0) return 'Unranked';
    if (rawScore < 6.0) return 'Featherweight';
    if (rawScore < 8.0) return 'Cruiserweight';
    if (rawScore >= 8.0) return 'Heavyweight';
    return 'Unranked';
}

export function getChampionshipBonus(fighterObject) {
    if (!fighterObject || !fighterObject.name) return 0;
    const potentialBonuses = [0];
    const name = fighterObject.name;
    if (name === 'Vacant' || (fighterObject.isRetired && !fighterObject.isHallOfFamer)) return 0;
    
    if (name === state.roster.major.undisputed.name) potentialBonuses.push(0.03);
    if (['heavyweight', 'interGenre', 'cruiserweight', 'featherweight'].some(key => state.roster.major[key].name === name)) potentialBonuses.push(0.02);
    if (Object.keys(state.roster.local).some(key => state.roster.local[key].name === name)) potentialBonuses.push(0.01);
    
    const pastTitles = fighterObject.record.pastTitles || {};
    if (pastTitles.undisputed) potentialBonuses.push(0.02);
    if (Object.keys(pastTitles).some(title => ['heavyweight', 'interGenre', 'cruiserweight', 'featherweight'].includes(title))) {
        potentialBonuses.push(0.01);
    }
    return Math.max(...potentialBonuses);
}

export function applyBonuses(rawScore, fighterObject) {
    if (!fighterObject) return 0;
    return rawScore * (1 + getChampionshipBonus(fighterObject));
}
