declare const __ALWAYS_ON_SERVICE_ORIGIN__: string | null;
/** Substituted only by an operator's reproducible release build, never entered by end users. */
export const releaseServiceOrigin = typeof __ALWAYS_ON_SERVICE_ORIGIN__ === 'undefined' ? null : __ALWAYS_ON_SERVICE_ORIGIN__;
