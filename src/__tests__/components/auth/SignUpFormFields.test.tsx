import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import SignUpFormFields from "@/components/auth/SignUpFormFields";

// ---- Mocks ----

// Mock the Amplify UI components + hook
jest.mock("@aws-amplify/ui-react", () => ({
  __esModule: true,
  useAuthenticator: jest.fn(),
  TextField: (props: any) => {
    const { label, name, type = "text", ...rest } = props;
    return (
      <label>
        {label}
        <input
          name={name}
          type={type}
          aria-label={label}
          {...rest}
        />
      </label>
    );
  },
  PasswordField: (props: any) => {
    const { label, name, ...rest } = props;
    return (
      <label>
        {label}
        <input
          name={name}
          type="password"
          aria-label={label}
          {...rest}
        />
      </label>
    );
  },
}));

// Mock the CSS import from react-phone-number-input
jest.mock("react-phone-number-input/style.css", () => ({}));

// Mock react-phone-number-input to a simple <input>
// that forwards value/onChange + numberInputProps
jest.mock("react-phone-number-input", () => {
  const React = require("react");
  return function MockPhoneInput(props: any) {
    const { value, onChange, numberInputProps, onFocus } = props;
    return (
      <input
        data-testid="phone-input"
        value={value}
        onChange={(e) => onChange?.((e.target as HTMLInputElement).value)}
        onFocus={onFocus}
        {...numberInputProps}
      />
    );
  };
});

const mockUseAuthenticator = require("@aws-amplify/ui-react")
  .useAuthenticator as jest.Mock;

describe("SignUpFormFields", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuthenticator.mockReturnValue({
      validationErrors: {},
    });
  });

  it("renders basic fields and hidden phone_number input", () => {
    render(
      <form>
        <SignUpFormFields />
        <button type="submit">Submit</button>
      </form>
    );

    // First/Last/Email inputs from mocked TextField
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();

    // Password fields from mocked PasswordField
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();

    // Hidden phone_number input
    const hiddenPhone = document.querySelector(
      'input[name="phone_number"]'
    ) as HTMLInputElement | null;
    expect(hiddenPhone).not.toBeNull();
    expect(hiddenPhone?.type).toBe("hidden");
  });

  it("syncs the phone input into the hidden phone_number field and logs value on submit", () => {
    mockUseAuthenticator.mockReturnValue({
      validationErrors: {},
    });

    const consoleSpy = jest
      .spyOn(console, "log")
      .mockImplementation(() => {});

    render(
      <form>
        <SignUpFormFields />
        <button type="submit">Submit</button>
      </form>
    );

    const phoneInput = screen.getByTestId(
      "phone-input"
    ) as HTMLInputElement;

    fireEvent.change(phoneInput, {
      target: { value: "+1 234 567 8900" },
    });

    const hiddenPhone = document.querySelector(
      'input[name="phone_number"]'
    ) as HTMLInputElement | null;

    expect(hiddenPhone).not.toBeNull();
    expect(hiddenPhone!.value).toBe("+12345678900");

    const submitButton = screen.getByRole("button", { name: /submit/i });
    fireEvent.click(submitButton);

    expect(consoleSpy).toHaveBeenCalledWith(
      "Hidden phone_number value at submit:",
      "+12345678900"
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      "Form phone_number being submitted:",
      "+12345678900"
    );

    consoleSpy.mockRestore();
  });

  it("shows phone_number validation error when present", () => {
    mockUseAuthenticator.mockReturnValue({
      validationErrors: {
        phone_number: "Phone number is invalid",
      },
    });

    render(
      <form>
        <SignUpFormFields />
        <button type="submit">Submit</button>
      </form>
    );

    expect(
      screen.getByText("Phone number is invalid")
    ).toBeInTheDocument();
  });
});