/**
 * TwitchNoSub DVR Injection Script
 * Initializes the DVR feature when running on Twitch
 */

(function () {
    'use strict';

    // Prevent double initialization
    if (window.TNS_DVR_INITIALIZED) {
        console.log('[TNS-DVR] Already initialized, skipping');
        return;
    }
    window.TNS_DVR_INITIALIZED = true;

    console.log('[TNS-DVR] DVR Injection script loaded');

    /**
     * Load DVR modules in order
     */
    async function loadDVRModules() {
        return new Promise((resolve, reject) => {
            // Check if modules are already loaded
            if (window.TNS_DVRTracker && window.TNS_DVRUI && window.TNS_DVRController) {
                console.log('[TNS-DVR] Modules already loaded');
                resolve();
                return;
            }

            // Wait for all modules to be available
            let checkCount = 0;
            const checkInterval = setInterval(() => {
                checkCount++;

                if (window.TNS_DVRTracker && window.TNS_DVRUI && window.TNS_DVRController) {
                    clearInterval(checkInterval);
                    console.log('[TNS-DVR] All modules loaded');
                    resolve();
                } else if (checkCount > 50) { // 5 second timeout
                    clearInterval(checkInterval);
                    reject(new Error('Timeout waiting for DVR modules'));
                }
            }, 100);
        });
    }

    /**
     * Initialize DVR when page is ready
     */
    async function initDVR() {
        try {
            await loadDVRModules();

            // Create and initialize controller
            const controller = new window.TNS_DVRController();
            await controller.initialize();

            // Store globally for debugging
            window.TNS_DVR = controller;

            console.log('[TNS-DVR] DVR system fully initialized');
            console.log('[TNS-DVR] Use window.TNS_DVR.getDebugInfo() for debugging');

        } catch (error) {
            console.error('[TNS-DVR] Failed to initialize DVR:', error);
        }
    }

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            // Small delay to ensure Twitch's scripts are loaded
            setTimeout(initDVR, 1000);
        });
    } else {
        // DOM already ready
        setTimeout(initDVR, 1000);
    }

    /**
     * Also hook into HLS playlist fetches to track segments
     * This works independently of the main controller
     */
    function hookPlaylistFetches() {
        const originalFetch = window.fetch;

        window.fetch = async function (...args) {
            const response = await originalFetch.apply(this, args);

            try {
                const url = args[0] instanceof Request ? args[0].url : args[0].toString();

                // Detect live stream playlist requests
                if (url.includes('.m3u8') && !url.includes('vod') && !url.includes('video')) {
                    // Clone response to read body
                    const clonedResponse = response.clone();
                    const text = await clonedResponse.text();

                    // Check if this is a live stream playlist (has EXTINF segments)
                    if (text.includes('#EXTINF:') && text.includes('.ts')) {
                        // Notify DVR controller if available
                        if (window.TNS_DVR && window.TNS_DVR.tracker) {
                            window.TNS_DVR.tracker.processPlaylist(text, url);
                        }
                    }

                    // Return new response with same body
                    return new Response(text, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: response.headers
                    });
                }
            } catch (e) {
                // Silently fail - don't break normal fetch
            }

            return response;
        };

        console.log('[TNS-DVR] Fetch hook installed');
    }

    // Install fetch hook
    hookPlaylistFetches();

})();
