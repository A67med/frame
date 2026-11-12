// Backup encryption, restore safety and retired-service notices.
const dataSafety: Record<string, string> = {
  "This backup is too large to restore.": "This backup is too large to restore.",
  "This backup was made by a newer version of Frame. Update Frame, then try again.":
    "This backup was made by a newer version of Frame. Update Frame, then try again.",
  "This backup is damaged and cannot be restored.":
    "This backup is damaged and cannot be restored.",
  "Restore did not finish. Your previous setup was put back. Free some storage, then try again.":
    "Restore did not finish. Your previous setup was put back. Free some storage, then try again.",
  "Frame could not save a safety copy of your current setup, so nothing was restored. Free some storage, then try again.":
    "Frame could not save a safety copy of your current setup, so nothing was restored. Free some storage, then try again.",
  "Password (optional)": "Password (optional)",
  "With a password the file is encrypted, and it cannot be restored without it. Frame cannot recover a forgotten password.":
    "With a password the file is encrypted, and it cannot be restored without it. Frame cannot recover a forgotten password.",
  Password: "Password",
  "Repeat the password": "Repeat the password",
  "Use at least {n} characters.": "Use at least {n} characters.",
  "The passwords do not match.": "The passwords do not match.",
  "Save without a password. Settings, addons, Live TV and sign-ins can contain API keys and passwords, and anyone with the file can read them.":
    "Save without a password. Settings, addons, Live TV and sign-ins can contain API keys and passwords, and anyone with the file can read them.",
  "Wrong password, or the file was changed or damaged.":
    "Wrong password, or the file was changed or damaged.",
  "This encrypted backup needs a newer version of Frame.":
    "This encrypted backup needs a newer version of Frame.",
  "This encrypted backup is damaged and cannot be restored.":
    "This encrypted backup is damaged and cannot be restored.",
  "This backup is password protected": "This backup is password protected",
  "Enter the password that was set when the backup was saved.":
    "Enter the password that was set when the backup was saved.",
  "Unlocking...": "Unlocking...",
  "This older full backup restores its {n} saved entries and replaces each part of your setup it covers. {removed} current entries in those parts are not in the file and will be removed.":
    "This older full backup restores its {n} saved entries and replaces each part of your setup it covers. {removed} current entries in those parts are not in the file and will be removed.",
  "A copy of your current setup is saved first, so you can go back.":
    "A copy of your current setup is saved first, so you can go back.",
  "No community server is set. You can point Frame at a server you run yourself.":
    "No community server is set. You can point Frame at a server you run yourself.",
  "Frame has no community server of its own. Enter a URL to use a server you run yourself. Private mode below stops all contact either way.":
    "Frame has no community server of its own. Enter a URL to use a server you run yourself. Private mode below stops all contact either way.",
  "Enter the address of a server you run yourself, or leave this blank to keep community lookups off.":
    "Enter the address of a server you run yourself, or leave this blank to keep community lookups off.",
};

export default dataSafety;
