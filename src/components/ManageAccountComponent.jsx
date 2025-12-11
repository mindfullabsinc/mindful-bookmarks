import React, { useMemo, useState, useContext, useEffect } from "react";
import PhoneInput from 'react-phone-number-input';

/* Amplify auth */
import {
  updateUserAttributes,
  fetchUserAttributes,
  sendUserAttributeVerificationCode,
  confirmUserAttribute,
} from "aws-amplify/auth";

/* CSS */
import 'react-phone-number-input/style.css';

/* Scripts */
import { AppContext } from "@/scripts/AppContextProvider";
import { toE164 } from "@/core/utils/phone";
import { StorageMode, StorageLabel } from "@/core/constants/storageMode";

/* Components */
import { Avatar } from "@/components/primitives/Avatar"; 


export default function ManageAccountComponent({ user, signIn, signOut }) {
  const {
    userAttributes,
    setUserAttributes,
    storageMode,
    setStorageMode,
  } = useContext(AppContext);

   // Consider ourselves "hydrating" when the user is known but attributes are not yet loaded.
  const isHydrating = !!user && userAttributes == null;

   // Local form state starts empty; we’ll hydrate it when attributes arrive.
  const [form, setForm] = useState({
    given_name: "",
    family_name: "",
    email: "",
    phone: "",
    storage_type: storageMode ?? StorageMode.LOCAL,
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [pendingVerify, setPendingVerify] = useState(null); // "email" | "phone_number" | null
  const [verifyCode, setVerifyCode] = useState("");

  // Refill the form when attributes/storage change (unless user has started editing).
  useEffect(() => {
    if (!dirty && userAttributes) {
      setForm((f) => ({
        ...f,
        given_name: userAttributes.given_name ?? "",
        family_name: userAttributes.family_name ?? "",
        email: userAttributes.email ?? "",
        phone: userAttributes.phone_number ?? "",
        storage_type: storageMode ?? StorageMode.LOCAL,
      }));
    }
  }, [userAttributes, storageMode, dirty]);

  const handle = (key) => (valueOrEvent) => {
    const newValue = valueOrEvent?.target ? valueOrEvent.target.value : valueOrEvent;
    setDirty(true);
    setForm((f) => ({ ...f, [key]: newValue }));
  };

  // Header values (can be blank while hydrating; UI still renders)
  const initials = useMemo(() => {
    const a = (form.given_name || " ").trim()[0] || " ";
    const b = (form.family_name || " ").trim()[0] || " ";
    return `${a}${b}`.toUpperCase();
  }, [form.given_name, form.family_name]);

  const save = async () => {
    setSaving(true);
    try {
      const current = await fetchUserAttributes();
  
      // Map your UI fields -> Cognito standard attributes
      const next = {
        given_name: form.given_name,
        family_name: form.family_name,                 
        email: form.email,
        phone_number: toE164(form.phone),
        "custom:storage_type": form.storage_type, 
        // For custom attrs: "custom:preferred_theme": "dark"
      };
  
      // Only send what changed
      const changed = Object.fromEntries(
        Object.entries(next).filter(([k, v]) => (current[k] || "") !== (v || ""))
      );
      if (Object.keys(changed).length === 0) return;
  
      await updateUserAttributes({ userAttributes: changed });
  
      // If email or phone changed, kick off verification to the NEW value
      if (changed.email) {
        // Cognito will automatically send a verification code when email is changed
        setPendingVerify("email");
      } else if (changed.phone_number) {
        // Cognito will automatically send a verification code when phone is changed
        setPendingVerify("phone_number");
      } else {
        // Refresh local copy (and push into your AppContext)
        const updated = await fetchUserAttributes();
        setUserAttributes(updated); 
        setStorageMode(form.storage_type); 
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div 
      className="min-h-screen bg-gray-100 dark:bg-neutral-950 py-10 px-4 flex justify-center"
      aria-busy={isHydrating}
    >
      <main className="w-full max-w-2xl">
        <div className="rounded-2xl bg-white dark:bg-neutral-900 shadow-xl
                        ring-1 ring-black/5 dark:ring-white/10 p-6">

          {/* Header row */}
          <div className="flex items-center gap-4">
            <Avatar initials={initials} />
            <div className="flex-1">
              <div className="text-base font-semibold text-neutral-800 dark:text-neutral-200">
                {(form.given_name + " " + form.family_name).trim() || "\u00A0"}
              </div>
              <div className="text-sm text-neutral-500 dark:text-neutral-400">
                {form.email || "\u00A0"} 
              </div> 
            </div>
          </div>

          {/* Fields */}
          <div className="text-sm mt-6 divide-y divide-gray-200 dark:divide-white/10"> 
            <FieldRow label="Given name">
              <input
                className="w-full bg-transparent text-right
                         text-neutral-500 dark:text-neutral-400
                         placeholder-neutral-400 dark:placeholder-neutral/30
                          focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 rounded-md"
                value={form.given_name}
                onChange={handle("given_name")}
                // Show no placeholder while hydrating; show normal placeholder otherwise
                placeholder={isHydrating ? "" : "Your given name"}
              />
            </FieldRow>
            <FieldRow label="Family name">
              <input
                className="w-full bg-transparent text-right
                         text-neutral-500 dark:text-neutral-400
                         placeholder-neutral-400 dark:placeholder-neutral/30
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 rounded-md"
                value={form.family_name}
                onChange={handle("family_name")}
                placeholder={isHydrating ? "" : "Your family name"}
              />
            </FieldRow>
            <FieldRow label="Email account">
              <input
                type="email"
                className="w-full bg-transparent text-right
                          text-neutral-500 dark:text-neutral-400
                          placeholder-neutral-400 dark:placeholder-neutral/30 
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 rounded-md"
                value={form.email}
                onChange={handle("email")}
                placeholder={isHydrating ? "" : "yourname@gmail.com"}
              />
            </FieldRow>
            <FieldRow label="Phone number">
              <div className="phone-field">
                <PhoneInput
                  international
                  defaultCountry="US"
                  value={form.phone}
                  onChange={(value) => handle('phone')({ target: { value } })}
                  countryCallingCodeEditable={false}
                  numberInputProps={{
                    className: "w-full bg-transparent text-right text-neutral-500 dark:text-neutral-400 placeholder-neutral-400 dark:placeholder-neutral/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 rounded-md",
                    //'400 placeholder-gray-400 focus:outline-none',
                   placeholder: isHydrating ? "" : "Add phone number",
                  }}
                />
              </div>
            </FieldRow>
            <FieldRow label="Storage type">
              <CompactStorageToggle
                value={form.storage_type}
                onChange={handle("storage_type")}
                disabled={isHydrating}
              />
            </FieldRow>
          </div>

          {/* Save button  */}
          <div className="text-sm pt-6">
            <button
              onClick={save}
              disabled={saving || isHydrating}
              className="cursor-pointer inline-flex items-center justify-center rounded-xl
                        bg-blue-600 hover:bg-blue-500 text-white font-semibold
                        px-5 py-2.5 shadow-md shadow-black/10 dark:shadow-black/20
                        ring-1 ring-black/5 dark:ring-white/10
                        disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>

        {pendingVerify && (
          <div className="mt-6 rounded-xl border border-gray-200 p-4">
            <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Enter the code sent to your {pendingVerify === "email" ? "email" : "phone"}:
            </div>
            <div className="flex gap-3">
              <input
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                placeholder="123456"
                inputMode="numeric"
              />
              <button
                className="rounded-lg bg-blue-600 px-4 py-2 text-white font-semibold hover:bg-blue-500"
                onClick={async () => {
                  await confirmUserAttribute({
                    userAttributeKey: pendingVerify,
                    confirmationCode: verifyCode.trim(),
                  });
                  setPendingVerify(null);
                  setVerifyCode("");
                  const updated = await fetchUserAttributes();
                  setUserAttributes(updated);
                }}
              >
                Confirm
              </button>
              <button
                className="rounded-lg border px-3 py-2 font-medium"
                onClick={() => sendUserAttributeVerificationCode({ userAttributeKey: pendingVerify })}
              >
                Resend
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

/* ---------- Little helpers ---------- */
function FieldRow({ label, children }) {
  return (
    <div className="flex items-center justify-between py-4">
      <div className="text-neutral-500 dark:text-neutral-400 font-medium">{label}</div>
      <div className="ml-6 w-1/2 sm:w-2/5 flex justify-end">{children}</div>
    </div>
  );
}

function CompactStorageToggle({ value = StorageMode.LOCAL, onChange, disabled }) {
  const isRemote = value === StorageMode.REMOTE;

  return (
    <div className="flex items-center gap-3 text-sm">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange?.(StorageMode.LOCAL)}
        className={`transition ${
          !isRemote ? "font-bold text-neutral-500 dark:text-neutral-400" : "text-neutral-500 dark:text-neutral-400"
        } hover:text-neutral-900 disabled:opacity-50`}
      >
        {StorageLabel[StorageMode.LOCAL]}
      </button>

      {/* compact switch */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange?.(isRemote ? StorageMode.LOCAL : StorageMode.REMOTE)}
        aria-pressed={isRemote}
        className={`cursor-pointer relative inline-flex h-5 w-9 items-center rounded-full border transition
          ${isRemote
            ? "bg-blue-600 border-blue-600"
            : "bg-zinc-300 dark:bg-zinc-700 border-zinc-300 dark:border-zinc-700"}
          focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20
          disabled:opacity-50`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow ${isRemote ? "translate-x-4" : "translate-x-1"}`} />
      </button>

      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange?.(StorageMode.REMOTE)}
        className={`transition ${
          isRemote ? "font-bold text-neutral-500 dark:text-neutral-400" : "text-neutral-500 dark:text-neutral-400"
        } hover:text-neutral-900 disabled:opacity-50`}
      >
        {StorageLabel[StorageMode.REMOTE]}
      </button>
    </div>
  );
}

