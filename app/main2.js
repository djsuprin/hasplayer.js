'use strict';
// don't disable metrics...
var DEBUG = true;

angular.module('DashSourcesService', ['ngResource']).
factory('Sources', function($resource){
    return $resource('app/sources.json', {}, {
        query: {method:'GET', isArray:false}
    });
});

angular.module('DashNotesService', ['ngResource']).
factory('Notes', function($resource){
    return $resource('app/notes.json', {}, {
        query: {method:'GET', isArray:false}
    });
});

angular.module('DashContributorsService', ['ngResource']).
factory('Contributors', function($resource){
    return $resource('app/contributors.json', {}, {
        query: {method:'GET', isArray:false}
    });
});

angular.module('DashPlayerLibrariesService', ['ngResource']).
factory('PlayerLibraries', function($resource){
    return $resource('app/player_libraries.json', {}, {
        query: {method:'GET', isArray:false}
    });
});

angular.module('DashShowcaseLibrariesService', ['ngResource']).
factory('ShowcaseLibraries', function($resource){
    return $resource('app/showcase_libraries.json', {}, {
        query: {method:'GET', isArray:false}
    });
});

var app = angular.module('DashPlayer', [
    'DashSourcesService',
    'DashNotesService',
    'DashContributorsService',
    'DashPlayerLibrariesService',
    'DashShowcaseLibrariesService',
    'angularTreeview'
    ]);

app.directive('chart', function() {
    return {
        restrict: 'E',
        link: function (scope, elem, attrs) {
            var chartBuffer = null,
            optionsBuffer = {series: {shadowSize: 0},yaxis: {min: 0},xaxis: {show: false}};
            

            // If the data changes somehow, update it in the chart
            scope.$watch('bufferData', function(v) {
                if (v === null || v === undefined) {
                    return;
                }

                if (!chartBuffer) {
                    chartBuffer = $.plot(elem, v , optionsBuffer);
                    elem.show();
                }
                else {
                    chartBuffer.setData(v);
                    chartBuffer.setupGrid();
                    chartBuffer.draw();
                }
            });

            scope.$watch('invalidateChartDisplay', function(v) {
                if (v && chartBuffer) {
                    var data = scope[attrs.ngModel];
                    chartBuffer.setData(data);
                    chartBuffer.setupGrid();
                    chartBuffer.draw();

                    scope.invalidateDisplay(false);
                }
            });
        }
    };
});

app.directive('chart2', function() {
    return {
        restrict: 'E',
        link: function (scope, elem, attrs) {
         var chartBandwidth =  null,
         optionsBandwidth = {series: {shadowSize: 0},yaxis: {ticks: [],color:"#FFF"},xaxis: {show: false},lines: {steps: true,},grid: {markings: [],borderWidth: 0}};


            // If the data changes somehow, update it in the chart
            scope.$watch('bandwidthData', function(v) {
                if (v === null || v === undefined) {
                    return;
                }
                if (!chartBandwidth && scope.optionsBandwidthGrid) {
                    // must do a mixin between optionsBandwidth and scope.optionsBandwidthGrid
                    optionsBandwidth = angular.extend(optionsBandwidth,  scope.optionsBandwidthGrid);
                    chartBandwidth = $.plot(elem, v , optionsBandwidth);
                    elem.show();
                } else if (chartBandwidth) {
                    chartBandwidth.setData(v);
                    chartBandwidth.setupGrid();
                    chartBandwidth.draw();
                }
            });

            scope.$watch('invalidateChartDisplay', function(v) {
                if (v && chartBandwidth) {
                    var data = scope[attrs.ngModel];
                    chartBandwidth.setData(data);
                    chartBandwidth.setupGrid();
                    chartBandwidth.draw();
                    scope.invalidateDisplay(false);
                }
            });
        }
    };
});

app.controller('DashController', function($scope, Sources, Notes, Contributors, PlayerLibraries, ShowcaseLibraries) {
    var player,
    video,
    context,
    videoSeries = [],
    dlSeries = [],
    playSeries = [],
    audioSeries = [],
    qualityChangements = [],
    previousPlayedQuality = 0,
    previousDownloadedQuality= 0,
    maxGraphPoints = 50,
    firstAccess = true,
    updateInterval = 333;

    ////////////////////////////////////////
    //
    // Metrics
    //
    ////////////////////////////////////////

    $scope.videoBitrate = 0;
    $scope.videoIndex = 0;
    $scope.videoPendingIndex = "";
    $scope.videoMaxIndex = 0;
    $scope.videoBufferLength = 0;
    $scope.videoDroppedFrames = 0;
    $scope.videoWidth = 0;
    $scope.videoHeight = 0;
    $scope.videoCodecs = "-";

    $scope.audioBitrate = 0;
    $scope.audioIndex = 0;
    $scope.audioPendingIndex = "";
    $scope.audioMaxIndex = 0;
    $scope.audioBufferLength = 0;
    $scope.audioDroppedFrames = 0;
    $scope.audioCodecs = "-";

    $scope.optionsBandwidthGrid = null;

    $('#sliderBitrate').labeledslider({
        max: 0,
        step: 1,
        values: [0],
        tickLabels: [],
        orientation: 'vertical',
        range: true,
        stop: function(evt, ui) {
            player.setQualityBoundariesFor("video", ui.values[0], ui.values[1]);
        }
    });
    $('#sliderAudio').labeledslider({
        max:0,
        step:1,
        orientation:'vertical',
        range:false,
        tickLabels: [],
    });

    // reinit charts
    // assign an empty array is not working... why ? reference in bufferData ?
    videoSeries.splice(0, videoSeries.length);
    audioSeries.splice(0, audioSeries.length);
    dlSeries.splice(0, dlSeries.length);
    playSeries.splice(0, playSeries.length);

    var converter = new MetricsTreeConverter();
    $scope.videoMetrics = null;
    $scope.audioMetrics = null;
    $scope.audioTracks  = [];

    $scope.getVideoTreeMetrics = function () {
        var metrics = player.getMetricsFor("video");
        var metricsExt = player.getMetricsExt();
        $scope.videoMetrics = converter.toTreeViewDataSource(metrics,metricsExt);
    };

    $scope.getAudioTreeMetrics = function () {
        var metrics = player.getMetricsFor("audio");
        var metricsExt = player.getMetricsExt();
        $scope.audioMetrics = converter.toTreeViewDataSource(metrics,metricsExt);
    };

    // from: https://gist.github.com/siongui/4969449
    $scope.safeApply = function(fn) {
        var phase = this.$root.$$phase;
        if(phase == '$apply' || phase == '$digest')
            this.$eval(fn);
        else
            this.$apply(fn);
    };

    $scope.selectAudioTrack = function(track){
        player.setAudioTrack(track);
    };


    function getCribbedMetricsFor(type) {
        var metrics = player.getMetricsFor(type),
            metricsExt = player.getMetricsExt(),
            repSwitch,
            bufferLevel,
            httpRequests,
            droppedFramesMetrics,
            bitrateIndexValue,
            bandwidthValue,
            pendingValue,
            numBitratesValue,
            bufferLengthValue = 0,
            point,
            movingLatency = {},
            movingDownload = {},
            movingRatio = {},
            droppedFramesValue = 0,
            fillmoving = function(type, Requests){
                var requestWindow,
                    downloadTimes,
                    latencyTimes,
                    durationTimes;

                requestWindow = Requests
                    .slice(-20)
                    .filter(function(req){return req.responsecode >= 200 && req.responsecode < 300 && !!req.mediaduration && req.type === "Media Segment" && req.stream === type;})
                    .slice(-4);
                if (requestWindow.length > 0) {

                    latencyTimes = requestWindow.map(function (req){ return Math.abs(req.tresponse.getTime() - req.trequest.getTime()) / 1000;});

                    movingLatency[type] = {
                        average: latencyTimes.reduce(function(l, r) {return l + r;}) / latencyTimes.length, 
                        high: latencyTimes.reduce(function(l, r) {return l < r ? r : l;}), 
                        low: latencyTimes.reduce(function(l, r) {return l < r ? l : r;}), 
                        count: latencyTimes.length
                    };

                    downloadTimes = requestWindow.map(function (req){ return Math.abs(req.tfinish.getTime() - req.tresponse.getTime()) / 1000;});

                    movingDownload[type] = {
                        average: downloadTimes.reduce(function(l, r) {return l + r;}) / downloadTimes.length, 
                        high: downloadTimes.reduce(function(l, r) {return l < r ? r : l;}), 
                        low: downloadTimes.reduce(function(l, r) {return l < r ? l : r;}), 
                        count: downloadTimes.length
                    };

                    durationTimes = requestWindow.map(function (req){ return req.mediaduration;});

                    movingRatio[type] = {
                        average: (durationTimes.reduce(function(l, r) {return l + r;}) / downloadTimes.length) / movingDownload[type].average, 
                        high: durationTimes.reduce(function(l, r) {return l < r ? r : l;}) / movingDownload[type].low, 
                        low: durationTimes.reduce(function(l, r) {return l < r ? l : r;}) / movingDownload[type].high, 
                        count: durationTimes.length
                    };
                }
            };

        if (metrics && metricsExt) {
            repSwitch = metricsExt.getCurrentRepresentationSwitch(metrics);
            bufferLevel = metricsExt.getCurrentBufferLevel(metrics);
            httpRequests = metricsExt.getHttpRequests(metrics);
            droppedFramesMetrics = metricsExt.getCurrentDroppedFrames(metrics);

            fillmoving("video", httpRequests);
            fillmoving("audio", httpRequests);

            if (repSwitch !== null) {
                bitrateIndexValue = metricsExt.getIndexForRepresentation(repSwitch.to);
                bandwidthValue = metricsExt.getBandwidthForRepresentation(repSwitch.to);
                bandwidthValue = bandwidthValue / 1000;
                bandwidthValue = Math.round(bandwidthValue);
            }

            numBitratesValue = metricsExt.getMaxIndexForBufferType(type);

            if (bufferLevel !== null) {
                bufferLengthValue = bufferLevel.level.toPrecision(5);
            }

            if (droppedFramesMetrics !== null) {
                droppedFramesValue = droppedFramesMetrics.droppedFrames;
            }

            if (isNaN(bandwidthValue) || bandwidthValue === undefined) {
                bandwidthValue = 0;
            }

            if (isNaN(bitrateIndexValue) || bitrateIndexValue === undefined) {
                bitrateIndexValue = 0;
            }

            if (isNaN(numBitratesValue) || numBitratesValue === undefined) {
                numBitratesValue = 0;
            }

            if (isNaN(bufferLengthValue) || bufferLengthValue === undefined) {
                bufferLengthValue = 0;
            }

            pendingValue = player.getQualityFor(type);
            return {
                bandwidthValue: bandwidthValue,
                bitrateIndexValue: bitrateIndexValue + 1,
                pendingIndex: (pendingValue !== bitrateIndexValue) ? "(-> " + (pendingValue + 1) + ")" : "",
                numBitratesValue: numBitratesValue,
                bufferLengthValue: bufferLengthValue,
                droppedFramesValue: droppedFramesValue,
                movingLatency: movingLatency,
                movingDownload: movingDownload,
                movingRatio: movingRatio
            }
        }
        else {
            return null;
        }
    }

    function metricChanged(e) {
        var metrics,
        point,
        treeData;

        if (e.data.stream == "video") {
            metrics = getCribbedMetricsFor("video");
            if (metrics) {
                $scope.videoBitrate = metrics.bandwidthValue;
                $scope.videoIndex = metrics.bitrateIndexValue;
                $scope.videoPendingIndex = metrics.pendingIndex;
                $scope.videoMaxIndex = metrics.numBitratesValue;
                $scope.videoBufferLength = metrics.bufferLengthValue;
                $scope.videoDroppedFrames = metrics.droppedFramesValue;
                if (metrics.movingLatency["video"]) {
                    $scope.videoLatencyCount = metrics.movingLatency["video"].count;
                    $scope.videoLatency = metrics.movingLatency["video"].low.toFixed(3) + " < " + metrics.movingLatency["video"].average.toFixed(3) + " < " + metrics.movingLatency["video"].high.toFixed(3);
                }
                if (metrics.movingDownload["video"]) {
                    $scope.videoDownloadCount = metrics.movingDownload["video"].count;
                    $scope.videoDownload = metrics.movingDownload["video"].low.toFixed(3) + " < " + metrics.movingDownload["video"].average.toFixed(3) + " < " + metrics.movingDownload["video"].high.toFixed(3);
                }
                if (metrics.movingRatio["video"]) {
                    $scope.videoRatioCount = metrics.movingRatio["video"].count;
                    $scope.videoRatio = metrics.movingRatio["video"].low.toFixed(3) + " < " + metrics.movingRatio["video"].average.toFixed(3) + " < " + metrics.movingRatio["video"].high.toFixed(3);
                }

                point = [parseFloat(video.currentTime), Math.round(parseFloat(metrics.bufferLengthValue))];
                videoSeries.push(point);

                if (videoSeries.length > maxGraphPoints) {
                    videoSeries.splice(0, 1);
                }
            }
        }

        if (e.data.stream == "audio") {
            metrics = getCribbedMetricsFor("audio");
            if (metrics) {

                if(firstAccess){
                    $scope.audioTracks = player.getAudioTracks();
                    $scope.audioData = $scope.audioTracks[0];
                    firstAccess = false;
                }

                $scope.audioBitrate = metrics.bandwidthValue;
                $scope.audioIndex = metrics.bitrateIndexValue;
                $scope.audioPendingIndex = metrics.pendingIndex;
                $scope.audioMaxIndex = metrics.numBitratesValue;
                $scope.audioBufferLength = metrics.bufferLengthValue;
                $scope.audioDroppedFrames = metrics.droppedFramesValue;
                if (metrics.movingLatency["audio"]) {
                    $scope.audioLatencyCount = metrics.movingLatency["audio"].count;
                    $scope.audioLatency = metrics.movingLatency["audio"].low.toFixed(3) + " < " + metrics.movingLatency["audio"].average.toFixed(3) + " < " + metrics.movingLatency["audio"].high.toFixed(3);
                }
                if (metrics.movingDownload["audio"]) {
                    $scope.audioDownloadCount = metrics.movingDownload["audio"].count;
                    $scope.audioDownload = metrics.movingDownload["audio"].low.toFixed(3) + " < " + metrics.movingDownload["audio"].average.toFixed(3) + " < " + metrics.movingDownload["audio"].high.toFixed(3);
                }
                if (metrics.movingRatio["audio"]) {
                    $scope.audioRatioCount = metrics.movingRatio["audio"].count;
                    $scope.audioRatio = metrics.movingRatio["audio"].low.toFixed(3) + " < " + metrics.movingRatio["audio"].average.toFixed(3) + " < " + metrics.movingRatio["audio"].high.toFixed(3);
                }

                point = [parseFloat(video.currentTime), Math.round(parseFloat(metrics.bufferLengthValue))];
                audioSeries.push(point);

                if (audioSeries.length > maxGraphPoints) {
                    audioSeries.splice(0, 1);
                }
            }
        }

        $scope.invalidateDisplay(true);
        $scope.safeApply();
    }

    ////////////////////////////////////////
    //
    // Error Handling
    //
    ////////////////////////////////////////

    function onError(e) {
        console.error(e);
    }

    ////////////////////////////////////////
    //
    // Debugging
    //
    ////////////////////////////////////////

    $scope.invalidateChartDisplay = false;

    $scope.invalidateDisplay = function (value) {
        $scope.invalidateChartDisplay = value;
    };

    $scope.bandwidthData = [{
        data: dlSeries,
        label: "download",
        color: "#2980B9"
    }, {
        data: playSeries,
        label: "playing",
        color: "#E74C3C"
    }];

    $scope.bufferData = [
    {
        data:videoSeries,
        label: "Taille du buffer Vidéo",
        color: "#2980B9"
    },
    {
        data: audioSeries,
        label: "Taille du buffer Audio",
        color: "#E74C3C"
    }
    ];

    $scope.showCharts = false;
    $scope.setCharts = function (show) {
        $scope.showCharts = show;
    };

    $scope.switchCharts = false;
    $scope.setSwitchCharts = function (firstOrSecond) {
        $scope.setCharts(true);
        $scope.switchCharts = firstOrSecond;
    };

    $scope.showDebug = false;
    $scope.setDebug = function (show) {
        $scope.showDebug = show;
    };

    ////////////////////////////////////////
    //
    // Player Setup
    //
    ////////////////////////////////////////

    video = document.querySelector(".dash-video-player video");
    context = new Custom.di.CustomContext();
    player = new MediaPlayer(context);
    
    $scope.version = player.getVersion();

    player.startup();
    player.addEventListener("error", onError.bind(this));
    player.addEventListener("metricChanged", metricChanged.bind(this));

    player.attachView(video);
    player.setAutoPlay(true);

    ////////////////////////////////////////
    //
    // Player Methods
    //
    ////////////////////////////////////////

    $scope.abrEnabled = true;

    $scope.setAbrEnabled = function (enabled) {
        $scope.abrEnabled = enabled;
        player.setAutoSwitchQuality(enabled);
    };

    $scope.abrUp = function (type) {
        var newQuality,
        metricsExt = player.getMetricsExt(),
        max = metricsExt.getMaxIndexForBufferType(type);

        newQuality = player.getQualityFor(type) + 1;
        // zero based
        if (newQuality >= max) {
            newQuality = max - 1;
        }
        player.setQualityFor(type, newQuality);
    };

    $scope.abrDown = function (type) {
        var newQuality = player.getQualityFor(type) - 1;
        if (newQuality < 0) {
            newQuality = 0;
        }
        player.setQualityFor(type, newQuality);
    };

    ////////////////////////////////////////
    //
    // Page Setup
    //
    ////////////////////////////////////////

    function getUrlVars() {
        var vars = {};
        var parts = window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m,key,value) {
            vars[key] = value;
        });
        return vars;
    }

    // Get url params...
    var vars = getUrlVars(),
    browserVersion,
    filterValue;

    if (vars && vars.hasOwnProperty("version")) {
        browserVersion = vars.version;
    }
    else {
        browserVersion = "stable";
    }

    switch(browserVersion) {
        case "beta":
        filterValue = "b";
        break;
        case "canary":
        filterValue = "c";
        break;
        case "dev":
        filterValue = "d";
        break;
        case "explorer":
        filterValue = "i";
        break;
        case "all":
        filterValue = "a";
        break;
        case "stable":
        default:
        filterValue = "s";
        break;
    }

    $scope.isStreamAvailable = function (str) {
        if (filterValue === "a") {
            return true;
        }
        else {
            return (str.indexOf(filterValue) != -1);
        }
    };

    Sources.query(function (data) {
        $scope.availableStreams = data.items;
    });

    Notes.query(function (data) {
        $scope.releaseNotes = data.notes;
    });

    Contributors.query(function (data) {
        $scope.contributors = data.items;
    });

    PlayerLibraries.query(function (data) {
        $scope.playerLibraries = data.items;
    });

    ShowcaseLibraries.query(function (data) {
        $scope.showcaseLibraries = data.items;
    });

    $scope.setStream = function (item) {
        $scope.selectedItem = item;
    };

    $scope.doLoad = function () {
        firstAccess = true;
        // ORANGE: add licenser backUrl parameter and customData
        player.attachSource($scope.selectedItem.url, $scope.selectedItem.backUrl, $scope.selectedItem.customData);
        
        
    };

    $scope.hasLogo = function (item) {
        return (item.hasOwnProperty("logo") && item.logo !== null && item.logo !== undefined && item.logo !== "");
    };

    // Get initial stream if it was passed in.
    var paramUrl = null;

    if (vars && vars.hasOwnProperty("url")) {
        paramUrl = vars.url;
    }

    if (vars && vars.hasOwnProperty("mpd")) {
        paramUrl = vars.mpd;
    }

    if (paramUrl !== null) {
        var startPlayback = true;

        $scope.selectedItem = {};
        $scope.selectedItem.url = paramUrl;

        if (vars.hasOwnProperty("autoplay")) {
            startPlayback = (vars.autoplay === 'true');
        }

        if (startPlayback) {
            $scope.doLoad();
        }
    }
});
