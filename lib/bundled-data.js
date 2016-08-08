import { ReactiveDict } from 'meteor/reactive-dict';

offlineControl = new ReactiveDict('offlineControl');
// offlineControl.set({
//   LayerOne: false,
//   LayerTwo: false,
// });

function readBundledDataInfo(dataLayer) {
  // need to read bundled data info
  return Date.now() - 100000000;
}

function getSyncedTime(storageName) {
  console.log('💋', localStorage);
  console.log('💣', localStorage.getItem( storageName ? storageName : 'ServerSettingsSynced'));
  return localStorage.getItem( storageName ? storageName : 'ServerSettingsSynced');
}

function loadData() {
  console.log('❌', 'loadData');
  const localSyncTime = getSyncedTime('ServerSettingsSynced');
  const bundleSyncedTime = readBundledDataInfo();
  console.log('🔔', localSyncTime);
  console.log('🔔', bundleSyncedTime);
  if (localSyncTime >= bundleSyncedTime && !offlineControl.get('LayerOne')) {
    console.log('👀', 'setting true fo LayerOne');
    // load databases from local storage
    offlineControl.set('LayerOne', true);
  } else {
    // load data from bundled file
  }
}

loadData();
