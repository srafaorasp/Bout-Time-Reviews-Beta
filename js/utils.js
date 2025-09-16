// This file is for general helper and utility functions.

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
                // In a modular setup, UI feedback should be handled by a dedicated UI function.
                // For now, we'll just log the error.
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

