Package.describe({
  name: 'tapfuse:offline-collection',
  version: '1.7.2',
  // Brief, one-line summary of the package.
  summary: 'Not yet released',
  // URL to the Git repository containing the source code for this package.
  // git: 'https://github.com/TapFuse/meteor-offline-collection',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
});

var C = 'client';
var S = 'server';
var CS = [C, S];

Npm.depends({
  lodash: '4.6.1',
});

Package.onUse(function(api) {
    api.versionsFrom('1.2.1');
    // Core
    api.use([
      'ecmascript',
      'mongo',
      'promise',
      'reactive-var'

    ]);
    // 3rd party
    api.use([
      'tapfuse:collection-global@2.0.0',

    ]);
    api.mainModule('lib/tp-offline-collection.js', C);
    api.mainModule('lib/kernel.js', C);
    api.mainModule('lib/offLine-collection-pending-jobs.js', C);
    api.export('offLineCollection', C);
    api.export('clearAllLocalDB', C);
});

Package.onTest(function(api) {
  api.use('ecmascript');
  api.use('tinytest');
  api.use('tapfuse:offline-collection');
  api.addFiles('tests/package-tests.js');
});
