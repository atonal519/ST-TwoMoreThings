import { initialize } from './dist/runtime.js?v=release-0.7.3';
export { initialize, createPhoneControl, createPhoneImageService } from './dist/runtime.js?v=release-0.7.3';

if (globalThis.SillyTavern?.getContext || globalThis.Luker?.getContext) initialize();
