import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (new URL(request.url).pathname === "/auth/login") {
    return null;
  }

  await authenticate.admin(request);
  return null;
};
