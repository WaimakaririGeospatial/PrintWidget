define([
  'dojo/_base/declare',
  'dijit/_WidgetBase',
  'dijit/_TemplatedMixin',
  'dijit/_WidgetsInTemplateMixin',
  'esri/tasks/PrintTask',
  "esri/tasks/PrintParameters",
  "esri/tasks/PrintTemplate",
  "esri/request",
  "esri/geometry/geometryEngine",
  "esri/tasks/QueryTask",
  "esri/tasks/query",
  "esri/layers/FeatureLayer",
  'dojo/_base/lang',
  'dojo/_base/array',
  'dojo/_base/html',
  'dojo/dom-style',
  'dojo/dom-construct',
  'dojo/dom-class',
  'dojo/Deferred',
  'dojo/json',
  'jimu/portalUrlUtils',
  'dojo/text!./templates/Print.html',
  'dojo/text!./templates/PrintResult.html',
  'dojo/aspect',
  'jimu/dijit/LoadingShelter',
  'jimu/dijit/Message',
  './PrintUtil',
  'dijit/form/Form',
  'dijit/form/Select',
  'dijit/form/ValidationTextBox',
  'dijit/form/NumberTextBox',
  'dijit/form/Button',
  'dijit/form/CheckBox',
  'dijit/ProgressBar',
  'dijit/form/DropDownButton',
  'dijit/TooltipDialog',
  'dijit/form/RadioButton',
  'esri/IdentityManager',
  'dojo/store/Memory'
  
], function (
  declare,
  _WidgetBase,
  _TemplatedMixin,
  _WidgetsInTemplateMixin,
  PrintTask,
  PrintParameters,
  PrintTemplate,
  esriRequest,
  geometryEngine,
  QueryTask,
  Query,
  FeatureLayer,
  lang,
  array,
  html,
  domStyle,
  domConstruct,
  domClass,
  Deferred,
  dojoJSON,
  portalUrlUtils,
  printTemplate,
  printResultTemplate,
  aspect,
  LoadingShelter,
  Message, PrintUtil) {
    // Main print dijit
    var PrintDijit = declare([_WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin], {
        widgetsInTemplate: true,
        templateString: printTemplate,
        map: null,
        count: 1,
        results: [],
        authorText: null,
        copyrightText: null,
        defaultTitle: null,
        maxTitleLength: null,
        defaultFormat: null,
        defaultLayout: null,
        baseClass: "gis_PrintDijit",
        pdfIcon: require.toUrl("./widgets/TCDCPrint/images/pdf.png"),
        imageIcon: require.toUrl("./widgets/TCDCPrint/images/image.png"),
        printTaskURL: null,
        printTask: null,
        async: false,
        customFeatureSets: [],

        postCreate: function () {
            this.inherited(arguments);
            var printParams = {
                async: this.async
            };
            var _handleAs = 'json';

            this.printTask = new PrintTask(this.printTaskURL, printParams);
            this.printparams = new PrintParameters();
            this.printparams.map = this.map;
            this.printparams.outSpatialReference = this.map.spatialReference;

            this.shelter = new LoadingShelter({
                hidden: true
            });
            this.shelter.placeAt(this.domNode);
            this.shelter.startup();
           

            this.titleNode.set('value', this.defaultTitle);
            if (this.maxTitleLength) {
                this.titleNode.set('maxlength', this.maxTitleLength);
            }

            this.authorNode.set('value', this.defaultAuthor);
            this.copyrightNode.set('value', this.defaultCopyright);

            this.printUtil = new PrintUtil();
            this.printUtil.setServiceUrl(this.printTaskURL);

            this._setPrintTemplates();
            this._setPrintFormats();

            domStyle.set(this.advancedButtonDijit.domNode, 'display', '');
           
           

            /*------------OOTB code------------------

            
            var serviceUrl = portalUrlUtils.setHttpProtocol(this.printTaskURL);
            var portalNewPrintUrl = portalUrlUtils.getNewPrintUrl(this.appConfig.portalUrl);

            if (serviceUrl === portalNewPrintUrl ||
              /sharing\/tools\/newPrint$/.test(serviceUrl)) {
                _handleAs = 'text';
            }
            this._getPrintTaskInfo(_handleAs);

            if (this.printTask._getPrintDefinition) {
                aspect.after(
                  this.printTask,
                  '_getPrintDefinition',
                  lang.hitch(this, 'printDefInspector'),
                  false);
            }
            if (this.printTask._createOperationalLayers) {
                aspect.after(
                  this.printTask,
                  '_createOperationalLayers',
                  lang.hitch(this, '_excludeInvalidLegend')
                );
            }
            
             -------------------------------------*/
        },
        onQueryDataReceived: function(data) {
            this.customFeatureSets = data.results;

        },
        _setPrintTemplates:function(){
            var templates = this.config.userTemplates;
            if (templates) {
                var options = array.map(templates, function (temp) {
                    return {
                        label: temp.name,
                        value: temp.id,
                        userTemplate: temp
                    }
                });
                this.mxdTemplateDijit.addOption(options);
            }
            this.mxdTemplateDijit.on("change", lang.hitch(this, '_updateLayout'));
            this.mxdTemplateDijit.onChange();
        },
        _setPrintFormats:function(){
            var formats = this.config.formats;
            if (formats) {
                var formatOptions = array.map(formats, function (format) {
                    return {
                        label: format.label,
                        value: format.value,
                        selected: format.isDefault ? true : false
                    }
                });
                this.formatDijit.addOption(formatOptions);
            }
        },
        _updateLayout: function () {
            var templateId = this.mxdTemplateDijit.get("value");
            var templateConfig = array.filter(this.config.userTemplates, function (temp) {
                return temp.id == templateId;
            })[0];
            if (templateConfig) {
                this.shelter.show();
                if (templateConfig.layouts instanceof Array && templateConfig.layouts.length > 0) {
                    var layouts = array.map(templateConfig.layouts, function (layout) {
                        return { label: layout, value: layout }
                    });
                    this.layoutDijit.set("options", []);
                    this.layoutDijit.addOption(layouts);
                    this.shelter.hide();
                } else {
                    var firstTempName = templateConfig.serverTemplates[0].name;
                    this.printUtil.getLayouts(firstTempName).then(lang.hitch(this, function (layouts) {
                        var options = [];
                        array.forEach(layouts, function (layout) {
                            var opt = { label: layout, value: layout }
                            if (layout.toLowerCase().indexOf("a4 landscape") > -1) {
                                opt.selected = true;
                            }
                            options.push(opt);
                        });

                        this.layoutDijit.set("options", []);
                        this.layoutDijit.addOption(options);
                        this.shelter.hide();
                    }));
                }
            }
        },
        _getPrintTaskInfo: function (handle) {
            // portal own print url: portalname/arcgis/sharing/tools/newPrint
            esriRequest({
                url: this.printTaskURL,
                content: {
                    f: "json"
                },
                callbackParamName: "callback",
                handleAs: handle || "json",
                timeout: 60000
            }).then(
              lang.hitch(this, '_handlePrintInfo'),
              lang.hitch(this, '_handleError')
            ).always(lang.hitch(this, function () {
                this.shelter.hide();
            }));
        },

        _excludeInvalidLegend: function (opLayers) {
            if (this.printTask.allLayerslegend) {
                var legendArray = this.printTask.allLayerslegend;
                var arr = [];
                for (var i = 0; i < legendArray.length; i++) {
                    var layer = this.map.getLayer(legendArray[i].id);
                    if ((layer && layer.declaredClass &&
                      layer.declaredClass !== "esri.layers.GraphicsLayer") &&
                      (!layer.renderer || (layer.renderer && !layer.renderer.hasVisualVariables()))) {
                        arr.push(legendArray[i]);
                    }
                }
                this.printTask.allLayerslegend = arr;
            }
            return opLayers;
        },

        printDefInspector: function (printDef) {
            //do what you want here then return the object.
            if (this.preserve.preserveScale === 'force') {
                printDef.mapOptions.scale = this.preserve.forcedScale;
            }
            return printDef;
        },

        _handleError: function (err) {
            console.log('print widget load error: ', err);
            new Message({
                message: err.message || err
            });
        },

        _handlePrintInfo: function (rData) {
            var data = null;
            try {
                if (typeof rData === 'string') {
                    data = dojoJSON.parse(rData);
                } else {
                    data = rData;
                }
                //{"error":{"code":499,"message":"Token Required","details":[]}}
                if (data.error && data.error.code) {
                    this._getPrintTaskInfo('json');
                    return;
                }
            } catch (err) {
                var serviceUrl = portalUrlUtils.setHttpProtocol(this.printTaskURL),
                  portalNewPrintUrl = portalUrlUtils.getNewPrintUrl(this.appConfig.portalUrl);
                if (serviceUrl === portalNewPrintUrl ||
                  /sharing\/tools\/newPrint$/.test(serviceUrl)) { // portal own print url
                    domStyle.set(this.layoutDijit.domNode.parentNode.parentNode, 'display', 'none');
                    domStyle.set(this.formatDijit.domNode.parentNode.parentNode, 'display', 'none');
                    domStyle.set(this.advancedButtonDijit.domNode, 'display', 'none');
                } else {
                    this._handleError(err);
                }
                return;
            }

            domStyle.set(this.layoutDijit.domNode.parentNode.parentNode, 'display', '');
            domStyle.set(this.formatDijit.domNode.parentNode.parentNode, 'display', '');
            domStyle.set(this.advancedButtonDijit.domNode, 'display', '');
            var Layout_Template = array.filter(data.parameters, function (param) {
                return param.name === "Layout_Template";
            });
            if (Layout_Template.length === 0) {
                console.log("print service parameters name for templates must be \"Layout_Template\"");
                return;
            }
            var layoutItems = array.map(Layout_Template[0].choiceList, function (item) {
                return {
                    label: item,
                    value: item
                };
            });
            layoutItems.sort(function (a, b) {
                return (a.label > b.label) ? 1 : ((b.label > a.label) ? -1 : 0);
            });
            this.layoutDijit.addOption(layoutItems);
            if (this.defaultLayout) {
                this.layoutDijit.set('value', this.defaultLayout);
            } else {
                this.layoutDijit.set('value', Layout_Template[0].defaultValue);
            }

            var Format = array.filter(data.parameters, function (param) {
                return param.name === "Format";
            });
            if (Format.length === 0) {
                console.log("print service parameters name for format must be \"Format\"");
                return;
            }
            var formatItems = array.map(Format[0].choiceList, function (item) {
                return {
                    label: item,
                    value: item
                };
            });
            formatItems.sort(function (a, b) {
                return (a.label > b.label) ? 1 : ((b.label > a.label) ? -1 : 0);
            });
            this.formatDijit.addOption(formatItems);
            if (this.defaultFormat) {
                this.formatDijit.set('value', this.defaultFormat);
            } else {
                this.formatDijit.set('value', Format[0].defaultValue);
            }
        },
        getCustomFeatureSet: function (layerNameOrUrl) {

            layerNameOrUrl = layerNameOrUrl.toLowerCase();
            var match = null;

            var isUrl = false;
            if (layerNameOrUrl.indexOf('http') === 0) {
                isUrl = true;
            }

            for (var a = 0; a < this.customFeatureSets.length; a++) {
                var featureSet = this.customFeatureSets[a];

                if (!isUrl && featureSet.name && featureSet.name.toLowerCase() === layerNameOrUrl.toLowerCase()) {
                    // first try to match feature set
                    match = featureSet;
                    break;
                }

                var layer = featureSet.layer;
                if (!layer) {
                    continue;
                }
                if (isUrl) {
                    if (layer.url && layer.url.toLowerCase() === layerNameOrUrl) {
                        match = featureSet;
                        break;
                    }
                } else {
                    if (layer.name && layer.name.toLowerCase() === layerNameOrUrl) {
                        match = featureSet;
                        break;
                    }
                }
            }
            return match;

        },
        getIntersectFeatures: function (geom, intersectLayer, spatialRel) {
            var deferred = new Deferred();

            var query = new Query();
            query.spatialRelationship = Query[spatialRel];
            query.returnGeometry = false;
            query.geometry = geom;

            var queryTask = new QueryTask(intersectLayer.url);
            queryTask.execute(query, function(result) {

                deferred.resolve(result.features);
            }, function(err) {

                deferred.reject();
            });

            return deferred.promise;

        },
        getLayerByNameOrUrl: function(layerNameOrUrl) {

            var layer = null;
            var me = this;
            var map = this.map;
            
            var isUrl = false;
            if (layerNameOrUrl.toLowerCase().indexOf('http') === 0) {
                isUrl = true;
            }

            if (isUrl) {
                layer = new FeatureLayer(layerNameOrUrl);

            } else {
                var layerIds = map.graphicsLayerIds;
                for (var a = 0; a < layerIds.length; a++) {
                    var featLayer = map.getLayer(layerIds[a]);
                    if (featLayer.name && featLayer.name.toLowerCase() === layerNameOrUrl.toLowerCase()) {
                        layer = featLayer;
                        break;
                    }
                }
            }
            return layer;

        },
        getBufferedFeature: function (features, distance) {
            var geometries = array.map(features, function(feature) {
                return feature.geometry;
            });
            var result = geometryEngine.buffer(geometries, [distance], "meters", true);
            return result[0];
        },
        getServerTemplatesFromConfigTemplate: function (userTemplate) {

            var deferred = new Deferred();

            var me = this;
            var map = this.map;

            var serverTemplateNames = [];
            var serverTemplatesFailedNoSelection = [];
            var serverTemplatesFailedOther = [];
            
            var processCount = userTemplate.serverTemplates.length;

            array.forEach(userTemplate.serverTemplates, function(serverTemplate) {

                if (serverTemplate.relationship && serverTemplate.relationship !== "None") {
                    // buffer logic
                    // check selection layer in results

                    var selectionLayerNameOrUrl = serverTemplate.selectionlayer;
                    var targetLayerNameOrUrl = serverTemplate.targetlayer;
                    var targetLayer = me.getLayerByNameOrUrl(targetLayerNameOrUrl);

                    var selectionFeatureSet = me.getCustomFeatureSet(selectionLayerNameOrUrl);
                    if (targetLayer && selectionFeatureSet && selectionFeatureSet.features.length > 0) {

                        // if match, buffer is needed
                        var bufDist = 0;
                        if (serverTemplate.bufferdistance) {
                            bufDist = serverTemplate.bufferdistance;
                        } 
                        var geom = me.getBufferedFeature(selectionFeatureSet.features, bufDist);

                        // perform intersect
                        var intersectDef = me.getIntersectFeatures(geom, targetLayer, serverTemplate.relationship);
                        intersectDef.then(function (features) {
                            // if any results exist, add template
                            if (features.length > 0) {
                                serverTemplateNames.push(serverTemplate.name);
                            }
                            checkDone();
                        }, function (err) {
                            serverTemplatesFailedOther.push(serverTemplate);
                            checkDone();
                        });

                    } else if (!targetLayer) {
                        // no match, don't add template
                        serverTemplatesFailedOther.push(serverTemplate);
                        checkDone();

                    } else {
                        // selection feature set not supplied or layer doesn't match
                        serverTemplatesFailedNoSelection.push(serverTemplate);
                        checkDone();

                    }
                    
                } else {
                    serverTemplateNames.push(serverTemplate.name);
                    checkDone();
                }
            });


            function checkDone() {

                processCount--;

                if (processCount < 1) {
                    deferred.resolve([serverTemplateNames, serverTemplatesFailedNoSelection, serverTemplatesFailedOther]);
                }
            }

            return deferred.promise;

        },
        customPrint: function () {

            var me = this;
            var form = this.printSettingsFormDijit.get('value');

            var userTemplate = null;
            var templateId = form.mxdTemplate;
            array.forEach(me.config.userTemplates, function (t) {
                if (t.id == templateId) { userTemplate = t }
            });

            var templatesDeferred = this.getServerTemplatesFromConfigTemplate(userTemplate);

            templatesDeferred.then(function (arrayOfArrays) {
                var serverTemplateList = arrayOfArrays[0];
                var serverTemplatesFailedNoSelectionList = arrayOfArrays[1];
                var serverTemplatesFailedList = arrayOfArrays[2];

                var errMessage = null;
                
                if (serverTemplatesFailedNoSelectionList.length > 0) {

                    var selectLayerName = serverTemplatesFailedNoSelectionList[0].selectionlayer;
                    
                    errMessage = "No features were selected from layer \"" + selectLayerName +
                        "\". A single selection from this layer is required before a \"" + userTemplate.name + "\" print can be made. ";

                } else if (serverTemplatesFailedList.length > 0) {
                    errMessage = "An error occurred when checking the conditions for printing this template. Please contact the administrator. ";
                }

                if (errMessage) {
                    alert(errMessage);
                } else {
                    me.customPrintAfterTemplatesLoaded(serverTemplateList);
                }
                
            });

        },
        customPrintAfterTemplatesLoaded: function (printTemplate) {

            
            var form = this.printSettingsFormDijit.get('value');
            lang.mixin(form, this.layoutMetadataDijit.get('value'));
            var map = this.map; //map
            var mapTitle = form.title; //gets the user entered map title

            var printLayout = form.layout; //gets the selected print layout
            var outputFormat = form.format; //gets the selected output format
            var printableExtent = map.extent;

            // get quality, values in config will be "low" or "high"
            var printQualityForm = this.printQualityFormDijit.get('value');
            var printQualityValue = this.config.quality[printQualityForm.qualityValue];
            
            var mapScale = map.getScale();
            var includeLegend = false;
            var includeLegendValueObj = this.layoutFormDijit.get('value');

            if (includeLegendValueObj.hasOwnProperty("legend")) {
                if (includeLegendValueObj.legend instanceof Array) {
                    includeLegend = includeLegendValueObj.legend[0];
                    if (includeLegend === undefined) {
                        includeLegend = false;
                    }
                }
            }

            var preserve = this.preserveFormDijit.get('value');
            if (preserve && preserve.preserveScale === 'force') {
                // force user defined scale
                mapScale = preserve.forcedScale;
            } else if (preserve && preserve.preserveScale === "false") {
                // use extent, unset scale
                mapScale = 0;
            }

           
            var textEls = {
                "title": mapTitle,
                "author": form.author,
                "copyright": form.copyright,
            }

            var loadingResult = new printResultDijit({
                count: this.count.toString(),
                icon: (form.format === "PDF") ? this.pdfIcon : this.imageIcon,
                docName: form.title,
                OOTBPrint: false,
                title: form.format + ', ' + form.layout,
                fileHandle: null,
                nls: this.nls
            }).placeAt(this.printResultsNode, 'last');

            loadingResult.startup();


            var printJob = this.printUtil.print(map, printTemplate, printLayout, outputFormat, textEls, printQualityValue, printableExtent, mapScale, null, includeLegend);
            printJob.then(lang.hitch(this, function (printResult) {

                if (loadingResult) {
                    loadingResult.destroy();
                }

                var fileHandleDef = this.handlePrintResult(printResult);
                console.warn(" =======> this should be right at the end");
                var result = new printResultDijit({
                    count: this.count.toString(),
                    icon: (form.format === "PDF") ? this.pdfIcon : this.imageIcon,
                    docName: form.title,
                    OOTBPrint: false,
                    title: form.format + ', ' + form.layout,
                    fileHandle: fileHandleDef,
                    nls: this.nls
                }).placeAt(this.printResultsNode, 'last');

                result.startup();
                domStyle.set(this.clearActionBarNode, 'display', 'block');
                this.count++;

            }), function(err) {
                alert("An error occurred while printing. Please contact the administrator.");

                if (loadingResult) {
                    loadingResult.destroy();
                }

            });
        },
        print: function () {
            if (this.printSettingsFormDijit.isValid()) {
                var form = this.printSettingsFormDijit.get('value');
                lang.mixin(form, this.layoutMetadataDijit.get('value'));
                this.preserve = this.preserveFormDijit.get('value');
                lang.mixin(form, this.preserve);
                this.layoutForm = this.layoutFormDijit.get('value');
                var mapQualityForm = this.mapQualityFormDijit.get('value');
                var mapOnlyForm = this.mapOnlyFormDijit.get('value');
                lang.mixin(mapOnlyForm, mapQualityForm);

                var template = new PrintTemplate();
                template.format = form.format;
                template.layout = form.layout;
                template.preserveScale = (form.preserveScale === 'true' || form.preserveScale === 'force');
                template.label = form.title;
                template.exportOptions = mapOnlyForm;
                template.layoutOptions = {
                    authorText: form.author,
                    copyrightText: form.copyright,
                    legendLayers: (this.layoutForm.legend.length > 0 && this.layoutForm.legend[0]) ?
                      null : [],
                    titleText: form.title
                };
                this.printparams.template = template;
                this.printparams.extraParameters = { // come from source code of jsapi
                    printFlag: true
                };
                var fileHandel = this.printTask.execute(this.printparams);

                var result = new printResultDijit({
                    count: this.count.toString(),
                    icon: (form.format === "PDF") ? this.pdfIcon : this.imageIcon,
                    docName: form.title,
                    title: form.format + ', ' + form.layout,
                    fileHandle: fileHandel,
                    nls: this.nls
                }).placeAt(this.printResultsNode, 'last');
                result.startup();
                domStyle.set(this.clearActionBarNode, 'display', 'block');
                this.count++;
            } else {
                this.printSettingsFormDijit.validate();
            }
        },

        clearResults: function () {
            domConstruct.empty(this.printResultsNode);
            domStyle.set(this.clearActionBarNode, 'display', 'none');
            this.count = 1;
        },

        updateAuthor: function (user) {
            user = user || '';
            if (user) {
                this.authorTB.set('value', user);
            }
        },

        getCurrentMapScale: function () {
            this.forceScaleNTB.set('value', this.map.getScale());
        },
        handlePrintResult: function(resultUrl, err) {
            var deferred = new Deferred();
            if (resultUrl) {
                deferred.resolve({
                    url: resultUrl
                });
            } else {
                deferred.reject(null);
            }
            return deferred.promise;
        }

    });

    // Print result dijit
    var printResultDijit = declare([_WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin], {
        widgetsInTemplate: true,
        templateString: printResultTemplate,
        url: null,
        postCreate: function () {
            this.inherited(arguments);
            if (this.fileHandle) {
                this.fileHandle.then(lang.hitch(this, '_onPrintComplete'), lang.hitch(this, '_onPrintError'));
            }
        },
        _onPrintComplete: function (data) {
            if (data.url) {
                this.url = data.url;
                html.setStyle(this.progressBar.domNode, 'display', 'none');
                html.setStyle(this.successNode, 'display', 'inline-block');
                domClass.add(this.resultNode, "printResultHover");
            } else {
                this._onPrintError(this.nls.printError);
            }
        },
        _onPrintError: function (err) {
            console.log(err);
            html.setStyle(this.progressBar.domNode, 'display', 'none');
            html.setStyle(this.errNode, 'display', 'block');
            domClass.add(this.resultNode, "printResultError");

            html.setAttr(this.domNode, 'title', err.details || err.message || "");
        },
        _openPrint: function () {
            if (this.url !== null) {
                window.open(this.url);
            }
        }
    });
    return PrintDijit;
});