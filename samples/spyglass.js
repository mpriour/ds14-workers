var map;
require([
  "esri/map", "esri/layers/FeatureLayer", "esri/process/SpatialIndex",
  "esri/tasks/query", "esri/tasks/QueryTask", "esri/geometry/Circle",
  "esri/graphic", "esri/layers/GraphicsLayer", "esri/symbols/SimpleMarkerSymbol",
  "esri/symbols/SimpleLineSymbol", "esri/symbols/SimpleFillSymbol", "esri/renderers/SimpleRenderer",
  "esri/config", "esri/Color", "dojo/string", "dojo/dom", "dijit/DialogUnderlay", "dojo/domReady!"
], function(
  Map, FeatureLayer, SpatialIndex,
  Query, QueryTask, Circle,
  Graphic, GraphicsLayer, SimpleMarkerSymbol,
  SimpleLineSymbol, SimpleFillSymbol, SimpleRenderer,
  esriConfig, Color, string, dom, Underlay
) {

  //IE needs to use a proxy to get worker scripts.
  //Other browsers won't use this.
  esriConfig.defaults.io.proxyUrl = '/proxy.php';

  map = new Map("mapDiv", {
    basemap: "topo",
    center: [-97.5, 37.7],
    zoom: 11,
    slider: false,
    plugins: [{
      id: "esri/plugins/spatialIndex",
      options: { drawFeatures: false, passFeatures: false }
    }]
  });

  //get features in an effcient, tiled manner using on-demand mode, but draw mode -> false
  var ptsLayer = new FeatureLayer("http://services.arcgis.com/V6ZHFr6zdgNZuVG0/arcgis/rest/services/SedgCountyWaterWells/FeatureServer/0",{
    outFields: ["*"]
  });

  var highlightLayer = new GraphicsLayer();

  // selection symbol used to draw the selected census block points within the buffer polygon
  var symbol = new SimpleMarkerSymbol(
    SimpleMarkerSymbol.STYLE_CIRCLE, 
    4, 
    null,
    new Color([207, 34, 171, 0.5])
  );
  ptsLayer.setSelectionSymbol(symbol);
  highlightLayer.setRenderer( new SimpleRenderer(symbol) );

  ptsLayer.on('update-end', function() {
    //now that we have gotten all of the features, switch to snapshot mode, so we don't attempt to download or server query for more.
    ptsLayer._isSnapshot = true;
    ptsLayer.mode = FeatureLayer.MODE_SNAPSHOT;
    map.setLevel(12);
    
    Underlay.hide();
    dom.byId('step1').hidden=true;
    dom.byId('step2').hidden=false;
    console.log("got all features");
    console.log("total feature count: " + ptsLayer.graphics.length);
    //ptsLayer.setDrawMode(true);
    
    //enable map interaction
    //when the map is clicked create a buffer around the click point of the specified distance.
    var clickStart = map.on("click", function(evt) {
      clickStart.remove();
      map.on("mouse-move", function(evt) {
        circle = new Circle({
          center: evt.mapPoint,
          radius: 0.5,
          radiusUnit: "esriMiles"
        });
        map.graphics.clear();
        var graphic = new Graphic(circle, circleSymb);
        map.graphics.add(graphic);
        var buffQuery = new Query();
        buffQuery.geometry = circle.getExtent();
        buffQuery.outFields = ["*"];
        buffQuery.returnGeometry = true;
        ptsLayer.queryFeatures(buffQuery, selectInBuffer);
      });
    });
  });

  var circleSymb = new SimpleFillSymbol(
    SimpleFillSymbol.STYLE_NULL,
    new SimpleLineSymbol(
      SimpleLineSymbol.STYLE_SHORTDASHDOTDOT,
      new Color([105, 105, 105]),
      2
    ), new Color([255, 255, 0, 0.25])
  );
  var circle;

  map.on('load',function(){
    Underlay.show();
    map.addLayers([ptsLayer, highlightLayer]);
  });

  var infoString = "<h3>Within the 1/2 mile buffer</h3>"+
    "<b>Found <i>${total}</i> wells.</b><br>"+
    "<b>Average well depth</b> is <i>${average.WELL_DEPTH}</i><br>" +
    "<b>Total estimated yield</b> is <i>${sum.EST_YIELD}</i>";

  function selectInBuffer(response) {
    var feature;
    var features = response.features;
    var inBuffer = [];
    highlightLayer.clear();
    /*console.log("Found " + features.length + " total");*/
    //filter out features that are not actually in buffer, since we got all points in the buffer's bounding box
    for (var i = 0; i < features.length; i++) {
      feature = features[i];
      if (circle.contains(feature.geometry)) {
        inBuffer.push(feature);
        highlightLayer.add(new Graphic(feature));
      }
    }
    /*console.log(inBuffer.length + " features in buffer");*/
    var stats = calcStats(inBuffer);
    dom.byId("messages").innerHTML = string.substitute(infoString, stats);
    /*console.log("feature stats %o", stats);*/
  }

  function calcStats(features) {
    var depths = 0,
      yields = 0;
    for (var x = 0, len = features.length, attr; x < len; x++) {
      attr = features[x].attributes;
      depths += parseInt(attr["WELL_DEPTH"], 10) || 0;
      yields += parseInt(attr["EST_YIELD"], 10) || 0;
    }
    return {
      sum: {
        "WELL_DEPTH": depths,
        "EST_YIELD": yields
      },
      average: {
        "WELL_DEPTH": Math.round(depths / len) || 0,
        "EST_YIELD": Math.round(yields / len) || 0
      },
      total: len
    };
  }
});