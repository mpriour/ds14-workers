var map, tolerance;
require([
  "esri/map", "esri/layers/FeatureLayer", "esri/geometry/Point", "esri/tasks/query", "esri/geometry/Extent", 
  "esri/symbols/SimpleFillSymbol", "esri/Color", "esri/InfoTemplate",
  "dojo/parser", "dojo/domReady!"
], function(
  Map, FeatureLayer, Point, Query, Extent, SimpleFillSymbol, Color, InfoTemplate,
  parser
) {
  //parser.parse();
  map = new Map("mapDiv", {
    basemap: "national-geographic",
    center: [-96.541, 38.34],
    zoom: 6,
    plugins: ['esri/plugins/spatialIndex']
  });
  
  map.on('plugin-add',function(){
    console.log('added the indexing plugin');
    //When adding the spatialIndexing plugin to the map's constructor
    //and not a specific layer, it is a good idea to add layers
    //after the plugin has been added. Otherwise you can sometimes
    //get into a race condition that prevents the features from being
    //properly indexed until the map is panned or zoomed.
    map.addLayer(featureLayer);
  });

  map.on("zoom-end", function() {
    tolerance = getTolerance();
    bounds = new Extent(-tolerance, -tolerance, tolerance, tolerance, map.spatialReference);
  });

  var featureLayer = new FeatureLayer("http://sampleserver6.arcgisonline.com/arcgis/rest/services/Census/MapServer/2", {
    mode: FeatureLayer.MODE_ONDEMAND,
    infoTemplate: new InfoTemplate("${NAME}", "${NAME}, ${STATE_NAME}<br>Population (2007):  ${POP2007:NumberFormat}"),
    outFields: ["*"]
  });

  featureLayer.setSelectionSymbol(new SimpleFillSymbol().setColor(new Color([185, 65, 65, 0.55])));

  var query = new Query();
  var bounds;

  var h = featureLayer.on('update-start', function() {
    tolerance = getTolerance();
    bounds = new Extent(-tolerance, -tolerance, tolerance, tolerance, map.spatialReference);
    query.geometry = bounds;
    map.on('mouse-move', selectFeatures);
    h.remove();
  });

  function selectFeatures(evt) {
    var pt = evt.mapPoint;
    query.geometry = bounds.centerAt(pt);
    featureLayer.selectFeatures(query).then(function(features){
      map.infoWindow && map.infoWindow.hide();
    });
  }

  function getTolerance() {
    var pt1 = map.toMap(new Point(100, 100)),
      pt2 = map.toMap(new Point(100 + 15, 100 + 15)), //15 pixel tolerance radius
      dx = pt2.x - pt1.x,
      dy = pt2.y - pt1.y,
      tolerance = Math.sqrt(dx * dx + dy * dy);
    return tolerance / 2;
  }
});