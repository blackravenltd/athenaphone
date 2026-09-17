/**
 * @format
 *
 * Order matters here. The WebRTC globals must exist before JsSIP is imported
 * anywhere, because JsSIP captures RTCPeerConnection at module load.
 */
import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import { AppRegistry } from 'react-native';
import { registerGlobals } from 'react-native-webrtc';

import App from './App';
import { name as appName } from './app.json';

registerGlobals();

AppRegistry.registerComponent(appName, () => App);
