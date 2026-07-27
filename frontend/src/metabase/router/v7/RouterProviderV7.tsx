import type { PropsWithChildren } from "react";
import { useLayoutEffect, useState } from "react";
import { type DataRouter, RouterProvider } from "react-router";

import { useDispatch } from "metabase/redux";
import { getBasename } from "metabase/utils/basename";

import { LOCATION_CHANGE } from "../routing-reducer";

import {
  type MemoryTestRouter,
  RouteTreeProvider,
  createAppRouter,
  createMemoryAppRouter,
} from "./create-router";
import { toV3Location } from "./location";
import { notifyLocationListeners } from "./navigator";

/**
 * Mirrors every location into `state.routing` via LOCATION_CHANGE, so
 * `getLocation` / `isNavbarOpen` / `errorPage` keep working. Replaces v3's
 * `syncHistoryWithStore`; the other half of what `react-router-redux` did, the
 * dispatch-to-navigate direction, is registered by the host's `AppShell`.
 *
 * The mirror subscribes to the router rather than reading the rendered location,
 * because v3 dispatched LOCATION_CHANGE as part of the transition rather than
 * after a render. Thunks read the store synchronously right after navigating
 * (`setEditingDashboard` pushes `{ ...getLocation(getState()) }`), so a store
 * that lags a render makes them push a stale location and clobber query params
 * that were just set.
 */
function useLocationMirror(router: DataRouter): void {
  const dispatch = useDispatch();

  useLayoutEffect(() => {
    // The router notifies its subscribers on every state update, not only on a
    // location change, and replays the state it initialized with to the first
    // subscriber. Key on the location so neither is mirrored twice.
    let lastKey: string | null = null;

    const mirror = ({ location, historyAction }: DataRouter["state"]) => {
      if (location.key === lastKey) {
        return;
      }
      lastKey = location.key;
      const v3Location = toV3Location(location, historyAction);
      dispatch({ type: LOCATION_CHANGE, payload: v3Location });
      notifyLocationListeners(v3Location);
    };

    mirror(router.state);
    return router.subscribe(mirror);
  }, [dispatch, router]);
}

/**
 * react-router v7 hosting the app as a data router. Every route is still
 * declarative: the host's catch-all renders the facade tree as descendant
 * `<Routes>`, so lifting a subtree into a real data route is a per-subtree
 * change from here on.
 *
 * `useTransitions={false}` keeps navigation committing synchronously.
 * react-router otherwise marks its own location update as a transition, which in
 * a production React build deprioritises it so it can commit long after the click
 * that caused it. v3 navigated synchronously, and the app was written against
 * that: a navigation that lands mid-interaction remounts whatever is on screen,
 * which silently discarded state such as the text typed into a modal that was
 * opened right after clicking a link.
 */
export function RouterProviderV7({ children }: PropsWithChildren): JSX.Element {
  const [router] = useState(() => createAppRouter(getBasename() || undefined));
  useLocationMirror(router);

  return (
    <RouteTreeProvider value={children}>
      <RouterProvider router={router} useTransitions={false} />
    </RouteTreeProvider>
  );
}

/**
 * The v7 engine hosted on an in-memory history, for tests. Mirrors what
 * `renderWithProviders({ withRouter: true })` mounts, including navigation
 * blocking. Pass `router` to drive and inspect it from outside the tree.
 */
export function RouterProviderV7Memory({
  children,
  initialRoute,
  basename,
  router: providedRouter,
}: PropsWithChildren<{
  initialRoute: string;
  basename?: string;
  router?: MemoryTestRouter;
}>): JSX.Element {
  const [router] = useState(
    () => providedRouter ?? createMemoryAppRouter(initialRoute, basename),
  );
  useLocationMirror(router);

  return (
    <RouteTreeProvider value={children}>
      <RouterProvider router={router} useTransitions={false} />
    </RouteTreeProvider>
  );
}
