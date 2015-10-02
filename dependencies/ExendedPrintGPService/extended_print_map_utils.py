# helper functions to work with the Auckland Council 10.2 print service for Portal
# David Aalbers, Geographic Information Systems, 18/7/14
#
from os import path, listdir
from os.path import join
from arcpy import mapping
import uuid


def processTextElements(mapDoc, textElementDict):
    # iterates through a dictionary provided by client
    # if an item key matches an element name in mxd, set text to the item value
    mapTextElements = mapping.ListLayoutElements(mapDoc, "TEXT_ELEMENT")
    for key, value in textElementDict.items():
        for mapTextElement in mapTextElements:
            if mapTextElement.name.lower() == key.lower():
                #value = value.encode('ascii','ignore')
                if value is None or value == "":
                    value = " "
                mapTextElement.text = value
                break


def _getParentOperationalLayerObject(webmap, longLayerId, logFunction = None):

    parentId = longLayerId.split("\\")[0]
    parentObj = _getOperationalLayerObject(webmap, parentId, logFunction)
    return parentObj

def _getOperationalLayerObject(webmap, layerId, logFunction = None):

    if logFunction:
        logFunction("_getOperationalLayerObject: Searching webmap JSON for match: " + layerId)

    resultObj = None
    jsonOperLayerObjs = webmap["operationalLayers"]
    for jsonOperLayerObj in jsonOperLayerObjs:
        jsonObjLayerId = jsonOperLayerObj["id"]

        jsonObjLayerTitle = None
        if "title" in jsonOperLayerObj:
             jsonObjLayerTitle = jsonOperLayerObj["title"]

        if layerId == jsonObjLayerId:
            resultObj = jsonOperLayerObj
            break
        elif layerId == jsonObjLayerTitle:
            resultObj = jsonOperLayerObj
            break

    return resultObj


def _getVisibleLayersFromIdInWebmap(webmap, layerId):
    jsonOperLayerObj = _getOperationalLayerObject(webmap, layerId)
    if jsonOperLayerObj:
        if "visibleLayers" in jsonOperLayerObj:
            visLayers = jsonOperLayerObj["visibleLayers"]
            return visLayers
    return None


def _getLayerUrlFromIdInWebmap(webmap, layerId):

    jsonOperLayerObj = _getOperationalLayerObject(webmap, layerId)
    if jsonOperLayerObj:
        if "url" in jsonOperLayerObj:
            returnUrl = jsonOperLayerObj["url"]
            returnUrl = returnUrl.split("?")[0]
            return returnUrl
    return None


def _getRelativeServicePathFromUrl(url):
    # get the relative map service name
    # this name will be used for the substitution mxd

    relUrlArr = url.lower().split("/arcgis/rest/services/")
    relUrl = relUrlArr[-1]

    if relUrl[-1] == "/":
        relUrl = relUrl[0:-1]
    if _getLayerIndexFromUrl(relUrl) > -1:
        relUrlArr2 = relUrl.split("/")
        relUrl = "/".join(relUrlArr2[0:-1])

    relUrl = relUrl.replace("/mapserver/", "")
    relUrl = relUrl.replace("/mapserver", "")
    relUrl = relUrl.replace("/featureserver/", "")
    relUrl = relUrl.replace("/featureserver", "")

    mxdName = relUrl.split("/")[-1]
    return relUrl

def _getLayerIndexFromUrl(url):
    i = -1
    # strip sole slash of end if exists
    if url[-1] == "/":
        url = url[0:-1]

    # get index from end of url
    possibleIndex = url.split("/")[-1]
    try:
        i = int(possibleIndex)
    except Exception as ex:
        pass

    return i


def findSubstituteMxd(layerUrl, substitutePath, alternatives, logFunction):

    returnPath = None

    possibleMxdRelPath = _getRelativeServicePathFromUrl(layerUrl)
    possibleMxdOrLayerPath = path.join(substitutePath, possibleMxdRelPath + ".mxd")

    splPath = possibleMxdRelPath.split("/")
    mxdName = splPath[-1]
    mxdFolder = "/".join(splPath[:-1])

    logFunction("Searching for substitute layer: ")
    logFunction(possibleMxdOrLayerPath)

    if path.isfile(possibleMxdOrLayerPath):
        returnPath = possibleMxdOrLayerPath

    else:
        checkFolders = []
        for altPathArr in alternatives:
            matchPath = altPathArr[0]
            altPath = altPathArr[1]

            if str(matchPath).lower() == mxdFolder.lower():
                altFile = path.join(substitutePath, altPath, mxdName + ".mxd")
                logFunction("Searching alternative: ")
                logFunction(altFile)
                if path.isfile(altFile):
                    returnPath = altFile
                    break

    return returnPath

def warnIfRasterising(layer, logFunction):
    try:
        if layer.isRasterizingLayer:
            logFunction("WARNING: layer will cause rasterisation of output:")
            logFunction(layer.name)
    except Exception as ex:
        pass


def getAddLayers(subLayers, visLayerArray):
    # gets required layers for copying to another dataframe
    # using arcpy listLayer iteration, children of group layers can be added twice

    returnLayers = []

    currentGroupLayer = ""
    for subLayerIndex, subLayer in enumerate(subLayers):

        if subLayer.isGroupLayer:
            currentGroupLayer = subLayer.longName
            returnLayers.append(subLayer)
        else:
            if currentGroupLayer and currentGroupLayer in subLayer.longName:
                # already included as a group layer
                pass
            else:
                currentGroupLayer = ""
                returnLayers.append(subLayer)

        # process layer visibility
        # if not supplied leave as default visibility
        if visLayerArray is not None:
            if subLayerIndex in visLayerArray or subLayer.isGroupLayer:
                subLayer.visible = True
            else:
                subLayer.visible = False

    return returnLayers


def _includeLayerInLegend(legendAddLayer, layerIndexInt, excludeLayers, webmapObj, logFunction):

    #logFunction("Checking legend layer " + str(layerIndexInt) + ": " + legendAddLayer.longName)
    shouldAdd = True
    try:
        if legendAddLayer.isRasterLayer:
            logFunction("RemoveLayers: Raster layer found, skipping: " + legendAddLayer.name)
            shouldAdd = False
    except Exception as ex:
        logFunction("RemoveLayers: Unable to check if layer is raster: " + legendAddLayer.name)

    layerWebmapObj = _getOperationalLayerObject(webmapObj, legendAddLayer.name)
    parentLayerWebmapObj = _getParentOperationalLayerObject(webmapObj, legendAddLayer.longName)

    if layerWebmapObj and "showLegend" in layerWebmapObj:
        if layerWebmapObj["showLegend"] is False or layerWebmapObj["showLegend"] == 'false':
            logFunction("RemoveLayers: Map service layer excluded in webmap setting: " + legendAddLayer.longName)
            shouldAdd = False
    elif parentLayerWebmapObj:
        if "layers" in parentLayerWebmapObj:
            for layerVisObj in parentLayerWebmapObj["layers"]:
                if layerVisObj["id"] == layerIndexInt:
                    if "showLegend" in layerVisObj and layerVisObj["showLegend"] == False:
                        logFunction("RemoveLayers: Sublayer excluded in webmap setting: " + legendAddLayer.longName)
                        shouldAdd = False

    for excludeNameMatch in excludeLayers:
        if excludeNameMatch == legendAddLayer.name:
            logFunction("RemoveLayers: Layer excluded through print config: " + legendAddLayer.name)
            shouldAdd = False
            break
        elif excludeNameMatch[-1] == "*":
            match = "".join(excludeNameMatch[:-1])
            if legendAddLayer.name.find(match) > -1:
                # wildcard match found
                logFunction("RemoveLayers: Layer excluded through print config: " + legendAddLayer.name)
                shouldAdd = False
                break
    return shouldAdd


def removeLayers(mapDoc, removeFromLegendOnly, excludeLayers, removeRasters, webmapObj, logFunction):

    logFunction("RemoveLayers: Removing raster layers and exclude layers")
    logFunction("Exclude layer settings:")
    logFunction(excludeLayers)
    dataFrame = mapping.ListDataFrames(mapDoc)[0]
    mapDocLayers = mapping.ListLayers(mapDoc, None, dataFrame)

    # if removeFromLegendOnly is true, only remove from legend. Otherwise remove from map.
    legendElement = None
    try:
        legendElement = mapping.ListLayoutElements(mapDoc, "LEGEND_ELEMENT", "Legend")[0]
    except:
        pass

    # layer index of -1 is a map service layer
    layerIndex = -1
    # parent map service may have been excluded in webmap
    lastMapServiceParentIncluded = True
    # keep hold of current group layer
    lastGroupLayer = None
    # current group layer may have been excluded in webmap
    lastGroupLayerIncluded = True

    for legendAddLayer in mapDocLayers:

        mapServiceName = None
        # if a root / map service layer, there will be no "\" in path
        if legendAddLayer.longName.find("\\") == -1:
            mapServiceName = legendAddLayer.longName
            logFunction("RemoveLayers: Processing map service: " + mapServiceName)
            # if this is a parent/map service layer, reset the layer index
            # this allows us to match with map service layer indexes
            layerIndex = -1
            lastMapServiceParentIncluded = True

        if legendAddLayer.isGroupLayer:
            logFunction("RemoveLayers: Processing group layer: " + legendAddLayer.longName)
            lastGroupLayer = legendAddLayer
            lastGroupLayerIncluded = True

        shouldAdd = _includeLayerInLegend(legendAddLayer, layerIndex, excludeLayers, webmapObj, logFunction)

        if mapServiceName and shouldAdd is False:
            lastMapServiceParentIncluded = False
        if legendAddLayer.isGroupLayer and shouldAdd is False:
            lastGroupLayerIncluded = False

        excludeBecauseOfGroupLayer = False
        if legendAddLayer.isGroupLayer is False and lastGroupLayer and lastGroupLayer.longName in legendAddLayer.longName:
            # is child of last group
            if not lastGroupLayerIncluded:
                excludeBecauseOfGroupLayer = True

        # remove from mxd
        if shouldAdd is False or lastMapServiceParentIncluded is False or excludeBecauseOfGroupLayer:
            if removeFromLegendOnly:
                try:
                    legendElement.removeItem(legendAddLayer)
                except Exception as ex:
                    logFunction("RemoveLayers: Unable to remove layer from legend: " + legendAddLayer.name)
                    logFunction(str(ex))
            else:
                mapping.RemoveLayer(dataFrame, legendAddLayer)

        layerIndex += 1

## test if legend has overflowed through arcpy function and height check
def isLegendOverflowing(mapDoc, initialHeight, logFunction):

    legendElement = None
    dataFrame = mapping.ListDataFrames(mapDoc)[0]

    legendElement = mapping.ListLayoutElements(mapDoc, "LEGEND_ELEMENT", "Legend")[0]
    logFunction("Legend height before: " + str(initialHeight) + " after: " + str(legendElement.elementHeight))
    logFunction("legendElement.isOverflowing: " + str(legendElement.isOverflowing))

    if(legendElement.isOverflowing or legendElement.elementHeight > initialHeight):
        return True
    return False


## return legend height, or 0 if no legend found
def getLegendHeight(mapDoc):

    legendElement = None
    # if removeFromLegendOnly is true, only remove from legend. Otherwise remove from map.
    legendElement = None
    try:
        legendElement = mapping.ListLayoutElements(mapDoc, "LEGEND_ELEMENT", "Legend")[0]
    except:
        return 0
    return legendElement.elementHeight


def getSwatchCount(layers, logFunction):

    legendItemCount = 0
    for legendAddLayer in layers:
        # count number of items in legend, approximate
        if not legendAddLayer.isGroupLayer and legendAddLayer.visible:
            legendItemCount += 1
            try:
                # most layers used at AC are "UNIQUE_VALUES" or "OTHER"
                if legendAddLayer.symbologyType == "UNIQUE_VALUES":
                    symVals = legendAddLayer.symbology.classValues
                    legendItemCount = legendItemCount + len(symVals)
            except Exception as ex:
                pass
    return legendItemCount

# calculation of legend count wass made on client side, is in operationalLayers
def getSwatchCountFromWebmap(webmap, logFunction):

    legendItemCount = 0

    jsonOperLayerObjs = webmap["operationalLayers"]
    for jsonOperLayerObj in jsonOperLayerObjs:
        if jsonOperLayerObj.has_key('legendCount'):
			if not jsonOperLayerObj.has_key('showLegend') or jsonOperLayerObj['showLegend'] == True:
				logFunction(str(jsonOperLayerObj['id']) + ' clientItemCount : ' + str(jsonOperLayerObj['legendCount']))
				legendItemCount += int(jsonOperLayerObj['legendCount'])
    return legendItemCount

def substituteLayers(mapDoc, webmap, substitutePath, substituteAlternatives, logFunction):
    # for map and legend quality, substitute mxds can be supplied
    # mxds should the ones used to publish the map service originally

    dataFrame = mapping.ListDataFrames(mapDoc)[0]
    webLayers = mapping.ListLayers(mapDoc, None, dataFrame)

    for webLayerIndex, webLayer in enumerate(webLayers):

        # name used to match ID in webmap
        matchName = webLayer.name
        layerUrl = _getLayerUrlFromIdInWebmap(webmap, matchName)
        visLayerArray = _getVisibleLayersFromIdInWebmap(webmap, matchName)


        if layerUrl:
            layerIndex = _getLayerIndexFromUrl(layerUrl)
            possibleMxdOrLayerPath = findSubstituteMxd(layerUrl, substitutePath, substituteAlternatives, logFunction)

            if possibleMxdOrLayerPath:
                logFunction("Substitute layer found")

                # if mxd exists, substitute layers
                subMapDocOrLayer = mapping.MapDocument(possibleMxdOrLayerPath)
                subMapDocDataframe = mapping.ListDataFrames(subMapDocOrLayer)[0]

                subLayers = mapping.ListLayers(subMapDocOrLayer)

                if layerIndex > -1:
                    # feature layer or stand alone map service layer
                    # replace individual layer only
                    if layerIndex < len(subLayers):

                        subLayer = subLayers[layerIndex]
                        if webLayer.supports("transparency") and webLayer.transparency > 0:
                            subLayer.transparency = webLayer.transparency
                        warnIfRasterising(subLayer, logFunction)
                        mapping.InsertLayer(dataFrame, webLayer, subLayer, "AFTER")
                        mapping.RemoveLayer(dataFrame, webLayer)

                else:
                    # map service layer, add in all layers from sub mxd
                    addSubLayerList = getAddLayers(subLayers, visLayerArray)

                    for addSubLayer in addSubLayerList:
                        if webLayer.supports("transparency") and webLayer.transparency > 0:
                            addSubLayer.transparency = webLayer.transparency
                        warnIfRasterising(addSubLayer, logFunction)
                        logFunction("Inserting " + addSubLayer.name)
                        mapping.InsertLayer(dataFrame, webLayer, addSubLayer, "BEFORE")

                    # remove substituted layer
                    mapping.RemoveLayer(dataFrame, webLayer)
            else:
                # no mxd exists on disk
                pass




def clearScaleRangeBasemaps(mapDoc, scale):
    # clear up scale / rounding issues
    # if basemap should be visible, remove any scale limits

    layers = mapping.ListLayers(mapDoc)
    for layer in layers:
        if scale > 0:
            intScale = int(scale)
            if intScale == int(layer.maxScale) or intScale == int(layer.minScale):
                layer.maxScale = 0
                layer.minScale = 0

def cloneMapDoc(mapDoc, outputFolder):
    newMxdName = "_ags_cl_" + str(uuid.uuid4()) + ".mxd"
    newMxdPath = path.join(outputFolder, newMxdName)
    mapDoc.saveACopy(newMxdPath)
    cloneMxd = mapping.MapDocument(newMxdPath)
    return cloneMxd


def copyLayers(fromLayerList, toMapDoc, outputFolder, removeExistingLayers = False):

    if removeExistingLayers:
        # make a copy of map doc so we can edit it
        toMapDoc = cloneMapDoc(toMapDoc, outputFolder)

    toDataFrame = mapping.ListDataFrames(toMapDoc)[0]

    if removeExistingLayers:
        for removeLayer in mapping.ListLayers(toMapDoc, None, toDataFrame):
            mapping.RemoveLayer(toDataFrame, removeLayer)

    for fromLayer in fromLayerList:
        # check if is a root layer and add if so
        if not "\\" in fromLayer.longName:
            mapping.AddLayer(toDataFrame, fromLayer, "BOTTOM")

    return toMapDoc

def setExtentAndScale(mapDoc, extent = None, scale = -1, lodsArray = []):
    dataFrame = mapping.ListDataFrames(mapDoc)[0]

    # set extent and scale
    if extent:
        dataFrame.extent = extent
    if scale > 0:
        dataFrame.scale = scale

    if lodsArray:
        closestScale = lodsArray[0]["scale"]
        for lodObj in lodsArray:
            lodScale = lodObj["scale"]
            if lodScale < closestScale and lodScale > dataFrame.scale:
                closestScale = lodScale
        if closestScale > 0:
            dataFrame.scale = closestScale

    clearScaleRangeBasemaps(mapDoc, dataFrame.scale)

    return mapDoc



def exportMapDocToFile(exportableMapDoc, formatStr, outputFolder, quality):

    newFileName = "_ags_" + str(uuid.uuid4())
    outputFileName = newFileName + formatStr
    outputFilePath = path.join(outputFolder, outputFileName)

    # debug
    #exportableMapDoc.saveACopy(path.join(outputFolder, newFileName + "_PRE_EXPORT_TEMP.mxd"))

    if formatStr == ".pdf":

        # low quality, 200 dpi NORMAL
        # high quality, 149 dpi BEST
        pdfImageQuality = "NORMAL"
        if quality < 175:
            pdfImageQuality = "BEST"
        mapping.ExportToPDF(exportableMapDoc, outputFilePath, "PAGE_LAYOUT", 0, 0, quality, pdfImageQuality)

    elif formatStr == ".jpg":
        jpgCompression = 85
        if quality > 175:
            jpgCompression = 95
        mapping.ExportToJPEG(exportableMapDoc, outputFilePath, "PAGE_LAYOUT", 0, 0, quality, False, "24-BIT_TRUE_COLOR", jpgCompression)

    elif formatStr == ".png":
        mapping.ExportToPNG(exportableMapDoc, outputFilePath, "PAGE_LAYOUT", 0, 0, quality)
    else:
        raise Exception("Format not supported: " + formatStr)
    return outputFilePath


def combineImageDocuments(fileList, format):

    # if not pdf, return first image
    # at some point could zip them together
    if format.find("pdf") < 0:
        return fileList[0]

    pdfDoc = None
    outFilePath = ""
    count = 0
    for file in fileList:
        if count == 0:
            pdfDoc = mapping.PDFDocumentOpen(file)
            outFilePath = file
        else:
            pdfDoc.appendPages(file)
        count += 1
    pdfDoc.saveAndClose()

    return outFilePath


def getTargetLegendMxd(legendItemCount, config):
    targetMxd = None
    for configItem in config:
        if legendItemCount < configItem["itemLimit"]:
            targetMxd = configItem["mxd"]
            break

    return targetMxd

def getMapDocForLegend(mapDoc, excludeLayers, outFolder, logFunction, webmapObj):

    # get original layers list
    mapDocDataFrame = mapping.ListDataFrames(mapDoc)[0]
    mapDocLayers = mapping.ListLayers(mapDoc)

    # clone, remove exclude and raster layers
    mapDocClone = copyLayers(mapDocLayers, mapDoc, outFolder, True)
    removeLayers(mapDocClone, True, excludeLayers, True, webmapObj, logFunction)
    #mapDocClone.saveACopy(outFolder + "/" + "removedLayers.mxd")

    return mapDocClone

def processInlineLegend(mapDoc, showLegend, excludeLayers, webmapObj, logFunction):

    legendDataFrame = mapping.ListDataFrames(mapDoc)[0]
    legendElement = None
    try:
        legendElement = mapping.ListLayoutElements(mapDoc, "LEGEND_ELEMENT", "Legend")[0]
    except:
        pass
    if legendElement:
        if showLegend:
            logFunction("Processing inline legend")
            removeLayers(mapDoc, True, excludeLayers, True, webmapObj, logFunction)
        else:
            logFunction("Hiding inline legend")
            legendElement.elementPositionX = 90000



def getMxdLegends(legendMxdList, mapDoc, outFolder, logFunction, config, excludeLayers, webmapObj, styleItemPath = None, styleItemName = None):

    returnMxdList = []

    mapDocDataFrame = mapping.ListDataFrames(mapDoc)[0]
    mapDocClone = getMapDocForLegend(mapDoc, excludeLayers, outFolder, logFunction, webmapObj)

    outLayers = mapping.ListLayers(mapDocClone)
    # get approx swatch count, used for selecting legend mxd
    legendItemCount = getSwatchCount(outLayers, logFunction)
    legendAddLayers = getAddLayers(outLayers, None)

    targetMxd = getTargetLegendMxd(legendItemCount, config)

    # get style items
    style = None
    if styleItemPath and styleItemName:
        stylesList = mapping.ListStyleItems(styleItemPath, "Legend Items")
        for styleItem in stylesList:
            if styleItem.itemName == styleItemName:
                style = styleItem
                break


    for legendMxdPath in legendMxdList:
        if targetMxd.lower() in legendMxdPath.lower():
            logFunction("Creating legend from mxd: " + legendMxdPath)

            legendMxd = mapping.MapDocument(legendMxdPath)
            legendDataFrame = mapping.ListDataFrames(legendMxd)[0]
            legendElement = mapping.ListLayoutElements(legendMxd, "LEGEND_ELEMENT", "Legend")[0]

            # set legend columns
            #legendElement.adjustColumnCount(3)

            for legendAddLayer in legendAddLayers:
                mapping.AddLayer(legendDataFrame, legendAddLayer, "BOTTOM")

            legendDataFrame.extent = mapDocDataFrame.extent
            legendDataFrame.scale = mapDocDataFrame.scale

            removeLayers(legendMxd, True, excludeLayers, True, webmapObj, logFunction)

            if style:
                for addedLayer in legendElement.listLegendItemLayers():
                    legendElement.updateItem(addedLayer, style)

            returnMxdList.append(legendMxd)

    return returnMxdList
