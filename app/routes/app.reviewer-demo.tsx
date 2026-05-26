import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { seedReviewerDemoData } from "~/models/reviewer-demo.server";
import { authenticate } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  await seedReviewerDemoData(session.shop);
  return redirect("/app?reviewerDemo=seeded");
};
