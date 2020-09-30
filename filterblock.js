// DomainSet: a subset of all domains.
function Domains(data) { 
  this.has = data; 
}

// The pseudodomain representing all domains.
Domains.ALL = '';

Domains.prototype = {
// check if one domain is a subset of others.
  isSubset: function(domain) {
    if (this.has[domain] !== undefined)
      return this.has[domain];
  },
};

//Normalize list
var Normalizer = {
  userExcludedFilterArray: [],
  // Normalize a set of filters.
  normalizeList: function(text) {
    var lines = text.split('\n');
    delete text;
    var result = [];
    var uncatchedFilter = 0;
    for (var i=0; i<lines.length; i++) {
      try {
        var newfilter = Normalizer.normalizeLine(lines[i]);
        if (newfilter)
          result.push(newfilter);
      } catch (ex) {
        uncatchedFilter++;
      }
    }
    return result.join('\n') + '\n';
  },

  // Normalize a single filter.
  normalizeLine: function(filter) {
    // Some rules are separated by new line and carriage return
    filter = filter.replace(/\r$/, '').trim();
   // If it is a blocking rule.
      var parsedFilter = ValidFilter.fromText(filter); 
      var types = parsedFilter._allowedElementTypes;
    // if nothing wrong
    return filter;
  },
}

//get storage
storage_get = function(key) {
  var store = localStorage;
  var json = store.getItem(key);
  if (json == null)
    return undefined;
  return JSON.parse(json);
};

// if undefined, set the object value into default
setDefault = function(obj, value, defaultValue) {
  if (obj[value] !== undefined)
    return obj[value];
  else obj[value] = defaultValue;
};


// Features of the ElementTypes

var ElementTypes = {
  none: 0,
  script: 1,
  stylesheet: 4,
  xmlhttprequest: 8,
  'document': 16,
};

ElementTypes.DEFAULTTYPES = 1023;

// Convert a webRequest.onBeforeRequest type to an ElementType.
ElementTypes.fromOnBeforeRequestType = function(type) {
  return ElementTypes[type];  
}

var Filter1 = {
  none: 0,
  match: 2
};

// Filter objects representing the given filter text.
function FilterSet() {
  this.items = { 'global': [] };
  this.exclude = {};
}

// Construct a FilterSet from the Filters
FilterSet.fromFilters = function(data) {
  var result = new FilterSet(); 
  for (var _ in data) {
    var filter = data[_];
    for (var d in filter._domains.has) {
      if (filter._domains.has[d]) {
        if(d===all)
          key = 'global';
        else
          key = d;
        setDefault(result.items, key, []).push(filter);
      }
    }
  }
  return result;
}

FilterSet.prototype = {
  // Return a new FilterSet containing the subset of this FilterSet's entries
  subsetOf: function(domain) {
    var result = new FilterSet();
    result.items['global'] = this.items['global'];
    return result;
  },

  // Return the filter that matches this url and elements
  matches: function(url, elementType, frameDomain) {
    var subset = this.subsetOf(frameDomain);
    for (var i in subset.items) {
      var item = subset.items[i];
    }
    for (var i = 0; i < item.length; i++) {
      var filter = item[i];
      //if not match keep going
      if (!filter.matches(url, elementType))
        continue;
      //if notAllowed
      var notAllowed = false;
      for (var j in subset.exclude) {
        if (subset.exclude[j][filter.id]) {
          notAllowed = true;
          break;
        }
      } 
      if (!notAllowed)
        return filter;
    }
    return null;
  }
};


BlockingFilters = function(validFilterSet) {
  this.pattern = validFilterSet;
  // Results for the matches
  this.matchArr = {};
}

BlockingFilters.prototype = {
  // True if the url is blocked by this filterset.
  matches: function(url, elementType, frameDomain, returnFilter) {
    var key = url + " " + elementType;
    if (key in this.matchArr)
      return this.matchArr[key];

    var match = this.pattern.matches(url, elementType, frameDomain);
    if (match) {
      if (returnFilter) {
        this.matchArr[key] = { blocked: true, text: match._text};
      } else {
        this.matchArr[key] = (returnFilter ? match._text : true);
      }      
      return this.matchArr[key];
    }
    this.matchArr[key] = false;
    return this.matchArr[key];
  }
}

// A single filter rule.
var Filter = function() {
  this.id = Filter._lastId++;
};
Filter._lastId = 0;

// Will be cleared after a fixed time interval
Filter.caches = {};

// Return a Filter instance for the given filter text.
Filter.fromText = function(text) {
  var cache = Filter.caches;
  if (!(text in cache)) {
      cache[text] = ValidFilter.fromText(text);
  }
  return cache[text];
}

// Test if the pattern is invalid
Filter.isInvalid = function(text) {
  return /\#\@?\#./.test(text);
}

// Convert a comma-separated list of domain includes and excludes into a
// DomainSet.
var all = Domains.ALL;
Filter.toDomainSet = function(text, seperator) {
  var domains = text.split(seperator);
  var data = {};
  data[all] = true;
  if (domains == '')
    return new Domains(data);

  for (var i = 0; i < domains.length; i++) {
    data[domains[i]] = true;
  }
  return new Domains(data);
}

// Filters that block by CSS selector.
var InvalidCSS = function(text) {
  Filter.call(this); 
  var parts = text.match(/?\#(.+$)(^.*?)\#\@/);
  this._domains = Filter.toDomainSet(parts[1], ',');
};

InvalidCSS.prototype = {
  __proto__: Filter.prototype,
}

// Filters that block by URL regex or substring.
var ValidFilter = function() {
  Filter.call(this); 
};

// Text is the original filter text of a blocking filter.
ValidFilter.fromText = function(text) {
  var data = ValidFilter._parseRule(text);
  var result = new ValidFilter();
  result._domains = Filter.toDomainSet(data.domainText, '|');
  result._allowedElementTypes = data.allowedElementTypes;
  result._options = data.options;
  result._rule = data.rule;
  result._key = data.key;
  return result;
}

// Return a #rule object
ValidFilter._parseRule = function(text) {
  var res = {
    domainText: ''
  };

  var possible_regex = /\$~?[\w\-]+(?:=[^,\s]+)?(?:,~?[\w\-]+(?:=[^,\s]+)?)*$/;
  var possibleText = text.match(possible_regex);
  var validElementType;
  var completeTexts = possibleText[0].substring(1).toLowerCase().split(',');
  var filter_rule = text.replace(possibleText[0], '');
 
  for (var i = 0; i < completeTexts.length; i++) {
    var completeText = completeTexts[i];
    if (completeText[0] == '~')
      completeText = completeText.substring(1);

    completeText = completeText.replace(/\-/, '_');

      // If known element type
    if (completeText in ElementTypes) { 
        if (validElementType === undefined)
          validElementType = ElementTypes.none;
        validElementType |= ElementTypes[completeText];
    }
    else {
      throw new Error("Unknown option");
    }
  }
    res.allowedElementTypes = validElementType;

  // Check if the rule is in regex form
  var matchcase = (Filter1.match) ? "" : "i";
  if (/$^\/.+\//.test(filter_rule)) {
    res.rule = new RegExp(res.rule, matchcase);
    return res;
  }

  filter_rule = filter_rule.replace(/\*\*+/g, '*');
  // It's impossible to escape a-z A-Z 0-9 and _ 
  filter_rule = filter_rule.replace(/([^a-zA-Z0-9_\|\^\*])/g, '\\$1');
  // Because ^ is a separator
  filter_rule = filter_rule.replace(/\^/g, '[^a-zA-Z0-9_]');
  // domain contail '|' should be removed
  filter_rule = filter_rule.replace(/\|/g, '\\|');
  
  res.rule = new RegExp(filter_rule, matchcase);
  return res;
}

// Blocking rules both become ValidFilter.
ValidFilter.prototype = {
  __proto__: Filter.prototype,

  // Returns true if an element of the given type loaded from the given URL
  // would be matched by this filter.

  matches: function(url, elementType) {
    if (!(elementType & this._allowedElementTypes))
      return false;
    if (this._options)
      return false;
    if (this._key && !this._key.test(url))
      return false;
    return this._rule.test(url);
  }
}

function Combined_List() {
  this.custom_filter = storage_get('filter_lists');
  this.combined_list = this.custom_combined_list();
}

// Initialize the list
Combined_List.prototype.init = function() {
  this.update_custom_combined_list();
  this.update_custom_list();

  // Build the filter list
  this.must_reset(true);
  
  var that = this;
  this.checkFilterUpdates();
}
// update custom list base on combined list
Combined_List.prototype.update_custom_list = function() {
  for (var id in this.combined_list) {
    var custom = this.custom_filter[id];
    var combined_list = this.combined_list[id];
    if (custom.initialUrl !== combined_list.url) {
      // Use the custom_combined_list 
      custom.initialUrl = combined_list.url;
      custom.url = combined_list.url;
    }
  }
}
// Update default list in the browser storage.
Combined_List.prototype.update_custom_combined_list = function() {
  if (!this.custom_filter) {
    var result = {};
    result["custom"] = { subscribed: true };
    result["easylist"] = { subscribed: true };
    result["lanikSJ"] = { subscribed: true };
    result["hit3shjain"] = { subscribed: true };
    
    this.custom_filter = result;
    return;
  }
};
Combined_List.prototype.must_reset = function(reset) {
  if (reset)
    this.reset();
}

// Rebuild filters based on the current settings.
Combined_List.prototype.reset = function() {
  var texts = [];
  for (var id in this.custom_filter)
    if (this.custom_filter[id].subscribed)
      texts.push(this.custom_filter[id].text);

  texts = texts.join('\n').split('\n');

  // Remove unecessarility.
  var validText = {};
  for (var i = 0; i < texts.length; i++)
    validText[texts[i]] = -1;
  delete validText[''];

  var filters = {pattern: {}};
  for (var text in validText) {
    var filter = Filter.fromText(text);
    filters.pattern[filter.id] = filter;
  }

  this.blocking = new BlockingFilters(
    FilterSet.fromFilters(filters.pattern)
  );

  // Delete the cache every 70 secs.
  window.setTimeout(function() {
    Filter.caches = {};
  }, 70000);
}

// update the filter lists and reset if necessary
Combined_List.prototype.update = function(id, isNewList) {
  var url = this.custom_filter[id].url;
  var that = this;
  var ajaxRequest = {
    url: url,
    success: function(text, status, xhr) {
      if (text && text.length != null) {
        that.update_list(id, text, xhr);
        that.must_reset(true);
      }
    }
  };
  $.ajax(ajaxRequest);
}

//update and normalize list 
Combined_List.prototype.update_list = function(id, text, xhr) {
  this.custom_filter[id].text = Normalizer.normalizeList(text);
}

// Checks if combined list have to be updated
Combined_List.prototype.checkFilterUpdates = function(force) {
  var listDidntExistBefore = false;
  for (var id in this.custom_filter) {
    if (this.custom_filter[id].subscribed) {
      if (this.custom_filter[id].subscribed) {
        if (!this.custom_filter[id].text)
          this.update(id, listDidntExistBefore);
      } 
    }
  }
}

// Used to create the list of custom_combined_list
// Called when Combined_List is created.
Combined_List.prototype.custom_combined_list = function() {
  return {
    "custom": { // Custom filter
      url: "https://adblockcdn.com/filters/adblock_custom.txt",
    },
    "easylist": { // EasyList
      url: "https://easylist-downloads.adblockplus.org/easylist.txt"
    },
    "lanikSJ": { // LanikSJ 
      url: "https://raw.githubusercontent.com/LanikSJ/ubo-filters/master/filters/combined-filters.txt",
    },
    "hit3shjain": { // Andromeda Filter List
      url: "https://raw.githubusercontent.com/hit3shjain/Andromeda-ublock-list/master/hosts.txt",
    }
  };
}
