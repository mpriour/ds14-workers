var map, index;
require(["esri/config", "esri/map", "esri/layers/FeatureLayer", "esri/renderers/ClassBreaksRenderer",
         "esri/symbols/SimpleFillSymbol", "esri/symbols/SimpleLineSymbol","esri/renderers/SimpleRenderer", "esri/symbols/SimpleMarkerSymbol",
         "esri/dijit/Legend", "esri/renderers/ScaleDependentRenderer",
        "dojo/_base/lang", "dojo/_base/array", "dojo/on", "dojo/Deferred", "dojo/_base/Color", "dojo/promise/all"
    ],
function(esriConfig, Map, FeatureLayer, ClassBreaksRenderer, SimpleFillSymbol, SimpleLineSymbol, SimpleRenderer, SimpleMarkerSymbol,
         Legend, ScaleDependantRenderer, lang, array, on, Deferred, Color, all) {
    
    esriConfig.defaults.io.proxyUrl = "/proxy.php";
    
    map = new Map("map", {
        basemap: "gray",
        center: [-85, 36],
        zoom: 6
    });

    var ptsLayer = new FeatureLayer( "http://tmservices1.esri.com/arcgis/rest/services/LiveFeeds/StreamGauge/MapServer/0", {
            mode: FeatureLayer.MODE_ONDEMAND,
            outFields: ["*"],
            autoGeneralize: false,
            maxOffset: 0.0,
            plugins: [{
                id: 'esri/plugins/spatialIndex',
                options: {
                    drawFeatures: false
                }
            }]
        });

    
    ptsLayer.on('load',function(){
        ptsLayer.minScale = Infinity;
        ptsLayer.setRenderer(new SimpleRenderer(new SimpleMarkerSymbol().setSize(6).setOutline(null).setColor(new Color("black"))));
    });

    var border = new Color([12, 12, 12]);
    var defaultSym = new SimpleFillSymbol("none").setOutline(new SimpleLineSymbol("solid", border, 0.75));
    var stRenderer = new ClassBreaksRenderer(defaultSym, "pointCount");
    var ctRenderer = new ClassBreaksRenderer(defaultSym, "pointCount");
    var colors = [[239, 243, 255, 255], [189, 215, 231, 255], [107, 174, 214, 255], [49, 130, 189, 255], [8, 81, 156, 255]];
    var ctBreaks = [0, 1, 2, 5, 10, Infinity];
    var stBreaks = [0, 25, 100, 150, 250, Infinity];
    var legend;
    
    var state = new FeatureLayer("http://services.arcgis.com/P3ePLMYs2RVChkJx/ArcGIS/rest/services/USA_States_Generalized/FeatureServer/0", {
        mode: FeatureLayer.MODE_ONDEMAND,
        maxScale: 10e6
    });
    
    var county = new FeatureLayer("http://services.arcgis.com/P3ePLMYs2RVChkJx/ArcGIS/rest/services/USA_Counties_Generalized/FeatureServer/0", {
      mode: FeatureLayer.MODE_ONDEMAND,
      minScale: 10e6,
      maxScale: 1e6
    });
    

    state.on('load',function(){
        state.fields.push({
            name:'pointCount',
            type:'esriFieldTypeInteger'
        });
       state.setRenderer(setBreaks(stRenderer, stBreaks));
    });
    
    county.on('load',function(){
        county.fields.push({
            name:'pointCount',
            type:'esriFieldTypeInteger'
        });
       county.setRenderer(setBreaks(ctRenderer, ctBreaks));
    });

    var ptsDfd=new Deferred(),
        binDfd=new Deferred(),
        first = true;

    ptsLayer.on('process-start', (function() {
        var pDfds = [],
            i = 0;
        ptsLayer.on('process-end', function(evt) {
            pDfds[i++].resolve();
        });
        ptsLayer.on('update-end', function(evt) {
            all(pDfds).then(function() {
                ptsDfd.resolve();
                ptsDfd = new Deferred();
            });
        });
        return function(evt) {
            pDfds.push(new Deferred());
        };
    })());

    state.on('update-end', onBinLayerUpdate);
    county.on('update-end', onBinLayerUpdate);
    map.on('extent-change', function(evt) {
        all([ptsDfd, binDfd]).then(function() {
            var g;
            var res = map.getScale();
            var lyr = (res >= state.maxScale) ? state : (res >= county.maxScale) ? county : null;
            if (!lyr) {
                return;
            }
            var index = ptsLayer.spatialIndex || map.spatialIndex;
            var len = lyr.graphics.length;
            while (len--) {
                g = lyr.graphics[len];
                if (!g.attributes.pointCount) {
                    index.intersects(g.geometry.getExtent()).then(setBinCount(g));
                }
            }
        });
    });
    map.on('zoom-end', function(evt){
        var areaText = (map.getScale()>=state.maxScale) ? "State" : "County";
        document.getElementById('areaType').innerHTML = areaText;
    });
    map.on('layers-add-result', function(evt){
        legend = new Legend({
            map: map,
            layerInfos:[{
                layer: state,
                title: "Gauge Count",
                defaultSymbol: false
            },{
                layer: county,
                title: "Gauge Count",
                defaultSymbol: false
            }]
        }, document.getElementById('legend'));
    });
    
    map.addLayers([ptsLayer, county, state]);

    function onBinLayerUpdate(evt){
        if(first){
           first = false;
           legend.startup();
        }
        binDfd.resolve();
        binDfd = new Deferred();
    }

    function setBinCount(graphic) {
        return function(msg) {
            var count = msg.results && msg.results.length;
            graphic.attributes.pointCount = count;
            graphic.draw();
        };
    }
    
    function setBreaks(renderer, breaks) {
        for (var i = 0; i < breaks.length - 1; i++) {
            renderer.addBreak({
                minValue: breaks[i],
                maxValue: breaks[i + 1],
                label: (breaks[i + 1] == Infinity) ? ">" + breaks[i] : breaks[i] + " - " + breaks[i + 1],
                symbol: new SimpleFillSymbol(
                    "solid",
                    new SimpleLineSymbol("solid", border, 1),
                    new Color(colors[i])
                )
            });
        }
        return renderer;
    }
});