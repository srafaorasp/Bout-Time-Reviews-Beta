import { initializeApp, attachEventListeners } from './state.js';
import { initAudio } from './sound.js';

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    // Fetch and inject modals first
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
            // If the container isn't found, append to body as a fallback.
            document.body.insertAdjacentHTML('beforeend', modalHTML);
        }
    } catch (error) {
        console.error('Failed to load modals:', error);
        // Optionally, display an error to the user that core UI components failed to load
        document.body.innerHTML = '<div class="text-red-500 text-center p-8">Critical Error: Could not load UI components. Please refresh the page.</div>';
        return; // Stop execution if modals fail to load
    }
    
    // Now that the DOM is complete (including modals), initialize the app
    initializeApp();
    attachEventListeners();

    // Initialize audio on the first user interaction
    const initAudioOnce = () => initAudio();
    document.body.addEventListener('click', initAudioOnce, { once: true });
    document.body.addEventListener('keydown', initAudioOnce, { once: true });
});
