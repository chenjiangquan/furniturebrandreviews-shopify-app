import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { login } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await login(request);
  return new Response(null, { status: 204 });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await login(request);
  return new Response(null, { status: 204 });
};
