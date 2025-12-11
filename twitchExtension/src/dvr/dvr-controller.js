/**
 * TwitchNoSub DVR Controller
 * Uses an overlay VOD player for seamless seeking beyond live buffer
 * 
 * Features:
 * - Uses browser's actual video buffer for short seeks (~60-90s)
 * - Overlays VOD player for longer seeks (no page navigation!)
 * - Seamless swap between Live and VOD players
 */

class DVRController {
    constructor() {
        this.tracker = null;
        this.ui = null;
        this.playerElement = null;

        this.isActive = false;
        this.currentChannel = null;
        this.streamStartTime = null;
        this.currentVodId = null;
        this.updateInterval = null;
        this.playerCheckInterval = null;

        // VOD Overlay system
        this.vodOverlay = null;
        this.vodPlayer = null;
        this.isWatchingVod = false;
        this.vodEmbedLoaded = false;

        // Settings
        this.settings = {
            enabled: true,
            showOnHover: true,
            autoHideDelay: 3000
        };

        this.hideTimeout = null;
        this.lastInteractionTime = Date.now();

        console.log('[TNS-DVR] Controller initialized');
    }

    /**
     * Initialize the DVR system
     */
    async initialize() {
        // Create tracker and UI
        this.tracker = new (window.TNS_DVRTracker || self.TNS_DVRTracker)();
        this.ui = new window.TNS_DVRUI();

        // Setup tracker event listeners
        this.tracker.on('streamStarted', this.handleStreamStarted.bind(this));
        this.tracker.on('streamEnded', this.handleStreamEnded.bind(this));

        // Setup UI callbacks
        this.ui.onSeek = this.handleSeek.bind(this);
        this.ui.onGoLive = this.handleGoLive.bind(this);
        this.ui.onPreview = this.handlePreview.bind(this);

        // Watch for URL changes (SPA navigation)
        this.setupNavigationObserver();

        // Check current page
        this.checkCurrentPage();

        // Setup player hover detection
        this.setupHoverDetection();

        // Load Twitch Embed API
        this.loadTwitchEmbedAPI();

        console.log('[TNS-DVR] Controller fully initialized');
    }

    /**
     * Load Twitch Embed API script
     */
    loadTwitchEmbedAPI() {
        if (window.Twitch?.Embed) {
            console.log('[TNS-DVR] Twitch Embed API already loaded');
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://embed.twitch.tv/embed/v1.js';
        script.onload = () => {
            console.log('[TNS-DVR] Twitch Embed API loaded');
        };
        document.head.appendChild(script);
    }

    /**
     * Check if we're on a live stream page or VOD
     */
    checkCurrentPage() {
        const pathParts = window.location.pathname.split('/').filter(Boolean);

        // Check if watching VOD
        if (pathParts[0] === 'videos') {
            const vodId = pathParts[1];
            this.handleVodPage(vodId);
            return;
        }

        // Remove return to live button if exists
        this.removeReturnToLiveButton();

        // Check if this is a channel page (live stream)
        if (pathParts.length === 1 && !['directory', 'videos', 'clips', 'settings', 'subscriptions', 'inventory', 'drops', 'wallet'].includes(pathParts[0])) {
            const channelName = pathParts[0];

            // Check if stream is actually live and get VOD info
            this.checkStreamInfo(channelName).then(info => {
                if (info.isLive) {
                    this.startDVR(channelName, info);
                } else {
                    this.stopDVR();
                }
            });
        } else {
            this.stopDVR();
        }
    }

    /**
     * Handle VOD page - check if stream is still live and show return button
     */
    async handleVodPage(vodId) {
        this.stopDVR();

        try {
            const response = await fetch('https://gql.twitch.tv/gql', {
                method: 'POST',
                headers: {
                    'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query: `query {
                        video(id: "${vodId}") {
                            id
                            owner {
                                login
                                displayName
                                stream {
                                    id
                                    createdAt
                                }
                            }
                        }
                    }`
                })
            });

            const data = await response.json();
            const video = data?.data?.video;

            if (video?.owner?.stream) {
                const channelLogin = video.owner.login;
                const channelName = video.owner.displayName;
                console.log(`[TNS-DVR] VOD owner ${channelName} is still live!`);
                this.showReturnToLiveButton(channelLogin, channelName);
            } else {
                this.removeReturnToLiveButton();
            }
        } catch (error) {
            console.error('[TNS-DVR] Error checking VOD info:', error);
        }
    }

    /**
     * Show the "Return to Live" button
     */
    showReturnToLiveButton(channelLogin, channelName) {
        this.removeReturnToLiveButton();

        const waitForControls = () => {
            if (!this.ui) {
                this.ui = new window.TNS_DVRUI();
            }

            this.ui.onReturnToLive = (login) => this.navigateToLive(login);
            const button = this.ui.createReturnToLiveButton(channelLogin, channelName);

            if (!button) {
                setTimeout(waitForControls, 500);
            }
        };

        waitForControls();
    }

    /**
     * Remove the return to live button
     */
    removeReturnToLiveButton() {
        if (this.ui) {
            this.ui.removeReturnToLiveButton();
        }
        const existing = document.getElementById('tns-return-live-btn');
        if (existing) {
            existing.remove();
        }
    }

    /**
     * Navigate back to live stream
     */
    navigateToLive(channelLogin) {
        // If we are just watching the VOD overlay, just switch back!
        if (this.isWatchingVod) {
            this.switchToLive();
            return;
        }

        const liveUrl = `/${channelLogin}`;

        console.log(`[TNS-DVR] Returning to live: ${liveUrl}`);
        this.showNotification(`🔴 Retour au live...`);

        window.history.pushState({ tns_dvr: true }, '', `https://www.twitch.tv${liveUrl}`);
        window.dispatchEvent(new PopStateEvent('popstate', { state: { tns_dvr: true } }));
    }

    /**
     * Get stream info including VOD ID using Twitch GQL
     */
    async checkStreamInfo(channelName) {
        try {
            const response = await fetch('https://gql.twitch.tv/gql', {
                method: 'POST',
                headers: {
                    'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query: `query {
                        user(login: "${channelName}") {
                            id
                            stream {
                                id
                                createdAt
                                archiveVideo {
                                    id
                                    createdAt
                                    lengthSeconds
                                    status
                                }
                            }
                        }
                    }`
                })
            });

            const data = await response.json();
            const user = data?.data?.user;
            const stream = user?.stream;

            if (stream) {
                return {
                    isLive: true,
                    streamId: stream.id,
                    streamStartTime: new Date(stream.createdAt).getTime(),
                    vodId: stream.archiveVideo?.id || null,
                    vodCreatedAt: stream.archiveVideo?.createdAt ? new Date(stream.archiveVideo.createdAt).getTime() : null,
                    vodStatus: stream.archiveVideo?.status || null
                };
            }

            return { isLive: false };
        } catch (error) {
            console.error('[TNS-DVR] Error checking stream info:', error);
            return { isLive: false };
        }
    }

    /**
     * Refresh VOD info to get latest ID
     */
    async refreshVodInfo() {
        if (!this.currentChannel) return;

        const info = await this.checkStreamInfo(this.currentChannel);
        if (info.vodId) {
            this.currentVodId = info.vodId;
            console.log(`[TNS-DVR] Updated VOD ID: ${this.currentVodId}`);
        }
    }

    /**
     * Start DVR tracking for a channel
     */
    async startDVR(channelName, streamInfo) {
        if (this.isActive && this.currentChannel === channelName) {
            return;
        }

        console.log(`[TNS-DVR] Starting DVR for: ${channelName}`);

        this.currentChannel = channelName;
        this.isActive = true;
        this.streamStartTime = streamInfo.streamStartTime;
        this.currentVodId = streamInfo.vodId;

        if (this.currentVodId) {
            console.log(`[TNS-DVR] VOD available: ${this.currentVodId} - Full DVR enabled!`);
            // Preload VOD overlay
            this.createVodOverlay();
        } else {
            console.log('[TNS-DVR] No VOD available - Limited to buffer only');
        }

        // Start tracking
        this.tracker.startTracking(channelName);
        this.tracker.streamStartTime = streamInfo.streamStartTime;

        // Create and attach UI
        this.ui.create();

        // Wait for player to be ready
        this.waitForPlayer().then(() => {
            this.ui.attach();
            this.startUpdateLoop();
        });

        // Refresh VOD info periodically
        this.vodRefreshInterval = setInterval(() => {
            if (!this.currentVodId) {
                this.refreshVodInfo();
            }
        }, 30000);
    }

    /**
     * Create the VOD overlay container and player
     */
    createVodOverlay() {
        if (this.vodOverlay) return;

        const playerContainer = document.querySelector('.video-player__container') ||
            document.querySelector('[data-a-target="video-player"]');

        if (!playerContainer) {
            console.warn('[TNS-DVR] Could not find player container for VOD overlay');
            return;
        }

        // Create overlay container
        this.vodOverlay = document.createElement('div');
        this.vodOverlay.id = 'tns-vod-overlay';
        this.vodOverlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 50;
            background: #000;
            display: none;
        `;

        // Create container for Twitch embed
        const embedContainer = document.createElement('div');
        embedContainer.id = 'tns-vod-embed';
        embedContainer.style.cssText = `
            width: 100%;
            height: 100%;
        `;
        this.vodOverlay.appendChild(embedContainer);

        // Add return to live button inside overlay
        const returnBtn = document.createElement('button');
        returnBtn.id = 'tns-vod-return-btn';
        returnBtn.innerHTML = '🔴 Retour au Live';
        returnBtn.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            z-index: 100;
            padding: 8px 16px;
            background: linear-gradient(135deg, #eb0400 0%, #cc0000 100%);
            border: none;
            border-radius: 4px;
            color: white;
            font-family: 'Roobert', 'Inter', sans-serif;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            transition: all 0.2s ease;
        `;
        returnBtn.onmouseenter = () => {
            returnBtn.style.transform = 'scale(1.05)';
        };
        returnBtn.onmouseleave = () => {
            returnBtn.style.transform = 'scale(1)';
        };
        returnBtn.onclick = () => this.switchToLive();
        this.vodOverlay.appendChild(returnBtn);

        // Insert overlay into player container
        playerContainer.style.position = 'relative';
        playerContainer.appendChild(this.vodOverlay);

        console.log('[TNS-DVR] VOD overlay container created');
    }

    /**
     * Initialize the VOD embed player
     */
    /**
     * Initialize the VOD embed player or reuse existing
     */
    initVodEmbed(vodId, startTime = 0) {
        // Reuse existing player if same VOD
        if (this.vodPlayer && this.lastVodId === vodId) {
            console.log('[TNS-DVR] Reusing existing VOD player, seeking to:', startTime);
            try {
                if (this.vodPlayer.seek) {
                    this.vodPlayer.seek(startTime);
                } else if (this.vodPlayer.setVideo) {
                    // Use formatVodTimestamp for seek if standard seek not available/working
                    // But setVideo usually takes ID and time
                    this.vodPlayer.seek(startTime);
                }
            } catch (e) {
                console.error('[TNS-DVR] Seek failed:', e);
            }
            return;
        }

        if (!window.Twitch?.Embed) {
            console.warn('[TNS-DVR] Twitch Embed API not loaded yet');
            // Fallback to iframe
            this.createVodIframe(vodId, startTime);
            return;
        }

        const embedContainer = document.getElementById('tns-vod-embed');
        if (!embedContainer) return;

        // Clear existing embed ONLY if we are creating a new one
        embedContainer.innerHTML = '';
        this.lastVodId = vodId;

        try {
            // Options: layout video to hide chat (we want full video)
            // No direct way to hide controls via Embed options officially, usually controlled by CSS in parent or query params
            this.vodPlayer = new window.Twitch.Embed('tns-vod-embed', {
                width: '100%',
                height: '100%',
                video: vodId,
                time: this.formatVodTimestamp(startTime),
                autoplay: true,
                muted: false,
                layout: 'video', // Attempt to hide chat/surroundings
                parent: ['twitch.tv', 'www.twitch.tv']
            });

            this.vodPlayer.addEventListener(window.Twitch.Embed.VIDEO_READY, () => {
                console.log('[TNS-DVR] VOD embed ready');
                this.vodEmbedLoaded = true;
                // Once ready, we can control it better
            });

            // Listen to play/pause to sync if needed
            this.vodPlayer.addEventListener(window.Twitch.Embed.VIDEO_PLAY, () => {
                this.isWatchingVod = true;
            });

            console.log('[TNS-DVR] VOD embed initialized for video:', vodId);
        } catch (error) {
            console.error('[TNS-DVR] Error creating VOD embed:', error);
            this.createVodIframe(vodId, startTime);
        }
    }

    /**
     * Create VOD player using iframe (fallback)
     */
    createVodIframe(vodId, startTime = 0) {
        const embedContainer = document.getElementById('tns-vod-embed');
        if (!embedContainer) return;

        // Reuse iframe if it exists and we just want to seek? 
        // Changing src triggers reload. postMessage is needed for seeking without reload.
        // For now, simple reload fallback is acceptable if Embed fails.
        embedContainer.innerHTML = '';
        this.lastVodId = vodId;

        const iframe = document.createElement('iframe');
        iframe.id = 'tns-vod-iframe';
        iframe.src = `https://player.twitch.tv/?video=${vodId}&time=${this.formatVodTimestamp(startTime)}&parent=twitch.tv&autoplay=true`;
        iframe.style.cssText = `
            width: 100%;
            height: 100%;
            border: none;
        `;
        iframe.allowFullscreen = true;
        iframe.allow = 'autoplay; fullscreen';

        embedContainer.appendChild(iframe);
        this.vodEmbedLoaded = true;

        console.log('[TNS-DVR] VOD iframe created for video:', vodId);
    }

    /**
     * Switch to VOD overlay at specified position
     */
    async switchToVod(vodPositionSeconds) {
        if (!this.currentVodId) {
            await this.refreshVodInfo();
        }

        if (!this.currentVodId) {
            console.warn('[TNS-DVR] No VOD available for this stream');
            this.showNotification('⚠️ VOD pas encore disponible - Le streamer doit avoir les VODs activés');
            return;
        }

        const adjustedPosition = Math.max(0, vodPositionSeconds - 5);

        console.log(`[TNS-DVR] Switching to VOD overlay at ${this.formatTime(adjustedPosition)}`);

        // Only show notification if switching from live to VOD
        if (!this.isWatchingVod) {
            this.showNotification(`⏪ Chargement VOD...`);
        } else {
            // Just seeking logic visual feedback could move handle inside UI
        }

        // Create overlay if needed
        if (!this.vodOverlay) {
            this.createVodOverlay();
        }

        // Initialize or update VOD player (will seek if already exists)
        this.initVodEmbed(this.currentVodId, adjustedPosition);

        // Show overlay
        if (this.vodOverlay) {
            this.vodOverlay.style.display = 'block';
            this.isWatchingVod = true;

            // Mute live player
            if (this.playerElement) {
                this.playerElement.muted = true;
            }

            if (!this.isWatchingVod) { // Only log once
                this.showNotification(`✅ VOD chargée`);
                console.log('[TNS-DVR] Switched to VOD overlay');
            }
        }
    }

    /**
     * Switch back to live player
     */
    switchToLive() {
        console.log('[TNS-DVR] Switching back to live');

        if (this.vodOverlay) {
            this.vodOverlay.style.display = 'none';
        }

        this.isWatchingVod = false;

        // Unmute and seek to live
        if (this.playerElement) {
            this.playerElement.muted = false;

            // Seek to live position
            if (this.playerElement.buffered.length > 0) {
                const livePosition = this.playerElement.buffered.end(this.playerElement.buffered.length - 1);
                this.playerElement.currentTime = livePosition;
            }
        }

        this.showNotification('🔴 Retour au Live');
    }

    /**
     * Stop DVR tracking
     */
    stopDVR() {
        if (!this.isActive) return;

        console.log('[TNS-DVR] Stopping DVR');

        this.isActive = false;
        this.currentChannel = null;
        this.currentVodId = null;
        this.streamStartTime = null;
        this.isWatchingVod = false;

        this.tracker.stopTracking();
        this.ui.hide();

        // Clean up VOD overlay
        if (this.vodOverlay) {
            this.vodOverlay.remove();
            this.vodOverlay = null;
            this.vodPlayer = null;
            this.vodEmbedLoaded = false;
        }

        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

        if (this.vodRefreshInterval) {
            clearInterval(this.vodRefreshInterval);
            this.vodRefreshInterval = null;
        }
    }

    /**
     * Wait for the Twitch player element to be available
     */
    waitForPlayer() {
        return new Promise((resolve) => {
            const checkPlayer = () => {
                const player = document.querySelector('video');
                if (player) {
                    this.playerElement = player;
                    resolve(player);
                    return true;
                }
                return false;
            };

            if (checkPlayer()) return;

            this.playerCheckInterval = setInterval(() => {
                if (checkPlayer()) {
                    clearInterval(this.playerCheckInterval);
                }
            }, 500);

            setTimeout(() => {
                if (this.playerCheckInterval) {
                    clearInterval(this.playerCheckInterval);
                    resolve(null);
                }
            }, 30000);
        });
    }

    /**
     * Setup navigation observer for SPA
     */
    setupNavigationObserver() {
        window.addEventListener('popstate', () => {
            setTimeout(() => this.checkCurrentPage(), 100);
        });

        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        history.pushState = (...args) => {
            originalPushState.apply(history, args);
            setTimeout(() => this.checkCurrentPage(), 100);
        };

        history.replaceState = (...args) => {
            originalReplaceState.apply(history, args);
            setTimeout(() => this.checkCurrentPage(), 100);
        };
    }

    /**
     * Setup hover detection for showing/hiding UI
     */
    setupHoverDetection() {
        document.addEventListener('mousemove', (e) => {
            if (!this.isActive) return;

            const playerContainer = document.querySelector('.video-player__container') ||
                document.querySelector('[data-a-target="video-player"]');

            if (playerContainer) {
                const rect = playerContainer.getBoundingClientRect();
                const isOverPlayer = e.clientX >= rect.left &&
                    e.clientX <= rect.right &&
                    e.clientY >= rect.top &&
                    e.clientY <= rect.bottom;

                if (isOverPlayer) {
                    this.showUI();
                } else {
                    // Hide immediately when cursor leaves
                    this.hideUI();
                }
            }
        });

        // Also hide when mouse leaves the document
        document.addEventListener('mouseleave', () => {
            if (this.isActive) {
                this.hideUI();
            }
        });
    }

    /**
     * Show the DVR UI
     */
    showUI() {
        if (this.isActive) {
            this.ui.show();
        }
    }

    /**
     * Hide the DVR UI
     */
    hideUI() {
        this.ui.hide();
    }

    /**
     * Get elapsed time since stream start
     */
    getElapsedTime() {
        if (!this.streamStartTime) return 0;
        return Math.floor((Date.now() - this.streamStartTime) / 1000);
    }

    /**
     * Get the actual buffer information from the video element
     */
    getBufferInfo() {
        if (!this.playerElement) {
            return { start: 0, end: 0, duration: 0, currentTime: 0, behindLive: 0, positionPercent: 100 };
        }

        const video = this.playerElement;
        let bufferStart = 0;
        let bufferEnd = 0;

        if (video.buffered.length > 0) {
            bufferStart = video.buffered.start(0);
            bufferEnd = video.buffered.end(video.buffered.length - 1);
        }

        const currentTime = video.currentTime;
        const bufferDuration = bufferEnd - bufferStart;
        const behindLive = Math.max(0, bufferEnd - currentTime);

        return {
            start: bufferStart,
            end: bufferEnd,
            duration: bufferDuration,
            currentTime: currentTime,
            behindLive: behindLive,
            positionPercent: bufferDuration > 0 ? ((currentTime - bufferStart) / bufferDuration) * 100 : 100
        };
    }

    /**
     * Start the UI update loop
     */
    startUpdateLoop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }

        this.updateInterval = setInterval(() => {
            this.updateUI();
        }, 250);

        this.updateUI();
    }

    /**
     * Update the UI with current state
     */
    updateUI() {
        if (!this.isActive || !this.playerElement) return;

        const bufferInfo = this.getBufferInfo();
        const elapsed = this.getElapsedTime();

        // Determine if we're at live (within 2 seconds)
        const isAtLive = bufferInfo.behindLive < 2 && !this.isWatchingVod;

        // Build info string
        let bufferText = this.formatTime(bufferInfo.duration);
        if (this.currentVodId) {
            bufferText = `DVR: ${this.formatTime(elapsed)}`;
        }

        this.ui.updateProgress({
            position: isAtLive ? 100 : Math.max(0, 100 - (bufferInfo.behindLive / elapsed * 100)),
            bufferPosition: 100,
            currentTime: this.formatTime(elapsed),
            duration: this.formatTime(elapsed),
            isAtLive: isAtLive,
            behindLive: this.formatTime(bufferInfo.behindLive),
            bufferDuration: bufferText,
            hasVod: !!this.currentVodId,
            isWatchingVod: this.isWatchingVod
        });
    }

    /**
     * Format seconds to MM:SS or HH:MM:SS
     */
    formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) seconds = 0;
        seconds = Math.floor(seconds);

        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hrs > 0) {
            return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Format seconds to Twitch VOD timestamp (XhYmZs)
     */
    formatVodTimestamp(seconds) {
        seconds = Math.floor(seconds);
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        let timestamp = '';
        if (hrs > 0) timestamp += `${hrs}h`;
        if (mins > 0 || hrs > 0) timestamp += `${mins}m`;
        timestamp += `${secs}s`;

        return timestamp;
    }

    /**
     * Handle stream started event
     */
    handleStreamStarted(data) {
        console.log(`[TNS-DVR] Stream started: ${data.channelName}`);
    }

    /**
     * Handle stream ended event
     */
    handleStreamEnded(data) {
        console.log(`[TNS-DVR] Stream ended: ${data.channelName}`);
        this.hideUI();
    }

    /**
     * Handle seek from UI
     */
    handleSeek(positionPercent) {
        const elapsed = this.getElapsedTime();
        const bufferInfo = this.getBufferInfo();

        // Calculate target time in seconds from stream start
        const targetSecondsFromStart = (elapsed * positionPercent / 100);
        const secondsBehindLive = elapsed - targetSecondsFromStart;

        console.log(`[TNS-DVR] Seek requested to: ${positionPercent.toFixed(1)}%`);
        console.log(`[TNS-DVR] Target: ${this.formatTime(targetSecondsFromStart)} (${this.formatTime(secondsBehindLive)} behind live)`);
        console.log(`[TNS-DVR] Buffer available: ${bufferInfo.duration.toFixed(1)}s`);

        // If seeking to near-live, just go live
        if (positionPercent >= 98 || secondsBehindLive < 5) {
            this.handleGoLive();
            return;
        }

        // Check if target is within buffer
        if (secondsBehindLive <= bufferInfo.duration) {
            // Seek within buffer
            const targetTime = bufferInfo.end - secondsBehindLive;
            console.log(`[TNS-DVR] Seeking within buffer to ${targetTime.toFixed(2)}s`);

            // If watching VOD, switch back to live first
            if (this.isWatchingVod) {
                this.switchToLive();
            }

            if (this.playerElement) {
                this.playerElement.currentTime = targetTime;
            }
        } else {
            // Need to use VOD overlay
            this.switchToVod(targetSecondsFromStart);
        }
    }

    /**
     * Handle go live button click
     */
    handleGoLive() {
        console.log('[TNS-DVR] Going to live');

        // If watching VOD overlay, switch back
        if (this.isWatchingVod) {
            this.switchToLive();
            return;
        }

        if (this.playerElement && this.playerElement.buffered.length > 0) {
            const livePosition = this.playerElement.buffered.end(this.playerElement.buffered.length - 1);
            this.playerElement.currentTime = livePosition;
            console.log(`[TNS-DVR] Seeked to live: ${livePosition.toFixed(2)}s`);
        }

        // Also try clicking the native live button
        const liveButton = document.querySelector('[data-a-target="player-seekbar-live-indicator"]');
        if (liveButton) {
            liveButton.click();
        }
    }

    /**
     * Handle preview tooltip position
     */
    handlePreview(positionPercent) {
        const elapsed = this.getElapsedTime();

        if (positionPercent >= 98) {
            return 'LIVE';
        }

        const targetSeconds = elapsed * positionPercent / 100;
        const behindLive = elapsed - targetSeconds;

        if (behindLive < 1) {
            return 'LIVE';
        }

        // Show (VOD) indicator if beyond buffer
        const bufferInfo = this.getBufferInfo();
        if (behindLive > bufferInfo.duration && this.currentVodId) {
            return `-${this.formatTime(behindLive)} (VOD)`;
        }

        return `-${this.formatTime(behindLive)}`;
    }

    /**
     * Show a temporary notification
     */
    showNotification(message) {
        const existing = document.querySelector('.tns-dvr-notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = 'tns-dvr-notification';
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, rgba(145, 71, 255, 0.95) 0%, rgba(102, 51, 153, 0.95) 100%);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-family: 'Inter', 'Roobert', sans-serif;
            font-size: 14px;
            font-weight: 600;
            z-index: 10000;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            animation: tns-slide-in 0.3s ease;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        if (!document.getElementById('tns-notification-styles')) {
            const style = document.createElement('style');
            style.id = 'tns-notification-styles';
            style.textContent = `
                @keyframes tns-slide-in {
                    from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
            `;
            document.head.appendChild(style);
        }

        setTimeout(() => {
            if (notification.parentElement) {
                notification.style.opacity = '0';
                notification.style.transition = 'opacity 0.3s ease';
                setTimeout(() => notification.remove(), 300);
            }
        }, 3000);
    }

    /**
     * Enable DVR feature
     */
    enable() {
        this.settings.enabled = true;
        this.checkCurrentPage();
    }

    /**
     * Disable DVR feature
     */
    disable() {
        this.settings.enabled = false;
        this.stopDVR();
    }

    /**
     * Get current state for debugging
     */
    getDebugInfo() {
        return {
            isActive: this.isActive,
            currentChannel: this.currentChannel,
            streamStartTime: this.streamStartTime,
            elapsedTime: this.formatTime(this.getElapsedTime()),
            currentVodId: this.currentVodId,
            hasVodAccess: !!this.currentVodId,
            isWatchingVod: this.isWatchingVod,
            vodOverlayExists: !!this.vodOverlay,
            vodEmbedLoaded: this.vodEmbedLoaded,
            trackerState: this.tracker?.getState(),
            bufferInfo: this.getBufferInfo(),
            settings: this.settings
        };
    }
}

// Export
if (typeof window !== 'undefined') {
    window.TNS_DVRController = DVRController;
}
