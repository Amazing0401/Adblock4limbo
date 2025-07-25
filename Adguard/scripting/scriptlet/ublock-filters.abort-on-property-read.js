/*******************************************************************************

    uBlock Origin Lite - a comprehensive, MV3-compliant content blocker
    Copyright (C) 2014-present Raymond Hill

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/gorhill/uBlock

*/

// ruleset: ublock-filters

// Important!
// Isolate from global scope

// Start of local scope
(function uBOL_abortOnPropertyRead() {

/******************************************************************************/

function abortOnPropertyRead(
    chain = ''
) {
    if ( typeof chain !== 'string' ) { return; }
    if ( chain === '' ) { return; }
    const safe = safeSelf();
    const logPrefix = safe.makeLogPrefix('abort-on-property-read', chain);
    const exceptionToken = getExceptionTokenFn();
    const abort = function() {
        safe.uboLog(logPrefix, 'Aborted');
        throw new ReferenceError(exceptionToken);
    };
    const makeProxy = function(owner, chain) {
        const pos = chain.indexOf('.');
        if ( pos === -1 ) {
            const desc = Object.getOwnPropertyDescriptor(owner, chain);
            if ( !desc || desc.get !== abort ) {
                Object.defineProperty(owner, chain, {
                    get: abort,
                    set: function(){}
                });
            }
            return;
        }
        const prop = chain.slice(0, pos);
        let v = owner[prop];
        chain = chain.slice(pos + 1);
        if ( v ) {
            makeProxy(v, chain);
            return;
        }
        const desc = Object.getOwnPropertyDescriptor(owner, prop);
        if ( desc && desc.set !== undefined ) { return; }
        Object.defineProperty(owner, prop, {
            get: function() { return v; },
            set: function(a) {
                v = a;
                if ( a instanceof Object ) {
                    makeProxy(a, chain);
                }
            }
        });
    };
    const owner = window;
    makeProxy(owner, chain);
}

function getExceptionTokenFn() {
    const token = getRandomTokenFn();
    const oe = self.onerror;
    self.onerror = function(msg, ...args) {
        if ( typeof msg === 'string' && msg.includes(token) ) { return true; }
        if ( oe instanceof Function ) {
            return oe.call(this, msg, ...args);
        }
    }.bind();
    return token;
}

function safeSelf() {
    if ( scriptletGlobals.safeSelf ) {
        return scriptletGlobals.safeSelf;
    }
    const self = globalThis;
    const safe = {
        'Array_from': Array.from,
        'Error': self.Error,
        'Function_toStringFn': self.Function.prototype.toString,
        'Function_toString': thisArg => safe.Function_toStringFn.call(thisArg),
        'Math_floor': Math.floor,
        'Math_max': Math.max,
        'Math_min': Math.min,
        'Math_random': Math.random,
        'Object': Object,
        'Object_defineProperty': Object.defineProperty.bind(Object),
        'Object_defineProperties': Object.defineProperties.bind(Object),
        'Object_fromEntries': Object.fromEntries.bind(Object),
        'Object_getOwnPropertyDescriptor': Object.getOwnPropertyDescriptor.bind(Object),
        'Object_hasOwn': Object.hasOwn.bind(Object),
        'RegExp': self.RegExp,
        'RegExp_test': self.RegExp.prototype.test,
        'RegExp_exec': self.RegExp.prototype.exec,
        'Request_clone': self.Request.prototype.clone,
        'String': self.String,
        'String_fromCharCode': String.fromCharCode,
        'String_split': String.prototype.split,
        'XMLHttpRequest': self.XMLHttpRequest,
        'addEventListener': self.EventTarget.prototype.addEventListener,
        'removeEventListener': self.EventTarget.prototype.removeEventListener,
        'fetch': self.fetch,
        'JSON': self.JSON,
        'JSON_parseFn': self.JSON.parse,
        'JSON_stringifyFn': self.JSON.stringify,
        'JSON_parse': (...args) => safe.JSON_parseFn.call(safe.JSON, ...args),
        'JSON_stringify': (...args) => safe.JSON_stringifyFn.call(safe.JSON, ...args),
        'log': console.log.bind(console),
        // Properties
        logLevel: 0,
        // Methods
        makeLogPrefix(...args) {
            return this.sendToLogger && `[${args.join(' \u205D ')}]` || '';
        },
        uboLog(...args) {
            if ( this.sendToLogger === undefined ) { return; }
            if ( args === undefined || args[0] === '' ) { return; }
            return this.sendToLogger('info', ...args);
            
        },
        uboErr(...args) {
            if ( this.sendToLogger === undefined ) { return; }
            if ( args === undefined || args[0] === '' ) { return; }
            return this.sendToLogger('error', ...args);
        },
        escapeRegexChars(s) {
            return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        },
        initPattern(pattern, options = {}) {
            if ( pattern === '' ) {
                return { matchAll: true, expect: true };
            }
            const expect = (options.canNegate !== true || pattern.startsWith('!') === false);
            if ( expect === false ) {
                pattern = pattern.slice(1);
            }
            const match = /^\/(.+)\/([gimsu]*)$/.exec(pattern);
            if ( match !== null ) {
                return {
                    re: new this.RegExp(
                        match[1],
                        match[2] || options.flags
                    ),
                    expect,
                };
            }
            if ( options.flags !== undefined ) {
                return {
                    re: new this.RegExp(this.escapeRegexChars(pattern),
                        options.flags
                    ),
                    expect,
                };
            }
            return { pattern, expect };
        },
        testPattern(details, haystack) {
            if ( details.matchAll ) { return true; }
            if ( details.re ) {
                return this.RegExp_test.call(details.re, haystack) === details.expect;
            }
            return haystack.includes(details.pattern) === details.expect;
        },
        patternToRegex(pattern, flags = undefined, verbatim = false) {
            if ( pattern === '' ) { return /^/; }
            const match = /^\/(.+)\/([gimsu]*)$/.exec(pattern);
            if ( match === null ) {
                const reStr = this.escapeRegexChars(pattern);
                return new RegExp(verbatim ? `^${reStr}$` : reStr, flags);
            }
            try {
                return new RegExp(match[1], match[2] || undefined);
            }
            catch {
            }
            return /^/;
        },
        getExtraArgs(args, offset = 0) {
            const entries = args.slice(offset).reduce((out, v, i, a) => {
                if ( (i & 1) === 0 ) {
                    const rawValue = a[i+1];
                    const value = /^\d+$/.test(rawValue)
                        ? parseInt(rawValue, 10)
                        : rawValue;
                    out.push([ a[i], value ]);
                }
                return out;
            }, []);
            return this.Object_fromEntries(entries);
        },
        onIdle(fn, options) {
            if ( self.requestIdleCallback ) {
                return self.requestIdleCallback(fn, options);
            }
            return self.requestAnimationFrame(fn);
        },
        offIdle(id) {
            if ( self.requestIdleCallback ) {
                return self.cancelIdleCallback(id);
            }
            return self.cancelAnimationFrame(id);
        }
    };
    scriptletGlobals.safeSelf = safe;
    if ( scriptletGlobals.bcSecret === undefined ) { return safe; }
    // This is executed only when the logger is opened
    safe.logLevel = scriptletGlobals.logLevel || 1;
    let lastLogType = '';
    let lastLogText = '';
    let lastLogTime = 0;
    safe.toLogText = (type, ...args) => {
        if ( args.length === 0 ) { return; }
        const text = `[${document.location.hostname || document.location.href}]${args.join(' ')}`;
        if ( text === lastLogText && type === lastLogType ) {
            if ( (Date.now() - lastLogTime) < 5000 ) { return; }
        }
        lastLogType = type;
        lastLogText = text;
        lastLogTime = Date.now();
        return text;
    };
    try {
        const bc = new self.BroadcastChannel(scriptletGlobals.bcSecret);
        let bcBuffer = [];
        safe.sendToLogger = (type, ...args) => {
            const text = safe.toLogText(type, ...args);
            if ( text === undefined ) { return; }
            if ( bcBuffer === undefined ) {
                return bc.postMessage({ what: 'messageToLogger', type, text });
            }
            bcBuffer.push({ type, text });
        };
        bc.onmessage = ev => {
            const msg = ev.data;
            switch ( msg ) {
            case 'iamready!':
                if ( bcBuffer === undefined ) { break; }
                bcBuffer.forEach(({ type, text }) =>
                    bc.postMessage({ what: 'messageToLogger', type, text })
                );
                bcBuffer = undefined;
                break;
            case 'setScriptletLogLevelToOne':
                safe.logLevel = 1;
                break;
            case 'setScriptletLogLevelToTwo':
                safe.logLevel = 2;
                break;
            }
        };
        bc.postMessage('areyouready?');
    } catch {
        safe.sendToLogger = (type, ...args) => {
            const text = safe.toLogText(type, ...args);
            if ( text === undefined ) { return; }
            safe.log(`uBO ${text}`);
        };
    }
    return safe;
}

function getRandomTokenFn() {
    const safe = safeSelf();
    return safe.String_fromCharCode(Date.now() % 26 + 97) +
        safe.Math_floor(safe.Math_random() * 982451653 + 982451653).toString(36);
}

/******************************************************************************/

const scriptletGlobals = {}; // eslint-disable-line
const argsList = [["Keen"],["MONETIZER101.init"],["JadIds"],["navigator.userAgent"],["__eiPb"],["detector"],["SmartAdServerASMI"],["_sp_._networkListenerData"],["AntiAd.check"],["_pop"],["_sp_.mms.startMsg"],["retrievalService"],["admrlWpJsonP"],["LieDetector"],["newcontent"],["ExoLoader.serve"],["stop"],["open"],["ga.length"],["btoa"],["console.clear"],["jwplayer.utils.Timer"],["adblock_added"],["exoNoExternalUI38djdkjDDJsio96"],["SBMGlobal.run.pcCallback"],["SBMGlobal.run.gramCallback"],["Date.prototype.toUTCString"],["Adcash"],["PopAds"],["runAdblock"],["showAds"],["ExoLoader"],["loadTool"],["popns"],["adBlockDetected"],["doSecondPop"],["RunAds"],["jQuery.adblock"],["ads_block"],["blockAdBlock"],["decodeURI"],["exoOpts"],["doOpen"],["prPuShown"],["document.dispatchEvent"],["document.createElement"],["pbjs.libLoaded"],["mz"],["AaDetector"],["_abb"],["Math.floor"],["jQuery.hello"],["isShowingAd"],["oms.ads_detect"],["hasAdBlock"],["ALoader"],["Notification"],["NREUM"],["ads.pop_url"],["tabUnder"],["ExoLoader.addZone"],["raConf"],["Aloader"],["advobj"],["popTimes"],["addElementToBody"],["phantomPopunders"],["CustomEvent"],["exoJsPop101"],["popjs.init"],["rmVideoPlay"],["r3H4"],["AdservingModule"],["__Y"],["__ads"],["document.createEvent"],["__NA"],["PerformanceLongTaskTiming"],["proxyLocation"],["Int32Array"],["popMagic.init"],["jwplayer.vast"],["adblock"],["dataPopUnder"],["SmartWallSDK"],["Abd_Detector"],["paywallWrapper"],["registerSlideshowAd"],["mm"],["require"],["getUrlParameter"],["_sp_"],["goafricaSplashScreenAd"],["_0xbeb9"],["popAdsClickCount"],["_wm"],["popunderSetup"],["jsPopunder"],["S9tt"],["adSSetup"],["document.cookie"],["capapubli"],["Aloader.serve"],["__htapop"],["app_vars.force_disable_adblock"],["_0x32d5"],["glxopen"],["adbackDebug"],["googletag"],["performance"],["htaUrl"],["BetterJsPop"],["setExoCookie"],["encodeURIComponent"],["ReviveBannerInterstitial"],["Debugger"],["FuckAdBlock"],["isAdEnabled"],["promo"],["_0x311a"],["console.log"],["h1mm.w3"],["checkAdblock"],["NativeAd"],["adblockblock"],["popit"],["rid"],["decodeURIComponent"],["popad"],["XMLHttpRequest"],["localStorage"],["my_pop"],["nombre_dominio"],["String.fromCharCode"],["redirectURL"],["TID"],["adsanity_ad_block_vars"],["pace"],["pa"],["td_ad_background_click_link"],["onload"],["checkAds"],["popjs"],["detector_launch"],["Popunder"],["Date.prototype.toGMTString"],["initPu"],["jsUnda"],["adtoniq"],["myFunction_ads"],["popunder"],["Pub2a"],["alert"],["V4ss"],["popunders"],["aclib"],["sc_adv_out"],["pageParams.dispAds"],["document.bridCanRunAds"],["pu"],["MessageChannel"],["advads_passive_ads"],["pmc_admanager.show_interrupt_ads"],["$REACTBASE_STATE.serverModules.push"],["scriptwz_url"],["setNptTechAdblockerCookie"],["loadRunative"],["pwparams"],["fuckAdBlock"],["detectAdBlock"],["adsBlocked"],["Base64"],["parcelRequire"],["EviPopunder"],["preadvercb"],["$ADP"],["MG2Loader"],["Connext"],["adUnits"],["b2a"],["angular"],["downloadJSAtOnload"],["penci_adlbock"],["Number.isNaN"],["doads"],["adblockDetector"],["adblockDetect"],["initAdserver"],["splashpage.init"],["___tp"],["STREAM_CONFIGS"],["mdpDeBlocker"],["googlefc"],["ppload"],["RegAdBlocking"],["checkABlockP"],["mdp_deblocker"],["adthrive"],["tie"],["document.write"],["ignore_adblock"],["$.prototype.offset"],["ea.add"],["adcashMacros"],["_cpp"],["pareAdblock"],["clickCount"],["xmlhttp"],["document.oncontextmenu"],["shortcut"],["Swal.fire"],["bypass_url"],["document.onmousedown"],["SMart1"],["checkAdsBlocked"],["navigator.brave"],["Light.Popup"],["htmls"],["embedAddefend"],["adsbyjuicy"],["ExoDetector"],["Pub2"],["adver.abFucker.serve"],["zfgformats"],["zfgstorage"],["jQuery.popunder"],["__cmpGdprAppliesGlobally"],["HTMLIFrameElement"],["dsanity_ad_block_vars"],["videootv"],["detectAdBlocker"],["Drupal.behaviors.agBlockAdBlock"],["NoAdBlock"],["mMCheckAgainBlock"],["noAdBlockers"],["GetWindowHeight"],["show_ads"],["google_ad_status"],["u_cfg"],["adthrive.config"],["TotemToolsObject"],["noAdBlock"],["advads_passive_groups"],["GLX_GLOBAL_UUID_RESULT"],["document.head.appendChild"],["canRunAds"],["indexedDB.open"],["checkCookieClick"],["wpsite_clickable_data"],["mnpwclone"],["SluttyPops"],["sites_urls_pops"],["popUp"],["rccbase_styles"],["adBlockerDetected"],["adp"],["popundrCheck"],["history.replaceState"],["rexxx.swp"],["ai_run_scripts"],["bizpanda"],["Q433"],["isAdBlockActive"],["Element.prototype.attachShadow"],["document.body.appendChild"],["SPHMoverlay"],["disableDeveloperTools"],["google_jobrunner"],["popupBlocker"],["DoodPop"],["SmartPopunder.make"],["evolokParams.adblock"],["JSON.parse"],["document.referrer"],["cainPopUp"],["pURL"],["inhumanity_pop_var_name"],["app_vars.please_disable_adblock"],["afScript"],["history.back"],["String.prototype.charCodeAt"],["Overlayer"],["puShown"],["chp_adblock_browser"],["Request"],["fallbackAds"],["checkAdsStatus"],["advanced_ads_ready"],["PvVideoSlider"],["preroll_helper.advs"],["loadXMLDoc"],["arrvast"],["Script_Manager"],["Script_Manager_Time"],["document.body.insertAdjacentHTML"],["tic"],["pu_url"],["onAdblockerDetected"],["checkBlock"],["adsbygoogle.loaded"],["asgPopScript"],["Object"],["Object.prototype.loadCosplay"],["Object.prototype.loadImages"],["FMPoopS"],["importantFunc"],["console.warn"],["adsRedirectPopups"],["afStorage"],["eazy_ad_unblocker"],["antiAdBlockerHandler"],["killAdKiller"],["aoAdBlockDetected"],["ai_wait_for_jquery"],["checkAdBlock"],["VAST"],["eazy_ad_unblocker_dialog_opener"],["adConfig"],["GeneratorAds"],["aab"],["config"],["runad"],["atob"],["__brn_private_mode"],["start"],["__aaZoneid"],["adc"],["document.body.style.backgroundPosition"],["showada"],["popUrl"],["popurl"],["EV.Dab"],["Object.prototype.popupOpened"],["pum_popups"],["document.documentElement.clientWidth"],["Dataffcecd"],["app_advert"],["odabd"],["ConsoleBan"],["disableDevtool"],["ondevtoolopen"],["onkeydown"],["window.location.href"],["window.history.back"],["document.onkeydown"],["close"],["_oEa"],["dataLayer"],["WebAssembly"],["miner"]];
const hostnamesMap = new Map([["pythonjobshq.com",0],["cyclingnews.com",[1,7]],["sensacine.com",2],["aranzulla.it",3],["wetteronline.*",4],["anallievent.com",4],["au-di-tions.com",4],["badgehungry.com",4],["beingmelody.com",4],["bloggingawaydebt.com",4],["casutalaurei.ro",4],["cornerstoneconfessions.com",4],["culture-informatique.net",4],["dearcreatives.com",4],["disneyfashionista.com",4],["divinelifestyle.com",4],["dna.fr",4],["eslauthority.com",4],["estrepublicain.fr",4],["fitting-it-all-in.com",4],["heresyoursavings.com",4],["irresistiblepets.net",4],["julieseatsandtreats.com",4],["justjared.com",4],["lecturisiarome.ro",4],["lemonsqueezyhome.com",4],["libramemoria.com",4],["lovegrowswild.com",4],["magicseaweed.com",4],["measuringflower.com",4],["mjsbigblog.com",4],["mommybunch.com",4],["mustardseedmoney.com",4],["myfunkytravel.com",4],["onetimethrough.com",4],["panlasangpinoymeatrecipes.com",4],["silverpetticoatreview.com",4],["the-military-guide.com",4],["therelaxedhomeschool.com",4],["the2seasons.com",4],["zeroto60times.com",4],["barefeetonthedashboard.com",4],["bargainbriana.com",4],["betterbuttchallenge.com",4],["bike-urious.com",4],["blwideas.com",4],["eartheclipse.com",4],["entertainment-focus.com",4],["fanatik.com.tr",4],["foreverconscious.com",4],["foreversparkly.com",4],["getdatgadget.com",4],["goodnewsnetwork.org",4],["greenarrowtv.com",4],["hbculifestyle.com",4],["heysigmund.com",4],["hodgepodgehippie.com",4],["homestratosphere.com",4],["indesignskills.com",4],["katiescucina.com",4],["knowyourphrase.com",4],["letsworkremotely.com",4],["lizs-early-learning-spot.com",4],["ledauphine.com",4],["leprogres.fr",4],["milliyet.com.tr",4],["pinoyrecipe.net",4],["prepared-housewives.com",4],["redcarpet-fashionawards.com",4],["republicain-lorrain.fr",4],["savespendsplurge.com",4],["savingadvice.com",4],["shutupandgo.travel",4],["spring.org.uk",4],["stevivor.com",4],["tamaratattles.com",4],["tastefullyeclectic.com",4],["theavtimes.com",4],["thechroniclesofhome.com",4],["thisisourbliss.com",4],["tinyqualityhomes.org",4],["turtleboysports.com",4],["ultimateninjablazingx.com",4],["universfreebox.com",4],["utahsweetsavings.com",4],["vgamerz.com",4],["wheatbellyblog.com",4],["yummytummyaarthi.com",4],["ranker.com",[4,108]],["fluentu.com",4],["cdiscount.com",4],["damndelicious.net",4],["simplywhisked.com",4],["timesofindia.com",5],["bild.de",6],["sueddeutsche.de",7],["20min.ch",7],["al.com",7],["alphr.com",7],["autoexpress.co.uk",7],["bikeradar.com",7],["blick.ch",7],["chefkoch.de",7],["digitalspy.com",7],["democratandchronicle.com",7],["denofgeek.com",7],["esgentside.com",7],["evo.co.uk",7],["exclusivomen.com",7],["ft.com",7],["gala.de",7],["gala.fr",7],["heatworld.com",7],["itpro.co.uk",7],["livingathome.de",7],["masslive.com",7],["maxisciences.com",7],["metabomb.net",7],["mlive.com",7],["motherandbaby.co.uk",7],["motorcyclenews.com",7],["muthead.com",7],["neonmag.fr",7],["newyorkupstate.com",7],["ngin-mobility.com",7],["nj.com",7],["nola.com",7],["ohmirevista.com",7],["ohmymag.*",7],["oregonlive.com",7],["pennlive.com",7],["programme.tv",7],["programme-tv.net",7],["radiotimes.com",7],["silive.com",7],["simplyvoyage.com",7],["stern.de",7],["syracuse.com",7],["theweek.co.uk",7],["ydr.com",7],["usatoday.com",7],["schoener-wohnen.de",7],["thewestmorlandgazette.co.uk",7],["news-leader.com",7],["etonline.com",7],["bilan.ch",7],["doodle.com",7],["techradar.com",7],["daily-times.com",7],["wirralglobe.co.uk",7],["annabelle.ch",7],["pcgamer.com",7],["nintendolife.com",7],["gamer.com.tw",8],["skidrowcodexgames.com",9],["durtypass.com",9],["anime-odcinki.pl",9],["gaypornwave.com",[9,31]],["pingit.*",[9,17,48,70]],["oload.*",[9,17,40,48]],["streamhoe.*",[9,17]],["eltern.de",10],["essen-und-trinken.de",10],["focus.de",10],["eurogamer.de",10],["eurogamer.es",10],["eurogamer.it",10],["eurogamer.net",10],["eurogamer.pt",10],["rockpapershotgun.com",10],["vg247.com",10],["urbia.de",10],["elpasotimes.com",10],["femina.ch",10],["northwalespioneer.co.uk",10],["codeproject.com",11],["cwseed.com",12],["gamestorrents.*",13],["gogoanimes.*",13],["limetorrents.*",13],["piratebayz.*",13],["europixhd.*",[13,48]],["hdeuropix.*",[13,48]],["topeuropix.*",[13,48]],["vivud.com",[13,40,55,56]],["grantorrent.*",[13,90]],["moviescounter.*",13],["elixx.*",[13,72]],["telerium.*",13],["savelinks.*",13],["hentaisd.*",13],["7r6.com",[13,20,104]],["mrpiracy.*",13],["bostoncommons.net",13],["reddflix.com",[13,17]],["opisanie-kartin.com",13],["painting-planet.com",13],["kropic.com",[13,40]],["mp4mania1.net",13],["livegore.com",13],["kioven.com",13],["pngio.com",13],["iobit.com",13],["khatrimazafull.*",13],["mov2day.*",13],["pornproxy.art",13],["pornproxy.app",13],["moviemaniak.com",13],["vegamovvies.to",13],["pagalfree.com",13],["rule34.xxx",14],["realbooru.com",15],["alrincon.com",[15,17,32]],["realgfporn.com",[15,31]],["pornhd.com",[15,54]],["pornhdin.com",[15,17]],["pornomovies.com",[15,40]],["bdsmstreak.com",15],["freepornvideo.sex",15],["teenpornvideo.xxx",15],["yourlust.com",15],["imx.to",15],["mypornstarbook.net",15],["japanesefuck.com",15],["imgtorrnt.in",[15,44]],["prostoporno.*",15],["pandamovies.pw",[15,44]],["club-flank.com",15],["watchfreexxx.net",[15,31,145,146,147]],["dump.xxx",[15,17]],["fuqer.com",[15,17]],["tmohentai.com",15],["xopenload.me",15],["losporn.org",15],["bravoerotica.com",15],["xasiat.com",[15,68]],["redporno.cz",15],["vintageporntubes.com",15],["xxxvideos247.com",15],["young-pussy.com",15],["kingsofteens.com",15],["8teenxxx.com",15],["activevoyeur.com",15],["allschoolboysecrets.com",15],["boobsforfun.com",15],["breedingmoms.com",15],["cockmeter.com",[15,44]],["collegeteentube.com",15],["cumshotlist.com",15],["porn0.tv",15],["ritzysex.com",15],["ritzyporn.com",15],["sexato.com",15],["javbobo.com",[15,23]],["sokobj.com",15],["24pornvideos.com",15],["2japaneseporn.com",15],["xxxvideor.com",15],["youngleak.com",15],["zhlednito.cz",15],["needgayporn.com",15],["zetporn.com",15],["grubstreet.com",16],["twitchy.com",16],["rule34hentai.net",17],["animepahe.*",[17,28]],["kwik.*",[17,28]],["clik.pw",17],["ah-me.com",17],["1337x.unblock2.xyz",[17,19,50]],["1337x.unblocked.*",17],["1337x.unblockit.*",[17,19]],["mitly.us",[17,34]],["pussyspace.*",17],["urlcero.*",17],["linkrex.net",17],["shrtfly.*",[17,59]],["oke.io",17],["watchmygf.me",17],["linkshorts.*",17],["streamcdn.*",[17,48]],["pornoreino.com",[17,31]],["shrt10.com",17],["turbobit.net",17],["bestialitysexanimals.com",17],["bestialporn.com",17],["mujeresdesnudas.club",17],["mynakedwife.video",17],["videoszoofiliahd.com",17],["efukt.com",17],["tranny.one",[17,23]],["vinaurl.*",[17,104]],["porndoe.com",[17,31]],["topvideosgay.com",17],["goto.com.np",17],["femdomtb.com",17],["pornvideotop.com",17],["tryboobs.com",[17,23]],["fapality.com",[17,44]],["babesxworld.com",[17,32,44]],["icutlink.com",17],["oncehelp.com",17],["picbaron.com",[17,32]],["mega-p2p.net",17],["shrinkearn.com",17],["twister.porn",17],["komikcast.*",17],["bitlk.com",17],["bolly4u.*",[17,129]],["tugaflix.*",17],["hdfriday.*",17],["123movies.*",17],["shortearn.*",[17,48]],["peekvids.com",17],["playvids.com",17],["pornflip.com",17],["pornoeggs.com",17],["oko.sh",[17,48]],["turbogvideos.com",17],["watch4hd.*",17],["gdtot.*",17],["shrink.*",[17,34,104]],["xxx-image.com",[17,26,129,170]],["coinlyhub.com",[17,104]],["zimabdko.com",17],["bluemediafiles.*",17],["fullxxxmovies.net",17],["elitegoltv.org",17],["extremotvplay.com",17],["semawur.com",17],["adshrink.it",17],["shrink-service.it",[17,348]],["dailysport.*",[17,48]],["eplsite.uk",[17,48]],["upstream.to",17],["dramakrsubindo.blogspot.com",17],["ex-foary.com",[17,104]],["oceanof-games.com",17],["watchmonkonline.com",17],["iir.ai",[17,104]],["btdb.*",[17,20]],["porncomics.me",17],["orsm.net",17],["linksfire.*",17],["enagato.com",17],["bluemediadownload.*",[17,40]],["bluemediafile.*",[17,40]],["bluemedialink.*",[17,40]],["bluemediastorage.*",[17,40]],["bluemediaurls.*",[17,40]],["urlbluemedia.*",[17,40]],["cloutgist.com",17],["youshort.me",17],["shortylink.store",17],["savetub.com",17],["earnbee.xyz",17],["pornj.com",17],["comicxxx.eu",17],["mybestxtube.com",[17,44]],["pornobengala.com",17],["pornicom.com",[17,44]],["xecce.com",17],["teensporn.tv",[17,44]],["pornlift.com",17],["deinesexfilme.com",17],["einfachtitten.com",17],["lesbenhd.com",17],["milffabrik.com",17],["porn-monkey.com",17],["porndrake.com",17],["pornhubdeutsch.net",17],["pornoaffe.com",17],["pornodavid.com",17],["pornoente.tv",17],["pornofisch.com",17],["pornofelix.com",17],["pornohammer.com",17],["pornohelm.com",17],["pornoklinge.com",17],["pornotom.com",17],["pornotommy.com",17],["pornovideos-hd.com",17],["pornozebra.com",17],["xhamsterdeutsch.xyz",17],["xnxx-sexfilme.com",17],["videoplayer.*",17],["uploadroot.com",17],["link1s.*",[17,104]],["deepfakeporn.net",17],["pkr.pw",[17,104]],["loader.to",17],["namaidani.com",[17,104]],["shorttey.*",[17,104]],["anime47.com",17],["cutearn.net",[17,104]],["filezipa.com",[17,104]],["theblissempire.com",[17,104]],["bestgamehack.top",17],["hackofgame.com",17],["movizland.*",17],["shorturl.unityassets4free.com",[17,104]],["vevioz.com",[17,104]],["charexempire.com",[17,277]],["crunchyscan.fr",17],["unblocksite.pw",[17,129]],["y2mate.com",17],["androidapks.biz",17],["androidsite.net",17],["animesite.net",17],["computercrack.com",17],["crackedsoftware.biz",17],["crackfree.org",17],["downloadgames.info",17],["downloadsite.org",17],["ebooksite.org",17],["emulatorsite.com",17],["freeflix.info",17],["freemoviesu4.com",17],["freesoccer.net",17],["fseries.org",17],["gamefast.org",17],["gamesite.info",17],["gostreamon.net",17],["hindisite.net",17],["isosite.org",17],["macsite.info",17],["mangasite.org",17],["megamovies.org",17],["moviefree2.com",17],["moviesite.app",17],["moviesx.org",17],["musicsite.biz",17],["patchsite.net",17],["pdfsite.net",17],["play1002.com",17],["productkeysite.com",17],["romsite.org",17],["seriesite.net",17],["siteapk.net",17],["siteflix.org",17],["sitegames.net",17],["sitekeys.net",17],["sitepdf.com",17],["sitesunblocked.*",17],["sitetorrent.com",17],["softwaresite.net",17],["superapk.org",17],["tvonlinesports.com",17],["warezsite.net",17],["watchmovies2.com",17],["watchsite.net",17],["youapk.net",17],["1377x.*",17],["gload.to",17],["bcvc.*",17],["bloggingguidance.com",17],["jockantv.com",17],["moviehaxx.pro",17],["hitomi.la",17],["receive-sms-online.info",18],["steamplay.*",[19,20,21]],["pornult.com",[19,68]],["fullhdxxx.com",[19,31]],["lendrive.web.id",19],["nimegami.id",19],["streamp1ay.*",[20,21]],["short.pe",[20,48]],["mylust.com",[20,44]],["anysex.com",[20,31,40,44,112]],["topflix.*",20],["ustream.*",20],["luscious.net",20],["cloudgallery.net",[20,48]],["alotporn.com",[20,44]],["imgair.net",20],["imgblaze.net",20],["imgfrost.net",20],["vestimage.site",20],["pixlev.*",20],["pixbryexa.sbs",20],["picbqqa.sbs",20],["pixbkghxa.sbs",20],["imgmgf.sbs",20],["picbcxvxa.sbs",20],["imguee.sbs",20],["imgmffmv.sbs",20],["imgbqb.sbs",20],["imgbyrev.sbs",20],["imgbncvnv.sbs",20],["pixtryab.shop",20],["imggune.shop",20],["pictryhab.shop",20],["pixbnab.shop",20],["imgbnwe.shop",20],["imgbbnhi.shop",20],["imgnbii.shop",20],["imghqqbg.shop",20],["imgyhq.shop",20],["pixnbrqwg.sbs",20],["pixnbrqw.sbs",20],["picmsh.sbs",20],["imgpke.sbs",20],["picuenr.sbs",20],["imgolemn.sbs",20],["imgoebn.sbs",20],["picnwqez.sbs",20],["imgjajhe.sbs",20],["pixjnwe.sbs",20],["pixkfjtrkf.shop",20],["pixkfkf.shop",20],["pixdfdjkkr.shop",20],["pixdfdj.shop",20],["picnft.shop",20],["pixrqqz.shop",20],["picngt.shop",20],["picjgfjet.shop",20],["picjbet.shop",20],["imgkkabm.shop",20],["imgxabm.shop",20],["imgthbm.shop",20],["imgmyqbm.shop",20],["imgwwqbm.shop",20],["imgjvmbbm.shop",20],["imgjbxzjv.shop",20],["imgjmgfgm.shop",20],["picxnkjkhdf.sbs",20],["imgxxbdf.sbs",20],["imgnngr.sbs",20],["imgjjtr.sbs",20],["imgqbbds.sbs",20],["imgbvdf.sbs",20],["imgqnnnebrf.sbs",20],["imgnnnvbrf.sbs",20],["pornfd.com",20],["xsanime.com",20],["camclips.tv",20],["moviessources.*",20],["steanplay.*",21],["stemplay.*",21],["streanplay.*",21],["asianclub.*",[21,48,73]],["mavplay.*",[21,73,88]],["ujav.me",[21,73]],["videobb.*",[21,73,88,106]],["shameless.com",[21,23,60]],["txxx.*",21],["informer.com",22],["myreadingmanga.info",23],["sunporno.com",[23,60]],["adultdvdparadise.com",23],["freeomovie.info",23],["fullxxxmovies.me",23],["mangoporn.co",23],["netflixporno.net",23],["pandamovie.*",23],["pandamovies.me",23],["pornkino.cc",23],["pornwatch.ws",23],["speedporn.*",23],["watchfreexxx.pw",23],["watchpornfree.*",23],["watchxxxfree.pw",23],["xopenload.pw",23],["xtapes.me",23],["xxxparodyhd.net",23],["xxxscenes.net",23],["xxxstream.me",23],["youwatchporn.com",23],["8boobs.com",[23,32,60]],["babesinporn.com",[23,32,44,60]],["bustybloom.com",[23,32]],["hotstunners.com",[23,32,60]],["nudebabes.sexy",[23,60]],["pleasuregirl.net",[23,32,60]],["rabbitsfun.com",[23,32,60]],["silkengirl.*",[23,32,60]],["asiansex.life",23],["nudismteens.com",23],["youx.xxx",23],["pornxp.com",[23,48]],["hypnohub.net",23],["xnxxporn.video",23],["xxxdessert.com",23],["xxxshake.com",23],["manhwa18.cc",23],["best18porn.com",23],["bigtitslust.com",[23,261]],["manga18fx.com",23],["sexywomeninlingerie.com",23],["oosex.net",[23,44]],["theteensexy.com",23],["xteensex.net",23],["stiflersmoms.com",23],["gifhq.com",23],["amateur-couples.com",23],["teen-hd-sex.com",23],["tube-teen-18.com",23],["xxx-asian-tube.com",23],["bibme.org",24],["citationmachine.net",[24,25]],["citethisforme.com",25],["easybib.com",25],["biqle.*",26],["otakuindo.*",26],["1plus1plus1equals1.net",26],["cooksinfo.com",26],["heatherdisarro.com",26],["thesassyslowcooker.com",26],["mp4upload.com",27],["watchseries.*",27],["cricstream.me",27],["catchthrust.net",27],["championdrive.co",27],["evfancy.link",27],["megacanais.com",27],["tous-sports.ru",27],["ugreen.autos",27],["hyhd.org",[27,155]],["streamtape.*",27],["watchadsontape.com",27],["livesport24.net",27],["vipboxtv.*",27],["m2list.com",27],["123mf9.my",27],["pepperlivestream.online",27],["vidsrc.*",[27,48,73]],["streambucket.net",27],["sanet.lc",27],["antenasport.online",27],["apkship.shop",27],["browncrossing.net",27],["dudestream.com",27],["elgolestv.pro",27],["embedstreams.me",27],["engstreams.shop",27],["eyespeeled.click",27],["flostreams.xyz",27],["ilovetoplay.xyz",27],["joyousplay.xyz",27],["nativesurge.info",27],["pawastreams.org",27],["ripplestream4u.shop",27],["rojadirectaenvivo.pl",27],["sansat.link",27],["smartermuver.com",27],["sportsnest.co",27],["sportsurge.net",27],["streameast.*",27],["tarjetarojaenvivo.lat",27],["techcabal.net",27],["volokit2.com",27],["ythd.org",27],["kaas.ro",[27,155]],["rivestream.live",27],["flix-wave.lol",27],["redvido.com",27],["adbypass.org",27],["bypass.city",27],["dailypudding.com",[27,155]],["fromwatch.com",[27,155]],["visualnewshub.com",[27,155]],["affordwonder.net",27],["yts.*",29],["sarugbymag.co.za",30],["ikaza.net",30],["imgadult.com",[31,32]],["imgdrive.net",[31,32]],["imgtaxi.com",[31,32]],["imgwallet.com",[31,32]],["hdpornt.com",31],["4tube.com",31],["pornerbros.com",[31,44]],["pichaloca.com",31],["pornodoido.com",31],["pornwatchers.com",[31,44]],["gotporn.com",31],["picturelol.com",31],["imgspice.com",31],["orgyxxxhub.com",[31,62,63]],["befap.com",31],["alphaporno.com",31],["tubedupe.com",31],["sexykittenporn.com",[31,32]],["letmejerk.com",31],["letmejerk2.com",31],["letmejerk3.com",31],["letmejerk4.com",31],["letmejerk5.com",31],["letmejerk6.com",31],["letmejerk7.com",31],["sexvid.*",[31,159]],["hdtube.porn",31],["madchensex.com",31],["canalporno.com",31],["eroxia.com",31],["pornozot.com",31],["teensexvideos.me",31],["goshow.tv",31],["hentaigo.com",[32,71]],["lolhentai.net",32],["camwhores.*",[32,95]],["camwhorestv.*",[32,95]],["porntopic.com",32],["cocogals.com",[32,44]],["camwhoreshd.com",32],["hotbabes.tv",[32,95]],["consoletarget.com",32],["pussytorrents.org",32],["ftopx.com",[32,60,68]],["boobgirlz.com",32],["fooxybabes.com",32],["jennylist.xyz",32],["jumboporn.xyz",32],["mainbabes.com",[32,60]],["mysexybabes.com",[32,60]],["nakedbabes.club",[32,60]],["sexybabesz.com",[32,60]],["vibraporn.com",32],["zazzybabes.com",32],["zehnporn.com",32],["naughtymachinima.com",32],["imgbaron.com",32],["decorativemodels.com",32],["erowall.com",[32,44]],["freyalist.com",32],["guruofporn.com",32],["jesseporn.xyz",32],["kendralist.com",32],["vipergirls.to",32],["lizardporn.com",32],["wantedbabes.com",[32,44]],["exgirlfriendmarket.com",32],["nakedneighbour.com",32],["moozpussy.com",32],["zoompussy.com",32],["2adultflashgames.com",32],["123strippoker.com",32],["babepedia.com",32],["boobieblog.com",32],["borwap.xxx",32],["gamesofdesire.com",32],["hd-xxx.me",32],["hentaipins.com",[32,256]],["longporn.xyz",32],["picmoney.org",32],["pornhd720p.com",32],["sikwap.xyz",32],["super-games.cz",32],["xxx-videos.org",32],["xxxputas.net",32],["mysexgames.com",32],["picdollar.com",32],["eroticity.net",32],["striptube.net",32],["xcity.org",32],["rintor.*",32],["porncoven.com",32],["imgsen.*",[32,67]],["imgsto.*",[32,67]],["pics4upload.com",32],["myporntape.com",32],["asianlbfm.net",32],["schoolgirls-asia.org",32],["sxyprn.*",33],["luxuretv.com",33],["asiangay.tv",33],["bootstrample.com",33],["gayxx.net",[33,219]],["hentairead.io",33],["japangaysex.com",33],["mangagun.net",33],["nicomanga.com",33],["nudeslegion.com",33],["rawinu.com",33],["watchsouthpark.tv",33],["weloma.art",33],["welovemanga.one",33],["javcock.com",33],["otomi-games.com",33],["redhdtube.xxx",33],["rat.xxx",33],["hispasexy.org",[33,204]],["javplay.me",33],["leviathanmanga.com",33],["gayfor.us",33],["juegosgratisonline.com.ar",33],["levelupalone.com",33],["x-x-x.tube",33],["javboys.com",33],["javball.com",33],["adictox.com",33],["feed2all.org",33],["hqq.*",34],["platinmods.com",34],["fotbolltransfers.com",34],["freebitcoin.win",34],["coindice.win",34],["live-tv-channels.org",34],["lookmovie.*",[34,88]],["faucethero.com",[34,40]],["faresgame.com",34],["fc.lc",[34,104]],["freebcc.org",[34,104]],["eio.io",[34,104]],["exee.io",[34,104]],["exe.app",[34,104]],["majalahpendidikan.com",34],["jaiefra.com",34],["czxxx.org",34],["sh0rt.cc",34],["fussball.news",34],["orangespotlight.com",34],["ar-atech.blogspot.com",34],["clixwarez.blogspot.com",34],["theandroidpro.com",34],["zeeebatch.blogspot.com",34],["iptvspor.com",34],["plugincim.com",34],["fivemturk.com",34],["sosyalbilgiler.net",34],["mega-hentai2.blogspot.com",34],["kollhong.com",34],["getmega.net",34],["verteleseriesonline.com",34],["imintweb.com",34],["eoreuni.com",34],["comousarzararadio.blogspot.com",34],["popsplit.us",34],["digitalstudiome.com",34],["mypussydischarge.com",[34,40]],["kontrolkalemi.com",34],["arabianbusiness.com",34],["eskiceviri.blogspot.com",34],["dj-figo.com",34],["blasianluvforever.com",34],["wgzimmer.ch",34],["familyrenders.com",34],["daburosubs.com",34],["androidgreek.com",34],["iade.com",34],["smallpocketlibrary.com",34],["hidefninja.com",34],["orangeptc.com",34],["share1223.com",34],["7misr4day.com",34],["aquiyahorajuegos.net",34],["worldofbin.com",34],["googledrivelinks.com",34],["tpaste.io",34],["g9g.eu",34],["waaw.*",[35,111]],["netu.ac",35],["vapley.*",35],["younetu.*",35],["vidscdns.com",35],["player.uwatchfree.*",[35,111,291]],["onscreens.me",[35,111,300]],["filmoviplex.com",[35,111]],["movie4night.com",[35,111]],["waaaw.*",[35,111]],["waaw1.*",[35,111]],["srt.am",36],["123link.*",[37,38,39]],["ticonsiglio.com",37],["photos-public-domain.com",39],["civilenggforall.com",39],["sheshaft.com",40],["gotgayporn.com",40],["fetishshrine.com",40],["sleazyneasy.com",40],["vikiporn.com",40],["pornomico.com",[40,65]],["cuevana3.*",[40,98]],["vidcloud.*",[40,73,111]],["watchhouseonline.net",40],["pornid.*",40],["zbporn.*",[40,118]],["pornoman.pl",[40,119]],["camseek.tv",40],["yomovies.*",40],["xxmovz.com",40],["nonsensediamond.*",40],["nonktube.com",40],["xclusivejams.*",40],["sportlemon.*",40],["sportlemons.*",40],["sportlemonx.*",40],["pussyspot.net",40],["wildpictures.net",40],["kinox.*",40],["kinoz.*",[40,48]],["modagamers.com",40],["batporno.com",40],["remaxhd.*",40],["lebahmovie.com",40],["duit.cc",40],["line25.com",40],["javtiful.com",40],["classicpornbest.com",[40,130]],["desihoes.com",[40,44]],["indianpornvideo.org",40],["slaughtergays.com",40],["sexiestpicture.com",40],["18girlssex.com",40],["manytoon.com",40],["thatav.net",40],["hentaifreak.org",40],["xxgasm.com",40],["kfapfakes.com",40],["xsober.com",40],["sexsaoy.com",40],["img4fap.*",40],["ashemaletv.com",40],["beurettekeh.com",40],["celibook.com",40],["gourmandix.com",40],["sexetag.com",40],["babeporn.*",40],["hd44.net",40],["dirtyfox.net",40],["babestube.com",40],["momvids.com",40],["porndr.com",40],["deviants.com",40],["freehardcore.com",40],["lesbian8.com",[40,261]],["babytorrent.*",40],["123moviesme.*",40],["watchmdh.to",40],["sarapbabe.com",40],["fullxxxporn.net",40],["xxxhdvideo.*",40],["qqxnxx.com",40],["xnxx-downloader.net",40],["comicspornow.com",40],["mult34.com",40],["xxxvideotube.net",40],["javqis.com",40],["35volitantplimsoles5.com",40],["peladas69.com",40],["liveru.sx",40],["protege-torrent.com",40],["freehdinterracialporn.in",40],["titsintops.com",40],["pervclips.com",40],["homemoviestube.com",40],["hdporn.net",[41,42]],["driveup.sbs",42],["older-mature.net",42],["7mmtv.*",42],["telorku.xyz",42],["watch-my-gf.com",43],["cartoonporno.xxx",43],["mangoporn.net",44],["area51.porn",44],["sexytrunk.com",44],["teensark.com",44],["tubous.com",[44,80]],["toyoheadquarters.com",44],["spycock.com",44],["barfuck.com",44],["worldsex.com",[44,56]],["multporn.net",44],["besthugecocks.com",44],["daftporn.com",44],["italianoxxx.com",44],["collegehdsex.com",44],["lustylist.com",44],["yumstories.com",44],["18-teen-porn.com",44],["69teentube.com",44],["girlshd.xxx",44],["home-xxx-videos.com",44],["orgasmlist.com",44],["teensextube.xxx",44],["pornyfap.com",44],["nudistube.com",44],["uporno.xxx",44],["ultrateenporn.com",44],["gosexpod.com",44],["al4a.com",44],["grannysex.name",44],["porntb.com",44],["scopateitaliane.it",44],["sexbox.online",44],["teenpornvideo.sex",44],["twatis.com",[44,60]],["flashingjungle.com",44],["fetishburg.com",44],["privateindianmovies.com",44],["soyoungteens.com",44],["gottanut.com",44],["uiporn.com",44],["xcafe.com",44],["gfsvideos.com",44],["home-made-videos.com",44],["tbib.org",44],["sensualgirls.org",44],["pornhat.*",44],["porno-tour.*",44],["get-to.link",[44,68]],["ariestube.com",44],["asian-teen-sex.com",44],["18asiantube.com",44],["wholevideos.com",44],["asianporntube69.com",44],["babeswp.com",44],["bangyourwife.com",44],["bdsmslavemovie.com",44],["bdsmwaytube.com",44],["bestmaturewomen.com",44],["classicpornvids.com",44],["pornpaw.com",44],["dawntube.com",44],["desimmshd.com",44],["dirtytubemix.com",44],["plumperstube.com",44],["enormousbabes.net",44],["exclusiveindianporn.com",44],["figtube.com",44],["amateur-twink.com",44],["freeboytwinks.com",44],["freegrannyvids.com",44],["freexmovs.com",44],["freshbbw.com",44],["frostytube.com",44],["fuckslutsonline.com",44],["gameofporn.com",44],["gayboyshd.com",44],["giantshemalecocks.com",44],["erofus.com",44],["hd-tube-porn.com",44],["hardcorehd.xxx",44],["hairytwat.org",44],["iwantmature.com",44],["justababes.com",44],["jenpornuj.cz",44],["javteentube.com",44],["hard-tube-porn.com",44],["klaustube.com",44],["kaboomtube.com",44],["lustyspot.com",44],["lovelynudez.com",[44,125]],["dailyangels.com",44],["ljcam.net",44],["nakenprat.com",44],["oldgrannylovers.com",44],["ohueli.net",44],["pornuploaded.net",44],["pornstarsadvice.com",44],["bobs-tube.com",44],["pornohaha.com",44],["pornmam.com",44],["pornhegemon.com",44],["pornabcd.com",44],["porn-hd-tube.com",44],["thehentaiworld.com",44],["pantyhosepink.com",44],["queenofmature.com",44],["realvoyeursex.com",44],["realbbwsex.com",44],["rawindianporn.com",44],["onlygoldmovies.com",44],["rainytube.com",44],["stileproject.com",44],["slutdump.com",44],["nastybulb.com",44],["sextube-6.com",44],["porntubegf.com",44],["sassytube.com",44],["smplace.com",44],["maturell.com",44],["pornoplum.com",44],["widewifes.com",44],["wowpornlist.xyz",44],["vulgarmilf.com",44],["oldgirlsporn.com",44],["freepornrocks.com",44],["desivideos.*",44],["beegsexxx.com",44],["watchpornx.com",[44,147]],["ytboob.com",44],["saradahentai.com",44],["hentaiarena.com",44],["absolugirl.com",44],["absolutube.com",44],["allafricangirls.net",44],["asianpornphoto.net",44],["freexxxvideos.pro",44],["videosxxxporno.gratis",44],["nude-teen-18.com",44],["xemales.com",44],["szexkepek.net",44],["wife-home-videos.com",44],["sexmadeathome.com",44],["nylondolls.com",44],["erogen.su",44],["imgprime.com",45],["ondemandkorea.com",46],["bdsmx.tube",47],["mrgay.com",47],["ouo.*",48],["songs.*",48],["gogoanimetv.*",48],["met.bz",48],["pelisplus.*",48],["streamm4u.*",48],["inkapelis.*",48],["ettv.*",48],["pelix.*",48],["pnd.*",48],["0123movie.*",48],["movies123.*",48],["senmanga.com",48],["piratebay.*",48],["webbro.*",48],["javwide.*",48],["vidhd.*",48],["cda-hd.cc",48],["mirrorace.*",48],["kurazone.net",48],["thoptv.*",48],["streamingworld.*",48],["solarmovie.*",48],["bdiptv.*",48],["cinemalibero.*",48],["pctfenix.*",[48,135]],["pctnew.*",[48,135]],["turkdown.com",48],["urlgalleries.net",48],["movie4u.live",48],["solarmovie.id",48],["01fmovies.com",48],["watchgameofthrones.*",48],["babesaround.com",48],["dirtyyoungbitches.com",48],["grabpussy.com",48],["join2babes.com",48],["nightdreambabe.com",48],["novoglam.com",48],["novohot.com",48],["novojoy.com",48],["novoporn.com",48],["novostrong.com",48],["pbabes.com",48],["pussystate.com",48],["redpornblog.com",48],["rossoporn.com",48],["sexynakeds.com",48],["thousandbabes.com",48],["gulf-up.com",48],["cutpaid.com",[48,104]],["tmearn.*",[48,104]],["mixloads.com",48],["ancensored.com",48],["shorten.*",[48,104,172]],["123animes.*",[48,106]],["openloadmovies.*",48],["savevideo.tube",48],["files.cx",48],["gdriveplayer.*",48],["drivefire.co",48],["porngo.com",48],["crichd.*",48],["arenabg.com",48],["vidload.net",48],["vipracing.*",48],["lkc21.net",48],["mavanimes.co",48],["noxx.to",48],["supervideo.*",48],["yesmovies.*",48],["ilgeniodellostreaming.*",48],["loadsamusicsarchives.blogspot.com",48],["xxxfiles.com",48],["deseneledublate.com",48],["hentaicloud.com",[48,240]],["descarga.xyz",48],["familyporn.tv",48],["pornxp.org",48],["rawmanga.top",48],["superstream.*",48],["ask4movie.*",48],["123movies-org.*",48],["aniwave.to",48],["gayteam.club",48],["sflix.*",48],["primetubsub.*",48],["mangaraw.org",48],["moviesland.*",[48,73]],["f2movies.*",48],["supertelevisionhd.com",48],["a2zapk.*",48],["autoembed.cc",48],["whisperingauroras.com",48],["live-sport.duktek.pro",48],["mcloud.*",48],["vizcloud.*",48],["vizcloud2.*",48],["daddylive.*",[48,89]],["pornxs.com",49],["movie4me.*",50],["dailygeekshow.com",51],["rue89lyon.fr",52],["onlinemschool.com",53],["bigtitsxxxsex.com",55],["gtaall.com",56],["jizzbunker.com",[56,129]],["tagesspiegel.de",56],["dailymail.co.uk",56],["ceesty.com",57],["corneey.com",57],["destyy.com",57],["festyy.com",57],["gestyy.com",57],["lavozdigital.es",57],["tnaflix.com",58],["imgdew.*",[60,67,68]],["imgmaze.*",[60,68,69]],["imgtown.*",[60,67,68,69]],["imgview.*",[60,67,68]],["angelgals.com",60],["babesexy.com",60],["hotbabeswanted.com",60],["nakedgirlsroom.com",60],["sexybabes.club",60],["sexybabesart.com",60],["favefreeporn.com",60],["onlygayvideo.com",60],["peachytube.com",60],["stepsisterfuck.me",60],["pornhost.com",61],["perfectmomsporn.com",62],["repelis.net",64],["donkparty.com",66],["imgoutlet.*",[67,68]],["imgrock.*",[67,69]],["anitube.*",68],["movisubmalay.*",[68,106]],["bdsmporn.cc",68],["cocoporn.net",68],["dirtyporn.cc",68],["faperplace.com",68],["freeadultvideos.cc",68],["freepornstream.cc",68],["generalpornmovies.com",68],["kinkyporn.cc",68],["moviesxxx.cc",68],["movstube.net",68],["onlinefetishporn.cc",68],["peetube.cc",68],["pornonline.cc",68],["porntube18.cc",68],["streamextreme.cc",68],["streamporn.cc",68],["videoxxx.cc",68],["watchporn.cc",68],["x24.video",68],["xxx24.vip",68],["xxxonline.cc",68],["xxxonlinefree.com",68],["xxxopenload.com",68],["gonzoporn.cc",68],["onlinexxx.cc",68],["tvporn.cc",68],["allporncomic.com",68],["thepiratebay.org",68],["videosection.com",68],["pornky.com",68],["tubxporn.com",68],["imgcredit.xyz",68],["waploaded.*",68],["desixxxtube.org",68],["dirtyindianporn.*",68],["freeindianporn2.com",68],["indianpornvideos.*",68],["kashtanka.*",68],["kashtanka2.com",68],["kompoz2.com",68],["onlyindianporn.*",68],["pakistaniporn2.com",68],["porno18.*",68],["xxnx.*",68],["xxxindianporn.*",68],["pmvhaven.com",68],["thepiratebay.*",69],["adsrt.*",70],["stream2watch.*",72],["peliculas-dvdrip.*",72],["mangahere.onl",[72,166]],["sfastwish.com",73],["kinoger.*",73],["iframejav.*",73],["fembed.*",[73,88]],["films5k.com",73],["mm9842.com",73],["mm9844.*",73],["mm9846.com",73],["javmvp.com",73],["0gogle.com",73],["videobot.stream",73],["vidohd.com",73],["kitabmarkaz.xyz",73],["netxwatch.*",73],["anigogo.net",[73,88]],["fbgo.*",[73,88]],["javplaya.com",73],["sbbrisk.com",[73,88]],["sbchill.com",[73,88]],["sbchip.*",[73,88]],["sbflix.*",[73,88]],["sbplay.*",[73,88]],["sbplay2.*",[73,88]],["sbplay3.*",[73,88]],["sbrity.com",[73,88]],["sbrulz.*",[73,88]],["streamsb.*",[73,88,269]],["anxcinema.*",73],["suzihaza.com",73],["javleaked.com",73],["pornhole.club",73],["jvembed.com",73],["jav247.top",73],["mavavid.com",73],["diampokusy.com",73],["vidmedia.top",73],["videofilms.*",73],["prosongs.*",73],["nsfwzone.xyz",73],["zojav.com",73],["ncdnstm.*",73],["playerjavseen.com",73],["javsubbed.xyz",73],["fembed9hd.com",73],["onscreensvideo.com",73],["filelions.*",73],["streamwish.*",73],["vidhidevip.com",73],["cloudrls.com",73],["embedwish.com",73],["fc2stream.tv",73],["javhahaha.us",73],["javlion.xyz",73],["javibe.net",73],["jvideo.xyz",73],["kissmovies.net",73],["nudecelebforum.com",74],["pronpic.org",75],["chyoa.com",76],["thisisfutbol.com",77],["pcwelt.de",78],["sixsistersstuff.com",79],["bunkr.*",80],["pouvideo.*",81],["povvideo.*",81],["povw1deo.*",81],["povwideo.*",81],["powv1deo.*",81],["powvibeo.*",81],["powvideo.*",81],["powvldeo.*",81],["insidemarketing.it",82],["worldaide.fr",82],["asmwall.com",82],["vermangasporno.com",83],["celebjihad.com",83],["dirtyship.com",83],["fullporner.com",[83,317]],["lejdd.fr",84],["gamekult.com",84],["bharian.com.my",84],["thememypc.net",85],["cityam.com",86],["inhabitat.com",87],["m4ufree.*",[88,111]],["123moviesjr.cc",88],["0123movies.*",88],["123moviesd.com",88],["gomovies.*",88],["cloudvideo.tv",88],["googlvideo.com",88],["5movies.*",88],["123moviesc.*",88],["easyexploits.com",88],["proxybit.*",88],["123movieshd.*",88],["kinoking.cc",88],["1tamilmv.*",88],["toxicwap.us",88],["buffstream.*",88],["coverapi.store",88],["tenies-online.*",88],["m4uhd.*",88],["hdhub4u.*",88],["hblinks.pro",88],["watchseries9.*",88],["afdah2.com",88],["moviesjoy.*",88],["torrentstatus.*",88],["yts2.*",88],["y2mate.*",88],["kissasia.cc",88],["alexsports.*",88],["watchsexandthecity.com",88],["2embed.*",88],["ymovies.vip",88],["cl1ca.com",88],["4br.me",88],["fir3.net",88],["seulink.*",88],["encurtalink.*",88],["fmovies.*",88],["worldfreeware.com",89],["ellibrepensador.com",89],["rexdlfile.com",89],["grantorrent1.*",90],["subtorrents.*",[90,101]],["subtorrents1.*",[90,101]],["speedtest.net",91],["livingstondaily.com",91],["goafricaonline.com",92],["link.tl",93],["lnk.news",94],["lnk.parts",94],["filesamba.*",95],["purelyceleb.com",95],["piraproxy.app",95],["theproxy.*",95],["nosteamgames.ro",95],["zootube1.com",96],["xxxtubezoo.com",96],["zooredtube.com",96],["videos1002.com",97],["sab.bz",97],["javseen.tv",97],["autobild.de",99],["alimaniac.com",100],["1xxx-tube.com",102],["asssex-hd.com",102],["bigcockfreetube.com",102],["bigdickwishes.com",102],["enjoyfuck.com",102],["freemomstube.com",102],["fuckmonstercock.com",102],["gobigtitsporn.com",102],["gofetishsex.com",102],["hard-tubesex.com",102],["hd-analporn.com",102],["hiddencamstube.com",102],["kissmaturestube.com",102],["lesbianfantasyxxx.com",102],["modporntube.com",102],["pornexpanse.com",102],["pornokeep.com",102],["pussytubeebony.com",102],["tubesex.me",102],["vintagesexpass.com",102],["voyeur-pornvideos.com",102],["voyeurspyporn.com",102],["voyeurxxxfree.com",102],["xxxtubenote.com",102],["yummysextubes.com",102],["tubexxxone.com",102],["airsextube.com",102],["asianbabestube.com",102],["bigtitsxxxfree.com",102],["blowjobpornset.com",102],["entertubeporn.com",102],["finexxxvideos.com",102],["freesexvideos24.com",102],["fuckhairygirls.com",102],["gopornindian.com",102],["grandmatube.pro",102],["grannyfucko.com",102],["grannyfuckxxx.com",102],["hiddencamhd.com",102],["hindiporno.pro",102],["indianbestporn.com",102],["japanesemomsex.com",102],["japanxxxass.com",102],["massagefreetube.com",102],["maturepussies.pro",102],["megajapansex.com",102],["new-xxxvideos.com",102],["xxxblowjob.pro",102],["xxxtubegain.com",102],["xxxvideostrue.com",102],["acutetube.net",102],["agedtubeporn.com",102],["agedvideos.com",102],["onlinegrannyporn.com",102],["freebigboobsporn.com",102],["tubeinterracial-porn.com",102],["best-xxxvideos.com",102],["bestanime-xxx.com",102],["blowxxxtube.com",102],["callfuck.com",102],["teenhubxxx.com",102],["tubepornasian.com",102],["xxxtubedot.com",102],["blowjobfucks.com",102],["dirtyasiantube.com",102],["maturewomenfucks.com",102],["pornmaturetube.com",102],["setfucktube.com",102],["tourporno.com",102],["do-xxx.com",102],["dotfreesex.com",102],["dotfreexxx.com",102],["easymilftube.net",102],["electsex.com",102],["fineretroporn.com",102],["freehqtube.com",102],["freshmaturespussy.com",102],["freshsexxvideos.com",102],["fuckedporno.com",102],["gallant-matures.com",102],["hqhardcoreporno.com",102],["girlssexxxx.com",102],["glamourxxx-online.com",102],["vintagepornnew.com",102],["tubevintageporn.com",102],["goxxxvideos.com",102],["grouppornotube.com",102],["hqxxxmovies.com",102],["hqsex-xxx.com",102],["hqamateurtubes.com",102],["hotpussyhubs.com",102],["hdpornteen.com",102],["indecentvideos.com",102],["ifreefuck.com",102],["kittyfuckstube.com",102],["lightxxxtube.com",102],["momstube-porn.com",102],["modelsxxxtube.com",102],["milfpussy-sex.com",102],["nicexxxtube.com",102],["neatpornodot.com",102],["neatfreeporn.com",102],["bigtitsporn-tube.com",102],["tubehqxxx.com",102],["nakedbbw-sex.com",102],["onlineteenhub.com",102],["online-xxxmovies.com",102],["pussyhothub.com",102],["pornxxxplace.com",102],["pornoteensex.com",102],["pornonote.pro",102],["pornoaid.com",102],["pornclipshub.com",102],["whitexxxtube.com",102],["sweetadult-tube.com",102],["sweet-maturewomen.com",102],["sexymilfsearch.com",102],["sextubedot.com",102],["hqmaxporn.com",102],["sexlargetube.com",102],["sexhardtubes.com",102],["tubepornstock.com",102],["xfuckonline.com",102],["xxxtubepass.com",102],["yourhomemadetube.com",102],["sheamateur.com",103],["cuts-url.com",104],["exe.io",[104,172]],["adsafelink.com",104],["megalink.*",104],["earnload.*",104],["modebaca.com",104],["cutdl.xyz",104],["miniurl.*",104],["smoner.com",104],["droplink.co",104],["jameeltips.us",104],["blog.linksfire.co",104],["recipestutorials.com",104],["shrinke.*",104],["shrinkme.*",104],["shrinkforearn.in",104],["qthang.net",104],["linksly.co",104],["curto.win",104],["earncash.*",104],["imagenesderopaparaperros.com",104],["shortenbuddy.com",104],["apksvip.com",104],["4cash.me",104],["shortzzy.*",104],["teknomuda.com",104],["savelink.site",104],["lite-link.*",104],["adcorto.*",104],["samaa-pro.com",104],["miklpro.com",104],["modapk.link",104],["ccurl.net",104],["dogecoin.*",104],["linkpoi.me",104],["pewgame.com",104],["crazyblog.in",104],["rshrt.com",104],["dz-linkk.com",104],["upfiles.*",104],["adurly.cc",104],["link.asiaon.top",104],["beingtek.com",104],["swzz.xyz",104],["gsm-solution.com",105],["torrentz2eu.*",106],["afilmywap.*",106],["okhatrimaza.*",106],["123anime.*",106],["gomoviesfree.*",106],["gomo.to",106],["dlapk4all.com",106],["icy-veins.com",107],["bidouillesikea.com",107],["girlsgogames.co.uk",108],["godtube.com",108],["ringsidenews.com",108],["advocate.com",108],["alternet.org",108],["androidcure.com",108],["arobasenet.com",108],["attackofthefanboy.com",108],["bodytr.com",108],["clutchpoints.com",108],["cultofmac.com",108],["currentaffairs.gktoday.in",108],["dailycaller.com",108],["digitalmusicnews.com",108],["dogtime.com",108],["dotesports.com",108],["epicstream.com",108],["fallbrook247.com",108],["feral-heart.com",108],["gamesgames.com",108],["gamerevolution.com",108],["gazettenet.com",108],["insidenova.com",108],["jetztspielen.de",108],["kasvekuvvet.net",108],["leitesculinaria.com",108],["nbcnews.com",108],["notevibes.com",108],["practicalpainmanagement.com",108],["prad.de",108],["progameguides.com",108],["pwinsider.com",108],["realityblurb.com",[108,227]],["ruinmyweek.com",108],["sanangelolive.com",108],["sanfoundry.com",108],["selfhacked.com",108],["siliconera.com",108],["simpleflying.com",108],["son.co.za",108],["sporcle.com",108],["stealthoptional.com",108],["thesportster.com",108],["upi.com",108],["visualcapitalist.com",108],["wegotthiscovered.com",108],["primagames.com",108],["alcasthq.com",109],["mzee.com",109],["supforums.com",110],["player.xxxbestsites.com",111],["megatube.xxx",111],["hot-cartoon.com",111],["richhioon.eu",111],["wowstream.top",111],["xxvideoss.net",111],["player.subespanolvip.com",111],["vidcdn.co",[111,291]],["justswallows.net",111],["player.tormalayalamhd.*",111],["koreanbj.club",111],["monstream.org",111],["player.hdgay.net",111],["telenovelas-turcas.com.es",111],["gocurrycracker.com",113],["depedlps.*",113],["xcums.com",113],["ihub.live",113],["naturalbd.com",113],["freeuseporn.com",113],["salamanca24horas.com",114],["bollywoodshaadis.com",115],["ngelag.com",116],["videovard.*",116],["huim.com",117],["cambay.tv",120],["caminspector.net",120],["camwhorespy.com",120],["camwhoria.com",120],["camgoddess.tv",120],["zemporn.com",121],["wpgdadatong.com",122],["wikifeet.com",123],["root-top.com",124],["allmomsex.com",125],["allnewindianporn.com",125],["analxxxvideo.com",125],["animalextremesex.com",125],["anime3d.xyz",125],["animefuckmovies.com",125],["animepornfilm.com",125],["animesexbar.com",125],["animesexclip.com",125],["animexxxsex.com",125],["animexxxfilms.com",125],["anysex.club",125],["apetube.asia",125],["asianfuckmovies.com",125],["asianfucktube.com",125],["asianporn.sexy",125],["asiansex.*",125],["asiansexcilps.com",125],["beeg.fund",125],["beegvideoz.com",125],["bestasiansex.pro",125],["bravotube.asia",125],["brutalanimalsfuck.com",125],["candyteenporn.com",125],["daddyfuckmovies.com",125],["desifuckonline.com",125],["exclusiveasianporn.com",125],["exteenporn.com",125],["fantasticporn.net",125],["fantasticyoungporn.com",125],["fineasiansex.com",125],["firstasianpussy.com",125],["freeindiansextube.com",125],["freepornasians.com",125],["freerealvideo.com",125],["fuck-beeg.com",125],["fuck-xnxx.com",125],["fuckfuq.com",125],["fuckundies.com",125],["gojapaneseporn.com",125],["golderotica.com",125],["goodyoungsex.com",125],["goyoungporn.com",125],["hardxxxmoms.com",125],["hdvintagetube.com",125],["hentaiporn.me",125],["hentaisexfilms.com",125],["hentaisexuality.com",125],["hot-teens-movies.mobi",125],["hotanimepornvideos.com",125],["hotanimevideos.com",125],["hotasianpussysex.com",125],["hotjapaneseshows.com",125],["hotmaturetube.com",125],["hotmilfs.pro",125],["hotorientalporn.com",125],["hotpornyoung.com",125],["hotxxxjapanese.com",125],["hotxxxpussy.com",125],["indiafree.net",125],["indianpornvideo.online",125],["japanfuck.*",125],["japanporn.*",125],["japanpornclip.com",125],["japanesetube.video",125],["japansex.me",125],["japanesexxxporn.com",125],["japansporno.com",125],["japanxxx.asia",125],["japanxxxworld.com",125],["keezmovies.surf",125],["lingeriefuckvideo.com",125],["liveanimalporn.zooo.club",125],["madhentaitube.com",125],["megahentaitube.com",125],["megajapanesesex.com",125],["megajapantube.com",125],["milfxxxpussy.com",125],["momsextube.pro",125],["momxxxass.com",125],["monkeyanimalporn.com",125],["moviexxx.mobi",125],["newanimeporn.com",125],["newjapanesexxx.com",125],["nicematureporn.com",125],["nudeplayboygirls.com",125],["originalindianporn.com",125],["originalteentube.com",125],["pig-fuck.com",125],["plainasianporn.com",125],["popularasianxxx.com",125],["pornanimetube.com",125],["pornasians.pro",125],["pornhat.asia",125],["pornjapanesesex.com",125],["pornvintage.tv",125],["primeanimesex.com",125],["realjapansex.com",125],["realmomsex.com",125],["redsexhub.com",125],["retroporn.world",125],["retrosexfilms.com",125],["sex-free-movies.com",125],["sexanimesex.com",125],["sexanimetube.com",125],["sexjapantube.com",125],["sexmomvideos.com",125],["sexteenxxxtube.com",125],["sexxxanimal.com",125],["sexyoungtube.com",125],["sexyvintageporn.com",125],["spicyvintageporn.com",125],["sunporno.club",125],["tabooanime.club",125],["teenextrem.com",125],["teenfucksex.com",125],["teenhost.net",125],["teensex.*",125],["teensexass.com",125],["tnaflix.asia",125],["totalfuckmovies.com",125],["totalmaturefuck.com",125],["txxx.asia",125],["vintagetube.*",125],["voyeurpornsex.com",125],["warmteensex.com",125],["wetasiancreampie.com",125],["wildhentaitube.com",125],["wowyoungsex.com",125],["xhamster-art.com",125],["xmovie.pro",125],["xnudevideos.com",125],["xnxxjapon.com",125],["xpics.me",125],["xvide.me",125],["xxxanimefuck.com",125],["xxxanimevideos.com",125],["xxxanimemovies.com",125],["xxxhentaimovies.com",125],["xxxhothub.com",125],["xxxjapaneseporntube.com",125],["xxxlargeporn.com",125],["xxxmomz.com",125],["xxxmovies.*",125],["xxxpornmilf.com",125],["xxxpussyclips.com",125],["xxxpussysextube.com",125],["xxxretrofuck.com",125],["xxxsex.pro",125],["xxxsexyjapanese.com",125],["xxxteenyporn.com",125],["xxxvideo.asia",125],["xxxyoungtv.com",125],["youjizzz.club",125],["youngpussyfuck.com",125],["0l23movies.*",126],["dvdporngay.com",127],["software-on.com",127],["kpopjjang.com",[127,171]],["siteunblocked.info",[127,235]],["unblocked.name",[127,235]],["uproxy2.biz",[127,235]],["za.gl",128],["activistpost.com",[129,133]],["cloudvideotv.*",130],["ladepeche.fr",130],["bitzite.com",[130,170]],["jemontremonminou.com",130],["jemontremasextape.com",130],["jemontremabite.com",130],["kinoger.ru",131],["moviesapi.club",131],["clasicotas.org",132],["movierulzlink.*",133],["newmovierulz.*",133],["3hiidude.*",133],["saveshared.com",133],["simpledownload.net",133],["compucalitv.com",134],["hot2k.com",135],["lupaste.com",135],["pornovenezolano.com.ve",135],["romnation.net",135],["venezporn.com",135],["hubzter.com",136],["collater.al",136],["nzpocketguide.com",136],["ispunlock.*",137],["tpb.*",137],["phonenumber-lookup.info",138],["maniac.de",139],["cambro.tv",140],["filerio.in",140],["call2friends.com",140],["gigaho.com",140],["trendsderzukunft.de",140],["forum.lolesporte.com",140],["mytoolz.net",140],["haoweichi.com",140],["tcheats.com",141],["tobys.dk",141],["sembunyi.in",142],["anime-jl.net",143],["fuckdy.com",144],["bdsmporntub.com",144],["femdomporntubes.com",144],["vgmlinks.*",146],["nackte.com",147],["highporn.net",147],["thegatewaypundit.com",148],["your-daily-girl.com",148],["720pxmovies.blogspot.com",149],["penis-bilder.com",150],["boyfriendtv.com",150],["dansmovies.com",150],["shegotass.info",150],["phimmoiaz.cc",150],["imgdawgknuttz.com",151],["m4maths.com",152],["poki-gdn.com",152],["sctoon.net",152],["megapornfreehd.com",153],["tonpornodujour.com",154],["thestreameast.*",155],["absentescape.net",155],["forgepattern.net",155],["vidlink.pro",155],["nflscoop.xyz",155],["onepiecepower.com",155],["bezpolitickekorektnosti.cz",156],["protopage.com",157],["topito.com",158],["livesport.ws",160],["citynow.it",161],["variety.com",162],["cuatro.com",163],["mitele.es",163],["telecinco.es",163],["serieslandia.com",164],["softwaredescargas.com",164],["morritastube.xxx",[164,251]],["rawstory.com",165],["post-gazette.com",165],["rainanime.*",166],["bilasport.net",167],["yogitimes.com",168],["juba-get.com",169],["percentagecalculator.guru",169],["claim.8bit.ca",[170,216]],["addtobucketlist.com",170],["alternativa104.net",170],["asumesi.com",170],["ayo24.id",170],["barrier-free.net",170],["berich8.com",170],["blogenginee.com",170],["bloooog.it",170],["blurayufr.*",170],["branditechture.agency",170],["chataigpt.org",170],["coinsrev.com",170],["eliobenedetto.it",170],["examscisco.com",170],["fattelodasolo.it",170],["helicomicro.com",170],["iamflorianschulze.com",170],["karwan.tv",170],["kyoto-kanko.net",170],["limontorrents.com",170],["livenewsof.com",170],["magesypro.com",170],["medeberiya.site",170],["medeberiya1.com",170],["medeberiyax.com",170],["mscdroidlabs.es",170],["nakiny.com",[170,179]],["oyundunyasi.net",170],["parrocchiapalata.it",170],["photoshopvideotutorial.com",170],["rockmods.net",170],["samovies.net",170],["sevenst.us",[170,179]],["sulocale.sulopachinews.com",170],["tabering.net",170],["xn--nbkw38mlu2a.com",170],["adsy.pw",170],["playstore.pw",170],["bootyexpo.net",170],["arbweb.info",170],["solarchaine.com",170],["tokenmix.pro",170],["terafly.me",170],["faucetbravo.fun",170],["vstdrive.in",171],["lonely-mature.com",173],["tubepornclassic.com",174],["the-voice-of-germany.de",175],["adn.com",176],["spokesman.com",177],["news-herald.com",177],["elmundo.es",178],["expansion.com",178],["marca.com",178],["allusione.org",179],["cyberstumble.com",179],["venusarchives.com",179],["freemagazines.top",179],["elektrikmen.com",179],["solotrend.net",179],["itsecuritynews.info",179],["thebharatexpressnews.com",179],["inwepo.co",179],["daemon-hentai.com",179],["gamedrive.org",179],["toramemoblog.com",179],["7daystodiemods.com",179],["7review.com",179],["asupan.me",179],["avitter.net",179],["bi-girl.net",179],["carryflix.icu",179],["dark5k.com",179],["fairyhorn.cc",179],["gojo2.com",179],["gorecenter.com",179],["huitranslation.com",179],["javhdvideo.org",179],["nemumemo.com",179],["peppe8o.com",179],["phodoi.vn",179],["savingsomegreen.com",179],["tutsnode.*",179],["boredbat.com",179],["web.businessuniqueidea.com",179],["questloops.com",179],["spinbot.com",180],["androidonepro.com",181],["arcadepunks.com",182],["wohnungsboerse.net",183],["web2.0calc.*",184],["nbareplayhd.com",185],["convert-case.softbaba.com",185],["thepoorcoder.com",185],["techgeek.digital",185],["readcomiconline.*",185],["warps.club",186],["truyenaudiocv.net",186],["kompasiana.com",187],["spectrum.ieee.org",188],["thenation.com",189],["newsonthegotoday.com",190],["dr-farfar.com",191],["nysainfo.pl",191],["zone-annuaire.*",191],["bleachmx.fr",191],["choq.fm",191],["usb-antivirus.com",191],["eroticmv.com",191],["allywebsite.com",191],["ktm2day.com",191],["sandiegouniontribune.com",192],["fernsehserien.de",192],["femalefirst.co.uk",193],["theregister.co.uk",194],["sportstream.live",195],["savealoonie.com",196],["pervertgirlsvideos.com",196],["open3dmodel.com",196],["macrumors.com",197],["napolipiu.com",198],["manpeace.org",199],["getcopy.link",199],["faucetwork.space",199],["androidadult.com",199],["gaminginfos.com",199],["nohat.cc",[200,201]],["fuskator.com",202],["scrubson.blogspot.com",203],["aquariumgays.com",204],["paginadanoticia.com.br",205],["gplinks.*",206],["aylink.co",207],["gitizle.vip",207],["shtms.co",207],["suaurl.com",[208,209]],["redisex.*",[208,341,344,345]],["blog24.me",210],["exactpay.online",[210,217]],["crypto4yu.com",210],["laweducationinfo.com",211],["savemoneyinfo.com",211],["worldaffairinfo.com",211],["godstoryinfo.com",211],["successstoryinfo.com",211],["cxissuegk.com",211],["learnmarketinfo.com",211],["bhugolinfo.com",211],["armypowerinfo.com",211],["rsgamer.app",211],["phonereviewinfo.com",211],["makeincomeinfo.com",211],["gknutshell.com",211],["vichitrainfo.com",211],["workproductivityinfo.com",211],["dopomininfo.com",211],["hostingdetailer.com",211],["fitnesssguide.com",211],["tradingfact4u.com",211],["cryptofactss.com",211],["softwaredetail.com",211],["artoffocas.com",211],["insurancesfact.com",211],["travellingdetail.com",211],["currentrecruitment.com",212],["investorveda.com",212],["techacode.com",213],["azmath.info",213],["azsoft.*",213],["downfile.site",213],["downphanmem.com",213],["expertvn.com",213],["memangbau.com",213],["trangchu.news",213],["aztravels.net",213],["claimclicks.com",214],["gledaitv.*",214],["tejtime24.com",215],["comohoy.com",[215,314]],["cimanow.cc",215],["n-tv.de",218],["gaystream.pw",219],["blowjobgif.net",220],["erospots.info",221],["pornforrelax.com",222],["atlaq.com",223],["bolly4umovies.*",223],["douploads.net",223],["moalm-qudwa.blogspot.com",223],["123movieshub.*",224],["cima-club.*",224],["flixhq.*",224],["hindilinks4u.*",224],["t7meel.*",224],["vidstream.pro",224],["kodewebsite.com",225],["familyminded.com",226],["foxvalleyfoodie.com",226],["merriam-webster.com",226],["news.com.au",226],["playstationlifestyle.net",226],["sportsnaut.com",226],["tempumail.com",226],["toledoblade.com",226],["pleated-jeans.com",227],["obsev.com",227],["wepc.com",227],["gal-dem.com",228],["lagacetadesalamanca.es",229],["infocorp.io",230],["addictinggames.com",231],["comparteunclic.com",232],["starbux.io",232],["qashbits.com",232],["upnewsinfo.com",233],["toolforge.org",234],["getdogecoins.com",236],["malaysiastock.biz",237],["1bit.space",238],["1bitspace.com",238],["ytanime.tv",238],["pimylifeup.com",239],["camwhorez.video",240],["best-shopme.com",241],["cpomagazine.com",242],["doramasyt.com",243],["xxxdan.com",244],["standardmedia.co.ke",245],["files.fm",245],["ludwig-van.com",245],["abandonmail.com",246],["hentais.tube",247],["hentaitube.online",247],["aegeanews.gr",248],["batterypoweronline.com",248],["centrocommercialevulcano.com",248],["cieonline.co.uk",248],["commsbusiness.co.uk",248],["dailygrindonline.net",248],["delo.bg",248],["dynastyseries.com",248],["fabmx1.com",248],["fat-bike.com",248],["fmj.co.uk",248],["localemagazine.com",248],["loveourweddingmag.com",248],["metaforespress.gr",248],["myvalley.it",248],["niestatystyczny.pl",248],["primapaginamarsala.it",248],["ringelnatz.net",248],["schoolsweek.co.uk",248],["sikkenscolore.it",248],["sportbet.gr",248],["stadtstudenten.de",248],["stagemilk.com",248],["tautasdziesmas.lv",248],["thetoneking.com",248],["toplickevesti.com",248],["zeroradio.co.uk",248],["miohentai.com",249],["sluttyrat.com",250],["moviehdf.*",252],["k12reader.com",253],["cachevalleydaily.com",253],["panel.skynode.pro",254],["imag-r.com",254],["radionylive.com",255],["radioitalylive.com",255],["radiolovelive.com",255],["radiocountrylive.com",255],["radiosymphony.com",255],["miamibeachradio.com",255],["radiorockon.com",255],["radioitaliacanada.com",255],["radioitalianmusic.com",255],["radioamericalatina.com",255],["radiosantaclaus.com",255],["radionorthpole.com",255],["radionatale.com",255],["pornvideoq.com",257],["gaminggorilla.com",257],["sexuhot.com",257],["rexxx.org",258],["world4.eu",259],["flinsetyadi.com",259],["trytutorial.com",259],["rimworldbase.com",259],["ifreemagazines.com",259],["romaniataramea.com",260],["amateur8.com",261],["freeporn8.com",261],["maturetubehere.com",261],["sortporn.com",261],["textovisia.com",262],["hotcleaner.com",263],["momo-net.com",264],["hardwarezone.com.sg",265],["bollyholic.*",266],["b2bhint.com",[267,268]],["baikin.net",267],["unsurcoenlasombra.com",267],["veryfastdownload.pw",270],["nation.africa",271],["manganelo.tv",272],["vermoegen.org",273],["javhub.net",[274,275]],["inhumanity.com",276],["sunci.net",277],["iguarras.com",278],["iputitas.net",278],["fastream.to",278],["cricfree.*",278],["sportskart.*",278],["miraculous.to",279],["glotorrents.fr-proxy.com",280],["glotorrents.theproxy.ws",280],["tutele.sx",281],["dirp.me",282],["mymusicreviews.com",283],["bg-gledai.*",283],["katmoviefix.*",284],["integral-calculator.com",285],["derivative-calculator.net",285],["shorttrick.in",286],["shrdsk.me",286],["looptorrent.org",286],["noicetranslations.blogspot.com",286],["serviceemmc.com",286],["basic-tutorials.de",287],["depvailon.com",288],["111.90.150.10",289],["111.90.150.149",289],["111.90.151.26",289],["111.90.141.252",289],["mangahentai.xyz",290],["nhentai.io",[292,293]],["erofound.com",294],["erome.com",295],["flaticon.com",296],["zertalious.xyz",297],["tweakcentral.net",298],["nokiahacking.pl",299],["javct.net",300],["veryfreeporn.com",301],["linkbin.me",[302,303]],["filemoon.*",304],["teachoo.com",305],["maisonbrico.com",306],["vebo1.com",307],["seriesmetro.net",308],["blog.textpage.xyz",309],["alliptvlinks.com",309],["sportnews.to",310],["movies4u.*",310],["movies4u3.*",310],["gamerxyt.com",310],["faqwiki.us",310],["zeeplayer.pages.dev",310],["qcheng.cc",311],["hygiena.com",312],["netchimp.co.uk",313],["xgroovy.com",315],["ruyashoujo.com",316],["xmateur.com",317],["x2download.com",318],["truyen-hentai.com",319],["redd.tube",320],["sendspace.com",321],["leechpremium.net",322],["vikingf1le.us.to",322],["brainly.*",323],["file-upload.*",324],["dood.*",325],["freethesaurus.com",326],["thefreedictionary.com",326],["counterstrike-hack.leforum.eu",327],["ajt.xooit.org",327],["drivemoe.com",328],["dsharer.com",328],["pupupul.site",329],["fansubseries.com.br",329],["usersdrive.com",330],["manoramaonline.com",331],["realmoasis.com",332],["technewsworld.com",333],["rjno1.com",334],["gpldose.com",335],["zinkmovies.in",336],["sbs.com.au",337],["redecanais.*",[338,339,340,341,342,343]],["sfr.fr",346],["ericdraken.com",347],["djs.sk",349]]);
const exceptionsMap = new Map([["pingit.com",[9,17,48,70]],["games.dailymail.co.uk",[56]]]);
const hasEntities = true;
const hasAncestors = false;

const collectArgIndices = (hn, map, out) => {
    let argsIndices = map.get(hn);
    if ( argsIndices === undefined ) { return; }
    if ( typeof argsIndices !== 'number' ) {
        for ( const argsIndex of argsIndices ) {
            out.add(argsIndex);
        }
    } else {
        out.add(argsIndices);
    }
};

const indicesFromHostname = (hostname, suffix = '') => {
    const hnParts = hostname.split('.');
    const hnpartslen = hnParts.length;
    if ( hnpartslen === 0 ) { return; }
    for ( let i = 0; i < hnpartslen; i++ ) {
        const hn = `${hnParts.slice(i).join('.')}${suffix}`;
        collectArgIndices(hn, hostnamesMap, todoIndices);
        collectArgIndices(hn, exceptionsMap, tonotdoIndices);
    }
    if ( hasEntities ) {
        const n = hnpartslen - 1;
        for ( let i = 0; i < n; i++ ) {
            for ( let j = n; j > i; j-- ) {
                const en = `${hnParts.slice(i,j).join('.')}.*${suffix}`;
                collectArgIndices(en, hostnamesMap, todoIndices);
                collectArgIndices(en, exceptionsMap, tonotdoIndices);
            }
        }
    }
};

const entries = (( ) => {
    const docloc = document.location;
    const origins = [ docloc.origin ];
    if ( docloc.ancestorOrigins ) {
        origins.push(...docloc.ancestorOrigins);
    }
    return origins.map((origin, i) => {
        const beg = origin.lastIndexOf('://');
        if ( beg === -1 ) { return; }
        const hn = origin.slice(beg+3)
        const end = hn.indexOf(':');
        return { hn: end === -1 ? hn : hn.slice(0, end), i };
    }).filter(a => a !== undefined);
})();
if ( entries.length === 0 ) { return; }

const todoIndices = new Set();
const tonotdoIndices = new Set();

indicesFromHostname(entries[0].hn);
if ( hasAncestors ) {
    for ( const entry of entries ) {
        if ( entry.i === 0 ) { continue; }
        indicesFromHostname(entry.hn, '>>');
    }
}

// Apply scriplets
for ( const i of todoIndices ) {
    if ( tonotdoIndices.has(i) ) { continue; }
    try { abortOnPropertyRead(...argsList[i]); }
    catch { }
}

/******************************************************************************/

// End of local scope
})();

void 0;
