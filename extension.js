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

const CategoryType = {
    FTS : 0,
    FILES : 1,
    FOLDERS : 2
};

var trackerSearchProviderFiles = null;
var trackerSearchProviderFolders = null;

function TrackerSearchProvider(title, categoryType) {
    this._init(title, categoryType);
}

TrackerSearchProvider.prototype = {
    __proto__ : Search.SearchProvider.prototype,
    _categoryType : -1,

    _init : function(title, categoryType) {
	this._categoryType = categoryType;
        Search.SearchProvider.prototype._init.call(this, title + " (from Tracker)");
	global.log(this.title + ": Created provider (type:" + String(this._categoryType) + ")");
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
        let name = resultId.name;
        return {
            'id' : resultId,
            'name' : name,
            'createIcon' : function(size) {
                let icon = Gio.app_info_get_default_for_type(type,null).get_icon();

                return imports.gi.St.TextureCache.get_default().load_gicon(null, icon, size);
            }
         };
      },

    activateResult : function(result) {
        // Action executed when clicked on result
        var uri = result.id;
	var f = Gio.file_new_for_uri(uri);
	var fileName = f.get_path();

        Util.spawn([DEFAULT_EXEC, fileName]);
    },

    getQuery : function (terms) {
	// terms holds array of search items
        // check if 1st search term is >2 letters else drop the request
	var query = "";

	if (this._categoryType == CategoryType.FTS) {
	    var terms_in_sparql = "";

            for (var i = 0; i < terms.length; i++) {
		if (terms_in_sparql.length > 0)
		    terms_in_sparql += " ";

		terms_in_sparql += terms[i] + "*";
            }
	    // Technically, the tag should really be matched
	    // separately not as one phrase too.
	    query += "SELECT ?urn nie:url(?urn) tracker:coalesce(nie:title(?urn), nfo:fileName(?urn)) nie:url(?parent) nfo:fileLastModified(?urn) WHERE { { ?urn a nfo:FileDataObject . ?urn fts:match \"" + terms_in_sparql + "\" } UNION { ?urn nao:hasTag ?tag . FILTER (fn:contains (fn:lower-case (nao:prefLabel(?tag)), \"" + terms + "\")) } OPTIONAL { ?urn nfo:belongsToContainer ?parent . } } ORDER BY DESC(nfo:fileLastModified(?urn)) ASC(nie:title(?urn)) OFFSET 0 LIMIT " + String(MAX_RESULTS);

	} else if (this._categoryType == CategoryType.FILES) {
	    // TODO: Do we really want this?
	} else if (this._categoryType == CategoryType.FOLDERS) {
	    query += "SELECT ?urn nie:url(?urn) tracker:coalesce(nie:title(?urn), nfo:fileName(?urn)) nie:url(?parent) nfo:fileLastModified(?urn) WHERE {";
	    query += "  ?urn a nfo:Folder .";
	    query += "  FILTER (fn:contains (fn:lower-case (nfo:fileName(?urn)), '" + terms + "')) .";
	    query += "  ?urn nfo:belongsToContainer ?parent ;";
	    query += "  tracker:available true .";
	    query += "} ORDER BY DESC(nfo:fileLastModified(?urn)) DESC(nie:contentCreated(?urn)) ASC(nie:title(?urn)) OFFSET 0 LIMIT " + String(MAX_RESULTS);
	}

	return query;
    },

    filterResults : function(cursor) {
        let results = [];

        try {
            while (cursor != null && cursor.next(null)) {
                var urn = cursor.get_string(0)[0];
                var uri = cursor.get_string(1)[0];
                var title = cursor.get_string(2)[0];
                var parentUri = cursor.get_string(3)[0];

		global.log (this.title + ": uri '" + uri + "', title '" + title + "', parent uri '" + parentUri + "'");

                // if file does not exist, it won't be shown
		var f = Gio.file_new_for_uri(uri);
		var fileName = f.get_path();

                // contentType is an array, the index "1" set true,
                // if function is uncertain if type is the right one
                let contentType = Gio.content_type_guess(fileName, null);
                var newContentType = contentType[0];

                if(contentType[1]){
                    if(newContentType == "application/octet-stream") {
                        let fileInfo = Gio.file_new_for_path(fileName).query_info('standard::type', 0, null);

                        // for some reason 'content_type_guess' returns a wrong mime type for folders
                        if(fileInfo.get_file_type() == Gio.FileType.DIRECTORY) {
                            newContentType = "inode/directory";
                        } else {
                            // unrecognized mime-types are set to text, so that later an icon can be picked
                            newContentType = "text/x-log";
                        }
                    }
                }

                results.push({
                    'id' : uri,
                    'name' : title,
                    'contentType' : newContentType
                });
            }
        } catch (error) {
            global.log(this.title + ": Could not traverse results cursor: " + error.message);
            return [];
        }

        return (results.length > 0) ? results : [];
    },

    getInitialResultSet : function(terms) {
        if(terms[0].length < 3) {
            global.log(this.title + ": Ignoring search term:'" + terms + "', length < 3");
            return [];
        }

        let conn = Tracker.SparqlConnection.get(null);

	var query = this.getQuery(terms);
        global.log(this.title + ": Running query '" + query + "'");
        let cursor = conn.query(query, null);

        global.log(this.title + ": Filtering results...");
	return this.filterResults(cursor);
    },

    getSubsearchResultSet : function(previousResults, terms) {
        if(terms[0].length < 3) {
            global.log(this.title + ": Ignoring search term:'" + terms + "', length < 3");
            return [];
        }

        global.log(this.title + ": Searching for '" + terms + "'");

        return this.getInitialResultSet(terms);
    },
};



function init(meta) {
}

function enable() {
    trackerSearchProviderFolders = new TrackerSearchProvider("Folders", CategoryType.FOLDERS);
    Main.overview.addSearchProvider(trackerSearchProviderFolders);

    trackerSearchProviderFiles = new TrackerSearchProvider("Files", CategoryType.FTS);
    Main.overview.addSearchProvider(trackerSearchProviderFiles);
}

function disable() {
    Main.overview.removeSearchProvider(trackerSearchProviderFiles);
    trackerSearchProviderFiles = null;

    Main.overview.removeSearchProvider(trackerSearchProviderFolders);
    trackerSearchProviderFolders = null;
}
