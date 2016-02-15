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
    "dojo/_base/array",
    "esri/geometry/Extent",

    'esri/tasks/Geoprocessor',
    'esri/tasks/PrintTask',
    'dojo/Deferred',
    'dojo/promise/all',
    'esri/request'

], function (
    declare,
    array,
    lang,
    dom,
    domGeometry,
    domConstruct,
    domStyle,
    topic,
    array,
    Extent,

    Geoprocessor,
    PrintTask,
    Deferred,
    all,
    esriRequest

) {

    var PrintUtil = declare("PrintUtil", null, {
        _currentJobId: null,
        _serviceUrl: "",
        _geoprocessor: null,

        // URL always needs to be set here
        setServiceUrl: function (serviceUrl) {
            this._serviceUrl = serviceUrl;
            this._geoprocessor = new Geoprocessor(this._serviceUrl);
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
        // call to get available templates
        // set print URL correctly before running
        getTemplates: function () {

            // the deferred returns an array of strings, these are available template names on disk
            // don't specify a template, all templates are returned
            var params = {
                template: "",
                getlayouts: true
            }

            // the deferred returns an array of strings
            var deferred = new Deferred();
            if (!this._serviceUrl) {
                deferred.reject("PrintUtil service URL is not set.");
            } else {
                deferred = this.doGeoprocCallAsync(params, "templates");
            }
            return deferred;

        },
        // Do an async print
        print: function (map, template, layout, format, textElements, quality, extent, scale, lodsToSnapTo, includeLegend) {

            var dfd = new Deferred();
            this.getWebmapJson(map, scale).then(lang.hitch(this, function (webmapStr) {

                // template may be a single template name as a string, or an array of templates
                var templateName = template;
                if (templateName.constructor === Array && templateName.length > 0) {
                    // sending a template name to processTextElements() is not ideal as there may be multiple templates involved
                    // probably not used enough in this way yet to need changes
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

                this.doGeoprocCallAsync(params, "url").then(function (res) {
                    dfd.resolve(res);

                }, function (err) {
                    dfd.reject(err);
                });

            }));

            return dfd.promise;
        },
        cancelGeoprocAsync: function () {

            var me = this;
            var gp = this._geoprocessor;
            if (me._currentJobId) {
                gp.cancelJob(me._currentJobId, function (resp) {
                    // successfully stopped geoprocessing job
                });
            }
        },
        doGeoprocCallAsync: function (params, outputValue) {
            this._currentJobId = null;
            var me = this;
            var gp = this._geoprocessor;
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
        getWebmapJson: function (map, scale) {


            var dfd = new Deferred();
            setTimeout(lang.hitch(this, function () {

                var webmapData = null;
                if (map.itemInfo && map.itemInfo.itemData) {
                    webmapData = map.itemInfo.itemData;
                }

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
                // gbs.sjh - second paramater is required at sjapi v3.14, is a PrintTemplate object I think. This is quick fix.
                var printWebmapData = printTask._getPrintDefinition(map, { preserveScale: false });

                //gbs.sjh
                //var operationalLayers = this.getOperationalLayers(w,map);
                var mapOptions = printWebmapData.mapOptions;
                var operationalLayers;
                this.getOperationalLayers(printWebmapData, map, scale).then(lang.hitch(this, function(rslt) {

                    console.log("  ====> getOperationalLayers returned", rslt)
                    operationalLayers = rslt;

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

                    this.attachWebmapDataToPrintWebmap(printWebmapData, webmapData, map);

                    var webmapJson = this.stringify(printWebmapData);
                    //sjh.gbs
                    //return webmapJson;
                    dfd.resolve(webmapJson);

                }));

            }));
            return dfd;
        },
        attachWebmapDataToPrintWebmap: function (printWebmap, webmapData, map) {
            // attaches "showLegend" property to webmap object, by default this doesn't exist in print webmaps
            // added DA 28.01.2016, also attaches javascript class as "jsDeclaredClass", this is so the print service can deal with tiled and image layers correctly

            if (!webmapData) {
                return;
            }

            // printWebmap includes basemaps in operationalLayers
            // webmapData has it in a separate "baseMap" property
            // go through both and match
            for (var a = 0; a < printWebmap.operationalLayers.length; a++) {
                var printMapOpLayer = printWebmap.operationalLayers[a];

                for (var b = 0; b < webmapData.operationalLayers.length; b++) {
                    var rawMapOpLayerData = webmapData.operationalLayers[b];
                    if (printMapOpLayer.id === rawMapOpLayerData.id) {
                        attachProperties(printMapOpLayer, rawMapOpLayerData);
                        break;
                    }

                }

                for (var c = 0; c < webmapData.baseMap.baseMapLayers.length; c++) {
                    var rawBasemapLayerData = webmapData.baseMap.baseMapLayers[c];

                    if (printMapOpLayer.id === rawBasemapLayerData.id) {
                        attachProperties(printMapOpLayer, rawBasemapLayerData);
                        break;
                    }

                }

                // if no match found yet, try just finding map layer
                attachProperties(printMapOpLayer, {});

                // attach JSON properties to be used by print service
                function attachProperties(printLayerObj, webmapLayerObj) {
                    
                    var layer = map.getLayer(printLayerObj.id);
                    var layerJsClass = layer.declaredClass;

                    printLayerObj["jsDeclaredClass"] = layerJsClass;

                    if (webmapLayerObj.hasOwnProperty("showLegend")) {
                        printLayerObj["showLegend"] = webmapLayerObj["showLegend"];
                    }
                    if (webmapLayerObj.hasOwnProperty("layers") && !printLayerObj.hasOwnProperty("layers")) {
                        printLayerObj["layers"] = webmapLayerObj["layers"];
                    }
                    if (webmapLayerObj.hasOwnProperty("baseMapLayer")) {
                        printLayerObj["baseMapLayer"] = webmapLayerObj["baseMapLayer"];
                    }
                }

            }
        },
        processTextElements: function (textElements, printLayout, templateName) {

            // split attribute values into lines for printing
            // use a max line length, configured per print layout

            var config = [
                            // apply specific templates as priority
							// LIM landscapes
                            { layout: "A4 Landscape", maxLineChars: 90 },

							// default portraits
                            { layout: "A4 Portrait", maxLineChars: 30 },
							{ layout: "A3 Portrait", maxLineChars: 35 },
							{ layout: "A2 Portrait", maxLineChars: 40 },
							{ layout: "A1 Portrait", maxLineChars: 45 },
							{ layout: "A0 Portrait", maxLineChars: 50 },
							// default landscapes
                            { layout: "A4 Landscape", maxLineChars: 50 },
							{ layout: "A3 Landscape", maxLineChars: 55 },
							{ layout: "A2 Landscape", maxLineChars: 60 },
							{ layout: "A1 Landscape", maxLineChars: 65 },
							{ layout: "A0 Landscape", maxLineChars: 70 }
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
        getOperationalLayers: function (w, map, scale) {

            var dfd = new Deferred();
            var operationalLayers = w.operationalLayers;
            this.deferredLegendRequests = [];

            // get extended map layer infos for each operational Layer
            operationalLayers.forEach(lang.hitch(this, function (opLayer) {

                // get layer config as set in the webmap
                var layerWebMapConfig = null;
                array.forEach(map.itemInfo.itemData.operationalLayers, function (layerWebMapConfigItem) {
                    if (layerWebMapConfigItem.id === opLayer.id) {
                        layerWebMapConfig = layerWebMapConfigItem;
                    }
                });

                var layer = map.getLayer(opLayer.id);
                if (layer) {
                    this.deferredLegendRequests.push(this.getLegendDetails(layer, layerWebMapConfig, scale));
                }
            }));
            this.deferredLegendRequetsAll = all(this.deferredLegendRequests);

            this.deferredLegendRequetsAll.then(lang.hitch(this, function (rslts) {
                console.log('deferredRequets results: ', rslts);

                // merge legend count results into core operationalLayers result
                operationalLayers.forEach(function (layer) {
                    array.forEach(rslts, function (rslt) {
                        if (rslt.id === layer.id) {
                            layer.legendCount = rslt.legendCount;
                        }
                    });
                });

                var layerIds = map.graphicsLayerIds;
                if (layerIds.length) {
                    operationalLayers = this.extractAndCreateNewTextLayerObject(layerIds, operationalLayers);
                }
                //return operationalLayers;
                dfd.resolve(operationalLayers);

            }));
            return dfd;

        },
        // request the legend details from endpoint if required,
        // otherwise get from locally
        getLegendDetails: function(layer, layerWebMapConfig, scale) {
            var dfd = new Deferred();
            //console.log('getLegendDetails: ', layer.declaredClass, " - ", layer)

            setTimeout(lang.hitch(this, function () {
                switch (layer.declaredClass) {
                    case 'esri.layers.FeatureLayer':
                        var flCount = this.getRendererItemCount(layer.renderer, layerWebMapConfig);
                        console.log('request details from ', layer.type, " - ", flCount);
                        dfd.resolve({
                            id: layer.id,
                            legendCount: flCount
                        }); // write get featureLayerLegendCount()
                        break;

                    case 'esri.layers.ArcGISDynamicMapServiceLayer':
                        console.log('request details from ', layer.url)
                        esriRequest({
                            url: layer.url + "/legend",
                            content: { f: 'json' },
                            handleAs: 'json'
                        }).then(lang.hitch(this, function (rslt) {
                            var legendLayers = this.mergeLayerInfosToLegend(rslt.layers, layer.layerInfos);
                            var dlCount = this.getLegendCountOfVisibleLayers(layer, layer.visibleLayers, rslt.layers, layerWebMapConfig, scale);
                            console.log("  ====   count of legend items in: ", rslt.layers.length, " - ", dlCount);
                            dfd.resolve({
                                id: layer.id,
                                legendCount: dlCount
                            });
                        }), lang.hitch(this, function (error) {
                            console.warn('legend request error')
                            dfd.resolve({});
                        }));
                        break;
                    default:
                        dfd.resolve({});
                }
            }));

            return dfd;
        },
        // adds additional layer infos details from to legendItems
        // returns legendItems
        mergeLayerInfosToLegend: function (legendItems, layerInfos) {
            legendItemsOut = [];
            allLayerParents = [];
            array.forEach(legendItems, function (lgdItem) {
                array.forEach(layerInfos, function (lyrInfoItem) {
                    if (lgdItem.layerId === lyrInfoItem.id) {
                        // check parent layers
                        if (lyrInfoItem.parentLayerId > -1) {
                            var parentslength = allLayerParents.length;
                            if (parentslength > 0) {
                                var currentLastParent = allLayerParents[parentslength - 1];
                                if (lyrInfoItem.parentLayerId > currentLastParent) {
                                    // add the next level of grouping
                                    allLayerParents.push(lyrInfoItem.parentLayerId)
                                } else if (lyrInfoItem.parentLayerId < currentLastParent) {
                                    // steped back up the tree
                                    allLayerParents.pop()
                                }

                            } else {
                                // adding first parent id
                                allLayerParents.push(lyrInfoItem.parentLayerId)
                            }
                        } else {
                            allLayerParents = [];
                        }
                        //lang.mixin(lgdItem,lyrInfoItem )
                        lgdItem.parentLayerId = lyrInfoItem.parentLayerId
                        lgdItem.parentLayerIds = lang.clone(allLayerParents);
                        legendItemsOut.push(lgdItem);
                    }

                });

            });
            return legendItemsOut;
        },
        getRendererItemCount: function (renderer, layerWebMapConfig) {
            if (layerWebMapConfig && layerWebMapConfig.showLegend === false) {
                return 0;
            }

            switch (renderer.declaredClass) {
                case 'esri.renderer.SimpleRenderer':
                    return 1;
                    break;
                case 'esri.renderer.UniqueValueRenderer':
                    return renderer.infos.length;
                    break;
                default:
                    return 1;
            }
        },
        // given array of visible layer id's and layers from legend request
        // return count of items in each visible layer
        getLegendCountOfVisibleLayers: function (dynLayer, visibleLayers, legendLayers, layerWebMapConfig, scale) {
            console.log('getLegendCountOfVisibleLayers', visibleLayers, legendLayers);
            var count = 0;

            // first check if map service is in scale
            if (dynLayer.minScale > 0 && scale >= dynLayer.minScale) {
                return count;
            } else if (dynLayer.maxScale > 0 && scale <= dynLayer.maxScale) {
                return count;
            }

            // check map service sub layers
            array.forEach(legendLayers, lang.hitch(this, function (legendLayer) {
                // test legend item is visible
                if (visibleLayers.indexOf(legendLayer.layerId) > -1 && this.layerInLegend(legendLayer, layerWebMapConfig)) {
                    // scale check
                    var isInScale = true;
                    if (legendLayer.minScale > 0 && scale >= legendLayer.minScale) {
                        // don't include in count
                        isInScale = false;
                    } else if (legendLayer.maxScale > 0 && scale <= legendLayer.maxScale) {
                        isInScale = false;
                    }
                    if (isInScale) {
                        count += legendLayer.legend.length;
                    }
                }

            }));
            return count;
        },
        // checks that the layer is visible and if it or its parents
        // are set to hide in legend
        layerInLegend: function (legendLayer, webmapLayers) {
            var show = true;

            // layer may not have been in webmap after using with add data widget
            if (webmapLayers === null) {
                return show;
            }

            if (webmapLayers.layers) {
                // check for sub layer visibility
                array.forEach(webmapLayers.layers, function (layer) {
                    if (layer.id === legendLayer.layerId ||
                      (legendLayer.parentLayerIds && legendLayer.parentLayerIds.indexOf(layer.id) > -1)) {
                        if (layer.showLegend == false) {
                            show = false;
                        }
                    }
                });
            } else if (webmapLayers.showLegend == false) {
                // checking layer visibility
                show = false;
            }
            return show;
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
            var pointLayer = array.filter(layers, function (layer, index) {
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
