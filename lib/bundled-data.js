import { ReactiveDict } from 'meteor/reactive-dict';
import { HTTP } from 'meteor/http';
import { Tracker } from 'meteor/tracker';
import { Session } from 'meteor/session';
import localforage from 'localforage';
import _difference from 'lodash.difference';

localforage.setDriver(localforage.WEBSQLL);


dataHandler = new ReactiveDict('dataHandler');

const collectionList = ['SessionProgramme', 'Sessions', 'Tickets', 'CompanyTickets', 'Sponsors', 'SponsorsCategory', 'InfoPage', 'Maps', 'MapLocations', 'MapLocationsCategory', 'FileLinks'];

function _getFile(filePath) {
  // return fetch(`http://localhost:3000/data/${filePath}`)
  return fetch(`http://localhost:12832/data/${filePath}`)
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
    // if (window.indexedDB) {
    //   const dbInstance = await localforage.createInstance({
    //     name: collectionName,
    //   });
    //   await dbInstance.clear();
    //   await window.indexedDB.deleteDatabase(collectionName);
    // } else {
    const dbInstance = await localforage.createInstance({
      name: collectionName,
    });
    await dbInstance.clear();
    // }
    return 'done';
  } catch (error) {
    console.log('🌶 _removeLocalStorage', error );
    return error;
  }
}

async function updateLocalStorage(collectionName, data) {
  try {
    if (!data) {
      return 'done';
    }
    // console.log('🔋', collectionName, data[0]);
    const dbInstance = await localforage.createInstance({
      name: collectionName,
    });
    await dbInstance.ready(() => {
      data.map(doc => {
        dbInstance.setItem(doc._id, doc);
      });
    });
    return 'done';
  } catch (error) {
    console.log('🌶 updateLocalStorage', error );
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
    console.log('🌶 _getLocalStorageItemIds', error );
    return error;
  }
}

// Updates ServerSettings collection
async function _updateServerSettings() {
  try {
    const newData = await _getFile('ServerSettings.json');
    // console.log('🎨', newData);
    if (newData) {
      const dbRemoved = await _removeLocalStorage('offlineServerSettings');
      if (dbRemoved) {
        // console.log('🎨 2');
        const dbUpdated = await updateLocalStorage('offlineServerSettings', newData.data);
        // console.log('🎨 4', dbUpdated);
        if (await dbUpdated) {
          // console.log('🎨 3');
          dataHandler.set('serverReady', true);
        }
      }
    }
  } catch (err) {
    console.log('🌶 _updateServerSettings', err);
    dataHandler.set('serverReady', true);
  }
}

function _shouldUpdate(localTime, bundleTime) {
  // console.log('🔒 _shouldUpdate', localTime, bundleTime);
  return bundleTime > localTime;
}

async function _checkWhichEventsToRemove(eventIdArray) {
  try {
    const storedEvents = await _getLocalStorageItemIds('offlineSingleEvents');
    const eventsToRemove =  _difference(storedEvents, eventIdArray);
    for (const item of eventsToRemove) {
      const dbInstance = await localforage.createInstance({
        name: 'offlineSingleEvents',
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
      // console.log('🖕 1', localTimeSyncedAt);
      const localTimeUpdatedAt = await localStorage.getItem(`SingleEvents${eventInfo._id}_updatedAt`) || 0;
      // check if update all Event collections
      if (_shouldUpdate(localTimeSyncedAt, eventInfo.lastSynced)) {
        const eventData = await _getFile('SingleEvents.json');
        if (eventData) {
          // console.log('🖕 2', JSON.stringify(Object.keys(eventData.dataList)));
          // console.log('🍣 eventData', eventData);
          await updateLocalStorage('offlineSingleEvents', eventData.dataList.SingleEvents);
          const reSofflineImages = await _removeLocalStorage('offlineImages');
          if (reSofflineImages) {
            await updateLocalStorage('offlineImages', eventData.dataList.Images);
          }
          const reSofflineEventCategories = await _removeLocalStorage('offlineEventCategories');
          if (reSofflineEventCategories) {
            await updateLocalStorage('offlineEventCategories', eventData.dataList.EventCategories);
          }
          const reSofflineEventTags = await _removeLocalStorage('offlineEventTags');
          if (reSofflineEventTags) {
            await updateLocalStorage('offlineEventTags', eventData.dataList.EventTags);
          }
          const reSofflineEventDivisions = await _removeLocalStorage('offlineEventDivisions');
          if (reSofflineEventDivisions) {
            await updateLocalStorage('offlineEventDivisions', eventData.dataList.EventDivisions);
          }
          const reSofflineUserGroups = await _removeLocalStorage('offlineUserGroups');
          if (reSofflineUserGroups) {
            await updateLocalStorage('offlineUserGroups', eventData.dataList.UserGroups);
          }
          const reSofflineMenuItems = await _removeLocalStorage('offlineMenuItems');
          if (reSofflineMenuItems) {
            await updateLocalStorage('offlineMenuItems', eventData.dataList.MenuItems);
          }

          const reSofflineSponsors = await _removeLocalStorage('offlineSponsors');
          if (reSofflineSponsors) {
            await updateLocalStorage('offlineSponsors', eventData.dataList.Sponsors);
          }
          const reSofflineSponsorsCategory = await _removeLocalStorage('offlineSponsorsCategory');
          if (reSofflineSponsorsCategory) {
            await updateLocalStorage('offlineSponsorsCategory', eventData.dataList.SponsorsCategory);
          }

        }
      }

      // check if update Event collections
      // console.log('🎵 _shouldUpdate', localTimeUpdatedAt, eventInfo.updatedAt);
      if (_shouldUpdate(localTimeUpdatedAt, eventInfo.updatedAt)) {
        for (const collectionName of collectionList) {
          const collectionData = await _getFile(`events/${eventInfo._id}_${collectionName}.json`);
          if (collectionData) {
            // await _removeLocalStorage(`offline${collectionName}`);
            const resultRemove = await _removeLocalStorage(`offline${collectionName}${eventInfo._id}`);
            if (resultRemove) {
              await updateLocalStorage(`offline${collectionName}${eventInfo._id}`, collectionData.dataList);
            }
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
    // console.log('🚀 1 _startAppUpdate', eventsArray);
    if (eventsArray.length > 0) {
      // console.log('⚡️', 'checking if data is newer');
      // start checking if data is newer
      const resultRemove = await _checkWhichEventsToRemove(eventsArray);
      const result = await _checkWhichEventsToUpdate(eventsArray);
      // console.log('🚀 2 _startAppUpdate', result);
      if (result && resultRemove) {
        // console.log('🚀 3 _startAppUpdate');
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
  if (serverSyncedAt < bundleData.lastSynced) {
    // console.log('🖕', serverSyncedAt, 'reik updeitint eventus', bundleData.lastSynced);
    _startAppUpdate();
  } else {
    // console.log('☎️ 1 _checkIfLocalDataIsNewer');
    dataHandler.set('eventsReady', true);
  }
  if (serverUpdatedAt < bundleData.updatedAt) {
    // console.log('🖕', serverUpdatedAt, 'reik updeitint ServerSettings', bundleData.updatedAt);
    _updateServerSettings();
  } else {
    // console.log('☎️ 2 _checkIfLocalDataIsNewer');
    dataHandler.set('serverReady', true);
  }
}

// HTTP.get('http://localhost:3000/data/lastSynced.json', {},
HTTP.get('http://localhost:12832/data/lastSynced.json', {},
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

