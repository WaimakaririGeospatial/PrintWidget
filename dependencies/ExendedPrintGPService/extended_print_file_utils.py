# helper functions to work with the Auckland Council 10.2 print service for Portal
# David Aalbers, Geographic Information Systems, 18/7/14
#
from os import path, listdir
from os.path import join
from arcpy import mapping

LAYOUT_DIR_NAME = ""
REPLACE_DIR_NAME = ""
LEGEND_DIR_NAME = ""


def getFileNameList(dirPath, fileTypeList , includeDirs = False):
    # get file names
    fileList = []
    if path.exists(dirPath):
        for file in listdir(dirPath):
            filePath = join(dirPath, file)
            if path.isfile(filePath):
                ext = getExtension(file)
                if ext.lower() in fileTypeList:
                    fileName = path.splitext(file)[0]
                    fileList.append(fileName)
            elif includeDirs and path.isdir(filePath):
                fileList.append(file)
    return fileList



def getFileList(dirPath, fileTypeList):
    # get full file paths
    fileList = []
    if path.exists(dirPath):
        for file in listdir(dirPath):
            filePath = join(dirPath, file)
            if path.isfile(filePath):
                ext = getExtension(file)
                if ext.lower() in fileTypeList:
                    fileList.append(filePath)
    return fileList



def getLayoutNameList(rootTemplatePath):
    layoutRoot = join(rootTemplatePath, LAYOUT_DIR_NAME)
    layoutList = getFileNameList(layoutRoot, ["mxd"])
    return layoutList


def getReplaceLayerOrMapDocList(rootTemplatePath):
    replaceRoot = join(rootTemplatePath, REPLACE_DIR_NAME)
    replaceList = getFileList(replaceRoot, ["mxd", "lyr"])
    return replaceList

def getLegendPdfList(rootTemplatePath):
    legendRoot = join(rootTemplatePath, LEGEND_DIR_NAME)
    legendList = getFileList(legendRoot, ["pdf"])
    return legendList

def getLegendMxdList(rootTemplatePath):
    legendRoot = join(rootTemplatePath, LEGEND_DIR_NAME)
    legendList = getFileList(legendRoot, ["mxd"])
    return legendList


def getLayoutMapDoc(rootTemplatePath, layoutName):

    layoutMxdPath = path.join(rootTemplatePath, LAYOUT_DIR_NAME, layoutName)
    if not path.isfile(layoutMxdPath):
        raise Exception("Layout does not exist: " + layoutMxdPath)

    return mapping.MapDocument(layoutMxdPath)

def getExtension(file):
    ext = path.splitext(file)[1].lower()
    if len(ext.split(".")) > 0:
        ext = ext.split(".")[-1]
    return ext

def getName(filePath):
    name = path.split(filePath)[-1]
    name = path.splitext(name)[0]

    return name









