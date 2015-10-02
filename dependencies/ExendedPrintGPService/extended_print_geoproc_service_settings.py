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
AGS_OUTPUT_DIRECTORY = r'D:\Work\Waimap\svn\geoprocessing\out'

# virtual dir, this will exist when the service has been run
AGS_VIRTUAL_OUTPUT_DIRECTORY = 'https://bear.geobiz.local/arcgis/rest/directories/arcgisoutput/WaiMap/WaiMapPrint_GPServer'

# must match an mxd existing in the "TEMPLATE_LAYOUT_DIR_NAME" folder below
DEFAULT_LAYOUT = "A4 landscape.mxd"

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
TEMPLATES_PATH = r"D:\Work\Waimap\svn\geoprocessing\print_templates"

# relative to TEMPLATES_PATH. contains layout mxds used for printing
TEMPLATE_LAYOUT_DIR_NAME = "layouts"

# relative to TEMPLATES_PATH. If layers or mxds exist in here, they are printed instead of the webmap
# each layer or mxd will print a separate page
TEMPLATE_REPLACE_DIR_NAME = "layers"

# An mxd element with this name is populated with the layer file name when using replacement layers
REPLACE_LAYER_ELEMENT_NAME = "layer"

# Root folder containing mxds used in map service publishing. For replacing map service layers if print quality is an issue.
# Expects mxds to be in relative folders, matching arcgis server, e.g. <SUBSTITUTE_DIR_PATH>\LiveMaps\ParksManagementPlan.mxd
SUBSTITUTE_DIR_PATH = r""

# substitute exceptions, set these for folders not matching relative map service paths
# folder expected first, then folder to check
SUBSTITUTE_ALTERNATIVES = [
]


# relative to TEMPLATES_PATH. Any PDF documents in this folder will be appended to the final print output
# mxds in the folder will be treated as legend mxds and printed
TEMPLATE_LEGEND_DIR_NAME = "legend"

# connection files (.ags) for any ags servers that may not be covered when logging in to portal
# not currently used by AC
SERVER_CONNECTIONS = [

]

# layers to exclude from legend, can include group or individual layers
# wildcard (*) can be used at end of item
LEGEND_EXCLUDE_LAYERS = [
    "polygonLayer", "polylineLayer", "pointLayer", "Outline", "New Group Layer", "Polygons" # graphics layers

    ]


# config to switch mxd legend template depending on number of swatch items
# in order from lowest limit to highest
LEGEND_TEMPLATE_CONFIG = [
    {
        "itemLimit": 200,
        "mxd": "LegendA4"
    },
    {
        "itemLimit": 9999999,
        "mxd": "LegendA3"
}]

# match the layout structures from the
# TEMPLATES_PATH
LEGEND_STYLE_TEMPLATE_LIMITS_CONFIG = {
        'Localised Flood Hazard' : [{
            'name': 'A3 Landscape',
            'itemLimit': 10
        }, {
            'name': 'A3 Portrait',
            'itemLimit': 10
        }, {
            'name': 'A4 Landscape',
            'itemLimit': 10
        }, {
            'name': 'A4 Portrait',
            'itemLimit': 10
        }],
        'PIMS Farm Ops' : [{
            'name': 'A3 Landscape',
            'itemLimit': 10
        }, {
            'name': 'A3 Portrait',
            'itemLimit': 10
        }, {
            'name': 'A4 Landscape',
            'itemLimit': 10
        }, {
            'name': 'A4 Portrait',
            'itemLimit': 10
        }],
        'PIMS Races' : [{
            'name': 'A3 Landscape',
            'itemLimit': 10
        }, {
            'name': 'A3 Portrait',
            'itemLimit': 10
        }, {
            'name': 'A4 Landscape',
            'itemLimit': 10
        }, {
            'name': 'A4 Portrait',
            'itemLimit': 10
        }],
        'PIMS Soils' : [{
            'name': 'A3 Landscape',
            'itemLimit': 10
        }, {
            'name': 'A3 Portrait',
            'itemLimit': 10
        }, {
            'name': 'A4 Landscape',
            'itemLimit': 10
        }, {
            'name': 'A4 Portrait',
            'itemLimit': 10
        }],
        'Standard' : [{
            'name': 'A3 Landscape',
            'itemLimit': 18
        }, {
            'name': 'A3 Portrait',
            'itemLimit': 18
        }, {
            'name': 'A4 Landscape',
            'itemLimit': 12
        }, {
            'name': 'A4 Portrait',
            'itemLimit': 5
        }],
        'Utilities' : [{
            'name': 'A3 Landscape',
            'itemLimit': 10
        }, {
            'name': 'A3 Portrait',
            'itemLimit': 10
        }, {
            'name': 'A4 Landscape',
            'itemLimit': 10
        }, {
            'name': 'A4 Portrait',
            'itemLimit': 10
        }]
    }

# a file containing user custom styles
# can be copied from arcmap:
# C:\Users\davida\AppData\Roaming\ESRI\Desktop10.3\ArcMap\davida.style # debugging on desktop
# or use "ESRI.style" for default esri styles
# when deploying to server a .serverstyle needs to be created, run "C:\Program Files (x86)\ArcGIS\Desktop10.2\bin\MakeServerStyleSet.exe"
LEGEND_STYLE_FILE = r""
# the name of the custom style, as seen in ArcMap
LEGEND_STYLE_NAME = r""
