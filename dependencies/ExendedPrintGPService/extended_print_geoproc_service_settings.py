# settings file used by the Auckland Council 10.2 print service for Portal
# David Aalbers, Geographic Information Systems, 18/7/14
#
# configure this file per environment
# when deploying to ArcGIS Server, Python needs to access this file as a module
# add its location to a .PTH file, ArcGIS Server puts one here by default:
# "C:\Python27\ArcGISx6410.2\Lib\site-packages\server10.2.pth"
#

# Directory for saving outputs 
# this will be created when the geoprocessing service has run once, it is not necessary to create this manually
# cannot use the root output dir as AGS does not allow saving there
# AGS_OUTPUT_DIRECTORY = r'G:\App_DataStream\arcgisoutput-arcgis2\GPTools\ACPrint_GPServer'
AGS_OUTPUT_DIRECTORY = r'D:\arcgisserver\directories\arcgisoutput\PrintUtilities\PrintService_GPServer'

# virtual dir, this will exist when the service has been run
##AGS_VIRTUAL_OUTPUT_DIRECTORY = 'https://maps.aklc.govt.nz/arcgis2/rest/directories/arcgisoutput/GPTools/ACPrint_GPServer'
AGS_VIRTUAL_OUTPUT_DIRECTORY = 'https://maps.waimakariri.govt.nz/arcgis/rest/directories/arcgisoutput/PrintUtilities/PrintService_GPServer'

# must match an mxd existing in the "TEMPLATE_LAYOUT_DIR_NAME" folder below
DEFAULT_LAYOUT = "A4Landscape.mxd"

# PDF, JPG, PNG
DEFAULT_FORMAT = "PDF"

# DPI value
DEFAULT_QUALITY = 96

# add a portal administrative user here if the print service needs to sign in on behalf of the user
PORTAL_USER = ""
PORTAL_PASSWORD = ""
PORTAL_URL = ""

# this is the root template path
# client will specify templates as subfolders of this, for example printing to a "Unitary Plan" template will look in
# <TEMPLATES_PATH>\Unitary Plan
TEMPLATES_PATH = r"D:\PrintTemplates"

# relative to TEMPLATES_PATH. contains layout mxds used for printing
TEMPLATE_LAYOUT_DIR_NAME = "Layouts"

# relative to TEMPLATES_PATH. If layers or mxds exist in here, they are printed instead of the webmap
# each layer or mxd will print a separate page
TEMPLATE_REPLACE_DIR_NAME = "NotUsedByWMK"

# An mxd element with this name is populated with the layer file name when using replacement layers
REPLACE_LAYER_ELEMENT_NAME = "NotUsedByWMK"

# Root folder containing mxds used in map service publishing. For replacing map service layers if print quality is an issue.
# Expects mxds to be in relative folders, matching arcgis server, e.g. <SUBSTITUTE_DIR_PATH>\LiveMaps\ParksManagementPlan.mxd
# SUBSTITUTE_DIR_PATH = r"G:\App_Workspace\Administration\AGS MXDs"
SUBSTITUTE_DIR_PATH = r"NotUsedByWMK"

# substitute exceptions, set these for folders not matching relative map service paths
# folder expected first, then folder to check
SUBSTITUTE_ALTERNATIVES = [
]


# relative to TEMPLATES_PATH. Any PDF documents in this folder will be appended to the final print output
# mxds in the folder will be treated as legend mxds and printed
TEMPLATE_LEGEND_DIR_NAME = "Legends"

# connection files (.ags) for any ags servers that may not be covered when logging in to portal
# not currently used by Waimakariri
SERVER_CONNECTIONS = [

]

# layers to exclude from legend, can include group or individual layers
# wildcard (*) can be used at end of item
LEGEND_EXCLUDE_LAYERS = [
    "polygonLayer", "polylineLayer", "pointLayer", "Outline", "New Group Layer" # graphics layers 
    ]


# config to switch mxd legend template depending on number of swatch items
# in order from lowest limit to highest
LEGEND_TEMPLATE_CONFIG = [
    {
        "itemLimit": 150, 
        "mxd": "LegendA4"
    },
    {
        "itemLimit": 9999999, 
        "mxd": "LegendA3"
}]

