/* Tracker Search Provider for Gnome Shell
 *
 * Copyright (c) 2012 Christian Weber, Felix Schultze
 *
 * This programm is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 3 of the License, or
 * (at your option) any later version.
 *
 * Version 1.4
 *
 * https://github.com/cewee/tracker-search
 */

const Main      = imports.ui.main;
const Search    = imports.ui.search;
const Gio       = imports.gi.Gio;
const GLib      = imports.gi.GLib;
const Lang      = imports.lang;
const Shell     = imports.gi.Shell;
const Util      = imports.misc.util;
const Tracker   = imports.gi.Tracker;
const St        = imports.gi.St;

/* let xdg-open pick the appropriate program to open/execute the file */
const DEFAULT_EXEC = 'xdg-open';
/* Limit search results, since number of displayed items is limited */
const MAX_RESULTS = 12;

var trackerSearchProvider = null;

function TrackerSearchProvider() {
   this._init();
}

TrackerSearchProvider.prototype = {
    __proto__ : Search.SearchProvider.prototype,

    _init : function(name) {
        Search.SearchProvider.prototype._init.call(this, "TRACKER SEARCH");
    },

    getResultMetas: function(resultIds) {
        let metas = [];
        for (let i = 0; i < resultIds.length; i++) {
            metas.push(this.getResultMeta(resultIds[i]));
        }
        return metas;
    },

    getResultMeta : function(resultId) {
        let type = resultId.contentType;
        let name = resultId.filename;
        return {
            'id' : resultId,
            'name' : name,
            'createIcon' : function(size) {
                let icon = Gio.app_info_get_default_for_type(type,null).get_icon();

                return imports.gi.St.TextureCache.get_default().load_gicon(null, icon, size);
            }
         };
      },

    activateResult : function(id) {
        // Action executed when clicked on result
        var target = id.fileAndPath;
        Util.spawn([ DEFAULT_EXEC, target ]);
    },

    filterResults : function(cursor) {
        let results = [];

        try {
            while (cursor != null && cursor.next(null)) {
                var result = cursor.get_string (null);
                // filter our, bogus tracker responses
                if (String(result) == ",0") {
                    continue;
                }

                // cut of number of internal hits
                var fileStr = String(result).split(',');
                fileStr = decodeURI(fileStr[0]);

                // extract filename from line
                var splitted = String(fileStr).split('/');
                var filename = decodeURI(splitted[splitted.length - 1]);
                let ft = String(filename).split('.');

                // extract path and filename
                splitted = String(fileStr).split('ile://');
                var fileAndPath = "";
                if (splitted.length == 2) {
                    fileAndPath = decodeURI(splitted[1]);
                }

                // if file does not exist, it won't be shown
                if(!Gio.file_new_for_path(fileAndPath).query_exists(null)) {
                    continue;
                }

                // contentType is an array, the index "1" set true,
                // if function is uncertain if type is the right one
                let contentType = Gio.content_type_guess(fileAndPath, null);
                var newContentType = contentType[0];
                if(contentType[1]){
                    if(newContentType == "application/octet-stream") {
                        let fileInfo = Gio.file_new_for_path(fileAndPath).query_info('standard::type', 0, null);

                        // for some reason 'content_type_guess' returns a wrong mime type for folders
                        if(fileInfo.get_file_type() == Gio.FileType.DIRECTORY)
                        {
                            newContentType = "inode/directory";
                        } else {
                            // unrecognized mime-types are set to text, so that later an icon can be picked
                            newContentType = "text/x-log";
                        }
                    }
                }

                results.push({
                    'filename' : filename,
                    'fileAndPath' : fileAndPath,
                    'contentType' : newContentType
                });
            }
        } catch (error) {
            global.log("Tracker: Could not traverse results cursor: " + error.message);
            return [];
        }

        return (results.length > 0) ? results : [];
    },

    getInitialResultSet : function(terms) {
	// terms holds array of search items
        // check if 1st search term is >2 letters else drop the request
        var new_query = "SELECT nie:url(?f) WHERE {?f fts:match'";
        for ( var i = 0; i < terms.length; i++) {
            new_query = new_query + " " + terms[i] + "*";
        }

        new_query = new_query + "' }  ORDER BY DESC (fts:rank(?f))  LIMIT " + String(MAX_RESULTS);

        let conn = Tracker.SparqlConnection.get(null);

        global.log("Tracker: Running query '" + new_query + "'");
        let cursor = conn.query(new_query, null);

        global.log("Tracker: Filtering results...");
	return this.filterResults(cursor);
    },

    getSubsearchResultSet : function(previousResults, terms) {
        if(terms[0].length <= 2) {
            global.log("Tracker: Ignoring search terms, length < 3");
            return [];
        }

        global.log("Tracker: Searching for '" + terms + "'");

        return this.getInitialResultSet(terms);
    },
};

function init(meta) {
}

function enable() {
    trackerSearchProvider = new TrackerSearchProvider();
    Main.overview.addSearchProvider(trackerSearchProvider);
}

function disable() {
    Main.overview.removeSearchProvider(trackerSearchProvider);
    trackerSearchProvider = null;
}
