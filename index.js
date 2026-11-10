import { initialize } from './dist/runtime.js?v=20261111.window-7ac629f433fd2a81';
export { initialize, createPhoneControl, createPhoneImageService } from './dist/runtime.js?v=20261111.window-7ac629f433fd2a81';

if (globalThis.SillyTavern?.getContext || globalThis.Luker?.getContext) initialize();
