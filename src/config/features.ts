import features from './features.json';

/** Change features.json to restore the complete Plus UI. No account data or permissions change. */
export const FEATURES = features;

export const isPlusPage = (page: string) => page === 'plus' || page === 'supporters';
