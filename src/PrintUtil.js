/*
Helper class for printing


**** example code use ****

    var printUtil = new PrintUtil();
    printUtil.setServiceUrl("<URL>");

    // to get available layouts
    var deferred = printUtil.getLayouts("Standard");
    deferred.then(function (resultArray) {
        var layouts = resultArray;
    }, function (err) {
        alert(err.toString());
    });

    var deferred = printUtil.print(map, "Standard", "A4 landscape", "PDF", { "title": "David" }, 96);
    deferred.then(function (resultUrl) {
        window.open(resultUrl, "_blank");

    }, function (err) {
        alert(err.toString());
    });



**** "print" method params: ****

template: the name of template, matching a template folder set up as part of the geoprocessing service.
Example: "Unitary Plan" or "Standard"

layout: the name of the layout (map document), which matches a map document on disk. Use the "getLayouts" method on the service to get available layouts.
Example: "A4 landscape"  

format: file format, "pdf", "png" and "jpg" allowed. For multi-page prints, "pdf" must be used. 

textelements: a JSON object of key-value pairs, where the key represents an element name in the print map document, and the value is the string to insert.
example: {
    title: "Title",
    author: "Author"
} 


*/
define(
[
    "dojo/_base/declare",
    "dojo/_base/array",
    "dojo/_base/lang",
    "dojo/dom",
    "dojo/dom-geometry",
    "dojo/dom-construct",
    "dojo/dom-style",
    "dojo/topic",
    "esri/geometry/Extent",

    'esri/tasks/Geoprocessor',
    'esri/tasks/PrintTask',
    'dojo/Deferred'
    
], function (
    declare,
    array,
    lang,
    dom,
    domGeometry,
    domConstruct,
    domStyle,
    topic,
    Extent,

    Geoprocessor,
    PrintTask,
    Deferred

) {

    var PrintUtil = declare("PrintUtil", null, {
        _currentJobId: null,
        _serviceUrl: "",
        _geoprocesser: null,
        
        // URL always needs to be set here
        setServiceUrl: function (serviceUrl) {
            this._serviceUrl = serviceUrl;
            this._geoprocesser = new Geoprocessor(this._serviceUrl);
        },
        // Do an async call to get available layouts
        getLayouts: function (template) {

            var params = {
                template: template,
                getlayouts: true
            }

            // the deferred returns an array of strings
            return this.doGeoprocCallAsync(params, "layouts");

        },
        // Do an async print
        print: function (map, template, layout, format, textElements, quality, extent, scale, lodsToSnapTo, includeLegend) {

           // topic.publish(Event.PRINT_STARTED);

            var webmapStr = this.getWebmapJson(map);

            // template may be a single template name as a string, or an array of templates 
            var templateName = template;
            if (templateName.constructor === Array && templateName.length > 0) {
                templateName = template[0];
            }
            textElements = this.processTextElements(textElements, layout, templateName);
            var textElementsStr = JSON.stringify(textElements);

            if (!scale) {
                scale = "";
                
            }

            var extentJsonStr = "";
            if (extent) {
                var extentObj = extent.toJson();
                extentJsonStr = JSON.stringify(extentObj);
            }

            if (template.constructor === Array) {
                template = JSON.stringify(template);
            }

            var lodsStr = "";
            if (lodsToSnapTo) {
                lodsStr = JSON.stringify(lodsToSnapTo);
            }

            var params = {
                template: template,
                layout: layout,
                getlayouts: false,
                webmap: webmapStr,
                textelements: textElementsStr,
                format: format,
                quality: quality,
                scale: scale,
                extent: extentJsonStr,
                lods: lodsStr,
                includelegend: includeLegend

            }

            return this.doGeoprocCallAsync(params, "url");


        },
        cancelGeoprocAsync: function () {

            var me = this;
            var gp = this._geoprocesser;
            if (me._currentJobId) {
                gp.cancelJob(me._currentJobId, function(resp) {
                    // successfully stopped geoprocessing job
                });
            }
        },
        doGeoprocCallAsync: function (params, outputValue) {
            this._currentJobId = null;
            var me = this;
            var gp = this._geoprocesser;
            var deferred = new Deferred(function () {
                if (me._currentJobId) {
                    me.cancelGeoprocAsync();
                }
            });
            gp.submitJob(params, gpJobComplete, gpJobStatus, gpJobFailed);
            function gpJobComplete(jobinfo) {
                //construct the result map service url using the id from jobinfo we'll add a new layer to the map
                var jobId = jobinfo.jobId;
                gp.getResultData(jobId, "result", resultIinfoComplete, resultInfoError);

                function resultIinfoComplete(info) {
                    var error = info.value["error"];
                    if (error) {
                        deferred.reject(error);
                    }
                    else {
                        var val = info.value[outputValue];
                        deferred.resolve(val);
                    }
                }
                function resultInfoError(err) {
                    deferred.reject(err);
                }
            }
            function gpJobStatus(jobinfo) {
                if (!me._currentJobId) {
                    me._currentJobId = jobinfo.jobId;
                }
            }
            function gpJobFailed(error) {
                deferred.reject(error);
            }

            return deferred.promise;

        },
        getWebmapJson: function (map) {
            // clear map points selection symbol (cross), this is causing print errors
            if (map.graphics !== null) {
                array.forEach(map.graphics.graphics, function (graphic, i) {
                    if (typeof graphic != 'undefined') {
                        if (typeof graphic.symbol != 'undefined') {
                            if ("style" in graphic.symbol) {
                                if (graphic.symbol.style === "target") {
                                    map.graphics.remove(graphic);
                                }
                            }
                        }
                    }
                });
            }

            var printTask = new PrintTask();
            var w = printTask._getPrintDefinition(map);

            var operationalLayers = this.getOperationalLayers(w,map);
            var mapOptions = w.mapOptions;

            // workarounds for bugs/issues in webmap printing
            // override urls for image symbols, as they are relative
            // text symbols fail when the feature has attributes
            array.forEach(operationalLayers, function (layerObj, i) {
                if ("featureCollection" in layerObj) {
                    if ('layers' in layerObj.featureCollection) {
                        array.forEach(layerObj.featureCollection.layers, function (featLayerObj, i) {
                            if ('featureSet' in featLayerObj) {
                                array.forEach(featLayerObj.featureSet.features, function (feat, i) {
                                    if ('symbol' in feat) {
                                        // picture symbol, insert a full url
                                        if (feat.symbol.type === "esriPMS") {
                                            // if url is relative
                                            if (feat.symbol.url.indexOf('http') != 0) {
                                                var baseUrl = location.protocol + '//' + location.host + location.pathname;
                                                if (baseUrl.slice(-1) !== "/") {
                                                    baseUrl += "/";
                                                }
                                                feat.symbol.url = baseUrl + feat.symbol.url;
                                            }
                                        }
                                        // text symbol, remove all attributes 
                                        if (feat.symbol.type === "esriTS") {
                                            feat.attributes = {};
                                        }
                                    }
                                });
                            }
                        });
                    }
                }
            });

            webmapJson = this.stringify(w); 

            return webmapJson;
        },
        processTextElements: function (textElements, printLayout, templateName) {

            // split attribute values into lines for printing
            // use a max line length, configured per print layout

            var config =  [
                            // apply specific templates as priority
							// LIM landscapes
                            { layout: "A4 Landscape",  maxLineChars: 90},
							
							// default portraits
                            { layout: "A4 Portrait",  maxLineChars: 30 },
							{ layout: "A3 Portrait",  maxLineChars: 35 },
							{ layout: "A2 Portrait",  maxLineChars: 40 },
							{ layout: "A1 Portrait",  maxLineChars: 45 },
							{ layout: "A0 Portrait",  maxLineChars: 50 },
							// default landscapes
                            { layout: "A4 Landscape",  maxLineChars: 50 },
							{ layout: "A3 Landscape",  maxLineChars: 55 },
							{ layout: "A2 Landscape",  maxLineChars: 60 },
							{ layout: "A1 Landscape",  maxLineChars: 65 },
							{ layout: "A0 Landscape",  maxLineChars: 70 }
            ];

            for (var a = 0; a < config.length; a++) {
                var layoutConfig = config[a];
                if (layoutConfig.layout === printLayout) {

                    // if config specifies a template, this must match
                    // if not specified, this is default config and can be used
                    if (layoutConfig.templateStartsWith) {
                        if (templateName.toLowerCase().indexOf(layoutConfig.templateStartsWith.toLowerCase()) !== 0) {
                            // a template has been specified but this does not match, keep searching
                            continue;
                        } 
                    }

                    var maxLineChars = layoutConfig.maxLineChars;
                    var updated = {};
                    for (key in textElements) {

                        var rawString = textElements[key];
                        rawString = rawString.replace(/\r/g, " ");
                        rawString = rawString.replace('\t', " ");

                        var words = rawString.split(" ");
                        var currentLine = "";
                        var lines = [];
                        for (var wordIndex = 0; wordIndex < words.length; wordIndex++) {
                            var word = words[wordIndex];

                            var sep = " ";
                            if (currentLine === "") {
                                sep = "";
                            }
                            var maybCurrentLine = currentLine + sep + word;
                            if (maybCurrentLine.length <= maxLineChars) {
                                currentLine = maybCurrentLine;

                            } else {
                                lines.push(currentLine);
                                currentLine = word;
                            }
                        }
                        lines.push(currentLine);

                        // max number of lines set to 2
                        if (lines.length > 2) {
                            lines = lines.slice(0, 2);
                            var lastLine = lines[1];
                            lastLine = lastLine.slice(0, lastLine.length - 3);
                            lastLine += '...';
                            lines[1] = lastLine;
                        }

                        var updatedString = lines.join("\n");
                        updated[key] = updatedString;

                    }
                    return updated;

                }
            }

            return null;
        },
        getOperationalLayers:function(w,map){
            var operationalLayers = w.operationalLayers;
            var layerIds = map.graphicsLayerIds;
            if (layerIds.length) {
                operationalLayers = this.extractAndCreateNewTextLayerObject(layerIds, operationalLayers);
            } 
            return operationalLayers;
            
        },
        extractAndCreateNewTextLayerObject: function (ids, operationalLayers) {
            var me = this;
            for (var i = 0; i < operationalLayers.length; i++) {

                if (operationalLayers[i] && array.indexOf(ids, operationalLayers[i].id) != -1) {
                    var newLayerObject = me.createNewTextLayerObject(operationalLayers[i]);
                    if (newLayerObject.textLayer) {
                        operationalLayers[i] = newLayerObject.layer;
                        operationalLayers.splice(i + 1, 0, newLayerObject.textLayer);
                    }
                }
            }
            return operationalLayers
        },
        createNewTextLayerObject: function (layerObj) {
            if (!layerObj.featureCollection) {
                return {};
            }
            var layers = layerObj.featureCollection.layers;
            var pointLayer = array.filter(layers, function (layer,index) {
                return layer.layerDefinition.geometryType === "esriGeometryPoint";
            })[0];
            if (pointLayer) {
                var textLayerIndices = [];
                var textFeatures = array.filter(pointLayer.featureSet.features, function (feature, index) {
                    return feature.symbol && feature.symbol.type === 'esriTS' && textLayerIndices.push(index)
                });
                if (textFeatures.length > 0) {

                    //create new text layer object
                    var newTextFeatures = lang.clone(textFeatures);
                    var newPointLayer = lang.clone(pointLayer);
                    newPointLayer.featureSet.features = newTextFeatures;
                    var textLayerObject = lang.clone(layerObj);
                    textLayerObject.featureCollection.layers = [newPointLayer];
                    //remove text features from orginal pointLayer
                    array.forEach(textLayerIndices, function (index) {
                        pointLayer.featureSet.features.splice(index, 1);
                    });
                    textLayerObject.id = "textlayer";
                    return { layer: layerObj, textLayer: textLayerObject };

                } else {
                    return { layer: layerObj, textLayer: null };
                }
            } else {
                return { layer: layerObj, textLayer: null };
            }
        },
        stringify: function (obj) {
            var seen = []
            var stringifiedObj = JSON.stringify(obj, function (key, val) {
                if (val != null && typeof val == "object") {
                    if (array.indexOf(seen, val) >= 0)
                        return
                    seen.push(val)
                }
                return val
            });
            return stringifiedObj;
        }
    });

    return PrintUtil;
});




