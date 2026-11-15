import { initialize } from './dist/runtime.js?v=20261115.release-0.7.0-c5d5bee9d07bfa9d';
export { initialize, createPhoneControl, createPhoneImageService } from './dist/runtime.js?v=20261115.release-0.7.0-c5d5bee9d07bfa9d';

if (globalThis.SillyTavern?.getContext || globalThis.Luker?.getContext) initialize();
