var orangeHasPlayer = null,
    metricsAgent = null,
    adsPlayer = null,
    adsMode = false,
    config = null,
    video = null,
    currentStreamInfos = null,
    confMetricsAgent = {
        'name': 'Prisme (local)',
        'activationUrl': '',
        'serverUrl': 'http://localhost:8080/metrics',
        'enable': true,
        'eventsObjectFilter': 'session;realtime',
        'eventTypeSessionFilter': 'error;profil,10,10;usage',
        'eventTypeRealTimeFilter': 'error,10,40,99;profil',
        'dbServerUrl': 'http://localhost:8080/metricsDB',
        'collector': 'HasPlayerCollector',
        'formatter': 'Prisme',
        'sendingTime': 10000
    };

/********************************************************************************************************************
 *
 *
 *                  Init functions
 *
 *
 **********************************************************************************************************************/
function createHasPlayer(isSubtitleExternDisplay) {
    orangeHasPlayer = new MediaPlayer();
    video = document.getElementById('player');

    orangeHasPlayer.init(video);
    orangeHasPlayer.setDebug(true);
    orangeHasPlayer.enableSubtitleExternDisplay(isSubtitleExternDisplay);
    orangeHasPlayer.setInitialQualityFor('video', 0);
    orangeHasPlayer.setInitialQualityFor('audio', 0);

    /* hasPlayerConfig_dev */
    loadHasPlayerConfig('json/hasplayer_config.json');

    // Load plugins
    if (typeof AdsPlayer == 'function') {
        adsPlayer = new AdsPlayer(document.getElementById('adsplayer-container'));
        adsPlayer.addEventListener('start', onAdsPlayerToggle);
        adsPlayer.addEventListener('end', onAdsPlayerToggle);
        adsPlayer.addEventListener('play', onAdsPlayerPlayPause);
        adsPlayer.addEventListener('pause', onAdsPlayerPlayPause);
        adsPlayer.addEventListener('click', onAdsPlayerClick);
        orangeHasPlayer.addPlugin(adsPlayer);
    }

    orangeHasPlayer.setDefaultAudioLang('fra');
    orangeHasPlayer.setDefaultSubtitleLang('fre');
    orangeHasPlayer.enableSubtitles(false);
    registerHasPlayerEvents();
    registerVisibilityChange();
}

function registerHasPlayerEvents() {
    orangeHasPlayer.addEventListener('warning', onWarning);
    orangeHasPlayer.addEventListener('error', onError);
    orangeHasPlayer.addEventListener('cueEnter', onSubtitleEnter);
    orangeHasPlayer.addEventListener('cueExit', onSubtitleExit);
    orangeHasPlayer.addEventListener('loadeddata', onload);
    orangeHasPlayer.addEventListener('play_bitrate', onPlayBitrateChanged);
    orangeHasPlayer.addEventListener('download_bitrate', onDownloadBitrateChanged);
    orangeHasPlayer.addEventListener('bufferLevel_updated', onBufferLevelUpdated);
    orangeHasPlayer.addEventListener('volumechange', onVolumeChange);
    orangeHasPlayer.addEventListener('play', onPlay);
    orangeHasPlayer.addEventListener('pause', onPause);
    orangeHasPlayer.addEventListener('ended', onEnd);
    orangeHasPlayer.addEventListener('state_changed', onStateChanged);
    orangeHasPlayer.addEventListener('timeupdate', onTimeUpdate);
    orangeHasPlayer.addEventListener('manifestUrlUpdate', onManifestUrlUpdate);
}

function registerVisibilityChange() {

    // Set the name of the hidden property and the change event for visibility
    var hidden, visibilityChange; 
    if (typeof document.hidden !== "undefined") { // Opera 12.10 and Firefox 18 and later support 
        hidden = "hidden";
        visibilityChange = "visibilitychange";
    } else if (typeof document.mozHidden !== "undefined") {
        hidden = "mozHidden";
        visibilityChange = "mozvisibilitychange";
    } else if (typeof document.msHidden !== "undefined") {
        hidden = "msHidden";
        visibilityChange = "msvisibilitychange";
    } else if (typeof document.webkitHidden !== "undefined") {
        hidden = "webkitHidden";
        visibilityChange = "webkitvisibilitychange";
    }

    document.addEventListener(visibilityChange, onVisibilityChange, false);
}

function loadHasPlayerConfig(fileUrl) {
    var reqConfig = new XMLHttpRequest();

    reqConfig.onload = function() {
        if (reqConfig.status === 200) {
            config = JSON.parse(reqConfig.responseText);
            if (orangeHasPlayer && config) {
                orangeHasPlayer.setParams(config);
            }
        }
    };

    reqConfig.open('GET', fileUrl, true);
    reqConfig.setRequestHeader('Content-type', 'application/json');
    reqConfig.send();
}

/********************************************************************************************************************
 *
 *
 *                   OrangeHasPlayer Events
 *
 *
 **********************************************************************************************************************/
/**
 * [onload description]
 * @return {[type]} [description]
 */
function onload() {
    //handle onload events to get audio, subtitles tracks, etc...
    //init audio tracks
    //handleAudioData(orangeHasPlayer.getAudioTracks(), orangeHasPlayer.getSelectedAudioTrack());
    handleAudioData(orangeHasPlayer.getTracks('audio'), orangeHasPlayer.getSelectedTrack('audio'));
    //init subtitle tracks
    //handleSubtitleData(orangeHasPlayer.getSubtitleTracks(), orangeHasPlayer.getSelectedSubtitleTrack());
    handleSubtitleData(orangeHasPlayer.getTracks('text'), orangeHasPlayer.getSelectedTrack('text'));
    //init duration value for VOD content
    handleDuration(orangeHasPlayer.getDuration());
    //init bitrates graph
    handleBitrates(orangeHasPlayer.getVideoBitrates());
}

/**
 * [onSubtitlesStyleChanged description]
 * @param  {[type]} e [description]
 */
function onSubtitleEnter(e) {
    handleSubtitleEnter(e.data);
}

function onSubtitleExit(e) {
    handleSubtitleExit(e.data);
}

/**
 * [onWarning description]
 * @param  {[type]} e [description]
 */
function onWarning(e) {
    handleWarning(e.data);
}

/**
 * [onError description]
 * @param  {[type]} e [description]
 */
function onError(e) {
    orangeHasPlayer.reset(2);
    handleError(e.data);
}

/**
 * [onPlayBitrateChanged description]
 * @param  {[type]} e [description]
 */
function onPlayBitrateChanged(e) {
    if (e.detail.type === 'video') {
        handlePlayBitrate(e.detail.bitrate, e.detail.time);
    }
}

function onDownloadBitrateChanged(e) {
    if (e.detail.type === 'video') {
        handleDownloadedBitrate(e.detail.bitrate, e.detail.time);
    }
}

function onBufferLevelUpdated(e) {
    handleBufferLevelUpdated(e.detail.type, e.detail.level.toFixed(3));
}

function onVolumeChange() {
    handleVolumeChange(orangeHasPlayer.getVolume());
}

function onPlay() {
    handlePlayState(true);
}

function onPause() {
    handlePlayState(false);
}

function onEnd() {
    handleVideoEnd();
}

function onStateChanged(e) {
    if (e.detail.type === 'video') {
        if (e.detail.state === 'buffering') {
            handleBuffering(true);
        } else if (e.detail.state === 'playing') {
            handleBuffering(false);
        }
    }
}

function onTimeUpdate() {
    //update progress bar in GUI.
    handleTimeUpdate(video.currentTime);
}

function onManifestUrlUpdate() {
    if (currentStreamInfos) {
        orangeHasPlayer.refreshManifest(currentStreamInfos.url);
    }
}

/********************************************************************************************************************
 *
 *
 *                   OrangeHasPlayer function calls
 *
 *
 **********************************************************************************************************************/
function loadStream(streamInfos, optimizedZappingEnabled) {
    handleBuffering(true);
    if (!optimizedZappingEnabled) {
        orangeHasPlayer.setInitialQualityFor('video', 0);
        orangeHasPlayer.setInitialQualityFor('audio', 0);
    }
    currentStreamInfos = streamInfos;

    var startTime = settingsPanel.getStartTime();
    if (startTime.length > 0) {
        currentStreamInfos.startTime = startTime;
    }
    orangeHasPlayer.load(streamInfos);
}

function changeAudio(track) {
    orangeHasPlayer.selectTrack('audio', track);
    orangeHasPlayer.setDefaultAudioLang(track.lang);
}

function enableSubtitles(enable) {
    orangeHasPlayer.enableSubtitles(enable);
}

function changeSubtitle(track) {
    orangeHasPlayer.selectTrack('text', track);
    orangeHasPlayer.setDefaultSubtitleLang(track.lang);
}

function setPlayerMute() {
    orangeHasPlayer.setMute(!orangeHasPlayer.getMute());
}

function setPlayerVolume(value) {
    orangeHasPlayer.setVolume(value);
}

function changePlayerState() {
    if (video.paused) {
        orangeHasPlayer.play();
    } else {
        if (orangeHasPlayer.isLive()) {
            orangeHasPlayer.stop();
        } else {
            orangeHasPlayer.pause();
        }
    }
}

function setSeekValue(seekTime) {
    orangeHasPlayer.seek(seekTime);
}

/********************************************************************************************************************
 *
 *
 *                   AdsPlayer Events
 *
 *
 **********************************************************************************************************************/

function onAdsPlayerToggle(e) {
    console.log("adsplayer - " + e.type);
    adsMode = (e.type === 'start');
    document.getElementById('video-player-container').style.display = adsMode ? 'none' : 'block';
    document.getElementById('adsplayer-container').style.display = adsMode ? 'block' : 'none';
}

function onAdsPlayerPlayPause(e) {
    console.log("adsplayer - " + e.type);
    var play = (e.type === 'play');
    handleAdsPlayerPlayState(play);
}

function onAdsPlayerClick(e) {
    console.log("adsplayer - " + e.type);
    if (e.data.uri) {
        window.open(e.data.uri);
    }
}

function onVisibilityChange() {
    if (adsMode) {
        console.log("adsplayer - visibility change: " + document.hidden);
        if (document.hidden) {
            adsPlayer.pause();
        } else {
            adsPlayer.play();
        }
    }
}


