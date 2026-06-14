import type { ReactNode } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import "./app.css";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html className="dark" lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: { error: unknown }) {
  const message =
    isRouteErrorResponse(error) && typeof error.data === "string"
      ? error.data
      : error instanceof Error
        ? error.message
        : "予期しないエラーが発生しました。";

  return (
    <main className="mx-auto flex min-h-svh max-w-5xl items-center px-6 py-16">
      <section className="w-full rounded-3xl border border-neutral-800 bg-neutral-900/70 p-8 shadow-2xl shadow-black/20">
        <p className="text-sm font-medium text-neutral-400">Error</p>
        <h1 className="mt-3 text-2xl font-semibold text-neutral-50">
          ページを表示できませんでした
        </h1>
        <p className="mt-4 text-neutral-300">{String(message)}</p>
      </section>
    </main>
  );
}
