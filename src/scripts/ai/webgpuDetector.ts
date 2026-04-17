/**
 * Detects if the current hardware and browser context support WebGPU.
 * Note: Must be executed in a Window context (NewTab/Popup), not the Background Service Worker.
 */
export async function checkWebGPUSupport(): Promise<boolean> {
  if (!navigator || !(navigator as any).gpu) {
    return false;
  }
  
  try {
    const adapter = await (navigator as any).gpu.requestAdapter();
    return !!adapter;
  } catch (e) {
    console.warn('WebGPU request adapter failed:', e);
    return false;
  }
}
