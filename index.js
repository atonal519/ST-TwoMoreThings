import { initialize } from './dist/runtime.js';
export { initialize, createPhoneControl, createPhoneImageService } from './dist/runtime.js';

if (globalThis.SillyTavern?.getContext || globalThis.Luker?.getContext) initialize();
