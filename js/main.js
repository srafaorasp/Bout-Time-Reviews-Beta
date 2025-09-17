import { initializeApp, attachEventListeners } from './state.js';
import { initAudio } from './sound.js';

// --- INITIALIZATION ---
// We wrap the main logic in an async function to use await for fetching modals.
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Fetch and inject modals first. This is crucial.
    try {
        const response = await fetch('modals.html');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const modalHTML = await response.text();
        const modalContainer = document.getElementById('modal-container');
        if (modalContainer) {
            modalContainer.innerHTML = modalHTML;
        } else {
            console.error('Modal container not found! Appending to body as a fallback.');
            document.body.insertAdjacentHTML('beforeend', modalHTML);
        }
    } catch (error) {
        console.error('Failed to load modals:', error);
        // Display a critical error to the user if UI components can't be loaded.
        document.body.innerHTML = '<div class="text-red-500 text-center p-8">Critical Error: Could not load UI components. Please refresh the page.</div>';
        return; // Stop execution if modals fail to load
    }
    
    // 2. Now that the DOM is complete (including injected modals), initialize the app.
    // This resolves the race condition.
    initializeApp();
    attachEventListeners();

    // 3. Initialize audio context on the first user interaction to comply with browser policies.
    const initAudioOnce = () => {
        initAudio();
        // Remove the listeners after the first interaction.
        document.body.removeEventListener('click', initAudioOnce);
        document.body.removeEventListener('keydown', initAudioOnce);
    };
    document.body.addEventListener('click', initAudioOnce, { once: true });
    document.body.addEventListener('keydown', initAudioOnce, { once: true });
});
