import { proxyGet } from "@/lib/bff";

// Read env per request: the image is environment-agnostic, so nothing here may be frozen at build.
export const dynamic = "force-dynamic";

// GET only for now. Next answers 405 for every other method because none is exported.
export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  return proxyGet(path, new URL(request.url).searchParams, {
    serviceUrl: process.env.THEMIS_SERVICE_URL,
    gatewaySecret: process.env.THEMIS_GATEWAY_SECRET,
    fetch,
  });
}
