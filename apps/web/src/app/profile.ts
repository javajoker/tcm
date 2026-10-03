// The application profile is a build-time constant: a release build contains no dev-only code paths (they are removed by dead-code elimination
// behind `IS_DEV_PROFILE`) and no dev data (the KB bundler prunes it). tech spec §6.
export const APP_PROFILE: "release" | "dev" = __APP_PROFILE__;
export const IS_DEV_PROFILE: boolean = __APP_PROFILE__ === "dev";
export const APP_BUILD: string = __APP_BUILD__;
