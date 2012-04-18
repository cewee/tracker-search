const Tracker = imports.gi.Tracker;

var conn = Tracker.SparqlConnection.get(null);
var cursor = conn.query("SELECT nie:url(?f) WHERE { ?f fts:match 'master' }", null);





while (cursor.next(null)) {
      log( cursor.get_string(null));
}

