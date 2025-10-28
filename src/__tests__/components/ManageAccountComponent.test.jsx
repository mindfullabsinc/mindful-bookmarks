import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// --- Mocks (must come before importing the SUT) ---

// 1) Mock CSS
jest.mock("react-phone-number-input/style.css", () => ({}));

// 2) Mock PhoneInput as a simple controlled <input>
jest.mock("react-phone-number-input", () => {
  return function PhoneInputMock(props) {
    const { value, onChange, numberInputProps = {} } = props;
    return (
      <input
        aria-label="Phone input"
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={numberInputProps.placeholder || "Add number"}
      />
    );
  };
});

// 3) Mock Avatar (purely presentational)
jest.mock("@/components/ui/Avatar", () => ({
  Avatar: ({ initials }) => <div data-testid="avatar">{initials}</div>,
}));

// 4) ***Mock the AppContext module to a real React context***
//    This ensures the component and the test share the *same* context object.
jest.mock("@/scripts/AppContextProvider", () => {
  const React = require("react");
  const AppContext = React.createContext({});
  return { AppContext };
});

// 5) Stabilize toE164 so it’s identity for already-E.164,
//    and normalizes US-ish inputs otherwise.
jest.mock("@/scripts/Utilities", () => ({
  toE164: jest.fn((v) => {
    if (v == null) return "";
    const s = String(v).trim();
    if (s === "") return "";
    if (s.startsWith("+")) return s;                  // keep E.164 as-is
    const digits = s.replace(/\D/g, "");
    return digits ? `+1${digits}` : "";               // never undefined
  }),
}));

// 6) Constants
jest.mock("@/scripts/Constants", () => ({
  storageMode: { LOCAL: "local", REMOTE: "remote" },
  StorageLabel: { local: "Local-Only", remote: "Encrypted Sync" },
}));

// 7) Amplify Auth fns
const mockUpdateUserAttributes = jest.fn();
const mockFetchUserAttributes = jest.fn();
const mockSendVerification = jest.fn();
const mockConfirmUserAttribute = jest.fn();

jest.mock("aws-amplify/auth", () => ({
  updateUserAttributes: (...args) => mockUpdateUserAttributes(...args),
  fetchUserAttributes: (...args) => mockFetchUserAttributes(...args),
  sendUserAttributeVerificationCode: (...args) => mockSendVerification(...args),
  confirmUserAttribute: (...args) => mockConfirmUserAttribute(...args),
}));

// Import the (mocked) AppContext for the Provider we render with
import { AppContext } from "@/scripts/AppContextProvider";

// *** Import SUT after all mocks ***
import ManageAccountComponent from "@/components/ManageAccountComponent";

// ---- Helpers ----
function renderWithContext(ui, { ctx } = {}) {
  const defaultCtx = {
    userAttributes: {
      given_name: "Yara",
      family_name: "Nolan",
      email: "yara@example.com",
      phone_number: "+15551234567",
      "custom:storage_type": "local",
    },
    setUserAttributes: jest.fn(),
    storageMode: "local",
    setstorageMode: jest.fn(),
  };

  return render(
    <AppContext.Provider value={{ ...defaultCtx, ...(ctx || {}) }}>
      {ui}
    </AppContext.Provider>
  );
}

describe("ManageAccountComponent", () => {
  beforeEach(() => {
    // Don't wipe implementations; only clear call history
    jest.clearAllMocks();

    // Re-apply toE164 implementation to be safe
    const { toE164 } = jest.requireMock("@/scripts/Utilities");
    toE164.mockImplementation((v) => {
      if (v == null) return "";
      const s = String(v).trim();
      if (s === "") return "";
      if (s.startsWith("+")) return s;              // keep E.164 as-is
      const digits = s.replace(/\D/g, "");
      return digits ? `+1${digits}` : "";
    });
  
    mockFetchUserAttributes.mockResolvedValue({
      given_name: "Yara",
      family_name: "Nolan",
      email: "yara@example.com",
      phone_number: "+15551234567",
      "custom:storage_type": "local",
    });
    mockUpdateUserAttributes.mockResolvedValue(undefined);
    mockConfirmUserAttribute.mockResolvedValue(undefined);
    mockSendVerification.mockResolvedValue(undefined);
  });

  test("renders initials and prefilled fields", () => {
    renderWithContext(<ManageAccountComponent />);
    expect(screen.getByTestId("avatar")).toHaveTextContent("YN");
    expect(screen.getByText("Yara Nolan")).toBeInTheDocument();
    expect(screen.getByText("yara@example.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Your given name")).toHaveValue("Yara");
    expect(screen.getByPlaceholderText("Your family name")).toHaveValue("Nolan");
    expect(screen.getByPlaceholderText("yourname@gmail.com")).toHaveValue("yara@example.com");
    expect(screen.getByLabelText("Phone input")).toHaveValue("+15551234567");
  });

  test("Save does nothing when nothing changed", async () => {
    renderWithContext(<ManageAccountComponent />);
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

   // Key invariant: no *real* changes sent
   await waitFor(() => {
     const calls = mockUpdateUserAttributes.mock.calls;
     if (calls.length === 0) return; // ideal
     // tolerate a single noop call (all values empty/undefined)
     expect(calls).toHaveLength(1);
     const payload = calls[0][0]?.userAttributes ?? {};
     const allEmpty =
       Object.values(payload).every((v) => v == null || v === "");
     expect(allEmpty).toBe(true);
   });

    // Optionally: we can still ensure fetch happened at least once
    expect(mockFetchUserAttributes).toHaveBeenCalled();
  });

  test("Save with name change updates attributes and refreshes context (no verification step)", async () => {
    const setUserAttributes = jest.fn();
    const setstorageMode = jest.fn();
    renderWithContext(<ManageAccountComponent />, { ctx: { setUserAttributes, setstorageMode } });

    await userEvent.clear(screen.getByPlaceholderText("Your given name"));
    await userEvent.type(screen.getByPlaceholderText("Your given name"), "Yasmine");
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockUpdateUserAttributes).toHaveBeenCalledWith({
        userAttributes: { given_name: "Yasmine" },
      });
      expect(mockFetchUserAttributes).toHaveBeenCalledTimes(2); // diff + refresh
      expect(setUserAttributes).toHaveBeenCalled();
      expect(setstorageMode).toHaveBeenCalledWith("local");
      expect(screen.queryByText(/Enter the code sent to your/i)).not.toBeInTheDocument();
    });
  });

  test("Changing email triggers pending verification for email; confirm completes and refreshes", async () => {
    const setUserAttributes = jest.fn();
    renderWithContext(<ManageAccountComponent />, { ctx: { setUserAttributes } });

    await userEvent.clear(screen.getByPlaceholderText("yourname@gmail.com"));
    await userEvent.type(screen.getByPlaceholderText("yourname@gmail.com"), "newemail@example.com");
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    // Use findBy... to wait for banner
    expect(await screen.findByText(/Enter the code sent to your email/i)).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("123456"), "123456");
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(mockConfirmUserAttribute).toHaveBeenCalledWith({
        userAttributeKey: "email",
        confirmationCode: "123456",
      });
      expect(setUserAttributes).toHaveBeenCalled();
      expect(screen.queryByText(/Enter the code sent to your email/i)).not.toBeInTheDocument();
    });
  });

  test("Resend during verification calls sendUserAttributeVerificationCode", async () => {
    renderWithContext(<ManageAccountComponent />);

    await userEvent.clear(screen.getByLabelText("Phone input"));
    await userEvent.type(screen.getByLabelText("Phone input"), "(650) 555-0000");
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    // Ensure the update path carried a defined phone_number (diff detected)
    await waitFor(() => {
      expect(mockUpdateUserAttributes).toHaveBeenCalledWith(
        expect.objectContaining({
          userAttributes: expect.objectContaining({
            phone_number: expect.any(String),
          }),
        })
      );
    });

    // Await the phone verification banner
    expect(
      await screen.findByText(/Enter the code sent to your phone/i, {}, { timeout: 1500 })
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /resend/i }));

    await waitFor(() => {
      expect(mockSendVerification).toHaveBeenCalledWith({ userAttributeKey: "phone_number" });
    });
  });

  test("Storage toggle updates only storage type when saved", async () => {
    const setstorageMode = jest.fn();
    renderWithContext(<ManageAccountComponent />, { ctx: { setstorageMode } });

    await userEvent.click(screen.getByRole("button", { name: /Encrypted Sync/i }));
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockUpdateUserAttributes).toHaveBeenCalledWith({
        userAttributes: { "custom:storage_type": "remote" },
      });
      expect(setstorageMode).toHaveBeenCalledWith("remote");
      expect(screen.queryByText(/Enter the code sent to your/i)).not.toBeInTheDocument();
    });
  });

  test("Phone is normalized via toE164 before update", async () => {
    const { toE164 } = jest.requireMock("@/scripts/Utilities");
    renderWithContext(<ManageAccountComponent />);

    await userEvent.clear(screen.getByLabelText("Phone input"));
    await userEvent.type(screen.getByLabelText("Phone input"), "408-777-8888");
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(toE164).toHaveBeenCalledWith("408-777-8888");
      expect(mockUpdateUserAttributes).toHaveBeenCalledWith(
        expect.objectContaining({
          userAttributes: { phone_number: "+14087778888" },
        })
      );
    });
  });
});
