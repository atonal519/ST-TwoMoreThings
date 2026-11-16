import { initialize } from './dist/runtime.js?v=20261116.release-0.7.1-274950d2ed126e66';
export { initialize, createPhoneControl, createPhoneImageService } from './dist/runtime.js?v=20261116.release-0.7.1-274950d2ed126e66';

if (globalThis.SillyTavern?.getContext || globalThis.Luker?.getContext) initialize();
