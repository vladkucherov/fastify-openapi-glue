"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// index.js
var index_exports = {};
__export(index_exports, {
  ParserV3: () => ParserV3,
  SecurityError: () => SecurityError,
  default: () => index_default,
  fastifyOpenapiGlue: () => fastifyOpenapiGlue,
  options: () => options
});
module.exports = __toCommonJS(index_exports);
var import_fastify_plugin = __toESM(require("fastify-plugin"), 1);

// lib/Parser.js
var import_openapi_schema_validator = require("@seriousme/openapi-schema-validator");

// lib/ParserBase.js
var HttpOperations = /* @__PURE__ */ new Set([
  "delete",
  "get",
  "head",
  "patch",
  "post",
  "put",
  "options"
]);
var ParserBase = class {
  constructor() {
    this.config = { generic: {}, routes: [], contentTypes: /* @__PURE__ */ new Set() };
  }
  makeOperationId(operation, path) {
    const firstUpper = (str) => str.substr(0, 1).toUpperCase() + str.substr(1);
    const by = (_matched, p1) => `By${firstUpper(p1)}`;
    const parts = path.split("/").slice(1);
    parts.unshift(operation);
    const opId = parts.map((item, i) => i > 0 ? firstUpper(item) : item).join("").replace(/{(\w+)}/g, by).replace(/[^a-z]/gi, "");
    return opId;
  }
  makeURL(path) {
    return path.replace(/{(\w+)}/g, ":$1");
  }
  copyProps(source, target, list, copyXprops = false) {
    for (const item in source) {
      if (list.includes(item) || copyXprops && item.startsWith("x-")) {
        target[item] = source[item];
      }
    }
  }
  removeRecursion(schemas) {
    function escapeJsonPointer(str) {
      return str.replace(/~/g, "~0").replace(/\//g, "~1");
    }
    function processSchema(obj) {
      let refAdded = false;
      function inspectNode(obj2, path, paths2) {
        if (typeof obj2 === "object" && obj2 !== null) {
          if (paths2.has(obj2)) {
            return paths2.get(obj2);
          }
          const newPaths = new Map(paths2);
          newPaths.set(obj2, path);
          for (const key in obj2) {
            const $ref = inspectNode(
              obj2[key],
              `${path}/${escapeJsonPointer(key)}`,
              newPaths
            );
            if (typeof $ref === "string") {
              obj2[key] = { $ref };
              refAdded = true;
            }
          }
        }
        return void 0;
      }
      const paths = /* @__PURE__ */ new Map();
      inspectNode(obj, "#", paths);
      if (refAdded && typeof obj["$id"] === "undefined") {
        obj["$id"] = "http://example.com/fastifySchema";
      }
    }
    for (const item in schemas) {
      const schema = schemas[item];
      if (item === "response") {
        for (const responseCode in schema) {
          processSchema(schema[responseCode]);
        }
      } else {
        if (schema.content) {
          for (const contentType in schema.content) {
            processSchema(schema.content[contentType].schema);
          }
        } else {
          processSchema(schema);
        }
      }
    }
  }
  processOperation(path, operation, operationSpec, genericSchema) {
    if (operationSpec["x-no-fastify-config"]) {
      return;
    }
    const route = {
      method: operation.toUpperCase(),
      url: this.makeURL(path),
      schema: this.makeSchema(genericSchema, operationSpec),
      openapiPath: path,
      operationId: operationSpec.operationId || this.makeOperationId(operation, path),
      openapiSource: operationSpec,
      security: operationSpec.security || this.spec.security
    };
    if (operationSpec["x-fastify-config"]) {
      route.config = operationSpec["x-fastify-config"];
    }
    this.config.routes.push(route);
  }
  processPaths(paths) {
    const copyItems = ["summary", "description"];
    for (const path in paths) {
      const genericSchema = {};
      const pathSpec = paths[path];
      this.copyProps(pathSpec, genericSchema, copyItems, true);
      if (typeof pathSpec.parameters === "object") {
        this.parseParameters(genericSchema, pathSpec.parameters);
      }
      for (const operation in pathSpec) {
        if (HttpOperations.has(operation)) {
          this.processOperation(
            path,
            operation,
            pathSpec[operation],
            genericSchema
          );
        }
      }
    }
  }
};

// lib/Parser.v2.js
var paramSchemaProps = [
  "type",
  "description",
  "format",
  "allowEmptyValue",
  "items",
  "collectionFormat",
  "default",
  "maximum",
  "exclusiveMaximum",
  "minimum",
  "exclusiveMinimum",
  "maxLength",
  "minLength",
  "pattern",
  "maxItems",
  "minItems",
  "uniqueItems",
  "enum",
  "multipleOf"
];
var ParserV2 = class extends ParserBase {
  parseParams(data) {
    const params = {
      type: "object",
      properties: {}
    };
    const required = [];
    for (const item of data) {
      if (item.type === "file") {
        item.type = "string";
        item.isFile = true;
      }
      params.properties[item.name] = {};
      this.copyProps(item, params.properties[item.name], paramSchemaProps);
      if (item.required) {
        required.push(item.name);
      }
    }
    if (required.length > 0) {
      params.required = required;
    }
    return params;
  }
  parseParameters(schema, data) {
    const params = [];
    const querystring = [];
    const headers = [];
    const formData = [];
    for (const item of data) {
      switch (item.in) {
        case "body": {
          schema.body = item.schema;
          break;
        }
        case "formData": {
          formData.push(item);
          break;
        }
        case "path": {
          params.push(item);
          break;
        }
        case "query": {
          querystring.push(item);
          break;
        }
        case "header": {
          headers.push(item);
          break;
        }
      }
    }
    if (params.length > 0) {
      schema.params = this.parseParams(params);
    }
    if (querystring.length > 0) {
      schema.querystring = this.parseParams(querystring);
    }
    if (headers.length > 0) {
      schema.headers = this.parseParams(headers);
    }
    if (formData.length > 0) {
      schema.body = this.parseParams(formData);
    }
  }
  parseResponses(responses) {
    const result = {};
    for (const httpCode in responses) {
      if (responses[httpCode].schema !== void 0) {
        result[httpCode] = responses[httpCode].schema;
        continue;
      }
      if (this.options.addEmptySchema) {
        result[httpCode] = {};
      }
    }
    return result;
  }
  makeSchema(genericSchema, data) {
    const schema = Object.assign({}, genericSchema);
    const copyItems = [
      "tags",
      "summary",
      "description",
      "operationId",
      "produces",
      "consumes",
      "deprecated"
    ];
    this.copyProps(data, schema, copyItems, true);
    if (data.parameters) {
      this.parseParameters(schema, data.parameters);
    }
    const response = this.parseResponses(data.responses);
    if (Object.keys(response).length > 0) {
      schema.response = response;
    }
    this.removeRecursion(schema);
    return schema;
  }
  parse(spec, options2) {
    this.spec = spec;
    this.options = {
      addEmptySchema: options2.addEmptySchema ?? false
    };
    for (const item in spec) {
      switch (item) {
        case "paths": {
          this.processPaths(spec.paths);
          break;
        }
        case "basePath":
          this.config.prefix = spec[item];
          break;
        case "securityDefinitions":
          this.config.securitySchemes = spec[item];
          break;
        default:
          this.config.generic[item] = spec[item];
      }
    }
    return this.config;
  }
};

// lib/Parser.v3.js
function isExploding(item) {
  const explode = !!(item.explode ?? item.style === "form");
  return explode !== false && item.schema?.type === "object";
}
var ParserV3 = class extends ParserBase {
  parseQueryString(data) {
    if (data.length === 1) {
      if (typeof data[0].content === "object") {
        return this.parseContent(data[0], true);
      }
      if (isExploding(data[0])) {
        return data[0].schema;
      }
    }
    return this.parseParams(data);
  }
  parseParams(data) {
    const params = {
      type: "object",
      properties: {}
    };
    const required = [];
    for (const item of data) {
      params.properties[item.name] = item.schema;
      this.copyProps(item, params.properties[item.name], ["description"]);
      if (item.required) {
        required.push(item.name);
      }
    }
    if (required.length > 0) {
      params.required = required;
    }
    return params;
  }
  parseParameters(schema, data) {
    const params = [];
    const querystring = [];
    const headers = [];
    const cookies = [];
    for (const item of data) {
      switch (item.in) {
        // case "body":
        //   schema.body = item.schema;
        //   break;
        // case "formData":
        //   formData.push(item);
        //   break;
        case "path": {
          item.style = item.style || "simple";
          params.push(item);
          break;
        }
        case "query": {
          item.style = item.style || "form";
          querystring.push(item);
          break;
        }
        case "header": {
          item.style = item.style || "simple";
          headers.push(item);
          break;
        }
        case "cookie": {
          if (this.options.addCookieSchema) {
            item.style = item.style || "form";
            cookies.push(item);
          } else {
            console.warn("cookie parameters are not supported by Fastify");
          }
          break;
        }
      }
    }
    if (params.length > 0) {
      schema.params = this.parseParams(params);
    }
    if (querystring.length > 0) {
      schema.querystring = this.parseQueryString(querystring);
    }
    if (headers.length > 0) {
      schema.headers = this.parseParams(headers);
    }
    if (cookies.length > 0) {
      schema.cookies = this.parseParams(cookies);
    }
  }
  parseContent(data, maxOne = false) {
    if (data?.content) {
      const result = { content: {} };
      const mimeTypes = Object.keys(data.content);
      if (mimeTypes.length === 0) {
        return void 0;
      }
      for (const mimeType of mimeTypes) {
        this.config.contentTypes.add(mimeType);
        if (data.content[mimeType].schema) {
          result.content[mimeType] = {};
          result.content[mimeType].schema = data.content[mimeType].schema;
        }
        if (maxOne) {
          return data.content[mimeType].schema;
        }
      }
      return result;
    }
    return void 0;
  }
  parseResponses(responses) {
    const result = {};
    for (const httpCode in responses) {
      const body = this.parseContent(responses[httpCode]);
      if (body !== void 0) {
        result[httpCode] = body;
        continue;
      }
      if (this.options.addEmptySchema) {
        result[httpCode] = {};
      }
    }
    return result;
  }
  makeSchema(genericSchema, data) {
    const schema = Object.assign({}, genericSchema);
    const copyItems = ["tags", "summary", "description", "operationId"];
    this.copyProps(data, schema, copyItems, true);
    if (data.parameters) {
      this.parseParameters(schema, data.parameters);
    }
    const body = this.parseContent(data.requestBody);
    if (body) {
      schema.body = body;
    }
    const response = this.parseResponses(data.responses);
    if (Object.keys(response).length > 0) {
      schema.response = response;
    }
    this.removeRecursion(schema);
    return schema;
  }
  parse(spec, options2) {
    this.spec = spec;
    this.options = {
      addEmptySchema: options2.addEmptySchema ?? false,
      addCookieSchema: options2.addCookieSchema ?? false
    };
    for (const item in spec) {
      switch (item) {
        case "paths": {
          this.processPaths(spec.paths);
          break;
        }
        case "components":
          if (spec.components.securitySchemes) {
            this.config.securitySchemes = spec.components.securitySchemes;
          }
          break;
        default:
          this.config.generic[item] = spec[item];
      }
    }
    return this.config;
  }
};

// lib/Parser.js
var Parser = class {
  /**
   * get the original specification as object
   * @returns {object}
   */
  specification() {
    return this.original;
  }
  async preProcessSpec(specification) {
    const validator = new import_openapi_schema_validator.Validator();
    try {
      const res = await validator.validate(specification);
      if (res.valid) {
        this.original = JSON.parse(
          JSON.stringify(validator.specification, null, 2)
        );
        return {
          valid: true,
          version: validator.version,
          spec: validator.resolveRefs()
        };
      }
      throw Error(JSON.stringify(res.errors, null, 2));
    } catch (e) {
      console.log(e.message);
      return { valid: false };
    }
  }
  /**
   * parse a openapi specification
   * @param {string|object} specification Filename of JSON/YAML file or object containing an openapi specification
   * @returns {object} fastify configuration information
   */
  async parse(specification, options2 = {}) {
    const supportedVersions = /* @__PURE__ */ new Set(["2.0", "3.0", "3.1", "3.2"]);
    const res = await this.preProcessSpec(specification);
    if (!(res.valid && supportedVersions.has(res.version))) {
      throw new Error(
        "'specification' parameter must contain a valid specification of a supported OpenApi version"
      );
    }
    if (res.version === "2.0") {
      const parserV2 = new ParserV2();
      return parserV2.parse(res.spec, options2);
    }
    const parserV3 = new ParserV3();
    return parserV3.parse(res.spec, options2);
  }
};

// lib/securityHandlers.js
var SecurityError = class extends Error {
  constructor(message, statusCode, name, errors) {
    super(message);
    this.statusCode = statusCode;
    this.name = name;
    this.errors = errors;
  }
};
var SecurityHandlers = class {
  /** constructor */
  constructor(handlers) {
    this.handlers = handlers;
    this.handlerMap = /* @__PURE__ */ new Map();
    this.missingHandlers = [];
  }
  add(schemes) {
    if (!(schemes?.length > 0)) {
      return false;
    }
    const mapKey = JSON.stringify(schemes);
    if (!this.handlerMap.has(mapKey)) {
      for (const schemeList of schemes) {
        for (const name in schemeList) {
          if (!(name in this.handlers)) {
            this.handlers[name] = () => {
              throw `Missing handler for "${name}" validation`;
            };
            this.missingHandlers.push(name);
          }
        }
      }
      this.handlerMap.set(mapKey, this._buildHandler(schemes));
    }
    return this.handlerMap.has(mapKey);
  }
  get(schemes) {
    const mapKey = JSON.stringify(schemes);
    return this.handlerMap.get(mapKey);
  }
  has(schemes) {
    const mapKey = JSON.stringify(schemes);
    return this.handlerMap.has(mapKey);
  }
  getMissingHandlers() {
    return this.missingHandlers;
  }
  _buildHandler(schemes) {
    const securityHandlers = this.handlers;
    return async (req, reply) => {
      const handlerErrors = [];
      const schemeListDone = [];
      let statusCode = 401;
      for (const schemeList of schemes) {
        let name;
        const andList = [];
        try {
          for (name in schemeList) {
            const parameters = schemeList[name];
            andList.push(name);
            await securityHandlers[name](req, reply, parameters);
          }
          return;
        } catch (err) {
          req.log.debug(`Security handler '${name}' failed: '${err}'`);
          handlerErrors.push(err);
          if (err.statusCode !== void 0) {
            statusCode = err.statusCode;
          }
        }
        schemeListDone.push(andList.toString());
      }
      throw new SecurityError(
        `None of the security schemes (${schemeListDone.join(
          ", "
        )}) successfully authenticated this request.`,
        statusCode,
        "Unauthorized",
        handlerErrors
      );
    };
  }
};

// index.js
function checkObject(obj, name) {
  if (typeof obj === "object" && obj !== null) {
    return;
  }
  throw new Error(`'${name}' parameter must refer to an object`);
}
function checkParserValidators(instance, contentTypes) {
  for (const contentType of contentTypes) {
    if (!instance.hasContentTypeParser(contentType)) {
      instance.log.warn(`ContentTypeParser for '${contentType}' not found`);
    }
  }
}
function notImplemented(operationId) {
  return async () => {
    throw new Error(`Operation ${operationId} not implemented`);
  };
}
function defaultOperationResolver(routesInstance, serviceHandlers) {
  return (operationId) => {
    if (operationId in serviceHandlers) {
      routesInstance.log.debug(`serviceHandlers has '${operationId}'`);
      return serviceHandlers[operationId].bind(serviceHandlers);
    }
  };
}
function createSecurityHandlers(instance, security, config) {
  for (const item of config.routes) {
    security.add(item.security);
  }
  const missingSecurityHandlers = security.getMissingHandlers();
  if (missingSecurityHandlers.length > 0) {
    instance.log.warn(
      `Handlers for some security requirements were missing: ${missingSecurityHandlers.join(
        ", "
      )}`
    );
  }
}
async function getSecurity(instance, securityHandlers, config) {
  if (securityHandlers) {
    checkObject(securityHandlers, "securityHandlers");
    const security = new SecurityHandlers(securityHandlers);
    if ("initialize" in securityHandlers) {
      await securityHandlers.initialize(config.securitySchemes);
    }
    createSecurityHandlers(instance, security, config);
    return security;
  }
  return void 0;
}
function getResolver(instance, serviceHandlers, operationResolver) {
  if (serviceHandlers && operationResolver) {
    throw new Error(
      "'serviceHandlers' and 'operationResolver' are mutually exclusive"
    );
  }
  if (!(serviceHandlers || operationResolver)) {
    throw new Error(
      "either 'serviceHandlers' or 'operationResolver' are required"
    );
  }
  if (operationResolver) {
    return operationResolver;
  }
  checkObject(serviceHandlers, "serviceHandlers");
  return defaultOperationResolver(instance, serviceHandlers);
}
function serviceHandlerOptions(resolver, item) {
  const handler = resolver(item.operationId, item.method, item.openapiPath);
  const routeOptions = typeof handler === "function" ? { handler } : { ...handler };
  routeOptions.handler = routeOptions.handler || notImplemented(item.operationId);
  return routeOptions;
}
function securityHandler(security, item) {
  if (security?.has(item.security)) {
    return security.get(item.security).bind(security.handlers);
  }
  return void 0;
}
function makeGenerateRoutes(config, resolver, security) {
  return async function generateRoutes(routesInstance) {
    for (const item of config.routes) {
      routesInstance.route({
        method: item.method,
        url: item.url,
        schema: item.schema,
        config: item.config,
        preHandler: securityHandler(security, item),
        ...serviceHandlerOptions(resolver, item)
      });
    }
  };
}
async function plugin(instance, opts) {
  const parser = new Parser();
  const config = await parser.parse(opts.specification, {
    addEmptySchema: opts.addEmptySchema ?? false,
    addCookieSchema: opts.addCookieSchema ?? false
  });
  checkParserValidators(instance, config.contentTypes);
  if (opts.service) {
    process.emitWarning(
      "The 'service' option is deprecated, use 'serviceHandlers' instead.",
      "DeprecationWarning",
      "FSTOGDEP001"
    );
    opts.serviceHandlers = opts.service;
  }
  const resolver = getResolver(
    instance,
    opts.serviceHandlers,
    opts.operationResolver
  );
  const security = await getSecurity(instance, opts.securityHandlers, config);
  const routeConf = {};
  if (opts.prefix) {
    routeConf.prefix = opts.prefix;
  } else if (config.prefix) {
    routeConf.prefix = config.prefix;
  }
  await instance.register(
    makeGenerateRoutes(config, resolver, security),
    routeConf
  );
}
var fastifyOpenapiGlue = (0, import_fastify_plugin.default)(plugin, {
  fastify: ">=4.0.0",
  name: "fastify-openapi-glue"
});
var index_default = fastifyOpenapiGlue;
var options = {
  specification: "examples/petstore/petstore-openapi.v3.json",
  serviceHandlers: "examples/petstore/serviceHandlers.js"
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ParserV3,
  SecurityError,
  fastifyOpenapiGlue,
  options
});
