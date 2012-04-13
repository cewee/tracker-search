/* Tracker Search Provider for Gnome Shell
 *
 * Copyright (c) 2012 Christian Weber 
 *
 * This programm is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 3 of the License, or
 * (at your option) any later version.
 *
 */

const Main = imports.ui.main;
const Search = imports.ui.search;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const Shell = imports.gi.Shell;
const Util = imports.misc.util;

/*Bindings for Icons to display */
const PDF = 'evince';
const OFFICEW = 'libreoffice-writer';
const OFFICEP = 'libreoffice-impress';
const OFFICEC = 'libreoffice-calc';

/* let xdg-open pick the appropriate program to open/execute the file */
const DEFAULT_EXEC = 'xdg-open';
const NAUTILUS = "nautilus";

/* Limit search results, since number of displayed items is limited */
const
MAX_RESULTS = 15;

var trackerSearchProvider = null;

function TrackerSearchProvider() {
	this._init();
}

TrackerSearchProvider.prototype = {
	__proto__ : Search.SearchProvider.prototype,

	_init : function(name) {
		Search.SearchProvider.prototype._init.call(this, "Tracker Search");
	},

	getResultMeta : function(resultId) {
		// find related meta data for a specific result item
		let
		appSys = Shell.AppSystem.get_default();
		var app;

		/* UNCOMMENT THIS IF YOU WANT TO USE xdg-mime TO DETERMINE ICONS  --------------------------*/

		/* var searchString = [];     	
		searchString.push ("xdg-mime" );
		searchString.push("query");
		searchString.push("filetype");
		searchString.push (resultId.fileAndPath);
		
		  //query mime filetype 
		 [res, pid, in_fd, out_fd, err_fd] = 
		  GLib.spawn_async_with_pipes(
		    null, searchString, null, GLib.SpawnFlags.SEARCH_PATH, null);

		 out_reader = new Gio.DataInputStream({ base_stream: new Gio.UnixInputStream({fd: out_fd}) });
		  read terminal output 
		 [out, size] = out_reader.read_line(null);

		 var searchString2 = [];
		  
		 searchString2.push("xdg-mime");
		 searchString2.push("query");
		 searchString2.push("default");
		 searchString2.push (decodeURI(out));
		 	
		 // query .desktop file for given mime-type 
		 
		 try {     
		 	
		 	 [res, pid, in_fd, out_fd, err_fd] =  GLib.spawn_async_with_pipes(null, searchString2, null, GLib.SpawnFlags.SEARCH_PATH, null);
		 } catch (error) {
		 	
		     global.log( error.message );
		 }
		 
		 

		try {     
		out_reader = new Gio.DataInputStream({ base_stream: new Gio.UnixInputStream({fd: out_fd}) });
		 } catch (error) {
		     global.log( error.message );
		 }
		     
		 // read terminal output 
		 
		 try {         	
		 	[out, size] = out_reader.read_line(null);
		     } catch (error) {
		         global.log("Readline:" + error.message );
		     }
		     
		 out = String(out);
		 try {     		 	
		 	app = appSys.lookup_app(out);
		     } catch (error) {
		     	  global.log("Lookup App:" + error.message );
		     }*/

		/* UNCOMMENT END --------------------------------------------------------- */

		/* Choose Icon depending on file-type */

		/* COMMENT THIS OUT, WHEN USING ABOVE SOLUTION,
		 * THIS IS THE FALLBACK MODE WHICH IS A LOT FASTER,
		 * BUT VERY UNFLEXIBLE. 
		 */
		switch (String(resultId.fileType)) {
		case "PDF":
			app = appSys.lookup_app(PDF + '.desktop');
			break;
		case "ODS":
			app = appSys.lookup_app(OFFICEC + '.desktop');
			break;
		case "ODT":
			app = appSys.lookup_app(OFFICEW + '.desktop');
			break;
		case "DOC":
			app = appSys.lookup_app(OFFICEW + '.desktop');
			break;
		case "DOCX":
			app = appSys.lookup_app(OFFICEW + '.desktop');
			break;
		case "PPT":
			app = appSys.lookup_app(OFFICEP + '.desktop');
			break;
		case "PPTX":
			app = appSys.lookup_app(OFFICEP + '.desktop');
			break;
		case "ODP":
			app = appSys.lookup_app(OFFICEP + '.desktop');
			break;
		default:
			app = appSys.lookup_app(NAUTILUS + '.desktop');
			break;
		}

		let	result_name = resultId.filename;

		return {
			'id' : resultId,
			'name' : result_name,
			'createIcon' : function(size) {
				return app.create_icon_texture(size);
			}
		};
	},

	activateResult : function(id) {
		// Action executed when clicked on result
		var target = id.fileAndPath;

		/* UNCOMMENT TO OVERWRITE TYPE SPECIFIC BEHAVIOR */

		/*switch (String(id.fileType)) {
		case "PDF":
			Util.spawn([PDF, target]);
			break;
			
			 if no action is asociated with file type, open folder that contains the file with nautilus 
			default:
				Util.spawn([DEFAULT_EXEC, target]);
				
			break;
		}
		 */

		Util.spawn([ DEFAULT_EXEC, target ]);

	},

	getInitialResultSet : function(terms) { // terms holds array of search items
		let results = [];

		/* Call Tracker on command line with arguments */

		var searchString = [];
		searchString.push("tracker-search");
		searchString.push("-f");
		for ( var i = 0; i < terms.length; i++) {
			searchString.push(terms[i]);
		}

		/* execute tracker-search in terminal*/
		let[res, pid, in_fd, out_fd, err_fd] = GLib.spawn_async_with_pipes(
				null, searchString, null, GLib.SpawnFlags.SEARCH_PATH, null);

		/* read terminal output */
		out_reader = new Gio.DataInputStream({
			base_stream : new Gio.UnixInputStream({
				fd : out_fd
			})
		});

		var size;
		var out;

		[ out, size ] = out_reader.read_line(null);

		var cnt = 0;

		while (size > 0 && cnt < MAX_RESULTS) {

			// Extract filename from line
			var splitted = String(out).split('/');
			var filename = decodeURI(splitted[splitted.length - 1]);
			let
			ft = String(filename).split('.');

			// Extract filetype
			var fileType;
			if (ft.length > 0) {
				fileType = String(ft[ft.length - 1]);
			}
			fileType = fileType.toUpperCase();

			// extract path and filename
			splitted = String(out).split('ile://');
			var fileAndPath = "";
			if (splitted.length == 2) {
				fileAndPath = decodeURI(splitted[1]);
			}

			if (filename != "Files:" && cnt != 0) { // skip first entry of tracker-search output
				results.push({
					'filename' : filename,
					'fileAndPath' : fileAndPath,
					'fileType' : fileType,
				});
			}

			[ out, size ] = out_reader.read_line(null);
			cnt++;
		}

		if (results.length > 0) {
			return (results);
		}
		return [];
	},

	getSubsearchResultSet : function(previousResults, terms) {
		return this.getInitialResultSet(terms);
	},
};

function init(meta) {
}

function enable() {
	if (trackerSearchProvider == null) {
		trackerSearchProvider = new TrackerSearchProvider();
		Main.overview.addSearchProvider(trackerSearchProvider);
	}
}

function disable() {
	if (trackerSearchProvider != null) {
		Main.overview.removeSearchProvider(trackerSearchProvider);
		trackerSearchProvider = null;
	}
}
