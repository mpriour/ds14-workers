(function (self) {

    var eculidDist = function (a, b) {
        if (Array.isArray(a) && Array.isArray(b)) {
            a.x = a[0], a.y = a[1], a.z = a[2];
            b.x = b[0], b.y = b[1], b.z = b[2];
        }
        var dx = a.x - b.x,
            dy = a.y - b.y;
        return Math.sqrt((dx * dx) + (dy * dy));
    };

    var hm = {};

    hm.weightFormulas = {
        sine: function (ratio) {
            var wt = Math.sin(ratio * Math.PI / 2); //-1 to 1
            return (1 + wt) / 2;
        },
        shepard: function (ratio) {
            var wt = Math.pow((1 - (ratio + 2)) / 1 * (ratio + 2), 2); //0 to 36
            return wt / 36;
        },
        inverse: function (ratio) {
            var wt = 1 / (1 - ratio); //0.5 to Infinity -> clamped at 0 to 5
            wt = Math.min(5, wt - 0.5);
            return wt / 5;
        },
        linear: function (ratio) {
            return (ratio + 1) / 2;
        }
    };

    hm.wtFormulas = {
        //all return values from 0 (nearest calc pt) to 1 (maxd)
        sine: function (d, maxd) {
            var ratio = Math.min(d/maxd, 1); //clamped at 0 to 1
            var wt = Math.cos(ratio * Math.PI); //1 to -1
            return (1 - wt)/2;
        },
        shepard: function (d, maxd) {
            if(d===0){
                return 0;
            }
            var ratio = Math.max(0, maxd-d)/(maxd*d);
            var wt = ratio*ratio;
            return 1-wt;
        },
        inverse: function (d, maxd) {
            if(d>maxd){ d = maxd; }
            var invd = 1/d;
            var invmax = 1/maxd;
            var ratio = (invd - invmax) / invmax / 100;
            return 1 - Math.min(1,ratio);
        },
        linear: function (d, maxd) {
            return Math.min(d/maxd, 1);
        }
    };

    /**
     * [calculateMatrix description]
     * @param  {Function} getPoints [description]
     * @param  {(Extent|array.<number>)} mapExtent [description]
     * @param  {array.<number>)} pxExtent  - width/heigth array of pixels that mapExtent covers
     * @param  {number} pointLimit - the maximum number of nearest points to use for density calculation (defaults to 10)
     * @param  {(string|Function)} wtFormula [description] - if false, don't do weighting
     * @param {number} step - number of pixels to step by for intermediate calculation (defaults to 25)
     * @param  {Function} distCalc - if you supply your own distance calculation formula and it depends on attributes in the points,
     *     then you should be able to accept points with attributes directly on the point object or attributes in a separate `attribute`
     *     property on the point object.
     * @return {Float32Array}           [description]
     */
    hm.calculateMatrix = function(getPoints, mapExtent, pxExtent, wtFormula, pxStep, buffer, distCalc, msgId) {
        var geomFlag;
        var coarse = false;
        var densRange = [null, null];
        if (!pxStep) {
            pxStep = 25;
        }
        if(!buffer){
            buffer = 2;
        }
        var ptSet;
        if (typeof getPoints == 'function') {
            ptSet = getPoints(mapExtent);
        } else if (Array.isArray(getPoints)) {
            ptSet = getPoints;
        }
        if (!ptSet || ptSet.length < 2) {
            return [];
        }
        var distFunc = distCalc || eculidDist;
        //normalize for pt.x/y and pt.geometry.x/y, assume all points in point set have same structure
        if (ptSet[0].geometry) {
            geomFlag = true;
            var prevDistFunc = distFunc;
            distFunc = function(a, b) {
                return prevDistFunc(a.geometry, b.geometry);
            };
        }
        postMessage({
            msgId:msgId,
            status: 'debug',
            distFunc: ''+distFunc,
            fullPoints: ptSet
        });
        //set wtFormula
        if (wtFormula==undefined) { //want to catch undef or null, but not false
            wtFormula = hm.wtFormulas.sine;
        } else if (typeof wtFormula == 'string') {
            wtFormula = hm.wtFormulas[wtFormula];
        } else if (typeof wtFormula != 'function' && wtFormula !== false) {
            return false;
        }
        /*wtArray = new Float32Array(pxExtent[0] * pxExtent[1]);*/
        /* NOT REALLY --->
        //we want to start at top left corner and step by the step/randDist with a 2.5 x step square buffer around the point.
        //so we are going to get all the points in a 5step x 5step block and use those for all the calculations in a step x step
        //block. If 5step is larger than passed extent in either direction, then just use extent with a 2step buffer around it.
        //HOWEVER if step is less than 2px worth of distance, then step is increased to 2px worth of distance.
        //So we have a minimum 5px*5px to a maximum of 5step*5step (if step>2px) buffered calculation block
        <--- NEEDS CORRECTION */

        //convert mapExtent to envelope
        var geoEnv;
        if (mapExtent.xmax != undefined) {
            geoEnv = {
                x: mapExtent.xmin,
                y: mapExtent.ymin,
                w: mapExtent.xmax - mapExtent.xmin,
                h: mapExtent.ymax - mapExtent.ymin
            };
        } else if (Array.isArray(mapExtent)) {
            geoEnv = {
                x: mapExtent[0],
                y: mapExtent[1],
                w: mapExtent[2] - mapExtent[0],
                h: mapExtent[3] - mapExtent[1]
            };
        } else if (mapExtent.x != undefined && mapExtent.h != undefined) {
            geoEnv = mapExtent;
        } else {
            return false;
        }
        //TODO: actually account for non square geoextent
        var px2geo = (pxExtent[0] / geoEnv.w + pxExtent[1] / geoEnv.h) / 2; //ex: px/meter
        var geo2px = (geoEnv.w / pxExtent[0] + geoEnv.h / pxExtent[1]) / 2; //ex: meter/px
        var px_geo2 = px2geo * px2geo; // ex: px/meter^2
        var step = geo2px * pxStep;
        var step_2 = step/2;
        //var searchArea = 4*step*step;
        var pxBlock = [0, 0, pxStep, pxStep];
        var block = [geoEnv.x, geoEnv.y + geoEnv.h - step, geoEnv.x + step, geoEnv.y + geoEnv.h];
        var wtArray = [];
/*        postMessage({
            msgId: msgId,
            status: 'debug',
            tileExtent: geoEnv,
            step: step,
            pixelStep: pxStep,
            block: block,
            pxBlock: pxBlock
        });*/
        var distSum = 0;
        var maxDist = (buffer/2 + 0.5) * step;
        var maxDist_2 = maxDist/2;
        var bufferMultiple = buffer*2 + 1;
        var searchArea = Math.pow( bufferMultiple*step, 2 );
        var searchPx = Math.pow( bufferMultiple*pxStep, 2 );
        var numSort = function(a,b){return (a<b) ? -1 : (a!=b) ? 1 : 0;};
        var distAvg;
        var blockDens = [];
        while (block[3] > geoEnv.y) {
            block[0] = geoEnv.x;
            block[2] = geoEnv.x + step;
            pxBlock = [0, pxBlock[1], pxStep, pxBlock[3]];
            while (block[0] < (geoEnv.x + geoEnv.w)) {
                                        /*if (pxBlock[1] == 250) {
                            postMessage({
                                msgId: msgId,
                                status: 'debug',
                                pxBlock: pxBlock.join(',')/*,
                                row: r,
                                col: c
                            });
                        }*/
                var bufferDist = buffer * step;
                var searchBuffer = [block[0] - bufferDist, block[1] - bufferDist, block[2] + bufferDist, block[3] + bufferDist];
                var pts = getPoints(searchBuffer);
                var r = 0,
                    c = 0;
                var d, rangePts, y, x, calcPt, offset, maxOffset, pxDens, pxAvgArea;
                while (r < pxStep && pxBlock[1]+r < pxExtent[1]) {
                    c = 0;
                    y = block[3] - 0.5 * geo2px - r * geo2px;
                    offset = (pxBlock[1]+r) * pxExtent[1] + pxBlock[0];
                    maxOffset = offset - pxBlock[0] + pxExtent[0];
                    //blockDens[r] = [];
                    while (c < pxStep && pxBlock[0]+c < pxExtent[0]) {
                        /*if (pxBlock[1] == 250 && (pxBlock[0]===0 || pxBlock[0]===500)) {
                            postMessage({
                                msgId: msgId,
                                status: 'debug',
                                block: pxBlock[0],
                                row: r,
                                col: c,
                                offset: offset,
                                maxOffset: maxOffset
                            });
                        }*/
                        if (coarse || pts.length===1) {
                            if(offset<maxOffset){
                                blockDens[offset] = pts.length / searchPx;
                            }
                        } else {
                            x = block[0] + 0.5 * geo2px + c * geo2px;
                            calcPt = {
                                'x': x,
                                'y': y
                            };
                            distSum = 0;
                            if (geomFlag) {
                                calcPt = {
                                    geometry: calcPt
                                };
                            }
                            if (!pts.length) {
                                pxDens = 0;
                            } else {
                                //rangePts = (wtFormula === false) ? pts.length : 0;
                                for (var i = 0; i < pts.length; i++) {
                                    d = distFunc(calcPt, pts[i]);
                                    if (wtFormula !== false) {
                                        //if(d<=maxDist){
                                        d *= wtFormula(d, maxDist);
                                        /*rangePts++;
                                        }else{
                                            d=0;
                                        }*/
                                    }
                                    distSum += d;
                                }
                                distAvg = distSum / pts.length; // eg: average weighted distance
                                pxAvgArea = distAvg * distAvg * px_geo2; //eg: avg dist square converted to pixel area 
                                pxDens = (distAvg!==0) ? pts.length / pxAvgArea : pts.length; // total pts / pixel area; ex: 10 pts / 2.5 px = 4pts/px
                                if (densRange[0] === null && densRange[1] === null) {
                                    densRange[0] = pxDens;
                                    densRange[1] = pxDens;
                                } else if (pxDens < densRange[0]) {
                                    densRange[0] = pxDens;
                                } else if (pxDens > densRange[1]) {
                                    densRange[1] = pxDens;
                                }
                            }
                            if(offset<maxOffset){
                                blockDens[offset] = pxDens;
                            }
                        }
                            c++;
                            offset++;
                    }
                    r++;
                }
                //saveWtValues(wtArray, blockDens, pxBlock, pxExtent,msgId);
                block[0] += step;
                block[2] += step;
                pxBlock[0] += pxStep;
                pxBlock[2] += pxStep;
            }
            block[1] -= step;
            block[3] -= step;
            pxBlock[1] += pxStep;
            pxBlock[3] += pxStep;
        }
        /*postMessage({
            msgId: msgId,
            status: "debug",
            showAs: 'log',
            nearPoints: nearPoints
        });*/
        return {
            densities: blockDens, //wtArray,
            range: densRange
        };
    };
    
    var saveWtValues = function(finalArr, valArr, block, finalDim, msgId){
        var rowOffset = block[1]*finalDim[1];
        var rows = valArr.length;
        for(var j=0; j<rows; j++){
            var cols = valArr[j].length;
            for(var k=0; k<cols; k++){
                var offset = rowOffset + block[0] + k;
                finalArr[offset] = valArr[j][k];
                /*if(valArr[j][k]>0){
                    postMessage({
                        msgId:msgId,
                        status: 'debug',
                        val: valArr[j][k],
                        i: rowOffset+k,
                        showAs: "info"
                    });
                }*/
            }
            rowOffset+=finalDim[1];
        }
    };

    self.Heatmapper = hm;

}(this));