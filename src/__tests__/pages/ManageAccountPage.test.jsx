// src/__tests__/pages/ManageAccountPage.test.jsx
import React from "react";
import { render, screen } from "@testing-library/react";

// ----- Spies & holders (must start with "mock") -----
const mockTopBannerSpy = jest.fn();
const mockManageAccountSpy = jest.fn();
let mockHookReturn;
let mockAuthReturn;

// ----- Mocks -----
jest.mock("@/components/TopBanner", () => {
  const React = require("react");
  return function TopBannerMock(props) {
    mockTopBannerSpy(props);
    return <div data-testid="TopBanner" />;
  };
});

jest.mock("@/components/ManageAccountComponent", () => {
  const React = require("react");
  return function ManageAccountComponentMock(props) {
    mockManageAccountSpy(props);
    return <div data-testid="ManageAccountComponent" />;
  };
});

jest.mock("@/hooks/useBookmarkManager", () => ({
  useBookmarkManager: () => mockHookReturn,
}));

jest.mock("@/scripts/AppContextProvider", () => {
  const React = require("react");
  return { AppContext: React.createContext({}) };
});

jest.mock("@/analytics/AnalyticsProvider", () => ({
  __esModule: true,
  default: ({ children }) => <>{children}</>,
}));

// *** Mock Amplify UI's useAuthenticator so we don't need Authenticator.Provider
jest.mock("@aws-amplify/ui-react", () => ({
  useAuthenticator: () => mockAuthReturn,
}));

// ----- Under test (import after mocks) -----
import ManageAccountPage from "@/pages/ManageAccountPage";
import { AppContext } from "@/scripts/AppContextProvider"

function renderWithCtx(ui, value) {
  return render(<AppContext.Provider value={value}>{ui}</AppContext.Provider>);
}

describe("ManageAccountPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockHookReturn = {
      importBookmarksFromJSON: jest.fn(),
      exportBookmarksToJSON: jest.fn(),
      changeStorageMode: jest.fn(),
    };

    // default auth state; each test can override
    mockAuthReturn = {
      user: null,
      signOut: jest.fn(),
      toSignIn: jest.fn(),
    };
  });

  it("wires TopBanner with the right props and renders ManageAccountComponent", () => {
    const ctxValue = { userAttributes: { given_name: "Ada" } };
    // Simulate a signed-in user
    mockAuthReturn = {
      user: { id: "123" },
      signOut: jest.fn(),
      toSignIn: jest.fn(),
    };

    renderWithCtx(
      <ManageAccountPage
        user={{ id: "123" }}
        signIn={jest.fn()}
        signOut={jest.fn()}
      />,
      ctxValue
    );

    expect(screen.getByTestId("TopBanner")).toBeInTheDocument();
    expect(screen.getByTestId("ManageAccountComponent")).toBeInTheDocument();

    const topArgs = mockTopBannerSpy.mock.calls.at(-1)[0];
    expect(typeof topArgs.onExportBookmarks).toBe("function");
    expect(typeof topArgs.onStorageModeChange).toBe("function");
    expect(topArgs.userAttributes).toEqual(ctxValue.userAttributes);
    expect(topArgs.isSignedIn).toBe(true);

    const macArgs = mockManageAccountSpy.mock.calls.at(-1)[0];
    expect(macArgs.user).toEqual({ id: "123" });          // comes from mockAuthReturn.user
    expect(macArgs.signIn).toBe(mockAuthReturn.toSignIn); // forwarded from hook
    expect(macArgs.signOut).toBe(mockAuthReturn.signOut); // forwarded from hook
  });

  it("passes isSignedIn=false when user is null", () => {
    // Simulate signed-out
    mockAuthReturn = {
      user: null,
      signOut: jest.fn(),
      toSignIn: jest.fn(),
    };

    renderWithCtx(
      <ManageAccountPage user={null} signIn={() => {}} signOut={() => {}} />,
      { userAttributes: {} }
    );

    const topArgs = mockTopBannerSpy.mock.calls.at(-1)[0];
    expect(topArgs.isSignedIn).toBe(false);
  });
});
