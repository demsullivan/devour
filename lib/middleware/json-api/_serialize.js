'use strict';

var _isPlainObject = require('lodash/isPlainObject');
var _includes = require('lodash/includes');
var _map = require('lodash/map');
var _forOwn = require('lodash/forOwn');

function collection(modelName, items) {
  var _this = this;

  return items.map(function (item) {
    return resource.call(_this, modelName, item);
  });
}

function resource(modelName, item) {
  var model = this.modelFor(modelName);
  var options = model.options || {};
  var readOnly = options.readOnly || [];
  var typeName = options.type || this.pluralize(modelName);
  var serializedAttributes = {};
  var serializedRelationships = {};
  var serializedResource = {};
  if (options.serializer) {
    return options.serializer.call(this, item);
  }
  _forOwn(model.attributes, function (value, key) {
    if (isReadOnly(key, readOnly)) {
      return;
    }
    if (isRelationship(value)) {
      serializeRelationship(key, item[key], value, serializedRelationships);
    } else {
      serializedAttributes[key] = item[key];
    }
  });

  serializedResource.type = typeName;

  var attrValues = Object.keys(serializedAttributes).map(function (key) {
    return serializedAttributes[key];
  });

  if (Boolean(attrValues) && attrValues.filter(function (val) {
    return val === undefined;
  }).length !== attrValues.length) {
    serializedResource.attributes = serializedAttributes;
  }

  if (Object.keys(serializedRelationships).length > 0) {
    serializedResource.relationships = serializedRelationships;
  }

  if (item.id) {
    serializedResource.id = item.id;
  }

  if (item.meta) {
    serializedResource.meta = item.meta;
  }

  if (item.links) {
    serializedResource.links = item.links;
  }
  return serializedResource;
}

function isReadOnly(attribute, readOnly) {
  return readOnly.indexOf(attribute) !== -1;
}

function isRelationship(attribute) {
  return _isPlainObject(attribute) && _includes(['hasOne', 'hasMany'], attribute.jsonApi);
}

function serializeRelationship(relationshipName, relationship, relationshipType, serializeRelationships) {
  if (relationshipType.jsonApi === 'hasMany' && relationship !== undefined) {
    serializeRelationships[relationshipName] = serializeHasMany(relationship, relationshipType.type);
  }
  if (relationshipType.jsonApi === 'hasOne' && relationship !== undefined) {
    serializeRelationships[relationshipName] = serializeHasOne(relationship, relationshipType.type);
  }
}

function serializeHasMany(relationships, type) {
  return {
    data: _map(relationships, function (item) {
      return { id: item.id, type: type || item.type };
    })
  };
}

function serializeHasOne(relationship, type) {
  if (relationship === null) {
    return { data: null };
  }
  return {
    data: { id: relationship.id, type: type || relationship.type }
  };
}

module.exports = {
  resource: resource,
  collection: collection
};