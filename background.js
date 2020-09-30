// Using webRequest API from JavaScript to block urls contain ads before they can be loaded.
  Data = {
    get: function(tabId, frameId) {
      return Data[tabId];
    },

    // Record tabId, frameId points to url.
    record: function(tabId, frameId, url) {
      var fd = Data;
      if (!fd[tabId]) fd[tabId] = {};
      fd[tabId][frameId] = {
        url: url,
        domain: url.hostname,
        resources: {}
      };
    },

    // Track their URLs and watch evey request.
    track: function(details) {
      var fd = Data, tabId = details.tabId;
      delete fd[tabId];
      fd.record(tabId, 0, details.url);
      return true;
    },
  };

  var normalizeRequestType = function(details) {
      if (details.type !== 'other') {
          return details.type;
      }
      return 'object';
  };

  // Block the request when it starts
  function onBeforeRequestHandler(details) {
    if (!Data.track(details))
      return { cancel: false };
    // check if the URL be loaded by the requesting frame.
    var frameDomain = Data.get(details.tabId, details.frameId).domain;
    var blocked = custom_filter.blocking.matches(details.url, 
      ElementTypes.fromOnBeforeRequestType(normalizeRequestType({url: details.url, 
        type: details.type})), frameDomain);

    return { cancel: blocked };
  }
  //Initialize the custom filter lists
  custom_filter = new Combined_List();
  // reset as a default list if not used yet
  custom_filter.init();
  //Call onBeforeRequestHandler function
  chrome.webRequest.onBeforeRequest.addListener(onBeforeRequestHandler, {urls: ["http://*/*", "https://*/*"]}, ["blocking"]);
