import { initializeApp, attachEventListeners } from './state.js';
import { initAudio } from './sound.js';

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    // Fetch and inject modals first
    try {
        const response = await fetch('modals.html');
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
    }
    
    // Now that the DOM is complete, initialize the app state and listeners
    initializeApp();
    attachEventListeners();

    // Initialize audio on the first user interaction
    document.body.addEventListener('click', initAudio, { once: true });
    document.body.addEventListener('keydown', initAudio, { once: true });
});

