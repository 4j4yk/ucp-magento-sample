// Normalizes thrown errors into an HTTP response shape, optionally exposing Magento payloads.
export function mapError(err: any, exposeMagento: boolean): { status: number; error: string; magento?: any } {
  const status = err?.response?.status ?? err?.status ?? 500;
  const body = err?.response?.data;
  const magento = exposeMagento && body
    ? (() => {
        const cleaned = { ...body };
        delete (cleaned as any).trace;
        return cleaned;
      })()
    : undefined;

  return {
    status,
    error: body?.message ?? err?.message ?? 'Internal Server Error',
    magento,
  };
}
