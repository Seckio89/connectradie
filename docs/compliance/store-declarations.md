# Store declarations — tradie verification (ABN + licence photo)

Copy-ready answers for Google Play Console and App Store Connect covering the
ABN check and the licence-photo flow added in the tradie-verification work.
Everything below describes what the code actually does; if the flow changes,
change this file in the same PR.

**What the app does, in one line:** a tradie photographs their trade licence;
the photo is sent to a third-party AI reading service (Hugging Face hosted
inference) to extract the licence number, name, class and expiry; an admin
confirms it against the state register; the photo is deleted on that decision
or after 30 days, whichever is first. Only the outcome is kept.

---

## 1. Google Play — Data safety form

### Data collection and security

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (HTTPS to Supabase and to the OCR provider) |
| Do you provide a way for users to request that their data is deleted? | **Yes** — Settings → Security → Delete account, or email admin@connectradie.com (privacy policy §6–7) |

### Data types — add these two to whatever is already declared

**Photos and videos → Photos**

| Field | Answer |
|---|---|
| Collected | Yes |
| Shared | **Yes** — with the OCR provider (Hugging Face) for text extraction only |
| Processed ephemerally | **No** (stored until the review decision, max 30 days) |
| Required or optional | **Optional** — the tradie can type the details instead |
| Purpose (collected) | App functionality · Account management (account verification) |
| Purpose (shared) | App functionality |
| Not used for advertising | Correct — do not tick Advertising or marketing |

**Personal info → Other info** *(Play has no "Government ID" sub-type; declare the licence as other personal info)*

| Field | Answer |
|---|---|
| What it is | Trade licence number, class and expiry, and the name printed on the licence |
| Collected | Yes |
| Shared | **Yes** — the photo the values are read from goes to the OCR provider; the extracted values themselves are not shared onward |
| Processed ephemerally | No |
| Required or optional | Optional (required only to be marked licence-verified) |
| Purpose | Account management (account verification) · Fraud prevention, security and compliance |

**Personal info → Name** — already declared; add purpose *Account management* if missing (the licence holder name is matched to the account name).

**Financial info** — the ABN is a public business identifier, not financial info. It is looked up against the government ABR, not shared with any other party. Declare under **Personal info → Other info** if the reviewer asks; purpose Account management.

### Data handling statements to have ready

- *Third-party AI transfer:* "Licence photos are transmitted to Hugging Face, Inc. (hosted inference API, United States) solely to extract printed text. The provider receives the image only, no account identifiers. Transfer occurs only after the user taps 'Agree and continue' on a dedicated consent screen."
- *Retention:* "Deleted from our storage when an administrator records a decision (typically within a few days) and in any case within 30 days of upload, by a scheduled job. Retained afterwards: verification outcome, licence expiry month, state."
- *Consent record:* "Each consent decision is logged (purpose, text version, timestamp, hashed IP) in an append-only table."

### Permissions declaration

| Permission | Rationale string (shown to the user) | When requested |
|---|---|---|
| `android.permission.CAMERA` | **To photograph your trade licence for verification.** | At point of use only — when the tradie taps "Photograph your licence card". Never at launch. |

`<uses-feature android:name="android.hardware.camera" android:required="false" />` is set so devices without a rear camera can still install; those users choose a photo or type the details.

### Already-applicable items on the same console (not new, listed so they are not forgotten)

- **Developer identity verification** — pending on the Play account; nothing in this feature changes it, but the app cannot publish until it is done.
- **Financial features declaration** — the app already moves money (Stripe Connect escrow); that declaration is due regardless of this feature.
- **Background location prominent disclosure** — from site geofencing; see `docs/android-release-checklist.md` §6.

---

## 2. App Store Connect — App Privacy

### Data types to declare (in addition to what is already there)

| Data type | Linked to identity | Used for tracking | Purposes |
|---|---|---|---|
| **User Content → Photos or Videos** | Yes | No | App Functionality |
| **Sensitive Info → Other (Government ID / licence details)** | Yes | No | App Functionality |
| **Contact Info → Name** (already declared) | Yes | No | App Functionality |

Note under "Photos": *"Trade licence photos only; collected via camera or photo picker with explicit consent; shared with a third-party OCR processor; deleted on review or within 30 days."*

Apple's form asks whether data is "collected" (leaves the device) and whether third parties receive it. Both are **yes** for the photo. Apple does not distinguish AI processors; disclose Hugging Face by name in the privacy policy (done, §2.8 / §4.2) and in the review notes.

### Info.plist

Add to the iOS project (Capacitor does not set this from config):

```xml
<key>NSCameraUsageDescription</key>
<string>To photograph your trade licence for verification.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>To choose an existing photo of your trade licence for verification.</string>
```

The iOS project directory does not exist in the repo yet (`npm run cap:add:ios` creates it). Add both keys the first time it is generated; without them the photo picker crashes the app on iOS and review rejects it.

### App Review notes (paste into the "Notes" field)

> Tradies (service providers) may optionally photograph their government-issued
> trade licence to earn a "Licence verified" badge. Before any photo is taken
> the app shows a dedicated consent screen explaining that the image is sent to
> a third-party OCR service (Hugging Face) to read four printed fields, and
> offers a "type the details myself" alternative that sends nothing. An
> administrator confirms the details against the public state licensing
> register; the photo is deleted from our storage at that moment or within 30
> days. Test account: [add a tradie test login]. To reach the flow: Settings →
> Get verified → Licence check.

---

## 3. Checklist before submitting either store

- [ ] `HF_API_TOKEN`, `OCR_PROVIDER=huggingface` and `ABR_GUID` set as Supabase secrets — the flow degrades to "type it yourself" without the OCR token, and ABN verification returns a clear "not configured" error without the GUID.
- [ ] Privacy policy live at connectradie.com/privacy with §2.8 (licence photo & OCR), the Hugging Face row in §4.2 and the retention line in §7. Both stores link to it.
- [ ] Data safety / App Privacy answers above entered and saved.
- [ ] Camera permission rationale string matches the manifest comment and this file.
- [ ] Every URL in `licence_registers` opened by hand once (`docs/OWNER-TODO.md`).
- [ ] If OCR is later moved to the self-hosted provider (`OCR_PROVIDER=self-hosted`), remove the third-party sharing answers for Photos and the Hugging Face row — the consent screen text and `CONSENT_TEXT_VERSION_LICENCE_OCR` must change with it.
