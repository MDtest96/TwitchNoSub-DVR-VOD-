/**
 * TwitchNoSub DVR Tracker
 * Tracks live stream segments for DVR functionality (like YouTube)
 * 
 * This module intercepts HLS segments and maintains a timeline
 * of available content for rewinding during live streams.
 */

class DVRTracker {
    constructor() {
        // Configuration
        this.maxBufferDuration = 4 * 60 * 60 * 1000; // 4 hours max buffer in ms
        this.segmentDuration = 2000; // Typical Twitch segment duration in ms
        
        // State
        this.isLive = false;
        this.channelName = null;
        this.streamStartTime = null;
        this.segments = [];
        this.currentSegmentIndex = -1;
        this.isEnabled = true;
        
        // Timeline info
        this.earliestAvailableTime = null;
        this.latestAvailableTime = null;
        
        // Event listeners
        this.listeners = {
            'segmentAdded': [],
            'timelineUpdated': [],
            'streamStarted': [],
            'streamEnded': [],
            'seekAvailable': []
        };
        
        console.log('[TNS-DVR] DVR Tracker initialized');
    }

    /**
     * Register an event listener
     */
    on(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event].push(callback);
        }
    }

    /**
     * Emit an event to all listeners
     */
    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(callback => {
                try {
                    callback(data);
                } catch (e) {
                    console.error(`[TNS-DVR] Error in ${event} listener:`, e);
                }
            });
        }
    }

    /**
     * Start tracking a live stream
     */
    startTracking(channelName) {
        this.reset();
        this.isLive = true;
        this.channelName = channelName;
        this.streamStartTime = Date.now();
        this.earliestAvailableTime = this.streamStartTime;
        this.latestAvailableTime = this.streamStartTime;
        
        console.log(`[TNS-DVR] Started tracking stream for: ${channelName}`);
        this.emit('streamStarted', { channelName, startTime: this.streamStartTime });
    }

    /**
     * Stop tracking the current stream
     */
    stopTracking() {
        if (this.isLive) {
            console.log(`[TNS-DVR] Stopped tracking stream for: ${this.channelName}`);
            this.emit('streamEnded', { channelName: this.channelName });
        }
        this.isLive = false;
    }

    /**
     * Reset all tracking data
     */
    reset() {
        this.segments = [];
        this.currentSegmentIndex = -1;
        this.streamStartTime = null;
        this.earliestAvailableTime = null;
        this.latestAvailableTime = null;
        this.channelName = null;
        this.isLive = false;
    }

    /**
     * Add a new segment to the tracker
     * Called when a new HLS segment is detected
     */
    addSegment(segmentInfo) {
        if (!this.isLive || !this.isEnabled) return;

        const segment = {
            url: segmentInfo.url,
            timestamp: Date.now(),
            duration: segmentInfo.duration || this.segmentDuration,
            sequence: segmentInfo.sequence || this.segments.length,
            quality: segmentInfo.quality || 'source'
        };

        this.segments.push(segment);
        this.latestAvailableTime = segment.timestamp + segment.duration;
        
        // Clean up old segments beyond max buffer
        this.cleanupOldSegments();
        
        this.emit('segmentAdded', segment);
        this.emitTimelineUpdate();
    }

    /**
     * Process an HLS playlist and extract segment information
     */
    processPlaylist(playlistContent, baseUrl) {
        if (!this.isLive || !this.isEnabled) return;

        const lines = playlistContent.split('\n');
        let currentDuration = 0;
        let sequence = 0;

        // Find media sequence number
        const seqMatch = playlistContent.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/);
        if (seqMatch) {
            sequence = parseInt(seqMatch[1]);
        }

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Parse segment duration
            if (line.startsWith('#EXTINF:')) {
                const durationMatch = line.match(/#EXTINF:([\d.]+)/);
                if (durationMatch) {
                    currentDuration = parseFloat(durationMatch[1]) * 1000; // Convert to ms
                }
            }
            // Detect segment URL
            else if (line && !line.startsWith('#') && (line.endsWith('.ts') || line.includes('.ts?'))) {
                const segmentUrl = line.startsWith('http') ? line : new URL(line, baseUrl).href;
                
                // Check if we already have this segment
                const existingSegment = this.segments.find(s => s.url === segmentUrl);
                if (!existingSegment) {
                    this.addSegment({
                        url: segmentUrl,
                        duration: currentDuration || this.segmentDuration,
                        sequence: sequence
                    });
                }
                sequence++;
            }
        }
    }

    /**
     * Remove segments that are older than maxBufferDuration
     */
    cleanupOldSegments() {
        const now = Date.now();
        const cutoffTime = now - this.maxBufferDuration;

        const oldLength = this.segments.length;
        this.segments = this.segments.filter(seg => seg.timestamp > cutoffTime);

        if (this.segments.length > 0) {
            this.earliestAvailableTime = this.segments[0].timestamp;
        }

        if (oldLength !== this.segments.length) {
            console.log(`[TNS-DVR] Cleaned up ${oldLength - this.segments.length} old segments`);
        }
    }

    /**
     * Emit timeline update event with current state
     */
    emitTimelineUpdate() {
        this.emit('timelineUpdated', {
            isLive: this.isLive,
            streamStartTime: this.streamStartTime,
            earliestAvailable: this.earliestAvailableTime,
            latestAvailable: this.latestAvailableTime,
            bufferDuration: this.getBufferDuration(),
            segmentCount: this.segments.length,
            canSeekBack: this.canSeekBack()
        });
    }

    /**
     * Get the total duration of buffered content in milliseconds
     */
    getBufferDuration() {
        if (!this.earliestAvailableTime || !this.latestAvailableTime) return 0;
        return this.latestAvailableTime - this.earliestAvailableTime;
    }

    /**
     * Check if seeking backwards is possible
     */
    canSeekBack() {
        return this.segments.length > 1 && this.getBufferDuration() > 5000;
    }

    /**
     * Get the segment at a specific timestamp
     */
    getSegmentAtTime(timestamp) {
        for (let i = 0; i < this.segments.length; i++) {
            const seg = this.segments[i];
            if (timestamp >= seg.timestamp && timestamp < seg.timestamp + seg.duration) {
                return { segment: seg, index: i };
            }
        }
        return null;
    }

    /**
     * Get a range of segments for seeking
     */
    getSegmentsInRange(startTime, endTime) {
        return this.segments.filter(seg => {
            const segEnd = seg.timestamp + seg.duration;
            return segEnd > startTime && seg.timestamp < endTime;
        });
    }

    /**
     * Calculate the current position as a percentage of the buffer
     */
    getPositionPercentage(currentTimestamp) {
        const duration = this.getBufferDuration();
        if (duration === 0) return 100;
        
        const position = currentTimestamp - this.earliestAvailableTime;
        return Math.min(100, Math.max(0, (position / duration) * 100));
    }

    /**
     * Get timestamp from percentage position
     */
    getTimestampFromPercentage(percentage) {
        const duration = this.getBufferDuration();
        return this.earliestAvailableTime + (duration * percentage / 100);
    }

    /**
     * Format duration for display (HH:MM:SS)
     */
    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Get a summary of the current DVR state
     */
    getState() {
        return {
            isLive: this.isLive,
            isEnabled: this.isEnabled,
            channelName: this.channelName,
            streamStartTime: this.streamStartTime,
            earliestAvailable: this.earliestAvailableTime,
            latestAvailable: this.latestAvailableTime,
            bufferDuration: this.getBufferDuration(),
            bufferDurationFormatted: this.formatDuration(this.getBufferDuration()),
            segmentCount: this.segments.length,
            canSeekBack: this.canSeekBack()
        };
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.TNS_DVRTracker = DVRTracker;
}

// For worker context
if (typeof self !== 'undefined' && typeof window === 'undefined') {
    self.TNS_DVRTracker = DVRTracker;
}
