import { useLayoutEffect } from "react";
import { Outlet, useNavigate } from "react-router";

import { setV7Navigate } from "./navigator";

/**
 * The element of the host's pathless layout route.
 *
 * It registers the router's `navigate` for the redux navigator adapter, so
 * `dispatch(push(...))` drives the router. Registering from here rather than from
 * the router object matters for a relative target: `router.navigate` resolves it
 * against the deepest match, which is the catch-all hosting the whole app, while
 * this route contributes no path and so resolves from the root. Redux navigation
 * has no route context of its own, and v3's history resolved a relative push
 * against the root, so root is the behavior to keep (`SearchBar` pushes
 * `{ pathname: "search" }`).
 */
export function AppShell(): JSX.Element {
  const navigate = useNavigate();

  useLayoutEffect(() => {
    setV7Navigate(navigate);
    return () => setV7Navigate(null);
  }, [navigate]);

  return <Outlet />;
}
