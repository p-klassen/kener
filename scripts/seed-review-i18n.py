#!/usr/bin/env python3
"""Seed new i18n keys from code review into all locale files."""

import json
import os

LOCALES_DIR = os.path.join(os.path.dirname(__file__), "../src/lib/locales")

# New keys with English values (all locales get English fallback except DE)
NEW_KEYS = {
    # Subscribe dialog — full i18n coverage for raw strings
    "subscribe.btn_subscribe": "Subscribe",
    "subscribe.dialog_title": "Subscribe to Updates",
    "subscribe.desc_login": "Get notified about incidents and scheduled maintenance.",
    "subscribe.desc_otp": "Enter the verification code sent to your email.",
    "subscribe.desc_prefs": "Manage your notification preferences.",
    "subscribe.loading": "Loading your preferences...",
    "subscribe.email_label": "Email address",
    "subscribe.btn_sending": "Sending...",
    "subscribe.btn_continue": "Continue",
    "subscribe.code_sent_to": "We sent a 6-digit code to",
    "subscribe.btn_back": "Back",
    "subscribe.btn_verifying": "Verifying...",
    "subscribe.btn_verify": "Verify",
    "subscribe.btn_resend": "Didn't receive the code? Resend",
    "subscribe.incidents_label": "Incident Updates",
    "subscribe.incidents_desc": "Get notified about incidents updates",
    "subscribe.maintenance_label": "Maintenance Updates",
    "subscribe.maintenance_desc": "Get notified about scheduled maintenance",
    "subscribe.error.link_account_failed": "Failed to link account for notifications",
    "subscribe.error.network": "Network error. Please try again.",
    "subscribe.error.invalid_email": "Please enter a valid email address",
    "subscribe.error.send_code_failed": "Failed to send verification code",
    "subscribe.error.enter_code": "Please enter the 6-digit verification code",
    "subscribe.error.verification_failed": "Verification failed",
    "subscribe.error.update_pref_failed": "Failed to update preference",
    "subscribe.error.select_scope": "Select at least one page or monitor",
    "subscribe.error.save_scope_failed": "Failed to save scope",
    "subscribe.error.generic": "Something went wrong. Please try again.",
    "subscribe.error.retry": "Try Again",
    # change-password server-side validation error keys
    "account.change_password.err_fields_required": "Both password fields are required",
    "account.change_password.err_password_invalid": "Password must be at least 8 characters, contain uppercase, lowercase, and a number",
    "account.change_password.err_passwords_no_match": "Passwords do not match",
    # verify page server-side error keys
    "account.verify.err_invalid_link": "Invalid or missing verification link.",
    "account.verify.err_invalid_expired": "Invalid or expired verification link.",
    "account.verify.err_expired": "This verification link has expired. Please request a new one.",
    "account.verify.err_no_user": "No user found for this verification link.",
    # invitation page server-side error keys
    "account.invitation.err_invalid_link": "Invalid or missing invitation link.",
    "account.invitation.err_invalid_expired": "Invalid or expired invitation link.",
    "account.invitation.err_invalid": "Invalid invitation link.",
    "account.invitation.err_expired": "This invitation link has expired. Please ask your administrator to send a new one.",
    "account.invitation.err_no_user": "No invitation found for this email address.",
    "account.invitation.err_already_accepted": "This invitation has already been accepted. Please sign in instead.",
    # page logo alt text
    "page.logo_alt": "Page Logo",
}

# Native DE translations
DE_OVERRIDES = {
    "subscribe.btn_subscribe": "Abonnieren",
    "subscribe.dialog_title": "Updates abonnieren",
    "subscribe.desc_login": "Erhalten Sie Benachrichtigungen über Störungen und geplante Wartungsarbeiten.",
    "subscribe.desc_otp": "Geben Sie den Bestätigungscode ein, der an Ihre E-Mail gesendet wurde.",
    "subscribe.desc_prefs": "Verwalten Sie Ihre Benachrichtigungseinstellungen.",
    "subscribe.loading": "Einstellungen werden geladen...",
    "subscribe.email_label": "E-Mail-Adresse",
    "subscribe.btn_sending": "Wird gesendet...",
    "subscribe.btn_continue": "Weiter",
    "subscribe.code_sent_to": "Wir haben einen 6-stelligen Code gesendet an",
    "subscribe.btn_back": "Zurück",
    "subscribe.btn_verifying": "Wird überprüft...",
    "subscribe.btn_verify": "Bestätigen",
    "subscribe.btn_resend": "Code nicht erhalten? Erneut senden",
    "subscribe.incidents_label": "Störungsmeldungen",
    "subscribe.incidents_desc": "Benachrichtigungen über Störungen erhalten",
    "subscribe.maintenance_label": "Wartungsbenachrichtigungen",
    "subscribe.maintenance_desc": "Benachrichtigungen über geplante Wartungsarbeiten erhalten",
    "subscribe.error.link_account_failed": "Konto konnte nicht für Benachrichtigungen verknüpft werden",
    "subscribe.error.network": "Netzwerkfehler. Bitte versuchen Sie es erneut.",
    "subscribe.error.invalid_email": "Bitte geben Sie eine gültige E-Mail-Adresse ein",
    "subscribe.error.send_code_failed": "Bestätigungscode konnte nicht gesendet werden",
    "subscribe.error.enter_code": "Bitte geben Sie den 6-stelligen Bestätigungscode ein",
    "subscribe.error.verification_failed": "Überprüfung fehlgeschlagen",
    "subscribe.error.update_pref_failed": "Einstellung konnte nicht aktualisiert werden",
    "subscribe.error.select_scope": "Bitte wählen Sie mindestens eine Seite oder einen Monitor",
    "subscribe.error.save_scope_failed": "Bereich konnte nicht gespeichert werden",
    "subscribe.error.generic": "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.",
    "subscribe.error.retry": "Erneut versuchen",
    "account.change_password.err_fields_required": "Beide Passwortfelder sind erforderlich",
    "account.change_password.err_password_invalid": "Das Passwort muss mindestens 8 Zeichen, Groß- und Kleinbuchstaben sowie eine Zahl enthalten",
    "account.change_password.err_passwords_no_match": "Die Passwörter stimmen nicht überein",
    "account.verify.err_invalid_link": "Ungültiger oder fehlender Bestätigungslink.",
    "account.verify.err_invalid_expired": "Ungültiger oder abgelaufener Bestätigungslink.",
    "account.verify.err_expired": "Dieser Bestätigungslink ist abgelaufen. Bitte fordern Sie einen neuen an.",
    "account.verify.err_no_user": "Kein Benutzer für diesen Bestätigungslink gefunden.",
    "account.invitation.err_invalid_link": "Ungültiger oder fehlender Einladungslink.",
    "account.invitation.err_invalid_expired": "Ungültiger oder abgelaufener Einladungslink.",
    "account.invitation.err_invalid": "Ungültiger Einladungslink.",
    "account.invitation.err_expired": "Dieser Einladungslink ist abgelaufen. Bitte bitten Sie Ihren Administrator, einen neuen zu senden.",
    "account.invitation.err_no_user": "Keine Einladung für diese E-Mail-Adresse gefunden.",
    "account.invitation.err_already_accepted": "Diese Einladung wurde bereits angenommen. Bitte melden Sie sich an.",
    "page.logo_alt": "Seitenlogo",
}


def seed_locale(filepath: str, is_de: bool):
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    mappings = data.get("mappings", {})
    added = 0
    for key, en_value in NEW_KEYS.items():
        if key not in mappings:
            value = DE_OVERRIDES.get(key, en_value) if is_de else en_value
            mappings[key] = value
            added += 1

    data["mappings"] = mappings
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")

    return added


total = 0
for fname in sorted(os.listdir(LOCALES_DIR)):
    if not fname.endswith(".json"):
        continue
    fpath = os.path.join(LOCALES_DIR, fname)
    code = fname.replace(".json", "")
    is_de = code == "de"
    added = seed_locale(fpath, is_de)
    print(f"  {fname}: +{added} keys")
    total += added

print(f"\nTotal keys added: {total}")
