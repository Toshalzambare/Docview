import { registerRootComponent } from 'expo';
import { atob, btoa } from './src/utils/base64';

// Polyfill atob and btoa globally for React Native
if (!global.atob) {
  global.atob = atob;
}
if (!global.btoa) {
  global.btoa = btoa;
}

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

