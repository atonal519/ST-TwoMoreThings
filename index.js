import { initialize } from './src/runtime.js';
export { initialize, createPhoneControl, createPhoneImageService } from './src/runtime.js';

if (globalThis.SillyTavern?.getContext || globalThis.Luker?.getContext) initialize();
