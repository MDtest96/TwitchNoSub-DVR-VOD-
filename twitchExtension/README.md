# TwitchNoSub + DVR

Be able to watch any sub-only VOD on Twitch **AND rewind live streams** with DVR functionality (like YouTube), integrated in the website and supports every Twitch feature.

Support chromium based browser (Chrome, Edge, Brave, Opera, ...) and Firefox.

## ✨ Features

### 🎬 Sub-only VOD Access
Watch any subscriber-only VOD without needing a subscription. The extension bypasses the restriction seamlessly.

### ⏪ Live Stream DVR (NEW!)
**Rewind live streams just like on YouTube!**

- **Progress bar overlay** - Beautiful glassmorphism UI when you hover over the player
- **Full timeline** - See how long the stream has been live
- **Seek within buffer** - Click to rewind up to ~90 seconds (limited by Twitch's buffer)
- **Auto-switch to VOD** - Seek beyond buffer? Automatically switches to the VOD at the right timestamp!
- **Go Live button** - Green when live, red when behind. Click to jump back to live
- **Time behind indicator** - Shows how far behind live you are (e.g., "-5:32")
- **"⏪ Full DVR" badge** - Shows when VOD is available for unlimited rewind
- **"⚡ Buffer only" badge** - Shows when limited to local buffer (~90s)

### ↩️ Return to Live Button
When watching a VOD from a currently live stream:
- A floating "**Retour au Live**" button appears
- Click to seamlessly return to the live stream
- Uses SPA navigation (no page reload!)

## Download & installation

##### Chromium based browser
Download the latest release in the [releases section](https://github.com/besuper/TwitchNoSub/releases) or clone the repo.

You have to install the extension manually:

- Go in manage extension (**chrome://extensions/** in chrome)
- Make sure **Developer mode** is enabled
- Hit **Load unpacked extension** and select the unzipped folder of the extension.

If you use Chromium (not Chrome), you can pack the extension to get a .crx file you can drag & drop inside extensions page (which removes the need to have a dedicated directory for the extension on your hard drive)

- Unzip the extension
- In the parent directory of the extension, run the following command : `chromium --pack-extension=TwitchNoSub`
- Drop the created crx file in the extensions page of your browser (make sure **Developer mode** is enabled, however it will not work)

##### Firefox
Download the latest .**xpi** file in the [releases section](https://github.com/besuper/TwitchNoSub/releases).

- Drag and drop the xpi file on Firefox
- Click on "Add" in the little confirmation popup

## 🔧 DVR Technical Details

### How it works
1. **Live stream detection** - Detects when you're watching a live stream via Twitch GQL API
2. **VOD detection** - Checks if the streamer has VOD recording enabled
3. **Buffer-based seeking** - For short seeks (~90s), uses the browser's video buffer
4. **VOD-based seeking** - For longer seeks, automatically switches to the ongoing VOD
5. **SPA navigation** - Seamless transitions without page reloads

### Buffer vs VOD
| Seek type | Buffer (< 90s) | VOD (> 90s) |
|-----------|---------------|-------------|
| Speed | Instant | 1-2 seconds |
| Availability | Always | Requires VOD enabled |
| Range | ~60-90 seconds | Full stream |

## 🐛 Debug Console

For debugging, you can access the DVR controller in the browser console:
```javascript
// Get DVR debug info
window.TNS_DVR.getDebugInfo()

// Check tracker state
window.TNS_DVR.tracker.getState()

// Force show DVR UI
window.TNS_DVR.ui.show()
```

## 🚧 Known Limitations

- **VOD availability**: Some streamers don't have VOD recording enabled
- **Sub-only VODs**: The extension handles these automatically
- **Buffer size**: Twitch only keeps ~60-90 seconds of local buffer
- **React Router warning**: Harmless warning in console during navigation

## Warning

This extension is still in work in progress, if there is any issue please report it.

## License

This project is licensed under the GPL-3.0 License.
