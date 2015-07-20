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


def _getOperationalLayerObject(webmap, layerId):
    jsonOperLayerObjs = webmap["operationalLayers"]
    for jsonOperLayerObj in jsonOperLayerObjs:
        jsonObjLayerId = jsonOperLayerObj["id"]
        if jsonObjLayerId == layerId:
            return jsonOperLayerObj
    return None


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
    

def removeLayers(mapDoc, excludeLayers, removeRasters, logFunction):

    logFunction("Searching for raster layers and exclude layers: ")
    logFunction(excludeLayers)
    dataFrame = mapping.ListDataFrames(mapDoc)[0]
    mapDocLayers = mapping.ListLayers(mapDoc, None, dataFrame)

    for legendAddLayer in mapDocLayers:
        shouldAdd = True
        try:
            if legendAddLayer.isRasterLayer:
                logFunction("Raster layer found, skipping: " + legendAddLayer.name)
                shouldAdd = False
        except Exception as ex: 
            logFunction("Unable to check if layer is raster: " + legendAddLayer.name)
        
        for excludeNameMatch in excludeLayers:
            if excludeNameMatch == legendAddLayer.name:
                logFunction("Excluding layer: " + legendAddLayer.name)
                shouldAdd = False
                break
            elif excludeNameMatch[-1] == "*": 
                match = "".join(excludeNameMatch[:-1])
                if legendAddLayer.name.find(match) > -1: 
                    # wildcard match found
                    logFunction("Excluding layer: " + legendAddLayer.name)
                    shouldAdd = False
                    break
                 
        if not shouldAdd:
            mapping.RemoveLayer(dataFrame, legendAddLayer)
    


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


def copyLayers(fromLayerList, toMapDoc, outputFolder, removeExistingLayers = False):

    if removeExistingLayers:
        # make a copy of map doc so we can edit it
        newMxdName = "_ags_CPY_TEMP_" + str(uuid.uuid4()) + ".mxd"
        newMxdPath = path.join(outputFolder, newMxdName)
        toMapDoc.saveACopy(newMxdPath)
        toMapDoc = mapping.MapDocument(newMxdPath)

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



def getMxdLegends(legendMxdList, mapDoc, outFolder, logFunction, config, excludeLayers):

    returnMxdList = []

    # get original layers list
    mapDocDataFrame = mapping.ListDataFrames(mapDoc)[0]
    mapDocLayers = mapping.ListLayers(mapDoc)
    mapDocClone = copyLayers(mapDocLayers, mapDoc, outFolder, True) 

    # remove exclude and raster layers
    removeLayers(mapDocClone, excludeLayers, True, logFunction)
    outLayers = mapping.ListLayers(mapDocClone)
    # get approx swatch count, used for selecting legend mxd
    legendItemCount = getSwatchCount(outLayers, logFunction)
    legendAddLayers = getAddLayers(outLayers, None)

    targetMxd = None
    logFunction("Legend item count: " + str(legendItemCount)) 
    for configItem in config: 
        if legendItemCount < configItem["itemLimit"]:
            targetMxd = configItem["mxd"]
            logFunction("Using legend mxd: " + str(targetMxd))
            break

    for legendMxdPath in legendMxdList:
        if targetMxd.lower() in legendMxdPath.lower():
            logFunction("Creating legend from mxd: " + legendMxdPath)
                
            legendMxd = mapping.MapDocument(legendMxdPath)
            legendDataFrame = mapping.ListDataFrames(legendMxd)[0]
            legendElement = mapping.ListLayoutElements(legendMxd, "LEGEND_ELEMENT", "Legend")[0]

            for legendAddLayer in legendAddLayers:
                mapping.AddLayer(legendDataFrame, legendAddLayer, "BOTTOM")  

            legendDataFrame.extent = mapDocDataFrame.extent
            legendDataFrame.scale = mapDocDataFrame.scale
        
            returnMxdList.append(legendMxd)
        
    return returnMxdList
          
        














