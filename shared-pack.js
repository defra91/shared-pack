/* jshint node:true */
'use strict';

var ejs       = require('ejs');
var fs        = require('fs');
var async     = require('async');
var path      = require('path');
var Logger    = new(require('grunt-legacy-log').Log)();
var beautify  = require('js-beautify').js_beautify;
var paramCase = require('param-case');

var angularTemplateString = fs.readFileSync(path.resolve(__dirname, './templates/angular-template.ejs'), {
	encoding: 'utf8'
});
var nodeTemplateString = fs.readFileSync(path.resolve(__dirname, './templates/node-template.ejs'), {
	encoding: 'utf8'
});

var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
var ARGUMENT_NAMES = /([^\s,]+)/g;

function getParamNames(func) {
	var fnStr = func.toString().replace(STRIP_COMMENTS, '');
	var result = fnStr.slice(fnStr.indexOf('(') + 1, fnStr.indexOf(')')).match(ARGUMENT_NAMES);
	if (result === null)
		result = [];
	return result;
}

function getMethods(obj, constructorName) {
	var result = [];
	for (var id in obj) {
		try {
			if (typeof(obj[id]) == 'function') {
				result.push('this' + '.' + id + ' = ' + obj[id].toString() + ';');
			}
		} catch (err) {
			
		}
	}
	return result;
}

function generateFiles(opts, cb) {
	var packageName, nodeTemplateCompiled, angularTemplateCompiled;
	var buildFolder;

	opts                    = opts || {};
	
	packageName             = opts.packageName;
	nodeTemplateCompiled    = opts.nodeTemplateCompiled;
	angularTemplateCompiled = opts.angularTemplateCompiled;
	buildFolder             = path.resolve(process.cwd(), 'build');

	async.waterfall([
		function(next) {
			fs.exists(buildFolder, function(result) {
				next(null, result);
			});
		},
		function(isFolderExisting, next) {
			if (isFolderExisting) {
				return next();
			}
			Logger.writeln('Creating folder: ' + buildFolder);
			return fs.mkdir(buildFolder, next);
		},
		function(next) {
			var filename = buildFolder + '/' + packageName + '.angular.js';
			Logger.writeln('Creating file: ' + filename);
			fs.writeFile(filename, beautify(angularTemplateCompiled, {indent_size: 4}), 'utf8', next);
		},
		function(next) {
			var filename = buildFolder + '/' + packageName + '.node.js';
			Logger.writeln('Creating file: ' + filename);
			fs.writeFile(filename, beautify(nodeTemplateCompiled, {indent_size: 4}), 'utf8', next);
		}
	], function(err) {
		cb(err);
	});
}

module.exports.run = function(opts, cb) {
	var filename;

	var angularTemplateCompiled;
	var nodeTemplateCompiled;

	var moduleToCompile;
	var moduleName;
	var deps, depsToString;
	var constructorName;
	var packageName;
	var split;
	var methods;

	opts            = opts || {};
	filename        = opts.filename;
	
	moduleName      = filename;
	packageName     = moduleName.replace(/^\.\//gi, '').split('.js')[0];
	split           = packageName.split('/');
	packageName     = split[split.length - 1];
	filename        = path.resolve(process.cwd(), filename);
	moduleToCompile = require(filename);
	deps            = getParamNames(moduleToCompile);
	constructorName = moduleToCompile.prototype.constructor.name;
	
	methods         = getMethods(moduleToCompile.prototype, constructorName);

	angularTemplateCompiled = ejs.render(angularTemplateString, {
		package: {
			name: constructorName,
			depsToString: deps.map(function(dep) {
				return '\'' + dep + '\'';
			}).toString(),
			deps: deps,
			code: methods.join('\n\n')
		}
	}, {
		escape: function(html) {
			return String(html);
		}
	});

	nodeTemplateCompiled = ejs.render(nodeTemplateString, {
		package: {
			name: constructorName,
			deps: deps.map(function(dep) {
					return 'require(\'' + paramCase(dep) + '\')';
				}).toString(),
			depsToString: deps,
			code: '\n' + methods.join('\n\n')
		}
	}, {
		escape: function(html) {
			return String(html);
		}
	});

	generateFiles({
		packageName             : packageName,
		nodeTemplateCompiled    : nodeTemplateCompiled,
		angularTemplateCompiled : angularTemplateCompiled
	}, function(err) {
		cb(err);
	});

};