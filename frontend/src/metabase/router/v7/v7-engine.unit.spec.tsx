import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import {
  Outlet,
  Route,
  push,
  useLocation,
  useNavigate,
  useParams,
  useRouter,
} from "metabase/router";

function Layout() {
  return (
    <div>
      <span data-testid="layout">layout</span>
      <Outlet />
    </div>
  );
}

function ThingPage() {
  const { pathname, search } = useLocation();
  const params = useParams();
  const navigate = useNavigate();
  const { location } = useRouter();

  return (
    <div>
      <span data-testid="pathname">{pathname}</span>
      <span data-testid="search">{search}</span>
      <span data-testid="thing-id">{params.thingId}</span>
      <span data-testid="splat">{String(params.splat)}</span>
      <span data-testid="query-tab">{String(location.query.tab)}</span>
      <button onClick={() => navigate("/other")}>go absolute</button>
      <button onClick={() => navigate("..")}>go up</button>
    </div>
  );
}

const tree = (
  <Route path="/" element={<Layout />}>
    <Route path="things/:thingId" element={<ThingPage />} />
    <Route path="other" element={<span data-testid="other">other page</span>} />
  </Route>
);

function setup(initialRoute: string) {
  return renderWithProviders(tree, { withRouter: true, initialRoute });
}

describe("v7 engine (facade over real react-router v7)", () => {
  it("resolves location, search, and params through the bridge", () => {
    setup("/things/42?tab=x");

    expect(screen.getByTestId("layout")).toBeInTheDocument();
    expect(screen.getByTestId("pathname")).toHaveTextContent("/things/42");
    expect(screen.getByTestId("search")).toHaveTextContent("?tab=x");
    expect(screen.getByTestId("thing-id")).toHaveTextContent("42");
  });

  // The data router hosts the declarative tree under a `path="*"` catch-all. Its
  // match must stay invisible to the routes below it, or every route would report
  // the host's splat as its own.
  it("does not leak the host route's splat into the tree", () => {
    setup("/things/42");
    expect(screen.getByTestId("splat")).toHaveTextContent("undefined");
  });

  it("exposes a v3-shaped location.query", () => {
    setup("/things/42?tab=x");
    expect(screen.getByTestId("query-tab")).toHaveTextContent("x");
  });

  it("navigates to an absolute path via useNavigate", async () => {
    setup("/things/42");
    await userEvent.click(screen.getByRole("button", { name: "go absolute" }));
    expect(await screen.findByTestId("other")).toBeInTheDocument();
  });

  // Redux navigation carries no route context, and v3's history resolved a
  // pathname without a leading slash against the root. Resolving it against the
  // deepest match instead would send `{ pathname: "other" }` to `/things/other`.
  it("resolves a relative redux push from the root", async () => {
    const { store } = setup("/things/42");

    store.dispatch(push({ pathname: "other" }));

    expect(await screen.findByTestId("other")).toBeInTheDocument();
  });

  it("resolves relative navigation against the matched route branch", async () => {
    setup("/things/42");
    await userEvent.click(screen.getByRole("button", { name: "go up" }));
    // `..` climbs out of `things/:thingId` to the parent `/`, leaving the layout
    // with no matched child.
    expect(screen.getByTestId("layout")).toBeInTheDocument();
    expect(screen.queryByTestId("thing-id")).not.toBeInTheDocument();
  });
});
