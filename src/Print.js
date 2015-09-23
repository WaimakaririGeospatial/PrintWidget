define([
  'dojo/_base/declare',
  'dijit/_WidgetBase',
  'dijit/_TemplatedMixin',
  'dijit/_WidgetsInTemplateMixin',
  'esri/tasks/PrintTask',
  "esri/tasks/PrintParameters",
  "esri/tasks/PrintTemplate",
  "esri/request",
  'dojo/_base/lang',
  'dojo/_base/array',
  'dojo/_base/html',
  'dojo/Deferred',
  'dojo/dom-style',
  'dojo/dom-construct',
  'dojo/dom-class',
  'dojo/json',
  'jimu/portalUrlUtils',
  'dojo/text!./templates/Print.html',
  'dojo/text!./templates/PrintResult.html',
  'dojo/aspect',
  'jimu/dijit/LoadingShelter',
  'jimu/dijit/Message',
   'jimu/utils',
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
  lang,
  array,
  html,
  Deferred,
  domStyle,
  domConstruct,
  domClass,
  dojoJSON,
  portalUrlUtils,
  printTemplate,
  printResultTemplate,
  aspect,
  LoadingShelter,
  Message, utils, PrintUtil) {
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
        defaultFormat: null,
        defaultMXDTemplate: null,
        defaultLayout: null,
        customPrintConfig: {},
        baseClass: "gis_PrintDijit",
        pdfIcon: require.toUrl("./widgets/PrintWidget/images/pdf.png"),
        imageIcon: require.toUrl("./widgets/PrintWidget/images/image.png"),
        printTaskURL: null,
        printTask: null,
        async: false,
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
            this.shelter.show();

            this.titleNode.set('value', this.defaultTitle);
            this.authorNode.set('value', this.defaultAuthor);
            this.copyrightNode.set('value', this.defaultCopyright);

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
            this.mxdTemplateDijit.on("change", lang.hitch(this, this._updateLayoutValues));
        },
        _updateLayoutValues: function (_v) {
            if (_v) {
                var layoutValues = this.customPrintConfig.mxdTemplate.layoutMapping[_v];
                var layoutObjList = array.map(layoutValues, function (item) {
                    return {
                        label: item,
                        value: item
                    };
                });
                layoutObjList.sort(function (a, b) {
                    return (a.label > b.label) ? 1 : ((b.label > a.label) ? -1 : 0);
                });
                this.layoutDijit.set("options", layoutObjList);
                if (this.defaultLayout && this.defaultMXDTemplate === _v) {
                    this.layoutDijit.set('value', this.defaultLayout);
                } else if (layoutObjList[0]) {
                    this.layoutDijit.set('value', layoutObjList[0].value);
                }else {
                    this.layoutDijit.set('value', "");
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
                    domStyle.set(this.mxdTemplateDijit.domNode.parentNode.parentNode, 'display', 'none');
                    domStyle.set(this.advancedButtonDijit.domNode, 'display', 'none');
                } else {
                    this._handleError(err);
                }
                return;
            }

            domStyle.set(this.layoutDijit.domNode.parentNode.parentNode, 'display', '');
            domStyle.set(this.formatDijit.domNode.parentNode.parentNode, 'display', '');
            domStyle.set(this.mxdTemplateDijit.domNode.parentNode.parentNode, 'display', '');
            domStyle.set(this.advancedButtonDijit.domNode, 'display', '');


            //1.Format
            var formatConfig = array.filter(data.parameters, function (param) {
                return param.name === "Format";
            })[0];
            if (formatConfig && this.customPrintConfig.format) {
                lang.mixin(formatConfig, this.customPrintConfig.format);
            } else if (this.customPrintConfig.format) {
                formatConfig = this.customPrintConfig.format;
            } else if (!formatConfig && !this.customPrintConfig.format) {
                console.log("print service parameters name for templates must be \"Format\"");
                return;
            }

            var formatItems = array.map(formatConfig.choiceList, function (item) {
                return {
                    label: item,
                    value: item
                };
            });
            formatItems.sort(function (a, b) {
                if (a && b) {
                    return (a.label > b.label) ? 1 : ((b.label > a.label) ? -1 : 0);
                }
            });
            this.formatDijit.addOption(formatItems);
            if (this.defaultFormat) {
                this.formatDijit.set('value', this.defaultFormat);
            } else {
                this.formatDijit.set('value', formatConfig.defaultValue);
            }


            //2.Layout Template
            var layoutConfig = array.filter(data.parameters, function (param) {
                return param.name === "Layout_Template";
            })[0];
            if (layoutConfig && this.customPrintConfig.layout) {
                lang.mixin(layoutConfig, this.customPrintConfig.layout);
            } else if (this.customPrintConfig.layout) {
                layoutConfig = this.customPrintConfig.layout;
            } else if (!layoutConfig && !this.customPrintConfig.layout) {
                console.log("print service parameters name for templates must be \"Layout_Template\"");
                return;
            }

            var layoutItems = array.map(layoutConfig.choiceList, function (item) {
                return {
                    label: item,
                    value: item
                };
            });
            layoutItems.sort(function (a, b) {
                if (a && b) {
                    return (a.label > b.label) ? 1 : ((b.label > a.label) ? -1 : 0);
                }

            });
            this.layoutDijit.addOption(layoutItems);
            if (this.defaultLayout) {
                this.layoutDijit.set('value', this.defaultLayout);
            } else {
                this.layoutDijit.set('value', layoutConfig.defaultValue);
            }


            //3.MXD Template 
            var mxdConfig = array.filter(data.parameters, function (param) {
                return param.name === "MXD_Template";
            })[0];
            if (mxdConfig && this.customPrintConfig.mxdTemplate) {
                lang.mixin(mxdConfig, this.customPrintConfig.mxdTemplate);
            } else if (this.customPrintConfig.mxdTemplate) {
                mxdConfig = this.customPrintConfig.mxdTemplate;
            } else if (!mxdConfig && !this.customPrintConfig.mxdConfig) {
                console.log("print service parameters name for templates must be \"MXD_Template\"");
                return;
            }


            var mxdItems = array.map(mxdConfig.choiceList, function (item) {
                return {
                    label: item,
                    value: item
                };
            });
            mxdItems.sort(function (a, b) {
                if (a && b) {
                    return (a.label > b.label) ? 1 : ((b.label > a.label) ? -1 : 0);
                }
            });
            this.mxdTemplateDijit.addOption(mxdItems);
            if (this.defaultMXDTemplate) {
                this.mxdTemplateDijit.set('value', this.defaultMXDTemplate);
            } else {
                this.mxdTemplateDijit.set('value', mxdConfig.defaultValue);
            }




        },

        print: function () {
            if (this.isOOTBPrint) {
                this.OOTBPrint();
            } else {
                this.customPrint();
            }
        },
        customPrint:function(){
            var me = this;
            var printUtil = new PrintUtil();
            var form = this.printSettingsFormDijit.get('value');
            lang.mixin(form, this.layoutMetadataDijit.get('value'));
            var map = this.map; //map
            var mapTitle = form.title; //gets the user entered map title
            var printTemplate = form.mxdTemplate; //gets the selected template
            var printLayout = form.layout; //gets the selected print layout
            var outputFormat = form.format; //gets the selected output format
            var printableExtent = map.extent;
            var printQualityValue = this.mapQualityFormDijit.get('value').dpi;
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

            printUtil.setServiceUrl(this.printTaskURL);
            var textEls = {
                "title": mapTitle,
                "author": form.author,
                "copyright": form.copyright,
            }
            var printDeferred = printUtil.print(map, printTemplate, printLayout, outputFormat, textEls, printQualityValue, printableExtent, mapScale, null, includeLegend);

            var result = new printResultDijit({
                count: this.count.toString(),
                icon: (form.format === "PDF") ? this.pdfIcon : this.imageIcon,
                docName: form.title,
                OOTBPrint:false,
                title: form.format + ', ' + form.layout,
                fileHandle: printDeferred,
                nls: this.nls
            }).placeAt(this.printResultsNode, 'last');
            result.startup();
            domStyle.set(this.clearActionBarNode, 'display', 'block');
            this.count++;
        },
        OOTBPrint: function () {
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
                template.template = form.mxdTemplate;
                template.preserveScale = (form.preserveScale === 'true' || form.preserveScale === 'force');
                template.label = form.title;
                template.exportOptions = mapOnlyForm;
                template.layoutOptions = {
                    authorText: form.author,
                    copyrightText: form.copyright,
                    legendLayers: (this.layoutForm.legend.length > 0 && this.layoutForm.legend[0]) ?
                      null : [],
                    titleText: form.title //,
                    //scalebarUnit: this.layoutForm.scalebarUnit
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
                    OOTBPrint:true,
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
        }
    });

    // Print result dijit
    var printResultDijit = declare([_WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin], {
        widgetsInTemplate: true,
        templateString: printResultTemplate,
        url: null,
        OOTBPrint:false,
        postCreate: function () {
            this.inherited(arguments);
            this.fileHandle.then(lang.hitch(this, '_onPrintComplete'), lang.hitch(this, '_onPrintError'));
        },
        _onPrintComplete: function (data) {
            if (this.OOTBPrint) {
                if (data.url) {
                    this.url = data.url;
                    html.setStyle(this.progressBar.domNode, 'display', 'none');
                    html.setStyle(this.successNode, 'display', 'inline-block');
                    domClass.add(this.resultNode, "printResultHover");
                } else {
                    this._onPrintError(this.nls.printError);
                }
            } else {
                var urlPattern = new RegExp("^http");
                if (urlPattern.test(data)) {
                    this.url = data;
                    html.setStyle(this.progressBar.domNode, 'display', 'none');
                    html.setStyle(this.successNode, 'display', 'inline-block');
                    domClass.add(this.resultNode, "printResultHover");
                } else {
                    this._onPrintError(this.nls.printError);
                }
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