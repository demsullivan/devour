'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var axios = require('axios');
var pluralize = require('pluralize');
// Import only what we use from lodash.
var _isUndefined = require('lodash/isUndefined');
var _isString = require('lodash/isString');
var _isPlainObject = require('lodash/isPlainObject');
var _isArray = require('lodash/isArray');
var _defaultsDeep = require('lodash/defaultsDeep');
var _forOwn = require('lodash/forOwn');
var _clone = require('lodash/clone');
var _get = require('lodash/get');
var _set = require('lodash/set');
var _hasIn = require('lodash/hasIn');
var _last = require('lodash/last');
var _map = require('lodash/map');
var _findIndex = require('lodash/findIndex');

require('es6-promise').polyfill();
var deserialize = require('./middleware/json-api/_deserialize');
var serialize = require('./middleware/json-api/_serialize');
var Logger = require('./logger');

/*
 *   == JsonApiMiddleware
 *
 *   Here we construct the middleware stack that will handle building and making
 *   requests, as well as serializing and deserializing our payloads. Users can
 *   easily construct their own middleware layers that adhere to different
 *   standards.
 *
 */
var jsonApiHttpBasicAuthMiddleware = require('./middleware/json-api/req-http-basic-auth');
var jsonApiPostMiddleware = require('./middleware/json-api/req-post');
var jsonApiPatchMiddleware = require('./middleware/json-api/req-patch');
var jsonApiDeleteMiddleware = require('./middleware/json-api/req-delete');
var jsonApiGetMiddleware = require('./middleware/json-api/req-get');
var jsonApiHeadersMiddleware = require('./middleware/json-api/req-headers');
var railsParamsSerializer = require('./middleware/json-api/rails-params-serializer');
var sendRequestMiddleware = require('./middleware/request');
var deserializeResponseMiddleware = require('./middleware/json-api/res-deserialize');
var processErrors = require('./middleware/json-api/res-errors');

var jsonApiMiddleware = [jsonApiHttpBasicAuthMiddleware, jsonApiPostMiddleware, jsonApiPatchMiddleware, jsonApiDeleteMiddleware, jsonApiGetMiddleware, jsonApiHeadersMiddleware, railsParamsSerializer, sendRequestMiddleware, processErrors, deserializeResponseMiddleware];

var JsonApi = function () {
  function JsonApi() {
    var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

    _classCallCheck(this, JsonApi);

    if (!(arguments.length === 2 && _isString(arguments[0]) && _isArray(arguments[1])) && !(arguments.length === 1 && (_isPlainObject(arguments[0]) || _isString(arguments[0])))) {
      throw new Error('Invalid argument, initialize Devour with an object.');
    }

    var defaults = {
      middleware: jsonApiMiddleware,
      logger: true,
      resetBuilderOnCall: true,
      auth: {},
      trailingSlash: { collection: false, resource: false }
    };

    var deprecatedConstructors = function deprecatedConstructors(args) {
      return args.length === 2 || args.length === 1 && _isString(args[0]);
    };

    if (deprecatedConstructors(arguments)) {
      defaults.apiUrl = arguments[0];
      if (arguments.length === 2) {
        defaults.middleware = arguments[1];
      }
    }

    options = _defaultsDeep(options, defaults);
    var middleware = options.middleware;

    this._originalMiddleware = middleware.slice(0);
    this.middleware = middleware.slice(0);
    this.headers = {};
    this.axios = axios;
    this.auth = options.auth;
    this.apiUrl = options.apiUrl;
    this.models = {};
    this.deserialize = deserialize;
    this.serialize = serialize;
    this.builderStack = [];
    this.resetBuilderOnCall = !!options.resetBuilderOnCall;
    if (options.pluralize === false) {
      this.pluralize = function (s) {
        return s;
      };
      this.pluralize.singular = function (s) {
        return s;
      };
    } else if ('pluralize' in options) {
      this.pluralize = options.pluralize;
    } else {
      this.pluralize = pluralize;
    }
    this.trailingSlash = options.trailingSlash === true ? _forOwn(_clone(defaults.trailingSlash), function (v, k, o) {
      _set(o, k, true);
    }) : options.trailingSlash;
    options.logger ? Logger.enable() : Logger.disable();

    if (deprecatedConstructors(arguments)) {
      Logger.warn('Constructor (apiUrl, middleware) has been deprecated, initialize Devour with an object.');
    }
  }

  _createClass(JsonApi, [{
    key: 'enableLogging',
    value: function enableLogging() {
      var enabled = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : true;

      enabled ? Logger.enable() : Logger.disable();
    }
  }, {
    key: 'one',
    value: function one(model, id) {
      this.builderStack.push({ model: model, id: id, path: this.resourcePathFor(model, id) });
      return this;
    }
  }, {
    key: 'all',
    value: function all(model) {
      this.builderStack.push({ model: model, path: this.collectionPathFor(model) });
      return this;
    }
  }, {
    key: 'relationships',
    value: function relationships() {
      this.builderStack.push({ path: 'relationships' });
      return this;
    }
  }, {
    key: 'resetBuilder',
    value: function resetBuilder() {
      this.builderStack = [];
    }
  }, {
    key: 'stackForResource',
    value: function stackForResource() {
      return _hasIn(_last(this.builderStack), 'id');
    }
  }, {
    key: 'addSlash',
    value: function addSlash() {
      return this.stackForResource() ? this.trailingSlash.resource : this.trailingSlash.collection;
    }
  }, {
    key: 'buildPath',
    value: function buildPath() {
      return _map(this.builderStack, 'path').join('/');
    }
  }, {
    key: 'buildUrl',
    value: function buildUrl() {
      var path = this.buildPath();
      var slash = path !== '' && this.addSlash() ? '/' : '';
      return this.apiUrl + '/' + path + slash;
    }
  }, {
    key: 'get',
    value: function get() {
      var params = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

      var req = {
        method: 'GET',
        url: this.urlFor(),
        data: {},
        params: params
      };

      if (this.resetBuilderOnCall) {
        this.resetBuilder();
      }

      return this.runMiddleware(req);
    }
  }, {
    key: 'post',
    value: function post(payload) {
      var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      var meta = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

      var lastRequest = _last(this.builderStack);

      var req = {
        method: 'POST',
        url: this.urlFor(),
        model: _get(lastRequest, 'model'),
        data: payload,
        params: params,
        meta: meta
      };

      if (this.resetBuilderOnCall) {
        this.resetBuilder();
      }

      return this.runMiddleware(req);
    }
  }, {
    key: 'call',
    value: function call(action) {
      var data = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

      var _this = this;

      var params = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
      var meta = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};

      var lastRequest = _last(this.builderStack);
      var model = _get(lastRequest, 'model');

      if (this.models[model].options.actions !== undefined && Object.keys(this.models[model].options.actions).includes(action)) {
        var req = {
          isAction: true,
          method: this.models[model].options.actions[action],
          url: this.urlFor() + '/' + action,
          model: model,
          data: data,
          params: params,
          meta: meta
        };

        if (this.resetBuilderOnCall) {
          this.resetBuilder();
        }

        var payload = { req: req, jsonApi: this };

        return this.axios(req).then(function (res) {
          payload.res = res;
          var responsePromise = Promise.resolve(payload);
          return _this.applyResponseMiddleware(responsePromise);
        }).catch(function (err) {
          Logger.error(err);
          var errorPromise = Promise.resolve(err);
          return _this.applyErrorMiddleware(errorPromise).then(function (err) {
            return Promise.reject(err);
          });
        });
      }
    }
  }, {
    key: 'patch',
    value: function patch(payload) {
      var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      var meta = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

      var lastRequest = _last(this.builderStack);

      var req = {
        method: 'PATCH',
        url: this.urlFor(),
        model: _get(lastRequest, 'model'),
        data: payload,
        params: params,
        meta: meta
      };

      if (this.resetBuilderOnCall) {
        this.resetBuilder();
      }

      return this.runMiddleware(req);
    }
  }, {
    key: 'destroy',
    value: function destroy() {
      var req = null;

      if (arguments.length >= 2) {
        // destroy (modelName, id, [payload], [meta])
        req = {
          method: 'DELETE',
          url: this.urlFor({ model: arguments[0], id: arguments[1] }),
          model: arguments[0],
          data: arguments.length >= 3 ? arguments[2] : {},
          meta: arguments.length >= 4 ? arguments[3] : {}
        };
      } else {
        // destroy ([payload])
        // TODO: find a way to pass meta
        var lastRequest = _last(this.builderStack);

        req = {
          method: 'DELETE',
          url: this.urlFor(),
          model: _get(lastRequest, 'model'),
          data: arguments.length === 1 ? arguments[0] : {}
        };

        if (this.resetBuilderOnCall) {
          this.resetBuilder();
        }
      }

      return this.runMiddleware(req);
    }
  }, {
    key: 'insertMiddlewareBefore',
    value: function insertMiddlewareBefore(middlewareName, newMiddleware) {
      this.insertMiddleware(middlewareName, 'before', newMiddleware);
    }
  }, {
    key: 'insertMiddlewareAfter',
    value: function insertMiddlewareAfter(middlewareName, newMiddleware) {
      this.insertMiddleware(middlewareName, 'after', newMiddleware);
    }
  }, {
    key: 'insertMiddleware',
    value: function insertMiddleware(middlewareName, direction, newMiddleware) {
      var middleware = this.middleware.filter(function (middleware) {
        return middleware.name === middlewareName;
      });
      if (middleware.length > 0) {
        var index = this.middleware.indexOf(middleware[0]);
        if (direction === 'after') {
          index = index + 1;
        }
        this.middleware.splice(index, 0, newMiddleware);
      }
    }
  }, {
    key: 'replaceMiddleware',
    value: function replaceMiddleware(middlewareName, newMiddleware) {
      var index = _findIndex(this.middleware, ['name', middlewareName]);
      this.middleware[index] = newMiddlewarek;
    }
  }, {
    key: 'define',
    value: function define(modelName, attributes) {
      var options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

      this.models[modelName] = {
        attributes: attributes,
        options: options
        //
        // if (options.actions !== undefined) {
        //   this.modelActions[modelName] = Object.keys(options.actions)
        //   options.actions.forEach(actionName => {
        //     this[actionName] = (payload) => {
        //       let lastRequest = _last(this.builderStack)
        //       let model = _get(lastRequest, 'model')
        //       if (this.modelActions[model].includes(actionName)) {
        //         let req = {
        //           method: 'POST',
        //         }
        //       }
        //     }
        //   })
        // }
      };
    }
  }, {
    key: 'resetMiddleware',
    value: function resetMiddleware() {
      this.middleware = this._originalMiddleware.slice(0);
    }
  }, {
    key: 'applyRequestMiddleware',
    value: function applyRequestMiddleware(promise) {
      var requestMiddlewares = this.middleware.filter(function (middleware) {
        return middleware.req;
      });
      requestMiddlewares.forEach(function (middleware) {
        promise = promise.then(middleware.req);
      });
      return promise;
    }
  }, {
    key: 'applyResponseMiddleware',
    value: function applyResponseMiddleware(promise) {
      var responseMiddleware = this.middleware.filter(function (middleware) {
        return middleware.res;
      });
      responseMiddleware.forEach(function (middleware) {
        promise = promise.then(middleware.res);
      });
      return promise;
    }
  }, {
    key: 'applyErrorMiddleware',
    value: function applyErrorMiddleware(promise) {
      var errorsMiddleware = this.middleware.filter(function (middleware) {
        return middleware.error;
      });
      errorsMiddleware.forEach(function (middleware) {
        promise = promise.then(middleware.error);
      });
      return promise;
    }
  }, {
    key: 'runMiddleware',
    value: function runMiddleware(req) {
      var _this2 = this;

      var payload = { req: req, jsonApi: this };
      var requestPromise = Promise.resolve(payload);
      requestPromise = this.applyRequestMiddleware(requestPromise);
      return requestPromise.then(function (res) {
        payload.res = res;
        var responsePromise = Promise.resolve(payload);
        return _this2.applyResponseMiddleware(responsePromise);
      }).catch(function (err) {
        Logger.error(err);
        var errorPromise = Promise.resolve(err);
        return _this2.applyErrorMiddleware(errorPromise).then(function (err) {
          return Promise.reject(err);
        });
      });
    }
  }, {
    key: 'request',
    value: function request(url) {
      var method = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'GET';
      var params = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
      var data = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};

      var req = { url: url, method: method, params: params, data: data };
      return this.runMiddleware(req);
    }
  }, {
    key: 'find',
    value: function find(modelName, id) {
      var params = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

      var req = {
        method: 'GET',
        url: this.urlFor({ model: modelName, id: id }),
        model: modelName,
        data: {},
        params: params
      };
      return this.runMiddleware(req);
    }
  }, {
    key: 'findAll',
    value: function findAll(modelName) {
      var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

      var req = {
        method: 'GET',
        url: this.urlFor({ model: modelName }),
        model: modelName,
        params: params,
        data: {}
      };
      return this.runMiddleware(req);
    }
  }, {
    key: 'create',
    value: function create(modelName, payload) {
      var params = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
      var meta = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};

      var req = {
        method: 'POST',
        url: this.urlFor({ model: modelName }),
        model: modelName,
        params: params,
        data: payload,
        meta: meta
      };
      return this.runMiddleware(req);
    }
  }, {
    key: 'update',
    value: function update(modelName, payload) {
      var params = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
      var meta = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};

      var req = {
        method: 'PATCH',
        url: this.urlFor({ model: modelName, id: payload.id }),
        model: modelName,
        data: payload,
        params: params,
        meta: meta
      };
      return this.runMiddleware(req);
    }
  }, {
    key: 'modelFor',
    value: function modelFor(modelName) {
      if (!this.models[modelName]) {
        throw new Error('API resource definition for model "' + modelName + '" not found. Available models: ' + Object.keys(this.models));
      }

      return this.models[modelName];
    }
  }, {
    key: 'collectionPathFor',
    value: function collectionPathFor(modelName) {
      var collectionPath = _get(this.models[modelName], 'options.collectionPath') || this.pluralize(modelName);
      return '' + collectionPath;
    }
  }, {
    key: 'resourcePathFor',
    value: function resourcePathFor(modelName, id) {
      var collectionPath = this.collectionPathFor(modelName);
      return collectionPath + '/' + encodeURIComponent(id);
    }
  }, {
    key: 'collectionUrlFor',
    value: function collectionUrlFor(modelName) {
      var collectionPath = this.collectionPathFor(modelName);
      var trailingSlash = this.trailingSlash['collection'] ? '/' : '';
      return this.apiUrl + '/' + collectionPath + trailingSlash;
    }
  }, {
    key: 'resourceUrlFor',
    value: function resourceUrlFor(modelName, id) {
      var resourcePath = this.resourcePathFor(modelName, id);
      var trailingSlash = this.trailingSlash['resource'] ? '/' : '';
      return this.apiUrl + '/' + resourcePath + trailingSlash;
    }
  }, {
    key: 'urlFor',
    value: function urlFor() {
      var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

      if (!_isUndefined(options.model) && !_isUndefined(options.id)) {
        return this.resourceUrlFor(options.model, options.id);
      } else if (!_isUndefined(options.model)) {
        return this.collectionUrlFor(options.model);
      } else {
        return this.buildUrl();
      }
    }
  }, {
    key: 'pathFor',
    value: function pathFor() {
      var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

      if (!_isUndefined(options.model) && !_isUndefined(options.id)) {
        return this.resourcePathFor(options.model, options.id);
      } else if (!_isUndefined(options.model)) {
        return this.collectionPathFor(options.model);
      } else {
        return this.buildPath();
      }
    }
  }]);

  return JsonApi;
}();

module.exports = JsonApi;