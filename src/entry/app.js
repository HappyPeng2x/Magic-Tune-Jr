import ScratchJr from '../editor/ScratchJr';
import Localization from '../utils/Localization';
import MediaLib from '../tablet/MediaLib';
import {preprocessAndLoadCss} from '../utils/lib';

window.onload = function () {
    // Inline settings — no XHR to settings.json needed.
    window.Settings = {
        edition: 'free',
        scratchJrVersion: 'magictunejrv01',
        useStoryStarters: false,
        shareEnabled: false,
        defaultSprite: 'Star.svg',
        spriteOutlineColor: 'white',
        stageColor: '#F5F2F7',
        textSpriteFont: 'Helvetica',
        blockArgFont: 'Verdana',
        paletteBalloonFont: 'Roboto',
        categoryStartColor: '#FFE75A',
        categoryMotionColor: '#4B8CC2',
        categoryLooksColor: '#CD7CD1',
        categorySoundColor: '#48CC7E',
        categoryFlowColor: '#FFBE57',
        categoryStopColor: '#D62222',
        paletteBlockShadowOpacity: 0.8,
        autoSaveInterval: 0,
        defaultLocale: 'en',
        defaultLocaleShort: 'en',
        supportedLocales: {'English': 'en'},
        initialOptions: {}
    };

    // Load the same CSS scratchjr uses (served from the symlinked css/ directory).
    preprocessAndLoadCss('css', 'css/font.css');
    preprocessAndLoadCss('css', 'css/base.css');
    preprocessAndLoadCss('css', 'css/editor.css');
    preprocessAndLoadCss('css', 'css/editorleftpanel.css');
    preprocessAndLoadCss('css', 'css/editorstage.css');
    preprocessAndLoadCss('css', 'css/editormodal.css');
    preprocessAndLoadCss('css', 'css/librarymodal.css');
    preprocessAndLoadCss('css', 'css/paintlook.css');

    // Load locale strings then media catalogue, then start the app.
    Localization.includeLocales('./', function () {
        MediaLib.loadMediaLib('./', function () {
            ScratchJr.appinit();
        });
    });
};
