/* jshint worker: true */
/* global self: true, postMessage: true, importScripts: false */

// Intended to be added to the indexWorker (might do it the other way around, but either way...)
/* global searchIndex: false */

importScripts('http://dl.dropboxusercontent.com/u/29477614/workers/indexers/heatmapper.js');
/* global Heatmapper */

function handleMessage(event) {
    var msg = event.data;
    if (msg.action == 'calculateWeights') {
        //require: extent, imgSize
        //optional: weightFormula, distanceFormula, step
        var extent = msg.extent;
        var imgSize = msg.imgSize;
        var buffer = msg.buffer || 2;
        var wtFormula = msg.weightFormula;
        var step = msg.pxSteps;
        var distFormula = msg.distanceFormula;
        var densResults = Heatmapper.calculateMatrix(searchIndex, extent, imgSize, wtFormula, step, buffer, distFormula, msg.msgId);
        var wtArray = densResults.densities;
        var densRange = densResults.range;
        if(wtArray===false){
            postMessage({
                msgId: msg.msgId,
                status: 'error',
                message: 'incorrect input parameter(s). Either extent or a custom wtFormula was specified incorrectly'
            });    
        } else {
            /*var buffer = imgData.buffer || null;
            var transfers = (buffer) ? [imgData.buffer] : undefined;
            postMessage({
                msgId: msg.msgId,
                imgData: buffer
            }, transfers);*/
            postMessage({
                msgId: msg.msgId,
                densities: wtArray,
                range: densRange
            });
        }
    }
}

self.addEventListener('message', handleMessage, false);