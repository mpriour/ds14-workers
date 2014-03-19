var map, process;
require([
  "esri/map", "esri/InfoTemplate", "esri/layers/FeatureLayer", "esri/symbols/SimpleFillSymbol", "esri/Color",
  "esri/tasks/query", "esri/geometry/Extent", "esri/geometry/Point", "esri/graphic", "dojo/_base/array",
  "dojo/domReady!"
], function(
  Map, InfoTemplate, FeatureLayer, SimpleFillSymbol, Color, Query, Extent, Point, Graphic, array
) {
  map = new Map("mapDiv", {
    basemap: "national-geographic",
    center: [-96.541, 38.34],
    zoom: 6
  });

  map.on("load", initLayers);

  function initLayers() {
    var lineLayer = new FeatureLayer("http://sampleserver6.arcgisonline.com/arcgis/rest/services/USA/MapServer/1", {
      mode: FeatureLayer.MODE_ONDEMAND,
      outFields: ["route"],
      infoTemplate: new InfoTemplate("highway", "${route}"),
    });
    var polyLayer = new FeatureLayer("http://sampleserver6.arcgisonline.com/arcgis/rest/services/Census/MapServer/2", {
      plugins: ['esri/plugins/spatialIndex'],
      outFields: ["NAME","STATE_NAME"],
      infoTemplate: new InfoTemplate("&nbsp;", "${NAME}, ${STATE_NAME}")
    });
    polyLayer.setSelectionSymbol(new SimpleFillSymbol().setColor(new Color([185, 65, 65, 0.55])));

    var query = new Query();
    var bounds;
    var once = polyLayer.on('update-start', function() {
      var tolerance = getTolerance();
      bounds = new Extent(-tolerance, -tolerance, tolerance, tolerance, map.spatialReference);
      query.geometry = bounds;
      map.on('mouse-move', selectFeatures);
      once.remove();
    });

    function selectFeatures(evt) {
      var pt = evt.mapPoint;
      query.geometry = bounds.centerAt(pt);
      polyLayer.selectFeatures(query).then(function(features) {
        var inside;
        array.some(features, function(feat) {
          if(!feat.declaredClass){
            feat = new Graphic(feat);
          }
          if (feat.geometry.contains(pt)) {
            feat.infoTemplate = polyLayer.infoTemplate;
            inside = feat;
            map.infoWindow.show(pt);
            map.infoWindow.setFeatures([inside]);
          }
          return inside;
        });
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

    /*
      Count features as they are inserted. Features are inserted one at a time when
      using default value of true for both `passFeatures` and `drawFeatures`.
      Features are only counted for this layer, since index was plugged-in to this
      specific layer.        
     */
    var c = 0,
        timer;
    polyLayer.on('process-end', function(evt) {
      if (timer) {
        clearTimeout(timer);
      }
      c += evt.results.insert;
      timer = setTimeout(function() {
        console.log('Features Inserted: ', c);
      }, 250);
    });
    polyLayer.on('update-end', function(evt) {
      console.log("update-end");
    });


    map.addLayers([polyLayer, lineLayer]);
    map.infoWindow.resize(155, 75);
  }
});