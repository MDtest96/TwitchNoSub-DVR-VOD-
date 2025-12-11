/**
 * TwitchNoSub DVR UI
 * Exact replica of Twitch's native VOD seekbar
 */

class DVRUI {
    constructor() {
        this.container = null;
        this.seekbar = null;
        this.progressSegment = null;
        this.bufferSegment = null;
        this.playhead = null;
        this.currentTimeEl = null;
        this.durationEl = null;
        this.seekPreview = null;

        this.isVisible = false;
        this.isDragging = false;
        this.currentPosition = 100;
        this.isAtLive = true;

        // Callbacks
        this.onSeek = null;
        this.onGoLive = null;
        this.onPreview = null;
        this.onReturnToLive = null;

        this.lastMouseMoveTime = 0;

        this.injectStyles();
        console.log('[TNS-DVR] UI module initialized');
    }

    /**
     * Inject CSS styles - exact Twitch VOD seekbar styling
     */
    injectStyles() {
        if (document.getElementById('tns-dvr-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'tns-dvr-styles';
        styles.textContent = `
            /* Main DVR controls container */
            .tns-dvr-controls {
                position: absolute;
                bottom: 50px;
                left: 0;
                right: 0;
                z-index: 100;
                opacity: 0;
                visibility: hidden;
                transition: opacity 0.2s ease, visibility 0.2s ease;
                pointer-events: none;
            }

            .tns-dvr-controls.visible {
                opacity: 1;
                visibility: visible;
                pointer-events: auto;
            }

            /* Time labels row - matches .vod-seekbar-time-labels */
            .tns-dvr-time-labels {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 0 10px;
                margin-bottom: 5px;
            }

            .tns-dvr-time-text {
                font-family: 'Roobert', 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif;
                font-size: 13px;
                font-weight: 400;
                color: #fff;
                text-shadow: 0 0 2px rgba(0,0,0,0.8);
            }

            /* Live indicator badge */
            .tns-dvr-live-badge {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 2px 6px;
                background: #eb0400;
                border-radius: 2px;
                font-size: 11px;
                font-weight: 700;
                text-transform: uppercase;
                cursor: pointer;
                transition: background 0.2s ease;
            }

            .tns-dvr-live-badge:hover {
                background: #ff3333;
            }

            .tns-dvr-live-badge.at-live {
                background: #00ad03;
            }

            .tns-dvr-live-dot {
                width: 6px;
                height: 6px;
                background: #fff;
                border-radius: 50%;
            }

            /* DVR status badge */
            .tns-dvr-status {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 2px 6px;
                background: rgba(145, 71, 255, 0.9);
                border-radius: 2px;
                font-size: 10px;
                font-weight: 700;
                text-transform: uppercase;
                margin-left: 8px;
            }

            .tns-dvr-status.watching-vod {
                background: rgba(235, 4, 0, 0.9);
            }

            /* Seekbar interaction area - matches .seekbar-interaction-area */
            .tns-dvr-seekbar-area {
                position: relative;
                height: 20px;
                padding: 0 10px;
                cursor: pointer;
                display: flex;
                align-items: center;
            }

            /* The actual seekbar - matches .seekbar-bar */
            .tns-dvr-seekbar {
                position: relative;
                width: 100%;
                height: 5px;
                background: rgba(255, 255, 255, 0.2);
                border-radius: 2px;
                transition: height 0.1s ease;
            }

            .tns-dvr-seekbar-area:hover .tns-dvr-seekbar {
                height: 10px;
            }

            /* Buffer segment - purple transparent */
            .tns-dvr-segment-buffer {
                position: absolute;
                top: 0;
                left: 0;
                height: 100%;
                background: rgba(169, 112, 255, 0.4);
                border-radius: 2px;
                transition: width 0.1s linear;
            }

            /* Progress segment - Twitch purple #a970ff = rgb(169, 112, 255) */
            .tns-dvr-segment-progress {
                position: absolute;
                top: 0;
                left: 0;
                height: 100%;
                background: rgb(169, 112, 255);
                border-radius: 2px;
                transition: width 0.1s linear;
            }

            /* Playhead/scrubber - matches the white indicator */
            .tns-dvr-playhead {
                position: absolute;
                top: 50%;
                transform: translate(-50%, -50%);
                width: 12px;
                height: 12px;
                background: rgba(255, 255, 255, 0.95);
                border-radius: 50%;
                box-shadow: 0 0 4px rgba(0,0,0,0.5);
                opacity: 0;
                transition: opacity 0.1s ease;
            }

            .tns-dvr-seekbar-area:hover .tns-dvr-playhead,
            .tns-dvr-controls.dragging .tns-dvr-playhead {
                opacity: 1;
            }

            /* Seek preview tooltip */
            .tns-dvr-preview {
                position: absolute;
                bottom: 100%;
                left: 0;
                transform: translateX(-50%);
                margin-bottom: 8px;
                padding: 4px 8px;
                background: rgba(0, 0, 0, 0.85);
                border-radius: 4px;
                font-family: 'Roobert', 'Inter', sans-serif;
                font-size: 12px;
                font-weight: 600;
                color: #fff;
                white-space: nowrap;
                pointer-events: none;
                opacity: 0;
                transition: opacity 0.1s ease;
                z-index: 10;
            }

            .tns-dvr-preview.visible {
                opacity: 1;
            }

            /* Return to Live button - integrated in Twitch controls */
            .tns-return-live-btn {
                display: inline-flex !important;
                align-items: center;
                gap: 4px;
                padding: 5px 10px;
                margin-right: 8px;
                background: linear-gradient(135deg, #eb0400 0%, #cc0000 100%);
                border: none;
                border-radius: 4px;
                color: white;
                font-family: 'Roobert', 'Inter', sans-serif;
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.15s ease;
                text-decoration: none;
            }

            .tns-return-live-btn:hover {
                background: linear-gradient(135deg, #ff3333 0%, #eb0400 100%);
                transform: scale(1.02);
            }
        `;

        document.head.appendChild(styles);
    }

    /**
     * Create the DVR UI - exact Twitch VOD seekbar structure
     */
    create() {
        if (this.container) return;

        this.container = document.createElement('div');
        this.container.className = 'tns-dvr-controls';
        this.container.innerHTML = `
            <div class="tns-dvr-time-labels">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="tns-dvr-time-text tns-dvr-current">0:00</span>
                    <span class="tns-dvr-status">DVR</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="tns-dvr-time-text tns-dvr-duration">0:00</span>
                    <span class="tns-dvr-live-badge at-live">
                        <span class="tns-dvr-live-dot"></span>
                        LIVE
                    </span>
                </div>
            </div>
            <div class="tns-dvr-seekbar-area">
                <div class="tns-dvr-seekbar">
                    <span class="tns-dvr-segment-buffer"></span>
                    <span class="tns-dvr-segment-progress"></span>
                    <span class="tns-dvr-playhead"></span>
                </div>
                <div class="tns-dvr-preview"></div>
            </div>
        `;

        // Get references
        this.seekbar = this.container.querySelector('.tns-dvr-seekbar');
        this.seekbarArea = this.container.querySelector('.tns-dvr-seekbar-area');
        this.progressSegment = this.container.querySelector('.tns-dvr-segment-progress');
        this.bufferSegment = this.container.querySelector('.tns-dvr-segment-buffer');
        this.playhead = this.container.querySelector('.tns-dvr-playhead');
        this.currentTimeEl = this.container.querySelector('.tns-dvr-current');
        this.durationEl = this.container.querySelector('.tns-dvr-duration');
        this.statusBadge = this.container.querySelector('.tns-dvr-status');
        this.liveBadge = this.container.querySelector('.tns-dvr-live-badge');
        this.seekPreview = this.container.querySelector('.tns-dvr-preview');

        // Setup event listeners
        this.setupEventListeners();

        console.log('[TNS-DVR] UI created');
    }

    /**
     * Setup mouse and touch event listeners
     */
    setupEventListeners() {
        // Seekbar events
        this.seekbarArea.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.seekbarArea.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.seekbarArea.addEventListener('mouseleave', this.handleMouseLeave.bind(this));

        document.addEventListener('mousemove', this.handleDocumentMouseMove.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));

        // Live badge click
        this.liveBadge.addEventListener('click', this.handleGoLive.bind(this));

        // Touch events
        this.seekbarArea.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        this.seekbarArea.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.seekbarArea.addEventListener('touchend', this.handleTouchEnd.bind(this));
    }

    /**
     * Create Return to Live button in Twitch controls
     */
    createReturnToLiveButton(channelLogin, channelName) {
        this.removeReturnToLiveButton();

        const controlBar = document.querySelector('.player-controls__right-control-group');
        if (!controlBar) {
            console.warn('[TNS-DVR] Could not find Twitch control bar');
            return null;
        }

        const button = document.createElement('a');
        button.id = 'tns-return-live-btn';
        button.className = 'tns-return-live-btn';
        button.href = `/${channelLogin}`;
        button.innerHTML = `<span class="tns-dvr-live-dot"></span> Retour au Live`;

        button.onclick = (e) => {
            e.preventDefault();
            if (this.onReturnToLive) {
                this.onReturnToLive(channelLogin);
            }
        };

        controlBar.insertBefore(button, controlBar.firstChild);
        console.log('[TNS-DVR] Return to Live button created');
        return button;
    }

    /**
     * Remove Return to Live button
     */
    removeReturnToLiveButton() {
        const existing = document.getElementById('tns-return-live-btn');
        if (existing) existing.remove();
    }

    /**
     * Attach UI to player
     */
    attach() {
        const playerContainer = document.querySelector('.video-player__container') ||
            document.querySelector('[data-a-target="video-player"]') ||
            document.querySelector('.video-player');

        if (playerContainer && !playerContainer.contains(this.container)) {
            playerContainer.style.position = 'relative';
            playerContainer.appendChild(this.container);
            playerContainer.classList.add('tns-dvr-attached'); // Mark container
            console.log('[TNS-DVR] UI attached to player');
            return true;
        }
        return false;
    }

    /**
     * Show UI
     */
    show() {
        if (!this.container) this.create();
        if (!this.container.parentElement) this.attach();
        this.container.classList.add('visible');
        this.isVisible = true;
    }

    /**
     * Hide UI
     */
    hide() {
        if (this.container) {
            this.container.classList.remove('visible');
        }
        this.isVisible = false;
    }

    /**
     * Update progress display
     */
    updateProgress(data) {
        if (!this.container) return;

        const {
            position = 100,
            bufferPosition = 100,
            currentTime = '0:00',
            duration = '0:00',
            isAtLive = true,
            behindLive = '0:00',
            bufferDuration = '0:00',
            hasVod = false,
            isWatchingVod = false
        } = data;

        this.currentPosition = position;
        this.isAtLive = isAtLive;

        // NEW: If watching VOD overlay, hide OUR custom bar so users use the VOD player's native bar
        if (isWatchingVod) {
            this.container.style.opacity = '0';
            this.container.style.pointerEvents = 'none';
        } else {
            this.container.style.opacity = '';
            this.container.style.pointerEvents = '';
        }

        // Update progress segment
        this.progressSegment.style.width = `${position}%`;

        // Update buffer segment (always 100% for now)
        this.bufferSegment.style.width = `${bufferPosition}%`;

        // Update playhead position
        this.playhead.style.left = `${position}%`;

        // Update time displays
        if (isWatchingVod) {
            this.currentTimeEl.textContent = '📺 VOD';
        } else if (isAtLive) {
            this.currentTimeEl.textContent = currentTime;
        } else {
            this.currentTimeEl.textContent = `-${behindLive}`;
        }

        this.durationEl.textContent = duration;

        // Update status badge
        if (isWatchingVod) {
            this.statusBadge.textContent = '⏪ VOD';
            this.statusBadge.classList.add('watching-vod');
        } else if (hasVod) {
            this.statusBadge.textContent = 'Full DVR';
            this.statusBadge.classList.remove('watching-vod');
        } else {
            this.statusBadge.textContent = 'Buffer';
            this.statusBadge.classList.remove('watching-vod');
        }

        // Update live badge
        if (isWatchingVod || !isAtLive) {
            this.liveBadge.classList.remove('at-live');
        } else {
            this.liveBadge.classList.add('at-live');
        }
    }

    /**
     * Get position from mouse event
     */
    getPositionFromEvent(event) {
        const rect = this.seekbar.getBoundingClientRect();
        const x = event.clientX - rect.left;
        return Math.max(0, Math.min(100, (x / rect.width) * 100));
    }

    /**
     * Handle mouse down
     */
    handleMouseDown(event) {
        event.preventDefault();
        this.isDragging = true;
        this.container.classList.add('dragging');

        const position = this.getPositionFromEvent(event);
        this.progressSegment.style.width = `${position}%`;
        this.playhead.style.left = `${position}%`;
    }

    /**
     * Handle mouse move on seekbar (for preview)
     */
    handleMouseMove(event) {
        const now = Date.now();
        if (now - this.lastMouseMoveTime < 50) return;
        this.lastMouseMoveTime = now;

        const position = this.getPositionFromEvent(event);

        // Show preview tooltip
        this.seekPreview.classList.add('visible');
        this.seekPreview.style.left = `${position}%`;

        if (this.onPreview) {
            const timeText = this.onPreview(position);
            this.seekPreview.textContent = timeText;
        }
    }

    /**
     * Handle mouse leave
     */
    handleMouseLeave() {
        if (!this.isDragging) {
            this.seekPreview.classList.remove('visible');
        }
    }

    /**
     * Handle document mouse move (for dragging)
     */
    handleDocumentMouseMove(event) {
        if (!this.isDragging) return;

        const position = this.getPositionFromEvent(event);
        this.progressSegment.style.width = `${position}%`;
        this.playhead.style.left = `${position}%`;

        this.seekPreview.classList.add('visible');
        this.seekPreview.style.left = `${position}%`;

        if (this.onPreview) {
            const timeText = this.onPreview(position);
            this.seekPreview.textContent = timeText;
        }
    }

    /**
     * Handle mouse up
     */
    handleMouseUp(event) {
        if (!this.isDragging) return;

        this.isDragging = false;
        this.container.classList.remove('dragging');
        this.seekPreview.classList.remove('visible');

        const position = this.getPositionFromEvent(event);

        if (this.onSeek) {
            this.onSeek(position);
        }
    }

    /**
     * Handle go live
     */
    handleGoLive() {
        if (this.onGoLive) {
            this.onGoLive();
        }
    }

    /**
     * Touch handlers
     */
    handleTouchStart(event) {
        event.preventDefault();
        const touch = event.touches[0];
        this.handleMouseDown({ clientX: touch.clientX, preventDefault: () => { } });
    }

    handleTouchMove(event) {
        event.preventDefault();
        const touch = event.touches[0];
        this.handleDocumentMouseMove({ clientX: touch.clientX });
    }

    handleTouchEnd(event) {
        const touch = event.changedTouches[0];
        this.handleMouseUp({ clientX: touch.clientX });
    }

    /**
     * Destroy UI
     */
    destroy() {
        if (this.container?.parentElement) {
            this.container.parentElement.classList.remove('tns-dvr-attached');
            this.container.parentElement.removeChild(this.container);
        }
        this.container = null;
        this.isVisible = false;
        this.removeReturnToLiveButton();
    }
}

// Export
if (typeof window !== 'undefined') {
    window.TNS_DVRUI = DVRUI;
}
