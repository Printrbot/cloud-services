# Importer

This Amazon lambda service will fetch the STL files from the location you specify, then run them through admesh (https://github.com/admesh/admesh) for post processing and verification that object does not exceeds printer build volume.

Make sure you download and include admesh binary file, and install required node modules before you deploy this service.
