/** Kept apart from the three.js code so the main bundle does not load it. */
/** Is an immersive VR session offered by this browser (the Quest Browser says yes)? */
export async function vrSupported(): Promise<boolean> {
  try {
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    return !!xr && (await xr.isSessionSupported('immersive-vr'));
  } catch {
    return false;
  }
}

