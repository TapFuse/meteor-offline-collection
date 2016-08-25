import { ReactiveDict } from 'meteor/reactive-dict';
import { HTTP } from 'meteor/http';
import { Tracker } from 'meteor/tracker';
import localforage from 'localforage';

dataHandler = new ReactiveDict('dataHandler');

function _getFile(filePath) {
  return fetch(`${Meteor.absoluteUrl()}data/${filePath}`)
    .then(response => {
      return response.json();
    }).then(json => {
      return json;
    }).catch(ex => {
      return ex;
    });
}

async function _removeLocalStorage(collectionName) {
  try {
    const dbInstance = await localforage.createInstance({
      name: collectionName,
    });
    await dbInstance.ready();
    const result = await dbInstance.clear();
    return 'done';
  } catch (error) {
    return error;
  }
}

async function updateLocalStorage(collectionName, data) {
  try {
    const dbInstance = await localforage.createInstance({
      name: collectionName,
    });
    await dbInstance.ready();
    await data.map(doc => {
      dbInstance.setItem(doc._id, doc);
    });
    return 'done';
  } catch (error) {
    return error;
  }
}

// Updates ServerSettings collection
async function _updateServerSettings() {
  try {
    const newData = await _getFile('ServerSettings.json');
    if (newData) {
      const dbRemoved = await _removeLocalStorage('offlineServerSettings');
      if (dbRemoved) {
        const dbUpdated = await updateLocalStorage('offlineServerSettings', newData.data);
        if (dbUpdated) {
          dataHandler.set('serverReady', true);
        }
      }
    }
  } catch (err) {
    console.log('🌵 _updateServerSettings', err);
    dataHandler.set('serverReady', true);
  }
}

function _shouldUpdate(localTime, bundleTime) {
  return bundleTime > localTime;
}

async function _checkWhichEventsToUpdate(eventIdArray) {
  try {
    for (const evenData of eventIdArray) {
      const localTimeSyncedAt = await localStorage.getItem(`SingleEvents${evenData._id}_syncedAt`);
      const localTimeUpdatedAt = await localStorage.getItem(`SingleEvents${evenData._id}_updatedAt`);
      // check if update all Event collections
      if (_shouldUpdate(localTimeSyncedAt, evenData.lastSynced)) {
        const eventData = await _getFile('SingleEvents.json');
        if (eventData) {
          await updateLocalStorage('offlineSingleEvents', eventData.data);
        }
      }

      // check if update Event collections
      if (_shouldUpdate(localTimeUpdatedAt, evenData.updatedAt)) {
        const collectionList = ['Tickets', 'Sessions'];
        for (const collectionName of collectionList) {
          const collectionData = await _getFile(`events/offline${collectionName}.json`);
          if (collectionData) {
            await updateLocalStorage(`offline${collectionName}`, eventData.data);
          }
        }
      }
    }
    return 'done';
  } catch (error) {
    return error;
  }
}

async function _startAppUpdate() {
  try {
    const eventsArray = dataHandler.get('syncedData').events;
    if (eventsArray.length > 0) {
      // start checking if data is newer
      const result = await _checkWhichEventsToUpdate(eventsArray);
      if (result) {
        dataHandler.set('eventsReady', true);
      }
    } else {
      console.log('❌ - _startAppUpdate, array is empty', eventsArray);
      dataHandler.set('eventsReady', true);
    }
  } catch (error) {
    console.log('❌', error);
  }
}

function _checkIfLocalDataIsNewer(serverSyncedAt, serverUpdatedAt, bundleData) {
  if (serverSyncedAt < bundleData.server.lastSynced) {
    console.log('🖕', serverSyncedAt, 'reik updeitint eventus', bundleData.server.lastSynced);
    _startAppUpdate();
  } else {
    dataHandler.set('eventsReady', true);
  }
  if (serverUpdatedAt < bundleData.server.updatedAt) {
    console.log('🖕', serverUpdatedAt, 'reik updeitint ServerSettings', bundleData.server.updatedAt);
    _updateServerSettings();
  } else {
    dataHandler.set('serverReady', true);
  }
}

HTTP.get(`${Meteor.absoluteUrl()}data/lastSynced.json`, {},
  (error, result) => {
    if (result) {
      dataHandler.set('syncedData', result.data);
      const serverSyncedAt = localStorage.getItem('ServerSettings_syncedAt');
      const serverUpdatedAt = localStorage.getItem('ServerSettings_updatedAt');
      _checkIfLocalDataIsNewer(serverSyncedAt, serverUpdatedAt, result.data);
    } else if (error) {
      console.log('🐙', error);
      dataHandler.set('appIsReady', true);
    }
  });


Tracker.autorun( c => {
  if (dataHandler.get('serverReady') && dataHandler.get('eventsReady')) {
    dataHandler.set('appIsReady', true);
    c.stop();
  }
});

// For server
// 1. Hold loading offline collections
// 2. Read lastSynced Bundle Data
// 3. Compare records with localStorage synced data
// 4. if Bundle data is newer:
// a - dump localStorage collections
// b - insert new data
// 5. Release offline collection loading

// For Events
// 1. Hold loading offline collections
// 2. Read lastSynced Bundle Data
// 3. Compare records with localStorage synced data
// 4. if Bundle data is newer:
// a - dump localStorage collections
// b - insert new data
// 5. Release offline collection loading
