# Get Sign-In Page Summary

## Action: get-sign-in-page-summary


## Requirements

- Navigate to GitHub's visible sign-in page.
- This is a read-only action. It does not enter credentials, submit the sign-in form, activate passkey authentication, or change cookie preferences.

## How to run this action

Run this action while the GitHub sign-in page is loaded. It inspects the currently visible username and password fields, sign-in control, and public recovery or account-creation links.

## Action

## Navigate to

`https://github.com/login`

```js
({ name: "get_github_sign_in_page_summary", description: "Returns the visible GitHub sign-in form configuration and public account help links without entering or submitting credentials.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async function(params) { var clean = function(value) { return (value || "").replace(/\s+/g, " ").trim(); }; var username = document.querySelector("#login_field"); var password = document.querySelector("#password"); var submit = document.querySelector('input[name="commit"]'); var forgotPassword = document.querySelector("#forgot-password"); var createAccount = Array.prototype.slice.call(document.querySelectorAll("a")).find(function(link) { return clean(link.textContent) === "Create an account"; }); var passkey = Array.prototype.slice.call(document.querySelectorAll("button")).find(function(button) { return clean(button.textContent) === "Sign in with a passkey"; }); var result = { url: window.location.href, title: document.title, fields: [{ name: username ? username.name : null, type: username ? username.type : null, required: username ? username.required : null, visible: !!username }, { name: password ? password.name : null, type: password ? password.type : null, required: password ? password.required : null, visible: !!password }], signInControl: submit ? { type: submit.type, label: submit.value || clean(submit.textContent), visible: true } : null, forgotPassword: forgotPassword ? { text: clean(forgotPassword.textContent), href: forgotPassword.href } : null, createAccount: createAccount ? { text: clean(createAccount.textContent), href: createAccount.href } : null, passkeyAvailable: !!passkey }; return { content: [{ type: "text", text: JSON.stringify(result) }] }; } })
```

## Returns

A JSON object containing the current page URL and title, visible form-field metadata, sign-in control label, password-recovery link, account-creation link, and passkey-option availability.
