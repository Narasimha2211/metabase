import { type ReactNode, createContext, useContext } from "react";
import {
  type DataRouter,
  UNSAFE_RouteContext as RouteContext,
  type RouteObject,
  Routes,
  type To,
  createBrowserRouter,
  createMemoryRouter,
  parsePath,
} from "react-router";

import { AppShell } from "./AppShell";
import { installLeaveHookBlocker } from "./leave-hooks";
import { mapToV7 } from "./map-to-v7";

const RouteTreeContext = createContext<ReactNode>(null);

/**
 * Publishes the facade route tree to the descendant `<Routes>`. The data router's
 * config is built once, outside React, so the tree cannot be closed over: reading
 * it from context keeps the plugin routes re-evaluating on every render, the way
 * the top-level `<Routes>` did.
 */
export const RouteTreeProvider = RouteTreeContext.Provider;

/**
 * The memory-backed host the test harness owns, so specs can drive and inspect
 * navigation from outside the tree.
 */
export type MemoryTestRouter = DataRouter;

// Matching from the root, as a top-level `<Routes>` does.
const ROOT_ROUTE_CONTEXT = { outlet: null, matches: [], isDataRoute: false };

/**
 * The un-lifted route tree, rendered as descendant routes of the host's
 * catch-all. Resetting the route context makes `<Routes>` match against the whole
 * pathname, so the host's own `*` match leaks neither a `splat` param nor an
 * extra entry into the matched branch `RouterBridge` republishes.
 */
function DescendantRoutes(): JSX.Element {
  const tree = useContext(RouteTreeContext);
  return (
    <RouteContext.Provider value={ROOT_ROUTE_CONTEXT}>
      <Routes>{mapToV7(tree)}</Routes>
    </RouteContext.Provider>
  );
}

const APP_ROUTES: RouteObject[] = [
  {
    // Pathless layout route: the app shell. Feature subtrees lifted to data
    // routes (DEV-2291) become siblings of the catch-all underneath it.
    element: <AppShell />,
    children: [{ path: "*", element: <DescendantRoutes /> }],
  },
];

/**
 * The data router hosting the app. Every route is still declarative, rendered by
 * the catch-all's descendant `<Routes>`, so this is a host swap only: no route
 * has a loader, `lazy`, or middleware yet.
 */
export function createAppRouter(basename?: string): DataRouter {
  return prepareRouter(createBrowserRouter(APP_ROUTES, { basename }));
}

/**
 * The same host on an in-memory history, for tests.
 */
export function createMemoryAppRouter(
  initialRoute: string,
  basename?: string,
): DataRouter {
  // history@3 resolved a relative initial entry against the root; v7 keeps it
  // relative, and a location without a leading slash then matches no route. Specs
  // written against v3 pass both forms, so normalize.
  const entry = initialRoute.startsWith("/")
    ? initialRoute
    : `/${initialRoute}`;
  return prepareRouter(
    createMemoryRouter(APP_ROUTES, { basename, initialEntries: [entry] }),
  );
}

function prepareRouter(router: DataRouter): DataRouter {
  installLeaveHookBlocker(router);
  return skipRedundantReplace(router);
}

/**
 * The current location as `navigate` targets express it: `router.state.location`
 * carries the basename, while a `to` handed to `router.navigate` does not (the
 * router prepends it).
 */
function currentTarget(router: DataRouter) {
  const { pathname, search, hash } = router.state.location;
  const basename = router.basename ?? "/";
  const rest =
    basename !== "/" && pathname.startsWith(basename)
      ? pathname.slice(basename.length)
      : pathname;
  return { pathname: rest.startsWith("/") ? rest : `/${rest}`, search, hash };
}

function isSameUrl(
  to: To,
  current: { pathname: string; search: string; hash: string },
): boolean {
  const path = typeof to === "string" ? parsePath(to) : to;
  return (
    (path.pathname ?? current.pathname) === current.pathname &&
    (path.search ?? "") === current.search &&
    (path.hash ?? "") === current.hash
  );
}

/**
 * v3/history@3 did not notify listeners when replacing to the current URL, so
 * effects that sync state into the URL by replacing the location they just read
 * stayed stable. The data router commits a fresh location for every replace,
 * which loops those effects (e.g. the dashboard's `useLocationSync`). Skip the
 * redundant replace to keep the v3 behavior.
 *
 * `navigate` is the single seam every in-app navigation goes through: `Link`,
 * `Navigate`, `useNavigate`, and the redux navigator all reach the router
 * through it.
 */
function skipRedundantReplace(router: DataRouter): DataRouter {
  const navigate = (to: To | number | null, opts?: { replace?: boolean }) => {
    if (
      typeof to !== "number" &&
      to != null &&
      opts?.replace &&
      isSameUrl(to, currentTarget(router))
    ) {
      return Promise.resolve();
    }
    // `navigate` is an overloaded signature (a `To` or a delta); the wrapper
    // implements both arms but TS cannot infer it back into the overload.
    return (router.navigate as (...args: unknown[]) => Promise<void>)(to, opts);
  };

  return new Proxy(router, {
    get(target, prop) {
      if (prop === "navigate") {
        return navigate;
      }
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
