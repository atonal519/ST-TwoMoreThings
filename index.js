import { initialize } from './dist/runtime.js?v=20261110.window-407b481df9da45e4';
export { initialize, createPhoneControl, createPhoneImageService } from './dist/runtime.js?v=20261110.window-407b481df9da45e4';

if (globalThis.SillyTavern?.getContext || globalThis.Luker?.getContext) initialize();
