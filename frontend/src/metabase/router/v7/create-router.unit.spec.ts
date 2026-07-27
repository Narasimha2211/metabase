import { createMemoryAppRouter } from "./create-router";

describe("redundant replace", () => {
  it("does not commit a replace to the current URL", async () => {
    const router = createMemoryAppRouter("/a?x=1");
    const before = router.state.location;

    await router.navigate("/a?x=1", { replace: true });
    expect(router.state.location).toBe(before);
  });

  it("commits a replace that changes the URL", async () => {
    const router = createMemoryAppRouter("/a?x=1");

    await router.navigate("/a?x=2", { replace: true });
    expect(router.state.location.search).toBe("?x=2");

    await router.navigate("/b", { replace: true });
    expect(router.state.location.pathname).toBe("/b");
  });

  it("commits a push to the current URL", async () => {
    const router = createMemoryAppRouter("/a");
    const before = router.state.location;

    await router.navigate("/a");
    expect(router.state.location).not.toBe(before);
  });

  it("compares against the basename-free location", async () => {
    const router = createMemoryAppRouter("/subpath/a", "/subpath");
    const before = router.state.location;

    await router.navigate("/a", { replace: true });
    expect(router.state.location).toBe(before);

    await router.navigate("/b", { replace: true });
    expect(router.state.location.pathname).toBe("/subpath/b");
  });
});
