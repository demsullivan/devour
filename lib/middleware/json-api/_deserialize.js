'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _forOwn = require('lodash/forOwn');
var _isArray = require('lodash/isArray');
var _isUndefined = require('lodash/isUndefined');
var _isPlainObject = require('lodash/isPlainObject');
var _includes = require('lodash/includes');
var _find = require('lodash/find');
var _get = require('lodash/get');
var _map = require('lodash/map');
var _filter = require('lodash/filter');
var _matches = require('lodash/matches');
var _flatten = require('lodash/flatten');

var Logger = require('../../logger');

var cache = new (function () {
  function _class() {
    _classCallCheck(this, _class);

    this._cache = [];
  }

  _createClass(_class, [{
    key: 'set',
    value: function set(type, id, deserializedData) {
      this._cache.push({
        type: type,
        id: id,
        deserialized: deserializedData
      });
    }
  }, {
    key: 'get',
    value: function get(type, id) {
      var match = _find(this._cache, function (r) {
        return r.type === type && r.id === id;
      });
      return match && match.deserialized;
    }
  }, {
    key: 'clear',
    value: function clear() {
      this._cache = [];
    }
  }]);

  return _class;
}())();

function collection(items, included) {
  var _this = this;

  var useCache = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

  return items.map(function (item) {
    return resource.call(_this, item, included, useCache);
  });
}

function resource(item, included) {
  var _this2 = this;

  var useCache = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

  if (useCache) {
    var cachedItem = cache.get(item.type, item.id);
    if (cachedItem) return cachedItem;
  }

  var model = this.modelFor(this.pluralize.singular(item.type));
  if (model.options.deserializer) return model.options.deserializer.call(this, item, included);

  var deserializedModel = { id: item.id, type: item.type };

  _forOwn(item.attributes, function (value, attr) {
    var attrConfig = model.attributes[attr];

    if (_isUndefined(attrConfig) && attr !== 'id') {
      attr = attr.replace(/-([a-z])/g, function (g) {
        return g[1].toUpperCase();
      });
      attrConfig = model.attributes[attr];
    }

    if (_isUndefined(attrConfig) && attr !== 'id') {
      Logger.warn('Resource response for type "' + item.type + '" contains attribute "' + attr + '", but it is not present on model config and therefore not deserialized.');
    } else {
      if ((typeof attrConfig === 'undefined' ? 'undefined' : _typeof(attrConfig)) === 'object' && !_isUndefined(attrConfig.format)) {
        value = attrConfig.format(value);
      }

      deserializedModel[attr] = value;
    }
  });

  // Important: cache before parsing relationships to avoid infinite loop
  cache.set(item.type, item.id, deserializedModel);

  _forOwn(item.relationships, function (value, rel) {
    var relConfig = model.attributes[rel];

    if (_isUndefined(relConfig)) {
      rel = rel.replace(/-([a-z])/g, function (g) {
        return g[1].toUpperCase();
      });
      relConfig = model.attributes[rel];
    }

    if (_isUndefined(relConfig)) {
      Logger.warn('Resource response for type "' + item.type + '" contains relationship "' + rel + '", but it is not present on model config and therefore not deserialized.');
    } else if (!isRelationship(relConfig)) {
      Logger.warn('Resource response for type "' + item.type + '" contains relationship "' + rel + '", but it is present on model config as a plain attribute.');
    } else {
      deserializedModel[rel] = attachRelationsFor.call(_this2, model, relConfig, item, included, rel);
    }
  });

  var params = ['meta', 'links'];
  params.forEach(function (param) {
    if (item[param]) {
      deserializedModel[param] = item[param];
    }
  });

  cache.clear();

  return deserializedModel;
}

function attachRelationsFor(model, attribute, item, included, key) {
  var relation = null;
  if (attribute.jsonApi === 'hasOne') {
    relation = attachHasOneFor.call(this, model, attribute, item, included, key);
  }
  if (attribute.jsonApi === 'hasMany') {
    relation = attachHasManyFor.call(this, model, attribute, item, included, key);
  }
  return relation;
}

function attachHasOneFor(model, attribute, item, included, key) {
  if (!item.relationships) {
    return null;
  }

  var relatedItems = relatedItemsFor(model, attribute, item, included, key);
  if (relatedItems && relatedItems[0]) {
    return resource.call(this, relatedItems[0], included, true);
  } else {
    return null;
  }
}

function attachHasManyFor(model, attribute, item, included, key) {
  if (!item.relationships) {
    return null;
  }
  var relatedItems = relatedItemsFor(model, attribute, item, included, key);
  if (relatedItems && relatedItems.length > 0) {
    return collection.call(this, relatedItems, included, true);
  }
  return [];
}

function isRelationship(attribute) {
  return _isPlainObject(attribute) && _includes(['hasOne', 'hasMany'], attribute.jsonApi);
}

/*
 *   == relatedItemsFor
 *   Returns unserialized related items.
 */
function relatedItemsFor(model, attribute, item, included, key) {
  var relationMap = _get(item.relationships, [key, 'data'], false);
  if (!relationMap) {
    return [];
  }

  if (_isArray(relationMap)) {
    return _flatten(_map(relationMap, function (relationMapItem) {
      return _filter(included, function (includedItem) {
        return isRelatedItemFor(attribute, includedItem, relationMapItem);
      });
    }));
  } else {
    return _filter(included, function (includedItem) {
      return isRelatedItemFor(attribute, includedItem, relationMap);
    });
  }
}

function isRelatedItemFor(attribute, relatedItem, relationMapItem) {
  var passesFilter = true;
  if (attribute.filter) {
    passesFilter = _matches(relatedItem.attributes, attribute.filter);
  }
  return relatedItem.id === relationMapItem.id && relatedItem.type === relationMapItem.type && passesFilter;
}

module.exports = {
  resource: resource,
  collection: collection
};