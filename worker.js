const config = {
// Your Account Secret is shown on the Your Account page of
// the Queue-Fair Portal.If you change it there, you must
// change it here too.
  accountSecret : 'DELETE THIS TEXT AND REPLACE WITH YOUR ACCOUNT SECRET',

// The System Name of your account from the Your Account page
// of the Queue-Fair Portal.
  account : 'DELETE THIS TEXT AND REPLACE WITH YOUR ACCOUNT SYSTEM NAME',

// Leave this set as is
  filesServer : 'files.queue-fair.net',

// Time limit for Passed Strings to be considered valid,
// before and after the current time
  queryTimeLimitSeconds : 30,

// Valid values are true, false, or an "IP_address".
  debug : false,

// How long to wait in seconds for network reads of config
// or Adapter Server (safe mode only)
  readTimeout : 5,

// How long a cached copy of your Queue-Fair settings will be kept before
// downloading a fresh copy. Set this to 0 if you are updating your settings in
// the Queue-Fair Portal and want to test your changes quickly, but remember
// to set it back to at least 5 again when you are finished to reduce CloudFlare costs.
// NOTE: If you set this to one minute or less in a production environment, you will
// exceed the CloudFlare free plan KV limit of 1000 writes per day!
  settingsCacheLifetimeMinutes : 5,

// Whether or not to strip the Passed String from the URL
// that the Visitor sees on return from the Queue or Adapter servers
// (simple mode) - when set to true causes one additinal HTTP request
// to CloudFlare but only on the first matching visit from a particular
// visitor. The recommended value is true.
  stripPassedString : true,

// Whether to send the visitor to the Adapter server for counting (simple mode),
// or consult the Adapter server (safe mode).The recommended value is "safe".
// If you change this to "simple", consider setting stripPassedString above to
// false to make it easier for Google to crawl your pages.
  adapterMode : 'safe',

// When the queue is turned on and showing queue pages, always send a visitor 
// from the front of the queue to a URL on your site starting "https://"
// even if Cloudflare has told us that they wanted a URL starting "http://",
// which can happen with some Cloudflare set-ups involving multiple 
// reverse proxies.  Setting is only active if Dynamic Targeting is in use.
// Leave this set to true if your whole site is protected by https.
  alwaysHTTPS : true,

// When enabled the URL of any visitor request that results in an Adapter call to 
// the Queue Server cluster is sent to the cluster for logging, which is occasionally
// useful for investigations.  Only applies to SAFE mode.
// Should be set to false for production systems.
  sendURL : true,

// An array of commonly used file extensions on which the Adapter will automatically
// NOT Match. Equivalent to AND Path Does Not Contain .xxx in the 
// Portal Activation Rules.  Useful as Cloudflare does not appear to 
// support excluding file types in Routes, and we recommend you restrict the Adapter
// to Page requests as much as possible.  Note that .xml and .json are on the list - occasionally.
// customers do want to queue people requesting these files. Set to null or an empty array
// to disable completely.
excludeFileTypes : [ "json", "xml", "css", "js", "webmanifest", "txt",  //static file types
  "jpeg", "jpg", "gif", "png", "webp", "svg", "bmp", "ico", //Image types
  "mpeg","mpg","mp4","wav","mp3","pdf",  //media types
  "woff","woff2","ttf","eot"  //font types
  ]

};

/****** You should only modify the below if you need to merge ******
 ****** the Queue-Fair worker with a pre-existing worker. **********/

async function getFromCloudFlareCacheOrOrigin(request) {
  //If you already have Worker code that you need to merge,
  //this is the place to call it.

  //Otherwise, get a response from the CloudFlare cache or origin.
  return fetch(request);
}

addEventListener("fetch", (event) => { 
  if(!event.request || !event.request.url) {
      //Requests with no URL have default CloudFlare handling.
    return;
  }
  event.respondWith(
    handleRequest(event.request)
    );
});

/****** You should not need to modify anything below this line ******/

function isBadIANA(ip) {
	// Detect invalid Source IPs according to IANA special registry.  
	// Not automatically blocked by Cloudflare.
	if(!ip) return false;
  
	let i = ip.indexOf(":");
	if(i != -1) {
		if (ip.substring(0,i) != "2001") return false;
		let j = ip.indexOf(":",i+1);
		if (j == i+1) return false;
		let s = ip.substring(i+1,j).toLowerCase();
		return (s == "db8" || s == "0db8");
	}

	i = ip.indexOf(".");
	if(i == -1) return false;
	if(ip == "192.0.0.170" || ip == "192.0.0.171"
		|| ip.indexOf("192.0.2.") == 0 || ip.indexOf("198.51.100.") == 0
		|| ip.indexOf("203.0.113.") == 0) return true;

	return (parseInt(ip.substring(0,i)) >= 240);
}

async function handleRequest(req) {

  try {
    var service = new QueueFairService(req);

    if(isBadIANA(service.remoteAddr())) {
      service.redirect("https://queue-fair.com/dcblock?ip="+service.remoteAddr());
      return await respond(service,req);
    }
    
    const adapter = new QueueFairAdapter(config, service);
    adapter.url = req.url;
    adapter.userAgent = req.headers.get("user-agent") || "user-agent not set";
    if(await adapter.go()) {
      //Page should be shown.
      if(Object.keys(service.respCookies).length > 0) {
        //need to add cookies
        return await respond(service,req);
      }
      //otherwise fallthrough
    } else {
      //Page should not be shown.
      return await respond(service,req);
    }
  } catch (err) {
    console.log(err);
  }
  //If not intercepted get the (possibly cached) response from origin.
  return getFromCloudFlareCacheOrOrigin(req);
}

async function respond(service, req) {
  try {
    var resp;
    if(service.respRedirect != null) {
      //Respond with redirect.
      //resp = new Response(Response.redirect(service.respRedirect, 302));
      const headers = new Headers();
      headers.set("location",service.respRedirect);
      resp = new Response(null, {
        status : 302,
        statusText : "Found",
        headers :  headers
      });
      
    } else {
      //Respond with page.
      resp = await getFromCloudFlareCacheOrOrigin(req);
      //Create a new response so that it is modifiable.
      resp = new Response(resp.body, resp);
    }

    //Set cache control.
    if(service.noCache) {
      resp.headers.set("cache-control","no-store,no-cache,max-age=0");
    }

    //Set cookies.
    for(var cname in service.respCookies) {
      const cookie = service.respCookies[cname];
      const header = cname + "=" + cookie.value 
      + ";Max-Age="+cookie.maxAge
      + ";Expires="+cookie.expire.toUTCString()
      + ";Path="+cookie.path
      + (cookie.cookieDomain ? ";Domain="+cookie.cookieDomain : "")
      + (service.isSecure ?  ";Secure" : "")
      + (cookie.sameSite ?  ";SameSite=none" : "");
      resp.headers.append("set-cookie",header);
    }
    
    return resp;
  } catch (err) {
    console.log("QF ERROR PROCESSING RESPONSE");
    console.log(err);
      //Show page.
    return getFromCloudFlareCacheOrOrigin(req);
  }
}

const encoder = new TextEncoder();
const compiledSecrets = [];

class QueueFairService {
  req; 
  doneNoCache = false;
  isSecure = false;
  reqCookies = {};
  respCookies = [];
  respHeaders = [];
  respRedirect = null;
  /**
   * @param {Object} req CloudFlare request
   */
  constructor(req) {
    this.req= req;
    if(req.url.startsWith("https")) {
      this.isSecure = true;
    }
    this.reqCookies = req.headers.get("cookie");
    if(this.reqCookies == null) {
      this.reqCookies = {};
      return;
    }
    const inter = this.reqCookies.split(';');
    this.reqCookies = {};
    for(var i in inter) {
      const str = inter[i];
      const j = str.indexOf("=");
      const cname = decodeURIComponent(str.substring(0,j).trim());
      const cvalue = decodeURIComponent(str.substring(j+1).trim());
      this.reqCookies[cname] = cvalue;
    }
  }

  /**
   * @param {string} cname the name of the cookie.
   * @return {string} the cookie value, or null if not found.
   */
  getCookie(cname) {
    if (typeof this.reqCookies[cname] === 'undefined') {
      return null;
    }
    return this.reqCookies[cname];
  }

  /**
   * @param {string} cname the full name of the cookie.
   * @param {string} value the value to store.
   * @param {string} lifetimeSeconds how long the cookie persists
   * @param {string} path the cookie path
   * @param {string} cookieDomain optional cookie domain.
   */
  setCookie(cname, value, lifetimeSeconds, path, cookieDomain) {
    this.noCache();
    const cookie = {
      maxAge: lifetimeSeconds,
      expire: new Date(Date.now()+(lifetimeSeconds*1000)),
      path: path,
    };
    if (this.isSecure) {
      cookie.secure = true;
      cookie.sameSite = 'none';
    }
    if (cookieDomain != null) {
      cookie.domain = cookieDomain;
    }
    cookie.value = value;
    this.respCookies[cname] = cookie;
  }

  /**
   * Sets no-cache headers if needed.
   */
  noCache() {
    if (this.doneNoCache) {
      return;
    }
    this.doneNoCache=true;
    this.addHeader('Cache-Control', 'no-store,no-cache,max-age=0');
  }

  /**
   * @param {string} hname header name.
   * @param {string} value header value.
   */
  addHeader(hname, value) {
    this.respHeaders[hname] = value;
  }

  /**
   * @param {string} loc where to send the visitor. 302 redirect.
   */
  redirect(loc) {
    this.noCache();
    this.respRedirect = loc;
  }

  /**
   * @return {string} the IP address of the visitor
   */
  remoteAddr() {
    let ip = this.req.headers.get('x-forwarded-for')||
    this.req.headers.get("CF-Connecting-IP");
    if(ip == null) {
      return "255.255.255.0";
    }
    ip = ip.split(',')[0];

    // in case the ip returned in a format: "::ffff:127.xxx.xxx.xxx"
    //ip = ip.split(':').slice(-1);

    return ip;
  }
};

/** The QueueFairAdapter class */
class QueueFairAdapter {
  // Passed in constructor
  config;
  service;

  // You must set this to the full URL of the page before running the adapter.
  url = null;

  // You must set this to the visitor's User Agent before running the adapter.
  userAgent = null;

  // Optional extra data for your Queue Page.
  extra = null;

  // If you have multiple custom domains for your queues use this.
  queueDomain = null;

  // -------------------- Internal use only -----------------
  static cookieNameBase='QueueFair-Pass-';

  d = false;
  uid = null;
  continuePage = true;
  settings = null;
  redirectLoc=null;
  adapterResult=null;
  adapterQueue=null;
  consultingAdapter=false;
  passed = [];
  protocol = 'https';
  passedString = null;

  // For managing the getting and caching of settings.
  static memSettings = null;
  static lastMemSettingsRead = -1;
  static gettingSettings = false;
  settingsCounter = 0;
  thisIsGettingSettings = false;

  // For returning from promise or timing out.
  res=null;
  timeout = null;
  finished = false;

  /** Convenience method
   * @param {Object} config configuration for the adapter.
   * @param {Object} service a service encapsulating low level functions.
   */
  constructor(config, service) {
    this.config = config;
    if (this.config.debug === false) {
      // defaults to false.
    } else if (this.config.debug === true ||
      this.config.debug === service.remoteAddr()) {
      this.d = true;
    }
    this.service = service;
  }


  /** Convenience method
   * @param {string} haystack
   * @param {string} needle
   * @return {boolean} does haystack contain needle.
   */
  includes(haystack, needle) {
    return (haystack.indexOf(needle)!=-1);
  }

  /** Convenience method
   * @param {string} haystack
   * @param {string} needle
   * @return {boolean} does haystack start with needle.
   */
  startsWith(haystack, needle) {
    return (haystack.indexOf(needle)===0);
  }

  /** Convenience method
   * @param {string} haystack
   * @param {string} needle
   * @return {boolean} does haystack end with needle.
   */
  endsWith(haystack, needle) {
    return (haystack.indexOf(needle) != -1 &&
     haystack.indexOf(needle) == haystack.length-needle.length);
  }

  /** Is this request a match for the queue?
   * @param {Object} queue json
   * @return {boolean} whether this request matches the
   * queue's Activation Rules.
   */
  isMatch(queue) {
    if (!queue || !queue.activation || !queue.activation.rules) {
      return false;
    }
    return this.isMatchArray(queue.activation.rules);
  }

  /** Runs through an array of rules.
   * @param {Array} arr an array of rule objects.
   * @return {boolean} whether the rules match.
   */
  isMatchArray(arr) {
    if (arr == null) {
      return false;
    }

    let firstOp = true;
    let state = false;

    for (let i = 0; i < arr.length; i++) {
      const rule = arr[i];

      if (!firstOp && rule.operator != null) {
        if (rule.operator == 'And' && !state) {
          return false;
        } else if (rule.operator == 'Or' && state) {
          return true;
        }
      }

      const ruleMatch = this.isRuleMatch(rule);

      if (firstOp) {
        state = ruleMatch;
        firstOp = false;
        if (this.d) this.log('  Rule 1: ' + ((ruleMatch) ? 'true' : 'false'));
      } else {
        if (this.d) {
          this.log('  Rule ' + (i+1) +
            ': ' + ((ruleMatch) ? 'true' : 'false'));
        }
        if (rule.operator == 'And') {
          state = (state && ruleMatch);
          if (!state) {
            break;
          }
        } else if (rule.operator == 'Or') {
          state = (state || ruleMatch);
          if (state) {
            break;
          }
        }
      }
    }

    if (this.d) this.log('Final result is ' + ((state) ? 'true' : 'false'));
    return state;
  }

  /** Extract the right component for a rule.
   * @param {Object} rule the rule.
   * @param {string} url the requested URL.
   * @return {string} the component.
   */
  extractComponent(rule, url) {
    let comp = url;
    if (rule.component == 'Domain') {
      comp=comp.replace('http://', '').replace('https://', '').split(/[/?#]/)[0];
    } else if (rule.component == 'Path') {
      const domain=comp.replace('http://', '').replace('https://', '').split(/[/?#]/)[0];
      comp=comp.substring(comp.indexOf(domain)+domain.length);
      let i=0;
      if (this.startsWith(comp, ':')) {
        // We have a port
        i=comp.indexOf('/');
        if (i !=-1 ) {
          comp=comp.substring(i);
        } else {
          comp='';
        }
      }
      i=comp.indexOf('#');
      if (i!=-1) {
        comp=comp.substring(0, i);
      }
      i=comp.indexOf('?');
      if (i!=-1) {
        comp=comp.substring(0, i);
      }
      if (comp=='') {
        comp='/';
      }
    } else if (rule.component == 'Query') {
      const i = comp.indexOf('?');
      if (i == -1) {
        comp = '';
      } else if (comp == '?') {
        comp='';
      } else {
        comp = comp.substring(i+1);
      }
    } else if (rule.component == 'Cookie') {
      comp=this.getCookie(rule.name);
    }
    return comp;
  }


  /** Tests URL and cookies against a rule.
   * @param {Object} rule the rule.
   * @return {boolean} true if matched.
   */
  isRuleMatch(rule) {
    const comp = this.extractComponent(rule, this.url);
    return this.isRuleMatchWithValue(rule, comp);
  }


  /** Test a component against a rule.
   * @param {Object} rule the rule.
   * @param {string} comp the component.
   * @return {boolean} true if matched.
   */
  isRuleMatchWithValue(rule, comp) {
    let test=rule.value;

    if (rule.caseSensitive == false) {
      comp=comp.toLowerCase();
      test=test.toLowerCase();
    }
    if (this.d) this.log('Testing '+rule.component+' '+test+' against '+comp);

    let ret=false;

    if (rule.match=='Equal' && comp == test) {
      ret=true;
    } else if (rule.match=='Contain' && comp!==null &&
      this.includes(comp, test)) {
      ret=true;
    } else if (rule.match=='Exist') {
      if (typeof comp == 'undefined' || comp===null || ''===comp) {
        ret=false;
      } else {
        ret=true;
      }
    } else if (rule.match == "RegExp") {
      if(typeof comp == 'undefined' || comp === null) {
        comp = "";
      }
      var r = new RegExp(test);
      ret = r.test(comp);
    }

    if (rule.negate) {
      ret=!ret;
    }
    return ret;
  }

  /** What to do if a queue match is found.
   * @param {Object} queue json.
   * @return {boolean} whether further queues should be checked now.
   */
  async onMatch(queue) {
    if (await this.isPassed(queue)) {
      if (this.d) this.log('Already passed '+queue.name+'.');
      if (this.extra == 'CLEAR') {
        const val=this.getCookie(QueueFairAdapter.cookieNameBase+queue.name);
        if (this.d) this.log('Clear receieved - cookie is '+val);
        if (''!==val) {
          this.setCookie(queue.name, val, 20, queue.cookieDomain);
        } else {
          return true;
        }
      } else {
        return true;
      }
    }
    if (this.d) this.log('Checking at server '+queue.displayName);
    this.consultAdapter(queue);
    return false;
  }

  /** Checks if a queue has been passed already.
   * @param {Object} queue json
   * @return {boolean} true if passed.
   */
  async isPassed(queue) {
    if (this.passed[queue.name]) {
      if (this.d) this.log('Queue '+queue.name+' marked as passed already.');
      return true;
    }
    const queueCookie=this.getCookie(QueueFairAdapter.cookieNameBase +
      queue.name);
    if (!queueCookie || queueCookie==='') {
      if (this.d) this.log('No cookie found for queue '+queue.name);
      return false;
    }
    if (!this.includes(queueCookie, queue.name)) {
      if (this.d) this.log('Cookie value '+queueCookie+' is invalid for '+queue.name);
      return false;
    }

    if (!await this.validateCookieWithQueue(queue, queueCookie)) {
      if (this.d) this.log('Cookie failed validation ' + queueCookie);

      this.setCookie(queue.name, '', 0, queue.cookieDomain);
      return false;
    }

    if (this.d) this.log('Got a queueCookie for '+queue.name+' '+queueCookie);
    return true;
  }

  /** Creates a SHA256 HMAC hash.  MODIFIED from node.js adapter.
   * @param {string} secret the secret to use.
   * @param {string} message the message to sign.
   * @return {string} a hash.
   */
  async createHash(secret, message) {

    var key;
    if(compiledSecrets[secret]) {
      key = compiledSecrets[secret];
    } else {
      const secretKeyData = encoder.encode(secret);
      key = await crypto.subtle.importKey('raw',secretKeyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,['sign']);
      compiledSecrets[secret] =  key;
    }
    
    var mac = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
    mac = [...new Uint8Array(mac)]
    .map(x => x.toString(16).padStart(2, '0'))
    .join('');
    return mac;
  }

  /** Processes a User-Agent for use with signature.
   * @param {string} parameter the string to process.
   * @return {string} a processed string.
   */
  processIdentifier(parameter) {
    if (parameter == null) {
      return null;
    }
    const i = parameter.indexOf('[');
    if (i == -1) {
      return parameter;
    }

    if (i < 20) {
      return parameter;
    }
    return parameter.substring(0, i);
  }


  /** Called to validate a cookie.  May be called externally
   * (Hybrid Security Model).  MODIFIED async.
   * @param {Object} queue json
   * @param {string} cookie the cookie value to validate
   * @return {boolean} whether it's valid
   */
  async validateCookieWithQueue(queue, cookie) {
    return await this.validateCookie(queue.secret,
      queue.passedLifetimeMinutes, cookie);
  }


  /** Called to validate a cookie.  May be called externally
   * (Hybrid Security Model).  MODIFIED async
   * @param {string} secret the queue secret.
   * @param {number} passedLifetimeMinutes the maximum allowed
   * lifetime in minutes.
   * @param {string} cookie the cookie value to validate
   * @return {boolean} whether it's valid
   */
  async validateCookie(secret, passedLifetimeMinutes, cookie) {
    if (this.d) this.log('Validating cookie ' + cookie);

    if (cookie == null || ''==cookie) {
      return false;
    }
    try {
      const parsed = this.strToPairs(cookie);
      if (parsed['qfh'] == null) {
        return false;
      }

      const hash = parsed['qfh'];

      const hpos = cookie.lastIndexOf('qfh=');
      const check = cookie.substring(0, hpos);

      const checkHash = await this.createHash(secret,
        this.processIdentifier(this.userAgent)+check);

      if (hash != checkHash) {
        if (this.d) {
          this.log('Cookie Hash Mismatch Given ' +
            hash + ' Should be ' + checkHash);
        }

        return false;
      }

      let tspos = parsed['qfts'];

      tspos = parseInt(tspos);

      if (!Number.isInteger(tspos)) {
        if (this.d) this.log('Cookie bad timestamp ' + tspos);
        return false;
      }

      if (tspos < this.time() - (passedLifetimeMinutes * 60)) {
        if (this.d) {
          this.log('Cookie timestamp too old ' +
            (this.time() - tspos));
        }
        return false;
      }
      if (this.d) this.log('Cookie Validated ');
      return true;
    } catch (err) {
      if (this.d) this.log('Cookie validation failed with error '+err);
    }
    return false;
  }

  /** Parses a query string into an array of key-value pairs.
   * @param {string} str the query string.
   * @return {Array} the array of pairs.
   */
  strToPairs(str) {
    const q = [];

    const vars = str.split('&');

    for (let i = 0; i < vars.length; i++) {
      const pair = vars[i].split('=');
      if (pair.length > 1) {
        q[pair[0]] = decodeURIComponent(pair[1]);
      }
    }
    return q;
  }

  /** Convenience method
   * @return {number} epoch time in seconds.
   */
  time() {
    return Date.now()/1000;
  }

  /** Checks if a Passed String is valid.  MODIFIED async
   * @param {Object} queue json
   * @return {boolean} whether it's valid or not.
   */
  async validateQuery(queue) {
    try {
      const i = this.url.indexOf('?');
      if (i == -1) {
        return false;
      }

      let str = this.url.substring(i);
      if ('?' == str) {
        return false;
      }

      str = str.substring(1);
      const hpos = str.lastIndexOf('qfh=');

      if (hpos == -1) {
        if (this.d) this.log('No Hash In Query');
        return false;
      }

      if (this.d) this.log('Validating Passed Query ' + str);

      const qpos = str.lastIndexOf('qfqid=');

      if (qpos === -1) {
        if (this.d) this.log('No Queue Identifier');
        return false;
      }

      const q = this.strToPairs(str);

      const queryHash = q['qfh'];

      if (!queryHash) {
        if (this.d) this.log('Malformed hash');
        return false;
      }

      // const queryQID = q['qfqid'];
      let queryTS = q['qfts'];
      // const queryAccount = q['qfa'];
      // const queryQueue = q['qfq'];
      // const queryPassType = q['qfpt'];

      if (queryTS == null) {
        if (this.d) this.log('No Timestamp');
        return false;
      }

      queryTS = parseInt(queryTS);

      if (!Number.isInteger(queryTS)) {
        if (this.d) this.log('Timestamp '+queryTS+' Not Numeric');
        return false;
      }

      if (queryTS > this.time() + this.config.queryTimeLimitSeconds) {
        if (this.d) this.log('Too Late ' + queryTS + ' ' + this.time());
        return false;
      }

      if (queryTS < this.time() - this.config.queryTimeLimitSeconds) {
        if (this.d) this.log('Too Early ' + queryTS + ' ' + this.time());
        return false;
      }

      const check = str.substring(qpos, hpos);

      const checkHash = await this.createHash(queue.secret,
        this.processIdentifier(this.userAgent) + check);

      if (checkHash != queryHash) {
        if (this.d) this.log('Failed Hash '+checkHash);
        return false;
      }

      return true;
    } catch (err) {
      if (this.d) this.log('Query validation failed with error '+err);
      return false;
    }
  }

  /** Called to set the UID from a cookie if present. */
  setUIDFromCookie() {
    const cookieBase = 'QueueFair-Store-' + this.config.account;

    const uidCookie = this.getCookie(cookieBase);
    if (uidCookie == '') {
      return;
    }

    let i = uidCookie.indexOf(':');
    if (i == -1) {
      i = uidCookie.indexOf('=');
    }

    if (i == -1) {
      if (this.d) this.log('= not found in UID Cookie! ' + uidCookie);
      this.uid = uidCookie;
      return;
    }

    this.uid = uidCookie.substring(i + 1);
    if (this.d) this.log('UID set to ' + this.uid);
  }

  /** Gets a cookie
   * @param {string} cname the name of the cookie
   * @return {string} the cookie value, or '' if not found.
   */
  getCookie(cname) {
    if (cname==='' || cname===null) {
      return '';
    }
    const val = this.service.getCookie(cname);
    if (val === null) {
      return '';
    }
    return val;
  }

  /** Called when settings as a string have been found
   * MODIFIED async, KV.
   * @param {string} data the settings as a json object
   */
  async gotSettingsStr(data) {
    try {
      const json = JSON.parse(data);
      QueueFairAdapter.memSettings = json;
      QueueFairAdapter.lastMemSettingsRead = Date.now();
      json.stamp = QueueFairAdapter.lastMemSettingsRead;
      await QUEUE_FAIR_STORAGE.put("settings-"+this.config.account, JSON.stringify(json));
      await this.gotSettings(QueueFairAdapter.memSettings);
    } catch (err) {
      this.releaseGetting();
      this.errorHandler(err);
    }
  }

  /** Called when settings have been found. MODIFIED async
   * @param {Object} json the settings as a json object
   */
  async gotSettings(json) {
    this.releaseGetting();
    if (this.d) this.log('Got settings '+JSON.stringify(json));
    this.settings=json;
    try {
      if (this.d) this.log('Got client settings.');
      await this.checkQueryString();
      if (!this.continuePage) {
        return;
      }
      await this.parseSettings();
    } catch (err) {
      this.log('QF Error ');
      this.errorHandler(err);
    }
  }

  /** Parses the settings to see if we have a match,
   * and act upon any match found.  MODIFIED async */
  async parseSettings() {
    try {
      if (!this.settings) {
        if (this.d) this.log('ERROR: Settings not set.');
        return;
      }
      if(this.isExclude()) {
        if (this.d) this.log('URL excluded by file type.');
        return;
      }
      const queues=this.settings.queues;
      if (!queues || !queues[0]) {
        if (this.d) this.log('No queues found.');
        return;
      }
      this.parsing=true;
      if (this.d) this.log('Running through queue rules');
      for (let i=0; i<queues.length; i++) {
        try {
          const queue=queues[i];
          if (this.passed[queue.name]) {
            if (this.d) {
              this.log('Already passed ' + queue.displayName +
                ' ' + this.passed[queue.name]);
            }
            continue;
          }
          if (this.d) this.log('Checking '+queue.displayName);
          if (this.isMatch(queue)) {
            if (this.d) this.log('Got a match '+queue.displayName);
            if (!await this.onMatch(queue)) {
              if (this.consultingAdapter) {
                return;
              }
              if (!this.continuePage) {
                return;
              }
              if (this.d) {
                this.log('Found matching unpassed queue ' +
                  queue.displayName);
              }
              if (this.config.adapterMode == 'simple') {
                return;
              } else {
                continue;
              }
            }

            if (!this.continuePage) {
              return;
            }
          // Passed
            this.passed[queue.name] = true;
          } else {
            if (this.d) this.log('Rules did not match '+queue.displayName);
          }
        } catch (err) {
          this.errorHandler(err);
        }
      }
      if (this.d) this.log('All queues checked.');
      this.parsing=false;
    } catch (err) {
      this.errorHandler(err);
    } finally {
      if (!this.consultingAdapter) {
        this.finish();
      }
    }
  }

  /** Is this an excluded file type? */
  isExclude() {
    if(typeof config.excludeFileTypes === "undefined" ||
      config.excludeFileTypes == null ||
      config.excludeFileTypes.length == 0)
      return false;


    const rule = {
      "component": "Path",
      "match": "Contain",
      "value": "NOMATCH",
      "caseSensitive": true,
    };

    const comp = this.extractComponent(rule, this.url);

    for(var i = 0; i < config.excludeFileTypes.length; i++) {
      rule.value = "."+config.excludeFileTypes[i];
      if(this.isRuleMatchWithValue(rule, comp)) {
        return true;
      }
    };

    return false;
  }

  /** Launches a call to the Adapter Servers
   * @param {Object} queue json
   */
  consultAdapter(queue) {
    if (this.d) {
      this.log('Consulting Adapter Server for queue ' +
        queue.name +' for page '+this.url);
    }

    this.adapterQueue = queue;
    let adapterMode = 'safe';

    if (queue.adapterMode != null) {
      adapterMode = queue.adapterMode;
    } else if (this.config.adapterMode != null) {
      adapterMode = this.config.adapterMode;
    }

    if (this.d) {
      this.log('Adapter mode is ' + adapterMode);
    }

    if ('safe' == adapterMode) {
      let url = this.protocol + '://' + queue.adapterServer + '/adapter/' + queue.name;
      url += '?ipaddress=' + encodeURIComponent(this.service.remoteAddr());
      if (this.uid != null) {
        url += '&uid=' + this.uid;
      }

      url += '&identifier=';
      url += encodeURIComponent(this.processIdentifier(this.userAgent));

      if(this.config.sendURL) {
        url+= '&url=';
        url+= encodeURIComponent(this.url);
      }

      if (this.d) this.log('Adapter URL ' + url);
      this.consultingAdapter = true;

      //Does not require await as result unused.
      this.loadURL(url, (data) => this.gotAdapterStr(data));
      return;
    }

    // simple mode.
    let url = this.protocol + '://' + queue.queueServer + '/' + queue.name + '?target=' + this.makeTarget();

    url = this.appendVariant(queue, url);
    url = this.appendExtra(queue, url);
    if (this.d) this.log('Redirecting to adapter server ' + url);
    this.redirectLoc = url;
    this.redirect();
  }

  makeTarget() {
    if(!this.config.alwaysHTTPS || !this.url.startsWith("http://")) {
      return encodeURIComponent(this.url);
    }

    return encodeURIComponent("https://"+this.url.substring("http://".length));
  }

  /** appends ? or & appropriately.
   * @param {string} redirectLoc the URL to redirect.
   * @return {string} the redirect location.
   */
  appendQueryOrAmp(redirectLoc) {
    if (redirectLoc.indexOf('?') != -1) {
      redirectLoc+='&';
    } else {
      redirectLoc+='?';
    }
    return redirectLoc;
  }

  /** Finds and appends any variant to the redirect location
   * @param {Object} queue json
   * @param {string} redirectLoc the URL to redirect.
   * @return {string} the location with variant appended if found.
   */
  appendVariant(queue, redirectLoc) {
    if (this.d) this.log('Looking for variant');
    const variant=this.getVariant(queue);
    if (variant === null) {
      if (this.d) this.log('No Variant Found');
      return redirectLoc;
    }
    if (this.d) this.log('Found variant '+variant);
    redirectLoc=this.appendQueryOrAmp(redirectLoc);
    redirectLoc+='qfv='+encodeURIComponent(variant);
    return redirectLoc;
  }

  /** appends any Extra data to the redirect location
   * @param {Object} queue json
   * @param {string} redirectLoc the URL to redirect.
   * @return {string} the location with extra appended.
   */
  appendExtra(queue, redirectLoc) {
    if (this.extra===null || this.extra==='') {
      return redirectLoc;
    }
    redirectLoc=this.appendQueryOrAmp(redirectLoc);
    redirectLoc+='qfx='+encodeURIComponent(this.extra);
    return redirectLoc;
  }

  /** Looks through the rules to see if a variant matches.
   * @param {Object} queue the queue json
   * @return {string} the name of the variant, or null if none match.
   */
  getVariant(queue) {
    if (this.d) this.log('Getting variants for '+queue.name);
    if (!queue.activation) {
      return null;
    }
    const variantRules=queue.activation.variantRules;
    if (!variantRules) {
      return null;
    }
    if (this.d) this.log('Got variant rules for '+queue.name);
    for (let i=0; i<variantRules.length; i++) {
      const variant=variantRules[i];
      const variantName=variant.variant;
      const rules=variant.rules;
      const ret = this.isMatchArray(rules);
      if (this.d) this.log('Variant match '+variantName+' '+ret);
      if (ret) {
        return variantName;
      }
    }
    return null;
  }

  /** Called in "safe" mode when an adapter call has returned content
   * @param {string} data the content.
   * */
  async gotAdapterStr(data) {
    this.consultingAdapter=false;
    try {
      this.adapterResult = JSON.parse(data);
      await this.gotAdapter();
    } catch (err) {
      this.errorHandler(err);
    }
  }

  /** Called in "safe" mode when an adapter call has returned json */
  async gotAdapter() {
    try {
      if (this.d) {
        this.log('Got from adapter ' +
          JSON.stringify(this.adapterResult));
      }
      if (!this.adapterResult) {
        if (this.d) this.log('ERROR: onAdapter() called without result');
        return;
      }

      if (this.adapterResult.uid != null) {
        if (this.uid != null && this.uid != this.adapterResult.uid) {
          this.log('UID Cookie Mismatch - Contact Queue-Fair Support! ' +
            'expected ' + this.uid + ' but received ' + this.adapterResult.uid);
        } else {
          this.uid = this.adapterResult.uid;
          this.service.setCookie('QueueFair-Store-' +
            this.config.account, 'u:' +
            this.uid, this.adapterResult.cookieSeconds,
            '/', this.adapterQueue.cookieDomain);
        }
      }

      if (!this.adapterResult.action) {
        if (this.d) this.log('ERROR: onAdapter() called without result action');
      }

      if (this.adapterResult.action=='SendToQueue') {
        if (this.d) this.log('Sending to queue server.');

        let queryParams='';
        const winLoc = this.url;
        if (this.adapterQueue.dynamicTarget != 'disabled') {
          queryParams+='target=';
          queryParams+=this.makeTarget();
        }
        if (this.uid != null) {
          if (queryParams != '') {
            queryParams += '&';
          }
          queryParams += 'qfuid=' + this.uid;
        }

        let redirectLoc = this.adapterResult.location;

        if(this.queueDomain) {
          let qd = this.queueDomain;
          if(this.d) this.log("Using queueDomain "+qd+" on "+redirectLoc);
          let i = redirectLoc.indexOf("//");
          if(i!=-1) {
            i+=2;
            let colPos = redirectLoc.indexOf(":",i);
            let slashPos = redirectLoc.indexOf("/",i);
            if(colPos==-1) {
              //no colon
              if(slashPos==-1) {
                //https://some.domain
                redirectLoc= redirectLoc.substring(0,i)+qd;
              } else {
                //https://some.domain/path
                redirectLoc= redirectLoc.substring(0,i)+qd+redirectLoc.substring(slashPos);
              }
            } else {
              //has a colon
              if(slashPos == -1) {
                //colon no slash
                //https://some.domain:8080
                redirectLoc= redirectLoc.substring(0,i)+qd+redirectLoc.substring(colPos);
              } else if(colPos < slashPos) {
                //https://some.domain:8080/path
                redirectLoc= redirectLoc.substring(0,i)+qd+redirectLoc.substring(colPos);
              } else {
                //https://some.domain/path?param=:
                redirectLoc= redirectLoc.substring(0,i)+qd+redirectLoc.substring(slashPos);
              }
            }
          }
          if(this.d) this.log("queueDomain applied "+redirectLoc);
        }

        if (queryParams!=='') {
          redirectLoc=redirectLoc+'?'+queryParams;
        }
        redirectLoc=this.appendVariant(this.adapterQueue, redirectLoc);
        redirectLoc=this.appendExtra(this.adapterQueue, redirectLoc);

        if (this.d) this.log('Redirecting to '+redirectLoc);
        this.redirectLoc=redirectLoc;
        this.redirect();
        return;
      }
      if (this.adapterResult.action=='CLEAR') {
        if (this.d) this.log('CLEAR received for '+this.adapterResult.queue);
        this.passed[this.adapterResult.queue]=true;
        if (this.parsing) {
          await this.parseSettings();
        }
        return;
      }

      // SafeGuard etc
      this.setCookie(this.adapterResult.queue,
        this.adapterResult.validation,
        this.adapterQueue.passedLifetimeMinutes*60,
        this.adapterQueue.cookieDomain);

      if (this.d) {
        this.log('Marking ' +
          this.adapterResult.queue + ' as passed by adapter.');
      }

      this.passed[this.adapterResult.queue]=true;

      if (this.parsing) {
        await this.parseSettings();
      }
    } catch (err) {
      if (this.d) this.log('QF Error '+err.message);
      this.errorHandler(err);
    }
  }

  /** Redirects the browser.
   */
  redirect() {
    // Either Queue-Fair redirects, or the page continues.
    this.continuePage = false;
    this.service.redirect(this.redirectLoc);
    this.finish();
  }

  /** Sets a Passed Cookie
   *
   * @param {string} queueName the name of the queue.
   * @param {string} value the Passed String to store.
   * @param {number} lifetimeSeconds how long the cookie should persist.
   * @param {string} cookieDomain optional domain - otherwise
   * the page's domain is used.
   */
  setCookie(queueName, value, lifetimeSeconds, cookieDomain) {
    if (this.d) {
      this.log('Setting cookie for ' +
        queueName + ' to ' + value + ' on ' + cookieDomain);
    }

    const cookieName=QueueFairAdapter.cookieNameBase+queueName;

    this.service.setCookie(cookieName, value,
      lifetimeSeconds, '/', cookieDomain);

    if (lifetimeSeconds <= 0) {
      return;
    }

    this.passed[queueName] = true;
    if (this.config.stripPassedString) {
      const loc = this.url;
      const pos = loc.indexOf('qfqid=');
      if (pos == -1) {
        return;
      }
      if (this.d) this.log('Stripping passedString from URL');
      this.redirectLoc = loc.substring(0, pos - 1);
      this.redirect();
    }
  }

  /** Get the content of a URL and call next as a callback.  
   * MODIFIED from node.js - doRequest() not needed and deleted.
   *
   * @param {string} urlStr the url as a string
   * @param {function} next the callback
   */
  loadURL(urlStr, next) {
    const catcher = (err) => {
      this.releaseGetting();
      this.errorHandler(err);
      this.finish();
    };

    fetch(urlStr).then((response) => response.text(), catcher).then((data) => {
      next(data);
    },catcher);
  }

  /** Unsets flags that indicate an http request is in progress.
   */
  releaseGetting() {
    if (this.thisIsGettingSettings) {
      this.thisIsGettingSettings = false;
      QueueFairAdapter.gettingSettings = false;
    }
    if (this.consultingAdapter) {
      this.consultingAdapter = false;
    }
  }

  /** Convenience logging method
   *
   * @param {Object} what the thing to log.
   */
  log(what) {
    console.log('QF '+what);
  }

  /** Gets settings from the memory cache or downloads a fresh
   * copy.  Only one request at a time may attempt the download.
   * Other requests may wait for up to config.readTimeout before
   * trying themselves. MODIFIED to use KV when fresh.
   *
   * */
  async loadSettings() {
    if (QueueFairAdapter.memSettings != null &&
      QueueFairAdapter.lastMemSettingsRead != -1 &&
      Date.now() - QueueFairAdapter.lastMemSettingsRead <
      this.config.settingsCacheLifetimeMinutes * 60 *1000) {
      // Old settings are good.
      if (this.d) this.log('Using mem cached settings.');
      await this.gotSettings(QueueFairAdapter.memSettings);
      return;
    }

    //See if Storage has a fresh enough copy.
    const storedSettings =  await QUEUE_FAIR_STORAGE.get("settings-"+this.config.account);
    if(storedSettings != null) {
      try {
        const json = JSON.parse(storedSettings);
        const stamp = json.stamp;
        if(Date.now() - stamp < this.config.settingsCacheLifetimeMinutes * 60 *1000) {
            //OK use these settings.
          if(this.d) this.log("using settings from KV");
          QueueFairAdapter.memSettings = json;
          QueueFairAdapter.lastMemSettingsRead = Date.now();
          await this.gotSettings(QueueFairAdapter.memSettings);
          return;
        }
        if(this.d) this.log("KV settings are too old");
      } catch (err) {
          //Non-fatal.
        console.log(err);
      }
    }

    if (QueueFairAdapter.gettingSettings &&
      this.settingsCounter < this.config.readTimeout) {
      if (this.d) this.log('Waiting for settings.');
      this.settingsCounter++;
      //Does not require await as result unused.
      setTimeout(() => this.loadSettings(), 1000);
    }

    if (this.d) this.log('Downloading settings.');
    QueueFairAdapter.gettingSettings = true;
    this.thisIsGettingSettings = true;

    //gotSettingsStr does not require await here as result unused.
    this.loadURL('https://files.queue-fair.net/' +
    this.config.account + '/' +
    this.config.accountSecret +
    '/queue-fair-settings.json', (data) => this.gotSettingsStr(data));
  }

  /** Retrieve the query string from the url.
   *
   * @return {string} the query string.
   * */
  getQueryString() {
    if (this.url == null) {
      return '';
    }
    const i = this.url.indexOf('?');
    if (i==-1) {
      return '';
    }
    return this.url.substring(i);
  }

  /** Checks if a Passed String is present and sets the Passed Cookie. 
   * MODIFIED async
   */
  async checkQueryString() {
    const urlParams = this.url;
    if (this.d) this.log('Checking URL for Passed String ' + urlParams);
    const q = urlParams.lastIndexOf('qfqid=');
    if (q === -1) {
      return;
    }

    if (this.d) this.log('Passed string found');

    let i = urlParams.lastIndexOf('qfq=');
    if (i == -1) {
      return;
    }
    if (this.d) this.log('Passed String with Queue Name found');


    const j = urlParams.indexOf('&', i);
    const subStart = i + 'qfq='.length;
    const queueName = urlParams.substring(subStart, j);

    if (this.d) this.log('Queue name is ' + queueName);
    const lim = this.settings.queues.length;


    for (i = 0; i < lim; i++) {
      const queue = this.settings.queues[i];
      if (queue.name != queueName) {
        continue;
      }

      if (this.d) this.log('Found queue for querystring ' + queueName);

      let value = '' + urlParams;
      value = value.substring(value.lastIndexOf('qfqid'));

      if (!await this.validateQuery(queue)) {
        // This can happen if it's a stale query string too
        // so check for valid cookie.
        const queueCookie = this.getCookie(QueueFairAdapter.cookieNameBase +
          queueName);
        if ('' != queueCookie) {
          if (this.d) {
            this.log('Query validation failed but we have cookie ' +
              queueCookie);
          }

          if (await this.validateCookieWithQueue(queue, queueCookie)) {
            if (this.d) this.log('...and the cookie is valid. That\'s fine.');
            return;
          }
          if (this.d) this.log('Query AND Cookie validation failed!!!');
        } else {
          if (this.d) {
            this.log('Bad queueCookie for ' +
              queueName + ' ' + queueCookie);
          }
        }

        let target = this.url;
        const i = target.indexOf("qfqid=");
        if(i != -1) {
          target = target.substring(0,i);
        }
        const loc = this.protocol + '://' + queue.queueServer + '/' +
        queue.name + '?qfError=InvalidQuery&target='+encodeURIComponent(target);

        if (this.d) {
          this.log('Query validation failed - ' +
            ' redirecting to error page.');
        }
        this.redirectLoc = loc;
        this.redirect();
        return;
      }

      if (this.d) {
        this.log('Query validation succeeded for ' + value);
      }
      this.passedString = value;

      this.setCookie(
        queueName,
        value,
        queue.passedLifetimeMinutes * 60,
        queue.cookieDomain);
      if (!this.continuePage) {
        return;
      }

      if (this.d) {
        this.log('Marking ' + queueName + ' as passed by queryString');
      }
      this.passed[queueName] = true;
    }
  }


  /** Called if an irrecoverable error occurs.
   *
   * @param {Object} err an error
   * */
  errorHandler(err) {
    this.releaseGetting();
    console.log('QF Ending with error:');
    console.log(err);
    this.finish();
  }

  /** run some initial setup and checks.
   *
   * @return {boolean} whether the adapter should proceed.
   * */
  setUp() {
    if (this.startsWith(this.config.account, 'DELETE')) {
      this.errorHandler('You must set your account system name in config.');
      return false;
    }
    if (this.startsWith(this.config.accountSecret, 'DELETE')) {
      this.errorHandler('You must set your account secret in config.');
      return false;
    }
    if (this.url == null) {
      this.errorHandler('You must set adapter.url before running the Adapter.');
      return false;
    }
    if (this.userAgent == null) {
      this.errorHandler('You must set adapter.userAgent ' +
        'before running the Adapter.');
      return false;
    }
    if (!this.startsWith(this.url, 'https')) {
      this.protocol = 'http';
    }
    return true;
  }

  /** Start by retrieving settngs. MODIFIED async */
  async goGetSettings() {
    try {
      if (this.d) this.log('Adapter starting Async for '+this.url);
      if (!this.setUp()) {
        return;
      }
      if (this.config.readTimeout < 1) {
        this.config.readTimeout = 1;
      }
      this.setUIDFromCookie();
      await this.loadSettings();
    } catch (err) {
      this.releaseGetting();
      this.errorHandler(err);
    }
  }

  /** Alternative entry point if async functions cannot be used
   * @param {string} settingsStr a string of json.
   * @return {boolean} whether execution of the page should continue.
   * */
  goSimpleModeWithSettings(settingsStr) {
    this.config.adapterMode='simple';
    if (this.d) this.log('Adapter starting for '+this.url);
    if (!this.setUp()) {
      return;
    }
    try {
      this.setUIDFromCookie();

      // for testing
      // settingsStr = JSON.stringify(QueueFairAdapter.memSettings);

      // Really do this.
      const settings = JSON.parse(settingsStr);
      this.gotSettings(settings);
    } catch (err) {
      this.errorHandler(err);
    }
    return this.continuePage;
  }

  /** The main entry point
   *
   * @return {Object} a promise.
   * */
  go() {
    return new Promise((res, rejPromise) => {
      this.res = res;
      this.timeout=setTimeout(() => {
        this.onTimeout();
      }, this.config.readTimeout*1000);
      //Does not require await as returning a promise.
      this.goGetSettings();
    });
  }

  /** Called if it doesn't finish in time. */
  onTimeout() {
    if (this.finished) {
      return;
    }
    this.log('QF Timed Out!');
    this.finished=true;
    if (this.res != null) {
      this.res(this.continuePage);
    }
  }

  /** Called when it's finished to fill the promise */
  finish() {
    if (this.finished) {
      return;
    }
    clearTimeout(this.timeout);
    this.finished=true;
    if (this.res != null) {
      this.res(this.continuePage);
    }
  }
}
