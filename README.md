---
## Queue-Fair Free CloudFlare Virtual Waiting Room Network-Edge Adapter README & Installation Guide

Queue-Fair can be added to any web server easily in minutes, and is a great way to get a free CloudFlare virtual waiting room, as Queue-Fair offers its own Free Tier, and the Adapter only users CloudFlare free plan features.  You will need a Queue-Fair account - please visit https://queue-fair.com/free-trial if you don't already have one.  You should also have received our Technical Guide.  To find out more about how a Virtual Waiting Room protects your site or app from traffic spikes, see https://queue-fair.com/virtual-waiting-room

## Client-Side JavaScript Adapter

Most of our customers prefer to use the Client-Side JavaScript Adapter, which is suitable for all sites that wish solely to protect against overload.

To add the Queue-Fair Client-Side JavaScript Adapter to your web server, you don't need the files included in this distribution.

Instead, add the following tag to the `<head>` section of your pages:
 
```
<script data-queue-fair-client="CLIENT_NAME" src="https://files.queue-fair.net/queue-fair-adapter.js"></script>`
```

Replace CLIENT_NAME with the account system name visibile on the Account -> Your Account page of the Queue-Fair Portal

You shoud now see the Adapter tag when you perform View Source after refreshing your pages.

And you're done!  Your queues and activation rules can now be configured in the Queue-Fair Portal.

## CloudFlare Network-Edge Adapter
Using the CloudFlare Adapter means that your CloudFlare implementation communicates directly with the Queue-Fair Queue Server Cluster, rather than your visitors' browsers or your origin server.

This can introduce a dependency between our systems, which is why most customers prefer the Client-Side Adapter.  See Section 10 of the Technical Guide for help regarding which integration method is most suitable for you.

The CloudFlare Adapter is a small JavaSrcript library that will run on CloudFlare when visitors make requests served by CloudFlare.  It is implemented as a single JavaScript file for ease of installation - you can just copy and paste it into the CloudFlare worker editor (see below for step-by-step instructions).  It is adapted from our cross-platform Node Adapter - there are changes to the QueueFairService class, which is the one that usually contains platform-specific code, and also some small changes to the QueueFairAdapter class to use the CloudFlare native fetch and crypto functions.  Unlike our https://github.com/queue-fair/node adapter, all the classes are defined in the one worker.js file, and the QueueFairConfig class is replaced with a constant object.  It all works the same way.

The Adapter periodically checks to see if you have changed your Queue-Fair settings in the Portal, and caches the result in KV storage and memory, but other than that if the visitor is requesting a page that does not match any queue's Activation Rules, it does nothing, and CloudFlare will return a (possibly cached) copy of the page from your origin server(s).

If a visitor requests a page that DOES match any queue's Activation Rules, the Adapter consults the Queue-Fair Queue Servers to make a determination whether that particular visitor should be queued (Safe Mode, recommended) or sends the visitor to be counted at the Queue-Fair Queue Servers (Simple Mode).  If so, the visitor is sent to our Queue Servers and execution and generation of the page for that HTTP request for that visitor will cease, and your origin server will not receive a request.  If the Adapter determines that the visitor should not be queued, it sets a cookie to indicate that the visitor has been processed and CloudFlare will return a page from its cache or contact your origin server as normal.

Thus the CloudFlare Adapter prevents visitors from skipping the queue by disabling the Client-Side JavaScript Adapter, and also eliminates load on your origin server when things get busy.

These instructions assume you already have a CloudFlare account with an origin website already set up.  If that's not the case, you should set one up before proceeding and test that it is working with both https and http requests.  The instructions below assume you don't already have any CloudFlare workers set up on your site already - if that's not the case read the And Finally section below before making any changes.

**IMPORTANT:**  In order for CloudFlare to be able to run the Adapter, the requests must run through the CloudFlare proxy.   This means at least one of the DNS records, usually your A record, in the CloudFlare DNS settings for your site must have the orange **Proxied** status, not the grey DNS Only.  If you are not seeing any requests to the Adapter at all, this is probably why.  You can enable the Proxied status by hitting Edit next to the record, then move the slider, then hit Save.  If you are changing this, we recommend you do it out of office hours.  It may take the Time to Live on your old setting for the change to become apparent.

Here's how to add Queue-Fair to your CloudFlare implementation. 

**1.** Download the latest release of this distribution and unzip it.  You only need one file, `worker.js`.

**2.** The Queue-Fair CloudFlare adapter uses KV storage for efficient operation.  To create the KV storage namespace that the Adapter will use, log in to CloudFlare.  Select **Storage & Databases**.  If you've never set up a CloudFlare Worker before, you may be asked to set up a custom Cloudflare Workers subdomain, or you might need to create a Hello World worker (the big option at the top).  You can choose any subdomain you like - the only requirement is that no-one else has the same subdomain.  So, if you are asked to set up a custom CloudFlare Workers subdomain, pick a subdomain and then **Set Up**, and you probably want the Free plan.  If you do need to create a Hello World worker in order for the KV link in the left nav to work, name it queue-fair-adapter and use it as below.

As soon as you see it in the left nav, select **KV** (it's underneath **Storage & Databases**), then the blue **Create Instance** button.  You'll see a dialog to Create a KV Namespace.  You can call the namespace anything you like - these instructions assume you name it `queue-fair`. Hit the blue **Create** button once you've entered a name.

**3.** Select **Compute (Workers)** from the left nav, and then it's **Workers & Pages**.  Hit the blue **Create** button.  From the Workers tab, **Start with Hello World!** and **Get Started**. The name can be anything you like - these instructions assume you name it `queue-fair-adapter`.  It will come up with some default code, which is fine.  Hit **Deploy**.

**4.** CloudFlare will create your new worker.  Hit **Continue to Project**.  You'll start on the **Metrics** tab.  Go to the **Bindings** tab, then the **Add binding** button, and hit **KV Namespace**.  For Variable Name, this must be `QUEUE_FAIR_STORAGE`.  For KV Namespace, enter the name you chose in Step 2 (probably `queue-fair`).  Hit the blue *Deploy** button.

**5.** Hit the blue **Edit Code** button towards the top of the page - at the time of writing this is a square button that looks like "< / >" at the top right. Copy and paste the contents of `worker.js` into the code editor on the left of the page, COMPLETELY REPLACING the few lines of code that are already there.  You can do this with CTRL-A to Select All and then CTRL-V to paste.

**6.** Enter your Account Secret and Account System Name where indicated at the top of the pasted-in code.  These are shown in the Portal on the Account -> Your Account page.  Please DON'T use the system name or secret of any queue.  Hit the **Deploy** button at the top right. You have to hit **Deploy** every time you finish making any edits to the code in the window.

**7.** OPTIONAL If you want to test the Worker before making it live on your site (recommended), you can type the URL of a page on your site that matches your queue's Activation Rules in the box next to the **GET** pulldown in the **HTTP** tab, and hit the blue Send  button next to it*.  You should see the response come back on the right with a `set-cookie` header containing `Queue-Fair-Store-<account system name>`.  There should be no output in the **Console** unless you have set `debug : true` in the `config` code on the left.  Debug logging is disabled by default, and you should disable debug for live deployments.  When debug logging is enabled, you can see debug logs for requests from browsers in the **Logs** tab for your Worker (at the same level as the Metrics, Bindings and Settings tabs).

**8.** To make the Worker live on your site, select **Account Home** at the top left, and then your website (which we are calling `mysite.com` in these instructions).  In the left nav for your website, select **Workers Routes**, then **Add Route** in **HTTP Routes**.

**9.** OPTIONAL but strongly recommended.  It's best that the Adapter runs on page requests, and not media or static assets like pngs, jpegs or css files.  If you have static assets in a folder on your site, it's best to exclude this folder (or folders) from the Worker.  For example, if your static assets are all under https://mysite.com/assets, go to Websites in the left nav, select your website, add a Route `*mysite.com/assets*` with the **Worker** set to **None**.  This will exclude `assets` and any subfolders from your Worker.  Hit **Save** when you are done with the **Add route** dialog.  The more folders you can exclude with routes, the less often the Adapter will run, and the less likely you are to exceed the CloudFlare Free plan limits.  You can have as many exclusion routes like this as you like, but sadly CloudFlare does not support exludes by file extension (.png, .jpeg, .css etc).  So, by default our Cloudlflare Adapter will not match on these file extensions.  You can see, edit or clear the complete list of excluded file extensions as it is a configuration parameter near the top of worker.js
  
**10.** IMPORTANT Unlike the JavaScript Client-Side Adapter, which only runs in browsers that run JavaScript and only on browsers requesting page URLs that contain the Adapter tag, the Cloudlare adapter runs on every request except those you have excluded with an exclusion route described in step 9 above.  That means if you have automated systems that call API or callback URLs on your site (such as payment gateways), and your Activation Rules match those URLs, they will also be queued when things get busy, which can have adverse effects.  We recommend that you exclude API or callback URLs using the exclusion routes described in step 9 above - you can also use Activation rules to do this.

**11.** To enable the Worker on your site, **Add route**, and it's `*mysite.com/*` for the Route, for **Worker** it's whatever name you chose in Step 3 (probably `queue-fair-adapter`).  If you see an **Environment** setting, it should be `Production`, and we recommend you change **Request limit failure mode** from `Fail closed` to `Fail open` if you are on the CloudFlare Free plan.  This will mean that if your 100,000 free worker requests per day quota is exeeded, your site will still display - it will just be unprotected by Queue-Fair once the limit is reached.

NOTE: The stars matter!  Without a star at the beginning, a malicious visitor could add an extra subdomain and potentially get through.  If you don't have the star at the end, then only the specific path you give will have the Adapter and no other URLs, such that a visitor could add a query string parameter and potentially get through, so always **start and end** your Workers Routes with `*`.
  
**12.** Hit **Save** when you are finished with the **Add route** dialog.  

That's it, you're done!

### To test the CloudFlare Adapter

Use a queue that is not in use on other pages, or create a new queue for testing.

#### Testing SafeGuard
Set up an Activtion Rule to match the page you wish to test.  Hit Make Live.  Go to the Settings page for the queue.  Put it in SafeGuard mode.  Hit Make Live again.  You may need to wait five minutes for the new Activation Rules to become visible to the Adapter - it only checks for new rules once every five minutes, and there is a CDN timeout of five minutes on your settings files too.

In a new Private Browsing window, visit the page on your site that matches the Activation Rules.  

 - Verify that a cookie has been created named `QueueFair-Pass-queuename`, where queuename is the System Name of your queue
 - If the Adapter is in Safe mode (the default), also verify that a cookie has been created named QueueFair-Store-accountname, where accountname is the System Name of your account (on the Your Account page on the portal).
 - If you have set the Adapter to Simple mode in the `config` section at the top of the worker code, the `QueueFair-Store` cookie is not created.
 - Hit Refresh.  Verify that the cookie(s) have not changed their values.

#### Testing Queue
Go back to the Portal and put the queue in Demo mode on the Queue Settings page.  Hit Make Live.  Close ALL Private Browsing windows and tabs (as they share a cookie space) and open a new one.  Go to the page that matches the Activation Rules on your site.

 - Verify that you are now sent to queue.
 - When you come back to the page from the queue, verify that a new `QueueFair-Pass-queuename` cookie has been created.
 - If the Adapter is in Safe mode, also verify that the `QueueFair-Store` cookie has not changed its value.
 - Hit Refresh.  Verify that you are not queued again.  Verify that the cookies have not changed their values.

**IMPORTANT:**  Once you are sure the CloudFlare Adapter is working as expected, remove the Client-Side JavaScript Adapter tag from your pages if you were using it, and also remove any Server-Side Adapter code from your origin server if you had already installed it.

**IMPORTANT:**  Responses that contain a `Location:` header or a `Set-Cookie` header from the Adapter must not be cached!  You can check which cache-control headers are present using your browser's Inspector Network Tab.  The Adapter will set a `Cache-Control` header to disable browser and CloudFlare caching if it sets a cookie or sends a redirect - but you must not override these with your own Worker code or other framework.

### For maximum security

The CloudFlare Adapter contains multiple checks to prevent visitors bypassing the queue, either by tampering with set cookie values or query strings, or by sharing this information with each other.  When a tamper is detected, the visitor is treated as a new visitor, and will be sent to the back of the queue if people are queuing.

 - The CloudFlare Adapter checks that Passed Cookies and Passed Strings presented by web browsers have been signed by our Queue-Server.  It uses the Secret visible on each queue's Settings page to do this.
 - If you change the queue Secret, this will invalidate everyone's cookies and also cause anyone in the queue to lose their place, so modify with care!
 - The CloudFlare Adapter also checks that Passed Strings coming from our Queue Server Cluster to your site were produced within the last 30 seconds.
 - The CloudFlare Adapter also checks that passed cookies were produced within the time limit set by Passed Lifetime on the queue Settings page, to prevent visitors trying to cheat by tampering with cookie expiration times or sharing cookie values.  So, the Passed Lifetime should be set to long enough for your visitors to complete their transaction, plus an allowance for those visitors that are slow, but no longer.
 - The signature also includes the visitor's USER_AGENT, to further prevent visitors from sharing cookie values.

## AND FINALLY

If you already have a Worker that you are already using, then you may need to merge it with the code in `worker.js`.  If you want to run your Worker code *instead of* the Adapter, do it in `addEventListener()`.  This will mean the Adapter does *not* run when your Worker code is run, which is probably not what you want.  If you want to run your Worker code as well as the Queue-Fair Adapter - which means the Adapter protects your pages and worker and is probably what you want - call it from the `getFromCloudFlareCacheOrOrigin(request)` function where indicated.

Remember we are here to help you! The integration process shouldn't take you more than an hour - so if you are scratching your head, ask us.  Many answers are contained in the Technical Guide too.  We're always happy to help!
