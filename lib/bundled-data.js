import { ReactiveDict } from 'meteor/reactive-dict';
import { HTTP } from 'meteor/http';
import { Tracker } from 'meteor/tracker';
import { Session } from 'meteor/session';
import localforage from 'localforage';
import _difference from 'lodash.difference';

dataHandler = new ReactiveDict('dataHandler');

const collectionList = ['SessionProgramme', 'Sessions', 'Tickets', 'CompanyTickets', 'Sponsors', 'SponsorsCategory', 'InfoPage', 'Maps', 'MapLocations', 'MapLocationsCategory', 'FileLinks'];

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
    if (window.indexedDB) {
      const tempInstance = await localforage.createInstance({
        name: offlineDb,
      });
      await tempInstance.clear();
      await window.indexedDB.deleteDatabase(offlineDb);
    } else {
      const tempInstance = await localforage.createInstance({
        name: offlineDb,
      });
      await tempInstance.clear();
    }
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

async function _getLocalStorageItemIds(collectionName) {
  try {
    const dbInstance = await localforage.createInstance({
      name: collectionName,
    });
    await dbInstance.ready();
    const itemArray = [];
    await dbInstance.iterate((doc, id) => {
      itemArray.push(id);
    });
    return itemArray;
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
  // console.log('🔒 _shouldUpdate', localTime, bundleTime);
  return bundleTime > localTime;
}

async function _checkWhichEventsToRemove(eventIdArray) {
  try {
    const storedEvents = await _getLocalStorageItemIds('SingleEvents');
    const eventsToRemove =  _difference(storedEvents, eventIdArray);
    for (const item of eventsToRemove) {
      const dbInstance = await localforage.createInstance({
        name: 'SingleEvents',
      });
      await dbInstance.ready();
      await dbInstance.removeItem(item);
      for (const eventInfo of collectionList) {
        await _removeLocalStorage(`offline${collectionName}${eventInfo}`);
      }
    }
    return 'done';
  } catch (error) {
    return error;
  }
}

async function _checkWhichEventsToUpdate(eventIdArray) {
  try {
    for (const eventInfo of eventIdArray) {
      const localTimeSyncedAt = await localStorage.getItem(`SingleEvents${eventInfo._id}_syncedAt`) || 0;
      // console.log('🖕', localTimeSyncedAt);
      const localTimeUpdatedAt = await localStorage.getItem(`SingleEvents${eventInfo._id}_updatedAt`) || 0;
      // check if update all Event collections
      if (_shouldUpdate(localTimeSyncedAt, eventInfo.lastSynced)) {
        const eventData = await _getFile('SingleEvents.json');
        if (eventData) {
          // console.log('🍣 eventData', eventData);
          await updateLocalStorage('offlineSingleEvents', eventData.dataList.SingleEvents);
          await _removeLocalStorage('offlineImages');
          await updateLocalStorage('offlineImages', eventData.dataList.Images);
          await _removeLocalStorage('offlineEventCategories');
          await updateLocalStorage('offlineEventCategories', eventData.dataList.EventCategories);
          await _removeLocalStorage('offlineEventTags');
          await updateLocalStorage('offlineEventTags', eventData.dataList.EventTags);
          await _removeLocalStorage('offlineEventDivisions');
          await updateLocalStorage('offlineEventDivisions', eventData.dataList.EventDivisions);
          await _removeLocalStorage('offlineUserGroups');
          await updateLocalStorage('offlineUserGroups', eventData.dataList.UserGroups);
          await _removeLocalStorage('offlineMenuItems');
          await updateLocalStorage('offlineMenuItems', eventData.dataList.MenuItems);

          await _removeLocalStorage('offlineSponsors');
          await updateLocalStorage('offlineSponsors', eventData.dataList.Sponsors);
          await _removeLocalStorage('offlineSponsorsCategory');
          await updateLocalStorage('offlineSponsorsCategory', eventData.dataList.SponsorsCategory);

        }
      }

      // check if update Event collections
      // console.log('🎵 _shouldUpdate', localTimeUpdatedAt, eventInfo.updatedAt);
      if (_shouldUpdate(localTimeUpdatedAt, eventInfo.updatedAt)) {
        for (const collectionName of collectionList) {
          const collectionData = await _getFile(`events/${eventInfo._id}_${collectionName}.json`);
          if (collectionData) {
            // await _removeLocalStorage(`offline${collectionName}`);
            await _removeLocalStorage(`offline${collectionName}${eventInfo._id}`);
            await updateLocalStorage(`offline${collectionName}${eventInfo._id}`, collectionData.dataList);
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
      // console.log('⚡️', 'checking if data is newer');
      // start checking if data is newer
      const resultRemove = await _checkWhichEventsToRemove(eventsArray);
      const result = await _checkWhichEventsToUpdate(eventsArray);
      if (result && resultRemove) {
        dataHandler.set('eventsReady', true);
      }
    } else {
      // console.log('❌ - _startAppUpdate, array is empty', eventsArray);
      dataHandler.set('eventsReady', true);
    }
  } catch (error) {
    console.log('❌', error);
  }
}

function _checkIfLocalDataIsNewer(serverSyncedAt, serverUpdatedAt, bundleData) {
  if (serverSyncedAt < bundleData.lastSynced) {
    // console.log('🖕', serverSyncedAt, 'reik updeitint eventus', bundleData.lastSynced);
    _startAppUpdate();
  } else {
    dataHandler.set('eventsReady', true);
  }
  if (serverUpdatedAt < bundleData.updatedAt) {
    // console.log('🖕', serverUpdatedAt, 'reik updeitint ServerSettings', bundleData.updatedAt);
    _updateServerSettings();
  } else {
    dataHandler.set('serverReady', true);
  }
}

HTTP.get(`${Meteor.absoluteUrl()}data/lastSynced.json`, {},
  (error, result) => {
    if (result) {
      dataHandler.set('syncedData', result.data);
      const serverSyncedAt = localStorage.getItem('ServerSettings_syncedAt') || 0;
      const serverUpdatedAt = localStorage.getItem('ServerSettings_updatedAt') || 0;
      const bundleData = result.data && result.data.server ? result.data.server : 0;
      if (!bundleData) {
        console.log('❌', 'no bundle data was found', result.data);
      }
      _checkIfLocalDataIsNewer(serverSyncedAt, serverUpdatedAt, bundleData);
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

