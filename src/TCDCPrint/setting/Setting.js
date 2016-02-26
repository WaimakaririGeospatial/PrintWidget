///////////////////////////////////////////////////////////////////////////
// Copyright © 2014 Esri. All Rights Reserved.
//
// Licensed under the Apache License Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
///////////////////////////////////////////////////////////////////////////

define([

    'dojo/_base/declare',
    'jimu/BaseWidgetSetting',
    'dijit/_WidgetsInTemplateMixin',
    "dojo/_base/lang",
    "dojo/_base/array",
    'dojo/on',
    'dojo/query',
    'dojo/aspect',
    'dojo/Deferred',
    'dojo/json',
    'dojo/Deferred',
    "dojo/dom-style",
    "dojo/dom-attr",
    "dojo/dom-class",
    "dojo/dom-construct",
    "esri/request",
    'jimu/dijit/Message',
    "jimu/dijit/Popup",
    "jimu/dijit/LoadingShelter",
    "jimu/CustomUtils/SimpleTable",
    'jimu/portalUtils',
    'jimu/portalUrlUtils',
    'jimu/utils',
    "dojo/store/Memory",
    "dojo/data/ObjectStore",
    '../PrintUtil',
    'dijit/form/Select'

    

], function (

    declare,
    BaseWidgetSetting,
    _WidgetsInTemplateMixin,
    lang,
    array,
    on,
    dojoQuery,
    aspect,
    Deferred,
    dojoJSON,
    Deferred,
    domStyle,
    domAttr,
    domClass,
    domConstruct,
    esriRequest,
    Message,
    Popup,
    LoadingShelter,
    SimpleTable,
    portalUtils,
    portalUrlUtils,
    utils,
    Memory,
    ObjectStore,
    PrintUtil,
    Select) {

    return declare([BaseWidgetSetting, _WidgetsInTemplateMixin], {

        baseClass: 'jimu-widget-print-setting',
        _printUtil: null,
        _currentUserSetServiceUrl: null,
        _loadingShelter: null,
        _validServerTemplatesList: [],
        _userTemplateEditTable: null,
        _userTemplateData: [],
        _currentSelectedUserTemplate: null,
        _serverTemplateEditTable: null,

        startup: function () {

            var me = this;
            this.inherited(arguments);
            this.setLoadingShelter(false);
            me._printUtil = new PrintUtil();
            this.setConfig(this.config);
            
            on(this.serviceURL, 'keyup', function (keyEvent) {
                // if service URL has been changed, recalculate template lists and redraw UI
                var newUrl = me.serviceURL.getValue();
                if (newUrl && newUrl.toLowerCase() !== me._currentUserSetServiceUrl.toLowerCase()) {
                    me._currentUserSetServiceUrl = newUrl;
                    me.onUrlChange();
                }

            });

            on(this.addUserTemplateDiv, 'click', function (ev) {
                me.userTemplateTableAddRow();
            });

            on(this.addServerTemplateDiv, 'click', function (ev) {
                if (me._currentSelectedUserTemplate) {
                    me.serverTemplateTableAddRow(null, me._currentSelectedUserTemplate);

                } else {
                    alert("Select a user template before adding server templates");
                }

            });


        },
        setLoadingShelter: function(loading) {
            
            if (!this._loadingShelter) {
                var shelter = new LoadingShelter({
                    hidden: true
                });
                shelter.placeAt(this.mainSection || this.domNode);
                shelter.startup();
                shelter.show();
                this._loadingShelter = shelter;

            }
            if (loading) {
                this._loadingShelter.show();
            } else {
                this._loadingShelter.hide();
            }

        },
        setErrorMessage: function(error) {
            
            if (error) {
                domClass.remove(this.errorDiv, "gone");
                domClass.add(this.mainSection, "gone");
            } else {
                domClass.add(this.errorDiv, "gone");
                domClass.remove(this.mainSection, "gone");
            }

        },
        setConfig: function (config) {

            var urlToSet = config.serviceURL;
            if (!urlToSet) {
                urlToSet = "";
            }
            this._currentUserSetServiceUrl = urlToSet;
            this.serviceURL.setValue(urlToSet);
            
            var qualLowVal = config.quality.low;
            var qualHighVal = config.quality.high;
            if (!qualLowVal || isNaN(qualLowVal)) {
                qualLowVal = 96;
            }
            if (!qualHighVal || isNaN(qualHighVal)) {
                qualHighVal = 150;
            }

            this.qualityHighInput.setValue(qualHighVal);
            this.qualityLowInput.setValue(qualLowVal);

            this._userTemplateData = this.config.userTemplates;

            this.defaultTitleInput.setValue(this.config.defaultTitle);
            this.maxTitleLengthInput.setValue(this.config.maxTitleLength);
            this.defaultAuthorInput.setValue(this.config.defaultAuthor);
            this.defaultCopyrightInput.setValue(this.config.defaultCopyright);

            this.onUrlChange();

        },
        getConfig: function () {

            this.config.serviceURL = this.serviceURL.getValue();
            
            var cleanUserTemplateData = array.filter(this._userTemplateData, function(userTemplate) {
                return ((userTemplate.hasOwnProperty("deleted") === false) || !(userTemplate.deleted));
            });

            this.config.userTemplates = cleanUserTemplateData;

            var qualHighVal = this.qualityHighInput.getValue();
            var qualLowVal = this.qualityLowInput.getValue();

            if (!qualHighVal || !qualLowVal || isNaN(qualHighVal) || isNaN(qualLowVal)) {
                qualHighVal = "150";
                qualLowVal = "96";
            }

            this.config.quality = {
                "low": Number(qualLowVal),
                "high": Number(qualHighVal)
            }

            // some items have not been UI'd yet
            this.config.formats = [{
                    "label": "PDF",
                    "value": "PDF",
                    "isDefault": true
                },
                {
                    "label": "JPG",
                    "value": "JPG"
                },
                {
                    "label": "PNG",
                    "value": "PNG"
                }
            ];

            this.config.defaultTitle = this.defaultTitleInput.getValue();
            this.config.maxTitleLength = this.maxTitleLengthInput.getValue();
            this.config.defaultAuthor = this.defaultAuthorInput.getValue();
            this.config.defaultCopyright = this.defaultCopyrightInput.getValue();

            return this.config;

        },
        onUrlChange: function () {

            this.setLoadingShelter(true);
            this.setErrorMessage(false);

            var me = this;

            var printUtil = this._printUtil;
            printUtil.setServiceUrl(this._currentUserSetServiceUrl);
            printUtil.getTemplates().then(function (result) {

                var serverTemplates = result;
                me._validServerTemplatesList = array.map(serverTemplates, function(item) {
                    return {
                        id: item,
                        label: item
                    }
                });
                me.onUrlChangeSuccess();

            }, function (err) {

                me.onUrlChangeError();
            });

        },
        onUrlChangeError: function() {
            this.setLoadingShelter(false);
            this.setErrorMessage(true);

        },
        onUrlChangeSuccess: function() {
            this.setLoadingShelter(false);
            this.updateUi();
            
        },
        updateUi: function () {
            this.refreshUserTemplateTableUi();

        },
        refreshUserTemplateTableUi: function () {

            var me = this;

            var fields = [{
                name: 'id',
                title: 'id',
                type: 'text',
                unique: true,
                hidden: true
            },
            {
                name: 'name',
                title: 'Name',
                type: 'text',
                unique: false,
                hidden: false,
                editable: true
            }, {
                name: 'templateDropdown',
                title: 'Template',
                type: 'empty',
                hidden: true
            }, {
                name: 'action',
                title: "",
                type: 'actions',
                width: '40px',
                "class": "actions",
                actions: ["edit", "delete"]
            }];
            var args = {
                autoHeight: true,
                fields: fields,
                selectable: true
            };
            domConstruct.empty(this.userTemplateListContainer);
            if (this._userTemplateEditTable) {
                this._userTemplateEditTable.destroy();
            }

            this._userTemplateEditTable = new SimpleTable(args);
            this._userTemplateEditTable.placeAt(this.userTemplateListContainer);

            this.own(on(this._userTemplateEditTable, 'actions-edit', lang.hitch(this, function (row) {
                me._userTemplateEditTable.finishEditing();
                var data = me._userTemplateEditTable.getRowData(row);
                me._userTemplateEditTable.editRow(row, data);
            })));

            aspect.before(this._userTemplateEditTable, 'deleteRow', function (row) {
                var data = me._userTemplateEditTable.getRowData(row);
                var userTemplate = me.getUserTemplate(data.id);
                userTemplate.deleted = true;
            });

            this.own(on(this._userTemplateEditTable, 'row-select', lang.hitch(this, function (htmlNode) {

                function showAddLabelContainer(templateName) {
                    var serverTemplateTableLabel = "Add Server Templates to " + templateName;
                    me.addServerTemplateDiv.innerText = serverTemplateTableLabel;
                    domClass.remove(me.addServerTemplateDivContainer, "hidden");
                }

                var data = me._userTemplateEditTable.getRowData(htmlNode);
                var userTemplate = this.getUserTemplate(data.id);
                this._currentSelectedUserTemplate = userTemplate;
                showAddLabelContainer(userTemplate.name);
                this.updateUiServerTemplateTable(userTemplate); 
            })));

            // refresh table with user template data
            for (var a = 0; a < this._userTemplateData.length; a++) {
                var userTemplateObj = this._userTemplateData[a];
                userTemplateObj.id = userTemplateObj.id.toString();
                this.userTemplateTableAddRow(userTemplateObj);
            }

        },
        userTemplateTableAddRow: function (data) {
            var me = this;

            // add from existing config or add a new row
            var newRow = !data;
            if (newRow) {
                var nextId = this.getNextUserTemplateId();
                data = {
                    "id": nextId.toString(),
                    "name": "",
                    "serverTemplates": []

                };
                // add user template to data
                this._userTemplateData.push(data);
            }

            var rowAddResult = this._userTemplateEditTable.addRow(data, false);
            var row = rowAddResult.tr;

            // if a new row, edit afterwards
            if (newRow) {
                this._userTemplateEditTable.editRow(row, data);
            }

            var editableInputs = dojoQuery("input", row.cells[1]);
            if (editableInputs.length > 0) {
                on(editableInputs[0], "blur", function (event) {
                    var data = me._userTemplateEditTable.getRowData(row);
                    var userTemplateItem = me.getUserTemplate(data.id);
                    userTemplateItem.name = data.name;
                });
            }
        },
        updateUiServerTemplateTable: function (userTemplate) {
            
            var me = this;

            if (this._serverTemplateEditTable) {
                this._serverTemplateEditTable.destroy();
            }
            domConstruct.empty(this.serverTemplateListContainer);

            function getValueFromSelectCell(td) {
                var val = null;
                if (td.customSelect) {
                    val = td.customSelect.getValue();
                } else if (td.childNodes && td.childNodes[0].textContent) {
                    val = td.childNodes && td.childNodes[0].textContent;
                }
                return val;
            }

            function setValueFromSelectCell(td) {

            }

            var fields = [{
                name: 'id',
                title: 'id',
                type: 'text',
                unique: true,
                hidden: true
            }, {
                name: 'name',
                title: 'Name',
                type: 'extension',
                unique: false,
                hidden: false,
                editable: true,
                getValue: getValueFromSelectCell,
                setValue: setValueFromSelectCell
            }, {
                name: 'relationship',
                title: 'Spatial Rel',
                type: 'extension',
                unique: false,
                hidden: false,
                getValue: getValueFromSelectCell,
                setValue: setValueFromSelectCell
            }, {
                name: 'selectionlayer',
                title: 'Layer',
                type: 'text',
                editable: true,
                unique: false,
                hidden: false
            }, {
                name: 'targetlayer',
                title: 'Target Layer',
                type: 'text',
                editable: true,
                unique: false,
                hidden: false
            }, {
                name: 'bufferdistance',
                title: 'Buffer Dist',
                type: 'text',
                editable: true,
                unique: false,
                hidden: false
            },
            {
                name: 'action',
                title: "",
                type: 'actions',
                width: '40px',
                "class": "actions",
                actions: ["edit", "delete"]
            }];
            var args = {
                autoHeight: true,
                fields: fields,
                selectable: true
            };
            
            this._serverTemplateEditTable = new SimpleTable(args);
            this._serverTemplateEditTable.placeAt(this.serverTemplateListContainer);
            this._serverTemplateEditTable.startup();
            

            this.own(on(this._serverTemplateEditTable, 'actions-edit', lang.hitch(this, function (row) {
                var rowData = me._serverTemplateEditTable.getRowData(row);
                var data = this.getServerTemplateItemById(rowData.id);

                me.refreshServerTemplateTableCell(row, data, false, true);
                
            })));

            this.own(on(this._serverTemplateEditTable, 'row-select', lang.hitch(this, function (row) {
                
            })));

            aspect.before(this._serverTemplateEditTable, 'deleteRow', function (row) {
                var data = me._serverTemplateEditTable.getRowData(row);
                me.updateServerTemplateItem(data, true);
            });


            // refresh table with user template data
            if (userTemplate && userTemplate.serverTemplates) {
                for (var a = 0; a < userTemplate.serverTemplates.length; a++) {
                    var serverTemplateObj = userTemplate.serverTemplates[a];
                    var addedNode = this.serverTemplateTableAddRow(serverTemplateObj, userTemplate);

                    // for text fields, listen to lose focus
                    var td = addedNode.tr.cells[3];
                    //var editableDiv = query('div', td)[0];
                    //editableDiv.innerHTML = fieldData || "";

                    var editableInputs = dojoQuery('input', td);
                    if (editableInputs.length > 0) {
                        var editableInput = editableInputs[0];
                        on(editableInput, "blur", function (node) {
                            var data = me._serverTemplateEditTable.getRowData(this.parentNode.parentNode);
                            me.updateServerTemplateItem(data, false);
                        });
                    }    
                }

            }

        },
        serverTemplateTableAddRow: function (data, userTemplate) {

            var me = this;

            function getNewId() {
                var newId = 0;
                for (var a = 0; a < userTemplate.serverTemplates.length; a++) {
                    // get unique id for server template
                    var serverTemplate = userTemplate.serverTemplates[a];
                    var existingId = Number(serverTemplate.id);
                    if (newId <= existingId) {
                        newId += 1;
                    }
                }
                return newId;
            }

            // add from existing config or add a new row
            var newRow = !data;
            if (newRow) {
                var newId = getNewId();
                data = {
                    "id": newId,
                    "conditiontype": null,
                    "relationship": "None",
                    "selectionlayer": "",
                    "targetlayer": "",
                    "bufferdistance": ""
                };
            }

            // id it a text field
            data.id = data.id.toString();
            var htmlNode = this._serverTemplateEditTable.addRow(data);

            var nameCell = htmlNode.tr.cells[1];
            var spatialRelCell = htmlNode.tr.cells[2];
            var selectLayerCell = htmlNode.tr.cells[3];
            var targetLayerCell = htmlNode.tr.cells[4];
            var buffDistCell = htmlNode.tr.cells[5];

            // get all inputs, listen for lose focus, and update data at this point
            var inputs = dojoQuery("input", htmlNode.tr);
            inputs.forEach(function(inputNode) {
                on(inputNode, "blur", function(ev) {
                    var rowData = me._serverTemplateEditTable.getRowData(htmlNode.tr);
                    me.updateServerTemplateItem(rowData, false);
                });
            });
            

            // if adding a new row, we want to edit straight away
            // set makeEditable to true
            this.refreshServerTemplateTableCell(htmlNode.tr, data, newRow, false);

            return htmlNode;

        },
        updateServerTemplateItem: function (data, forDelete) {
            var me = this;

            if (this._currentSelectedUserTemplate) {
                var serverTemplateItem = this.getServerTemplateItemById(data.id);
                var serverTemplateItemIndex = array.indexOf(this._currentSelectedUserTemplate.serverTemplates, serverTemplateItem);
                if (serverTemplateItem) {
                    if (forDelete) {
                        this._currentSelectedUserTemplate.serverTemplates.splice(serverTemplateItemIndex, 1);
                    } else {
                        serverTemplateItem.name = data.name;
                        serverTemplateItem.conditiontype = data.conditiontype;
                        serverTemplateItem.relationship = data.relationship;
                        serverTemplateItem.bufferdistance = data.bufferdistance;
                        serverTemplateItem.selectionlayer = data.selectionlayer;
                        serverTemplateItem.targetlayer = data.targetlayer;

                    }
                } else if (!forDelete) {
                    // if item does not already exist, and we're not deleting, add it
                    this._currentSelectedUserTemplate.serverTemplates.push(data);
                }
            }
        },
        refreshServerTemplateTableCell: function (htmlNode, data, makeTemplateNameEditable, makeSpatialRelEditable, makeConditionFieldsEditable) {

            var me = this;
            me._serverTemplateEditTable.finishEditing();

            var nameCell = htmlNode.cells[1];
            var spatialRelCell = htmlNode.cells[2];
            var selectLayerCell = htmlNode.cells[3];
            var targetLayerCell = htmlNode.cells[4];
            var buffDistCell = htmlNode.cells[5];

            domConstruct.empty(nameCell);
            domConstruct.empty(spatialRelCell);

            if (makeTemplateNameEditable) {
                var store = new Memory({
                    data: me._validServerTemplatesList
                });
                var os = new ObjectStore({ objectStore: store });

                var templatesComboBox = new Select({
                    store: os,
                    onChange: function (val) {
                        // update back to user template, also update cell
                        var data = me._serverTemplateEditTable.getRowData(htmlNode);
                        data.name = val;
                        me.updateServerTemplateItem(data);
                        me.refreshServerTemplateTableCell(htmlNode, data, false, false);
                    }
                });

                domConstruct.place(templatesComboBox.domNode, nameCell);
                nameCell.customSelect = templatesComboBox;

            } else {
                if (nameCell.customSelect) {
                    nameCell.customSelect.destroy();
                }
                domConstruct.place('<div>' + data.name + '</div>', nameCell);
            }

            if (makeSpatialRelEditable) {

                var isAlreadyIntersect = false;
                if (data.relationship &&
                    data.relationship === "SPATIAL_REL_INTERSECTS") {
                    isAlreadyIntersect = true;
                }

                var relOptions = [
                    { label: "None", value: "None", selected: !isAlreadyIntersect },
                    { label: "Intersect", value: "SPATIAL_REL_INTERSECTS", selected: isAlreadyIntersect }
                ];

                var spatialRelSelect = new Select({
                    options: relOptions,
                    onChange: function(val) {
                        // update back to user template, also update cell                        
                        var data = me._serverTemplateEditTable.getRowData(htmlNode);
                        if (val === "None") {
                            data.relationship = "None";
                            me.updateServerTemplateItem(data);
                            me.refreshServerTemplateTableCell(htmlNode, data, false, false, false);
                            
                        } else {
                            data.relationship = "SPATIAL_REL_INTERSECTS";
                            me.updateServerTemplateItem(data);
                            me.refreshServerTemplateTableCell(htmlNode, data, false, false, true);
                        }
                    }

                });

                spatialRelCell.customSelect = spatialRelSelect;
                domConstruct.place(spatialRelSelect.domNode, spatialRelCell);

                if (isAlreadyIntersect) {
                    me._serverTemplateEditTable.editRow(htmlNode, data);
                }
                
            } else {
                var spatRelateLabel = "None";
                if (data.relationship && data.relationship === "SPATIAL_REL_INTERSECTS") {
                    spatRelateLabel = "Intersect";
                }
                if (spatialRelCell.customSelect) {
                    spatialRelCell.customSelect.destroy();
                }
                domConstruct.place('<div>' + spatRelateLabel + '</div>', spatialRelCell);
            }

            // make others editable too
            if (makeConditionFieldsEditable) {
                me._serverTemplateEditTable.editRow(htmlNode, data);
            }

        },
        getServerTemplateItemById: function(id) {

            var me = this;
            for (var a = 0; a < me._currentSelectedUserTemplate.serverTemplates.length; a++) {
                var st = me._currentSelectedUserTemplate.serverTemplates[a];
                if (st.id == id) {
                    return st;
                }
            }
            return null;
        },
        getUserTemplateByName: function (name) {
            var userTemplateMatch = null;
            if (this._userTemplateData) {
                for (var a = 0; a < this._userTemplateData.length; a++) {
                    var userTemplate = this._userTemplateData[a];
                    if (userTemplate.name.toLowerCase() === name.toLowerCase()) {
                        userTemplateMatch = userTemplate;
                        break;
                    }
                }
            }
            return userTemplateMatch;
        },
        getUserTemplate: function (id) {
            var userTemplateMatch = null;
            if (this._userTemplateData) {
                for (var a = 0; a < this._userTemplateData.length; a++) {
                    var userTemplate = this._userTemplateData[a];
                    if (userTemplate.id == id) {
                        userTemplateMatch = userTemplate;
                        break;
                    }
                }
            }
            return userTemplateMatch;
        },
        getNextUserTemplateId: function () {

            var newId = 0;
            if (this._userTemplateData) {
                for (var a = 0; a < this._userTemplateData.length; a++) {
                    var template = this._userTemplateData[a];
                    if (Number(template.id) >= newId) {
                        newId = Number(template.id) + 1;
                    }
                }
            }
            return newId;
        },





    });
});