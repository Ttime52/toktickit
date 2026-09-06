# Lab 2 Zen Green UI Specification

**Product:** TokTickIT Requester Ticketing MVP  
**Version:** 1.0  
**Status:** Implemented visual and interaction contract; visual inspection passed 2026-09-06<br>
**Date:** 2026-09-02

This specification defines the reusable presentation language for Development
Requester Selection, Create Ticket, My Tickets, and Requester Ticket Detail.
The UI must remain recognizably consistent across all screens and viewport
sizes. Functional behavior and traceability are defined in
[specification.md](specification.md); network shapes are defined in
[api-spec.md](api-spec.md).

## 1. Zen Green design tokens

Use CSS custom properties or an equivalent theme object so every screen uses
the same values. Do not introduce a one-off green for an individual component.

### Color tokens

| Token | Value | Intended use |
|---|---|---|
| `--zen-primary` | `#006B3C` | App header, primary actions, strong emphasis, selected controls. |
| `--zen-secondary` | `#0B7A46` | Active navigation, links, focus accents, hover states, success emphasis. |
| `--zen-pale` | `#EAF6EF` | Selected rows/cards, success background, subtle section emphasis. |
| `--zen-page` | `#F5F7F6` | Quiet near-white page background. |
| `--zen-surface` | `#FFFFFF` | Cards, panels, input backgrounds, table surface. |
| `--zen-border` | `#C7D3CD` | Neutral field/card borders and dividers. |
| `--zen-text` | `#17352A` | Primary text; use dark charcoal-green, not pure black. |
| `--zen-muted` | `#5C6F65` | Helper text, timestamps, secondary metadata. |
| `--zen-readonly` | `#EEF3F0` | Read-only Ticket Number, Ticket Date, Requester, and detail fields. |
| `--zen-error` | `#A12A2A` | Error text, invalid border, validation icon. |
| `--zen-error-bg` | `#FFF1F1` | Error panel/background. |
| `--zen-warning` | `#9A6700` | Warning callout/badge only; never ordinary decoration. |
| `--zen-warning-bg` | `#FFF8E1` | Warning callout background. |
| `--zen-success` | `#0B7A46` | Success text, confirmation border, success icon. |
| `--zen-danger` | `#B42318` | Destructive Remove action and its hover state. |
| `--zen-disabled-bg` | `#DDE5E0` | Disabled controls. |
| `--zen-disabled-text` | `#7B8981` | Disabled control text. |
| `--zen-focus` | `#0B7A46` | Visible 3 px focus outline with at least 2 px offset. |

Color is never the only signal: status and priority badges include readable
text, and errors use text plus an icon/border/message.

### Typography and spacing

- Primary font: `Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`.
- Ticket Numbers may use `ui-monospace, "Roboto Mono", Consolas, monospace`.
- Body text is 16 px with line-height 1.5; helper/meta text is 14 px with
  line-height 1.4; labels are 14 px, 600 weight.
- Page title is 28 px/1.2 on desktop and 24 px/1.25 on mobile. Section titles
  are 20 px/1.3. Do not rely on font weight alone to convey an error.
- Base spacing is 4 px. Common values are 8, 12, 16, 24, and 32 px.
- Inputs and buttons are at least 44 px high. Textareas start at 144 px high.
- Cards use 10 px radius, 1 px border, and a restrained shadow such as
  `0 2px 8px rgba(23, 53, 42, 0.08)`.
- Content is centered with a maximum width of 1,200 px. On mobile, page
  gutters are 16 px; on desktop, gutters are 24 px.

## 2. Application shell and navigation

### Desktop shell

1. A 64 px header uses `--zen-primary` and contains the TokTickIT identity on
   the left.
2. Primary navigation contains visible-text links for **My Tickets** and
   **Create Ticket**. The current page has `aria-current="page"` and a clear
   `--zen-secondary` underline or pale-green active treatment.
3. The right side shows `Development Requester: <display name>` and a visible
   **Change Requester** action.
4. Main content is a centered surface region on `--zen-page`; focus order is
   brand, navigation, requester context, then page content.

### Mobile shell

- Navigation links collapse into a button with visible focus, accessible name
  **Open navigation**, and an expanded/collapsed state.
- The selected Requester and Change Requester action remain reachable without
  horizontal scrolling.
- The menu closes after navigation and returns focus to the menu button.

## 3. Screen specifications

### Screen modes and scope

- **Create mode:** Create Ticket collects requester context, references, ticket
  fields, and then uploads Attachments only after the Ticket exists.
- **View mode:** Requester Ticket Detail shows the selected owner's Ticket and
  state-appropriate Attachment actions; Ticket fields remain read-only.
- **Edit mode:** explicitly out of scope for Lab 2. There is no editable Ticket
  detail form and no update/PATCH interaction; Change Requester changes context
  only and does not modify stored Tickets.

### 3.1 Development Requester Selection

Use a centered card, maximum width 560 px, with:

- TokTickIT title and a short explanation: “Select a Development Requester to
  test requester-specific ticket behavior. This is not a login screen.”
- A label **Development Requester** above a native/selectable dropdown.
- Only active Requesters returned by the API; display name and email in the
  option where the control supports it.
- A primary **Continue** button; it is disabled until a valid option is chosen.
- A small helper note that authentication and role-based access arrive in Lab 3.

States:

| State | Required treatment |
|---|---|
| Initial | Dropdown and Continue are usable; no misleading logged-in wording. |
| Loading | Skeleton/spinner plus “Loading Development Requesters…”; control is disabled but readable. |
| Empty | Informative panel: “No active Development Requesters are available.” Provide Retry if appropriate. |
| API failure | `role="alert"`, safe message, Retry action, no exception detail. |
| Invalid selection | Inline message below the dropdown; Continue remains disabled until corrected. |

### 3.2 Create Ticket (create mode)

Desktop structure, in order:

1. Page heading **Create Ticket** and a short instruction.
2. A read-only context row containing Ticket Number, Ticket Date, and
   Requester. Before submit, Ticket Number and Ticket Date show **Generated on
   submit**; Requester shows the selected display name.
3. A classification row containing Category, Related System, and Requested
   Priority. Labels appear above controls; required fields have a red `*` and
   `aria-required="true"`.
4. Full-width Summary input with character guidance `5–120 characters`.
5. Full-width Description textarea with character guidance `20–2,000
   characters`; it is tall enough to write comfortably and may resize only
   vertically.
6. Attachment panel with permitted types and “5 MiB per file, 5 active files
   maximum” guidance. Selected file rows show filename, size, type, and state.
7. Bottom action row: primary **Create Ticket**, secondary **Cancel** or
   **Back**, and no ambiguous icon-only submission control.

The success panel replaces or follows the form and prominently shows **Ticket
created** and the official Ticket Number from the API, with visible next actions
**View Ticket** and **My Tickets**.

If Category or Related System reference data is empty, Create Ticket shows a
clear “Reference data unavailable” message, disables Submit, and provides Retry
where a retry is meaningful. It must not render an empty unlabeled select as if
it were a valid choice.

### 3.3 My Tickets

Desktop layout:

- Heading **My Tickets**, current Requester context, and a primary **Create
  Ticket** action.
- A toolbar with a labeled search input, Category, Related System, Requested
  Priority, and Current Status filters, a Sort By control, direction control,
  and **Clear Filters**.
- A desktop table with columns: Ticket Number, Summary, Category, Related
  System, Requested Priority, Current Status, Last Updated, and an accessible
  **Open** action. Column labels must not be clipped.
- Pagination below the table with current page, total results, Previous/Next,
  and a page-size selector (10, 20, 50).

Mobile layout:

- Toolbar controls stack; filters may be inside a labeled **Filters** disclosure
  that is keyboard accessible.
- Each Ticket is a card, not a squeezed table. The card shows Ticket Number,
  Summary, Category/System, Requested Priority, Current Status, Last Updated,
  and a full-width Open action.
- Pagination controls wrap or stack and each touch target is at least 44 px.

List states:

| State | Required treatment |
|---|---|
| Loading | Preserve the toolbar; show table-row/card skeletons and disable only controls that cannot safely change during the request. |
| First-use empty | Explain that this Requester has no Tickets and show Create Ticket. |
| No results | Say that no Tickets match the current search/filters and show Clear Filters. |
| Failure | Safe alert with Retry; keep the current search/filter values. |
| Populated | Show deterministic API order and readable badges. |

### 3.4 Requester Ticket Detail (view mode)

- Provide a Back/My Tickets action and a header with Ticket Number and Current
  Status badge.
- Display Ticket Date, Requester, Category, Related System, Requested Priority,
  IT Priority (if returned; read-only/reserved), Summary, and Description in a
  two-column read-only grid on desktop.
- On mobile, stack the read-only fields in a single column. Long descriptions
  wrap naturally.
- Place Attachments in a visually separate section. The section contains Add
  Attachment, active file actions, and retained removed metadata.
- Do not render Public Comments, Internal Notes, Actions Taken, status-change,
  IT Staff, or edit-ticket controls.

Detail states:

- Loading skeleton with stable heading region.
- Owned detail with all fields read-only.
- `404` missing Ticket message with Back action.
- `403` ownership error that does not reveal the other Requester's data.
- Attachment upload progress, success, invalid, unavailable, removed, and
  failure states per Section 5.

## 4. Reusable component states and interaction rules

### Form controls

Every label appears above its control with consistent 8 px label-to-control
spacing and 16 px field-to-field spacing.

| State | Visual and behavior |
|---|---|
| Default | White background, `--zen-border`, readable text, 44 px minimum height. |
| Hover | Border or subtle shadow shifts to `--zen-secondary`; no layout shift. |
| Focus | 3 px `--zen-focus` outline, visible against both page and surface. |
| Read-only | `--zen-readonly` background, not editable, still readable and selectable. |
| Invalid | `--zen-error` border and icon; message immediately below the field with `role="alert"` or equivalent. |
| Disabled | `--zen-disabled-bg` and `--zen-disabled-text`; cannot be activated and has `aria-disabled` where relevant. |
| Loading | Control text/spinner communicates the operation; no unexplained blank region. |

The required asterisk is red and announced through the label/`aria-required`;
it never replaces the validation text. Error messages are field-specific and
remain near the field, not only in a page-level banner.

### Button hierarchy

| Button style | Use | Treatment |
|---|---|---|
| Primary | Create, Continue, Retry when the main recovery action | `--zen-primary` fill, white text, hover `--zen-secondary`. |
| Secondary | Back, Cancel, View Ticket alternative | White or transparent surface with `--zen-primary` border/text. |
| Tertiary | Clear Filters, less prominent navigation | Text button with visible hover/focus treatment. |
| Destructive | Remove Attachment after confirmation | `--zen-danger`, explicit text **Remove**, never color-only. |
| Disabled | Invalid form or unavailable action | Disabled tokens; not clickable. |
| Busy | In-flight submit/upload | Spinner plus text such as **Creating…** or **Uploading…**; disabled until settled. |

Icon-only buttons are allowed only for compact navigation or file actions when
they have an accessible name, tooltip, and visible focus indicator. Important
actions always retain visible text.

### Badges

Badges use the same shape, padding, font weight, and border radius everywhere:
8 px horizontal padding, 4 px vertical padding, 999 px radius, 12–14 px text,
and a readable label.

| Badge | Visual meaning |
|---|---|
| Requested Priority | LOW: muted green; MEDIUM: secondary green; HIGH: amber; URGENT: red. Always show the word. |
| Current Status | NEW: pale green background, dark green text, and a visible “New” label. Future statuses must define text and icon before use. |
| IT Priority | Use the same priority mapping when supplied by a later lab; Lab 2 shows it only as read-only/reserved and never adds an edit control. |
| Warning / unavailable | Amber or muted gray treatment with a text label such as “Unavailable”; do not use warning color as decoration. |

## 5. Attachment UI states

Each file row/card includes safe display filename, human-readable size, type,
and state. The UI never displays or constructs a storage key.

| State | UI behavior |
|---|---|
| Selected / active | Show metadata, Preview (if image/PDF), Download, and Remove actions. |
| Uploading | Show progress/spinner and **Uploading…**; disable duplicate action for that file. |
| Invalid type | Show inline error immediately: allowed formats; do not call upload API. |
| Too large | Show inline error with 5 MiB limit; do not call upload API. |
| Limit reached | Explain five active-file limit; allow removal of an active file or retry after a soft-removed file. |
| Upload failure | Keep filename in an error row, show safe reason, and provide Retry/Remove. Other files and the Ticket remain usable. |
| Removed | Retain filename/type/size/uploaded time, show removed time and reason, label **Removed**, hide/disable Preview, Download, and Remove. |
| Unavailable | Retain metadata, label **Unavailable**, hide/disable Preview and Download, explain that bytes are unavailable. |

Removing an active file opens a confirmation dialog with the filename and a
required reason input (3–200 characters). The dialog has Cancel and destructive
Remove buttons, traps focus while open, returns focus to the file row after
close, and never claims hard deletion.

## 6. Screen-state and accessibility checklist (reviewed 2026-09-06)

For every screen, verify:

- [x] Initial content has a meaningful heading and no blank unexplained panel.
- [x] Loading state communicates what is loading and prevents unsafe duplicate
      actions.
- [x] Validation shows field-level text, required marker, and `aria-describedby`.
- [x] Submitting state shows busy text and disables the triggering action.
- [x] Success state names the created resource and provides the next action.
- [x] Failure state is safe, actionable, and preserves relevant user input.
- [x] Empty and no-results states are distinct where the list is filtered.
- [x] Keyboard focus is visible and follows the visual order; the removal dialog
      traps focus inside the dialog and focus is never hidden.
- [x] Buttons and selects have visible text or an accessible name; icon-only
      controls have tooltips.
- [x] Status, priority, errors, and removed files are understandable without
      color perception.
- [x] Text zoom and long names do not hide required controls.

The checked items above are supported by the recorded UI/component tests, the
state-evidence E2E suite, and the implementation review. The removal dialog
explicitly asserts its focus cycle and the attachment row focus return.

## 7. Responsive rules

| Viewport | Layout rule |
|---|---|
| Desktop >= 992 px | Centered max-width 1,200 px; multi-column form/detail layout; desktop My Tickets table; toolbar may be one row and may wrap without clipping. |
| Tablet 768–991 px | Two columns where practical; Summary and Description receive full usable width; toolbar wraps; table may reduce secondary columns only if the information remains available in the row/card. |
| Mobile < 768 px | One-column fields; 16 px gutters; mobile Ticket cards; filters stack or use disclosure; buttons are full-width or touch-friendly; no horizontal page scrolling. |
| All sizes | No clipped labels, overlapping messages, hidden buttons, unreadable filenames, or focus indicators lost against the background. Long text uses wrapping/ellipsis only when the full value remains accessible. |

Specific responsive checks:

- Create Ticket context and classification fields may become one column; Summary
  and Description never become narrower than the content gutter.
- Detail read-only fields stack on mobile and preserve label/value association.
- My Tickets cards keep Ticket Number and Open visible without requiring a
  horizontal swipe.
- Pagination wraps cleanly and does not rely on tiny icon-only controls.
- Attachment filenames use `overflow-wrap:anywhere`; action buttons wrap below
  metadata when necessary.

## 8. Screenshot and visual QA checklist

### Required screenshot paths

Capture readable screenshots at 1440x900 desktop, 1024x768 tablet, and 390x844
mobile. Store them under:

```text
artifacts/lab-02/screenshots/
requester-selection/
    requester-selection-desktop.png
    requester-selection-tablet.png
    requester-selection-mobile.png
├── create-ticket/
│   ├── create-ticket-desktop.png
│   ├── create-ticket-tablet.png
│   └── create-ticket-mobile.png
├── my-tickets/
│   ├── my-tickets-desktop.png
│   ├── my-tickets-tablet.png
│   └── my-tickets-mobile.png
└── ticket-detail/
    ├── ticket-detail-desktop.png
    ├── ticket-detail-tablet.png
    └── ticket-detail-mobile.png
```

State variants are checked by the automated state and overflow assertions. No
additional state PNGs are required; the screenshot evidence remains limited to
the existing screen captures above.

### Visual inspection checklist

- [x] Header, primary actions, links, focus accents, and active navigation use
      the exact Zen Green tokens.
- [x] Page background, cards, borders, shadows, typography, radius, and spacing
      are consistent across all four screens.
- [x] Editable fields are white and read-only fields are visibly distinct but
      readable.
- [x] Required asterisks and field-level error messages appear in the expected
      position and do not shift or overlap neighboring content.
- [x] Primary, secondary, tertiary, destructive, disabled, and busy buttons are
      distinguishable by text and state, not color alone.
- [x] Requested Priority, IT Priority (reserved), and Current Status badge
      shapes/padding/labels are consistent.
- [x] Desktop My Tickets table is readable; mobile representation is a usable
      card or responsive table with all essential information.
- [x] Search, filters, Clear Filters, sorting, pagination, attachment controls,
      and empty/no-results actions remain usable at every viewport.
- [x] Requester Selection visibly covers the active dropdown, selected value,
      Continue/Change Requester path, loading, empty, and failure/retry states.
- [x] Long Summary, Description, Ticket Number, and filenames wrap or remain
      accessible; no clipping or overlap exists.
- [x] There is no unintended horizontal page scroll in the recorded captures,
      including dialogs, long content, and error messages.
- [x] Dialogs and long-content/error states have dedicated overflow evidence.
- [x] Screenshot comparison was made against this document, not personal
      memory.
- [x] Screenshot comparison was made against the approved visual reference in
      this document; no separate illustration artifact is required for this
      repository.
- [x] Screenshot files are readable without extreme zoom and are linked from
      the final delivery evidence.

#### Review record

| Review area | Result | Evidence / finding |
|---|---|---|
| Base screen layout and visual hierarchy | Pass | The 12 desktop/tablet/mobile screenshots below were reviewed against this specification. |
| Header, page, surface, border, text, focus, and disabled colors | Pass | Core values and usage are present in `client/src/styles.css`; the header, primary action, links, navigation, and page/surface colors match the contract. |
| Read-only, warning, success, and destructive color tokens | Pass | `client/src/styles.css` defines and uses the required state tokens; `visual-qa.spec.ts` asserts all exact computed values. |
| Editable/read-only distinction, validation placement, clipping, overlap | Pass | Base screenshots plus the automated state assertions show readable field distinctions and stable, non-overlapping messages. |
| Button hierarchy | Pass | Primary/secondary/tertiary/destructive/disabled/busy labels remain distinct, and the E2E check measures visible Zen buttons/text buttons at the 44 px minimum. |
| Horizontal overflow | Pass | `responsive-layout.spec.ts` checks 1440, 1024, 390, and 320 px; `state-evidence.spec.ts` applies the same check to long content, dialogs, and errors. |
| State evidence | Pass | `state-evidence.spec.ts` checks the required loading, error, validation, dialog, removed, unavailable, and long-content states without adding screenshot files. |

The visual inspection is a final pass for the Lab 2 visual contract. All
checklist items above are checked and tied to the implementation, automated
assertions, or linked screenshot evidence.

#### Screenshot evidence reviewed

| Screen | Desktop | Tablet | Mobile |
|---|---|---|---|
| Requester Selection | [PNG](../../artifacts/lab-02/screenshots/requester-selection/requester-selection-desktop.png) | [PNG](../../artifacts/lab-02/screenshots/requester-selection/requester-selection-tablet.png) | [PNG](../../artifacts/lab-02/screenshots/requester-selection/requester-selection-mobile.png) |
| Create Ticket | [PNG](../../artifacts/lab-02/screenshots/create-ticket/create-ticket-desktop.png) | [PNG](../../artifacts/lab-02/screenshots/create-ticket/create-ticket-tablet.png) | [PNG](../../artifacts/lab-02/screenshots/create-ticket/create-ticket-mobile.png) |
| My Tickets | [PNG](../../artifacts/lab-02/screenshots/my-tickets/my-tickets-desktop.png) | [PNG](../../artifacts/lab-02/screenshots/my-tickets/my-tickets-tablet.png) | [PNG](../../artifacts/lab-02/screenshots/my-tickets/my-tickets-mobile.png) |
| Ticket Detail | [PNG](../../artifacts/lab-02/screenshots/ticket-detail/ticket-detail-desktop.png) | [PNG](../../artifacts/lab-02/screenshots/ticket-detail/ticket-detail-tablet.png) | [PNG](../../artifacts/lab-02/screenshots/ticket-detail/ticket-detail-mobile.png) |

#### State coverage

The required non-default states are verified by the automated assertions in
[`state-evidence.spec.ts`](../../e2e/lab-02/state-evidence.spec.ts). These
checks cover requester loading/selection/failure, Create Ticket validation and
busy/success states, My Tickets loading/empty/no-results/failure, and Ticket
Detail long content, remove dialog, removed, and unavailable attachments. The
suite checks overflow at each state but does not generate additional PNGs.

## 9. UI traceability

| UI area | Acceptance criteria | Planned tests |
|---|---|---|
| Selection and requester shell | AC-01, AC-02, AC-04, AC-23 | UI-01, UI-02, UI-16, E2E-01 |
| Reference data and Create Ticket form | AC-03, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-23 | UI-03 through UI-09, UI-16, E2E-01, E2E-05 |
| My Tickets list and states | AC-11, AC-12, AC-13, AC-14, AC-23, AC-24 | UI-11, UI-12, UI-16, RESP-01 through RESP-04, E2E-03 |
| Ticket Detail read-only view | AC-15, AC-22, AC-23, AC-24 | UI-13, UI-15, UI-16, RESP-01 through RESP-04, E2E-02 |
| Attachment lifecycle | AC-10, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-22, AC-23, AC-24 | UI-10, UI-14, UI-15, UI-16, RESP-03, RESP-04, E2E-04, E2E-05 |
| Zen Green visuals and responsive evidence | AC-23, AC-24, AC-25 | UI-16, RESP-01 through RESP-04, VIS-01 through VIS-04, E2E-06 |
