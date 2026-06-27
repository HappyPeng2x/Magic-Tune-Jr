// Browser stub for scratchjr's OS platform layer.
// All tablet-specific calls are no-ops or return safe defaults.

let path;

export default class OS {
    static get path () { return path; }
    static set path (p) { path = p; }

    // No tablet interface to wait for — call immediately.
    static waitForInterface (fcn) { if (fcn) fcn(); }

    static analyticsEvent () {}
    static hascamera () { return false; }
    static cleanassets (ft, fcn) { if (fcn) fcn(); }
    static deviceName (fcn) { if (fcn) fcn('MagicTune Jr'); }
    static getsettings (fcn) { if (fcn) fcn('.,0'); }

    // Database stubs — project loading bypassed in appinit.
    static stmt (json, fcn) { if (fcn) fcn(null); }
    static query (json, fcn) { if (fcn) fcn('[]'); }  // callers expect a JSON string
    static setfield (db, id, fieldname, val, fcn) { if (fcn) fcn(); }

    // Audio stubs — no tablet audio in browser.
    static playSound () {}
    static stopSound () {}
    static setSoundVolume () {}

    // Media stubs.
    static getmedia (file, fcn) { if (fcn) fcn(null); }
    static setmedia (str, ext, fcn) { if (fcn) fcn(null); }
    static setmedianame (str, name, ext, fcn) { if (fcn) fcn(null); }
    static getmd5 (str, fcn) { if (fcn) fcn(null); }
    static remove (str, fcn) { if (fcn) fcn(); }
    static getfile (str, fcn) { if (fcn) fcn(null); }
    static setfile (name, str, fcn) { if (fcn) fcn(); }
    static registerSound (dir, name, fcn) { if (fcn) fcn(); }
}
