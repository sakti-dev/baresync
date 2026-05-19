async function text(selector: string) {
  const runtime = globalThis as typeof globalThis & {
    browser: {
      $(selector: string): Promise<{
        click(): Promise<void>;
        getText(): Promise<string>;
        waitForDisplayed(): Promise<void>;
      }>;
      reloadSession(): Promise<void>;
      waitUntil(
        condition: () => Promise<boolean>,
        options?: { timeout?: number; timeoutMsg?: string }
      ): Promise<void>;
    };
  };
  const node = await runtime.browser.$(selector);
  return node.getText();
}

const CLEAN_LOCAL_CATEGORY_RE = /\{"id":"local-cat-001"[^}]*"is_synced":1/;
const CLEAN_LOCAL_PRODUCT_RE = /\{"id":"local-prod-001"[^}]*"is_synced":1/;

function ensure(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitForText(
  selector: string,
  expected: string,
  message: string
) {
  const runtime = globalThis as typeof globalThis & {
    browser: {
      waitUntil(
        condition: () => Promise<boolean>,
        options?: { timeout?: number; timeoutMsg?: string }
      ): Promise<void>;
    };
  };
  await runtime.browser.waitUntil(
    async () => (await text(selector)) === expected,
    {
      timeout: 10_000,
      timeoutMsg: message,
    }
  );
}

async function waitForTextIncludes(
  selector: string,
  expected: string,
  message: string
) {
  const runtime = globalThis as typeof globalThis & {
    browser: {
      waitUntil(
        condition: () => Promise<boolean>,
        options?: { timeout?: number; timeoutMsg?: string }
      ): Promise<void>;
    };
  };
  await runtime.browser.waitUntil(
    async () => (await text(selector)).includes(expected),
    {
      timeout: 10_000,
      timeoutMsg: message,
    }
  );
}

async function waitForTextMatches(
  selector: string,
  expected: RegExp,
  message: string
) {
  const runtime = globalThis as typeof globalThis & {
    browser: {
      waitUntil(
        condition: () => Promise<boolean>,
        options?: { timeout?: number; timeoutMsg?: string }
      ): Promise<void>;
    };
  };
  await runtime.browser.waitUntil(
    async () => expected.test(await text(selector)),
    {
      timeout: 10_000,
      timeoutMsg: message,
    }
  );
}

const smokeSuite = typeof before === "function" ? describe : describe.skip;

smokeSuite("public fixture desktop smoke", () => {
  const runtime = globalThis as typeof globalThis & {
    before?: (handler: () => Promise<void>) => void;
  };

  const beforeHook = runtime.before;
  if (beforeHook) {
    beforeHook(async () => {
      await fetch(
        `${process.env.BARESYNC_FIXTURE_API_URL ?? "http://127.0.0.1:18080"}/__reset`,
        { method: "POST" }
      );
    });
  }

  it("launches, syncs, creates data, and survives restart", async () => {
    const runtime = globalThis as typeof globalThis & {
      browser: {
        $(selector: string): Promise<{
          click(): Promise<void>;
          getText(): Promise<string>;
          waitForDisplayed(): Promise<void>;
        }>;
        reloadSession(): Promise<void>;
      };
    };

    const appStatus = await runtime.browser.$("#app-status");
    await appStatus.waitForDisplayed();
    await waitForText("#app-status", "ready", "app should be ready");
    ensure(
      (await text("#db-path")).includes("fixture-"),
      "db path should include fixture"
    );
    ensure(
      (await text("#migration-count")) === "1",
      "migrations should complete"
    );

    const baselineSync = await runtime.browser.$("#baseline-sync");
    await baselineSync.click();
    const syncResult = await runtime.browser.$("#sync-result");
    await syncResult.waitForDisplayed();
    await waitForTextIncludes(
      "#sync-result",
      "baseline:",
      "baseline sync should run"
    );

    const createRow = await runtime.browser.$("#create-row");
    await createRow.click();
    const categoriesList = await runtime.browser.$("#categories-list");
    await categoriesList.waitForDisplayed();
    ensure(
      (await text("#categories-list")).includes("Fixture Category 001"),
      "local category should render"
    );
    ensure(
      (await text("#products-list")).includes("Fixture Product 001"),
      "local product should render"
    );

    const manualSync = await runtime.browser.$("#manual-sync");
    await manualSync.click();
    await waitForTextIncludes(
      "#sync-result",
      "manual:",
      "manual sync should run"
    );

    const backendState = await fetch(
      `${process.env.BARESYNC_FIXTURE_API_URL ?? "http://127.0.0.1:18080"}/__state`
    ).then(
      (response) =>
        response.json() as Promise<{
          pushed: {
            categories: Array<{ id: string }>;
            products: Array<{ id: string }>;
          };
        }>
    );
    ensure(
      JSON.stringify(backendState.pushed).includes("local-cat-001"),
      "backend should record pushed category"
    );
    ensure(
      JSON.stringify(backendState.pushed).includes("local-prod-001"),
      "backend should record pushed product"
    );
    await waitForTextMatches(
      "#categories-list",
      CLEAN_LOCAL_CATEGORY_RE,
      "synced category should be marked clean"
    );
    await waitForTextMatches(
      "#products-list",
      CLEAN_LOCAL_PRODUCT_RE,
      "synced product should be marked clean"
    );

    await runtime.browser.reloadSession();
    const restartedStatus = await runtime.browser.$("#app-status");
    await restartedStatus.waitForDisplayed();
    await waitForText("#app-status", "ready", "restarted app should be ready");
    ensure(
      (await text("#categories-list")).includes("Fixture Category 001"),
      "category should survive restart"
    );
    ensure(
      (await text("#products-list")).includes("Fixture Product 001"),
      "product should survive restart"
    );
    ensure(
      CLEAN_LOCAL_CATEGORY_RE.test(await text("#categories-list")),
      "category clean state should survive restart"
    );
    ensure(
      CLEAN_LOCAL_PRODUCT_RE.test(await text("#products-list")),
      "product clean state should survive restart"
    );
    ensure(
      (await text("#needs-baseline")) !== "yes",
      "baseline should be satisfied"
    );
  });
});
