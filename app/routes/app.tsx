import { Link, Outlet, useRouteError } from "@remix-run/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-remix/server";

export const shouldRevalidate = () => false;

export default function AdminApp() {
  return (
    <>
      <NavMenu>
        <Link to="/app" rel="home" prefetch="render">Dashboard</Link>
        <Link to="/app/product-reviews" prefetch="render">Product Reviews</Link>
        <Link to="/app/widgets-settings" prefetch="render">Widgets Settings</Link>
      </NavMenu>
      <Outlet />
      <AdminLiveChatButton />
    </>
  );
}

function AdminLiveChatButton() {
  return (
    <a
      href="https://wa.me/447521530350"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Open WhatsApp support chat"
      style={{
        alignItems: "center",
        background: "#1f9d63",
        borderRadius: 999,
        bottom: 24,
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.18)",
        color: "#ffffff",
        display: "inline-flex",
        fontWeight: 700,
        gap: 8,
        padding: "12px 18px",
        position: "fixed",
        right: 24,
        textDecoration: "none",
        zIndex: 510
      }}
    >
      <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
        <path
          d="M20.25 11.25a7.5 7.5 0 0 1-11.1 6.58L4 19.5l1.67-5.15a7.5 7.5 0 1 1 14.58-3.1Z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <path
          d="M8.75 10.25c.7 2.1 2.15 3.55 4.35 4.35l1.2-1.2c.23-.23.57-.3.87-.17l1.6.68c.33.14.52.5.44.85-.18.78-.7 1.49-1.46 1.8-.52.21-1.12.2-1.72.04-3.26-.86-5.77-3.38-6.63-6.63-.16-.6-.17-1.2.04-1.72.31-.76 1.02-1.28 1.8-1.46.35-.08.71.11.85.44l.68 1.6c.13.3.06.64-.17.87l-1.85.55Z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
      </svg>
      Need help?
    </a>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  console.error("Admin route error", error);
  return boundary.error(error);
}

export const headers = boundary.headers;
