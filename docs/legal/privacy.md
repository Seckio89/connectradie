# Privacy policy — verification additions (review copy)

> **The published policy is the React page at `/privacy`** (`src/pages/Privacy.tsx`),
> per decision D2 (one source of truth). This file exists so the new wording can
> be read and reviewed as plain text before launch. It reproduces only the
> sections added or changed for ABN and trade-licence verification. If the two
> ever disagree, the page wins; fix this file.

Version bump: 1.4 → **1.5**, "Last updated: September 2026".

---

## 2.2 Verification & professional credentials (Tradies only) — amended bullet

- **Australian Business Number (ABN):** you enter your ABN and business name;
  we send the ABN to the Australian Business Register (ABR) lookup service run
  by the Australian Taxation Office and receive back the ABN's status, the
  registered entity and business names, entity type, GST registration and the
  state and postcode on the register. We keep that response and whether the
  name you entered matched it. All of this is public register information. A
  "GST registered" badge may appear on your public profile because GST status
  is public on the ABR.

## 2.8 Trade licence photo and automated reading (new)

If your trade requires a state licence, you can photograph your licence card so
we can pre-fill the licence number, the name on the licence, the licence class
and the expiry date.

- **What is collected:** the photo you take or choose, and the four fields read
  from it (which you can correct before submitting).
- **Purpose:** to confirm you hold a current licence for the trade you offer,
  and to show a "Licence verified" badge to clients. Nothing else.
- **Third-party processing:** the photo is transmitted to **Hugging Face, Inc.**
  (hosted inference API, United States), which runs an image-to-text model on
  it and returns the printed text. Hugging Face receives the image only — no
  name, email, account ID or other identifier — and we do not permit it to use
  the image to train models under the terms of its inference API.
- **Consent:** this only happens after you tap **Agree and continue** on a
  dedicated screen. Choosing **Type the details myself instead** sends nothing
  to any third party. We record each consent decision (purpose, the version of
  the wording you saw, time, a one-way hash of your IP address and your browser
  or app identifier).
- **Human check:** a ConnecTradie administrator compares the details with the
  relevant state licensing register (for example NSW Fair Trading, QBCC, the
  Victorian Building Authority). We do not scrape or automate those registers;
  the administrator opens the public register page.
- **Retention of the photo:** deleted from our storage the moment the
  administrator records a decision — usually within a few days — and in every
  case within **30 days** of upload by a scheduled job. We do not keep copies.
- **What we retain afterwards:** the outcome (verified / not verified /
  expired), the licence number, class, holder name and expiry date you
  confirmed, the state, the register consulted, the three automated checks
  (expiry, name match, class match) and who decided and when. Your public
  profile shows only the state and the expiry month, never the licence number.

## 4.2 Service providers & sub-processors — new row

| Provider | Purpose | Data location |
|---|---|---|
| Hugging Face, Inc. | Reading text from trade licence photos (optional, consent-gated) | United States |

## 7 Retention — new line

- **Trade licence photos:** deleted on administrator decision or 30 days after
  upload, whichever is first. Verification outcomes are retained for the life
  of the account plus 7 years for compliance records.

## 6 Your rights — how to request deletion of verification data

Email **admin@connectradie.com** from your account email with the subject
"Delete my verification data". Photos are already deleted on decision; on
request we will also delete the extracted licence fields and the ABR response,
which removes the badges from your profile. Consent records and the fact that
a verification occurred are retained as a compliance log.
