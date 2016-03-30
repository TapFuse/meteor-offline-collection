//
//      tpOfflineCollection: Library
//
import { Mongo } from 'meteor/mongo';
import _includes from 'lodash.includes';
import { Session } from 'meteor/session';
import { ReactiveVar } from 'meteor/reactive-var';
import '../lib/offLine-collection-pending-jobs.js';
import localforage from 'localforage';
import '../lib/kernel.js';
import { Collection } from 'meteor/tapfuse:collection-global';

offLineCollection = {};

Collection.offlineSettings = new Mongo.Collection('offlineSettings');

// export default class offLineCollection extends Mongo.Collection {
offLineCollection.Collection = class offLineCollectionClass extends Mongo.Collection {

  constructor(name, {
    // Ground db options
    version = 1.0,
    connection = null,
    initialSubcribe: initialSubcribe,
    session: session = '',
    sessionField: sessionField = '',
    updateSubscribe: updateSubscribe,
    externalCollection: externalCollection,
    idGeneration = 'STRING',
    transform = undefined,
    _driver = undefined,
    _preventAutopublish = true,// Mongo.Collection default is false
  } = {}) {
    if (name !== `${name}` || name === '') {
      throw new Meteor.Error('missing-name', 'offLineCollection requires a collection name');
    }

    super(name, { connection, idGeneration, transform, _driver, _preventAutopublish });
    // if session is passed wait for it for initialization
    this.session = session;
    this.sessionField = sessionField;
    this.collectionName = name;
    this.initialSubcribe = initialSubcribe;
    this.updateSubscribe = updateSubscribe;
    this.externalCollection = externalCollection;

    // Count for pending write operations
    this.pendingWrites = new ProgressCount();

    // Count for pending read operations
    this.pendingReads = new ProgressCount();

    // Carry last updated at if supported by schema
    this.lastUpdatedAt = null;

    // // Is this an offline client only database?
    // this.offlineDatabase = (connection === null);

    this.isLoaded = new ReactiveVar(false);

    // Create scoped storage
    // this.storage = localforage.createInstance({
    //   name: name,
    // });
    this.startCollection();
    // Auto store updates locally
    // this.monitorChanges();

    // Load database from local storage
    // this.loadDatabase();
  }

  storageTracker(newDbName) {
    const storageTracker = localforage.createInstance({
      name: `storageTracker`,
    });
    storageTracker.getItem(name).then((dbArray) => {
      if (Array.isArray(dbArray)) {
        if (!_includes(dbArray, newDbName)) {
          const newArray = dbArray;
          newArray.push(newDbName);
          storageTracker.setItem(this.collectionName, newArray);
        }
      } else {
        storageTracker.setItem(this.collectionName, [newDbName]);
      }
    }).catch((err) => {
      console.log(err);
    });
  }

  startCollection() {
    if (this.session) {
      Tracker.autorun(() => {
        if (Session.get(this.session)) {
          this.lastUpdatedAt = null;
          this.isLoaded = new ReactiveVar(false);
          this.storage = localforage.createInstance({
            name: `${this.collectionName}${Session.get(this.session)}`,
          });
          this.storageTracker(`${this.collectionName}${Session.get(this.session)}`);
          this.monitorChanges();
          this.loadDatabase();
        }
      });
    } else {
      this.storage = localforage.createInstance({
        name: this.collectionName,
      });
      this.storageTracker(this.collectionName);
      this.monitorChanges();
      this.loadDatabase();
    }
  }

  subscribeData(subscriptionName) {
    if (subscriptionName) {
      Tracker.autorun(() => {
        if (this.session) {
          if (Session.get(this.session)) {
            const options = {
              session: Session.get(this.session),
              lastUpdatedAt: this.lastUpdatedAt ? this.lastUpdatedAt : 1,
            };
            Meteor.subscribe(subscriptionName, options);
          }
        } else {
          Meteor.subscribe(subscriptionName, {lastUpdatedAt: this.lastUpdatedAt ? this.lastUpdatedAt : 1});
        }
      });
    }
  }

  monitorExternalChanges(externalCollection, observeRemove) {
    // Store documents to client only minimongo from it's original Collection
    // console.log('monitorExternalChanges', externalCollection)
    Tracker.autorun(() => {
      const query = {};
      if (this.session) {
        if (Session.get(this.session)) {
          query[this.sessionField] = Session.get(this.session);
        } else {
          console.log(`Can't find Session - ${this.session}`);
        }
      }
      // console.log(query)
      // console.log(externalCollection)
      // console.log(Collection[externalCollection])
      Collection[externalCollection].find(query).observe({
        added: doc => {
          // console.log('added')
          const id = doc._id;
          delete doc._id;
          this._collection.upsert({_id: id}, {$set: doc});
        },
        // If removedAt is set this means the document should be removed
        changed: (doc, oldDoc) => {
          if (doc.isDeleted) {
            // Remove the document completely
            this._collection.remove(doc._id);
            this.saveDocument(doc, true);
          } else {
            const id = doc._id;
            delete doc._id;
            this._collection.upsert({_id: id}, {$set: doc});
          }
        },
        // if we have initial subscribe, so we are watching for remove,
        // as it means document was removed from dataset
        removed: doc => {
          if (observeRemove) {
            this._collection.remove(doc._id);
            this.saveDocument(doc, true);
          }
        },
      });
    });
  }

  loadDatabase() {
    // Then load the docs into minimongo
    this.pendingReads.inc();
    this.storage
      .ready(() => {
        this.storage
          .length()
          .then(len => {
            if (len === 0) {
              this.pendingReads.dec();
              Kernel.defer(() => {
                console.log('LOADED');
                this.monitorExternalChanges(this.externalCollection, true);
                this.subscribeData(this.initialSubcribe);
                this.isLoaded.set(true);
              });
            } else {
              // Update progress
              this.pendingReads.inc(len);
              // Count handled documents
              let handled = 0;
              this.storage
                .iterate((doc, id) => {
                  Kernel.defer(() => {
                    // Add the document to minimongo
                    this._collection._docs._map[id] = doc;
                    this.setLastUpdated(doc.updatedAt);
                    // Update progress
                    this.pendingReads.dec();

                    // Check if all documetns have been handled
                    if (++handled === len) {
                      this.invalidate();
                      Kernel.defer(() => {
                        this.monitorExternalChanges(this.externalCollection);
                        this.subscribeData(this.updateSubscribe);
                        this.isLoaded.set(true);
                      });
                    }
                  });
                })
                .then(() => {
                  this.pendingReads.dec();
                });
            }
          });
      });
  }

  saveDocument(doc, remove) {
    // console.log('saveDocument(doc, remove)', doc, remove);
    if (this.isLoaded.get()) {
      this.pendingWrites.inc();

      this.storage
        .ready(() => {
          if (remove) {
            this.storage
              .removeItem(doc._id)
              .then(() => {
                this.pendingWrites.dec();
              });
          } else {
            this.storage
              .setItem(doc._id, doc)
              .then(() => {
                this.pendingWrites.dec();
              });
          }
        });
    }
    // xxx: should we buffer changes?
  }

  setLastUpdated(lastUpdatedAt) {
    if (lastUpdatedAt) {
      if (this.lastUpdatedAt < lastUpdatedAt || !this.lastUpdatedAt) {
        this.lastUpdatedAt = lastUpdatedAt || null;
      }
    }
  }

  monitorChanges() {
    // Store documents to localforage
    Tracker.autorun(() => {
      if (this.isLoaded.get()) {
        const query = {};
        if (this.session) {
          if (Session.get(this.session)) {
            query[this.sessionField] = Session.get(this.session);
          } else {
            console.log(`Can't find Session - ${this.session}`);
          }
        }
        this.find(query).observe({
          added: doc => {
            this.setLastUpdated(doc.updatedAt);
            this.saveDocument(doc);
          },
          // If removedAt is set this means the document should be removed
          // XXX changed logic, as this observe don't handle removal of the data
          changed: (doc, oldDoc) => {
            this.setLastUpdated(doc.updatedAt);
            this.saveDocument(doc);
          },
          removed: doc => {
            this.saveDocument(doc, true);
          },
        });
      }
    });
  }

  shutdown(callback) {
    // xxx: have a better lock / fence
    this.writeFence = true;

    return new Promise(resolve => {
      Tracker.autorun(c => {
        // Wait until all writes have been done
        if (this.pendingWrites.isDone()) {
          c.stop();

          if (typeof callback === 'function') callback();
          resolve();
        }
      });
    });
  }

  invalidate() {
    console.log('invalidate()', this._collection.queries)
    Object.keys(this._collection.queries)
      .forEach(key => {
          // console.log(this._collection.queries[key])
        if (_.isArray(this._collection.queries[key].results)) {
          // console.log('this._collection.queries[key].changed()')
          this._collection.queries[key].changed();
        }
      });
  }


  clear() {
    // console.log('clear() clear() clear()')
    this.storage.clear();
    // this._collection.remove({}, { multi: true });
    this._collection._docs._map = {};
    this.invalidate();
  }
};

Meteor.startup(() => {
  Tracker.autorun(() => {
    const options = {
      // deviceUUID: device ? device.uuid : null,
      deviceUUID: null,
      userId: Meteor.userId(),
    };
    Meteor.subscribe('offlineSettingsByUser', options);
  });
  // getAllDatabaseNames()
  Collection.offlineSettings.find({}).observe({
    added: doc => {
      clearLocalDB(doc);
    },
  });
});

async function getAllDatabaseNames() {
  try {
    const storageTracker = await localforage.createInstance({
      name: `storageTracker`,
    });
    await storageTracker.iterate((valueList, dbName) => {
      for (const offlineDb of valueList) {
        const tempInstance = localforage.createInstance({
          name: offlineDb,
        });
        tempInstance.clear();
      }
      if (Collection[dbName]) {
        Collection[dbName]._collection._docs._map = {};
      }
    });
  } catch (err) {
    console.log(err);
  }
}

async function clearLocalDB(paramDoc) {
  try {
    if (paramDoc.dbName) {
      // specific database
    } else {
      // need to remove all database
    }
  } catch (error) {
    console.log('clearLocalDB, error:', error);
    return error;
  }
}

// console.log(offLineCollection)

// export const name = 'offLineCollection';
