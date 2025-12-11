/**
 * TwitchNoSub DVR Loader
 * Content script that injects DVR modules into the page context
 */

(function () {
    'use strict';

    // Only run on main frame
    if (window !== window.top) return;

    console.log('[TNS-DVR] Loader script running');

    /**
     * Inject a script into the page context
     */
    function injectScript(src, onload) {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL(src);
        script.onload = () => {
            script.remove();
            if (onload) onload();
        };
        script.onerror = (e) => {
            console.error('[TNS-DVR] Failed to load script:', src, e);
            script.remove();
        };
        (document.head || document.documentElement).appendChild(script);
    }

    /**
     * Load DVR modules in sequence
     */
    function loadDVRModules() {
        // Load modules in order (dependencies first)
        const modules = [
            'src/dvr/dvr-tracker.js',
            'src/dvr/dvr-ui.js',
            'src/dvr/dvr-controller.js',
            'src/dvr/dvr-inject.js'
        ];

        let loadIndex = 0;

        function loadNext() {
            if (loadIndex < modules.length) {
                const module = modules[loadIndex];
                console.log(`[TNS-DVR] Loading module: ${module}`);
                injectScript(module, () => {
                    loadIndex++;
                    // Small delay between module loads
                    setTimeout(loadNext, 50);
                });
            } else {
                console.log('[TNS-DVR] All DVR modules loaded');
            }
        }

        loadNext();
    }

    // Start loading modules when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadDVRModules);
    } else {
        loadDVRModules();
    }

})();
