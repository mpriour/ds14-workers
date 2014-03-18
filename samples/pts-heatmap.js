var map, indexer, ptsLayer, maxPtsPxl, maxPoints, pxStep, buffer, wtFormula, ramp;
require(["esri/map", "esri/layers/FeatureLayer", "esri/process/Index", "esri/layers/GraphicsLayer", "esri/symbols/SimpleMarkerSymbol",
        "esri/renderers/SimpleRenderer", "esri/symbols/PictureMarkerSymbol", "esri/graphic", "esri/geometry/Point",
        "dojo/_base/lang", "dojo/_base/array", "dojo/on", "dojo/Deferred", "dojo/_base/Color", "dojo/promise/all", "dojo/dom-construct"
    ],
function(Map, FeatureLayer, Index, GraphicsLayer, SimpleMarkerSymbol, SimpleRenderer, PictureMarkerSymbol, Graphic, Point,
         lang, array, on, Deferred, Color, all, domConstruct) {
    map = new Map("map", {
        basemap: "gray",
        center: [-85, 36],
        zoom: 6
    });
    indexer = new Index({
        //drawFeatures: false,
        passFeatures: false
    });

    pxStep = 5;//25;
    buffer = 10;
    wtFormula = 'shepard';
    maxPtsPxl = 0.05;

    ptsLayer = new FeatureLayer( //"http://maps4.arcgisonline.com/ArcGIS/rest/services/A-16/NOAA_Significant_Hail_Storms_and_Swaths/MapServer/3", {
        //"http://arcgis-commse-1029264944.us-east-1.elb.amazonaws.com/arcgis/rest/services/Hazards/GlobalIncidents/MapServer/0",{
        //"http://tm2-elb-1378978824.us-east-1.elb.amazonaws.com/arcgis/rest/services/LiveFeeds/StreamGauge/MapServer/0", {
        "http://tmservices1.esri.com/arcgis/rest/services/LiveFeeds/StreamGauge/MapServer/0", {
            mode: FeatureLayer.MODE_ONDEMAND,
            outFields: ["*"],
            autoGeneralize: false,
            processors: [indexer]
        });

    var latice,
        canvas,
        pmCache = {},
        workerClient = indexer.workerClient;
    var heatTiles = new GraphicsLayer({
        id: 'heatmap',
        visible: false
    });
    rampColors = {
        'Reds': [[254, 229, 217, 255], [252, 174, 145, 255], [251, 106, 74, 255], [222, 45, 38, 255], [165, 15, 21, 255]],
        'Spectral': [[215, 25, 28, 255], [253, 174, 97, 255], [255, 255, 191, 255], [171, 221, 164, 255], [43, 131, 186, 255]],
        'RdYlBu': [[215, 25, 28, 255], [253, 174, 97, 255], [255, 255, 191, 255], [171, 217, 233, 255], [44, 123, 182, 255]]
    };
    ramp = rampColors.Spectral;
    ptsLayer.on('load', function() {
        ptsLayer.minScale = Infinity;
        ptsLayer.setRenderer(new SimpleRenderer(new SimpleMarkerSymbol().setSize(6).setOutline(null).setColor(new Color("black"))));
        workerClient.importScripts('local/heatmapWorker');
        on.once(ptsLayer, 'update-start', function() {
            latice = ptsLayer._mode._gridLayer;
        });
    });

    /*map.on('zoom-end', function(evt){
        var multiple = (evt.zoomFactor>0) ? 1.61 * evt.zoomFactor/2 : 0.5/(1.61 * evt.zoomFactor);
        maxPtsPxl*=multiple;
    });*/

    ptsLayer.on('update-end', function(evt) {
        var mapExt = map.extent;
        var mapScale = map.getScale();
        var ptCount = ptsLayer.graphics.length;
        var cells = latice.getCellsInExtent(mapExt).cells;
        var imgSz = [latice.cellWidth, latice.cellHeight];
        var pfs;
        var colorRamp = generateColorPallete(ramp);
        heatTiles.visible || heatTiles.setVisibility(true);
        heatTiles.clear();
        while (cells.length) {
            var cell = cells.splice(Math.floor(cells.length / 2), 1)[0];
            //pfs = getCachedPFS(mapScale, cell);
            if (!pfs) {
                workerClient.postMessage({
                    action: 'calculateWeights',
                    extent: cell.extent,
                    imgSize: imgSz,
                    pxSteps: pxStep,
                    buffer: buffer,
                    weightFormula: wtFormula
                }).then((function(cell) {
                    return function(msg) {
                        var densities = msg.densities;
                        if (!densities) {
                            return;
                        }
                        var imgUrl = generateImageUrl(densities, colorRamp, imgSz[0], imgSz[1]);
                        pfs = new PictureMarkerSymbol(imgUrl, imgSz[0], imgSz[1]);
                        //console.log(pfs.toJson());
                        //pfs.setOffset(14,0);
                        //setCachedPFS(pfs, mapScale, cell);
                        var gr = new Graphic(cell.extent.getCenter(), pfs);
                        var corners = [[cell.extent.xmax,cell.extent.ymax],[cell.extent.xmax,cell.extent.ymin],[cell.extent.xmin,cell.extent.ymin],[cell.extent.xmin,cell.extent.ymax]];
                        while(!(map.extent.contains(gr.geometry)) && corners.length){
                            gr.setGeometry(new Point(corners.shift(),map.spatialReference));
                            var xoff = (corners.length>1) ? -imgSz[0]/2 : imgSz[0]/2;
                            var yoff = (corners.length%3) ? imgSz[1]/2 : -imgSz[1]/2;
                            pfs.setOffset(xoff,yoff);
                        }
                        heatTiles.add(gr);
                        if(!gr.visible){
                            heatTiles._draw(gr, true);
                        }
                    };
                })(cell));
            } else {
                heatTiles.add(new Graphic(cell.extent/*.getCenter()*/, pfs));
            }
        }
    });

    map.addLayers([ptsLayer, heatTiles]);

    function getCanvas(width, height, force) {
        if (!canvas || force) {
            canvas = domConstruct.create("canvas", {
                id: (!force) ? "canvas" : "canvas-" + (+new Date()).toString(36),
                width: width + "px",
                height: height + "px",
                style: "position: absolute; left: -10000px; top: 0px;"
            }, null);
            document.body.appendChild(canvas);
        } else {
            canvas.height = height;
            canvas.width = width;
        }
        return canvas;
    }

    function generateImageUrl(weights, pallete, width, height) {
        canvas = getCanvas(width, height);
        writeHeatmap(canvas, weights, pallete);
        return canvas.toDataURL();
    }

    function generateColorPallete(colors) {
        canvas = getCanvas(1, 256);
        var ctx = canvas.getContext('2d');
        var grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
        //add a transparent white at end
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        for (var c = colors.length-1, len = colors.length, p = 0; c > -1; c--) {
            p = (len - c) / len;
            grad.addColorStop(p, 'rgba(' + colors[c].join(',') + ')');
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1, canvas.height);
        var imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        return new Uint32Array(imgData.data.buffer);
    }

    function writeHeatmap(canvas, densities, pallete) {
        var ctx = canvas.getContext('2d');
        var imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var imgUint32 = new Uint32Array(imgData.data.buffer);
        var res = map.getResolution();
        var maxDensity = maxPtsPxl;// / (res*res);
        var ratio, val, ndx;
        for (var i = 0, len = densities.length, plen = pallete.length-1; i < len; i++) {
            ratio = Math.min(densities[i],maxDensity) / maxDensity;
            ndx = Math.round(ratio*plen);
            val = pallete[ndx];
            imgUint32[i] = val;
        }
        ctx.putImageData(imgData, 0, 0);
        return ctx;
    }

    function getCachedPFS(scale, cell) {
        return (pmCache[scale]) ? pmCache[scale][cell.r + ':' + cell.c] : false;
    }

    function setCachedPFS(pfs, scale, cell) {
        if (!pmCache[scale]) {
            pmCache[scale] = {};
        }
        pmCache[scale][cell.r + ':' + cell.c] = pfs;
    }
});