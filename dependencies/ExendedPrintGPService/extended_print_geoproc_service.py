## main script used by the Auckland Council 10.2 print service for Portal
## David Aalbers, Geographic Information Systems, 18/7/14
##
## Consists of three modules and a toolbox file
##   ac_print_geoproc_service.py - the main service uploaded to ArcGIS Server
##   ac_print_file_utils.py - helper module with functions for accessing and changing files
##   ac_print_map_utils.py - helper module with functions for manipulating map
##   ac_print_geoproc_service_settings.py - settings module containing environment specific variables
##   ACPrint102.tbx - toolbox used to publish the service, to be run in ArcMap
##
## Steps to install
## 1. Run on desktop
##   - The main module needs to be run from ArcMap. Place the other three modules (ac_print_map_utils,
##   ac_print_file_utils, ac_print_geoproc_service_settings) in the site-packages folder for Python. Usually:
##   D:\Python27\ArcGIS10.2\Lib\site-packages
##
##   - Place the toolbox and the main script (ac_print_geoproc_service) in a folder accessible to ArcMap
##
##   - Open the toolbox in ArcMap, and run. 
##
##   - Using the Geoprocessing -> results menu in ArcMap, right click on the result and Share As a service. 
##
##   - Publish as an asynchronous geoprocessing service. Set message logging to "info" to be able to check for errors.
##
## 2. Install modules on Server
##   -Place the additional three modules (ac_print_map_utils, ac_print_file_utils, ac_print_geoproc_service_settings)
##   in the site-packages folder for EACH ArcGIS Server that is running the service. This will usually be the 64 bit installation of Python:
##   D:\Python27\ArcGISx6410.2\Lib\site-packages
##
##   Configure the settings file correctly for the environment
##

import arcpy
from arcpy import mapping
import uuid
from os import path
import json
import extended_print_geoproc_service_settings as settings
import extended_print_file_utils as fileUtils
import extended_print_map_utils as mapUtils
from datetime import datetime


def log(s, isError = False):
    global resultObj

    dateNow = datetime.now()
    dateStr = dateNow.strftime('%y-%m-%d %H:%M:%S')

    try:
        s = str(s)
    except:
        s = "An error occurred, but could not be cast to a string."

    s = dateStr + ":  " + s
    print(s)

    arcpy.AddMessage(s)
    if isError:
        if resultObj["error"] != "":
            resultObj["error"] += "; "
        resultObj["error"] += s


def process(templateRootPath, 
            layoutNameStr, 
            outputFolder, 
            formatStr, 
            quality, 
            mapScale, 
            extentObj, 
            textElementsList, 
            lodsArray, 
            includeLegend, 
            legendExcludeLayers,
            legendTemplateConfig):
    
    
    log("Using template root: " + templateRootPath)
    if not path.isdir(templateRootPath):
        raise Exception("No template exists for: " + templateRootPath)

    # process layout mxds
    legendPdfList = fileUtils.getLegendPdfList(templateRootPath)
    legendMxdList = fileUtils.getLegendMxdList(templateRootPath)
    replaceList = fileUtils.getReplaceLayerOrMapDocList(templateRootPath)

    layoutMxd = fileUtils.getLayoutMapDoc(templateRootPath, layoutNameStr)
    log("Using layout map doc: " + layoutMxd.filePath)

    # webmaps
    log("Converting webmaps to map documents...")
    # create temp gdb path used by arcpy for graphics layers
    newUuid = uuid.uuid4()
    newGdbFile = path.join(outputFolder, "_ags_" + str(newUuid) + ".gdb")

    convertWebmapResult = mapping.ConvertWebMapToMapDocument(webmapJson, None, newGdbFile, extraWebmapConversionOptions)
    webmapMapDoc = convertWebmapResult.mapDocument
    webmapDataframe = mapping.ListDataFrames(webmapMapDoc)[0]
    newExtent = webmapDataframe.extent
    if extentObj:
        newExtent.XMin = extentObj['xmin']
        newExtent.YMin = extentObj['ymin']
        newExtent.XMax = extentObj['xmax']
        newExtent.YMax = extentObj['ymax']


    # create list of output pdf or image files for concatenating later
    exportedImageFilePaths = []
    outputMapDocs = []

    ## if there are replace map docs or layers, replace entire dataframe
    if len(replaceList) == 0:
        fromLayers = mapping.ListLayers(webmapMapDoc)
        log("Copying webmap layers to layout map doc...")
        outMapDoc = mapUtils.copyLayers(fromLayers, layoutMxd, outputFolder)
        outMapDoc = mapUtils.setExtentAndScale(outMapDoc, newExtent, mapScale, lodsArray)

        # debug - save webmap mxd
        #outMapDoc.saveACopy(path.join(outputFolder, str(newUuid) + "_WEBMAP_LAYERS_TEMP.mxd"))

        # substitute layers
        log("Substituting layers...")
        mapUtils.substituteLayers(outMapDoc, webMapObj, settings.SUBSTITUTE_DIR_PATH, settings.SUBSTITUTE_ALTERNATIVES, log)
        outputMapDocs.append(outMapDoc)

    else:
        log("Replacement layers found. Webmap layers will be ignored")
        for replaceLayerOrMapDocPath in replaceList:

            layersToCopy = []
            title = fileUtils.getName(replaceLayerOrMapDocPath)
            log("Processing map: " + title)

            if fileUtils.getExtension(replaceLayerOrMapDocPath) == "mxd":
                replaceMapDoc = mapping.MapDocument(replaceLayerOrMapDocPath)
                layersToCopy = mapping.ListLayers(replaceMapDoc)

            elif fileUtils.getExtension(replaceLayerOrMapDocPath) == "lyr":
                replaceLayer = mapping.Layer(replaceLayerOrMapDocPath)
                layersToCopy.append(replaceLayer)

            log("Copying layers from: " + replaceLayerOrMapDocPath)
            outMapDoc = mapUtils.copyLayers(layersToCopy, layoutMxd, outputFolder, True)
            outMapDoc = mapUtils.setExtentAndScale(outMapDoc, newExtent, mapScale, lodsArray)

            log("Processing text elements...")
            mapUtils.processTextElements(outMapDoc, {settings.REPLACE_LAYER_ELEMENT_NAME: title})
            outputMapDocs.append(outMapDoc)
            
    for outMapDoc in outputMapDocs:

        log("Processing custom text elements...")
        mapUtils.processTextElements(outMapDoc, textElementsList)

        log("Exporting file...")
        exportFile = mapUtils.exportMapDocToFile(outMapDoc, formatStr, outputFolder, quality)
        exportedImageFilePaths.append(exportFile)

        # process mxd legends
        if includeLegend:
            log("Processing legends")
            
            processedLegendMxds = mapUtils.getMxdLegends(legendMxdList, outMapDoc, outputFolder, log, legendTemplateConfig, legendExcludeLayers)
            for legendMxd in processedLegendMxds:
                exportLegendFile = mapUtils.exportMapDocToFile(legendMxd, formatStr, outputFolder, quality)
                exportedImageFilePaths.append(exportLegendFile)
            
    # append pdf legends
    if includeLegend:
        for legendFile in legendPdfList:
            log("Appending legend file: " + legendFile)
            exportedImageFilePaths.append(legendFile)

    return exportedImageFilePaths




# return this object when we're done
resultObj = {}
# client can always check for error object
resultObj["error"] = ""

try:
    # inject settings into file util module
    fileUtils.LAYOUT_DIR_NAME = settings.TEMPLATE_LAYOUT_DIR_NAME
    fileUtils.REPLACE_DIR_NAME = settings.TEMPLATE_REPLACE_DIR_NAME
    fileUtils.LEGEND_DIR_NAME = settings.TEMPLATE_LEGEND_DIR_NAME
    

    # start processing request
    log("Collecting parameters...")

    # first parameter (0) is return object
    webmapJson = arcpy.GetParameterAsText(1)
    templateStr = arcpy.GetParameterAsText(2)
    layoutNameStr = arcpy.GetParameterAsText(3)
    textElementsListJson = arcpy.GetParameterAsText(4)
    formatStr = arcpy.GetParameterAsText(5)
    qualityStr = arcpy.GetParameterAsText(6)
    mapScaleStr = arcpy.GetParameterAsText(7)
    elementVisibilityStr = arcpy.GetParameterAsText(8)
    getLayoutsStr = arcpy.GetParameterAsText(9)
    extentJson = arcpy.GetParameterAsText(10)
    lodsJson = arcpy.GetParameterAsText(11)
    includeLegendStr = arcpy.GetParameterAsText(12)


    ## DEBUG ##
    #webmapJson = '{}'
    #mapScaleStr = '2500'
    #layoutNameStr = 'A4 Landscape'
    #templateStr = '["Standard"]'
    #qualityStr = '50'
    #getLayoutsStr = "true"
    #textElementsListJson = '{"title": "Davids", "legal": "CUStLegal", "VALUATIONREF": ""}'
    #formatStr = "pdf"
    #extentJson = '{"xmin":1754040.1538077006,"ymin":5920576.894491547,"xmax":1755022.4213972357,"ymax":5921225.78641433,"spatialReference":{"wkid":2193,"latestWkid":2193}}'
    #lodsJson = '[{"level":0,"resolution":264.5838625010584,"scale":1000000,"startTileRow":1,"startTileCol":1,"endTileRow":4,"endTileCol":4},{"level":1,"resolution":201.08373550080435,"scale":760000,"startTileRow":1,"startTileCol":2,"endTileRow":6,"endTileCol":5},{"level":2,"resolution":132.2919312505292,"scale":500000,"startTileRow":2,"startTileCol":3,"endTileRow":9,"endTileCol":9},{"level":3,"resolution":66.1459656252646,"scale":250000,"startTileRow":5,"startTileCol":6,"endTileRow":19,"endTileCol":18},{"level":4,"resolution":26.458386250105836,"scale":100000,"startTileRow":12,"startTileCol":15,"endTileRow":48,"endTileCol":45},{"level":5,"resolution":13.229193125052918,"scale":50000,"startTileRow":25,"startTileCol":31,"endTileRow":96,"endTileCol":90},{"level":6,"resolution":6.614596562526459,"scale":25000,"startTileRow":50,"startTileCol":62,"endTileRow":192,"endTileCol":180},{"level":7,"resolution":3.9687579375158752,"scale":15000,"startTileRow":84,"startTileCol":103,"endTileRow":320,"endTileCol":300},{"level":8,"resolution":2.116670900008467,"scale":8000,"startTileRow":158,"startTileCol":193,"endTileRow":601,"endTileCol":562},{"level":9,"resolution":1.3229193125052918,"scale":5000,"startTileRow":253,"startTileCol":310,"endTileRow":962,"endTileCol":900},{"level":10,"resolution":0.6614596562526459,"scale":2500,"startTileRow":507,"startTileCol":620,"endTileRow":1925,"endTileCol":1801},{"level":11,"resolution":0.26458386250105836,"scale":1000,"startTileRow":1269,"startTileCol":1550,"endTileRow":4812,"endTileCol":4502},{"level":12,"resolution":0.13229193125052918,"scale":500,"startTileRow":2539,"startTileCol":3100,"endTileRow":9625,"endTileCol":9005},{"level":13,"resolution":0.06614596562526459,"scale":250,"startTileRow":5078,"startTileCol":6200,"endTileRow":19251,"endTileCol":18011}]'

    mapScale = -1
    try:
        if mapScaleStr:
            mapScale = float(mapScaleStr)
    except Exception as ex:
        log("Unable to convert scale values to numbers.")

    if formatStr is None or formatStr == "":
        formatStr = settings.DEFAULT_FORMAT
    formatStr = formatStr.lower()
    if "." not in formatStr:
        formatStr = "." + formatStr

    quality = settings.DEFAULT_QUALITY
    if qualityStr is not None and qualityStr != "":
        try:
            quality = int(qualityStr)
        except Exception as parseEx:
            log("Could not parse quality value \"" + qualityStr + "\" as an integer. Using default quality.")


    webMapObj = None
    if webmapJson is None or webmapJson == "":
        webmapJson = "{}"
    webMapObj = json.loads(webmapJson)

    if textElementsListJson is None or textElementsListJson == "":
        textElementsListJson = "{}"
    textElementsList = json.loads(textElementsListJson)

    extentObj = None
    if extentJson != None and extentJson != "":
        extentObj = json.loads(extentJson)

    if layoutNameStr is None or layoutNameStr == "":
        layoutNameStr = settings.DEFAULT_LAYOUT
    if not ".mxd" in layoutNameStr.lower():
        layoutNameStr += ".mxd"

    lodsArray = []
    if lodsJson:
        lodsArray = json.loads(lodsJson)

    # include legend by default
    includeLegend = True
    if includeLegendStr == "false":
        includeLegend = False
    # get graphics and raster layer names to exclude
    legendExcludeLayers = settings.LEGEND_EXCLUDE_LAYERS

    outputFolder = settings.AGS_OUTPUT_DIRECTORY
    outputFolderUrl = settings.AGS_VIRTUAL_OUTPUT_DIRECTORY

    # templates may be requested as a singele string 'standard', or a json array '["standard", "LIM 1"]'
    templateList = []
    if templateStr.find("[") == 0:
        templateList = json.loads(templateStr)
    else:
        templateList = [templateStr]

    if getLayoutsStr and getLayoutsStr == "true":
        template = templateList[0]
        templateRootPath = path.join(settings.TEMPLATES_PATH, template)
        layoutNameList = fileUtils.getLayoutNameList(templateRootPath)
        resultObj["layouts"] = layoutNameList
        
    else:
        # sign in to portal as an admin user so we have access to all webmap layers
        if settings.PORTAL_USER:
            log("Signing in to: " + settings.PORTAL_URL)
            arcpy.SignInToPortal_server(settings.PORTAL_USER, settings.PORTAL_PASSWORD, settings.PORTAL_URL)
        # extra server connections can be used where the log in to portal does not give enough access
        extraWebmapConversionOptions = {}
        extraWebmapConversionOptions["SERVER_CONNECTION_FILE"] = settings.SERVER_CONNECTIONS

        # process each file and combine 
        outFiles = [] 
        for template in templateList:
            templateRootPath = path.join(settings.TEMPLATES_PATH, template)
            generatedOutFiles = process(templateRootPath, layoutNameStr, outputFolder, formatStr, quality, mapScale, extentObj, 
                textElementsList, lodsArray, includeLegend, legendExcludeLayers, settings.LEGEND_TEMPLATE_CONFIG)
            outFiles.extend(generatedOutFiles)
        if len(outFiles) > 0:

            log("Combining documents: " + str(outFiles))
            finalFile = mapUtils.combineImageDocuments(outFiles, formatStr)
            finalFileName = path.split(finalFile)[-1]

            resultObj["url"] = outputFolderUrl + "/" + finalFileName
        else:
            raise Exception("No files were generated")
        


except Exception as e:
    log(e, True)


finally:
    resultObjJson = json.dumps(resultObj)
    log("Result object: ")
    log(resultObjJson)
    arcpy.SetParameterAsText(0, resultObjJson)















